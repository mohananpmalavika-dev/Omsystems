/**
 * Risk Engine (V1 - Explainable Rules)
 * 
 * Implements weighted rule-based risk scoring before ML.
 * Provides explainable predictions with clear factor contributions.
 */

import type {
  BranchHealthSnapshot,
  BranchHealthFeatures,
  BranchRiskPrediction,
  RiskFactor,
  RiskLevel,
  PredictionConfidence,
  PredictionTarget,
  PredictionRecommendation,
} from "./types.js";
import { randomUUID } from "node:crypto";

interface RiskWeights {
  hdd: number;
  network: number;
  cameras: number;
  storage: number;
  dvr: number;
  historical: number;
}

const DEFAULT_WEIGHTS: RiskWeights = {
  hdd: 0.25,
  network: 0.15,
  cameras: 0.15,
  storage: 0.20,
  dvr: 0.10,
  historical: 0.15,
};

export class RiskEngine {
  private readonly weights: RiskWeights;

  constructor(weights: Partial<RiskWeights> = {}) {
    this.weights = { ...DEFAULT_WEIGHTS, ...weights };
  }

  /**
   * Generate risk prediction from snapshot and features
   */
  async predict(
    snapshot: BranchHealthSnapshot,
    features: BranchHealthFeatures,
    horizonHours: number = 72
  ): Promise<BranchRiskPrediction> {
    const startTime = Date.now();

    // Calculate component risk scores
    const hddRisk = this.calculateHddRisk(snapshot, features);
    const networkRisk = this.calculateNetworkRisk(snapshot, features);
    const cameraRisk = this.calculateCameraRisk(snapshot, features);
    const storageRisk = this.calculateStorageRisk(snapshot, features);
    const dvrRisk = this.calculateDvrRisk(snapshot, features);
    const historicalRisk = this.calculateHistoricalRisk(snapshot, features);

    // Calculate weighted risk score (0-100)
    const weightedScore =
      hddRisk.score * this.weights.hdd +
      networkRisk.score * this.weights.network +
      cameraRisk.score * this.weights.cameras +
      storageRisk.score * this.weights.storage +
      dvrRisk.score * this.weights.dvr +
      historicalRisk.score * this.weights.historical;

    // Convert to probability (0-1)
    const probability = this.scoreToProbability(weightedScore, horizonHours);

    // Determine risk level
    const riskLevel = this.determineRiskLevel(probability);

    // Determine confidence based on data quality
    const confidence = this.determineConfidence(snapshot.dataQuality.qualityScore);

    // Build risk factors array
    const riskFactors = this.buildRiskFactors([
      hddRisk,
      networkRisk,
      cameraRisk,
      storageRisk,
      dvrRisk,
      historicalRisk,
    ]);

    // Identify protective factors
    const protectiveFactors = this.identifyProtectiveFactors(snapshot);

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      riskFactors,
      snapshot,
      probability
    );

    // Predict failure window
    const predictedWindow = this.predictFailureWindow(
      riskFactors,
      horizonHours
    );

    const prediction: BranchRiskPrediction = {
      id: randomUUID(),
      branchId: snapshot.branchId,
      tenantId: snapshot.tenantId,
      target: "RECORDING_FAILURE",
      horizonHours,
      probability,
      riskLevel,
      confidence,
      dataQuality: snapshot.dataQuality.qualityScore,
      predictedWindow,
      riskFactors,
      protectiveFactors,
      recommendations,
      primaryRiskDriver: riskFactors[0]?.factor || "Unknown",
      secondaryRiskDrivers: riskFactors.slice(1, 3).map((f) => f.factor),
      modelVersion: "rules-v1.0",
      modelType: "RULES",
      generatedAt: new Date(),
      expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 min
      metadata: {
        snapshotId: features.snapshotId,
        calculationTimeMs: Date.now() - startTime,
        featureCount: Object.keys(features).length,
      },
    };

    return prediction;
  }

  /**
   * Calculate HDD risk
   */
  private calculateHddRisk(
    snapshot: BranchHealthSnapshot,
    features: BranchHealthFeatures
  ): ComponentRisk {
    let score = 0;
    const evidence: string[] = [];

    // Current health score
    if (snapshot.hdd.healthScore < 50) {
      score += 60;
      evidence.push(`HDD health critically low: ${snapshot.hdd.healthScore}/100`);
    } else if (snapshot.hdd.healthScore < 70) {
      score += 40;
      evidence.push(`HDD health degraded: ${snapshot.hdd.healthScore}/100`);
    } else if (snapshot.hdd.healthScore < 90) {
      score += 20;
      evidence.push(`HDD health warning: ${snapshot.hdd.healthScore}/100`);
    }

    // SMART status
    if (snapshot.hdd.smartStatus === "FAIL") {
      score += 40;
      evidence.push("SMART status: FAIL");
    } else if (snapshot.hdd.smartStatus === "WARN") {
      score += 20;
      evidence.push("SMART status: WARNING");
    }

    // Degradation trends
    if (features.hddDegradationRate7d > 0.05) {
      score += 30;
      evidence.push(
        `HDD degrading rapidly: ${(features.hddDegradationRate7d * 100).toFixed(1)}% per day`
      );
    } else if (features.hddDegradationRate7d > 0.02) {
      score += 15;
      evidence.push(`HDD degradation detected: ${(features.hddDegradationRate7d * 100).toFixed(1)}% per day`);
    }

    // Reallocated sectors
    if (snapshot.hdd.reallocatedSectors && snapshot.hdd.reallocatedSectors > 50) {
      score += 25;
      evidence.push(`High reallocated sectors: ${snapshot.hdd.reallocatedSectors}`);
    }

    // Pending sectors (imminent failure)
    if (snapshot.hdd.pendingSectors && snapshot.hdd.pendingSectors > 0) {
      score += 30;
      evidence.push(`Pending sectors detected: ${snapshot.hdd.pendingSectors} (imminent failure risk)`);
    }

    // Acceleration
    if (features.hddErrorAcceleration > 0.1) {
      score += 20;
      evidence.push("HDD error rate accelerating");
    }

    return {
      component: "HDD degradation",
      score: Math.min(100, score),
      contribution: this.weights.hdd,
      evidence,
      severity: this.determineSeverity(score),
      currentValue: snapshot.hdd.healthScore,
      threshold: 70,
      trend: features.hddDegradationRate7d > 0.02 ? "DEGRADING" : "STABLE",
    };
  }

  /**
   * Calculate network risk
   */
  private calculateNetworkRisk(
    snapshot: BranchHealthSnapshot,
    features: BranchHealthFeatures
  ): ComponentRisk {
    let score = 0;
    const evidence: string[] = [];

    // Packet loss
    if (snapshot.network.packetLossPercent !== null) {
      if (snapshot.network.packetLossPercent > 5) {
        score += 40;
        evidence.push(`High packet loss: ${snapshot.network.packetLossPercent.toFixed(1)}%`);
      } else if (snapshot.network.packetLossPercent > 2) {
        score += 20;
        evidence.push(`Elevated packet loss: ${snapshot.network.packetLossPercent.toFixed(1)}%`);
      }
    }

    // Latency
    if (snapshot.network.latencyMs !== null) {
      if (snapshot.network.latencyMs > 200) {
        score += 30;
        evidence.push(`High latency: ${snapshot.network.latencyMs}ms`);
      } else if (snapshot.network.latencyMs > 100) {
        score += 15;
        evidence.push(`Elevated latency: ${snapshot.network.latencyMs}ms`);
      }
    }

    // Network trends
    if (features.networkPacketLossTrend > 0) {
      score += 20;
      evidence.push("Packet loss increasing");
    }
    if (features.networkLatencyTrend > 0) {
      score += 15;
      evidence.push("Latency increasing");
    }

    // Disconnects
    if (snapshot.network.disconnectCount > 10) {
      score += 25;
      evidence.push(`Frequent disconnects: ${snapshot.network.disconnectCount} in 24h`);
    } else if (snapshot.network.disconnectCount > 5) {
      score += 15;
      evidence.push(`Multiple disconnects: ${snapshot.network.disconnectCount} in 24h`);
    }

    return {
      component: "Network quality",
      score: Math.min(100, score),
      contribution: this.weights.network,
      evidence,
      severity: this.determineSeverity(score),
      currentValue: snapshot.network.packetLossPercent || 0,
      threshold: 2,
      trend: features.networkPacketLossTrend > 0 ? "DEGRADING" : "STABLE",
    };
  }

  private calculateCameraRisk(
    snapshot: BranchHealthSnapshot,
    features: BranchHealthFeatures
  ): ComponentRisk {
    let score = 0;
    const evidence: string[] = [];

    if (snapshot.cameras.total === 0) {
      return {
        component: "Camera instability",
        score: 0,
        contribution: this.weights.cameras,
        evidence: ["No cameras configured"],
        severity: "LOW",
        currentValue: 0,
        threshold: 20,
        trend: "STABLE",
      };
    }

    // Critical cameras offline
    if (snapshot.cameras.criticalOffline > 0) {
      score += 50;
      evidence.push(`${snapshot.cameras.criticalOffline} critical cameras offline`);
    }

    // General instability
    if (snapshot.cameras.instabilityScore > 30) {
      score += 30;
      evidence.push(`High camera instability: ${snapshot.cameras.instabilityScore.toFixed(1)}`);
    } else if (snapshot.cameras.instabilityScore > 20) {
      score += 20;
      evidence.push(`Camera instability detected: ${snapshot.cameras.instabilityScore.toFixed(1)}`);
    }

    // Offline rate
    const offlineRate = snapshot.cameras.offlineCount / snapshot.cameras.total;
    if (offlineRate > 0.15) {
      score += 25;
      evidence.push(`${(offlineRate * 100).toFixed(0)}% of cameras offline`);
    }

    // Reconnect frequency
    if (features.cameraReconnectFrequency > 0.5) {
      score += 20;
      evidence.push("Frequent camera reconnects");
    }

    return {
      component: "Camera instability",
      score: Math.min(100, score),
      contribution: this.weights.cameras,
      evidence,
      severity: this.determineSeverity(score),
      currentValue: snapshot.cameras.instabilityScore,
      threshold: 20,
      trend: "UNKNOWN",
    };
  }

  private calculateStorageRisk(
    snapshot: BranchHealthSnapshot,
    features: BranchHealthFeatures
  ): ComponentRisk {
    let score = 0;
    const evidence: string[] = [];

    // Days until exhaustion
    if (snapshot.storage.estimatedDaysRemaining < 7) {
      score += 60;
      evidence.push(`Storage exhaustion in ${snapshot.storage.estimatedDaysRemaining} days`);
    } else if (snapshot.storage.estimatedDaysRemaining < 14) {
      score += 40;
      evidence.push(`Low storage runway: ${snapshot.storage.estimatedDaysRemaining} days`);
    } else if (snapshot.storage.estimatedDaysRemaining < 30) {
      score += 20;
      evidence.push(`Storage warning: ${snapshot.storage.estimatedDaysRemaining} days remaining`);
    }

    // Retention risk
    if (features.storageRetentionRisk > 0.3) {
      score += 30;
      const currentRetention = snapshot.recording.retentionDays;
      const targetRetention = snapshot.recording.retentionTarget;
      evidence.push(`Retention at risk: ${currentRetention}/${targetRetention} days`);
    }

    // Growth acceleration
    if (features.storageGrowthAcceleration > 0.1) {
      score += 20;
      evidence.push("Storage consumption accelerating");
    }

    return {
      component: "Storage exhaustion",
      score: Math.min(100, score),
      contribution: this.weights.storage,
      evidence,
      severity: this.determineSeverity(score),
      currentValue: snapshot.storage.estimatedDaysRemaining,
      threshold: 30,
      trend: features.storageFillRate > 0 ? "DEGRADING" : "STABLE",
    };
  }

  private calculateDvrRisk(
    snapshot: BranchHealthSnapshot,
    features: BranchHealthFeatures
  ): ComponentRisk {
    let score = 0;
    const evidence: string[] = [];

    // Temperature
    if (snapshot.dvr.temperatureC !== null && snapshot.dvr.temperatureC > 65) {
      score += 40;
      evidence.push(`Critical DVR temperature: ${snapshot.dvr.temperatureC}°C`);
    } else if (snapshot.dvr.temperatureC !== null && snapshot.dvr.temperatureC > 60) {
      score += 25;
      evidence.push(`High DVR temperature: ${snapshot.dvr.temperatureC}°C`);
    }

    // Restarts
    if (snapshot.dvr.restartCount24h > 3) {
      score += 35;
      evidence.push(`Frequent DVR restarts: ${snapshot.dvr.restartCount24h} in 24h`);
    } else if (snapshot.dvr.restartCount24h > 1) {
      score += 20;
      evidence.push(`DVR restarted ${snapshot.dvr.restartCount24h} times in 24h`);
    }

    // Recording engine state
    if (snapshot.dvr.recordingEngineState === "STOPPED") {
      score += 50;
      evidence.push("Recording engine stopped");
    } else if (snapshot.dvr.recordingEngineState === "DEGRADED") {
      score += 30;
      evidence.push("Recording engine degraded");
    }

    // Resource utilization
    if (features.dvrResourceUtilization > 90) {
      score += 25;
      evidence.push(`High DVR resource usage: ${features.dvrResourceUtilization.toFixed(0)}%`);
    }

    return {
      component: "DVR thermal/stability",
      score: Math.min(100, score),
      contribution: this.weights.dvr,
      evidence,
      severity: this.determineSeverity(score),
      currentValue: snapshot.dvr.temperatureC || 0,
      threshold: 60,
      trend: "UNKNOWN",
    };
  }

  private calculateHistoricalRisk(
    snapshot: BranchHealthSnapshot,
    features: BranchHealthFeatures
  ): ComponentRisk {
    let score = 0;
    const evidence: string[] = [];

    // Recent failures
    if (snapshot.historical.failures30d > 3) {
      score += 40;
      evidence.push(`${snapshot.historical.failures30d} failures in last 30 days`);
    } else if (snapshot.historical.failures30d > 1) {
      score += 20;
      evidence.push(`${snapshot.historical.failures30d} failures in last 30 days`);
    }

    // Failure recency
    if (features.failureRecency > 0.7) {
      score += 25;
      evidence.push("Recent failure detected");
    }

    // Repeated component failures
    if (snapshot.historical.repeatedComponentFailures.length > 0) {
      score += 15 * snapshot.historical.repeatedComponentFailures.length;
      evidence.push(`Repeated failures: ${snapshot.historical.repeatedComponentFailures.join(", ")}`);
    }

    // Low MTBF
    if (features.mtbf !== null && features.mtbf < 30) {
      score += 30;
      evidence.push(`Low mean time between failures: ${features.mtbf.toFixed(1)} days`);
    }

    return {
      component: "Historical failures",
      score: Math.min(100, score),
      contribution: this.weights.historical,
      evidence,
      severity: this.determineSeverity(score),
      currentValue: snapshot.historical.failures30d,
      threshold: 1,
      trend: features.failureFrequency30d > features.failureFrequency90d ? "DEGRADING" : "STABLE",
    };
  }

  private scoreToProbability(score: number, horizonHours: number): number {
    // Convert 0-100 score to 0-1 probability
    // Adjust based on time horizon (longer = higher probability)
    const baseProbability = score / 100;
    const horizonFactor = Math.log10(horizonHours / 24 + 1) + 1;
    return Math.min(0.99, baseProbability * horizonFactor);
  }

  private determineRiskLevel(probability: number): RiskLevel {
    if (probability >= 0.75) return "CRITICAL";
    if (probability >= 0.50) return "HIGH";
    if (probability >= 0.25) return "MEDIUM";
    if (probability >= 0.10) return "LOW";
    return "HEALTHY";
  }

  private determineConfidence(dataQuality: number): PredictionConfidence {
    if (dataQuality >= 0.85) return "HIGH";
    if (dataQuality >= 0.65) return "MEDIUM";
    return "LOW";
  }

  private determineSeverity(score: number): "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" {
    if (score >= 75) return "CRITICAL";
    if (score >= 50) return "HIGH";
    if (score >= 25) return "MEDIUM";
    return "LOW";
  }

  private buildRiskFactors(componentRisks: ComponentRisk[]): RiskFactor[] {
    return componentRisks
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score * b.contribution - a.score * a.contribution)
      .map((risk) => ({
        factor: risk.component,
        contribution: (risk.score / 100) * risk.contribution,
        direction: "INCREASES_RISK" as const,
        currentValue: risk.currentValue,
        threshold: risk.threshold,
        trend: risk.trend,
        evidence: risk.evidence,
        severity: risk.severity,
      }));
  }

  private identifyProtectiveFactors(snapshot: BranchHealthSnapshot): RiskFactor[] {
    const factors: RiskFactor[] = [];

    if (snapshot.hdd.healthScore > 90) {
      factors.push({
        factor: "Healthy HDD",
        contribution: 0.1,
        direction: "REDUCES_RISK",
        currentValue: snapshot.hdd.healthScore,
        threshold: 90,
        trend: "STABLE",
        evidence: [`HDD health excellent: ${snapshot.hdd.healthScore}/100`],
        severity: "LOW",
      });
    }

    if (snapshot.storage.estimatedDaysRemaining > 90) {
      factors.push({
        factor: "Ample storage",
        contribution: 0.08,
        direction: "REDUCES_RISK",
        currentValue: snapshot.storage.estimatedDaysRemaining,
        threshold: 90,
        trend: "STABLE",
        evidence: [`${snapshot.storage.estimatedDaysRemaining} days of storage remaining`],
        severity: "LOW",
      });
    }

    return factors;
  }

  private generateRecommendations(
    riskFactors: RiskFactor[],
    snapshot: BranchHealthSnapshot,
    probability: number
  ): PredictionRecommendation[] {
    const recommendations: PredictionRecommendation[] = [];
    let priority = 1;

    for (const factor of riskFactors.slice(0, 3)) {
      if (factor.severity === "CRITICAL" || factor.severity === "HIGH") {
        const rec = this.createRecommendation(factor, snapshot, priority++, probability);
        if (rec) recommendations.push(rec);
      }
    }

    return recommendations;
  }

  private createRecommendation(
    factor: RiskFactor,
    snapshot: BranchHealthSnapshot,
    priority: number,
    probability: number
  ): PredictionRecommendation | null {
    const baseId = `${snapshot.branchId}-${factor.factor.replace(/\s+/g, "-")}`;

    if (factor.factor.includes("HDD")) {
      return {
        id: baseId,
        priority,
        action: "Inspect and replace DVR HDD",
        reason: factor.evidence.join("; "),
        expectedImpact: "Eliminate primary recording failure risk",
        riskReduction: factor.contribution,
        timeframe: probability > 0.75 ? "within 24 hours" : "within 72 hours",
        cost: "MEDIUM",
        requiredPermission: "device:configure",
      };
    }

    if (factor.factor.includes("Storage")) {
      return {
        id: baseId,
        priority,
        action: "Expand storage or reduce retention",
        reason: factor.evidence.join("; "),
        expectedImpact: "Prevent storage exhaustion",
        riskReduction: factor.contribution,
        timeframe: "within 7 days",
        cost: "MEDIUM",
        requiredPermission: "device:configure",
      };
    }

    if (factor.factor.includes("Network")) {
      return {
        id: baseId,
        priority,
        action: "Investigate network connectivity",
        reason: factor.evidence.join("; "),
        expectedImpact: "Restore stable network connection",
        riskReduction: factor.contribution,
        timeframe: "within 48 hours",
        cost: "LOW",
        requiredPermission: "device:configure",
      };
    }

    return null;
  }

  private predictFailureWindow(
    riskFactors: RiskFactor[],
    horizonHours: number
  ): BranchRiskPrediction["predictedWindow"] {
    if (riskFactors.length === 0) return undefined;

    const now = new Date();
    const primaryFactor = riskFactors[0];

    if (!primaryFactor) return undefined;

    // Estimate based on primary risk factor
    let hoursUntilFailure = horizonHours * 0.5; // Default: midpoint

    if (primaryFactor.factor.includes("HDD") && primaryFactor.severity === "CRITICAL") {
      hoursUntilFailure = horizonHours * 0.4; // Earlier failure expected
    } else if (primaryFactor.factor.includes("Storage")) {
      hoursUntilFailure = horizonHours * 0.6; // More predictable timeline
    }

    const windowStart = new Date(now.getTime() + hoursUntilFailure * 0.7 * 60 * 60 * 1000);
    const windowEnd = new Date(now.getTime() + hoursUntilFailure * 1.3 * 60 * 60 * 1000);
    const mostLikely = new Date(now.getTime() + hoursUntilFailure * 60 * 60 * 1000);

    return { start: windowStart, end: windowEnd, mostLikely };
  }
}

interface ComponentRisk {
  component: string;
  score: number;
  contribution: number;
  evidence: string[];
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  currentValue: number | string;
  threshold: number | string | null;
  trend: "IMPROVING" | "STABLE" | "DEGRADING" | "UNKNOWN";
}
