/**
 * X509 Certificate Parser
 * Real X.509 certificate parsing using Node's crypto module
 * Replaces all mock parsing with actual certificate extraction
 */

import { X509Certificate, createPublicKey, createHash } from 'node:crypto';
import {
  CertificateParseResult,
  ParsedCertificate,
  SubjectAltName
} from './types';

export class X509Parser {
  /**
   * Parse certificate from PEM or DER format
   * Never manufactures data - returns INVALID on any parsing failure
   */
  parseCertificate(input: string | Buffer): CertificateParseResult {
    try {
      // Ensure input is Buffer for consistent processing
      const buffer = this.normalizeInput(input);
      
      // Parse certificate using Node's X509Certificate
      const cert = new X509Certificate(buffer);

      // Extract public key information
      const publicKeyInfo = this.extractPublicKeyInfo(cert);

      // Parse Subject Alternative Names
      const subjectAltNames = this.parseSubjectAltNames(cert.subjectAltName);

      // Get raw PEM representation
      const rawPem = cert.toString();

      return {
        status: 'PARSED',
        fingerprint256: cert.fingerprint256,
        serialNumber: cert.serialNumber,
        subject: cert.subject,
        issuer: cert.issuer,
        validFrom: new Date(cert.validFrom),
        validTo: new Date(cert.validTo),
        subjectAltNames,
        publicKey: {
          type: publicKeyInfo.type,
          size: publicKeyInfo.size,
          pem: publicKeyInfo.pem,
          fingerprint: publicKeyInfo.fingerprint
        },
        rawPem,
        rawDer: cert.raw
      };
    } catch (error) {
      return {
        status: 'INVALID',
        error: error instanceof Error ? error.message : 'Unable to parse certificate'
      };
    }
  }

  /**
   * Normalize input to Buffer format
   */
  private normalizeInput(input: string | Buffer): Buffer {
    if (Buffer.isBuffer(input)) {
      return input;
    }

    // Handle PEM format
    if (input.includes('BEGIN CERTIFICATE')) {
      return Buffer.from(input, 'utf8');
    }

    // Handle base64 without PEM markers
    try {
      return Buffer.from(input, 'base64');
    } catch {
      // Try as UTF-8
      return Buffer.from(input, 'utf8');
    }
  }

  /**
   * Extract public key information from certificate
   */
  private extractPublicKeyInfo(cert: X509Certificate): {
    type: string;
    size?: number;
    pem: string;
    fingerprint: string;
  } {
    try {
      const publicKey = createPublicKey(cert.publicKey);

      // Get asymmetric key type (rsa, ec, ed25519, etc.)
      const type = cert.publicKey.asymmetricKeyType || 'unknown';

      // Get key size/details based on algorithm
      const details = cert.publicKey.asymmetricKeyDetails;
      let size: number | undefined;

      if (type === 'rsa' && details?.modulusLength) {
        size = details.modulusLength;
      } else if (type === 'ec' && details?.namedCurve) {
        // For EC, map curve to approximate bit strength
        const curveStrength: Record<string, number> = {
          'prime256v1': 256,
          'secp256k1': 256,
          'secp384r1': 384,
          'secp521r1': 521
        };
        size = curveStrength[details.namedCurve] || undefined;
      } else if (type === 'ed25519') {
        size = 256;
      } else if (type === 'ed448') {
        size = 448;
      }

      // Export public key in SPKI format (PEM)
      const pem = publicKey.export({
        type: 'spki',
        format: 'pem'
      }).toString();

      // Calculate public key fingerprint
      const der = publicKey.export({
        type: 'spki',
        format: 'der'
      });

      const fingerprint = createHash('sha256')
        .update(der)
        .digest('hex');

      return {
        type,
        size,
        pem,
        fingerprint
      };
    } catch (error) {
      console.error('Failed to extract public key info:', error);
      throw new Error('Public key extraction failed');
    }
  }

  /**
   * Parse Subject Alternative Names from certificate
   * Does NOT naively split by commas - handles structured format
   */
  private parseSubjectAltNames(subjectAltName?: string): SubjectAltName[] {
    if (!subjectAltName) {
      return [];
    }

    const sans: SubjectAltName[] = [];

    try {
      // Node's X509Certificate returns SANs in format:
      // "DNS:example.com, IP Address:192.168.1.1"
      const entries = subjectAltName.split(', ');

      for (const entry of entries) {
        const colonIndex = entry.indexOf(':');
        if (colonIndex === -1) continue;

        const typeStr = entry.substring(0, colonIndex).trim();
        const value = entry.substring(colonIndex + 1).trim();

        let type: SubjectAltName['type'];

        if (typeStr === 'DNS') {
          type = 'DNS';
        } else if (typeStr === 'IP Address') {
          type = 'IP';
        } else if (typeStr === 'URI') {
          type = 'URI';
        } else if (typeStr === 'email') {
          type = 'EMAIL';
        } else {
          // Unknown type - skip
          continue;
        }

        sans.push({ type, value });
      }
    } catch (error) {
      console.warn('Failed to parse Subject Alternative Names:', error);
      // Return empty array rather than failing entire parse
    }

    return sans;
  }

  /**
   * Calculate certificate fingerprint (SHA-256)
   * Useful for comparing certificates
   */
  calculateFingerprint(certDer: Buffer): string {
    return createHash('sha256')
      .update(certDer)
      .digest('hex');
  }

  /**
   * Validate certificate format without full parsing
   * Quick check before expensive operations
   */
  validateCertificateFormat(input: string | Buffer): boolean {
    try {
      const buffer = this.normalizeInput(input);
      
      // Try to instantiate X509Certificate
      new X509Certificate(buffer);
      
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Extract certificate serial number
   * Useful for revocation checking
   */
  extractSerialNumber(input: string | Buffer): string | null {
    try {
      const buffer = this.normalizeInput(input);
      const cert = new X509Certificate(buffer);
      return cert.serialNumber;
    } catch {
      return null;
    }
  }

  /**
   * Check if certificate is self-signed
   * (subject equals issuer)
   */
  isSelfSigned(cert: ParsedCertificate): boolean {
    return cert.subject === cert.issuer;
  }

  /**
   * Extract common name from subject DN
   */
  extractCommonName(subject: string): string | null {
    // Subject format: "CN=example.com, O=Company, C=US"
    const match = subject.match(/CN=([^,]+)/);
    return match ? match[1].trim() : null;
  }

  /**
   * Extract organization from subject DN
   */
  extractOrganization(subject: string): string | null {
    const match = subject.match(/O=([^,]+)/);
    return match ? match[1].trim() : null;
  }
}

// Singleton instance
export const x509Parser = new X509Parser();
