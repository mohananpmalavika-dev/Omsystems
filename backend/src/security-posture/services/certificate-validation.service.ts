/**
 * Certificate Validation Service
 * 
 * Reusable certificate validation engine for:
 * - Chain validation
 * - Expiry checking
 * - OCSP revocation
 * - CRL checking
 * - Certificate Transparency verification
 * - Rotation tracking
 */

import * as tls from 'tls';
import * as https from 'https';
import * as crypto from 'crypto';

/**
 * Certificate information
 */
export interface CertificateInfo {
  /** Subject DN */
  subject: string;
  
  /** Issuer DN */
  issuer: string;
  
  /** Serial number */
  serialNumber: string;
  
  /** Valid from */
  validFrom: Date;
  
  /** Valid until */
  validUntil: Date;
  
  /** Subject Alternative Names */
  subjectAltNames: string[];
  
  /** Fingerprint SHA256 */
  fingerprintSHA256: string;
  
  /** Fingerprint SHA1 */
  fingerprintSHA1: string;
  
  /** Public key algorithm */
  publicKeyAlgorithm?: string;
  
  /** Public key size (bits) */
  publicKeySize?: number;
  
  /** Signature algorithm */
  signatureAlgorithm?: string;
  
  /** Raw certificate (PEM) */
  raw?: string;
}

/**
 * Certificate chain validation result
 */
export interface ChainValidationResult {
  /** Is chain valid? */
  valid: boolean;
  
  /** Chain length */
  chainLength: number;
  
  /** Certificate chain */
  chain: CertificateInfo[];
  
  /** Validation errors */
  errors: string[];
  
  /** Is self-signed? */
  selfSigned: boolean;
  
  /** Trust anchor found? */
  trustAnchorFound: boolean;
}

/**
 * Certificate expiry check result
 */
export interface ExpiryCheckResult {
  /** Is certificate expired? */
  expired: boolean;
  
  /** Days until expiry (negative if expired) */
  daysUntilExpiry: number;
  
  /** Expires within 30 days? */
  expiresWithin30Days: boolean;
  
  /** Expires within 90 days? */
  expiresWithin90Days: boolean;
  
  /** Valid from */
  validFrom: Date;
  
  /** Valid until */
  validUntil: Date;
}

/**
 * Hostname validation result
 */
export interface HostnameValidationResult {
  /** Does certificate match hostname? */
  valid: boolean;
  
  /** Matched pattern (if any) */
  matchedPattern?: string;
  
  /** Validation method */
  method: 'exact' | 'wildcard' | 'san' | 'cn' | 'none';
  
  /** Errors */
  errors: string[];
}

/**
 * OCSP check result
 */
export interface OcspCheckResult {
  /** OCSP responder reachable? */
  reachable: boolean;
  
  /** Certificate status */
  status: 'GOOD' | 'REVOKED' | 'UNKNOWN';
  
  /** Response produced at */
  producedAt?: Date;
  
  /** This update */
  thisUpdate?: Date;
  
  /** Next update */
  nextUpdate?: Date;
  
  /** Responder verified? */
  responderVerified: boolean;
  
  /** Revocation time (if revoked) */
  revocationTime?: Date;
  
  /** Revocation reason (if revoked) */
  revocationReason?: string;
  
  /** Error message */
  error?: string;
}

/**
 * OCSP stapling check result
 */
export interface OcspStaplingResult {
  /** Was OCSP response stapled? */
  stapled: boolean;
  
  /** Stapled response status */
  status?: 'GOOD' | 'REVOKED' | 'UNKNOWN';
  
  /** Response produced at */
  producedAt?: Date;
  
  /** This update */
  thisUpdate?: Date;
  
  /** Next update */
  nextUpdate?: Date;
  
  /** Responder verified? */
  responderVerified?: boolean;
}

/**
 * CRL check result
 */
export interface CrlCheckResult {
  /** CRL reachable? */
  reachable: boolean;
  
  /** Certificate revoked? */
  revoked: boolean;
  
  /** CRL issued at */
  thisUpdate?: Date;
  
  /** CRL next update */
  nextUpdate?: Date;
  
  /** Revocation time (if revoked) */
  revocationTime?: Date;
  
  /** Error message */
  error?: string;
}

/**
 * Certificate Transparency check result
 */
export interface CtCheckResult {
  /** SCTs present? */
  sctsPresent: boolean;
  
  /** Valid SCT count */
  validSctCount: number;
  
  /** Invalid SCT count */
  invalidSctCount: number;
  
  /** Recognized CT logs */
  recognizedLogs: string[];
  
  /** Inclusion proof checked? */
  inclusionProofChecked: boolean;
  
  /** Inclusion verified? */
  inclusionVerified: boolean | null;
  
  /** Errors */
  errors: string[];
}

/**
 * Certificate rotation history entry
 */
export interface CertificateRotationEntry {
  /** Fingerprint */
  fingerprint: string;
  
  /** Observed at */
  observedAt: Date;
  
  /** Valid from */
  validFrom: Date;
  
  /** Valid until */
  validUntil: Date;
  
  /** Subject */
  subject: string;
  
  /** Issuer */
  issuer: string;
}

/**
 * Certificate rotation analysis
 */
export interface RotationAnalysis {
  /** Rotation history */
  history: CertificateRotationEntry[];
  
  /** Last rotation date */
  lastRotationAt?: Date;
  
  /** Previous certificate */
  previousCertificate?: CertificateRotationEntry;
  
  /** Current certificate */
  currentCertificate?: CertificateRotationEntry;
  
  /** Days between rotations */
  daysBetweenRotations?: number;
  
  /** Days before expiry when rotated */
  daysBeforeExpiryWhenRotated?: number;
  
  /** Same key reused? */
  sameKeyReused?: boolean;
  
  /** Issuer changed? */
  issuerChanged?: boolean;
  
  /** Rotation compliant? */
  compliant: boolean;
  
  /** Rotation policy violations */
  violations: string[];
}

/**
 * Certificate Validation Service
 */
export class CertificateValidationService {
  /**
   * Parse certificate from PEM
   */
  parseCertificate(pemCert: string): CertificateInfo | null {
    try {
      // This is a simplified implementation
      // Real implementation would use node-forge or similar library
      
      const cert = crypto.createPublicKey({
        key: pemCert,
        format: 'pem',
      });
      
      // Extract certificate fields (simplified)
      const fingerprintSHA256 = crypto
        .createHash('sha256')
        .update(pemCert)
        .digest('hex')
        .toUpperCase()
        .match(/.{2}/g)!
        .join(':');
      
      const fingerprintSHA1 = crypto
        .createHash('sha1')
        .update(pemCert)
        .digest('hex')
        .toUpperCase()
        .match(/.{2}/g)!
        .join(':');
      
      // Placeholder - real implementation would parse X.509 structure
      return {
        subject: 'CN=unknown',
        issuer: 'CN=unknown',
        serialNumber: '00',
        validFrom: new Date(),
        validUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        subjectAltNames: [],
        fingerprintSHA256,
        fingerprintSHA1,
        raw: pemCert,
      };
    } catch (error) {
      console.error('Failed to parse certificate:', error);
      return null;
    }
  }

  /**
   * Validate certificate chain
   */
  private async inspectCertificateChain(
    hostname: string,
    port: number = 443
  ): Promise<ChainValidationResult> {

    return new Promise((resolve) => {
      try {
        const { defaultTlsScannerPolicy } = require('../../../../src/security/tls/index');
        defaultTlsScannerPolicy.assertTargetAllowed(hostname, port);
      } catch (policyErr: any) {
        return resolve({
          valid: false,
          chainLength: 0,
          chain: [],
          errors: [`SSRF Policy blocked scan: ${policyErr.message}`],
          warnings: [],
        });
      }

      const options: tls.ConnectionOptions = {
        host: hostname,
        port,
        servername: hostname,
        /**
         * SECURITY EXCEPTION:
         * id=CERTIFICATE_INSPECTION
         * reason=Must inspect invalid/untrusted peer certificates to report posture findings.
         * scope=Certificate Validation Service only. Must not be used for application traffic.
         */
        rejectUnauthorized: false,
      };
      
      const socket = tls.connect(options, () => {
        try {
          const peerCert = socket.getPeerCertificate(true);
          
          if (!peerCert || Object.keys(peerCert).length === 0) {
            socket.end();
            return resolve({
              valid: false,
              chainLength: 0,
              chain: [],
              errors: ['No certificate presented'],
              selfSigned: false,
              trustAnchorFound: false,
            });
          }
          
          // Build chain
          const chain: CertificateInfo[] = [];
          let current: any = peerCert;
          let chainLength = 0;
          const maxChainLength = 10;
          
          while (current && chainLength < maxChainLength) {
            chain.push({
              subject: current.subject?.CN || 'Unknown',
              issuer: current.issuer?.CN || 'Unknown',
              serialNumber: current.serialNumber || '',
              validFrom: new Date(current.valid_from),
              validUntil: new Date(current.valid_to),
              subjectAltNames: current.subjectaltname?.split(', ').map((s: string) => s.replace(/^DNS:/, '')) || [],
              fingerprintSHA256: current.fingerprint256 || '',
              fingerprintSHA1: current.fingerprint || '',
            });
            
            chainLength++;
            
            // Check if self-signed or end of chain
            if (!current.issuerCertificate || current.issuerCertificate === current) {
              break;
            }
            
            current = current.issuerCertificate;
          }
          
          const selfSigned = peerCert.subject?.CN === peerCert.issuer?.CN;
          const authorized = socket.authorized;
          const authError = socket.authorizationError;
          
          socket.end();
          
          resolve({
            valid: authorized,
            chainLength: chain.length,
            chain,
            errors: authError ? [authError.toString()] : [],
            selfSigned,
            trustAnchorFound: authorized && !selfSigned,
          });
        } catch (error) {
          socket.end();
          resolve({
            valid: false,
            chainLength: 0,
            chain: [],
            errors: [error instanceof Error ? error.message : String(error)],
            selfSigned: false,
            trustAnchorFound: false,
          });
        }
      });
      
      socket.on('error', (error) => {
        resolve({
          valid: false,
          chainLength: 0,
          chain: [],
          errors: [error.message],
          selfSigned: false,
          trustAnchorFound: false,
        });
      });
      
      socket.setTimeout(10000, () => {
        socket.end();
        resolve({
          valid: false,
          chainLength: 0,
          chain: [],
          errors: ['Connection timeout'],
          selfSigned: false,
          trustAnchorFound: false,
        });
      });
    });
  }
  
  /**
   * Check certificate expiry
   */
  checkExpiry(cert: CertificateInfo): ExpiryCheckResult {
    const now = Date.now();
    const validUntil = cert.validUntil.getTime();
    const msUntilExpiry = validUntil - now;
    const daysUntilExpiry = Math.floor(msUntilExpiry / (24 * 60 * 60 * 1000));
    
    return {
      expired: msUntilExpiry < 0,
      daysUntilExpiry,
      expiresWithin30Days: daysUntilExpiry >= 0 && daysUntilExpiry <= 30,
      expiresWithin90Days: daysUntilExpiry >= 0 && daysUntilExpiry <= 90,
      validFrom: cert.validFrom,
      validUntil: cert.validUntil,
    };
  }
  
  /**
   * Validate hostname against certificate
   */
  validateHostname(cert: CertificateInfo, hostname: string): HostnameValidationResult {
    const errors: string[] = [];
    
    // Check Subject Alternative Names first
    for (const san of cert.subjectAltNames) {
      if (this.matchesHostname(san, hostname)) {
        return {
          valid: true,
          matchedPattern: san,
          method: san.includes('*') ? 'wildcard' : 'san',
          errors: [],
        };
      }
    }
    
    // Check Common Name
    const cn = cert.subject.match(/CN=([^,]+)/)?.[1];
    if (cn && this.matchesHostname(cn, hostname)) {
      return {
        valid: true,
        matchedPattern: cn,
        method: cn.includes('*') ? 'wildcard' : 'cn',
        errors: [],
      };
    }
    
    errors.push(`Hostname ${hostname} does not match certificate`);
    
    return {
      valid: false,
      method: 'none',
      errors,
    };
  }
  
  /**
   * Check hostname match (supports wildcards)
   */
  private matchesHostname(pattern: string, hostname: string): boolean {
    pattern = pattern.toLowerCase();
    hostname = hostname.toLowerCase();
    
    if (pattern === hostname) {
      return true;
    }
    
    if (pattern.startsWith('*.')) {
      const domain = pattern.substring(2);
      return hostname.endsWith('.' + domain) || hostname === domain;
    }
    
    return false;
  }
  
  /**
   * Check OCSP revocation status
   */
  async checkOcsp(
    cert: CertificateInfo,
    issuerCert?: CertificateInfo
  ): Promise<OcspCheckResult> {
    // Placeholder implementation
    // Real implementation would:
    // 1. Extract OCSP responder URL from certificate
    // 2. Build OCSP request
    // 3. Send request to responder
    // 4. Verify response signature
    // 5. Check certificate status
    
    return {
      reachable: false,
      status: 'UNKNOWN',
      responderVerified: false,
      error: 'OCSP checking not yet implemented',
    };
  }
  
  /**
   * Check for OCSP stapling in TLS handshake
   */
  async checkOcspStapling(
    hostname: string,
    port: number = 443
  ): Promise<OcspStaplingResult> {
    // Placeholder implementation
    // Real implementation would:
    // 1. Request OCSP stapling in TLS handshake
    // 2. Extract stapled response
    // 3. Verify responder signature
    // 4. Parse response status
    
    return {
      stapled: false,
    };
  }
  
  /**
   * Check CRL revocation status
   */
  async checkCrl(cert: CertificateInfo): Promise<CrlCheckResult> {
    // Placeholder implementation
    // Real implementation would:
    // 1. Extract CRL distribution points from certificate
    // 2. Download CRL
    // 3. Verify CRL signature
    // 4. Check if certificate serial is in CRL
    
    return {
      reachable: false,
      revoked: false,
      error: 'CRL checking not yet implemented',
    };
  }
  
  /**
   * Verify Certificate Transparency
   */
  async verifyCertificateTransparency(cert: CertificateInfo): Promise<CtCheckResult> {
    // Placeholder implementation
    // Real implementation would:
    // 1. Extract SCTs from certificate or TLS extension
    // 2. Validate SCT signatures against known CT logs
    // 3. Optionally verify inclusion proof
    
    return {
      sctsPresent: false,
      validSctCount: 0,
      invalidSctCount: 0,
      recognizedLogs: [],
      inclusionProofChecked: false,
      inclusionVerified: null,
      errors: ['CT verification not yet implemented'],
    };
  }
  
  /**
   * Analyze certificate rotation
   */
  analyzeRotation(
    history: CertificateRotationEntry[],
    policy?: {
      minDaysBetweenRotations?: number;
      maxDaysBetweenRotations?: number;
      minDaysBeforeExpiry?: number;
      requireDifferentKey?: boolean;
      requireSameIssuer?: boolean;
    }
  ): RotationAnalysis {
    if (history.length < 2) {
      return {
        history,
        compliant: true,
        violations: [],
      };
    }
    
    // Sort by observation date
    const sorted = [...history].sort((a, b) => 
      b.observedAt.getTime() - a.observedAt.getTime()
    );
    
    const current = sorted[0];
    const previous = sorted[1];
    
    const daysBetween = Math.floor(
      (current.observedAt.getTime() - previous.observedAt.getTime()) / 
      (24 * 60 * 60 * 1000)
    );
    
    const daysBeforeExpiry = Math.floor(
      (previous.validUntil.getTime() - current.observedAt.getTime()) / 
      (24 * 60 * 60 * 1000)
    );
    
    const sameKeyReused = current.fingerprint === previous.fingerprint;
    const issuerChanged = current.issuer !== previous.issuer;
    
    const violations: string[] = [];
    
    // Check policy compliance
    if (policy) {
      if (policy.minDaysBetweenRotations && daysBetween < policy.minDaysBetweenRotations) {
        violations.push(`Rotated too soon: ${daysBetween} days < ${policy.minDaysBetweenRotations} days`);
      }
      
      if (policy.maxDaysBetweenRotations && daysBetween > policy.maxDaysBetweenRotations) {
        violations.push(`Rotated too late: ${daysBetween} days > ${policy.maxDaysBetweenRotations} days`);
      }
      
      if (policy.minDaysBeforeExpiry && daysBeforeExpiry < policy.minDaysBeforeExpiry) {
        violations.push(`Rotated too close to expiry: ${daysBeforeExpiry} days < ${policy.minDaysBeforeExpiry} days`);
      }
      
      if (policy.requireDifferentKey && sameKeyReused) {
        violations.push('Same key reused in rotation');
      }
      
      if (policy.requireSameIssuer && issuerChanged) {
        violations.push('Issuer changed during rotation');
      }
    }
    
    return {
      history: sorted,
      lastRotationAt: current.observedAt,
      previousCertificate: previous,
      currentCertificate: current,
      daysBetweenRotations: daysBetween,
      daysBeforeExpiryWhenRotated: daysBeforeExpiry,
      sameKeyReused,
      issuerChanged,
      compliant: violations.length === 0,
      violations,
    };
  }
}

/**
 * Singleton instance
 */
let serviceInstance: CertificateValidationService | null = null;

/**
 * Get certificate validation service
 */
export function getCertificateValidationService(): CertificateValidationService {
  if (!serviceInstance) {
    serviceInstance = new CertificateValidationService();
  }
  return serviceInstance;
}
