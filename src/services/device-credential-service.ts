/**
 * Device Credential Service
 * 
 * Handles secure credential rotation for cameras, NVRs, and edge devices.
 * 
 * Key Features:
 * - Cryptographically secure password generation
 * - AES-256-GCM encryption for stored credentials
 * - Transactional rotation workflow
 * - Automatic rollback on failure
 * - Full audit trail
 * 
 * @see DEVICE_MANAGEMENT_PRODUCTION_GUIDE.md for complete documentation
 */

import crypto from 'crypto';
import type { ExtendedControlPlaneStore } from '../control-plane-store.js';
import { deviceCredentialVault } from '../security/vault/device-credential-vault.service.js';

interface CredentialRotationInput {
  tenantId: string;
  deviceId: string;
  reason: string;
  requestedBy: string;
  rotationMode: 'scheduled' | 'emergency';
}

interface EncryptedSecret {
  ciphertext: string;
  keyVersion: number;
}

export class DeviceCredentialService {
  private readonly ALGORITHM = 'aes-256-gcm';
  private readonly KEY_VERSION = 1;
  private readonly PASSWORD_LENGTH = 24;

  constructor(private readonly store: ExtendedControlPlaneStore) {}

  /**
   * Initiate credential rotation for a device.
   * Creates an encrypted credential record and queues a job for async execution.
   */
  async rotateCredential(input: CredentialRotationInput) {
    // Validate device exists
    const device = await this.store.getDeviceInventory(input.deviceId);
    if (!device || device.tenantId !== input.tenantId) {
      throw new Error(`Device ${input.deviceId} not found`);
    }

    // 1. Generate secure password
    const newPassword = this.generateSecurePassword(this.PASSWORD_LENGTH);

    // 2. Encrypt password
    const encrypted = await this.encryptSecret(newPassword);

    // 3. Get current credential version
    const currentCredential = await this.store.getCurrentDeviceCredential(input.deviceId);
    const newVersion = currentCredential ? currentCredential.credentialVersion + 1 : 1;

    // 4. Create credential record (status: rotating)
    const credential = await this.store.createDeviceCredential({
      tenantId: input.tenantId,
      deviceId: input.deviceId,
      credentialVersion: newVersion,
      username: 'admin',
      encryptedSecret: encrypted.ciphertext,
      encryptionKeyVersion: this.KEY_VERSION,
      status: 'rotating',
      replacesCredentialId: currentCredential?.id,
    });

    // 5. Create async job
    const job = await this.store.createDeviceConfigurationJob({
      tenantId: input.tenantId,
      deviceId: input.deviceId,
      jobType: 'credential-rotation',
      requestedBy: input.requestedBy,
      reason: input.reason,
      priority: input.rotationMode === 'emergency' ? 'high' : 'normal',
      payload: {
        credentialId: credential.id,
        rotationMode: input.rotationMode,
      },
      status: 'queued',
    });

    // 6. Audit
    await this.store.writeAudit({
      tenantId: input.tenantId,
      action: 'device.credential.rotation-initiated',
      actorUserId: input.requestedBy,
      resourceNodeId: device.branchNodeId ?? null,
      outcome: 'success',
      details: {
        jobId: job.id,
        credentialVersion: credential.credentialVersion,
        reason: input.reason,
        mode: input.rotationMode,
        resourceId: input.deviceId,
      },
    });

    return job;
  }

  /**
   * Generate a cryptographically secure password that meets device requirements.
   * 
   * Requirements:
   * - Minimum length
   * - At least one uppercase letter
   * - At least one lowercase letter
   * - At least one digit
   * - At least one special character
   * - Vendor-compatible character set
   */
  private generateSecurePassword(length: number): string {
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const symbols = '!@#$%^&*';  // Vendor-compatible symbols only

    const allChars = uppercase + lowercase + numbers + symbols;

    // Ensure at least one character from each required set
    let password = '';
    password += this.randomChar(uppercase);
    password += this.randomChar(lowercase);
    password += this.randomChar(numbers);
    password += this.randomChar(symbols);

    // Fill remaining length with random characters
    for (let i = 4; i < length; i++) {
      password += this.randomChar(allChars);
    }

    // Shuffle to randomize position of required characters
    return this.shuffleString(password);
  }

  /**
   * Encrypt a secret using the authoritative AES-256-GCM Credential Vault.
   */
  async encryptSecret(plaintext: string): Promise<EncryptedSecret> {
    const encrypted = deviceCredentialVault.encryptCredential(plaintext);
    return {
      ciphertext: encrypted.ciphertext,
      keyVersion: this.KEY_VERSION,
    };
  }

  /**
   * Decrypt a secret encrypted with encryptSecret() or legacy format.
   */
  async decryptSecret(encrypted: string): Promise<string> {
    if (encrypted.includes(':')) {
      // Legacy format backwards compatibility: <version>:<iv>:<tag>:<ciphertext>
      const parts = encrypted.split(':');
      if (parts.length >= 4) {
        const versionStr = parts[0] ?? '';
        const ivHex = parts[1] ?? '';
        const authTagHex = parts[2] ?? '';
        const ciphertext = parts.slice(3).join(':') ?? '';

        if (versionStr && ivHex && authTagHex && ciphertext) {
          const version = Number.parseInt(versionStr, 10);
          if (Number.isFinite(version)) {
            const key = await this.getEncryptionKey(version);
            const iv = Buffer.from(ivHex, 'hex');
            const authTag = Buffer.from(authTagHex, 'hex');

            const decipher = crypto.createDecipheriv(this.ALGORITHM, key, iv);
            decipher.setAuthTag(authTag);

            let plaintext = decipher.update(ciphertext, 'hex', 'utf8');
            plaintext += decipher.final('utf8');
            return plaintext;
          }
        }
      }
    }

    // Authoritative Device Credential Vault format
    return deviceCredentialVault.decryptCredential({
      ciphertext: encrypted,
      fingerprintSha256: '',
      encryptedAt: new Date().toISOString(),
    });
  }

  /**
   * Retrieve encryption key for the specified version.
   * 
   * In production, this should integrate with a proper key management service (AWS KMS, Azure Key Vault, etc.)
   * For now, derives key from environment variable using scrypt.
   */
  private async getEncryptionKey(version: number): Promise<Buffer> {
    const keyMaterial = process.env.DEVICE_CREDENTIAL_ENCRYPTION_KEY;
    if (!keyMaterial) {
      throw new Error('DEVICE_CREDENTIAL_ENCRYPTION_KEY not configured');
    }

    // Use scrypt to derive a 32-byte key from the key material
    // In production, use a proper KMS with key rotation
    return crypto.scryptSync(keyMaterial, `salt-v${version}`, 32);
  }

  private randomChar(chars: string): string {
    const index = crypto.randomInt(0, chars.length);
    const char = chars[index];
    if (!char) {
      throw new Error('Failed to generate random credential character');
    }
    return char;
  }

  private shuffleString(str: string): string {
    const arr = str.split('');
    for (let i = arr.length - 1; i > 0; i--) {
      const j = crypto.randomInt(0, i + 1);
      const left = arr[i];
      const right = arr[j];
      if (left === undefined || right === undefined) {
        continue;
      }
      [arr[i], arr[j]] = [right, left];
    }
    return arr.join('');
  }
}
