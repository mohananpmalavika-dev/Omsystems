/**
 * KryptoVision Connect - Messaging Offline Delivery Tests
 * 
 * Tests cover:
 * - Online message delivery
 * - Offline message queueing
 * - Message delivery on reconnect
 * - Delivery receipts
 * - Read receipts
 * - Message persistence across restarts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Pool } from 'pg';
import type { RedisClientType } from 'redis';
import { createClient } from 'redis';
import { CommunicationMessagingService } from '../../src/communications/services/messaging.service.js';
import { CommunicationPresenceService } from '../../src/communications/services/presence.service.js';
import type { Logger } from 'pino';
import pino from 'pino';
import type { SendMessageInput } from '../../src/communications/domain/types.js';

describe('Messaging Offline Delivery Tests', () => {
  let pool: Pool;
  let redis: RedisClientType;
  let logger: Logger;
  let messagingService: CommunicationMessagingService;
  let presenceService: CommunicationPresenceService;
  
  const TEST_TENANT_ID = 'test-tenant-1';
  const TEST_BRANCH_ID = 'test-branch-1';
  const DEVICE_1_ID = 'device-1';
  const DEVICE_2_ID = 'device-2';
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
    
    presenceService = new CommunicationPresenceService(pool, redis, logger);
    messagingService = new CommunicationMessagingService(pool, presenceService, logger);
    
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
      VALUES ($1, $2, 'operator', 'Test Operator')
      ON CONFLICT (id) DO NOTHING
    `, [OPERATOR_ID, TEST_TENANT_ID]);
    
    // Create test devices
    for (const deviceId of [DEVICE_1_ID, DEVICE_2_ID]) {
      await pool.query(`
        INSERT INTO communication_devices (
          id, tenant_id, branch_id, device_name, device_uuid, device_type,
          platform, public_key, status
        ) VALUES ($1, $2, $3, $4, $5, 'BRANCH_SHARED', 'WINDOWS', 'test-key', 'ACTIVE')
        ON CONFLICT (id) DO NOTHING
      `, [deviceId, TEST_TENANT_ID, TEST_BRANCH_ID, `Device ${deviceId}`, `uuid-${deviceId}`]);
    }
  });
  
  afterEach(async () => {
    await pool.query('DELETE FROM communication_messages WHERE tenant_id = $1', [TEST_TENANT_ID]);
    await pool.query('DELETE FROM communication_conversations WHERE tenant_id = $1', [TEST_TENANT_ID]);
    await pool.query('DELETE FROM communication_devices WHERE tenant_id = $1', [TEST_TENANT_ID]);
    await redis.flushDb();
    await redis.disconnect();
    await pool.end();
  });
  
  describe('Online Message Delivery', () => {
    it('delivers message to online device immediately', async () => {
      // Mark device online
      await presenceService.recordDeviceHeartbeat(DEVICE_1_ID, TEST_TENANT_ID, '1.0.0', {});
      
      // Create conversation
      const conversation = await messagingService.getOrCreateConversation(
        TEST_TENANT_ID,
        'BRANCH_SOC',
        TEST_BRANCH_ID,
        undefined
      );
      
      // Send message
      const sendInput: SendMessageInput = {
        conversationId: conversation.id,
        senderId: OPERATOR_ID,
        senderType: 'OPERATOR',
        messageType: 'TEXT',
        body: 'Hello from VMS',
        tenantId: TEST_TENANT_ID,
      };
      
      const message = await messagingService.sendMessage(sendInput);
      
      expect(message.id).toBeDefined();
      expect(message.body).toBe('Hello from VMS');
      expect(message.createdAt).toBeInstanceOf(Date);
      
      // Verify delivery receipt was created
      const receiptResult = await pool.query(
        `SELECT * FROM communication_message_receipts
         WHERE message_id = $1 AND device_id = $1`,
        [message.id, DEVICE_1_ID]
      );
      
      expect(receiptResult.rows.length).toBeGreaterThan(0);
    });
  });
  
  describe('Offline Message Queueing', () => {
    it('queues message when device is offline', async () => {
      // Device is offline (no heartbeat)
      
      // Create conversation
      const conversation = await messagingService.getOrCreateConversation(
        TEST_TENANT_ID,
        'BRANCH_SOC',
        TEST_BRANCH_ID,
        undefined
      );
      
      // Send message
      const sendInput: SendMessageInput = {
        conversationId: conversation.id,
        senderId: OPERATOR_ID,
        senderType: 'OPERATOR',
        messageType: 'TEXT',
        body: 'Queued message',
        tenantId: TEST_TENANT_ID,
      };
      
      const message = await messagingService.sendMessage(sendInput);
      
      // Message is stored in PostgreSQL
      const messageResult = await pool.query(
        'SELECT * FROM communication_messages WHERE id = $1',
        [message.id]
      );
      
      expect(messageResult.rows.length).toBe(1);
      expect(messageResult.rows[0].body).toBe('Queued message');
      
      // Delivery receipt exists but not delivered
      const receiptResult = await pool.query(
        `SELECT * FROM communication_message_receipts
         WHERE message_id = $1 AND delivered_at IS NULL`,
        [message.id]
      );
      
      expect(receiptResult.rows.length).toBeGreaterThan(0);
    });
    
    it('delivers queued messages on reconnect', async () => {
      // Create conversation and send message while offline
      const conversation = await messagingService.getOrCreateConversation(
        TEST_TENANT_ID,
        'BRANCH_SOC',
        TEST_BRANCH_ID,
        undefined
      );
      
      const sendInput: SendMessageInput = {
        conversationId: conversation.id,
        senderId: OPERATOR_ID,
        senderType: 'OPERATOR',
        messageType: 'TEXT',
        body: 'Offline message',
        tenantId: TEST_TENANT_ID,
      };
      
      await messagingService.sendMessage(sendInput);
      
      // Device reconnects
      await presenceService.recordDeviceHeartbeat(DEVICE_1_ID, TEST_TENANT_ID, '1.0.0', {});
      
      // Fetch undelivered messages
      const undelivered = await messagingService.getUndeliveredMessages(
        DEVICE_1_ID,
        TEST_TENANT_ID
      );
      
      expect(undelivered.length).toBeGreaterThan(0);
      expect(undelivered[0].body).toBe('Offline message');
    });
  });
  
  describe('Delivery Receipts', () => {
    it('marks message as delivered', async () => {
      await presenceService.recordDeviceHeartbeat(DEVICE_1_ID, TEST_TENANT_ID, '1.0.0', {});
      
      const conversation = await messagingService.getOrCreateConversation(
        TEST_TENANT_ID,
        'BRANCH_SOC',
        TEST_BRANCH_ID,
        undefined
      );
      
      const message = await messagingService.sendMessage({
        conversationId: conversation.id,
        senderId: OPERATOR_ID,
        senderType: 'OPERATOR',
        messageType: 'TEXT',
        body: 'Test message',
        tenantId: TEST_TENANT_ID,
      });
      
      // Mark as delivered
      await messagingService.markAsDelivered(message.id, DEVICE_1_ID, TEST_TENANT_ID);
      
      // Verify delivery receipt timestamp
      const receiptResult = await pool.query(
        `SELECT delivered_at FROM communication_message_receipts
         WHERE message_id = $1 AND device_id = $2`,
        [message.id, DEVICE_1_ID]
      );
      
      expect(receiptResult.rows[0].delivered_at).not.toBeNull();
    });
  });
  
  describe('Read Receipts', () => {
    it('marks message as read', async () => {
      await presenceService.recordDeviceHeartbeat(DEVICE_1_ID, TEST_TENANT_ID, '1.0.0', {});
      
      const conversation = await messagingService.getOrCreateConversation(
        TEST_TENANT_ID,
        'BRANCH_SOC',
        TEST_BRANCH_ID,
        undefined
      );
      
      const message = await messagingService.sendMessage({
        conversationId: conversation.id,
        senderId: OPERATOR_ID,
        senderType: 'OPERATOR',
        messageType: 'TEXT',
        body: 'Test message',
        tenantId: TEST_TENANT_ID,
      });
      
      // Mark as delivered first
      await messagingService.markAsDelivered(message.id, DEVICE_1_ID, TEST_TENANT_ID);
      
      // Mark as read
      await messagingService.markAsRead(message.id, DEVICE_1_ID, TEST_TENANT_ID);
      
      // Verify read receipt timestamp
      const receiptResult = await pool.query(
        `SELECT read_at FROM communication_message_receipts
         WHERE message_id = $1 AND device_id = $2`,
        [message.id, DEVICE_1_ID]
      );
      
      expect(receiptResult.rows[0].read_at).not.toBeNull();
    });
  });
  
  describe('Message Persistence', () => {
    it('messages survive service restart', async () => {
      const conversation = await messagingService.getOrCreateConversation(
        TEST_TENANT_ID,
        'BRANCH_SOC',
        TEST_BRANCH_ID,
        undefined
      );
      
      const message = await messagingService.sendMessage({
        conversationId: conversation.id,
        senderId: OPERATOR_ID,
        senderType: 'OPERATOR',
        messageType: 'TEXT',
        body: 'Persistent message',
        tenantId: TEST_TENANT_ID,
      });
      
      // Simulate service restart by creating new service instance
      const messagingService2 = new CommunicationMessagingService(pool, presenceService, logger);
      
      // Retrieve message
      const messages = await messagingService2.getConversationMessages(
        conversation.id,
        TEST_TENANT_ID,
        { limit: 10 }
      );
      
      expect(messages.length).toBeGreaterThan(0);
      expect(messages.some(m => m.id === message.id)).toBe(true);
    });
    
    it('messages NOT stored only in Redis', async () => {
      const conversation = await messagingService.getOrCreateConversation(
        TEST_TENANT_ID,
        'BRANCH_SOC',
        TEST_BRANCH_ID,
        undefined
      );
      
      const message = await messagingService.sendMessage({
        conversationId: conversation.id,
        senderId: OPERATOR_ID,
        senderType: 'OPERATOR',
        messageType: 'TEXT',
        body: 'Database message',
        tenantId: TEST_TENANT_ID,
      });
      
      // Flush Redis (simulating Redis failure)
      await redis.flushDb();
      
      // Message should still be retrievable from PostgreSQL
      const messages = await messagingService.getConversationMessages(
        conversation.id,
        TEST_TENANT_ID,
        { limit: 10 }
      );
      
      expect(messages.some(m => m.id === message.id)).toBe(true);
    });
  });
  
  describe('Multiple Device Delivery', () => {
    it('delivers message to all online branch devices', async () => {
      // Mark both devices online
      await presenceService.recordDeviceHeartbeat(DEVICE_1_ID, TEST_TENANT_ID, '1.0.0', {});
      await presenceService.recordDeviceHeartbeat(DEVICE_2_ID, TEST_TENANT_ID, '1.0.0', {});
      
      const conversation = await messagingService.getOrCreateConversation(
        TEST_TENANT_ID,
        'BRANCH_SOC',
        TEST_BRANCH_ID,
        undefined
      );
      
      const message = await messagingService.sendMessage({
        conversationId: conversation.id,
        senderId: OPERATOR_ID,
        senderType: 'OPERATOR',
        messageType: 'TEXT',
        body: 'Broadcast message',
        tenantId: TEST_TENANT_ID,
      });
      
      // Verify receipts created for both devices
      const receiptResult = await pool.query(
        `SELECT device_id FROM communication_message_receipts WHERE message_id = $1`,
        [message.id]
      );
      
      const deviceIds = receiptResult.rows.map(r => r.device_id);
      expect(deviceIds).toContain(DEVICE_1_ID);
      expect(deviceIds).toContain(DEVICE_2_ID);
    });
  });
  
  describe('Unread Count', () => {
    it('calculates unread message count correctly', async () => {
      await presenceService.recordDeviceHeartbeat(DEVICE_1_ID, TEST_TENANT_ID, '1.0.0', {});
      
      const conversation = await messagingService.getOrCreateConversation(
        TEST_TENANT_ID,
        'BRANCH_SOC',
        TEST_BRANCH_ID,
        undefined
      );
      
      // Send 3 messages
      for (let i = 1; i <= 3; i++) {
        await messagingService.sendMessage({
          conversationId: conversation.id,
          senderId: OPERATOR_ID,
          senderType: 'OPERATOR',
          messageType: 'TEXT',
          body: `Message ${i}`,
          tenantId: TEST_TENANT_ID,
        });
      }
      
      // Get unread count
      const unreadCount = await messagingService.getUnreadCount(DEVICE_1_ID, TEST_TENANT_ID);
      
      expect(unreadCount).toBe(3);
      
      // Mark first message as read
      const messages = await messagingService.getConversationMessages(
        conversation.id,
        TEST_TENANT_ID,
        { limit: 10 }
      );
      
      await messagingService.markAsRead(messages[0].id, DEVICE_1_ID, TEST_TENANT_ID);
      
      // Verify unread count decreased
      const updatedUnreadCount = await messagingService.getUnreadCount(DEVICE_1_ID, TEST_TENANT_ID);
      expect(updatedUnreadCount).toBe(2);
    });
  });
  
  describe('Conversation Persistence', () => {
    it('reuses existing conversation for branch', async () => {
      // Create first conversation
      const conv1 = await messagingService.getOrCreateConversation(
        TEST_TENANT_ID,
        'BRANCH_SOC',
        TEST_BRANCH_ID,
        undefined
      );
      
      // Attempt to create again
      const conv2 = await messagingService.getOrCreateConversation(
        TEST_TENANT_ID,
        'BRANCH_SOC',
        TEST_BRANCH_ID,
        undefined
      );
      
      // Should return same conversation
      expect(conv1.id).toBe(conv2.id);
    });
  });
});
