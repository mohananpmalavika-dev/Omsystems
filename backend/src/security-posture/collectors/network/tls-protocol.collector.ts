/**
 * TLS Protocol Collector
 * 
 * Collects TLS protocol version evidence through direct connection probing.
 */

import * as tls from 'tls';
import { BaseSecurityCollector, CollectorContext } from '../base-collector';
import {
  SecurityEvidence,
  EvidenceSource,
  EvidenceTrust,
  createHealthyEvidence,
  createUnhealthyEvidence,
} from '../../contracts/security-evidence';
import { SecurityCapabilities } from '../../contracts/target-capabilities';

/**
 * TLS protocol evidence
 */
export interface TlsProtocolEvidence {
  /** Negotiated protocol */
  protocol: string;
  
  /** Protocol version (major.minor) */
  version: { major: number; minor: number };
  
  /** Is protocol secure? */
  secure: boolean;
  
  /** Security score (0-100) */
  score: number;
  
  /** Supported protocols */
  supportedProtocols?: string[];
  
  /** Connection latency (ms) */
  latencyMs: number;
}

/**
 * TLS Protocol Collector
 */
export class TlsProtocolCollector extends BaseSecurityCollector<TlsProtocolEvidence> {
  readonly id = 'tls-protocol';
  readonly version = '1.0.0';
  
  /**
   * Check if collector supports target
   */
  supports(_target: any, capabilities: SecurityCapabilities): boolean {
    return capabilities.tls.supported && capabilities.tls.canProbeDirectly;
  }
  
  /**
   * Collect TLS protocol evidence
   */
  protected async doCollect(context: CollectorContext): Promise<SecurityEvidence<TlsProtocolEvidence>> {
    const { target } = context;
    
    // Extract hostname and port from target metadata
    const hostname = target.metadata?.hostname as string;
    const port = (target.metadata?.port as number) || 443;
    
    if (!hostname) {
      throw new Error('Hostname required for TLS protocol collection');
    }
    
    const startTime = Date.now();
    
    try {
      const evidence = await this.probeTlsProtocol(hostname, port);
      const observedAt = new Date();
      const latencyMs = Date.now() - startTime;
      
      evidence.latencyMs = latencyMs;
      
      // Determine if healthy or unhealthy
      if (evidence.secure && evidence.score >= 80) {
        return createHealthyEvidence(
          this.getMetadata(),
          context.target,
          evidence,
          observedAt,
          {
            source: EvidenceSource.NETWORK_PROBE,
            confidence: 1.0,
            provenance: {
              endpoint: `${hostname}:${port}`,
              protocol: 'TLS',
              trustLevel: EvidenceTrust.ACTIVE_NETWORK_PROBE,
            },
            metadata: {
              probeLatencyMs: latencyMs,
              probeMethod: 'direct-tls-connection',
            },
          }
        );
      } else {
        return createUnhealthyEvidence(
          this.getMetadata(),
          context.target,
          evidence,
          observedAt,
          `Insecure TLS protocol: ${evidence.protocol} (score: ${evidence.score})`,
          {
            source: EvidenceSource.NETWORK_PROBE,
            confidence: 1.0,
            provenance: {
              endpoint: `${hostname}:${port}`,
              protocol: 'TLS',
              trustLevel: EvidenceTrust.ACTIVE_NETWORK_PROBE,
            },
          }
        );
      }
    } catch (error) {
      throw new Error(`TLS protocol probe failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Probe TLS protocol
   */
  private async probeTlsProtocol(hostname: string, port: number): Promise<TlsProtocolEvidence> {
    return new Promise((resolve, reject) => {
      const options: tls.ConnectionOptions = {
        host: hostname,
        port,
        servername: hostname,
        rejectUnauthorized: false, // We're only checking protocol, not cert validity
      };
      
      const socket = tls.connect(options, () => {
        try {
          const protocol = socket.getProtocol();
          const cipher = socket.getCipher();
          
          if (!protocol) {
            socket.end();
            return reject(new Error('No protocol negotiated'));
          }
          
          const evaluation = this.evaluateProtocol(protocol);
          
          socket.end();
          
          resolve({
            protocol,
            version: this.parseProtocolVersion(protocol),
            secure: evaluation.secure,
            score: evaluation.score,
            latencyMs: 0, // Will be set by caller
          });
        } catch (error) {
          socket.end();
          reject(error);
        }
      });
      
      socket.on('error', reject);
      
      socket.setTimeout(10000, () => {
        socket.end();
        reject(new Error('TLS connection timeout'));
      });
    });
  }
  
  /**
   * Evaluate protocol security
   */
  private evaluateProtocol(protocol: string): { secure: boolean; score: number } {
    const proto = protocol.toUpperCase();
    
    if (proto === 'TLSV1.3' || proto === 'TLS1.3') {
      return { secure: true, score: 100 };
    }
    
    if (proto === 'TLSV1.2' || proto === 'TLS1.2') {
      return { secure: true, score: 90 };
    }
    
    if (proto === 'TLSV1.1' || proto === 'TLS1.1') {
      return { secure: false, score: 30 };
    }
    
    if (proto === 'TLSV1' || proto === 'TLS1.0' || proto === 'TLS1') {
      return { secure: false, score: 20 };
    }
    
    if (proto.startsWith('SSL')) {
      return { secure: false, score: 0 };
    }
    
    // Unknown protocol
    return { secure: false, score: 0 };
  }
  
  /**
   * Parse protocol version
   */
  private parseProtocolVersion(protocol: string): { major: number; minor: number } {
    const match = protocol.match(/(\d+)\.(\d+)/);
    
    if (match) {
      return {
        major: parseInt(match[1], 10),
        minor: parseInt(match[2], 10),
      };
    }
    
    // Default for unparseable
    return { major: 0, minor: 0 };
  }
}
