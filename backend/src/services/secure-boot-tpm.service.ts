/**
 * Secure Boot and TPM Attestation Service
 * Device boot verification, TPM attestation, and hardware security validation
 */

import {
  SecureBootStatus,
  BootStage,
  TPMDevice,
  TPMStatus
} from '../types/security.types';
import crypto from 'crypto';

export class SecureBootTPMService {
  private secureBootStatuses: Map<string, SecureBootStatus> = new Map();
  private tpmDevices: Map<string, TPMDevice> = new Map();

  /**
   * Verify secure boot chain
   */
  async verifySecureBoot(deviceId: string): Promise<SecureBootStatus> {
    console.log(`🔒 Verifying secure boot for device: ${deviceId}`);

    const stages: BootStage[] = [];

    // Stage 1: UEFI/BIOS
    stages.push(await this.verifyBootStage(deviceId, 'UEFI', 'uefi-hash'));

    // Stage 2: Bootloader
    stages.push(await this.verifyBootStage(deviceId, 'Bootloader', 'bootloader-hash'));

    // Stage 3: Kernel
    stages.push(await this.verifyBootStage(deviceId, 'Kernel', 'kernel-hash'));

    // Stage 4: Init System
    stages.push(await this.verifyBootStage(deviceId, 'Init', 'init-hash'));

    // Stage 5: Application
    stages.push(await this.verifyBootStage(deviceId, 'Application', 'app-hash'));

    // Check if entire chain is valid
    const bootChainValid = stages.every(s => s.valid);
    const issues = stages.filter(s => !s.valid).map(s => `${s.name} verification failed`);

    const status: SecureBootStatus = {
      deviceId,
      enabled: true,
      bootChainValid,
      lastValidated: new Date(),
      stages,
      issues
    };

    this.secureBootStatuses.set(deviceId, status);

    if (bootChainValid) {
      console.log(`✓ Secure boot chain valid for device: ${deviceId}`);
    } else {
      console.log(`❌ Secure boot chain INVALID for device: ${deviceId}`);
      console.log(`Issues: ${issues.join(', ')}`);
    }

    return status;
  }

  /**
   * Register TPM device
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

    return tpmDevice;
  }

  /**
   * Perform TPM attestation
   */
  async attestTPM(deviceId: string, quote: any, signature: any): Promise<{
    valid: boolean;
    reason?: string;
  }> {
    console.log(`🔍 Attesting TPM for device: ${deviceId}`);

    const tpmDevice = this.tpmDevices.get(deviceId);

    if (!tpmDevice) {
      return {
        valid: false,
        reason: 'TPM device not registered'
      };
    }

    try {
      // Step 1: Verify quote signature
      const signatureValid = await this.verifyTPMSignature(quote, signature, tpmDevice.ekCertificate);

      if (!signatureValid) {
        tpmDevice.status = TPMStatus.ATTESTATION_FAILED;
        return {
          valid: false,
          reason: 'TPM signature verification failed'
        };
      }

      // Step 2: Verify PCR values
      const pcrValid = await this.verifyPCRValues(quote.pcrValues);

      if (!pcrValid) {
        tpmDevice.status = TPMStatus.ATTESTATION_FAILED;
        return {
          valid: false,
          reason: 'PCR values do not match expected baseline'
        };
      }

      // Step 3: Check freshness
      const fresh = await this.checkAttestation Freshness(quote.timestamp);

      if (!fresh) {
        tpmDevice.status = TPMStatus.ATTESTATION_FAILED;
        return {
          valid: false,
          reason: 'Attestation quote is not fresh (replay attack?)'
        };
      }

      // Attestation successful
      tpmDevice.attestationValid = true;
      tpmDevice.lastAttestation = new Date();
      tpmDevice.pcrValues = quote.pcrValues;
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
   */
  async measureBootComponent(
    deviceId: string,
    pcrIndex: number,
    componentHash: string
  ): Promise<boolean> {
    const tpmDevice = this.tpmDevices.get(deviceId);

    if (!tpmDevice) {
      return false;
    }

    // Extend PCR (hash of current PCR + new measurement)
    const currentPCR = tpmDevice.pcrValues[pcrIndex] || '0'.repeat(64);
    const extendedPCR = crypto
      .createHash('sha256')
      .update(currentPCR + componentHash)
      .digest('hex');

    tpmDevice.pcrValues[pcrIndex] = extendedPCR;

    console.log(`📏 PCR ${pcrIndex} extended for device ${deviceId}`);

    return true;
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

    return {
      totalTPMDevices: tpms.length,
      healthyTPM: tpms.filter(t => t.status === TPMStatus.HEALTHY).length,
      failedAttestations: tpms.filter(t => t.status === TPMStatus.ATTESTATION_FAILED).length,
      missingTPM: tpms.filter(t => t.status === TPMStatus.MISSING).length,
      totalSecureBoot: secureBoots.length,
      validSecureBoot: secureBoots.filter(s => s.bootChainValid).length,
      invalidSecureBoot: secureBoots.filter(s => !s.bootChainValid).length
    };
  }

  // ============================================================================
  // Helper methods
  // ============================================================================

  private async verifyBootStage(
    deviceId: string,
    stageName: string,
    expectedHash: string
  ): Promise<BootStage> {
    // In production: retrieve actual hash from device
    // For now, simulate verification
    const actualHash = expectedHash; // Would come from device
    const valid = actualHash === expectedHash;

    return {
      name: stageName,
      hash: actualHash,
      valid,
      timestamp: new Date()
    };
  }

  private async verifyTPMSignature(
    quote: any,
    signature: any,
    ekCertificate?: string
  ): Promise<boolean> {
    // In production: verify signature using EK certificate public key
    // For now, return true
    return true;
  }

  private async verifyPCRValues(pcrValues: Record<string, string>): Promise<boolean> {
    // In production: compare against known good baseline
    // Check PCR 0-7 for boot components
    // PCR 0: BIOS/UEFI
    // PCR 1: BIOS/UEFI configuration
    // PCR 2: Option ROMs
    // PCR 3: Option ROM configuration
    // PCR 4: Boot loader
    // PCR 5: Boot loader configuration
    // PCR 6: Resume from sleep
    // PCR 7: Secure boot state

    return true;
  }

  private async checkAttestationFreshness(timestamp: Date): Promise<boolean> {
    const now = new Date();
    const ageSeconds = (now.getTime() - timestamp.getTime()) / 1000;
    const maxAgeSeconds = 300; // 5 minutes

    return ageSeconds <= maxAgeSeconds;
  }
}

export const secureBootTPMService = new SecureBootTPMService();
