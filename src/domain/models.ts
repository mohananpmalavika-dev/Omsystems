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
  "analytics:view",
  "analytics:configure",
  "alerts:acknowledge",
  "alerts:escalate",
  "analytics:export",
  "incident:create",
  "incident:view",
  "incident:update",
  "incident:assign",
  "incident:escalate",
  "incident:close",
  "incident:reopen",
  "investigation:view",
  "investigation:manage",
  "investigation:enhance",
  "evidence:create",
  "evidence:view",
  "evidence:preserve",
  "evidence:export-package",
  "evidence:approve",
  "evidence:share",
  "evidence:legal-hold",
  "evidence:release-hold",
  "police:update",
  "insurance:update",
  "incident-report:approve",
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
  edgeAgentId?: string;
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

export type AssetCategory =
  | "camera"
  | "recorder"
  | "storage"
  | "network"
  | "power"
  | "accessory";

export type AssetStatus =
  | "operational"
  | "degraded"
  | "maintenance_due"
  | "offline"
  | "retired";

export interface MaintenanceAsset {
  id: string;
  tenantId: string;
  category: AssetCategory;
  assetType: string;
  serialNumber?: string;
  make?: string;
  model?: string;
  firmwareVersion?: string;
  warrantyExpiresAt?: string;
  purchaseDate?: string;
  installationDate?: string;
  vendorId?: string;
  branchNodeId?: string;
  location?: string;
  mountingHeight?: string;
  status: AssetStatus;
  notes?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export type WorkOrderSeverity = "critical" | "high" | "medium" | "low";
export type WorkOrderStatus =
  | "open"
  | "assigned"
  | "in_progress"
  | "resolved"
  | "closed";

export interface WorkOrder {
  id: string;
  tenantId: string;
  workOrderNumber: string;
  assetId?: string;
  branchNodeId?: string;
  problem: string;
  severity: WorkOrderSeverity;
  technician?: string;
  vendorId?: string;
  slaDueAt?: string;
  eta?: string;
  parts?: string[];
  cost?: number;
  rootCause?: string;
  actionTaken?: string;
  verification?: string;
  status: WorkOrderStatus;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MaintenanceVendor {
  id: string;
  tenantId: string;
  name: string;
  contact?: string;
  email?: string;
  phone?: string;
  address?: string;
  gstNumber?: string;
  serviceCenters?: string[];
  escalationMatrix?: Record<string, unknown>;
  notes?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AmcContract {
  id: string;
  tenantId: string;
  contractNumber: string;
  vendorId: string;
  startDate: string;
  endDate: string;
  warranty?: string;
  coverage?: string;
  exclusions?: string;
  paymentTerms?: string;
  cost?: number;
  renewal?: string;
  sla?: string;
  status: string;
  notes?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export type ComplianceAssessmentStatus =
  | "compliant"
  | "exception"
  | "non-compliant"
  | "incomplete";

export type ComplianceCertificateStatus =
  | "compliant"
  | "compliant_with_exceptions"
  | "provisionally_compliant"
  | "non_compliant"
  | "incomplete";

export interface ComplianceFramework {
  id: string;
  tenantId: string;
  name: string;
  source?: string;
  description?: string;
  status: string;
  effectiveDate?: string;
  reviewDate?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CompliancePolicy {
  id: string;
  frameworkId: string;
  tenantId: string;
  policyName: string;
  policyBasis?: string;
  entityType?: string;
  locationType?: string;
  cameraType?: string;
  normalRetentionDays?: number;
  hotStorageDays?: number;
  warmStorageDays?: number;
  coldStorageDays?: number;
  backupRequired: boolean;
  legalHoldOverride: boolean;
  incidentRetentionDays?: number;
  automaticDeletionEligibility: boolean;
  approvalAuthority?: string;
  effectiveDate?: string;
  reviewDate?: string;
  notes?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ComplianceAssessment {
  id: string;
  frameworkId: string;
  tenantId: string;
  branchNodeId?: string;
  assessmentPeriodStart?: string;
  assessmentPeriodEnd?: string;
  status: ComplianceAssessmentStatus;
  summary?: Record<string, unknown>;
  evidence?: Record<string, unknown>;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ComplianceCertificate {
  id: string;
  assessmentId: string;
  tenantId: string;
  certificateNumber: string;
  title: string;
  status: ComplianceCertificateStatus;
  issuedBy?: string;
  issuedAt: string;
  expiryDate?: string;
  documentHash?: string;
  signature?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
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
  publicMediaUrl?: string;
}

export interface EdgeScanJob {
  id: string;
  branchId: string;
  edgeAgentId: string;
  status: "queued" | "running" | "completed" | "failed";
  requestedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  resultCount: number;
  error: string | null;
}

export interface OnvifCapabilityTest {
  name: string;
  status: "pass" | "fail" | "unsupported" | "vendor-specific";
  detail?: string;
}

export interface DiscoveredCamera {
  id: string;
  branchId: string;
  edgeAgentId: string;
  discoveryMethod: "onvif-ws-discovery" | "configured-ip-range" | "manual-ip-registration" | "csv-bulk-import" | "nvr-dvr-channel-discovery" | "vendor-api-discovery" | "snmp-discovery" | "edge-agent-reported-inventory";
  vendor: CameraVendor;
  manufacturer: string;
  model: string;
  ipAddress: string;
  macAddress?: string;
  serialNumber?: string;
  firmwareVersion?: string;
  onvifSupport?: boolean;
  onvifEndpointReference?: string;
  onvifServices?: string[];
  onvifCapabilityTests?: OnvifCapabilityTest[];
  mediaProfiles?: CameraProfile[];
  rtspValidated?: boolean;
  ptzCapability?: boolean;
  audioCapability?: boolean;
  analyticsCapability?: boolean;
  timeSynchronization?: "synchronized" | "drifted" | "unknown";
  duplicateStatus?: "unique" | "duplicate" | "review-required";
  compatibilityStatus?: "compatible" | "incompatible" | "review-required";
  hardwareId?: string;
  existingDeviceAssociation?: string;
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
  mediaGatewayUrl?: string;
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
export type RecordingStatus = "recording" | "scheduled" | "idle" | "error" | "disabled" | "starting" | "degraded" | "interrupted" | "recovering";

export interface RecordingScheduleWindow {
  name?: string;
  days: number[];
  start: string;
  end: string;
  enabled?: boolean;
}

export interface RecordingScheduleException {
  name?: string;
  date: string;
  start?: string;
  end?: string;
  enabled: boolean;
  description?: string;
}

export interface RecordingSchedule {
  timezone?: string;
  windows: RecordingScheduleWindow[];
  exceptions?: RecordingScheduleException[];
}

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
  schedule?: RecordingSchedule | undefined;
  preRollSeconds: number;
  postRollSeconds: number;
  minMotionDurationSeconds: number;
  motionConfidenceThreshold: number;
  cooldownSeconds: number;
  maxEventDurationSeconds: number;
  storageNodeExternalId?: string | undefined;
  triggerEventTypes?: string[] | undefined;
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

export type RecordingRaidStatus = "healthy" | "degraded" | "rebuilding" | "failed" | "unknown";
export type RecordingHotSpareStatus = "active" | "inactive" | "unknown";
export type RecordingControllerHealth = "healthy" | "warning" | "critical" | "unknown";

export interface RecordingStorageSmart {
  overallStatus: "passed" | "failed" | "unknown";
  reallocatedSectors: number;
  pendingSectors: number;
  uncorrectableSectors: number;
  temperatureCelsius?: number | undefined;
  powerOnHours?: number | undefined;
  readErrors: number;
  writeErrors: number;
  remainingSsdLifePercent?: number | undefined;
  interfaceCrcErrors: number;
}

export interface RecordingStorageRaid {
  status: RecordingRaidStatus;
  level?: string | undefined;
  memberDisks: string[];
  failedMembers: string[];
  rebuildProgressPercent?: number | undefined;
  hotSpareStatus?: RecordingHotSpareStatus | undefined;
  controllerHealth?: RecordingControllerHealth | undefined;
}

export interface RecordingStorageProbeResult {
  status: "passed" | "failed";
  latencyMs: number;
  bytesWritten: number;
  checksum: string;
  error?: string | undefined;
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
  storageType?: "local-disk" | "nfs" | "smb" | "s3" | "cloud-archive" | "san";
  supportedProtocols?: string[];
  location?: string;
  mountPath?: string;
  temperatureCelsius?: number | undefined;
  writeMbps?: number | undefined;
  readMbps?: number | undefined;
  latencyMs?: number | undefined;
  smart?: RecordingStorageSmart | undefined;
  raid?: RecordingStorageRaid | undefined;
  lastWriteProbe?: RecordingStorageProbeResult | undefined;
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

export type LiveBookmarkReason =
  | "suspicious-activity"
  | "cash-discrepancy"
  | "unauthorized-entry"
  | "customer-dispute"
  | "equipment-failure"
  | "safety-incident"
  | "other";

export type LivePriority = "low" | "medium" | "high" | "critical";

export interface LiveBookmark {
  id: string;
  tenantId: string;
  cameraId: string;
  operatorId: string;
  bookmarkedAt: string;
  reason: LiveBookmarkReason;
  notes?: string | undefined;
  priority: LivePriority;
  incidentId?: string | undefined;
  recordingSegmentId?: string | undefined;
  snapshotReference?: string | undefined;
  createdAt: string;
}

export type LiveIncidentPriority = "P1" | "P2" | "P3" | "P4" | "P5";
export type LiveIncidentStatus =
  | "new"
  | "acknowledged"
  | "investigating"
  | "escalated"
  | "resolved"
  | "false-alarm";

export interface LiveIncident {
  id: string;
  tenantId: string;
  cameraId: string;
  createdBy: string;
  title: string;
  notes?: string | undefined;
  priority: LiveIncidentPriority;
  status: LiveIncidentStatus;
  occurredAt: string;
  recordingFrom: string;
  recordingTo: string;
  preRollSeconds: number;
  postRollSeconds: number;
  bookmarkId: string;
  legalHoldId: string;
  createdAt: string;
  updatedAt: string;
}

export type AnalyticsDetectionType =
  | "motion"
  | "person"
  | "vehicle"
  | "object"
  | "line-crossing"
  | "intrusion"
  | "loitering"
  | "crowd-density"
  | "camera-tampering"
  | "video-loss"
  | "fire-smoke";

export type AnalyticsSeverity = "P1" | "P2" | "P3" | "P4" | "P5";
export type AnalyticsAlertStatus =
  | "new"
  | "acknowledged"
  | "investigating"
  | "escalated"
  | "resolved"
  | "false_alarm"
  | "suppressed";

export interface AnalyticsPoint {
  /** Horizontal position normalized to the camera frame, from 0 to 1. */
  x: number;
  /** Vertical position normalized to the camera frame, from 0 to 1. */
  y: number;
}

export interface AnalyticsZone {
  id: string;
  name: string;
  shape: "polygon" | "line";
  points: AnalyticsPoint[];
}

export interface AnalyticsSchedule {
  days: number[];
  start: string;
  end: string;
  timezone: string;
}

export interface AnalyticsRule {
  id: string;
  tenantId: string;
  cameraId: string;
  name: string;
  detectionType: AnalyticsDetectionType;
  enabled: boolean;
  zone?: AnalyticsZone | undefined;
  schedule?: AnalyticsSchedule | undefined;
  objectClasses: string[];
  minConfidence: number;
  minDurationSeconds: number;
  direction: "any" | "a-to-b" | "b-to-a" | "enter" | "exit";
  severity: AnalyticsSeverity;
  cooldownSeconds: number;
  recipients: string[];
  escalateAfterSeconds?: number | undefined;
  recordingPolicy: "none" | "event-recording" | "protect-window";
  preRollSeconds: number;
  postRollSeconds: number;
  modelId?: string | undefined;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface AnalyticsDetectedObject {
  label: string;
  confidence: number;
  trackId?: string | undefined;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | undefined;
}

export interface AnalyticsEvent {
  id: string;
  tenantId: string;
  cameraId: string;
  sourceEventId: string;
  ruleId?: string | undefined;
  detectionType: AnalyticsDetectionType;
  occurredAt: string;
  endedAt?: string | undefined;
  confidence: number;
  durationSeconds: number;
  modelVersion: string;
  objects: AnalyticsDetectedObject[];
  snapshotReference?: string | undefined;
  clipReference?: string | undefined;
  metadata: Record<string, unknown>;
  status: "accepted" | "suppressed" | "unmatched" | "duplicate";
  rejectionReason?: string | undefined;
  createdAt: string;
}

export interface AnalyticsAlert {
  id: string;
  tenantId: string;
  cameraId: string;
  ruleId: string;
  eventId: string;
  title: string;
  description?: string | undefined;
  severity: AnalyticsSeverity;
  status: AnalyticsAlertStatus;
  confidence: number;
  objectClasses: string[];
  modelVersion: string;
  snapshotReference?: string | undefined;
  clipReference?: string | undefined;
  firstDetectedAt: string;
  lastDetectedAt: string;
  occurrenceCount: number;
  incidentId?: string | undefined;
  acknowledgedBy?: string | undefined;
  acknowledgedAt?: string | undefined;
  falseAlarmReason?: string | undefined;
  resolvedAt?: string | undefined;
  createdAt: string;
  updatedAt: string;
}

export interface AnalyticsIngestResult {
  event: AnalyticsEvent;
  alerts: AnalyticsAlert[];
  rules: AnalyticsRule[];
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

// Video Search & Retrieval Models

export interface RecordingTimeline {
  cameraId: string;
  from: string;
  to: string;
  segments: {
    startTime: string;
    endTime: string;
    storageLocation: string;
    available: boolean;
    hasMotion?: boolean;
    events?: string[];
  }[];
  gaps: {
    startTime: string;
    endTime: string;
    reason: string;
  }[];
  bookmarks: {
    timestamp: string;
    reason: string;
    priority: LivePriority;
  }[];
  legalHolds: {
    caseNumber: string;
    startTime: string;
    endTime: string;
  }[];
}

export interface RecordingThumbnail {
  id: string;
  segmentId: string;
  cameraId: string;
  timestamp: string;
  dataUrl: string;
  eventType?: string;
  confidence?: number;
  reference: string;
}

export interface Snapshot {
  id: string;
  segmentId: string;
  cameraId: string;
  timestamp: string;
  reason: "investigation" | "evidence" | "reference" | "incident" | "audit";
  notes?: string;
  operatorId: string;
  originalHash: string;
  createdAt: string;
  reference: string;
}

export type EvidenceCaseStatus = "open" | "investigating" | "closed" | "archived";

export interface EvidenceCase {
  id: string;
  tenantId: string;
  caseNumber: string;
  title: string;
  description?: string;
  status: EvidenceCaseStatus;
  createdBy: string;
  createdAt: string;
  closedAt?: string;
  reason?: string;
  relatedIncidents: string[];
  legalHoldItems: string[];
}

export interface EvidenceItem {
  id: string;
  caseId: string;
  type: "recording" | "snapshot" | "exported-video" | "manifest" | "document";
  cameraId?: string;
  startTime?: string;
  endTime?: string;
  description: string;
  addedBy: string;
  addedAt: string;
  hash?: string;
  hashAlgorithm?: string;
  fileSize?: number;
}

export interface SegmentVerification {
  segmentId: string;
  status: "verified" | "mismatch" | "missing" | "pending";
  recordedHash: string;
  computedHash?: string;
  lastVerifiedAt?: string;
  verificationError?: string;
}

export type EvidenceExportFormat = "original" | "mp4" | "manifest-only";

export interface EvidenceExport {
  id: string;
  caseId: string;
  exportedBy: string;
  reason: string;
  format: EvidenceExportFormat;
  status: "pending" | "processing" | "ready" | "failed" | "downloaded" | "expired";
  requestedAt: string;
  completedAt?: string;
  downloadUrl?: string;
  expiresAt?: string;
  manifestId?: string;
  checksumSha256?: string;
  errors?: string[];
}

export interface EvidenceManifest {
  evidenceId: string;
  caseId: string;
  exportedBy: string;
  exportedAt: string;
  sourceSegments: {
    segmentId: string;
    cameraId: string;
    startTime: string;
    endTime: string;
    sha256: string;
  }[];
  destinationFile: {
    format: string;
    sha256: string;
    fileSize: number;
  };
  timestamp: {
    cameraTime: string;
    recorderTime: string;
    clockOffset: number;
    ntpStatus: string;
  };
  signature?: string;
}

export type CustodyAction =
  | "recording_created"
  | "hash_calculated"
  | "recording_viewed"
  | "snapshot_captured"
  | "bookmark_created"
  | "added_to_case"
  | "legal_hold_applied"
  | "exported"
  | "downloaded"
  | "verified"
  | "hold_released"
  | "archived";

export interface ChainOfCustodyEvent {
  id: string;
  evidenceId?: string;
  action: CustodyAction;
  performedBy: string;
  performedAt: string;
  sourceIp?: string;
  reason?: string;
  previousHash?: string;
  eventHash: string;
  signature?: string;
}

export interface RecordingLegalHoldRequest {
  caseNumber: string;
  reason: string;
  requestedBy: string;
  cameraIds: string[];
  startTime: string;
  endTime: string;
  reviewDate?: string;
  expiryDate?: string;
}

// ============ INCIDENT MANAGEMENT & INVESTIGATION ============

export type IncidentType =
  | "theft-robbery"
  | "fire-emergency"
  | "atm-tampering"
  | "unauthorized-access"
  | "suspicious-activity"
  | "accident-injury"
  | "vandalism"
  | "customer-dispute"
  | "cash-shortage-excess"
  | "teller-dispute"
  | "vault-violation"
  | "locker-room-incident"
  | "employee-misconduct"
  | "fraud-suspicion"
  | "cyber-tampering"
  | "camera-tampering"
  | "panic-button"
  | "vehicle-incident"
  | "lost-property"
  | "workplace-safety"
  | "false-alarm"
  | "other";

export type IncidentSeverity = "P1" | "P2" | "P3" | "P4" | "P5";

export type IncidentStatus =
  | "draft"
  | "new"
  | "acknowledged"
  | "under-triage"
  | "assigned"
  | "under-investigation"
  | "awaiting-information"
  | "escalated"
  | "police-intimated"
  | "insurance-submitted"
  | "resolved"
  | "closed"
  | "reopened"
  | "cancelled"
  | "false-alarm";

export type IncidentDetectionSource =
  | "manual-operator"
  | "manual-branch"
  | "manual-mobile"
  | "ai-detection"
  | "external-alarm"
  | "external-atm"
  | "external-access-control"
  | "external-panic"
  | "external-fire"
  | "post-event-discovery";

export type IncidentConfidentialityLevel =
  | "public"
  | "internal"
  | "confidential"
  | "restricted"
  | "highly-restricted";

export interface Incident {
  id: string;
  incidentNumber: string;
  tenantId: string;
  branchId?: string;
  title: string;
  description?: string;
  incidentType: IncidentType;
  severity: IncidentSeverity;
  status: IncidentStatus;
  detectionSource: IncidentDetectionSource;
  occurredAt: string;
  detectedAt: string;
  reportedAt?: string;
  reportedBy?: string;
  assignedTo?: string;
  estimatedLoss?: number;
  injuryDetails?: string;
  confidentialityLevel: IncidentConfidentialityLevel;
  legalHoldStatus: boolean;
  policeRequired: boolean;
  insuranceRequired: boolean;
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
}

export type IncidentParticipantRole =
  | "suspect"
  | "victim"
  | "witness"
  | "customer"
  | "employee"
  | "investigator"
  | "reporter"
  | "approver"
  | "other";

export interface IncidentParticipant {
  id: string;
  incidentId: string;
  role: IncidentParticipantRole;
  personType: "customer" | "employee" | "vendor" | "visitor" | "unknown";
  name?: string;
  employeeId?: string;
  customerId?: string;
  contactPhone?: string;
  contactEmail?: string;
  notes?: string;
  addedBy: string;
  addedAt: string;
}

export interface IncidentCamera {
  id: string;
  incidentId: string;
  cameraId: string;
  isPrimary: boolean;
  addedAt: string;
  addedBy: string;
}

export interface IncidentVideoRange {
  id: string;
  incidentId: string;
  cameraId: string;
  fromAt: string;
  toAt: string;
  preservedAt: string;
  preservedBy: string;
  legalHoldApplied: boolean;
  legalHoldId?: string;
  notes?: string;
}

export type IncidentEventType =
  | "status_changed"
  | "assigned"
  | "escalated"
  | "video_preserved"
  | "camera_added"
  | "clip_created"
  | "snapshot_taken"
  | "evidence_exported"
  | "police_intimated"
  | "insurance_filed"
  | "note_added"
  | "participant_added"
  | "task_created"
  | "approval_requested"
  | "approval_granted"
  | "approval_rejected";

export interface IncidentEvent {
  id: string;
  incidentId: string;
  eventType: IncidentEventType;
  description: string;
  details?: Record<string, unknown>;
  performedBy?: string;
  occurredAt: string;
}

export interface IncidentClip {
  id: string;
  incidentId: string;
  cameraId: string;
  sourceSegmentIds: string[];
  startTime: string;
  endTime: string;
  clipType: "original-segment" | "investigation-copy" | "export-copy";
  storagePath?: string;
  sizeBytes?: number;
  checksumSha256?: string;
  format?: string;
  hasWatermark: boolean;
  hasTimestamp: boolean;
  createdBy: string;
  createdAt: string;
  notes?: string;
}

export interface IncidentSnapshot {
  id: string;
  incidentId: string;
  cameraId: string;
  segmentId?: string;
  timestamp: string;
  snapshotType: "original" | "annotated" | "cropped" | "enhanced";
  storagePath?: string;
  checksumSha256?: string;
  description?: string;
  annotations?: Record<string, unknown>;
  enhancementDetails?: Record<string, unknown>;
  createdBy: string;
  createdAt: string;
}

export type EvidenceItemType =
  | "original-video"
  | "investigation-clip"
  | "snapshot"
  | "timeline-report"
  | "ai-event-log"
  | "alert-log"
  | "operator-notes"
  | "camera-details"
  | "hash-report"
  | "chain-of-custody"
  | "police-document"
  | "insurance-document"
  | "external-document";

export interface IncidentEvidenceItem {
  id: string;
  incidentId: string;
  itemType: EvidenceItemType;
  title: string;
  description?: string;
  referenceId?: string;
  storagePath?: string;
  checksumSha256?: string;
  addedBy: string;
  addedAt: string;
}

export type EvidencePackageStatus =
  | "draft"
  | "pending-approval"
  | "approved"
  | "generating"
  | "ready"
  | "failed"
  | "downloaded"
  | "expired";

export interface IncidentEvidencePackage {
  id: string;
  incidentId: string;
  packageNumber: string;
  title: string;
  description?: string;
  status: EvidencePackageStatus;
  includeOriginalVideo: boolean;
  includeInvestigationClips: boolean;
  includeSnapshots: boolean;
  includeTimeline: boolean;
  includeAlertLogs: boolean;
  includeDocuments: boolean;
  packagePath?: string;
  packageSizeBytes?: number;
  checksumSha256?: string;
  manifestPath?: string;
  digitallySigned: boolean;
  signature?: string;
  createdBy: string;
  createdAt: string;
  approvedBy?: string;
  approvedAt?: string;
  generatedAt?: string;
  expiresAt?: string;
  downloadedBy?: string;
  downloadedAt?: string;
  error?: string;
}

export type PoliceIntimationStatus =
  | "required"
  | "pending-approval"
  | "approved"
  | "intimated"
  | "fir-filed"
  | "under-investigation"
  | "charge-sheet-filed"
  | "closed"
  | "not-required";

export interface IncidentPoliceIntimation {
  id: string;
  incidentId: string;
  policeStation: string;
  policeStationAddress?: string;
  intimationMethod: "in-person" | "email" | "phone" | "portal" | "other";
  intimatedAt: string;
  intimatedBy: string;
  officerName?: string;
  officerDesignation?: string;
  officerContact?: string;
  gdNumber?: string;
  firNumber?: string;
  firDate?: string;
  firCopy?: string;
  acknowledgementCopy?: string;
  status: PoliceIntimationStatus;
  investigationOfficer?: string;
  investigationOfficerContact?: string;
  followUpDate?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface IncidentPoliceEvidenceTransfer {
  id: string;
  incidentId: string;
  policeIntimationId: string;
  transferDate: string;
  transferredBy: string;
  evidencePackageId?: string;
  evidenceDescription: string;
  recipientName: string;
  recipientDesignation?: string;
  receiptAcknowledgement?: string;
  transferMethod: "physical-media" | "secure-link" | "portal" | "in-person" | "other";
  notes?: string;
  createdAt: string;
}

export type InsuranceClaimStatus =
  | "not-required"
  | "to-be-filed"
  | "prepared"
  | "submitted"
  | "additional-info-required"
  | "survey-in-progress"
  | "approved"
  | "partially-approved"
  | "rejected"
  | "settled"
  | "closed";

export interface IncidentInsuranceClaim {
  id: string;
  incidentId: string;
  insuranceCompany: string;
  policyNumber: string;
  claimNumber?: string;
  dateOfLoss: string;
  estimatedLoss: number;
  claimAmount?: number;
  submittedDate?: string;
  submittedBy?: string;
  surveyorName?: string;
  surveyorContact?: string;
  surveyDate?: string;
  status: InsuranceClaimStatus;
  settlementAmount?: number;
  settlementDate?: string;
  rejectionReason?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface IncidentInsuranceDocument {
  id: string;
  incidentId: string;
  claimId: string;
  documentType: string;
  documentTitle: string;
  documentPath?: string;
  uploadedBy: string;
  uploadedAt: string;
}

export type IncidentTaskStatus = "pending" | "in-progress" | "completed" | "cancelled";

export interface IncidentTask {
  id: string;
  incidentId: string;
  taskName: string;
  description?: string;
  assignedTo?: string;
  dueDate?: string;
  priority: "low" | "medium" | "high" | "critical";
  status: IncidentTaskStatus;
  isMandatory: boolean;
  completedBy?: string;
  completedAt?: string;
  completionNotes?: string;
  createdBy: string;
  createdAt: string;
}

export interface IncidentNote {
  id: string;
  incidentId: string;
  noteType: "general" | "investigation" | "management" | "legal" | "confidential";
  content: string;
  createdBy: string;
  createdAt: string;
  editedAt?: string;
}

export type SecureShareStatus = "active" | "downloaded" | "expired" | "revoked";

export interface IncidentSecureShare {
  id: string;
  incidentId: string;
  evidencePackageId?: string;
  shareToken: string;
  shareUrl: string;
  recipientName: string;
  recipientOrganization: string;
  recipientEmail?: string;
  recipientVerified: boolean;
  purpose: string;
  oneTimePassword?: string;
  maxDownloads: number;
  downloadCount: number;
  expiresAt: string;
  status: SecureShareStatus;
  watermarked: boolean;
  encrypted: boolean;
  createdBy: string;
  createdAt: string;
  downloadedAt?: string;
  downloadedBy?: string;
  downloadIp?: string;
  revokedAt?: string;
  revokedBy?: string;
  revokeReason?: string;
}

export type IncidentReportStatus = "draft" | "pending-review" | "approved" | "final";

export interface IncidentReport {
  id: string;
  incidentId: string;
  reportNumber: string;
  reportType: "preliminary" | "investigation" | "final" | "executive-summary";
  status: IncidentReportStatus;
  executiveSummary?: string;
  detailedChronology?: string;
  findings?: string;
  rootCause?: string;
  controlFailures?: string;
  correctiveActions?: string;
  preventiveActions?: string;
  recommendations?: string;
  conclusions?: string;
  evidenceIndex?: string;
  chainOfCustodySummary?: string;
  unresolvedQuestions?: string;
  createdBy: string;
  createdAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
  approvedBy?: string;
  approvedAt?: string;
  finalizedAt?: string;
  reportPath?: string;
}
