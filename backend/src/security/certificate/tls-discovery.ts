/**
 * TLS Certificate Discovery
 * Connects to devices and retrieves actual peer certificates via TLS handshake
 * Uses rejectUnauthorized:false for discovery only - validation happens separately
 */

import * as tls from 'node:tls';
import { TLSCertificateInfo } from './types';

export interface TLSDiscoveryConfig {
  timeout: number;
  allowSelfSigned: boolean;
  minTlsVersion: string;
  maxRetries: number;
}

export interface DiscoveryResult {
  success: boolean;
  certificateInfo?: TLSCertificateInfo;
  error?: string;
  protocol?: string;
  authorized?: boolean;
}

export class TLSDiscovery {
  private config: TLSDiscoveryConfig;

  constructor(config?: Partial<TLSDiscoveryConfig>) {
    this.config = {
      timeout: config?.timeout ?? 5000,
      allowSelfSigned: config?.allowSelfSigned ?? true,
      minTlsVersion: config?.minTlsVersion ?? 'TLSv1.2',
      maxRetries: config?.maxRetries ?? 2
    };
  }

  /**
   * Discover certificate from TLS endpoint
   * Important: Uses rejectUnauthorized:false for DISCOVERY only
   * Actual trust validation happens through separate validation pipeline
   */
  async discoverCertificate(
    host: string,
    port: number,
    servername?: string
  ): Promise<DiscoveryResult> {
    let attempt = 0;

    while (attempt < this.config.maxRetries) {
      try {
        const result = await this.attemptDiscovery(host, port, servername);
        return result;
      } catch (error) {
        attempt++;
        
        if (attempt >= this.config.maxRetries) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'TLS discovery failed'
          };
        }

        // Brief delay before retry
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return {
      success: false,
      error: 'Max retries exceeded'
    };
  }

  /**
   * Attempt TLS connection and certificate retrieval
   */
  private async attemptDiscovery(
    host: string,
    port: number,
    servername?: string
  ): Promise<DiscoveryResult> {
    return new Promise((resolve, reject) => {
      const options: tls.ConnectionOptions = {
        host,
        port,
        servername: servername || host,
        
        // CRITICAL: This is for DISCOVERY only
        // It allows us to inspect untrusted device certificates
        // Actual trust validation happens via independent pipeline
        rejectUnauthorized: false,
        
        // Request peer certificate
        requestCert: true,
        
        // TLS version constraints
        minVersion: this.config.minTlsVersion as any,
        
        // Timeout for connection
        timeout: this.config.timeout
      };

      const socket = tls.connect(options);

      const timeoutHandle = setTimeout(() => {
        socket.destroy();
        reject(new Error('TLS discovery timeout'));
      }, this.config.timeout);

      socket.once('secureConnect', () => {
        try {
          clearTimeout(timeoutHandle);

          // Get peer certificate with full chain
          const peerCert = socket.getPeerCertificate(true);

          if (!peerCert || !peerCert.raw) {
            socket.end();
            resolve({
              success: false,
              error: 'Peer did not present a certificate'
            });
            return;
          }

          // Extract certificate chain
          const certificateInfo = this.extractCertificateInfo(socket, peerCert);

          socket.end();

          resolve({
            success: true,
            certificateInfo,
            protocol: socket.getProtocol() || 'unknown',
            authorized: socket.authorized
          });
        } catch (error) {
          socket.end();
          reject(error);
        }
      });

      socket.once('error', (error) => {
        clearTimeout(timeoutHandle);
        reject(error);
      });

      socket.once('timeout', () => {
        clearTimeout(timeoutHandle);
        socket.destroy();
        reject(new Error('TLS connection timeout'));
      });
    });
  }

  /**
   * Extract certificate information from TLS connection
   */
  private extractCertificateInfo(
    socket: tls.TLSSocket,
    peerCert: any
  ): TLSCertificateInfo {
    const raw = peerCert.raw as Buffer;
    const intermediates: Buffer[] = [];

    // Walk the certificate chain
    let currentCert = peerCert;
    while (currentCert.issuerCertificate && currentCert.issuerCertificate !== currentCert) {
      if (currentCert.issuerCertificate.raw) {
        intermediates.push(currentCert.issuerCertificate.raw as Buffer);
      }
      currentCert = currentCert.issuerCertificate;
    }

    // Get protocol and cipher information
    const protocol = socket.getProtocol() || 'unknown';
    const cipher = socket.getCipher();

    return {
      raw,
      peerCertificate: raw,
      intermediates,
      protocol,
      cipher: cipher ? `${cipher.name} (${cipher.version})` : 'unknown'
    };
  }

  /**
   * Discover certificate from HTTPS URL
   */
  async discoverFromUrl(url: string): Promise<DiscoveryResult> {
    try {
      const parsed = new URL(url);
      
      if (parsed.protocol !== 'https:') {
        return {
          success: false,
          error: 'URL must use HTTPS protocol'
        };
      }

      const port = parsed.port ? parseInt(parsed.port) : 443;
      const host = parsed.hostname;

      return await this.discoverCertificate(host, port);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Invalid URL'
      };
    }
  }

  /**
   * Batch discover certificates from multiple endpoints
   */
  async discoverBatch(
    endpoints: Array<{ host: string; port: number; servername?: string }>
  ): Promise<Map<string, DiscoveryResult>> {
    const results = new Map<string, DiscoveryResult>();

    const discoveries = endpoints.map(async (endpoint) => {
      const key = `${endpoint.host}:${endpoint.port}`;
      const result = await this.discoverCertificate(
        endpoint.host,
        endpoint.port,
        endpoint.servername
      );
      results.set(key, result);
    });

    await Promise.allSettled(discoveries);

    return results;
  }

  /**
   * Test TLS connection without retrieving certificate
   */
  async testConnection(
    host: string,
    port: number,
    servername?: string
  ): Promise<{
    reachable: boolean;
    protocol?: string;
    cipher?: string;
    error?: string;
  }> {
    try {
      const result = await this.attemptDiscovery(host, port, servername);
      
      if (result.success && result.certificateInfo) {
        return {
          reachable: true,
          protocol: result.protocol,
          cipher: result.certificateInfo.cipher
        };
      }

      return {
        reachable: false,
        error: result.error
      };
    } catch (error) {
      return {
        reachable: false,
        error: error instanceof Error ? error.message : 'Connection failed'
      };
    }
  }

  /**
   * Get supported TLS versions for endpoint
   */
  async getSupportedTlsVersions(
    host: string,
    port: number
  ): Promise<string[]> {
    const versions = ['TLSv1', 'TLSv1.1', 'TLSv1.2', 'TLSv1.3'];
    const supported: string[] = [];

    for (const version of versions) {
      try {
        const tempDiscovery = new TLSDiscovery({
          ...this.config,
          minTlsVersion: version,
          timeout: 3000
        });

        const result = await tempDiscovery.discoverCertificate(host, port);
        
        if (result.success && result.protocol) {
          supported.push(result.protocol);
          
          // If TLSv1.3 works, we don't need to test older versions
          if (result.protocol === 'TLSv1.3') {
            break;
          }
        }
      } catch {
        // Version not supported
      }
    }

    return supported;
  }

  /**
   * Validate discovery configuration
   */
  validateConfig(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (this.config.timeout < 1000) {
      errors.push('Timeout must be at least 1000ms');
    }

    if (this.config.timeout > 30000) {
      errors.push('Timeout must not exceed 30000ms');
    }

    if (this.config.maxRetries < 0 || this.config.maxRetries > 5) {
      errors.push('Max retries must be between 0 and 5');
    }

    const validTlsVersions = ['TLSv1', 'TLSv1.1', 'TLSv1.2', 'TLSv1.3'];
    if (!validTlsVersions.includes(this.config.minTlsVersion)) {
      errors.push(`Invalid minTlsVersion: ${this.config.minTlsVersion}`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<TLSDiscoveryConfig>): void {
    Object.assign(this.config, config);
  }

  /**
   * Get current configuration
   */
  getConfig(): TLSDiscoveryConfig {
    return { ...this.config };
  }
}

// Singleton instance
export const tlsDiscovery = new TLSDiscovery();

/**
 * Helper function for quick certificate discovery
 */
export async function discoverDeviceCertificate(
  deviceHost: string,
  devicePort: number = 443
): Promise<Buffer | null> {
  const result = await tlsDiscovery.discoverCertificate(deviceHost, devicePort);
  
  if (result.success && result.certificateInfo) {
    return result.certificateInfo.peerCertificate;
  }

  return null;
}
