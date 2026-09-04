/**
 * NBFC AI Surveillance & Visual Rule Engine Types
 */

export type RuleOperator =
  | "EQUALS"
  | "NOT_EQUALS"
  | "GREATER_THAN"
  | "GREATER_THAN_OR_EQUAL"
  | "LESS_THAN"
  | "LESS_THAN_OR_EQUAL"
  | "BETWEEN"
  | "ENTERED_ZONE"
  | "EXITED_ZONE"
  | "CROSSED_LINE"
  | "PRESENT_FOR"
  | "ABSENT_FOR"
  | "OBJECT_LEFT"
  | "OBJECT_REMOVED";

export type RuleSeverity = "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | "WARNING";

export type RuleExecutionState =
  | "ACTIVE"
  | "SHADOW"
  | "INACTIVE"
  | "PENDING"
  | "COOLDOWN"
  | "SUPPRESSED";

export type AnalyticsZoneType =
  | "CUSTOMER_AREA"
  | "QUEUE_AREA"
  | "CASH_COUNTER"
  | "STAFF_AREA"
  | "RESTRICTED_AREA"
  | "LOCKER"
  | "STRONG_ROOM"
  | "SERVER_ROOM"
  | "ENTRANCE"
  | "EXIT"
  | "CASH_VAN_AREA"
  | "ATM_AREA"
  | "CUSTOM";

export type DetectorType =
  | "person"
  | "PERSON_DETECTION"
  | "vehicle"
  | "VEHICLE_DETECTOR"
  | "queue"
  | "QUEUE_DETECTOR"
  | "crowd-density"
  | "CROWD_DENSITY"
  | "tailgating"
  | "TAILGATING_DETECTOR"
  | "motion"
  | "MOTION_DETECTOR"
  | "anpr"
  | "ANPR_DETECTOR"
  | "smoke-fire"
  | "SMOKE_FIRE_DETECTOR"
  | "camera-tamper"
  | "CAMERA_TAMPER"
  | "health"
  | "CAMERA_HEALTH"
  | "recording"
  | "RECORDING_FAILURE"
  | "fall"
  | "FALL_DETECTION"
  | "unattended-object"
  | "UNATTENDED_OBJECT"
  | "loitering"
  | "LOITERING_DETECTOR"
  | "object"
  | "zone";

export type ScheduleType =
  | "24X7"
  | "BUSINESS_HOURS"
  | "AFTER_HOURS"
  | "BRANCH_OPENING"
  | "BRANCH_CLOSING"
  | "CUSTOM";

export type ActionType =
  | "CREATE_ALERT"
  | "CREATE_INCIDENT"
  | "CAPTURE_SNAPSHOT"
  | "CAPTURE_EVIDENCE_CLIP"
  | "BOOKMARK_RECORDING"
  | "POPUP_LIVE_VIEW"
  | "SEND_EMAIL"
  | "PUSH_NOTIFICATION"
  | "START_HIGH_PRIORITY_RECORDING"
  | "ESCALATE"
  | "WEBHOOK"
  | "AUDIT_EVENT"
  | "NOTIFY_SOC"
  | "NOTIFY_BRANCH_MANAGER";

export interface NormalizedPoint {
  x: number; // 0.0 to 1.0
  y: number; // 0.0 to 1.0
}

export interface AnalyticsZone {
  id: string;
  tenantId: string;
  branchId: string;
  cameraId: string;
  name: string;
  type: AnalyticsZoneType;
  polygon: NormalizedPoint[];
  enabled: boolean;
  createdBy: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface SingleCondition {
  metric: string;
  operator: RuleOperator;
  value: string | number | boolean | [number, number];
  zoneId?: string;
  durationSeconds?: number;
}

export interface RuleConditionGroup {
  logical?: "AND" | "OR" | "NOT";
  conditions?: (SingleCondition | RuleConditionGroup)[];
  // Direct shorthand for single condition
  metric?: string;
  operator?: RuleOperator;
  value?: string | number | boolean | [number, number];
}

export interface RuleSchedule {
  type: ScheduleType;
  timezone?: string; // default "Asia/Kolkata"
  start?: string;    // "08:30"
  end?: string;      // "17:30"
  days?: number[];   // [1,2,3,4,5] (1=Monday... 6=Saturday)
  holidaysExcluded?: boolean;
}

export interface AnalyticsRule {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  enabled: boolean;
  state: RuleExecutionState;
  branchIds: string[]; // empty means all branches
  cameraIds: string[]; // empty means all cameras in branch
  zoneId?: string;
  zone?: AnalyticsZone;
  detectorType: DetectorType;
  condition: RuleConditionGroup;
  durationMs: number; // persistence threshold
  scheduleId?: string;
  schedule: RuleSchedule;
  severity: RuleSeverity;
  cooldownMs: number;
  actions: ActionType[];
  version: number;
  templateId?: string;
  scopeType: "CAMERA" | "BRANCH" | "REGION" | "GLOBAL";
  parentRuleId?: string;
  createdBy: string;
  createdAt: string;
  updatedBy?: string;
  updatedAt?: string;
  // Runtime telemetry augmented on read
  lastTriggeredAt?: string;
  triggersToday?: number;
  falsePositivesToday?: number;
}

export interface RuleVersion {
  id: string;
  ruleId: string;
  version: number;
  ruleSnapshot: Partial<AnalyticsRule>;
  changeReason?: string;
  changedBy: string;
  createdAt: string;
}

export interface RuleTemplate {
  id: string;
  name: string;
  category:
    | "VAULT_LOCKER"
    | "CASH_OPERATIONS"
    | "ACCESS_PERIMETER"
    | "HEALTH_SAFETY"
    | "HARDWARE_CONTINUITY"
    | "ANPR_LOGISTICS";
  description: string;
  detectorType: DetectorType;
  defaultCondition: RuleConditionGroup;
  defaultDurationMs: number;
  defaultSeverity: RuleSeverity;
  defaultCooldownMs: number;
  defaultActions: ActionType[];
  recommendedZoneTypes: AnalyticsZoneType[];
  suggestedSchedule: ScheduleType;
  metadata?: Record<string, unknown>;
}

export interface RuntimeRuleState {
  ruleId: string;
  entityKey: string;
  currentStatus:
    | "IDLE"
    | "CONDITION_MET_PENDING_DURATION"
    | "ACTIVE_ALERTING"
    | "COOLDOWN"
    | "RESOLVED"
    | "SUPPRESSED";
  firstConditionMetAt?: string;
  lastEvaluatedAt: string;
  lastTriggeredAt?: string;
  activeAlertId?: string;
  fencingToken: number;
  currentMetrics?: Record<string, unknown>;
}

export interface FalsePositiveFeedback {
  id: string;
  ruleId?: string;
  alertId?: string;
  cameraId?: string;
  reason:
    | "reflection"
    | "poster_or_image"
    | "staff_movement"
    | "camera_angle_issue"
    | "threshold_too_sensitive"
    | "lighting_change"
    | "other";
  comment?: string;
  submittedBy: string;
  createdAt: string;
}

export interface RuleTestResult {
  id: string;
  ruleId: string;
  testedBy: string;
  timeRangeStart: string;
  timeRangeEnd: string;
  triggerCount: number;
  longestEventSeconds: number;
  potentialFalsePositives: number;
  details: {
    eventTimes?: string[];
    averageDurationSec?: number;
    notes?: string;
  };
  createdAt: string;
}

export type ModelReadinessStatus =
  | "PRODUCTION_READY"
  | "PILOT_READY"
  | "LAB_VALIDATED"
  | "EXPERIMENTAL"
  | "NOT_IMPLEMENTED"
  | "DISABLED";

export interface ModelRegistryEntry {
  detector: DetectorType;
  model: string;
  version: string;
  status: ModelReadinessStatus;
  runtime: "ONNX Runtime" | "OpenCV / FFmpeg" | "PaddleOCR" | "Internal Engine";
  inputResolution: string;
  confidenceThreshold: number;
  validatedHardware: string;
  targetFps: number;
  actualFps: number;
  latencyMs: number;
  commercialLicenseReviewed: boolean;
  notes?: string;
}

export interface CapacityPlanningInfo {
  gpuNodeId: string;
  totalStreamsCapacity: number;
  totalCapacityStreams?: number;
  activeStreams: number;
  reservedStreams: number;
  availableStreams: number;
  cpuUsagePercent: number;
  gpuMemoryUsagePercent: number;
}
