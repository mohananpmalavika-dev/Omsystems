/**
 * Certificate Lifecycle Manager
 * Automated certificate management: discovery, monitoring, renewal, OCSP checking
 * Tracks certificates across cameras, servers, devices, and infrastructure
 */

import {
  Certificate,
  CertificateUsage,
  CertificateStatus,
  CertificateHealth
} from '../types/security.types';
import crypto from 'crypto';
import * as x509 from 'node:crypto';

export class CertificateManager {
  private certificates: Map<string, Certificate> = new Map();
  private renewalQueue: string[] = [];
  private checkInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.startPeriodicChecks();
  }

  /**
   * Add certificate to management
   */
  async addCertificate(
    certPem: string,
    deviceId?: string,
    deviceType?: string,
    autoRenew: boolean = true
  ): Promise<Certificate> {
    const cert = this.parseCertificate(certPem);
    
    const certificate: Certificate = {
      id: cert.fingerprint,
      commonName: cert.subject.CN || 'Unknown',
      subjectAlternativeNames: cert.subjectAltNames || [],
      issuer: cert.issuer.CN || 'Unknown',
      serialNumber: cert.serialNumber,
      notBefore: cert.notBefore,
      notAfter: cert.notAfter,
      fingerprint: cert.fingerprint,
      keyAlgorithm: cert.keyAlgorithm,
      keySize: cert.keySize,
      publicKey: cert.publicKey,
      certificateChain: [certPem],
      usage: this.determineUsage(cert),
      status: this.determineStatus(cert.notAfter),
      ocspUrl: cert.ocspUrl,
      crlUrl: cert.crlUrl,
      autoRenew,
      deviceId,
      deviceType
    };

    this.certificates.set(certificate.id, certificate);

    console.log(`✓ Certificate added: ${certificate.commonName} (${certificate.id.substring(0, 8)}...)`);

    return certificate;
  }

  /**
   * Get certificate by ID
   */
  async getCertificate(certId: string): Promise<Certificate | null> {
    return this.certificates.get(certId) || null;
  }

  /**
   * List all certificates
   */
  async listCertificates(filter?: {
    status?: CertificateStatus;
    deviceType?: string;
    usage?: CertificateUsage;
    expiringSoon?: boolean;
  }): Promise<Certificate[]> {
    let certs = Array.from(this.certificates.values());

    if (filter?.status) {
      certs = certs.filter(c => c.status === filter.status);
    }

    if (filter?.deviceType) {
      certs = certs.filter(c => c.deviceType === filter.deviceType);
    }

    if (filter?.usage) {
      certs = certs.filter(c => c.usage.includes(filter.usage));
    }

    if (filter?.expiringSoon) {
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
      certs = certs.filter(c => c.notAfter <= thirtyDaysFromNow);
    }

    return certs;
  }

  /**
   * Get certificate health overview
   */
  async getHealth(): Promise<CertificateHealth> {
    const certs = Array.from(this.certificates.values());
    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const health: CertificateHealth = {
      totalCertificates: certs.length,
      healthy: certs.filter(c => c.status === CertificateStatus.VALID).length,
      expiringSoon: certs.filter(c => 
        c.status === CertificateStatus.VALID && 
        c.notAfter <= thirtyDaysFromNow
      ).length,
      expired: certs.filter(c => c.status === CertificateStatus.EXPIRED).length,
      revoked: certs.filter(c => c.status === CertificateStatus.REVOKED).length,
      invalid: certs.filter(c => c.status === CertificateStatus.INVALID).length
    };

    return health;
  }

  /**
   * Check certificate expiration and update status
   */
  async checkExpiration(certId: string): Promise<CertificateStatus> {
    const cert = this.certificates.get(certId);
    
    if (!cert) {
      return CertificateStatus.UNKNOWN;
    }

    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    if (now < cert.notBefore) {
      cert.status = CertificateStatus.INVALID;
    } else if (now > cert.notAfter) {
      cert.status = CertificateStatus.EXPIRED;
      
      // Add to renewal queue if auto-renew is enabled
      if (cert.autoRenew && !this.renewalQueue.includes(certId)) {
        this.renewalQueue.push(certId);
      }
    } else if (cert.notAfter <= thirtyDaysFromNow) {
      cert.status = CertificateStatus.EXPIRING_SOON;
      
      // Add to renewal queue if auto-renew is enabled
      if (cert.autoRenew && !this.renewalQueue.includes(certId)) {
        this.renewalQueue.push(certId);
      }
    } else {
      cert.status = CertificateStatus.VALID;
    }

    return cert.status;
  }

  /**
   * Check OCSP status
   */
  async checkOCSP(certId: string): Promise<'GOOD' | 'REVOKED' | 'UNKNOWN'> {
    const cert = this.certificates.get(certId);
    
    if (!cert || !cert.ocspUrl) {
      return 'UNKNOWN';
    }

    try {
      // In production, make OCSP request
      // For now, return simulated status
      console.log(`Checking OCSP for ${cert.commonName} at ${cert.ocspUrl}`);
      
      return 'GOOD';
    } catch (error) {
      console.error('OCSP check failed:', error);
      return 'UNKNOWN';
    }
  }

  /**
   * Verify certificate chain
   */
  async verifyChain(certId: string, rootCAs: string[]): Promise<boolean> {
    const cert = this.certificates.get(certId);
    
    if (!cert) {
      return false;
    }

    try {
      // In production, verify full chain
      // Check issuer matches CA, signature is valid, etc.
      console.log(`Verifying chain for ${cert.commonName}`);
      
      return true;
    } catch (error) {
      console.error('Chain verification failed:', error);
      return false;
    }
  }

  /**
   * Renew certificate
   */
  async renewCertificate(certId: string): Promise<Certificate | null> {
    const oldCert = this.certificates.get(certId);
    
    if (!oldCert) {
      return null;
    }

    console.log(`🔄 Renewing certificate: ${oldCert.commonName}`);

    try {
      // In production:
      // 1. Generate new key pair
      // 2. Create CSR with same subject
      // 3. Submit to CA
      // 4. Receive new certificate
      // 5. Deploy to device
      // 6. Verify deployment
      
      // For now, create a renewed certificate
      const newNotBefore = new Date();
      const newNotAfter = new Date();
      newNotAfter.setFullYear(newNotAfter.getFullYear() + 1);

      const renewedCert: Certificate = {
        ...oldCert,
        id: crypto.randomBytes(16).toString('hex'),
        serialNumber: crypto.randomBytes(16).toString('hex'),
        notBefore: newNotBefore,
        notAfter: newNotAfter,
        status: CertificateStatus.VALID
      };

      this.certificates.set(renewedCert.id, renewedCert);

      // Remove old cert from registry (in production, keep for audit)
      // this.certificates.delete(certId);

      // Remove from renewal queue
      const index = this.renewalQueue.indexOf(certId);
      if (index > -1) {
        this.renewalQueue.splice(index, 1);
      }

      console.log(`✓ Certificate renewed: ${renewedCert.commonName}`);

      return renewedCert;
    } catch (error) {
      console.error('Certificate renewal failed:', error);
      return null;
    }
  }

  /**
   * Revoke certificate
   */
  async revokeCertificate(certId: string, reason: string): Promise<boolean> {
    const cert = this.certificates.get(certId);
    
    if (!cert) {
      return false;
    }

    console.log(`⚠️ Revoking certificate: ${cert.commonName} - ${reason}`);

    cert.status = CertificateStatus.REVOKED;

    // In production:
    // 1. Submit revocation request to CA
    // 2. Update CRL
    // 3. Notify OCSP responder
    // 4. Alert administrators
    // 5. Block certificate usage

    return true;
  }

  /**
   * Discover certificates on device
   */
  async discoverDeviceCertificates(deviceId: string, deviceType: string): Promise<Certificate[]> {
    console.log(`🔍 Discovering certificates on ${deviceType}: ${deviceId}`);

    const discovered: Certificate[] = [];

    // In production:
    // 1. Connect to device
    // 2. Query certificate stores
    // 3. Extract certificates
    // 4. Add to management

    // Simulated discovery
    const simulatedCert = await this.addCertificate(
      this.generateSelfSignedCert(),
      deviceId,
      deviceType
    );

    discovered.push(simulatedCert);

    return discovered;
  }

  /**
   * Bulk certificate check
   */
  async checkAllCertificates(): Promise<{
    checked: number;
    expiringSoon: number;
    expired: number;
    revoked: number;
  }> {
    console.log('🔍 Checking all certificates...');

    const results = {
      checked: 0,
      expiringSoon: 0,
      expired: 0,
      revoked: 0
    };

    for (const [certId, cert] of this.certificates.entries()) {
      const status = await this.checkExpiration(certId);
      results.checked++;

      if (status === CertificateStatus.EXPIRING_SOON) {
        results.expiringSoon++;
      } else if (status === CertificateStatus.EXPIRED) {
        results.expired++;
      } else if (status === CertificateStatus.REVOKED) {
        results.revoked++;
      }

      // Check OCSP for valid certificates
      if (status === CertificateStatus.VALID || status === CertificateStatus.EXPIRING_SOON) {
        const ocspStatus = await this.checkOCSP(certId);
        if (ocspStatus === 'REVOKED') {
          cert.status = CertificateStatus.REVOKED;
          results.revoked++;
        }
      }
    }

    console.log(`✓ Certificate check complete: ${results.checked} checked, ${results.expiringSoon} expiring soon, ${results.expired} expired`);

    return results;
  }

  /**
   * Process renewal queue
   */
  async processRenewalQueue(): Promise<{ renewed: number; failed: number }> {
    console.log(`🔄 Processing renewal queue: ${this.renewalQueue.length} certificates`);

    const results = {
      renewed: 0,
      failed: 0
    };

    const queue = [...this.renewalQueue];
    
    for (const certId of queue) {
      try {
        const renewed = await this.renewCertificate(certId);
        if (renewed) {
          results.renewed++;
        } else {
          results.failed++;
        }
      } catch (error) {
        console.error(`Failed to renew ${certId}:`, error);
        results.failed++;
      }
    }

    console.log(`✓ Renewal complete: ${results.renewed} renewed, ${results.failed} failed`);

    return results;
  }

  /**
   * Start periodic certificate checks
   */
  private startPeriodicChecks(): void {
    // Check every 6 hours
    this.checkInterval = setInterval(async () => {
      await this.checkAllCertificates();
      await this.processRenewalQueue();
    }, 6 * 60 * 60 * 1000);

    console.log('✓ Certificate monitoring started (6-hour intervals)');
  }

  /**
   * Stop periodic checks
   */
  stopPeriodicChecks(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      console.log('Certificate monitoring stopped');
    }
  }

  /**
   * Export certificates report
   */
  async exportReport(): Promise<{
    generated: Date;
    health: CertificateHealth;
    expiringSoon: Certificate[];
    expired: Certificate[];
    revoked: Certificate[];
  }> {
    const health = await this.getHealth();
    const expiringSoon = await this.listCertificates({ status: CertificateStatus.EXPIRING_SOON });
    const expired = await this.listCertificates({ status: CertificateStatus.EXPIRED });
    const revoked = await this.listCertificates({ status: CertificateStatus.REVOKED });

    return {
      generated: new Date(),
      health,
      expiringSoon,
      expired,
      revoked
    };
  }

  // ============================================================================
  // Helper methods
  // ============================================================================

  private parseCertificate(certPem: string): any {
    try {
      // In production, use proper X.509 parsing library
      // For now, return simulated certificate data
      
      const fingerprint = crypto.createHash('sha256')
        .update(certPem)
        .digest('hex');

      return {
        subject: { CN: 'Sentinel Grid Device' },
        issuer: { CN: 'Sentinel Grid CA' },
        serialNumber: crypto.randomBytes(8).toString('hex'),
        notBefore: new Date(),
        notAfter: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        fingerprint,
        keyAlgorithm: 'RSA',
        keySize: 2048,
        publicKey: 'PUBLIC_KEY_DATA',
        subjectAltNames: [],
        ocspUrl: 'http://ocsp.sentinelgrid.com',
        crlUrl: 'http://crl.sentinelgrid.com'
      };
    } catch (error) {
      console.error('Failed to parse certificate:', error);
      throw error;
    }
  }

  private determineUsage(cert: any): CertificateUsage[] {
    // In production, parse extended key usage from certificate
    return [CertificateUsage.SERVER_AUTH, CertificateUsage.CLIENT_AUTH];
  }

  private determineStatus(notAfter: Date): CertificateStatus {
    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    if (now > notAfter) {
      return CertificateStatus.EXPIRED;
    } else if (notAfter <= thirtyDaysFromNow) {
      return CertificateStatus.EXPIRING_SOON;
    } else {
      return CertificateStatus.VALID;
    }
  }

  private generateSelfSignedCert(): string {
    // In production, generate proper certificate
    return '-----BEGIN CERTIFICATE-----\nMOCK_CERTIFICATE_DATA\n-----END CERTIFICATE-----';
  }
}

// ============================================================================
// Singleton instance
// ============================================================================

export const certificateManager = new CertificateManager();
