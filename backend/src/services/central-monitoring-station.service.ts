import { EventEmitter } from 'events';
import { Pool } from 'pg';
import { logger } from '../utils/logger';
import { NormalizedEvent } from './integration-gateway.service';

/**
 * Central Monitoring Station Service
 * Manages centralized alarm intake, operator assignment, and multi-branch operations
 */

interface MonitoringOperator {
  id: string;
  userId: string;
  operatorCode: string;
  skillLevel: string;
  languages: string[];
  assignedRegions: string[];
  maxConcurrentEvents: number;
  currentWorkload: number;
  isActive: boolean;
}

interface EventAssignment {
  id: string;
  externalEventId: string;
  operatorId: string;
  priorityAtAssignment: string;
  assignedAt: Date;
  acknowledgedAt?: Date;
  startedHandlingAt?: Date;
  completedAt?: Date;
  escalatedTo?: string;
  resolutionAction?: string;
  operatorNotes?: string;
}

interface RoutingCriteria {
  region?: string;
  branchRisk?: string;
  operatorSkill?: string;
  language?: string;
  incidentType?: string;
  priority?: string;
}

export class CentralMonitoringStationService extends EventEmitter {
  private pool: Pool;
  private eventQueue: Map<string, NormalizedEvent> = new Map();
  private operators: Map<string, MonitoringOperator> = new Map();
  private slaThresholds = {
    critical: 60, // seconds
    high: 180,
    medium: 300,
    low: 600
  };

  constructor(pool: Pool) {
    super();
    this.pool = pool;
    this.initializeOperators();
  }

  /**
   * Initialize active operators
   */
  private async initializeOperators(): Promise<void> {
    try {
      const result = await this.pool.query(`
        SELECT * FROM monitoring_operators WHERE is_active = true
      `);

      for (const operator of result.rows) {
        this.operators.set(operator.id, {
          ...operator,
          currentWorkload: 0
        });
      }

      logger.info('Monitoring operators initialized', {
        operatorCount: this.operators.size
      });
    } catch (error) {
      logger.error('Error initializing operators', { error });
    }
  }

  /**
   * Queue event for central monitoring
   */
  async queueEvent(event: NormalizedEvent): Promise<void> {
    try {
      // Add to queue
      this.eventQueue.set(event.id, event);

      // Determine routing criteria
      const criteria = await this.determineRoutingCriteria(event);

      // Route to appropriate operator
      const operator = await this.routeToOperator(event, criteria);

      if (operator) {
        await this.assignEventToOperator(event, operator);
      } else {
        logger.warn('No available operator for event', {
          eventId: event.id,
          criteria
        });
        // Event remains in queue for next available operator
      }

      this.emit('event:queued', event);
    } catch (error) {
      logger.error('Error queuing event', {
        eventId: event.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Determine routing criteria based on event
   */
  private async determineRoutingCriteria(event: NormalizedEvent): Promise<RoutingCriteria> {
    const criteria: RoutingCriteria = {
      priority: event.severity
    };

    // Get branch information for region and risk
    if (event.branchId) {
      const branchResult = await this.pool.query(
        `SELECT region, risk_category FROM branches WHERE id = $1`,
        [event.branchId]
      );

      if (branchResult.rows.length > 0) {
        criteria.region = branchResult.rows[0].region;
        criteria.branchRisk = branchResult.rows[0].risk_category;
      }
    }

    // Determine incident type from event type
    criteria.incidentType = this.categorizeIncidentType(event.eventType);

    return criteria;
  }

  /**
   * Route event to best available operator
   */
  private async routeToOperator(
    event: NormalizedEvent,
    criteria: RoutingCriteria
  ): Promise<MonitoringOperator | null> {
    const availableOperators = Array.from(this.operators.values()).filter(
      op => op.isActive && op.currentWorkload < op.maxConcurrentEvents
    );

    if (availableOperators.length === 0) {
      return null;
    }

    // Score operators based on criteria
    const scoredOperators = availableOperators.map(operator => ({
      operator,
      score: this.scoreOperator(operator, criteria)
    }));

    // Sort by score (highest first) and workload (lowest first)
    scoredOperators.sort((a, b) => {
      if (a.score !== b.score) {
        return b.score - a.score;
      }
      return a.operator.currentWorkload - b.operator.currentWorkload;
    });

    return scoredOperators[0]?.operator || null;
  }

  /**
   * Score operator based on criteria
   */
  private scoreOperator(operator: MonitoringOperator, criteria: RoutingCriteria): number {
    let score = 0;

    // Region match
    if (criteria.region && operator.assignedRegions.includes(criteria.region)) {
      score += 50;
    }

    // Skill level match
    if (criteria.branchRisk === 'high' && operator.skillLevel === 'senior') {
      score += 30;
    } else if (criteria.branchRisk === 'high' && operator.skillLevel === 'supervisor') {
      score += 40;
    }

    // Priority handling capability
    if (criteria.priority === 'critical' && 
        (operator.skillLevel === 'senior' || operator.skillLevel === 'supervisor')) {
      score += 20;
    }

    // Lower workload bonus
    const workloadPenalty = operator.currentWorkload * 10;
    score -= workloadPenalty;

    return score;
  }

  /**
   * Assign event to operator
   */
  private async assignEventToOperator(
    event: NormalizedEvent,
    operator: MonitoringOperator
  ): Promise<void> {
    try {
      const result = await this.pool.query(
        `INSERT INTO event_assignments 
         (external_event_id, operator_id, assigned_by_rule, priority_at_assignment)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [event.id, operator.id, 'auto-routing', event.severity]
      );

      // Update operator workload
      operator.currentWorkload++;
      this.operators.set(operator.id, operator);

      // Remove from queue
      this.eventQueue.delete(event.id);

      // Emit assignment event
      this.emit('event:assigned', {
        event,
        operator,
        assignment: result.rows[0]
      });

      // Start SLA timer
      this.startSLATimer(result.rows[0].id, event.severity);

      logger.info('Event assigned to operator', {
        eventId: event.id,
        operatorId: operator.id,
        operatorCode: operator.operatorCode
      });
    } catch (error) {
      logger.error('Error assigning event to operator', {
        eventId: event.id,
        operatorId: operator.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Operator acknowledges event
   */
  async acknowledgeEvent(assignmentId: string, operatorId: string): Promise<void> {
    try {
      await this.pool.query(
        `UPDATE event_assignments 
         SET acknowledged_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND operator_id = $2`,
        [assignmentId, operatorId]
      );

      this.emit('event:acknowledged', { assignmentId, operatorId });

      logger.info('Event acknowledged', { assignmentId, operatorId });
    } catch (error) {
      logger.error('Error acknowledging event', { error });
    }
  }

  /**
   * Operator starts handling event
   */
  async startHandling(assignmentId: string, operatorId: string): Promise<void> {
    try {
      await this.pool.query(
        `UPDATE event_assignments 
         SET started_handling_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND operator_id = $2`,
        [assignmentId, operatorId]
      );

      this.emit('event:handling-started', { assignmentId, operatorId });

      logger.info('Event handling started', { assignmentId, operatorId });
    } catch (error) {
      logger.error('Error starting event handling', { error });
    }
  }

  /**
   * Complete event handling
   */
  async completeEvent(
    assignmentId: string,
    operatorId: string,
    resolutionAction: string,
    notes?: string
  ): Promise<void> {
    try {
      const result = await this.pool.query(
        `UPDATE event_assignments 
         SET completed_at = CURRENT_TIMESTAMP,
             handling_duration_seconds = EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - started_handling_at)),
             resolution_action = $1,
             operator_notes = $2,
             response_sla_met = (EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - assigned_at)) <= $3)
         WHERE id = $4 AND operator_id = $5
         RETURNING *`,
        [resolutionAction, notes, this.getSLAThreshold(assignmentId), assignmentId, operatorId]
      );

      if (result.rows.length > 0) {
        // Decrease operator workload
        const operator = this.operators.get(operatorId);
        if (operator) {
          operator.currentWorkload = Math.max(0, operator.currentWorkload - 1);
          this.operators.set(operatorId, operator);
        }

        this.emit('event:completed', {
          assignmentId,
          operatorId,
          assignment: result.rows[0]
        });

        logger.info('Event completed', {
          assignmentId,
          operatorId,
          resolutionAction,
          slaMet: result.rows[0].response_sla_met
        });
      }
    } catch (error) {
      logger.error('Error completing event', { error });
    }
  }

  /**
   * Escalate event to supervisor
   */
  async escalateEvent(
    assignmentId: string,
    operatorId: string,
    supervisorId: string,
    reason: string
  ): Promise<void> {
    try {
      // Update current assignment
      await this.pool.query(
        `UPDATE event_assignments 
         SET escalated_to = $1,
             escalated_at = CURRENT_TIMESTAMP,
             escalation_reason = $2,
             completed_at = CURRENT_TIMESTAMP
         WHERE id = $3 AND operator_id = $4`,
        [supervisorId, reason, assignmentId, operatorId]
      );

      // Get event
      const eventResult = await this.pool.query(
        `SELECT ee.* FROM external_events ee
         JOIN event_assignments ea ON ea.external_event_id = ee.id
         WHERE ea.id = $1`,
        [assignmentId]
      );

      if (eventResult.rows.length > 0) {
        const event = eventResult.rows[0];
        const supervisor = this.operators.get(supervisorId);

        if (supervisor) {
          // Create new assignment for supervisor
          await this.assignEventToOperator(event, supervisor);

          // Decrease original operator workload
          const operator = this.operators.get(operatorId);
          if (operator) {
            operator.currentWorkload = Math.max(0, operator.currentWorkload - 1);
            this.operators.set(operatorId, operator);
          }

          this.emit('event:escalated', {
            assignmentId,
            operatorId,
            supervisorId,
            reason
          });

          logger.info('Event escalated', {
            assignmentId,
            from: operatorId,
            to: supervisorId,
            reason
          });
        }
      }
    } catch (error) {
      logger.error('Error escalating event', { error });
    }
  }

  /**
   * Start SLA timer for assignment
   */
  private startSLATimer(assignmentId: string, severity: string): void {
    const slaSeconds = this.slaThresholds[severity as keyof typeof this.slaThresholds] || 600;

    setTimeout(async () => {
      const result = await this.pool.query(
        `SELECT * FROM event_assignments 
         WHERE id = $1 AND completed_at IS NULL`,
        [assignmentId]
      );

      if (result.rows.length > 0) {
        // SLA breached
        this.emit('sla:breached', {
          assignmentId,
          severity,
          slaSeconds
        });

        logger.warn('SLA breached', { assignmentId, severity, slaSeconds });
      }
    }, slaSeconds * 1000);
  }

  /**
   * Get SLA threshold for assignment
   */
  private async getSLAThreshold(assignmentId: string): Promise<number> {
    const result = await this.pool.query(
      `SELECT priority_at_assignment FROM event_assignments WHERE id = $1`,
      [assignmentId]
    );

    const priority = result.rows[0]?.priority_at_assignment || 'medium';
    return this.slaThresholds[priority as keyof typeof this.slaThresholds] || 600;
  }

  /**
   * Categorize incident type from event type
   */
  private categorizeIncidentType(eventType: string): string {
    if (eventType.includes('fire') || eventType.includes('smoke')) {
      return 'fire-emergency';
    }
    if (eventType.includes('panic') || eventType.includes('intrusion')) {
      return 'security-threat';
    }
    if (eventType.includes('atm') || eventType.includes('tampering')) {
      return 'financial-security';
    }
    if (eventType.includes('access')) {
      return 'access-control';
    }
    return 'general';
  }

  /**
   * Get operator dashboard statistics
   */
  async getOperatorStatistics(operatorId: string): Promise<any> {
    const result = await this.pool.query(`
      SELECT 
        COUNT(*) as total_assignments,
        COUNT(CASE WHEN completed_at IS NOT NULL THEN 1 END) as completed,
        COUNT(CASE WHEN response_sla_met = true THEN 1 END) as sla_met,
        AVG(handling_duration_seconds) as avg_handling_time,
        COUNT(CASE WHEN escalated_to IS NOT NULL THEN 1 END) as escalated
      FROM event_assignments
      WHERE operator_id = $1
      AND assigned_at >= CURRENT_DATE
    `, [operatorId]);

    return result.rows[0];
  }

  /**
   * Get queue statistics
   */
  async getQueueStatistics(): Promise<any> {
    return {
      queuedEvents: this.eventQueue.size,
      activeOperators: Array.from(this.operators.values()).filter(op => op.isActive).length,
      totalWorkload: Array.from(this.operators.values()).reduce(
        (sum, op) => sum + op.currentWorkload,
        0
      )
    };
  }

  /**
   * Mass event handling for disaster scenarios
   */
  async handleMassEvent(events: NormalizedEvent[]): Promise<void> {
    logger.warn('Mass event detected', { eventCount: events.length });

    // Prioritize critical events
    const sortedEvents = events.sort((a, b) => {
      const priorityMap = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
      return (priorityMap[a.severity as keyof typeof priorityMap] || 5) -
             (priorityMap[b.severity as keyof typeof priorityMap] || 5);
    });

    // Queue all events
    for (const event of sortedEvents) {
      await this.queueEvent(event);
    }

    // Emit mass event notification
    this.emit('mass-event', { eventCount: events.length });
  }
}
