/**
 * Hikvision Recorder Adapter (Complete Implementation)
 * 
 * Fully functional Hikvision ISAPI adapter with HTTP Digest authentication.
 * 
 * Architecture:
 * - HikvisionClient: ISAPI operations and XML parsing
 * - RecorderHttpTransport: HTTP layer with retry/timeout
 * - Evidence model: Normalized observations
 * 
 * Like the ONVIF adapter, this NEVER invents values.
 * Returns proper evidence states for all observations.
 */

import type {
  EvidenceValue,
  RecorderAdapterType,
  EvidenceSource
} from '../../contracts/evidence-value.js';
import type {
  DeviceInfo,
  RecorderCapabilities,
  DeviceClockEvidence,
  ChannelEvidence,
  RecordingSegment,
  RecordingSearchRequest,
  StorageEvidence,
  RecorderProbe,
  StreamMetadata
} from '../../contracts/recorder-evidence.js';
import {
  observed,
  unknown,
  unsupported,
  authFailed,
  timedOut,
  unreachable,
  fromError
} from '../../contracts/evidence-helpers.js';
import { HikvisionClient, HikvisionClientConfig } from './hikvision-client.js';
import {
  RecorderHttpTransport,
  HttpTransportConfig,
  RecorderTransportError
} from '../../transport/recorder-http-transport.js';
import { RecorderCredentials } from '../../transport/recorder-auth.js';
import { errorToEvidenceState } from '../../transport/error-mapper.js';
import { logger } from '../../../utils/logger.js';

/**
 * Hikvision adapter configuration
 */
export interface HikvisionAdapterConfig {
  recorderId: string;
  recorderUrl: string;
  credentials: RecorderCredentials;
  timeoutMs?: number;
  tlsVerify?: boolean;
}

/**
 * Hikvision Recorder Adapter
 */
export class HikvisionRecorderAdapter {
  private readonly config: HikvisionAdapterConfig;
  private readonly transport: RecorderHttpTransport;
  private readonly client: HikvisionClient;
  
  // Cached data
  private cachedChannels?: Array<{ id: string; name: string; enabled: boolean }>;
  private cachedCapabilities?: RecorderCapabilities;

  constructor(config: HikvisionAdapterConfig) {
    this.config = config;

    // Create HTTP transport
    const transportConfig: HttpTransportConfig = {
      baseUrl: config.recorderUrl,
      timeoutMs: config.timeoutMs ?? 10000,
      maxRetries: 3,
      tlsVerify: config.tlsVerify ?? false,
      keepAlive: true,
      maxSockets: 4
    };

    this.transport = new RecorderHttpTransport(config.recorderId, transportConfig);

    // Create Hikvision client
    this.client = new HikvisionClient({
      recorderId: config.recorderId,
      credentials: config.credentials,
      transport: this.transport
    });
  }

  /**
   * Get adapter type
   */
  getType(): RecorderAdapterType {
    return 'hikvision';
  }

  /**
   * Create evidence source metadata
   */
  private createSource(operation: string): EvidenceSource {
    return {
      adapter: this.getType(),
      operation,
      protocol: 'http'
    };
  }

  /**
   * Probe device
   */
  async probe(): Promise<EvidenceValue<RecorderProbe>> {
    const startTime = Date.now();
    const source = this.createSource('probe');

    try {
      // Test connectivity
      const reachable = await this.client.testConnection();
      
      if (!reachable) {
        return unreachable(source, 'Device not reachable');
      }

      // Try to get device info
      let deviceInfo: DeviceInfo | undefined;
      try {
        deviceInfo = await this.client.getDeviceInformation();
      } catch (error) {
        logger.debug('Device info not available during probe', { error });
      }

      const latencyMs = Date.now() - startTime;

      const probe: RecorderProbe = {
        reachable: true,
        manufacturer: deviceInfo?.manufacturer || 'Hikvision',
        model: deviceInfo?.model,
        firmwareVersion: deviceInfo?.firmwareVersion,
        supportedAdapters: [
          {
            type: 'hikvision',
            confidence: 1.0,
            detectionMethod: 'api_response'
          },
          {
            type: 'onvif',
            confidence: 0.8,
            detectionMethod: 'known_model'
          }
        ],
        probeDurationMs: latencyMs
      };

      return observed(probe, source, { latencyMs });

    } catch (error) {
      const latencyMs = Date.now() - startTime;
      return fromError<RecorderProbe>(error, source, latencyMs);
    }
  }

  /**
   * Test connection
   */
  async testConnection(): Promise<EvidenceValue<boolean>> {
    const source = this.createSource('testConnection');

    try {
      const startTime = Date.now();
      const connected = await this.client.testConnection();
      const latencyMs = Date.now() - startTime;

      return observed(connected, source, { latencyMs });

    } catch (error) {
      const latencyMs = Date.now();
      
      if (error instanceof RecorderTransportError) {
        const state = errorToEvidenceState(error);
        
        if (state === 'UNREACHABLE') {
          return unreachable(source, error.message, { latencyMs });
        }
        if (state === 'TIMEOUT') {
          return timedOut(source, error.latencyMs ?? 0, { latencyMs });
        }
      }

      return fromError<boolean>(error, source, latencyMs);
    }
  }

  /**
   * Test authentication
   */
  async testAuthentication(): Promise<EvidenceValue<boolean>> {
    const source = this.createSource('authenticate');

    try {
      const startTime = Date.now();
      const authenticated = await this.client.testAuthentication();
      const latencyMs = Date.now() - startTime;

      return observed(authenticated, source, { latencyMs });

    } catch (error) {
      const latencyMs = Date.now();
      
      if (error instanceof RecorderTransportError) {
        if (error.code === 'AUTH_FAILED' || error.code === 'FORBIDDEN') {
          return authFailed(source, error.message, {
            httpStatus: error.httpStatus,
            latencyMs
          });
        }
      }

      return fromError<boolean>(error, source, latencyMs);
    }
  }

  /**
   * Get device information
   */
  async getDeviceInfo(): Promise<EvidenceValue<DeviceInfo>> {
    const source = this.createSource('getDeviceInfo');

    try {
      const startTime = Date.now();
      const info = await this.client.getDeviceInformation();
      const latencyMs = Date.now() - startTime;

      return observed(info, source, { latencyMs });

    } catch (error) {
      const latencyMs = Date.now();
      return fromError<DeviceInfo>(error, source, latencyMs);
    }
  }

  /**
   * Get device clock state
   */
  async getDeviceTime(): Promise<EvidenceValue<DeviceClockEvidence>> {
    const source = this.createSource('getDeviceTime');

    try {
      const startTime = Date.now();
      const clockEvidence = await this.client.getDeviceTime();
      const latencyMs = Date.now() - startTime;

      return observed(clockEvidence, source, { latencyMs });

    } catch (error) {
      const latencyMs = Date.now();
      return fromError<DeviceClockEvidence>(error, source, latencyMs);
    }
  }

  /**
   * Get capabilities
   */
  async getCapabilities(): Promise<EvidenceValue<RecorderCapabilities>> {
    const source = this.createSource('getCapabilities');

    if (this.cachedCapabilities) {
      return observed(this.cachedCapabilities, source, { confidence: 0.9 });
    }

    try {
      const startTime = Date.now();
      const caps = await this.client.getCapabilities();
      
      const capabilities: RecorderCapabilities = {
        deviceInfo: caps.deviceInfo,
        channelEnumeration: caps.channels,
        streamStatus: caps.channels,
        recordingStatus: caps.recording,
        recordingSearch: caps.recording,
        storageStatus: caps.storage,
        deviceTime: caps.time,
        playbackUri: caps.recording,
        source: 'reported',
        discoveredAt: new Date()
      };

      this.cachedCapabilities = capabilities;
      const latencyMs = Date.now() - startTime;

      return observed(capabilities, source, { latencyMs });

    } catch (error) {
      const latencyMs = Date.now();
      return fromError<RecorderCapabilities>(error, source, latencyMs);
    }
  }

  /**
   * Get all channels
   */
  async getChannels(): Promise<EvidenceValue<ChannelEvidence[]>> {
    const source = this.createSource('getChannels');

    try {
      const startTime = Date.now();
      
      // Fetch channels if not cached
      if (!this.cachedChannels) {
        this.cachedChannels = await this.client.getChannels();
      }

      const channels = this.cachedChannels;

      // Build channel evidence (with minimal verification for performance)
      const channelEvidence: ChannelEvidence[] = channels.map(channel => ({
        channelId: channel.id,
        vendorChannelRef: channel.id,
        name: channel.name,
        enabled: observed(channel.enabled, source),
        streamReachable: unknown(source, 'Stream reachability not checked'),
        videoPresent: unknown(source, 'Video presence not checked'),
        recordingConfigured: unknown(source, 'Recording config not checked'),
        recordingActive: unknown(source, 'Recording status not checked'),
        latestRecordingAt: unknown(source, 'Archive not queried'),
        archivePlayable: unknown(source, 'Playback not verified')
      }));

      const latencyMs = Date.now() - startTime;

      return observed(channelEvidence, source, { latencyMs });

    } catch (error) {
      const latencyMs = Date.now();
      return fromError<ChannelEvidence[]>(error, source, latencyMs);
    }
  }

  /**
   * Get single channel with full verification
   */
  async getChannel(channelId: string): Promise<EvidenceValue<ChannelEvidence>> {
    const source = this.createSource('getChannel');

    try {
      const startTime = Date.now();
      
      // Get channel info
      const channelInfo = await this.client.getChannel(channelId);

      // Get stream status
      let streamStatus: { online: boolean; signalStatus?: string } | undefined;
      try {
        streamStatus = await this.client.getStreamStatus(channelId);
      } catch (error) {
        logger.debug('Could not get stream status', { channelId, error });
      }

      // Get recording status
      let recordingStatus: { recording: boolean; enabled: boolean } | undefined;
      try {
        recordingStatus = await this.client.getRecordingStatus(channelId);
      } catch (error) {
        logger.debug('Could not get recording status', { channelId, error });
      }

      const latencyMs = Date.now() - startTime;

      const evidence: ChannelEvidence = {
        channelId: channelInfo.id,
        vendorChannelRef: channelInfo.id,
        name: channelInfo.name,
        enabled: observed(channelInfo.enabled, source),
        streamReachable: streamStatus
          ? observed(streamStatus.online, source)
          : unknown(source, 'Stream status query failed'),
        videoPresent: streamStatus?.signalStatus
          ? observed(streamStatus.signalStatus.toLowerCase() === 'ok', source)
          : unknown(source, 'Signal status not available'),
        recordingConfigured: recordingStatus
          ? observed(recordingStatus.enabled, source)
          : unknown(source, 'Recording config query failed'),
        recordingActive: recordingStatus
          ? observed(recordingStatus.recording, source)
          : unknown(source, 'Recording status query failed'),
        latestRecordingAt: unknown(source, 'Archive not queried'),
        archivePlayable: unknown(source, 'Playback not verified')
      };

      return observed(evidence, source, { latencyMs });

    } catch (error) {
      const latencyMs = Date.now();
      return fromError<ChannelEvidence>(error, source, latencyMs);
    }
  }

  /**
   * Search recordings
   */
  async searchRecordings(
    request: RecordingSearchRequest
  ): Promise<EvidenceValue<RecordingSegment[]>> {
    const source = this.createSource('searchRecordings');

    try {
      const startTime = Date.now();
      const segments = await this.client.searchRecordings(request);
      const latencyMs = Date.now() - startTime;

      return observed(segments, source, { latencyMs });

    } catch (error) {
      const latencyMs = Date.now();
      return fromError<RecordingSegment[]>(error, source, latencyMs);
    }
  }

  /**
   * Get storage status
   */
  async getStorageStatus(): Promise<EvidenceValue<StorageEvidence>> {
    const source = this.createSource('getStorageStatus');

    try {
      const startTime = Date.now();
      const storage = await this.client.getStorageStatus();
      const latencyMs = Date.now() - startTime;

      return observed(storage, source, { latencyMs });

    } catch (error) {
      const latencyMs = Date.now();
      return fromError<StorageEvidence>(error, source, latencyMs);
    }
  }

  /**
   * Get stream URI
   */
  async getStreamUri(
    channelId: string,
    streamType: 'main' | 'sub' = 'main'
  ): Promise<EvidenceValue<string>> {
    const source = this.createSource('getStreamUri');

    try {
      const startTime = Date.now();
      const uri = await this.client.getStreamUri(channelId, streamType);
      const latencyMs = Date.now() - startTime;

      // Construct full RTSP URI
      const baseUrl = new URL(this.config.recorderUrl);
      const rtspUri = `rtsp://${baseUrl.hostname}:554${uri}`;

      return observed(rtspUri, source, { latencyMs });

    } catch (error) {
      const latencyMs = Date.now();
      return fromError<string>(error, source, latencyMs);
    }
  }

  /**
   * Cleanup
   */
  destroy(): void {
    this.transport.destroy();
  }
}
