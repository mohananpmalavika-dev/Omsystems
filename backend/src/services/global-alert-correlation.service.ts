/**
 * Global Alert Correlation Engine
 * Correlates alerts across multiple regional servers to detect coordinated incidents
 */

import { EventEmitter } from 'events';
import { Pool } from 'pg';
import { randomBytes } from 'crypto';
import { logger } from '../utils/logger.js';

export interface AlertCorrelation {
  id: string;
  correlationId: string;
  tenantId: string;
  correlationType: 'temporal' | 'spatial' | 'entity' | 'pattern';
  confidenceScore: number;
  startedAt: Date;
  endedAt: Date;
  regions: string[];
  serverIds: string[];
  alertCount: number;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  trackedEntityType?: string;
  trackedEntityId?: string;
  patternName?: string;
  patternConfidence?: number;
  investigated: boolean;
  investigationNotes?: string;
  incidentCreated: boolean;
  incidentId?: string;
  metadata?: Record<string, any>;
  alerts: CorrelatedAlert[];
}

export interface CorrelatedAlert {
  serverId: string;
  localAlertId: string;
  alertType: string;
  occurredAt: Date;
  branchId: string;
  cameraId: string;
  entityData?: Record<string, any>;
}

export interface CorrelationRule {
  id: string;
  name: string;
  enabled: boolean;
  correlationType: string;
  timeWindowMinutes: number;
  minOccurrences: number;
  regions?: string[];
  alertTypes?: string[];
  autoCreateIncident: boolean;
  severity: string;
}

export class GlobalAlertCorrelationService extends EventEmitter {
  private pool: Pool;
  private correlationInterval?: NodeJS.Timeout;
  private readonly CORRELATION_CHECK_INTERVAL_MS = 60000; // 1 minute
  private readonly DEFAULT_TIME_WINDOW_MINUTES = 30;

  constructor(pool: Pool) {
    super();
    this.pool = pool;
  }

  /**
   * Start correlation engine
   */
  async start(): Promise<void> {
    logger.info('Starting Global Alert Correlation Engine');

    // Start periodic correlation checks
    this.correlationInterval = setInterval(async () => {
      try {
        await this.runCorrelationAnalysis();
      } catch (error) {
        logger.error('Correlation analysis failed', {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }, this.CORRELATION_CHECK_INTERVAL_MS);

    logger.info('Global Alert Correlation Engine started');
  }

  /**
   * Stop correlation engine
   */
  async stop(): Promise<void> {
    if (this.correlationInterval) {
      clearInterval(this.correlationInterval);
    }
    logger.info('Global Alert Correlation Engine stopped');
  }

  /**
   * Correlate alerts from a new alert
   */
  async correlateAlert(
    tenantId: string,
    serverId: string,
    alert: {
      id: string;
      type: string;
      occurredAt: Date;
      branchId: string;
      cameraId: string;
      severity: string;
      entityData?: Record<string, any>;
    }
  ): Promise<AlertCorrelation | null> {
    try {
      // Check for temporal correlation (same time window)
      const temporalCorrelation = await this.findTemporalCorrelation(
        tenantId,
        alert.occurredAt,
        alert.type
      );

      if (temporalCorrelation) {
        await this.addAlertToCorrelation(temporalCorrelation.id, serverId, alert);
        this.emit('correlation:updated', temporalCorrelation);
        return temporalCorrelation;
      }

      // Check for entity correlation (same vehicle/person across regions)
      if (alert.entityData) {
        const entityCorrelation = await this.findEntityCorrelation(
          tenantId,
          alert.entityData,
          alert.occurredAt
        );

        if (entityCorrelation) {
          await this.addAlertToCorrelation(entityCorrelation.id, serverId, alert);
          this.emit('correlation:updated', entityCorrelation);
          return entityCorrelation;
        }
      }

      // Check for pattern correlation
      const patternCorrelation = await this.findPatternCorrelation(
        tenantId,
        alert.type,
        alert.occurredAt
      );

      if (patternCorrelation) {
        await this.addAlertToCorrelation(patternCorrelation.id, serverId, alert);
        this.emit('correlation:updated', patternCorrelation);
        return patternCorrelation;
      }

      // No existing correlation found - consider creating new one
      const shouldCreateCorrelation = await this.shouldCreateCorrelation(
        tenantId,
        alert
      );

      if (shouldCreateCorrelation) {
        return await this.createCorrelation(tenantId, serverId, alert);
      }

      return null;

    } catch (error) {
      logger.error('Alert correlation failed', {
        alertId: alert.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return null;
    }
  }

  /**
   * Get active correlations
   */
  async getActiveCorrelations(
    tenantId: string,
    filters?: {
      severity?: string;
      regions?: string[];
      limit?: number;
    }
  ): Promise<AlertCorrelation[]> {
    let query = `
      SELECT 
        gac.id::text,
        gac.correlation_id as "correlationId",
        gac.tenant_id::text as "tenantId",
        gac.correlation_type as "correlationType",
        gac.confidence_score as "confidenceScore",
        gac.started_at as "startedAt",
        gac.ended_at as "endedAt",
        gac.regions,
        gac.server_ids as "serverIds",
        gac.alert_count as "alertCount",
        gac.severity,
        gac.tracked_entity_type as "trackedEntityType",
        gac.tracked_entity_id as "trackedEntityId",
        gac.pattern_name as "patternName",
        gac.pattern_confidence as "patternConfidence",
        gac.investigated,
        gac.investigation_notes as "investigationNotes",
        gac.incident_created as "incidentCreated",
        gac.incident_id::text as "incidentId",
        gac.metadata,
        gac.created_at as "createdAt"
      FROM global_alert_correlations gac
      WHERE gac.tenant_id = $1::uuid
        AND gac.investigated = false
        AND gac.created_at > now() - interval '7 days'
    `;

    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (filters?.severity) {
      query += ` AND gac.severity = $${paramIndex++}`;
      params.push(filters.severity);
    }

    if (filters?.regions && filters.regions.length > 0) {
      query += ` AND gac.regions && $${paramIndex++}::text[]`;
      params.push(filters.regions);
    }

    query += ` ORDER BY 
      CASE gac.severity
        WHEN 'critical' THEN 1
        WHEN 'high' THEN 2
        WHEN 'medium' THEN 3
        WHEN 'low' THEN 4
        ELSE 5
      END,
      gac.created_at DESC
    `;

    if (filters?.limit) {
      query += ` LIMIT $${paramIndex++}`;
      params.push(filters.limit);
    }

    const result = await this.pool.query(query, params);

    // Load alerts for each correlation
    const correlations = await Promise.all(
      result.rows.map(async (row) => {
        const alerts = await this.getCorrelationAlerts(row.id);
        return {
          ...row,
          serverIds: row.serverIds || [],
          regions: row.regions || [],
          alerts
        };
      })
    );

    return correlations;
  }

  /**
   * Mark correlation as investigated
   */
  async markAsInvestigated(
    correlationId: string,
    notes?: string,
    createIncident: boolean = false
  ): Promise<void> {
    await this.pool.query(
      `UPDATE global_alert_correlations
       SET investigated = true,
           investigation_notes = $2,
           incident_created = $3,
           updated_at = now()
       WHERE id = $1::uuid`,
      [correlationId, notes, createIncident]
    );

    logger.info('Correlation marked as investigated', { correlationId });
  }

  /**
   * Run periodic correlation analysis
   */
  private async runCorrelationAnalysis(): Promise<void> {
    // Get all active tenants with federation enabled
    const tenants = await this.pool.query(
      `SELECT DISTINCT tenant_id::text
       FROM federated_servers
       WHERE status IN ('online', 'degraded')`
    );

    for (const tenant of tenants.rows) {
      try {
        await this.analyzeRecentAlerts(tenant.tenant_id);
      } catch (error) {
        logger.error('Tenant correlation analysis failed', {
          tenantId: tenant.tenant_id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  }

  /**
   * Analyze recent alerts for correlations
   */
  private async analyzeRecentAlerts(tenantId: string): Promise<void> {
    // This would query recent alerts from all servers
    // For now, placeholder implementation
    logger.debug('Analyzing recent alerts for correlations', { tenantId });
  }

  /**
   * Find temporal correlation
   */
  private async findTemporalCorrelation(
    tenantId: string,
    occurredAt: Date,
    alertType: string
  ): Promise<AlertCorrelation | null> {
    const timeWindowStart = new Date(occurredAt.getTime() - this.DEFAULT_TIME_WINDOW_MINUTES * 60 * 1000);
    const timeWindowEnd = new Date(occurredAt.getTime() + this.DEFAULT_TIME_WINDOW_MINUTES * 60 * 1000);

    const result = await this.pool.query(
      `SELECT 
        id::text,
        correlation_id as "correlationId",
        tenant_id::text as "tenantId",
        correlation_type as "correlationType",
        confidence_score as "confidenceScore",
        started_at as "startedAt",
        ended_at as "endedAt",
        regions,
        server_ids as "serverIds",
        alert_count as "alertCount",
        severity,
        investigated
       FROM global_alert_correlations
       WHERE tenant_id = $1::uuid
         AND correlation_type = 'temporal'
         AND investigated = false
         AND started_at <= $2
         AND ended_at >= $3
       ORDER BY confidence_score DESC
       LIMIT 1`,
      [tenantId, timeWindowEnd, timeWindowStart]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    const alerts = await this.getCorrelationAlerts(row.id);

    return {
      ...row,
      serverIds: row.serverIds || [],
      regions: row.regions || [],
      alerts
    };
  }

  /**
   * Find entity correlation
   */
  private async findEntityCorrelation(
    tenantId: string,
    entityData: Record<string, any>,
    occurredAt: Date
  ): Promise<AlertCorrelation | null> {
    // Extract entity identifier (vehicle plate, person ID, etc.)
    const entityId = entityData.vehiclePlate || entityData.personId || entityData.faceId;
    
    if (!entityId) {
      return null;
    }

    const entityType = entityData.vehiclePlate ? 'vehicle' : 'person';

    const timeWindowStart = new Date(occurredAt.getTime() - 24 * 60 * 60 * 1000); // 24 hours

    const result = await this.pool.query(
      `SELECT 
        id::text,
        correlation_id as "correlationId",
        tenant_id::text as "tenantId",
        correlation_type as "correlationType",
        confidence_score as "confidenceScore",
        started_at as "startedAt",
        ended_at as "endedAt",
        regions,
        server_ids as "serverIds",
        alert_count as "alertCount",
        severity,
        tracked_entity_type as "trackedEntityType",
        tracked_entity_id as "trackedEntityId",
        investigated
       FROM global_alert_correlations
       WHERE tenant_id = $1::uuid
         AND correlation_type = 'entity'
         AND tracked_entity_type = $2
         AND tracked_entity_id = $3
         AND investigated = false
         AND created_at >= $4
       ORDER BY confidence_score DESC
       LIMIT 1`,
      [tenantId, entityType, entityId, timeWindowStart]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    const alerts = await this.getCorrelationAlerts(row.id);

    return {
      ...row,
      serverIds: row.serverIds || [],
      regions: row.regions || [],
      alerts
    };
  }

  /**
   * Find pattern correlation
   */
  private async findPatternCorrelation(
    tenantId: string,
    alertType: string,
    occurredAt: Date
  ): Promise<AlertCorrelation | null> {
    const timeWindowStart = new Date(occurredAt.getTime() - this.DEFAULT_TIME_WINDOW_MINUTES * 60 * 1000);

    const result = await this.pool.query(
      `SELECT 
        id::text,
        correlation_id as "correlationId",
        tenant_id::text as "tenantId",
        correlation_type as "correlationType",
        confidence_score as "confidenceScore",
        started_at as "startedAt",
        ended_at as "endedAt",
        regions,
        server_ids as "serverIds",
        alert_count as "alertCount",
        severity,
        pattern_name as "patternName",
        investigated
       FROM global_alert_correlations
       WHERE tenant_id = $1::uuid
         AND correlation_type = 'pattern'
         AND pattern_name = $2
         AND investigated = false
         AND created_at >= $3
       ORDER BY confidence_score DESC
       LIMIT 1`,
      [tenantId, alertType, timeWindowStart]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    const alerts = await this.getCorrelationAlerts(row.id);

    return {
      ...row,
      serverIds: row.serverIds || [],
      regions: row.regions || [],
      alerts
    };
  }

  /**
   * Check if should create new correlation
   */
  private async shouldCreateCorrelation(
    tenantId: string,
    alert: any
  ): Promise<boolean> {
    // Check if there are similar recent alerts from multiple servers
    const timeWindowStart = new Date(alert.occurredAt.getTime() - 15 * 60 * 1000); // 15 minutes

    const result = await this.pool.query(
      `SELECT COUNT(DISTINCT gacm.server_id) as server_count
       FROM global_alert_correlation_members gacm
       JOIN global_alert_correlations gac ON gac.id = gacm.correlation_id
       WHERE gac.tenant_id = $1::uuid
         AND gacm.alert_type = $2
         AND gacm.occurred_at >= $3`,
      [tenantId, alert.type, timeWindowStart]
    );

    const serverCount = parseInt(result.rows[0]?.server_count || '0');

    // Create correlation if alerts from multiple servers
    return serverCount >= 2;
  }

  /**
   * Create new correlation
   */
  private async createCorrelation(
    tenantId: string,
    serverId: string,
    alert: any
  ): Promise<AlertCorrelation> {
    const correlationId = randomBytes(16).toString('hex');
    const entityId = alert.entityData?.vehiclePlate || alert.entityData?.personId;
    const entityType = alert.entityData?.vehiclePlate ? 'vehicle' : 'person';

    // Determine correlation type
    const correlationType = entityId ? 'entity' : 'temporal';

    const result = await this.pool.query(
      `INSERT INTO global_alert_correlations (
        tenant_id, correlation_id, correlation_type,
        confidence_score, started_at, ended_at,
        regions, server_ids, alert_count, severity,
        tracked_entity_type, tracked_entity_id,
        pattern_name
      ) VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING 
        id::text,
        correlation_id as "correlationId",
        correlation_type as "correlationType",
        confidence_score as "confidenceScore",
        started_at as "startedAt",
        ended_at as "endedAt",
        regions,
        server_ids as "serverIds",
        alert_count as "alertCount",
        severity`,
      [
        tenantId,
        correlationId,
        correlationType,
        75, // Initial confidence score
        alert.occurredAt,
        alert.occurredAt,
        [], // Will be populated as alerts are added
        [serverId],
        1,
        alert.severity,
        entityId ? entityType : null,
        entityId || null,
        alert.type
      ]
    );

    const correlation = result.rows[0];

    // Add the alert to correlation
    await this.addAlertToCorrelation(correlation.id, serverId, alert);

    // Get updated correlation with alerts
    const alerts = await this.getCorrelationAlerts(correlation.id);

    const fullCorrelation = {
      ...correlation,
      tenantId,
      serverIds: [serverId],
      regions: [],
      investigated: false,
      incidentCreated: false,
      alerts
    };

    this.emit('correlation:created', fullCorrelation);

    logger.info('New alert correlation created', {
      correlationId,
      correlationType,
      alertType: alert.type
    });

    return fullCorrelation;
  }

  /**
   * Add alert to existing correlation
   */
  private async addAlertToCorrelation(
    correlationId: string,
    serverId: string,
    alert: any
  ): Promise<void> {
    // Add alert member
    await this.pool.query(
      `INSERT INTO global_alert_correlation_members (
        correlation_id, server_id, local_alert_id,
        alert_type, occurred_at, branch_id, camera_id, entity_data
      ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6::uuid, $7::uuid, $8)
      ON CONFLICT (correlation_id, server_id, local_alert_id) DO NOTHING`,
      [
        correlationId,
        serverId,
        alert.id,
        alert.type,
        alert.occurredAt,
        alert.branchId,
        alert.cameraId,
        JSON.stringify(alert.entityData || {})
      ]
    );

    // Update correlation stats
    await this.pool.query(
      `UPDATE global_alert_correlations gac
       SET alert_count = (
         SELECT COUNT(*) FROM global_alert_correlation_members 
         WHERE correlation_id = gac.id
       ),
       server_ids = (
         SELECT array_agg(DISTINCT server_id::text)
         FROM global_alert_correlation_members
         WHERE correlation_id = gac.id
       ),
       ended_at = GREATEST(gac.ended_at, $2),
       updated_at = now()
       WHERE id = $1::uuid`,
      [correlationId, alert.occurredAt]
    );
  }

  /**
   * Get alerts for a correlation
   */
  private async getCorrelationAlerts(correlationId: string): Promise<CorrelatedAlert[]> {
    const result = await this.pool.query(
      `SELECT 
        server_id::text as "serverId",
        local_alert_id::text as "localAlertId",
        alert_type as "alertType",
        occurred_at as "occurredAt",
        branch_id::text as "branchId",
        camera_id::text as "cameraId",
        entity_data as "entityData"
       FROM global_alert_correlation_members
       WHERE correlation_id = $1::uuid
       ORDER BY occurred_at DESC`,
      [correlationId]
    );

    return result.rows;
  }
}

// Singleton instance
let globalAlertCorrelationService: GlobalAlertCorrelationService | null = null;

export function getGlobalAlertCorrelationService(pool: Pool): GlobalAlertCorrelationService {
  if (!globalAlertCorrelationService) {
    globalAlertCorrelationService = new GlobalAlertCorrelationService(pool);
  }
  return globalAlertCorrelationService;
}
