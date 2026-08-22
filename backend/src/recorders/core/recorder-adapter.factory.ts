/**
 * Recorder Adapter Factory
 * 
 * Creates appropriate adapter instances based on recorder type.
 * Handles adapter configuration and initialization.
 */

import { OnvifRecorderAdapter } from '../adapters/onvif/onvif-recorder-adapter.js';
import { HikvisionRecorderAdapter } from '../adapters/hikvision/hikvision-recorder-adapter.js';
import type { RecorderCredentials } from '../transport/recorder-auth.js';
import { logger } from '../../utils/logger.js';

/**
 * Adapter configuration
 */
export interface AdapterConfig {
  /**
   * Adapter type
   */
  type: 'onvif' | 'hikvision' | 'dahua' | 'generic_rtsp';

  /**
   * Recorder ID
   */
  recorderId: string;

  /**
   * Recorder URL (base URL for API)
   */
  recorderUrl: string;

  /**
   * Credentials
   */
  credentials: RecorderCredentials;

  /**
   * Request timeout (ms)
   */
  timeoutMs?: number;

  /**
   * TLS verification
   */
  tlsVerify?: boolean;

  /**
   * Additional adapter-specific options
   */
  options?: Record<string, any>;
}

/**
 * Recorder adapter interface
 * 
 * All adapters must implement these methods.
 */
export interface RecorderAdapter {
  getType(): string;
  probe(): Promise<any>;
  testConnection(): Promise<any>;
  testAuthentication(): Promise<any>;
  getDeviceInfo(): Promise<any>;
  getDeviceTime(): Promise<any>;
  getCapabilities(): Promise<any>;
  getChannels(): Promise<any>;
  getChannel(channelId: string): Promise<any>;
  searchRecordings(request: any): Promise<any>;
  getStorageStatus(): Promise<any>;
  destroy(): void;
}

/**
 * Recorder Adapter Factory
 */
export class RecorderAdapterFactory {
  /**
   * Create adapter instance
   */
  async createAdapter(config: AdapterConfig): Promise<RecorderAdapter> {
    logger.debug('Creating recorder adapter', {
      recorderId: config.recorderId,
      type: config.type,
      url: this.sanitizeUrl(config.recorderUrl)
    });

    switch (config.type) {
      case 'onvif':
        return this.createOnvifAdapter(config);

      case 'hikvision':
        return this.createHikvisionAdapter(config);

      case 'dahua':
        // TODO: Implement Dahua adapter
        throw new Error('Dahua adapter not yet implemented');

      case 'generic_rtsp':
        // TODO: Implement generic RTSP adapter
        throw new Error('Generic RTSP adapter not yet implemented');

      default:
        throw new Error(`Unknown adapter type: ${config.type}`);
    }
  }

  /**
   * Create ONVIF adapter
   */
  private createOnvifAdapter(config: AdapterConfig): OnvifRecorderAdapter {
    return new OnvifRecorderAdapter({
      recorderId: config.recorderId,
      recorderUrl: config.recorderUrl,
      credentials: config.credentials,
      timeoutMs: config.timeoutMs ?? 10000,
      tlsVerify: config.tlsVerify ?? false,
      endpoints: config.options?.endpoints
    });
  }

  /**
   * Create Hikvision adapter
   */
  private createHikvisionAdapter(config: AdapterConfig): HikvisionRecorderAdapter {
    return new HikvisionRecorderAdapter({
      recorderId: config.recorderId,
      recorderUrl: config.recorderUrl,
      credentials: config.credentials,
      timeoutMs: config.timeoutMs ?? 10000,
      tlsVerify: config.tlsVerify ?? false
    });
  }

  /**
   * Sanitize URL for logging (remove credentials)
   */
  private sanitizeUrl(url: string): string {
    try {
      const parsed = new URL(url);
      parsed.username = '';
      parsed.password = '';
      return parsed.toString();
    } catch {
      return url;
    }
  }

  /**
   * Detect adapter type from URL or probe
   * 
   * This is a simple heuristic. For accurate detection,
   * use RecorderEvidenceService.probeRecorder().
   */
  detectAdapterType(url: string): 'onvif' | 'hikvision' | 'dahua' | 'generic_rtsp' {
    const lower = url.toLowerCase();

    // Check for vendor-specific patterns
    if (lower.includes('hikvision') || lower.includes('/ISAPI')) {
      return 'hikvision';
    }

    if (lower.includes('dahua')) {
      return 'dahua';
    }

    // Default to ONVIF (most universal)
    return 'onvif';
  }
}
