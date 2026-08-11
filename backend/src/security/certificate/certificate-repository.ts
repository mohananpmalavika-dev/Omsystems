/**
 * Certificate Repository
 * Stores certificates and assessments separately for history tracking
 * Enables certificate rotation detection and audit trails
 */

import {
  StoredCertificate,
  StoredCertificateAssessment,
  ParsedCertificate,
  CertificateAssessment,
  CertificateChangeEvent
} from './types';
import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';

export class CertificateRepository extends EventEmitter {
  // In-memory storage (in production, use database)
  private certificates: Map<string, StoredCertificate> = new Map();
  private assessments: Map<string, StoredCertificateAssessment> = new Map();
  
  // Indexes for efficient lookup
  private deviceCertificates: Map<string, Set<string>> = new Map();
  private fingerprintIndex: Map<string, string> = new Map();

  /**
   * Store discovered certificate
   */
  async storeCertificate(
    tenantId: string,
    deviceId: string,
    cert: ParsedCertificate
  ): Promise<StoredCertificate> {
    const id = randomUUID();

    const stored: StoredCertificate = {
      id,
      tenantId,
      deviceId,
      fingerprintSha256: cert.fingerprint256,
      certificateDer: cert.rawDer,
      subject: cert.subject,
      issuer: cert.issuer,
      serialNumber: cert.serialNumber,
      notBefore: cert.validFrom,
      notAfter: cert.validTo,
      discoveredAt: new Date(),
      parseStatus: 'PARSED'
    };

    this.certificates.set(id, stored);

    // Update indexes
    this.updateDeviceIndex(deviceId, id);
    this.fingerprintIndex.set(cert.fingerprint256, id);

    console.log(`✓ Certificate stored: ${deviceId} (${cert.fingerprint256.substring(0, 8)}...)`);

    return stored;
  }

  /**
   * Store certificate assessment
   */
  async storeAssessment(
    tenantId: string,
    certificateId: string,
    assessment: CertificateAssessment
  ): Promise<StoredCertificateAssessment> {
    const id = randomUUID();

    const stored: StoredCertificateAssessment = {
      id,
      tenantId,
      certificateId,
      assessedAt: assessment.observedAt,
      timeStatus: assessment.checks.time,
      chainStatus: assessment.checks.chain,
      identityStatus: assessment.checks.identity,
      revocationStatus: assessment.checks.revocation,
      overallStatus: assessment.overall,
      errorCode: assessment.errors.length > 0 ? 'VALIDATION_ERROR' : undefined,
      errorMessage: assessment.errors.join('; ') || undefined
    };

    this.assessments.set(id, stored);

    return stored;
  }

  /**
   * Get certificate by ID
   */
  async getCertificate(certificateId: string): Promise<StoredCertificate | null> {
    return this.certificates.get(certificateId) || null;
  }

  /**
   * Get latest certificate for device
   */
  async getLatestCertificateForDevice(
    deviceId: string
  ): Promise<StoredCertificate | null> {
    const certIds = this.deviceCertificates.get(deviceId);
    
    if (!certIds || certIds.size === 0) {
      return null;
    }

    // Find most recently discovered certificate
    let latest: StoredCertificate | null = null;

    for (const certId of certIds) {
      const cert = this.certificates.get(certId);
      
      if (cert && (!latest || cert.discoveredAt > latest.discoveredAt)) {
        latest = cert;
      }
    }

    return latest;
  }

  /**
   * Get certificate by fingerprint
   */
  async getCertificateByFingerprint(
    fingerprint: string
  ): Promise<StoredCertificate | null> {
    const certId = this.fingerprintIndex.get(fingerprint);
    
    if (!certId) {
      return null;
    }

    return this.certificates.get(certId) || null;
  }

  /**
   * Get certificate history for device
   */
  async getCertificateHistory(
    deviceId: string
  ): Promise<StoredCertificate[]> {
    const certIds = this.deviceCertificates.get(deviceId);
    
    if (!certIds || certIds.size === 0) {
      return [];
    }

    const certificates: StoredCertificate[] = [];

    for (const certId of certIds) {
      const cert = this.certificates.get(certId);
      if (cert) {
        certificates.push(cert);
      }
    }

    // Sort by discovery date (newest first)
    return certificates.sort((a, b) => 
      b.discoveredAt.getTime() - a.discoveredAt.getTime()
    );
  }

  /**
   * Get assessments for certificate
   */
  async getAssessmentsForCertificate(
    certificateId: string
  ): Promise<StoredCertificateAssessment[]> {
    const assessments: StoredCertificateAssessment[] = [];

    for (const assessment of this.assessments.values()) {
      if (assessment.certificateId === certificateId) {
        assessments.push(assessment);
      }
    }

    // Sort by assessment date (newest first)
    return assessments.sort((a, b) => 
      b.assessedAt.getTime() - a.assessedAt.getTime()
    );
  }

  /**
   * Get latest assessment for certificate
   */
  async getLatestAssessment(
    certificateId: string
  ): Promise<StoredCertificateAssessment | null> {
    const assessments = await this.getAssessmentsForCertificate(certificateId);
    return assessments.length > 0 ? assessments[0] : null;
  }

  /**
   * Check for certificate rotation
   * Returns previous certificate if different from current
   */
  async checkCertificateRotation(
    deviceId: string,
    currentFingerprint: string
  ): Promise<{
    rotated: boolean;
    previousCertificate?: StoredCertificate;
    currentCertificate?: StoredCertificate;
  }> {
    const previous = await this.getLatestCertificateForDevice(deviceId);

    if (!previous) {
      return { rotated: false };
    }

    if (previous.fingerprintSha256 === currentFingerprint) {
      return { rotated: false, currentCertificate: previous };
    }

    // Certificate has rotated
    const current = await this.getCertificateByFingerprint(currentFingerprint);

    return {
      rotated: true,
      previousCertificate: previous,
      currentCertificate: current || undefined
    };
  }

  /**
   * Emit certificate change event
   */
  async emitCertificateChange(
    tenantId: string,
    deviceId: string,
    previousFingerprint: string,
    currentFingerprint: string,
    reason?: string
  ): Promise<void> {
    const event: CertificateChangeEvent = {
      type: 'certificate.changed',
      deviceId,
      tenantId,
      previousFingerprint,
      currentFingerprint,
      timestamp: new Date(),
      reason
    };

    this.emit('certificate.changed', event);

    console.log(`🔄 Certificate changed: ${deviceId} (${previousFingerprint.substring(0, 8)}... → ${currentFingerprint.substring(0, 8)}...)`);
  }

  /**
   * List certificates by filter
   */
  async listCertificates(filter?: {
    tenantId?: string;
    deviceId?: string;
    expiring?: boolean;
    expired?: boolean;
    limit?: number;
  }): Promise<StoredCertificate[]> {
    let certificates = Array.from(this.certificates.values());

    if (filter?.tenantId) {
      certificates = certificates.filter(c => c.tenantId === filter.tenantId);
    }

    if (filter?.deviceId) {
      certificates = certificates.filter(c => c.deviceId === filter.deviceId);
    }

    if (filter?.expiring) {
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
      
      certificates = certificates.filter(c => 
        c.notAfter <= thirtyDaysFromNow && c.notAfter > new Date()
      );
    }

    if (filter?.expired) {
      const now = new Date();
      certificates = certificates.filter(c => c.notAfter < now);
    }

    // Sort by discovery date (newest first)
    certificates.sort((a, b) => 
      b.discoveredAt.getTime() - a.discoveredAt.getTime()
    );

    if (filter?.limit) {
      certificates = certificates.slice(0, filter.limit);
    }

    return certificates;
  }

  /**
   * Get repository statistics
   */
  async getStatistics(): Promise<{
    totalCertificates: number;
    totalAssessments: number;
    uniqueDevices: number;
    certificatesByStatus: Record<string, number>;
    oldestCertificate?: Date;
    newestCertificate?: Date;
  }> {
    const certificates = Array.from(this.certificates.values());
    const assessments = Array.from(this.assessments.values());

    const certificatesByStatus: Record<string, number> = {
      PARSED: 0,
      INVALID: 0,
      UNSUPPORTED: 0
    };

    let oldestCertificate: Date | undefined;
    let newestCertificate: Date | undefined;

    for (const cert of certificates) {
      certificatesByStatus[cert.parseStatus]++;

      if (!oldestCertificate || cert.discoveredAt < oldestCertificate) {
        oldestCertificate = cert.discoveredAt;
      }

      if (!newestCertificate || cert.discoveredAt > newestCertificate) {
        newestCertificate = cert.discoveredAt;
      }
    }

    return {
      totalCertificates: certificates.length,
      totalAssessments: assessments.length,
      uniqueDevices: this.deviceCertificates.size,
      certificatesByStatus,
      oldestCertificate,
      newestCertificate
    };
  }

  /**
   * Clean up old assessments (keep only recent N per certificate)
   */
  async cleanupOldAssessments(keepPerCertificate: number = 10): Promise<number> {
    const assessmentsByCert = new Map<string, StoredCertificateAssessment[]>();

    // Group assessments by certificate
    for (const assessment of this.assessments.values()) {
      const existing = assessmentsByCert.get(assessment.certificateId) || [];
      existing.push(assessment);
      assessmentsByCert.set(assessment.certificateId, existing);
    }

    let deleted = 0;

    // Keep only recent assessments for each certificate
    for (const [, certAssessments] of assessmentsByCert) {
      if (certAssessments.length <= keepPerCertificate) {
        continue;
      }

      // Sort by date (newest first)
      certAssessments.sort((a, b) => 
        b.assessedAt.getTime() - a.assessedAt.getTime()
      );

      // Delete old assessments
      const toDelete = certAssessments.slice(keepPerCertificate);
      
      for (const assessment of toDelete) {
        this.assessments.delete(assessment.id);
        deleted++;
      }
    }

    if (deleted > 0) {
      console.log(`🧹 Cleaned up ${deleted} old certificate assessments`);
    }

    return deleted;
  }

  /**
   * Update device certificate index
   */
  private updateDeviceIndex(deviceId: string, certificateId: string): void {
    const existing = this.deviceCertificates.get(deviceId) || new Set();
    existing.add(certificateId);
    this.deviceCertificates.set(deviceId, existing);
  }

  /**
   * Clear all data (use with caution)
   */
  clearAll(): void {
    console.warn('⚠️ Clearing all certificate data');
    this.certificates.clear();
    this.assessments.clear();
    this.deviceCertificates.clear();
    this.fingerprintIndex.clear();
  }
}

// Singleton instance
export const certificateRepository = new CertificateRepository();
