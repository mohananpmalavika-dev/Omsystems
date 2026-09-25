/**
 * Communication Call Service
 * 
 * High-level call management service that orchestrates:
 * - Call initiation and routing
 * - Call acceptance with first-answer-wins
 * - Call rejection and cancellation
 * - Call lifecycle management
 * - Participant management
 * 
 * Integrates with:
 * - CallStateMachineService for state transitions
 * - CommunicationPresenceService for routing
 * - WebSocket signaling for real-time events
 * - WebRTC media provider for voice channels
 */

import type { RedisClientType } from 'redis';
import type { Pool } from 'pg';
import type {
  CallSession,
  CallParticipant,
  CallDirection,
  CallSourceType,
  CallTargetType,
  CallEndReason,
} from '../domain/types.js';
import { CallStateMachineService } from './call-state-machine.service.js';
import { CommunicationPresenceService } from './presence.service.js';

/**
 * Call initiation options
 */
export interface InitiateCallOptions {
  /**
   * Tenant ID
   */
  tenantId: string;

  /**
   * Call direction
   */
  direction: CallDirection;

  /**
   * Source type (who is calling)
   */
  sourceType: CallSourceType;

  /**
   * Source identifiers
   */
  sourceBranchId?: string;
  sourceEmployeeId?: string;
  sourceDeviceId?: string;
  sourceOperatorId?: string;

  /**
   * Target type (who is being called)
   */
  targetType: CallTargetType;

  /**
   * Target identifiers
   */
  targetBranchId?: string;
  targetEmployeeId?: string;

  /**
   * Initiated by user ID (for audit)
   */
  initiatedBy: string;
}

/**
 * Call acceptance options
 */
export interface AcceptCallOptions {
  /**
   * Call session ID
   */
  callId: string;

  /**
   * Tenant ID
   */
  tenantId: string;

  /**
   * Device ID accepting (for branch/employee calls)
   */
  deviceId?: string;

  /**
   * Operator ID accepting (for VMS calls)
   */
  operatorId?: string;

  /**
   * WebRTC media session ID
   */
  mediaSessionId?: string;
}

/**
 * Call rejection options
 */
export interface RejectCallOptions {
  /**
   * Call session ID
   */
  callId: string;

  /**
   * Tenant ID
   */
  tenantId: string;

  /**
   * Participant rejecting
   */
  participantId: string;

  /**
   * Rejection reason
   */
  reason?: string;
}

/**
 * Communication Call Service
 */
export class CommunicationCallService {
  private stateMachine: CallStateMachineService;

  constructor(
    private readonly redis: RedisClientType,
    private readonly pool: Pool,
    private readonly presenceService: CommunicationPresenceService
  ) {
    this.stateMachine = new CallStateMachineService(redis, pool);
  }

  /**
   * Initiate a new call
   * 
   * Creates call session and starts ringing eligible endpoints.
   * 
   * @param options - Call initiation options
   * @returns Created call session
   */
  async initiateCall(options: InitiateCallOptions): Promise<CallSession> {
    const {
      tenantId,
      direction,
      sourceType,
      sourceBranchId,
      sourceEmployeeId,
      sourceDeviceId,
      sourceOperatorId,
      targetType,
      targetBranchId,
      targetEmployeeId,
      initiatedBy,
    } = options;

    // Create call session in database
    const result = await this.pool.query<CallSession>(
      `INSERT INTO communication_call_sessions (
        id, tenant_id, direction,
        source_type, source_branch_id, source_employee_id,
        source_device_id, source_operator_id,
        target_type, target_branch_id, target_employee_id,
        status, created_at
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, 'INITIATING', NOW()
      )
      RETURNING
        id, tenant_id as "tenantId", direction,
        source_type as "sourceType",
        source_branch_id as "sourceBranchId",
        source_employee_id as "sourceEmployeeId",
        source_device_id as "sourceDeviceId",
        source_operator_id as "sourceOperatorId",
        target_type as "targetType",
        target_branch_id as "targetBranchId",
        target_employee_id as "targetEmployeeId",
        answered_device_id as "answeredDeviceId",
        answered_operator_id as "answeredOperatorId",
        status, media_session_id as "mediaSessionId",
        created_at as "createdAt",
        ringing_at as "ringingAt",
        answered_at as "answeredAt",
        ended_at as "endedAt",
        duration_seconds as "durationSeconds",
        end_reason as "endReason"`,
      [
        tenantId,
        direction,
        sourceType,
        sourceBranchId || null,
        sourceEmployeeId || null,
        sourceDeviceId || null,
        sourceOperatorId || null,
        targetType,
        targetBranchId || null,
        targetEmployeeId || null,
      ]
    );

    const call = result.rows[0]!;

    // Initialize call state in Redis
    await this.stateMachine.initializeCallState(call.id, tenantId, 'INITIATING');

    // Transition to RINGING
    await this.stateMachine.transition(call.id, tenantId, 'RINGING');

    // Add participants (all eligible endpoints for ringing)
    const participantIds = await this.resolveTargetParticipants(
      tenantId,
      targetType,
      targetBranchId,
      targetEmployeeId
    );

    for (const participantId of participantIds) {
      await this.addParticipant(call.id, tenantId, participantId, 'RINGING');
    }

    return call;
  }

  /**
   * Accept a call (first-answer-wins)
   * 
   * Only one participant can successfully accept.
   * Others receive CALL_ACCEPTED_ELSEWHERE event.
   * 
   * @param options - Call acceptance options
   * @returns Acceptance result
   */
  async acceptCall(options: AcceptCallOptions): Promise<{
    success: boolean;
    call?: CallSession;
    reason?: string;
  }> {
    const {
      callId,
      tenantId,
      deviceId,
      operatorId,
      mediaSessionId,
    } = options;

    const participantId = deviceId || operatorId;
    if (!participantId) {
      return {
        success: false,
        reason: 'PARTICIPANT_ID_REQUIRED',
      };
    }

    // Attempt first-answer-wins lock
    const lockResult = await this.stateMachine.attemptFirstAnswerWins(
      callId,
      tenantId,
      participantId
    );

    if (!lockResult.won) {
      return {
        success: false,
        reason: 'CALL_ALREADY_ACCEPTED',
      };
    }

    // This participant won - transition to CONNECTING
    const transition = await this.stateMachine.transition(
      callId,
      tenantId,
      'CONNECTING'
    );

    if (!transition.success) {
      // Release lock if transition failed
      await this.stateMachine.releaseFirstAnswerLock(callId, tenantId);
      return {
        success: false,
        reason: transition.reason,
      };
    }

    // Update call session with answering participant
    await this.pool.query(
      `UPDATE communication_call_sessions
      SET
        answered_device_id = $1,
        answered_operator_id = $2,
        media_session_id = $3,
        answered_at = NOW()
      WHERE id = $4 AND tenant_id = $5`,
      [deviceId || null, operatorId || null, mediaSessionId || null, callId, tenantId]
    );

    // Update participant status
    await this.updateParticipantStatus(callId, participantId, 'CONNECTED');

    // Update presence (mark as in call)
    if (deviceId) {
      // Get employee ID for device
      const empResult = await this.pool.query<{ employeeId: string }>(
        `SELECT employee_id as "employeeId"
        FROM communication_device_employees
        WHERE device_id = $1 AND is_primary = true AND unlinked_at IS NULL
        LIMIT 1`,
        [deviceId]
      );

      if (empResult.rows.length > 0) {
        await this.presenceService.markEmployeeInCall(
          tenantId,
          empResult.rows[0]!.employeeId,
          callId
        );
      }
    } else if (operatorId) {
      await this.presenceService.markOperatorInCall(tenantId, operatorId, callId);
    }

    // Get updated call
    const call = await this.getCall(callId, tenantId);

    return {
      success: true,
      call: call!,
    };
  }

  /**
   * Reject a call
   * 
   * Participant explicitly rejects the call.
   * 
   * @param options - Rejection options
   */
  async rejectCall(options: RejectCallOptions): Promise<void> {
    const { callId, tenantId, participantId, reason } = options;

    // Update participant status
    await this.updateParticipantStatus(callId, participantId, 'REJECTED');

    // Check if all participants rejected
    const allRejected = await this.checkAllParticipantsRejected(callId);

    if (allRejected) {
      // Transition call to REJECTED
      await this.stateMachine.transition(callId, tenantId, 'REJECTED');

      // Update call with end reason
      await this.pool.query(
        `UPDATE communication_call_sessions
        SET end_reason = $1, ended_at = NOW()
        WHERE id = $2 AND tenant_id = $3`,
        [reason || 'all_rejected', callId, tenantId]
      );
    }
  }

  /**
   * Cancel a call
   * 
   * Caller cancels before anyone answers.
   * 
   * @param callId - Call session ID
   * @param tenantId - Tenant ID
   */
  async cancelCall(callId: string, tenantId: string): Promise<void> {
    // Transition to CANCELLED
    await this.stateMachine.transition(callId, tenantId, 'CANCELLED');

    // Update call
    await this.pool.query(
      `UPDATE communication_call_sessions
      SET end_reason = 'cancelled_by_caller', ended_at = NOW()
      WHERE id = $1 AND tenant_id = $2`,
      [callId, tenantId]
    );

    // Cancel all ringing participants
    await this.pool.query(
      `UPDATE communication_call_participants
      SET connection_status = 'CANCELLED', left_at = NOW()
      WHERE call_id = $1 AND connection_status = 'RINGING'`,
      [callId]
    );

    // Cleanup state
    await this.stateMachine.cleanupCallState(callId, tenantId);
  }

  /**
   * End an active call
   * 
   * Called when call is hung up.
   * 
   * @param callId - Call session ID
   * @param tenantId - Tenant ID
   * @param endReason - Reason for ending
   */
  async endCall(
    callId: string,
    tenantId: string,
    endReason: CallEndReason = 'normal_hangup'
  ): Promise<void> {
    // Get call to find answered employee/operator
    const call = await this.getCall(callId, tenantId);
    if (!call) {
      return;
    }

    // Transition to ENDED
    await this.stateMachine.transition(callId, tenantId, 'ENDED');

    // Calculate duration
    const answeredAt = call.answeredAt ? new Date(call.answeredAt).getTime() : null;
    const endedAt = Date.now();
    const durationSeconds = answeredAt
      ? Math.floor((endedAt - answeredAt) / 1000)
      : 0;

    // Update call
    await this.pool.query(
      `UPDATE communication_call_sessions
      SET
        end_reason = $1,
        ended_at = NOW(),
        duration_seconds = $2
      WHERE id = $3 AND tenant_id = $4`,
      [endReason, durationSeconds, callId, tenantId]
    );

    // Update all participants
    await this.pool.query(
      `UPDATE communication_call_participants
      SET left_at = NOW()
      WHERE call_id = $1 AND left_at IS NULL`,
      [callId]
    );

    // Clear in-call presence
    if (call.answeredDeviceId) {
      const empResult = await this.pool.query<{ employeeId: string }>(
        `SELECT employee_id as "employeeId"
        FROM communication_device_employees
        WHERE device_id = $1 AND is_primary = true AND unlinked_at IS NULL
        LIMIT 1`,
        [call.answeredDeviceId]
      );

      if (empResult.rows.length > 0) {
        await this.presenceService.clearEmployeeInCall(
          tenantId,
          empResult.rows[0]!.employeeId
        );
      }
    }

    if (call.answeredOperatorId) {
      await this.presenceService.clearOperatorInCall(tenantId, call.answeredOperatorId);
    }

    // Cleanup state
    await this.stateMachine.cleanupCallState(callId, tenantId);
  }

  /**
   * Get call session
   * 
   * @param callId - Call session ID
   * @param tenantId - Tenant ID
   * @returns Call session or null
   */
  async getCall(callId: string, tenantId: string): Promise<CallSession | null> {
    const result = await this.pool.query<CallSession>(
      `SELECT
        id, tenant_id as "tenantId", direction,
        source_type as "sourceType",
        source_branch_id as "sourceBranchId",
        source_employee_id as "sourceEmployeeId",
        source_device_id as "sourceDeviceId",
        source_operator_id as "sourceOperatorId",
        target_type as "targetType",
        target_branch_id as "targetBranchId",
        target_employee_id as "targetEmployeeId",
        answered_device_id as "answeredDeviceId",
        answered_operator_id as "answeredOperatorId",
        status, media_session_id as "mediaSessionId",
        created_at as "createdAt",
        ringing_at as "ringingAt",
        answered_at as "answeredAt",
        ended_at as "endedAt",
        duration_seconds as "durationSeconds",
        end_reason as "endReason"
      FROM communication_call_sessions
      WHERE id = $1 AND tenant_id = $2`,
      [callId, tenantId]
    );

    return result.rows[0] || null;
  }

  /**
   * List active calls for tenant
   * 
   * @param tenantId - Tenant ID
   * @returns Array of active calls
   */
  async listActiveCalls(tenantId: string): Promise<CallSession[]> {
    const result = await this.pool.query<CallSession>(
      `SELECT
        id, tenant_id as "tenantId", direction,
        source_type as "sourceType",
        source_branch_id as "sourceBranchId",
        source_employee_id as "sourceEmployeeId",
        source_device_id as "sourceDeviceId",
        source_operator_id as "sourceOperatorId",
        target_type as "targetType",
        target_branch_id as "targetBranchId",
        target_employee_id as "targetEmployeeId",
        answered_device_id as "answeredDeviceId",
        answered_operator_id as "answeredOperatorId",
        status, media_session_id as "mediaSessionId",
        created_at as "createdAt",
        ringing_at as "ringingAt",
        answered_at as "answeredAt",
        ended_at as "endedAt",
        duration_seconds as "durationSeconds",
        end_reason as "endReason"
      FROM communication_call_sessions
      WHERE tenant_id = $1
        AND status IN ('RINGING', 'CONNECTING', 'CONNECTED', 'RECONNECTING')
      ORDER BY created_at DESC`,
      [tenantId]
    );

    return result.rows;
  }

  /**
   * Resolve target participants for call
   * 
   * Determines which devices/operators should ring.
   * 
   * @param tenantId - Tenant ID
   * @param targetType - Target type
   * @param targetBranchId - Target branch ID (if applicable)
   * @param targetEmployeeId - Target employee ID (if applicable)
   * @returns Array of participant IDs (device or operator IDs)
   * @private
   */
  private async resolveTargetParticipants(
    tenantId: string,
    targetType: CallTargetType,
    targetBranchId?: string,
    targetEmployeeId?: string
  ): Promise<string[]> {
    if (targetType === 'BRANCH' && targetBranchId) {
      // Get all online devices for branch
      return this.presenceService.getOnlineBranchDevices(tenantId, targetBranchId);
    }

    if (targetType === 'EMPLOYEE' && targetEmployeeId) {
      // Get all online devices for employee
      return this.presenceService.getOnlineEmployeeDevices(tenantId, targetEmployeeId);
    }

    if (targetType === 'SOC_QUEUE') {
      // Get available operators
      return this.presenceService.getAvailableOperators(tenantId);
    }

    return [];
  }

  /**
   * Add participant to call
   * 
   * @param callId - Call session ID
   * @param tenantId - Tenant ID
   * @param participantId - Participant ID (device or operator)
   * @param status - Initial connection status
   * @private
   */
  private async addParticipant(
    callId: string,
    tenantId: string,
    participantId: string,
    status: string
  ): Promise<void> {
    // Determine participant type
    const isDevice = await this.isDeviceId(participantId);
    const participantType = isDevice ? 'DEVICE' : 'OPERATOR';

    await this.pool.query(
      `INSERT INTO communication_call_participants (
        id, call_id, participant_type,
        device_id, operator_id,
        connection_status, joined_at
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4, $5, NOW()
      )`,
      [
        callId,
        participantType,
        isDevice ? participantId : null,
        isDevice ? null : participantId,
        status,
      ]
    );
  }

  /**
   * Update participant status
   * 
   * @param callId - Call session ID
   * @param participantId - Participant ID
   * @param status - New status
   * @private
   */
  private async updateParticipantStatus(
    callId: string,
    participantId: string,
    status: string
  ): Promise<void> {
    await this.pool.query(
      `UPDATE communication_call_participants
      SET connection_status = $1
      WHERE call_id = $2
        AND (device_id = $3 OR operator_id = $3)`,
      [status, callId, participantId]
    );
  }

  /**
   * Check if all participants rejected
   * 
   * @param callId - Call session ID
   * @returns True if all rejected
   * @private
   */
  private async checkAllParticipantsRejected(callId: string): Promise<boolean> {
    const result = await this.pool.query<{ allRejected: boolean }>(
      `SELECT
        COUNT(*) FILTER (WHERE connection_status != 'REJECTED') = 0 as "allRejected"
      FROM communication_call_participants
      WHERE call_id = $1`,
      [callId]
    );

    return result.rows[0]?.allRejected || false;
  }

  /**
   * Check if ID is a device ID
   * 
   * @param id - ID to check
   * @returns True if device ID
   * @private
   */
  private async isDeviceId(id: string): Promise<boolean> {
    const result = await this.pool.query(
      `SELECT 1 FROM communication_devices WHERE id = $1`,
      [id]
    );

    return result.rows.length > 0;
  }
}
