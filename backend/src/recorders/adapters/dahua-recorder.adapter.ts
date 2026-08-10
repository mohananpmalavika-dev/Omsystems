/**
 * Dahua Recorder Adapter
 * 
 * Implements Dahua-specific HTTP APIs for DVR/NVR management.
 * Similar structure to Hikvision but uses Dahua's proprietary API format.
 * 
 * Dahua typically uses:
 * - /cgi-bin/global.cgi for system info
 * - /cgi-bin/recordManager.cgi for recording management
 * - /cgi-bin/storageManager.cgi for storage status
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
import { RecorderAuthenticationError } from '../recorder-adapter.interface.js';
import { logger } from '../../utils/logger.js';

export class DahuaRecorderAdapter extends BaseRecorderAdapter implements RecorderAdapter {
  
  getAdapterType(): string {
    return 'dahua';
  }
  
  getAdapterInfo() {
    return {
      type: this.getAdapterType(),
      version: this.getAdapterVersion(),
      vendor: 'dahua'
    };
  }
  
  getCapabilities(): RecorderCapabilities {
    return {
      liveStreamStatus: true,
      recordingStatus: true,
      archiveSearch: true,
      storageStatus: true,
      diskHealth: true,
      deviceTime: true,
      retentionQuery: true,
      channelEnumeration: true
    };
  }
  
  async testConnection(): Promise<ConnectionStatus> {
    const startTime = Date.now();
    
    try {
      const result = await this.withTimeout(
        this.httpClient.get('/cgi-bin/magicBox.cgi?action=getSystemInfo'),
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
          message: 'Dahua device reachable',
          checkedAt: new Date()
        };
      }
      
      return this.createUnknownResult<boolean>(
        'No response from Dahua device',
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
      // Dahua uses digest auth similar to Hikvision
      const result = await this.httpClient.get('/cgi-bin/global.cgi?action=getCurrentTime', {
        auth: {
          username: this.connection.credentials.username,
          password: this.connection.credentials.password
        }
      });
      
      if (result.status === 200) {
        this.authenticated = true;
        
        return {
          status: 'healthy',
          value: true,
          method: 'digest',
          message: 'Authentication successful',
          checkedAt: new Date()
        };
      }
      
      if (result.status === 401) {
        throw new RecorderAuthenticationError('Invalid credentials');
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
    // TODO: Implement Dahua device info parsing
    return this.createUnknownResult<RecorderDeviceInfo>(
      'Dahua device info parsing not yet implemented',
      'UNSUPPORTED_FEATURE'
    );
  }
  
  async getChannels(): Promise<CheckResult<RecorderChannel[]>> {
    // TODO: Implement Dahua channel enumeration
    return this.createUnknownResult<RecorderChannel[]>(
      'Dahua channel enumeration not yet implemented',
      'UNSUPPORTED_FEATURE'
    );
  }
  
  async getChannel(channelId: string): Promise<CheckResult<RecorderChannel>> {
    // TODO: Implement Dahua single channel query
    return this.createUnknownResult<RecorderChannel>(
      'Dahua channel query not yet implemented',
      'UNSUPPORTED_FEATURE'
    );
  }
  
  async getStreamStatus(channelId: string): Promise<StreamStatus> {
    // TODO: Implement Dahua stream status
    return this.createUnknownResult<string>(
      'Dahua stream status not yet implemented',
      'UNSUPPORTED_FEATURE'
    );
  }
  
  async getRecordingStatus(channelId: string): Promise<RecordingStatus> {
    // TODO: Implement Dahua recording status
    return this.createUnknownResult<string>(
      'Dahua recording status not yet implemented',
      'UNSUPPORTED_FEATURE'
    );
  }
  
  async getLatestRecording(channelId: string): Promise<RecordingArchiveInfo | null> {
    // TODO: Implement Dahua archive search
    return null;
  }
  
  async getOldestRecording(channelId: string): Promise<RecordingArchiveInfo | null> {
    // TODO: Implement Dahua archive search
    return null;
  }
  
  async getStorageStatus(): Promise<StorageCheckResult> {
    // TODO: Implement Dahua storage query
    return this.createUnknownResult(
      'Dahua storage status not yet implemented',
      'UNSUPPORTED_FEATURE'
    );
  }
  
  async getDeviceTime(): Promise<CheckResult<Date>> {
    // TODO: Implement Dahua time query
    return this.createUnknownResult<Date>(
      'Dahua time query not yet implemented',
      'UNSUPPORTED_FEATURE'
    );
  }
}
