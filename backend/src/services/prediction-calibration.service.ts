/**
 * Prediction Calibration Service
 * 
 * Tracks and improves prediction accuracy through:
 * - Precision, recall, false-positive rate, missed-failure rate
 * - Calibration curves (predicted probability vs actual failure rate)
 * - Probability threshold adjustment based on outcomes
 * - Model performance metrics dashboard
 * - Automatic model degradation detection
 * 
 * Ensures "98% probability" actually means 98 out of 100 similar predictions resulted in failure.
 */

import { Pool } from 'pg';

// ============================================
// Types
// ============================================

interface CalibrationMetrics {
  predictionType: string;
  period: { start: string; end: string };
  totalPredictions: number;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  trueNegatives: number;
  precision: number;
  recall: number;
  f1Score: number;
  falsePositiveRate: number;
  accuracy: number;
  averageLeadTime: number; // hours
  preventedIncidents: number;
  maintenanceCostSaved: number;
}

interface CalibrationCurve {
  probabilityBucket: string; // e.g., "80-85%", "85-90%"
  predictedProbability: number;
  actualFailureRate: number;
  predictionCount: number;
  calibrationGap: number; // abs(predicted - actual)
}

interface PredictionPerformance {
  predictionType: string;
  metrics: CalibrationMetrics;
  calibrationCurve: CalibrationCurve[];
  recentTrend: 'improving' | 'stable' | 'degrading';
  modelHealth: 'excellent' | 'good' | 'fair' | 'poor';
  recommendations: string[];
}

interface ThresholdAdjustment {
  predictionType: string;
  currentThreshold: Record<string, number>;
  recommendedThreshold: Record<string, number>;
  rationale: string;
}

// ============================================
// Prediction Calibration Service
// ============================================

export class PredictionCalibrationService {
  constructor(private pool: Pool) {}

  /**
   * Calculate comprehensive calibration metrics for a prediction type
   */
  async calculateCalibrationMetrics(
    predictionType: string,
    days: number = 90,
    tenantId?: string
  ): Promise<CalibrationMetrics> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get all predictions with outcomes in the period
    const query = `
      WITH prediction_outcomes_summary AS (
        SELECT
          fp.prediction_type,
          fp.probability,
          po.outcome_type,
          po.actual_failure_timestamp,
          fp.expected_failure_from,
          fp.predicted_at,
          EXTRACT(EPOCH FROM (po.actual_failure_timestamp - fp.predicted_at)) / 3600 AS lead_time_hours,
          mi.estimated_cost_saved
        FROM failure_predictions fp
        LEFT JOIN prediction_outcomes po ON fp.id = po.prediction_id
        LEFT JOIN maintenance_interventions mi ON fp.id = mi.prediction_id
        WHERE fp.prediction_type = $1
          AND fp.predicted_at >= $2
          ${tenantId ? 'AND fp.tenant_id = $3' : ''}
          AND (po.outcome_type IS NOT NULL OR po.verified_at IS NOT NULL)
      )
      SELECT
        COUNT(*) FILTER (WHERE outcome_type = 'true_positive') AS true_positives,
        COUNT(*) FILTER (WHERE outcome_type = 'false_positive') AS false_positives,
        COUNT(*) FILTER (WHERE outcome_type = 'false_negative') AS false_negatives,
        COUNT(*) FILTER (WHERE outcome_type = 'true_negative') AS true_negatives,
        COUNT(*) AS total_predictions,
        AVG(lead_time_hours) FILTER (WHERE outcome_type = 'true_positive') AS avg_lead_time,
        COUNT(*) FILTER (WHERE outcome_type = 'prevented') AS prevented_incidents,
        COALESCE(SUM(estimated_cost_saved), 0) AS total_cost_saved
      FROM prediction_outcomes_summary
    `;

    const params = tenantId ? [predictionType, startDate, tenantId] : [predictionType, startDate];
    const result = await this.pool.query(query, params);
    const row = result.rows[0];

    const tp = parseInt(row.true_positives) || 0;
    const fp = parseInt(row.false_positives) || 0;
    const fn = parseInt(row.false_negatives) || 0;
    const tn = parseInt(row.true_negatives) || 0;
    const total = parseInt(row.total_predictions) || 0;

    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
    const f1Score = precision + recall > 0 ? 2 * (precision * recall) / (precision + recall) : 0;
    const falsePositiveRate = fp + tn > 0 ? fp / (fp + tn) : 0;
    const accuracy = total > 0 ? (tp + tn) / total : 0;

    return {
      predictionType,
      period: {
        start: startDate.toISOString(),
        end: new Date().toISOString()
      },
      totalPredictions: total,
      truePositives: tp,
      falsePositives: fp,
      falseNegatives: fn,
      trueNegatives: tn,
      precision: Math.round(precision * 1000) / 1000,
      recall: Math.round(recall * 1000) / 1000,
      f1Score: Math.round(f1Score * 1000) / 1000,
      falsePositiveRate: Math.round(falsePositiveRate * 1000) / 1000,
      accuracy: Math.round(accuracy * 1000) / 1000,
      averageLeadTime: parseFloat(row.avg_lead_time) || 0,
      preventedIncidents: parseInt(row.prevented_incidents) || 0,
      maintenanceCostSaved: parseFloat(row.total_cost_saved) || 0
    };
  }

  /**
   * Generate calibration curve showing predicted vs actual failure rates
   */
  async generateCalibrationCurve(
    predictionType: string,
    days: number = 90,
    tenantId?: string
  ): Promise<CalibrationCurve[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const query = `
      WITH probability_buckets AS (
        SELECT
          fp.probability,
          CASE
            WHEN fp.probability < 0.40 THEN '0-40%'
            WHEN fp.probability >= 0.40 AND fp.probability < 0.65 THEN '40-65%'
            WHEN fp.probability >= 0.65 AND fp.probability < 0.80 THEN '65-80%'
            WHEN fp.probability >= 0.80 AND fp.probability < 0.95 THEN '80-95%'
            ELSE '95-100%'
          END AS bucket,
          CASE
            WHEN po.outcome_type = 'true_positive' THEN 1
            ELSE 0
          END AS actual_failure
        FROM failure_predictions fp
        LEFT JOIN prediction_outcomes po ON fp.id = po.prediction_id
        WHERE fp.prediction_type = $1
          AND fp.predicted_at >= $2
          ${tenantId ? 'AND fp.tenant_id = $3' : ''}
          AND po.outcome_type IS NOT NULL
      )
      SELECT
        bucket,
        AVG(probability) AS avg_predicted_probability,
        AVG(actual_failure) AS actual_failure_rate,
        COUNT(*) AS prediction_count
      FROM probability_buckets
      GROUP BY bucket
      ORDER BY bucket
    `;

    const params = tenantId ? [predictionType, startDate, tenantId] : [predictionType, startDate];
    const result = await this.pool.query(query, params);

    return result.rows.map(row => ({
      probabilityBucket: row.bucket,
      predictedProbability: Math.round(parseFloat(row.avg_predicted_probability) * 1000) / 1000,
      actualFailureRate: Math.round(parseFloat(row.actual_failure_rate) * 1000) / 1000,
      predictionCount: parseInt(row.prediction_count),
      calibrationGap: Math.abs(
        parseFloat(row.avg_predicted_probability) - parseFloat(row.actual_failure_rate)
      )
    }));
  }

  /**
   * Get comprehensive prediction performance report
   */
  async getPredictionPerformance(
    predictionType: string,
    days: number = 90,
    tenantId?: string
  ): Promise<PredictionPerformance> {
    const metrics = await this.calculateCalibrationMetrics(predictionType, days, tenantId);
    const calibrationCurve = await this.generateCalibrationCurve(predictionType, days, tenantId);

    // Determine model health
    let modelHealth: 'excellent' | 'good' | 'fair' | 'poor';
    if (metrics.accuracy >= 0.80 && metrics.falsePositiveRate < 0.15) {
      modelHealth = 'excellent';
    } else if (metrics.accuracy >= 0.70 && metrics.falsePositiveRate < 0.25) {
      modelHealth = 'good';
    } else if (metrics.accuracy >= 0.60 && metrics.falsePositiveRate < 0.35) {
      modelHealth = 'fair';
    } else {
      modelHealth = 'poor';
    }

    // Determine trend
    const recentMetrics = await this.calculateCalibrationMetrics(predictionType, 30, tenantId);
    const olderMetrics = await this.calculateCalibrationMetrics(predictionType, 60, tenantId);
    let recentTrend: 'improving' | 'stable' | 'degrading';
    
    const accuracyDiff = recentMetrics.accuracy - olderMetrics.accuracy;
    if (accuracyDiff > 0.05) {
      recentTrend = 'improving';
    } else if (accuracyDiff < -0.05) {
      recentTrend = 'degrading';
    } else {
      recentTrend = 'stable';
    }

    // Generate recommendations
    const recommendations: string[] = [];
    
    if (metrics.accuracy < 0.60) {
      recommendations.push('Model accuracy below 60% - recommend immediate recalibration');
    }
    
    if (metrics.falsePositiveRate > 0.30) {
      recommendations.push('High false-positive rate - consider increasing prediction thresholds');
    }
    
    if (metrics.recall < 0.50) {
      recommendations.push('Low recall - missing too many actual failures, consider lowering thresholds');
    }
    
    if (metrics.averageLeadTime < 6 && predictionType !== 'network_failure') {
      recommendations.push('Insufficient lead time - adjust prediction horizon to provide earlier warnings');
    }

    const avgCalibrationGap = calibrationCurve.reduce((sum, c) => sum + c.calibrationGap, 0) / calibrationCurve.length;
    if (avgCalibrationGap > 0.15) {
      recommendations.push('Large calibration gap detected - predicted probabilities do not match actual failure rates');
    }

    if (recentTrend === 'degrading') {
      recommendations.push('Model performance degrading - review recent false positives and adjust rules');
    }

    if (recommendations.length === 0) {
      recommendations.push('Model performing well - continue monitoring');
    }

    return {
      predictionType,
      metrics,
      calibrationCurve,
      recentTrend,
      modelHealth,
      recommendations
    };
  }

  /**
   * Recommend threshold adjustments based on outcomes
   */
  async recommendThresholdAdjustments(
    predictionType: string,
    tenantId?: string
  ): Promise<ThresholdAdjustment> {
    const performance = await this.getPredictionPerformance(predictionType, 90, tenantId);
    
    // Get current thresholds from prediction_models table
    const currentQuery = `
      SELECT configuration
      FROM prediction_models
      WHERE prediction_type = $1
        ${tenantId ? 'AND tenant_id = $2' : ''}
        AND status = 'active'
      ORDER BY version DESC
      LIMIT 1
    `;
    
    const currentParams = tenantId ? [predictionType, tenantId] : [predictionType];
    const currentResult = await this.pool.query(currentQuery, currentParams);
    const currentThreshold = currentResult.rows[0]?.configuration || {};

    const recommendedThreshold = { ...currentThreshold };
    let rationale = '';

    // Adjust based on false positive rate
    if (performance.metrics.falsePositiveRate > 0.30) {
      // Too many false positives - increase thresholds
      Object.keys(recommendedThreshold).forEach(key => {
        if (typeof recommendedThreshold[key] === 'number') {
          recommendedThreshold[key] *= 1.15; // Increase by 15%
        }
      });
      rationale += 'False-positive rate too high (>30%). Increasing thresholds by 15% to reduce alerts. ';
    }

    // Adjust based on recall
    if (performance.metrics.recall < 0.50) {
      // Missing too many failures - decrease thresholds
      Object.keys(recommendedThreshold).forEach(key => {
        if (typeof recommendedThreshold[key] === 'number') {
          recommendedThreshold[key] *= 0.85; // Decrease by 15%
        }
      });
      rationale += 'Recall too low (<50%). Decreasing thresholds by 15% to catch more failures. ';
    }

    // Adjust based on calibration gap
    const avgCalibrationGap = performance.calibrationCurve.reduce((sum, c) => sum + c.calibrationGap, 0) / performance.calibrationCurve.length;
    if (avgCalibrationGap > 0.15) {
      rationale += 'Large calibration gap detected. Recommend detailed review of prediction rules. ';
    }

    if (rationale === '') {
      rationale = 'Current thresholds appear well-calibrated. No adjustments recommended.';
    }

    return {
      predictionType,
      currentThreshold,
      recommendedThreshold,
      rationale
    };
  }

  /**
   * Get model performance for all prediction types (dashboard endpoint)
   */
  async getAllPredictionPerformance(
    days: number = 90,
    tenantId?: string
  ): Promise<PredictionPerformance[]> {
    const predictionTypes = [
      'recorder_failure',
      'disk_failure',
      'network_failure',
      'camera_failure',
      'ups_failure',
      'storage_retention_failure'
    ];

    const performanceResults = await Promise.all(
      predictionTypes.map(type => this.getPredictionPerformance(type, days, tenantId))
    );

    return performanceResults;
  }

  /**
   * Detect model degradation and generate alerts
   */
  async detectModelDegradation(
    tenantId?: string
  ): Promise<Array<{ predictionType: string; issue: string; severity: string }>> {
    const allPerformance = await this.getAllPredictionPerformance(90, tenantId);
    const issues: Array<{ predictionType: string; issue: string; severity: string }> = [];

    allPerformance.forEach(perf => {
      if (perf.modelHealth === 'poor') {
        issues.push({
          predictionType: perf.predictionType,
          issue: `Model performance is poor (accuracy: ${(perf.metrics.accuracy * 100).toFixed(1)}%)`,
          severity: 'critical'
        });
      }

      if (perf.recentTrend === 'degrading') {
        issues.push({
          predictionType: perf.predictionType,
          issue: 'Model performance is degrading over the past 30 days',
          severity: 'high'
        });
      }

      if (perf.metrics.falsePositiveRate > 0.35) {
        issues.push({
          predictionType: perf.predictionType,
          issue: `High false-positive rate: ${(perf.metrics.falsePositiveRate * 100).toFixed(1)}%`,
          severity: 'medium'
        });
      }

      if (perf.metrics.accuracy < 0.60) {
        issues.push({
          predictionType: perf.predictionType,
          issue: `Accuracy below 60% threshold: ${(perf.metrics.accuracy * 100).toFixed(1)}%`,
          severity: 'critical'
        });
      }
    });

    return issues;
  }

  /**
   * Adjust probability for a specific prediction based on calibration
   */
  async getCalibratedProbability(
    predictionType: string,
    rawProbability: number,
    tenantId?: string
  ): Promise<{ calibratedProbability: number; confidence: string }> {
    const calibrationCurve = await this.generateCalibrationCurve(predictionType, 90, tenantId);

    // Find the matching bucket
    const bucket = calibrationCurve.find(b => {
      if (rawProbability < 0.40) return b.probabilityBucket === '0-40%';
      if (rawProbability >= 0.40 && rawProbability < 0.65) return b.probabilityBucket === '40-65%';
      if (rawProbability >= 0.65 && rawProbability < 0.80) return b.probabilityBucket === '65-80%';
      if (rawProbability >= 0.80 && rawProbability < 0.95) return b.probabilityBucket === '80-95%';
      return b.probabilityBucket === '95-100%';
    });

    if (!bucket || bucket.predictionCount < 20) {
      // Insufficient calibration data - return range
      return {
        calibratedProbability: rawProbability,
        confidence: 'low'
      };
    }

    // Adjust probability based on actual failure rate
    const adjustment = bucket.actualFailureRate - bucket.predictedProbability;
    const calibratedProbability = Math.max(0, Math.min(1, rawProbability + adjustment));

    let confidence: string;
    if (bucket.predictionCount >= 100 && bucket.calibrationGap < 0.10) {
      confidence = 'high';
    } else if (bucket.predictionCount >= 50 && bucket.calibrationGap < 0.15) {
      confidence = 'medium';
    } else {
      confidence = 'low';
    }

    return {
      calibratedProbability: Math.round(calibratedProbability * 1000) / 1000,
      confidence
    };
  }

  /**
   * Store calibration metrics for historical tracking
   */
  async storeCalibrationSnapshot(tenantId?: string): Promise<void> {
    const allPerformance = await this.getAllPredictionPerformance(90, tenantId);

    const insertQuery = `
      INSERT INTO prediction_calibration_history (
        tenant_id,
        prediction_type,
        measured_at,
        accuracy,
        precision_value,
        recall_value,
        f1_score,
        false_positive_rate,
        average_lead_time_hours,
        total_predictions,
        true_positives,
        false_positives,
        false_negatives,
        model_health,
        calibration_curve
      ) VALUES ($1, $2, NOW(), $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    `;

    for (const perf of allPerformance) {
      await this.pool.query(insertQuery, [
        tenantId,
        perf.predictionType,
        perf.metrics.accuracy,
        perf.metrics.precision,
        perf.metrics.recall,
        perf.metrics.f1Score,
        perf.metrics.falsePositiveRate,
        perf.metrics.averageLeadTime,
        perf.metrics.totalPredictions,
        perf.metrics.truePositives,
        perf.metrics.falsePositives,
        perf.metrics.falseNegatives,
        perf.modelHealth,
        JSON.stringify(perf.calibrationCurve)
      ]);
    }
  }
}

export default PredictionCalibrationService;
