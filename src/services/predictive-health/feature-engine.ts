/**
 * Feature Engineering Service
 * 
 * Derives predictive features from raw health snapshots.
 * Calculates trends, rates of change, and composite indicators.
 */

import type { ControlPlaneStore } from "../../control-plane-store.js";
import type { BranchHealthSnapshot, BranchHealthFeatures } from "./types.js";

export class FeatureEngine {
  constructor(private readonly store: ControlPlaneStore) {}

  /**
   * Extract features from current snapshot and historical data
   */
  async extractFeatures(
    snapshot: BranchHealthSnapshot,
    historicalSnapshots: BranchHealthSnapshot[] = []
  ): Promise<BranchHealthFeatures> {
    return {
      snapshotId: this.generateSnapshotId(snapshot),
      branchId: snapshot.branchId,
      timestamp: snapshot.timestamp,
      
      // HDD features
      ...this.extractHddFeatures(snapshot, historicalSnapshots),
      
      // Network features
      ...this.extractNetworkFeatures(snapshot, historicalSnapshots),
      
      // Camera features
      ...this.extractCameraFeatures(snapshot, historicalSnapshots),
      
      // Storage features
      ...this.extractStorageFeatures(snapshot, historicalSnapshots),
      
      // DVR features
      ...this.extractDvrFeatures(snapshot, historicalSnapshots),
      
      // Historical features
      ...this.extractHistoricalFeatures(snapshot),
      
      // Composite features
      ...this.extractCompositeFeatures(snapshot, historicalSnapshots),
    };
  }

  /**
   * Extract HDD degradation features
   */
  private extractHddFeatures(
    snapshot: BranchHealthSnapshot,
    historical: BranchHealthSnapshot[]
  ): Pick<
    BranchHealthFeatures,
    | "hddHealthScore"
    | "hddDegradationRate7d"
    | "hddDegradationRate30d"
    | "hddTemperatureTrend"
    | "hddReallocatedSectorsTrend"
    | "hddPendingSectorsTrend"
    | "hddErrorAcceleration"
  > {
    const hddHealthScore = snapshot.hdd.healthScore;

    // Calculate degradation rates
    const last7d = this.filterByTimeWindow(historical, 7);
    const last30d = this.filterByTimeWindow(historical, 30);

    const hddDegradationRate7d = this.calculateDegradationRate(
      last7d.map((s) => ({ time: s.timestamp, value: s.hdd.healthScore }))
    );

    const hddDegradationRate30d = this.calculateDegradationRate(
      last30d.map((s) => ({ time: s.timestamp, value: s.hdd.healthScore }))
    );

    // Temperature trend
    const hddTemperatureTrend = this.calculateTrend(
      last7d
        .filter((s) => s.hdd.temperatureC !== null)
        .map((s) => ({ time: s.timestamp, value: s.hdd.temperatureC! }))
    );

    // Reallocated sectors trend (critical indicator)
    const hddReallocatedSectorsTrend = this.calculateTrend(
      last30d
        .filter((s) => s.hdd.reallocatedSectors !== null)
        .map((s) => ({ time: s.timestamp, value: s.hdd.reallocatedSectors! }))
    );

    // Pending sectors trend (imminent failure)
    const hddPendingSectorsTrend = this.calculateTrend(
      last7d
        .filter((s) => s.hdd.pendingSectors !== null)
        .map((s) => ({ time: s.timestamp, value: s.hdd.pendingSectors! }))
    );

    // Error acceleration (2nd derivative)
    const totalErrors = last30d.map((s) => ({
      time: s.timestamp,
      value: (s.hdd.readErrors || 0) + (s.hdd.writeErrors || 0),
    }));
    const hddErrorAcceleration = this.calculateAcceleration(totalErrors);

    return {
      hddHealthScore,
      hddDegradationRate7d,
      hddDegradationRate30d,
      hddTemperatureTrend,
      hddReallocatedSectorsTrend,
      hddPendingSectorsTrend,
      hddErrorAcceleration,
    };
  }

  /**
   * Extract network degradation features
   */
  private extractNetworkFeatures(
    snapshot: BranchHealthSnapshot,
    historical: BranchHealthSnapshot[]
  ): Pick<
    BranchHealthFeatures,
    | "networkLatencyTrend"
    | "networkPacketLossTrend"
    | "networkDisconnectRate"
    | "networkDegradationScore"
    | "networkStability"
  > {
    const last7d = this.filterByTimeWindow(historical, 7);

    // Latency trend
    const networkLatencyTrend = this.calculateTrend(
      last7d
        .filter((s) => s.network.latencyMs !== null)
        .map((s) => ({ time: s.timestamp, value: s.network.latencyMs! }))
    );

    // Packet loss trend
    const networkPacketLossTrend = this.calculateTrend(
      last7d
        .filter((s) => s.network.packetLossPercent !== null)
        .map((s) => ({ time: s.timestamp, value: s.network.packetLossPercent! }))
    );

    // Disconnect rate (disconnects per day)
    const networkDisconnectRate =
      last7d.length > 0
        ? last7d.reduce((sum, s) => sum + s.network.disconnectCount, 0) /
          Math.max(1, last7d.length)
        : 0;

    // Network degradation score (0-100)
    const networkDegradationScore = this.calculateNetworkDegradationScore(
      snapshot,
      { latencyTrend: networkLatencyTrend, packetLossTrend: networkPacketLossTrend }
    );

    // Network stability (inverse of variance)
    const uptimeValues = last7d.map((s) => s.network.uptimePercent);
    const networkStability = this.calculateStability(uptimeValues);

    return {
      networkLatencyTrend,
      networkPacketLossTrend,
      networkDisconnectRate,
      networkDegradationScore,
      networkStability,
    };
  }

  /**
   * Extract camera instability features
   */
  private extractCameraFeatures(
    snapshot: BranchHealthSnapshot,
    historical: BranchHealthSnapshot[]
  ): Pick<
    BranchHealthFeatures,
    | "cameraInstabilityScore"
    | "cameraOfflineRate"
    | "cameraReconnectFrequency"
    | "cameraVideoLossRate"
    | "criticalCameraRisk"
  > {
    const last7d = this.filterByTimeWindow(historical, 7);

    const cameraInstabilityScore = snapshot.cameras.instabilityScore;

    // Calculate rates
    const totalCameras = snapshot.cameras.total || 1;
    const cameraOfflineRate = snapshot.cameras.offlineCount / totalCameras;
    const cameraReconnectFrequency = snapshot.cameras.reconnectCount24h / totalCameras;
    const cameraVideoLossRate = snapshot.cameras.videoLossCount24h / totalCameras;

    // Critical camera risk (weighted by criticality)
    const criticalCameraRisk =
      snapshot.cameras.criticalOffline > 0
        ? (snapshot.cameras.criticalOffline / totalCameras) * 100
        : 0;

    return {
      cameraInstabilityScore,
      cameraOfflineRate,
      cameraReconnectFrequency,
      cameraVideoLossRate,
      criticalCameraRisk,
    };
  }

  /**
   * Extract storage exhaustion features
   */
  private extractStorageFeatures(
    snapshot: BranchHealthSnapshot,
    historical: BranchHealthSnapshot[]
  ): Pick<
    BranchHealthFeatures,
    | "storageFillRate"
    | "storageExhaustionDays"
    | "storageRetentionRisk"
    | "storageGrowthAcceleration"
  > {
    const last30d = this.filterByTimeWindow(historical, 30);

    // Fill rate (percent per day)
    const usageValues = last30d.map((s) => ({
      time: s.timestamp,
      value: s.storage.usedPercent,
    }));
    const storageFillRate = this.calculateTrend(usageValues);

    // Days until exhaustion
    const storageExhaustionDays = snapshot.storage.estimatedDaysRemaining;

    // Retention risk (retention below policy)
    const retentionGap =
      snapshot.recording.retentionTarget - snapshot.recording.retentionDays;
    const storageRetentionRisk = Math.max(0, retentionGap) / snapshot.recording.retentionTarget;

    // Growth acceleration
    const storageGrowthAcceleration = this.calculateAcceleration(usageValues);

    return {
      storageFillRate,
      storageExhaustionDays,
      storageRetentionRisk,
      storageGrowthAcceleration,
    };
  }

  /**
   * Extract DVR health features
   */
  private extractDvrFeatures(
    snapshot: BranchHealthSnapshot,
    historical: BranchHealthSnapshot[]
  ): Pick<
    BranchHealthFeatures,
    | "dvrThermalRisk"
    | "dvrResourceUtilization"
    | "dvrStability"
    | "dvrRestartFrequency"
  > {
    const last7d = this.filterByTimeWindow(historical, 7);

    // Thermal risk
    const dvrThermalRisk = this.calculateThermalRisk(snapshot.dvr.temperatureC);

    // Resource utilization (composite of CPU + memory)
    const dvrResourceUtilization =
      ((snapshot.dvr.cpuPercent || 0) + (snapshot.dvr.memoryPercent || 0)) / 2;

    // DVR stability (based on uptime and restarts)
    const dvrStability = this.calculateDvrStability(
      snapshot.dvr.uptimeHours,
      snapshot.dvr.restartCount24h
    );

    // Restart frequency
    const dvrRestartFrequency = snapshot.dvr.restartCount24h;

    return {
      dvrThermalRisk,
      dvrResourceUtilization,
      dvrStability,
      dvrRestartFrequency,
    };
  }

  /**
   * Extract historical failure features
   */
  private extractHistoricalFeatures(
    snapshot: BranchHealthSnapshot
  ): Pick<
    BranchHealthFeatures,
    | "failureFrequency30d"
    | "failureFrequency90d"
    | "failureRecency"
    | "componentFailurePattern"
    | "mtbf"
  > {
    const hist = snapshot.historical;

    // Failure frequencies (normalized)
    const failureFrequency30d = hist.failures30d / 30;
    const failureFrequency90d = hist.failures90d / 90;

    // Recency score (higher = more recent failure)
    const daysSinceFailure = hist.lastFailureDate
      ? (Date.now() - hist.lastFailureDate.getTime()) / (1000 * 60 * 60 * 24)
      : 999;
    const failureRecency = Math.max(0, 1 - daysSinceFailure / 90);

    // Component failure pattern (repeated component failures increase risk)
    const componentFailurePattern = hist.repeatedComponentFailures.length * 0.2;

    // MTBF in days (null if insufficient data)
    const mtbf = hist.meanTimeBetweenFailures
      ? hist.meanTimeBetweenFailures / 24
      : null;

    return {
      failureFrequency30d,
      failureFrequency90d,
      failureRecency,
      componentFailurePattern,
      mtbf,
    };
  }

  /**
   * Extract composite features
   */
  private extractCompositeFeatures(
    snapshot: BranchHealthSnapshot,
    historical: BranchHealthSnapshot[]
  ): Pick<
    BranchHealthFeatures,
    | "overallHealthScore"
    | "degradationVelocity"
    | "multiComponentRisk"
    | "branchComplexityFactor"
  > {
    // Overall health (weighted composite)
    const overallHealthScore = this.calculateOverallHealth(snapshot);

    // Degradation velocity (how fast is health declining)
    const last7d = this.filterByTimeWindow(historical, 7);
    const healthValues = last7d.map((s) => ({
      time: s.timestamp,
      value: this.calculateOverallHealth(s),
    }));
    const degradationVelocity = -this.calculateTrend(healthValues); // Negative trend = degradation

    // Multi-component risk (risk from multiple failing components)
    const multiComponentRisk = this.calculateMultiComponentRisk(snapshot);

    // Branch complexity factor (larger branches have higher operational complexity)
    const branchComplexityFactor = Math.log10(snapshot.cameras.total + 1);

    return {
      overallHealthScore,
      degradationVelocity,
      multiComponentRisk,
      branchComplexityFactor,
    };
  }

  /**
   * Helper: Filter snapshots by time window (days)
   */
  private filterByTimeWindow(
    snapshots: BranchHealthSnapshot[],
    days: number
  ): BranchHealthSnapshot[] {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return snapshots.filter((s) => s.timestamp.getTime() >= cutoff);
  }

  /**
   * Helper: Calculate trend (slope) from time series
   */
  private calculateTrend(
    data: Array<{ time: Date; value: number }>
  ): number {
    if (data.length < 2) return 0;

    // Simple linear regression
    const n = data.length;
    const times = data.map((d) => d.time.getTime());
    const values = data.map((d) => d.value);

    const meanTime = times.reduce((a, b) => a + b, 0) / n;
    const meanValue = values.reduce((a, b) => a + b, 0) / n;

    let numerator = 0;
    let denominator = 0;

    for (let i = 0; i < n; i++) {
      numerator += (times[i] - meanTime) * (values[i] - meanValue);
      denominator += (times[i] - meanTime) ** 2;
    }

    return denominator === 0 ? 0 : numerator / denominator;
  }

  /**
   * Helper: Calculate acceleration (2nd derivative)
   */
  private calculateAcceleration(
    data: Array<{ time: Date; value: number }>
  ): number {
    if (data.length < 3) return 0;

    // Calculate trend for first half vs second half
    const mid = Math.floor(data.length / 2);
    const firstHalf = data.slice(0, mid);
    const secondHalf = data.slice(mid);

    const trend1 = this.calculateTrend(firstHalf);
    const trend2 = this.calculateTrend(secondHalf);

    return trend2 - trend1; // Positive = accelerating
  }

  /**
   * Helper: Calculate degradation rate
   */
  private calculateDegradationRate(
    data: Array<{ time: Date; value: number }>
  ): number {
    if (data.length < 2) return 0;

    const trend = this.calculateTrend(data);
    
    // Convert to percentage change per day
    const timeSpanMs = data[data.length - 1].time.getTime() - data[0].time.getTime();
    const timeSpanDays = timeSpanMs / (1000 * 60 * 60 * 24);
    
    if (timeSpanDays === 0) return 0;
    
    // Normalize to per-day rate
    return (trend * (1000 * 60 * 60 * 24)) / 100;
  }

  /**
   * Helper: Calculate stability (inverse of coefficient of variation)
   */
  private calculateStability(values: number[]): number {
    if (values.length < 2) return 100;

    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    if (mean === 0) return 0;

    const variance =
      values.reduce((sum, val) => sum + (val - mean) ** 2, 0) / values.length;
    const stdDev = Math.sqrt(variance);

    const cv = stdDev / mean; // Coefficient of variation
    return Math.max(0, 100 - cv * 100); // Convert to stability score
  }

  /**
   * Helper: Calculate network degradation score
   */
  private calculateNetworkDegradationScore(
    snapshot: BranchHealthSnapshot,
    trends: { latencyTrend: number; packetLossTrend: number }
  ): number {
    let score = 0;

    // Current state
    if (snapshot.network.latencyMs !== null) {
      if (snapshot.network.latencyMs > 200) score += 30;
      else if (snapshot.network.latencyMs > 100) score += 15;
    }

    if (snapshot.network.packetLossPercent !== null) {
      if (snapshot.network.packetLossPercent > 5) score += 40;
      else if (snapshot.network.packetLossPercent > 2) score += 20;
    }

    // Trends (deteriorating)
    if (trends.latencyTrend > 0) score += 15;
    if (trends.packetLossTrend > 0) score += 15;

    return Math.min(100, score);
  }

  /**
   * Helper: Calculate thermal risk from temperature
   */
  private calculateThermalRisk(temperatureC: number | null): number {
    if (temperatureC === null) return 0;

    if (temperatureC > 70) return 100;
    if (temperatureC > 65) return 80;
    if (temperatureC > 60) return 60;
    if (temperatureC > 55) return 40;
    if (temperatureC > 50) return 20;
    return 0;
  }

  /**
   * Helper: Calculate DVR stability
   */
  private calculateDvrStability(
    uptimeHours: number | null,
    restartCount: number
  ): number {
    let score = 100;

    // Penalize for restarts
    score -= restartCount * 20;

    // Reward for uptime
    if (uptimeHours !== null) {
      if (uptimeHours < 24) score -= 30;
      else if (uptimeHours < 72) score -= 15;
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Helper: Calculate overall health score
   */
  private calculateOverallHealth(snapshot: BranchHealthSnapshot): number {
    const weights = {
      hdd: 0.25,
      network: 0.15,
      cameras: 0.2,
      storage: 0.2,
      dvr: 0.1,
      recording: 0.1,
    };

    const hddHealth = snapshot.hdd.healthScore;
    const networkHealth = 100 - (snapshot.network.packetLossPercent || 0) * 10;
    const cameraHealth = 100 - snapshot.cameras.instabilityScore;
    const storageHealth = Math.max(0, snapshot.storage.estimatedDaysRemaining);
    const dvrHealth = this.calculateDvrStability(
      snapshot.dvr.uptimeHours,
      snapshot.dvr.restartCount24h
    );
    const recordingHealth = snapshot.recording.recordingCoverage;

    return (
      hddHealth * weights.hdd +
      networkHealth * weights.network +
      cameraHealth * weights.cameras +
      Math.min(100, storageHealth) * weights.storage +
      dvrHealth * weights.dvr +
      recordingHealth * weights.recording
    );
  }

  /**
   * Helper: Calculate multi-component risk
   */
  private calculateMultiComponentRisk(snapshot: BranchHealthSnapshot): number {
    let riskyComponents = 0;

    if (snapshot.hdd.healthScore < 70) riskyComponents++;
    if ((snapshot.network.packetLossPercent || 0) > 2) riskyComponents++;
    if (snapshot.cameras.instabilityScore > 20) riskyComponents++;
    if (snapshot.storage.estimatedDaysRemaining < 30) riskyComponents++;
    if ((snapshot.dvr.temperatureC || 0) > 60) riskyComponents++;

    // Risk increases exponentially with multiple failing components
    return riskyComponents > 1 ? riskyComponents ** 2 * 10 : 0;
  }

  /**
   * Helper: Generate snapshot ID
   */
  private generateSnapshotId(snapshot: BranchHealthSnapshot): string {
    return `${snapshot.branchId}-${snapshot.timestamp.getTime()}`;
  }
}
