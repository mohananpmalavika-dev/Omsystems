/**
 * Communication Messaging Service
 * 
 * Manages persistent text messaging between branches, employees, and VMS operators.
 * Messages survive service restarts and support delivery/read receipts.
 * 
 * Core responsibilities:
 * - Create and manage conversations
 * - Send messages with offline queueing
 * - Track delivery and read receipts
 * - Retrieve conversation history
 * - Support branch-SOC and employee-SOC conversations
 * 
 * Architecture:
 * - PostgreSQL for persistent message storage
 * - Redis for real-time delivery tracking
 * - WebSocket for instant delivery to online participants
 * - Offline messages delivered on reconnect
 * 
 * Message flow:
 * 1. Send message → Store in PostgreSQL
 * 2. If recipient online → Deliver via WebSocket + mark delivered
 * 3. If recipient offline → Queue in database, deliver on reconnect
 * 4. Recipient reads → Update read receipt timestamp
 */

import type { Pool } from 'pg';
import type { RedisClientType } from 'redis';
import type {
  Conversation,
  ConversationType,
  Message,
  MessageType,
  MessageReceipt,
  ConversationMember,
} from '../domain/types.js';
import { CommunicationPresenceService } from './presence.service.js';

/**
 * Create conversation options
 */
export interface CreateConversationOptions {
  /**
   * Tenant ID
   */
  tenantId: string;

  /**
   * Conversation type
   */
  type: ConversationType;

  /**
   * Branch ID (for BRANCH_SOC conversations)
   */
  branchId?: string;

  /**
   * Employee ID (for EMPLOYEE_SOC conversations)
   */
  employeeId?: string;

  /**
   * Created by user ID
   */
  createdBy: string;
}

/**
 * Send message options
 */
export interface SendMessageOptions {
  /**
   * Conversation ID
   */
  conversationId: string;

  /**
   * Tenant ID
   */
  tenantId: string;

  /**
   * Sender type (DEVICE, EMPLOYEE, OPERATOR)
   */
  senderType: 'DEVICE' | 'EMPLOYEE' | 'OPERATOR';

  /**
   * Sender ID
   */
  senderId: string;

  /**
   * Device ID (if sent from device)
   */
  deviceId?: string;

  /**
   * Message type (TEXT, SYSTEM, etc.)
   */
  messageType: MessageType;

  /**
   * Message body (text content)
   */
  body: string;

  /**
   * Optional metadata
   */
  metadata?: Record<string, unknown>;
}

/**
 * Mark delivered options
 */
export interface MarkDeliveredOptions {
  /**
   * Message ID
   */
  messageId: string;

  /**
   * Tenant ID
   */
  tenantId: string;

  /**
   * Device ID that received message
   */
  deviceId?: string;

  /**
   * Operator ID that received message
   */
  operatorId?: string;
}

/**
 * Mark read options
 */
export interface MarkReadOptions {
  /**
   * Message ID
   */
  messageId: string;

  /**
   * Tenant ID
   */
  tenantId: string;

  /**
   * Device ID that read message
   */
  deviceId?: string;

  /**
   * Operator ID that read message
   */
  operatorId?: string;
}

/**
 * Communication Messaging Service
 */
export class CommunicationMessagingService {
  constructor(
    private readonly pool: Pool,
    private readonly redis: RedisClientType,
    private readonly presenceService: CommunicationPresenceService
  ) {}

  /**
   * Create or get conversation
   * 
   * Conversations are persistent. This method creates if not exists.
   * 
   * @param options - Conversation creation options
   * @returns Conversation
   */
  async getOrCreateConversation(
    options: CreateConversationOptions
  ): Promise<Conversation> {
    const {
      tenantId,
      type,
      branchId,
      employeeId,
      createdBy,
    } = options;

    // Check if conversation already exists
    let existing: Conversation | null = null;

    if (type === 'BRANCH_SOC' && branchId) {
      existing = await this.findConversation(tenantId, 'BRANCH_SOC', branchId);
    } else if (type === 'EMPLOYEE_SOC' && employeeId) {
      existing = await this.findConversation(tenantId, 'EMPLOYEE_SOC', undefined, employeeId);
    }

    if (existing) {
      return existing;
    }

    // Create new conversation
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Insert conversation
      const convResult = await client.query<Conversation>(
        `INSERT INTO communication_conversations (
          id, tenant_id, type,
          branch_id, employee_id,
          created_by, created_at, updated_at
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, $4, $5, NOW(), NOW()
        )
        RETURNING
          id, tenant_id as "tenantId", type,
          branch_id as "branchId",
          employee_id as "employeeId",
          last_message_at as "lastMessageAt",
          created_by as "createdBy",
          created_at as "createdAt",
          updated_at as "updatedAt"`,
        [tenantId, type, branchId || null, employeeId || null, createdBy]
      );

      const conversation = convResult.rows[0]!;

      // Add members
      if (type === 'BRANCH_SOC' && branchId) {
        // Add branch as member
        await client.query(
          `INSERT INTO communication_conversation_members (
            conversation_id, member_type, branch_id, joined_at
          ) VALUES ($1, 'BRANCH', $2, NOW())`,
          [conversation.id, branchId]
        );

        // Add SOC as member (all operators with permission)
        await client.query(
          `INSERT INTO communication_conversation_members (
            conversation_id, member_type, joined_at
          ) VALUES ($1, 'SOC', NOW())`,
          [conversation.id]
        );
      } else if (type === 'EMPLOYEE_SOC' && employeeId) {
        // Add employee as member
        await client.query(
          `INSERT INTO communication_conversation_members (
            conversation_id, member_type, employee_id, joined_at
          ) VALUES ($1, 'EMPLOYEE', $2, NOW())`,
          [conversation.id, employeeId]
        );

        // Add SOC as member
        await client.query(
          `INSERT INTO communication_conversation_members (
            conversation_id, member_type, joined_at
          ) VALUES ($1, 'SOC', NOW())`,
          [conversation.id]
        );
      }

      await client.query('COMMIT');

      return conversation;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Send message
   * 
   * Messages are stored persistently and delivered to online recipients.
   * Offline recipients receive messages on reconnect.
   * 
   * @param options - Send message options
   * @returns Created message
   */
  async sendMessage(options: SendMessageOptions): Promise<Message> {
    const {
      conversationId,
      tenantId,
      senderType,
      senderId,
      deviceId,
      messageType,
      body,
      metadata,
    } = options;

    // Validate conversation exists and user has access
    const conversation = await this.getConversation(conversationId, tenantId);
    if (!conversation) {
      throw new Error('CONVERSATION_NOT_FOUND');
    }

    // Create message
    const result = await this.pool.query<Message>(
      `INSERT INTO communication_messages (
        id, tenant_id, conversation_id,
        sender_type, sender_id, sender_device_id,
        message_type, body, metadata,
        created_at
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, NOW()
      )
      RETURNING
        id, tenant_id as "tenantId",
        conversation_id as "conversationId",
        sender_type as "senderType",
        sender_id as "senderId",
        sender_device_id as "senderDeviceId",
        message_type as "messageType",
        body, metadata,
        created_at as "createdAt"`,
      [
        tenantId,
        conversationId,
        senderType,
        senderId,
        deviceId || null,
        messageType,
        body,
        metadata ? JSON.stringify(metadata) : null,
      ]
    );

    const message = result.rows[0]!;

    // Update conversation last_message_at (trigger handles this)

    // Create delivery receipts for all members except sender
    await this.createDeliveryReceipts(message, conversation);

    return message;
  }

  /**
   * Mark message as delivered
   * 
   * Called when device/operator receives message.
   * 
   * @param options - Mark delivered options
   */
  async markAsDelivered(options: MarkDeliveredOptions): Promise<void> {
    const { messageId, tenantId, deviceId, operatorId } = options;

    const recipientId = deviceId || operatorId;
    if (!recipientId) {
      throw new Error('RECIPIENT_ID_REQUIRED');
    }

    await this.pool.query(
      `UPDATE communication_message_receipts
      SET delivered_at = NOW()
      WHERE message_id = $1
        AND (device_id = $2 OR operator_id = $2)
        AND delivered_at IS NULL`,
      [messageId, recipientId]
    );
  }

  /**
   * Mark message as read
   * 
   * Called when user views message in UI.
   * 
   * @param options - Mark read options
   */
  async markAsRead(options: MarkReadOptions): Promise<void> {
    const { messageId, tenantId, deviceId, operatorId } = options;

    const recipientId = deviceId || operatorId;
    if (!recipientId) {
      throw new Error('RECIPIENT_ID_REQUIRED');
    }

    await this.pool.query(
      `UPDATE communication_message_receipts
      SET read_at = NOW(), delivered_at = COALESCE(delivered_at, NOW())
      WHERE message_id = $1
        AND (device_id = $2 OR operator_id = $2)
        AND read_at IS NULL`,
      [messageId, recipientId]
    );
  }

  /**
   * Mark all messages in conversation as read
   * 
   * Convenience method for marking entire conversation read.
   * 
   * @param conversationId - Conversation ID
   * @param tenantId - Tenant ID
   * @param deviceId - Device ID (optional)
   * @param operatorId - Operator ID (optional)
   */
  async markConversationAsRead(
    conversationId: string,
    tenantId: string,
    deviceId?: string,
    operatorId?: string
  ): Promise<void> {
    const recipientId = deviceId || operatorId;
    if (!recipientId) {
      throw new Error('RECIPIENT_ID_REQUIRED');
    }

    await this.pool.query(
      `UPDATE communication_message_receipts
      SET read_at = NOW(), delivered_at = COALESCE(delivered_at, NOW())
      WHERE message_id IN (
        SELECT id FROM communication_messages
        WHERE conversation_id = $1 AND tenant_id = $2
      )
      AND (device_id = $3 OR operator_id = $3)
      AND read_at IS NULL`,
      [conversationId, tenantId, recipientId]
    );
  }

  /**
   * Get conversation
   * 
   * @param conversationId - Conversation ID
   * @param tenantId - Tenant ID
   * @returns Conversation or null
   */
  async getConversation(
    conversationId: string,
    tenantId: string
  ): Promise<Conversation | null> {
    const result = await this.pool.query<Conversation>(
      `SELECT
        id, tenant_id as "tenantId", type,
        branch_id as "branchId",
        employee_id as "employeeId",
        last_message_at as "lastMessageAt",
        created_by as "createdBy",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM communication_conversations
      WHERE id = $1 AND tenant_id = $2`,
      [conversationId, tenantId]
    );

    return result.rows[0] || null;
  }

  /**
   * Get conversation messages
   * 
   * Returns messages with delivery/read receipt status.
   * 
   * @param conversationId - Conversation ID
   * @param tenantId - Tenant ID
   * @param limit - Max messages to return (default: 50)
   * @param offset - Pagination offset (default: 0)
   * @returns Array of messages with receipt info
   */
  async getConversationMessages(
    conversationId: string,
    tenantId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<Array<Message & { receipts?: MessageReceipt[] }>> {
    // Get messages
    const messagesResult = await this.pool.query<Message>(
      `SELECT
        id, tenant_id as "tenantId",
        conversation_id as "conversationId",
        sender_type as "senderType",
        sender_id as "senderId",
        sender_device_id as "senderDeviceId",
        message_type as "messageType",
        body, metadata,
        created_at as "createdAt"
      FROM communication_messages
      WHERE conversation_id = $1 AND tenant_id = $2
      ORDER BY created_at DESC
      LIMIT $3 OFFSET $4`,
      [conversationId, tenantId, limit, offset]
    );

    const messages = messagesResult.rows;

    if (messages.length === 0) {
      return [];
    }

    // Get receipts for these messages
    const messageIds = messages.map(m => m.id);
    const receiptsResult = await this.pool.query<MessageReceipt>(
      `SELECT
        message_id as "messageId",
        device_id as "deviceId",
        operator_id as "operatorId",
        delivered_at as "deliveredAt",
        read_at as "readAt"
      FROM communication_message_receipts
      WHERE message_id = ANY($1::uuid[])`,
      [messageIds]
    );

    // Group receipts by message
    const receiptsByMessage = new Map<string, MessageReceipt[]>();
    for (const receipt of receiptsResult.rows) {
      const existing = receiptsByMessage.get(receipt.messageId) || [];
      existing.push(receipt);
      receiptsByMessage.set(receipt.messageId, existing);
    }

    // Attach receipts to messages
    return messages.map(message => ({
      ...message,
      receipts: receiptsByMessage.get(message.id) || [],
    }));
  }

  /**
   * Get undelivered messages for device
   * 
   * Returns messages that haven't been delivered to this device yet.
   * Used for offline message sync on reconnect.
   * 
   * @param tenantId - Tenant ID
   * @param deviceId - Device ID
   * @returns Array of undelivered messages
   */
  async getUndeliveredMessages(
    tenantId: string,
    deviceId: string
  ): Promise<Message[]> {
    const result = await this.pool.query<Message>(
      `SELECT DISTINCT
        m.id, m.tenant_id as "tenantId",
        m.conversation_id as "conversationId",
        m.sender_type as "senderType",
        m.sender_id as "senderId",
        m.sender_device_id as "senderDeviceId",
        m.message_type as "messageType",
        m.body, m.metadata,
        m.created_at as "createdAt"
      FROM communication_messages m
      INNER JOIN communication_message_receipts r ON m.id = r.message_id
      WHERE m.tenant_id = $1
        AND r.device_id = $2
        AND r.delivered_at IS NULL
      ORDER BY m.created_at ASC`,
      [tenantId, deviceId]
    );

    return result.rows;
  }

  /**
   * Get unread message count for recipient
   * 
   * @param tenantId - Tenant ID
   * @param deviceId - Device ID (optional)
   * @param operatorId - Operator ID (optional)
   * @returns Unread count
   */
  async getUnreadCount(
    tenantId: string,
    deviceId?: string,
    operatorId?: string
  ): Promise<number> {
    const recipientId = deviceId || operatorId;
    if (!recipientId) {
      return 0;
    }

    const result = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*) as count
      FROM communication_message_receipts
      WHERE (device_id = $1 OR operator_id = $1)
        AND read_at IS NULL`,
      [recipientId]
    );

    return parseInt(result.rows[0]?.count || '0', 10);
  }

  /**
   * List conversations for branch
   * 
   * @param tenantId - Tenant ID
   * @param branchId - Branch ID
   * @returns Array of conversations
   */
  async listBranchConversations(
    tenantId: string,
    branchId: string
  ): Promise<Conversation[]> {
    const result = await this.pool.query<Conversation>(
      `SELECT
        id, tenant_id as "tenantId", type,
        branch_id as "branchId",
        employee_id as "employeeId",
        last_message_at as "lastMessageAt",
        created_by as "createdBy",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM communication_conversations
      WHERE tenant_id = $1 AND branch_id = $2
      ORDER BY last_message_at DESC NULLS LAST, created_at DESC`,
      [tenantId, branchId]
    );

    return result.rows;
  }

  /**
   * List conversations for employee
   * 
   * @param tenantId - Tenant ID
   * @param employeeId - Employee ID
   * @returns Array of conversations
   */
  async listEmployeeConversations(
    tenantId: string,
    employeeId: string
  ): Promise<Conversation[]> {
    const result = await this.pool.query<Conversation>(
      `SELECT
        id, tenant_id as "tenantId", type,
        branch_id as "branchId",
        employee_id as "employeeId",
        last_message_at as "lastMessageAt",
        created_by as "createdBy",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM communication_conversations
      WHERE tenant_id = $1 AND employee_id = $2
      ORDER BY last_message_at DESC NULLS LAST, created_at DESC`,
      [tenantId, employeeId]
    );

    return result.rows;
  }

  /**
   * List all conversations for tenant (VMS operators)
   * 
   * @param tenantId - Tenant ID
   * @param limit - Max conversations to return
   * @param offset - Pagination offset
   * @returns Array of conversations
   */
  async listAllConversations(
    tenantId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<Conversation[]> {
    const result = await this.pool.query<Conversation>(
      `SELECT
        id, tenant_id as "tenantId", type,
        branch_id as "branchId",
        employee_id as "employeeId",
        last_message_at as "lastMessageAt",
        created_by as "createdBy",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM communication_conversations
      WHERE tenant_id = $1
      ORDER BY last_message_at DESC NULLS LAST, created_at DESC
      LIMIT $2 OFFSET $3`,
      [tenantId, limit, offset]
    );

    return result.rows;
  }

  /**
   * Find existing conversation
   * 
   * @param tenantId - Tenant ID
   * @param type - Conversation type
   * @param branchId - Branch ID (optional)
   * @param employeeId - Employee ID (optional)
   * @returns Conversation or null
   * @private
   */
  private async findConversation(
    tenantId: string,
    type: ConversationType,
    branchId?: string,
    employeeId?: string
  ): Promise<Conversation | null> {
    let query = `
      SELECT
        id, tenant_id as "tenantId", type,
        branch_id as "branchId",
        employee_id as "employeeId",
        last_message_at as "lastMessageAt",
        created_by as "createdBy",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM communication_conversations
      WHERE tenant_id = $1 AND type = $2
    `;

    const params: any[] = [tenantId, type];

    if (branchId) {
      query += ` AND branch_id = $${params.length + 1}`;
      params.push(branchId);
    }

    if (employeeId) {
      query += ` AND employee_id = $${params.length + 1}`;
      params.push(employeeId);
    }

    query += ` LIMIT 1`;

    const result = await this.pool.query<Conversation>(query, params);

    return result.rows[0] || null;
  }

  /**
   * Create delivery receipts for message
   * 
   * Creates receipt records for all conversation members except sender.
   * 
   * @param message - Message
   * @param conversation - Conversation
   * @private
   */
  private async createDeliveryReceipts(
    message: Message,
    conversation: Conversation
  ): Promise<void> {
    // Get conversation members
    const membersResult = await this.pool.query<ConversationMember>(
      `SELECT
        member_type as "memberType",
        branch_id as "branchId",
        employee_id as "employeeId",
        operator_id as "operatorId"
      FROM communication_conversation_members
      WHERE conversation_id = $1 AND left_at IS NULL`,
      [conversation.id]
    );

    const members = membersResult.rows;

    // Determine recipients based on member type
    for (const member of members) {
      if (member.memberType === 'BRANCH' && member.branchId) {
        // Create receipts for all branch devices
        const devices = await this.presenceService.getOnlineBranchDevices(
          message.tenantId,
          member.branchId
        );

        for (const deviceId of devices) {
          // Don't create receipt for sender device
          if (deviceId === message.senderDeviceId) {
            continue;
          }

          await this.createReceipt(message.id, deviceId, null);
        }
      } else if (member.memberType === 'EMPLOYEE' && member.employeeId) {
        // Create receipts for all employee devices
        const devices = await this.presenceService.getOnlineEmployeeDevices(
          message.tenantId,
          member.employeeId
        );

        for (const deviceId of devices) {
          if (deviceId === message.senderDeviceId) {
            continue;
          }

          await this.createReceipt(message.id, deviceId, null);
        }
      } else if (member.memberType === 'SOC') {
        // Create receipts for available operators
        // In production, this would be more sophisticated
        // For now, create receipt for sender operator if message from device
        if (message.senderType !== 'OPERATOR') {
          // Operators will get receipt when they open conversation
          // This prevents creating receipts for all operators upfront
        }
      }
    }
  }

  /**
   * Create individual receipt record
   * 
   * @param messageId - Message ID
   * @param deviceId - Device ID (optional)
   * @param operatorId - Operator ID (optional)
   * @private
   */
  private async createReceipt(
    messageId: string,
    deviceId: string | null,
    operatorId: string | null
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO communication_message_receipts (
        message_id, device_id, operator_id
      ) VALUES ($1, $2, $3)
      ON CONFLICT (message_id, device_id, operator_id) DO NOTHING`,
      [messageId, deviceId, operatorId]
    );
  }
}
