/**
 * Prediction Service
 * 
 * Main orchestration service for predictive branch health.
 * Coordinates snapshot generation, feature extraction, and risk prediction.
 */

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
  BranchHealthSnapshot,
} from "./types.js";

export class PredictionService {
  private readonly snapshotService: SnapshotService;
  private readonly featureEngine: FeatureEngine;
  private readonly riskEngine: RiskEngine;
  private readonly memoryPredictions = new Map<string, BranchRiskPrediction[]>();
  private readonly memorySnapshots = new Map<string, BranchHealthSnapshot[]>();

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
      tenantId,
      branchId,
      30 // last 30 days
    );

    // Do not turn absent telemetry into a reassuring or alarming forecast.
    // A prediction is actionable only when enough real sources are present.
    if (snapshot.dataQuality.qualityScore < 0.35) {
      return [];
    }

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
    const snapshotKey = `${tenantId}:${branchId}`;
    this.memorySnapshots.set(snapshotKey, [
      ...(this.memorySnapshots.get(snapshotKey) ?? []),
      snapshot,
    ].slice(-500));

    return predictions;
  }

  /**
   * Get the latest prediction for a branch
   */
  async getPrediction(
    predictionId: string,
    tenantId: string
  ): Promise<BranchRiskPrediction | null> {
    const values = await this.getLatestPredictionsForTenant(tenantId, predictionId);
    return values.find((prediction) => prediction.id === predictionId) ?? null;
  }

  /**
   * Get latest predictions for a branch by horizon
   */
  async getLatestPredictions(
    branchId: string,
    tenantId: string
  ): Promise<BranchRiskPrediction[]> {
    const db = this.database();
    if (db) {
      const result = await db.query(
        `SELECT DISTINCT ON (horizon_hours) prediction_data FROM branch_risk_predictions
         WHERE tenant_id=$1 AND branch_id=$2 AND expires_at > now()
         ORDER BY horizon_hours, generated_at DESC`,
        [tenantId, branchId],
      );
      return result.rows.map((row: any) => hydratePrediction(row.prediction_data));
    }
    return (this.memoryPredictions.get(`${tenantId}:${branchId}`) ?? []).filter((prediction) => prediction.expiresAt > new Date());
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

    const db = this.database();
    const predictions = db
      ? (await db.query(
          `SELECT prediction_data FROM branch_risk_predictions
           WHERE tenant_id=$1 AND branch_id=$2 AND generated_at >= $3
           ORDER BY generated_at ASC`,
          [tenantId, branchId, start],
        )).rows.map((row: any) => hydratePrediction(row.prediction_data))
      : (this.memoryPredictions.get(`${tenantId}:${branchId}`) ?? [])
          .filter((prediction) => prediction.generatedAt >= start)
          .map((prediction) => ({ ...prediction }));

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
    if (predictions.length === 0) return;
    const db = this.database();
    if (db) {
      for (const prediction of predictions) {
        await db.query(
          `INSERT INTO branch_risk_predictions
            (id, tenant_id, branch_id, horizon_hours, probability, risk_level, confidence, data_quality, prediction_data, generated_at, expires_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11)`,
          [prediction.id, prediction.tenantId, prediction.branchId, prediction.horizonHours, prediction.probability,
            prediction.riskLevel, prediction.confidence, prediction.dataQuality, JSON.stringify(prediction), prediction.generatedAt, prediction.expiresAt],
        );
      }
      return;
    }
    this.memoryPredictions.set(`${predictions[0]!.tenantId}:${predictions[0]!.branchId}`, predictions);
  }

  /**
   * Get historical snapshots for trend analysis
   */
  private async getHistoricalSnapshots(
    tenantId: string,
    branchId: string,
    days: number
  ): Promise<any[]> {
    const db = this.database();
    if (db) {
      const result = await db.query(
        `SELECT snapshot_data FROM branch_health_prediction_snapshots
         WHERE tenant_id=$1 AND branch_id=$2 AND captured_at >= now() - ($3::int * interval '1 day')
         ORDER BY captured_at ASC`,
        [tenantId, branchId, days],
      );
      return result.rows.map((row: any) => hydrateSnapshot(row.snapshot_data));
    }
    return (this.memorySnapshots.get(`${tenantId}:${branchId}`) ?? []).filter((snapshot) => snapshot.timestamp >= new Date(Date.now() - days * 86_400_000));
  }

  private database(): { query: (sql: string, values: unknown[]) => Promise<{ rows: any[] }> } | undefined {
    return (this.store as any).db ?? (typeof (this.store as any).query === "function" ? this.store as any : undefined);
  }

  private async getLatestPredictionsForTenant(tenantId: string, predictionId: string) {
    const db = this.database();
    if (!db) return [...this.memoryPredictions.values()].flat().filter((prediction) => prediction.tenantId === tenantId);
    const result = await db.query(`SELECT prediction_data FROM branch_risk_predictions WHERE tenant_id=$1 AND id=$2`, [tenantId, predictionId]);
    return result.rows.map((row: any) => hydratePrediction(row.prediction_data));
  }
}

function hydratePrediction(value: any): BranchRiskPrediction {
  const prediction = typeof value === "string" ? JSON.parse(value) : value;
  return { ...prediction, generatedAt: new Date(prediction.generatedAt), expiresAt: new Date(prediction.expiresAt), predictedWindow: prediction.predictedWindow ? {
    start: new Date(prediction.predictedWindow.start), end: new Date(prediction.predictedWindow.end), mostLikely: new Date(prediction.predictedWindow.mostLikely),
  } : undefined };
}

function hydrateSnapshot(value: any): BranchHealthSnapshot {
  const snapshot = typeof value === "string" ? JSON.parse(value) : value;
  return { ...snapshot, timestamp: new Date(snapshot.timestamp), historical: { ...snapshot.historical, lastFailureDate: snapshot.historical?.lastFailureDate ? new Date(snapshot.historical.lastFailureDate) : null } };
}
