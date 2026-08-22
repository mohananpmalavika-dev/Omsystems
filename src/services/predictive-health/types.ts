/**
 * Predictive Branch Health Types
 * 
 * Defines the data structures for failure prediction, risk assessment,
 * and outcome tracking in the Sentinel Grid predictive operations system.
 */

export type PredictionTarget = 
  | "RECORDING_FAILURE"
  | "HDD_FAILURE"
  | "NETWORK_FAILURE"
  | "STORAGE_EXHAUSTION"
  | "CAMERA_FAILURE"
  | "DVR_FAILURE";

export type PredictionConfidence = "LOW" | "MEDIUM" | "HIGH";
export type RiskLevel = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "HEALTHY";
export type RiskDirection = "INCREASES_RISK" | "REDUCES_RISK";

/**
 * Branch Health Snapshot
 * A point-in-time normalized telemetry aggregate for prediction input
 */
export interface BranchHealthSnapshot {
  branchId: string;
  tenantId: string;
  timestamp: Date;
  
  recording: {
    recordingCoverage: number;          // 0-100%
    camerasRecording: number;
    camerasExpected: number;
    recordingGaps: number;              // gaps in last 24h
    retentionDays: number;
    retentionTarget: number;            // policy target
  };
  
  storage: {
    usedPercent: number;                // 0-100%
    freeBytes: number;
    totalBytes: number;
    growthRatePerDay: number;           // bytes/day
    estimatedDaysRemaining: number;
  };
  
  hdd: {
    healthScore: number;                // 0-100
    temperatureC: number | null;
    reallocatedSectors: number | null;
    pendingSectors: number | null;
    readErrors: number | null;
    writeErrors: number | null;
    powerOnHours: number | null;
    smartStatus: "PASS" | "FAIL" | "WARN" | "UNKNOWN";
  };
  
  network: {
    latencyMs: number | null;
    packetLossPercent: number | null;   // 0-100%
    jitterMs: number | null;
    disconnectCount: number;            // last 24h
    uptimePercent: number;              // last 24h
    bandwidthUtilization: number | null;
  };
  
  cameras: {
    total: number;
    offlineCount: number;
    reconnectCount24h: number;
    videoLossCount24h: number;
    instabilityScore: number;           // 0-100
    criticalOffline: number;            // critical cameras offline
  };
  
  dvr: {
    temperatureC: number | null;
    cpuPercent: number | null;
    memoryPercent: number | null;
    uptimeHours: number | null;
    restartCount24h: number;
    recordingEngineState: "RUNNING" | "STOPPED" | "DEGRADED" | "UNKNOWN";
  };
  
  historical: {
    failures30d: number;
    failures90d: number;
    failures365d: number;
    previousRecoveryCount: number;
    meanTimeBetweenFailures: number | null;  // hours
    lastFailureDate: Date | null;
    repeatedComponentFailures: string[];     // e.g., ["HDD", "Network"]
  };
  
  dataQuality: {
    availableSources: number;
    totalSources: number;
    missingCritical: string[];
    qualityScore: number;                    // 0-1
  };
}

/**
 * Risk Factor
 * Individual contribution to overall risk prediction
 */
export interface RiskFactor {
  factor: string;
  contribution: number;              // 0-1 (proportion of total risk)
  direction: RiskDirection;
  currentValue: number | string;
  threshold: number | string | null;
  trend: "IMPROVING" | "STABLE" | "DEGRADING" | "UNKNOWN";
  evidence: string[];
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
}

/**
 * Prediction Recommendation
 */
export interface PredictionRecommendation {
  id: string;
  priority: number;                  // 1 = highest
  action: string;
  reason: string;
  expectedImpact: string;
  riskReduction: number;             // 0-1 (estimated risk reduction)
  timeframe: string;
  cost: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";
  requiredPermission: string;
}

/**
 * Branch Risk Prediction
 * Complete prediction result with explainability
 */
export interface BranchRiskPrediction {
  id: string;
  branchId: string;
  tenantId: string;
  target: PredictionTarget;
  
  horizonHours: number;
  probability: number;               // 0-1
  riskLevel: RiskLevel;
  confidence: PredictionConfidence;
  dataQuality: number;               // 0-1
  
  predictedWindow?: {
    start: Date;
    end: Date;
    mostLikely: Date;
  };
  
  riskFactors: RiskFactor[];
  protectiveFactors: RiskFactor[];
  recommendations: PredictionRecommendation[];
  
  primaryRiskDriver: string;
  secondaryRiskDrivers: string[];
  
  modelVersion: string;
  modelType: "RULES" | "ML" | "HYBRID";
  generatedAt: Date;
  expiresAt: Date;
  
  metadata: {
    snapshotId: string;
    calculationTimeMs: number;
    featureCount: number;
  };
}

/**
 * Engineered Features for ML
 * Derived features from raw telemetry
 */
export interface BranchHealthFeatures {
  snapshotId: string;
  branchId: string;
  timestamp: Date;
  
  // HDD features
  hddHealthScore: number;
  hddDegradationRate7d: number;
  hddDegradationRate30d: number;
  hddTemperatureTrend: number;
  hddReallocatedSectorsTrend: number;
  hddPendingSectorsTrend: number;
  hddErrorAcceleration: number;
  
  // Network features
  networkLatencyTrend: number;
  networkPacketLossTrend: number;
  networkDisconnectRate: number;
  networkDegradationScore: number;
  networkStability: number;
  
  // Camera features
  cameraInstabilityScore: number;
  cameraOfflineRate: number;
  cameraReconnectFrequency: number;
  cameraVideoLossRate: number;
  criticalCameraRisk: number;
  
  // Storage features
  storageFillRate: number;
  storageExhaustionDays: number;
  storageRetentionRisk: number;
  storageGrowthAcceleration: number;
  
  // DVR features
  dvrThermalRisk: number;
  dvrResourceUtilization: number;
  dvrStability: number;
  dvrRestartFrequency: number;
  
  // Historical features
  failureFrequency30d: number;
  failureFrequency90d: number;
  failureRecency: number;
  componentFailurePattern: number;
  mtbf: number | null;
  
  // Composite features
  overallHealthScore: number;
  degradationVelocity: number;
  multiComponentRisk: number;
  branchComplexityFactor: number;
}

/**
 * Prediction Outcome
 * Ground truth tracking for model improvement
 */
export interface PredictionOutcome {
  id: string;
  predictionId: string;
  branchId: string;
  tenantId: string;
  
  predictedAt: Date;
  evaluatedAt: Date;
  
  prediction: {
    target: PredictionTarget;
    horizonHours: number;
    probability: number;
    riskLevel: RiskLevel;
    confidence: PredictionConfidence;
  };
  
  actual: {
    failureOccurred: boolean;
    failureTime: Date | null;
    failureType: string | null;
    rootCause: string | null;
    affectedComponents: string[];
  };
  
  intervention: {
    actionTaken: boolean;
    actionType: string | null;
    actionTime: Date | null;
    preventedFailure: boolean | null;
  };
  
  outcome: "TRUE_POSITIVE" | "FALSE_POSITIVE" | "TRUE_NEGATIVE" | "FALSE_NEGATIVE" | "INDETERMINATE";
  
  analysis: {
    probabilityError: number;
    calibrationBucket: string;
    primaryRiskDriverCorrect: boolean | null;
    notes: string;
  };
}

/**
 * Failure Event
 * Labeled failure for training data
 */
export interface FailureEvent {
  id: string;
  branchId: string;
  tenantId: string;
  
  failureType: PredictionTarget;
  occurredAt: Date;
  detectedAt: Date;
  resolvedAt: Date | null;
  
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  
  rootCause: string;
  contributingFactors: string[];
  affectedComponents: string[];
  
  impact: {
    camerasAffected: number;
    recordingLossDuration: number;  // minutes
    dataLoss: boolean;
  };
  
  resolution: {
    actionTaken: string;
    technician: string | null;
    resolutionTime: number;         // minutes
    cost: number | null;
  };
  
  metadata: Record<string, unknown>;
}

/**
 * Model Calibration Metrics
 */
export interface CalibrationMetrics {
  modelVersion: string;
  evaluationPeriod: {
    start: Date;
    end: Date;
  };
  
  totalPredictions: number;
  
  // Confusion matrix
  truePositives: number;
  falsePositives: number;
  trueNegatives: number;
  falseNegatives: number;
  
  // Performance metrics
  precision: number;
  recall: number;
  f1Score: number;
  accuracy: number;
  
  // Probability calibration
  brierScore: number;
  calibrationError: number;
  
  // By probability bucket
  calibrationByBucket: Array<{
    bucket: string;
    predictedProbability: number;
    actualRate: number;
    count: number;
  }>;
  
  // By horizon
  performanceByHorizon: Array<{
    horizonHours: number;
    precision: number;
    recall: number;
    f1Score: number;
  }>;
}

/**
 * Prediction Configuration
 */
export interface PredictionConfig {
  target: PredictionTarget;
  enabled: boolean;
  
  thresholds: {
    criticalRisk: number;      // probability threshold
    highRisk: number;
    mediumRisk: number;
  };
  
  horizons: number[];          // hours [24, 72, 168, 720]
  
  featureWeights: Record<string, number>;
  
  minimumDataQuality: number;  // 0-1
  
  cooldownMinutes: number;     // between predictions for same branch
  
  requireInterventionApproval: boolean;
}

/**
 * Fleet Risk Summary
 */
export interface FleetRiskSummary {
  tenantId: string;
  generatedAt: Date;
  
  totalBranches: number;
  
  riskDistribution: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    healthy: number;
  };
  
  topRisks: Array<{
    branchId: string;
    branchName: string;
    riskLevel: RiskLevel;
    probability: number;
    target: PredictionTarget;
    primaryDriver: string;
    urgency: number;          // hours until predicted failure
  }>;
  
  predictedFailures24h: number;
  predictedFailures72h: number;
  predictedFailures7d: number;
  
  trends: {
    riskIncreasing: number;   // branches with increasing risk
    riskDecreasing: number;
    riskStable: number;
  };
}

/**
 * Branch Risk History
 */
export interface BranchRiskHistory {
  branchId: string;
  period: {
    start: Date;
    end: Date;
  };
  
  predictions: Array<{
    timestamp: Date;
    probability: number;
    riskLevel: RiskLevel;
    primaryDriver: string;
  }>;
  
  events: Array<{
    timestamp: Date;
    type: "FAILURE" | "INTERVENTION" | "RECOVERY" | "DEGRADATION";
    description: string;
  }>;
}

/**
 * Service Options
 */
export interface PredictionOptions {
  target?: PredictionTarget;
  horizons?: number[];
  forceRecalculation?: boolean;
  includeHistorical?: boolean;
  includeRecommendations?: boolean;
}

export interface SnapshotOptions {
  includeDvrTelemetry?: boolean;
  includeNetworkTelemetry?: boolean;
  includeHistorical?: boolean;
  maxAgeMinutes?: number;
}
