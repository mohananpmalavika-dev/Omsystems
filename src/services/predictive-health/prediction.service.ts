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
    // TODO: Implement database query when schema is available
    // For now, predictions are computed on-demand
    return null;
  }

  /**
   * Get latest predictions for a branch by horizon
   */
  async getLatestPredictions(
    branchId: string,
    tenantId: string
  ): Promise<BranchRiskPrediction[]> {
    // TODO: Implement database query when schema is available
    // For now, predictions are computed on-demand
    return [];
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

    // TODO: Implement database query when schema is available
    const predictions: BranchRiskHistory["predictions"] = [];

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
    // TODO: Implement database persistence when schema is available
    // For now, predictions are computed on-demand and not persisted
    console.debug(`Generated ${predictions.length} predictions (not persisted)`);
  }

  /**
   * Get historical snapshots for trend analysis
   */
  private async getHistoricalSnapshots(
    branchId: string,
    days: number
  ): Promise<any[]> {
    // TODO: Implement database query when schema is available
    // For now, snapshots are computed on-demand and not persisted
    return [];
  }
}
