/**
 * Evidence Persistence Layer
 * 
 * Stores security evidence snapshots for:
 * - Audit trails
 * - Historical analysis
 * - Incident investigation
 * - Compliance reporting
 */

import type { SecurityEvidence } from './security-evidence-types.js';

/**
 * Evidence record for persistence
 */
export interface SecurityEvidenceRecord {
  id: string;
  tenantId: string;
  branchId?: string;
  deviceId?: string;
  controlType: string;
  
  // Evidence state
  state: 'HEALTHY' | 'UNHEALTHY' | 'UNKNOWN';
  available: boolean;
  source: 'LIVE' | 'SIMULATED' | 'UNAVAILABLE';
  confidence: number;
  reason: string;
  
  // Timestamps
  observedAt: Date | null;
  receivedAt: Date;
  
  // Evidence data (JSON)
  evidenceJson: string | null;
  
  // Collector metadata
  collectorId: string;
  collectorVersion: string;
  
  // Correlation
  correlationId?: string;
}

/**
 * State transition record
 */
export interface SecurityStateTransition {
  id: string;
  tenantId: string;
  deviceId?: string;
  controlType: string;
  
  previousState: 'HEALTHY' | 'UNHEALTHY' | 'UNKNOWN';
  newState: 'HEALTHY' | 'UNHEALTHY' | 'UNKNOWN';
  previousReason?: string;
  newReason: string;
  
  transitionedAt: Date;
  evidenceId: string;
  
  // Classification
  transitionType: 
    | 'improvement'      // UNKNOWN/UNHEALTHY → HEALTHY
    | 'degradation'      // HEALTHY → UNHEALTHY
    | 'telemetry_loss'   // HEALTHY → UNKNOWN
    | 'telemetry_recovery' // UNKNOWN → HEALTHY
    | 'investigation';   // UNKNOWN → UNHEALTHY
}

/**
 * Evidence persistence service
 */
export class EvidencePersistenceService {
  private readonly db: any; // Database connection
  private readonly logger: any;
  
  constructor(database: any, logger?: any) {
    this.db = database;
    this.logger = logger || console;
  }

  /**
   * Store evidence snapshot
   */
  async storeEvidence(
    tenantId: string,
    controlType: string,
    evidence: SecurityEvidence,
    collectorId: string,
    collectorVersion: string,
    context?: {
      branchId?: string;
      deviceId?: string;
      correlationId?: string;
    },
  ): Promise<string> {
    const record: SecurityEvidenceRecord = {
      id: this.generateId(),
      tenantId,
      branchId: context?.branchId,
      deviceId: context?.deviceId,
      controlType,
      
      state: evidence.state,
      available: evidence.available,
      source: evidence.source,
      confidence: evidence.confidence,
      reason: evidence.reason,
      
      observedAt: evidence.observedAt,
      receivedAt: new Date(),
      
      evidenceJson: evidence.state !== 'UNKNOWN' 
        ? JSON.stringify(evidence.evidence)
        : null,
      
      collectorId,
      collectorVersion,
      correlationId: context?.correlationId,
    };

    await this.db.insertInto('security_control_evidence')
      .values(record)
      .execute();

    // Check for state transition
    await this.detectAndRecordTransition(
      tenantId,
      controlType,
      evidence,
      record.id,
      context?.deviceId,
    );

    return record.id;
  }

  /**
   * Detect and record state transitions
   */
  private async detectAndRecordTransition(
    tenantId: string,
    controlType: string,
    newEvidence: SecurityEvidence,
    evidenceId: string,
    deviceId?: string,
  ): Promise<void> {
    // Get most recent previous evidence
    const previous = await this.db
      .selectFrom('security_control_evidence')
      .where('tenantId', '=', tenantId)
      .where('controlType', '=', controlType)
      .where('deviceId', deviceId ? '=' : 'is', deviceId || null)
      .where('id', '!=', evidenceId)
      .orderBy('receivedAt', 'desc')
      .select(['state', 'reason'])
      .executeTakeFirst();

    if (!previous || previous.state === newEvidence.state) {
      return; // No transition
    }

    const transitionType = this.classifyTransition(
      previous.state,
      newEvidence.state,
    );

    const transition: SecurityStateTransition = {
      id: this.generateId(),
      tenantId,
      deviceId,
      controlType,
      previousState: previous.state,
      newState: newEvidence.state,
      previousReason: previous.reason,
      newReason: newEvidence.reason,
      transitionedAt: new Date(),
      evidenceId,
      transitionType,
    };

    await this.db.insertInto('security_control_transition')
      .values(transition)
      .execute();

    this.logger.info({
      transition: transitionType,
      control: controlType,
      from: previous.state,
      to: newEvidence.state,
      reason: newEvidence.reason,
    }, 'Security state transition detected');
  }

  /**
   * Classify transition type
   */
  private classifyTransition(
    previousState: string,
    newState: string,
  ): SecurityStateTransition['transitionType'] {
    if (newState === 'HEALTHY') {
      return previousState === 'UNKNOWN' ? 'telemetry_recovery' : 'improvement';
    }
    
    if (newState === 'UNHEALTHY') {
      return previousState === 'UNKNOWN' ? 'investigation' : 'degradation';
    }
    
    // newState === 'UNKNOWN'
    return 'telemetry_loss';
  }

  /**
   * Get evidence history for a control
   */
  async getEvidenceHistory(
    tenantId: string,
    controlType: string,
    options: {
      deviceId?: string;
      limit?: number;
      since?: Date;
    } = {},
  ): Promise<SecurityEvidenceRecord[]> {
    let query = this.db
      .selectFrom('security_control_evidence')
      .where('tenantId', '=', tenantId)
      .where('controlType', '=', controlType)
      .orderBy('receivedAt', 'desc');

    if (options.deviceId) {
      query = query.where('deviceId', '=', options.deviceId);
    }

    if (options.since) {
      query = query.where('receivedAt', '>=', options.since);
    }

    if (options.limit) {
      query = query.limit(options.limit);
    }

    return await query.selectAll().execute();
  }

  /**
   * Get state transitions
   */
  async getStateTransitions(
    tenantId: string,
    options: {
      controlType?: string;
      deviceId?: string;
      transitionType?: SecurityStateTransition['transitionType'];
      since?: Date;
      limit?: number;
    } = {},
  ): Promise<SecurityStateTransition[]> {
    let query = this.db
      .selectFrom('security_control_transition')
      .where('tenantId', '=', tenantId)
      .orderBy('transitionedAt', 'desc');

    if (options.controlType) {
      query = query.where('controlType', '=', options.controlType);
    }

    if (options.deviceId) {
      query = query.where('deviceId', '=', options.deviceId);
    }

    if (options.transitionType) {
      query = query.where('transitionType', '=', options.transitionType);
    }

    if (options.since) {
      query = query.where('transitionedAt', '>=', options.since);
    }

    if (options.limit) {
      query = query.limit(options.limit);
    }

    return await query.selectAll().execute();
  }

  /**
   * Get current evidence state for all controls
   */
  async getCurrentState(
    tenantId: string,
    deviceId?: string,
  ): Promise<Map<string, SecurityEvidenceRecord>> {
    const records = await this.db
      .selectFrom('security_control_evidence as e1')
      .where('e1.tenantId', '=', tenantId)
      .where('e1.deviceId', deviceId ? '=' : 'is', deviceId || null)
      .where('e1.receivedAt', '=', (qb: any) =>
        qb.selectFrom('security_control_evidence as e2')
          .where('e2.tenantId', '=', tenantId)
          .where('e2.controlType', '=', qb.ref('e1.controlType'))
          .where('e2.deviceId', deviceId ? '=' : 'is', deviceId || null)
          .select(qb.fn.max('e2.receivedAt').as('maxReceived'))
      )
      .selectAll()
      .execute();

    const stateMap = new Map<string, SecurityEvidenceRecord>();
    for (const record of records) {
      stateMap.set(record.controlType, record);
    }

    return stateMap;
  }

  /**
   * Calculate evidence coverage over time
   */
  async getEvidenceCoverageHistory(
    tenantId: string,
    controlTypes: string[],
    since: Date,
    deviceId?: string,
  ): Promise<Array<{ timestamp: Date; coverage: number }>> {
    // This would be implemented with time-series aggregation
    // For now, return placeholder
    return [];
  }

  private generateId(): string {
    return `evi_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  }
}

/**
 * SQL schema for evidence persistence
 * 
 * This should be created as a migration:
 */
export const EVIDENCE_SCHEMA_SQL = `
-- Security control evidence table
CREATE TABLE IF NOT EXISTS security_control_evidence (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  branch_id TEXT,
  device_id TEXT,
  control_type TEXT NOT NULL,
  
  -- Evidence state
  state TEXT NOT NULL CHECK (state IN ('HEALTHY', 'UNHEALTHY', 'UNKNOWN')),
  available BOOLEAN NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('LIVE', 'SIMULATED', 'UNAVAILABLE')),
  confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  reason TEXT NOT NULL,
  
  -- Timestamps
  observed_at TIMESTAMP,
  received_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  -- Evidence payload
  evidence_json TEXT,
  
  -- Collector metadata
  collector_id TEXT NOT NULL,
  collector_version TEXT NOT NULL,
  
  -- Correlation
  correlation_id TEXT,
  
  -- Indexes for common queries
  INDEX idx_evidence_tenant_control (tenant_id, control_type, received_at DESC),
  INDEX idx_evidence_device (tenant_id, device_id, control_type, received_at DESC),
  INDEX idx_evidence_state (tenant_id, state, received_at DESC),
  INDEX idx_evidence_source (tenant_id, source, received_at DESC)
);

-- Security state transitions table
CREATE TABLE IF NOT EXISTS security_control_transition (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  device_id TEXT,
  control_type TEXT NOT NULL,
  
  -- Transition details
  previous_state TEXT NOT NULL CHECK (previous_state IN ('HEALTHY', 'UNHEALTHY', 'UNKNOWN')),
  new_state TEXT NOT NULL CHECK (new_state IN ('HEALTHY', 'UNHEALTHY', 'UNKNOWN')),
  previous_reason TEXT,
  new_reason TEXT NOT NULL,
  
  transitioned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  evidence_id TEXT NOT NULL,
  
  -- Classification
  transition_type TEXT NOT NULL CHECK (transition_type IN (
    'improvement',
    'degradation',
    'telemetry_loss',
    'telemetry_recovery',
    'investigation'
  )),
  
  -- Indexes
  INDEX idx_transition_tenant (tenant_id, transitioned_at DESC),
  INDEX idx_transition_control (tenant_id, control_type, transitioned_at DESC),
  INDEX idx_transition_type (tenant_id, transition_type, transitioned_at DESC),
  
  FOREIGN KEY (evidence_id) REFERENCES security_control_evidence(id)
);
`;
