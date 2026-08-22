/**
 * Certificate Manager
 * Orchestrates certificate discovery, parsing, validation, and assessment
 * Replaces simulated certificate-manager.service.ts with real implementation
 */

import {
  DeviceCertificateStatus,
  CertificateAssessment,
  CheckStatus,
  CertificateEvidence
} from './types';
import { x509Parser } from './x509-parser';
import { timeValidator } from './time-validator';
import { trustStore } from './trust-store';
import { chainValidator } from './chain-validator';
import { revocationService } from './revocation-service';
import { tlsDiscovery } from './tls-discovery';
import { certificateRepository } from './certificate-repository';
import { certificatePolicyEvaluator } from './policy-evaluator';

export interface Device {
  id: string;
  tenantId: string;
  hostname: string;
  port?: number;
}

export class CertificateManager {
  /**
   * Get certificate status for device
   * Complete pipeline: discover → parse → validate → assess
   */
  async getCertificateStatus(device: Device): Promise<DeviceCertificateStatus> {
    try {
      // Step 1: Discover certificate via TLS
      const discoveryResult = await tlsDiscovery.discoverCertificate(
        device.hostname,
        device.port || 443
      );

      if (!discoveryResult.success || !discoveryResult.certificateInfo) {
        return {
          availability: 'UNAVAILABLE',
          parseStatus: 'UNKNOWN',
          validation: 'UNKNOWN',
          error: discoveryResult.error || 'Certificate discovery failed'
        };
      }

      // Step 2: Parse certificate
      const parseResult = x509Parser.parseCertificate(
        discoveryResult.certificateInfo.peerCertificate
      );

      if (parseResult.status !== 'PARSED') {
        return {
          availability: 'AVAILABLE',
          parseStatus: parseResult.status,
          validation: 'UNKNOWN',
          error: parseResult.error
        };
      }

      // Step 3: Validate certificate
      const validationResult = await this.validateCertificate(
        parseResult,
        device.tenantId,
        device.hostname
      );

      // Step 4: Store certificate and assessment
      await certificateRepository.storeCertificate(
        device.tenantId,
        device.id,
        parseResult
      );

      // Step 5: Check for certificate rotation
      const rotation = await certificateRepository.checkCertificateRotation(
        device.id,
        parseResult.fingerprint256
      );

      if (rotation.rotated && rotation.previousCertificate) {
        await certificateRepository.emitCertificateChange(
          device.tenantId,
          device.id,
          rotation.previousCertificate.fingerprintSha256,
          parseResult.fingerprint256
        );
      }

      return {
        availability: 'AVAILABLE',
        parseStatus: 'PARSED',
        validation: validationResult.overall,
        certificate: parseResult,
        validationResult
      };
    } catch (error) {
      return {
        availability: 'UNAVAILABLE',
        parseStatus: 'UNKNOWN',
        validation: 'UNKNOWN',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Validate certificate through complete pipeline
   */
  private async validateCertificate(
    cert: typeof import('./types').ParsedCertificate,
    tenantId: string,
    hostname?: string
  ): Promise<typeof import('./types').CertificateValidationResult> {
    const errors: string[] = [];

    // Time validation
    const timeValidation = timeValidator.validateTime(cert);
    const timeStatus: CheckStatus = 
      timeValidation.status === 'VALID' ? 'PASS' :
      timeValidation.status === 'EXPIRED' || timeValidation.status === 'NOT_YET_VALID' ? 'FAIL' :
      'UNKNOWN';

    // Chain validation
    const chainValidation = await chainValidator.validate({
      leaf: cert.rawPem,
      trustStore,
      tenantId,
      hostname
    });

    const chainStatus: CheckStatus =
      chainValidation.validity === 'TRUSTED' ? 'PASS' :
      chainValidation.validity === 'UNTRUSTED' ? 'FAIL' :
      'UNKNOWN';

    if (chainValidation.errors.length > 0) {
      errors.push(...chainValidation.errors);
    }

    // Hostname validation
    let hostnameStatus: CheckStatus = 'NOT_CHECKED' as any;
    
    if (hostname) {
      const hostnameValidation = chainValidator.validateHostname(cert, hostname);
      hostnameStatus = hostnameValidation.valid ? 'PASS' : 'FAIL';
      
      if (!hostnameValidation.valid && hostnameValidation.error) {
        errors.push(hostnameValidation.error);
      }
    }

    // Revocation check
    const revocationResult = await revocationService.checkRevocation(cert);
    const revocationStatus: CheckStatus =
      revocationResult.status === 'GOOD' ? 'PASS' :
      revocationResult.status === 'REVOKED' ? 'FAIL' :
      'UNKNOWN';

    if (revocationResult.error) {
      errors.push(revocationResult.error);
    }

    // Determine overall validity
    let overall: typeof import('./types').OverallValidity;

    if (timeStatus === 'FAIL' || chainStatus === 'FAIL' || 
        hostnameStatus === 'FAIL' || revocationStatus === 'FAIL') {
      overall = 'INVALID';
    } else if (timeStatus === 'UNKNOWN' || chainStatus === 'UNKNOWN' || 
               revocationStatus === 'UNKNOWN') {
      overall = 'UNKNOWN';
    } else {
      overall = 'VALID';
    }

    return {
      parsed: true,
      timeValidity: timeValidation.status,
      chain: chainValidation.validity,
      hostname: hostnameStatus as any,
      revocation: revocationResult.status,
      overall,
      errors,
      trustAnchorId: chainValidation.trustAnchorId,
      trustSource: chainValidation.trustSource
    };
  }

  /**
   * Assess certificate (validation + policy evaluation)
   */
  async assessCertificate(
    device: Device,
    cert: typeof import('./types').ParsedCertificate
  ): Promise<CertificateAssessment> {
    const timeValidation = timeValidator.validateTime(cert);
    const validationResult = await this.validateCertificate(
      cert,
      device.tenantId,
      device.hostname
    );

    // Evaluate against policy
    const policyFindings = certificatePolicyEvaluator.evaluate(cert, timeValidation);
    
    // Add revocation findings
    const revocationFindings = certificatePolicyEvaluator.evaluateRevocationStatus(
      validationResult.revocation
    );

    // Add chain findings
    const chainFindings = certificatePolicyEvaluator.evaluateChainValidation(
      validationResult.chain
    );

    const allFindings = [...policyFindings, ...revocationFindings, ...chainFindings];

    // Create evidence
    const evidence: CertificateEvidence = {
      source: 'TLS_HANDSHAKE',
      observedAt: new Date(),
      fingerprintSha256: cert.fingerprint256,
      rawAvailable: true,
      parser: 'NODE_X509',
      simulated: false
    };

    // Map validation to check status
    const checks = {
      parsing: 'PASS' as CheckStatus,
      time: validationResult.timeValidity === 'VALID' ? 'PASS' as CheckStatus :
            validationResult.timeValidity === 'UNKNOWN' ? 'UNKNOWN' as CheckStatus :
            'FAIL' as CheckStatus,
      chain: validationResult.chain === 'TRUSTED' ? 'PASS' as CheckStatus :
             validationResult.chain === 'UNKNOWN' ? 'UNKNOWN' as CheckStatus :
             'FAIL' as CheckStatus,
      identity: validationResult.hostname === 'MATCH' ? 'PASS' as CheckStatus :
                validationResult.hostname === 'NOT_CHECKED' ? 'UNKNOWN' as CheckStatus :
                'FAIL' as CheckStatus,
      revocation: validationResult.revocation === 'GOOD' ? 'PASS' as CheckStatus :
                  validationResult.revocation === 'UNKNOWN' ? 'UNKNOWN' as CheckStatus :
                  'FAIL' as CheckStatus
    };

    const assessment: CertificateAssessment = {
      deviceId: device.id,
      observedAt: new Date(),
      certificate: {
        fingerprintSha256: cert.fingerprint256,
        serialNumber: cert.serialNumber,
        subject: cert.subject,
        issuer: cert.issuer,
        validFrom: cert.validFrom,
        validTo: cert.validTo,
        publicKeyAlgorithm: cert.publicKey.type,
        publicKeySize: cert.publicKey.size,
        subjectAltNames: cert.subjectAltNames
      },
      checks,
      overall: validationResult.overall,
      findings: allFindings,
      errors: validationResult.errors,
      evidence
    };

    return assessment;
  }

  /**
   * Production safety check
   */
  validateProductionSafety(): void {
    if (process.env.NODE_ENV === 'production') {
      // Verify no mock/simulation modes are active
      const config = revocationService.getConfig();
      
      if (!config.enableOcsp && !config.enableCrl) {
        console.warn('⚠️ Production environment: Revocation checking is disabled');
      }

      // Trust store should have anchors configured
      const stats = trustStore.getStatistics();
      
      if (stats.totalAnchors === 0) {
        console.warn('⚠️ Production environment: No trust anchors configured');
      }
    }
  }
}

// Singleton instance
export const certificateManager = new CertificateManager();
