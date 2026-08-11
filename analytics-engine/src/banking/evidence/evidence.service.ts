/**
 * Banking Evidence Service
 * 
 * Manages evidence collection for banking analytics findings:
 * - Video clip extraction around violations
 * - Frame snapshots at key moments
 * - Forensic replay of session timeline
 * - Evidence packaging for investigations
 */

import {
  CashVanSession,
  EvidenceReference,
  CashVanViolation,
} from '../models/cash-van-session.js';

import {
  CashVanSessionRepository,
  getCashVanSessionRepository,
} from '../repositories/cash-van-session.repository.js';

/**
 * Evidence clip request
 */
export interface EvidenceClipRequest {
  cameraId: string;
  startTime: Date;
  endTime: Date;
  beforeSeconds?: number;
  afterSeconds?: number;
}

/**
 * Evidence snapshot request
 */
export interface EvidenceSnapshotRequest {
  cameraId: string;
  timestamp: Date;
  annotations?: Array<{
    type: 'box' | 'point' | 'polygon';
    label: string;
    coordinates: any;
  }>;
}

/**
 * Evidence package for a session
 */
export interface EvidencePackage {
  sessionId: string;
  packageId: string;
  generatedAt: Date;
  
  // Session summary
  summary: {
    tenantId: string;
    branchId: string;
    state: string;
    assessment: string;
    startedAt: Date;
    completedAt?: Date;
  };
  
  // Timeline of key events
  timeline: Array<{
    timestamp: Date;
    eventType: string;
    description: string;
    cameraId?: string;
    evidenceRef?: string;
  }>;
  
  // Video clips
  clips: Array<{
    clipId: string;
    cameraId: string;
    startTime: Date;
    endTime: Date;
    durationSeconds: number;
    violationId?: string;
    url?: string;
  }>;
  
  // Snapshots
  snapshots: Array<{
    snapshotId: string;
    cameraId: string;
    timestamp: Date;
    description: string;
    url?: string;
  }>;
  
  // Violations with evidence
  violations: Array<{
    violationId: string;
    ruleCode: string;
    ruleName: string;
    severity: string;
    description: string;
    timestamp: Date;
    evidence: EvidenceReference[];
  }>;
  
  // Metadata
  cameras: string[];
  totalClips: number;
  totalSnapshots: number;
}

/**
 * Forensic replay frame
 */
export interface ReplayFrame {
  timestamp: Date;
  frameNumber: number;
  
  // State at this moment
  sessionState: string;
  
  // Entities present
  vehicle?: {
    trackId: string;
    plate?: string;
    zone?: string;
  };
  
  personnel: Array<{
    trackId: string;
    identityId?: string;
    name?: string;
    zone?: string;
  }>;
  
  transferObjects: Array<{
    trackId: string;
    type: string;
    zone?: string;
    carriedBy?: string;
  }>;
  
  // Events at this frame
  events: Array<{
    type: string;
    description: string;
  }>;
  
  // Active violations
  violations: string[];
}

/**
 * Banking Evidence Service
 */
export class BankingEvidenceService {
  constructor(
    private sessionRepo: CashVanSessionRepository = getCashVanSessionRepository()
  ) {}

  /**
   * Generate evidence package for a session
   */
  async generateEvidencePackage(sessionId: string): Promise<EvidencePackage> {
    const session = await this.sessionRepo.findById(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const packageId = `pkg_${sessionId}_${Date.now()}`;

    // Build timeline
    const timeline = this.buildTimeline(session);

    // Identify cameras involved
    const cameras = this.identifyCameras(session);

    // Generate clip requests for violations
    const clips = await this.generateViolationClips(session);

    // Generate key snapshots
    const snapshots = await this.generateKeySnapshots(session);

    // Package violations with evidence
    const violations = session.violations
      .filter(v => v.status === 'active')
      .map(v => ({
        violationId: v.id,
        ruleCode: v.ruleCode,
        ruleName: v.ruleName,
        severity: v.severity,
        description: v.description,
        timestamp: v.firstDetectedAt,
        evidence: v.evidence,
      }));

    return {
      sessionId,
      packageId,
      generatedAt: new Date(),
      summary: {
        tenantId: session.tenantId,
        branchId: session.branchId,
        state: session.state,
        assessment: session.assessment,
        startedAt: session.startedAt,
        completedAt: session.transferCompletedAt || session.departedAt,
      },
      timeline,
      clips,
      snapshots,
      violations,
      cameras,
      totalClips: clips.length,
      totalSnapshots: snapshots.length,
    };
  }

  /**
   * Get forensic replay of session
   * Returns frame-by-frame reconstruction
   */
  async getForensicReplay(sessionId: string, fps: number = 1): Promise<ReplayFrame[]> {
    const session = await this.sessionRepo.findById(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const frames: ReplayFrame[] = [];
    
    // Determine time range
    const startTime = session.startedAt;
    const endTime = session.departedAt || session.lastUpdatedAt;
    const durationMs = endTime.getTime() - startTime.getTime();
    const frameIntervalMs = 1000 / fps;
    const frameCount = Math.floor(durationMs / frameIntervalMs);

    // Generate frames
    for (let i = 0; i <= frameCount; i++) {
      const timestamp = new Date(startTime.getTime() + i * frameIntervalMs);
      frames.push(this.reconstructFrame(session, timestamp, i));
    }

    return frames;
  }

  /**
   * Request video clip extraction
   */
  async requestClip(request: EvidenceClipRequest): Promise<string> {
    const clipId = `clip_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Calculate actual start/end with buffer
    const beforeMs = (request.beforeSeconds || 5) * 1000;
    const afterMs = (request.afterSeconds || 5) * 1000;
    const actualStart = new Date(request.startTime.getTime() - beforeMs);
    const actualEnd = new Date(request.endTime.getTime() + afterMs);

    // In production, this would trigger video extraction from storage
    // For now, we return the clip ID for tracking
    console.log('[EvidenceService] Clip requested:', {
      clipId,
      cameraId: request.cameraId,
      start: actualStart,
      end: actualEnd,
    });

    return clipId;
  }

  /**
   * Request frame snapshot
   */
  async requestSnapshot(request: EvidenceSnapshotRequest): Promise<string> {
    const snapshotId = `snap_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // In production, this would extract and annotate the frame
    console.log('[EvidenceService] Snapshot requested:', {
      snapshotId,
      cameraId: request.cameraId,
      timestamp: request.timestamp,
      annotations: request.annotations?.length || 0,
    });

    return snapshotId;
  }

  /**
   * Build timeline of session events
   */
  private buildTimeline(session: CashVanSession): Array<any> {
    const events: Array<any> = [];

    // Session start
    events.push({
      timestamp: session.startedAt,
      eventType: 'session_started',
      description: 'Cash van session started',
    });

    // Vehicle arrival
    if (session.vehicleArrivedAt) {
      events.push({
        timestamp: session.vehicleArrivedAt,
        eventType: 'vehicle_arrived',
        description: `Vehicle ${session.plate || 'unknown'} arrived`,
        cameraId: session.vehicle?.lastZoneId,
      });
    }

    // Personnel observations
    for (const person of session.personnel) {
      events.push({
        timestamp: person.firstSeenAt,
        eventType: 'person_observed',
        description: person.identityId
          ? `${person.firstName} ${person.lastName} observed`
          : 'Person observed',
      });
    }

    // Unloading started
    if (session.unloadingStartedAt) {
      events.push({
        timestamp: session.unloadingStartedAt,
        eventType: 'unloading_started',
        description: 'Cash unloading started',
      });
    }

    // Transfer objects
    for (const obj of session.transferObjects) {
      events.push({
        timestamp: obj.firstSeenAt,
        eventType: 'object_observed',
        description: `Transfer object (${obj.objectType}) observed`,
      });
    }

    // Violations
    for (const violation of session.violations) {
      events.push({
        timestamp: violation.firstDetectedAt,
        eventType: 'violation',
        description: violation.description,
        evidenceRef: violation.id,
      });
    }

    // Transfer complete
    if (session.transferCompletedAt) {
      events.push({
        timestamp: session.transferCompletedAt,
        eventType: 'transfer_complete',
        description: 'Cash transfer completed',
      });
    }

    // Departure
    if (session.departedAt) {
      events.push({
        timestamp: session.departedAt,
        eventType: 'vehicle_departed',
        description: 'Vehicle departed',
      });
    }

    return events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  /**
   * Identify all cameras involved in session
   */
  private identifyCameras(session: CashVanSession): string[] {
    const cameras = new Set<string>();

    // Add from evidence references
    for (const violation of session.violations) {
      for (const evidence of violation.evidence) {
        if (evidence.cameraId) {
          cameras.add(evidence.cameraId);
        }
      }
    }

    return Array.from(cameras);
  }

  /**
   * Generate video clips for violations
   */
  private async generateViolationClips(session: CashVanSession): Promise<Array<any>> {
    const clips: Array<any> = [];

    for (const violation of session.violations.filter(v => v.status === 'active')) {
      // Find evidence with camera and timestamp
      for (const evidence of violation.evidence) {
        if (evidence.cameraId && evidence.timestamp) {
          const clipId = `clip_${violation.id}_${evidence.id}`;
          const beforeSeconds = 10;
          const afterSeconds = 10;

          clips.push({
            clipId,
            cameraId: evidence.cameraId,
            startTime: new Date(evidence.timestamp.getTime() - beforeSeconds * 1000),
            endTime: new Date(evidence.timestamp.getTime() + afterSeconds * 1000),
            durationSeconds: beforeSeconds + afterSeconds,
            violationId: violation.id,
          });
        }
      }
    }

    return clips;
  }

  /**
   * Generate key snapshots
   */
  private async generateKeySnapshots(session: CashVanSession): Promise<Array<any>> {
    const snapshots: Array<any> = [];

    // Vehicle arrival snapshot
    if (session.vehicleArrivedAt && session.vehicle) {
      snapshots.push({
        snapshotId: `snap_arrival_${session.id}`,
        cameraId: session.vehicle.lastZoneId || 'unknown',
        timestamp: session.vehicleArrivedAt,
        description: 'Vehicle arrival',
      });
    }

    // Unloading start snapshot
    if (session.unloadingStartedAt) {
      snapshots.push({
        snapshotId: `snap_unloading_${session.id}`,
        cameraId: 'unloading_camera',
        timestamp: session.unloadingStartedAt,
        description: 'Unloading started',
      });
    }

    return snapshots;
  }

  /**
   * Reconstruct session state at a specific timestamp
   */
  private reconstructFrame(session: CashVanSession, timestamp: Date, frameNumber: number): ReplayFrame {
    const timestampMs = timestamp.getTime();

    // Determine vehicle state
    const vehicle = session.vehicle && 
      session.vehicleArrivedAt &&
      timestampMs >= session.vehicleArrivedAt.getTime()
      ? {
          trackId: session.vehicle.trackId,
          plate: session.vehicle.plate,
          zone: session.vehicle.lastZoneId,
        }
      : undefined;

    // Determine personnel present at this time
    const personnel = session.personnel
      .filter(p =>
        timestampMs >= p.firstSeenAt.getTime() &&
        timestampMs <= p.lastSeenAt.getTime()
      )
      .map(p => ({
        trackId: p.trackId,
        identityId: p.identityId,
        name: p.identityId ? `${p.firstName} ${p.lastName}` : undefined,
        zone: p.currentZoneId,
      }));

    // Determine objects present
    const transferObjects = session.transferObjects
      .filter(o =>
        timestampMs >= o.firstSeenAt.getTime() &&
        timestampMs <= o.lastSeenAt.getTime()
      )
      .map(o => ({
        trackId: o.trackId,
        type: o.objectType,
        zone: o.currentZoneId,
        carriedBy: o.carriedBy,
      }));

    // Find events at this exact time (within 1 second)
    const events: Array<any> = [];
    
    if (session.vehicleArrivedAt && Math.abs(timestampMs - session.vehicleArrivedAt.getTime()) < 1000) {
      events.push({ type: 'vehicle_arrived', description: 'Vehicle arrived' });
    }

    // Active violations at this time
    const violations = session.violations
      .filter(v =>
        timestampMs >= v.firstDetectedAt.getTime() &&
        (!v.resolvedAt || timestampMs <= v.resolvedAt.getTime())
      )
      .map(v => v.ruleCode);

    return {
      timestamp,
      frameNumber,
      sessionState: this.determineStateAtTime(session, timestamp),
      vehicle,
      personnel,
      transferObjects,
      events,
      violations,
    };
  }

  /**
   * Determine session state at a specific time
   */
  private determineStateAtTime(session: CashVanSession, timestamp: Date): string {
    const t = timestamp.getTime();

    if (session.departedAt && t >= session.departedAt.getTime()) {
      return 'departed';
    }
    
    if (session.transferCompletedAt && t >= session.transferCompletedAt.getTime()) {
      return 'transfer_complete';
    }
    
    if (session.unloadingStartedAt && t >= session.unloadingStartedAt.getTime()) {
      return 'unloading';
    }
    
    if (session.vehicleArrivedAt && t >= session.vehicleArrivedAt.getTime()) {
      return 'vehicle_verified';
    }

    return 'expected';
  }
}

/**
 * Singleton instance
 */
let evidenceService: BankingEvidenceService | null = null;

export function getBankingEvidenceService(): BankingEvidenceService {
  if (!evidenceService) {
    evidenceService = new BankingEvidenceService();
  }
  return evidenceService;
}

export function setBankingEvidenceService(service: BankingEvidenceService): void {
  evidenceService = service;
}
