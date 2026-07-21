import type {
  Action,
  AnalyticsAlert,
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
  EdgeAgent,
  LiveSession,
  ConsumedLiveSession,
  RecordingJob,
  RecordingHealthEvent,
  RecordingLegalHold,
  RecordingSegment,
  RecordingStorageNode,
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

export interface CameraDiscoveryInput {
  edgeAgentId: string;
  vendor: CameraVendor;
  model: string;
  ipAddress: string;
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
  createBranch(
    tenantId: string,
    parentNodeId: string,
    name: string,
  ): Promise<ResourceNode>;
  registerEdgeAgent(
    branchId: string,
    name: string,
    version: string,
  ): Promise<EdgeAgent>;
  listEdgeAgentsByBranch(branchId: string): Promise<EdgeAgent[]>;
  heartbeatEdgeAgent(
    id: string,
    version: string,
  ): Promise<EdgeAgent | undefined>;
  createDiscovery(
    branchId: string,
    input: CameraDiscoveryInput,
  ): Promise<DiscoveredCamera>;
  listDiscoveredCameras(branchId: string): Promise<DiscoveredCamera[]>;
  approveCamera(
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
  upsertRecordingJob(cameraId: string, input: Omit<RecordingJob, "id" | "cameraId" | "updatedAt">): Promise<RecordingJob>;
  updateRecordingJobStatus(
    cameraId: string,
    status: RecordingJob["status"],
  ): Promise<RecordingJob | undefined>;
  listRecordingSegments(cameraId: string, from?: string, to?: string): Promise<RecordingSegment[]>;
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
    temperatureCelsius?: number | undefined;
    writeMbps?: number | undefined;
  }): Promise<RecordingStorageNode>;
  createRecordingHealthEvent(input: {
    tenantId: string;
    cameraId?: string | undefined;
    storageNodeExternalId?: string | undefined;
    eventType: string;
    severity: "info" | "warning" | "critical";
    message: string;
    details?: Record<string, unknown> | undefined;
  }): Promise<RecordingHealthEvent>;
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
  // Incident management (investigation / cases)
  createIncident(input: any): Promise<any>;
  getIncident(id: string): Promise<any | undefined>;
  listIncidents(tenantId: string, filters?: any): Promise<any[]>;
  updateIncidentStatus(id: string, status: any, changedBy?: string, notes?: string): Promise<any | undefined>;
  assignIncident(id: string, userId: string): Promise<any | undefined>;
  addIncidentCamera(incidentId: string, cameraId: string): Promise<void>;
  addIncidentVideoRange(incidentId: string, cameraId: string, fromAt: string, toAt: string): Promise<any>;
  listIncidentTimeline(incidentId: string): Promise<any[]>;
  addIncidentEvent(incidentId: string, eventType: string, details: any, createdBy?: string): Promise<any>;
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
  writeAudit(event: AuditEventInput): Promise<void>;
  createMaintenanceAsset(input: MaintenanceAssetInput): Promise<MaintenanceAsset>;
  listMaintenanceAssets(tenantId: string, category?: AssetCategory): Promise<MaintenanceAsset[]>;
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
}

export type ExtendedControlPlaneStore = ControlPlaneStore &
  CctvInfrastructureStore &
  OrganizationStore &
  UserManagementStore &
  AuthenticationStore &
  CameraPermissionStore;

export function hasExtendedInfrastructure(
  store: ControlPlaneStore,
): store is ExtendedControlPlaneStore {
  const candidate = store as Partial<ExtendedControlPlaneStore>;
  return typeof candidate.getOrganizationTree === "function" &&
    typeof candidate.getCameraSpecifications === "function" &&
    typeof candidate.findUserByUsername === "function" &&
    typeof candidate.checkCameraAccess === "function";
}
