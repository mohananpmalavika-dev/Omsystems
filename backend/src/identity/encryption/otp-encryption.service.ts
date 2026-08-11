/**
 * OTP Encryption Service
 * 
 * Encrypts OTP codes for temporary storage in notification outbox.
 * Uses AES-256-GCM with unique IV per message.
 * 
 * SECURITY PRINCIPLES:
 * 1. OTP hash stored for verification (one-way)
 * 2. OTP ciphertext stored for delivery (reversible, temporary)
 * 3. Ciphertext cleared immediately after successful delivery
 * 4. Each encryption uses unique IV (initialization vector)
 * 5. GCM provides authenticated encryption (integrity + confidentiality)
 */

import crypto from 'crypto';
import { logger } from '../../utils/logger.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 128 bits for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits
const KEY_LENGTH = 32; // 256 bits

export interface EncryptedPayload {
  /** Base64-encoded ciphertext */
  ciphertext: string;
  
  /** Base64-encoded initialization vector */
  iv: string;
  
  /** Base64-encoded authentication tag */
  authTag: string;
  
  /** Algorithm used */
  algorithm: string;
}

export class OtpEncryptionService {
  private readonly encryptionKey: Buffer;

  constructor(encryptionKeyHex?: string) {
    // Load from environment or provided key
    const keyHex = encryptionKeyHex || process.env.OTP_ENCRYPTION_KEY;

    if (!keyHex) {
      throw new Error(
        'OTP_ENCRYPTION_KEY environment variable is required. ' +
        'Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
      );
    }

    // Validate key length
    const keyBuffer = Buffer.from(keyHex, 'hex');
    if (keyBuffer.length !== KEY_LENGTH) {
      throw new Error(
        `OTP encryption key must be ${KEY_LENGTH} bytes (${KEY_LENGTH * 2} hex characters). ` +
        `Got ${keyBuffer.length} bytes.`
      );
    }

    this.encryptionKey = keyBuffer;

    logger.info('OTP encryption service initialized', {
      algorithm: ALGORITHM,
      keyLength: KEY_LENGTH * 8, // bits
    });
  }

  /**
   * Encrypt OTP for storage in notification outbox
   * 
   * @param plaintext - The OTP code (e.g., "382914")
   * @returns Encrypted payload with IV and auth tag
   */
  async encrypt(plaintext: string): Promise<EncryptedPayload> {
    try {
      // Generate unique IV for this encryption
      const iv = crypto.randomBytes(IV_LENGTH);

      // Create cipher
      const cipher = crypto.createCipheriv(ALGORITHM, this.encryptionKey, iv);

      // Encrypt
      let ciphertext = cipher.update(plaintext, 'utf8');
      ciphertext = Buffer.concat([ciphertext, cipher.final()]);

      // Get authentication tag
      const authTag = cipher.getAuthTag();

      return {
        ciphertext: ciphertext.toString('base64'),
        iv: iv.toString('base64'),
        authTag: authTag.toString('base64'),
        algorithm: ALGORITHM,
      };
    } catch (error) {
      logger.error('OTP encryption failed', { error });
      throw new Error('Failed to encrypt OTP');
    }
  }

  /**
   * Decrypt OTP from notification outbox payload
   * 
   * @param encrypted - The encrypted payload
   * @returns Plaintext OTP
   * @throws Error if decryption fails or authentication fails
   */
  async decrypt(encrypted: EncryptedPayload): Promise<string> {
    try {
      // Validate algorithm
      if (encrypted.algorithm !== ALGORITHM) {
        throw new Error(`Unsupported algorithm: ${encrypted.algorithm}`);
      }

      // Parse components
      const ciphertext = Buffer.from(encrypted.ciphertext, 'base64');
      const iv = Buffer.from(encrypted.iv, 'base64');
      const authTag = Buffer.from(encrypted.authTag, 'base64');

      // Create decipher
      const decipher = crypto.createDecipheriv(ALGORITHM, this.encryptionKey, iv);
      decipher.setAuthTag(authTag);

      // Decrypt
      let plaintext = decipher.update(ciphertext);
      plaintext = Buffer.concat([plaintext, decipher.final()]);

      return plaintext.toString('utf8');
    } catch (error) {
      logger.error('OTP decryption failed', { error });
      
      // Don't expose detailed error (could leak timing info)
      throw new Error('Failed to decrypt OTP');
    }
  }

  /**
   * Encrypt OTP and store in mfa_challenges.otp_ciphertext column
   * 
   * This variant stores the full encrypted payload as JSON in a TEXT column.
   * Alternative: store iv, ciphertext, authTag in separate columns.
   */
  async encryptForStorage(plaintext: string): Promise<string> {
    const encrypted = await this.encrypt(plaintext);
    return JSON.stringify(encrypted);
  }

  /**
   * Decrypt OTP from mfa_challenges.otp_ciphertext column
   */
  async decryptFromStorage(encryptedJson: string): Promise<string> {
    try {
      const encrypted = JSON.parse(encryptedJson) as EncryptedPayload;
      return await this.decrypt(encrypted);
    } catch (error) {
      logger.error('Failed to parse encrypted OTP JSON', { error });
      throw new Error('Invalid encrypted OTP format');
    }
  }

  /**
   * Generate a secure OTP encryption key
   * This is a utility method for setup/rotation
   */
  static generateKey(): string {
    return crypto.randomBytes(KEY_LENGTH).toString('hex');
  }

  /**
   * Verify encryption key format without exposing the key
   */
  static validateKeyFormat(keyHex: string): boolean {
    try {
      const buffer = Buffer.from(keyHex, 'hex');
      return buffer.length === KEY_LENGTH;
    } catch {
      return false;
    }
  }
}

/**
 * Hash OTP for verification storage
 * 
 * Separate from encryption - this is one-way hashing for verification.
 * Use SHA-256 which is fast and adequate for OTP verification.
 * 
 * For higher security requirements, consider bcrypt or Argon2,
 * but OTP lifetime is short (5-10 min) so SHA-256 is acceptable.
 */
export class OtpHasher {
  /**
   * Hash OTP for storage in mfa_challenges.otp_hash
   */
  async hash(otp: string): Promise<string> {
    return crypto
      .createHash('sha256')
      .update(otp)
      .digest('hex');
  }

  /**
   * Verify submitted OTP against stored hash
   * Uses timing-safe comparison to prevent timing attacks
   */
  async verify(submittedOtp: string, storedHash: string): Promise<boolean> {
    try {
      const submittedHash = await this.hash(submittedOtp);

      // Timing-safe comparison
      return crypto.timingSafeEqual(
        Buffer.from(submittedHash, 'hex'),
        Buffer.from(storedHash, 'hex')
      );
    } catch (error) {
      // timingSafeEqual throws if buffers have different lengths
      // This is expected for invalid OTPs
      return false;
    }
  }

  /**
   * Hash phone number or email for destination_hash column
   * Allows correlation without storing PII in plaintext
   */
  async hashDestination(destination: string): Promise<string> {
    // Normalize before hashing
    const normalized = destination.trim().toLowerCase();
    
    return crypto
      .createHash('sha256')
      .update(normalized)
      .digest('hex');
  }
}

/**
 * OTP Generator
 * 
 * Generates cryptographically secure random OTP codes.
 */
export class OtpGenerator {
  /**
   * Generate numeric OTP
   * 
   * @param length - Number of digits (typically 6)
   * @returns Numeric OTP string (e.g., "382914")
   */
  generate(length: number = 6): string {
    if (length < 4 || length > 10) {
      throw new Error('OTP length must be between 4 and 10 digits');
    }

    // Calculate range for crypto.randomInt
    const min = Math.pow(10, length - 1);
    const max = Math.pow(10, length);

    // Generate cryptographically secure random number
    const otp = crypto.randomInt(min, max);

    // Return as zero-padded string
    return otp.toString().padStart(length, '0');
  }

  /**
   * Generate alphanumeric OTP (for backup codes)
   * 
   * @param length - Number of characters (typically 8)
   * @returns Alphanumeric string (e.g., "K7M9P2X4")
   */
  generateAlphanumeric(length: number = 8): string {
    if (length < 4 || length > 32) {
      throw new Error('Alphanumeric OTP length must be between 4 and 32');
    }

    // Use only unambiguous characters (no 0/O, 1/I/l)
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    
    const bytes = crypto.randomBytes(length);
    let result = '';

    for (let i = 0; i < length; i++) {
      result += chars[bytes[i] % chars.length];
    }

    return result;
  }
}

/**
 * Factory for creating OTP services
 */
export function createOtpServices(encryptionKey?: string) {
  return {
    encryptionService: new OtpEncryptionService(encryptionKey),
    hasher: new OtpHasher(),
    generator: new OtpGenerator(),
  };
}

/**
 * Singleton instances for convenience
 * Initialized lazily on first access
 */
let services: ReturnType<typeof createOtpServices> | null = null;

export function getOtpServices() {
  if (!services) {
    services = createOtpServices();
  }
  return services;
}
