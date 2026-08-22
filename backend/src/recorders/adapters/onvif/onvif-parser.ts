/**
 * ONVIF Response Parser
 * 
 * Parses SOAP/XML responses from ONVIF devices.
 * Uses xml2js for reliable parsing with namespace handling.
 */

import { parseStringPromise, OptionsV2 } from 'xml2js';
import type {
  DeviceInfo,
  RecorderCapabilities,
  DeviceClockEvidence,
  StreamProfile,
  StreamMetadata,
  RecordingSegment
} from '../../contracts/recorder-evidence.js';
import { logger } from '../../../utils/logger.js';

/**
 * XML parser options
 */
const PARSER_OPTIONS: OptionsV2 = {
  explicitArray: false,
  ignoreAttrs: false,
  tagNameProcessors: [
    // Remove namespace prefixes
    (name: string) => name.replace(/^[^:]+:/, '')
  ],
  attrNameProcessors: [
    (name: string) => name.replace(/^[^:]+:/, '')
  ]
};

/**
 * ONVIF parser
 */
export class OnvifParser {
  /**
   * Parse SOAP envelope and extract body
   */
  async parseSoapResponse<T = any>(xml: string): Promise<T> {
    try {
      const parsed = await parseStringPromise(xml, PARSER_OPTIONS);
      
      // Navigate SOAP structure: Envelope -> Body -> Response
      const envelope = parsed?.Envelope || parsed?.envelope;
      if (!envelope) {
        throw new Error('Invalid SOAP envelope');
      }

      const body = envelope.Body || envelope.body;
      if (!body) {
        throw new Error('Missing SOAP body');
      }

      // Check for SOAP fault
      if (body.Fault || body.fault) {
        throw this.parseSoapFault(body.Fault || body.fault);
      }

      return body;

    } catch (error) {
      logger.error('ONVIF SOAP parse error', { error, xml: xml.substring(0, 500) });
      throw error;
    }
  }

  /**
   * Parse SOAP fault
   */
  private parseSoapFault(fault: any): Error {
    const code = fault.Code?.Value || fault.faultcode || 'UNKNOWN';
    const reason = fault.Reason?.Text || fault.faultstring || 'SOAP fault';
    
    return new Error(`ONVIF SOAP Fault [${code}]: ${reason}`);
  }

  /**
   * Parse GetSystemDateAndTime response
   */
  parseSystemDateAndTime(body: any): DeviceClockEvidence {
    const response = body.GetSystemDateAndTimeResponse;
    if (!response?.SystemDateAndTime) {
      throw new Error('Invalid GetSystemDateAndTime response');
    }

    const sdt = response.SystemDateAndTime;
    const utcDateTime = sdt.UTCDateTime || sdt.LocalDateTime;

    if (!utcDateTime?.Date || !utcDateTime?.Time) {
      throw new Error('Missing date/time in response');
    }

    const date = utcDateTime.Date;
    const time = utcDateTime.Time;

    // Construct Date object
    const recorderTime = new Date(
      Date.UTC(
        parseInt(date.Year || date.year, 10),
        parseInt(date.Month || date.month, 10) - 1,
        parseInt(date.Day || date.day, 10),
        parseInt(time.Hour || time.hour, 10),
        parseInt(time.Minute || time.minute, 10),
        parseInt(time.Second || time.second, 10)
      )
    );

    const observedLocalTime = new Date();
    const offsetMs = recorderTime.getTime() - observedLocalTime.getTime();

    return {
      recorderTime,
      observedLocalTime,
      offsetMs,
      ntpEnabled: sdt.DateTimeType === 'NTP',
      timezone: sdt.TimeZone?.TZ
    };
  }

  /**
   * Parse GetDeviceInformation response
   */
  parseDeviceInformation(body: any): DeviceInfo {
    const response = body.GetDeviceInformationResponse;
    if (!response) {
      throw new Error('Invalid GetDeviceInformation response');
    }

    return {
      manufacturer: response.Manufacturer,
      model: response.Model,
      firmwareVersion: response.FirmwareVersion,
      serialNumber: response.SerialNumber,
      hardwareId: response.HardwareId
    };
  }

  /**
   * Parse GetCapabilities response
   */
  parseCapabilities(body: any): Partial<RecorderCapabilities> {
    const response = body.GetCapabilitiesResponse;
    if (!response?.Capabilities) {
      throw new Error('Invalid GetCapabilities response');
    }

    const caps = response.Capabilities;

    return {
      deviceInfo: true, // Device service always available
      deviceTime: true,
      channelEnumeration: !!caps.Media,
      streamStatus: !!caps.Media,
      recordingStatus: !!caps.Recording,
      recordingSearch: !!caps.Search,
      storageStatus: !!caps.Device, // Basic storage info
      playbackUri: !!caps.Replay,
      source: 'reported'
    };
  }

  /**
   * Parse GetServices response
   */
  parseServices(body: any): Array<{
    namespace: string;
    xAddr: string;
    version: { major: number; minor: number };
  }> {
    const response = body.GetServicesResponse;
    if (!response?.Service) {
      return [];
    }

    const services = Array.isArray(response.Service)
      ? response.Service
      : [response.Service];

    return services.map((service: any) => ({
      namespace: service.Namespace,
      xAddr: service.XAddr,
      version: {
        major: parseInt(service.Version?.Major || 0, 10),
        minor: parseInt(service.Version?.Minor || 0, 10)
      }
    }));
  }

  /**
   * Parse GetProfiles response
   */
  parseProfiles(body: any): StreamProfile[] {
    const response = body.GetProfilesResponse;
    if (!response?.Profiles) {
      return [];
    }

    const profiles = Array.isArray(response.Profiles)
      ? response.Profiles
      : [response.Profiles];

    return profiles.map((profile: any) => this.parseProfile(profile));
  }

  /**
   * Parse single profile
   */
  private parseProfile(profile: any): StreamProfile {
    const videoSource = profile.VideoSourceConfiguration;
    const videoEncoder = profile.VideoEncoderConfiguration;

    let metadata: StreamMetadata | undefined;
    if (videoEncoder) {
      metadata = {
        codec: videoEncoder.Encoding,
        width: parseInt(videoEncoder.Resolution?.Width || 0, 10),
        height: parseInt(videoEncoder.Resolution?.Height || 0, 10),
        fps: parseFloat(videoEncoder.RateControl?.FrameRateLimit || 0),
        bitrateKbps: parseInt(videoEncoder.RateControl?.BitrateLimit || 0, 10)
      };
    }

    return {
      profileId: profile.$.token || profile.$.Token,
      name: profile.Name || profile.name,
      type: this.inferProfileType(profile.Name || profile.name),
      vendorToken: profile.$.token || profile.$.Token,
      metadata
    };
  }

  /**
   * Infer profile type from name
   */
  private inferProfileType(name?: string): 'main' | 'sub' | 'mobile' | 'unknown' {
    if (!name) return 'unknown';
    
    const lower = name.toLowerCase();
    if (lower.includes('main') || lower.includes('high')) return 'main';
    if (lower.includes('sub') || lower.includes('low')) return 'sub';
    if (lower.includes('mobile')) return 'mobile';
    
    return 'unknown';
  }

  /**
   * Parse GetVideoSources response
   */
  parseVideoSources(body: any): Array<{
    token: string;
    framerate: number;
    resolution: { width: number; height: number };
  }> {
    const response = body.GetVideoSourcesResponse;
    if (!response?.VideoSources) {
      return [];
    }

    const sources = Array.isArray(response.VideoSources)
      ? response.VideoSources
      : [response.VideoSources];

    return sources.map((source: any) => ({
      token: source.$.token || source.$.Token,
      framerate: parseFloat(source.Framerate || 0),
      resolution: {
        width: parseInt(source.Resolution?.Width || 0, 10),
        height: parseInt(source.Resolution?.Height || 0, 10)
      }
    }));
  }

  /**
   * Parse GetStreamUri response
   */
  parseStreamUri(body: any): string {
    const response = body.GetStreamUriResponse;
    if (!response?.MediaUri?.Uri) {
      throw new Error('Invalid GetStreamUri response');
    }

    return response.MediaUri.Uri;
  }

  /**
   * Parse FindRecordings response
   */
  parseFindRecordings(body: any): string {
    const response = body.FindRecordingsResponse;
    if (!response?.SearchToken) {
      throw new Error('Invalid FindRecordings response');
    }

    return response.SearchToken;
  }

  /**
   * Parse GetRecordingSearchResults response
   */
  parseRecordingSearchResults(body: any): RecordingSegment[] {
    const response = body.GetRecordingSearchResultsResponse;
    if (!response?.ResultList?.SearchResult) {
      return [];
    }

    const results = Array.isArray(response.ResultList.SearchResult)
      ? response.ResultList.SearchResult
      : [response.ResultList.SearchResult];

    return results
      .map((result: any) => this.parseSearchResult(result))
      .filter((segment): segment is RecordingSegment => segment !== null);
  }

  /**
   * Parse individual search result
   */
  private parseSearchResult(result: any): RecordingSegment | null {
    try {
      const recordingInfo = result.RecordingInformation;
      if (!recordingInfo) return null;

      const track = recordingInfo.Track;
      if (!track) return null;

      return {
        id: `${recordingInfo.RecordingToken}_${track.TrackToken}`,
        channelId: result.Source?.SourceId || track.TrackToken,
        startTime: new Date(track.DataFrom),
        endTime: new Date(track.DataTo),
        recordingType: this.mapRecordingType(recordingInfo.RecordingType),
        vendorReference: recordingInfo.RecordingToken
      };
    } catch (error) {
      logger.warn('Failed to parse search result', { error, result });
      return null;
    }
  }

  /**
   * Map ONVIF recording type
   */
  private mapRecordingType(type?: string): RecordingSegment['recordingType'] {
    if (!type) return 'unknown';
    
    const lower = type.toLowerCase();
    if (lower.includes('continuous')) return 'continuous';
    if (lower.includes('motion')) return 'motion';
    if (lower.includes('alarm')) return 'alarm';
    if (lower.includes('manual')) return 'manual';
    
    return 'event';
  }

  /**
   * Extract text content from element
   */
  private extractText(element: any): string | undefined {
    if (typeof element === 'string') return element;
    if (element?._) return element._;
    return undefined;
  }

  /**
   * Extract attribute value
   */
  private extractAttr(element: any, attrName: string): string | undefined {
    return element?.$?.[attrName];
  }
}

/**
 * Sanitize ONVIF URI (remove credentials)
 */
export function sanitizeOnvifUri(uri: string): string {
  try {
    const url = new URL(uri);
    
    if (url.username || url.password) {
      url.username = '';
      url.password = '';
    }

    return url.toString();
  } catch {
    // If URL parsing fails, return as-is
    return uri;
  }
}

/**
 * Extract hostname from ONVIF service URL
 */
export function extractOnvifHost(xAddr: string): string {
  try {
    const url = new URL(xAddr);
    return url.hostname;
  } catch {
    return '';
  }
}

/**
 * Build service URL from device service URL
 */
export function buildServiceUrl(deviceServiceUrl: string, servicePath: string): string {
  try {
    const url = new URL(deviceServiceUrl);
    url.pathname = servicePath;
    return url.toString();
  } catch {
    return deviceServiceUrl;
  }
}
