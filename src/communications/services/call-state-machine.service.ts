/**
 * Call State Machine Service
 * 
 * Manages deterministic call state transitions with distributed coordination.
 * Ensures only valid state transitions occur and enforces business rules.
 * 
 * Core responsibilities:
 * - Validate state transitions using VALID_CALL_TRANSITIONS
 * - Enforce first-answer-wins semantics (atomic Redis operations)
 * - Manage call lifecycle state
 * - Prevent invalid state transitions
 * - Coordinate across multiple control-plane instances
 * 
 * State machine:
 * IDLE → INITIATING → RINGING → {REJECTED, MISSED, CANCELLED, CONNECTING}
 * CONNECTING → CONNECTED → {RECONNECTING, ENDED, FAILED}
 * RECONNECTING → {CONNECTED, FAILED}
 * 
 * Critical invariants:
 * - Only one endpoint can accept a call (first-answer-wins)
 * - State transitions must be valid per VALID_CALL_TRANSITIONS
 * - ENDED/FAILED/REJECTED/MISSED/CANCELLED are terminal states
 * - Distributed coordination via Redis atomic operations
 */

import type { RedisClientType } from 'redis';
import type { Pool } from 'pg';
import type {
  CommunicationCallStatus,
  CallSession,
} from '../domain/types.js';
import {
  VALID_CALL_TRANSITIONS,
  REDIS_KEYS,
  CALL_STATE_TIMEOUT_MS,
} from '../domain/constants.js';

/**
 * State transition result
 */
export interface StateTransitionResult {
  /**
   * Whether transition was successful
   */
  success: boolean;

  /**
   * Current state after transition attempt
   */
  currentState: CommunicationCallStatus;

  /**
   * Previous state before transition
   */
  previousState: CommunicationCallStatus;

  /**
   * Rejection reason if transition failed
   */
  reason?: string;
}

/**
 * First-answer-wins lock result
 */
export interface FirstAnswerResult {
  /**
   * Whether this participant won the lock
   */
  won: boolean;

  /**
   * Winner participant ID
   */
  winnerId?: string;

  /**
   * Lock timestamp
   */
  timestamp?: string;
}

/**
 * Call State Machine Service
 */
export class CallStateMachineService {
  constructor(
    private readonly redis: RedisClientType,
    private readonly pool: Pool
  ) {}

  /**
   * Attempt state transition
   * 
   * Validates transition using VALID_CALL_TRANSITIONS matrix.
   * Updates both Redis (authoritative) and PostgreSQL (durable).
   * 
   * @param callId - Call session ID
   * @param tenantId - Tenant ID for isolation
   * @param toState - Target state
   * @returns Transition result
   */
  async transition(
    callId: string,
    tenantId: string,
    toState: CommunicationCallStatus
  ): Promise<StateTransitionResult> {
    // Get current state from Redis (authoritative)
    const currentState = await this.getCallState(callId, tenantId);

    if (!currentState) {
      return {
        success: false,
        currentState: 'IDLE',
        previousState: 'IDLE',
        reason: 'CALL_NOT_FOUND',
      };
    }

    // Check if transition is valid
    const validTransitions = VALID_CALL_TRANSITIONS[currentState];
    if (!validTransitions || !validTransitions.includes(toState)) {
      return {
        success: false,
        currentState,
        previousState: currentState,
        reason: 'INVALID_STATE_TRANSITION',
      };
    }

    // Perform atomic state transition in Redis
    const key = REDIS_KEYS.CALL_STATE(tenantId, callId);
    
    // Use Redis transaction for atomicity
    const multi = this.redis.multi();
    multi.set(key, toState);
    multi.expire(key, Math.floor(CALL_STATE_TIMEOUT_MS.ACTIVE / 1000));
    await multi.exec();

    // Update PostgreSQL for durability
    await this.updateCallStateInDb(callId, tenantId, toState);

    return {
      success: true,
      currentState: toState,
      previousState: currentState,
    };
  }

  /**
   * Attempt first-answer-wins lock
   * 
   * When multiple devices ring, only one can accept.
   * This uses Redis SET NX (set if not exists) for atomic coordination.
   * 
   * Example:
   * - Reception PC and Manager Mobile both ring
   * - Reception PC accepts first
   * - Manager Mobile's accept is rejected (lock already held)
   * 
   * @param callId - Call session ID
   * @param tenantId - Tenant ID
   * @param participantId - Participant attempting to answer (device/operator ID)
   * @returns Lock result
   */
  async attemptFirstAnswerWins(
    callId: string,
    tenantId: string,
    participantId: string
  ): Promise<FirstAnswerResult> {
    const key = REDIS_KEYS.CALL_ANSWER_LOCK(tenantId, callId);
    const timestamp = new Date().toISOString();

    // Atomic SET NX with expiry
    // Returns 'OK' if set, null if key already exists
    const lockData = JSON.stringify({ participantId, timestamp });
    const result = await this.redis.set(key, lockData, {
      NX: true, // Only set if not exists
      EX: 60, // 60 second TTL
    });

    if (result === 'OK') {
      // This participant won the lock
      return {
        won: true,
        winnerId: participantId,
        timestamp,
      };
    }

    // Lock already held by someone else
    const existingLock = await this.redis.get(key);
    if (existingLock) {
      try {
        const lockInfo = JSON.parse(existingLock);
        return {
          won: false,
          winnerId: lockInfo.participantId,
          timestamp: lockInfo.timestamp,
        };
      } catch {
        // Corrupted lock data
        return {
          won: false,
        };
      }
    }

    return {
      won: false,
    };
  }

  /**
   * Release first-answer-wins lock
   * 
   * Called when call transitions to terminal state.
   * 
   * @param callId - Call session ID
   * @param tenantId - Tenant ID
   */
  async releaseFirstAnswerLock(
    callId: string,
    tenantId: string
  ): Promise<void> {
    const key = REDIS_KEYS.CALL_ANSWER_LOCK(tenantId, callId);
    await this.redis.del(key);
  }

  /**
   * Get current call state
   * 
   * Redis is authoritative for active calls.
   * Falls back to PostgreSQL if Redis key expired.
   * 
   * @param callId - Call session ID
   * @param tenantId - Tenant ID
   * @returns Current state or null if not found
   */
  async getCallState(
    callId: string,
    tenantId: string
  ): Promise<CommunicationCallStatus | null> {
    // Try Redis first (authoritative for active calls)
    const key = REDIS_KEYS.CALL_STATE(tenantId, callId);
    const state = await this.redis.get(key);

    if (state) {
      return state as CommunicationCallStatus;
    }

    // Fall back to PostgreSQL
    const result = await this.pool.query<{ status: CommunicationCallStatus }>(
      `SELECT status FROM communication_call_sessions
      WHERE id = $1 AND tenant_id = $2`,
      [callId, tenantId]
    );

    return result.rows[0]?.status || null;
  }

  /**
   * Initialize call state
   * 
   * Called when creating a new call session.
   * 
   * @param callId - Call session ID
   * @param tenantId - Tenant ID
   * @param initialState - Initial state (default: INITIATING)
   */
  async initializeCallState(
    callId: string,
    tenantId: string,
    initialState: CommunicationCallStatus = 'INITIATING'
  ): Promise<void> {
    const key = REDIS_KEYS.CALL_STATE(tenantId, callId);
    
    await this.redis.setEx(
      key,
      Math.floor(CALL_STATE_TIMEOUT_MS.INITIATING / 1000),
      initialState
    );
  }

  /**
   * Check if state is terminal
   * 
   * Terminal states cannot transition to other states.
   * 
   * @param state - Call state to check
   * @returns True if terminal
   */
  isTerminalState(state: CommunicationCallStatus): boolean {
    const terminalStates: CommunicationCallStatus[] = [
      'ENDED',
      'FAILED',
      'REJECTED',
      'MISSED',
      'CANCELLED',
    ];

    return terminalStates.includes(state);
  }

  /**
   * Validate transition without executing
   * 
   * Used for pre-validation in UI/API layer.
   * 
   * @param fromState - Current state
   * @param toState - Target state
   * @returns True if transition is valid
   */
  isValidTransition(
    fromState: CommunicationCallStatus,
    toState: CommunicationCallStatus
  ): boolean {
    const validTransitions = VALID_CALL_TRANSITIONS[fromState];
    return validTransitions ? validTransitions.includes(toState) : false;
  }

  /**
   * Get call state history
   * 
   * Returns state transition history from PostgreSQL audit.
   * 
   * @param callId - Call session ID
   * @param tenantId - Tenant ID
   * @returns Array of state transitions
   */
  async getStateHistory(
    callId: string,
    tenantId: string
  ): Promise<Array<{
    state: CommunicationCallStatus;
    timestamp: string;
  }>> {
    // In production, this would query a call_state_history table
    // For now, we reconstruct from call_sessions timestamps
    const result = await this.pool.query<CallSession>(
      `SELECT
        status,
        created_at as "createdAt",
        ringing_at as "ringingAt",
        answered_at as "answeredAt",
        ended_at as "endedAt"
      FROM communication_call_sessions
      WHERE id = $1 AND tenant_id = $2`,
      [callId, tenantId]
    );

    if (result.rows.length === 0) {
      return [];
    }

    const call = result.rows[0]!;
    const history: Array<{ state: CommunicationCallStatus; timestamp: string }> = [];

    // Reconstruct state history from timestamps
    if (call.createdAt) {
      history.push({ state: 'INITIATING', timestamp: call.createdAt });
    }
    if (call.ringingAt) {
      history.push({ state: 'RINGING', timestamp: call.ringingAt });
    }
    if (call.answeredAt) {
      history.push({ state: 'CONNECTING', timestamp: call.answeredAt });
      // If call is connected, it transitioned through CONNECTING
      if (call.status === 'CONNECTED') {
        history.push({ state: 'CONNECTED', timestamp: call.answeredAt });
      }
    }
    if (call.endedAt) {
      history.push({ state: call.status, timestamp: call.endedAt });
    }

    return history;
  }

  /**
   * Cleanup call state
   * 
   * Called when call reaches terminal state.
   * Removes Redis keys but keeps PostgreSQL record.
   * 
   * @param callId - Call session ID
   * @param tenantId - Tenant ID
   */
  async cleanupCallState(
    callId: string,
    tenantId: string
  ): Promise<void> {
    const stateKey = REDIS_KEYS.CALL_STATE(tenantId, callId);
    const lockKey = REDIS_KEYS.CALL_ANSWER_LOCK(tenantId, callId);

    await this.redis.del([stateKey, lockKey]);
  }

  /**
   * Update call state in PostgreSQL
   * 
   * Updates durable state and timestamps.
   * 
   * @param callId - Call session ID
   * @param tenantId - Tenant ID
   * @param state - New state
   * @private
   */
  private async updateCallStateInDb(
    callId: string,
    tenantId: string,
    state: CommunicationCallStatus
  ): Promise<void> {
    // Determine which timestamp to update
    let timestampField: string | null = null;
    let timestampValue: string | null = null;

    switch (state) {
      case 'RINGING':
        timestampField = 'ringing_at';
        break;
      case 'CONNECTING':
      case 'CONNECTED':
        timestampField = 'answered_at';
        break;
      case 'ENDED':
      case 'FAILED':
      case 'REJECTED':
      case 'MISSED':
      case 'CANCELLED':
        timestampField = 'ended_at';
        break;
    }

    if (timestampField) {
      timestampValue = 'NOW()';
    }

    // Build update query
    let query = `UPDATE communication_call_sessions SET status = $1`;
    const params: any[] = [state];

    if (timestampField && timestampValue) {
      query += `, ${timestampField} = ${timestampValue}`;
    }

    query += ` WHERE id = $${params.length + 1} AND tenant_id = $${params.length + 2}`;
    params.push(callId, tenantId);

    await this.pool.query(query, params);
  }
}
