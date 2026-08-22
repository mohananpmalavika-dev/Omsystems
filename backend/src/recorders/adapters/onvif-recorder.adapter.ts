/**
 * ONVIF Recorder Adapter
 * 
 * Implements standardized ONVIF protocol for recorder communication.
 * Provides coverage for:
 * - Device management (GetDeviceInformation, GetSystemDateAndTime)
 * - Media profiles (GetProfiles, GetProfile, GetVideoSources, GetStreamUri)
 * - Recording control & jobs (GetRecordings, GetRecordingJobs)
 * - Storage configurations (GetStorageConfigurations)
 * - Search service (FindRecordings, GetRecordingSummary)
 * 
 * Authentication: WS-Security UsernameToken with Created timestamp, Nonce, and PasswordDigest.
 * Protocol: SOAP 1.2 over HTTP.
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
import { createHash, randomBytes } from 'crypto';
import { XMLParser } from 'fast-xml-parser';

export class OnvifRecorderAdapter extends BaseRecorderAdapter implements RecorderAdapter {
  private xmlParser: XMLParser;
  private deviceServicePath = '/onvif/device_service';
  private mediaServicePath = '/onvif/media_service';
  private recordingServicePath = '/onvif/recording_service';
  private searchServicePath = '/onvif/search_service';
  
  constructor(
    recorder: Recorder,
    connection: RecorderConnection,
    config?: any
  ) {
    super(recorder, connection, config);
    
    // Configure XML parser for ONVIF responses (remove namespace prefixes)
    this.xmlParser = new XMLParser({
      ignoreAttributes: false,
      removeNSPrefix: true,
      attributeNamePrefix: '@_',
      textNodeName: '#text',
      parseAttributeValue: true,
      trimValues: true
    });
  }
  
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
   */
  getCapabilities(): RecorderCapabilities {
    return {
      liveStreamStatus: true,
      recordingStatus: true,
      archiveSearch: true,
      storageStatus: true,
      diskHealth: false, // Standard ONVIF does not provide disk S.M.A.R.T.
      deviceTime: true,
      retentionQuery: false,
      channelEnumeration: true
    };
  }
  
  /**
   * Test basic connection to ONVIF device service
   */
  async testConnection(): Promise<ConnectionStatus> {
    const startTime = Date.now();
    
    try {
      const soapBody = `<GetSystemDateAndTime xmlns="http://www.onvif.org/ver10/device/wsdl"/>`;
      const result = await this.withTimeout(
        this.makeSoapRequest(this.deviceServicePath, soapBody, 'GetSystemDateAndTime', false),
        this.config.connectionTimeoutMs,
        'testConnection'
      );
      
      const latencyMs = Date.now() - startTime;
      
      if (result.status === 200 || (result.status && result.status < 500)) {
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
        `Unexpected HTTP ${result.status} from ONVIF endpoint`,
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
   * Authenticate with ONVIF using WS-Security UsernameToken
   */
  async authenticate(): Promise<AuthenticationStatus> {
    try {
      const soapBody = `<GetDeviceInformation xmlns="http://www.onvif.org/ver10/device/wsdl"/>`;
      const result = await this.makeSoapRequest(this.deviceServicePath, soapBody, 'GetDeviceInformation', true);
      
      if (result.status === 200) {
        this.authenticated = true;
        
        return {
          status: 'healthy',
          value: true,
          method: 'token',
          message: 'ONVIF WS-Security authentication successful',
          checkedAt: new Date()
        };
      }
      
      if (result.status === 401 || result.status === 403) {
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
  
  /**
   * Get device information
   */
  async getDeviceInfo(): Promise<CheckResult<RecorderDeviceInfo>> {
    try {
      const soapBody = `<GetDeviceInformation xmlns="http://www.onvif.org/ver10/device/wsdl"/>`;
      const result = await this.makeSoapRequest(this.deviceServicePath, soapBody, 'GetDeviceInformation', true);
      
      if (result.status === 200 && result.data) {
        const parsed = typeof result.data === 'string' ? this.xmlParser.parse(result.data) : result.data;
        const deviceInfo = this.extractFromSoapResponse(parsed, 'GetDeviceInformationResponse');
        
        if (deviceInfo) {
          const info: RecorderDeviceInfo = {
            manufacturer: deviceInfo.Manufacturer || deviceInfo.manufacturer || 'Unknown',
            model: deviceInfo.Model || deviceInfo.model || 'Unknown',
            serialNumber: deviceInfo.SerialNumber || deviceInfo.serialNumber || undefined,
            firmwareVersion: deviceInfo.FirmwareVersion || deviceInfo.firmwareVersion || undefined,
            hardwareId: deviceInfo.HardwareId || deviceInfo.hardwareId || undefined
          };
          
          logger.debug('ONVIF device info retrieved', {
            recorderId: this.recorder.id,
            manufacturer: info.manufacturer,
            model: info.model
          });
          
          return this.createHealthyResult<RecorderDeviceInfo>(
            info,
            `${info.manufacturer} ${info.model}`
          );
        }
      }
      
      return this.createUnknownResult<RecorderDeviceInfo>(
        'Could not parse device information',
        'VENDOR_API_ERROR'
      );
      
    } catch (error) {
      const normalized = this.normalizeError(error);
      logger.error('Failed to get ONVIF device info', {
        recorderId: this.recorder.id,
        error: normalized
      });
      return this.createUnknownResult<RecorderDeviceInfo>(
        normalized.message,
        normalized.code
      );
    }
  }
  
  /**
   * Get all channels / media profiles
   */
  async getChannels(): Promise<CheckResult<RecorderChannel[]>> {
    try {
      const soapBody = `<GetProfiles xmlns="http://www.onvif.org/ver10/media/wsdl"/>`;
      const result = await this.makeSoapRequest(this.mediaServicePath, soapBody, 'GetProfiles', true);
      
      if (result.status === 200 && result.data) {
        const parsed = typeof result.data === 'string' ? this.xmlParser.parse(result.data) : result.data;
        const response = this.extractFromSoapResponse(parsed, 'GetProfilesResponse');
        
        if (response && (response.Profiles || response.profiles)) {
          const raw = response.Profiles || response.profiles;
          const rawProfiles = Array.isArray(raw) ? raw : [raw];
          
          const channels: RecorderChannel[] = rawProfiles.map((profile: any) => {
            const profileToken = profile['@_token'] || profile.token || String(profile.Name || profile.name || 'ch1');
            const name = profile.Name || profile.name || `Profile ${profileToken}`;
            const vsc = profile.VideoSourceConfiguration || profile.videoSourceConfiguration;
            const videoSourceToken = vsc?.SourceToken || vsc?.sourceToken || vsc?.['@_token'];
            
            return {
              id: String(profileToken),
              name: String(name),
              enabled: true,
              recordingEnabled: true,
              videoSourceToken: videoSourceToken ? String(videoSourceToken) : undefined
            };
          });
          
          logger.debug('ONVIF profiles retrieved', {
            recorderId: this.recorder.id,
            profileCount: channels.length
          });
          
          return this.createHealthyResult<RecorderChannel[]>(
            channels,
            `Found ${channels.length} profile(s)`
          );
        }
      }
      
      return this.createUnknownResult<RecorderChannel[]>(
        'Could not parse profiles',
        'VENDOR_API_ERROR'
      );
      
    } catch (error) {
      const normalized = this.normalizeError(error);
      logger.error('Failed to get ONVIF profiles', {
        recorderId: this.recorder.id,
        error: normalized
      });
      return this.createUnknownResult<RecorderChannel[]>(
        normalized.message,
        normalized.code
      );
    }
  }
  
  /**
   * Get single channel by profile token
   */
  async getChannel(channelId: string): Promise<CheckResult<RecorderChannel>> {
    try {
      const soapBody = `
        <GetProfile xmlns="http://www.onvif.org/ver10/media/wsdl">
          <ProfileToken>${this.escapeXml(channelId)}</ProfileToken>
        </GetProfile>
      `;
      
      const result = await this.makeSoapRequest(this.mediaServicePath, soapBody, 'GetProfile', true);
      
      if (result.status === 200 && result.data) {
        const parsed = typeof result.data === 'string' ? this.xmlParser.parse(result.data) : result.data;
        const response = this.extractFromSoapResponse(parsed, 'GetProfileResponse');
        
        if (response && (response.Profile || response.profile)) {
          const profile = response.Profile || response.profile;
          const profileToken = profile['@_token'] || profile.token || channelId;
          const name = profile.Name || profile.name || profileToken;
          
          const channel: RecorderChannel = {
            id: String(profileToken),
            name: String(name),
            enabled: profile['@_fixed'] !== 'true',
            recordingEnabled: true
          };
          
          return this.createHealthyResult<RecorderChannel>(
            channel,
            `Profile ${name} found`
          );
        }
      }
      
      if (result.status === 400 || result.status === 404) {
        return this.createUnhealthyResult<RecorderChannel>(
          `Profile ${channelId} not found`,
          'CHANNEL_NOT_FOUND'
        );
      }
      
      return this.createUnknownResult<RecorderChannel>(
        'Could not retrieve profile',
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
      const soapBody = `
        <GetStreamUri xmlns="http://www.onvif.org/ver10/media/wsdl">
          <ProfileToken>${this.escapeXml(channelId)}</ProfileToken>
          <StreamSetup>
            <Stream xmlns="http://www.onvif.org/ver10/schema">RTP-Unicast</Stream>
            <Transport xmlns="http://www.onvif.org/ver10/schema">
              <Protocol>RTSP</Protocol>
            </Transport>
          </StreamSetup>
        </GetStreamUri>
      `;
      
      const result = await this.makeSoapRequest(this.mediaServicePath, soapBody, 'GetStreamUri', true);
      
      if (result.status === 200 && result.data) {
        const parsed = typeof result.data === 'string' ? this.xmlParser.parse(result.data) : result.data;
        const response = this.extractFromSoapResponse(parsed, 'GetStreamUriResponse');
        
        const mediaUri = response?.MediaUri || response?.mediaUri;
        if (mediaUri && (mediaUri.Uri || mediaUri.uri)) {
          const streamUri = mediaUri.Uri || mediaUri.uri;
          
          logger.debug('ONVIF stream URI retrieved', {
            recorderId: this.recorder.id,
            channelId,
            streamUri
          });
          
          return this.createHealthyResult<string>(
            'streaming',
            'Stream URI available'
          );
        }
      }
      
      if (result.status === 404) {
        return this.createUnhealthyResult<string>(
          'Profile not found',
          'CHANNEL_NOT_FOUND',
          'no-signal'
        );
      }
      
      return this.createUnknownResult<string>(
        'Could not determine stream status',
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
   */
  async getRecordingStatus(channelId: string): Promise<RecordingStatus> {
    try {
      const soapBody = `<GetRecordings xmlns="http://www.onvif.org/ver10/recording/wsdl"/>`;
      const result = await this.makeSoapRequest(this.recordingServicePath, soapBody, 'GetRecordings', true);
      
      if (result.status === 200 && result.data) {
        const parsed = typeof result.data === 'string' ? this.xmlParser.parse(result.data) : result.data;
        const response = this.extractFromSoapResponse(parsed, 'GetRecordingsResponse');
        
        const raw = response?.RecordingItem || response?.recordingItem;
        if (raw) {
          const recordings = Array.isArray(raw) ? raw : [raw];
          
          const matchingRecording = recordings.find((rec: any) => {
            const source = rec.Source?.SourceId || rec.Source || rec.source?.sourceId || rec.source;
            return source === channelId || source?.token === channelId || rec.RecordingToken === channelId || rec.recordingToken === channelId;
          });
          
          if (matchingRecording) {
            const state = matchingRecording.RecordingStatus || matchingRecording['@_status'] || matchingRecording.Status || matchingRecording.status;
            const isRecording = String(state).toLowerCase() === 'recording';
            
            if (isRecording) {
              return this.createHealthyResult<string>(
                'recording',
                'Recording active'
              );
            }
            
            return this.createUnhealthyResult<string>(
              `Recording ${state || 'stopped'}`,
              'RECORDING_STOPPED',
              state || 'stopped'
            );
          }
        }
        
        return this.createUnhealthyResult<string>(
          'No recording configured for this profile',
          'RECORDING_NOT_CONFIGURED',
          'stopped'
        );
      }
      
      if (result.status === 404 || result.status === 400 || result.status === 500) {
        // Recording service not enabled, check archive fallback
        const latest = await this.getLatestRecording(channelId);
        if (latest) {
          const ageSeconds = (Date.now() - latest.endTime.getTime()) / 1000;
          if (ageSeconds <= 300) {
            return this.createHealthyResult<string>('recording', 'Recent recording segment found');
          }
          return this.createUnhealthyResult<string>('No recent recordings found', 'RECORDING_STOPPED', 'stopped');
        }
        
        return this.createUnknownResult<string>(
          'Recording service not available on this device',
          'UNSUPPORTED_FEATURE'
        );
      }
      
      return this.createUnknownResult<string>(
        'Could not determine recording status',
        'VENDOR_API_ERROR'
      );
      
    } catch (error) {
      const normalized = this.normalizeError(error);
      logger.error('Failed to get ONVIF recording status', {
        recorderId: this.recorder.id,
        channelId,
        error: normalized
      });
      return this.createUnknownResult<string>(
        normalized.message,
        normalized.code
      );
    }
  }
  
  /**
   * Search latest recording
   */
  async getLatestRecording(channelId: string): Promise<RecordingArchiveInfo | null> {
    try {
      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - 60 * 60 * 1000); // Last hour
      
      const soapBody = `
        <FindRecordings xmlns="http://www.onvif.org/ver10/search/wsdl">
          <StartPoint>${startTime.toISOString()}</StartPoint>
          <EndPoint>${endTime.toISOString()}</EndPoint>
          <MaxMatches>10</MaxMatches>
          <IncludeRecordings>true</IncludeRecordings>
        </FindRecordings>
      `;
      
      const result = await this.makeSoapRequest(this.searchServicePath, soapBody, 'FindRecordings', true);
      
      if (result.status === 200 && result.data) {
        const parsed = typeof result.data === 'string' ? this.xmlParser.parse(result.data) : result.data;
        const response = this.extractFromSoapResponse(parsed, 'FindRecordingsResponse');
        
        const raw = response?.RecordingInformation || response?.recordingInformation;
        if (raw) {
          const recordings = Array.isArray(raw) ? raw : [raw];
          
          if (recordings.length > 0) {
            const sorted = recordings.sort((a: any, b: any) => {
              const aTime = new Date(a.LatestRecording || a.EndTime || a.latestRecording || a.endTime || 0).getTime();
              const bTime = new Date(b.LatestRecording || b.EndTime || b.latestRecording || b.endTime || 0).getTime();
              return bTime - aTime;
            });
            
            const latest = sorted[0];
            return {
              startTime: new Date(latest.EarliestRecording || latest.StartTime || latest.earliestRecording || latest.startTime || startTime),
              endTime: new Date(latest.LatestRecording || latest.EndTime || latest.latestRecording || latest.endTime || endTime),
              recordingToken: latest.RecordingToken || latest['@_token'] || latest.recordingToken || channelId,
              sizeBytes: (latest.DataFrom || latest.dataFrom) ? parseInt(latest.DataFrom || latest.dataFrom, 10) : undefined
            };
          }
        }
      }
      
      return null;
      
    } catch (error) {
      logger.warn('ONVIF recording search failed or not supported', {
        recorderId: this.recorder.id,
        channelId,
        error: this.normalizeError(error)
      });
      return null;
    }
  }
  
  /**
   * Search oldest recording
   */
  async getOldestRecording(channelId: string): Promise<RecordingArchiveInfo | null> {
    try {
      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - 180 * 24 * 60 * 60 * 1000); // 180 days ago
      
      const soapBody = `
        <FindRecordings xmlns="http://www.onvif.org/ver10/search/wsdl">
          <StartPoint>${startTime.toISOString()}</StartPoint>
          <EndPoint>${endTime.toISOString()}</EndPoint>
          <MaxMatches>10</MaxMatches>
          <IncludeRecordings>true</IncludeRecordings>
        </FindRecordings>
      `;
      
      const result = await this.makeSoapRequest(this.searchServicePath, soapBody, 'FindRecordings', true);
      
      if (result.status === 200 && result.data) {
        const parsed = typeof result.data === 'string' ? this.xmlParser.parse(result.data) : result.data;
        const response = this.extractFromSoapResponse(parsed, 'FindRecordingsResponse');
        
        const raw = response?.RecordingInformation || response?.recordingInformation;
        if (raw) {
          const recordings = Array.isArray(raw) ? raw : [raw];
          
          const sortedRecordings = recordings.sort((a: any, b: any) => {
            const aTime = new Date(a.EarliestRecording || a.StartTime || a.earliestRecording || a.startTime || 0).getTime();
            const bTime = new Date(b.EarliestRecording || b.StartTime || b.earliestRecording || b.startTime || 0).getTime();
            return aTime - bTime;
          });
          
          if (sortedRecordings.length > 0) {
            const oldest = sortedRecordings[0];
            return {
              startTime: new Date(oldest.EarliestRecording || oldest.StartTime || oldest.earliestRecording || oldest.startTime || startTime),
              endTime: new Date(oldest.LatestRecording || oldest.EndTime || oldest.latestRecording || oldest.endTime || endTime),
              recordingToken: oldest.RecordingToken || oldest['@_token'] || oldest.recordingToken || channelId,
              sizeBytes: (oldest.DataFrom || oldest.dataFrom) ? parseInt(oldest.DataFrom || oldest.dataFrom, 10) : undefined
            };
          }
        }
      }
      
      return null;
      
    } catch (error) {
      logger.warn('ONVIF oldest recording search failed or not supported', {
        recorderId: this.recorder.id,
        channelId,
        error: this.normalizeError(error)
      });
      return null;
    }
  }
  
  /**
   * Get storage status from ONVIF GetStorageConfigurations
   */
  async getStorageStatus(): Promise<StorageCheckResult> {
    try {
      const soapBody = `<GetStorageConfigurations xmlns="http://www.onvif.org/ver10/device/wsdl"/>`;
      const result = await this.makeSoapRequest(this.deviceServicePath, soapBody, 'GetStorageConfigurations', true);
      
      if (result.status === 200 && result.data) {
        const parsed = typeof result.data === 'string' ? this.xmlParser.parse(result.data) : result.data;
        const response = this.extractFromSoapResponse(parsed, 'GetStorageConfigurationsResponse');
        
        const raw = response?.StorageConfiguration || response?.storageConfiguration;
        if (raw) {
          const storageConfigs = Array.isArray(raw) ? raw : [raw];
          
          let totalBytes = 0;
          let usedBytes = 0;
          const disks: any[] = [];
          
          for (const config of storageConfigs) {
            const data = config.Data || config.data || config;
            if (data) {
              const capacity = parseFloat(data.TotalBytes || data.totalBytes || data.Capacity || data.capacity || 0);
              const used = parseFloat(data.UsedBytes || data.usedBytes || data.Used || data.used || 0);
              const free = Math.max(0, capacity - used);
              
              totalBytes += capacity;
              usedBytes += used;
              
              disks.push({
                id: config['@_token'] || config.token || `disk-${disks.length + 1}`,
                state: 'normal',
                capacityBytes: capacity,
                usedBytes: used,
                freeBytes: free
              });
            }
          }
          
          const usagePercent = totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0;
          
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
      }
      
      return this.createUnknownResult(
        'Could not query storage configuration',
        'VENDOR_API_ERROR'
      );
      
    } catch (error) {
      const normalized = this.normalizeError(error);
      logger.error('Failed to get ONVIF storage status', {
        recorderId: this.recorder.id,
        error: normalized
      });
      return this.createUnknownResult(
        normalized.message,
        normalized.code
      );
    }
  }
  
  /**
   * Get device time and calculate clock drift
   */
  async getDeviceTime(): Promise<CheckResult<Date>> {
    try {
      const soapBody = `<GetSystemDateAndTime xmlns="http://www.onvif.org/ver10/device/wsdl"/>`;
      const result = await this.makeSoapRequest(this.deviceServicePath, soapBody, 'GetSystemDateAndTime', false);
      
      if (result.status === 200 && result.data) {
        const parsed = typeof result.data === 'string' ? this.xmlParser.parse(result.data) : result.data;
        const response = this.extractFromSoapResponse(parsed, 'GetSystemDateAndTimeResponse');
        
        const dateTime = response?.SystemDateAndTime || response?.systemDateAndTime;
        if (dateTime) {
          const utc = dateTime.UTCDateTime || dateTime.utcDateTime || dateTime.LocalDateTime || dateTime.localDateTime;
          
          if (utc) {
            const d = utc.Date || utc.date;
            const t = utc.Time || utc.time;
            
            if (d && t) {
              const deviceTime = new Date(Date.UTC(
                parseInt(d.Year || d.year, 10),
                parseInt(d.Month || d.month, 10) - 1,
                parseInt(d.Day || d.day, 10),
                parseInt(t.Hour || t.hour, 10),
                parseInt(t.Minute || t.minute, 10),
                parseInt(t.Second || t.second, 10)
              ));
              
              logger.debug('ONVIF device time retrieved', {
                recorderId: this.recorder.id,
                deviceTime: deviceTime.toISOString()
              });
              
              return this.createHealthyResult<Date>(
                deviceTime,
                'Device time retrieved'
              );
            }
          }
        }
      }
      
      return this.createUnknownResult<Date>(
        'Could not parse device time',
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
   * Make SOAP 1.2 request with optional WS-Security authentication
   */
  private async makeSoapRequest(
    servicePath: string,
    soapBody: string,
    action: string,
    includeAuth: boolean = true
  ): Promise<any> {
    const soapEnvelope = this.buildSoapEnvelope(soapBody, includeAuth);
    
    return await this.httpClient.post(servicePath, soapEnvelope, {
      headers: {
        'Content-Type': `application/soap+xml; charset=utf-8; action="http://www.onvif.org/ver10/device/wsdl/${action}"`,
        'Connection': 'keep-alive'
      }
    });
  }
  
  /**
   * Build SOAP 1.2 envelope
   */
  private buildSoapEnvelope(body: string, includeAuth: boolean = true): string {
    const wsSecurityHeader = includeAuth ? this.buildWsSecurityHeader() : '';
    
    return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope 
  xmlns:soap="http://www.w3.org/2003/05/soap-envelope"
  xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd"
  xmlns:wsu="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd">
  ${includeAuth ? `<soap:Header>${wsSecurityHeader}</soap:Header>` : '<soap:Header/>'}
  <soap:Body>
    ${body}
  </soap:Body>
</soap:Envelope>`;
  }
  
  /**
   * Build WS-Security UsernameToken header
   */
  private buildWsSecurityHeader(): string {
    const created = new Date().toISOString();
    const nonce = randomBytes(16);
    const nonceBase64 = nonce.toString('base64');
    
    const password = this.connection.credentials.password || '';
    const digestInput = Buffer.concat([
      nonce,
      Buffer.from(created, 'utf8'),
      Buffer.from(password, 'utf8')
    ]);
    const digest = createHash('sha1').update(digestInput).digest('base64');
    
    return `<wsse:Security soap:mustUnderstand="true">
      <wsse:UsernameToken>
        <wsse:Username>${this.escapeXml(this.connection.credentials.username)}</wsse:Username>
        <wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordDigest">${digest}</wsse:Password>
        <wsse:Nonce EncodingType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary">${nonceBase64}</wsse:Nonce>
        <wsu:Created>${created}</wsu:Created>
      </wsse:UsernameToken>
    </wsse:Security>`;
  }
  
  /**
   * Extract response from SOAP envelope
   */
  private extractFromSoapResponse(parsed: any, responseName: string): any {
    if (!parsed) return null;
    
    const envelope = parsed.Envelope || parsed['soap:Envelope'] || parsed;
    const body = envelope.Body || envelope['soap:Body'] || envelope;
    
    for (const key of Object.keys(body)) {
      if (key.endsWith(responseName) || key === responseName) {
        return body[key];
      }
    }
    
    return body[responseName] || parsed[responseName] || null;
  }
  
  /**
   * Escape XML special characters
   */
  private escapeXml(unsafe: string): string {
    return unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}
