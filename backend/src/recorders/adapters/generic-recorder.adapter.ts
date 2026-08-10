/**
 * Generic Recorder Adapter
 * 
 * Fallback adapter for unknown recorders.
 * Provides only basic connectivity checks.
 * 
 * Most features return UNKNOWN because we cannot verify them
 * without vendor-specific APIs.
 * 
 * This adapter's purpose is to:
 * 1. Test basic network connectivity
 * 2. Avoid false positives (everything unknown except connectivity)
 * 3. Serve as last-resort fallback
 */

import type {
  ConnectionStatus,
  AuthenticationStatus,
  RecorderChannel,
  StreamStatus,
  RecordingStatus,
  RecordingArchiveInfo,
  StorageCheckResult,
  RecorderDeviceInfo,
  RecorderCapabilities,
  CheckResult,
  Recorder
} from '../types/index.js';
import type { RecorderAdapter, RecorderConnection } from '../recorder-adapter.interface.js';
import { BaseRecorderAdapter } from './base-recorder.adapter.js';
import { logger } from '../../utils/logger.js';

export class GenericRecorderAdapter extends BaseRecorderAdapter implements RecorderAdapter {
  
  getAdapterType(): string {
    return 'generic';
  }
  
  getAdapterInfo() {
    return {
      type: this.getAdapterType(),
      version: this.getAdapterVersion(),
      vendor: 'generic'
    };
  }
  
  /**
   * Generic adapter has minimal capabilities
   * Most features unsupported = UNKNOWN
   */
  getCapabilities(): RecorderCapabilities {
    return {
      liveStreamStatus: false,
      recordingStatus: false,
      archiveSearch: false,
      storageStatus: false,
      diskHealth: false,
      deviceTime: false,
      retentionQuery: false,
      channelEnumeration: false
    };
  }
  
  /**
   * Test basic TCP connectivity
   * This is the ONLY check a generic adapter can reliably perform
   */
  async testConnection(): Promise<ConnectionStatus> {
    const startTime = Date.now();
    
    try {
      // Try to establish HTTP connection
      const result = await this.withTimeout(
        this.httpClient.get('/'),
        this.config.connectionTimeoutMs,
        'testConnection'
      );
      
      const latencyMs = Date.now() - startTime;
      
      // Any response means device is reachable
      // Even 404, 401, etc. prove the device responded
      if (result.status !== undefined) {
        logger.debug('Generic recorder reachable', {
          recorderId: this.recorder.id,
          status: result.status,
          latencyMs
        });
        
        this.connected = true;
        
        return {
          status: 'healthy',
          value: true,
          latencyMs,
          message: `Device reachable (HTTP ${result.status})`,
          checkedAt: new Date()
        };
      }
      
      // No response
      return {
        status: 'unknown',
        value: false,
        message: 'No response from device',
        errorCode: 'DEVICE_UNREACHABLE',
        checkedAt: new Date()
      };
      
    } catch (error) {
      const normalized = this.normalizeError(error);
      
      logger.warn('Generic recorder unreachable', {
        recorderId: this.recorder.id,
        error: normalized
      });
      
      // Connection refused = definitely unhealthy
      if (normalized.code === 'CONNECTION_REFUSED') {
        return {
          status: 'unhealthy',
          value: false,
          message: normalized.message,
          errorCode: normalized.code,
          checkedAt: new Date()
        };
      }
      
      // Timeout = unknown (could be network or device)
      if (normalized.code === 'NETWORK_TIMEOUT') {
        return {
          status: 'unknown',
          value: false,
          message: normalized.message,
          errorCode: normalized.code,
          checkedAt: new Date()
        };
      }
      
      // DNS failure = unhealthy (configuration error)
      if (normalized.code === 'DNS_RESOLUTION_FAILED') {
        return {
          status: 'unhealthy',
          value: false,
          message: normalized.message,
          errorCode: normalized.code,
          checkedAt: new Date()
        };
      }
      
      // Other errors = unknown
      return {
        status: 'unknown',
        value: false,
        message: normalized.message,
        errorCode: normalized.code,
        checkedAt: new Date()
      };
    }
  }
  
  /**
   * Authentication - not supported
   * Cannot verify without vendor API
   */
  async authenticate(): Promise<AuthenticationStatus> {
    this.logNotImplemented('authenticate');
    
    return this.createUnknownResult<boolean>(
      'Authentication verification not supported by generic adapter',
      'UNSUPPORTED_FEATURE'
    );
  }
  
  /**
   * Device info - not supported
   */
  async getDeviceInfo(): Promise<CheckResult<RecorderDeviceInfo>> {
    this.logNotImplemented('getDeviceInfo');
    
    return this.createUnknownResult<RecorderDeviceInfo>(
      'Device info not available from generic adapter',
      'UNSUPPORTED_FEATURE'
    );
  }
  
  /**
   * Channels - not supported
   */
  async getChannels(): Promise<CheckResult<RecorderChannel[]>> {
    this.logNotImplemented('getChannels');
    
    return this.createUnknownResult<RecorderChannel[]>(
      'Channel enumeration not supported by generic adapter',
      'UNSUPPORTED_FEATURE'
    );
  }
  
  /**
   * Single channel - not supported
   */
  async getChannel(channelId: string): Promise<CheckResult<RecorderChannel>> {
    this.logNotImplemented('getChannel');
    
    return this.createUnknownResult<RecorderChannel>(
      `Cannot verify channel ${channelId} without vendor API`,
      'UNSUPPORTED_FEATURE'
    );
  }
  
  /**
   * Stream status - not supported
   */
  async getStreamStatus(channelId: string): Promise<StreamStatus> {
    this.logNotImplemented('getStreamStatus');
    
    return this.createUnknownResult<string>(
      'Stream status verification not supported by generic adapter',
      'UNSUPPORTED_FEATURE'
    );
  }
  
  /**
   * Recording status - not supported
   * 
   * CRITICAL: This is why generic adapter must return UNKNOWN
   * We cannot verify recording without vendor API
   */
  async getRecordingStatus(channelId: string): Promise<RecordingStatus> {
    this.logNotImplemented('getRecordingStatus');
    
    return this.createUnknownResult<string>(
      'Recording status verification not supported by generic adapter',
      'UNSUPPORTED_FEATURE'
    );
  }
  
  /**
   * Latest recording - not supported
   * 
   * CRITICAL: Cannot access archive without vendor API
   * Must return null, never fabricate timestamps
   */
  async getLatestRecording(channelId: string): Promise<RecordingArchiveInfo | null> {
    this.logNotImplemented('getLatestRecording');
    return null;
  }
  
  /**
   * Oldest recording - not supported
   */
  async getOldestRecording(channelId: string): Promise<RecordingArchiveInfo | null> {
    this.logNotImplemented('getOldestRecording');
    return null;
  }
  
  /**
   * Storage status - not supported
   */
  async getStorageStatus(): Promise<StorageCheckResult> {
    this.logNotImplemented('getStorageStatus');
    
    return this.createUnknownResult(
      'Storage status not available from generic adapter',
      'UNSUPPORTED_FEATURE'
    );
  }
  
  /**
   * Device time - not supported
   */
  async getDeviceTime(): Promise<CheckResult<Date>> {
    this.logNotImplemented('getDeviceTime');
    
    return this.createUnknownResult<Date>(
      'Device time not available from generic adapter',
      'UNSUPPORTED_FEATURE'
    );
  }
}
