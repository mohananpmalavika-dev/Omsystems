/**
 * Hikvision ISAPI Client
 * 
 * High-level client for Hikvision ISAPI operations.
 * Handles HTTP Digest authentication and XML request/response.
 */

import type { RecorderCredentials } from '../../transport/recorder-auth.js';
import type { RecorderHttpTransport } from '../../transport/recorder-http-transport.js';
import type {
  DeviceInfo,
  DeviceClockEvidence,
  RecordingSegment,
  RecordingSearchRequest,
  StorageEvidence
} from '../../contracts/recorder-evidence.js';
import { HikvisionParser, buildSearchRequest } from './hikvision-parser.js';
import { DigestAuthProvider } from '../../transport/recorder-auth.js';
import { logger } from '../../../utils/logger.js';

/**
 * Hikvision client configuration
 */
export interface HikvisionClientConfig {
  recorderId: string;
  credentials: RecorderCredentials;
  transport: RecorderHttpTransport;
}

/**
 * Hikvision ISAPI client
 */
export class HikvisionClient {
  private readonly config: HikvisionClientConfig;
  private readonly parser: HikvisionParser;
  private readonly authProvider: DigestAuthProvider;

  constructor(config: HikvisionClientConfig) {
    this.config = config;
    this.parser = new HikvisionParser();
    this.authProvider = new DigestAuthProvider(config.credentials);
  }

  /**
   * Get device information
   */
  async getDeviceInformation(): Promise<DeviceInfo> {
    const response = await this.request('/ISAPI/System/deviceInfo');
    return this.parser.parseDeviceInfo(response);
  }

  /**
   * Get device capabilities
   */
  async getCapabilities(): Promise<{
    deviceInfo: boolean;
    channels: boolean;
    recording: boolean;
    storage: boolean;
    time: boolean;
  }> {
    try {
      const response = await this.request('/ISAPI/System/capabilities');
      
      // Hikvision capabilities are extensive
      // For simplicity, assume all features available if capabilities endpoint works
      return {
        deviceInfo: true,
        channels: true,
        recording: true,
        storage: true,
        time: true
      };
    } catch {
      // If capabilities endpoint not available, assume basic features
      return {
        deviceInfo: true,
        channels: true,
        recording: true,
        storage: true,
        time: true
      };
    }
  }

  /**
   * Get all channels
   */
  async getChannels(): Promise<Array<{
    id: string;
    name: string;
    enabled: boolean;
    videoInputType?: string;
  }>> {
    const response = await this.request('/ISAPI/System/Video/inputs');
    return this.parser.parseChannels(response);
  }

  /**
   * Get single channel
   */
  async getChannel(channelId: string): Promise<{
    id: string;
    name: string;
    enabled: boolean;
    videoInputType?: string;
  }> {
    const response = await this.request(`/ISAPI/System/Video/inputs/${channelId}`);
    return this.parser.parseChannel(response, channelId);
  }

  /**
   * Get stream status
   */
  async getStreamStatus(channelId: string): Promise<{
    online: boolean;
    signalStatus?: string;
  }> {
    const response = await this.request(`/ISAPI/System/Video/inputs/${channelId}/status`);
    return this.parser.parseStreamStatus(response);
  }

  /**
   * Get recording status
   */
  async getRecordingStatus(channelId: string): Promise<{
    recording: boolean;
    enabled: boolean;
  }> {
    // Hikvision uses trackID format: channelId + "01" for main stream
    const trackId = `${channelId}01`;
    const response = await this.request(`/ISAPI/ContentMgmt/record/status/trackID/${trackId}`);
    return this.parser.parseRecordingStatus(response);
  }

  /**
   * Search recordings
   */
  async searchRecordings(request: RecordingSearchRequest): Promise<RecordingSegment[]> {
    const searchXml = buildSearchRequest(
      request.channelId,
      request.from,
      request.to,
      {
        maxResults: request.limit,
        sortOrder: request.order === 'desc' ? 'descending' : 'ascending',
        recordTypes: request.types?.map(t => this.mapRecordType(t))
      }
    );

    const response = await this.request('/ISAPI/ContentMgmt/search', 'POST', searchXml);
    const segments = await this.parser.parseSearchResults(response);

    // Apply additional filtering if needed
    return segments;
  }

  /**
   * Map recording type to Hikvision metadata descriptor
   */
  private mapRecordType(type: string): string {
    const mapping: Record<string, string> = {
      'continuous': 'timing',
      'motion': 'motion',
      'alarm': 'alarm',
      'manual': 'manual',
      'event': 'event'
    };
    return mapping[type] || type;
  }

  /**
   * Get storage status
   */
  async getStorageStatus(): Promise<StorageEvidence> {
    const response = await this.request('/ISAPI/ContentMgmt/Storage');
    return this.parser.parseStorageStatus(response);
  }

  /**
   * Get device time
   */
  async getDeviceTime(): Promise<DeviceClockEvidence> {
    const response = await this.request('/ISAPI/System/time');
    return this.parser.parseDeviceTime(response);
  }

  /**
   * Get stream URI
   */
  async getStreamUri(channelId: string, streamType: 'main' | 'sub' = 'main'): Promise<string> {
    // Hikvision RTSP URI format
    // rtsp://ip:554/Streaming/Channels/101 (main stream)
    // rtsp://ip:554/Streaming/Channels/102 (sub stream)
    
    const streamCode = streamType === 'main' ? '01' : '02';
    const streamId = `${channelId}${streamCode}`;
    
    // Note: This is a constructed URI, not fetched from API
    // Real credentials should be injected when used
    return `/Streaming/Channels/${streamId}`;
  }

  /**
   * Execute HTTP request with digest auth
   */
  private async request(
    path: string,
    method: 'GET' | 'POST' = 'GET',
    body?: string
  ): Promise<string> {
    const startTime = Date.now();

    try {
      logger.debug('Hikvision ISAPI request', {
        recorderId: this.config.recorderId,
        path,
        method
      });

      // Try request with cached auth
      let response = await this.config.transport.request(path, {
        method,
        body,
        headers: {
          'Content-Type': 'application/xml',
          ...this.authProvider.getHeaders({ method, uri: path, body })
        },
        responseType: 'text',
        retry: false // Handle auth retry ourselves
      });

      // If 401, handle digest challenge
      if (response.status === 401) {
        const wwwAuth = response.headers['www-authenticate'];
        if (wwwAuth) {
          await this.authProvider.handleChallenge(wwwAuth);
          
          // Retry with updated auth
          response = await this.config.transport.request(path, {
            method,
            body,
            headers: {
              'Content-Type': 'application/xml',
              ...this.authProvider.getHeaders({ method, uri: path, body })
            },
            responseType: 'text',
            retry: true
          });
        }
      }

      const latencyMs = Date.now() - startTime;

      if (response.status !== 200) {
        // Try to parse error response
        try {
          const errorInfo = await this.parser.parseError(response.data as string);
          throw new Error(
            `Hikvision API error [${errorInfo.statusCode}]: ${errorInfo.statusString}`
          );
        } catch {
          throw new Error(
            `Hikvision API error: HTTP ${response.status} ${response.statusText}`
          );
        }
      }

      logger.debug('Hikvision ISAPI response', {
        recorderId: this.config.recorderId,
        path,
        status: response.status,
        latencyMs
      });

      return response.data as string;

    } catch (error) {
      const latencyMs = Date.now() - startTime;
      
      logger.error('Hikvision ISAPI request failed', {
        recorderId: this.config.recorderId,
        path,
        method,
        latencyMs,
        error
      });

      throw error;
    }
  }

  /**
   * Test connectivity (simple status check)
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.request('/ISAPI/System/status');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Test authentication
   */
  async testAuthentication(): Promise<boolean> {
    try {
      await this.getDeviceInformation();
      return true;
    } catch {
      return false;
    }
  }
}
