/**
 * Alert Correlation Orchestrator
 * Integrates local and global correlation engines for production use
 * 
 * Capabilities:
 * - Real-time alert correlation (temporal, spatial, entity-based)
 * - Automatic incident creation from correlated alerts
 * - Cross-server/multi-region correlation
 * - Pattern detection and escalation
 * - Alert deduplication and noise reduction
 */

import { EventEmitter } from 'events';
import { Pool } from 'pg';
import { AlertCorrelationEngine, Alert as LocalAlert } from '../../../analytics-engine/src/alert-correlation.js';
import { GlobalAlertCorrelationService, AlertCorrelation as GlobalCorrelation } from './global-alert-correlation.service.js';
import { logger } from '../utils/logger.js';

export interface CorrelationOrchestrationConfig {
  enableLocalCorrelation: boolean;
  enableGlobalCorrelation: boolean;
  autoCreateIncidents: boolean;
  incidentThresholdAlerts: number;
  incidentSeverityThreshold: 'medium' | 'high' | 'critical';
  notifyOnCorrelation: boolean;
}

export interface IncidentCreationRequest {
  correlationId: string;
  tenantId: string;
  title: string;
  description: string;
  severity: string;
  alertIds: string[];
  affectedBranches: string[];
  affectedCameras: string[];
  metadata?: Record<string, any>;
}

export class AlertCorrelationOrchestrator extends EventEmitter {
  private pool: Pool;
  private localEngine: AlertCorrelationEngine;
  private globalService: GlobalAlertCorrelationService;
  private config: CorrelationOrchestrationConfig;
  private isRunning = false;

  private readonly DEFAULT_CONFIG: CorrelationOrchestrationConfig = {
    enableLocalCorrelation: true,
    enableGlobalCorrelation: true,
    autoCreateIncidents: true,
    incidentThresholdAlerts: 5,
    incidentSeverityThreshold: 'high',
    notifyOnCorrelation: true,
  };

  constructor(
    pool: Pool,
    config: Partial<CorrelationOrchestrationConfig> = {}
  ) {
    super();
    this.pool = pool;
    this.config = { ...this.DEFAULT_CONFIG, ...config };
    
    // Initialize engines
    this.localEngine = new AlertCorrelationEngine({
      enableDeduplication: true,
      deduplicationWindowSeconds: 60,
      enableTemporalFiltering: true,
      minOccurrencesBeforeAlert: 2,
      autoResolveAfterSeconds: 300,
    });

    this.globalService = new GlobalAlertCorrelationService(pool);

    this.setupEventHandlers();
  }

  /**
   * Start correlation orchestrator
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Correlation orchestrator already running');
      return;
    }

    logger.info('Starting Alert Correlation Orchestrator');

    if (this.config.enableGlobalCorrelation) {
      await this.globalService.start();
    }

    this.isRunning = true;
    logger.info('Alert Correlation Orchestrator started');
  }

  /**
   * Stop correlation orchestrator
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    logger.info('Stopping Alert Correlation Orchestrator');

    if (this.config.enableGlobalCorrelation) {
      await this.globalService.stop();
    }

    this.isRunning = false;
    logger.info('Alert Correlation Orchestrator stopped');
  }

  /**
   * Process new alert and perform correlation
   */
  async processAlert(alert: {
    id: string;
    tenantId: string;
    branchId: string;
    cameraId: string;
    serverId?: string;
    detectionType: string;
    severity: string;
    confidence: number;
    occurredAt: Date;
    metadata?: Record<string, any>;
  }): Promise<{
    localCorrelations: LocalAlert[];
    globalCorrelation: GlobalCorrelation | null;
    incidentCreated: boolean;
    incidentId?: string;
  }> {
    let localCorrelations: LocalAlert[] = [];
    let globalCorrelation: GlobalCorrelation | null = null;
    let incidentCreated = false;
    let incidentId: string | undefined;

    try {
      // 1. Local correlation (same server, deduplication, temporal)
      if (this.config.enableLocalCorrelation) {
        localCorrelations = await this.localEngine.processDetection(
          {
            detectionType: alert.detectionType,
            confidence: alert.confidence,
            requiresAlert: true,
            metadata: alert.metadata,
          },
          alert.cameraId,
          alert.tenantId,
          alert.occurredAt
        );

        logger.debug('Local correlation processed', {
          alertId: alert.id,
          correlatedAlerts: localCorrelations.length,
        });
      }

      // 2. Global correlation (cross-server, multi-region)
      if (this.config.enableGlobalCorrelation && alert.serverId) {
        globalCorrelation = await this.globalService.correlateAlert(
          alert.tenantId,
          alert.serverId,
          {
            id: alert.id,
            type: alert.detectionType,
            occurredAt: alert.occurredAt,
            branchId: alert.branchId,
            cameraId: alert.cameraId,
            severity: alert.severity,
            entityData: alert.metadata,
          }
        );

        if (globalCorrelation) {
          logger.info('Global correlation found', {
            correlationId: globalCorrelation.correlationId,
            alertCount: globalCorrelation.alertCount,
            correlationType: globalCorrelation.correlationType,
          });
        }
      }

      // 3. Check if incident should be created
      if (this.config.autoCreateIncidents) {
        const shouldCreate = this.shouldCreateIncident(
          globalCorrelation,
          localCorrelations
        );

        if (shouldCreate && globalCorrelation && !globalCorrelation.incidentCreated) {
          incidentId = await this.createIncidentFromCorrelation(globalCorrelation);
          incidentCreated = true;

          // Mark correlation as having incident
          await this.globalService.markAsInvestigated(
            globalCorrelation.id,
            'Auto-created incident from correlation',
            true
          );

          logger.info('Incident created from correlation', {
            incidentId,
            correlationId: globalCorrelation.correlationId,
          });
        }
      }

      // 4. Emit events
      if (localCorrelations.length > 0) {
        this.emit('local:correlation', { alert, localCorrelations });
      }

      if (globalCorrelation) {
        this.emit('global:correlation', { alert, globalCorrelation });
      }

      if (incidentCreated) {
        this.emit('incident:created', { incidentId, correlation: globalCorrelation });
      }

      return {
        localCorrelations,
        globalCorrelation,
        incidentCreated,
        incidentId,
      };

    } catch (error) {
      logger.error('Alert correlation failed', {
        alertId: alert.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        localCorrelations: [],
        globalCorrelation: null,
        incidentCreated: false,
      };
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
  ): Promise<GlobalCorrelation[]> {
    if (!this.config.enableGlobalCorrelation) {
      return [];
    }

    return await this.globalService.getActiveCorrelations(tenantId, filters);
  }

  /**
   * Get local alert statistics
   */
  getLocalStats() {
    return this.localEngine.getStats();
  }

  /**
   * Acknowledge correlation
   */
  async acknowledgeCorrelation(
    correlationId: string,
    acknowledgedBy: string,
    notes?: string
  ): Promise<void> {
    await this.globalService.markAsInvestigated(correlationId, notes);

    this.emit('correlation:acknowledged', {
      correlationId,
      acknowledgedBy,
      notes,
    });
  }

  /**
   * Create incident from correlation
   */
  async createIncidentFromCorrelation(
    correlation: GlobalCorrelation
  ): Promise<string> {
    // Extract alert details
    const affectedBranches = Array.from(
      new Set(correlation.alerts.map(a => a.branchId))
    );
    const affectedCameras = Array.from(
      new Set(correlation.alerts.map(a => a.cameraId))
    );
    const alertIds = correlation.alerts.map(a => a.localAlertId);

    // Generate incident title and description
    const title = this.generateIncidentTitle(correlation);
    const description = this.generateIncidentDescription(correlation);

    // Create incident
    const result = await this.pool.query(
      `INSERT INTO incidents (
        tenant_id,
        title,
        description,
        severity,
        status,
        correlation_id,
        alert_count,
        affected_branches,
        affected_cameras,
        created_by,
        metadata
      ) VALUES ($1::uuid, $2, $3, $4, $5, $6::uuid, $7, $8, $9, $10, $11)
      RETURNING id::text`,
      [
        correlation.tenantId,
        title,
        description,
        correlation.severity,
        'open',
        correlation.id,
        correlation.alertCount,
        affectedBranches,
        affectedCameras,
        'system',
        JSON.stringify({
          correlationType: correlation.correlationType,
          confidenceScore: correlation.confidenceScore,
          regions: correlation.regions,
          autoCreated: true,
          createdAt: new Date().toISOString(),
        }),
      ]
    );

    const incidentId = result.rows[0].id;

    // Link alerts to incident
    for (const alertId of alertIds) {
      await this.pool.query(
        `INSERT INTO incident_alerts (incident_id, alert_id)
         VALUES ($1::uuid, $2::uuid)
         ON CONFLICT DO NOTHING`,
        [incidentId, alertId]
      );
    }

    logger.info('Incident created from correlation', {
      incidentId,
      correlationId: correlation.correlationId,
      alertCount: correlation.alertCount,
      title,
    });

    return incidentId;
  }

  /**
   * Determine if incident should be created
   */
  private shouldCreateIncident(
    globalCorrelation: GlobalCorrelation | null,
    localCorrelations: LocalAlert[]
  ): boolean {
    if (!globalCorrelation) {
      return false;
    }

    // Check alert count threshold
    if (globalCorrelation.alertCount < this.config.incidentThresholdAlerts) {
      return false;
    }

    // Check severity threshold
    const severityLevels = ['info', 'low', 'medium', 'high', 'critical'];
    const thresholdIndex = severityLevels.indexOf(this.config.incidentSeverityThreshold);
    const correlationIndex = severityLevels.indexOf(globalCorrelation.severity);

    if (correlationIndex < thresholdIndex) {
      return false;
    }

    // Check if incident already exists
    if (globalCorrelation.incidentCreated) {
      return false;
    }

    return true;
  }

  /**
   * Generate incident title from correlation
   */
  private generateIncidentTitle(correlation: GlobalCorrelation): string {
    const alertCount = correlation.alertCount;
    const correlationType = correlation.correlationType;

    if (correlationType === 'temporal') {
      return `Multiple incidents detected: ${alertCount} alerts in ${correlation.regions.length || 1} location(s)`;
    }

    if (correlationType === 'entity') {
      const entityType = correlation.trackedEntityType || 'entity';
      return `${entityType} tracked across multiple locations: ${alertCount} sightings`;
    }

    if (correlationType === 'pattern') {
      return `Pattern detected: ${correlation.patternName} (${alertCount} occurrences)`;
    }

    return `Correlated incident: ${alertCount} related alerts`;
  }

  /**
   * Generate incident description from correlation
   */
  private generateIncidentDescription(correlation: GlobalCorrelation): string {
    const { correlationType, alertCount, regions, serverIds } = correlation;
    
    let description = `Automatically created from ${correlationType} correlation.\n\n`;
    description += `**Summary:**\n`;
    description += `- ${alertCount} related alerts detected\n`;
    description += `- ${serverIds.length} server(s) affected\n`;
    
    if (regions.length > 0) {
      description += `- Regions: ${regions.join(', ')}\n`;
    }

    if (correlation.trackedEntityType && correlation.trackedEntityId) {
      description += `- Tracking ${correlation.trackedEntityType}: ${correlation.trackedEntityId}\n`;
    }

    description += `\n**Confidence Score:** ${Math.round(correlation.confidenceScore)}%\n`;
    description += `**Time Window:** ${correlation.startedAt.toISOString()} - ${correlation.endedAt.toISOString()}\n`;

    return description;
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers(): void {
    // Listen to global correlation events
    this.globalService.on('correlation:created', (correlation) => {
      logger.info('New global correlation created', {
        correlationId: correlation.correlationId,
        alertCount: correlation.alertCount,
      });

      if (this.config.notifyOnCorrelation) {
        this.emit('notification:required', {
          type: 'correlation_created',
          correlation,
        });
      }
    });

    this.globalService.on('correlation:updated', (correlation) => {
      logger.debug('Global correlation updated', {
        correlationId: correlation.correlationId,
        alertCount: correlation.alertCount,
      });
    });
  }

  /**
   * Get correlation by ID
   */
  async getCorrelation(correlationId: string): Promise<GlobalCorrelation | null> {
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
        pattern_name as "patternName",
        pattern_confidence as "patternConfidence",
        investigated,
        investigation_notes as "investigationNotes",
        incident_created as "incidentCreated",
        incident_id::text as "incidentId"
       FROM global_alert_correlations
       WHERE id = $1::uuid`,
      [correlationId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    
    // Get alerts
    const alertsResult = await this.pool.query(
      `SELECT 
        server_id::text as "serverId",
        local_alert_id::text as "localAlertId",
        alert_type as "alertType",
        occurred_at as "occurredAt",
        branch_id::text as "branchId",
        camera_id::text as "cameraId"
       FROM global_alert_correlation_members
       WHERE correlation_id = $1::uuid`,
      [correlationId]
    );

    return {
      ...row,
      serverIds: row.serverIds || [],
      regions: row.regions || [],
      alerts: alertsResult.rows,
    };
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    localEngine: boolean;
    globalService: boolean;
    isRunning: boolean;
  }> {
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    const localEngineHealthy = this.config.enableLocalCorrelation;
    const globalServiceHealthy = this.config.enableGlobalCorrelation && this.isRunning;

    if (!localEngineHealthy && !globalServiceHealthy) {
      status = 'unhealthy';
    } else if (!localEngineHealthy || !globalServiceHealthy) {
      status = 'degraded';
    }

    return {
      status,
      localEngine: localEngineHealthy,
      globalService: globalServiceHealthy,
      isRunning: this.isRunning,
    };
  }
}

// Singleton instance
let orchestratorInstance: AlertCorrelationOrchestrator | null = null;

export function getAlertCorrelationOrchestrator(
  pool: Pool,
  config?: Partial<CorrelationOrchestrationConfig>
): AlertCorrelationOrchestrator {
  if (!orchestratorInstance) {
    orchestratorInstance = new AlertCorrelationOrchestrator(pool, config);
  }
  return orchestratorInstance;
}

export function resetAlertCorrelationOrchestrator(): void {
  if (orchestratorInstance) {
    void orchestratorInstance.stop();
  }
  orchestratorInstance = null;
}
