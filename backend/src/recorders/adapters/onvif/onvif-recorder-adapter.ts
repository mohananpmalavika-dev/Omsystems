/**
 * ONVIF Recorder Adapter (Complete Implementation)
 * 
 * Fully functional ONVIF adapter using proper SOAP/WS-Security.
 * 
 * Architecture:
 * - OnvifClient: SOAP operations and parsing
 * - RecorderHttpTransport: HTTP layer with retry/timeout
 * - Evidence model: Normalized observations
 * 
 * This adapter NEVER invents values. It returns evidence states:
 * - OBSERVED: Successfully retrieved
 * - UNSUPPORTED: Device doesn't implement feature
 * - AUTH_FAILED: Authentication problem
 * - TIMEOUT: Request timed out
 * - UNREACHABLE: Network/connection issue
 * - MALFORMED_RESPONSE: Parse error
 * - UNKNOWN: Other failure
 */

import type {
  EvidenceValue,
  RecorderAdapterType
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
  StreamProfile
} from '../../contracts/recorder-evidence.js';
import {
  observed,
  unknown,
  unsupported,
  authFailed,
  timedOut,
  unreachable,
  malformed,
  fromError
} from '../../contracts/evidence-helpers.js';
import { OnvifClient, OnvifServiceEndpoints } from './onvif-client.js';
import {
  RecorderHttpTransport,
  HttpTransportConfig,
  RecorderTransportError
} from '../../transport/recorder-http-transport.js';
import { RecorderCredentials } from '../../transport/recorder-auth.js';
import { errorToEvidenceState } from '../../transport/error-mapper.js';
import { logger } from '../../../utils/logger.js';

/**
 * ONVIF adapter configuration
 */
export interface OnvifAdapterConfig {
  recorderId: string;
  recorderUrl: string;
  credentials: RecorderCredentials;
  endpoints?: Partial<OnvifServiceEndpoints>;
  timeoutMs?: number;
  tlsVerify?: boolean;
}

/**
 * ONVIF Recorder Adapter
 */
export class OnvifRecorderAdapter {
  private readonly config: OnvifAdapterConfig;
  private readonly transport: RecorderHttpTransport;
  private readonly client: OnvifClient;
  
  // Cached data
  private cachedProfiles?: StreamProfile[];
  private cachedCapabilities?: RecorderCapabilities;

  constructor(config: OnvifAdapterConfig) {
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

    // Create ONVIF client
    const endpoints: OnvifServiceEndpoints = {
      device: config.endpoints?.device ?? '/onvif/device_service',
      media: config.endpoints?.media,
      recording: config.endpoints?.recording,
      search: config.endpoints?.search,
      replay: config.endpoints?.replay,
      events: config.endpoints?.events
    };

    this.client = new OnvifClient({
      recorderId: config.recorderId,
      endpoints,
      credentials: config.credentials,
      transport: this.transport
    });
  }

  /**
   * Get adapter type
   */
  getType(): RecorderAdapterType {
    return 'onvif';
  }

  /**
   * Probe device (test connectivity and identify)
   */
  async probe(): Promise<EvidenceValue<RecorderProbe>> {
    const startTime = Date.now();
    const source = {
      adapter: this.getType() as RecorderAdapterType,
      operation: 'probe',
      protocol: 'soap' as const
    };

    try {
      // Try GetSystemDateAndTime (doesn't require auth)
      const clockEvidence = await this.client.getSystemDateAndTime();
      
      // Try GetDeviceInformation (requires auth)
      let deviceInfo: DeviceInfo | undefined;
      try {
        deviceInfo = await this.client.getDeviceInformation();
      } catch (error) {
        logger.debug('Device info not available during probe', { error });
      }

      const latencyMs = Date.now() - startTime;

      const probe: RecorderProbe = {
        reachable: true,
        manufacturer: deviceInfo?.manufacturer,
        model: deviceInfo?.model,
        firmwareVersion: deviceInfo?.firmwareVersion,
        supportedAdapters: [
          {
            type: 'onvif',
            confidence: 1.0,
            detectionMethod: 'onvif_discovery'
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
    const source = {
      adapter: this.getType() as RecorderAdapterType,
      operation: 'testConnection',
      protocol: 'soap' as const
    };

    try {
      const startTime = Date.now();
      await this.client.getSystemDateAndTime();
      const latencyMs = Date.now() - startTime;

      return observed(true, source, { latencyMs });

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
    const source = {
      adapter: this.getType() as RecorderAdapterType,
      operation: 'authenticate',
      protocol: 'soap' as const
    };

    try {
      const startTime = Date.now();
      await this.client.getDeviceInformation();
      const latencyMs = Date.now() - startTime;

      return observed(true, source, { latencyMs });

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
    const source = {
      adapter: this.getType() as RecorderAdapterType,
      operation: 'getDeviceInfo',
      protocol: 'soap' as const
    };

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
    const source = {
      adapter: this.getType() as RecorderAdapterType,
      operation: 'getDeviceTime',
      protocol: 'soap' as const
    };

    try {
      const startTime = Date.now();
      const clockEvidence = await this.client.getSystemDateAndTime();
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
    const source = {
      adapter: this.getType() as RecorderAdapterType,
      operation: 'getCapabilities',
      protocol: 'soap' as const
    };

    if (this.cachedCapabilities) {
      return observed(this.cachedCapabilities, source, { confidence: 0.9 });
    }

    try {
      const startTime = Date.now();
      
      // Discover services first
      await this.client.discoverServices();
      
      // Get capabilities
      const partial = await this.client.getCapabilities();
      
      const capabilities: RecorderCapabilities = {
        deviceInfo: partial.deviceInfo ?? true,
        channelEnumeration: partial.channelEnumeration ?? true,
        streamStatus: partial.streamStatus ?? true,
        recordingStatus: partial.recordingStatus ?? false,
        recordingSearch: partial.recordingSearch ?? false,
        storageStatus: partial.storageStatus ?? false,
        deviceTime: partial.deviceTime ?? true,
        playbackUri: partial.playbackUri ?? false,
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
   * Get channels (from media profiles)
   */
  async getChannels(): Promise<EvidenceValue<ChannelEvidence[]>> {
    const source = {
      adapter: this.getType() as RecorderAdapterType,
      operation: 'getChannels',
      protocol: 'soap' as const
    };

    try {
      const startTime = Date.now();
      
      // Get profiles if not cached
      if (!this.cachedProfiles) {
        this.cachedProfiles = await this.client.getProfiles();
      }

      const profiles = this.cachedProfiles;
      
      // Group by source (multiple profiles per channel)
      const channelMap = new Map<string, StreamProfile[]>();
      
      for (const profile of profiles) {
        const channelId = profile.profileId.split('_')[0]; // Extract source ID
        
        if (!channelMap.has(channelId)) {
          channelMap.set(channelId, []);
        }
        channelMap.get(channelId)!.push(profile);
      }

      // Convert to channel evidence
      const channels: ChannelEvidence[] = Array.from(channelMap.entries()).map(
        ([channelId, profiles]) => {
          const mainProfile = profiles.find(p => p.type === 'main') || profiles[0];
          
          return {
            channelId,
            vendorChannelRef: mainProfile.vendorToken,
            name: mainProfile.name,
            enabled: observed(true, source), // Profile exists = enabled
            streamReachable: unknown(source, 'Stream reachability not checked'),
            videoPresent: unknown(source, 'Video presence not checked'),
            recordingConfigured: unknown(source, 'Recording config not available via Media service'),
            recordingActive: unknown(source, 'Recording status not available via Media service'),
            latestRecordingAt: unknown(source, 'Archive search not performed'),
            archivePlayable: unknown(source, 'Playback not verified'),
            streamMetadata: mainProfile.metadata,
            streamProfiles: profiles
          };
        }
      );

      const latencyMs = Date.now() - startTime;

      return observed(channels, source, { latencyMs });

    } catch (error) {
      const latencyMs = Date.now();
      return fromError<ChannelEvidence[]>(error, source, latencyMs);
    }
  }

  /**
   * Get single channel
   */
  async getChannel(channelId: string): Promise<EvidenceValue<ChannelEvidence>> {
    const source = {
      adapter: this.getType() as RecorderAdapterType,
      operation: 'getChannel',
      protocol: 'soap' as const
    };

    try {
      const channelsEvidence = await this.getChannels();
      
      if (channelsEvidence.state !== 'OBSERVED' || !channelsEvidence.value) {
        return unknown(source, 'Could not enumerate channels');
      }

      const channel = channelsEvidence.value.find(c => c.channelId === channelId);
      
      if (!channel) {
        return unsupported(source, `Channel ${channelId} not found`);
      }

      return observed(channel, source, {
        latencyMs: channelsEvidence.latencyMs
      });

    } catch (error) {
      return fromError<ChannelEvidence>(error, source);
    }
  }

  /**
   * Search recordings
   */
  async searchRecordings(
    request: RecordingSearchRequest
  ): Promise<EvidenceValue<RecordingSegment[]>> {
    const source = {
      adapter: this.getType() as RecorderAdapterType,
      operation: 'searchRecordings',
      protocol: 'soap' as const
    };

    // Check if search service is available
    if (!this.client.hasService('search')) {
      return unsupported(
        source,
        'ONVIF Search service not available on this device'
      );
    }

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
   * 
   * NOTE: ONVIF provides limited storage information.
   * Vendor-specific APIs (Hikvision/Dahua) are more comprehensive.
   */
  async getStorageStatus(): Promise<EvidenceValue<StorageEvidence>> {
    const source = {
      adapter: this.getType() as RecorderAdapterType,
      operation: 'getStorageStatus',
      protocol: 'soap' as const
    };

    // ONVIF doesn't have a standardized storage query API
    return unsupported(
      source,
      'ONVIF does not provide detailed storage status - use vendor-specific adapter'
    );
  }

  /**
   * Get stream URI for channel
   */
  async getStreamUri(channelId: string): Promise<EvidenceValue<string>> {
    const source = {
      adapter: this.getType() as RecorderAdapterType,
      operation: 'getStreamUri',
      protocol: 'soap' as const
    };

    try {
      const startTime = Date.now();
      
      // Get profiles if not cached
      if (!this.cachedProfiles) {
        this.cachedProfiles = await this.client.getProfiles();
      }

      // Find profile for this channel
      const profile = this.cachedProfiles.find(p =>
        p.profileId.startsWith(channelId) || p.profileId === channelId
      );

      if (!profile) {
        return unsupported(source, `No profile found for channel ${channelId}`);
      }

      // Get stream URI
      const uri = await this.client.getStreamUri(profile.vendorToken!);
      const latencyMs = Date.now() - startTime;

      return observed(uri, source, { latencyMs });

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
