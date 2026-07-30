/**
 * Prediction-RCA Integration Service
 * 
 * Creates feedback loop between failure predictions and root cause analysis:
 * 1. When a predicted failure actually occurs, automatically trigger RCA
 * 2. Compare RCA findings with prediction evidence
 * 3. Mark predictions as correct/incorrect based on RCA confirmation
 * 4. Feed outcomes back to prediction engine for continuous improvement
 * 5. Adjust prediction rules based on false positives and false negatives
 * 
 * This service learns from real failures to improve future predictions.
 */

import { Pool } from 'pg';
import { analyze as runRca, type CommandRcaResult } from '../../../src/services/command-center/rca.js';
import type { OperationalGraph, CommandTimelineEvent } from '../../../src/services/command-center/types.js';

// ============================================
// Types
// ============================================

interface PredictionOutcome {
  predictionId: string;
  outcomeType: 'true_positive' | 'false_positive' | 'false_negative' | 'prevented';
  actualFailureTimestamp?: Date;
  withinPredictedWindow: boolean;
  rcaCaseId?: string;
  rcaRootCause?: string;
  rcaConfidence?: number;
  predictionLeadTimeHours?: number;
  notes?: string;
}

interface PredictionRcaComparison {
  predictionCorrect: boolean;
  evidenceMatches: Array<{
    predictionEvidence: string;
    rcaEvidence: string;
    match: boolean;
    confidence: number;
  }>;
  rootCauseAlignment: number; // 0-1 score
  explanation: string;
}

interface FailureEvent {
  deviceId: string;
  deviceType: string;
  branchNodeId: string;
  failureType: string;
  failureTimestamp: Date;
  severity: string;
  metadata: Record<string, any>;
}

// ============================================
// Prediction-RCA Integration Service
// ============================================

export class PredictionRcaIntegrationService {
  constructor(private pool: Pool) {}

  /**
   * Handle a device failure event - trigger RCA and compare with predictions
   */
  async handleDeviceFailure(failure: FailureEvent): Promise<void> {
    // 1. Find active predictions for this device
    const predictions = await this.findActivePredictionsForDevice(
      failure.deviceId,
      failure.branchNodeId,
      failure.failureType
    );

    if (predictions.length === 0) {
      // No prediction existed - log as false negative if this was predictable
      await this.logFalseNegative(failure);
      return;
    }

    // 2. Trigger RCA for this failure
    const rcaResult = await this.triggerRcaForFailure(failure);

    // 3. Compare each prediction with RCA findings
    for (const prediction of predictions) {
      const comparison = await this.comparePredictionWithRca(
        prediction,
        rcaResult,
        failure.failureTimestamp
      );

      // 4. Record outcome
      const outcome = await this.recordPredictionOutcome(
        prediction.id,
        failure,
        rcaResult,
        comparison
      );

      // 5. If prediction was incorrect, analyze why
      if (!comparison.predictionCorrect) {
        await this.analyzeMisprediction(prediction, rcaResult, comparison);
      }
    }

    // 6. Update prediction model performance metrics
    await this.updateModelMetrics(failure.failureType);
  }

  /**
   * Handle maintenance intervention - mark prediction as "prevented"
   */
  async handleMaintenanceIntervention(
    predictionId: string,
    interventionTimestamp: Date,
    actionTaken: string
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Get prediction details
      const predResult = await client.query(
        `SELECT * FROM failure_predictions WHERE id = $1`,
        [predictionId]
      );

      if (predResult.rows.length === 0) {
        throw new Error('Prediction not found');
      }

      const prediction = predResult.rows[0];

      // Check if failure occurred despite maintenance
      const failureOccurred = await this.checkForFailureAfterMaintenance(
        prediction.device_id,
        prediction.branch_node_id,
        interventionTimestamp
      );

      let outcomeType: string;
      let notes: string;

      if (failureOccurred) {
        outcomeType = 'false_positive';
        notes = `Maintenance performed (${actionTaken}) but failure still occurred. Prediction may have been incorrect or maintenance was insufficient.`;
      } else {
        outcomeType = 'prevented';
        notes = `Maintenance performed successfully (${actionTaken}). Failure prevented within prediction window.`;
      }

      // Record outcome
      await client.query(
        `INSERT INTO prediction_outcomes (
          prediction_id,
          tenant_id,
          outcome_type,
          within_predicted_window,
          prediction_lead_time_hours,
          notes,
          verified_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [
          predictionId,
          prediction.tenant_id,
          outcomeType,
          true,
          this.calculateLeadTime(prediction.predicted_at, interventionTimestamp),
          notes
        ]
      );

      // Update prediction status
      await client.query(
        `UPDATE failure_predictions
        SET status = $1, updated_at = NOW()
        WHERE id = $2`,
        [outcomeType === 'prevented' ? 'resolved' : 'closed', predictionId]
      );

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Find active predictions for a device failure
   */
  private async findActivePredictionsForDevice(
    deviceId: string,
    branchNodeId: string,
    failureType: string
  ): Promise<any[]> {
    const predictionTypeMap: Record<string, string> = {
      recorder_failure: 'recorder_failure',
      disk_failure: 'disk_failure',
      network_failure: 'network_failure',
      camera_failure: 'camera_failure',
      ups_failure: 'ups_failure',
      storage_full: 'storage_retention_failure'
    };

    const predictionType = predictionTypeMap[failureType] || failureType;

    const result = await this.pool.query(
      `SELECT fp.*, 
        (SELECT json_agg(pe) FROM prediction_evidence pe WHERE pe.prediction_id = fp.id) as evidence
      FROM failure_predictions fp
      WHERE fp.device_id = $1
        AND fp.branch_node_id = $2
        AND fp.prediction_type = $3
        AND fp.status = 'active'
        AND fp.expected_failure_to >= NOW() - INTERVAL '7 days'
      ORDER BY fp.predicted_at DESC`,
      [deviceId, branchNodeId, predictionType]
    );

    return result.rows;
  }

  /**
   * Trigger RCA for a device failure
   */
  private async triggerRcaForFailure(failure: FailureEvent): Promise<CommandRcaResult> {
    // Build operational graph for the branch
    const graph = await this.buildOperationalGraph(failure.branchNodeId);
    
    // Build timeline of events leading to failure
    const timeline = await this.buildFailureTimeline(
      failure.branchNodeId,
      failure.deviceId,
      failure.failureTimestamp
    );

    // Run RCA
    const rcaResult = runRca(graph, timeline);

    // Store RCA result
    await this.storeRcaResult(failure, rcaResult);

    return rcaResult;
  }

  /**
   * Compare prediction evidence with RCA findings
   */
  private async comparePredictionWithRca(
    prediction: any,
    rcaResult: CommandRcaResult,
    actualFailureTime: Date
  ): Promise<PredictionRcaComparison> {
    const predictionEvidence = prediction.evidence || [];
    const rcaEvidence = rcaResult.evidence || [];

    const evidenceMatches: PredictionRcaComparison['evidenceMatches'] = [];

    // Compare each prediction evidence with RCA evidence
    for (const predEv of predictionEvidence) {
      let bestMatch = { evidence: null, score: 0 };

      for (const rcaEv of rcaEvidence) {
        const score = this.calculateEvidenceSimilarity(predEv, rcaEv);
        if (score > bestMatch.score) {
          bestMatch = { evidence: rcaEv, score };
        }
      }

      evidenceMatches.push({
        predictionEvidence: predEv.evidence_description || predEv.evidence_type,
        rcaEvidence: bestMatch.evidence ? bestMatch.evidence.assertion : 'No match',
        match: bestMatch.score > 0.6,
        confidence: bestMatch.score
      });
    }

    // Calculate overall alignment
    const matchCount = evidenceMatches.filter(m => m.match).length;
    const totalEvidence = Math.max(predictionEvidence.length, rcaEvidence.length);
    const rootCauseAlignment = totalEvidence > 0 ? matchCount / totalEvidence : 0;

    // Check if failure occurred within predicted window
    const withinWindow = actualFailureTime >= new Date(prediction.expected_failure_from) &&
                        actualFailureTime <= new Date(prediction.expected_failure_to);

    const predictionCorrect = withinWindow && rootCauseAlignment > 0.5;

    let explanation: string;
    if (predictionCorrect) {
      explanation = `Prediction accurate: ${matchCount}/${predictionEvidence.length} evidence items matched RCA findings (${(rootCauseAlignment * 100).toFixed(0)}% alignment). Failure occurred within predicted window.`;
    } else if (!withinWindow) {
      explanation = `Prediction timing incorrect: Failure occurred outside predicted window. Expected: ${prediction.expected_failure_from} to ${prediction.expected_failure_to}, Actual: ${actualFailureTime}.`;
    } else {
      explanation = `Prediction evidence mismatch: Only ${matchCount}/${predictionEvidence.length} evidence items aligned with RCA findings (${(rootCauseAlignment * 100).toFixed(0)}% alignment).`;
    }

    return {
      predictionCorrect,
      evidenceMatches,
      rootCauseAlignment,
      explanation
    };
  }

  /**
   * Record prediction outcome
   */
  private async recordPredictionOutcome(
    predictionId: string,
    failure: FailureEvent,
    rcaResult: CommandRcaResult,
    comparison: PredictionRcaComparison
  ): Promise<void> {
    const prediction = await this.pool.query(
      `SELECT * FROM failure_predictions WHERE id = $1`,
      [predictionId]
    );

    if (prediction.rows.length === 0) return;

    const pred = prediction.rows[0];
    const leadTimeHours = this.calculateLeadTime(pred.predicted_at, failure.failureTimestamp);

    await this.pool.query(
      `INSERT INTO prediction_outcomes (
        prediction_id,
        tenant_id,
        outcome_type,
        actual_failure_timestamp,
        within_predicted_window,
        rca_case_id,
        rca_root_cause,
        rca_confidence,
        prediction_lead_time_hours,
        evidence_alignment_score,
        notes,
        verified_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())`,
      [
        predictionId,
        pred.tenant_id,
        comparison.predictionCorrect ? 'true_positive' : 'false_positive',
        failure.failureTimestamp,
        comparison.predictionCorrect,
        rcaResult.caseFingerprint,
        rcaResult.rootCause.code,
        rcaResult.rootCause.confidence,
        leadTimeHours,
        comparison.rootCauseAlignment,
        comparison.explanation
      ]
    );

    // Update prediction status
    await this.pool.query(
      `UPDATE failure_predictions
      SET status = 'closed', updated_at = NOW()
      WHERE id = $1`,
      [predictionId]
    );
  }

  /**
   * Analyze why a prediction was incorrect
   */
  private async analyzeMisprediction(
    prediction: any,
    rcaResult: CommandRcaResult,
    comparison: PredictionRcaComparison
  ): Promise<void> {
    const analysis = {
      predictionId: prediction.id,
      predictionType: prediction.prediction_type,
      predictedProbability: prediction.probability,
      predictionEvidence: prediction.evidence,
      rcaRootCause: rcaResult.rootCause,
      rcaEvidence: rcaResult.evidence,
      alignmentScore: comparison.rootCauseAlignment,
      mismatchedEvidence: comparison.evidenceMatches.filter(m => !m.match),
      recommendation: this.generateRuleAdjustmentRecommendation(prediction, rcaResult, comparison)
    };

    // Log misprediction for review
    await this.pool.query(
      `INSERT INTO prediction_misprediction_log (
        prediction_id,
        tenant_id,
        prediction_type,
        analysis,
        created_at
      ) VALUES ($1, $2, $3, $4, NOW())`,
      [prediction.id, prediction.tenant_id, prediction.prediction_type, JSON.stringify(analysis)]
    );
  }

  /**
   * Generate recommendation for adjusting prediction rules
   */
  private generateRuleAdjustmentRecommendation(
    prediction: any,
    rcaResult: CommandRcaResult,
    comparison: PredictionRcaComparison
  ): string {
    const mismatchCount = comparison.evidenceMatches.filter(m => !m.match).length;
    
    if (mismatchCount > 2) {
      return `HIGH PRIORITY: Multiple evidence mismatches detected. Review and update ${prediction.prediction_type} prediction rules to incorporate RCA findings: ${rcaResult.rootCause.explanation}`;
    }

    if (comparison.rootCauseAlignment < 0.3) {
      return `MEDIUM PRIORITY: Low alignment with RCA findings. Consider adding detection for: ${rcaResult.rootCause.label}`;
    }

    return `LOW PRIORITY: Minor evidence mismatch. Monitor for patterns.`;
  }

  /**
   * Log false negative (failure that was not predicted)
   */
  private async logFalseNegative(failure: FailureEvent): Promise<void> {
    await this.pool.query(
      `INSERT INTO device_failure_events (
        tenant_id,
        device_id,
        device_type,
        branch_node_id,
        failure_type,
        failure_timestamp,
        severity,
        was_predicted,
        metadata
      ) VALUES (
        (SELECT tenant_id FROM resource_nodes WHERE id = $1),
        $2, $3, $1, $4, $5, $6, false, $7
      )`,
      [
        failure.branchNodeId,
        failure.deviceId,
        failure.deviceType,
        failure.failureType,
        failure.failureTimestamp,
        failure.severity,
        JSON.stringify(failure.metadata)
      ]
    );
  }

  /**
   * Build operational graph for RCA
   */
  private async buildOperationalGraph(branchNodeId: string): Promise<OperationalGraph> {
    // This is a simplified implementation - adapt to your actual schema
    const branch = await this.pool.query(
      `SELECT id, name FROM resource_nodes WHERE id = $1`,
      [branchNodeId]
    );

    const entities = await this.pool.query(
      `SELECT 
        CONCAT(device_type, ':', device_id) as id,
        device_type as type,
        device_id as name,
        CASE 
          WHEN last_seen_at < NOW() - INTERVAL '5 minutes' THEN 'offline'
          ELSE 'online'
        END as status
      FROM devices
      WHERE branch_node_id = $1`,
      [branchNodeId]
    );

    return {
      branch: {
        id: branch.rows[0].id,
        name: branch.rows[0].name
      },
      entities: entities.rows,
      dependencies: [], // Populate from your schema
      summary: {
        totalCameras: 0,
        totalRecorders: 0,
        totalDevices: entities.rows.length
      }
    };
  }

  /**
   * Build failure timeline for RCA
   */
  private async buildFailureTimeline(
    branchNodeId: string,
    deviceId: string,
    failureTime: Date
  ): Promise<CommandTimelineEvent[]> {
    // Build timeline from telemetry events
    const events = await this.pool.query(
      `SELECT * FROM device_health_snapshots
      WHERE branch_node_id = $1
        AND snapshot_timestamp >= $2 - INTERVAL '1 hour'
        AND snapshot_timestamp <= $2
      ORDER BY snapshot_timestamp ASC`,
      [branchNodeId, failureTime]
    );

    return events.rows.map(event => ({
      evidenceId: `event-${event.id}`,
      occurredAt: event.snapshot_timestamp.toISOString(),
      entityType: event.device_type,
      entityId: event.device_id,
      category: 'telemetry',
      severity: event.health_score < 50 ? 'high' : 'medium',
      title: `${event.device_type} health degraded`,
      detail: `Health score: ${event.health_score}`,
      source: 'telemetry:system',
      raw: event.telemetry_snapshot || {}
    }));
  }

  /**
   * Store RCA result
   */
  private async storeRcaResult(failure: FailureEvent, rcaResult: CommandRcaResult): Promise<void> {
    await this.pool.query(
      `INSERT INTO rca_cases (
        tenant_id,
        case_fingerprint,
        branch_node_id,
        device_id,
        failure_type,
        root_cause_code,
        root_cause_label,
        confidence,
        evidence,
        created_at
      ) VALUES (
        (SELECT tenant_id FROM resource_nodes WHERE id = $1),
        $2, $1, $3, $4, $5, $6, $7, $8, NOW()
      )`,
      [
        failure.branchNodeId,
        rcaResult.caseFingerprint,
        failure.deviceId,
        failure.failureType,
        rcaResult.rootCause.code,
        rcaResult.rootCause.label,
        rcaResult.rootCause.confidence,
        JSON.stringify(rcaResult.evidence)
      ]
    );
  }

  /**
   * Calculate evidence similarity score
   */
  private calculateEvidenceSimilarity(predictionEvidence: any, rcaEvidence: any): number {
    const predText = (predictionEvidence.evidence_description || '').toLowerCase();
    const rcaText = (rcaEvidence.assertion || '').toLowerCase();

    // Simple keyword-based similarity
    const predKeywords = predText.split(/\s+/).filter(w => w.length > 3);
    const rcaKeywords = rcaText.split(/\s+/).filter(w => w.length > 3);

    const matches = predKeywords.filter(kw => rcaKeywords.some(rw => rw.includes(kw) || kw.includes(rw)));
    const similarity = matches.length / Math.max(predKeywords.length, rcaKeywords.length, 1);

    return similarity;
  }

  /**
   * Calculate lead time in hours
   */
  private calculateLeadTime(predictedAt: Date, failureAt: Date): number {
    return (failureAt.getTime() - predictedAt.getTime()) / (1000 * 60 * 60);
  }

  /**
   * Check if failure occurred after maintenance
   */
  private async checkForFailureAfterMaintenance(
    deviceId: string,
    branchNodeId: string,
    maintenanceTime: Date
  ): Promise<boolean> {
    const result = await this.pool.query(
      `SELECT COUNT(*) as failure_count
      FROM device_failure_events
      WHERE device_id = $1
        AND branch_node_id = $2
        AND failure_timestamp > $3
        AND failure_timestamp <= $3 + INTERVAL '7 days'`,
      [deviceId, branchNodeId, maintenanceTime]
    );

    return parseInt(result.rows[0].failure_count) > 0;
  }

  /**
   * Update model performance metrics
   */
  private async updateModelMetrics(predictionType: string): Promise<void> {
    // Trigger recalculation of calibration metrics
    const { PredictionCalibrationService } = await import('./prediction-calibration.service.js');
    const calibrationService = new PredictionCalibrationService(this.pool);
    
    // Store snapshot
    await calibrationService.storeCalibrationSnapshot();
  }
}

export default PredictionRcaIntegrationService;
