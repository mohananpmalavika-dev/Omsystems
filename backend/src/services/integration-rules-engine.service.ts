import { Pool } from 'pg';
import { logger } from '../utils/logger';
import { NormalizedEvent } from './integration-gateway.service';

/**
 * Integration Rules Engine
 * Evaluates rules and executes actions based on external events
 */

interface IntegrationRule {
  id: string;
  name: string;
  connectorId?: string;
  ruleType: string;
  priority: number;
  conditionJson: RuleCondition;
  actionJson: RuleAction[];
  isActive: boolean;
  requiresApproval: boolean;
}

interface RuleCondition {
  eventType?: string | string[];
  severity?: string | string[];
  branchId?: string | string[];
  locationId?: string | string[];
  zoneId?: string | string[];
  sourceSystem?: string | string[];
  timeWindow?: {
    start: string; // HH:MM format
    end: string;
  };
  branchStatus?: 'open' | 'closed';
  dayOfWeek?: number[]; // 0-6, Sunday = 0
  customConditions?: Record<string, any>;
}

interface RuleAction {
  type: 'create-alert' | 'create-incident' | 'preserve-video' | 'send-notification' | 
        'open-cameras' | 'bookmark-video' | 'escalate' | 'suppress-alert';
  params: Record<string, any>;
}

export class IntegrationRulesEngineService {
  private pool: Pool;
  private ruleCache: Map<string, IntegrationRule[]> = new Map();
  private cacheExpiry: number = 5 * 60 * 1000; // 5 minutes

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Evaluate all applicable rules for an event
   */
  async evaluateRules(event: NormalizedEvent): Promise<void> {
    try {
      const rules = await this.getApplicableRules(event);
      
      for (const rule of rules) {
        if (await this.evaluateCondition(rule.conditionJson, event)) {
          await this.executeActions(rule, event);
          
          // Update rule execution statistics
          await this.updateRuleStatistics(rule.id);
          
          logger.info('Rule executed', {
            ruleId: rule.id,
            ruleName: rule.name,
            eventId: event.id
          });
        }
      }
    } catch (error) {
      logger.error('Error evaluating rules', {
        eventId: event.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get applicable rules for an event
   */
  private async getApplicableRules(event: NormalizedEvent): Promise<IntegrationRule[]> {
    const cacheKey = `rules:${event.connectorId}`;
    
    // Check cache
    if (this.ruleCache.has(cacheKey)) {
      return this.ruleCache.get(cacheKey)!;
    }

    // Fetch from database
    const result = await this.pool.query(
      `SELECT * FROM integration_rules
       WHERE (connector_id = $1 OR connector_id IS NULL)
       AND is_active = true
       ORDER BY priority ASC`,
      [event.connectorId]
    );

    const rules = result.rows.map(row => ({
      ...row,
      conditionJson: typeof row.condition_json === 'string' 
        ? JSON.parse(row.condition_json) 
        : row.condition_json,
      actionJson: typeof row.action_json === 'string'
        ? JSON.parse(row.action_json)
        : row.action_json
    }));

    // Cache rules
    this.ruleCache.set(cacheKey, rules);
    setTimeout(() => this.ruleCache.delete(cacheKey), this.cacheExpiry);

    return rules;
  }

  /**
   * Evaluate rule condition against event
   */
  private async evaluateCondition(
    condition: RuleCondition,
    event: NormalizedEvent
  ): Promise<boolean> {
    // Event type matching
    if (condition.eventType) {
      if (Array.isArray(condition.eventType)) {
        if (!condition.eventType.includes(event.eventType)) {
          return false;
        }
      } else if (condition.eventType !== event.eventType) {
        return false;
      }
    }

    // Severity matching
    if (condition.severity) {
      if (Array.isArray(condition.severity)) {
        if (!condition.severity.includes(event.severity)) {
          return false;
        }
      } else if (condition.severity !== event.severity) {
        return false;
      }
    }

    // Branch matching
    if (condition.branchId && event.branchId) {
      if (Array.isArray(condition.branchId)) {
        if (!condition.branchId.includes(event.branchId)) {
          return false;
        }
      } else if (condition.branchId !== event.branchId) {
        return false;
      }
    }

    // Location matching
    if (condition.locationId && event.locationId) {
      if (Array.isArray(condition.locationId)) {
        if (!condition.locationId.includes(event.locationId)) {
          return false;
        }
      } else if (condition.locationId !== event.locationId) {
        return false;
      }
    }

    // Time window matching
    if (condition.timeWindow) {
      const eventTime = event.occurredAt.getHours() * 60 + event.occurredAt.getMinutes();
      const [startHour, startMin] = condition.timeWindow.start.split(':').map(Number);
      const [endHour, endMin] = condition.timeWindow.end.split(':').map(Number);
      const startTime = startHour * 60 + startMin;
      const endTime = endHour * 60 + endMin;

      if (eventTime < startTime || eventTime > endTime) {
        return false;
      }
    }

    // Day of week matching
    if (condition.dayOfWeek) {
      const eventDay = event.occurredAt.getDay();
      if (!condition.dayOfWeek.includes(eventDay)) {
        return false;
      }
    }

    // Branch status matching
    if (condition.branchStatus && event.branchId) {
      const branchStatus = await this.getBranchStatus(event.branchId);
      if (branchStatus !== condition.branchStatus) {
        return false;
      }
    }

    return true;
  }

  /**
   * Execute rule actions
   */
  private async executeActions(rule: IntegrationRule, event: NormalizedEvent): Promise<void> {
    for (const action of rule.actionJson) {
      try {
        switch (action.type) {
          case 'create-alert':
            await this.createAlert(event, action.params);
            break;
          case 'create-incident':
            await this.createIncident(event, action.params);
            break;
          case 'preserve-video':
            await this.preserveVideo(event, action.params);
            break;
          case 'send-notification':
            await this.sendNotification(event, action.params);
            break;
          case 'open-cameras':
            await this.openCameras(event, action.params);
            break;
          case 'bookmark-video':
            await this.bookmarkVideo(event, action.params);
            break;
          case 'escalate':
            await this.escalate(event, action.params);
            break;
        }

        logger.info('Rule action executed', {
          ruleId: rule.id,
          actionType: action.type,
          eventId: event.id
        });
      } catch (error) {
        logger.error('Error executing rule action', {
          ruleId: rule.id,
          actionType: action.type,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  }

  private async createAlert(event: NormalizedEvent, params: any): Promise<void> {
    await this.pool.query(
      `INSERT INTO alerts (event_id, alert_type, severity, title, description, branch_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        event.id,
        params.alertType || 'integration-event',
        params.severity || event.severity,
        params.title || `External Event: ${event.eventType}`,
        params.description || JSON.stringify(event.metadataJson),
        event.branchId
      ]
    );
  }

  private async createIncident(event: NormalizedEvent, params: any): Promise<void> {
    const result = await this.pool.query(
      `INSERT INTO incidents (title, description, incident_type, priority, branch_id, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        params.title || `Integration Event: ${event.eventType}`,
        params.description || JSON.stringify(event),
        params.incidentType || 'security',
        params.priority || 'P2',
        event.branchId,
        'open'
      ]
    );

    const incidentId = result.rows[0].id;

    // Link event to incident
    await this.pool.query(
      `INSERT INTO integration_incident_links (incident_id, external_event_id, link_type)
       VALUES ($1, $2, $3)`,
      [incidentId, event.id, 'trigger']
    );
  }

  private async preserveVideo(event: NormalizedEvent, params: any): Promise<void> {
    const cameras = await this.getCamerasForEvent(event);
    const preEventMinutes = params.preEventMinutes || 10;
    const postEventMinutes = params.postEventMinutes || 30;

    for (const camera of cameras) {
      await this.pool.query(
        `INSERT INTO video_preservation_requests 
         (camera_id, start_time, end_time, reason, priority, triggered_by_event_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          camera.id,
          new Date(event.occurredAt.getTime() - preEventMinutes * 60000),
          new Date(event.occurredAt.getTime() + postEventMinutes * 60000),
          `Integration event: ${event.eventType}`,
          params.priority || 'high',
          event.id
        ]
      );
    }
  }

  private async sendNotification(event: NormalizedEvent, params: any): Promise<void> {
    const recipients = params.recipients || [];
    
    for (const recipient of recipients) {
      await this.pool.query(
        `INSERT INTO notifications (recipient_id, notification_type, title, message, priority)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          recipient,
          'integration-event',
          params.title || `External Event: ${event.eventType}`,
          params.message || JSON.stringify(event.metadataJson),
          params.priority || 'medium'
        ]
      );
    }
  }

  private async openCameras(event: NormalizedEvent, params: any): Promise<void> {
    const cameras = params.cameraIds || await this.getCamerasForEvent(event);
    
    // Trigger live view opening (would be handled by real-time system)
    logger.info('Opening cameras for event', {
      eventId: event.id,
      cameraCount: cameras.length
    });
  }

  private async bookmarkVideo(event: NormalizedEvent, params: any): Promise<void> {
    const cameras = await this.getCamerasForEvent(event);
    
    for (const camera of cameras) {
      await this.pool.query(
        `INSERT INTO video_bookmarks (camera_id, timestamp, title, description, category)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          camera.id,
          event.occurredAt,
          params.title || `External Event: ${event.eventType}`,
          params.description || JSON.stringify(event.metadataJson),
          params.category || 'integration-event'
        ]
      );
    }
  }

  private async escalate(event: NormalizedEvent, params: any): Promise<void> {
    logger.info('Escalating event', {
      eventId: event.id,
      escalateTo: params.escalateTo
    });
  }

  private async getCamerasForEvent(event: NormalizedEvent): Promise<any[]> {
    if (!event.branchId) return [];

    // Get cameras based on mapping
    const result = await this.pool.query(
      `SELECT c.* FROM cameras c
       JOIN integration_mappings im ON c.id = im.internal_id::uuid
       WHERE im.mapping_type = 'camera'
       AND im.external_id = $1
       AND im.is_active = true`,
      [event.sourceDeviceId]
    );

    // If no specific mapping, get all branch cameras
    if (result.rows.length === 0) {
      const branchCameras = await this.pool.query(
        `SELECT * FROM cameras WHERE branch_id = $1 AND status = 'online'`,
        [event.branchId]
      );
      return branchCameras.rows;
    }

    return result.rows;
  }

  private async getBranchStatus(branchId: string): Promise<'open' | 'closed'> {
    const result = await this.pool.query(
      `SELECT status FROM branches WHERE id = $1`,
      [branchId]
    );
    
    return result.rows[0]?.status || 'closed';
  }

  private async updateRuleStatistics(ruleId: string): Promise<void> {
    await this.pool.query(
      `UPDATE integration_rules 
       SET execution_count = execution_count + 1,
           last_executed_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [ruleId]
    );
  }

  /**
   * Create a new integration rule
   */
  async createRule(ruleData: Partial<IntegrationRule>, createdBy: string): Promise<string> {
    const result = await this.pool.query(
      `INSERT INTO integration_rules 
       (name, description, connector_id, rule_type, priority, condition_json, action_json,
        is_active, requires_approval, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        ruleData.name,
        ruleData.name, // description
        ruleData.connectorId,
        ruleData.ruleType,
        ruleData.priority || 100,
        JSON.stringify(ruleData.conditionJson),
        JSON.stringify(ruleData.actionJson),
        ruleData.isActive !== false,
        ruleData.requiresApproval || false,
        createdBy
      ]
    );

    // Clear cache
    this.ruleCache.clear();

    return result.rows[0].id;
  }

  /**
   * Update an existing rule
   */
  async updateRule(ruleId: string, updates: Partial<IntegrationRule>, updatedBy: string): Promise<void> {
    await this.pool.query(
      `UPDATE integration_rules 
       SET name = COALESCE($1, name),
           condition_json = COALESCE($2, condition_json),
           action_json = COALESCE($3, action_json),
           priority = COALESCE($4, priority),
           is_active = COALESCE($5, is_active),
           updated_by = $6,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $7`,
      [
        updates.name,
        updates.conditionJson ? JSON.stringify(updates.conditionJson) : null,
        updates.actionJson ? JSON.stringify(updates.actionJson) : null,
        updates.priority,
        updates.isActive,
        updatedBy,
        ruleId
      ]
    );

    // Clear cache
    this.ruleCache.clear();
  }

  /**
   * Clear rule cache
   */
  clearCache(): void {
    this.ruleCache.clear();
  }
}
