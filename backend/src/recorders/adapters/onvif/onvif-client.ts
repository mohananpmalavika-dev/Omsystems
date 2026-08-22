/**
 * ONVIF Client
 * 
 * High-level client for ONVIF operations.
 * Handles SOAP construction, request execution, and response parsing.
 */

import type { RecorderCredentials } from '../../transport/recorder-auth.js';
import type { RecorderHttpTransport } from '../../transport/recorder-http-transport.js';
import type {
  DeviceInfo,
  RecorderCapabilities,
  DeviceClockEvidence,
  StreamProfile,
  RecordingSegment,
  RecordingSearchRequest
} from '../../contracts/recorder-evidence.js';
import {
  OnvifSoapBuilder,
  OnvifDeviceOperations,
  OnvifMediaOperations,
  OnvifRecordingOperations,
  OnvifSearchOperations
} from './onvif-soap-builder.js';
import { OnvifParser, sanitizeOnvifUri } from './onvif-parser.js';
import { logger } from '../../../utils/logger.js';

/**
 * ONVIF service endpoints
 */
export interface OnvifServiceEndpoints {
  device: string;
  media?: string;
  recording?: string;
  search?: string;
  replay?: string;
  events?: string;
}

/**
 * ONVIF client configuration
 */
export interface OnvifClientConfig {
  recorderId: string;
  endpoints: OnvifServiceEndpoints;
  credentials: RecorderCredentials;
  transport: RecorderHttpTransport;
}

/**
 * ONVIF client
 */
export class OnvifClient {
  private readonly config: OnvifClientConfig;
  private readonly soapBuilder: OnvifSoapBuilder;
  private readonly parser: OnvifParser;
  
  // Operation builders
  private readonly deviceOps: OnvifDeviceOperations;
  private readonly mediaOps: OnvifMediaOperations;
  private readonly recordingOps: OnvifRecordingOperations;
  private readonly searchOps: OnvifSearchOperations;

  // Cached service URLs (discovered dynamically)
  private serviceUrls?: Map<string, string>;

  // Clock offset for WS-Security
  private clockOffsetMs: number = 0;

  constructor(config: OnvifClientConfig) {
    this.config = config;
    this.soapBuilder = new OnvifSoapBuilder(config.credentials);
    this.parser = new OnvifParser();
    
    this.deviceOps = new OnvifDeviceOperations(this.soapBuilder);
    this.mediaOps = new OnvifMediaOperations(this.soapBuilder);
    this.recordingOps = new OnvifRecordingOperations(this.soapBuilder);
    this.searchOps = new OnvifSearchOperations(this.soapBuilder);
  }

  /**
   * Get system date and time
   * 
   * This is typically called first to:
   * 1. Test connectivity
   * 2. Calculate clock offset for WS-Security
   */
  async getSystemDateAndTime(): Promise<DeviceClockEvidence> {
    const soap = this.deviceOps.getSystemDateAndTime();
    const response = await this.executeRequest(this.config.endpoints.device, soap);
    const body = await this.parser.parseSoapResponse(response);
    const clockEvidence = this.parser.parseSystemDateAndTime(body);

    // Store clock offset for future requests
    this.clockOffsetMs = clockEvidence.offsetMs;

    logger.debug('ONVIF clock offset calculated', {
      recorderId: this.config.recorderId,
      offsetMs: this.clockOffsetMs,
      offsetSeconds: Math.round(this.clockOffsetMs / 1000)
    });

    return clockEvidence;
  }

  /**
   * Get device information
   */
  async getDeviceInformation(): Promise<DeviceInfo> {
    const soap = this.deviceOps.getDeviceInformation();
    const response = await this.executeRequest(this.config.endpoints.device, soap);
    const body = await this.parser.parseSoapResponse(response);
    return this.parser.parseDeviceInformation(body);
  }

  /**
   * Get device capabilities
   */
  async getCapabilities(): Promise<Partial<RecorderCapabilities>> {
    const soap = this.deviceOps.getCapabilities();
    const response = await this.executeRequest(this.config.endpoints.device, soap);
    const body = await this.parser.parseSoapResponse(response);
    return this.parser.parseCapabilities(body);
  }

  /**
   * Discover services
   * 
   * Queries device for available services and their endpoints.
   * Call this after initial connection to populate service URLs.
   */
  async discoverServices(): Promise<void> {
    const soap = this.deviceOps.getServices(true);
    const response = await this.executeRequest(this.config.endpoints.device, soap);
    const body = await this.parser.parseSoapResponse(response);
    const services = this.parser.parseServices(body);

    this.serviceUrls = new Map();

    for (const service of services) {
      const namespace = service.namespace.toLowerCase();
      
      if (namespace.includes('media')) {
        this.serviceUrls.set('media', service.xAddr);
      } else if (namespace.includes('recording')) {
        this.serviceUrls.set('recording', service.xAddr);
      } else if (namespace.includes('search')) {
        this.serviceUrls.set('search', service.xAddr);
      } else if (namespace.includes('replay')) {
        this.serviceUrls.set('replay', service.xAddr);
      } else if (namespace.includes('events')) {
        this.serviceUrls.set('events', service.xAddr);
      }
    }

    logger.debug('ONVIF services discovered', {
      recorderId: this.config.recorderId,
      services: Array.from(this.serviceUrls.keys())
    });
  }

  /**
   * Get media profiles
   */
  async getProfiles(): Promise<StreamProfile[]> {
    const endpoint = this.getServiceEndpoint('media');
    const soap = this.mediaOps.getProfiles();
    const response = await this.executeRequest(endpoint, soap);
    const body = await this.parser.parseSoapResponse(response);
    return this.parser.parseProfiles(body);
  }

  /**
   * Get video sources
   */
  async getVideoSources(): Promise<Array<{
    token: string;
    framerate: number;
    resolution: { width: number; height: number };
  }>> {
    const endpoint = this.getServiceEndpoint('media');
    const soap = this.mediaOps.getVideoSources();
    const response = await this.executeRequest(endpoint, soap);
    const body = await this.parser.parseSoapResponse(response);
    return this.parser.parseVideoSources(body);
  }

  /**
   * Get stream URI for profile
   */
  async getStreamUri(profileToken: string): Promise<string> {
    const endpoint = this.getServiceEndpoint('media');
    const soap = this.mediaOps.getStreamUri(profileToken, 'RTSP');
    const response = await this.executeRequest(endpoint, soap);
    const body = await this.parser.parseSoapResponse(response);
    const uri = this.parser.parseStreamUri(body);
    
    // Sanitize URI (remove embedded credentials)
    return sanitizeOnvifUri(uri);
  }

  /**
   * Search recordings
   */
  async searchRecordings(request: RecordingSearchRequest): Promise<RecordingSegment[]> {
    const endpoint = this.getServiceEndpoint('search');
    
    // Start search
    const findSoap = this.searchOps.findRecordings(
      { sources: [request.channelId] },
      request.from,
      request.to,
      request.limit ?? 100
    );
    
    const findResponse = await this.executeRequest(endpoint, findSoap);
    const findBody = await this.parser.parseSoapResponse(findResponse);
    const searchToken = this.parser.parseFindRecordings(findBody);

    try {
      // Get results
      const resultsSoap = this.searchOps.getRecordingSearchResults(
        searchToken,
        request.limit ?? 100
      );
      
      const resultsResponse = await this.executeRequest(endpoint, resultsSoap);
      const resultsBody = await this.parser.parseSoapResponse(resultsResponse);
      const segments = this.parser.parseRecordingSearchResults(resultsBody);

      // Sort by time if requested
      if (request.order === 'desc') {
        segments.sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
      } else if (request.order === 'asc') {
        segments.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
      }

      return segments;

    } finally {
      // Always end search to cleanup server resources
      try {
        const endSoap = this.searchOps.endSearch(searchToken);
        await this.executeRequest(endpoint, endSoap);
      } catch (error) {
        logger.warn('Failed to end ONVIF search', {
          recorderId: this.config.recorderId,
          error
        });
      }
    }
  }

  /**
   * Execute SOAP request
   */
  private async executeRequest(endpoint: string, soapBody: string): Promise<string> {
    const startTime = Date.now();

    try {
      // Extract path from full endpoint URL
      const url = new URL(endpoint);
      const path = url.pathname + url.search;

      logger.debug('ONVIF request', {
        recorderId: this.config.recorderId,
        endpoint: path,
        bodyLength: soapBody.length
      });

      const response = await this.config.transport.post(path, soapBody, {
        headers: {
          'Content-Type': 'application/soap+xml; charset=utf-8'
        },
        responseType: 'text'
      });

      const latencyMs = Date.now() - startTime;

      logger.debug('ONVIF response', {
        recorderId: this.config.recorderId,
        endpoint: path,
        status: response.status,
        latencyMs
      });

      if (response.status !== 200) {
        throw new Error(
          `ONVIF request failed: HTTP ${response.status} ${response.statusText}`
        );
      }

      return response.data as string;

    } catch (error) {
      const latencyMs = Date.now() - startTime;
      
      logger.error('ONVIF request failed', {
        recorderId: this.config.recorderId,
        endpoint,
        latencyMs,
        error
      });

      throw error;
    }
  }

  /**
   * Get service endpoint (with fallback)
   */
  private getServiceEndpoint(service: 'media' | 'recording' | 'search' | 'replay'): string {
    // Try discovered URL first
    if (this.serviceUrls?.has(service)) {
      return this.serviceUrls.get(service)!;
    }

    // Fall back to configured endpoint
    const endpoint = this.config.endpoints[service];
    if (endpoint) {
      return endpoint;
    }

    // Generate default path
    const defaultPaths: Record<string, string> = {
      media: '/onvif/media_service',
      recording: '/onvif/recording_service',
      search: '/onvif/search_service',
      replay: '/onvif/replay_service'
    };

    const baseUrl = new URL(this.config.endpoints.device);
    baseUrl.pathname = defaultPaths[service];
    
    logger.warn('Using default ONVIF service path', {
      recorderId: this.config.recorderId,
      service,
      path: baseUrl.pathname
    });

    return baseUrl.toString();
  }

  /**
   * Check if service is available
   */
  hasService(service: 'media' | 'recording' | 'search' | 'replay'): boolean {
    return (
      this.serviceUrls?.has(service) ||
      this.config.endpoints[service] !== undefined
    );
  }

  /**
   * Get adjusted timestamp for WS-Security
   * 
   * Accounts for clock offset to prevent auth failures.
   */
  getAdjustedTimestamp(): Date {
    return new Date(Date.now() + this.clockOffsetMs);
  }
}
