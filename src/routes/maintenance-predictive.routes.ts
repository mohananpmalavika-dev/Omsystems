/**
 * Predictive Analytics API Routes
 * ML-based failure prediction, anomaly detection, and trend forecasting
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ControlPlaneStore } from '../control-plane-store.js';
import { initPredictiveAnalytics } from '../maintenance/predictive-analytics.js';

export async function registerPredictiveAnalyticsRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore
) {
  const predictiveService = initPredictiveAnalytics(store, app.log);

  // ========================================================================
  // Failure Prediction
  // ========================================================================

  /**
   * Predict asset failure
   */
  app.get('/v1/maintenance/predictive/failure/:assetId', async (request, reply) => {
    const params = z.object({
      assetId: z.string().uuid(),
    }).parse(request.params);

    const prediction = await predictiveService.predictAssetFailure(params.assetId);

    await store.writeAudit({
      tenantId: request.currentUser.tenantId,
      actorUserId: request.currentUser.id,
      action: 'maintenance.failure_prediction_viewed',
      resourceNodeId: params.assetId,
      outcome: 'success',
      details: {
        failureProbability: prediction.failureProbability,
        riskLevel: prediction.riskLevel,
      },
    });

    return prediction;
  });

  /**
   * Get high-risk assets
   */
  app.get('/v1/maintenance/predictive/high-risk-assets', async (request, reply) => {
    const query = z.object({
      riskThreshold: z.coerce.number().min(0).max(100).default(70),
      limit: z.coerce.number().min(1).max(100).default(20),
    }).parse(request.query);

    const tenantId = request.currentUser.tenantId;

    const predictions = await predictiveService.getHighRiskAssets({
      tenantId,
      riskThreshold: query.riskThreshold,
      limit: query.limit,
    });

    return {
      predictions,
      count: predictions.length,
      threshold: query.riskThreshold,
    };
  });

  /**
   * Predict all asset failures
   */
  app.get('/v1/maintenance/predictive/failure/all', async (request, reply) => {
    const tenantId = request.currentUser.tenantId;

    const predictions = await predictiveService.predictAllAssetFailures(tenantId);

    return {
      predictions,
      total: predictions.length,
      summary: {
        critical: predictions.filter(p => p.riskLevel === 'critical').length,
        high: predictions.filter(p => p.riskLevel === 'high').length,
        medium: predictions.filter(p => p.riskLevel === 'medium').length,
        low: predictions.filter(p => p.riskLevel === 'low').length,
      },
    };
  });

  // ========================================================================
  // Anomaly Detection
  // ========================================================================

  /**
   * Detect anomalies for asset
   */
  app.get('/v1/maintenance/predictive/anomalies/:assetId', async (request, reply) => {
    const params = z.object({
      assetId: z.string().uuid(),
    }).parse(request.params);

    const anomalies = await predictiveService.detectAnomalies(params.assetId);

    return {
      anomalies,
      count: anomalies.length,
      summary: {
        high: anomalies.filter(a => a.severity === 'high').length,
        medium: anomalies.filter(a => a.severity === 'medium').length,
        low: anomalies.filter(a => a.severity === 'low').length,
      },
    };
  });

  /**
   * Monitor anomalies for all assets
   */
  app.get('/v1/maintenance/predictive/anomalies', async (request, reply) => {
    const tenantId = request.currentUser.tenantId;

    const anomalies = await predictiveService.monitorAnomalies(tenantId);

    return {
      anomalies,
      total: anomalies.length,
      byType: {
        spike: anomalies.filter(a => a.anomalyType === 'spike').length,
        drop: anomalies.filter(a => a.anomalyType === 'drop').length,
        trendChange: anomalies.filter(a => a.anomalyType === 'trend-change').length,
        patternBreak: anomalies.filter(a => a.anomalyType === 'pattern-break').length,
      },
    };
  });

  // ========================================================================
  // Trend Forecasting
  // ========================================================================

  /**
   * Forecast metric for asset
   */
  app.get('/v1/maintenance/predictive/forecast/:assetId/:metricName', async (request, reply) => {
    const params = z.object({
      assetId: z.string().uuid(),
      metricName: z.string(),
    }).parse(request.params);

    const query = z.object({
      forecastDays: z.coerce.number().min(1).max(365).default(30),
    }).parse(request.query);

    const forecast = await predictiveService.forecastMetric({
      assetId: params.assetId,
      metricName: params.metricName,
      forecastDays: query.forecastDays,
    });

    return forecast;
  });

  /**
   * Forecast storage capacity
   */
  app.get('/v1/maintenance/predictive/forecast/storage-capacity', async (request, reply) => {
    const query = z.object({
      branchNodeId: z.string().uuid().optional(),
    }).parse(request.query);

    const tenantId = request.currentUser.tenantId;

    const forecasts = await predictiveService.forecastStorageCapacity({
      tenantId,
      branchNodeId: query.branchNodeId,
    });

    return {
      forecasts,
      count: forecasts.length,
    };
  });

  // ========================================================================
  // Health Scoring
  // ========================================================================

  /**
   * Calculate health score for asset
   */
  app.get('/v1/maintenance/predictive/health-score/:assetId', async (request, reply) => {
    const params = z.object({
      assetId: z.string().uuid(),
    }).parse(request.params);

    const healthScore = await predictiveService.calculateHealthScore(params.assetId);

    return healthScore;
  });

  /**
   * Calculate health scores for all assets
   */
  app.get('/v1/maintenance/predictive/health-score/all', async (request, reply) => {
    const tenantId = request.currentUser.tenantId;

    const healthScores = await predictiveService.calculateAllHealthScores(tenantId);

    return {
      healthScores,
      total: healthScores.length,
      average: healthScores.reduce((sum, hs) => sum + hs.overallScore, 0) / (healthScores.length || 1),
    };
  });

  // ========================================================================
  // Model Training & Optimization
  // ========================================================================

  /**
   * Train failure prediction model
   */
  app.post('/v1/maintenance/predictive/train/failure-model', async (request, reply) => {
    const body = z.object({
      historicalDays: z.number().min(30).max(730).default(365),
    }).parse(request.body);

    const tenantId = request.currentUser.tenantId;

    const result = await predictiveService.trainFailurePredictionModel({
      tenantId,
      historicalDays: body.historicalDays,
    });

    await store.writeAudit({
      tenantId,
      actorUserId: request.currentUser.id,
      action: 'maintenance.ml_model_trained',
      resourceNodeId: null,
      outcome: 'success',
      details: {
        modelId: result.modelId,
        accuracy: result.accuracy,
        historicalDays: body.historicalDays,
      },
    });

    return result;
  });

  /**
   * Update anomaly detection baseline
   */
  app.post('/v1/maintenance/predictive/update-baseline', async (request, reply) => {
    const body = z.object({
      assetCategory: z.string().optional(),
    }).parse(request.body);

    const tenantId = request.currentUser.tenantId;

    await predictiveService.updateAnomalyBaseline({
      tenantId,
      assetCategory: body.assetCategory,
    });

    return { success: true, message: 'Anomaly detection baseline updated' };
  });

  // ========================================================================
  // Dashboard Summary
  // ========================================================================

  /**
   * Get predictive analytics dashboard summary
   */
  app.get('/v1/maintenance/predictive/dashboard', async (request, reply) => {
    const tenantId = request.currentUser.tenantId;

    // In production, this would aggregate data from various sources
    const summary = {
      highRiskAssets: {
        count: 5,
        critical: 2,
        high: 3,
      },
      activeAnomalies: {
        count: 12,
        high: 3,
        medium: 6,
        low: 3,
      },
      capacityAlerts: {
        storageNearFull: 2,
        daysUntilFull: 45,
      },
      healthScores: {
        average: 87,
        below70: 3,
        below50: 1,
      },
      predictions: {
        failuresNext30Days: 2,
        failuresNext90Days: 5,
      },
      recommendations: [
        'Schedule maintenance for Camera 01 (failure risk: 78%)',
        'Storage unit ST-001 will reach capacity in 45 days',
        'Network device NW-003 showing abnormal packet loss',
        'Replace UPS battery for BR-002 (health score: 45)',
      ],
    };

    return summary;
  });
}
