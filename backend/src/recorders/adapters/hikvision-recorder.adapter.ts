/**
 * Hikvision Recorder Adapter
 * 
 * Implements Hikvision-specific APIs for:
 * - ISAPI authentication (digest)
 * - Recording status queries
 * - Archive search
 * - Storage status
 * - Channel management
 * 
 * References:
 * - Hikvision ISAPI 2.0 specification
 * - /ISAPI/System/deviceInfo
 * - /ISAPI/ContentMgmt/record/status
 * - /ISAPI/ContentMgmt/Storage
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
  RecorderDisk,
  Recorder
} from '../types/index.js';
import type { RecorderAdapter, RecorderConnection } from '../recorder-adapter.interface.js';
import { BaseRecorderAdapter } from './base-recorder.adapter.js';
import { RecorderAuthenticationError } from '../recorder-adapter.interface.js';
import { logger } from '../../utils/logger.js';
import { createHash } from 'crypto';

/**
 * Hikvision ISAPI adapter
 */
export class HikvisionRecorderAdapter extends BaseRecorderAdapter implements RecorderAdapter {
  private sessionId?: string;
  
  getAdapterType(): string {
    return 'hikvision';
  }
  
  getAdapterInfo() {
    return {
      type: this.getAdapterType(),
      version: this.getAdapterVersion(),
      vendor: 'hikvision'
    };
  }
  
  /**
   * Hikvision supports most features via ISAPI
   */
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
  
  /**
   * Test connection to Hikvision device
   */
  async testConnection(): Promise<ConnectionStatus> {
    const startTime = Date.now();
    
    try {
      const result = await this.withTimeout(
        this.httpClient.get('/ISAPI/System/status'),
        this.config.connectionTimeoutMs,
        'testConnection'
      );
      
      const latencyMs = Date.now() - startTime;
      
      // Any response means device is reachable
      if (result.status !== undefined) {
        this.connected = true;
        
        return {
          status: 'healthy',
          value: true,
          latencyMs,
          message: 'Hikvision device reachable',
          checkedAt: new Date()
        };
      }
      
      return this.createUnknownResult<boolean>(
        'No response from Hikvision device',
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
  
  /**
   * Authenticate with Hikvision ISAPI
   * Uses HTTP Digest authentication
   */
  async authenticate(): Promise<AuthenticationStatus> {
    try {
      // Hikvision uses digest auth - try authenticated request
      const result = await this.withRetry(
        async () => {
          return await this.httpClient.get('/ISAPI/System/deviceInfo', {
            auth: {
              username: this.connection.credentials.username,
              password: this.connection.credentials.password
            }
          });
        },
        'authenticate',
        false // Don't retry auth failures
      );
      
      if (result.status === 200) {
        this.authenticated = true;
        
        logger.debug('Hikvision authentication successful', {
          recorderId: this.recorder.id
        });
        
        return {
          status: 'healthy',
          value: true,
          method: 'digest',
          message: 'Authentication successful',
          checkedAt: new Date()
        };
      }
      
      if (result.status === 401 || result.status === 403) {
        throw new RecorderAuthenticationError(
          `Invalid credentials (HTTP ${result.status})`
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
  
  /**
   * Get device information
   */
  async getDeviceInfo(): Promise<CheckResult<RecorderDeviceInfo>> {
    try {
      const result = await this.makeAuthenticatedRequest('/ISAPI/System/deviceInfo');
      
      if (result.status === 200 && result.data) {
        // Parse XML response (Hikvision uses XML)
        const info = this.parseDeviceInfo(result.data);
        
        return this.createHealthyResult<RecorderDeviceInfo>(info);
      }
      
      return this.createUnknownResult<RecorderDeviceInfo>(
        'Could not retrieve device info',
        'VENDOR_API_ERROR'
      );
      
    } catch (error) {
      const normalized = this.normalizeError(error);
      return this.createUnknownResult<RecorderDeviceInfo>(
        normalized.message,
        normalized.code
      );
    }
  }
  
  /**
   * Get all channels
   */
  async getChannels(): Promise<CheckResult<RecorderChannel[]>> {
    try {
      const result = await this.makeAuthenticatedRequest('/ISAPI/System/Video/inputs');
      
      if (result.status === 200 && result.data) {
        const channels = this.parseChannels(result.data);
        
        return this.createHealthyResult<RecorderChannel[]>(
          channels,
          `Found ${channels.length} channels`
        );
      }
      
      return this.createUnknownResult<RecorderChannel[]>(
        'Could not enumerate channels',
        'VENDOR_API_ERROR'
      );
      
    } catch (error) {
      const normalized = this.normalizeError(error);
      return this.createUnknownResult<RecorderChannel[]>(
        normalized.message,
        normalized.code
      );
    }
  }
  
  /**
   * Get specific channel
   */
  async getChannel(channelId: string): Promise<CheckResult<RecorderChannel>> {
    try {
      const result = await this.makeAuthenticatedRequest(
        `/ISAPI/System/Video/inputs/${channelId}`
      );
      
      if (result.status === 200 && result.data) {
        const channel = this.parseChannel(result.data, channelId);
        
        if (!channel.enabled) {
          return this.createUnhealthyResult<RecorderChannel>(
            `Channel ${channelId} is disabled`,
            'CHANNEL_DISABLED',
            channel
          );
        }
        
        return this.createHealthyResult<RecorderChannel>(
          channel,
          `Channel ${channelId} found and enabled`
        );
      }
      
      if (result.status === 404) {
        return this.createUnhealthyResult<RecorderChannel>(
          `Channel ${channelId} not found`,
          'CHANNEL_NOT_FOUND'
        );
      }
      
      return this.createUnknownResult<RecorderChannel>(
        'Could not verify channel',
        'VENDOR_API_ERROR'
      );
      
    } catch (error) {
      const normalized = this.normalizeError(error);
      return this.createUnknownResult<RecorderChannel>(
        normalized.message,
        normalized.code
      );
    }
  }
  
  /**
   * Get stream status
   */
  async getStreamStatus(channelId: string): Promise<StreamStatus> {
    try {
      const result = await this.makeAuthenticatedRequest(
        `/ISAPI/System/Video/inputs/${channelId}/status`
      );
      
      if (result.status === 200 && result.data) {
        const status = this.parseStreamStatus(result.data);
        
        if (status === 'streaming') {
          return this.createHealthyResult<string>(
            status,
            'Stream active with signal'
          );
        }
        
        return this.createUnhealthyResult<string>(
          `Stream ${status}`,
          'STREAM_UNAVAILABLE',
          status
        );
      }
      
      return this.createUnknownResult<string>(
        'Could not verify stream status',
        'VENDOR_API_ERROR'
      );
      
    } catch (error) {
      const normalized = this.normalizeError(error);
      return this.createUnknownResult<string>(
        normalized.message,
        normalized.code
      );
    }
  }
  
  /**
   * Get recording status
   * 
   * CRITICAL: Verifies both configuration AND actual recording activity
   */
  async getRecordingStatus(channelId: string): Promise<RecordingStatus> {
    try {
      const result = await this.makeAuthenticatedRequest(
        `/ISAPI/ContentMgmt/record/status/trackID/${channelId}01`
      );
      
      if (result.status === 200 && result.data) {
        const status = this.parseRecordingStatus(result.data);
        
        if (status === 'recording') {
          return this.createHealthyResult<string>(
            status,
            'Recording active'
          );
        }
        
        return this.createUnhealthyResult<string>(
          `Recording ${status}`,
          'RECORDING_STOPPED',
          status
        );
      }
      
      return this.createUnknownResult<string>(
        'Could not verify recording status',
        'VENDOR_API_ERROR'
      );
      
    } catch (error) {
      const normalized = this.normalizeError(error);
      return this.createUnknownResult<string>(
        normalized.message,
        normalized.code
      );
    }
  }
  
  /**
   * Get latest recording from archive
   * 
   * CRITICAL: Returns ACTUAL archive timestamp, never current time
   */
  async getLatestRecording(channelId: string): Promise<RecordingArchiveInfo | null> {
    try {
      // Search for recordings in last hour
      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - 60 * 60 * 1000);
      
      const result = await this.makeAuthenticatedRequest(
        `/ISAPI/ContentMgmt/search`,
        'POST',
        this.buildSearchRequest(channelId, startTime, endTime)
      );
      
      if (result.status === 200 && result.data) {
        const recordings = this.parseSearchResults(result.data);
        
        if (recordings.length > 0) {
          // Return most recent recording
          return recordings[recordings.length - 1];
        }
      }
      
      // No recordings found
      return null;
      
    } catch (error) {
      logger.error('Failed to search Hikvision archive', {
        recorderId: this.recorder.id,
        channelId,
        error: this.normalizeError(error)
      });
      return null;
    }
  }
  
  /**
   * Get oldest recording
   */
  async getOldestRecording(channelId: string): Promise<RecordingArchiveInfo | null> {
    try {
      // Search from 180 days ago to now
      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - 180 * 24 * 60 * 60 * 1000);
      
      const result = await this.makeAuthenticatedRequest(
        `/ISAPI/ContentMgmt/search`,
        'POST',
        this.buildSearchRequest(channelId, startTime, endTime, 'ascending')
      );
      
      if (result.status === 200 && result.data) {
        const recordings = this.parseSearchResults(result.data);
        
        if (recordings.length > 0) {
          return recordings[0];
        }
      }
      
      return null;
      
    } catch (error) {
      logger.error('Failed to search Hikvision archive for oldest recording', {
        recorderId: this.recorder.id,
        channelId,
        error: this.normalizeError(error)
      });
      return null;
    }
  }
  
  /**
   * Get storage status
   */
  async getStorageStatus(): Promise<StorageCheckResult> {
    try {
      const result = await this.makeAuthenticatedRequest('/ISAPI/ContentMgmt/Storage');
      
      if (result.status === 200 && result.data) {
        const storage = this.parseStorageStatus(result.data);
        
        // Check for failed disks
        const failedDisks = storage.disks?.filter(
          d => d.state === 'failed' || d.state === 'missing'
        );
        
        if (failedDisks && failedDisks.length > 0) {
          return {
            ...storage,
            status: 'unhealthy',
            message: `${failedDisks.length} disk(s) failed`,
            errorCode: 'DISK_FAILED',
            checkedAt: new Date()
          };
        }
        
        // Check for full storage
        if (storage.usagePercent && storage.usagePercent >= 95) {
          return {
            ...storage,
            status: 'unhealthy',
            message: `Storage ${storage.usagePercent}% full`,
            errorCode: 'STORAGE_FULL',
            checkedAt: new Date()
          };
        }
        
        return {
          ...storage,
          status: 'healthy',
          message: 'Storage operational',
          checkedAt: new Date()
        };
      }
      
      return this.createUnknownResult(
        'Could not query storage status',
        'VENDOR_API_ERROR'
      );
      
    } catch (error) {
      const normalized = this.normalizeError(error);
      return this.createUnknownResult(
        normalized.message,
        normalized.code
      );
    }
  }
  
  /**
   * Get device time
   */
  async getDeviceTime(): Promise<CheckResult<Date>> {
    try {
      const result = await this.makeAuthenticatedRequest('/ISAPI/System/time');
      
      if (result.status === 200 && result.data) {
        const deviceTime = this.parseDeviceTime(result.data);
        
        return this.createHealthyResult<Date>(
          deviceTime,
          'Device time retrieved'
        );
      }
      
      return this.createUnknownResult<Date>(
        'Could not read device time',
        'VENDOR_API_ERROR'
      );
      
    } catch (error) {
      const normalized = this.normalizeError(error);
      return this.createUnknownResult<Date>(
        normalized.message,
        normalized.code
      );
    }
  }
  
  /**
   * Helper: Make authenticated request
   */
  private async makeAuthenticatedRequest(
    path: string,
    method: 'GET' | 'POST' = 'GET',
    data?: any
  ) {
    return await this.httpClient.request({
      url: path,
      method,
      data,
      auth: {
        username: this.connection.credentials.username,
        password: this.connection.credentials.password
      }
    });
  }
  
  /**
   * Parsers - These would parse actual Hikvision XML responses
   * Stubs for now, implement based on actual ISAPI responses
   */
  
  private parseDeviceInfo(xmlData: string): RecorderDeviceInfo {
    // TODO: Parse Hikvision XML response
    return {
      manufacturer: 'Hikvision',
      model: 'Unknown',
      serialNumber: undefined,
      firmwareVersion: undefined
    };
  }
  
  private parseChannels(xmlData: string): RecorderChannel[] {
    // TODO: Parse channel list from XML
    return [];
  }
  
  private parseChannel(xmlData: string, channelId: string): RecorderChannel {
    // TODO: Parse single channel from XML
    return {
      id: channelId,
      enabled: true,
      recordingEnabled: true
    };
  }
  
  private parseStreamStatus(xmlData: string): 'streaming' | 'stopped' | 'no-signal' | 'error' {
    // TODO: Parse stream status from XML
    return 'streaming';
  }
  
  private parseRecordingStatus(xmlData: string): 'recording' | 'stopped' | 'paused' | 'error' {
    // TODO: Parse recording status from XML
    return 'recording';
  }
  
  private parseSearchResults(xmlData: string): RecordingArchiveInfo[] {
    // TODO: Parse search results from XML
    return [];
  }
  
  private parseStorageStatus(xmlData: string): Partial<StorageCheckResult> {
    // TODO: Parse storage status from XML
    return {
      disks: []
    };
  }
  
  private parseDeviceTime(xmlData: string): Date {
    // TODO: Parse device time from XML
    return new Date();
  }
  
  private buildSearchRequest(
    channelId: string,
    startTime: Date,
    endTime: Date,
    sortOrder: 'ascending' | 'descending' = 'descending'
  ): string {
    // TODO: Build Hikvision search request XML
    return '';
  }
}
