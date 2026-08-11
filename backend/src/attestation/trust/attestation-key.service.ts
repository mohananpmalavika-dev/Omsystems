/**
 * Attestation Key Trust Service
 * Manages device AK enrollment, verification, and revocation
 */

import crypto from 'crypto';
import {
  DeviceAttestationIdentity,
  AttestationIdentityStatus,
  AttestationFailureReason,
} from '../domain/attestation.types';
import { AttestationKeyTrustError } from '../domain/attestation-errors';
import {
  calculatePublicKeyFingerprint,
  validatePublicKeyFormat,
  validatePublicKeyStrength,
} from '../crypto/tpm-signature.verifier';

/**
 * In-memory identity store
 * Production should use database with proper indexing
 */
interface IdentityStore {
  identities: Map<string, DeviceAttestationIdentity>;
  deviceToIdentity: Map<string, string>; // deviceId -> identityId
  fingerprintToIdentity: Map<string, string>; // fingerprint -> identityId
}

export class AttestationKeyService {
  private store: IdentityStore = {
    identities: new Map(),
    deviceToIdentity: new Map(),
    fingerprintToIdentity: new Map(),
  };

  /**
   * Generate unique identity ID
   */
  private generateIdentityId(): string {
    return `ident_${crypto.randomBytes(16).toString('hex')}`;
  }

  /**
   * Enroll a device's Attestation Key
   * This establishes trust during provisioning
   */
  async enrollAttestationKey(params: {
    tenantId: string;
    deviceId: string;
    akName: string;
    akPublicKeyPem: string;
    endorsementKeyFingerprint?: string;
    manufacturer?: string;
    model?: string;
  }): Promise<DeviceAttestationIdentity> {
    // Validate public key format
    if (!validatePublicKeyFormat(params.akPublicKeyPem)) {
      throw new AttestationKeyTrustError(
        AttestationFailureReason.AK_UNTRUSTED,
        'Invalid AK public key format',
        { deviceId: params.deviceId }
      );
    }

    // Validate key strength
    const strengthValidation = validatePublicKeyStrength(params.akPublicKeyPem);
    if (!strengthValidation.valid) {
      throw new AttestationKeyTrustError(
        AttestationFailureReason.AK_UNTRUSTED,
        `AK does not meet security requirements: ${strengthValidation.reason}`,
        { deviceId: params.deviceId, reason: strengthValidation.reason }
      );
    }

    // Calculate fingerprint
    const akPublicKeyFingerprint = calculatePublicKeyFingerprint(
      params.akPublicKeyPem
    );

    // Check if device already has an enrolled AK
    const existingIdentityId = this.store.deviceToIdentity.get(params.deviceId);
    if (existingIdentityId) {
      const existingIdentity = this.store.identities.get(existingIdentityId);
      if (existingIdentity && existingIdentity.revokedAt === null) {
        throw new AttestationKeyTrustError(
          AttestationFailureReason.AK_UNTRUSTED,
          `Device ${params.deviceId} already has an active AK enrolled`,
          {
            deviceId: params.deviceId,
            existingIdentityId,
            existingFingerprint: existingIdentity.akPublicKeyFingerprint,
          }
        );
      }
    }

    // Check if this AK fingerprint is already enrolled
    const existingByFingerprint = this.store.fingerprintToIdentity.get(
      akPublicKeyFingerprint
    );
    if (existingByFingerprint) {
      const existingIdentity = this.store.identities.get(existingByFingerprint);
      if (existingIdentity && existingIdentity.revokedAt === null) {
        throw new AttestationKeyTrustError(
          AttestationFailureReason.AK_UNTRUSTED,
          'This AK is already enrolled for a different device',
          {
            newDeviceId: params.deviceId,
            existingDeviceId: existingIdentity.deviceId,
            fingerprint: akPublicKeyFingerprint,
          }
        );
      }
    }

    // Create identity
    const identity: DeviceAttestationIdentity = {
      id: this.generateIdentityId(),
      tenantId: params.tenantId,
      deviceId: params.deviceId,
      akName: params.akName,
      akPublicKeyFingerprint,
      akPublicKeyPem: params.akPublicKeyPem,
      endorsementKeyFingerprint: params.endorsementKeyFingerprint,
      manufacturer: params.manufacturer,
      model: params.model,
      enrolledAt: new Date(),
      revokedAt: null,
    };

    // Store identity
    this.store.identities.set(identity.id, identity);
    this.store.deviceToIdentity.set(params.deviceId, identity.id);
    this.store.fingerprintToIdentity.set(akPublicKeyFingerprint, identity.id);

    console.log(
      `✓ Enrolled AK for device ${params.deviceId}: ${akPublicKeyFingerprint.substring(0, 16)}...`
    );

    return identity;
  }

  /**
   * Get device attestation identity
   */
  async getDeviceIdentity(
    deviceId: string
  ): Promise<DeviceAttestationIdentity | null> {
    const identityId = this.store.deviceToIdentity.get(deviceId);
    if (!identityId) {
      return null;
    }

    return this.store.identities.get(identityId) ?? null;
  }

  /**
   * Get identity by fingerprint
   */
  async getIdentityByFingerprint(
    fingerprint: string
  ): Promise<DeviceAttestationIdentity | null> {
    const identityId = this.store.fingerprintToIdentity.get(fingerprint);
    if (!identityId) {
      return null;
    }

    return this.store.identities.get(identityId) ?? null;
  }

  /**
   * Verify AK trust for attestation
   * This is the key trust decision for quote verification
   */
  async verifyAkTrust(
    deviceId: string,
    submittedAkPublicKeyPem: string
  ): Promise<{
    trusted: boolean;
    identity?: DeviceAttestationIdentity;
    reason?: AttestationFailureReason;
    message?: string;
  }> {
    // Get enrolled identity for device
    const identity = await this.getDeviceIdentity(deviceId);

    if (!identity) {
      return {
        trusted: false,
        reason: AttestationFailureReason.AK_NOT_ENROLLED,
        message: `No AK enrolled for device ${deviceId}`,
      };
    }

    // Check if revoked
    if (identity.revokedAt !== null) {
      return {
        trusted: false,
        identity,
        reason: AttestationFailureReason.AK_REVOKED,
        message: `AK was revoked at ${identity.revokedAt.toISOString()}: ${identity.revocationReason ?? 'unknown reason'}`,
      };
    }

    // Calculate fingerprint of submitted key
    let submittedFingerprint: string;
    try {
      submittedFingerprint = calculatePublicKeyFingerprint(submittedAkPublicKeyPem);
    } catch (error) {
      return {
        trusted: false,
        identity,
        reason: AttestationFailureReason.AK_UNTRUSTED,
        message: 'Invalid AK public key format in submission',
      };
    }

    // Verify fingerprint matches enrolled AK
    if (submittedFingerprint !== identity.akPublicKeyFingerprint) {
      return {
        trusted: false,
        identity,
        reason: AttestationFailureReason.AK_MISMATCH,
        message: `Submitted AK fingerprint ${submittedFingerprint.substring(0, 16)}... does not match enrolled AK ${identity.akPublicKeyFingerprint.substring(0, 16)}...`,
      };
    }

    // AK is trusted
    return {
      trusted: true,
      identity,
    };
  }

  /**
   * Revoke device AK
   */
  async revokeAttestationKey(
    deviceId: string,
    reason: string
  ): Promise<boolean> {
    const identity = await this.getDeviceIdentity(deviceId);

    if (!identity) {
      return false;
    }

    if (identity.revokedAt !== null) {
      // Already revoked
      return true;
    }

    // Mark as revoked
    identity.revokedAt = new Date();
    identity.revocationReason = reason;

    console.log(`⚠️  Revoked AK for device ${deviceId}: ${reason}`);

    return true;
  }

  /**
   * Get AK status for device
   */
  async getAkStatus(deviceId: string): Promise<AttestationIdentityStatus> {
    const identity = await this.getDeviceIdentity(deviceId);

    if (!identity) {
      return AttestationIdentityStatus.UNKNOWN;
    }

    if (identity.revokedAt !== null) {
      return AttestationIdentityStatus.REVOKED;
    }

    return AttestationIdentityStatus.ENROLLED;
  }

  /**
   * List all enrolled identities for tenant
   */
  async listIdentities(params: {
    tenantId: string;
    includeRevoked?: boolean;
  }): Promise<DeviceAttestationIdentity[]> {
    const identities: DeviceAttestationIdentity[] = [];

    for (const identity of this.store.identities.values()) {
      if (identity.tenantId !== params.tenantId) {
        continue;
      }

      if (!params.includeRevoked && identity.revokedAt !== null) {
        continue;
      }

      identities.push(identity);
    }

    return identities;
  }

  /**
   * Get identity statistics
   */
  async getStatistics(tenantId: string): Promise<{
    totalIdentities: number;
    activeIdentities: number;
    revokedIdentities: number;
    enrollmentsByManufacturer: Record<string, number>;
  }> {
    const identities = await this.listIdentities({
      tenantId,
      includeRevoked: true,
    });

    let active = 0;
    let revoked = 0;
    const byManufacturer: Record<string, number> = {};

    for (const identity of identities) {
      if (identity.revokedAt !== null) {
        revoked++;
      } else {
        active++;
      }

      if (identity.manufacturer) {
        byManufacturer[identity.manufacturer] =
          (byManufacturer[identity.manufacturer] ?? 0) + 1;
      }
    }

    return {
      totalIdentities: identities.length,
      activeIdentities: active,
      revokedIdentities: revoked,
      enrollmentsByManufacturer: byManufacturer,
    };
  }

  /**
   * Update device model/manufacturer metadata
   */
  async updateIdentityMetadata(
    deviceId: string,
    metadata: {
      manufacturer?: string;
      model?: string;
    }
  ): Promise<boolean> {
    const identity = await this.getDeviceIdentity(deviceId);

    if (!identity) {
      return false;
    }

    if (metadata.manufacturer !== undefined) {
      identity.manufacturer = metadata.manufacturer;
    }

    if (metadata.model !== undefined) {
      identity.model = metadata.model;
    }

    return true;
  }

  /**
   * Re-enroll device with new AK (revokes old one)
   */
  async reEnrollAttestationKey(params: {
    tenantId: string;
    deviceId: string;
    akName: string;
    akPublicKeyPem: string;
    endorsementKeyFingerprint?: string;
    manufacturer?: string;
    model?: string;
    revocationReason: string;
  }): Promise<DeviceAttestationIdentity> {
    // Revoke existing AK
    await this.revokeAttestationKey(params.deviceId, params.revocationReason);

    // Enroll new AK
    return this.enrollAttestationKey(params);
  }
}
