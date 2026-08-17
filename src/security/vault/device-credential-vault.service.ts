/**
 * Device Credential Vault Service
 * Banking-Grade AES-256-GCM encryption for camera/NVR credentials.
 * Zero plaintext ever stored in database or logs.
 */

import { createCipheriv, createDecipheriv, createHash, pbkdf2Sync, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LEN = 16;
const AUTH_TAG_LEN = 16;
const KEY_LEN = 32;
const PBKDF2_ITERS = 200_000;

function getDerivedMasterKey(): Buffer {
  const password = process.env.VAULT_MASTER_PASSWORD;
  const salt = process.env.VAULT_SALT;

  if (!password || password.length < 32) {
    throw new Error(
      "VAULT_MASTER_PASSWORD must be set (min 32 chars). Never run in production without a secure vault master key.",
    );
  }
  if (!salt || salt.length < 32) {
    throw new Error(
      "VAULT_SALT must be set (min 32 chars). Never run in production without a stable PBKDF2 salt.",
    );
  }

  return pbkdf2Sync(password, salt, PBKDF2_ITERS, KEY_LEN, "sha512");
}

export interface EncryptedCredential {
  /** Base64-encoded ciphertext: [IV | AuthTag | CipherData] */
  ciphertext: string;
  /** SHA-256 fingerprint of original plaintext (for integrity verification without decryption) */
  fingerprintSha256: string;
  /** ISO timestamp when credential was encrypted */
  encryptedAt: string;
}

export interface DeviceCredentialVaultService {
  encryptCredential(plaintext: string): EncryptedCredential;
  decryptCredential(encrypted: EncryptedCredential): string;
  rotateCredential(existing: EncryptedCredential, newPlaintext: string): EncryptedCredential;
  verifyIntegrity(encrypted: EncryptedCredential, expectedFingerprint: string): boolean;
}

export class AesGcmCredentialVault implements DeviceCredentialVaultService {
  encryptCredential(plaintext: string): EncryptedCredential {
    if (!plaintext || plaintext.length === 0) {
      throw new Error("Cannot encrypt empty credential");
    }

    const key = getDerivedMasterKey();
    const iv = randomBytes(IV_LEN);
    const cipher = createCipheriv(ALGORITHM, key, iv);

    const encryptedBuf = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();

    // Layout: [16 bytes IV] + [16 bytes AuthTag] + [N bytes CipherData]
    const combined = Buffer.concat([iv, authTag, encryptedBuf]);

    const fingerprintSha256 = createHash("sha256")
      .update(plaintext, "utf8")
      .digest("hex");

    return {
      ciphertext: combined.toString("base64"),
      fingerprintSha256,
      encryptedAt: new Date().toISOString(),
    };
  }

  decryptCredential(encrypted: EncryptedCredential): string {
    const key = getDerivedMasterKey();
    const combined = Buffer.from(encrypted.ciphertext, "base64");

    if (combined.length < IV_LEN + AUTH_TAG_LEN + 1) {
      throw new Error("Invalid ciphertext length — data may be corrupted or tampered");
    }

    const iv = combined.subarray(0, IV_LEN);
    const authTag = combined.subarray(IV_LEN, IV_LEN + AUTH_TAG_LEN);
    const cipherData = combined.subarray(IV_LEN + AUTH_TAG_LEN);

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    try {
      const decrypted = Buffer.concat([decipher.update(cipherData), decipher.final()]);
      return decrypted.toString("utf8");
    } catch {
      throw new Error("GCM authentication tag mismatch — credential data is corrupted or tampered");
    }
  }

  rotateCredential(existing: EncryptedCredential, newPlaintext: string): EncryptedCredential {
    // Verify existing can be decrypted before accepting rotation
    this.decryptCredential(existing);
    return this.encryptCredential(newPlaintext);
  }

  verifyIntegrity(encrypted: EncryptedCredential, expectedFingerprint: string): boolean {
    try {
      const plaintext = this.decryptCredential(encrypted);
      const actualFingerprint = createHash("sha256").update(plaintext, "utf8").digest("hex");
      return actualFingerprint === expectedFingerprint && actualFingerprint === encrypted.fingerprintSha256;
    } catch {
      return false;
    }
  }
}

// Singleton — key derived lazily on first use
export const deviceCredentialVault = new AesGcmCredentialVault();
