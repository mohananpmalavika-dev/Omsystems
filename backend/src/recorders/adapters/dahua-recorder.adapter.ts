/**
 * Dahua Recorder Adapter
 * 
 * Implements Dahua-specific HTTP/CGI APIs for DVR/NVR management.
 * Also supports CP PLUS (OEM) recorders.
 * 
 * API Endpoints:
 * - /cgi-bin/magicBox.cgi?action=getSystemInfo
 * - /cgi-bin/configManager.cgi?action=getConfig&name=ChannelTitle
 * - /cgi-bin/eventManager.cgi?action=getEventIndexes&code=VideoLoss
 * - /cgi-bin/mediaFileFind.cgi (multi-step archive search)
 * - /cgi-bin/storageDevice.cgi?action=getDeviceAllInfo
 * - /cgi-bin/global.cgi?action=getCurrentTime
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
  
  /**
   * Test connectivity to Dahua device
   */
  async testConnection(): Promise<ConnectionStatus> {
    const startTime = Date.now();
    
    try {
      const result = await this.withTimeout(
        this.makeCgiRequest('/cgi-bin/magicBox.cgi', { action: 'getSystemInfo' }),
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
          message: 'Dahua device reachable',
          checkedAt: new Date()
        };
      }
      
      return this.createUnknownResult<boolean>(
        'No valid response from Dahua device',
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
   * Authenticate with Dahua using Digest authentication
   */
  async authenticate(): Promise<AuthenticationStatus> {
    try {
      const result = await this.makeCgiRequest('/cgi-bin/global.cgi', { action: 'getCurrentTime' });
      
      if (result.status === 200) {
        this.authenticated = true;
        
        return {
          status: 'healthy',
          value: true,
          method: 'digest',
          message: 'Dahua authentication successful',
          checkedAt: new Date()
        };
      }
      
      if (result.status === 401 || result.status === 403) {
        return this.createUnhealthyResult<boolean>(
          'Invalid Dahua credentials',
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
      const result = await this.makeCgiRequest('/cgi-bin/magicBox.cgi', { action: 'getSystemInfo' });
      
      if (result.status === 200 && result.data) {
        const text = String(result.data);
        
        const model = this.extractKeyValue(text, ['model', 'modelName', 'productName', 'deviceType']);
        const serialNumber = this.extractKeyValue(text, ['serialNumber', 'sn']);
        const firmwareVersion = this.extractKeyValue(text, ['softwareVersion', 'firmwareVersion', 'version']);
        const manufacturer = this.extractKeyValue(text, ['vendor', 'manufacturer']) || 'Dahua';
        const hardwareId = this.extractKeyValue(text, ['hardwareVersion', 'hardwareId']);
        
        const isCpPlus = manufacturer.toLowerCase().includes('cp') || (model && model.toLowerCase().includes('cp'));
        
        const info: RecorderDeviceInfo = {
          manufacturer: isCpPlus ? 'CP PLUS' : manufacturer,
          model: model || 'Unknown',
          serialNumber: serialNumber || undefined,
          firmwareVersion: firmwareVersion || undefined,
          hardwareId: hardwareId || undefined
        };
        
        return this.createHealthyResult<RecorderDeviceInfo>(
          info,
          `${info.manufacturer} ${info.model}`
        );
      }
      
      return this.createUnknownResult<RecorderDeviceInfo>(
        'Could not retrieve Dahua device info',
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
   * Enumerate all channels
   */
  async getChannels(): Promise<CheckResult<RecorderChannel[]>> {
    try {
      const titleResult = await this.makeCgiRequest('/cgi-bin/configManager.cgi', {
        action: 'getConfig',
        name: 'ChannelTitle'
      });
      
      if (titleResult.status !== 200 || !titleResult.data) {
        return this.createUnknownResult<RecorderChannel[]>(
          'Failed to query channel configurations',
          'VENDOR_API_ERROR'
        );
      }
      
      const titleText = String(titleResult.data);
      
      // Parse ChannelTitle[0], ChannelTitle[1], etc.
      const matches = [...titleText.matchAll(/ChannelTitle\[(\d+)\](?:\.Name)?=([^\r\n]*)/g)];
      const channelMap = new Map<number, string>();
      
      for (const m of matches) {
        const chIndex = parseInt(m[1], 10);
        const name = m[2]?.trim() || `Channel ${chIndex + 1}`;
        if (!channelMap.has(chIndex) || m[0].includes('.Name')) {
          channelMap.set(chIndex, name);
        }
      }
      
      // If none found by regex, fallback to finding channel indices
      if (channelMap.size === 0) {
        const idMatches = [...titleText.matchAll(/ChannelTitle\[(\d+)\]/g)];
        for (const m of idMatches) {
          const chIndex = parseInt(m[1], 10);
          channelMap.set(chIndex, `Channel ${chIndex + 1}`);
        }
      }
      
      // Check video loss status
      const videoLossChannels = new Set<number>();
      try {
        const videoLossResult = await this.makeCgiRequest('/cgi-bin/eventManager.cgi', {
          action: 'getEventIndexes',
          code: 'VideoLoss'
        });
        
        if (videoLossResult.status === 200 && videoLossResult.data) {
          const lossMatches = [...String(videoLossResult.data).matchAll(/indexes\[\d+\]=(\d+)/g)];
          for (const lm of lossMatches) {
            videoLossChannels.add(parseInt(lm[1], 10));
          }
        }
      } catch {
        // Video loss check is advisory
      }
      
      const channels: RecorderChannel[] = Array.from(channelMap.entries()).map(([index, name]) => {
        const hasLoss = videoLossChannels.has(index);
        return {
          id: String(index),
          name: name || `Channel ${index + 1}`,
          enabled: true,
          recordingEnabled: true,
          videoLoss: hasLoss
        };
      });
      
      return this.createHealthyResult<RecorderChannel[]>(
        channels,
        `Found ${channels.length} channel(s)`
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
   * Get single channel info
   */
  async getChannel(channelId: string): Promise<CheckResult<RecorderChannel>> {
    try {
      const channelsResult = await this.getChannels();
      if (channelsResult.status === 'healthy' && channelsResult.value) {
        const ch = channelsResult.value.find(c => c.id === channelId || c.id === String(parseInt(channelId, 10)));
        if (ch) {
          return this.createHealthyResult<RecorderChannel>(ch, `Channel ${channelId} found`);
        }
        return this.createUnhealthyResult<RecorderChannel>(`Channel ${channelId} not found`, 'CHANNEL_NOT_FOUND');
      }
      
      return this.createUnknownResult<RecorderChannel>('Could not query channel', 'VENDOR_API_ERROR');
    } catch (error) {
      const normalized = this.normalizeError(error);
      return this.createUnknownResult<RecorderChannel>(normalized.message, normalized.code);
    }
  }
  
  /**
   * Get stream status
   */
  async getStreamStatus(channelId: string): Promise<StreamStatus> {
    try {
      const chIndex = parseInt(channelId, 10);
      
      // Query video loss status
      const videoLossResult = await this.makeCgiRequest('/cgi-bin/eventManager.cgi', {
        action: 'getEventIndexes',
        code: 'VideoLoss'
      });
      
      if (videoLossResult.status === 200 && videoLossResult.data) {
        const lossMatches = [...String(videoLossResult.data).matchAll(/indexes\[\d+\]=(\d+)/g)];
        const isLost = lossMatches.some(lm => parseInt(lm[1], 10) === chIndex);
        
        if (isLost) {
          return this.createUnhealthyResult<string>('Video loss detected on channel', 'VIDEO_LOSS_DETECTED', 'no-signal');
        }
      }
      
      return this.createHealthyResult<string>('streaming', 'Stream active with signal');
      
    } catch (error) {
      const normalized = this.normalizeError(error);
      return this.createUnknownResult<string>(normalized.message, normalized.code);
    }
  }
  
  /**
   * Get recording status
   * Verifies actual recording activity from recent archive search
   */
  async getRecordingStatus(channelId: string): Promise<RecordingStatus> {
    try {
      const chIndex = parseInt(channelId, 10);
      const now = new Date();
      const searchFrom = new Date(now.getTime() - 15 * 60 * 1000); // Last 15 minutes
      
      const searchResult = await this.searchRecordingsInternal(chIndex, searchFrom, now, 5);
      
      if (searchResult && searchResult.length > 0) {
        const latest = searchResult.reduce((max, seg) => (seg.endTime > max ? seg.endTime : max), searchResult[0].endTime);
        const ageSeconds = (now.getTime() - latest.getTime()) / 1000;
        
        if (ageSeconds <= 300) {
          return this.createHealthyResult<string>('recording', 'Actively recording');
        }
        
        return this.createUnhealthyResult<string>(
          `Recording stopped (last recording ended ${Math.round(ageSeconds)}s ago)`,
          'RECORDING_STOPPED',
          'stopped'
        );
      }
      
      return this.createUnhealthyResult<string>(
        'No recordings found in last 15 minutes',
        'RECORDING_NOT_CONFIGURED',
        'stopped'
      );
      
    } catch (error) {
      const normalized = this.normalizeError(error);
      return this.createUnknownResult<string>(normalized.message, normalized.code);
    }
  }
  
  /**
   * Get latest recording
   */
  async getLatestRecording(channelId: string): Promise<RecordingArchiveInfo | null> {
    try {
      const chIndex = parseInt(channelId, 10);
      const now = new Date();
      const searchFrom = new Date(now.getTime() - 24 * 60 * 60 * 1000); // Last 24 hours
      
      const results = await this.searchRecordingsInternal(chIndex, searchFrom, now, 10);
      if (results && results.length > 0) {
        const sorted = results.sort((a, b) => b.endTime.getTime() - a.endTime.getTime());
        const latest = sorted[0];
        return {
          startTime: latest.startTime,
          endTime: latest.endTime,
          recordingToken: latest.id,
          sizeBytes: latest.sizeBytes
        };
      }
      
      return null;
    } catch (error) {
      logger.warn('Dahua latest recording search failed', { error });
      return null;
    }
  }
  
  /**
   * Get oldest recording
   */
  async getOldestRecording(channelId: string): Promise<RecordingArchiveInfo | null> {
    try {
      const chIndex = parseInt(channelId, 10);
      const now = new Date();
      const searchFrom = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000); // 180 days ago
      
      const results = await this.searchRecordingsInternal(chIndex, searchFrom, now, 20);
      if (results && results.length > 0) {
        const sorted = results.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
        const oldest = sorted[0];
        return {
          startTime: oldest.startTime,
          endTime: oldest.endTime,
          recordingToken: oldest.id,
          sizeBytes: oldest.sizeBytes
        };
      }
      
      return null;
    } catch (error) {
      logger.warn('Dahua oldest recording search failed', { error });
      return null;
    }
  }
  
  /**
   * Get storage and disk status
   */
  async getStorageStatus(): Promise<StorageCheckResult> {
    try {
      const result = await this.makeCgiRequest('/cgi-bin/storageDevice.cgi', {
        action: 'getDeviceAllInfo'
      });
      
      if (result.status === 200 && result.data) {
        const text = String(result.data);
        const disks: RecorderDisk[] = [];
        
        let totalBytes = 0;
        let usedBytes = 0;
        
        // Parse info[0], info[1], etc.
        const diskIndices = [...new Set([...text.matchAll(/info\[(\d+)\]/g)].map(m => parseInt(m[1], 10)))];
        
        for (const idx of diskIndices) {
          const name = this.extractKeyValue(text, [`info[${idx}].Name`, `info[${idx}].Path`]) || `Disk ${idx + 1}`;
          const stateStr = this.extractKeyValue(text, [`info[${idx}].State`, `info[${idx}].Status`])?.toLowerCase();
          const totalKB = parseFloat(this.extractKeyValue(text, [`info[${idx}].TotalBytes`, `info[${idx}].Capacity`]) || '0');
          const usedKB = parseFloat(this.extractKeyValue(text, [`info[${idx}].UsedBytes`, `info[${idx}].Used`]) || '0');
          
          const diskTotalBytes = totalKB > 0 ? (totalKB > 1000000000 ? totalKB : totalKB * 1024) : 0;
          const diskUsedBytes = usedKB > 0 ? (usedKB > 1000000000 ? usedKB : usedKB * 1024) : 0;
          const diskFreeBytes = Math.max(0, diskTotalBytes - diskUsedBytes);
          
          totalBytes += diskTotalBytes;
          usedBytes += diskUsedBytes;
          
          const isHealthy = stateStr === 'normal' || stateStr === 'ok' || stateStr === '0' || stateStr === 'idle' || stateStr === 'working';
          const isWarning = stateStr === 'warning' || stateStr === 'degraded';
          const isFailed = stateStr === 'error' || stateStr === 'failed' || stateStr === 'damaged';
          
          disks.push({
            id: `hdd-${idx + 1}`,
            state: isHealthy ? 'normal' : isWarning ? 'warning' : isFailed ? 'failed' : 'unknown',
            totalBytes: diskTotalBytes,
            usedBytes: diskUsedBytes,
            freeBytes: diskFreeBytes
          });
        }
        
        const usagePercent = totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0;
        const failedCount = disks.filter(d => d.state === 'failed').length;
        
        if (failedCount > 0) {
          return {
            status: 'unhealthy',
            message: `${failedCount} disk(s) failed`,
            errorCode: 'DISK_FAILED',
            totalBytes,
            usedBytes,
            freeBytes: Math.max(0, totalBytes - usedBytes),
            usagePercent,
            disks,
            checkedAt: new Date()
          };
        }
        
        if (usagePercent >= 95) {
          return {
            status: 'unhealthy',
            message: `Storage ${usagePercent.toFixed(1)}% full`,
            errorCode: 'STORAGE_FULL',
            totalBytes,
            usedBytes,
            freeBytes: Math.max(0, totalBytes - usedBytes),
            usagePercent,
            disks,
            checkedAt: new Date()
          };
        }
        
        return {
          status: 'healthy',
          message: 'Storage operational',
          totalBytes,
          usedBytes,
          freeBytes: Math.max(0, totalBytes - usedBytes),
          usagePercent,
          disks,
          checkedAt: new Date()
        };
      }
      
      return this.createUnknownResult('Could not query Dahua storage status', 'VENDOR_API_ERROR');
      
    } catch (error) {
      const normalized = this.normalizeError(error);
      return this.createUnknownResult(normalized.message, normalized.code);
    }
  }
  
  /**
   * Get device time and calculate clock drift
   */
  async getDeviceTime(): Promise<CheckResult<Date>> {
    try {
      const result = await this.makeCgiRequest('/cgi-bin/global.cgi', { action: 'getCurrentTime' });
      
      if (result.status === 200 && result.data) {
        const text = String(result.data);
        const timeStr = this.extractKeyValue(text, ['result', 'time', 'currentTime']);
        
        if (timeStr) {
          // Format is typically "YYYY-MM-DD HH:mm:ss" or ISO string
          const parsedDate = new Date(timeStr.replace(' ', 'T') + (timeStr.includes('Z') ? '' : 'Z'));
          
          if (!isNaN(parsedDate.getTime())) {
            return this.createHealthyResult<Date>(parsedDate, 'Device time retrieved');
          }
        }
      }
      
      return this.createUnknownResult<Date>('Could not parse Dahua device time', 'VENDOR_API_ERROR');
      
    } catch (error) {
      const normalized = this.normalizeError(error);
      return this.createUnknownResult<Date>(normalized.message, normalized.code);
    }
  }
  
  /**
   * Internal recording search via /cgi-bin/mediaFileFind.cgi
   */
  private async searchRecordingsInternal(
    channelIndex: number,
    from: Date,
    to: Date,
    maxResults: number
  ): Promise<Array<{ id: string; startTime: Date; endTime: Date; sizeBytes?: number }>> {
    let searchHandle: string | undefined;
    
    try {
      // 1. Create search instance
      const createRes = await this.makeCgiRequest('/cgi-bin/mediaFileFind.cgi', { action: 'factory.create' });
      if (createRes.status !== 200 || !createRes.data) return [];
      
      searchHandle = this.extractKeyValue(String(createRes.data), ['result', 'object']);
      if (!searchHandle) return [];
      
      // 2. Start find
      const findRes = await this.makeCgiRequest('/cgi-bin/mediaFileFind.cgi', {
        action: 'findFile',
        object: searchHandle,
        'condition.Channel': String(channelIndex),
        'condition.StartTime': this.formatDahuaTime(from),
        'condition.EndTime': this.formatDahuaTime(to),
        'condition.Types[0]': 'dav'
      });
      
      if (findRes.status !== 200) return [];
      
      // 3. Get next files
      const nextRes = await this.makeCgiRequest('/cgi-bin/mediaFileFind.cgi', {
        action: 'findNextFile',
        object: searchHandle,
        count: String(Math.min(maxResults, 100))
      });
      
      if (nextRes.status !== 200 || !nextRes.data) return [];
      
      const text = String(nextRes.data);
      const items: Array<{ id: string; startTime: Date; endTime: Date; sizeBytes?: number }> = [];
      
      const fileIndices = [...new Set([...text.matchAll(/items\[(\d+)\]/g)].map(m => parseInt(m[1], 10)))];
      for (const idx of fileIndices) {
        const startStr = this.extractKeyValue(text, [`items[${idx}].StartTime`]);
        const endStr = this.extractKeyValue(text, [`items[${idx}].EndTime`]);
        const lengthStr = this.extractKeyValue(text, [`items[${idx}].Length`]);
        
        if (startStr && endStr) {
          const startTime = new Date(startStr.replace(' ', 'T') + 'Z');
          const endTime = new Date(endStr.replace(' ', 'T') + 'Z');
          
          if (!isNaN(startTime.getTime()) && !isNaN(endTime.getTime())) {
            items.push({
              id: `${channelIndex}-${startTime.getTime()}`,
              startTime,
              endTime,
              sizeBytes: lengthStr ? parseInt(lengthStr, 10) : undefined
            });
          }
        }
      }
      
      return items;
      
    } finally {
      // 4. Always close search handle
      if (searchHandle) {
        try {
          await this.makeCgiRequest('/cgi-bin/mediaFileFind.cgi', {
            action: 'close',
            object: searchHandle
          });
        } catch {
          // Ignore cleanup errors
        }
      }
    }
  }
  
  /**
   * Helper: Make authenticated CGI request
   */
  private async makeCgiRequest(path: string, params?: Record<string, string>): Promise<any> {
    return await this.httpClient.request({
      url: path,
      method: 'GET',
      params,
      auth: {
        username: this.connection.credentials.username,
        password: this.connection.credentials.password
      }
    });
  }
  
  /**
   * Helper: Extract key=value from response
   */
  private extractKeyValue(text: string, keys: string[]): string | undefined {
    for (const key of keys) {
      const match = text.match(new RegExp(`(?:^|[\\r\\n])${key.replace(/\[/g, '\\[').replace(/\]/g, '\\]')}=([^\\r\\n]*)`, 'i'));
      if (match && match[1] !== undefined) {
        return match[1].trim();
      }
    }
    return undefined;
  }
  
  /**
   * Helper: Format Date to Dahua time string "YYYY-MM-DD HH:mm:ss"
   */
  private formatDahuaTime(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
  }
}
