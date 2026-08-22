/**
 * AI Model Quality & Evaluation Subsystem Domain Types
 * (Full Lifecycle: Model Registry, Benchmarks, Certification, Per-Camera Tuning, Drift Tracking)
 */

export type DetectorCode =
  | "intrusion"
  | "line_crossing"
  | "loitering"
  | "crowd"
  | "person"
  | "anpr"
  | "tamper"
  | "face_recognition"
  | "fall_detection";

export type DetectorCategory = "security" | "safety" | "operations" | "video_health";

export type DetectorStatus = "experimental" | "validation" | "certified" | "deprecated";

export type ModelFramework = "onnx" | "tensorrt" | "pytorch" | "openvino" | "native_ivs";

export type ModelLifecycle =
  | "development"
  | "candidate"
  | "validated"
  | "certified"
  | "production"
  | "retired";

export type CertificationStatus = "pending" | "approved" | "rejected" | "expired";

export type SensitivityLevel = "LOW" | "MEDIUM" | "HIGH" | "CUSTOM";

export interface Detector {
  id: string;
  code: DetectorCode;
  name: string;
  category: DetectorCategory;
  description: string;
  status: DetectorStatus;
  currentProductionModelId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ModelVersion {
  id: string;
  detectorId: string;
  version: string;
  modelName: string;
  framework: ModelFramework;
  artifactUri: string;
  artifactSha256: string;
  inputWidth: number;
  inputHeight: number;
  defaultThreshold: number;
  trainingDatasetId?: string;
  validationDatasetId?: string;
  lifecycle: ModelLifecycle;
  createdAt: string;
  createdBy: string;
  metadata?: Record<string, any>;
}

export interface DatasetVersion {
  id: string;
  name: string;
  version: string;
  purpose: "training" | "validation" | "test" | "regression";
  videoCount: number;
  durationHours: number;
  positiveSamples: number;
  negativeSamples: number;
  manifestUri: string;
  manifestSha256: string;
  branchesRepresentedCount: number;
  distribution: {
    dayPercent: number;
    nightPercent: number;
    indoorPercent: number;
    outdoorPercent: number;
    rainPercent: number;
    lowLightPercent: number;
  };
  createdAt: string;
}

export interface HardwareProfile {
  id: string;
  name: string;
  chipset: string;
  gpuModel?: string;
  gpuMemoryGb?: number;
  ramGb: number;
  os: string;
  driverVersion?: string;
  cudaVersion?: string;
  tensorrtVersion?: string;
  isEdgeDevice: boolean;
}

export interface ScenarioMetrics {
  scenarioName: string;
  dimension: "lighting" | "weather" | "scene" | "density" | "resolution";
  precision: number;
  recall: number;
  f1: number;
  samplesCount: number;
  falseAlertsPerHour: number;
}

export interface ThresholdCurvePoint {
  threshold: number;
  precision: number;
  recall: number;
  f1: number;
  falseAlertsPerHour: number;
}

export interface EvaluationMetrics {
  precision: number;
  recall: number;
  f1: number;
  truePositives: number;
  falsePositives: number;
  trueNegatives: number;
  falseNegatives: number;
  falseAlertsPerCameraHour: number;
  missedIncidentsPerThousand: number;
  detectionLatencyP50Ms: number;
  detectionLatencyP95Ms: number;
  detectionLatencyP99Ms: number;
  inferenceLatencyP50Ms: number;
  fpsAverage: number;
  gpuMemoryMb: number;
  cpuPercent: number;
}

export interface EvaluationRun {
  id: string;
  detectorId: string;
  modelVersionId: string;
  datasetVersionId: string;
  hardwareProfileId: string;
  threshold: number;
  status: "queued" | "running" | "completed" | "failed";
  overallMetrics: EvaluationMetrics;
  scenarioBreakdown: ScenarioMetrics[];
  thresholdCurve: ThresholdCurvePoint[];
  startedAt: string;
  finishedAt?: string;
}

export interface QualityGateRequirements {
  minimumPrecision: number;
  minimumRecall: number;
  minimumF1: number;
  maximumFalseAlertsPerCameraHour: number;
  maximumP95LatencyMs: number;
  minimumFPS: number;
  minimumNightPrecision?: number;
  minimumNightRecall?: number;
}

export interface QualityGateEvaluationResult {
  passed: boolean;
  checks: Array<{
    metricName: string;
    target: string;
    actual: string | number;
    passed: boolean;
  }>;
  failingReasons: string[];
}

export interface ModelCertification {
  id: string;
  modelVersionId: string;
  detectorId: string;
  certificationStatus: CertificationStatus;
  qualityGateResults: QualityGateEvaluationResult;
  approvedUseCases: string[];
  excludedConditions: string[];
  certifiedHardwareProfileIds: string[];
  approvedBy?: string;
  approvedAt?: string;
  expiresAt?: string;
}

export interface CameraDetectorConfiguration {
  id: string;
  tenantId: string;
  branchId: string;
  cameraId: string;
  detectorId: string;
  modelVersionId: string;
  enabled: boolean;
  sensitivity: SensitivityLevel;
  confidenceThreshold: number;
  minimumDurationMs: number;
  cooldownMs: number;
  minimumObjectSizePercent?: number;
  maximumObjectSizePercent?: number;
  zones?: Array<{
    zoneId: string;
    name: string;
    polygonCoordinates: Array<{ x: number; y: number }>;
  }>;
  scheduleId?: string;
  overrideReason?: string;
  changedBy?: string;
  changedAt: string;
}

export interface AIProvenance {
  detectorId: string;
  detectorCode: DetectorCode;
  modelId: string;
  modelVersion: string;
  modelSha256: string;
  threshold: number;
  confidence: number;
  inferenceNodeId: string;
  hardwareProfile: string;
  inferenceTimestamp: string;
}

export interface AlertQualityFeedback {
  id: string;
  alertId: string;
  cameraId: string;
  detectorId: string;
  modelVersionId: string;
  classification: "true_positive" | "false_positive" | "uncertain";
  reasonCategory?: "reflection" | "shadow" | "animal" | "headlight" | "weather" | "known_person" | "other";
  notes?: string;
  operatorId: string;
  operatorName: string;
  recordedAt: string;
}

export interface DetectorRuntimeQuality {
  detectorId: string;
  detectorCode: string;
  activeModelVersion: string;
  totalAlertsLast7Days: number;
  operatorConfirmedTPCount: number;
  operatorConfirmedFPCount: number;
  observedFalseAlertRatePerHour: number;
  baselineFalseAlertRatePerHour: number;
  driftPercentage: number;
  driftStatus: "HEALTHY" | "WARNING" | "CRITICAL_DRIFT";
  highFalseAlarmCameraIds: string[];
}

export interface AIQualityAuditEvent {
  eventId: string;
  eventType:
    | "MODEL_REGISTERED"
    | "MODEL_EVALUATED"
    | "MODEL_CERTIFIED"
    | "MODEL_CERTIFICATION_FAILED"
    | "MODEL_DEPLOYED"
    | "MODEL_ROLLED_BACK"
    | "CAMERA_THRESHOLD_CHANGED"
    | "QUALITY_DRIFT_DETECTED"
    | "MODEL_RETIRED";
  targetId: string;
  actor: {
    userId: string;
    userName: string;
  };
  details: Record<string, any>;
  timestamp: string;
}
