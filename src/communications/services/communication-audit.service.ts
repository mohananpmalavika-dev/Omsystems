/**
 * KryptoVision Connect - Communication Audit Service
 * 
 * Defines audit event structures and helper functions for communication subsystem.
 * Integrates with existing central_audit_ledger table and audit infrastructure.
 * 
 * Architecture:
 * - Uses existing ControlPlaneStore.writeAudit() interface
 * - Follows VMS audit event naming conventions
 * - Provides type-safe audit event builders
 * - Supports compliance and forensic investigation
 */

import type { Logger } from 'pino';
import type { ControlPlaneStore } from '../../control-plane-store.js';

// ============================================================================
// AUDIT EVENT TYPES
// ============================================================================

/**
 * Communication audit event action types
 * Follows VMS naming convention: SUBSYSTEM_NOUN_ACTION
 */
export const COMMUNICATION_AUDIT_ACTIONS = {
  // Device Enrollment
  ENROLLMENT_CODE_CREATED: 'COMM_ENROLLMENT_CODE_CREATED',
  DEVICE_ENROLLED: 'COMM_DEVICE_ENROLLED',
  DEVICE_APPROVED: 'COMM_DEVICE_APPROVED',
  DEVICE_REVOKED: 'COMM_DEVICE_REVOKED',
  DEVICE_EMPLOYEE_LINKED: 'COMM_DEVICE_EMPLOYEE_LINKED',
  DEVICE_EMPLOYEE_UNLINKED: 'COMM_DEVICE_EMPLOYEE_UNLINKED',
  
  // Call Events
  CALL_STARTED: 'COMM_CALL_STARTED',
  CALL_RINGING: 'COMM_CALL_RINGING',
  CALL_ACCEPTED: 'COMM_CALL_ACCEPTED',
  CALL_REJECTED: 'COMM_CALL_REJECTED',
  CALL_MISSED: 'COMM_CALL_MISSED',
  CALL_CANCELLED: 'COMM_CALL_CANCELLED',
  CALL_CONNECTED: 'COMM_CALL_CONNECTED',
  CALL_ENDED: 'COMM_CALL_ENDED',
  CALL_FAILED: 'COMM_CALL_FAILED',
  
  // Messaging Events
  MESSAGE_SENT: 'COMM_MESSAGE_SENT',
  MESSAGE_DELIVERED: 'COMM_MESSAGE_DELIVERED',
  MESSAGE_READ: 'COMM_MESSAGE_READ',
  CONVERSATION_CREATED: 'COMM_CONVERSATION_CREATED',
  
  // Administrative Actions
  DEVICE_CREDENTIALS_REVOKED: 'COMM_DEVICE_CREDENTIALS_REVOKED',
  DEVICE_CONFIG_UPDATED: 'COMM_DEVICE_CONFIG_UPDATED',
  EMPLOYEE_PERMISSIONS_UPDATED: 'COMM_EMPLOYEE_PERMISSIONS_UPDATED',
} as const;

export type CommunicationAuditAction = typeof COMMUNICATION_AUDIT_ACTIONS[keyof typeof COMMUNICATION_AUDIT_ACTIONS];

// ============================================================================
// AUDIT EVENT BUILDERS
// ============================================================================

export interface AuditEventBase {
  tenantId: string;
  actorUserId: string | null;
  action: string;
  resourceNodeId: string | null;
  outcome: 'success' | 'failure';
  sourceIp?: string;
  details: Record<string, unknown>;
}

export interface EnrollmentCodeCreatedDetails {
  enrollmentCodeId: string;
  branchId: string;
  allowedDeviceType?: string;
  expiresAt: Date;
  maxUses: number;
}

export interface DeviceEnrolledDetails {
  deviceId: string;
  deviceUuid: string;
  deviceName: string;
  deviceType: string;
  platform: string;
  branchId: string;
  enrollmentCodeId: string;
  linkedEmployeeIds?: string[];
}

export interface DeviceApprovedDetails {
  deviceId: string;
  deviceName: string;
  branchId: string;
  approvedBy: string;
}

export interface DeviceRevokedDetails {
  deviceId: string;
  deviceName: string;
  reason: string;
  revokedBy: string;
}

export interface EmployeeLinkedDetails {
  deviceId: string;
  employeeId: string;
  isPrimary: boolean;
  permissions: {
    canReceiveCalls: boolean;
    canMakeCalls: boolean;
    canReceiveMessages: boolean;
    canSendMessages: boolean;
  };
}

export interface CallStartedDetails {
  callId: string;
  direction: 'INBOUND' | 'OUTBOUND';
  sourceType: string;
  sourceId: string;
  targetType: string;
  targetId: string;
  branchId?: string;
  context?: Record<string, unknown>;
}

export interface CallAcceptedDetails {
  callId: string;
  acceptedBy: string;
  acceptedByType: 'DEVICE' | 'OPERATOR';
  deviceId?: string;
  setupTimeMs?: number;
}

export interface CallEndedDetails {
  callId: string;
  status: string;
  durationSeconds?: number;
  endReason?: string;
  initiatedBy?: string;
}

export interface MessageSentDetails {
  messageId: string;
  conversationId: string;
  conversationType: string;
  messageType: string;
  targetBranchId?: string;
  targetEmployeeId?: string;
  bodyLength: number;
}

export interface MessageDeliveredDetails {
  messageId: string;
  conversationId: string;
  deliveredTo: string;
  deliveryLatencyMs: number;
}

// ============================================================================
// COMMUNICATION AUDIT SERVICE
// ============================================================================

/**
 * Communication audit service
 * Provides type-safe methods for recording audit events
 */
export class CommunicationAuditService {
  private readonly store: ControlPlaneStore;
  private readonly logger: Logger;
  
  constructor(store: ControlPlaneStore, logger: Logger) {
    this.store = store;
    this.logger = logger.child({ component: 'CommunicationAudit' });
  }
  
  // ============================================================================
  // DEVICE ENROLLMENT AUDIT EVENTS
  // ============================================================================
  
  /**
   * Record enrollment code creation
   */
  async recordEnrollmentCodeCreated(
    tenantId: string,
    actorUserId: string,
    details: EnrollmentCodeCreatedDetails,
    sourceIp?: string
  ): Promise<void> {
    try {
      await this.store.writeAudit({
        tenantId,
        actorUserId,
        action: COMMUNICATION_AUDIT_ACTIONS.ENROLLMENT_CODE_CREATED,
        resourceNodeId: details.branchId,
        outcome: 'success',
        sourceIp,
        details: {
          enrollmentCodeId: details.enrollmentCodeId,
          branchId: details.branchId,
          allowedDeviceType: details.allowedDeviceType,
          expiresAt: details.expiresAt.toISOString(),
          maxUses: details.maxUses,
        },
      });
      
      this.logger.info({
        event: COMMUNICATION_AUDIT_ACTIONS.ENROLLMENT_CODE_CREATED,
        tenantId,
        actorUserId,
        branchId: details.branchId,
      }, 'Audit: Enrollment code created');
    } catch (error) {
      this.logger.error({ error, tenantId }, 'Failed to write enrollment code created audit event');
      // Non-fatal - don't throw
    }
  }
  
  /**
   * Record device enrollment
   */
  async recordDeviceEnrolled(
    tenantId: string,
    details: DeviceEnrolledDetails,
    sourceIp?: string
  ): Promise<void> {
    try {
      await this.store.writeAudit({
        tenantId,
        actorUserId: null, // Device enrollment is self-initiated
        action: COMMUNICATION_AUDIT_ACTIONS.DEVICE_ENROLLED,
        resourceNodeId: details.branchId,
        outcome: 'success',
        sourceIp,
        details: {
          deviceId: details.deviceId,
          deviceUuid: details.deviceUuid,
          deviceName: details.deviceName,
          deviceType: details.deviceType,
          platform: details.platform,
          branchId: details.branchId,
          enrollmentCodeId: details.enrollmentCodeId,
          linkedEmployeeIds: details.linkedEmployeeIds,
        },
      });
      
      this.logger.info({
        event: COMMUNICATION_AUDIT_ACTIONS.DEVICE_ENROLLED,
        tenantId,
        deviceId: details.deviceId,
        branchId: details.branchId,
      }, 'Audit: Device enrolled');
    } catch (error) {
      this.logger.error({ error, tenantId }, 'Failed to write device enrolled audit event');
    }
  }
  
  /**
   * Record device approval
   */
  async recordDeviceApproved(
    tenantId: string,
    actorUserId: string,
    details: DeviceApprovedDetails,
    sourceIp?: string
  ): Promise<void> {
    try {
      await this.store.writeAudit({
        tenantId,
        actorUserId,
        action: COMMUNICATION_AUDIT_ACTIONS.DEVICE_APPROVED,
        resourceNodeId: details.branchId,
        outcome: 'success',
        sourceIp,
        details: {
          deviceId: details.deviceId,
          deviceName: details.deviceName,
          branchId: details.branchId,
          approvedBy: details.approvedBy,
        },
      });
      
      this.logger.info({
        event: COMMUNICATION_AUDIT_ACTIONS.DEVICE_APPROVED,
        tenantId,
        actorUserId,
        deviceId: details.deviceId,
      }, 'Audit: Device approved');
    } catch (error) {
      this.logger.error({ error, tenantId }, 'Failed to write device approved audit event');
    }
  }
  
  /**
   * Record device revocation
   */
  async recordDeviceRevoked(
    tenantId: string,
    actorUserId: string,
    details: DeviceRevokedDetails,
    sourceIp?: string
  ): Promise<void> {
    try {
      await this.store.writeAudit({
        tenantId,
        actorUserId,
        action: COMMUNICATION_AUDIT_ACTIONS.DEVICE_REVOKED,
        resourceNodeId: null,
        outcome: 'success',
        sourceIp,
        details: {
          deviceId: details.deviceId,
          deviceName: details.deviceName,
          reason: details.reason,
          revokedBy: details.revokedBy,
        },
      });
      
      this.logger.warn({
        event: COMMUNICATION_AUDIT_ACTIONS.DEVICE_REVOKED,
        tenantId,
        actorUserId,
        deviceId: details.deviceId,
        reason: details.reason,
      }, 'Audit: Device revoked');
    } catch (error) {
      this.logger.error({ error, tenantId }, 'Failed to write device revoked audit event');
    }
  }
  
  /**
   * Record employee linked to device
   */
  async recordEmployeeLinked(
    tenantId: string,
    actorUserId: string,
    details: EmployeeLinkedDetails,
    sourceIp?: string
  ): Promise<void> {
    try {
      await this.store.writeAudit({
        tenantId,
        actorUserId,
        action: COMMUNICATION_AUDIT_ACTIONS.DEVICE_EMPLOYEE_LINKED,
        resourceNodeId: null,
        outcome: 'success',
        sourceIp,
        details: {
          deviceId: details.deviceId,
          employeeId: details.employeeId,
          isPrimary: details.isPrimary,
          permissions: details.permissions,
        },
      });
      
      this.logger.info({
        event: COMMUNICATION_AUDIT_ACTIONS.DEVICE_EMPLOYEE_LINKED,
        tenantId,
        deviceId: details.deviceId,
        employeeId: details.employeeId,
      }, 'Audit: Employee linked to device');
    } catch (error) {
      this.logger.error({ error, tenantId }, 'Failed to write employee linked audit event');
    }
  }
  
  /**
   * Record employee unlinked from device
   */
  async recordEmployeeUnlinked(
    tenantId: string,
    actorUserId: string,
    deviceId: string,
    employeeId: string,
    sourceIp?: string
  ): Promise<void> {
    try {
      await this.store.writeAudit({
        tenantId,
        actorUserId,
        action: COMMUNICATION_AUDIT_ACTIONS.DEVICE_EMPLOYEE_UNLINKED,
        resourceNodeId: null,
        outcome: 'success',
        sourceIp,
        details: {
          deviceId,
          employeeId,
        },
      });
      
      this.logger.info({
        event: COMMUNICATION_AUDIT_ACTIONS.DEVICE_EMPLOYEE_UNLINKED,
        tenantId,
        deviceId,
        employeeId,
      }, 'Audit: Employee unlinked from device');
    } catch (error) {
      this.logger.error({ error, tenantId }, 'Failed to write employee unlinked audit event');
    }
  }
  
  // ============================================================================
  // CALL AUDIT EVENTS
  // ============================================================================
  
  /**
   * Record call started
   */
  async recordCallStarted(
    tenantId: string,
    actorUserId: string | null,
    details: CallStartedDetails,
    sourceIp?: string
  ): Promise<void> {
    try {
      await this.store.writeAudit({
        tenantId,
        actorUserId,
        action: COMMUNICATION_AUDIT_ACTIONS.CALL_STARTED,
        resourceNodeId: details.branchId || null,
        outcome: 'success',
        sourceIp,
        details: {
          callId: details.callId,
          direction: details.direction,
          sourceType: details.sourceType,
          sourceId: details.sourceId,
          targetType: details.targetType,
          targetId: details.targetId,
          branchId: details.branchId,
          context: details.context,
        },
      });
      
      this.logger.info({
        event: COMMUNICATION_AUDIT_ACTIONS.CALL_STARTED,
        tenantId,
        callId: details.callId,
        direction: details.direction,
      }, 'Audit: Call started');
    } catch (error) {
      this.logger.error({ error, tenantId }, 'Failed to write call started audit event');
    }
  }
  
  /**
   * Record call accepted
   */
  async recordCallAccepted(
    tenantId: string,
    actorUserId: string | null,
    details: CallAcceptedDetails,
    sourceIp?: string
  ): Promise<void> {
    try {
      await this.store.writeAudit({
        tenantId,
        actorUserId,
        action: COMMUNICATION_AUDIT_ACTIONS.CALL_ACCEPTED,
        resourceNodeId: null,
        outcome: 'success',
        sourceIp,
        details: {
          callId: details.callId,
          acceptedBy: details.acceptedBy,
          acceptedByType: details.acceptedByType,
          deviceId: details.deviceId,
          setupTimeMs: details.setupTimeMs,
        },
      });
      
      this.logger.info({
        event: COMMUNICATION_AUDIT_ACTIONS.CALL_ACCEPTED,
        tenantId,
        callId: details.callId,
        acceptedBy: details.acceptedBy,
      }, 'Audit: Call accepted');
    } catch (error) {
      this.logger.error({ error, tenantId }, 'Failed to write call accepted audit event');
    }
  }
  
  /**
   * Record call ended
   */
  async recordCallEnded(
    tenantId: string,
    actorUserId: string | null,
    details: CallEndedDetails,
    sourceIp?: string
  ): Promise<void> {
    try {
      const action = details.status === 'FAILED' 
        ? COMMUNICATION_AUDIT_ACTIONS.CALL_FAILED
        : details.status === 'MISSED'
        ? COMMUNICATION_AUDIT_ACTIONS.CALL_MISSED
        : details.status === 'REJECTED'
        ? COMMUNICATION_AUDIT_ACTIONS.CALL_REJECTED
        : details.status === 'CANCELLED'
        ? COMMUNICATION_AUDIT_ACTIONS.CALL_CANCELLED
        : COMMUNICATION_AUDIT_ACTIONS.CALL_ENDED;
      
      await this.store.writeAudit({
        tenantId,
        actorUserId,
        action,
        resourceNodeId: null,
        outcome: details.status === 'FAILED' ? 'failure' : 'success',
        sourceIp,
        details: {
          callId: details.callId,
          status: details.status,
          durationSeconds: details.durationSeconds,
          endReason: details.endReason,
          initiatedBy: details.initiatedBy,
        },
      });
      
      this.logger.info({
        event: action,
        tenantId,
        callId: details.callId,
        status: details.status,
        durationSeconds: details.durationSeconds,
      }, 'Audit: Call ended');
    } catch (error) {
      this.logger.error({ error, tenantId }, 'Failed to write call ended audit event');
    }
  }
  
  // ============================================================================
  // MESSAGING AUDIT EVENTS
  // ============================================================================
  
  /**
   * Record message sent
   */
  async recordMessageSent(
    tenantId: string,
    actorUserId: string | null,
    details: MessageSentDetails,
    sourceIp?: string
  ): Promise<void> {
    try {
      await this.store.writeAudit({
        tenantId,
        actorUserId,
        action: COMMUNICATION_AUDIT_ACTIONS.MESSAGE_SENT,
        resourceNodeId: details.targetBranchId || null,
        outcome: 'success',
        sourceIp,
        details: {
          messageId: details.messageId,
          conversationId: details.conversationId,
          conversationType: details.conversationType,
          messageType: details.messageType,
          targetBranchId: details.targetBranchId,
          targetEmployeeId: details.targetEmployeeId,
          bodyLength: details.bodyLength,
          // NOTE: Never log message body content for privacy
        },
      });
      
      this.logger.info({
        event: COMMUNICATION_AUDIT_ACTIONS.MESSAGE_SENT,
        tenantId,
        messageId: details.messageId,
        conversationType: details.conversationType,
      }, 'Audit: Message sent');
    } catch (error) {
      this.logger.error({ error, tenantId }, 'Failed to write message sent audit event');
    }
  }
  
  /**
   * Record message delivered
   */
  async recordMessageDelivered(
    tenantId: string,
    details: MessageDeliveredDetails
  ): Promise<void> {
    try {
      await this.store.writeAudit({
        tenantId,
        actorUserId: null,
        action: COMMUNICATION_AUDIT_ACTIONS.MESSAGE_DELIVERED,
        resourceNodeId: null,
        outcome: 'success',
        details: {
          messageId: details.messageId,
          conversationId: details.conversationId,
          deliveredTo: details.deliveredTo,
          deliveryLatencyMs: details.deliveryLatencyMs,
        },
      });
      
      this.logger.debug({
        event: COMMUNICATION_AUDIT_ACTIONS.MESSAGE_DELIVERED,
        tenantId,
        messageId: details.messageId,
        deliveryLatencyMs: details.deliveryLatencyMs,
      }, 'Audit: Message delivered');
    } catch (error) {
      this.logger.error({ error, tenantId }, 'Failed to write message delivered audit event');
    }
  }
  
  /**
   * Record message read
   */
  async recordMessageRead(
    tenantId: string,
    messageId: string,
    conversationId: string,
    readBy: string
  ): Promise<void> {
    try {
      await this.store.writeAudit({
        tenantId,
        actorUserId: null,
        action: COMMUNICATION_AUDIT_ACTIONS.MESSAGE_READ,
        resourceNodeId: null,
        outcome: 'success',
        details: {
          messageId,
          conversationId,
          readBy,
        },
      });
      
      this.logger.debug({
        event: COMMUNICATION_AUDIT_ACTIONS.MESSAGE_READ,
        tenantId,
        messageId,
      }, 'Audit: Message read');
    } catch (error) {
      this.logger.error({ error, tenantId }, 'Failed to write message read audit event');
    }
  }
  
  /**
   * Batch record audit events
   * Useful for high-throughput scenarios like message delivery receipts
   */
  async recordBatch(events: AuditEventBase[]): Promise<void> {
    try {
      // If store supports batch writes, use it
      // Otherwise, write sequentially (non-blocking)
      for (const event of events) {
        this.store.writeAudit(event).catch((error) => {
          this.logger.error({ error, event }, 'Failed to write batch audit event');
        });
      }
    } catch (error) {
      this.logger.error({ error }, 'Failed to write batch audit events');
    }
  }
}
