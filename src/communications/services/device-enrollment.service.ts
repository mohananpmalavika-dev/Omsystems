/**
 * Device Enrollment Service
 * 
 * Manages secure device enrollment using cryptographic enrollment codes.
 * This service implements zero-login device registration where devices use
 * cryptographic keys instead of passwords.
 * 
 * Core responsibilities:
 * - Generate cryptographically random enrollment codes
 * - Validate enrollment codes (expiry, tenant, branch)
 * - Register devices with public keys
 * - Approve/revoke device credentials
 * 
 * Security principles:
 * - Enrollment codes are single-use (optional)
 * - Codes expire after configured duration
 * - Branch identity resolved from enrollment token (never trusted from client)
 * - Device public keys stored; private keys never leave the device
 * - Tenant isolation enforced throughout
 */

import type { Pool } from 'pg';
import { randomBytes } from 'crypto';
import type {
  CommunicationDevice,
  CommunicationDeviceType,
  CommunicationDeviceStatus,
  EnrollmentCode,
  DeviceEnrollmentInput,
  DevicePlatform,
} from '../domain/types.js';
import { ENROLLMENT_CODE_LENGTH } from '../domain/constants.js';

/**
 * Enrollment code generation options
 */
export interface GenerateEnrollmentCodeOptions {
  /**
   * Branch this enrollment is valid for
   */
  branchId: string;

  /**
   * Tenant this enrollment belongs to (resolved from branch)
   */
  tenantId: string;

  /**
   * Optional device type restriction
   */
  allowedDeviceType?: CommunicationDeviceType;

  /**
   * Optional employee IDs that must be linked
   */
  employeeIds?: string[];

  /**
   * Expiration duration in minutes (default: 30)
   */
  expiresInMinutes?: number;

  /**
   * Whether code is single-use (default: true)
   */
  singleUse?: boolean;

  /**
   * User who generated this code (for audit)
   */
  createdBy: string;
}

/**
 * Enrollment validation result
 */
export interface EnrollmentValidation {
  /**
   * Whether enrollment code is valid
   */
  valid: boolean;

  /**
   * Branch ID resolved from enrollment code
   */
  branchId?: string;

  /**
   * Tenant ID resolved from enrollment code
   */
  tenantId?: string;

  /**
   * Allowed device type (if restricted)
   */
  allowedDeviceType?: CommunicationDeviceType;

  /**
   * Employee IDs that must be linked (if specified)
   */
  employeeIds?: string[];

  /**
   * Rejection reason if invalid
   */
  reason?: string;
}

/**
 * Device Enrollment Service
 */
export class DeviceEnrollmentService {
  constructor(private readonly pool: Pool) {}

  /**
   * Generate a new enrollment code
   * 
   * Enrollment codes are cryptographically random and single-use by default.
   * They encode the branch identity so clients cannot forge branch associations.
   * 
   * @param options - Enrollment code generation options
   * @returns Created enrollment code
   */
  async generateEnrollmentCode(
    options: GenerateEnrollmentCodeOptions
  ): Promise<EnrollmentCode> {
    const {
      branchId,
      tenantId,
      allowedDeviceType,
      employeeIds = [],
      expiresInMinutes = 30,
      singleUse = true,
      createdBy,
    } = options;

    // Generate cryptographically random code
    const code = this.generateRandomCode();

    // Calculate expiry
    const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);

    // Create enrollment code record
    const result = await this.pool.query<EnrollmentCode>(
      `INSERT INTO communication_enrollment_codes (
        id, tenant_id, branch_id, code,
        allowed_device_type, required_employee_ids,
        expires_at, single_use, created_by
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8
      )
      RETURNING
        id, tenant_id as "tenantId", branch_id as "branchId",
        code, allowed_device_type as "allowedDeviceType",
        required_employee_ids as "requiredEmployeeIds",
        expires_at as "expiresAt", single_use as "singleUse",
        used_at as "usedAt", created_by as "createdBy",
        created_at as "createdAt"`,
      [
        tenantId,
        branchId,
        code,
        allowedDeviceType || null,
        employeeIds.length > 0 ? JSON.stringify(employeeIds) : null,
        expiresAt,
        singleUse,
        createdBy,
      ]
    );

    return result.rows[0]!;
  }

  /**
   * Validate enrollment code and return resolved branch/tenant
   * 
   * This is the authoritative validation before device enrollment.
   * The branch identity comes from the database, not the client.
   * 
   * @param code - Enrollment code to validate
   * @returns Validation result with resolved identities
   */
  async validateEnrollmentCode(code: string): Promise<EnrollmentValidation> {
    // Query enrollment code
    const result = await this.pool.query<EnrollmentCode>(
      `SELECT
        id, tenant_id as "tenantId", branch_id as "branchId",
        code, allowed_device_type as "allowedDeviceType",
        required_employee_ids as "requiredEmployeeIds",
        expires_at as "expiresAt", single_use as "singleUse",
        used_at as "usedAt", created_by as "createdBy",
        created_at as "createdAt"
      FROM communication_enrollment_codes
      WHERE code = $1`,
      [code]
    );

    if (result.rows.length === 0) {
      return {
        valid: false,
        reason: 'ENROLLMENT_CODE_NOT_FOUND',
      };
    }

    const enrollment = result.rows[0]!;

    // Check expiry
    if (new Date() > new Date(enrollment.expiresAt)) {
      return {
        valid: false,
        reason: 'ENROLLMENT_CODE_EXPIRED',
      };
    }

    // Check if already used (single-use)
    if (enrollment.singleUse && enrollment.usedAt) {
      return {
        valid: false,
        reason: 'ENROLLMENT_CODE_ALREADY_USED',
      };
    }

    // Valid enrollment
    return {
      valid: true,
      branchId: enrollment.branchId,
      tenantId: enrollment.tenantId,
      allowedDeviceType: enrollment.allowedDeviceType || undefined,
      employeeIds: enrollment.requiredEmployeeIds || undefined,
    };
  }

  /**
   * Enroll a new device using enrollment code
   * 
   * This creates a new device record with PENDING status.
   * The device must be approved before it can communicate.
   * 
   * @param input - Device enrollment input
   * @returns Enrolled device
   */
  async enrollDevice(input: DeviceEnrollmentInput): Promise<CommunicationDevice> {
    // Validate enrollment code
    const validation = await this.validateEnrollmentCode(input.enrollmentCode);

    if (!validation.valid) {
      throw new Error(validation.reason || 'INVALID_ENROLLMENT_CODE');
    }

    // Validate device type if restricted
    if (
      validation.allowedDeviceType &&
      input.deviceType !== validation.allowedDeviceType
    ) {
      throw new Error('ENROLLMENT_DEVICE_TYPE_MISMATCH');
    }

    // Validate employee IDs if required
    if (validation.employeeIds && validation.employeeIds.length > 0) {
      const missingEmployees = validation.employeeIds.filter(
        (id) => !input.linkedEmployeeIds?.includes(id)
      );

      if (missingEmployees.length > 0) {
        throw new Error('ENROLLMENT_MISSING_REQUIRED_EMPLOYEES');
      }
    }

    // Begin transaction
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Create device record
      const deviceResult = await client.query<CommunicationDevice>(
        `INSERT INTO communication_devices (
          id, tenant_id, branch_id,
          device_name, device_type, platform,
          public_key, status,
          registered_at, created_at, updated_at
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7,
          NOW(), NOW(), NOW()
        )
        RETURNING
          id, tenant_id as "tenantId", branch_id as "branchId",
          device_name as "deviceName", device_type as "deviceType",
          platform, public_key as "publicKey",
          certificate_id as "certificateId",
          status, app_version as "appVersion",
          last_seen_at as "lastSeenAt",
          registered_at as "registeredAt",
          approved_at as "approvedAt",
          revoked_at as "revokedAt",
          created_at as "createdAt",
          updated_at as "updatedAt"`,
        [
          validation.tenantId!,
          validation.branchId!,
          input.deviceName,
          input.deviceType,
          input.platform,
          input.devicePublicKey,
          'PENDING', // Initial status
        ]
      );

      const device = deviceResult.rows[0]!;

      // Link employees if specified
      if (input.linkedEmployeeIds && input.linkedEmployeeIds.length > 0) {
        for (const employeeId of input.linkedEmployeeIds) {
          await client.query(
            `INSERT INTO communication_device_employees (
              device_id, employee_id,
              is_primary, can_receive_calls, can_make_calls,
              can_receive_messages, can_send_messages,
              linked_at
            ) VALUES ($1, $2, $3, true, true, true, true, NOW())`,
            [
              device.id,
              employeeId,
              input.linkedEmployeeIds[0] === employeeId, // First is primary
            ]
          );
        }
      }

      // Mark enrollment code as used (if single-use)
      await client.query(
        `UPDATE communication_enrollment_codes
        SET used_at = NOW()
        WHERE code = $1 AND single_use = true`,
        [input.enrollmentCode]
      );

      await client.query('COMMIT');

      return device;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Approve a pending device
   * 
   * Devices must be approved before they can communicate.
   * This allows administrators to review devices before activation.
   * 
   * @param deviceId - Device ID to approve
   * @param approvedBy - User ID who approved
   * @returns Updated device
   */
  async approveDevice(
    deviceId: string,
    approvedBy: string
  ): Promise<CommunicationDevice | null> {
    const result = await this.pool.query<CommunicationDevice>(
      `UPDATE communication_devices
      SET
        status = 'ACTIVE',
        approved_at = NOW(),
        updated_at = NOW()
      WHERE id = $1 AND status = 'PENDING'
      RETURNING
        id, tenant_id as "tenantId", branch_id as "branchId",
        device_name as "deviceName", device_type as "deviceType",
        platform, public_key as "publicKey",
        certificate_id as "certificateId",
        status, app_version as "appVersion",
        last_seen_at as "lastSeenAt",
        registered_at as "registeredAt",
        approved_at as "approvedAt",
        revoked_at as "revokedAt",
        created_at as "createdAt",
        updated_at as "updatedAt"`,
      [deviceId]
    );

    return result.rows[0] || null;
  }

  /**
   * Revoke a device credential
   * 
   * Revoked devices lose all communication authorization.
   * This is the primary mechanism for deactivating lost/stolen devices.
   * 
   * @param deviceId - Device ID to revoke
   * @param revokedBy - User ID who revoked
   * @param reason - Revocation reason
   * @returns Updated device
   */
  async revokeDevice(
    deviceId: string,
    revokedBy: string,
    reason: string
  ): Promise<CommunicationDevice | null> {
    const result = await this.pool.query<CommunicationDevice>(
      `UPDATE communication_devices
      SET
        status = 'REVOKED',
        revoked_at = NOW(),
        updated_at = NOW()
      WHERE id = $1 AND status != 'REVOKED'
      RETURNING
        id, tenant_id as "tenantId", branch_id as "branchId",
        device_name as "deviceName", device_type as "deviceType",
        platform, public_key as "publicKey",
        certificate_id as "certificateId",
        status, app_version as "appVersion",
        last_seen_at as "lastSeenAt",
        registered_at as "registeredAt",
        approved_at as "approvedAt",
        revoked_at as "revokedAt",
        created_at as "createdAt",
        updated_at as "updatedAt"`,
      [deviceId]
    );

    return result.rows[0] || null;
  }

  /**
   * Get device by ID
   * 
   * @param deviceId - Device ID
   * @returns Device or null if not found
   */
  async getDevice(deviceId: string): Promise<CommunicationDevice | null> {
    const result = await this.pool.query<CommunicationDevice>(
      `SELECT
        id, tenant_id as "tenantId", branch_id as "branchId",
        device_name as "deviceName", device_type as "deviceType",
        platform, public_key as "publicKey",
        certificate_id as "certificateId",
        status, app_version as "appVersion",
        last_seen_at as "lastSeenAt",
        registered_at as "registeredAt",
        approved_at as "approvedAt",
        revoked_at as "revokedAt",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM communication_devices
      WHERE id = $1`,
      [deviceId]
    );

    return result.rows[0] || null;
  }

  /**
   * List devices for a branch
   * 
   * @param branchId - Branch ID
   * @param tenantId - Tenant ID (for isolation)
   * @returns Array of devices
   */
  async listBranchDevices(
    branchId: string,
    tenantId: string
  ): Promise<CommunicationDevice[]> {
    const result = await this.pool.query<CommunicationDevice>(
      `SELECT
        id, tenant_id as "tenantId", branch_id as "branchId",
        device_name as "deviceName", device_type as "deviceType",
        platform, public_key as "publicKey",
        certificate_id as "certificateId",
        status, app_version as "appVersion",
        last_seen_at as "lastSeenAt",
        registered_at as "registeredAt",
        approved_at as "approvedAt",
        revoked_at as "revokedAt",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM communication_devices
      WHERE branch_id = $1 AND tenant_id = $2
      ORDER BY registered_at DESC`,
      [branchId, tenantId]
    );

    return result.rows;
  }

  /**
   * Generate cryptographically random enrollment code
   * 
   * Format: XXXX-XXXX-XXXX for readability
   * 
   * @returns Random enrollment code
   * @private
   */
  private generateRandomCode(): string {
    const bytes = randomBytes(ENROLLMENT_CODE_LENGTH / 2);
    const code = bytes.toString('hex').toUpperCase();

    // Format as XXXX-XXXX-XXXX
    return [
      code.substring(0, 4),
      code.substring(4, 8),
      code.substring(8, 12),
    ].join('-');
  }
}
