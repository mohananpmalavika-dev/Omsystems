/**
 * TLS Scanner Provider
 * 
 * Provides actual TLS connection and certificate inspection capabilities.
 */

import * as tls from 'tls';
import * as https from 'https';

/**
 * TLS inspection result
 */
export interface TLSInspection {
  /** Whether TLS connection was successful */
  reachable: boolean;
  
  /** TLS protocol version */
  protocol?: string;
  
  /** Cipher information */
  cipher?: {
    name: string;
    version?: string;
    bits?: number;
  };
  
  /** Certificate information */
  certificate?: CertificateInfo;
  
  /** OCSP stapling status */
  ocspStapled?: boolean;
  
  /** Connection latency (ms) */
  latencyMs?: number;
}

/**
 * Certificate information
 */
export interface CertificateInfo {
  subject: string;
  issuer: string;
  subjectAltNames?: string[];
  validFrom: Date;
  validUntil: Date;
  serialNumber: string;
  fingerprint: string;
  fingerprintSHA256: string;
  hostnameValid: boolean;
  chainValid: boolean;
  selfSigned: boolean;
  daysRemaining: number;
}

/**
 * HTTPS enforcement check result
 */
export interface HttpsEnforcementCheck {
  httpReachable: boolean;
  redirectsToHttps: boolean;
  redirectTarget?: string;
  redirectStatusCode?: number;
  hsts?: {
    enabled: boolean;
    maxAge?: number;
    includeSubDomains?: boolean;
    preload?: boolean;
  };
}

/**
 * TLS Scanner Provider
 */
export class TlsScannerProvider {
  /**
   * Inspect TLS configuration of an endpoint
   */
  async inspectTls(
    hostname: string,
    port: number = 443,
    options: { timeout?: number; servername?: string } = {}
  ): Promise<TLSInspection> {
    const startTime = Date.now();
    const timeout = options.timeout ?? 5000;
    
    return new Promise((resolve, reject) => {
      const socket = tls.connect({
        host: hostname,
        port,
        servername: options.servername ?? hostname,
        rejectUnauthorized: false, // We want to inspect even invalid certs
      });
      
      const timeoutHandle = setTimeout(() => {
        socket.destroy();
        reject(new Error('TLS connection timeout'));
      }, timeout);
      
      socket.once('secureConnect', () => {
        clearTimeout(timeoutHandle);
        
        try {
          const cert = socket.getPeerCertificate(true);
          const cipher = socket.getCipher();
          const protocol = socket.getProtocol();
          
          const latencyMs = Date.now() - startTime;
          
          const result: TLSInspection = {
            reachable: true,
            protocol: protocol ?? undefined,
            cipher: cipher ? {
              name: cipher.name,
              version: cipher.version,
              bits: cipher.bits,
            } : undefined,
            certificate: this.parseCertificate(cert, hostname, socket.authorized),
            latencyMs,
          };
          
          socket.end();
          resolve(result);
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
        reject(new Error('Socket timeout'));
      });
    });
  }
  
  /**
   * Parse certificate information
   */
  private parseCertificate(
    cert: tls.DetailedPeerCertificate,
    hostname: string,
    authorized: boolean
  ): CertificateInfo {
    const validFrom = new Date(cert.valid_from);
    const validUntil = new Date(cert.valid_to);
    const now = Date.now();
    const daysRemaining = Math.floor((validUntil.getTime() - now) / (1000 * 60 * 60 * 24));
    
    // Check hostname validity
    const hostnameValid = this.checkHostnameValidity(cert, hostname);
    
    return {
      subject: this.formatDN(cert.subject),
      issuer: this.formatDN(cert.issuer),
      subjectAltNames: cert.subjectaltname?.split(', ').map(s => s.replace(/^DNS:/, '')),
      validFrom,
      validUntil,
      serialNumber: cert.serialNumber,
      fingerprint: cert.fingerprint,
      fingerprintSHA256: cert.fingerprint256,
      hostnameValid,
      chainValid: authorized,
      selfSigned: this.formatDN(cert.subject) === this.formatDN(cert.issuer),
      daysRemaining,
    };
  }
  
  /**
   * Format distinguished name
   */
  private formatDN(dn: tls.Certificate['subject'] | tls.Certificate['issuer']): string {
    if (typeof dn === 'string') return dn;
    
    const parts: string[] = [];
    if (dn.CN) parts.push(`CN=${dn.CN}`);
    if (dn.O) parts.push(`O=${dn.O}`);
    if (dn.OU) parts.push(`OU=${dn.OU}`);
    if (dn.C) parts.push(`C=${dn.C}`);
    
    return parts.join(', ') || JSON.stringify(dn);
  }
  
  /**
   * Check if certificate is valid for hostname
   */
  private checkHostnameValidity(cert: tls.DetailedPeerCertificate, hostname: string): boolean {
    // Simple check - in production, use proper certificate hostname validation
    const cn = cert.subject?.CN;
    if (cn === hostname) return true;
    
    // Check SANs
    if (cert.subjectaltname) {
      const sans = cert.subjectaltname.split(', ').map(s => s.replace(/^DNS:/, ''));
      if (sans.includes(hostname)) return true;
      
      // Check wildcards
      for (const san of sans) {
        if (san.startsWith('*.')) {
          const domain = san.substring(2);
          if (hostname.endsWith(domain)) return true;
        }
      }
    }
    
    return false;
  }
  
  /**
   * Check HTTPS enforcement
   */
  async checkHttpsEnforcement(
    hostname: string,
    options: { timeout?: number } = {}
  ): Promise<HttpsEnforcementCheck> {
    const timeout = options.timeout ?? 5000;
    
    return new Promise((resolve) => {
      const req = https.request({
        hostname,
        port: 80,
        path: '/',
        method: 'HEAD',
        timeout,
        // Don't follow redirects automatically
        agent: new https.Agent({ maxRedirects: 0 }),
      });
      
      req.once('response', (res) => {
        const location = res.headers['location'];
        const hstsHeader = res.headers['strict-transport-security'];
        
        const result: HttpsEnforcementCheck = {
          httpReachable: true,
          redirectsToHttps: false,
        };
        
        // Check if redirects to HTTPS
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && location) {
          result.redirectsToHttps = location.startsWith('https://');
          result.redirectTarget = location;
          result.redirectStatusCode = res.statusCode;
        }
        
        // Parse HSTS header
        if (hstsHeader) {
          result.hsts = this.parseHstsHeader(hstsHeader as string);
        }
        
        resolve(result);
      });
      
      req.once('error', () => {
        resolve({
          httpReachable: false,
          redirectsToHttps: false,
        });
      });
      
      req.once('timeout', () => {
        req.destroy();
        resolve({
          httpReachable: false,
          redirectsToHttps: false,
        });
      });
      
      req.end();
    });
  }
  
  /**
   * Parse HSTS header
   */
  private parseHstsHeader(header: string): HttpsEnforcementCheck['hsts'] {
    const parts = header.split(';').map(p => p.trim());
    const hsts: HttpsEnforcementCheck['hsts'] = {
      enabled: true,
    };
    
    for (const part of parts) {
      if (part.startsWith('max-age=')) {
        hsts.maxAge = parseInt(part.substring(8), 10);
      } else if (part === 'includeSubDomains') {
        hsts.includeSubDomains = true;
      } else if (part === 'preload') {
        hsts.preload = true;
      }
    }
    
    return hsts;
  }
}
