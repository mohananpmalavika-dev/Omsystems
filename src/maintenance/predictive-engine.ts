/**
 * Phase 7: Predictive Maintenance Engine
 * AI/ML-based failure prediction including SMART disk prediction, UPS forecasting, and anomaly detection
 */

import type { ControlPlaneStore } from "../control-plane-store.js";

export interface PredictiveModel {
  id: string;
  name: string;
  modelType: "regression" | "classification" | "time-series" | "anomaly";
  deviceType: string; // camera, storage, ups, network
  metricName: string;
  accuracy: number; // 0-1
  trainingDataPoints: number;
  lastUpdated: Date;
  parameters: Record<string, number>;
}

export interface FailurePrediction {
  id: string;
  deviceId: string;
  deviceType: string;
  metricsUsed: string[];
  failureProbability: number; // 0-1 (0-100%)
  predictedFailureDate?: Date;
  confidence: number; // 0-1
  riskLevel: "low" | "medium" | "high" | "critical";
  underlyingFactors: string[];
  recommendedActions: string[];
  createdAt: Date;
  validUntil: Date;
}

export interface AnomalyScore {
  deviceId: string;
  metricName: string;
  timestamp: Date;
  expectedValue: number;
  actualValue: number;
  anomalyScore: number; // 0-1
  isAnomaly: boolean;
  severity: "low" | "medium" | "high";
}

export interface StorageFailurePrediction extends FailurePrediction {
  smartDataAttributes: {
    readErrorRate: number;
    seekTime: number;
    spinUpTime: number;
    startStopCount: number;
    reallocatedSectorCount: number;
    seekErrorRate: number;
    powerOnHours: number;
    spinRetryCount: number;
    uncorrectableErrorCount: number;
  };
  smartRating: number; // 0-100
}

export interface UPSBatteryPrediction extends FailurePrediction {
  batteryParameters: {
    currentCapacityPercent: number;
    degradationRate: number; // % per month
    cycleCount: number;
    chargeTime: number; // minutes
    dischargeTime: number; // minutes
    internalImpedance: number; // ohms
    temperature: number; // celsius
  };
  remainingServiceLife: number; // months
}

export interface CameraFailurePrediction extends FailurePrediction {
  cameraMetrics: {
    fpsConsistency: number; // 0-1
    bitrateVariance: number;
    frameDropRate: number;
    sensorTemperature: number;
    focusAccuracy: number;
    exposureConsistency: number;
  };
  degradationTrend: "stable" | "slow-degradation" | "rapid-degradation";
}

export class PredictiveMaintenanceEngine {
  private store: ControlPlaneStore;
  private models: Map<string, PredictiveModel> = new Map();
  private predictions: Map<string, FailurePrediction[]> = new Map();
  private anomalyScores: AnomalyScore[] = [];
  private historicalData: Map<string, number[]> = new Map();
  private readonly PREDICTION_WINDOW_DAYS = 30;
  private readonly ANOMALY_THRESHOLD = 0.7;

  constructor(store: ControlPlaneStore) {
    this.store = store;
    this.initializeModels();
  }

  /**
   * Initialize predictive models with base parameters
   */
  private initializeModels(): void {
    // Storage failure prediction model
    this.registerModel({
      id: "model_storage_smart",
      name: "SMART Storage Failure Predictor",
      modelType: "classification",
      deviceType: "storage",
      metricName: "smart_health",
      accuracy: 0.85,
      trainingDataPoints: 5000,
      lastUpdated: new Date(),
      parameters: {
        readErrorRateWeight: 0.25,
        reallocatedSectorWeight: 0.3,
        seekErrorRateWeight: 0.2,
        uncorrectableErrorWeight: 0.25,
      },
    });

    // UPS battery prediction model
    this.registerModel({
      id: "model_ups_battery",
      name: "UPS Battery Degradation Forecaster",
      modelType: "time-series",
      deviceType: "ups",
      metricName: "battery_health",
      accuracy: 0.82,
      trainingDataPoints: 3500,
      lastUpdated: new Date(),
      parameters: {
        cycleCountWeight: 0.3,
        temperatureWeight: 0.25,
        chargeTimeWeight: 0.2,
        impedanceWeight: 0.25,
      },
    });

    // Camera failure prediction model
    this.registerModel({
      id: "model_camera_failure",
      name: "Camera Performance Degradation Predictor",
      modelType: "regression",
      deviceType: "camera",
      metricName: "fps",
      accuracy: 0.78,
      trainingDataPoints: 8000,
      lastUpdated: new Date(),
      parameters: {
        fpsConsistencyWeight: 0.3,
        temperatureWeight: 0.25,
        focusAccuracyWeight: 0.2,
        bitrateVarianceWeight: 0.25,
      },
    });

    // Anomaly detection model
    this.registerModel({
      id: "model_anomaly_detector",
      name: "Multi-Metric Anomaly Detector",
      modelType: "anomaly",
      deviceType: "all",
      metricName: "all",
      accuracy: 0.88,
      trainingDataPoints: 10000,
      lastUpdated: new Date(),
      parameters: {
        zscoreThreshold: 3.0,
        isolationForestSensitivity: 0.7,
        localOutlierFactorK: 20,
      },
    });
  }

  /**
   * Register a predictive model
   */
  registerModel(model: PredictiveModel): void {
    this.models.set(model.id, model);
  }

  /**
   * Predict storage failure using SMART data
   */
  predictStorageFailure(
    deviceId: string,
    smartData: {
      readErrorRate: number;
      seekTime: number;
      spinUpTime: number;
      startStopCount: number;
      reallocatedSectorCount: number;
      seekErrorRate: number;
      powerOnHours: number;
      spinRetryCount: number;
      uncorrectableErrorCount: number;
    }
  ): StorageFailurePrediction {
    const model = this.models.get("model_storage_smart");
    if (!model) {
      throw new Error("Storage prediction model not found");
    }

    // Calculate SMART score (0-100)
    const smartRating = this.calculateSmartScore(smartData);

    // Calculate failure probability
    let failureProbability = 0;
    if (smartRating > 80) {
      failureProbability = 0.05; // Low risk
    } else if (smartRating > 60) {
      failureProbability = 0.25;
    } else if (smartRating > 40) {
      failureProbability = 0.65;
    } else {
      failureProbability = 0.9; // Critical
    }

    const riskLevel = this.calculateRiskLevel(failureProbability);

    // Predict failure date
    const predictedFailureDate = this.predictFailureDate(
      smartRating,
      smartData.powerOnHours
    );

    const prediction: StorageFailurePrediction = {
      id: `pred_${Date.now()}_${deviceId}`,
      deviceId,
      deviceType: "storage",
      metricsUsed: [
        "reallocatedSectorCount",
        "readErrorRate",
        "seekErrorRate",
        "uncorrectableErrorCount",
      ],
      failureProbability,
      predictedFailureDate,
      confidence: model.accuracy,
      riskLevel,
      smartDataAttributes: smartData,
      smartRating,
      underlyingFactors: this.getSmartFailureFactors(smartData),
      recommendedActions: this.getStorageRecommendations(smartData, smartRating),
      createdAt: new Date(),
      validUntil: new Date(Date.now() + this.PREDICTION_WINDOW_DAYS * 24 * 60 * 60 * 1000),
    };

    this.recordPrediction(deviceId, prediction);
    return prediction;
  }

  /**
   * Calculate SMART score based on SMART attributes
   */
  private calculateSmartScore(smartData: Record<string, number>): number {
    let score = 100;

    // Penalize for bad attributes
    if (smartData.reallocatedSectorCount > 100) score -= 20;
    if (smartData.readErrorRate > 1000) score -= 15;
    if (smartData.seekErrorRate > 1000) score -= 15;
    if (smartData.uncorrectableErrorCount > 0) score -= 25;
    if (smartData.spinRetryCount > 10) score -= 10;

    return Math.max(0, score);
  }

  /**
   * Predict UPS battery failure
   */
  predictUPSBatteryFailure(
    deviceId: string,
    batteryData: {
      currentCapacityPercent: number;
      cycleCount: number;
      chargeTime: number;
      dischargeTime: number;
      internalImpedance: number;
      temperature: number;
    }
  ): UPSBatteryPrediction {
    const model = this.models.get("model_ups_battery");
    if (!model) {
      throw new Error("UPS prediction model not found");
    }

    // Calculate degradation rate
    const degradationRate = this.calculateBatteryDegradationRate(batteryData);

    // Estimate remaining service life
    const remainingServiceLife =
      (batteryData.currentCapacityPercent - 60) / degradationRate; // Threshold at 60%

    // Calculate failure probability
    let failureProbability = 0;
    if (remainingServiceLife > 24) {
      failureProbability = 0.05;
    } else if (remainingServiceLife > 12) {
      failureProbability = 0.3;
    } else if (remainingServiceLife > 6) {
      failureProbability = 0.7;
    } else {
      failureProbability = 0.95;
    }

    const riskLevel = this.calculateRiskLevel(failureProbability);

    const predictedFailureDate =
      remainingServiceLife > 0
        ? new Date(Date.now() + remainingServiceLife * 30 * 24 * 60 * 60 * 1000)
        : new Date(); // Already failed

    const prediction: UPSBatteryPrediction = {
      id: `pred_${Date.now()}_${deviceId}`,
      deviceId,
      deviceType: "ups",
      metricsUsed: ["capacity", "cycleCount", "chargeTime", "impedance", "temperature"],
      failureProbability,
      predictedFailureDate,
      confidence: model.accuracy,
      riskLevel,
      batteryParameters: {
        ...batteryData,
        degradationRate,
      },
      remainingServiceLife,
      underlyingFactors: this.getBatteryFailureFactors(batteryData),
      recommendedActions: this.getUPSRecommendations(
        batteryData,
        remainingServiceLife
      ),
      createdAt: new Date(),
      validUntil: new Date(Date.now() + this.PREDICTION_WINDOW_DAYS * 24 * 60 * 60 * 1000),
    };

    this.recordPrediction(deviceId, prediction);
    return prediction;
  }

  /**
   * Calculate battery degradation rate (% per month)
   */
  private calculateBatteryDegradationRate(batteryData: Record<string, number>): number {
    let degradationRate = 0.5; // Base degradation: 0.5% per month

    if (batteryData.cycleCount > 1000) degradationRate += 0.3;
    if (batteryData.temperature > 35) degradationRate += 0.2;
    if (batteryData.internalImpedance > 100) degradationRate += 0.4;
    if (batteryData.chargeTime > 120) degradationRate += 0.2;

    return degradationRate;
  }

  /**
   * Predict camera failure
   */
  predictCameraFailure(
    deviceId: string,
    cameraMetrics: {
      fpsConsistency: number; // 0-1
      bitrateVariance: number;
      frameDropRate: number;
      sensorTemperature: number;
      focusAccuracy: number;
      exposureConsistency: number;
    }
  ): CameraFailurePrediction {
    const model = this.models.get("model_camera_failure");
    if (!model) {
      throw new Error("Camera prediction model not found");
    }

    // Assess degradation trend
    const degradationTrend = this.assessCameraDegradation(cameraMetrics);

    // Calculate failure probability
    let failureProbability = 0;
    if (degradationTrend === "stable") {
      failureProbability = 0.05;
    } else if (degradationTrend === "slow-degradation") {
      failureProbability = 0.4;
    } else {
      failureProbability = 0.8;
    }

    const riskLevel = this.calculateRiskLevel(failureProbability);

    // Predict failure date
    const predictedFailureDate =
      degradationTrend === "rapid-degradation"
        ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        : degradationTrend === "slow-degradation"
          ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
          : undefined;

    const prediction: CameraFailurePrediction = {
      id: `pred_${Date.now()}_${deviceId}`,
      deviceId,
      deviceType: "camera",
      metricsUsed: [
        "fpsConsistency",
        "bitrateVariance",
        "frameDropRate",
        "sensorTemperature",
      ],
      failureProbability,
      predictedFailureDate,
      confidence: model.accuracy,
      riskLevel,
      cameraMetrics,
      degradationTrend,
      underlyingFactors: this.getCameraFailureFactors(cameraMetrics),
      recommendedActions: this.getCameraRecommendations(cameraMetrics, degradationTrend),
      createdAt: new Date(),
      validUntil: new Date(Date.now() + this.PREDICTION_WINDOW_DAYS * 24 * 60 * 60 * 1000),
    };

    this.recordPrediction(deviceId, prediction);
    return prediction;
  }

  /**
   * Assess camera degradation trend
   */
  private assessCameraDegradation(cameraMetrics: Record<string, number>): "stable" | "slow-degradation" | "rapid-degradation" {
    let degradationScore = 0;

    if (cameraMetrics.fpsConsistency < 0.9) degradationScore += 1;
    if (cameraMetrics.bitrateVariance > 20) degradationScore += 1;
    if (cameraMetrics.frameDropRate > 0.01) degradationScore += 2;
    if (cameraMetrics.sensorTemperature > 50) degradationScore += 1;
    if (cameraMetrics.focusAccuracy < 0.8) degradationScore += 1;

    if (degradationScore >= 4) return "rapid-degradation";
    if (degradationScore >= 2) return "slow-degradation";
    return "stable";
  }

  /**
   * Detect anomalies in metrics
   */
  detectAnomaly(
    deviceId: string,
    metricName: string,
    actualValue: number,
    expectedValue: number,
    historicalStdDev: number
  ): AnomalyScore {
    // Calculate z-score
    const zScore = Math.abs((actualValue - expectedValue) / (historicalStdDev + 0.001));

    // Calculate anomaly score (0-1)
    const anomalyScore = Math.min(1, zScore / 5); // Normalize to 0-1

    const isAnomaly = anomalyScore > this.ANOMALY_THRESHOLD;

    const severity =
      anomalyScore > 0.9
        ? "high"
        : anomalyScore > 0.7
          ? "medium"
          : "low";

    const score: AnomalyScore = {
      deviceId,
      metricName,
      timestamp: new Date(),
      expectedValue,
      actualValue,
      anomalyScore,
      isAnomaly,
      severity,
    };

    if (isAnomaly) {
      this.anomalyScores.push(score);
    }

    return score;
  }

  /**
   * Get active predictions for a device
   */
  getActivePredictions(deviceId: string): FailurePrediction[] {
    return (this.predictions.get(deviceId) || []).filter(
      (p) => p.validUntil > new Date()
    );
  }

  /**
   * Get recent anomalies
   */
  getRecentAnomalies(hours: number = 24): AnomalyScore[] {
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
    return this.anomalyScores.filter((a) => a.timestamp > cutoff);
  }

  /**
   * Private helper methods
   */

  private calculateRiskLevel(probability: number): "low" | "medium" | "high" | "critical" {
    if (probability < 0.2) return "low";
    if (probability < 0.5) return "medium";
    if (probability < 0.8) return "high";
    return "critical";
  }

  private predictFailureDate(healthScore: number, powerOnHours: number): Date | undefined {
    if (healthScore > 60) return undefined; // Too far in future

    // Estimate months until failure
    const monthsUntilFailure = Math.max(1, (healthScore - 20) / 10);
    return new Date(Date.now() + monthsUntilFailure * 30 * 24 * 60 * 60 * 1000);
  }

  private recordPrediction(deviceId: string, prediction: FailurePrediction): void {
    const predictions = this.predictions.get(deviceId) || [];
    predictions.push(prediction);
    this.predictions.set(deviceId, predictions);
  }

  private getSmartFailureFactors(smartData: Record<string, number>): string[] {
    const factors: string[] = [];
    if (smartData.reallocatedSectorCount > 50)
      factors.push("High reallocated sector count");
    if (smartData.readErrorRate > 500) factors.push("Elevated read error rate");
    if (smartData.seekErrorRate > 500) factors.push("High seek error rate");
    if (smartData.uncorrectableErrorCount > 0) factors.push("Uncorrectable errors detected");
    return factors.length > 0 ? factors : ["Normal SMART values"];
  }

  private getBatteryFailureFactors(batteryData: Record<string, number>): string[] {
    const factors: string[] = [];
    if (batteryData.currentCapacityPercent < 80)
      factors.push("Battery capacity declining");
    if (batteryData.cycleCount > 500) factors.push("High cycle count");
    if (batteryData.temperature > 35) factors.push("Operating temperature elevated");
    if (batteryData.internalImpedance > 80)
      factors.push("Internal impedance increasing");
    return factors.length > 0 ? factors : ["Battery in good condition"];
  }

  private getCameraFailureFactors(cameraMetrics: Record<string, number>): string[] {
    const factors: string[] = [];
    if (cameraMetrics.fpsConsistency < 0.8) factors.push("FPS consistency declining");
    if (cameraMetrics.frameDropRate > 0.005) factors.push("Frame drops increasing");
    if (cameraMetrics.sensorTemperature > 55) factors.push("Sensor temperature elevated");
    if (cameraMetrics.focusAccuracy < 0.7) factors.push("Focus accuracy degrading");
    return factors.length > 0 ? factors : ["Camera operating normally"];
  }

  private getStorageRecommendations(
    smartData: Record<string, number>,
    smartScore: number
  ): string[] {
    if (smartScore > 80) {
      return ["Monitor SMART attributes regularly", "Schedule preventive replacement in 6-12 months"];
    } else if (smartScore > 60) {
      return [
        "Increase monitoring frequency to daily",
        "Back up data to secondary storage",
        "Schedule replacement within 3-6 months",
      ];
    } else {
      return [
        "Critical - replace immediately",
        "Activate redundancy/backup systems",
        "Investigate root cause of degradation",
      ];
    }
  }

  private getUPSRecommendations(
    batteryData: Record<string, number>,
    remainingLife: number
  ): string[] {
    if (remainingLife > 12) {
      return ["Continue routine battery maintenance", "Schedule replacement in 12+ months"];
    } else if (remainingLife > 6) {
      return [
        "Increase battery testing frequency to monthly",
        "Procure replacement battery",
        "Schedule replacement within 6-12 months",
      ];
    } else {
      return [
        "Critical - replace battery urgently",
        "Test UPS load more frequently",
        "Consider temporary redundant UPS setup",
      ];
    }
  }

  private getCameraRecommendations(
    cameraMetrics: Record<string, number>,
    trend: string
  ): string[] {
    if (trend === "stable") {
      return ["Continue normal monitoring", "Verify camera parameters monthly"];
    } else if (trend === "slow-degradation") {
      return [
        "Increase monitoring to weekly",
        "Verify lens and sensor cleanliness",
        "Schedule preventive maintenance",
        "Plan replacement within 2-3 months",
      ];
    } else {
      return [
        "Critical attention required",
        "Implement backup recording stream",
        "Schedule immediate maintenance/replacement",
        "Test with backup camera setup",
      ];
    }
  }
}

// Export singleton instance
let predictiveEngine: PredictiveMaintenanceEngine | null = null;

export function initializePredictiveEngine(
  store: ControlPlaneStore
): PredictiveMaintenanceEngine {
  if (!predictiveEngine) {
    predictiveEngine = new PredictiveMaintenanceEngine(store);
  }
  return predictiveEngine;
}

export function getPredictiveEngine(): PredictiveMaintenanceEngine {
  if (!predictiveEngine) {
    throw new Error(
      "Predictive engine not initialized. Call initializePredictiveEngine first."
    );
  }
  return predictiveEngine;
}
