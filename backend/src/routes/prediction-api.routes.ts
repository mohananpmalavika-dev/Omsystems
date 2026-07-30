/**
 * Prediction API Routes
 * 
 * RESTful APIs for predictive branch failure management:
 * - Branch and device predictions
 * - Imminent failure alerts
 * - Risk-specific queries (retention, network, storage)
 * - Prediction acknowledgment and work orders
 * - Prediction feedback and accuracy metrics
 */

import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { FailurePredictionEngine } from '../services/failure-prediction-engine.service.js';
import { BranchRiskAggregationService } from '../services/branch-risk-aggregation.service.js';
import { TelemetryFeatureExtractionService } from '../services/telemetry-feature-extraction.service.js';
import { logger } from '../utils/logger.js';

interface AuthRequest extends Request {
  context?: {
    tenantId: string;
    userId?: string;
    userScope?: {
      branchIds?: string[];
      regionIds?: string[];
    };
  };
}

export function createPredictionApiRoutes(pool: Pool): Router {
  const router = Router();
  const predictionEngine = new FailurePredictionEngine(pool);
  const branchRiskService = new BranchRiskAggregationService(pool);
  const featureService = new TelemetryFeatureExtractionService(pool);

  /**
   * GET /v1/predictions/branches
   * Get predictions for all branches with filtering and pagination
   */
  router.get('/branches', async (req: AuthRequest, res: Response) => {
    try {
      const { tenantId, userScope } = req.context || {};
      if (!tenantId) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }

      const {
        riskLevel,
        predictionType,
        timeWindow = '7',
        limit = '100',
        offset = '0'
      } = req.query;

      let query = `
        SELECT 
          fp.id,
          fp.device_id,
          fp.device_type,
          fp.branch_node_id,
          rn.name as branch_name,
          fp.prediction_type,
          fp.probability,
          fp.confidence,
          fp.risk_classification,
          fp.expected_failure_from,
          fp.expected_failure_to,
          fp.predicted_impact,
          fp.recommended_action,
          fp.status,
          fp.predicted_at,
          EXTRACT(EPOCH FROM (fp.expected_failure_from - NOW())) / 3600 as hours_until_failure,
          (SELECT COUNT(*) FROM prediction_evidence WHERE prediction_id = fp.id) as evidence_count
        FROM failure_predictions fp
        LEFT JOIN resource_nodes rn ON rn.id = fp.branch_node_id
        WHERE fp.tenant_id = $1 
          AND fp.status = 'active'
          AND fp.expected_failure_to >= NOW() - INTERVAL '${timeWindow} days'
      `;

      const params: any[] = [tenantId];
      let paramCount = 1;

      if (riskLevel) {
        paramCount++;
        query += ` AND fp.risk_classification = $${paramCount}`;
        params.push(riskLevel);
      }

      if (predictionType) {
        paramCount++;
        query += ` AND fp.prediction_type = $${paramCount}`;
        params.push(predictionType);
      }

      if (userScope?.branchIds && userScope.branchIds.length > 0) {
        paramCount++;
        query += ` AND fp.branch_node_id = ANY($${paramCount})`;
        params.push(userScope.branchIds);
      }

      query += ` ORDER BY fp.probability DESC, fp.expected_failure_from ASC`;
      query += ` LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
      params.push(parseInt(limit as string), parseInt(offset as string));

      const result = await pool.query(query, params);

      // Get total count
      const countResult = await pool.query(
        `SELECT COUNT(*) as total 
        FROM failure_predictions 
        WHERE tenant_id = $1 AND status = 'active'`,
        [tenantId]
      );

      res.json({
        success: true,
        data: {
          predictions: result.rows,
          pagination: {
            total: parseInt(countResult.rows[0].total),
            limit: parseInt(limit as string),
            offset: parseInt(offset as string)
          }
        }
      });
    } catch (error) {
      logger.error('Error getting branch predictions', { error });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });


  /**
   * GET /v1/predictions/branches/:branchId
   * Get all predictions for a specific branch
   */
  router.get('/branches/:branchId', async (req: AuthRequest, res: Response) => {
    try {
      const { tenantId } = req.context || {};
      const { branchId } = req.params;

      if (!tenantId) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }

      const predictions = await pool.query(
        `SELECT 
          fp.*,
          (SELECT json_agg(pe) FROM prediction_evidence pe WHERE pe.prediction_id = fp.id) as evidence
        FROM failure_predictions fp
        WHERE fp.tenant_id = $1 
          AND fp.branch_node_id = $2
          AND fp.status = 'active'
        ORDER BY fp.risk_classification DESC, fp.probability DESC`,
        [tenantId, branchId]
      );

      // Get branch risk score
      const riskScore = await branchRiskService.getLatestBranchRiskScore(tenantId, branchId);

      res.json({
        success: true,
        data: {
          branchId,
          predictions: predictions.rows,
          riskScore
        }
      });
    } catch (error) {
      logger.error('Error getting branch predictions', { error, branchId: req.params.branchId });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  /**
   * GET /v1/predictions/devices/:deviceId
   * Get predictions for a specific device
   */
  router.get('/devices/:deviceId', async (req: AuthRequest, res: Response) => {
    try {
      const { tenantId } = req.context || {};
      const { deviceId } = req.params;

      if (!tenantId) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }

      const predictions = await pool.query(
        `SELECT 
          fp.*,
          rn.name as branch_name,
          (SELECT json_agg(pe) FROM prediction_evidence pe WHERE pe.prediction_id = fp.id) as evidence
        FROM failure_predictions fp
        LEFT JOIN resource_nodes rn ON rn.id = fp.branch_node_id
        WHERE fp.tenant_id = $1 
          AND fp.device_id = $2
          AND fp.status = 'active'
        ORDER BY fp.predicted_at DESC`,
        [tenantId, deviceId]
      );

      res.json({
        success: true,
        data: predictions.rows
      });
    } catch (error) {
      logger.error('Error getting device predictions', { error, deviceId: req.params.deviceId });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  /**
   * GET /v1/predictions/imminent
   * Get predictions with failure expected within 24 hours
   */
  router.get('/imminent', async (req: AuthRequest, res: Response) => {
    try {
      const { tenantId, userScope } = req.context || {};
      if (!tenantId) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }

      let query = `
        SELECT 
          fp.*,
          rn.name as branch_name,
          EXTRACT(EPOCH FROM (fp.expected_failure_from - NOW())) / 3600 as hours_until_failure
        FROM failure_predictions fp
        LEFT JOIN resource_nodes rn ON rn.id = fp.branch_node_id
        WHERE fp.tenant_id = $1 
          AND fp.status = 'active'
          AND fp.expected_failure_from <= NOW() + INTERVAL '24 hours'
      `;

      const params: any[] = [tenantId];

      if (userScope?.branchIds && userScope.branchIds.length > 0) {
        query += ` AND fp.branch_node_id = ANY($2)`;
        params.push(userScope.branchIds);
      }

      query += ` ORDER BY fp.expected_failure_from ASC`;

      const result = await pool.query(query, params);

      res.json({
        success: true,
        data: {
          count: result.rows.length,
          predictions: result.rows
        }
      });
    } catch (error) {
      logger.error('Error getting imminent predictions', { error });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  /**
   * GET /v1/predictions/retention-risk
   * Get storage retention compliance predictions
   */
  router.get('/retention-risk', async (req: AuthRequest, res: Response) => {
    try {
      const { tenantId, userScope } = req.context || {};
      if (!tenantId) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }

      let query = `
        SELECT 
          fp.*,
          rn.name as branch_name
        FROM failure_predictions fp
        LEFT JOIN resource_nodes rn ON rn.id = fp.branch_node_id
        WHERE fp.tenant_id = $1 
          AND fp.status = 'active'
          AND fp.prediction_type = 'storage_retention_failure'
      `;

      const params: any[] = [tenantId];

      if (userScope?.branchIds && userScope.branchIds.length > 0) {
        query += ` AND fp.branch_node_id = ANY($2)`;
        params.push(userScope.branchIds);
      }

      query += ` ORDER BY fp.probability DESC`;

      const result = await pool.query(query, params);

      res.json({
        success: true,
        data: result.rows
      });
    } catch (error) {
      logger.error('Error getting retention risk predictions', { error });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });


  /**
   * GET /v1/predictions/network-risk
   * Get network connectivity predictions
   */
  router.get('/network-risk', async (req: AuthRequest, res: Response) => {
    try {
      const { tenantId, userScope } = req.context || {};
      if (!tenantId) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }

      let query = `
        SELECT 
          fp.*,
          rn.name as branch_name
        FROM failure_predictions fp
        LEFT JOIN resource_nodes rn ON rn.id = fp.branch_node_id
        WHERE fp.tenant_id = $1 
          AND fp.status = 'active'
          AND fp.prediction_type = 'network_failure'
      `;

      const params: any[] = [tenantId];

      if (userScope?.branchIds && userScope.branchIds.length > 0) {
        query += ` AND fp.branch_node_id = ANY($2)`;
        params.push(userScope.branchIds);
      }

      query += ` ORDER BY fp.probability DESC`;

      const result = await pool.query(query, params);

      res.json({
        success: true,
        data: result.rows
      });
    } catch (error) {
      logger.error('Error getting network risk predictions', { error });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  /**
   * GET /v1/predictions/storage-risk
   * Get disk and storage predictions
   */
  router.get('/storage-risk', async (req: AuthRequest, res: Response) => {
    try {
      const { tenantId, userScope } = req.context || {};
      if (!tenantId) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }

      let query = `
        SELECT 
          fp.*,
          rn.name as branch_name
        FROM failure_predictions fp
        LEFT JOIN resource_nodes rn ON rn.id = fp.branch_node_id
        WHERE fp.tenant_id = $1 
          AND fp.status = 'active'
          AND fp.prediction_type IN ('disk_failure', 'storage_retention_failure')
      `;

      const params: any[] = [tenantId];

      if (userScope?.branchIds && userScope.branchIds.length > 0) {
        query += ` AND fp.branch_node_id = ANY($2)`;
        params.push(userScope.branchIds);
      }

      query += ` ORDER BY fp.probability DESC`;

      const result = await pool.query(query, params);

      res.json({
        success: true,
        data: result.rows
      });
    } catch (error) {
      logger.error('Error getting storage risk predictions', { error });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  /**
   * POST /v1/predictions/:predictionId/acknowledge
   * Acknowledge a prediction
   */
  router.post('/:predictionId/acknowledge', async (req: AuthRequest, res: Response) => {
    try {
      const { tenantId, userId } = req.context || {};
      const { predictionId } = req.params;

      if (!tenantId || !userId) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }

      await pool.query(
        `UPDATE failure_predictions
        SET status = 'acknowledged',
            acknowledged_at = NOW(),
            acknowledged_by = $1,
            updated_at = NOW()
        WHERE id = $2 AND tenant_id = $3`,
        [userId, predictionId, tenantId]
      );

      res.json({
        success: true,
        message: 'Prediction acknowledged'
      });
    } catch (error) {
      logger.error('Error acknowledging prediction', { error, predictionId: req.params.predictionId });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  /**
   * POST /v1/predictions/:predictionId/create-work-order
   * Create maintenance work order from prediction
   */
  router.post('/:predictionId/create-work-order', async (req: AuthRequest, res: Response) => {
    try {
      const { tenantId, userId } = req.context || {};
      const { predictionId } = req.params;
      const { scheduledAt, notes } = req.body;

      if (!tenantId || !userId) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }

      // Get prediction details
      const prediction = await pool.query(
        `SELECT * FROM failure_predictions WHERE id = $1 AND tenant_id = $2`,
        [predictionId, tenantId]
      );

      if (prediction.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Prediction not found' });
      }

      const pred = prediction.rows[0];

      // Create maintenance intervention
      const intervention = await pool.query(
        `INSERT INTO maintenance_interventions (
          tenant_id,
          prediction_id,
          intervention_type,
          scheduled_at,
          assigned_to,
          action_taken,
          notes
        ) VALUES ($1, $2, 'preventive', $3, $4, $5, $6)
        RETURNING id`,
        [
          tenantId,
          predictionId,
          scheduledAt || pred.expected_failure_from,
          userId,
          pred.recommended_action,
          notes || `Work order created from prediction: ${pred.prediction_type}`
        ]
      );

      // Update prediction status
      await pool.query(
        `UPDATE failure_predictions
        SET status = 'acknowledged',
            acknowledged_at = NOW(),
            acknowledged_by = $1,
            updated_at = NOW()
        WHERE id = $2`,
        [userId, predictionId]
      );

      res.json({
        success: true,
        data: {
          interventionId: intervention.rows[0].id,
          message: 'Work order created successfully'
        }
      });
    } catch (error) {
      logger.error('Error creating work order', { error, predictionId: req.params.predictionId });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });


  /**
   * POST /v1/predictions/:predictionId/feedback
   * Record prediction feedback
   */
  router.post('/:predictionId/feedback', async (req: AuthRequest, res: Response) => {
    try {
      const { tenantId, userId } = req.context || {};
      const { predictionId } = req.params;
      const { feedbackType, accuracyRating, usefulnessRating, comments } = req.body;

      if (!tenantId || !userId) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }

      await pool.query(
        `INSERT INTO prediction_feedback (
          prediction_id,
          tenant_id,
          provided_by,
          feedback_type,
          accuracy_rating,
          usefulness_rating,
          comments
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [predictionId, tenantId, userId, feedbackType, accuracyRating, usefulnessRating, comments]
      );

      res.json({
        success: true,
        message: 'Feedback recorded'
      });
    } catch (error) {
      logger.error('Error recording feedback', { error, predictionId: req.params.predictionId });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  /**
   * GET /v1/predictions/model-performance
   * Get prediction accuracy metrics
   */
  router.get('/model-performance', async (req: AuthRequest, res: Response) => {
    try {
      const { tenantId } = req.context || {};
      if (!tenantId) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }

      const { days = '90', predictionType } = req.query;

      let query = `
        SELECT 
          fp.prediction_type,
          COUNT(fp.id) as total_predictions,
          COUNT(po.id) FILTER (WHERE po.outcome = 'correct') as correct_predictions,
          COUNT(po.id) FILTER (WHERE po.outcome = 'false_positive') as false_positives,
          COUNT(po.id) FILTER (WHERE po.outcome = 'false_negative') as false_negatives,
          COUNT(po.id) FILTER (WHERE po.outcome = 'prevented') as prevented_failures,
          COUNT(po.id) FILTER (WHERE po.within_predicted_window = true) as within_window,
          ROUND(AVG(po.prediction_lead_time_hours) FILTER (WHERE po.outcome = 'correct'), 2) as avg_lead_time_hours,
          ROUND(
            COUNT(po.id) FILTER (WHERE po.outcome = 'correct')::numeric / 
            NULLIF(COUNT(po.id) FILTER (WHERE po.outcome IN ('correct', 'false_positive')), 0)::numeric,
            4
          ) as precision,
          ROUND(
            COUNT(po.id) FILTER (WHERE po.outcome = 'correct')::numeric / 
            NULLIF(COUNT(po.id) FILTER (WHERE po.outcome IN ('correct', 'false_negative')), 0)::numeric,
            4
          ) as recall
        FROM failure_predictions fp
        LEFT JOIN prediction_outcomes po ON po.prediction_id = fp.id
        WHERE fp.tenant_id = $1 
          AND fp.predicted_at >= NOW() - INTERVAL '${days} days'
      `;

      const params: any[] = [tenantId];

      if (predictionType) {
        query += ` AND fp.prediction_type = $2`;
        params.push(predictionType);
      }

      query += ` GROUP BY fp.prediction_type`;

      const result = await pool.query(query, params);

      // Get overall summary
      const summary = await pool.query(
        `SELECT 
          COUNT(DISTINCT fp.id) as total_predictions,
          COUNT(DISTINCT CASE WHEN fp.risk_classification IN ('critical_risk', 'imminent_failure') THEN fp.id END) as critical_predictions,
          COUNT(DISTINCT po.id) FILTER (WHERE po.outcome = 'prevented') as prevented_failures,
          COUNT(DISTINCT po.id) FILTER (WHERE po.outcome = 'correct') as accurate_predictions
        FROM failure_predictions fp
        LEFT JOIN prediction_outcomes po ON po.prediction_id = fp.id
        WHERE fp.tenant_id = $1 
          AND fp.predicted_at >= NOW() - INTERVAL '${days} days'`,
        [tenantId]
      );

      res.json({
        success: true,
        data: {
          summary: summary.rows[0],
          byPredictionType: result.rows
        }
      });
    } catch (error) {
      logger.error('Error getting model performance', { error });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  /**
   * POST /v1/predictions/generate
   * Manually trigger prediction generation
   */
  router.post('/generate', async (req: AuthRequest, res: Response) => {
    try {
      const { tenantId, userId } = req.context || {};
      if (!tenantId) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }

      // Create prediction run record
      const runResult = await pool.query(
        `INSERT INTO prediction_runs (tenant_id, run_type, status)
        VALUES ($1, 'manual', 'running')
        RETURNING id`,
        [tenantId]
      );

      const runId = runResult.rows[0].id;

      // Generate predictions (async)
      setImmediate(async () => {
        try {
          const startTime = Date.now();
          
          // Extract features
          await featureService.extractFeaturesForTenant(tenantId);
          
          // Generate predictions
          const predictions = await predictionEngine.generatePredictions(tenantId);
          
          // Store predictions
          for (const prediction of predictions) {
            await storePrediction(pool, tenantId, prediction);
          }
          
          // Calculate branch risk scores
          await branchRiskService.calculateBranchRiskScores(tenantId);
          
          const executionTime = Date.now() - startTime;
          
          // Update run record
          await pool.query(
            `UPDATE prediction_runs
            SET status = 'completed',
                completed_at = NOW(),
                predictions_generated = $1,
                execution_time_ms = $2
            WHERE id = $3`,
            [predictions.length, executionTime, runId]
          );
        } catch (error) {
          logger.error('Error in prediction generation', { error, runId });
          await pool.query(
            `UPDATE prediction_runs
            SET status = 'failed',
                completed_at = NOW(),
                error_message = $1
            WHERE id = $2`,
            [error instanceof Error ? error.message : 'Unknown error', runId]
          );
        }
      });

      res.json({
        success: true,
        data: {
          runId,
          message: 'Prediction generation started'
        }
      });
    } catch (error) {
      logger.error('Error starting prediction generation', { error });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  return router;
}

/**
 * Helper function to store prediction
 */
async function storePrediction(pool: Pool, tenantId: string, prediction: any): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Insert prediction
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

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export default createPredictionApiRoutes;
