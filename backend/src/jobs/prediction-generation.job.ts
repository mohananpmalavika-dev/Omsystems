/**
 * Prediction Generation Job
 * 
 * Scheduled job that runs hourly to:
 * 1. Extract telemetry features
 * 2. Generate failure predictions
 * 3. Calculate branch risk scores
 * 4. Expire old predictions
 * 5. Track execution metrics
 */

import { Pool } from 'pg';
import { FailurePredictionEngine } from '../services/failure-prediction-engine.service.js';
import { BranchRiskAggregationService } from '../services/branch-risk-aggregation.service.js';
import { TelemetryFeatureExtractionService } from '../services/telemetry-feature-extraction.service.js';
import { logger } from '../utils/logger.js';

export class PredictionGenerationJob {
  private predictionEngine: FailurePredictionEngine;
  private branchRiskService: BranchRiskAggregationService;
  private featureService: TelemetryFeatureExtractionService;
  private isRunning = false;

  constructor(private pool: Pool) {
    this.predictionEngine = new FailurePredictionEngine(pool);
    this.branchRiskService = new BranchRiskAggregationService(pool);
    this.featureService = new TelemetryFeatureExtractionService(pool);
  }

  /**
   * Execute prediction generation for all tenants
   */
  async execute(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Prediction generation already running, skipping');
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      logger.info('Starting scheduled prediction generation');

      // Get all active tenants
      const tenants = await this.pool.query(
        `SELECT id FROM tenants WHERE deleted_at IS NULL`
      );

      let totalPredictions = 0;
      let totalBranchScores = 0;

      for (const tenant of tenants.rows) {
        try {
          const predictions = await this.generatePredictionsForTenant(tenant.id);
          totalPredictions += predictions;

          const branchScores = await this.branchRiskService.calculateBranchRiskScores(tenant.id);
          totalBranchScores += branchScores;
        } catch (error) {
          logger.error('Error generating predictions for tenant', { error, tenantId: tenant.id });
        }
      }

      // Expire old predictions
      await this.expireOldPredictions();

      const executionTime = Date.now() - startTime;
      logger.info('Prediction generation completed', {
        tenants: tenants.rows.length,
        totalPredictions,
        totalBranchScores,
        executionTimeMs: executionTime
      });
    } catch (error) {
      logger.error('Error in prediction generation job', { error });
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Generate predictions for a single tenant
   */
  private async generatePredictionsForTenant(tenantId: string): Promise<number> {
    const client = await this.pool.connect();
    
    try {
      // Create prediction run record
      const runResult = await client.query(
        `INSERT INTO prediction_runs (tenant_id, run_type, status, started_at)
        VALUES ($1, 'scheduled', 'running', NOW())
        RETURNING id`,
        [tenantId]
      );

      const runId = runResult.rows[0].id;
      const startTime = Date.now();

      try {
        // Step 1: Extract features
        logger.debug('Extracting features', { tenantId });
        await this.featureService.extractFeaturesForTenant(tenantId);

        // Step 2: Generate predictions
        logger.debug('Generating predictions', { tenantId });
        const predictions = await this.predictionEngine.generatePredictions(tenantId);

        // Step 3: Store predictions
        let stored = 0;
        for (const prediction of predictions) {
          try {
            await this.storePrediction(client, tenantId, prediction);
            stored++;
          } catch (error) {
            logger.error('Error storing prediction', { error, prediction });
          }
        }

        const executionTime = Date.now() - startTime;

        // Update run record
        await client.query(
          `UPDATE prediction_runs
          SET status = 'completed',
              completed_at = NOW(),
              predictions_generated = $1,
              execution_time_ms = $2
          WHERE id = $3`,
          [stored, executionTime, runId]
        );

        logger.info('Predictions generated for tenant', { 
          tenantId, 
          predictions: stored,
          executionTimeMs: executionTime 
        });

        return stored;
      } catch (error) {
        // Update run record with error
        await client.query(
          `UPDATE prediction_runs
          SET status = 'failed',
              completed_at = NOW(),
              error_message = $1
          WHERE id = $2`,
          [error instanceof Error ? error.message : 'Unknown error', runId]
        );
        throw error;
      }
    } finally {
      client.release();
    }
  }

  /**
   * Store a single prediction with evidence
   */
  private async storePrediction(client: any, tenantId: string, prediction: any): Promise<void> {
    try {
      await client.query('BEGIN');

      // Check if similar prediction already exists
      const existing = await client.query(
        `SELECT id FROM failure_predictions
        WHERE tenant_id = $1 
          AND device_id = $2
          AND prediction_type = $3
          AND status = 'active'
        FOR UPDATE`,
        [tenantId, prediction.deviceId, prediction.predictionType]
      );

      if (existing.rows.length > 0) {
        // Update existing prediction
        await client.query(
          `UPDATE failure_predictions
          SET probability = $1,
              confidence = $2,
              risk_classification = $3,
              expected_failure_from = $4,
              expected_failure_to = $5,
              predicted_impact = $6,
              recommended_action = $7,
              preventive_actions = $8,
              updated_at = NOW()
          WHERE id = $9`,
          [
            prediction.probability,
            prediction.confidence,
            prediction.riskClassification,
            prediction.expectedFailureFrom,
            prediction.expectedFailureTo,
            JSON.stringify(prediction.predictedImpact),
            prediction.recommendedAction,
            prediction.preventiveActions,
            existing.rows[0].id
          ]
        );

        // Delete old evidence
        await client.query(
          `DELETE FROM prediction_evidence WHERE prediction_id = $1`,
          [existing.rows[0].id]
        );

        // Insert new evidence
        for (const evidence of prediction.evidence) {
          await this.storeEvidence(client, existing.rows[0].id, evidence);
        }
      } else {
        // Insert new prediction
        const result = await client.query(
          `INSERT INTO failure_predictions (
            tenant_id, device_id, device_type, branch_node_id,
            prediction_type, probability, confidence, risk_classification,
            predicted_at, expected_failure_from, expected_failure_to, time_horizon_days,
            predicted_impact, recommended_action, preventive_actions,
            model_version, prediction_method, status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9, $10, $11, $12, $13, $14, $15, $16, 'active')
          RETURNING id`,
          [
            tenantId,
            prediction.deviceId,
            prediction.deviceType,
            prediction.branchNodeId,
            prediction.predictionType,
            prediction.probability,
            prediction.confidence,
            prediction.riskClassification,
            prediction.expectedFailureFrom,
            prediction.expectedFailureTo,
            prediction.timeHorizonDays,
            JSON.stringify(prediction.predictedImpact),
            prediction.recommendedAction,
            prediction.preventiveActions,
            prediction.modelVersion,
            prediction.predictionMethod
          ]
        );

        const predictionId = result.rows[0].id;

        // Insert evidence
        for (const evidence of prediction.evidence) {
          await this.storeEvidence(client, predictionId, evidence);
        }
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }

  /**
   * Store evidence for a prediction
   */
  private async storeEvidence(client: any, predictionId: string, evidence: any): Promise<void> {
    await client.query(
      `INSERT INTO prediction_evidence (
        prediction_id, evidence_type, evidence_description,
        metric_name, current_value, baseline_value, change_percentage,
        trend_data, weight
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        predictionId,
        evidence.evidenceType,
        evidence.evidenceDescription,
        evidence.metricName,
        evidence.currentValue,
        evidence.baselineValue,
        evidence.changePercentage,
        evidence.trendData ? JSON.stringify(evidence.trendData) : null,
        evidence.weight
      ]
    );
  }

  /**
   * Expire predictions that are past their failure window
   */
  private async expireOldPredictions(): Promise<void> {
    try {
      const result = await this.pool.query(
        `UPDATE failure_predictions
        SET status = 'expired',
            updated_at = NOW()
        WHERE status = 'active'
          AND expected_failure_to < NOW() - INTERVAL '24 hours'
          AND NOT EXISTS (
            SELECT 1 FROM prediction_outcomes po 
            WHERE po.prediction_id = failure_predictions.id
          )`
      );

      if (result.rowCount && result.rowCount > 0) {
        logger.info('Expired old predictions', { count: result.rowCount });
      }
    } catch (error) {
      logger.error('Error expiring predictions', { error });
    }
  }
}

/**
 * Initialize and schedule the job
 */
export function initializePredictionJob(pool: Pool): NodeJS.Timeout {
  const job = new PredictionGenerationJob(pool);

  // Run immediately on startup
  job.execute().catch(error => {
    logger.error('Error in initial prediction generation', { error });
  });

  // Schedule to run every hour
  const interval = setInterval(() => {
    job.execute().catch(error => {
      logger.error('Error in scheduled prediction generation', { error });
    });
  }, 60 * 60 * 1000); // 1 hour

  logger.info('Prediction generation job initialized (runs hourly)');

  return interval;
}
