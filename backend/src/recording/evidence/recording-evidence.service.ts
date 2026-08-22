/**
 * Recording Evidence Service
 * 
 * Orchestrates evidence acquisition from recorder adapters.
 * Normalizes evidence, calculates freshness/confidence, and persists snapshots.
 * 
 * CRITICAL: This service acquires evidence only. It never evaluates compliance.
 * Compliance evaluation is done by RecordingComplianceEvaluator.
 */

import type { Pool } from 'pg';
import { createHash } from 'crypto';
import { logger } from '../../utils/logger.js';
import type {
  RecordingEvidence,
  EvidenceReason,
  VerificationStatus,
  EvidenceFreshness,
  FreshnessState,
  StorageEvidence,
  ArchiveCoverageEvidence,
  VerificationChecks,
  RecordingState,
  EvidenceMethod
} from './recording-evidence.types.js';
import type {
  RecorderEvidenceAdapter,
  RecorderDevice,
  RecorderChannel,
  RecordingStateEvidence,
  ArchiveRangeEvidence,
  RecorderHealthEvidence,
  ChannelEvidence,
  EVIDENCE_CONFIDENCE
} from './recorder-adapter-evidence.interface.js';
import type { RecordingEvidenceRepository } from '../persistence/recording-evidence.repository.js';

/**
 * Evidence acquisition configuration
 */
export interface EvidenceAcquisitionConfig {
  /** Timeout for adapter operations in milliseconds */
  timeoutMs: number;
  
  /** Maximum retries for retryable failures */
  maxRetries: number;
  
  /** Default evidence TTL in seconds */
  defaultTTLSeconds: number;
  
  /** Evidence TTL by check type */
  ttlByType: {
    recordingState: number;
    archiveRange: number;
    storage: number;
    coverage: number;
  };
  
  /** Whether to compute coverage details */
  computeCoverage: boolean;
  
  /** Coverage analysis period in days */
  coveragePeriodDays: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: EvidenceAcquisitionConfig = {
  timeoutMs: 30000,
  maxRetries: 2,
  defaultTTLSeconds: 300, // 5 minutes
  ttlByType: {
    recordingState: 120, // 2 minutes
    archiveRange: 3600, // 1 hour
    storage: 900, // 15 minutes
    coverage: 21600 // 6 hours
  },
  computeCoverage: false,
  coveragePeriodDays: 1
};

/**
 * Recording Evidence Service
 */
export class RecordingEvidenceService {
  private config: EvidenceAcquisitionConfig;
  
  constructor(
    private readonly pool: Pool,
    private readonly repository: RecordingEvidenceRepository,
    config?: Partial<EvidenceAcquisitionConfig>
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }
  
  /**
   * Acquire comprehensive recording evidence for a camera
   * 
   * This is the main entry point for evidence acquisition.
   * Orchestrates adapter calls and normalizes results.
   */
  async acquire(
    adapter: RecorderEvidenceAdapter,
    device: RecorderDevice,
    channel: RecorderChannel
  ): Promise<RecordingEvidence> {
    const startTime = Date.now();
    
    logger.info('Acquiring recording evidence', {
      recorderId: device.id,
      channelId: channel.id,
      adapterType: adapter.type
    });
    
    try {
      // Step 1: Check recorder health
      const health = await this.acquireHealth(adapter, device);
      
      // If recorder unreachable, return UNKNOWN evidence immediately
      if (health.reachable === false) {
        return this.createUnknownEvidence({
          tenantId: device.tenantId,
          recorderId: device.id,
          channelId: channel.id,
          reason: health.reason || 'RECORDER_UNREACHABLE',
          source: adapter.type,
          method: 'VENDOR_API'
        });
      }
      
      // If authentication failed, return UNKNOWN evidence
      if (health.authenticated === false) {
        return this.createUnknownEvidence({
          tenantId: device.tenantId,
          recorderId: device.id,
          channelId: channel.id,
          reason: health.reason || 'AUTHENTICATION_FAILED',
          source: adapter.type,
          method: 'VENDOR_API'
        });
      }
      
      // Step 2: Check channel exists
      const channelEvidence = await this.acquireChannelEvidence(
        adapter,
        device,
        channel
      );
      
      if (channelEvidence.exists === false) {
        return this.createUnknownEvidence({
          tenantId: device.tenantId,
          recorderId: device.id,
          channelId: channel.id,
          reason: 'CHANNEL_NOT_FOUND',
          source: adapter.type,
          method: 'VENDOR_API'
        });
      }
      
      // Step 3: Acquire all evidence in parallel
      const [
        recordingState,
        archiveRange,
        storage,
        coverage,
        clockSkew
      ] = await Promise.allSettled([
        this.acquireRecordingState(adapter, device, channel),
        this.acquireArchiveRange(adapter, device, channel),
        this.acquireStorage(adapter, device),
        this.config.computeCoverage
          ? this.acquireCoverage(adapter, device, channel)
          : Promise.resolve(null),
        adapter.getClockSkew
          ? adapter.getClockSkew(device)
          : Promise.resolve(null)
      ]);
      
      // Step 4: Normalize evidence
      const evidence = this.normalizeEvidence({
        tenantId: device.tenantId,
        recorderId: device.id,
        channelId: channel.id,
        health,
        channelEvidence,
        recordingState: recordingState.status === 'fulfilled' ? recordingState.value : null,
        archiveRange: archiveRange.status === 'fulfilled' ? archiveRange.value : null,
        storage: storage.status === 'fulfilled' ? storage.value : null,
        coverage: coverage.status === 'fulfilled' ? coverage.value : null,
        clockSkew: clockSkew.status === 'fulfilled' ? clockSkew.value : null,
        adapter
      });
      
      // Step 5: Calculate evidence quality
      const quality = this.calculateEvidenceQuality(evidence);
      evidence.verification.confidence = quality.confidence;
      
      // Step 6: Set expiration
      evidence.verification.expiresAt = this.calculateExpiration(evidence);
      
      // Step 7: Calculate payload hash for audit trail
      evidence.rawPayloadHash = this.calculatePayloadHash(evidence);
      
      // Step 8: Persist evidence snapshot
      const saved = await this.repository.save(evidence);
      
      const duration = Date.now() - startTime;
      logger.info('Evidence acquisition complete', {
        recorderId: device.id,
        channelId: channel.id,
        status: evidence.verification.status,
        confidence: evidence.verification.confidence,
        durationMs: duration
      });
      
      return saved;
      
    } catch (error) {
      logger.error('Evidence acquisition failed', {
        error,
        recorderId: device.id,
        channelId: channel.id
      });
      
      // Return UNKNOWN evidence on catastrophic failure
      return this.createUnknownEvidence({
        tenantId: device.tenantId,
        recorderId: device.id,
        channelId: channel.id,
        reason: 'INTERNAL_ERROR',
        source: adapter.type,
        method: 'UNKNOWN',
        details: { error: String(error) }
      });
    }
  }
  
  /**
   * Get latest evidence from repository
   */
  async getLatest(
    tenantId: string,
    cameraId: string
  ): Promise<RecordingEvidence | null> {
    return this.repository.getLatest(tenantId, cameraId);
  }
  
  /**
   * Get latest fresh evidence or acquire new if stale
   */
  async getOrAcquire(
    adapter: RecorderEvidenceAdapter,
    device: RecorderDevice,
    channel: RecorderChannel,
    maxAgeSeconds?: number
  ): Promise<RecordingEvidence> {
    const existing = await this.repository.getLatest(
      device.tenantId,
      channel.id
    );
    
    if (existing) {
      const freshness = this.evaluateFreshness(
        existing.verification.verifiedAt,
        new Date(),
        maxAgeSeconds || this.config.defaultTTLSeconds * 1000
      );
      
      if (freshness.state === 'FRESH') {
        logger.debug('Using cached evidence', {
          channelId: channel.id,
          ageSeconds: freshness.ageSeconds
        });
        return existing;
      }
    }
    
    logger.debug('Acquiring fresh evidence', {
      channelId: channel.id,
      reason: existing ? 'stale' : 'not-cached'
    });
    
    return this.acquire(adapter, device, channel);
  }
  
  /**
   * Evaluate evidence freshness
   */
  evaluateFreshness(
    verifiedAt: Date | null,
    now: Date,
    maxAgeMs: number
  ): EvidenceFreshness {
    if (!verifiedAt) {
      return {
        ageSeconds: Infinity,
        maxAgeSeconds: maxAgeMs / 1000,
        state: 'UNKNOWN',
        verifiedAt: null,
        expiresAt: now
      };
    }
    
    const ageMs = now.getTime() - verifiedAt.getTime();
    const ageSeconds = ageMs / 1000;
    const maxAgeSeconds = maxAgeMs / 1000;
    
    let state: FreshnessState;
    if (ageMs <= maxAgeMs) {
      state = 'FRESH';
    } else if (ageMs <= maxAgeMs * 2) {
      state = 'AGING';
    } else {
      state = 'STALE';
    }
    
    return {
      ageSeconds,
      maxAgeSeconds,
      state,
      verifiedAt,
      expiresAt: new Date(verifiedAt.getTime() + maxAgeMs)
    };
  }
  
  /**
   * Acquire health evidence
   */
  private async acquireHealth(
    adapter: RecorderEvidenceAdapter,
    device: RecorderDevice
  ): Promise<RecorderHealthEvidence> {
    try {
      return await adapter.getHealth(device);
    } catch (error) {
      logger.warn('Health check failed', {
        error,
        recorderId: device.id
      });
      
      return {
        reachable: null,
        authenticated: null,
        verifiedAt: new Date(),
        reason: this.classifyError(error)
      };
    }
  }
  
  /**
   * Acquire channel evidence
   */
  private async acquireChannelEvidence(
    adapter: RecorderEvidenceAdapter,
    device: RecorderDevice,
    channel: RecorderChannel
  ): Promise<ChannelEvidence> {
    try {
      return await adapter.getChannelEvidence(device, channel);
    } catch (error) {
      logger.warn('Channel check failed', {
        error,
        recorderId: device.id,
        channelId: channel.id
      });
      
      return {
        exists: null,
        verifiedAt: new Date(),
        reason: this.classifyError(error)
      };
    }
  }
  
  /**
   * Acquire recording state evidence
   */
  private async acquireRecordingState(
    adapter: RecorderEvidenceAdapter,
    device: RecorderDevice,
    channel: RecorderChannel
  ): Promise<RecordingStateEvidence | null> {
    try {
      return await adapter.getChannelRecordingState(device, channel);
    } catch (error) {
      logger.warn('Recording state check failed', {
        error,
        recorderId: device.id,
        channelId: channel.id
      });
      
      return {
        isRecording: null,
        verifiedAt: new Date(),
        method: 'UNKNOWN',
        confidence: 0,
        reason: this.classifyError(error)
      };
    }
  }
  
  /**
   * Acquire archive range evidence
   */
  private async acquireArchiveRange(
    adapter: RecorderEvidenceAdapter,
    device: RecorderDevice,
    channel: RecorderChannel
  ): Promise<ArchiveRangeEvidence | null> {
    try {
      return await adapter.getArchiveRange(device, channel);
    } catch (error) {
      logger.warn('Archive range check failed', {
        error,
        recorderId: device.id,
        channelId: channel.id
      });
      
      return {
        oldestRecordingAt: null,
        latestRecordingAt: null,
        retentionDays: null,
        verifiedAt: new Date(),
        method: 'UNKNOWN',
        confidence: 0,
        reason: this.classifyError(error)
      };
    }
  }
  
  /**
   * Acquire storage evidence
   */
  private async acquireStorage(
    adapter: RecorderEvidenceAdapter,
    device: RecorderDevice
  ): Promise<any> {
    try {
      return await adapter.getStorageEvidence(device);
    } catch (error) {
      logger.warn('Storage check failed', {
        error,
        recorderId: device.id
      });
      
      return {
        storage: {
          status: 'UNKNOWN',
          totalBytes: null,
          usedBytes: null,
          freeBytes: null
        },
        verifiedAt: new Date(),
        method: 'UNKNOWN',
        confidence: 0,
        reason: this.classifyError(error)
      };
    }
  }
  
  /**
   * Acquire coverage evidence
   */
  private async acquireCoverage(
    adapter: RecorderEvidenceAdapter,
    device: RecorderDevice,
    channel: RecorderChannel
  ): Promise<ArchiveCoverageEvidence | null> {
    if (!adapter.getArchiveCoverage) {
      return null;
    }
    
    try {
      const to = new Date();
      const from = new Date(to.getTime() - this.config.coveragePeriodDays * 86400000);
      
      return await adapter.getArchiveCoverage(device, channel, from, to);
    } catch (error) {
      logger.warn('Coverage check failed', {
        error,
        recorderId: device.id,
        channelId: channel.id
      });
      
      return null;
    }
  }
  
  /**
   * Normalize evidence from adapter responses
   */
  private normalizeEvidence(params: {
    tenantId: string;
    recorderId: string;
    channelId: string;
    health: RecorderHealthEvidence;
    channelEvidence: ChannelEvidence;
    recordingState: RecordingStateEvidence | null;
    archiveRange: ArchiveRangeEvidence | null;
    storage: any;
    coverage: ArchiveCoverageEvidence | null;
    clockSkew: any;
    adapter: RecorderEvidenceAdapter;
  }): RecordingEvidence {
    const now = new Date();
    
    // Determine overall verification status
    const verificationStatus = this.determineVerificationStatus(params);
    
    // Map recording state
    const recordingState: RecordingState = 
      params.recordingState?.isRecording === true ? 'RECORDING' :
      params.recordingState?.isRecording === false ? 'NOT_RECORDING' :
      'UNKNOWN';
    
    // Build verification checks
    const checks: VerificationChecks = {
      connectivity: {
        status: params.health.reachable === true ? 'VERIFIED' :
                params.health.reachable === false ? 'FAILED' : 'UNKNOWN',
        latencyMs: params.health.latencyMs,
        message: params.health.reason
      },
      authentication: {
        status: params.health.authenticated === true ? 'VERIFIED' :
                params.health.authenticated === false ? 'FAILED' : 'UNKNOWN',
        method: params.health.authMethod,
        message: params.health.reason
      },
      channelConfiguration: {
        status: params.channelEvidence.exists === true ? 'VERIFIED' :
                params.channelEvidence.exists === false ? 'FAILED' : 'UNKNOWN',
        channelExists: params.channelEvidence.exists ?? false,
        channelEnabled: params.channelEvidence.enabled,
        message: params.channelEvidence.reason
      },
      liveStream: {
        status: 'UNKNOWN', // Would need RTSP check
        message: 'Not checked'
      },
      recordingState: {
        status: params.recordingState?.isRecording !== null ? 'VERIFIED' : 'UNKNOWN',
        isRecording: params.recordingState?.isRecording ?? undefined,
        mode: params.recordingState?.mode,
        message: params.recordingState?.reason
      },
      archiveAvailability: {
        status: params.archiveRange?.latestRecordingAt ? 'VERIFIED' : 
                params.archiveRange?.reason ? 'FAILED' : 'UNKNOWN',
        accessible: !!params.archiveRange?.latestRecordingAt,
        message: params.archiveRange?.reason
      },
      retentionCoverage: {
        status: params.coverage ? 'VERIFIED' : 'UNKNOWN',
        hasCoverage: !!params.coverage,
        message: params.coverage ? undefined : 'Coverage not computed'
      },
      storageHealth: {
        status: params.storage?.storage?.status === 'HEALTHY' ? 'VERIFIED' :
                params.storage?.storage?.status === 'DEGRADED' ? 'FAILED' :
                params.storage?.storage?.status === 'FULL' ? 'FAILED' : 'UNKNOWN',
        operational: params.storage?.storage?.status === 'HEALTHY',
        message: params.storage?.reason
      },
      clockSynchronization: {
        status: params.clockSkew?.clockSkew ? 'VERIFIED' : 'UNKNOWN',
        driftSeconds: params.clockSkew?.clockSkew?.driftSeconds,
        excessive: params.clockSkew?.clockSkew?.excessive,
        message: params.clockSkew?.reason
      }
    };
    
    // Calculate retention days
    const retentionDays = params.archiveRange?.oldestRecordingAt
      ? (now.getTime() - params.archiveRange.oldestRecordingAt.getTime()) / 86400000
      : undefined;
    
    return {
      tenantId: params.tenantId,
      recorderId: params.recorderId,
      channelId: params.channelId,
      recordingState,
      latestRecordingAt: params.archiveRange?.latestRecordingAt || null,
      oldestRecordingAt: params.archiveRange?.oldestRecordingAt || null,
      retentionDays,
      storage: params.storage?.storage || {
        status: 'UNKNOWN',
        totalBytes: null,
        usedBytes: null,
        freeBytes: null
      },
      coverage: params.coverage || undefined,
      checks,
      verification: {
        status: verificationStatus,
        verifiedAt: now,
        source: params.adapter.type,
        method: 'VENDOR_API',
        confidence: 0, // Will be calculated
        latencyMs: params.health.latencyMs
      },
      reason: this.selectPrimaryReason(params),
      createdAt: now
    };
  }
  
  /**
   * Determine overall verification status
   */
  private determineVerificationStatus(params: any): VerificationStatus {
    // If critical checks failed, status is FAILED
    if (params.health.reachable === false || params.health.authenticated === false) {
      return 'FAILED';
    }
    
    if (params.channelEvidence.exists === false) {
      return 'FAILED';
    }
    
    // If we have recording state and archive evidence, status is VERIFIED
    if (params.recordingState?.isRecording !== null && 
        params.archiveRange?.latestRecordingAt) {
      return 'VERIFIED';
    }
    
    // Otherwise UNKNOWN
    return 'UNKNOWN';
  }
  
  /**
   * Select primary reason for evidence state
   */
  private selectPrimaryReason(params: any): EvidenceReason | undefined {
    if (params.health.reason) return params.health.reason;
    if (params.channelEvidence.reason) return params.channelEvidence.reason;
    if (params.recordingState?.reason) return params.recordingState.reason;
    if (params.archiveRange?.reason) return params.archiveRange.reason;
    return undefined;
  }
  
  /**
   * Calculate evidence quality/confidence
   */
  private calculateEvidenceQuality(evidence: RecordingEvidence): { confidence: number } {
    // Start with base confidence from method
    let confidence = 0.5;
    
    // Adjust based on what we successfully verified
    if (evidence.checks.connectivity.status === 'VERIFIED') confidence += 0.1;
    if (evidence.checks.authentication.status === 'VERIFIED') confidence += 0.1;
    if (evidence.checks.recordingState.status === 'VERIFIED') confidence += 0.15;
    if (evidence.checks.archiveAvailability.status === 'VERIFIED') confidence += 0.15;
    
    return { confidence: Math.min(1.0, confidence) };
  }
  
  /**
   * Calculate evidence expiration time
   */
  private calculateExpiration(evidence: RecordingEvidence): Date {
    const ttl = this.config.ttlByType.recordingState * 1000;
    return new Date(Date.now() + ttl);
  }
  
  /**
   * Calculate payload hash for audit trail
   */
  private calculatePayloadHash(evidence: RecordingEvidence): string {
    const payload = JSON.stringify({
      recorderId: evidence.recorderId,
      channelId: evidence.channelId,
      recordingState: evidence.recordingState,
      latestRecordingAt: evidence.latestRecordingAt,
      oldestRecordingAt: evidence.oldestRecordingAt,
      verifiedAt: evidence.verification.verifiedAt
    });
    
    return createHash('sha256').update(payload).digest('hex');
  }
  
  /**
   * Create UNKNOWN evidence snapshot
   */
  private createUnknownEvidence(params: {
    tenantId: string;
    recorderId: string;
    channelId: string;
    reason: EvidenceReason;
    source: string;
    method: EvidenceMethod;
    details?: Record<string, unknown>;
  }): RecordingEvidence {
    const now = new Date();
    
    return {
      tenantId: params.tenantId,
      recorderId: params.recorderId,
      channelId: params.channelId,
      recordingState: 'UNKNOWN',
      latestRecordingAt: null,
      oldestRecordingAt: null,
      storage: {
        status: 'UNKNOWN',
        totalBytes: null,
        usedBytes: null,
        freeBytes: null
      },
      checks: this.createUnknownChecks(),
      verification: {
        status: 'UNKNOWN',
        verifiedAt: now,
        source: params.source,
        method: params.method,
        confidence: 0
      },
      reason: params.reason,
      details: params.details,
      createdAt: now
    };
  }
  
  /**
   * Create UNKNOWN verification checks
   */
  private createUnknownChecks(): VerificationChecks {
    return {
      connectivity: { status: 'UNKNOWN', message: 'Not checked' },
      authentication: { status: 'UNKNOWN', message: 'Not checked' },
      channelConfiguration: { status: 'UNKNOWN', channelExists: false, message: 'Not checked' },
      liveStream: { status: 'UNKNOWN', message: 'Not checked' },
      recordingState: { status: 'UNKNOWN', message: 'Not checked' },
      archiveAvailability: { status: 'UNKNOWN', message: 'Not checked' },
      retentionCoverage: { status: 'UNKNOWN', message: 'Not checked' },
      storageHealth: { status: 'UNKNOWN', message: 'Not checked' },
      clockSynchronization: { status: 'UNKNOWN', message: 'Not checked' }
    };
  }
  
  /**
   * Classify error to evidence reason
   */
  private classifyError(error: unknown): EvidenceReason {
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    
    if (message.includes('timeout')) return 'QUERY_TIMEOUT';
    if (message.includes('connection refused')) return 'CONNECTION_REFUSED';
    if (message.includes('unreachable')) return 'RECORDER_UNREACHABLE';
    if (message.includes('authentication') || message.includes('401') || message.includes('403')) {
      return 'AUTHENTICATION_FAILED';
    }
    if (message.includes('not found') || message.includes('404')) return 'CHANNEL_NOT_FOUND';
    
    return 'INTERNAL_ERROR';
  }
}
