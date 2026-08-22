/**
 * Secure Boot and TPM Attestation Service
 * Device boot verification, TPM attestation, and hardware security validation
 * 
 * REFACTORED: Now uses cryptographically sound attestation pipeline
 * See: backend/src/attestation/
 */

import {
  SecureBootStatus,
  BootStage,
  TPMDevice,
  TPMStatus
} from '../types/security.types';
import { tpmAttestationService } from '../attestation/application/tpm-attestation.service';
import {
  TpmState,
  SecureBootState as NewSecureBootState,
  AttestationFreshness,
} from '../attestation/domain/attestation.types';

export class SecureBootTPMService {
  private secureBootStatuses: Map<string, SecureBootStatus> = new Map();
  private tpmDevices: Map<string, TPMDevice> = new Map();

  /**
   * Verify secure boot chain using TPM attestation
   * This now delegates to the cryptographic attestation pipeline
   */
  async verifySecureBoot(deviceId: string): Promise<SecureBootStatus> {
    console.log(`🔒 Verifying secure boot for device: ${deviceId}`);

    try {
      // Get latest attestation from the real pipeline
      const attestation = await tpmAttestationService.getLatestAttestation(deviceId);

      if (!attestation) {
        // No attestation available
        return this.createUnknownStatus(deviceId, 'No TPM attestation evidence available');
      }

      // Map new attestation states to legacy interface
      const bootChainValid = attestation.secureBootState === NewSecureBootState.VERIFIED;
      const enabled = attestation.secureBootState !== NewSecureBootState.UNKNOWN;

      // Generate stage information from attestation
      const stages = this.mapAttestationToStages(attestation);
      
      // Generate issues from policy violations
      const issues: string[] = [];
      if (attestation.failureReason) {
        issues.push(`Attestation failed: ${attestation.failureReason}`);
      }
      if (attestation.policyViolations && attestation.policyViolations.length > 0) {
        for (const violation of attestation.policyViolations) {
          issues.push(`PCR ${violation.pcr}: ${violation.description}`);
        }
      }

      const status: SecureBootStatus = {
        deviceId,
        enabled,
        bootChainValid,
        lastValidated: attestation.verifiedAt ?? new Date(),
        stages,
        issues
      };

      this.secureBootStatuses.set(deviceId, status);

      if (bootChainValid) {
        console.log(`✓ Secure boot chain valid for device: ${deviceId} (cryptographically verified)`);
      } else {
        console.log(`❌ Secure boot chain INVALID for device: ${deviceId}`);
        console.log(`Issues: ${issues.join(', ')}`);
      }

      return status;
    } catch (error) {
      console.error(`Error verifying secure boot for ${deviceId}:`, error);
      return this.createUnknownStatus(deviceId, 'Attestation service error');
    }
  }

  /**
   * Create unknown status when attestation unavailable
   */
  private createUnknownStatus(deviceId: string, reason: string): SecureBootStatus {
    return {
      deviceId,
      enabled: false,
      bootChainValid: false,
      lastValidated: new Date(),
      stages: [],
      issues: [reason]
    };
  }

  /**
   * Map attestation result to legacy boot stages
   */
  private mapAttestationToStages(attestation: any): BootStage[] {
    const stages: BootStage[] = [];
    const timestamp = attestation.verifiedAt ?? new Date();
    
    // Map secure boot state to stages
    const verified = attestation.secureBootState === NewSecureBootState.VERIFIED;
    const failed = attestation.secureBootState === NewSecureBootState.FAILED;
    
    stages.push({
      name: 'TPM Quote Verification',
      hash: attestation.evidenceId ? attestation.evidenceId.substring(0, 16) : '(unknown)',
      valid: attestation.tpmState === TpmState.ATTESTED,
      timestamp,
    });

    if (attestation.nonceVerified !== null) {
      stages.push({
        name: 'Nonce Verification',
        hash: '(cryptographic)',
        valid: attestation.nonceVerified,
        timestamp,
      });
    }

    if (attestation.pcrDigestVerified !== null) {
      stages.push({
        name: 'PCR Digest Verification',
        hash: '(cryptographic)',
        valid: attestation.pcrDigestVerified,
        timestamp,
      });
    }

    if (attestation.policyMatched !== null) {
      stages.push({
        name: 'Secure Boot Policy',
        hash: '(policy-based)',
        valid: attestation.policyMatched,
        timestamp,
      });
    }

    return stages;
  }

  /**
   * Register TPM device and enroll its Attestation Key
   */
  async registerTPMDevice(
    deviceId: string,
    tpmVersion: string,
    manufacturer: string,
    firmwareVersion: string,
    ekCertificate?: string
  ): Promise<TPMDevice> {
    console.log(`🔐 Registering TPM device: ${deviceId}`);

    const tpmDevice: TPMDevice = {
      deviceId,
      tpmVersion,
      manufacturer,
      firmwareVersion,
      attestationValid: false,
      lastAttestation: new Date(),
      pcrValues: {},
      ekCertificate,
      status: TPMStatus.HEALTHY
    };

    this.tpmDevices.set(deviceId, tpmDevice);

    console.log(`✓ TPM device registered: ${deviceId} (${manufacturer} ${tpmVersion})`);
    console.log(`  Note: Device must enroll AK via /api/attestation/devices/${deviceId}/enroll`);

    return tpmDevice;
  }

  /**
   * Perform TPM attestation using cryptographic verification pipeline
   * 
   * @deprecated Use tpmAttestationService.submitEvidence() directly
   * This method is maintained for backward compatibility
   */
  async attestTPM(deviceId: string, quote: any, signature: any): Promise<{
    valid: boolean;
    reason?: string;
  }> {
    console.log(`🔍 Attesting TPM for device: ${deviceId} (legacy API)`);
    console.log(`⚠️  This API is deprecated. Use POST /api/attestation/devices/:deviceId/evidence`);

    const tpmDevice = this.tpmDevices.get(deviceId);

    if (!tpmDevice) {
      return {
        valid: false,
        reason: 'TPM device not registered'
      };
    }

    try {
      // Get latest attestation from new pipeline
      const attestation = await tpmAttestationService.getLatestAttestation(deviceId);

      if (!attestation) {
        tpmDevice.status = TPMStatus.ATTESTATION_FAILED;
        return {
          valid: false,
          reason: 'No attestation evidence found. Device must complete attestation challenge-response protocol.'
        };
      }

      // Check freshness
      const fresh = attestation.freshness === AttestationFreshness.FRESH || 
                     attestation.freshness === AttestationFreshness.ACCEPTABLE;

      if (!fresh) {
        tpmDevice.status = TPMStatus.ATTESTATION_FAILED;
        return {
          valid: false,
          reason: `Attestation evidence is ${attestation.freshness}. Issue new challenge.`
        };
      }

      // Check if TPM is attested
      if (attestation.tpmState !== TpmState.ATTESTED) {
        tpmDevice.status = TPMStatus.ATTESTATION_FAILED;
        return {
          valid: false,
          reason: attestation.failureReason ?? 'TPM attestation failed'
        };
      }

      // Update device status
      tpmDevice.attestationValid = true;
      tpmDevice.lastAttestation = attestation.verifiedAt ?? new Date();
      tpmDevice.status = TPMStatus.HEALTHY;

      console.log(`✓ TPM attestation valid for device: ${deviceId}`);

      return { valid: true };
    } catch (error: any) {
      console.error('TPM attestation error:', error);
      tpmDevice.status = TPMStatus.ERROR;
      return {
        valid: false,
        reason: error.message
      };
    }
  }

  /**
   * Get TPM device
   */
  async getTPMDevice(deviceId: string): Promise<TPMDevice | null> {
    return this.tpmDevices.get(deviceId) || null;
  }

  /**
   * Get secure boot status
   */
  async getSecureBootStatus(deviceId: string): Promise<SecureBootStatus | null> {
    return this.secureBootStatuses.get(deviceId) || null;
  }

  /**
   * List TPM devices
   */
  async listTPMDevices(filter?: { status?: TPMStatus }): Promise<TPMDevice[]> {
    let devices = Array.from(this.tpmDevices.values());

    if (filter?.status) {
      devices = devices.filter(d => d.status === filter.status);
    }

    return devices;
  }

  /**
   * List secure boot statuses
   */
  async listSecureBootStatuses(filter?: { bootChainValid?: boolean }): Promise<SecureBootStatus[]> {
    let statuses = Array.from(this.secureBootStatuses.values());

    if (filter?.bootChainValid !== undefined) {
      statuses = statuses.filter(s => s.bootChainValid === filter.bootChainValid);
    }

    return statuses;
  }

  /**
   * Revoke TPM attestation
   */
  async revokeTPMAttestation(deviceId: string, reason: string): Promise<boolean> {
    const tpmDevice = this.tpmDevices.get(deviceId);

    if (!tpmDevice) {
      return false;
    }

    tpmDevice.attestationValid = false;
    tpmDevice.status = TPMStatus.ATTESTATION_FAILED;

    console.log(`⚠️ TPM attestation revoked for ${deviceId}: ${reason}`);

    return true;
  }

  /**
   * Measure boot component (extend PCR)
   * 
   * @deprecated PCR measurements should be performed by TPM on device
   * Control plane does not extend PCRs
   */
  async measureBootComponent(
    deviceId: string,
    pcrIndex: number,
    componentHash: string
  ): Promise<boolean> {
    console.log(`⚠️  measureBootComponent is deprecated: PCR extension must occur on device TPM`);
    return false;
  }

  /**
   * Get statistics
   */
  async getStatistics(): Promise<{
    totalTPMDevices: number;
    healthyTPM: number;
    failedAttestations: number;
    missingTPM: number;
    totalSecureBoot: number;
    validSecureBoot: number;
    invalidSecureBoot: number;
  }> {
    const tpms = Array.from(this.tpmDevices.values());
    const secureBoots = Array.from(this.secureBootStatuses.values());

    // Get real attestation statistics
    const attestationStats = await tpmAttestationService.getStatistics();

    return {
      totalTPMDevices: tpms.length,
      healthyTPM: attestationStats.enrolledDevices,
      failedAttestations: attestationStats.failed,
      missingTPM: tpms.filter(t => t.status === TPMStatus.MISSING).length,
      totalSecureBoot: secureBoots.length,
      validSecureBoot: secureBoots.filter(s => s.bootChainValid).length,
      invalidSecureBoot: secureBoots.filter(s => !s.bootChainValid).length
    };
  }

  // ============================================================================
  // Deprecated Helper Methods
  // These methods are no longer used and should not be relied upon
  // ============================================================================

  /**
   * @deprecated Use cryptographic attestation pipeline
   */
  private async verifyBootStage(
    deviceId: string,
    stageName: string,
    expectedHash: string
  ): Promise<BootStage> {
    return {
      name: stageName,
      hash: '(use attestation API)',
      valid: false,
      timestamp: new Date()
    };
  }

  /**
   * @deprecated Use verifyTpmQuoteSignature from crypto module
   */
  private async verifyTPMSignature(
    quote: any,
    signature: any,
    ekCertificate?: string
  ): Promise<boolean> {
    console.error('SECURITY: verifyTPMSignature is not implemented');
    console.error('Use: tpmAttestationService.submitEvidence() for cryptographic verification');
    return false;
  }

  /**
   * @deprecated Use PCR policy service
   */
  private async verifyPCRValues(pcrValues: Record<string, string>): Promise<boolean> {
    console.error('SECURITY: verifyPCRValues is not implemented');
    console.error('Use: PcrPolicyService for policy-based PCR verification');
    return false;
  }

  /**
   * @deprecated Freshness is determined by attestation pipeline
   */
  private async checkAttestationFreshness(timestamp: Date): Promise<boolean> {
    const now = new Date();
    const ageSeconds = (now.getTime() - timestamp.getTime()) / 1000;
    const maxAgeSeconds = 300; // 5 minutes

    return ageSeconds <= maxAgeSeconds;
  }
}

export const secureBootTPMService = new SecureBootTPMService();
