/**
 * Signed Configuration & Fleet Version Management Domain Types
 * Banking-grade surveillance configuration control plane contracts.
 */

export type ChangeRisk = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type VersionStatus =
  | 'DRAFT'
  | 'VALIDATING'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'SIGNED'
  | 'ROLLOUT'
  | 'SUPERSEDED'
  | 'REVOKED';

export type BranchSyncStatus =
  | 'IN_SYNC'
  | 'DRIFTED'
  | 'APPLYING'
  | 'FAILED'
  | 'OFFLINE'
  | 'UNKNOWN';

export type ComponentApplyStatus =
  | 'PENDING'
  | 'APPLYING'
  | 'APPLIED'
  | 'VERIFIED'
  | 'FAILED'
  | 'SKIPPED';

export type DriftPolicy = 'REPORT_ONLY' | 'AUTO_REMEDIATE' | 'REQUIRE_APPROVAL';

export interface CameraConfiguration {
  id: string;
  channel: number;
  name: string;
  ip: string;
  resolution: string; // e.g. "1920x1080", "3840x2160"
  fps: number; // 1-60
  bitrateKbps: number; // 128-16384
  codec: 'H264' | 'H265' | 'MJPEG';
  streamProfile: 'main' | 'sub' | 'snapshot';
  credentialRef: string; // Opaque secret URI (e.g. secret://branch/BR-118/camera/CAM-04)
  analyticsAssigned: string[];
  enabled: boolean;
}

export interface RecorderConfiguration {
  nvrId: string;
  name: string;
  manufacturer: string; // e.g. "CP PLUS", "Dahua", "Hikvision"
  model: string;
  managementIp: string;
  storageTargets: string[]; // e.g. ["/dev/sda1", "/dev/sdb1"]
  recordingMode: 'CONTINUOUS' | 'MOTION' | 'SCHEDULE' | 'DISABLED';
  ntpServer: string;
  credentialRef: string;
  channelsCount: number;
}

export interface NetworkConfiguration {
  dnsServers: string[];
  ntpServers: string[];
  vlanId?: number;
  gatewayIp: string;
  subnetMask: string;
  uplinkBandwidthMbps: number;
  qosDscp?: number;
}

export interface RetentionConfiguration {
  continuousDays: number; // e.g. 90
  alertFootageDays: number; // e.g. 180
  forensicEvidenceDays: number; // e.g. 365
  storagePurgeThresholdPercent: number; // e.g. 90
}

export interface AnalyticsConfiguration {
  detectorVersions: Record<string, string>;
  schedules: Record<string, string>;
  sensitivityThresholds: Record<string, number>;
  zonesCount: number;
}

export interface SecurityConfiguration {
  minTlsVersion: 'TLS1.2' | 'TLS1.3';
  certificateThumbprints: string[];
  allowedCiphers: string[];
  enforceSignedConfig: boolean;
}

/**
 * Authoritative Branch Configuration Model
 */
export interface BranchConfiguration {
  schemaVersion: string; // e.g. "3.1"
  network: NetworkConfiguration;
  cameras: CameraConfiguration[];
  recorder: RecorderConfiguration;
  retention: RetentionConfiguration;
  analytics: AnalyticsConfiguration;
  security: SecurityConfiguration;
  customSettings?: Record<string, unknown>;
}

export interface ConfigurationApproval {
  approvalId: string;
  approvedBy: string;
  role: string;
  decision: 'APPROVED' | 'REJECTED';
  comments: string;
  approvedAt: Date;
}

export interface SignedConfigManifest {
  packageId: string;
  tenantId: string;
  configVersion: number;
  schemaVersion: string;
  issuedAt: string;
  expiresAt: string;
  configHash: string; // SHA-256 of canonical deterministic JSON
  scope: {
    type: 'fleet' | 'branch' | 'cohort';
    targetId?: string;
  };
  previousVersion?: number;
  keyId: string;
  signatureAlgorithm: 'Ed25519' | 'HMAC-SHA256';
  signature: string;
}

/**
 * Immutable Versioned Configuration Entity
 */
export interface ConfigurationVersion {
  id: string;
  tenantId: string;
  version: number;
  schemaVersion: string;
  config: BranchConfiguration;
  configHash: string;
  riskLevel: ChangeRisk;
  status: VersionStatus;
  createdBy: string;
  createdAt: Date;
  approvals: ConfigurationApproval[];
  signature?: SignedConfigManifest;
  parentVersionId?: string;
  changeReason: string;
  ticketId?: string;
}

/**
 * Granular Field Difference for Deep Drift Inspection
 */
export interface ConfigurationDifference {
  path: string; // e.g. "cameras.CAM-04.bitrateKbps" or "recorder.ntpServer"
  desiredValue: unknown;
  actualValue: unknown;
  category: 'network' | 'cameras' | 'recorder' | 'retention' | 'analytics' | 'security';
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  deviceId?: string;
  driftType: 'VALUE_CHANGED' | 'MISSING' | 'UNEXPECTED' | 'VERSION_MISMATCH';
}

/**
 * Branch Configuration State (Desired vs Actual)
 */
export interface BranchConfigurationState {
  branchId: string;
  gatewayId: string;
  desiredVersion: number;
  desiredHash: string;
  actualVersion?: number;
  actualHash?: string;
  lastAppliedVersion?: number;
  status: BranchSyncStatus;
  lastReportedAt?: Date;
  reportedGatewayVersion?: string;
  differences: ConfigurationDifference[];
  appliedPackageSha256?: string;
}

export interface ComponentApplyResult {
  componentId: string;
  componentType: 'camera' | 'recorder' | 'network' | 'retention' | 'analytics' | 'security';
  status: ComponentApplyStatus;
  startedAt?: Date;
  completedAt?: Date;
  errorCode?: string;
  errorMessage?: string;
  desiredHash?: string;
  actualHash?: string;
}

export interface BranchApplyResult {
  branchId: string;
  gatewayId: string;
  version: number;
  packageId: string;
  overallStatus: 'VERIFIED' | 'PARTIALLY_APPLIED' | 'APPLY_FAILED' | 'VERIFY_FAILED' | 'ROLLED_BACK';
  components: ComponentApplyResult[];
  startedAt: Date;
  completedAt: Date;
  checkpointRestored?: boolean;
}

export interface RolloutStage {
  stageNumber: number;
  name: string;
  percentage: number; // 5, 25, 50, 100
  targetBranchCount: number;
  minimumObservationMinutes: number;
  successThresholdPercent: number; // e.g. 98%
  maxFailureRatePercent: number; // e.g. 2%
}

export interface BranchRolloutAssignment {
  branchId: string;
  stageNumber: number;
  status: 'PENDING' | 'DEPLOYED' | 'VERIFIED' | 'FAILED' | 'OFFLINE' | 'SKIPPED';
  appliedAt?: Date;
  verifiedAt?: Date;
  error?: string;
}

export interface ConfigurationRollout {
  rolloutId: string;
  configVersionId: string;
  version: number;
  tenantId: string;
  scope: {
    type: 'FLEET' | 'REGION' | 'BRANCH_LIST';
    targetId?: string;
    filter?: Record<string, unknown>;
  };
  stages: RolloutStage[];
  currentStageIndex: number;
  status: 'PENDING' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'FAILED' | 'ROLLING_BACK' | 'ROLLED_BACK';
  branchAssignments: Map<string, BranchRolloutAssignment>;
  healthGates: {
    minSuccessRatePercent: number;
    maxCameraOfflineRatePercent: number;
    maxRecordingFailureRatePercent: number;
    maxGatewayCrashRate: number;
  };
  autoRollbackOnBreach: boolean;
  rollbackTargetVersion?: number;
  createdBy: string;
  startedAt?: Date;
  completedAt?: Date;
}

export interface RolloutCohortCriteria {
  hardwareVendors: string[]; // ["CP PLUS", "Dahua", "Hikvision"]
  networkTiers: ('HIGH_FIBER' | 'STANDARD_BROADBAND' | 'CELLULAR_BACKUP')[];
  regions: string[];
}

export interface DriftRemediationResult {
  branchId: string;
  remediated: boolean;
  actionTaken: string;
  appliedVersion?: number;
  incidentCreated?: string;
}
