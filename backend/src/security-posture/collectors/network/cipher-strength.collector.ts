/**
 * Cipher Strength Collector
 * 
 * Collects cipher suite strength evidence through TLS negotiation.
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
 * Cipher strength evidence
 */
export interface CipherStrengthEvidence {
  /** Cipher suite name */
  cipherName: string;
  
  /** Key size (bits) */
  bits?: number;
  
  /** Is cipher secure? */
  secure: boolean;
  
  /** Security score (0-100) */
  score: number;
  
  /** Cipher components */
  components?: {
    keyExchange?: string;
    authentication?: string;
    encryption?: string;
    mac?: string;
  };
  
  /** Vulnerabilities */
  vulnerabilities?: string[];
}

/**
 * Cipher Strength Collector
 */
export class CipherStrengthCollector extends BaseSecurityCollector<CipherStrengthEvidence> {
  readonly id = 'cipher-strength';
  readonly version = '1.0.0';
  
  /**
   * Check if collector supports target
   */
  supports(_target: any, capabilities: SecurityCapabilities): boolean {
    return capabilities.tls.supported && capabilities.tls.canProbeDirectly;
  }
  
  /**
   * Collect cipher strength evidence
   */
  protected async doCollect(context: CollectorContext): Promise<SecurityEvidence<CipherStrengthEvidence>> {
    const { target } = context;
    
    const hostname = target.metadata?.hostname as string;
    const port = (target.metadata?.port as number) || 443;
    
    if (!hostname) {
      throw new Error('Hostname required for cipher strength collection');
    }
    
    try {
      const evidence = await this.probeCipherStrength(hostname, port);
      const observedAt = new Date();
      
      // Determine health based on cipher security
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
          }
        );
      } else {
        const reason = evidence.vulnerabilities && evidence.vulnerabilities.length > 0
          ? `Weak cipher with vulnerabilities: ${evidence.vulnerabilities.join(', ')}`
          : `Weak cipher: ${evidence.cipherName} (score: ${evidence.score})`;
        
        return createUnhealthyEvidence(
          this.getMetadata(),
          context.target,
          evidence,
          observedAt,
          reason,
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
      throw new Error(`Cipher strength probe failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Probe cipher strength
   */
  private async probeCipherStrength(hostname: string, port: number): Promise<CipherStrengthEvidence> {
    return new Promise((resolve, reject) => {
      const options: tls.ConnectionOptions = {
        host: hostname,
        port,
        servername: hostname,
        rejectUnauthorized: false,
      };
      
      const socket = tls.connect(options, () => {
        try {
          const cipher = socket.getCipher();
          
          if (!cipher || !cipher.name) {
            socket.end();
            return reject(new Error('No cipher negotiated'));
          }
          
          const evaluation = this.evaluateCipher(cipher.name, cipher.version);
          
          socket.end();
          
          resolve({
            cipherName: cipher.name,
            bits: cipher.version ? undefined : (cipher as any).bits, // bits may not be available in all Node versions
            secure: evaluation.secure,
            score: evaluation.score,
            components: this.parseCipherComponents(cipher.name),
            vulnerabilities: evaluation.vulnerabilities,
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
   * Evaluate cipher security
   */
  private evaluateCipher(
    cipherName: string,
    _version?: string
  ): { secure: boolean; score: number; vulnerabilities: string[] } {
    const name = cipherName.toUpperCase();
    const vulnerabilities: string[] = [];
    let score = 50; // Default moderate
    let secure = false;
    
    // Strong modern ciphers
    if (name.includes('AES256-GCM') || name.includes('AES_256_GCM')) {
      score = 100;
      secure = true;
    } else if (name.includes('CHACHA20') || name.includes('POLY1305')) {
      score = 100;
      secure = true;
    } else if (name.includes('AES128-GCM') || name.includes('AES_128_GCM')) {
      score = 95;
      secure = true;
    }
    // Good ciphers
    else if (name.includes('AES256') || name.includes('AES_256')) {
      score = 85;
      secure = true;
    } else if (name.includes('AES128') || name.includes('AES_128')) {
      score = 80;
      secure = true;
    }
    // Weak ciphers
    else if (name.includes('3DES') || name.includes('DES-CBC3')) {
      score = 30;
      secure = false;
      vulnerabilities.push('3DES-SWEET32');
    } else if (name.includes('RC4')) {
      score = 10;
      secure = false;
      vulnerabilities.push('RC4-NOMORE');
    } else if (name.includes('DES') || name.includes('EXPORT')) {
      score = 0;
      secure = false;
      vulnerabilities.push('OBSOLETE-CIPHER');
    }
    
    // Check for weak key exchange
    if (name.includes('RSA')) {
      // RSA key exchange (no forward secrecy)
      score = Math.max(0, score - 10);
    } else if (name.includes('ECDHE') || name.includes('DHE')) {
      // Good: forward secrecy
      score = Math.min(100, score + 5);
    }
    
    // Check for no encryption
    if (name.includes('NULL') || name.includes('NONE')) {
      score = 0;
      secure = false;
      vulnerabilities.push('NO-ENCRYPTION');
    }
    
    // Check for weak MAC
    if (name.includes('MD5')) {
      score = Math.max(0, score - 20);
      vulnerabilities.push('WEAK-MAC-MD5');
    } else if (name.includes('SHA1') && !name.includes('SHA256')) {
      score = Math.max(0, score - 10);
      vulnerabilities.push('WEAK-MAC-SHA1');
    }
    
    return { secure, score, vulnerabilities };
  }
  
  /**
   * Parse cipher components
   */
  private parseCipherComponents(cipherName: string): {
    keyExchange?: string;
    authentication?: string;
    encryption?: string;
    mac?: string;
  } {
    const components: any = {};
    const name = cipherName.toUpperCase();
    
    // Key exchange
    if (name.includes('ECDHE')) {
      components.keyExchange = 'ECDHE';
    } else if (name.includes('DHE')) {
      components.keyExchange = 'DHE';
    } else if (name.includes('RSA')) {
      components.keyExchange = 'RSA';
    }
    
    // Authentication
    if (name.includes('ECDSA')) {
      components.authentication = 'ECDSA';
    } else if (name.includes('RSA')) {
      components.authentication = 'RSA';
    }
    
    // Encryption
    if (name.includes('AES256-GCM') || name.includes('AES_256_GCM')) {
      components.encryption = 'AES-256-GCM';
    } else if (name.includes('AES128-GCM') || name.includes('AES_128_GCM')) {
      components.encryption = 'AES-128-GCM';
    } else if (name.includes('AES256') || name.includes('AES_256')) {
      components.encryption = 'AES-256';
    } else if (name.includes('AES128') || name.includes('AES_128')) {
      components.encryption = 'AES-128';
    } else if (name.includes('CHACHA20')) {
      components.encryption = 'ChaCha20';
    } else if (name.includes('3DES')) {
      components.encryption = '3DES';
    } else if (name.includes('RC4')) {
      components.encryption = 'RC4';
    }
    
    // MAC
    if (name.includes('SHA384')) {
      components.mac = 'SHA-384';
    } else if (name.includes('SHA256')) {
      components.mac = 'SHA-256';
    } else if (name.includes('SHA1')) {
      components.mac = 'SHA-1';
    } else if (name.includes('MD5')) {
      components.mac = 'MD5';
    } else if (name.includes('POLY1305')) {
      components.mac = 'Poly1305';
    }
    
    return components;
  }
}
