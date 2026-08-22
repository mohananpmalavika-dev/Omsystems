/**
 * On-Call Escalation Engine
 * Multi-level escalation with timeout, acknowledgment tracking, and automatic reassignment
 * Supports P1-P4 severity-based escalation policies
 */

import { Pool } from 'pg';
import { logger } from '../utils/logger.js';

export interface EscalationPolicy {
  id: string;
  tenantId: string;
  name: string;
  severity: string; // P1, P2, P3, P4
  levels: EscalationLevel[];
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface EscalationLevel {
  level: number; // 1, 2, 3, etc.
  delayMinutes: number; // Wait time before escalating
  targets: EscalationTarget[];
  requireAcknowledgment: boolean;
  notifyAll: boolean; // If false, round-robin through targets
}

export interface EscalationTarget {
  type: 'user' | 'group' | 'on-call-roster';
  id: string;
  name: string;
}

export interface EscalationState {
  id: string;
  alertId: string;
  tenantId: string;
  policyId: string;
  currentLevel: number;
  status: 'active' | 'acknowledged' | 'resolved' | 'expired';
  assignedTo?: string;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
  escalationHistory: EscalationEvent[];
  createdAt: Date;
  updatedAt: Date;
}

export interface EscalationEvent {
  level: number;
  timestamp: Date;
  action: 'assigned' | 'notified' | 'acknowledged' | 'escalated' | 'resolved';
  userId?: string;
  details?: string;
}

export class EscalationEngine {
  private pool: Pool;
  private checkInterval: NodeJS.Timeout | null = null;
  private readonly CHECK_INTERVAL_MS = 30000; // 30 seconds

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Start escalation engine
   */
  start(): void {
    logger.info('Starting escalation engine');
    
    this.checkInterval = setInterval(async () => {
      await this.processEscalations();
    }, this.CHECK_INTERVAL_MS);

    // Initial check
    this.processEscalations();
  }

  /**
   * Stop escalation engine
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    logger.info('Escalation engine stopped');
  }

  /**
   * Create escalation for new alert
   */
  async createEscalation(
    alertId: string,
    tenantId: string,
    severity: string
  ): Promise<EscalationState> {
    try {
      // Get escalation policy for severity
      const policy = await this.getPolicy(tenantId, severity);

      if (!policy || policy.levels.length === 0) {
        throw new Error(`No escalation policy found for ${severity}`);
      }

      // Create escalation state
      const result = await this.pool.query(
        `INSERT INTO escalation_states (
          alert_id, tenant_id, policy_id, current_level,
          status, escalation_history, created_at, updated_at
        ) VALUES ($1, $2, $3, 1, 'active', $4, NOW(), NOW())
        RETURNING id, created_at`,
        [
          alertId,
          tenantId,
          policy.id,
          JSON.stringify([{
            level: 1,
            timestamp: new Date(),
            action: 'assigned'
          }])
        ]
      );

      const escalationState: EscalationState = {
        id: result.rows[0].id,
        alertId,
        tenantId,
        policyId: policy.id,
        currentLevel: 1,
        status: 'active',
        escalationHistory: [{
          level: 1,
          timestamp: result.rows[0].created_at,
          action: 'assigned'
        }],
        createdAt: result.rows[0].created_at,
        updatedAt: result.rows[0].created_at
      };

      // Notify first level
      await this.notifyLevel(escalationState, policy.levels[0]);

      logger.info('Escalation created', {
        escalationId: escalationState.id,
        alertId,
        severity
      });

      return escalationState;

    } catch (error) {
      logger.error('Failed to create escalation', { alertId, error });
      throw error;
    }
  }

  /**
   * Acknowledge escalation
   */
  async acknowledgeEscalation(
    escalationId: string,
    userId: string
  ): Promise<boolean> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Get escalation state
      const result = await client.query(
        `SELECT 
          id, alert_id as "alertId", tenant_id as "tenantId",
          policy_id as "policyId", current_level as "currentLevel",
          status, escalation_history as "escalationHistory"
         FROM escalation_states
         WHERE id = $1 AND status = 'active'
         FOR UPDATE`,
        [escalationId]
      );

      if (result.rows.length === 0) {
        await client.query('ROLLBACK');
        return false;
      }

      const state: EscalationState = result.rows[0];
      state.escalationHistory = JSON.parse(result.rows[0].escalationHistory || '[]');

      // Add acknowledgment event
      state.escalationHistory.push({
        level: state.currentLevel,
        timestamp: new Date(),
        action: 'acknowledged',
        userId
      });

      // Update state
      await client.query(
        `UPDATE escalation_states 
         SET status = 'acknowledged',
             acknowledged_by = $1,
             acknowledged_at = NOW(),
             escalation_history = $2,
             updated_at = NOW()
         WHERE id = $3`,
        [userId, JSON.stringify(state.escalationHistory), escalationId]
      );

      // Assign alert to acknowledging user
      await client.query(
        `UPDATE analytics_alerts
         SET assigned_to = $1,
             acknowledged_at = NOW(),
             acknowledged_by = $1
         WHERE id = $2`,
        [userId, state.alertId]
      );

      await client.query('COMMIT');

      logger.info('Escalation acknowledged', {
        escalationId,
        userId,
        alertId: state.alertId
      });

      return true;

    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to acknowledge escalation', { escalationId, error });
      return false;
    } finally {
      client.release();
    }
  }

  /**
   * Resolve escalation
   */
  async resolveEscalation(
    escalationId: string,
    userId: string
  ): Promise<boolean> {
    try {
      const result = await this.pool.query(
        `UPDATE escalation_states 
         SET status = 'resolved',
             updated_at = NOW(),
             escalation_history = escalation_history || $1::jsonb
         WHERE id = $2 AND status IN ('active', 'acknowledged')
         RETURNING id`,
        [
          JSON.stringify([{
            level: -1,
            timestamp: new Date(),
            action: 'resolved',
            userId
          }]),
          escalationId
        ]
      );

      if (result.rowCount === 0) {
        return false;
      }

      logger.info('Escalation resolved', { escalationId, userId });
      return true;

    } catch (error) {
      logger.error('Failed to resolve escalation', { escalationId, error });
      return false;
    }
  }

  /**
   * Process all active escalations
   */
  private async processEscalations(): Promise<void> {
    try {
      // Get all active escalations
      const result = await this.pool.query(
        `SELECT 
          e.id, e.alert_id as "alertId", e.tenant_id as "tenantId",
          e.policy_id as "policyId", e.current_level as "currentLevel",
          e.status, e.escalation_history as "escalationHistory",
          e.created_at as "createdAt", e.updated_at as "updatedAt",
          p.levels
         FROM escalation_states e
         JOIN escalation_policies p ON e.policy_id = p.id
         WHERE e.status = 'active'
           AND p.enabled = true`
      );

      for (const row of result.rows) {
        const state: EscalationState = {
          ...row,
          escalationHistory: JSON.parse(row.escalationHistory || '[]')
        };
        
        const policy = {
          levels: JSON.parse(row.levels || '[]')
        };

        await this.checkEscalation(state, policy.levels);
      }

    } catch (error) {
      logger.error('Escalation processing error', { error });
    }
  }

  /**
   * Check if escalation should move to next level
   */
  private async checkEscalation(
    state: EscalationState,
    levels: EscalationLevel[]
  ): Promise<void> {
    const currentLevel = levels.find(l => l.level === state.currentLevel);

    if (!currentLevel) {
      return;
    }

    // Get last event for current level
    const lastEvent = state.escalationHistory
      .filter(e => e.level === state.currentLevel)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())[0];

    if (!lastEvent) {
      return;
    }

    // Check if delay has passed
    const delayMs = currentLevel.delayMinutes * 60 * 1000;
    const elapsed = Date.now() - new Date(lastEvent.timestamp).getTime();

    if (elapsed < delayMs) {
      return;
    }

    // Escalate to next level
    const nextLevel = levels.find(l => l.level === state.currentLevel + 1);

    if (!nextLevel) {
      // No more levels, mark as expired
      await this.pool.query(
        `UPDATE escalation_states 
         SET status = 'expired', updated_at = NOW()
         WHERE id = $1`,
        [state.id]
      );

      logger.warn('Escalation expired - no more levels', {
        escalationId: state.id,
        alertId: state.alertId
      });

      return;
    }

    // Move to next level
    state.currentLevel = nextLevel.level;
    state.escalationHistory.push({
      level: nextLevel.level,
      timestamp: new Date(),
      action: 'escalated'
    });

    await this.pool.query(
      `UPDATE escalation_states 
       SET current_level = $1,
           escalation_history = $2,
           updated_at = NOW()
       WHERE id = $3`,
      [
        state.currentLevel,
        JSON.stringify(state.escalationHistory),
        state.id
      ]
    );

    // Notify next level
    await this.notifyLevel(state, nextLevel);

    logger.info('Alert escalated to next level', {
      escalationId: state.id,
      alertId: state.alertId,
      level: nextLevel.level
    });
  }

  /**
   * Notify escalation level targets
   */
  private async notifyLevel(
    state: EscalationState,
    level: EscalationLevel
  ): Promise<void> {
    try {
      // Get alert details
      const alertResult = await this.pool.query(
        `SELECT 
          id, title, description, severity,
          camera_id as "cameraId", first_detected_at as "firstDetectedAt"
         FROM analytics_alerts
         WHERE id = $1`,
        [state.alertId]
      );

      if (alertResult.rows.length === 0) {
        return;
      }

      const alert = alertResult.rows[0];

      // Resolve targets to actual users
      const users = await this.resolveTargets(level.targets, state.tenantId);

      if (users.length === 0) {
        logger.warn('No users found for escalation level', {
          escalationId: state.id,
          level: level.level
        });
        return;
      }

      // Notify users
      for (const user of users) {
        // Create notification (integrate with your notification system)
        await this.pool.query(
          `INSERT INTO escalation_notifications (
            escalation_id, user_id, level, alert_id,
            created_at
          ) VALUES ($1, $2, $3, $4, NOW())`,
          [state.id, user.id, level.level, state.alertId]
        );

        logger.debug('Escalation notification sent', {
          escalationId: state.id,
          userId: user.id,
          level: level.level
        });
      }

    } catch (error) {
      logger.error('Failed to notify escalation level', {
        escalationId: state.id,
        level: level.level,
        error
      });
    }
  }

  /**
   * Resolve escalation targets to actual users
   */
  private async resolveTargets(
    targets: EscalationTarget[],
    tenantId: string
  ): Promise<Array<{ id: string; email: string }>> {
    const users: Array<{ id: string; email: string }> = [];

    for (const target of targets) {
      if (target.type === 'user') {
        const result = await this.pool.query(
          `SELECT id::text, email FROM users 
           WHERE id = $1 AND status = 'active'`,
          [target.id]
        );
        
        if (result.rows.length > 0) {
          users.push(result.rows[0]);
        }

      } else if (target.type === 'group') {
        const result = await this.pool.query(
          `SELECT u.id::text, u.email 
           FROM users u
           JOIN user_group_memberships ugm ON u.id = ugm.user_id
           WHERE ugm.group_id = $1 
             AND u.status = 'active'
             AND u.tenant_id = $2`,
          [target.id, tenantId]
        );
        
        users.push(...result.rows);

      } else if (target.type === 'on-call-roster') {
        // Get current on-call user from roster
        const onCallUsers = await this.getCurrentOnCallUsers(target.id);
        users.push(...onCallUsers);
      }
    }

    return users;
  }

  /**
   * Get current on-call users from roster
   */
  private async getCurrentOnCallUsers(
    rosterId: string
  ): Promise<Array<{ id: string; email: string }>> {
    const result = await this.pool.query(
      `SELECT u.id::text, u.email
       FROM on_call_shifts s
       JOIN users u ON s.user_id = u.id
       WHERE s.roster_id = $1
         AND s.start_time <= NOW()
         AND s.end_time >= NOW()
         AND u.status = 'active'`,
      [rosterId]
    );

    return result.rows;
  }

  /**
   * Get escalation policy by severity
   */
  private async getPolicy(
    tenantId: string,
    severity: string
  ): Promise<EscalationPolicy | null> {
    const result = await this.pool.query(
      `SELECT 
        id::text, tenant_id::text as "tenantId", name,
        severity, levels, enabled,
        created_at as "createdAt", updated_at as "updatedAt"
       FROM escalation_policies
       WHERE tenant_id = $1 AND severity = $2 AND enabled = true
       ORDER BY created_at DESC
       LIMIT 1`,
      [tenantId, severity]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return {
      ...result.rows[0],
      levels: JSON.parse(result.rows[0].levels || '[]')
    };
  }

  /**
   * Create escalation policy
   */
  async createPolicy(policy: Omit<EscalationPolicy, 'id' | 'createdAt' | 'updatedAt'>): Promise<EscalationPolicy> {
    const result = await this.pool.query(
      `INSERT INTO escalation_policies (
        tenant_id, name, severity, levels, enabled,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
      RETURNING id::text, created_at, updated_at`,
      [
        policy.tenantId,
        policy.name,
        policy.severity,
        JSON.stringify(policy.levels),
        policy.enabled
      ]
    );

    return {
      ...policy,
      id: result.rows[0].id,
      createdAt: result.rows[0].created_at,
      updatedAt: result.rows[0].updated_at
    };
  }

  /**
   * Get escalation statistics
   */
  async getStatistics(tenantId: string, days: number = 7): Promise<any> {
    const result = await this.pool.query(
      `SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'acknowledged') as acknowledged,
        COUNT(*) FILTER (WHERE status = 'resolved') as resolved,
        COUNT(*) FILTER (WHERE status = 'expired') as expired,
        AVG(EXTRACT(EPOCH FROM (acknowledged_at - created_at))/60) 
          FILTER (WHERE acknowledged_at IS NOT NULL) as avg_ack_time_minutes,
        MAX(current_level) as max_level_reached
       FROM escalation_states
       WHERE tenant_id = $1
         AND created_at > NOW() - INTERVAL '${days} days'`,
      [tenantId]
    );

    return result.rows[0];
  }
}
