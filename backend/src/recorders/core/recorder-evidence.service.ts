/**
 * Recorder Evidence Service
 * 
 * Orchestrates evidence collection from recorder adapters.
 * 
 * Responsibilities:
 * - Coordinate adapter operations
 * - Manage evidence collection cycles
 * - Apply concurrency limits
 * - Handle timeouts
 * - Aggregate multi-adapter evidence
 * - Cache evidence snapshots
 * 
 * This service acquires FACTS. It does NOT make policy decisions.
 */

import type {
  RecorderEvidence,
  ChannelEvidence,
  RecorderProbe,
  RecordingSearchRequest
} from '../contracts/recorder-evidence.js';
import type { EvidenceValue } from '../contracts/evidence-value.js';
import { observed, unknown, combineEvidence } from '../contracts/evidence-helpers.js';
import { RecorderAdapterFactory } from './recorder-adapter.factory.js';
import { globalRequestLimiter, RequestPriority } from '../transport/request-limiter.js';
import { logger } from '../../utils/logger.js';

/**
 * Evidence collection configuration
 */
export interface EvidenceCollectionConfig {
  /**
   * Recorder ID
   */
  recorderId: string;

  /**
   * Tenant ID
   */
  tenantId: string;

  /**
   * Branch ID (optional)
   */
  branchId?: string;

  /**
   * Recorder URL
   */
  recorderUrl: string;

  /**
   * Adapter type (or 'auto' for detection)
   */
  adapterType: 'onvif' | 'hikvision' | 'dahua' | 'auto';

  /**
   * Credentials
   */
  credentials: {
    username: string;
    password: string;
  };

  /**
   * Collection options
   */
  options?: {
    /**
     * Skip channel details (faster collection)
     */
    skipChannelDetails?: boolean;

    /**
     * Skip storage query
     */
    skipStorage?: boolean;

    /**
     * Skip archive search
     */
    skipArchiveSearch?: boolean;

    /**
     * Priority for request queue
     */
    priority?: RequestPriority;

    /**
     * Collection timeout (ms)
     */
    timeoutMs?: number;
  };
}

/**
 * Evidence collection result
 */
export interface EvidenceCollectionResult {
  /**
   * Complete evidence snapshot
   */
  evidence: RecorderEvidence;

  /**
   * Collection success flag
   */
  success: boolean;

  /**
   * Partial collection (some operations failed)
   */
  partial: boolean;

  /**
   * Collection errors
   */
  errors: Array<{
    operation: string;
    error: string;
  }>;
}

/**
 * Recorder Evidence Service
 */
export class RecorderEvidenceService {
  constructor(
    private readonly adapterFactory: RecorderAdapterFactory
  ) {}

  /**
   * Probe recorder and identify adapter type
   */
  async probeRecorder(
    recorderId: string,
    recorderUrl: string,
    credentials: { username: string; password: string }
  ): Promise<EvidenceValue<RecorderProbe>> {
    logger.info('Probing recorder', { recorderId, recorderUrl });

    // Try ONVIF first (most universal)
    try {
      const adapter = await this.adapterFactory.createAdapter({
        type: 'onvif',
        recorderId,
        recorderUrl,
        credentials
      });

      const probe = await globalRequestLimiter.execute(
        recorderId,
        'probe',
        () => adapter.probe(),
        RequestPriority.HIGH
      );

      adapter.destroy();

      if (probe.state === 'OBSERVED') {
        logger.info('Recorder probed successfully via ONVIF', {
          recorderId,
          manufacturer: probe.value?.manufacturer,
          model: probe.value?.model
        });
      }

      return probe;
    } catch (error) {
      logger.debug('ONVIF probe failed, trying vendor-specific', {
        recorderId,
        error
      });
    }

    // Try Hikvision
    try {
      const adapter = await this.adapterFactory.createAdapter({
        type: 'hikvision',
        recorderId,
        recorderUrl,
        credentials
      });

      const probe = await globalRequestLimiter.execute(
        recorderId,
        'probe',
        () => adapter.probe(),
        RequestPriority.HIGH
      );

      adapter.destroy();

      if (probe.state === 'OBSERVED') {
        logger.info('Recorder probed successfully via Hikvision', {
          recorderId,
          manufacturer: probe.value?.manufacturer,
          model: probe.value?.model
        });
        return probe;
      }
    } catch (error) {
      logger.debug('Hikvision probe failed', { recorderId, error });
    }

    // All probes failed
    return unknown(
      {
        adapter: 'unknown',
        operation: 'probe'
      },
      'Could not identify recorder type - all adapter probes failed'
    );
  }

  /**
   * Collect complete evidence snapshot
   */
  async collectEvidence(
    config: EvidenceCollectionConfig
  ): Promise<EvidenceCollectionResult> {
    const startTime = Date.now();
    const errors: Array<{ operation: string; error: string }> = [];

    logger.info('Starting evidence collection', {
      recorderId: config.recorderId,
      adapterType: config.adapterType
    });

    try {
      // Determine adapter type
      let adapterType = config.adapterType;
      if (adapterType === 'auto') {
        const probe = await this.probeRecorder(
          config.recorderId,
          config.recorderUrl,
          config.credentials
        );

        if (probe.state !== 'OBSERVED' || !probe.value) {
          throw new Error('Could not auto-detect recorder type');
        }

        adapterType = probe.value.supportedAdapters[0]?.type || 'onvif';
        logger.info('Auto-detected adapter type', {
          recorderId: config.recorderId,
          adapterType
        });
      }

      // Create adapter
      const adapter = await this.adapterFactory.createAdapter({
        type: adapterType as any,
        recorderId: config.recorderId,
        recorderUrl: config.recorderUrl,
        credentials: config.credentials
      });

      try {
        // Collect evidence components
        const [
          reachable,
          authenticated,
          deviceInfo,
          capabilities,
          storage,
          deviceTime,
          channels
        ] = await Promise.allSettled([
          this.executeWithLimit(
            config.recorderId,
            'testConnection',
            () => adapter.testConnection(),
            config.options?.priority
          ),
          this.executeWithLimit(
            config.recorderId,
            'testAuthentication',
            () => adapter.testAuthentication(),
            config.options?.priority
          ),
          this.executeWithLimit(
            config.recorderId,
            'getDeviceInfo',
            () => adapter.getDeviceInfo(),
            config.options?.priority
          ),
          this.executeWithLimit(
            config.recorderId,
            'getCapabilities',
            () => adapter.getCapabilities(),
            config.options?.priority
          ),
          config.options?.skipStorage
            ? Promise.resolve(unknown(
                { adapter: adapterType as any, operation: 'getStorageStatus' },
                'Storage query skipped'
              ))
            : this.executeWithLimit(
                config.recorderId,
                'getStorageStatus',
                () => adapter.getStorageStatus(),
                config.options?.priority
              ),
          this.executeWithLimit(
            config.recorderId,
            'getDeviceTime',
            () => adapter.getDeviceTime(),
            config.options?.priority
          ),
          this.executeWithLimit(
            config.recorderId,
            'getChannels',
            () => adapter.getChannels(),
            config.options?.priority
          )
        ]);

        // Extract results
        const reachableEvidence = this.extractResult(reachable, errors, 'testConnection');
        const authenticatedEvidence = this.extractResult(authenticated, errors, 'testAuthentication');
        const deviceInfoEvidence = this.extractResult(deviceInfo, errors, 'getDeviceInfo');
        const capabilitiesEvidence = this.extractResult(capabilities, errors, 'getCapabilities');
        const storageEvidence = this.extractResult(storage, errors, 'getStorageStatus');
        const deviceTimeEvidence = this.extractResult(deviceTime, errors, 'getDeviceTime');
        const channelsEvidence = this.extractResult(channels, errors, 'getChannels');

        // Enrich channel evidence if not skipped
        let enrichedChannels = channelsEvidence;
        if (!config.options?.skipChannelDetails && channelsEvidence.state === 'OBSERVED') {
          enrichedChannels = await this.enrichChannelEvidence(
            adapter,
            config.recorderId,
            channelsEvidence.value!,
            config.options?.priority
          );
        }

        const collectionDurationMs = Date.now() - startTime;

        // Build evidence snapshot
        const evidence: RecorderEvidence = {
          recorderId: config.recorderId,
          tenantId: config.tenantId,
          branchId: config.branchId,
          collectedAt: new Date(),
          primaryAdapter: adapterType as any,
          reachable: reachableEvidence,
          authenticated: authenticatedEvidence,
          deviceInfo: deviceInfoEvidence,
          capabilities: capabilitiesEvidence,
          storage: storageEvidence,
          deviceTime: deviceTimeEvidence,
          channels: enrichedChannels,
          collectionDurationMs
        };

        const success = errors.length === 0;
        const partial = !success && (
          reachableEvidence.state === 'OBSERVED' ||
          authenticatedEvidence.state === 'OBSERVED'
        );

        logger.info('Evidence collection completed', {
          recorderId: config.recorderId,
          success,
          partial,
          errorCount: errors.length,
          durationMs: collectionDurationMs
        });

        return {
          evidence,
          success,
          partial,
          errors
        };

      } finally {
        adapter.destroy();
      }

    } catch (error) {
      const collectionDurationMs = Date.now() - startTime;

      logger.error('Evidence collection failed', {
        recorderId: config.recorderId,
        error,
        durationMs: collectionDurationMs
      });

      // Return minimal evidence snapshot
      const evidence: RecorderEvidence = {
        recorderId: config.recorderId,
        tenantId: config.tenantId,
        branchId: config.branchId,
        collectedAt: new Date(),
        primaryAdapter: config.adapterType as any,
        reachable: unknown(
          { adapter: 'unknown', operation: 'collectEvidence' },
          'Collection failed'
        ),
        authenticated: unknown(
          { adapter: 'unknown', operation: 'collectEvidence' },
          'Collection failed'
        ),
        deviceInfo: unknown(
          { adapter: 'unknown', operation: 'collectEvidence' },
          'Collection failed'
        ),
        capabilities: unknown(
          { adapter: 'unknown', operation: 'collectEvidence' },
          'Collection failed'
        ),
        storage: unknown(
          { adapter: 'unknown', operation: 'collectEvidence' },
          'Collection failed'
        ),
        deviceTime: unknown(
          { adapter: 'unknown', operation: 'collectEvidence' },
          'Collection failed'
        ),
        channels: unknown(
          { adapter: 'unknown', operation: 'collectEvidence' },
          'Collection failed'
        ),
        collectionDurationMs
      };

      return {
        evidence,
        success: false,
        partial: false,
        errors: [{
          operation: 'collectEvidence',
          error: error instanceof Error ? error.message : 'Unknown error'
        }]
      };
    }
  }

  /**
   * Execute operation with request limiter
   */
  private async executeWithLimit<T>(
    recorderId: string,
    operation: string,
    executor: () => Promise<T>,
    priority: RequestPriority = RequestPriority.NORMAL
  ): Promise<T> {
    return globalRequestLimiter.execute(
      recorderId,
      operation,
      executor,
      priority
    );
  }

  /**
   * Extract result from Promise.allSettled
   */
  private extractResult<T>(
    result: PromiseSettledResult<EvidenceValue<T>>,
    errors: Array<{ operation: string; error: string }>,
    operation: string
  ): EvidenceValue<T> {
    if (result.status === 'fulfilled') {
      return result.value;
    }

    errors.push({
      operation,
      error: result.reason instanceof Error
        ? result.reason.message
        : 'Unknown error'
    });

    return unknown(
      { adapter: 'unknown', operation },
      `Operation failed: ${result.reason}`
    );
  }

  /**
   * Enrich channel evidence with detailed status
   */
  private async enrichChannelEvidence(
    adapter: any,
    recorderId: string,
    channels: ChannelEvidence[],
    priority: RequestPriority = RequestPriority.NORMAL
  ): Promise<EvidenceValue<ChannelEvidence[]>> {
    logger.debug('Enriching channel evidence', {
      recorderId,
      channelCount: channels.length
    });

    // Limit concurrent channel queries
    const maxConcurrent = 3;
    const enrichedChannels: ChannelEvidence[] = [];

    for (let i = 0; i < channels.length; i += maxConcurrent) {
      const batch = channels.slice(i, i + maxConcurrent);
      
      const results = await Promise.allSettled(
        batch.map(channel =>
          this.executeWithLimit(
            recorderId,
            `getChannel_${channel.channelId}`,
            () => adapter.getChannel(channel.channelId),
            priority
          )
        )
      );

      for (let j = 0; j < batch.length; j++) {
        const result = results[j];
        
        if (result.status === 'fulfilled' && result.value.state === 'OBSERVED') {
          enrichedChannels.push(result.value.value!);
        } else {
          // Keep original channel evidence if enrichment failed
          enrichedChannels.push(batch[j]);
        }
      }
    }

    return observed(
      enrichedChannels,
      {
        adapter: adapter.getType(),
        operation: 'getChannels'
      }
    );
  }

  /**
   * Search recordings across channel
   */
  async searchRecordings(
    recorderId: string,
    recorderUrl: string,
    adapterType: 'onvif' | 'hikvision' | 'dahua',
    credentials: { username: string; password: string },
    request: RecordingSearchRequest
  ): Promise<EvidenceValue<any>> {
    const adapter = await this.adapterFactory.createAdapter({
      type: adapterType,
      recorderId,
      recorderUrl,
      credentials
    });

    try {
      return await this.executeWithLimit(
        recorderId,
        'searchRecordings',
        () => adapter.searchRecordings(request),
        RequestPriority.HIGH
      );
    } finally {
      adapter.destroy();
    }
  }

  /**
   * Get recorder statistics
   */
  getRecorderStats(recorderId: string) {
    return globalRequestLimiter.getRecorderStats(recorderId);
  }

  /**
   * Get global statistics
   */
  getGlobalStats() {
    return globalRequestLimiter.getGlobalStats();
  }

  /**
   * Clear request queue for recorder
   */
  clearRecorderQueue(recorderId: string): void {
    globalRequestLimiter.clearQueue(recorderId);
  }
}
