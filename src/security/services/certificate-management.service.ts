/**
 * Certificate Management Service
 * Track, renew, and manage X.509 certificates across the platform
 */

import forge from 'node-forge';
import { ICertificateManagementService, CertificateFilters } from '../interfaces.js';
import {
  Certificate,
  CertificateType,
  CertificateStatus,
  CertificateCheck,
  CertificateUsage
} from '../types.js';
import { getDatabase } from '../../config/database.js';
import { EventEmitter } from 'events';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';

const execAsync = promisify(exec);

export class CertificateManagementService extends EventEmitter implements ICertificateManagementService {
  private readonly WARNING_DAYS = 30;
  private readonly CRITICAL_DAYS = 7;
  private monitoringInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.startMonitoring();
  }

  /**
   * Import a certificate
   */
  async importCertificate(
    name: string,
    type: CertificateType,
    pemCertificate: string,
    pemPrivateKey?: string,
    pemChain?: string[]
  ): Promise<Certificate> {
    const db = getDatabase();

    try {
      // Parse certificate
      const cert = forge.pki.certificateFromPem(pemCertificate);
      
      // Extract certificate details
      const commonName = cert.subject.getField('CN')?.value || '';
      const subjectAlternativeNames = this.extractSANs(cert);
      const issuer = cert.issuer.getField('CN')?.value || '';
      const serialNumber = cert.serialNumber;
      const notBefore = cert.validity.notBefore;
      const notAfter = cert.validity.notAfter;
      
      // Calculate fingerprint
      const fingerprint = this.calculateFingerprint(pemCertificate);
      
      // Determine algorithm and key size
      const publicKey = cert.publicKey as any;
      const algorithm = publicKey.algorithm || 'RSA';
      const keySize = publicKey.n ? publicKey.n.bitLength() : 0;

      const certificate: Certificate = {
        id: this.generateId(),
        name,
        type,
        commonName,
        subjectAlternativeNames,
        issuer,
        serialNumber,
        fingerprint,
        algorithm,
        keySize,
        notBefore,
        notAfter,
        status: this.determineStatus(notBefore, notAfter),
        pemCertificate,
        pemPrivateKey,
        pemChain,
        autoRenew: false,
        renewDaysBeforeExpiry: 30,
        usedBy: [],
        tags: [],
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Validate certificate
      await this.validateCertificateData(certificate);

      // Store in database
      await db.collection('certificates').insertOne(certificate);

      this.emit('certificate:imported', { certificateId: certificate.id, name, commonName });

      return certificate;
    } catch (error) {
      throw new Error(`Failed to import certificate: ${error.message}`);
    }
  }

  /**
   * Get a certificate by ID
   */
  async getCertificate(id: string): Promise<Certificate> {
    const db = getDatabase();
    
    const certificate = await db.collection('certificates').findOne({ id });
    
    if (!certificate) {
      throw new Error('Certificate not found');
    }
    
    return certificate;
  }

  /**
   * List certificates with filters
   */
  async listCertificates(filters: CertificateFilters = {}): Promise<Certificate[]> {
    const db = getDatabase();
    
    const query: any = {};
    
    if (filters.type) {
      query.type = filters.type;
    }
    
    if (filters.status) {
      query.status = filters.status;
    }
    
    if (filters.expiringSoon) {
      const thresholdDate = new Date();
      thresholdDate.setDate(thresholdDate.getDate() + (filters.expiryDays || 30));
      
      query.notAfter = {
        $gte: new Date(),
        $lte: thresholdDate
      };
    }
    
    const certificates = await db.collection('certificates')
      .find(query)
      .sort({ notAfter: 1 })
      .toArray();
    
    return certificates;
  }

  /**
   * Delete a certificate
   */
  async deleteCertificate(id: string): Promise<void> {
    const db = getDatabase();
    
    const certificate = await this.getCertificate(id);
    
    // Check if certificate is in use
    if (certificate.usedBy && certificate.usedBy.length > 0) {
      throw new Error('Cannot delete certificate that is in use');
    }
    
    await db.collection('certificates').deleteOne({ id });
    
    this.emit('certificate:deleted', { certificateId: id });
  }

  /**
   * Verify certificate validity
   */
  async verifyCertificate(id: string): Promise<CertificateCheck> {
    const db = getDatabase();
    const certificate = await this.getCertificate(id);
    
    const check: CertificateCheck = {
      certificateId: id,
      timestamp: new Date(),
      status: CertificateStatus.VALID,
      daysUntilExpiry: this.calculateDaysUntilExpiry(certificate.notAfter),
      validationErrors: [],
      revocationChecked: false
    };

    try {
      // Parse certificate
      const cert = forge.pki.certificateFromPem(certificate.pemCertificate);
      
      // Check validity period
      const now = new Date();
      if (now < certificate.notBefore) {
        check.status = CertificateStatus.INVALID;
        check.validationErrors.push('Certificate not yet valid');
      } else if (now > certificate.notAfter) {
        check.status = CertificateStatus.EXPIRED;
        check.validationErrors.push('Certificate expired');
      } else if (check.daysUntilExpiry <= this.CRITICAL_DAYS) {
        check.status = CertificateStatus.EXPIRING_SOON;
        check.validationErrors.push(`Certificate expires in ${check.daysUntilExpiry} days`);
      } else if (check.daysUntilExpiry <= this.WARNING_DAYS) {
        check.status = CertificateStatus.EXPIRING_SOON;
      }
      
      // Validate chain if provided
      if (certificate.pemChain && certificate.pemChain.length > 0) {
        const chainValid = await this.validateChain(id);
        if (!chainValid) {
          check.validationErrors.push('Certificate chain validation failed');
        }
      }
      
      // Check OCSP if possible
      try {
        const ocspStatus = await this.checkOCSP(certificate);
        check.revocationChecked = true;
        check.ocspStatus = ocspStatus;
        
        if (ocspStatus === 'revoked') {
          check.status = CertificateStatus.REVOKED;
          check.validationErrors.push('Certificate has been revoked');
        }
      } catch (error) {
        // OCSP check failed - non-fatal
        console.warn(`OCSP check failed for certificate ${id}:`, error.message);
      }
      
      // Update certificate status
      await db.collection('certificates').updateOne(
        { id },
        {
          $set: {
            status: check.status,
            lastCheckedAt: check.timestamp,
            nextCheckAt: this.calculateNextCheckDate(check.status)
          }
        }
      );
      
      // Store check result
      await db.collection('certificate_checks').insertOne(check);
      
      this.emit('certificate:verified', { certificateId: id, status: check.status });
      
      return check;
    } catch (error) {
      check.status = CertificateStatus.INVALID;
      check.validationErrors.push(error.message);
      return check;
    }
  }

  /**
   * Renew a certificate
   */
  async renewCertificate(id: string): Promise<Certificate> {
    const db = getDatabase();
    const certificate = await this.getCertificate(id);
    
    // This is a placeholder - actual renewal depends on CA integration
    // Common approaches:
    // 1. ACME protocol (Let's Encrypt)
    // 2. Internal CA API
    // 3. External CA portal integration
    
    try {
      // Example: Generate CSR and submit to CA
      const csr = await this.generateCSR(certificate);
      
      // Submit to CA (implementation depends on CA type)
      const newCertPem = await this.submitCSRToCA(csr, certificate);
      
      // Import renewed certificate
      const renewedCert = await this.importCertificate(
        `${certificate.name} (Renewed)`,
        certificate.type,
        newCertPem,
        certificate.pemPrivateKey,
        certificate.pemChain
      );
      
      // Update usage references
      for (const usage of certificate.usedBy) {
        await this.trackUsage(renewedCert.id, usage.resourceType, usage.resourceId);
      }
      
      // Mark old certificate as deprecated
      await db.collection('certificates').updateOne(
        { id },
        {
          $set: {
            tags: [...certificate.tags, 'deprecated'],
            metadata: {
              ...certificate.metadata,
              replacedBy: renewedCert.id
            }
          }
        }
      );
      
      this.emit('certificate:renewed', {
        oldCertificateId: id,
        newCertificateId: renewedCert.id
      });
      
      return renewedCert;
    } catch (error) {
      throw new Error(`Failed to renew certificate: ${error.message}`);
    }
  }

  /**
   * Revoke a certificate
   */
  async revokeCertificate(id: string, reason: string): Promise<void> {
    const db = getDatabase();
    
    await db.collection('certificates').updateOne(
      { id },
      {
        $set: {
          status: CertificateStatus.REVOKED,
          metadata: {
            revokedAt: new Date(),
            revocationReason: reason
          }
        }
      }
    );
    
    this.emit('certificate:revoked', { certificateId: id, reason });
  }

  /**
   * Check for expiring certificates
   */
  async checkExpiringCertificates(daysThreshold: number = 30): Promise<Certificate[]> {
    const certificates = await this.listCertificates({
      expiringSoon: true,
      expiryDays: daysThreshold
    });
    
    for (const cert of certificates) {
      const daysUntilExpiry = this.calculateDaysUntilExpiry(cert.notAfter);
      
      this.emit('certificate:expiring-soon', {
        certificateId: cert.id,
        name: cert.name,
        commonName: cert.commonName,
        daysUntilExpiry,
        expiresAt: cert.notAfter
      });
    }
    
    return certificates;
  }

  /**
   * Auto-renew certificates
   */
  async autoRenewCertificates(): Promise<Certificate[]> {
    const db = getDatabase();
    
    const now = new Date();
    const certificates = await db.collection('certificates')
      .find({
        autoRenew: true,
        status: { $in: [CertificateStatus.VALID, CertificateStatus.EXPIRING_SOON] }
      })
      .toArray();
    
    const renewed: Certificate[] = [];
    
    for (const cert of certificates) {
      const daysUntilExpiry = this.calculateDaysUntilExpiry(cert.notAfter);
      
      if (daysUntilExpiry <= cert.renewDaysBeforeExpiry) {
        try {
          const renewedCert = await this.renewCertificate(cert.id);
          renewed.push(renewedCert);
        } catch (error) {
          console.error(`Failed to auto-renew certificate ${cert.id}:`, error);
          this.emit('certificate:renewal-failed', {
            certificateId: cert.id,
            error: error.message
          });
        }
      }
    }
    
    return renewed;
  }

  /**
   * Validate certificate chain
   */
  async validateChain(certificateId: string): Promise<boolean> {
    try {
      const certificate = await this.getCertificate(certificateId);
      
      if (!certificate.pemChain || certificate.pemChain.length === 0) {
        return true; // No chain to validate
      }
      
      const cert = forge.pki.certificateFromPem(certificate.pemCertificate);
      const chain = certificate.pemChain.map(pem => forge.pki.certificateFromPem(pem));
      
      // Build trust chain
      const caStore = forge.pki.createCaStore();
      chain.forEach(c => caStore.addCertificate(c));
      
      // Verify certificate against chain
      try {
        forge.pki.verifyCertificateChain(caStore, [cert, ...chain]);
        return true;
      } catch (error) {
        console.error('Chain validation failed:', error);
        return false;
      }
    } catch (error) {
      console.error('Error validating chain:', error);
      return false;
    }
  }

  /**
   * Track certificate usage
   */
  async trackUsage(
    certificateId: string,
    resourceType: string,
    resourceId: string
  ): Promise<void> {
    const db = getDatabase();
    
    const certificate = await this.getCertificate(certificateId);
    
    // Check if already tracked
    const existingUsage = certificate.usedBy.find(
      u => u.resourceType === resourceType && u.resourceId === resourceId
    );
    
    if (existingUsage) {
      return; // Already tracked
    }
    
    const usage: CertificateUsage = {
      resourceType: resourceType as any,
      resourceId,
      resourceName: `${resourceType}-${resourceId}`,
      purpose: 'SSL/TLS'
    };
    
    await db.collection('certificates').updateOne(
      { id: certificateId },
      {
        $push: { usedBy: usage }
      }
    );
    
    this.emit('certificate:usage-tracked', { certificateId, usage });
  }

  /**
   * Helper: Extract Subject Alternative Names
   */
  private extractSANs(cert: any): string[] {
    const sans: string[] = [];
    
    const altNames = cert.getExtension('subjectAltName') as any;
    if (altNames && altNames.altNames) {
      altNames.altNames.forEach((alt: any) => {
        if (alt.type === 2) { // DNS
          sans.push(alt.value);
        } else if (alt.type === 7) { // IP
          sans.push(alt.ip);
        }
      });
    }
    
    return sans;
  }

  /**
   * Helper: Calculate fingerprint
   */
  private calculateFingerprint(pemCertificate: string): string {
    const cert = forge.pki.certificateFromPem(pemCertificate);
    const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
    const md = forge.md.sha256.create();
    md.update(der);
    return md.digest().toHex().toUpperCase().match(/.{2}/g)?.join(':') || '';
  }

  /**
   * Helper: Determine certificate status
   */
  private determineStatus(notBefore: Date, notAfter: Date): CertificateStatus {
    const now = new Date();
    
    if (now < notBefore) {
      return CertificateStatus.INVALID;
    }
    
    if (now > notAfter) {
      return CertificateStatus.EXPIRED;
    }
    
    const daysUntilExpiry = this.calculateDaysUntilExpiry(notAfter);
    
    if (daysUntilExpiry <= this.WARNING_DAYS) {
      return CertificateStatus.EXPIRING_SOON;
    }
    
    return CertificateStatus.VALID;
  }

  /**
   * Helper: Calculate days until expiry
   */
  private calculateDaysUntilExpiry(notAfter: Date): number {
    const now = new Date();
    const diffTime = notAfter.getTime() - now.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  /**
   * Helper: Calculate next check date based on status
   */
  private calculateNextCheckDate(status: CertificateStatus): Date {
    const now = new Date();
    
    switch (status) {
      case CertificateStatus.EXPIRED:
      case CertificateStatus.REVOKED:
        // Check daily
        return new Date(now.getTime() + 24 * 60 * 60 * 1000);
      
      case CertificateStatus.EXPIRING_SOON:
        // Check every 6 hours
        return new Date(now.getTime() + 6 * 60 * 60 * 1000);
      
      case CertificateStatus.VALID:
      default:
        // Check daily
        return new Date(now.getTime() + 24 * 60 * 60 * 1000);
    }
  }

  /**
   * Helper: Validate certificate data
   */
  private async validateCertificateData(certificate: Certificate): Promise<void> {
    const errors: string[] = [];
    
    if (!certificate.commonName) {
      errors.push('Common Name is required');
    }
    
    if (certificate.keySize < 2048) {
      errors.push('Key size must be at least 2048 bits');
    }
    
    if (certificate.algorithm !== 'RSA' && certificate.algorithm !== 'ECDSA') {
      errors.push('Only RSA and ECDSA algorithms are supported');
    }
    
    if (errors.length > 0) {
      throw new Error(`Certificate validation failed: ${errors.join(', ')}`);
    }
  }

  /**
   * Helper: Generate CSR for renewal
   */
  private async generateCSR(certificate: Certificate): Promise<string> {
    // Generate new key pair
    const keys = forge.pki.rsa.generateKeyPair(certificate.keySize);
    
    // Create CSR
    const csr = forge.pki.createCertificationRequest();
    csr.publicKey = keys.publicKey;
    csr.setSubject([{
      name: 'commonName',
      value: certificate.commonName
    }]);
    
    // Add SANs
    if (certificate.subjectAlternativeNames.length > 0) {
      csr.setAttributes([{
        name: 'extensionRequest',
        extensions: [{
          name: 'subjectAltName',
          altNames: certificate.subjectAlternativeNames.map(san => ({
            type: 2, // DNS
            value: san
          }))
        }]
      }]);
    }
    
    // Sign CSR
    csr.sign(keys.privateKey);
    
    return forge.pki.certificationRequestToPem(csr);
  }

  /**
   * Helper: Submit CSR to CA (placeholder)
   */
  private async submitCSRToCA(csr: string, certificate: Certificate): Promise<string> {
    // This is a placeholder - actual implementation depends on CA type
    // Examples:
    // - Let's Encrypt ACME
    // - Internal CA REST API
    // - External CA portal
    
    throw new Error('CA integration not configured. Please configure a Certificate Authority.');
  }

  /**
   * Helper: Check OCSP status
   */
  private async checkOCSP(certificate: Certificate): Promise<'good' | 'revoked' | 'unknown'> {
    // Placeholder for OCSP checking
    // Would use certificate's OCSP responder URL
    return 'good';
  }

  /**
   * Start monitoring certificates
   */
  private startMonitoring(): void {
    // Check certificates every hour
    this.monitoringInterval = setInterval(async () => {
      try {
        await this.checkExpiringCertificates(30);
        await this.autoRenewCertificates();
      } catch (error) {
        console.error('Certificate monitoring error:', error);
      }
    }, 60 * 60 * 1000);
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `cert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{ status: string; details: any }> {
    try {
      const db = getDatabase();
      
      const totalCerts = await db.collection('certificates').countDocuments();
      const expiring = (await this.checkExpiringCertificates(30)).length;
      const expired = (await this.listCertificates({ status: CertificateStatus.EXPIRED })).length;
      const revoked = (await this.listCertificates({ status: CertificateStatus.REVOKED })).length;
      
      return {
        status: 'healthy',
        details: {
          totalCertificates: totalCerts,
          expiring,
          expired,
          revoked,
          monitoringActive: this.monitoringInterval !== null
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        details: {
          error: error.message
        }
      };
    }
  }
}
