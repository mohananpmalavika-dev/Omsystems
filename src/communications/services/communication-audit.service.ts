/**
 * Communication Audit Service
 *
 * Handles audit logging for all communication subsystem events.
 *
 * Privacy and security:
 * - NEVER logs message body content
 * - NEVER logs audio/media data
 * - NEVER logs private keys or credentials
 * - NEVER logs enrollment secrets
 * - Logs only operational metadata for compliance
 *
 * Audit events:
 * - Device lifecycle (enrollment, approval, revocation)
 * - Employee linking/unlinking
 * - Call lifecycle (started, answered, rejected, missed, ended, failed)
 * - Message delivery (sent, delivered, read)
 *
 * Integration:
 * - Uses existing audit system via store.writeAudit
 * - Structured for compliance and forensic investigation
 * - Tenant-scoped for isolation
 */

import type { ControlPlaneStore } from '../../../types/store.js';
import type { Logger } from 'pino';
import type {
  CommunicationDeviceType,
  CommunicationCallStatus,
  CommunicationActorType,
} from '../domain/types.js';

export interface CommunicationAuditService {
  // Device lifecycle events
  logEnrollmentCodeCreated(params: {
    tenantId: string;
    branchId: string;
    operatorId: string;
    deviceType?: CommunicationDeviceType;
    employeeIds: string[];
    expiresAt: Date;
  }): Promise<void>;

  logDeviceEnrolled(params: {
    tenantId: string;
    deviceId: string;
    branchId: string;
    deviceType: CommunicationDeviceType;
    platform: string;
    employeeIds: string[];
    sourceIp?: string;
  }): Promise<void>;

  logDeviceApproved(params: {
    tenantId: string;
    deviceId: string;
    branchId: string;
    operatorId: string;
  }): Promise<void>;

  logDeviceRevoked(params: {
    tenantId: string;
    deviceId: string;
    branchId: string;
    operatorId: string;
    reason?: string;
  }): Promise<void>;

  // Employee linking
  logEmployeeLinked(params: {
    tenantId: string;
    deviceId: string;
    employeeId: string;
    operatorId: string;
  }): Promise<void>;

  logEmployeeUnlinked(params: {
    tenantId: string;
    deviceId: string;
    employeeId: string;
    operatorId: string;
  }): Promise<void>;

  // Call lifecycle events
  logCallStarted(params: {
    tenantId: string;
    callId: string;
    direction: 'INBOUND' | 'OUTBOUND';
    sourceType: CommunicationActorType;
    sourceBranchId?: string;
    sourceEmployeeId?: string;
    sourceDeviceId?: string;
    sourceOperatorId?: string;
    targetType: CommunicationActorType;
    targetBranchId?: string;
    targetEmployeeId?: string;
    context?: string;
  }): Promise<void>;

  logCallRinging(params: {
    tenantId: string;
    callId: string;
    deviceIds: string[];
  }): Promise<void>;

  logCallAccepted(params: {
    tenantId: string;
    callId: string;
    deviceId?: string;
    operatorId?: string;
    employeeId?: string;
  }): Promise<void>;

  logCallRejected(params: {
    tenantId: string;
    callId: string;
    deviceId?: string;
    operatorId?: string;
    reason?: string;
  }): Promise<void>;

  logCallMissed(params: {
    tenantId: string;
    callId: string;
    branchId?: string;
    employeeId?: string;
  }): Promise<void>;

  logCallCancelled(params: {
    tenantId: string;
    callId: string;
    cancelledBy: 'CALLER' | 'SYSTEM';
  }): Promise<void>;

  logCallEnded(params: {
    tenantId: string;
    callId: string;
    duration: number;
    endReason: string;
    quality?: 'GOOD' | 'DEGRADED' | 'POOR';
  }): Promise<void>;

  logCallFailed(params: {
    tenantId: string;
    callId: string;
    status: CommunicationCallStatus;
    reason: string;
  }): Promise<void>;

  // Messaging events
  logMessageSent(params: {
    tenantId: string;
    messageId: string;
    conversationId: string;
    senderType: CommunicationActorType;
    senderDeviceId?: string;
    senderOperatorId?: string;
    recipientType: CommunicationActorType;
    recipientBranchId?: string;
    recipientEmployeeId?: string;
    messageType: string;
  }): Promise<void>;

  logMessageDelivered(params: {
    tenantId: string;
    messageId: string;
    deviceId: string;
  }): Promise<void>;

  logMessageRead(params: {
    tenantId: string;
    messageId: string;
    deviceId: string;
  }): Promise<void>;
}

export function createCommunicationAuditService(
  store: ControlPlaneStore,
  logger: Logger
): CommunicationAuditService {
  async function writeAuditEvent(
    event: string,
    data: Record<string, any>
  ): Promise<void> {
    try {
      await store.writeAudit({
        event,
        ...data,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error(
        { error, event, tenantId: data.tenantId },
        'Failed to write communication audit event'
      );
      // Don't throw - audit failure should not break operational flow
    }
  }

  return {
    // Device lifecycle
    async logEnrollmentCodeCreated(params) {
      await writeAuditEvent('COMM_ENROLLMENT_CODE_CREATED', {
        tenantId: params.tenantId,
        branchId: params.branchId,
        operatorId: params.operatorId,
        deviceType: params.deviceType,
        employeeCount: params.employeeIds.length,
        expiresAt: params.expiresAt.toISOString(),
      });
    },

    async logDeviceEnrolled(params) {
      await writeAuditEvent('COMM_DEVICE_ENROLLED', {
        tenantId: params.tenantId,
        deviceId: params.deviceId,
        branchId: params.branchId,
        deviceType: params.deviceType,
        platform: params.platform,
        employeeCount: params.employeeIds.length,
        sourceIp: params.sourceIp,
      });
    },

    async logDeviceApproved(params) {
      await writeAuditEvent('COMM_DEVICE_APPROVED', {
        tenantId: params.tenantId,
        deviceId: params.deviceId,
        branchId: params.branchId,
        operatorId: params.operatorId,
      });
    },

    async logDeviceRevoked(params) {
      await writeAuditEvent('COMM_DEVICE_REVOKED', {
        tenantId: params.tenantId,
        deviceId: params.deviceId,
        branchId: params.branchId,
        operatorId: params.operatorId,
        reason: params.reason,
      });
    },

    // Employee linking
    async logEmployeeLinked(params) {
      await writeAuditEvent('COMM_EMPLOYEE_DEVICE_LINKED', {
        tenantId: params.tenantId,
        deviceId: params.deviceId,
        employeeId: params.employeeId,
        operatorId: params.operatorId,
      });
    },

    async logEmployeeUnlinked(params) {
      await writeAuditEvent('COMM_EMPLOYEE_DEVICE_UNLINKED', {
        tenantId: params.tenantId,
        deviceId: params.deviceId,
        employeeId: params.employeeId,
        operatorId: params.operatorId,
      });
    },

    // Call lifecycle
    async logCallStarted(params) {
      await writeAuditEvent('COMM_CALL_STARTED', {
        tenantId: params.tenantId,
        callId: params.callId,
        direction: params.direction,
        sourceType: params.sourceType,
        sourceBranchId: params.sourceBranchId,
        sourceEmployeeId: params.sourceEmployeeId,
        sourceDeviceId: params.sourceDeviceId,
        sourceOperatorId: params.sourceOperatorId,
        targetType: params.targetType,
        targetBranchId: params.targetBranchId,
        targetEmployeeId: params.targetEmployeeId,
        hasContext: !!params.context,
      });
    },

    async logCallRinging(params) {
      await writeAuditEvent('COMM_CALL_RINGING', {
        tenantId: params.tenantId,
        callId: params.callId,
        deviceCount: params.deviceIds.length,
      });
    },

    async logCallAccepted(params) {
      await writeAuditEvent('COMM_CALL_ACCEPTED', {
        tenantId: params.tenantId,
        callId: params.callId,
        deviceId: params.deviceId,
        operatorId: params.operatorId,
        employeeId: params.employeeId,
      });
    },

    async logCallRejected(params) {
      await writeAuditEvent('COMM_CALL_REJECTED', {
        tenantId: params.tenantId,
        callId: params.callId,
        deviceId: params.deviceId,
        operatorId: params.operatorId,
        reason: params.reason,
      });
    },

    async logCallMissed(params) {
      await writeAuditEvent('COMM_CALL_MISSED', {
        tenantId: params.tenantId,
        callId: params.callId,
        branchId: params.branchId,
        employeeId: params.employeeId,
      });
    },

    async logCallCancelled(params) {
      await writeAuditEvent('COMM_CALL_CANCELLED', {
        tenantId: params.tenantId,
        callId: params.callId,
        cancelledBy: params.cancelledBy,
      });
    },

    async logCallEnded(params) {
      await writeAuditEvent('COMM_CALL_ENDED', {
        tenantId: params.tenantId,
        callId: params.callId,
        duration: params.duration,
        endReason: params.endReason,
        quality: params.quality,
      });
    },

    async logCallFailed(params) {
      await writeAuditEvent('COMM_CALL_FAILED', {
        tenantId: params.tenantId,
        callId: params.callId,
        status: params.status,
        reason: params.reason,
      });
    },

    // Messaging
    async logMessageSent(params) {
      await writeAuditEvent('COMM_MESSAGE_SENT', {
        tenantId: params.tenantId,
        messageId: params.messageId,
        conversationId: params.conversationId,
        senderType: params.senderType,
        senderDeviceId: params.senderDeviceId,
        senderOperatorId: params.senderOperatorId,
        recipientType: params.recipientType,
        recipientBranchId: params.recipientBranchId,
        recipientEmployeeId: params.recipientEmployeeId,
        messageType: params.messageType,
        // NEVER log message body
      });
    },

    async logMessageDelivered(params) {
      await writeAuditEvent('COMM_MESSAGE_DELIVERED', {
        tenantId: params.tenantId,
        messageId: params.messageId,
        deviceId: params.deviceId,
      });
    },

    async logMessageRead(params) {
      await writeAuditEvent('COMM_MESSAGE_READ', {
        tenantId: params.tenantId,
        messageId: params.messageId,
        deviceId: params.deviceId,
      });
    },
  };
}
