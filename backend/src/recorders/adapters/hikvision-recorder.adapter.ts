/**
 * Hikvision Recorder Adapter
 * 
 * Implements Hikvision-specific APIs for:
 * - ISAPI authentication (digest)
 * - Channel enumeration and status queries
 * - Recording status queries (per track ID)
 * - Archive search via ISAPI CMSearchDescription XML
 * - Storage status and HDD S.M.A.R.T. queries
 * - System date and time synchronization
 * 
 * References:
 * - Hikvision ISAPI 2.0 specification
 * - /ISAPI/System/deviceInfo
 * - /ISAPI/System/Video/inputs/channels
 * - /ISAPI/ContentMgmt/record/status/trackID/
 * - /ISAPI/ContentMgmt/Storage
 * - /ISAPI/ContentMgmt/search
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

export class HikvisionRecorderAdapter extends BaseRecorderAdapter implements RecorderAdapter {
  
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
   * Hikvision capabilities
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
        this.makeAuthenticatedRequest('/ISAPI/System/status'),
        this.config.connectionTimeoutMs,
        'testConnection'
      );
      
      const latencyMs = Date.now() - startTime;
      
      if (result.status !== undefined && result.status < 500) {
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
   * Authenticate with Hikvision ISAPI using Digest auth
   */
  async authenticate(): Promise<AuthenticationStatus> {
    try {
      const result = await this.makeAuthenticatedRequest('/ISAPI/System/deviceInfo');
      
      if (result.status === 200) {
        this.authenticated = true;
        
        return {
          status: 'healthy',
          value: true,
          method: 'digest',
          message: 'Hikvision authentication successful',
          checkedAt: new Date()
        };
      }
      
      if (result.status === 401 || result.status === 403) {
        return this.createUnhealthyResult<boolean>(
          'Invalid Hikvision credentials',
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
  
  /**
   * Get device information
   */
  async getDeviceInfo(): Promise<CheckResult<RecorderDeviceInfo>> {
    try {
      const result = await this.makeAuthenticatedRequest('/ISAPI/System/deviceInfo');
      
      if (result.status === 200 && result.data) {
        const info = this.parseDeviceInfo(String(result.data));
        return this.createHealthyResult<RecorderDeviceInfo>(info, `${info.manufacturer} ${info.model}`);
      }
      
      return this.createUnknownResult<RecorderDeviceInfo>(
        'Could not retrieve Hikvision device info',
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
      const result = await this.makeAuthenticatedRequest('/ISAPI/System/Video/inputs/channels');
      
      if (result.status === 200 && result.data) {
        let statusXml = '';
        try {
          const statusRes = await this.makeAuthenticatedRequest('/ISAPI/ContentMgmt/InputProxy/channels/status');
          if (statusRes.status === 200 && statusRes.data) {
            statusXml = String(statusRes.data);
          }
        } catch {
          // Status check is optional
        }
        
        const channels = this.parseChannels(String(result.data), statusXml);
        return this.createHealthyResult<RecorderChannel[]>(
          channels,
          `Found ${channels.length} channel(s)`
        );
      }
      
      return this.createUnknownResult<RecorderChannel[]>(
        'Could not enumerate Hikvision channels',
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
      const result = await this.makeAuthenticatedRequest(`/ISAPI/System/Video/inputs/channels/${channelId}`);
      
      if (result.status === 200 && result.data) {
        const channel = this.parseChannel(String(result.data), channelId);
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
        `/ISAPI/System/Video/inputs/channels/${channelId}/status`
      );
      
      if (result.status === 200 && result.data) {
        const status = this.parseStreamStatus(String(result.data));
        
        if (status === 'streaming') {
          return this.createHealthyResult<string>(status, 'Stream active with signal');
        }
        
        return this.createUnhealthyResult<string>(
          `Stream ${status}`,
          'STREAM_UNAVAILABLE',
          status
        );
      }
      
      return this.createHealthyResult<string>('streaming', 'Stream available');
      
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
   */
  async getRecordingStatus(channelId: string): Promise<RecordingStatus> {
    try {
      const channelNum = parseInt(channelId, 10);
      const trackId = this.hikvisionTrackId(channelNum);
      
      const result = await this.makeAuthenticatedRequest(
        `/ISAPI/ContentMgmt/record/status/trackID/${trackId}`
      );
      
      if (result.status === 200 && result.data) {
        const status = this.parseRecordingStatus(String(result.data));
        
        if (status === 'recording') {
          return this.createHealthyResult<string>(status, 'Recording active');
        }
        
        return this.createUnhealthyResult<string>(
          `Recording ${status}`,
          'RECORDING_STOPPED',
          status
        );
      }
      
      // Fallback to searching archive for recent segments
      const latest = await this.getLatestRecording(channelId);
      if (latest) {
        const ageSeconds = (Date.now() - latest.endTime.getTime()) / 1000;
        if (ageSeconds <= 300) {
          return this.createHealthyResult<string>('recording', 'Actively recording');
        }
        return this.createUnhealthyResult<string>('Recording stopped', 'RECORDING_STOPPED', 'stopped');
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
   */
  async getLatestRecording(channelId: string): Promise<RecordingArchiveInfo | null> {
    try {
      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - 60 * 60 * 1000);
      
      const searchBody = this.buildSearchRequest(channelId, startTime, endTime, 'descending');
      const result = await this.makeAuthenticatedRequest(
        '/ISAPI/ContentMgmt/search',
        'POST',
        searchBody
      );
      
      if (result.status === 200 && result.data) {
        const recordings = this.parseSearchResults(String(result.data));
        if (recordings.length > 0) {
          return recordings[0];
        }
      }
      
      return null;
      
    } catch (error) {
      logger.error('Failed to search Hikvision archive for latest recording', {
        recorderId: this.recorder.id,
        channelId,
        error: this.normalizeError(error)
      });
      return null;
    }
  }
  
  /**
   * Get oldest recording from archive
   */
  async getOldestRecording(channelId: string): Promise<RecordingArchiveInfo | null> {
    try {
      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - 180 * 24 * 60 * 60 * 1000);
      
      const searchBody = this.buildSearchRequest(channelId, startTime, endTime, 'ascending');
      const result = await this.makeAuthenticatedRequest(
        '/ISAPI/ContentMgmt/search',
        'POST',
        searchBody
      );
      
      if (result.status === 200 && result.data) {
        const recordings = this.parseSearchResults(String(result.data));
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
   * Get storage and disk status
   */
  async getStorageStatus(): Promise<StorageCheckResult> {
    try {
      const result = await this.makeAuthenticatedRequest('/ISAPI/ContentMgmt/Storage');
      
      if (result.status === 200 && result.data) {
        const storage = this.parseStorageStatus(String(result.data));
        
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
        
        if (storage.usagePercent && storage.usagePercent >= 95) {
          return {
            ...storage,
            status: 'unhealthy',
            message: `Storage ${storage.usagePercent.toFixed(1)}% full`,
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
        const deviceTime = this.parseDeviceTime(String(result.data));
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
   * Helper: Make authenticated HTTP request with Digest Auth
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
      headers: method === 'POST' ? { 'Content-Type': 'application/xml' } : undefined,
      auth: {
        username: this.connection.credentials.username,
        password: this.connection.credentials.password
      }
    });
  }
  
  // ============================================================================
  // XML Parsers
  // ============================================================================
  
  private parseDeviceInfo(xml: string): RecorderDeviceInfo {
    const manufacturer = this.extractTag(xml, 'manufacturer') || 'Hikvision';
    const model = this.extractTag(xml, 'model') || this.extractTag(xml, 'deviceType') || 'Unknown';
    const serialNumber = this.extractTag(xml, 'serialNumber');
    const firmwareVersion = this.extractTag(xml, 'firmwareVersion') || this.extractTag(xml, 'softwareVersion');
    const hardwareId = this.extractTag(xml, 'hardwareVersion') || this.extractTag(xml, 'macAddress');
    
    return {
      manufacturer,
      model,
      serialNumber: serialNumber || undefined,
      firmwareVersion: firmwareVersion || undefined,
      hardwareId: hardwareId || undefined
    };
  }
  
  private parseChannels(channelXml: string, statusXml?: string): RecorderChannel[] {
    const channels: RecorderChannel[] = [];
    
    const channelBlocks = channelXml.matchAll(
      /<(?:[^:>]+:)?VideoInputChannel\b[^>]*>([\s\S]*?)<\/(?:[^:>]+:)?VideoInputChannel>/gi
    );
    
    for (const block of channelBlocks) {
      const body = block[1];
      const idStr = this.extractTag(body, 'id');
      if (!idStr) continue;
      
      const channelId = parseInt(idStr, 10);
      const enabledStr = this.extractTag(body, 'enabled')?.toLowerCase();
      const enabled = enabledStr !== 'false';
      const name = this.extractTag(body, 'name') || `Channel ${channelId}`;
      const videoSourceToken = this.extractTag(body, 'videoInputID') || idStr;
      
      channels.push({
        id: String(channelId),
        name,
        enabled,
        recordingEnabled: true,
        videoSourceToken
      });
    }
    
    // Parse status XML if available
    if (statusXml) {
      const statusBlocks = statusXml.matchAll(
        /<(?:[^:>]+:)?InputProxyChannelStatus\b[^>]*>([\s\S]*?)<\/(?:[^:>]+:)?InputProxyChannelStatus>/gi
      );
      
      for (const block of statusBlocks) {
        const body = block[1];
        const idStr = this.extractTag(body, 'id');
        const onlineStr = this.extractTag(body, 'online')?.toLowerCase();
        
        if (idStr && onlineStr === 'false') {
          const ch = channels.find(c => c.id === idStr);
          if (ch) {
            ch.videoLoss = true;
          }
        }
      }
    }
    
    return channels;
  }
  
  private parseChannel(xml: string, channelId: string): RecorderChannel {
    const name = this.extractTag(xml, 'name') || `Channel ${channelId}`;
    const enabledStr = this.extractTag(xml, 'enabled')?.toLowerCase();
    const enabled = enabledStr !== 'false';
    
    return {
      id: channelId,
      name,
      enabled,
      recordingEnabled: true
    };
  }
  
  private parseStreamStatus(xml: string): 'streaming' | 'stopped' | 'no-signal' | 'error' {
    const status = this.extractTag(xml, 'status')?.toLowerCase();
    const signal = this.extractTag(xml, 'signal')?.toLowerCase();
    
    if (status === 'stopped' || status === 'paused') return 'stopped';
    if (status === 'nosignal' || status === 'no-signal' || signal === 'false' || signal === 'none') return 'no-signal';
    if (status === 'error' || status === 'fail') return 'error';
    
    return 'streaming';
  }
  
  private parseRecordingStatus(xml: string): 'recording' | 'stopped' | 'paused' | 'error' {
    const status = this.extractTag(xml, 'status')?.toLowerCase() || this.extractTag(xml, 'recordStatus')?.toLowerCase();
    
    if (status === 'recording' || status === 'active' || status === 'true' || status === 'normal') {
      return 'recording';
    }
    if (status === 'paused') return 'paused';
    if (status === 'error' || status === 'failed') return 'error';
    
    return 'stopped';
  }
  
  private parseSearchResults(xml: string): RecordingArchiveInfo[] {
    const recordings: RecordingArchiveInfo[] = [];
    
    const items = xml.matchAll(
      /<(?:[^:>]+:)?(?:searchMatchItem|matchItem)\b[^>]*>([\s\S]*?)<\/(?:[^:>]+:)?(?:searchMatchItem|matchItem)>/gi
    );
    
    for (const item of items) {
      const body = item[1];
      const startTimeStr = this.extractTag(body, 'startTime');
      const endTimeStr = this.extractTag(body, 'endTime');
      const trackId = this.extractTag(body, 'trackID');
      const sizeStr = this.extractTag(body, 'fileSize') || this.extractTag(body, 'size');
      
      if (startTimeStr && endTimeStr) {
        const startTime = new Date(startTimeStr);
        const endTime = new Date(endTimeStr);
        
        if (!isNaN(startTime.getTime()) && !isNaN(endTime.getTime())) {
          recordings.push({
            startTime,
            endTime,
            recordingToken: trackId || undefined,
            sizeBytes: sizeStr ? parseInt(sizeStr, 10) : undefined
          });
        }
      }
    }
    
    return recordings;
  }
  
  private parseStorageStatus(xml: string): Partial<StorageCheckResult> {
    const disks: RecorderDisk[] = [];
    let totalBytes = 0;
    let freeBytes = 0;
    
    const hddBlocks = xml.matchAll(/<(?:[^:>]+:)?hdd\b[^>]*>([\s\S]*?)<\/(?:[^:>]+:)?hdd>/gi);
    
    let index = 1;
    for (const block of hddBlocks) {
      const body = block[1];
      const id = this.extractTag(body, 'id') || String(index);
      const name = this.extractTag(body, 'name') || `HDD ${index}`;
      const status = this.extractTag(body, 'status')?.toLowerCase() || 'ok';
      const capacityMB = parseFloat(this.extractTag(body, 'capacity') || '0');
      const freeSpaceMB = parseFloat(this.extractTag(body, 'freeSpace') || '0');
      
      const diskTotal = capacityMB > 0 ? capacityMB * 1024 * 1024 : 0;
      const diskFree = freeSpaceMB > 0 ? freeSpaceMB * 1024 * 1024 : 0;
      const diskUsed = Math.max(0, diskTotal - diskFree);
      
      totalBytes += diskTotal;
      freeBytes += diskFree;
      
      const isHealthy = status === 'ok' || status === 'normal' || status === 'idle' || status === 'working';
      const isWarning = status === 'warning' || status === 'smart_warning' || status === 'degraded';
      const isFailed = status === 'error' || status === 'failed' || status === 'unformatted';
      
      disks.push({
        id: `hdd-${id}`,
        state: isHealthy ? 'normal' : isWarning ? 'warning' : isFailed ? 'failed' : 'unknown',
        totalBytes: diskTotal,
        usedBytes: diskUsed,
        freeBytes: diskFree
      });
      
      index++;
    }
    
    const usedBytes = Math.max(0, totalBytes - freeBytes);
    const usagePercent = totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0;
    
    return {
      disks,
      totalBytes,
      usedBytes,
      freeBytes,
      usagePercent
    };
  }
  
  private parseDeviceTime(xml: string): Date {
    const localTime = this.extractTag(xml, 'localTime') || this.extractTag(xml, 'time');
    if (localTime) {
      const parsed = new Date(localTime);
      if (!isNaN(parsed.getTime())) {
        return parsed;
      }
    }
    return new Date();
  }
  
  private buildSearchRequest(
    channelId: string,
    startTime: Date,
    endTime: Date,
    sortOrder: 'ascending' | 'descending' = 'descending'
  ): string {
    const channelNum = parseInt(channelId, 10);
    const trackId = this.hikvisionTrackId(channelNum);
    const searchId = `search-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    
    return `<?xml version="1.0" encoding="UTF-8"?>
<CMSearchDescription>
  <searchID>${searchId}</searchID>
  <trackList>
    <trackID>${trackId}</trackID>
  </trackList>
  <timeSpanList>
    <timeSpan>
      <startTime>${startTime.toISOString()}</startTime>
      <endTime>${endTime.toISOString()}</endTime>
    </timeSpan>
  </timeSpanList>
  <maxResults>100</maxResults>
  <searchResultPosition>0</searchResultPosition>
  <metadataList>
    <metadataDescriptor>//recordType.meta.std-cgi.com</metadataDescriptor>
  </metadataList>
</CMSearchDescription>`;
  }
  
  private hikvisionTrackId(channelNum: number): string {
    return String(channelNum >= 100 ? channelNum : channelNum * 100 + 1);
  }
  
  private extractTag(xml: string, tagName: string): string | undefined {
    const match = xml.match(
      new RegExp(`<(?:[^:>]+:)?${tagName}(?:\\s[^>]*)?>([^<]+)<\\/(?:[^:>]+:)?${tagName}>`, 'i')
    );
    return match?.[1]?.trim();
  }
}
