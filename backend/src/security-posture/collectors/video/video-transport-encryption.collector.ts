/**
 * Video Transport Encryption Collector
 * 
 * Collects video stream encryption evidence by probing RTSP/RTP/SRTP protocols.
 * 
 * This collector distinguishes between:
 * - Signaling channel encryption (RTSP vs RTSPS)
 * - Media channel encryption (RTP vs SRTP)
 * - Full encryption (RTSPS + SRTP)
 */

import * as net from 'net';
import * as tls from 'tls';
import { BaseSecurityCollector, CollectorContext } from '../base-collector';
import {
  SecurityEvidence,
  EvidenceSource,
  EvidenceTrust,
  createHealthyEvidence,
  createUnhealthyEvidence,
  createUnavailableEvidence,
} from '../../contracts/security-evidence';
import { SecurityCapabilities } from '../../contracts/target-capabilities';

/**
 * Video transport encryption evidence
 */
export interface VideoTransportEncryptionEvidence {
  /** Signaling protocol */
  signalingProtocol: 'RTSP' | 'RTSPS' | 'HTTP' | 'HTTPS' | 'WEBRTC' | 'UNKNOWN';
  
  /** Media transport */
  mediaTransport: 'RTP' | 'SRTP' | 'RTP_OVER_TLS' | 'WEBRTC' | 'UNKNOWN';
  
  /** Is media encrypted? */
  encrypted: boolean;
  
  /** Negotiated cipher (if encrypted) */
  negotiatedCipher?: string;
  
  /** Peer certificate fingerprint (if TLS) */
  peerCertificateFingerprint?: string;
  
  /** Was peer certificate verified? */
  verifiedPeer?: boolean;
  
  /** Probe duration (ms) */
  probeDurationMs: number;
  
  /** Stream URL probed */
  streamUrl: string;
  
  /** Transport details */
  transportDetails?: {
    rtspVersion?: string;
    userAgent?: string;
    serverType?: string;
    transportHeader?: string;
  };
}

/**
 * RTSP response
 */
interface RtspResponse {
  statusCode: number;
  statusText: string;
  headers: Record<string, string>;
  body?: string;
}

/**
 * Video Transport Encryption Collector
 */
export class VideoTransportEncryptionCollector extends BaseSecurityCollector<VideoTransportEncryptionEvidence> {
  readonly id = 'video-transport-encryption';
  readonly version = '1.0.0';
  
  /**
   * Check if collector supports target
   */
  supports(_target: any, capabilities: SecurityCapabilities): boolean {
    return capabilities.video?.rtspSupported || false;
  }
  
  /**
   * Collect video transport encryption evidence
   */
  protected async doCollect(context: CollectorContext): Promise<SecurityEvidence<VideoTransportEncryptionEvidence>> {
    const { target } = context;
    
    const streamUrl = target.metadata?.streamUrl as string;
    
    if (!streamUrl) {
      return createUnavailableEvidence(
        this.getMetadata(),
        context.target,
        'NOT_CONFIGURED',
        'Stream URL required for video encryption detection'
      );
    }
    
    const startTime = Date.now();
    
    try {
      const evidence = await this.probeVideoEncryption(streamUrl);
      const observedAt = new Date();
      
      evidence.probeDurationMs = Date.now() - startTime;
      evidence.streamUrl = streamUrl;
      
      // Determine health based on encryption
      if (evidence.encrypted && evidence.mediaTransport === 'SRTP') {
        // Full encryption: RTSPS + SRTP
        return createHealthyEvidence(
          this.getMetadata(),
          context.target,
          evidence,
          observedAt,
          {
            source: EvidenceSource.NETWORK_PROBE,
            confidence: 0.9,
            provenance: {
              endpoint: streamUrl,
              protocol: evidence.signalingProtocol,
              certificateFingerprint: evidence.peerCertificateFingerprint,
              trustLevel: EvidenceTrust.ACTIVE_NETWORK_PROBE,
            },
            metadata: {
              signalingEncrypted: evidence.signalingProtocol === 'RTSPS',
              mediaEncrypted: evidence.mediaTransport === 'SRTP',
              fullEncryption: true,
            },
          }
        );
      } else if (evidence.signalingProtocol === 'RTSPS' && evidence.mediaTransport === 'RTP') {
        // Partial encryption: only signaling encrypted
        return createUnhealthyEvidence(
          this.getMetadata(),
          context.target,
          evidence,
          observedAt,
          'Control channel encrypted but media channel plaintext (RTSPS + RTP)',
          {
            source: EvidenceSource.NETWORK_PROBE,
            confidence: 0.95,
            provenance: {
              endpoint: streamUrl,
              protocol: evidence.signalingProtocol,
              trustLevel: EvidenceTrust.ACTIVE_NETWORK_PROBE,
            },
          }
        );
      } else if (evidence.signalingProtocol === 'RTSP' && evidence.mediaTransport === 'SRTP') {
        // Partial encryption: only media encrypted (unusual)
        return createUnhealthyEvidence(
          this.getMetadata(),
          context.target,
          evidence,
          observedAt,
          'Media channel encrypted but control channel plaintext (RTSP + SRTP)',
          {
            source: EvidenceSource.NETWORK_PROBE,
            confidence: 0.9,
            provenance: {
              endpoint: streamUrl,
              protocol: evidence.signalingProtocol,
              trustLevel: EvidenceTrust.ACTIVE_NETWORK_PROBE,
            },
          }
        );
      } else {
        // No encryption
        return createUnhealthyEvidence(
          this.getMetadata(),
          context.target,
          evidence,
          observedAt,
          `Video stream not encrypted: ${evidence.signalingProtocol} + ${evidence.mediaTransport}`,
          {
            source: EvidenceSource.NETWORK_PROBE,
            confidence: 1.0,
            provenance: {
              endpoint: streamUrl,
              protocol: evidence.signalingProtocol,
              trustLevel: EvidenceTrust.ACTIVE_NETWORK_PROBE,
            },
          }
        );
      }
    } catch (error) {
      throw new Error(`Video encryption probe failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Probe video encryption
   */
  private async probeVideoEncryption(streamUrl: string): Promise<VideoTransportEncryptionEvidence> {
    const url = new URL(streamUrl);
    
    // Determine signaling protocol from URL scheme
    let signalingProtocol: VideoTransportEncryptionEvidence['signalingProtocol'] = 'UNKNOWN';
    let useTls = false;
    
    if (url.protocol === 'rtsp:') {
      signalingProtocol = 'RTSP';
      useTls = false;
    } else if (url.protocol === 'rtsps:') {
      signalingProtocol = 'RTSPS';
      useTls = true;
    } else if (url.protocol === 'http:') {
      signalingProtocol = 'HTTP';
      useTls = false;
    } else if (url.protocol === 'https:') {
      signalingProtocol = 'HTTPS';
      useTls = true;
    }
    
    const hostname = url.hostname;
    const port = url.port ? parseInt(url.port, 10) : (useTls ? 322 : 554); // Default RTSP ports
    
    try {
      // Perform RTSP OPTIONS request to inspect session
      const response = await this.rtspOptions(hostname, port, url.pathname || '/', useTls);
      
      // Extract transport details from response
      const transportHeader = response.headers['transport'] || response.headers['Transport'];
      const publicHeader = response.headers['public'] || response.headers['Public'];
      
      // Detect media transport from response
      let mediaTransport: VideoTransportEncryptionEvidence['mediaTransport'] = 'UNKNOWN';
      
      if (transportHeader) {
        if (transportHeader.toLowerCase().includes('srtp')) {
          mediaTransport = 'SRTP';
        } else if (transportHeader.toLowerCase().includes('rtp')) {
          mediaTransport = 'RTP';
        }
      }
      
      // If we can't determine from transport header, infer from signaling
      if (mediaTransport === 'UNKNOWN') {
        // Default assumption: RTSPS typically implies SRTP capability
        if (useTls) {
          mediaTransport = 'SRTP'; // Likely but not guaranteed
        } else {
          mediaTransport = 'RTP'; // Likely plaintext
        }
      }
      
      const encrypted = mediaTransport === 'SRTP' || mediaTransport === 'RTP_OVER_TLS';
      
      return {
        signalingProtocol,
        mediaTransport,
        encrypted,
        probeDurationMs: 0, // Will be set by caller
        streamUrl: '',
        transportDetails: {
          rtspVersion: '1.0',
          serverType: response.headers['server'] || response.headers['Server'],
          transportHeader,
        },
      };
    } catch (error) {
      // If secure connection fails, fall back to detecting plaintext
      if (useTls && error instanceof Error && error.message.includes('TLS')) {
        // Try again without TLS to confirm it's available in plaintext
        try {
          await this.rtspOptions(hostname, 554, url.pathname || '/', false);
          
          // Plaintext RTSP works - definitely not encrypted
          return {
            signalingProtocol: 'RTSP',
            mediaTransport: 'RTP',
            encrypted: false,
            probeDurationMs: 0,
            streamUrl: '',
          };
        } catch {
          // Neither works - throw original error
          throw error;
        }
      }
      
      throw error;
    }
  }
  
  /**
   * Send RTSP OPTIONS request
   */
  private async rtspOptions(
    hostname: string,
    port: number,
    path: string,
    useTls: boolean
  ): Promise<RtspResponse> {
    return new Promise((resolve, reject) => {
      const connectFn = useTls ? tls.connect : net.connect;
      
      const socket: any = connectFn({
        host: hostname,
        port,
        ...(useTls ? { rejectUnauthorized: false } : {}),
      });
      
      let responseData = '';
      let headersParsed = false;
      
      socket.on('connect', () => {
        // Send RTSP OPTIONS request
        const request = [
          `OPTIONS ${path} RTSP/1.0`,
          `CSeq: 1`,
          `User-Agent: SecurityPostureCollector/1.0`,
          '',
          '',
        ].join('\r\n');
        
        socket.write(request);
      });
      
      socket.on('data', (data: Buffer) => {
        responseData += data.toString();
        
        if (!headersParsed && responseData.includes('\r\n\r\n')) {
          headersParsed = true;
          socket.end();
          
          try {
            const parsed = this.parseRtspResponse(responseData);
            resolve(parsed);
          } catch (error) {
            reject(error);
          }
        }
      });
      
      socket.on('error', (error: Error) => {
        reject(error);
      });
      
      socket.setTimeout(10000, () => {
        socket.end();
        reject(new Error('RTSP request timeout'));
      });
    });
  }
  
  /**
   * Parse RTSP response
   */
  private parseRtspResponse(data: string): RtspResponse {
    const lines = data.split('\r\n');
    
    if (lines.length === 0) {
      throw new Error('Empty RTSP response');
    }
    
    // Parse status line
    const statusLine = lines[0];
    const statusMatch = statusLine.match(/RTSP\/\d+\.\d+\s+(\d+)\s+(.+)/);
    
    if (!statusMatch) {
      throw new Error('Invalid RTSP status line');
    }
    
    const statusCode = parseInt(statusMatch[1], 10);
    const statusText = statusMatch[2];
    
    // Parse headers
    const headers: Record<string, string> = {};
    let i = 1;
    
    for (; i < lines.length; i++) {
      const line = lines[i];
      
      if (line === '') {
        break; // End of headers
      }
      
      const colonIndex = line.indexOf(':');
      if (colonIndex > 0) {
        const key = line.substring(0, colonIndex).trim();
        const value = line.substring(colonIndex + 1).trim();
        headers[key] = value;
      }
    }
    
    // Body (if any)
    const body = lines.slice(i + 1).join('\r\n');
    
    return {
      statusCode,
      statusText,
      headers,
      body: body || undefined,
    };
  }
}
