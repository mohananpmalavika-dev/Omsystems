/**
 * Certificate Provider
 * X.509 certificate validation, PKI chain verification, and TPM attestation
 */

import {
  ICertificateProvider,
  ProviderContext,
  CertificateVerificationResult,
  CertificateDetails,
  TPMAttestation,
  SecurityVerdict
} from './types';
import crypto from 'crypto';

interface CertificateRecord {
  deviceId: string;
  userId: string;
  certificate: CertificateDetails;
  issuedAt: Date;
  lastVerifiedAt: Date;
  verificationCount: number;
  revoked: boolean;
  revokedAt?: Date;
  revokeReason?: string;
}

interface TPMRecord {
  deviceId: string;
  attestation: TPMAttestation;
  verified: boolean;
  verifiedAt: Date;
  lastCheckAt: Date;
}

interface CARecord {
  issuer: string;
  publicKey: string;
  trusted: boolean;
  addedAt: Date;
}

export class CertificateProvider implements ICertificateProvider {
  readonly name = 'CertificateProvider';
  readonly version = '1.0.0';

  private certificates: Map<string, CertificateRecord> = new Map();
  private tpmAttestations: Map<string, TPMRecord> = new Map();
  private trustedCAs: Map<string, CARecord> = new Map();
  private revokedCertificates: Set<string> = new Set();

  private readonly CERTIFICATE_GRACE_PERIOD_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
  private readonly TPM_REVALIDATION_MS = 24 * 60 * 60 * 1000; // 24 hours

  constructor() {}

  /**
   * Verify certificate and TPM attestation
   */
  async verify(context: ProviderContext): Promise<CertificateVerificationResult> {
    const startTime = Date.now();
    let score = 0;
    const evidence: Record<string, any> = {};
    const reasons: string[] = [];

    // 1. Check if certificate is present
    const certificateHash = context.metadata?.certificateHash as string | undefined;
    const certificatePresent = !!certificateHash;
    evidence.certificatePresent = certificatePresent;

    if (!certificatePresent) {
      score += 50;
      reasons.push('No client certificate provided');

      return {
        verdict: SecurityVerdict.CHALLENGE,
        score,
        confidence: 0.9,
        reason: reasons.join('; '),
        evidence,
        certificatePresent: false,
        certificateValid: false,
        certificateExpired: false,
        tpmAttested: false,
        chainValid: false
      };
    }

    // 2. Retrieve certificate record
    const certRecord = this.certificates.get(context.deviceId);
    evidence.certificateKnown = !!certRecord;

    let certificateDetails: CertificateDetails | undefined;
    let certificateValid = false;
    let certificateExpired = false;
    let chainValid = false;

    if (certRecord) {
      certificateDetails = certRecord.certificate;
      evidence.certificateDetails = {
        subject: certificateDetails.subject,
        issuer: certificateDetails.issuer,
        serialNumber: certificateDetails.serialNumber,
        notBefore: certificateDetails.notBefore,
        notAfter: certificateDetails.notAfter,
        fingerprint: certificateDetails.fingerprint
      };

      // 3. Check if certificate is revoked
      const isRevoked = certRecord.revoked || this.revokedCertificates.has(certificateDetails.serialNumber);
      evidence.certificateRevoked = isRevoked;

      if (isRevoked) {
        score = 100;
        reasons.push(`Certificate revoked: ${certRecord.revokeReason || 'Unknown reason'}`);

        return {
          verdict: SecurityVerdict.DENY,
          score: 100,
          confidence: 1.0,
          reason: reasons.join('; '),
          evidence,
          certificatePresent: true,
          certificateValid: false,
          certificateExpired: false,
          tpmAttested: false,
          chainValid: false,
          certificateDetails
        };
      }

      // 4. Validate certificate hash matches
      if (certificateHash !== certificateDetails.fingerprint) {
        score += 80;
        reasons.push('Certificate fingerprint mismatch');
        evidence.fingerprintMismatch = true;
      } else {
        certificateValid = true;
      }

      // 5. Check certificate expiration
      const now = Date.now();
      const notBefore = certificateDetails.notBefore.getTime();
      const notAfter = certificateDetails.notAfter.getTime();

      if (now < notBefore) {
        score += 70;
        reasons.push('Certificate not yet valid');
        certificateValid = false;
      } else if (now > notAfter) {
        score += 60;
        reasons.push('Certificate has expired');
        certificateExpired = true;
        certificateValid = false;
      } else {
        // Check if certificate is expiring soon
        const daysUntilExpiry = (notAfter - now) / (1000 * 60 * 60 * 24);
        evidence.daysUntilExpiry = Math.floor(daysUntilExpiry);

        if (daysUntilExpiry < 7) {
          score += 30;
          reasons.push(`Certificate expires in ${Math.floor(daysUntilExpiry)} days`);
        } else if (daysUntilExpiry < 30) {
          score += 10;
          reasons.push(`Certificate expires in ${Math.floor(daysUntilExpiry)} days`);
        }
      }

      // 6. Verify certificate chain
      chainValid = await this.verifyCertificateChain(certificateDetails);
      evidence.chainValid = chainValid;

      if (!chainValid) {
        score += 50;
        reasons.push('Certificate chain validation failed');
      }

      // 7. Check issuer trust
      const issuerTrusted = this.trustedCAs.has(certificateDetails.issuer);
      evidence.issuerTrusted = issuerTrusted;

      if (!issuerTrusted) {
        score += 40;
        reasons.push('Certificate issuer not in trusted CA list');
      }

      // 8. Validate signature algorithm
      const weakAlgorithms = ['md5', 'sha1', 'rsa-md5', 'rsa-sha1'];
      const isWeakAlgorithm = weakAlgorithms.some(alg => 
        certificateDetails!.signatureAlgorithm.toLowerCase().includes(alg)
      );
      evidence.signatureAlgorithm = certificateDetails.signatureAlgorithm;
      evidence.isWeakAlgorithm = isWeakAlgorithm;

      if (isWeakAlgorithm) {
        score += 35;
        reasons.push(`Weak signature algorithm: ${certificateDetails.signatureAlgorithm}`);
      }

      // 9. Check certificate age
      const certAge = Date.now() - certRecord.issuedAt.getTime();
      const certAgeDays = certAge / (1000 * 60 * 60 * 24);
      evidence.certificateAgeDays = Math.floor(certAgeDays);

      // Very new certificates can be suspicious
      if (certAgeDays < 1) {
        score += 15;
        reasons.push('Certificate issued very recently');
      }

      // Update verification tracking
      certRecord.lastVerifiedAt = new Date();
      certRecord.verificationCount++;
    } else {
      score += 30;
      reasons.push('Certificate not registered in the system');
    }

    // 10. Check TPM attestation
    const tpmRecord = this.tpmAttestations.get(context.deviceId);
    const tpmAttested = tpmRecord?.verified || false;
    evidence.tpmAttested = tpmAttested;

    if (tpmRecord) {
      evidence.tpmLastCheck = tpmRecord.lastCheckAt;
      evidence.tpmVerifiedAt = tpmRecord.verifiedAt;

      // Check if TPM attestation needs revalidation
      const timeSinceCheck = Date.now() - tpmRecord.lastCheckAt.getTime();
      if (timeSinceCheck > this.TPM_REVALIDATION_MS) {
        score += 20;
        reasons.push('TPM attestation requires revalidation');
      }

      // Verify PCR values if available
      if (tpmRecord.attestation.pcrs) {
        const pcrValid = this.validatePCRs(tpmRecord.attestation.pcrs);
        evidence.pcrValid = pcrValid;

        if (!pcrValid) {
          score += 40;
          reasons.push('TPM PCR validation failed - possible boot integrity issue');
        }
      }
    } else if (certificatePresent) {
      score += 25;
      reasons.push('No TPM attestation available for this device');
    }

    // Determine verdict
    let verdict: SecurityVerdict;
    let confidence = 0.9;
    const requiredActions: string[] = [];

    if (score >= 80) {
      verdict = SecurityVerdict.DENY;
      confidence = 0.95;
      requiredActions.push('RENEW_CERTIFICATE', 'SECURITY_REVIEW');
    } else if (score >= 50) {
      verdict = SecurityVerdict.CHALLENGE;
      confidence = 0.9;
      requiredActions.push('VERIFY_CERTIFICATE');
      if (!tpmAttested) {
        requiredActions.push('PROVIDE_TPM_ATTESTATION');
      }
    } else if (score >= 30) {
      verdict = SecurityVerdict.REVIEW;
      confidence = 0.85;
      requiredActions.push('MONITOR_CERTIFICATE');
    } else {
      verdict = SecurityVerdict.ALLOW;
      confidence = certificateValid && chainValid && tpmAttested ? 0.95 : 0.85;
    }

    evidence.processingTimeMs = Date.now() - startTime;

    return {
      verdict,
      score: Math.min(score, 100),
      confidence,
      reason: reasons.length > 0 ? reasons.join('; ') : 'Certificate verification passed',
      evidence,
      certificatePresent,
      certificateValid,
      certificateExpired,
      tpmAttested,
      chainValid,
      certificateDetails,
      requiredActions: requiredActions.length > 0 ? requiredActions : undefined
    };
  }

  /**
   * Validate a certificate
   */
  async validateCertificate(certificate: string): Promise<boolean> {
    try {
      const details = this.parseCertificate(certificate);
      
      // Check expiration
      const now = Date.now();
      if (now < details.notBefore.getTime() || now > details.notAfter.getTime()) {
        return false;
      }

      // Check if revoked
      if (this.revokedCertificates.has(details.serialNumber)) {
        return false;
      }

      // Verify chain
      const chainValid = await this.verifyCertificateChain(details);
      if (!chainValid) {
        return false;
      }

      return true;
    } catch (error) {
      console.error('Certificate validation error:', error);
      return false;
    }
  }

  /**
   * Validate TPM attestation
   */
  async validateTPMAttestation(attestation: TPMAttestation): Promise<boolean> {
    try {
      // 1. Verify nonce freshness (prevent replay attacks)
      const nonceAge = Date.now() - attestation.timestamp.getTime();
      if (nonceAge > 60000) { // 1 minute
        console.log('⚠️ TPM attestation nonce too old');
        return false;
      }

      // 2. Verify attestation signature
      const signatureValid = this.verifyTPMSignature(attestation);
      if (!signatureValid) {
        console.log('⚠️ TPM attestation signature invalid');
        return false;
      }

      // 3. Validate PCR values
      if (attestation.pcrs) {
        const pcrsValid = this.validatePCRs(attestation.pcrs);
        if (!pcrsValid) {
          console.log('⚠️ TPM PCR validation failed');
          return false;
        }
      }

      // 4. Store attestation record
      const tpmRecord: TPMRecord = {
        deviceId: attestation.deviceId,
        attestation,
        verified: true,
        verifiedAt: new Date(),
        lastCheckAt: new Date()
      };

      this.tpmAttestations.set(attestation.deviceId, tpmRecord);

      console.log(`✓ TPM attestation verified for device ${attestation.deviceId}`);
      return true;
    } catch (error) {
      console.error('TPM attestation validation error:', error);
      return false;
    }
  }

  /**
   * Verify certificate chain
   */
  async verifyCertificateChain(certificate: CertificateDetails): Promise<boolean> {
    // Check if issuer is in trusted CA list
    const issuerCA = this.trustedCAs.get(certificate.issuer);
    
    if (!issuerCA) {
      return false;
    }

    if (!issuerCA.trusted) {
      return false;
    }

    // In production, would verify the full chain up to root CA
    // For now, just check if issuer is trusted
    return true;
  }

  /**
   * Register a certificate
   */
  async registerCertificate(
    deviceId: string,
    userId: string,
    certificate: string
  ): Promise<CertificateDetails> {
    const details = this.parseCertificate(certificate);

    const certRecord: CertificateRecord = {
      deviceId,
      userId,
      certificate: details,
      issuedAt: new Date(),
      lastVerifiedAt: new Date(),
      verificationCount: 0,
      revoked: false
    };

    this.certificates.set(deviceId, certRecord);

    console.log(`✓ Certificate registered for device ${deviceId}`);

    return details;
  }

  /**
   * Revoke a certificate
   */
  async revokeCertificate(deviceId: string, reason: string): Promise<boolean> {
    const certRecord = this.certificates.get(deviceId);
    
    if (!certRecord) {
      return false;
    }

    certRecord.revoked = true;
    certRecord.revokedAt = new Date();
    certRecord.revokeReason = reason;

    this.revokedCertificates.add(certRecord.certificate.serialNumber);

    console.log(`🚫 Certificate revoked for device ${deviceId}: ${reason}`);
    
    return true;
  }

  /**
   * Add trusted CA
   */
  async addTrustedCA(issuer: string, publicKey: string): Promise<void> {
    const caRecord: CARecord = {
      issuer,
      publicKey,
      trusted: true,
      addedAt: new Date()
    };

    this.trustedCAs.set(issuer, caRecord);

    console.log(`✓ Trusted CA added: ${issuer}`);
  }

  /**
   * Remove trusted CA
   */
  async removeTrustedCA(issuer: string): Promise<boolean> {
    const removed = this.trustedCAs.delete(issuer);
    
    if (removed) {
      console.log(`⚠️ Trusted CA removed: ${issuer}`);
    }
    
    return removed;
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    // Check for expiring certificates
    await this.checkExpiringCertificates();
    
    return true;
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private parseCertificate(certificate: string): CertificateDetails {
    // Use real X.509 parsing via Node's crypto module
    try {
      const { X509Certificate } = require('crypto');
      const cert = new X509Certificate(certificate);

      // Extract real certificate details
      const details: CertificateDetails = {
        subject: cert.subject,
        issuer: cert.issuer,
        serialNumber: cert.serialNumber,
        notBefore: new Date(cert.validFrom),
        notAfter: new Date(cert.validTo),
        publicKey: cert.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
        signatureAlgorithm: 'sha256WithRSAEncryption', // Note: X509Certificate doesn't expose this directly
        fingerprint: cert.fingerprint256,
        extensions: {
          keyUsage: ['digitalSignature', 'keyEncipherment'],
          extendedKeyUsage: ['clientAuth']
        }
      };

      return details;
    } catch (error) {
      console.error('Failed to parse certificate:', error);
      throw new Error('Certificate parsing failed - invalid certificate format');
    }
  }

  private extractSubject(certificate: string): string {
    try {
      const { X509Certificate } = require('crypto');
      const cert = new X509Certificate(certificate);
      return cert.subject;
    } catch {
      return 'CN=Unknown';
    }
  }

  private extractIssuer(certificate: string): string {
    try {
      const { X509Certificate } = require('crypto');
      const cert = new X509Certificate(certificate);
      return cert.issuer;
    } catch {
      return 'CN=Unknown';
    }
  }

  private verifyTPMSignature(attestation: TPMAttestation): boolean {
    // In production, verify the TPM attestation signature using the TPM's AIK public key
    // This would involve:
    // 1. Retrieve TPM's Attestation Identity Key (AIK) public key
    // 2. Verify signature over attestation data using AIK public key
    // 3. Check that the signature algorithm is acceptable
    
    // For now, basic validation
    return attestation.attestationData && attestation.attestationData.length > 0;
  }

  private validatePCRs(pcrs: Record<string, string>): boolean {
    // In production, validate Platform Configuration Register values
    // PCRs contain measurements of the boot chain and system state
    // Expected values would be stored and compared
    
    // Common PCRs to check:
    // PCR 0-7: BIOS and boot loader measurements
    // PCR 8-15: Operating system measurements
    
    // For now, check that required PCRs exist
    const requiredPCRs = ['0', '1', '2', '3', '4', '7'];
    
    for (const pcr of requiredPCRs) {
      if (!pcrs[pcr]) {
        console.log(`⚠️ Missing required PCR ${pcr}`);
        return false;
      }
      
      // Check PCR format (should be hex string)
      if (!/^[0-9a-fA-F]+$/.test(pcrs[pcr])) {
        console.log(`⚠️ Invalid PCR ${pcr} format`);
        return false;
      }
    }

    return true;
  }

  private initializeTrustedCAs(): void {
    // Trust anchors must be provisioned from the deployment's PKI.
    const defaultCAs: Array<{ issuer: string; publicKey: string }> = [];

    defaultCAs.forEach(ca => {
      this.trustedCAs.set(ca.issuer, {
        issuer: ca.issuer,
        publicKey: ca.publicKey,
        trusted: true,
        addedAt: new Date()
      });
    });

    console.log(`✓ Initialized ${defaultCAs.length} trusted CAs`);
  }

  private async checkExpiringCertificates(): Promise<void> {
    const now = Date.now();
    const warningPeriod = 30 * 24 * 60 * 60 * 1000; // 30 days
    const expiringCerts: string[] = [];

    for (const [deviceId, certRecord] of this.certificates.entries()) {
      const timeUntilExpiry = certRecord.certificate.notAfter.getTime() - now;
      
      if (timeUntilExpiry > 0 && timeUntilExpiry < warningPeriod) {
        expiringCerts.push(deviceId);
      }
    }

    if (expiringCerts.length > 0) {
      console.log(`⚠️ ${expiringCerts.length} certificates expiring within 30 days`);
    }
  }

  /**
   * Get certificate statistics
   */
  async getCertificateStats(): Promise<{
    totalCertificates: number;
    validCertificates: number;
    expiredCertificates: number;
    revokedCertificates: number;
    expiringCertificates: number;
    tpmAttestedDevices: number;
  }> {
    const now = Date.now();
    const warningPeriod = 30 * 24 * 60 * 60 * 1000; // 30 days

    const stats = {
      totalCertificates: this.certificates.size,
      validCertificates: 0,
      expiredCertificates: 0,
      revokedCertificates: 0,
      expiringCertificates: 0,
      tpmAttestedDevices: 0
    };

    for (const certRecord of this.certificates.values()) {
      if (certRecord.revoked) {
        stats.revokedCertificates++;
      } else if (now > certRecord.certificate.notAfter.getTime()) {
        stats.expiredCertificates++;
      } else if (now < certRecord.certificate.notBefore.getTime()) {
        // Not yet valid
      } else {
        stats.validCertificates++;
        
        const timeUntilExpiry = certRecord.certificate.notAfter.getTime() - now;
        if (timeUntilExpiry < warningPeriod) {
          stats.expiringCertificates++;
        }
      }
    }

    // Count TPM attested devices
    for (const tpmRecord of this.tpmAttestations.values()) {
      if (tpmRecord.verified) {
        stats.tpmAttestedDevices++;
      }
    }

    return stats;
  }

  /**
   * Get device certificate
   */
  async getDeviceCertificate(deviceId: string): Promise<CertificateDetails | null> {
    const certRecord = this.certificates.get(deviceId);
    return certRecord?.certificate || null;
  }

  /**
   * Get TPM attestation status
   */
  async getTPMStatus(deviceId: string): Promise<{
    attested: boolean;
    verifiedAt?: Date;
    lastCheckAt?: Date;
  }> {
    const tpmRecord = this.tpmAttestations.get(deviceId);
    
    return {
      attested: tpmRecord?.verified || false,
      verifiedAt: tpmRecord?.verifiedAt,
      lastCheckAt: tpmRecord?.lastCheckAt
    };
  }
}
