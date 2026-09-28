/**
 * Device Credential Service
 * 
 * Manages device credentials and authentication tokens for communication devices.
 * Uses cryptographic principles similar to SessionService but optimized for
 * zero-login device authentication.
 * 
 * Core responsibilities:
 * - Generate and validate device certificates
 * - Create secure device authentication tokens
 * - Verify device credentials
 * - Manage credential lifecycle
 * 
 * Security principles:
 * - Device credentials use public-key cryptography
 * - Refresh tokens are hashed before storage (SHA-256)
 * - Certificates are time-bound
 * - No plaintext secrets stored
 * - Tenant isolation enforced
 */

import type { Pool } from 'pg';
import { createHash, randomBytes } from 'crypto';
import jsonwebtoken from 'jsonwebtoken';
const { sign, verify } = jsonwebtoken;
import type {
  CommunicationDevice,
  DeviceCredential,
} from '../domain/types.js';

/**
 * Device certificate generation options
 */
export interface GenerateDeviceCertificateOptions {
  /**
   * Device ID
   */
  deviceId: string;

  /**
   * Tenant ID
   */
  tenantId: string;

  /**
   * Device public key (PEM format)
   */
  publicKey: string;

  /**
   * Certificate validity duration in days (default: 365)
   */
  validityDays?: number;
}

/**
 * Device token generation result
 */
export interface DeviceTokenResult {
  /**
   * Device ID
   */
  deviceId: string;

  /**
   * Access token (short-lived)
   */
  accessToken: string;

  /**
   * Refresh token (long-lived, opaque)
   */
  refreshToken: string;

  /**
   * Access token expiry timestamp
   */
  accessTokenExpiresAt: Date;

  /**
   * Refresh token expiry timestamp
   */
  refreshTokenExpiresAt: Date;
}

/**
 * Credential verification result
 */
export interface CredentialVerification {
  /**
   * Whether credential is valid
   */
  valid: boolean;

  /**
   * Device ID if valid
   */
  deviceId?: string;

  /**
   * Tenant ID if valid
   */
  tenantId?: string;

  /**
   * Branch ID if valid
   */
  branchId?: string;

  /**
   * Device status if valid
   */
  status?: string;

  /**
   * Rejection reason if invalid
   */
  reason?: string;
}

/**
 * Device Credential Service
 */
export class DeviceCredentialService {
  /**
   * Access token lifetime in seconds (default: 1 hour)
   */
  private readonly ACCESS_TOKEN_LIFETIME = 3600;

  /**
   * Refresh token lifetime in seconds (default: 30 days)
   */
  private readonly REFRESH_TOKEN_LIFETIME = 2592000;

  constructor(private readonly pool: Pool) {}

  /**
   * Generate device certificate after enrollment
   * 
   * Certificates bind the device ID to its public key.
   * This allows signature-based authentication.
   * 
   * @param options - Certificate generation options
   * @returns Certificate ID
   */
  async generateDeviceCertificate(
    options: GenerateDeviceCertificateOptions
  ): Promise<string> {
    const {
      deviceId,
      tenantId,
      publicKey,
      validityDays = 365,
    } = options;

    // Calculate expiry
    const expiresAt = new Date(Date.now() + validityDays * 24 * 60 * 60 * 1000);

    // Generate certificate ID
    const certificateId = this.generateId();

    // Store certificate metadata
    // In production, this would also generate an actual X.509 certificate
    // For now, we store the association
    await this.pool.query(
      `UPDATE communication_devices
      SET
        certificate_id = $1,
        updated_at = NOW()
      WHERE id = $2 AND tenant_id = $3`,
      [certificateId, deviceId, tenantId]
    );

    return certificateId;
  }

  /**
   * Create device authentication tokens
   * 
   * Similar to SessionService but optimized for devices.
   * Devices use refresh tokens for long-lived authentication.
   * 
   * @param device - Device to create tokens for
   * @returns Device tokens
   */
  async createDeviceTokens(
    device: CommunicationDevice | string
  ): Promise<DeviceTokenResult> {
    const deviceRecord = typeof device === 'string'
      ? await this.resolveDevice(device)
      : device;

    if (!deviceRecord) {
      throw new Error('DEVICE_NOT_FOUND');
    }

    const accessToken = this.generateAccessToken(deviceRecord.id, deviceRecord.deviceUuid);
    const refreshToken = this.generateRefreshToken();

    // Hash refresh token for storage
    const refreshTokenHash = this.hashToken(refreshToken);

    // Calculate expiry times
    const now = new Date();
    const accessTokenExpiresAt = new Date(
      now.getTime() + this.ACCESS_TOKEN_LIFETIME * 1000
    );
    const refreshTokenExpiresAt = new Date(
      now.getTime() + this.REFRESH_TOKEN_LIFETIME * 1000
    );

    // Store credential
    await this.pool.query(
      `INSERT INTO communication_device_credentials (
        device_id, tenant_id,
        refresh_token_hash,
        expires_at,
        created_at
      ) VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (device_id)
      DO UPDATE SET
        refresh_token_hash = EXCLUDED.refresh_token_hash,
        expires_at = EXCLUDED.expires_at,
        created_at = NOW()`,
      [
        deviceRecord.id,
        deviceRecord.tenantId,
        refreshTokenHash,
        refreshTokenExpiresAt,
      ]
    );

    // Update device last seen
    await this.pool.query(
      `UPDATE communication_devices
      SET last_seen_at = NOW(), updated_at = NOW()
      WHERE id = $1`,
      [deviceRecord.id]
    );

    return {
      deviceId: deviceRecord.id,
      accessToken,
      refreshToken,
      accessTokenExpiresAt,
      refreshTokenExpiresAt,
    };
  }

  /**
   * Verify device credential
   * 
   * Used for authenticating device requests.
   * Checks both access token and device status.
   * 
   * @param accessToken - Access token to verify
   * @returns Verification result
   */
  async verifyDeviceCredential(
    accessToken: string
  ): Promise<CredentialVerification> {
    try {
      const deviceId = await this.extractDeviceId(accessToken);

      if (!deviceId) {
        return {
          valid: false,
          reason: 'INVALID_ACCESS_TOKEN',
        };
      }

      // Get device
      const result = await this.pool.query<CommunicationDevice>(
        `SELECT
          id, tenant_id as "tenantId", branch_id as "branchId",
          status, revoked_at as "revokedAt"
        FROM communication_devices
        WHERE id = $1`,
        [deviceId]
      );

      if (result.rows.length === 0) {
        return {
          valid: false,
          reason: 'DEVICE_NOT_FOUND',
        };
      }

      const device = result.rows[0]!;
      const credential = await this.pool.query(
        `SELECT 1 FROM communication_device_credentials
         WHERE device_id = $1 AND tenant_id = $2 AND expires_at > NOW() LIMIT 1`,
        [device.id, device.tenantId]
      );
      if (!credential.rowCount) return { valid: false, reason: 'DEVICE_LOGGED_OUT' };

      // Check device status
      if (device.status === 'REVOKED' || device.revokedAt) {
        return {
          valid: false,
          reason: 'DEVICE_REVOKED',
        };
      }

      if (device.status === 'PENDING') {
        return {
          valid: false,
          reason: 'DEVICE_NOT_APPROVED',
        };
      }

      if (device.status === 'DISABLED') {
        return {
          valid: false,
          reason: 'DEVICE_DISABLED',
        };
      }

      // Valid credential
      return {
        valid: true,
        deviceId: device.id,
        tenantId: device.tenantId,
        branchId: device.branchId,
        status: device.status,
      };
    } catch (error) {
      return {
        valid: false,
        reason: 'CREDENTIAL_VERIFICATION_ERROR',
      };
    }
  }

  /**
   * Refresh device tokens using refresh token
   * 
   * Implements token rotation for security.
   * 
   * @param refreshToken - Refresh token
   * @returns New device tokens
   */
  async refreshDeviceTokens(
    refreshToken: string
  ): Promise<DeviceTokenResult | null> {
    // Hash provided token
    const tokenHash = this.hashToken(refreshToken);

    // Find credential
    const credResult = await this.pool.query<DeviceCredential>(
      `SELECT
        device_id as "deviceId",
        tenant_id as "tenantId",
        expires_at as "expiresAt"
      FROM communication_device_credentials
      WHERE refresh_token_hash = $1`,
      [tokenHash]
    );

    if (credResult.rows.length === 0) {
      return null;
    }

    const credential = credResult.rows[0]!;

    // Check expiry
    if (new Date() > new Date(credential.expiresAt)) {
      return null;
    }

    // Get device
    const deviceResult = await this.pool.query<CommunicationDevice>(
      `SELECT
        id, tenant_id as "tenantId", branch_id as "branchId",
        device_uuid as "deviceUuid",
        device_name as "deviceName", device_type as "deviceType",
        platform, status
      FROM communication_devices
      WHERE id = $1 AND tenant_id = $2`,
      [credential.deviceId, credential.tenantId]
    );

    if (deviceResult.rows.length === 0) {
      return null;
    }

    const device = deviceResult.rows[0]!;

    // Check device status
    if (device.status !== 'ACTIVE' && device.status !== 'OFFLINE' && device.status !== 'PENDING') {
      return null;
    }

    // Rotate atomically. Parallel refreshes using the same old token cannot
    // both succeed, so a stolen or replayed refresh token is not usable after
    // the first accepted rotation.
    const nextRefreshToken = this.generateRefreshToken();
    const nextRefreshTokenHash = this.hashToken(nextRefreshToken);
    const now = new Date();
    const accessTokenExpiresAt = new Date(now.getTime() + this.ACCESS_TOKEN_LIFETIME * 1000);
    const refreshTokenExpiresAt = new Date(now.getTime() + this.REFRESH_TOKEN_LIFETIME * 1000);
    const rotated = await this.pool.query(
      `UPDATE communication_device_credentials
       SET refresh_token_hash = $1, expires_at = $2, created_at = NOW()
       WHERE device_id = $3 AND tenant_id = $4 AND refresh_token_hash = $5
       RETURNING device_id`,
      [nextRefreshTokenHash, refreshTokenExpiresAt, credential.deviceId, credential.tenantId, tokenHash]
    );
    if (!rotated.rowCount) return null;

    await this.pool.query(
      `UPDATE communication_devices SET last_seen_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2`,
      [device.id, device.tenantId]
    );
    return {
      deviceId: device.id,
      accessToken: this.generateAccessToken(device.id, device.deviceUuid),
      refreshToken: nextRefreshToken,
      accessTokenExpiresAt,
      refreshTokenExpiresAt,
    };
  }

  /**
   * Revoke device credential
   * 
   * Called when device is revoked or deactivated.
   * 
   * @param deviceId - Device ID
   * @returns Success status
   */
  async revokeDeviceCredential(deviceId: string): Promise<boolean> {
    const result = await this.pool.query(
      `DELETE FROM communication_device_credentials
      WHERE device_id = $1`,
      [deviceId]
    );

    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Generate access token
   * 
   * In production, this would be a signed JWT.
   * For now, we use a random token with device ID embedded.
   * 
   * @returns Access token
   * @private
   */
  private generateAccessToken(deviceId: string, deviceUuid?: string): string {
    return sign(
      { typ: 'device-access', deviceId, deviceUuid },
      this.getSigningSecret(),
      { algorithm: 'HS256', expiresIn: this.ACCESS_TOKEN_LIFETIME, issuer: 'sentinel-communications', audience: 'communication-device' }
    );
  }

  private getSigningSecret(): string {
    const secret = process.env.COMM_DEVICE_TOKEN_SECRET || process.env.JWT_SECRET;
    if (!secret || secret.length < 32) throw new Error('COMM_DEVICE_TOKEN_SECRET or a 32-character JWT_SECRET is required');
    return secret;
  }

  private async resolveDevice(deviceId: string): Promise<CommunicationDevice | null> {
    const result = await this.pool.query<CommunicationDevice>(
      `SELECT
        id, tenant_id as "tenantId", branch_id as "branchId",
        device_name as "deviceName", device_uuid as "deviceUuid",
        device_type as "deviceType", platform,
        public_key as "publicKey", certificate_id as "certificateId",
        credential_hash as "credentialHash",
        status, status_reason as "statusReason",
        app_version as "appVersion", last_seen_at as "lastSeenAt",
        last_ip as "lastIp", device_capabilities as "deviceCapabilities",
        registered_at as "registeredAt", approved_at as "approvedAt",
        approved_by as "approvedBy", revoked_at as "revokedAt",
        revoked_by as "revokedBy", revoke_reason as "revokeReason",
        created_at as "createdAt", updated_at as "updatedAt"
      FROM communication_devices WHERE id = $1 LIMIT 1`,
      [deviceId]
    );

    return result.rows[0] ?? null;
  }

  /**
   * Generate refresh token
   * 
   * Opaque high-entropy token for long-lived authentication.
   * 
   * @returns Refresh token
   * @private
   */
  private generateRefreshToken(): string {
    return randomBytes(32).toString('base64url');
  }

  /**
   * Generate unique ID
   * 
   * @returns Random ID
   * @private
   */
  private generateId(): string {
    return randomBytes(16).toString('hex');
  }

  /**
   * Hash token for storage (SHA-256)
   * 
   * Never store plaintext refresh tokens.
   * 
   * @param token - Token to hash
   * @returns Hashed token
   * @private
   */
  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /**
   * Extract device ID from access token
   * 
   * Verify JWT signature, issuer, audience, and expiry before looking up the device.
   * 
   * @param token - Access token
   * @returns Device ID or null
   * @private
   */
  private async extractDeviceId(token: string): Promise<string | null> {
    try {
      const payload = verify(token, this.getSigningSecret(), {
        algorithms: ['HS256'], issuer: 'sentinel-communications', audience: 'communication-device',
      }) as {
        typ?: string;
        deviceId?: string;
        deviceUuid?: string;
      };
      if (payload.typ !== 'device-access') return null;

      if (payload.deviceId) {
        const result = await this.pool.query<{ id: string }>(
          `SELECT id FROM communication_devices WHERE id = $1 LIMIT 1`,
          [payload.deviceId]
        );
        return result.rows[0]?.id ?? null;
      }

      if (!payload.deviceUuid) {
        return null;
      }

      const result = await this.pool.query<{ id: string }>(
        `SELECT id FROM communication_devices WHERE device_uuid = $1 LIMIT 1`,
        [payload.deviceUuid]
      );
      return result.rows[0]?.id ?? null;
    } catch {
      return null;
    }
  }
}
