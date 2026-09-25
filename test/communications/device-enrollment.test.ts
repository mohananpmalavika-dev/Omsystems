/**
 * KryptoVision Connect - Device Enrollment Tests
 * 
 * Tests cover:
 * - Valid enrollment flow
 * - Expired enrollment codes
 * - Used enrollment codes
 * - Cross-tenant security
 * - Invalid employee linking
 * - Duplicate device enrollment
 * - Device revocation
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Pool } from 'pg';
import { DeviceEnrollmentService } from '../../src/communications/services/device-enrollment.service.js';
import { DeviceCredentialService } from '../../src/communications/services/device-credential.service.js';
import type { GenerateEnrollmentCodeInput, EnrollDeviceInput } from '../../src/communications/domain/types.js';

describe('Device Enrollment Security Tests', () => {
  let pool: Pool;
  let enrollmentService: DeviceEnrollmentService;
  let credentialService: DeviceCredentialService;
  
  const TEST_TENANT_ID = 'test-tenant-1';
  const TEST_BRANCH_ID = 'test-branch-1';
  const TEST_EMPLOYEE_ID = 'test-employee-1';
  
  beforeEach(async () => {
    // Initialize test database connection
    pool = new Pool({
      connectionString: process.env.TEST_DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/vms_test',
    });
    
    enrollmentService = new DeviceEnrollmentService(pool);
    credentialService = new DeviceCredentialService(pool);
    
    // Setup test data
    await pool.query(`
      INSERT INTO tenants (id, name) VALUES ($1, 'Test Tenant')
      ON CONFLICT (id) DO NOTHING
    `, [TEST_TENANT_ID]);
    
    await pool.query(`
      INSERT INTO nodes (id, tenant_id, name, node_type, status)
      VALUES ($1, $2, 'Test Branch', 'branch', 'active')
      ON CONFLICT (id) DO NOTHING
    `, [TEST_BRANCH_ID, TEST_TENANT_ID]);
    
    await pool.query(`
      INSERT INTO users (id, tenant_id, username, display_name)
      VALUES ($1, $2, 'test-employee', 'Test Employee')
      ON CONFLICT (id) DO NOTHING
    `, [TEST_EMPLOYEE_ID, TEST_TENANT_ID]);
  });
  
  afterEach(async () => {
    // Cleanup test data
    await pool.query('DELETE FROM communication_devices WHERE tenant_id = $1', [TEST_TENANT_ID]);
    await pool.query('DELETE FROM communication_enrollment_codes WHERE tenant_id = $1', [TEST_TENANT_ID]);
    await pool.end();
  });
  
  describe('Valid Enrollment Flow', () => {
    it('generates enrollment code successfully', async () => {
      const input: GenerateEnrollmentCodeInput = {
        branchId: TEST_BRANCH_ID,
        expiresInMinutes: 30,
        maxUses: 1,
        createdBy: 'admin-user-id',
      };
      
      const code = await enrollmentService.generateEnrollmentCode(input);
      
      expect(code.id).toBeDefined();
      expect(code.code).toBeDefined();
      expect(code.code).toMatch(/^[A-Z0-9]{5}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
      expect(code.branchId).toBe(TEST_BRANCH_ID);
      expect(code.expiresAt).toBeInstanceOf(Date);
      expect(code.usedAt).toBeNull();
    });
    
    it('enrolls device with valid enrollment code', async () => {
      // Generate enrollment code
      const enrollmentCode = await enrollmentService.generateEnrollmentCode({
        branchId: TEST_BRANCH_ID,
        expiresInMinutes: 30,
        maxUses: 1,
        createdBy: 'admin-user-id',
      });
      
      // Enroll device
      const enrollInput: EnrollDeviceInput = {
        enrollmentCode: enrollmentCode.code,
        deviceName: 'Test Device',
        platform: 'WINDOWS',
        publicKey: 'test-public-key-base64',
        deviceUuid: 'test-device-uuid-1',
        linkedEmployeeIds: [],
      };
      
      const result = await enrollmentService.enrollDevice(enrollInput);
      
      expect(result.device.id).toBeDefined();
      expect(result.device.deviceName).toBe('Test Device');
      expect(result.device.branchId).toBe(TEST_BRANCH_ID);
      expect(result.device.tenantId).toBe(TEST_TENANT_ID);
      expect(result.device.status).toBe('PENDING');
      expect(result.device.publicKey).toBe('test-public-key-base64');
      
      // Verify enrollment code is marked as used
      const codeResult = await pool.query(
        'SELECT used_at FROM communication_enrollment_codes WHERE id = $1',
        [enrollmentCode.id]
      );
      expect(codeResult.rows[0].used_at).not.toBeNull();
    });
    
    it('enrolls device with linked employees', async () => {
      const enrollmentCode = await enrollmentService.generateEnrollmentCode({
        branchId: TEST_BRANCH_ID,
        expiresInMinutes: 30,
        maxUses: 1,
        createdBy: 'admin-user-id',
      });
      
      const enrollInput: EnrollDeviceInput = {
        enrollmentCode: enrollmentCode.code,
        deviceName: 'Shared PC',
        platform: 'WINDOWS',
        publicKey: 'test-public-key',
        deviceUuid: 'shared-pc-uuid',
        linkedEmployeeIds: [TEST_EMPLOYEE_ID],
      };
      
      const result = await enrollmentService.enrollDevice(enrollInput);
      
      // Verify employee linkage
      const linkResult = await pool.query(
        'SELECT * FROM communication_device_employees WHERE device_id = $1 AND employee_id = $2',
        [result.device.id, TEST_EMPLOYEE_ID]
      );
      
      expect(linkResult.rows.length).toBe(1);
      expect(linkResult.rows[0].can_receive_calls).toBe(true);
      expect(linkResult.rows[0].can_make_calls).toBe(true);
    });
  });
  
  describe('Expired Enrollment Code', () => {
    it('rejects enrollment with expired code', async () => {
      // Generate code that expires immediately
      const enrollmentCode = await enrollmentService.generateEnrollmentCode({
        branchId: TEST_BRANCH_ID,
        expiresInMinutes: -1, // Already expired
        maxUses: 1,
        createdBy: 'admin-user-id',
      });
      
      const enrollInput: EnrollDeviceInput = {
        enrollmentCode: enrollmentCode.code,
        deviceName: 'Test Device',
        platform: 'WINDOWS',
        publicKey: 'test-public-key',
        deviceUuid: 'test-uuid',
        linkedEmployeeIds: [],
      };
      
      await expect(enrollmentService.enrollDevice(enrollInput)).rejects.toThrow('expired');
    });
  });
  
  describe('Used Enrollment Code', () => {
    it('rejects enrollment with already-used code', async () => {
      const enrollmentCode = await enrollmentService.generateEnrollmentCode({
        branchId: TEST_BRANCH_ID,
        expiresInMinutes: 30,
        maxUses: 1,
        createdBy: 'admin-user-id',
      });
      
      // First enrollment
      const enrollInput1: EnrollDeviceInput = {
        enrollmentCode: enrollmentCode.code,
        deviceName: 'Device 1',
        platform: 'WINDOWS',
        publicKey: 'key1',
        deviceUuid: 'uuid1',
        linkedEmployeeIds: [],
      };
      
      await enrollmentService.enrollDevice(enrollInput1);
      
      // Second enrollment with same code
      const enrollInput2: EnrollDeviceInput = {
        enrollmentCode: enrollmentCode.code,
        deviceName: 'Device 2',
        platform: 'ANDROID',
        publicKey: 'key2',
        deviceUuid: 'uuid2',
        linkedEmployeeIds: [],
      };
      
      await expect(enrollmentService.enrollDevice(enrollInput2)).rejects.toThrow();
    });
  });
  
  describe('Cross-Tenant Security', () => {
    it('cannot link employee from different tenant', async () => {
      const OTHER_TENANT_ID = 'other-tenant-id';
      const OTHER_EMPLOYEE_ID = 'other-employee-id';
      
      // Create other tenant and employee
      await pool.query(`
        INSERT INTO tenants (id, name) VALUES ($1, 'Other Tenant')
        ON CONFLICT (id) DO NOTHING
      `, [OTHER_TENANT_ID]);
      
      await pool.query(`
        INSERT INTO users (id, tenant_id, username, display_name)
        VALUES ($1, $2, 'other-employee', 'Other Employee')
        ON CONFLICT (id) DO NOTHING
      `, [OTHER_EMPLOYEE_ID, OTHER_TENANT_ID]);
      
      const enrollmentCode = await enrollmentService.generateEnrollmentCode({
        branchId: TEST_BRANCH_ID,
        expiresInMinutes: 30,
        maxUses: 1,
        createdBy: 'admin-user-id',
      });
      
      const enrollInput: EnrollDeviceInput = {
        enrollmentCode: enrollmentCode.code,
        deviceName: 'Test Device',
        platform: 'WINDOWS',
        publicKey: 'test-key',
        deviceUuid: 'test-uuid',
        linkedEmployeeIds: [OTHER_EMPLOYEE_ID], // Employee from different tenant
      };
      
      await expect(enrollmentService.enrollDevice(enrollInput)).rejects.toThrow();
    });
  });
  
  describe('Duplicate Device Registration', () => {
    it('rejects enrollment with duplicate device UUID', async () => {
      const DEVICE_UUID = 'duplicate-uuid';
      
      // First enrollment
      const code1 = await enrollmentService.generateEnrollmentCode({
        branchId: TEST_BRANCH_ID,
        expiresInMinutes: 30,
        maxUses: 1,
        createdBy: 'admin',
      });
      
      await enrollmentService.enrollDevice({
        enrollmentCode: code1.code,
        deviceName: 'Device 1',
        platform: 'WINDOWS',
        publicKey: 'key1',
        deviceUuid: DEVICE_UUID,
        linkedEmployeeIds: [],
      });
      
      // Second enrollment with same UUID
      const code2 = await enrollmentService.generateEnrollmentCode({
        branchId: TEST_BRANCH_ID,
        expiresInMinutes: 30,
        maxUses: 1,
        createdBy: 'admin',
      });
      
      await expect(enrollmentService.enrollDevice({
        enrollmentCode: code2.code,
        deviceName: 'Device 2',
        platform: 'ANDROID',
        publicKey: 'key2',
        deviceUuid: DEVICE_UUID, // Duplicate
        linkedEmployeeIds: [],
      })).rejects.toThrow();
    });
  });
  
  describe('Device Approval', () => {
    it('approves pending device', async () => {
      const enrollmentCode = await enrollmentService.generateEnrollmentCode({
        branchId: TEST_BRANCH_ID,
        expiresInMinutes: 30,
        maxUses: 1,
        createdBy: 'admin',
      });
      
      const enrollment = await enrollmentService.enrollDevice({
        enrollmentCode: enrollmentCode.code,
        deviceName: 'Test Device',
        platform: 'WINDOWS',
        publicKey: 'test-key',
        deviceUuid: 'test-uuid',
        linkedEmployeeIds: [],
      });
      
      const device = await enrollmentService.approveDevice(enrollment.device.id, 'admin-user-id');
      
      expect(device.status).toBe('ACTIVE');
      expect(device.approvedAt).toBeInstanceOf(Date);
      expect(device.approvedBy).toBe('admin-user-id');
    });
  });
  
  describe('Device Revocation', () => {
    it('revokes active device', async () => {
      const enrollmentCode = await enrollmentService.generateEnrollmentCode({
        branchId: TEST_BRANCH_ID,
        expiresInMinutes: 30,
        maxUses: 1,
        createdBy: 'admin',
      });
      
      const enrollment = await enrollmentService.enrollDevice({
        enrollmentCode: enrollmentCode.code,
        deviceName: 'Test Device',
        platform: 'WINDOWS',
        publicKey: 'test-key',
        deviceUuid: 'test-uuid',
        linkedEmployeeIds: [],
      });
      
      await enrollmentService.approveDevice(enrollment.device.id, 'admin');
      
      const device = await enrollmentService.revokeDevice(
        enrollment.device.id,
        'admin-user-id',
        'Device lost'
      );
      
      expect(device.status).toBe('REVOKED');
      expect(device.revokedAt).toBeInstanceOf(Date);
      expect(device.statusReason).toBe('Device lost');
    });
    
    it('prevents authentication after revocation', async () => {
      const enrollmentCode = await enrollmentService.generateEnrollmentCode({
        branchId: TEST_BRANCH_ID,
        expiresInMinutes: 30,
        maxUses: 1,
        createdBy: 'admin',
      });
      
      const enrollment = await enrollmentService.enrollDevice({
        enrollmentCode: enrollmentCode.code,
        deviceName: 'Test Device',
        platform: 'WINDOWS',
        publicKey: 'test-key',
        deviceUuid: 'test-uuid',
        linkedEmployeeIds: [],
      });
      
      await enrollmentService.approveDevice(enrollment.device.id, 'admin');
      
      // Generate credentials
      const tokens = await credentialService.createDeviceTokens(enrollment.device.id);
      
      // Verify credential works
      let context = await credentialService.verifyDeviceCredential(tokens.accessToken);
      expect(context).not.toBeNull();
      
      // Revoke device
      await enrollmentService.revokeDevice(enrollment.device.id, 'admin', 'Test revocation');
      
      // Verify credential no longer works
      context = await credentialService.verifyDeviceCredential(tokens.accessToken);
      expect(context).toBeNull();
    });
  });
});
