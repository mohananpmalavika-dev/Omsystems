/**
 * ONVIF Recorder Adapter
 * 
 * Implements standardized ONVIF protocol for recorder communication.
 * ONVIF provides good coverage for:
 * - Device management
 * - Media profiles
 * - Recording control
 * - Some storage information
 * 
 * Note: Archive search and detailed storage may be limited
 * compared to vendor-specific APIs.
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

export class OnvifRecorderAdapter extends BaseRecorderAdapter implements RecorderAdapter {
  
  getAdapterType(): string {
    return 'onvif';
  }
  
  getAdapterInfo() {
    return {
      type: this.getAdapterType(),
      version: this.getAdapterVersion(),
      vendor: 'onvif'
    };
  }
  
  /**
   * ONVIF capabilities
   * Good for media and recording, limited for storage details
   */
  getCapabilities(): RecorderCapabilities {
    return {
      liveStreamStatus: true,
      recordingStatus: true,
      archiveSearch: true, // Limited
      storageStatus: true, // Basic only
      diskHealth: false, // Not in standard ONVIF
      deviceTime: true,
      retentionQuery: false, // Not reliably available
      channelEnumeration: true
    };
  }
  
  async testConnection(): Promise<ConnectionStatus> {
    const startTime = Date.now();
    
    try {
      // ONVIF device management endpoint
      const result = await this.withTimeout(
        this.httpClient.post('/onvif/device_service', this.buildGetSystemDateAndTimeRequest()),
        this.config.connectionTimeoutMs,
        'testConnection'
      );
      
      const latencyMs = Date.now() - startTime;
      
      if (result.status !== undefined) {
        this.connected = true;
        
        return {
          status: 'healthy',
          value: true,
          latencyMs,
          message: 'ONVIF device reachable',
          checkedAt: new Date()
        };
      }
      
      return this.createUnknownResult<boolean>(
        'No response from ONVIF device',
        'DEVICE_UNREACHABLE'
      );
      
    } catch (error) {
      const normalized = this.normalizeError(error);
      
      if (normalized.code === 'CONNECTION_REFUSED' || normalized.code === 'DNS_RESOLUTION_FAILED') {
        return this.createUnhealthyResult<boolean>(
          normalized.message,
          normalized.code,
          false
        );
      }
      
      return this.createUnknownResult<boolean>(
        normalized.message,
        normalized.code
      );
    }
  }
  
  async authenticate(): Promise<AuthenticationStatus> {
    try {
      // ONVIF uses WS-Security with username token
      const result = await this.httpClient.post(
        '/onvif/device_service',
        this.buildGetDeviceInformationRequest(),
        this.buildOnvifAuthHeaders()
      );
      
      if (result.status === 200) {
        this.authenticated = true;
        
        return {
          status: 'healthy',
          value: true,
          method: 'token',
          message: 'ONVIF authentication successful',
          checkedAt: new Date()
        };
      }
      
      if (result.status === 401) {
        return this.createUnhealthyResult<boolean>(
          'Invalid ONVIF credentials',
          'AUTHENTICATION_FAILED',
          false
        );
      }
      
      return this.createUnknownResult<boolean>(
        `Unexpected response (HTTP ${result.status})`,
        'VENDOR_API_ERROR'
      );
      
    } catch (error) {
      const normalized = this.normalizeError(error);
      
      if (normalized.code === 'AUTHENTICATION_FAILED') {
        return this.createUnhealthyResult<boolean>(
          normalized.message,
          normalized.code,
          false
        );
      }
      
      return this.createUnknownResult<boolean>(
        normalized.message,
        normalized.code
      );
    }
  }
  
  async getDeviceInfo(): Promise<CheckResult<RecorderDeviceInfo>> {
    // TODO: Implement ONVIF GetDeviceInformation
    return this.createUnknownResult<RecorderDeviceInfo>(
      'ONVIF device info parsing not yet implemented',
      'UNSUPPORTED_FEATURE'
    );
  }
  
  async getChannels(): Promise<CheckResult<RecorderChannel[]>> {
    // TODO: Implement ONVIF GetProfiles / GetVideoSources
    return this.createUnknownResult<RecorderChannel[]>(
      'ONVIF channel enumeration not yet implemented',
      'UNSUPPORTED_FEATURE'
    );
  }
  
  async getChannel(channelId: string): Promise<CheckResult<RecorderChannel>> {
    // TODO: Implement ONVIF profile lookup
    return this.createUnknownResult<RecorderChannel>(
      'ONVIF channel query not yet implemented',
      'UNSUPPORTED_FEATURE'
    );
  }
  
  async getStreamStatus(channelId: string): Promise<StreamStatus> {
    // TODO: Implement ONVIF GetStreamUri validation
    return this.createUnknownResult<string>(
      'ONVIF stream status not yet implemented',
      'UNSUPPORTED_FEATURE'
    );
  }
  
  async getRecordingStatus(channelId: string): Promise<RecordingStatus> {
    // TODO: Implement ONVIF GetRecordingStatus
    return this.createUnknownResult<string>(
      'ONVIF recording status not yet implemented',
      'UNSUPPORTED_FEATURE'
    );
  }
  
  async getLatestRecording(channelId: string): Promise<RecordingArchiveInfo | null> {
    // TODO: Implement ONVIF FindRecordings search
    return null;
  }
  
  async getOldestRecording(channelId: string): Promise<RecordingArchiveInfo | null> {
    // TODO: Implement ONVIF FindRecordings search
    return null;
  }
  
  async getStorageStatus(): Promise<StorageCheckResult> {
    // TODO: Implement ONVIF GetStorageConfiguration
    // Note: ONVIF provides basic storage info but not detailed disk health
    return this.createUnknownResult(
      'ONVIF storage status not yet implemented',
      'UNSUPPORTED_FEATURE'
    );
  }
  
  async getDeviceTime(): Promise<CheckResult<Date>> {
    // TODO: Implement ONVIF GetSystemDateAndTime
    return this.createUnknownResult<Date>(
      'ONVIF time query not yet implemented',
      'UNSUPPORTED_FEATURE'
    );
  }
  
  /**
   * ONVIF SOAP request builders
   */
  
  private buildGetSystemDateAndTimeRequest(): string {
    // TODO: Build ONVIF SOAP envelope for GetSystemDateAndTime
    return '';
  }
  
  private buildGetDeviceInformationRequest(): string {
    // TODO: Build ONVIF SOAP envelope for GetDeviceInformation
    return '';
  }
  
  private buildOnvifAuthHeaders() {
    // TODO: Build WS-Security username token header
    return {};
  }
}
