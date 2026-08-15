/**
 * ONVIF Recorder Adapter
 * 
 * Implements standardized ONVIF protocol for recorder communication.
 * ONVIF provides good coverage for:
 * - Device management (GetDeviceInformation, GetSystemDateAndTime)
 * - Media profiles (GetProfiles, GetVideoSources)
 * - Recording control (GetRecordingStatus)
 * - Storage information (GetStorageConfiguration)
 * 
 * Authentication: WS-Security UsernameToken with timestamp and digest
 * Protocol: SOAP 1.2 over HTTP
 * 
 * References:
 * - ONVIF Core Specification: https://www.onvif.org/specs/core/ONVIF-Core-Specification.pdf
 * - ONVIF Device Management: https://www.onvif.org/ver10/device/wsdl/devicemgmt.wsdl
 * - ONVIF Media Service: https://www.onvif.org/ver10/media/wsdl/media.wsdl
 * 
 * Note: Archive search and detailed disk health may be limited
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
import { createHash, randomBytes } from 'crypto';
import { XMLParser } from 'fast-xml-parser';

export class OnvifRecorderAdapter extends BaseRecorderAdapter implements RecorderAdapter {
  private xmlParser: XMLParser;
  private deviceServicePath = '/onvif/device_service';
  private mediaServicePath = '/onvif/media_service';
  private recordingServicePath = '/onvif/recording_service';
  
  constructor(
    recorder: Recorder,
    connection: RecorderConnection,
    config?: any
  ) {
    super(recorder, connection, config);
    
    // Configure XML parser for ONVIF responses
    this.xmlParser = new XMLParser({
      ignoreAttributes: false,
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
    try {
      const soapBody = `
        <GetDeviceInformation xmlns="http://www.onvif.org/ver10/device/wsdl"/>
      `;
      
      const result = await this.makeSoapRequest(this.deviceServicePath, soapBody, 'GetDeviceInformation');
      
      if (result.status === 200 && result.data) {
        const parsed = this.xmlParser.parse(result.data);
        const deviceInfo = this.extractFromSoapResponse(parsed, 'GetDeviceInformationResponse');
        
        if (deviceInfo) {
          const info: RecorderDeviceInfo = {
            manufacturer: deviceInfo.Manufacturer || 'Unknown',
            model: deviceInfo.Model || 'Unknown',
            serialNumber: deviceInfo.SerialNumber,
            firmwareVersion: deviceInfo.FirmwareVersion,
            hardwareId: deviceInfo.HardwareId
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
  
  async getChannels(): Promise<CheckResult<RecorderChannel[]>> {
    try {
      // ONVIF uses "Profiles" which combine video source + encoder
      const soapBody = `
        <GetProfiles xmlns="http://www.onvif.org/ver10/media/wsdl"/>
      `;
      
      const result = await this.makeSoapRequest(this.mediaServicePath, soapBody, 'GetProfiles');
      
      if (result.status === 200 && result.data) {
        const parsed = this.xmlParser.parse(result.data);
        const response = this.extractFromSoapResponse(parsed, 'GetProfilesResponse');
        
        if (response && response.Profiles) {
          const profiles = Array.isArray(response.Profiles) ? response.Profiles : [response.Profiles];
          
          const channels: RecorderChannel[] = profiles.map((profile: any) => {
            const profileToken = profile['@_token'] || profile.token;
            const name = profile.Name || profileToken;
            const videoSourceToken = profile.VideoSourceConfiguration?.SourceToken;
            
            return {
              id: profileToken,
              name,
              enabled: true, // ONVIF profiles are enabled by default
              recordingEnabled: true, // Assume recording if profile exists
              videoSourceToken
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
  
  async getChannel(channelId: string): Promise<CheckResult<RecorderChannel>> {
    try {
      const soapBody = `
        <GetProfile xmlns="http://www.onvif.org/ver10/media/wsdl">
          <ProfileToken>${this.escapeXml(channelId)}</ProfileToken>
        </GetProfile>
      `;
      
      const result = await this.makeSoapRequest(this.mediaServicePath, soapBody, 'GetProfile');
      
      if (result.status === 200 && result.data) {
        const parsed = this.xmlParser.parse(result.data);
        const response = this.extractFromSoapResponse(parsed, 'GetProfileResponse');
        
        if (response && response.Profile) {
          const profile = response.Profile;
          const profileToken = profile['@_token'] || profile.token || channelId;
          const name = profile.Name || profileToken;
          
          const channel: RecorderChannel = {
            id: profileToken,
            name,
            enabled: profile['@_fixed'] !== 'true', // Fixed profiles can't be changed
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
  
  async getStreamStatus(channelId: string): Promise<StreamStatus> {
    try {
      // Get stream URI to verify stream availability
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
      
      const result = await this.makeSoapRequest(this.mediaServicePath, soapBody, 'GetStreamUri');
      
      if (result.status === 200 && result.data) {
        const parsed = this.xmlParser.parse(result.data);
        const response = this.extractFromSoapResponse(parsed, 'GetStreamUriResponse');
        
        if (response && response.MediaUri && response.MediaUri.Uri) {
          const streamUri = response.MediaUri.Uri;
          
          logger.debug('ONVIF stream URI retrieved', {
            recorderId: this.recorder.id,
            channelId,
            streamUri
          });
          
          // Stream URI exists - assume streaming
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
  
  async getRecordingStatus(channelId: string): Promise<RecordingStatus> {
    try {
      // ONVIF Recording Service - GetRecordingJobs
      // Note: Some devices may not have recording service enabled
      const soapBody = `
        <GetRecordings xmlns="http://www.onvif.org/ver10/recording/wsdl"/>
      `;
      
      const result = await this.makeSoapRequest(this.recordingServicePath, soapBody, 'GetRecordings');
      
      if (result.status === 200 && result.data) {
        const parsed = this.xmlParser.parse(result.data);
        const response = this.extractFromSoapResponse(parsed, 'GetRecordingsResponse');
        
        if (response && response.RecordingItem) {
          const recordings = Array.isArray(response.RecordingItem) 
            ? response.RecordingItem 
            : [response.RecordingItem];
          
          // Check if any recording matches our profile/channel
          const matchingRecording = recordings.find((rec: any) => {
            const source = rec.Source?.SourceId || rec.Source;
            return source === channelId || source?.token === channelId;
          });
          
          if (matchingRecording) {
            const state = matchingRecording.RecordingStatus || matchingRecording['@_status'];
            
            if (state === 'Recording' || state === 'recording') {
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
        
        // No recording found for this channel
        return this.createUnhealthyResult<string>(
          'No recording configured for this profile',
          'RECORDING_NOT_CONFIGURED',
          'stopped'
        );
      }
      
      if (result.status === 404 || result.status === 400) {
        // Recording service not available
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
  
  async getLatestRecording(channelId: string): Promise<RecordingArchiveInfo | null> {
    try {
      // ONVIF FindRecordings - search for most recent
      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - 60 * 60 * 1000); // Last hour
      
      const soapBody = `
        <FindRecordings xmlns="http://www.onvif.org/ver10/search/wsdl">
          <StartPoint>${startTime.toISOString()}</StartPoint>
          <EndPoint>${endTime.toISOString()}</EndPoint>
          <MaxMatches>1</MaxMatches>
          <IncludeRecordings>true</IncludeRecordings>
        </FindRecordings>
      `;
      
      const result = await this.makeSoapRequest('/onvif/search_service', soapBody, 'FindRecordings');
      
      if (result.status === 200 && result.data) {
        const parsed = this.xmlParser.parse(result.data);
        const response = this.extractFromSoapResponse(parsed, 'FindRecordingsResponse');
        
        if (response && response.RecordingInformation) {
          const recordings = Array.isArray(response.RecordingInformation)
            ? response.RecordingInformation
            : [response.RecordingInformation];
          
          if (recordings.length > 0) {
            const latest = recordings[0];
            return {
              startTime: new Date(latest.EarliestRecording || latest.StartTime),
              endTime: new Date(latest.LatestRecording || latest.EndTime),
              recordingToken: latest.RecordingToken || latest['@_token'],
              sizeBytes: latest.DataFrom ? parseInt(latest.DataFrom) : undefined
            };
          }
        }
      }
      
      // No recordings found or search not supported
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
  
  async getOldestRecording(channelId: string): Promise<RecordingArchiveInfo | null> {
    try {
      // Search from far past
      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - 180 * 24 * 60 * 60 * 1000); // 180 days ago
      
      const soapBody = `
        <FindRecordings xmlns="http://www.onvif.org/ver10/search/wsdl">
          <StartPoint>${startTime.toISOString()}</StartPoint>
          <EndPoint>${endTime.toISOString()}</EndPoint>
          <MaxMatches>1</MaxMatches>
          <IncludeRecordings>true</IncludeRecordings>
        </FindRecordings>
      `;
      
      const result = await this.makeSoapRequest('/onvif/search_service', soapBody, 'FindRecordings');
      
      if (result.status === 200 && result.data) {
        const parsed = this.xmlParser.parse(result.data);
        const response = this.extractFromSoapResponse(parsed, 'FindRecordingsResponse');
        
        if (response && response.RecordingInformation) {
          const recordings = Array.isArray(response.RecordingInformation)
            ? response.RecordingInformation
            : [response.RecordingInformation];
          
          // Sort by earliest time
          const sortedRecordings = recordings.sort((a: any, b: any) => {
            const aTime = new Date(a.EarliestRecording || a.StartTime).getTime();
            const bTime = new Date(b.EarliestRecording || b.StartTime).getTime();
            return aTime - bTime;
          });
          
          if (sortedRecordings.length > 0) {
            const oldest = sortedRecordings[0];
            return {
              startTime: new Date(oldest.EarliestRecording || oldest.StartTime),
              endTime: new Date(oldest.LatestRecording || oldest.EndTime),
              recordingToken: oldest.RecordingToken || oldest['@_token'],
              sizeBytes: oldest.DataFrom ? parseInt(oldest.DataFrom) : undefined
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
  
  async getStorageStatus(): Promise<StorageCheckResult> {
    try {
      // ONVIF GetStorageConfiguration
      const soapBody = `
        <GetStorageConfigurations xmlns="http://www.onvif.org/ver10/device/wsdl"/>
      `;
      
      const result = await this.makeSoapRequest(this.deviceServicePath, soapBody, 'GetStorageConfigurations');
      
      if (result.status === 200 && result.data) {
        const parsed = this.xmlParser.parse(result.data);
        const response = this.extractFromSoapResponse(parsed, 'GetStorageConfigurationsResponse');
        
        if (response && response.StorageConfiguration) {
          const storageConfigs = Array.isArray(response.StorageConfiguration)
            ? response.StorageConfiguration
            : [response.StorageConfiguration];
          
          // Calculate total storage
          let totalBytes = 0;
          let usedBytes = 0;
          const disks: any[] = [];
          
          for (const config of storageConfigs) {
            const data = config.Data;
            if (data) {
              const capacityMB = parseFloat(data.TotalBytes || data.Capacity || 0);
              const usedMB = parseFloat(data.UsedBytes || data.Used || 0);
              
              totalBytes += capacityMB;
              usedBytes += usedMB;
              
              disks.push({
                id: config['@_token'] || config.token,
                type: data.Type || 'unknown',
                state: 'healthy', // ONVIF doesn't provide detailed disk health
                capacityBytes: capacityMB,
                usedBytes: usedMB
              });
            }
          }
          
          const usagePercent = totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0;
          
          // Check for storage issues
          if (usagePercent >= 95) {
            return {
              status: 'unhealthy',
              message: `Storage ${usagePercent.toFixed(1)}% full`,
              errorCode: 'STORAGE_FULL',
              totalBytes,
              usedBytes,
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
  
  async getDeviceTime(): Promise<CheckResult<Date>> {
    try {
      const soapBody = `
        <GetSystemDateAndTime xmlns="http://www.onvif.org/ver10/device/wsdl"/>
      `;
      
      const result = await this.makeSoapRequest(this.deviceServicePath, soapBody, 'GetSystemDateAndTime');
      
      if (result.status === 200 && result.data) {
        const parsed = this.xmlParser.parse(result.data);
        const response = this.extractFromSoapResponse(parsed, 'GetSystemDateAndTimeResponse');
        
        if (response && response.SystemDateAndTime) {
          const dateTime = response.SystemDateAndTime;
          const utc = dateTime.UTCDateTime || dateTime.LocalDateTime;
          
          if (utc && utc.Date && utc.Time) {
            const deviceTime = new Date(
              utc.Date.Year,
              utc.Date.Month - 1, // JS months are 0-indexed
              utc.Date.Day,
              utc.Time.Hour,
              utc.Time.Minute,
              utc.Time.Second
            );
            
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
   * ONVIF SOAP request helpers
   */
  
  /**
   * Make SOAP request with WS-Security authentication
   */
  private async makeSoapRequest(
    servicePath: string,
    soapBody: string,
    action: string
  ): Promise<any> {
    const soapEnvelope = this.buildSoapEnvelope(soapBody);
    
    return await this.httpClient.post(servicePath, soapEnvelope, {
      headers: {
        'Content-Type': 'application/soap+xml; charset=utf-8; action="http://www.onvif.org/ver10/device/wsdl/' + action + '"',
        'Connection': 'keep-alive'
      }
    });
  }
  
  /**
   * Build SOAP 1.2 envelope with WS-Security UsernameToken
   */
  private buildSoapEnvelope(body: string): string {
    const wsSecurityHeader = this.buildWsSecurityHeader();
    
    return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope 
  xmlns:soap="http://www.w3.org/2003/05/soap-envelope"
  xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd"
  xmlns:wsu="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd">
  <soap:Header>
    ${wsSecurityHeader}
  </soap:Header>
  <soap:Body>
    ${body}
  </soap:Body>
</soap:Envelope>`;
  }
  
  /**
   * Build WS-Security UsernameToken with timestamp and digest
   * 
   * ONVIF requires:
   * - Timestamp (Created)
   * - Nonce (random bytes)
   * - Password Digest = Base64(SHA-1(Nonce + Created + Password))
   */
  private buildWsSecurityHeader(): string {
    const created = new Date().toISOString();
    const nonce = randomBytes(16);
    const nonceBase64 = nonce.toString('base64');
    
    // Password Digest = Base64(SHA-1(Nonce + Created + Password))
    const password = this.connection.credentials.password;
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
    // Navigate SOAP envelope structure
    const envelope = parsed['soap:Envelope'] || parsed['SOAP-ENV:Envelope'] || parsed.Envelope;
    if (!envelope) return null;
    
    const body = envelope['soap:Body'] || envelope['SOAP-ENV:Body'] || envelope.Body;
    if (!body) return null;
    
    // Find response by name (with or without namespace prefix)
    for (const key in body) {
      if (key.endsWith(responseName) || key === responseName) {
        return body[key];
      }
    }
    
    return null;
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
  
  // Remove old placeholder methods
  private buildGetSystemDateAndTimeRequest(): string {
    throw new Error('Use makeSoapRequest instead');
  }
  
  private buildGetDeviceInformationRequest(): string {
    throw new Error('Use makeSoapRequest instead');
  }
  
  private buildOnvifAuthHeaders() {
    throw new Error('Auth is now in SOAP envelope');
  }
}
