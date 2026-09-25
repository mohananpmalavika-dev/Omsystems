/**
 * KryptoVision Connect - First-Answer-Wins Call Tests
 * 
 * Critical tests for atomic call acceptance:
 * - First device to accept wins
 * - Other devices receive CALL_ACCEPTED_ELSEWHERE
 * - Race condition handling
 * - Network interruption during acceptance
 * - Duplicate accept attempts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Pool } from 'pg';
import type { RedisClientType } from 'redis';
import { createClient } from 'redis';
import { CallStateMachineService } from '../../src/communications/services/call-state-machine.service.js';
import { CommunicationCallService } from '../../src/communications/services/call.service.js';
import { CommunicationPresenceService } from '../../src/communications/services/presence.service.js';
import type { Logger } from 'pino';
import pino from 'pino';

describe('First-Answer-Wins Call Acceptance Tests', () => {
  let pool: Pool;
  let redis: RedisClientType;
  let logger: Logger;
  let callStateMachine: CallStateMachineService;
  let callService: CommunicationCallService;
  let presenceService: CommunicationPresenceService;
  
  const TEST_TENANT_ID = 'test-tenant-1';
  const TEST_BRANCH_ID = 'test-branch-1';
  const DEVICE_1_ID = 'device-1';
  const DEVICE_2_ID = 'device-2';
  const DEVICE_3_ID = 'device-3';
  const OPERATOR_ID = 'operator-1';
  
  beforeEach(async () => {
    pool = new Pool({
      connectionString: process.env.TEST_DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/vms_test',
    });
    
    redis = createClient({
      url: process.env.TEST_REDIS_URL || 'redis://localhost:6379',
    }) as RedisClientType;
    await redis.connect();
    
    logger = pino({ level: 'silent' });
    
    callStateMachine = new CallStateMachineService(pool, redis, logger);
    presenceService = new CommunicationPresenceService(pool, redis, logger);
    callService = new CommunicationCallService(pool, callStateMachine, presenceService, logger);
    
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
    
    // Create test devices
    for (const deviceId of [DEVICE_1_ID, DEVICE_2_ID, DEVICE_3_ID]) {
      await pool.query(`
        INSERT INTO communication_devices (
          id, tenant_id, branch_id, device_name, device_uuid, device_type,
          platform, public_key, status
        ) VALUES ($1, $2, $3, $4, $5, 'BRANCH_SHARED', 'WINDOWS', 'test-key', 'ACTIVE')
        ON CONFLICT (id) DO NOTHING
      `, [deviceId, TEST_TENANT_ID, TEST_BRANCH_ID, `Device ${deviceId}`, `uuid-${deviceId}`]);
      
      // Mark devices as online
      await presenceService.recordDeviceHeartbeat(deviceId, TEST_TENANT_ID, '1.0.0', {});
    }
    
    // Create test operator
    await pool.query(`
      INSERT INTO users (id, tenant_id, username, display_name)
      VALUES ($1, $2, 'operator', 'Test Operator')
      ON CONFLICT (id) DO NOTHING
    `, [OPERATOR_ID, TEST_TENANT_ID]);
  });
  
  afterEach(async () => {
    await pool.query('DELETE FROM communication_call_sessions WHERE tenant_id = $1', [TEST_TENANT_ID]);
    await pool.query('DELETE FROM communication_devices WHERE tenant_id = $1', [TEST_TENANT_ID]);
    await redis.flushDb();
    await redis.disconnect();
    await pool.end();
  });
  
  describe('First Device Accepts', () => {
    it('first device accepts, others get rejected', async () => {
      // Operator initiates call to branch
      const callSession = await callService.initiateCall({
        initiatorType: 'OPERATOR',
        initiatorId: OPERATOR_ID,
        targetType: 'BRANCH',
        targetId: TEST_BRANCH_ID,
        tenantId: TEST_TENANT_ID,
      });
      
      expect(callSession.status).toBe('RINGING');
      
      // Device 1 attempts to accept
      const result1 = await callService.acceptCall(callSession.id, 'DEVICE', DEVICE_1_ID, DEVICE_1_ID);
      
      expect(result1.status).toBe('CONNECTING');
      expect(result1.answeredDeviceId).toBe(DEVICE_1_ID);
      
      // Device 2 attempts to accept (should fail)
      await expect(
        callService.acceptCall(callSession.id, 'DEVICE', DEVICE_2_ID, DEVICE_2_ID)
      ).rejects.toThrow('call_already_accepted');
      
      // Device 3 attempts to accept (should fail)
      await expect(
        callService.acceptCall(callSession.id, 'DEVICE', DEVICE_3_ID, DEVICE_3_ID)
      ).rejects.toThrow('call_already_accepted');
      
      // Verify call state
      const finalCall = await callService.getCall(callSession.id);
      expect(finalCall?.answeredDeviceId).toBe(DEVICE_1_ID);
      expect(finalCall?.status).toBe('CONNECTING');
    });
  });
  
  describe('Simultaneous Accept Attempts', () => {
    it('handles concurrent accepts atomically', async () => {
      const callSession = await callService.initiateCall({
        initiatorType: 'OPERATOR',
        initiatorId: OPERATOR_ID,
        targetType: 'BRANCH',
        targetId: TEST_BRANCH_ID,
        tenantId: TEST_TENANT_ID,
      });
      
      // Simulate simultaneous accept attempts
      const acceptPromises = [
        callService.acceptCall(callSession.id, 'DEVICE', DEVICE_1_ID, DEVICE_1_ID),
        callService.acceptCall(callSession.id, 'DEVICE', DEVICE_2_ID, DEVICE_2_ID),
        callService.acceptCall(callSession.id, 'DEVICE', DEVICE_3_ID, DEVICE_3_ID),
      ];
      
      const results = await Promise.allSettled(acceptPromises);
      
      // Exactly one should succeed
      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');
      
      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(2);
      
      // Verify the winner
      const finalCall = await callService.getCall(callSession.id);
      const winnerDeviceId = finalCall?.answeredDeviceId;
      
      expect([DEVICE_1_ID, DEVICE_2_ID, DEVICE_3_ID]).toContain(winnerDeviceId);
      expect(finalCall?.status).toBe('CONNECTING');
    });
  });
  
  describe('Redis Atomic Lock', () => {
    it('uses Redis SET NX for first-answer-wins', async () => {
      const callSession = await callService.initiateCall({
        initiatorType: 'OPERATOR',
        initiatorId: OPERATOR_ID,
        targetType: 'BRANCH',
        targetId: TEST_BRANCH_ID,
        tenantId: TEST_TENANT_ID,
      });
      
      // Manually check Redis lock
      const lockKey = `comm:call:${TEST_TENANT_ID}:${callSession.id}:answer-lock`;
      
      // Verify lock doesn't exist before acceptance
      let lockValue = await redis.get(lockKey);
      expect(lockValue).toBeNull();
      
      // Accept call
      await callService.acceptCall(callSession.id, 'DEVICE', DEVICE_1_ID, DEVICE_1_ID);
      
      // Verify lock was created
      lockValue = await redis.get(lockKey);
      expect(lockValue).not.toBeNull();
      expect(lockValue).toContain(DEVICE_1_ID);
    });
    
    it('prevents accept after lock is set', async () => {
      const callSession = await callService.initiateCall({
        initiatorType: 'OPERATOR',
        initiatorId: OPERATOR_ID,
        targetType: 'BRANCH',
        targetId: TEST_BRANCH_ID,
        tenantId: TEST_TENANT_ID,
      });
      
      // Manually set the lock (simulating Device 1 won)
      const lockKey = `comm:call:${TEST_TENANT_ID}:${callSession.id}:answer-lock`;
      await redis.set(lockKey, JSON.stringify({
        acceptedBy: DEVICE_1_ID,
        acceptedByType: 'DEVICE',
        timestamp: new Date().toISOString(),
      }), {
        EX: 3600, // 1 hour
        NX: true,
      });
      
      // Device 2 attempts to accept
      await expect(
        callService.acceptCall(callSession.id, 'DEVICE', DEVICE_2_ID, DEVICE_2_ID)
      ).rejects.toThrow();
    });
  });
  
  describe('Multi-Instance Safety', () => {
    it('prevents double-accept across multiple API instances', async () => {
      // This test verifies that even with multiple CallService instances,
      // first-answer-wins is atomic via Redis
      
      const callSession = await callService.initiateCall({
        initiatorType: 'OPERATOR',
        initiatorId: OPERATOR_ID,
        targetType: 'BRANCH',
        targetId: TEST_BRANCH_ID,
        tenantId: TEST_TENANT_ID,
      });
      
      // Create second CallService instance (simulating different API node)
      const callService2 = new CommunicationCallService(pool, callStateMachine, presenceService, logger);
      
      // Simultaneous accepts from different instances
      const [result1, result2] = await Promise.allSettled([
        callService.acceptCall(callSession.id, 'DEVICE', DEVICE_1_ID, DEVICE_1_ID),
        callService2.acceptCall(callSession.id, 'DEVICE', DEVICE_2_ID, DEVICE_2_ID),
      ]);
      
      // Exactly one succeeds
      const successes = [result1, result2].filter((r) => r.status === 'fulfilled');
      expect(successes.length).toBe(1);
      
      // Verify only one device is recorded as answerer
      const finalCall = await callService.getCall(callSession.id);
      expect([DEVICE_1_ID, DEVICE_2_ID]).toContain(finalCall?.answeredDeviceId);
    });
  });
  
  describe('Network Interruption During Accept', () => {
    it('recovers gracefully if accept succeeds but response is lost', async () => {
      const callSession = await callService.initiateCall({
        initiatorType: 'OPERATOR',
        initiatorId: OPERATOR_ID,
        targetType: 'BRANCH',
        targetId: TEST_BRANCH_ID,
        tenantId: TEST_TENANT_ID,
      });
      
      // Device 1 accepts
      await callService.acceptCall(callSession.id, 'DEVICE', DEVICE_1_ID, DEVICE_1_ID);
      
      // Device 1 retries accept (simulating network interruption causing retry)
      // This should fail gracefully
      await expect(
        callService.acceptCall(callSession.id, 'DEVICE', DEVICE_1_ID, DEVICE_1_ID)
      ).rejects.toThrow();
      
      // Verify call state is still correct
      const finalCall = await callService.getCall(callSession.id);
      expect(finalCall?.answeredDeviceId).toBe(DEVICE_1_ID);
      expect(finalCall?.status).toBe('CONNECTING');
    });
  });
  
  describe('Call Rejection', () => {
    it('allows explicit rejection without affecting first-answer-wins', async () => {
      const callSession = await callService.initiateCall({
        initiatorType: 'OPERATOR',
        initiatorId: OPERATOR_ID,
        targetType: 'BRANCH',
        targetId: TEST_BRANCH_ID,
        tenantId: TEST_TENANT_ID,
      });
      
      // Device 1 rejects
      await callService.rejectCall(callSession.id, 'Busy');
      
      // Call should still be RINGING (not all devices rejected)
      let currentCall = await callService.getCall(callSession.id);
      expect(currentCall?.status).toBe('RINGING');
      
      // Device 2 accepts
      await callService.acceptCall(callSession.id, 'DEVICE', DEVICE_2_ID, DEVICE_2_ID);
      
      // Call should now be CONNECTING
      currentCall = await callService.getCall(callSession.id);
      expect(currentCall?.status).toBe('CONNECTING');
      expect(currentCall?.answeredDeviceId).toBe(DEVICE_2_ID);
    });
  });
  
  describe('Call Cancellation', () => {
    it('prevents accept after caller cancels', async () => {
      const callSession = await callService.initiateCall({
        initiatorType: 'OPERATOR',
        initiatorId: OPERATOR_ID,
        targetType: 'BRANCH',
        targetId: TEST_BRANCH_ID,
        tenantId: TEST_TENANT_ID,
      });
      
      // Operator cancels call
      await callService.cancelCall(callSession.id);
      
      // Device attempts to accept cancelled call
      await expect(
        callService.acceptCall(callSession.id, 'DEVICE', DEVICE_1_ID, DEVICE_1_ID)
      ).rejects.toThrow();
      
      // Verify call is CANCELLED
      const finalCall = await callService.getCall(callSession.id);
      expect(finalCall?.status).toBe('CANCELLED');
    });
  });
  
  describe('Lock Cleanup', () => {
    it('releases lock when call ends', async () => {
      const callSession = await callService.initiateCall({
        initiatorType: 'OPERATOR',
        initiatorId: OPERATOR_ID,
        targetType: 'BRANCH',
        targetId: TEST_BRANCH_ID,
        tenantId: TEST_TENANT_ID,
      });
      
      await callService.acceptCall(callSession.id, 'DEVICE', DEVICE_1_ID, DEVICE_1_ID);
      
      const lockKey = `comm:call:${TEST_TENANT_ID}:${callSession.id}:answer-lock`;
      
      // Verify lock exists
      let lockValue = await redis.get(lockKey);
      expect(lockValue).not.toBeNull();
      
      // End call
      await callService.endCall(callSession.id);
      
      // Verify lock is released
      lockValue = await redis.get(lockKey);
      expect(lockValue).toBeNull();
    });
  });
});
