export const actions = [
  "live:view",
  "recording:view",
  "evidence:export",
  "ptz:operate",
  "alarm:acknowledge",
  "device:configure",
  "user:manage",
  "audit:view",
  "org:manage",
] as const;

export type Action = (typeof actions)[number];

export type NodeType =
  | "company"
  | "headquarters"
  | "zone"
  | "division"
  | "region"
  | "area"
  | "branch"
  | "camera-group"
  | "camera";

export interface ResourceNode {
  id: string;
  parentId: string | null;
  tenantId: string;
  type: NodeType;
  name: string;
  /** Ordered ancestor IDs, including this node. */
  path: string[];
}

export type CameraVendor = "hikvision" | "cp-plus" | "other";
export type CameraStatus = "online" | "offline" | "degraded" | "unknown";

export type CameraLocationType =
  | "branch-entrance"
  | "branch-exit"
  | "cash-counter"
  | "manager-cabin"
  | "strong-room"
  | "vault"
  | "locker-room"
  | "atm-cabin"
  | "parking-area"
  | "perimeter-fence"
  | "staircase"
  | "corridor"
  | "server-room"
  | "lobby"
  | "teller-area"
  | "safe-deposit"
  | "other";

export type PhysicalCameraType =
  | "dome-indoor"
  | "dome-outdoor"
  | "bullet-indoor"
  | "bullet-outdoor"
  | "ptz"
  | "fixed"
  | "thermal"
  | "license-plate-recognition"
  | "panoramic"
  | "fisheye";

export type WeatherproofRating =
  | "IP20"
  | "IP33"
  | "IP44"
  | "IP54"
  | "IP65"
  | "IP66"
  | "IP67"
  | "IP68";

export type VideoCodec = "H264" | "H265" | "H265+" | "MJPEG" | "MPEG4" | "Smart264";

export interface Camera {
  id: string;
  name: string;
  nodeId: string;
  branchId: string;
  vendor: CameraVendor;
  model: string;
  channel: number;
  protocol: "onvif-t" | "onvif-s" | "rtsp" | "vendor-adapter";
  status: CameraStatus;
  profiles: CameraProfile[];
  capabilities: CameraCapabilities;
  /** Reference to a secret; never store camera credentials in this record. */
  connectionSecretRef: string;
  locationType?: CameraLocationType;
  physicalType?: PhysicalCameraType;
  installationDate?: string;
  warrantyExpiresAt?: string;
  serialNumber?: string;
  macAddress?: string;
  firmwareVersion?: string;
  ipAddress?: string;
  installationNotes?: string;
  specifications?: CameraSpecifications;
  compliance?: CameraInstallationCompliance;
}

export interface CameraProfile {
  name: string;
  codec: "H264" | "H265" | "MJPEG" | "unknown";
  width: number;
  height: number;
  rtspUri?: string | undefined;
}

export interface CameraCapabilities {
  ptz: boolean;
  audio: boolean;
  events: boolean;
}

export interface CameraSpecifications {
  id: string;
  cameraId: string;
  // Video specifications
  resolutionMp: number;
  resolutionWidth: number;
  resolutionHeight: number;
  frameRate: number;
  videoCodec: VideoCodec;
  bitrateKbps?: number;
  // Optical specifications
  fieldOfViewHorizontal?: number;
  fieldOfViewVertical?: number;
  focalLengthMm?: number;
  lensType?: string;
  // Night vision and lighting
  hasNightVision: boolean;
  irDistanceMeters?: number;
  hasWdr: boolean;
  minIlluminationLux?: number;
  // Environmental specifications
  weatherproofRating?: WeatherproofRating;
  operatingTempMin?: number;
  operatingTempMax?: number;
  vandalResistant: boolean;
  // Power and connectivity
  powerConsumptionWatts?: number;
  powerSupplyType?: string;
  poeClass?: string;
  // Storage requirements
  storageDays: number;
  avgStoragePerDayGb?: number;
  // Additional features
  hasTwoWayAudio: boolean;
  hasMotionDetection: boolean;
  hasAnalytics: boolean;
  analyticsFeatures: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CameraInstallationCompliance {
  id: string;
  cameraId: string;
  // Compliance checks
  meetsResolutionRequirement: boolean;
  meetsFrameRateRequirement: boolean;
  meetsCoverageRequirement: boolean;
  meetsRetentionRequirement: boolean;
  properLighting: boolean;
  properAngle: boolean;
  // Documentation
  complianceNotes?: string;
  lastInspectionDate?: string;
  nextInspectionDate?: string;
  inspectorName?: string;
  // Privacy and regulatory
  audioRecordingCompliant: boolean;
  privacyMaskConfigured: boolean;
  signageInstalled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BranchCameraRequirement {
  id: string;
  branchNodeId: string;
  locationType: CameraLocationType;
  // Requirements
  requiredCount: number;
  actualCount: number;
  minResolutionMp: number;
  minFrameRate: number;
  requiresNightVision: boolean;
  requiresAudio: boolean;
  requiresPtz: boolean;
  requiresLpr: boolean; // License Plate Recognition
  // Priority and compliance
  priority: number; // 1-5, 1 being highest
  isRegulatoryRequirement: boolean;
  complianceStandard?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BranchCameraCoverageGap {
  branchNodeId: string;
  branchName: string;
  locationType: CameraLocationType;
  requiredCount: number;
  actualCount: number;
  gapCount: number;
  priority: number;
  isRegulatoryRequirement: boolean;
  complianceStandard?: string;
}

export interface CameraComplianceSummary {
  cameraId: string;
  resourceNodeId: string;
  cameraName: string;
  branchNodeId: string;
  branchName: string;
  locationType?: CameraLocationType;
  physicalType?: PhysicalCameraType;
  status: CameraStatus;
  resolutionMp?: number;
  frameRate?: number;
  hasNightVision?: boolean;
  irDistanceMeters?: number;
  weatherproofRating?: WeatherproofRating;
  meetsResolutionRequirement?: boolean;
  meetsFrameRateRequirement?: boolean;
  meetsCoverageRequirement?: boolean;
  meetsRetentionRequirement?: boolean;
  lastInspectionDate?: string;
  nextInspectionDate?: string;
  complianceStatus: "compliant" | "non-compliant";
}

export interface AccessGrant {
  userId: string;
  scopeNodeId: string;
  actions: Action[];
  effect: "allow" | "deny";
}

export interface User {
  id: string;
  displayName: string;
  tenantId: string;
  role?: UserRole;
  status?: UserStatus;
  username?: string;
  email?: string;
}

export type UserRole =
  | "super_admin"
  | "company_admin"
  | "hq_admin"
  | "zone_manager"
  | "region_manager"
  | "area_manager"
  | "branch_manager"
  | "operator"
  | "viewer"
  | "security_officer"
  | "auditor";

export type UserStatus =
  | "active"
  | "inactive"
  | "suspended"
  | "pending_activation"
  | "locked";

export interface EdgeAgent {
  id: string;
  branchId: string;
  name: string;
  version: string;
  status: "pending" | "online" | "offline";
  lastSeenAt: string | null;
}

export interface DiscoveredCamera {
  id: string;
  branchId: string;
  edgeAgentId: string;
  vendor: CameraVendor;
  model: string;
  ipAddress: string;
  onvifPort: number;
  rtspPort: number;
  profiles: CameraProfile[];
  capabilities: CameraCapabilities;
  status: "pending" | "approved" | "rejected";
  discoveredAt: string;
}

export interface LiveSession {
  id: string;
  cameraId: string;
  userId: string;
  token: string;
  expiresAt: string;
}

export interface ConsumedLiveSession {
  id: string;
  cameraId: string;
  cameraNodeId: string;
  userId: string;
  tenantId: string;
  connectionSecretRef: string;
  profiles: CameraProfile[];
}

export type RecordingMode = "continuous" | "motion" | "scheduled" | "event" | "manual";
export type RecordingStatus = "recording" | "scheduled" | "idle" | "error" | "disabled";

/** Configuration is owned by the control plane; the recording engine executes it independently. */
export interface RecordingJob {
  id: string;
  cameraId: string;
  mode: RecordingMode;
  enabled: boolean;
  status: RecordingStatus;
  retentionDays: number;
  /** Fixed segment size. Short segments limit corruption and improve playback indexing. */
  segmentDurationSeconds: number;
  hotRetentionDays: number;
  warmRetentionDays: number;
  coldRetentionDays: number;
  maxBitrateKbps?: number | undefined;
  critical: boolean;
  backupRequired: boolean;
  automaticDeletionEnabled: boolean;
  evidenceProtection: boolean;
  recordMainStream: boolean;
  schedule?: { days: number[]; start: string; end: string } | undefined;
  postRollSeconds: number;
  updatedAt: string;
}

export interface RecordingSegment {
  id: string;
  cameraId: string;
  jobId: string;
  startedAt: string;
  endedAt: string;
  storagePath: string;
  sizeBytes: number;
  storageNodeExternalId: string;
  storageTier: "hot" | "warm" | "cold";
  status: "ready" | "moving" | "deleted" | "error";
  checksumSha256?: string | undefined;
  codec?: string | undefined;
  createdAt: string;
}

export interface RecordingLegalHold {
  id: string;
  tenantId: string;
  cameraId: string;
  fromAt: string;
  toAt: string;
  reason: string;
  createdBy: string;
  createdAt: string;
  releasedBy?: string | undefined;
  releasedAt?: string | undefined;
}

export interface RecordingStorageNode {
  id: string;
  tenantId: string;
  externalId: string;
  name: string;
  scopeNodeId?: string | undefined;
  supportedTiers: Array<"hot" | "warm" | "cold">;
  capacityBytes: number;
  usedBytes: number;
  availableBytes: number;
  status: "healthy" | "warning" | "critical" | "offline";
  temperatureCelsius?: number | undefined;
  writeMbps?: number | undefined;
  lastSeenAt: string;
}

export interface RecordingHealthEvent {
  id: string;
  tenantId: string;
  cameraId?: string | undefined;
  storageNodeExternalId?: string | undefined;
  eventType: string;
  severity: "info" | "warning" | "critical";
  message: string;
  details: Record<string, unknown>;
  occurredAt: string;
  resolvedAt?: string | undefined;
}

export interface AuditEventInput {
  tenantId: string;
  actorUserId: string | null;
  action: string;
  resourceNodeId: string | null;
  outcome: "success" | "denied" | "failure";
  sourceIp?: string;
  details?: Record<string, unknown>;
}
