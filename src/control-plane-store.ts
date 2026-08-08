import type {
  Action,
  AnalyticsAlert,
  AlertNotification,
  AlertNotificationPolicy,
  AlertNotificationChannel,
  AnalyticsAlertStatus,
  AnalyticsDetectionType,
  AnalyticsDetectedObject,
  AnalyticsIngestResult,
  AnalyticsRule,
  AuditEventInput,
  BranchCameraCoverageGap,
  BranchCameraRequirement,
  Camera,
  CameraCapabilities,
  CameraComplianceSummary,
  CameraInstallationCompliance,
  CameraProfile,
  CameraSpecifications,
  CameraStatus,
  CameraVendor,
  AssetCategory,
  AssetStatus,
  MaintenanceAsset,
  WorkOrder,
  WorkOrderSeverity,
  WorkOrderStatus,
  MaintenanceVendor,
  AmcContract,
  ComplianceAssessment,
  ComplianceAssessmentStatus,
  ComplianceCertificate,
  ComplianceCertificateStatus,
  ComplianceFramework,
  CompliancePolicy,
  DiscoveredCamera,
  EdgeActivation,
  EdgeAgent,
  EdgeManagedTunnel,
  BranchConnectivityProfile,
  EdgeCommand,
  EdgeCommandType,
  EdgeScanJob,
  EdgeUpdateRelease,
  LiveSession,
  ConsumedLiveSession,
  RecordingJob,
  RecordingHealthEvent,
  RecordingLegalHold,
  RecordingSegment,
  RecordingStorageNode,
  RecordingStorageSmart,
  RecordingStorageRaid,
  RecordingStorageProbeResult,
  RecordingMode,
  LiveBookmark,
  LiveBookmarkReason,
  LiveIncident,
  LiveIncidentPriority,
  LiveIncidentStatus,
  LivePriority,
  NodeType,
  ResourceNode,
  User,
} from "./domain/models.js";
import type { AuthorizationDecision } from "./domain/authorization.js";
import type { OperationalHealthPolicy, OperationalTelemetryEnvelope, VideoWallLayout, VideoWallGridSize } from "./operational-health/types.js";
import type {
  OperationalReportSchedule, OperationalReportRun, OperationalReportArtifact,
  OperationalReportDelivery,
} from "./reporting/types.js";

export interface CameraDiscoveryInput {
  edgeAgentId: string;
  discoveryMethod: "onvif-ws-discovery" | "configured-ip-range" | "manual-ip-registration" | "csv-bulk-import" | "nvr-dvr-channel-discovery" | "vendor-api-discovery" | "snmp-discovery" | "edge-agent-reported-inventory";
  vendor: CameraVendor;
  manufacturer?: string;
  model: string;
  ipAddress: string;
  macAddress?: string;
  serialNumber?: string;
  firmwareVersion?: string;
  onvifSupport?: boolean;
  onvifEndpointReference?: string;
  onvifServices?: string[];
  onvifCapabilityTests?: Array<{ name: string; status: "pass" | "fail" | "unsupported" | "vendor-specific"; detail?: string }>;
  mediaProfiles?: CameraProfile[];
  rtspValidated?: boolean;
  ptzCapability?: boolean;
  audioCapability?: boolean;
  analyticsCapability?: boolean;
  displayName?: string;
  statusReason?: string;
  credentialsRequired?: boolean;
  streamVerified?: boolean;
  compatibility?: string;
  timeSynchronization?: "synchronized" | "drifted" | "unknown";
  duplicateStatus?: "unique" | "duplicate" | "review-required";
  compatibilityStatus?: "compatible" | "incompatible" | "review-required";
  hardwareId?: string;
  existingDeviceAssociation?: string;
  sourceType?: Camera["sourceType"];
  recorderId?: string;
  recorderChannel?: number;
  recorderSerialNumber?: string;
  onvifPort: number;
  rtspPort: number;
  profiles: CameraProfile[];
  capabilities: CameraCapabilities;
}

export interface CameraApprovalInput {
  discoveryId: string;
  name: string;
  channel: number;
  protocol: Camera["protocol"];
  connectionSecretRef: string;
  branchCode?: string;
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  ipAddress?: string;
  onvifPort?: number;
  rtspPort?: number;
  streamProfile?: string;
  sourceType?: Camera["sourceType"];
  connectionTransport?: Camera["connectionTransport"];
  recorderId?: string;
  recorderChannel?: number;
  recorderSerialNumber?: string;
}

export interface RecorderReplacementMapping {
  cameraId: string;
  discoveryId: string;
  sourceChannel: number;
}

export interface RecorderReplacementResult {
  replacementId: string;
  branchId: string;
  oldRecorderSerialNumber: string;
  newRecorderSerialNumber: string;
  updatedCameraIds: string[];
  preserved: Array<"camera-ids" | "names" | "permissions" | "recording-history" | "recording-policy" | "analytics-rules" | "alert-rules">;
  appliedAt: string;
}

export interface CameraSpecificationsInput {
  resolutionMp: number;
  resolutionWidth: number;
  resolutionHeight: number;
  frameRate: number;
  videoCodec: string;
  bitrateKbps?: number | undefined;
  fieldOfViewHorizontal?: number | undefined;
  fieldOfViewVertical?: number | undefined;
  focalLengthMm?: number | undefined;
  lensType?: string | undefined;
  hasNightVision: boolean;
  irDistanceMeters?: number | undefined;
  hasWdr: boolean;
  minIlluminationLux?: number | undefined;
  weatherproofRating?: string | undefined;
  operatingTempMin?: number | undefined;
  operatingTempMax?: number | undefined;
  vandalResistant: boolean;
  powerConsumptionWatts?: number | undefined;
  powerSupplyType?: string | undefined;
  poeClass?: string | undefined;
  storageDays: number;
  avgStoragePerDayGb?: number | undefined;
  hasTwoWayAudio: boolean;
  hasMotionDetection: boolean;
  hasAnalytics: boolean;
  analyticsFeatures: string[];
}

export interface CameraComplianceInput {
  meetsResolutionRequirement: boolean;
  meetsFrameRateRequirement: boolean;
  meetsCoverageRequirement: boolean;
  meetsRetentionRequirement: boolean;
  properLighting: boolean;
  properAngle: boolean;
  complianceNotes?: string | undefined;
  lastInspectionDate?: string | undefined;
  nextInspectionDate?: string | undefined;
  inspectorName?: string | undefined;
  audioRecordingCompliant: boolean;
  privacyMaskConfigured: boolean;
  signageInstalled: boolean;
}

export interface CameraDetailsUpdate {
  locationType?: Camera["locationType"] | undefined;
  physicalType?: Camera["physicalType"] | undefined;
  installationDate?: string | undefined;
  warrantyExpiresAt?: string | undefined;
  serialNumber?: string | undefined;
  macAddress?: string | undefined;
  firmwareVersion?: string | undefined;
  ipAddress?: string | undefined;
  installationNotes?: string | undefined;
}

export type DeviceInventoryLifecycleState =
  | "discovered"
  | "pending-approval"
  | "approved"
  | "configured"
  | "operational"
  | "maintenance"
  | "suspended"
  | "decommissioned";

export interface DeviceInventoryRecord {
  id: string;
  tenantId: string;
  deviceId: string;
  tenant: string;
  region: string;
  branch: string;
  deviceType: string;
  manufacturer: string;
  model: string;
  serialNumber?: string;
  macAddress?: string;
  ipAddress?: string;
  firmwareVersion?: string;
  onvifVersion?: string;
  capabilities: string[];
  credentialReference?: string;
  installationDate?: string;
  warranty?: string;
  amcContract?: string;
  healthStatus: string;
  lastCommunication?: string;
  configurationTemplate?: string;
  riskClassification: string;
  lifecycleState: DeviceInventoryLifecycleState;
  createdAt: string;
  updatedAt: string;
}

export interface DeviceInventoryInput {
  tenantId: string;
  deviceId: string;
  tenant: string;
  region: string;
  branch: string;
  deviceType: string;
  manufacturer: string;
  model: string;
  serialNumber?: string;
  macAddress?: string;
  ipAddress?: string;
  firmwareVersion?: string;
  onvifVersion?: string;
  capabilities?: string[];
  credentialReference?: string;
  installationDate?: string;
  warranty?: string;
  amcContract?: string;
  healthStatus?: string;
  lastCommunication?: string;
  configurationTemplate?: string;
  riskClassification?: string;
  lifecycleState?: DeviceInventoryLifecycleState;
}

export interface ComplianceFrameworkInput {
  tenantId: string;
  name: string;
  source?: string | undefined;
  description?: string | undefined;
  status?: string | undefined;
  effectiveDate?: string | undefined;
  reviewDate?: string | undefined;
  createdBy?: string | undefined;
}

export interface CompliancePolicyInput {
  frameworkId: string;
  tenantId: string;
  policyName: string;
  policyBasis?: string | undefined;
  entityType?: string | undefined;
  locationType?: string | undefined;
  cameraType?: string | undefined;
  normalRetentionDays?: number | undefined;
  hotStorageDays?: number | undefined;
  warmStorageDays?: number | undefined;
  coldStorageDays?: number | undefined;
  backupRequired?: boolean | undefined;
  legalHoldOverride?: boolean | undefined;
  incidentRetentionDays?: number | undefined;
  automaticDeletionEligibility?: boolean | undefined;
  approvalAuthority?: string | undefined;
  effectiveDate?: string | undefined;
  reviewDate?: string | undefined;
  notes?: string | undefined;
  createdBy?: string | undefined;
}

export interface ComplianceAssessmentFilters {
  frameworkId?: string | undefined;
  branchNodeId?: string | undefined;
  status?: string | undefined;
}

export interface ComplianceAssessmentInput {
  frameworkId: string;
  tenantId: string;
  branchNodeId?: string | undefined;
  assessmentPeriodStart?: string | undefined;
  assessmentPeriodEnd?: string | undefined;
  status?: ComplianceAssessmentStatus | undefined;
  summary?: Record<string, unknown> | undefined;
  evidence?: Record<string, unknown> | undefined;
  createdBy?: string | undefined;
}

export interface ComplianceCertificateInput {
  assessmentId: string;
  tenantId: string;
  certificateNumber: string;
  title: string;
  status: ComplianceCertificateStatus;
  issuedBy?: string | undefined;
  issuedAt?: string | undefined;
  expiryDate?: string | undefined;
  documentHash?: string | undefined;
  signature?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export interface PrivacyPurposeInput {
  tenantId: string;
  name: string;
  lawfulBasis: string;
  description?: string | undefined;
  riskLevel?: "low" | "medium" | "high" | "critical" | undefined;
  dataCategories?: string[] | undefined;
  active?: boolean | undefined;
  createdBy?: string | undefined;
}

export interface CameraPrivacyPurposeAssignmentInput {
  purposeId: string;
  startDate?: string | undefined;
  endDate?: string | undefined;
  notes?: string | undefined;
}

export interface CameraPrivacyControlInput {
  audioRecordingApproved?: boolean | undefined;
  encryptionEnabled?: boolean | undefined;
  disposalPlan?: string | undefined;
  dataProtectionOfficer?: string | undefined;
  lastReviewedAt?: string | undefined;
}

export interface PrivacyBreachInput {
  tenantId: string;
  branchNodeId?: string | undefined;
  cameraId?: string | undefined;
  breachType: string;
  severity: "low" | "medium" | "high" | "critical";
  discoveredAt: string;
  description?: string | undefined;
  remediation?: string | undefined;
  createdBy?: string | undefined;
}

// AssetCategory and AssetStatus are defined in domain/models and imported above.

export interface MaintenanceAssetInput {
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
  status?: AssetStatus;
  notes?: string;
  createdBy: string;
}

export interface MaintenanceAssetUpdate extends Partial<MaintenanceAssetInput> {}

// WorkOrderSeverity and WorkOrderStatus are defined in domain/models and imported above.

export interface WorkOrderInput {
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
  status?: WorkOrderStatus;
  createdBy: string;
}

export interface WorkOrderUpdate extends Partial<WorkOrderInput> {}

export interface MaintenanceVendorInput {
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
  createdBy: string;
}

export interface MaintenanceVendorUpdate extends Partial<MaintenanceVendorInput> {}

export interface AmcContractInput {
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
  status?: string;
  notes?: string;
  createdBy?: string;
}

export interface AmcContractUpdate extends Partial<AmcContractInput> {}

export interface BranchCameraRequirementInput {
  locationType: string;
  requiredCount: number;
  minResolutionMp: number;
  minFrameRate: number;
  requiresNightVision: boolean;
  requiresAudio: boolean;
  requiresPtz: boolean;
  requiresLpr: boolean;
  priority: number;
  isRegulatoryRequirement: boolean;
  complianceStandard?: string | undefined;
  notes?: string | undefined;
}

export type AnalyticsRuleInput = Omit<
  AnalyticsRule,
  "id" | "tenantId" | "cameraId" | "createdBy" | "createdAt" | "updatedAt"
>;

export interface AnalyticsAlertFilters {
  cameraId?: string | undefined;
  branchId?: string | undefined;
  status?: AnalyticsAlertStatus | undefined;
  severity?: AnalyticsAlert["severity"] | undefined;
  from?: string | undefined;
  to?: string | undefined;
  limit: number;
}

export interface AnalyticsEventInput {
  tenantId: string;
  cameraId: string;
  sourceEventId: string;
  detectionType: AnalyticsDetectionType;
  occurredAt: string;
  endedAt?: string | undefined;
  confidence: number;
  durationSeconds: number;
  modelVersion: string;
  objects: AnalyticsDetectedObject[];
  snapshotReference?: string | undefined;
  clipReference?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export interface AnalyticsAlertTransitionInput {
  status: AnalyticsAlertStatus;
  actorUserId: string;
  notes?: string | undefined;
  falseAlarmReason?: string | undefined;
  recipients?: string[] | undefined;
  assignedTo?: string | undefined;
  expectedVersion?: number | undefined;
}

export interface ControlPlaneStore {
  close(): Promise<void>;
  getUser(identity: string): Promise<User | undefined>;
  getNode(id: string): Promise<ResourceNode | undefined>;
  checkAccess(
    user: User,
    action: Action,
    resourceNodeId: string,
  ): Promise<AuthorizationDecision | undefined>;
  listAccessibleNodes(
    user: User,
    action: Action,
    type?: NodeType,
  ): Promise<ResourceNode[]>;
  getCamera(id: string): Promise<Camera | undefined>;
  listCamerasByBranch(
    user: User,
    branchId: string,
    action: Action,
  ): Promise<Camera[]>;
  /** Cameras owned by an edge agent. This is used only to configure that agent's local monitoring. */
  listCamerasByEdgeAgent(edgeAgentId: string): Promise<Camera[]>;
  listAccessibleCameras(
    user: User,
    action: Action,
    filters: { branchId?: string; search?: string; status?: CameraStatus; limit: number; offset: number },
  ): Promise<{ cameras: Camera[]; total: number }>;
  createBranch(
    tenantId: string,
    parentNodeId: string,
    name: string,
  ): Promise<ResourceNode>;
  createDeviceInventoryRecord(input: DeviceInventoryInput): Promise<DeviceInventoryRecord>;
  listDeviceInventory(tenantId: string, branch?: string): Promise<DeviceInventoryRecord[]>;
  getDeviceInventory(id: string): Promise<DeviceInventoryRecord | undefined>;
  updateDeviceInventory(id: string, input: Partial<DeviceInventoryInput>): Promise<DeviceInventoryRecord | undefined>;
  registerEdgeAgent(
    branchId: string,
    name: string,
    version: string,
  ): Promise<EdgeAgent>;
  listEdgeAgentsByBranch(branchId: string): Promise<EdgeAgent[]>;
  getEdgeAgent(id: string): Promise<EdgeAgent | undefined>;
  heartbeatEdgeAgent(
    id: string,
    version: string,
    publicMediaUrl?: string,
  ): Promise<EdgeAgent | undefined>;
  createEdgeActivation(input: {
    branchId: string; agentName: string; createdBy: string; expiresAt: string; tokenHash: string;
  }): Promise<EdgeActivation>;
  activateEdgeAgent(input: {
    tokenHash: string; credentialHash: string; deviceUuid: string; version: string; commandPublicKey?: string;
  }): Promise<{ agent: EdgeAgent; tenantId: string }>;
  verifyEdgeAgentCredential(id: string, credentialHash: string): Promise<boolean>;
  getEdgeAgentCommandPublicKey(id: string): Promise<string | undefined>;
  revokeEdgeAgentCredential(id: string): Promise<EdgeAgent | undefined>;
  getEdgeManagedTunnel(branchId: string): Promise<EdgeManagedTunnel | undefined>;
  upsertEdgeManagedTunnel(input: Omit<EdgeManagedTunnel, "createdAt" | "updatedAt" | "lastCheckedAt" | "revokedAt">): Promise<EdgeManagedTunnel>;
  updateEdgeManagedTunnelStatus(
    branchId: string,
    status: EdgeManagedTunnel["status"],
  ): Promise<EdgeManagedTunnel | undefined>;
  getBranchConnectivityProfile(branchId: string): Promise<BranchConnectivityProfile | undefined>;
  upsertBranchConnectivityProfile(input: Omit<
    BranchConnectivityProfile,
    "createdAt" | "updatedAt" | "lastVerifiedAt"
  >): Promise<BranchConnectivityProfile>;
  updateBranchConnectivityStatus(
    branchId: string,
    status: BranchConnectivityProfile["status"],
  ): Promise<BranchConnectivityProfile | undefined>;
  createEdgeCommand(input: {
    edgeAgentId: string; type: EdgeCommandType; payload: Record<string, unknown>; requestedBy: string;
  }): Promise<EdgeCommand>;
  listEdgeCommands(branchId: string, limit?: number): Promise<EdgeCommand[]>;
  claimEdgeCommand(edgeAgentId: string): Promise<EdgeCommand | undefined>;
  completeEdgeCommand(
    edgeAgentId: string,
    commandId: string,
    result: { status: "succeeded" | "failed"; result?: Record<string, unknown>; error?: string },
  ): Promise<EdgeCommand | undefined>;
  createEdgeUpdateRelease(input: Omit<EdgeUpdateRelease, "id" | "createdAt">): Promise<EdgeUpdateRelease>;
  getEdgeUpdateReleaseForAgent(edgeAgentId: string, currentVersion: string): Promise<EdgeUpdateRelease | undefined>;
  ingestOperationalTelemetry(
    envelope: OperationalTelemetryEnvelope,
  ): Promise<{ accepted: boolean; duplicate: boolean }>;
  listLatestOperationalTelemetry(
    tenantId: string,
    branchIds?: string[],
  ): Promise<OperationalTelemetryEnvelope[]>;
  listOperationalTelemetryHistory(
    tenantId: string,
    branchId: string,
    from: string,
    to: string,
    limit?: number,
  ): Promise<OperationalTelemetryEnvelope[]>;
  getOperationalHealthPolicy(tenantId: string, branchId?: string): Promise<OperationalHealthPolicy | undefined>;
  upsertOperationalHealthPolicy(
    tenantId: string,
    branchId: string | undefined,
    policy: OperationalHealthPolicy,
  ): Promise<OperationalHealthPolicy>;
  listVideoWallLayouts(tenantId: string, userId: string): Promise<VideoWallLayout[]>;
  createVideoWallLayout(input: {
    tenantId: string; userId: string; name: string; gridSize: VideoWallGridSize;
    cameraPositions: VideoWallLayout["cameraPositions"];
  }): Promise<VideoWallLayout>;
  createEdgeScanJob(branchId: string, edgeAgentId?: string): Promise<EdgeScanJob>;
  getEdgeScanJob(branchId: string, jobId: string): Promise<EdgeScanJob | undefined>;
  claimEdgeScanJob(edgeAgentId: string): Promise<EdgeScanJob | undefined>;
  completeEdgeScanJob(
    edgeAgentId: string,
    jobId: string,
    result: { status: "completed" | "failed"; resultCount: number; error?: string },
  ): Promise<EdgeScanJob | undefined>;
  createDiscovery(
    branchId: string,
    input: CameraDiscoveryInput,
  ): Promise<DiscoveredCamera>;
  listDiscoveredCameras(branchId: string): Promise<DiscoveredCamera[]>;
  rejectDiscovery(discoveryId: string, reason?: string): Promise<DiscoveredCamera | undefined>;
  renameDiscovery(discoveryId: string, displayName: string): Promise<DiscoveredCamera | undefined>;
  approveCamera(
    branchId: string,
    input: CameraApprovalInput,
  ): Promise<Camera | undefined>;
  replaceRecorderChannels(input: {
    branchId: string;
    oldRecorderSerialNumber: string;
    newRecorderSerialNumber: string;
    mappings: RecorderReplacementMapping[];
    actorUserId: string;
  }): Promise<RecorderReplacementResult>;
  createCameraFromManualRegistration(
    branchId: string,
    input: CameraApprovalInput,
  ): Promise<Camera | undefined>;
  updateCameraStatus(
    id: string,
    status: CameraStatus,
  ): Promise<Camera | undefined>;
  createLiveSession(cameraId: string, userId: string): Promise<LiveSession>;
  consumeLiveSession(token: string): Promise<ConsumedLiveSession | undefined>;
  getRecordingJob(cameraId: string): Promise<RecordingJob | undefined>;
  /** Batch form used by fleet retention projections to avoid one query per camera. */
  listRecordingJobs(cameraIds: string[]): Promise<RecordingJob[]>;
  upsertRecordingJob(cameraId: string, input: Omit<RecordingJob, "id" | "cameraId" | "updatedAt">): Promise<RecordingJob>;
  updateRecordingJobStatus(
    cameraId: string,
    status: RecordingJob["status"],
  ): Promise<RecordingJob | undefined>;
  listRecordingSegments(cameraId: string, from?: string, to?: string): Promise<RecordingSegment[]>;
  /** Returns playable segment rows for an authorized camera set in one store call. */
  listRecordingSegmentsForCameras(cameraIds: string[], from?: string, to?: string): Promise<RecordingSegment[]>;
  getRecordingSegment(id: string): Promise<RecordingSegment | undefined>;
  verifyRecordingSegment(segmentId: string): Promise<{ status: "verified" | "mismatch" | "missing"; hash?: string }>;
  createRecordingSegment(
    input: Omit<RecordingSegment, "id" | "createdAt">,
  ): Promise<RecordingSegment>;
  listRecordingLegalHolds(cameraId: string): Promise<RecordingLegalHold[]>;
  createRecordingLegalHold(input: {
    tenantId: string;
    cameraId: string;
    fromAt: string;
    toAt: string;
    reason: string;
    createdBy: string;
  }): Promise<RecordingLegalHold>;
  releaseRecordingLegalHold(
    id: string,
    tenantId: string,
    cameraId: string,
    releasedBy: string,
  ): Promise<RecordingLegalHold | undefined>;
  upsertRecordingStorageNode(input: {
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
  }): Promise<RecordingStorageNode>;
  listRecordingStorageNodes(tenantId: string): Promise<RecordingStorageNode[]>;
  createRecordingHealthEvent(input: {
    tenantId: string;
    cameraId?: string | undefined;
    storageNodeExternalId?: string | undefined;
    eventType: string;
    severity: "info" | "warning" | "critical";
    message: string;
    details?: Record<string, unknown> | undefined;
  }): Promise<RecordingHealthEvent>;
  listRecordingHealthEvents(cameraId: string, limit: number): Promise<RecordingHealthEvent[]>;
  listRecordingRetentionCandidates(
    tenantId: string,
    storageNodeExternalId: string,
    limit: number,
  ): Promise<RecordingSegment[]>;
  markRecordingSegmentsDeleted(
    tenantId: string,
    storageNodeExternalId: string,
    segmentIds: string[],
  ): Promise<number>;
  listLiveBookmarks(cameraId: string, limit: number): Promise<LiveBookmark[]>;
  createLiveBookmark(input: {
    tenantId: string;
    cameraId: string;
    operatorId: string;
    bookmarkedAt: string;
    reason: LiveBookmarkReason;
    notes?: string | undefined;
    priority: LivePriority;
    recordingSegmentId?: string | undefined;
    snapshotReference?: string | undefined;
  }): Promise<LiveBookmark>;
  listLiveIncidents(cameraId: string, limit: number): Promise<LiveIncident[]>;
  createLiveIncident(input: {
    tenantId: string;
    cameraId: string;
    createdBy: string;
    title: string;
    notes?: string | undefined;
    priority: LiveIncidentPriority;
    occurredAt: string;
    preRollSeconds: number;
    postRollSeconds: number;
  }): Promise<LiveIncident>;
  updateLiveIncidentStatus(
    id: string,
    tenantId: string,
    cameraId: string,
    status: LiveIncidentStatus,
  ): Promise<LiveIncident | undefined>;
  // ============ INCIDENT MANAGEMENT & INVESTIGATION ============
  
  // Core Incident Operations
  createIncident(input: {
    tenantId: string;
    branchId?: string;
    incidentNumber?: string;
    title: string;
    description?: string;
    incidentType: string;
    severity: string;
    detectionSource: string;
    occurredAt: string;
    reportedBy?: string;
    estimatedLoss?: number;
    injuryDetails?: string;
    confidentialityLevel?: string;
    policeRequired?: boolean;
    insuranceRequired?: boolean;
    aiConfidence?: number;
    detectionCount?: number;
  }): Promise<any>;
  
  getIncident(id: string): Promise<any | undefined>;
  
  listIncidents(tenantId: string, filters?: {
    status?: string;
    incidentType?: string;
    severity?: string;
    branchId?: string;
    assignedTo?: string;
    from?: string;
    to?: string;
    limit?: number;
  }): Promise<any[]>;
  
  updateIncident(id: string, input: {
    title?: string;
    description?: string;
    incidentType?: string;
    severity?: string;
    estimatedLoss?: number;
    injuryDetails?: string;
    confidentialityLevel?: string;
    policeRequired?: boolean;
    insuranceRequired?: boolean;
  }): Promise<any | undefined>;
  
  updateIncidentStatus(
    id: string,
    status: string,
    changedBy: string,
    notes?: string,
  ): Promise<any | undefined>;
  
  assignIncident(id: string, userId: string, assignedBy: string): Promise<any | undefined>;
  
  escalateIncident(id: string, escalatedBy: string, reason: string, recipients: string[]): Promise<any | undefined>;
  
  closeIncident(id: string, closedBy: string, notes?: string): Promise<any | undefined>;
  
  reopenIncident(id: string, reopenedBy: string, reason: string): Promise<any | undefined>;
  
  // Incident Participants
  addIncidentParticipant(input: {
    incidentId: string;
    role: string;
    personType: string;
    name?: string;
    employeeId?: string;
    customerId?: string;
    contactPhone?: string;
    contactEmail?: string;
    notes?: string;
    addedBy: string;
  }): Promise<any>;
  
  listIncidentParticipants(incidentId: string): Promise<any[]>;
  
  updateIncidentParticipant(id: string, input: any): Promise<any | undefined>;
  
  removeIncidentParticipant(id: string): Promise<void>;
  
  // Incident Cameras and Video
  addIncidentCamera(
    incidentId: string,
    cameraId: string,
    isPrimary: boolean,
    addedBy: string,
  ): Promise<void>;
  
  listIncidentCameras(incidentId: string): Promise<any[]>;
  
  addIncidentVideoRange(input: {
    incidentId: string;
    cameraId: string;
    fromAt: string;
    toAt: string;
    preservedBy: string;
    applyLegalHold?: boolean;
    notes?: string;
  }): Promise<any>;
  
  listIncidentVideoRanges(incidentId: string): Promise<any[]>;
  
  preserveIncidentVideoAutomatic(input: {
    incidentId: string;
    cameraId: string;
    incidentTime: string;
    preRollMinutes: number;
    postRollMinutes: number;
    preservedBy: string;
  }): Promise<any>;
  
  // Incident Timeline and Events
  listIncidentTimeline(incidentId: string): Promise<any[]>;
  
  addIncidentEvent(input: {
    incidentId: string;
    eventType: string;
    description: string;
    details?: Record<string, unknown>;
    performedBy?: string;
  }): Promise<any>;
  
  // Incident Clips and Snapshots
  createIncidentClip(input: {
    incidentId: string;
    cameraId: string;
    sourceSegmentIds: string[];
    startTime: string;
    endTime: string;
    clipType: string;
    storagePath?: string;
    sizeBytes?: number;
    checksumSha256?: string;
    format?: string;
    hasWatermark: boolean;
    hasTimestamp: boolean;
    createdBy: string;
    notes?: string;
  }): Promise<any>;
  
  listIncidentClips(incidentId: string): Promise<any[]>;
  
  getIncidentClip(id: string): Promise<any | undefined>;
  
  createIncidentSnapshot(input: {
    incidentId: string;
    cameraId: string;
    segmentId?: string;
    timestamp: string;
    snapshotType: string;
    storagePath?: string;
    checksumSha256?: string;
    description?: string;
    annotations?: Record<string, unknown>;
    enhancementDetails?: Record<string, unknown>;
    createdBy: string;
  }): Promise<any>;
  
  listIncidentSnapshots(incidentId: string): Promise<any[]>;
  
  getIncidentSnapshot(id: string): Promise<any | undefined>;
  
  // Evidence Items and Packages
  addIncidentEvidenceItem(input: {
    incidentId: string;
    itemType: string;
    title: string;
    description?: string;
    referenceId?: string;
    storagePath?: string;
    checksumSha256?: string;
    addedBy: string;
  }): Promise<any>;
  
  listIncidentEvidenceItems(incidentId: string): Promise<any[]>;
  
  createIncidentEvidencePackage(input: {
    incidentId: string;
    title: string;
    description?: string;
    includeOriginalVideo: boolean;
    includeInvestigationClips: boolean;
    includeSnapshots: boolean;
    includeTimeline: boolean;
    includeAlertLogs: boolean;
    includeDocuments: boolean;
    createdBy: string;
  }): Promise<any>;
  
  listIncidentEvidencePackages(incidentId: string): Promise<any[]>;
  
  getIncidentEvidencePackage(id: string): Promise<any | undefined>;
  
  approveEvidencePackage(id: string, approvedBy: string): Promise<any | undefined>;
  
  updateEvidencePackageStatus(
    id: string,
    status: string,
    details?: {
      packagePath?: string;
      packageSizeBytes?: number;
      checksumSha256?: string;
      manifestPath?: string;
      signature?: string;
      error?: string;
    },
  ): Promise<any | undefined>;
  
  recordEvidencePackageDownload(
    id: string,
    downloadedBy: string,
  ): Promise<any | undefined>;
  
  // Police Intimation
  createPoliceIntimation(input: {
    incidentId: string;
    policeStation: string;
    policeStationAddress?: string;
    intimationMethod: string;
    intimatedAt: string;
    intimatedBy: string;
    officerName?: string;
    officerDesignation?: string;
    officerContact?: string;
    notes?: string;
  }): Promise<any>;
  
  listPoliceIntimations(incidentId: string): Promise<any[]>;
  
  getPoliceIntimation(id: string): Promise<any | undefined>;
  
  updatePoliceIntimation(id: string, input: {
    gdNumber?: string;
    firNumber?: string;
    firDate?: string;
    firCopy?: string;
    acknowledgementCopy?: string;
    status?: string;
    investigationOfficer?: string;
    investigationOfficerContact?: string;
    followUpDate?: string;
    notes?: string;
  }): Promise<any | undefined>;
  
  recordPoliceEvidenceTransfer(input: {
    incidentId: string;
    policeIntimationId: string;
    transferDate: string;
    transferredBy: string;
    evidencePackageId?: string;
    evidenceDescription: string;
    recipientName: string;
    recipientDesignation?: string;
    receiptAcknowledgement?: string;
    transferMethod: string;
    notes?: string;
  }): Promise<any>;
  
  listPoliceEvidenceTransfers(incidentId: string): Promise<any[]>;
  
  // Insurance Claims
  createInsuranceClaim(input: {
    incidentId: string;
    insuranceCompany: string;
    policyNumber: string;
    dateOfLoss: string;
    estimatedLoss: number;
    claimAmount?: number;
    notes?: string;
  }): Promise<any>;
  
  listInsuranceClaims(incidentId: string): Promise<any[]>;
  
  getInsuranceClaim(id: string): Promise<any | undefined>;
  
  updateInsuranceClaim(id: string, input: {
    claimNumber?: string;
    submittedDate?: string;
    submittedBy?: string;
    surveyorName?: string;
    surveyorContact?: string;
    surveyDate?: string;
    status?: string;
    settlementAmount?: number;
    settlementDate?: string;
    rejectionReason?: string;
    notes?: string;
  }): Promise<any | undefined>;
  
  addInsuranceDocument(input: {
    incidentId: string;
    claimId: string;
    documentType: string;
    documentTitle: string;
    documentPath?: string;
    uploadedBy: string;
  }): Promise<any>;
  
  listInsuranceDocuments(incidentId: string, claimId?: string): Promise<any[]>;
  
  // Incident Tasks
  createIncidentTask(input: {
    incidentId: string;
    taskName: string;
    description?: string;
    assignedTo?: string;
    dueDate?: string;
    priority: string;
    isMandatory: boolean;
    createdBy: string;
  }): Promise<any>;
  
  listIncidentTasks(incidentId: string): Promise<any[]>;
  
  updateIncidentTask(id: string, input: {
    taskName?: string;
    description?: string;
    assignedTo?: string;
    dueDate?: string;
    priority?: string;
    status?: string;
  }): Promise<any | undefined>;
  
  completeIncidentTask(
    id: string,
    completedBy: string,
    completionNotes?: string,
  ): Promise<any | undefined>;
  
  // Incident Notes
  addIncidentNote(input: {
    incidentId: string;
    noteType: string;
    content: string;
    createdBy: string;
  }): Promise<any>;
  
  listIncidentNotes(incidentId: string, noteType?: string): Promise<any[]>;
  
  updateIncidentNote(id: string, content: string): Promise<any | undefined>;
  
  deleteIncidentNote(id: string): Promise<void>;
  
  // Secure Sharing with Authorities
  createSecureShare(input: {
    incidentId: string;
    evidencePackageId?: string;
    recipientName: string;
    recipientOrganization: string;
    recipientEmail?: string;
    purpose: string;
    maxDownloads: number;
    expiresAt: string;
    watermarked: boolean;
    encrypted: boolean;
    createdBy: string;
  }): Promise<any>;
  
  listSecureShares(incidentId: string): Promise<any[]>;
  
  getSecureShare(id: string): Promise<any | undefined>;
  
  getSecureShareByToken(token: string): Promise<any | undefined>;
  
  verifySecureShareAccess(
    token: string,
    oneTimePassword?: string,
  ): Promise<{ allowed: boolean; share?: any; error?: string }>;
  
  recordSecureShareDownload(input: {
    id: string;
    downloadedBy: string;
    downloadIp?: string;
  }): Promise<any | undefined>;
  
  revokeSecureShare(id: string, revokedBy: string, reason: string): Promise<any | undefined>;
  
  // Incident Reports
  createIncidentReport(input: {
    incidentId: string;
    reportType: string;
    executiveSummary?: string;
    detailedChronology?: string;
    findings?: string;
    rootCause?: string;
    controlFailures?: string;
    correctiveActions?: string;
    preventiveActions?: string;
    recommendations?: string;
    conclusions?: string;
    unresolvedQuestions?: string;
    createdBy: string;
  }): Promise<any>;
  
  listIncidentReports(incidentId: string): Promise<any[]>;
  
  getIncidentReport(id: string): Promise<any | undefined>;
  
  updateIncidentReport(id: string, input: any): Promise<any | undefined>;
  
  reviewIncidentReport(id: string, reviewedBy: string): Promise<any | undefined>;
  
  approveIncidentReport(id: string, approvedBy: string): Promise<any | undefined>;
  
  finalizeIncidentReport(
    id: string,
    reportPath?: string,
  ): Promise<any | undefined>;
  
  // Dashboard and Analytics
  getIncidentsDashboard(tenantId: string, filters?: {
    branchId?: string;
    from?: string;
    to?: string;
  }): Promise<{
    totalIncidents: number;
    openIncidents: number;
    criticalIncidents: number;
    incidentsByType: Record<string, number>;
    incidentsBySeverity: Record<string, number>;
    incidentsByStatus: Record<string, number>;
    averageResolutionHours: number;
    policeIntimationsCount: number;
    insuranceClaimsCount: number;
  }>;
  
  getIncidentStatistics(tenantId: string, period: string): Promise<any>;
  listAnalyticsRules(cameraId: string): Promise<AnalyticsRule[]>;
  createAnalyticsRule(
    tenantId: string,
    cameraId: string,
    createdBy: string,
    input: AnalyticsRuleInput,
  ): Promise<AnalyticsRule>;
  updateAnalyticsRule(
    id: string,
    tenantId: string,
    cameraId: string,
    input: Partial<AnalyticsRuleInput>,
  ): Promise<AnalyticsRule | undefined>;
  deleteAnalyticsRule(
    id: string,
    tenantId: string,
    cameraId: string,
  ): Promise<boolean>;
  processAnalyticsEvent(input: AnalyticsEventInput): Promise<AnalyticsIngestResult>;
  listAnalyticsAlerts(
    tenantId: string,
    filters: AnalyticsAlertFilters,
  ): Promise<AnalyticsAlert[]>;
  getAnalyticsAlert(id: string, tenantId: string): Promise<AnalyticsAlert | undefined>;
  updateAnalyticsAlertEvidence(
    id: string,
    tenantId: string,
    input: { snapshotReference?: string; clipReference?: string },
  ): Promise<AnalyticsAlert | undefined>;
  transitionAnalyticsAlert(
    id: string,
    tenantId: string,
    input: AnalyticsAlertTransitionInput,
  ): Promise<AnalyticsAlert | undefined>;
  linkAnalyticsAlertIncident(
    id: string,
    tenantId: string,
    incidentId: string,
  ): Promise<AnalyticsAlert | undefined>;
  getAlertNotificationPolicy(tenantId: string): Promise<AlertNotificationPolicy>;
  upsertAlertNotificationPolicy(policy: AlertNotificationPolicy): Promise<AlertNotificationPolicy>;
  enqueueAlertNotifications(input: Array<{
    tenantId: string; alertId: string; channel: AlertNotificationChannel; recipient: string;
    nextAttemptAt?: string; voiceCall?: AlertNotification["voiceCall"]; smsDelivery?: AlertNotification["smsDelivery"]; emailDelivery?: AlertNotification["emailDelivery"];
  }>): Promise<AlertNotification[]>;
  claimAlertNotifications(limit: number, now: string): Promise<AlertNotification[]>;
  completeAlertNotification(id: string, result: {
    status: "sent" | "delivered" | "failed" | "dead" | "cancelled";
    providerId?: string; error?: string; nextAttemptAt?: string;
  }): Promise<AlertNotification | undefined>;
  recordVoiceCallEvent(id: string, event: {
    status: string; occurredAt: string; detail?: string; providerId?: string;
    provider?: NonNullable<AlertNotification["voiceCall"]>["provider"];
    acknowledgedAt?: string; acknowledgedBy?: string; recordingUrl?: string; durationSeconds?: number;
  }): Promise<AlertNotification | undefined>;
  recordSmsDeliveryEvent(id: string, event: {
    status: string; occurredAt: string; detail?: string; providerId?: string;
    provider?: NonNullable<AlertNotification["smsDelivery"]>["provider"];
  }): Promise<AlertNotification | undefined>;
  recordEmailDeliveryEvent(id: string, event: {
    status: string; occurredAt: string; detail?: string; providerId?: string;
    provider?: NonNullable<AlertNotification["emailDelivery"]>["provider"];
    subject?: string;
  }): Promise<AlertNotification | undefined>;
  reserveSmsRateLimit(tenantId: string, limit: number, requested: number, now: string): Promise<number>;
  listAlertNotifications(tenantId: string, alertId?: string): Promise<AlertNotification[]>;
  listOperationalReportSchedules(tenantId: string): Promise<OperationalReportSchedule[]>;
  createOperationalReportSchedule(input: Omit<OperationalReportSchedule, "id" | "lastRunAt" | "createdAt" | "updatedAt">): Promise<OperationalReportSchedule>;
  updateOperationalReportSchedule(id: string, tenantId: string, updates: Partial<Pick<OperationalReportSchedule, "name" | "timezone" | "dailyAt" | "template" | "formats" | "recipients" | "filters" | "enabled" | "nextRunAt" | "lastRunAt">>): Promise<OperationalReportSchedule | undefined>;
  deleteOperationalReportSchedule(id: string, tenantId: string): Promise<boolean>;
  claimDueOperationalReportSchedules(now: string, limit: number): Promise<OperationalReportSchedule[]>;
  createOperationalReportRun(input: Omit<OperationalReportRun, "id" | "status" | "progress" | "attempts" | "nextAttemptAt" | "rowCount" | "summary" | "error" | "startedAt" | "completedAt" | "createdAt" | "updatedAt">): Promise<OperationalReportRun>;
  listOperationalReportRuns(tenantId: string, limit: number): Promise<OperationalReportRun[]>;
  getOperationalReportRun(id: string, tenantId: string): Promise<OperationalReportRun | undefined>;
  claimOperationalReportRuns(now: string, limit: number): Promise<OperationalReportRun[]>;
  updateOperationalReportRun(id: string, updates: Partial<Pick<OperationalReportRun, "status" | "progress" | "nextAttemptAt" | "rowCount" | "summary" | "error" | "startedAt" | "completedAt">>): Promise<OperationalReportRun | undefined>;
  createOperationalReportArtifact(input: Omit<OperationalReportArtifact, "id" | "createdAt">): Promise<OperationalReportArtifact>;
  listOperationalReportArtifacts(tenantId: string, runId: string): Promise<OperationalReportArtifact[]>;
  getOperationalReportArtifact(id: string, tenantId: string): Promise<OperationalReportArtifact | undefined>;
  enqueueOperationalReportDeliveries(input: Array<{ tenantId: string; runId: string; recipient: string }>): Promise<OperationalReportDelivery[]>;
  claimOperationalReportDeliveries(now: string, limit: number): Promise<OperationalReportDelivery[]>;
  completeOperationalReportDelivery(id: string, result: { status: "delivered" | "failed" | "dead"; providerId?: string; error?: string; nextAttemptAt?: string }): Promise<OperationalReportDelivery | undefined>;
  listOperationalReportDeliveries(tenantId: string, runId: string): Promise<OperationalReportDelivery[]>;
  writeAudit(event: AuditEventInput): Promise<void>;
  createMaintenanceAsset(input: MaintenanceAssetInput): Promise<MaintenanceAsset>;
  listMaintenanceAssets(tenantId: string, category?: AssetCategory): Promise<MaintenanceAsset[]>;
  startPasswordRotation(input: {
    tenantId: string;
    deviceId: string;
    requestedBy: string;
    reason: string;
    rotationMode: 'scheduled' | 'emergency';
    newPassword: string;
  }): Promise<any>;
  listPasswordRotations(tenantId: string): Promise<any[]>;
  createDeviceTemplate(input: {
    tenantId: string;
    name: string;
    templateType: 'camera-configuration' | 'recording' | 'analytics' | 'privacy' | 'network' | 'security-hardening' | 'location';
    category: string;
    settings: Record<string, unknown>;
    createdBy: string;
  }): Promise<any>;
  applyDeviceTemplate(input: {
    tenantId: string;
    deviceId: string;
    templateId: string;
    appliedBy: string;
  }): Promise<any>;
  getDeviceTemplateDrift(deviceId: string, templateId: string): Promise<any>;
  assignDeviceIpAddress(input: {
    tenantId: string;
    deviceId: string;
    ipAddress: string;
    subnet: string;
    assignedBy: string;
    reservationStatus: 'dhcp' | 'static' | 'reserved';
  }): Promise<any>;
  getIpConflicts(tenantId: string): Promise<any[]>;
  getMaintenanceAsset(id: string): Promise<MaintenanceAsset | undefined>;
  updateMaintenanceAsset(id: string, input: MaintenanceAssetUpdate): Promise<MaintenanceAsset | undefined>;
  createWorkOrder(input: WorkOrderInput): Promise<WorkOrder>;
  listWorkOrders(tenantId: string, status?: WorkOrderStatus): Promise<WorkOrder[]>;
  getWorkOrder(id: string): Promise<WorkOrder | undefined>;
  updateWorkOrder(id: string, input: WorkOrderUpdate): Promise<WorkOrder | undefined>;
  createMaintenanceVendor(input: MaintenanceVendorInput): Promise<MaintenanceVendor>;
  listMaintenanceVendors(tenantId: string): Promise<MaintenanceVendor[]>;
  getMaintenanceVendor(id: string): Promise<MaintenanceVendor | undefined>;
  updateMaintenanceVendor(id: string, input: MaintenanceVendorUpdate): Promise<MaintenanceVendor | undefined>;
  createAmcContract(input: AmcContractInput): Promise<AmcContract>;
  listAmcContracts(tenantId: string, vendorId?: string): Promise<AmcContract[]>;
  getAmcContract(id: string): Promise<AmcContract | undefined>;
  updateAmcContract(id: string, input: AmcContractUpdate): Promise<AmcContract | undefined>;
  // Preventive maintenance / scheduling
  createMaintenancePlan(input: { tenantId: string; name: string; cadence: "daily" | "weekly" | "monthly" | "quarterly" | "annual"; checklistTemplate?: Record<string, any>; startDate?: string; endDate?: string; createdBy: string; }): Promise<any>;
  listMaintenancePlans(tenantId: string): Promise<any[]>;
  getMaintenancePlan(id: string): Promise<any | undefined>;
  // Schedules generated from plans
  createMaintenanceSchedule(input: { tenantId: string; planId: string; branchNodeId?: string; assetId?: string; nextRunAt: string; cadence: string; createdBy: string; }): Promise<any>;
  listMaintenanceSchedules(tenantId: string): Promise<any[]>;
  // Visits and results
  createMaintenanceVisit(input: { tenantId: string; scheduleId: string; assignedTo?: string; dueAt: string; status?: string; createdBy: string; }): Promise<any>;
  listMaintenanceVisits(tenantId: string, filters?: any): Promise<any[]>;
  updateMaintenanceVisit(id: string, input: any): Promise<any | undefined>;
  // Predictive alerts
  ingestPredictiveAlert(input: { tenantId: string; assetId?: string; type: string; score: number; details?: Record<string, unknown>; detectedAt: string; }): Promise<any>;
  listPredictiveAlerts(tenantId: string): Promise<any[]>;
  createComplianceFramework(input: ComplianceFrameworkInput): Promise<ComplianceFramework>;
  listComplianceFrameworks(tenantId: string): Promise<ComplianceFramework[]>;
  getComplianceFramework(id: string): Promise<ComplianceFramework | undefined>;
  updateComplianceFramework(id: string, input: Partial<ComplianceFrameworkInput>): Promise<ComplianceFramework | undefined>;
  listCompliancePolicies(tenantId: string, frameworkId?: string): Promise<CompliancePolicy[]>;
  getCompliancePolicy(id: string): Promise<CompliancePolicy | undefined>;
  createCompliancePolicy(input: CompliancePolicyInput): Promise<CompliancePolicy>;
  updateCompliancePolicy(id: string, input: Partial<CompliancePolicyInput>): Promise<CompliancePolicy | undefined>;
  listComplianceAssessments(tenantId: string, filters?: ComplianceAssessmentFilters): Promise<ComplianceAssessment[]>;
  getComplianceAssessment(id: string): Promise<ComplianceAssessment | undefined>;
  createComplianceAssessment(input: ComplianceAssessmentInput): Promise<ComplianceAssessment>;
  updateComplianceAssessment(id: string, input: Partial<ComplianceAssessmentInput>): Promise<ComplianceAssessment | undefined>;
  listComplianceCertificates(assessmentId: string): Promise<ComplianceCertificate[]>;
  getComplianceCertificate(id: string): Promise<ComplianceCertificate | undefined>;
  createComplianceCertificate(input: ComplianceCertificateInput): Promise<ComplianceCertificate>;
  
  // Health Monitoring
  recordCameraHealth(input: {
    tenantId: string;
    cameraId: string;
    onlineStatus: 'online' | 'offline' | 'degraded';
    fps?: number;
    bitrate?: number;
    streamQuality?: string;
    temperature?: number;
    tampering?: boolean;
    recordingRunning?: boolean;
    latencyMs?: number;
    packetLoss?: number;
  }): Promise<any>;
  
  recordStorageHealth(input: {
    tenantId: string;
    assetId: string;
    totalCapacityGb: number;
    usedCapacityGb: number;
    availableCapacityGb: number;
    smartStatus?: string;
    temperature?: number;
    badSectors?: number;
    readSpeedMbs?: number;
    writeSpeedMbs?: number;
    remainingLifetimeYears?: number;
    errorCount?: number;
    reallocatedSectors?: number;
    pendingSectors?: number;
    uncorrectableSectors?: number;
    powerOnHours?: number;
    model?: string;
    serialNumber?: string;
    telemetrySource?: 'real' | 'simulated';
  }): Promise<any>;
  
  recordNetworkHealth(input: {
    tenantId: string;
    branchNodeId?: string;
    assetId?: string;
    checkType: string;
    latencyMs?: number;
    packetLossPercentage?: number;
    jitterMs?: number;
    bandwidthAvailableMbps?: number;
    rtspAvailable?: boolean;
    onvifAvailable?: boolean;
  }): Promise<any>;
  
  recordUpsHealth(input: {
    tenantId: string;
    assetId: string;
    batteryHealthPercentage: number;
    runtimeMinutes?: number;
    chargingStatus?: string;
    loadPercentage?: number;
    temperature?: number;
    alarmStatus?: string;
  }): Promise<any>;
  
  getHealthCheckSummary(tenantId: string): Promise<any>;
  
  // Firmware Management
  recordFirmwareVersion(input: {
    tenantId: string;
    assetId: string;
    deviceType: string;
    currentVersion: string;
    latestVersion?: string;
    requiresUpdate?: boolean;
    criticalUpdate?: boolean;
  }): Promise<any>;
  
  listFirmwareUpdatesRequired(tenantId: string): Promise<any[]>;
  
  // Software Versions
  recordSoftwareVersion(input: {
    tenantId: string;
    componentName: string;
    environment: string;
    currentVersion: string;
    previousVersion?: string;
    upgradeApprovedBy?: string;
    upgradeApprovedAt?: string;
  }): Promise<any>;
  
  // Spare Parts
  recordSparePart(input: {
    tenantId: string;
    partName: string;
    partCode: string;
    category: string;
    vendorId?: string;
    quantity: number;
    reorderLevel?: number;
    unitCost?: number;
    warrantyMonths?: number;
    location?: string;
    branchNodeId?: string;
  }): Promise<any>;
  
  recordInventoryTransaction(input: {
    tenantId: string;
    partId: string;
    workOrderId?: string;
    transactionType: 'add' | 'remove' | 'used' | 'damaged';
    quantity: number;
    referenceNumber?: string;
    notes?: string;
    recordedBy?: string;
  }): Promise<any>;
  
  listLowStockParts(tenantId: string): Promise<any[]>;
  
  // Reporting
  generateMaintenanceReport(input: {
    tenantId: string;
    reportType: string;
    periodStart: string;
    periodEnd: string;
    branchNodeId?: string;
    assetId?: string;
  }): Promise<any>;
  
  listMaintenanceReports(tenantId: string, filters?: { reportType?: string | undefined; limit?: number | undefined } | undefined): Promise<any[]>;
  
  getPrivacySummary(tenantId: string): Promise<any>;
  listPrivacyPurposes(tenantId: string): Promise<any[]>;
  getPrivacyPurpose(id: string): Promise<any | undefined>;
  createPrivacyPurpose(input: PrivacyPurposeInput): Promise<any>;
  updatePrivacyPurpose(id: string, input: Partial<PrivacyPurposeInput>): Promise<any | undefined>;
  listCameraPrivacyPurposes(cameraId: string): Promise<any[]>;
  assignCameraPrivacyPurpose(
    cameraId: string,
    purposeId: string,
    assignedBy: string,
    startDate?: string | undefined,
    endDate?: string | undefined,
    notes?: string | undefined,
  ): Promise<any>;
  getCameraPrivacyControls(cameraId: string): Promise<any>;
  upsertCameraPrivacyControls(cameraId: string, input: CameraPrivacyControlInput): Promise<any>;
  listPrivacyBreaches(tenantId: string, status?: string | undefined): Promise<any[]>;
  reportPrivacyBreach(input: PrivacyBreachInput): Promise<any>;
  updatePrivacyBreachStatus(id: string, status: string, changedBy: string): Promise<any | undefined>;
  
  // Compliance Integration
  getMaintenanceComplianceStatus(tenantId: string): Promise<any>;

  // Compliance Enhanced - Requirements
  listComplianceRequirements(tenantId: string, filters?: {
    frameworkId?: string;
    category?: string;
    status?: string;
  }): Promise<any[]>;
  getComplianceRequirement(id: string): Promise<any | undefined>;
  createComplianceRequirement(input: any): Promise<any>;
  updateComplianceRequirement(id: string, input: any): Promise<any | undefined>;
  deleteComplianceRequirement(id: string): Promise<void>;

  // Compliance Enhanced - Controls
  listComplianceControls(tenantId: string, filters?: {
    requirementId?: string;
    implementationStatus?: string;
  }): Promise<any[]>;
  getComplianceControl(id: string): Promise<any | undefined>;
  createComplianceControl(input: any): Promise<any>;
  updateComplianceControl(id: string, input: any): Promise<any | undefined>;
  deleteComplianceControl(id: string): Promise<void>;
  updateControlTestDates(id: string, input: {
    lastTestDate: string;
    nextTestDate: string;
    effectivenessRating?: number;
  }): Promise<any | undefined>;

  // Compliance Enhanced - Evidence
  listComplianceEvidence(tenantId: string, filters?: {
    requirementId?: string;
    controlId?: string;
    assessmentId?: string;
    validated?: boolean;
  }): Promise<any[]>;
  getComplianceEvidence(id: string): Promise<any | undefined>;
  createComplianceEvidence(input: any): Promise<any>;
  updateComplianceEvidence(id: string, input: any): Promise<any | undefined>;
  deleteComplianceEvidence(id: string): Promise<void>;
  validateComplianceEvidence(id: string, validated: boolean, validatorId: string, notes?: string): Promise<any | undefined>;

  // Compliance Enhanced - Tests
  listComplianceTests(tenantId: string, filters?: {
    controlId?: string;
    status?: string;
  }): Promise<any[]>;
  getComplianceTest(id: string): Promise<any | undefined>;
  createComplianceTest(input: any): Promise<any>;
  updateComplianceTest(id: string, input: any): Promise<any | undefined>;
  deleteComplianceTest(id: string): Promise<void>;

  // Compliance Enhanced - Findings
  listComplianceFindings(tenantId: string, filters?: {
    assessmentId?: string;
    severity?: string;
    status?: string;
  }): Promise<any[]>;
  getComplianceFinding(id: string): Promise<any | undefined>;
  createComplianceFinding(input: any): Promise<any>;
  updateComplianceFinding(id: string, input: any): Promise<any | undefined>;
  deleteComplianceFinding(id: string): Promise<void>;
  closeComplianceFinding(id: string, closedBy: string, notes?: string): Promise<any | undefined>;

  // Compliance Enhanced - Remediation Plans
  listRemediationPlans(tenantId: string, filters?: {
    findingId?: string;
    status?: string;
  }): Promise<any[]>;
  getRemediationPlan(id: string): Promise<any | undefined>;
  createRemediationPlan(input: any): Promise<any>;
  updateRemediationPlan(id: string, input: any): Promise<any | undefined>;
  deleteRemediationPlan(id: string): Promise<void>;
  approveRemediationPlan(id: string, approverId: string): Promise<any | undefined>;
  verifyRemediationPlan(id: string, verifierId: string, input: {
    verificationNotes?: string;
    effectivenessConfirmed: boolean;
  }): Promise<any | undefined>;

  // Compliance Enhanced - Remediation Actions
  listRemediationActions(planId: string): Promise<any[]>;
  getRemediationAction(id: string): Promise<any | undefined>;
  createRemediationAction(input: any): Promise<any>;
  updateRemediationAction(id: string, input: any): Promise<any | undefined>;
  deleteRemediationAction(id: string): Promise<void>;
  completeRemediationAction(id: string, input: {
    evidenceUrl?: string;
    notes?: string;
  }): Promise<any | undefined>;

  // Compliance Enhanced - Risks
  listComplianceRisks(tenantId: string, filters?: {
    frameworkId?: string;
    category?: string;
    status?: string;
  }): Promise<any[]>;
  getComplianceRisk(id: string): Promise<any | undefined>;
  createComplianceRisk(input: any): Promise<any>;
  updateComplianceRisk(id: string, input: any): Promise<any | undefined>;
  deleteComplianceRisk(id: string): Promise<void>;
  assessComplianceRisk(id: string, input: {
    residualLikelihood: string;
    residualImpact: string;
    treatmentPlan?: string;
  }): Promise<any | undefined>;
  reviewComplianceRisk(id: string, input: {
    reviewNotes?: string;
    nextReviewDate: string;
  }): Promise<any | undefined>;

  // Compliance Enhanced - Dashboard & Reporting
  getComplianceDashboard(tenantId: string, frameworkId?: string): Promise<any>;
  getRequirementStatus(id: string): Promise<any>;
  getFrameworkCoverage(id: string): Promise<any>;
  getComplianceAuditLog(tenantId: string, filters?: {
    entityType?: string;
    entityId?: string;
    action?: string;
    from?: string;
    to?: string;
    limit?: number;
  }): Promise<any[]>;

  // Evidence Management
  createEvidenceCase(input: any): Promise<any>;
  getEvidenceCase(id: string): Promise<any | undefined>;
  listEvidenceCases(tenantId: string, filters?: any): Promise<any[]>;
  updateEvidenceCaseStatus(id: string, status: any): Promise<any>;
  addEvidenceItem(caseId: string, input: any): Promise<any>;
  listEvidenceItems(caseId: string): Promise<any[]>;
  recordCustodyEvent(input: {
    evidenceId?: string;
    action: string;
    performedBy: string;
    sourceIp?: string;
    reason?: string;
  }): Promise<any>;
  getCustodyLog(evidenceId: string): Promise<any[]>;
  createLegalHold(input: any): Promise<any>;
  releaseLegalHold(holdId: string, releasedBy: string): Promise<any | undefined>;
  getEvidenceExport(exportId: string): Promise<any | undefined>;
  getEvidenceManifest(manifestId: string): Promise<any | undefined>;
}

export interface CctvInfrastructureStore {
  getCameraSpecifications(cameraId: string): Promise<CameraSpecifications | undefined>;
  upsertCameraSpecifications(
    cameraId: string,
    input: CameraSpecificationsInput,
  ): Promise<CameraSpecifications>;
  getCameraCompliance(cameraId: string): Promise<CameraInstallationCompliance | undefined>;
  upsertCameraCompliance(
    cameraId: string,
    input: CameraComplianceInput,
  ): Promise<CameraInstallationCompliance>;
  updateCameraDetails(
    cameraId: string,
    details: CameraDetailsUpdate,
  ): Promise<Camera>;
  getBranchCameraRequirements(branchId: string): Promise<BranchCameraRequirement[]>;
  upsertBranchCameraRequirement(
    branchId: string,
    input: BranchCameraRequirementInput,
  ): Promise<BranchCameraRequirement>;
  initializeBranchCameraRequirements(branchId: string): Promise<void>;
  getBranchCoverageGaps(branchId: string): Promise<BranchCameraCoverageGap[]>;
  getBranchComplianceSummary(branchId: string): Promise<CameraComplianceSummary[]>;
  getCamerasDueForInspection(daysAhead: number): Promise<CameraComplianceSummary[]>;
}

export interface OrganizationStore {
  getOrganizationTree(tenantId: string): Promise<any[]>;
  getOrganizationStatistics(tenantId: string): Promise<any>;
  listOrganizationNodes(
    tenantId: string,
    type?: string,
    parentId?: string,
    includeInactive?: boolean,
  ): Promise<any[]>;
  getOrganizationNodeDetails(id: string): Promise<any>;
  getNodeHierarchyPath(id: string): Promise<any[]>;
  getDescendantNodes(id: string, includeInactive?: boolean): Promise<any[]>;
  createOrganizationNode(tenantId: string, input: any): Promise<any>;
  updateOrganizationNode(id: string, input: any): Promise<any>;
  deactivateOrganizationNode(id: string): Promise<void>;
  validateHierarchyRelationship(parentNodeId: string, childNodeType: string): Promise<boolean>;
}

export interface UserManagementStore {
  getUserById(id: string): Promise<any>;
  getUserDetails(id: string): Promise<any>;
  getUserWithPassword(id: string): Promise<any>;
  findUserByUsername(username: string, tenantSlug?: string): Promise<any>;
  findUserByEmail(email: string, tenantSlug?: string): Promise<any>;
  listUsers(tenantId: string, filters: any): Promise<any>;
  createUser(tenantId: string, input: any): Promise<any>;
  updateUser(id: string, input: any): Promise<any>;
  deactivateUser(id: string): Promise<void>;
  updateUserPassword(id: string, passwordHash: string, mustChange?: boolean): Promise<void>;
  unlockUserAccount(id: string): Promise<void>;
  assignUserToOrganization(
    userId: string,
    scopeNodeId: string,
    isPrimary: boolean,
    assignedBy: string,
  ): Promise<any>;
  removeUserOrganizationAssignment(userId: string, nodeId: string): Promise<void>;
  getUserCameraAccessOverview(userId: string): Promise<any>;
  getUserAuditLog(userId: string, limit: number, offset: number): Promise<any>;
}

export interface AuthenticationStore {
  checkAccountLockout(userId: string): Promise<boolean>;
  recordFailedLogin(userId: string): Promise<void>;
  recordSuccessfulLogin(userId: string, ipAddress?: string): Promise<void>;
  createUserSession(
    userId: string,
    tenantId: string,
    accessTokenHash: string,
    refreshTokenHash: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<any>;
  findSessionByAccessToken(tokenHash: string): Promise<any>;
  findSessionByRefreshToken(tokenHash: string): Promise<any>;
  updateSessionAccessToken(
    sessionId: string,
    newTokenHash: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<void>;
  updateSessionActivity(sessionId: string): Promise<void>;
  getUserSession(sessionId: string): Promise<any>;
  listUserSessions(userId: string): Promise<any[]>;
  deleteUserSession(sessionId: string): Promise<void>;
  deleteAllUserSessions(userId: string): Promise<void>;
  createPasswordResetToken(userId: string, tokenHash: string): Promise<any>;
  findPasswordResetToken(tokenHash: string): Promise<any>;
  markPasswordResetTokenUsed(tokenId: string): Promise<void>;
}

export interface CameraPermissionStore {
  checkCameraAccess(
    userId: string,
    cameraId: string,
    action: string,
  ): Promise<{ allowed: boolean; reason: string; requiresApproval: boolean }>;
  listCameraSpecificGrants(userId: string): Promise<any[]>;
  listCameraGrants(cameraId: string): Promise<any[]>;
  createCameraSpecificGrant(tenantId: string, input: any, grantedBy: string): Promise<any>;
  deleteCameraSpecificGrant(id: string): Promise<void>;
  listCameraAccessRequests(tenantId: string, filters: any): Promise<any[]>;
  getCameraAccessRequest(id: string): Promise<any>;
  createCameraAccessRequest(tenantId: string, userId: string, input: any): Promise<any>;
  reviewCameraAccessRequest(
    id: string,
    reviewerId: string,
    status: string,
    notes?: string,
    createdBy?: string,
  ): Promise<any>;
  revokeCameraAccessRequest(id: string): Promise<void>;
  listTimeBasedRestrictions(tenantId: string, filters: any): Promise<any[]>;
  createTimeBasedRestriction(tenantId: string, input: any): Promise<any>;
  deleteTimeBasedRestriction(id: string): Promise<void>;
  listCameraAccessGroups(tenantId: string, scopeNodeId?: string): Promise<any[]>;
  getCameraAccessGroupDetails(id: string): Promise<any>;
  createCameraAccessGroup(tenantId: string, input: any): Promise<any>;
  addCameraToAccessGroup(groupId: string, cameraId: string, addedBy: string): Promise<void>;
  removeCameraFromAccessGroup(groupId: string, cameraId: string): Promise<void>;
  assignUserToAccessGroup(
    groupId: string,
    userId: string,
    effect: string,
    assignedBy: string,
  ): Promise<void>;
  removeUserFromAccessGroup(groupId: string, userId: string): Promise<void>;
  updateCameraSensitivity(cameraId: string, input: any): Promise<any>;
  getCameraAccessSummary(cameraId: string): Promise<any>;

  // Device Inventory Management
  listDeviceInventory(tenantId: string, branchNodeId?: string): Promise<any[]>;
  getDeviceInventory(id: string): Promise<any | null>;
  createDeviceInventoryRecord(input: any): Promise<any>;
  updateDeviceInventory(id: string, input: any): Promise<any | null>;
}

export interface ActivityTrackingStore {
  // Session Management
  startActivitySession(
    userId: string,
    tenantId: string,
    deviceInfo: any,
    ipAddress: string,
    locationInfo?: any
  ): Promise<string>;
  endActivitySession(sessionId: string, userId: string): Promise<void>;
  updateSessionHeartbeat(sessionId: string, userId: string): Promise<void>;
  
  // Page Visit Tracking
  trackPageVisit(
    userId: string,
    tenantId: string,
    sessionId: string,
    pagePath: string,
    pageTitle: string | null,
    pageModule: string,
    pageCategory: string | null,
    referrerPath: string | null,
    queryParameters: any
  ): Promise<string>;
  endPageVisit(
    pageVisitId: string,
    userId: string,
    durationSeconds: number,
    activeTimeSeconds: number,
    idleTimeSeconds: number,
    clickCount: number,
    scrollDepthPercentage: number,
    formInteractionsCount: number,
    nextPagePath: string | null
  ): Promise<void>;
  
  // Control Room Activity Tracking
  startControlRoomActivity(
    userId: string,
    tenantId: string,
    sessionId: string,
    pageVisitId: string | null,
    monitoringType: string,
    branchNodeId: string | null,
    branchGroupId: string | null,
    branchGroupName: string | null,
    cameraIds: string[],
    branchIds: string[],
    branchNames: string[],
    monitoringMode: string
  ): Promise<string>;
  endControlRoomActivity(
    activityId: string,
    userId: string,
    durationSeconds: number,
    alertCount: number,
    incidentCount: number,
    cameraSwitchCount: number,
    playbackCount: number,
    snapshotCount: number,
    exportCount: number
  ): Promise<void>;
  updateControlRoomActivity(
    activityId: string,
    userId: string,
    alertCount: number | null,
    incidentCount: number | null,
    cameraSwitchCount: number | null
  ): Promise<void>;
  
  // Action Logging
  logUserAction(
    userId: string,
    tenantId: string,
    sessionId: string,
    pageVisitId: string | null,
    actionType: string,
    actionCategory: string,
    actionTarget: string | null,
    actionDescription: string | null,
    moduleName: string,
    featureName: string | null,
    actionMetadata: any
  ): Promise<void>;
  
  // Current Activity
  getCurrentActivity(tenantId: string): Promise<any[]>;
  getUserCurrentActivity(userId: string): Promise<any | null>;
  
  // Reports and Summaries
  getActivitySessions(
    tenantId: string,
    userId: string,
    startDate: string | null,
    endDate: string | null,
    limit: number,
    offset: number
  ): Promise<{ sessions: any[]; total: number }>;
  getPageVisits(
    tenantId: string,
    userId: string,
    sessionId: string | null,
    module: string | null,
    startDate: string | null,
    endDate: string | null,
    limit: number,
    offset: number
  ): Promise<any[]>;
  getControlRoomActivities(
    tenantId: string,
    userId: string,
    branchId: string | null,
    startDate: string | null,
    endDate: string | null,
    limit: number,
    offset: number
  ): Promise<any[]>;
  getDailySummary(
    tenantId: string,
    userId: string,
    startDate: string,
    endDate: string
  ): Promise<any[]>;
  getWeeklySummary(
    tenantId: string,
    userId: string,
    year: number,
    weeks: number
  ): Promise<any[]>;
  getMonthlySummary(
    tenantId: string,
    userId: string,
    year: number,
    months: number
  ): Promise<any[]>;
  getComprehensiveReport(
    tenantId: string,
    userId: string,
    startDate: string,
    endDate: string
  ): Promise<any>;
}

export type ExtendedControlPlaneStore = ControlPlaneStore &
  CctvInfrastructureStore &
  OrganizationStore &
  UserManagementStore &
  AuthenticationStore &
  CameraPermissionStore &
  ActivityTrackingStore;

export function hasExtendedInfrastructure(
  store: ControlPlaneStore,
): store is ExtendedControlPlaneStore {
  const candidate = store as Partial<ExtendedControlPlaneStore>;
  return typeof candidate.getOrganizationTree === "function" &&
    typeof candidate.getCameraSpecifications === "function" &&
    typeof candidate.findUserByUsername === "function" &&
    typeof candidate.checkCameraAccess === "function";
}
