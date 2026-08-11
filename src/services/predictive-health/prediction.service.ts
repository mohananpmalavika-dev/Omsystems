/**
 * Prediction Service
 * 
 * Main orchestration service for predictive branch health.
 * Coordinates snapshot generation, feature extraction, and risk prediction.
 */

import { randomUUID } from "node:crypto";
import type { ControlPlaneStore } from "../../control-plane-store.js";
import type { User } from "../../domain/models.js";
import { SnapshotService } from "./snapshot.service.js";
import { FeatureEngine } from "./feature-engine.js";
import { RiskEngine } from "./risk-engine.js";
import type {
  BranchRiskPrediction,
  FleetRiskSummary,
  BranchRiskHistory,
  PredictionOptions,
  PredictionTarget,
} from "./types.js";

export class PredictionService {
  private readonly snapshotService: SnapshotService;
  private readonly featureEngine: FeatureEngine;
  private readonly riskEngine: RiskEngine;

  constructor(private readonly store: ControlPlaneStore) {
    this.snapshotService = new SnapshotService(store);
    this.featureEngine = new FeatureEngine(store);
    this.riskEngine = new RiskEngine();
  }

  /**
   * Generate risk predictions for a branch across multiple horizons
   */
  async predictBranchRisk(
    tenantId: string,
    branchId: string,
    options: PredictionOptions = {}
  ): Promise<BranchRiskPrediction[]> {
    // Generate current health snapshot
    const snapshot = await this.snapshotService.generateSnapshot(
      tenantId,
      branchId,
      {
        includeHistorical: options.includeHistorical !== false,
      }
    );

    // Get historical snapshots for trend analysis
    const historicalSnapshots = await this.getHistoricalSnapshots(
      branchId,
      30 // last 30 days
    );

    // Extract features
    const features = await this.featureEngine.extractFeatures(
      snapshot,
      historicalSnapshots
    );

    // Generate predictions for multiple horizons
    const horizons = options.horizons || [24, 72, 168]; // 24h, 72h, 7d
    const predictions: BranchRiskPrediction[] = [];

    for (const horizon of horizons) {
      const prediction = await this.riskEngine.predict(
        snapshot,
        features,
        horizon
      );
      predictions.push(prediction);
    }

    // Store predictions
    await this.storePredictions(predictions);

    return predictions;
  }

  /**
   * Get the latest prediction for a branch
   */
  async getPrediction(
    predictionId: string,
    tenantId: string
  ): Promise<BranchRiskPrediction | null> {
    const result = await this.store.execute(
      `SELECT prediction_data FROM branch_risk_predictions 
       WHERE id = $1 AND tenant_id = $2`,
      [predictionId, tenantId]
    );

    if (result.rows.length === 0) return null;
    return result.rows[0].prediction_data as BranchRiskPrediction;
  }

  /**
   * Get latest predictions for a branch by horizon
   */
  async getLatestPredictions(
    branchId: string,
    tenantId: string
  ): Promise<BranchRiskPrediction[]> {
    const result = await this.store.execute(
      `SELECT DISTINCT ON (horizon_hours) prediction_data
       FROM branch_risk_predictions
       WHERE branch_id = $1 AND tenant_id = $2 AND expires_at > NOW()
       ORDER BY horizon_hours, created_at DESC`,
      [branchId, tenantId]
    );

    return result.rows.map((r) => r.prediction_data as BranchRiskPrediction);
  }

  /**
   * Get fleet-wide risk summary
   */
  async getFleetSummary(
    user: User,
    options: { limit?: number } = {}
  ): Promise<FleetRiskSummary> {
    const limit = options.limit || 20;

    // Get all branches accessible to user
    const branches = await this.store.listAccessibleNodes(
      user,
      "recording:view",
      "branch"
    );

    // Get latest predictions for each branch
    const branchPredictions = await Promise.all(
      branches.map(async (branch) => {
        const predictions = await this.getLatestPredictions(
          branch.id,
          user.tenantId
        );
        const prediction72h = predictions.find((p) => p.horizonHours === 72);
        return { branch, prediction: prediction72h };
      })
    );

    // Calculate risk distribution
    const riskDistribution = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      healthy: 0,
    };

    for (const { prediction } of branchPredictions) {
      if (!prediction) {
        riskDistribution.healthy++;
        continue;
      }

      const level = prediction.riskLevel.toLowerCase() as keyof typeof riskDistribution;
      riskDistribution[level]++;
    }

    // Get top risks
    const topRisks = branchPredictions
      .filter((bp) => bp.prediction !== undefined)
      .sort((a, b) => b.prediction!.probability - a.prediction!.probability)
      .slice(0, limit)
      .map(({ branch, prediction }) => ({
        branchId: branch.id,
        branchName: branch.name,
        riskLevel: prediction!.riskLevel,
        probability: prediction!.probability,
        target: prediction!.target,
        primaryDriver: prediction!.primaryRiskDriver,
        urgency: prediction!.predictedWindow
          ? Math.round(
              (prediction!.predictedWindow.mostLikely.getTime() - Date.now()) /
                (1000 * 60 * 60)
            )
          : prediction!.horizonHours,
      }));

    // Count predicted failures by horizon
    const predictedFailures24h = branchPredictions.filter(
      (bp) =>
        bp.prediction && bp.prediction.horizonHours === 24 && bp.prediction.probability > 0.5
    ).length;

    const predictedFailures72h = branchPredictions.filter(
      (bp) =>
        bp.prediction && bp.prediction.horizonHours === 72 && bp.prediction.probability > 0.5
    ).length;

    const predictedFailures7d = branchPredictions.filter(
      (bp) =>
        bp.prediction && bp.prediction.horizonHours === 168 && bp.prediction.probability > 0.5
    ).length;

    return {
      tenantId: user.tenantId,
      generatedAt: new Date(),
      totalBranches: branches.length,
      riskDistribution,
      topRisks,
      predictedFailures24h,
      predictedFailures72h,
      predictedFailures7d,
      trends: {
        riskIncreasing: 0, // TODO: Calculate from historical
        riskDecreasing: 0,
        riskStable: 0,
      },
    };
  }

  /**
   * Get risk history for a branch
   */
  async getBranchRiskHistory(
    branchId: string,
    tenantId: string,
    days: number = 30
  ): Promise<BranchRiskHistory> {
    const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const end = new Date();

    const result = await this.store.execute(
      `SELECT prediction_data, created_at
       FROM branch_risk_predictions
       WHERE branch_id = $1 AND tenant_id = $2 
         AND created_at BETWEEN $3 AND $4
         AND horizon_hours = 72
       ORDER BY created_at ASC`,
      [branchId, tenantId, start, end]
    );

    const predictions = result.rows.map((r) => ({
      timestamp: new Date(r.created_at),
      probability: (r.prediction_data as BranchRiskPrediction).probability,
      riskLevel: (r.prediction_data as BranchRiskPrediction).riskLevel,
      primaryDriver: (r.prediction_data as BranchRiskPrediction).primaryRiskDriver,
    }));

    // Get failure events
    const allIncidents = await this.store.listIncidents(tenantId, {
      branchId,
      from: start.toISOString(),
    });

    // Filter for critical and high severity
    const incidents = allIncidents.filter(inc => 
      inc.severity === "critical" || inc.severity === "high"
    );

    const events = incidents.map((inc) => ({
      timestamp: new Date(inc.occurredAt),
      type: "FAILURE" as const,
      description: inc.title,
    }));

    return {
      branchId,
      period: { start, end },
      predictions,
      events,
    };
  }

  /**
   * Store predictions in database
   */
  private async storePredictions(
    predictions: BranchRiskPrediction[]
  ): Promise<void> {
    for (const prediction of predictions) {
      await this.store.execute(
        `INSERT INTO branch_risk_predictions (
          id, tenant_id, branch_id, target, horizon_hours,
          probability, risk_level, confidence, data_quality,
          predicted_window_start, predicted_window_end,
          model_version, model_type, prediction_data, expires_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [
          prediction.id,
          prediction.tenantId,
          prediction.branchId,
          prediction.target,
          prediction.horizonHours,
          prediction.probability,
          prediction.riskLevel,
          prediction.confidence,
          prediction.dataQuality,
          prediction.predictedWindow?.start || null,
          prediction.predictedWindow?.end || null,
          prediction.modelVersion,
          prediction.modelType,
          JSON.stringify(prediction),
          prediction.expiresAt,
        ]
      );
    }
  }

  /**
   * Get historical snapshots for trend analysis
   */
  private async getHistoricalSnapshots(
    branchId: string,
    days: number
  ): Promise<any[]> {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const result = await this.store.execute(
      `SELECT snapshot_data FROM branch_health_snapshots
       WHERE branch_id = $1 AND timestamp >= $2
       ORDER BY timestamp DESC`,
      [branchId, cutoff]
    );

    return result.rows.map((r) => r.snapshot_data);
  }
}
