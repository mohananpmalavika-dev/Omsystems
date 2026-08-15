import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { ProvisioningStageId } from "./provisioning/stages.js";
import type {
  AccessGrant,
  Action,
  AnalyticsAlert,
  AnalyticsEvent,
  AnalyticsRule,
  AlertNotification,
  AlertNotificationPolicy,
  AuditEventInput,
  Camera,
  CameraStatus,
  MaintenanceAsset,
  WorkOrder,
  MaintenanceVendor,
  AmcContract,
  ComplianceAssessment,
  ComplianceCertificate,
  ComplianceFramework,
  CompliancePolicy,
  DiscoveredCamera,
  DeviceIdentity,
  EdgeActivation,
  EdgeAgent,
  EdgeManagedTunnel,
  BranchConnectivityProfile,
  EdgeCommand,
  EdgeUpdateRelease,
  EdgeScanJob,
  LiveBookmark,
  LiveIncident,
  LiveSession,
  ConsumedLiveSession,
  RecordingJob,
  RecordingHealthEvent,
  RecordingLegalHold,
  RecordingSegment,
  RecordingStorageNode,
  ResourceNode,
  User,
} from "./domain/models.js";
import { authorize } from "./domain/authorization.js";
import {
  analyticsAlertTitle,
  isTerminalAlertStatus,
  sortedMatchingRules,
} from "./analytics/rule-engine.js";
import { moreSevere, resolveAlertSeverity } from "./analytics/severity-policy.js";
import type {
  CameraApprovalInput,
  CameraDiscoveryInput,
  ControlPlaneStore,
  MaintenanceAssetInput,
  WorkOrderInput,
  MaintenanceVendorInput,
  AmcContractInput,
  ComplianceAssessmentFilters,
  DeviceInventoryInput,
  DeviceInventoryRecord,
  RecorderReplacementResult,
} from "./control-plane-store.js";
import { IncidentManagementMethods } from "./store-incident-extensions.js";
import type { OperationalHealthPolicy, OperationalTelemetryEnvelope, VideoWallGridSize, VideoWallLayout } from "./operational-health/types.js";
import type {
  OperationalReportSchedule, OperationalReportRun, OperationalReportArtifact,
  OperationalReportDelivery,
} from "./reporting/types.js";
import {
  identityClaims,
  normalizeMacAddress,
  observationFromApproval,
  observationFromDiscovery,
  type DeviceIdentityObservation,
} from "./device-identity.js";

function correlationCount(metadata?: Record<string, unknown>) {
  const explicit = metadata?.correlatedDetectionCount;
  if (typeof explicit === "number" && Number.isFinite(explicit)) return Math.max(0, Math.floor(explicit));
  return Array.isArray(metadata?.correlatedDetectionTypes) ? metadata.correlatedDetectionTypes.length : 0;
}

function clean<T extends Record<string, any>>(obj: T) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}

function rolloutBucket(agentId: string, version: string) {
  let hash = 2166136261;
  for (const char of `${agentId}:${version}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0) % 100;
}

function defaultAlertNotificationPolicy(inputTenantId: string): AlertNotificationPolicy {
  return {
    tenantId: inputTenantId,
    recipientGroups: {},
    onCallSchedules: [],
    rateLimitPerMinute: 120,
    escalationAfterSeconds: { P1: 30, P2: 300, P3: 900 },
    smsTemplates: {},
    smsTemplateIds: {},
    updatedAt: new Date(0).toISOString(),
  };
}

const tenantId = "omsystems";

const seedNodes: ResourceNode[] = [
  { id: "company-1", parentId: null, tenantId, type: "company", name: "Example Company", path: ["company-1"] },
  { id: "division-retail", parentId: "company-1", tenantId, type: "division", name: "Retail Division", path: ["company-1", "division-retail"] },
  { id: "region-south", parentId: "division-retail", tenantId, type: "region", name: "South Region", path: ["company-1", "division-retail", "region-south"] },
  { id: "branch-blr-001", parentId: "region-south", tenantId, type: "branch", name: "Bengaluru Branch 001", path: ["company-1", "division-retail", "region-south", "branch-blr-001"] },
  { id: "group-public-blr-001", parentId: "branch-blr-001", tenantId, type: "camera-group", name: "Public Areas", path: ["company-1", "division-retail", "region-south", "branch-blr-001", "group-public-blr-001"] },
  { id: "camera-entrance", parentId: "group-public-blr-001", tenantId, type: "camera", name: "Main Entrance", path: ["company-1", "division-retail", "region-south", "branch-blr-001", "group-public-blr-001", "camera-entrance"] },
  { id: "group-sensitive-blr-001", parentId: "branch-blr-001", tenantId, type: "camera-group", name: "Sensitive Areas", path: ["company-1", "division-retail", "region-south", "branch-blr-001", "group-sensitive-blr-001"] },
  { id: "camera-cash-room", parentId: "group-sensitive-blr-001", tenantId, type: "camera", name: "Cash Room", path: ["company-1", "division-retail", "region-south", "branch-blr-001", "group-sensitive-blr-001", "camera-cash-room"] },
];

const seedUsers: User[] = [
  { id: "user-global-admin", displayName: "Global Administrator", tenantId },
  { id: "user-south-operator", displayName: "South Region Operator", tenantId },
  { id: "user-branch-manager", displayName: "Bengaluru Branch Manager", tenantId },
  { id: "user-investigator", displayName: "Security Investigator", tenantId },
  { id: "user-evidence-officer", displayName: "Evidence Officer", tenantId },
];

const operatorActions: Action[] = [
  "live:view", "audio:talk", "recording:view", "alarm:acknowledge",
  "analytics:view", "alerts:acknowledge",
  "incident:view", "incident:create",
];

const investigatorActions: Action[] = [
  "live:view", "recording:view",
  "incident:view", "incident:create", "incident:update", "incident:assign",
  "investigation:view", "investigation:manage",
  "evidence:view", "evidence:create", "evidence:preserve",
  "alerts:acknowledge",
];

const evidenceOfficerActions: Action[] = [
  "incident:view",
  "investigation:view",
  "evidence:view", "evidence:create", "evidence:preserve", "evidence:export-package", "evidence:approve",
  "evidence:legal-hold", "evidence:release-hold",
  "police:update", "insurance:update",
];

const seedGrants: AccessGrant[] = [
  // Global admin has full access
  { 
    userId: "user-global-admin", 
    scopeNodeId: "company-1", 
    actions: [
      "live:view", "audio:talk", "recording:view", "evidence:export", "ptz:operate", "alarm:acknowledge",
      "device:configure", "user:manage", "audit:view", "org:manage", 
      "analytics:view", "analytics:configure", "alerts:acknowledge", "alerts:escalate", "analytics:export",
      "incident:create", "incident:view", "incident:update", "incident:assign", "incident:escalate", "incident:close", "incident:reopen",
      "investigation:view", "investigation:manage", "investigation:enhance",
      "evidence:create", "evidence:view", "evidence:preserve", "evidence:export-package", "evidence:approve", "evidence:share",
      "evidence:legal-hold", "evidence:release-hold",
      "police:update", "insurance:update", "incident-report:approve",
    ], 
    effect: "allow" 
  },
  
  // Operator can view and create incidents
  { 
    userId: "user-south-operator", 
    scopeNodeId: "region-south", 
    actions: operatorActions, 
    effect: "allow" 
  },
  
  // Branch manager can manage incidents at branch level
  { 
    userId: "user-branch-manager", 
    scopeNodeId: "branch-blr-001", 
    actions: [
      "live:view", "audio:talk", "recording:view",
      "analytics:view", "analytics:configure", "alerts:acknowledge", "alerts:escalate", "analytics:export",
      "incident:view", "incident:create", "incident:update", "incident:assign", "incident:escalate",
      "investigation:view",
      "evidence:view",
      "police:update", "insurance:update",
    ], 
    effect: "allow" 
  },
  
  // Deny sensitive areas for branch manager
  { 
    userId: "user-branch-manager", 
    scopeNodeId: "group-sensitive-blr-001", 
    actions: [
      "live:view", "recording:view", 
      "analytics:view", "analytics:configure", "alerts:acknowledge", "alerts:escalate", "analytics:export",
      "incident:view", "investigation:view", "evidence:view",
    ], 
    effect: "deny" 
  },
  
  // Investigator has investigation and evidence collection permissions
  { 
    userId: "user-investigator", 
    scopeNodeId: "company-1", 
    actions: investigatorActions, 
    effect: "allow" 
  },
  
  // Evidence officer manages evidence packages and legal compliance
  { 
    userId: "user-evidence-officer", 
    scopeNodeId: "company-1", 
    actions: evidenceOfficerActions, 
    effect: "allow" 
  },
];

const seedCameras: Camera[] = [
  {
    id: "cam-001", deviceIdentityId: "device-cam-001", nodeId: "camera-entrance", branchId: "branch-blr-001",
    name: "Main Entrance",
    vendor: "hikvision", model: "DS-2CD example", channel: 1,
    protocol: "onvif-t", status: "online",
    profiles: [{ name: "main", codec: "H264", width: 1920, height: 1080 }],
    capabilities: { ptz: false, audio: true, events: true },
    connectionSecretRef: "vault://branches/blr-001/cameras/001",
  },
  {
    id: "cam-002", deviceIdentityId: "device-cam-002", nodeId: "camera-cash-room", branchId: "branch-blr-001",
    name: "Cash Room",
    vendor: "cp-plus", model: "CP-UNC example", channel: 2,
    protocol: "onvif-s", status: "degraded",
    profiles: [{ name: "main", codec: "H264", width: 1920, height: 1080 }],
    capabilities: { ptz: false, audio: false, events: true },
    connectionSecretRef: "vault://branches/blr-001/cameras/002",
  },
];

const seedDeviceIdentities: DeviceIdentity[] = seedCameras.map((camera) => ({
  deviceId: camera.deviceIdentityId!,
  tenantId,
  branchId: camera.branchId,
  cameraId: camera.id,
  deviceType: camera.sourceType ?? "ip-camera",
  manufacturer: camera.vendor,
  model: camera.model,
  credentialRef: camera.connectionSecretRef,
  ipHistory: [],
  firstSeenAt: new Date(0).toISOString(),
  lastSeenAt: new Date(0).toISOString(),
}));

export class MemoryStore implements ControlPlaneStore {
  readonly nodes = new Map(seedNodes.map((node) => [node.id, structuredClone(node)]));
  readonly users = new Map(seedUsers.map((user) => [user.id, structuredClone(user)]));
  readonly cameras = new Map(seedCameras.map((camera) => [camera.id, structuredClone(camera)]));
  readonly deviceIdentities = new Map(seedDeviceIdentities.map((identity) => [identity.deviceId, structuredClone(identity)]));
  readonly deviceIdentityClaims = new Map<string, string>();
  readonly grants = structuredClone(seedGrants);
  readonly edgeAgents = new Map<string, EdgeAgent>();
  readonly edgeScanJobs = new Map<string, EdgeScanJob>();
  readonly edgeActivations = new Map<string, EdgeActivation & { tokenHash: string }>();
  readonly edgeCredentialHashes = new Map<string, string>();
  readonly edgeCommandPublicKeys = new Map<string, string>();
  readonly edgeManagedTunnels = new Map<string, EdgeManagedTunnel>();
  readonly branchConnectivityProfiles = new Map<string, BranchConnectivityProfile>();
  readonly edgeCommands = new Map<string, EdgeCommand>();
  readonly edgeUpdateReleases = new Map<string, EdgeUpdateRelease>();
  readonly operationalTelemetry = new Map<string, OperationalTelemetryEnvelope>();
  readonly operationalTelemetryHistory: OperationalTelemetryEnvelope[] = [];
  readonly operationalTelemetryKeys = new Set<string>();
  readonly operationalHealthPolicies = new Map<string, OperationalHealthPolicy>();
  readonly videoWallLayouts: VideoWallLayout[] = [];
  readonly discoveries = new Map<string, DiscoveredCamera>();
  readonly auditEvents: AuditEventInput[] = [];
  readonly liveSessions = new Map<
    string,
    LiveSession & { tokenHash: string; consumed: boolean }
  >();
  readonly recordingJobs = new Map<string, RecordingJob>();
  readonly recordingSegments: RecordingSegment[] = [];
  readonly recordingLegalHolds: RecordingLegalHold[] = [];
  readonly recordingStorageNodes = new Map<string, RecordingStorageNode>();
  readonly recordingHealthEvents: RecordingHealthEvent[] = [];
  readonly liveBookmarks: LiveBookmark[] = [];
  readonly liveIncidents: LiveIncident[] = [];
  // Investigation incidents (full featured)
  readonly incidents: any[] = [];
  readonly incidentParticipants: any[] = [];
  readonly incidentCameras: any[] = [];
  readonly incidentVideoRanges: any[] = [];
  readonly incidentEvents: any[] = [];
  readonly incidentClips: any[] = [];
  readonly incidentSnapshots: any[] = [];
  readonly incidentEvidenceItems: any[] = [];
  readonly incidentEvidencePackages: any[] = [];
  readonly incidentPoliceIntimations: any[] = [];
  readonly incidentPoliceEvidenceTransfers: any[] = [];
  readonly incidentInsuranceClaims: any[] = [];
  readonly incidentInsuranceDocuments: any[] = [];
  readonly incidentTasks: any[] = [];
  readonly incidentNotes: any[] = [];
  readonly incidentSecureShares: any[] = [];
  readonly incidentReports: any[] = [];
  readonly complianceFrameworks: ComplianceFramework[] = [];
  readonly compliancePolicies: CompliancePolicy[] = [];
  readonly complianceAssessments: ComplianceAssessment[] = [];
  readonly complianceCertificates: ComplianceCertificate[] = [];
  readonly analyticsRules: AnalyticsRule[] = [];
  readonly analyticsEvents: AnalyticsEvent[] = [];
  readonly analyticsAlerts: AnalyticsAlert[] = [];
  readonly analyticsAcknowledgements: Array<Record<string, unknown>> = [];
  readonly analyticsEscalations: Array<Record<string, unknown>> = [];
  readonly analyticsNotifications: AlertNotification[] = [];
  readonly alertNotificationPolicies = new Map<string, AlertNotificationPolicy>();
  readonly smsRateLimitWindows = new Map<string, number>();
  readonly operationalReportSchedules: OperationalReportSchedule[] = [];
  readonly operationalReportRuns: OperationalReportRun[] = [];
  readonly operationalReportArtifacts: OperationalReportArtifact[] = [];
  readonly operationalReportDeliveries: OperationalReportDelivery[] = [];
  readonly operationalReportScheduleClaims = new Set<string>();
  readonly maintenanceAssets: any[] = [];
  readonly maintenanceVisits: any[] = [];
  readonly predictiveAlerts: any[] = [];
  readonly deviceInventoryRecords: any[] = [];
  readonly passwordRotations: any[] = [];
  readonly deviceTemplates: any[] = [];
  readonly deviceTemplateAssignments: any[] = [];
  readonly deviceIpAssignments: any[] = [];
  readonly workOrders: any[] = [];
  readonly maintenanceVendors: any[] = [];
  readonly amcContracts: any[] = [];
  readonly maintenancePlans: any[] = [];
  readonly maintenanceSchedules: any[] = [];
  readonly cameraHealth: any[] = [];
  readonly storageHealth: any[] = [];
  readonly networkHealth: any[] = [];
  readonly upsHealth: any[] = [];
  readonly firmwareInventory: any[] = [];
  readonly softwareVersions: any[] = [];
  readonly spareParts: any[] = [];
  readonly inventoryTransactions: any[] = [];
  readonly maintenanceReports: any[] = [];
  readonly privacyPurposes: any[] = [];
  readonly cameraPrivacyPurposeAssignments: any[] = [];
  readonly cameraPrivacyControls = new Map<string, any>();
  readonly privacyBreaches: any[] = [];
  readonly complianceRequirements: any[] = [];
  readonly complianceControls: any[] = [];
  readonly complianceEvidence: any[] = [];
  readonly complianceTests: any[] = [];
  readonly complianceFindings: any[] = [];
  readonly remediationPlans: any[] = [];
  readonly remediationActions: any[] = [];
  readonly complianceRisks: any[] = [];
  readonly complianceAuditLog: any[] = [];

  async close() {}

  async getUser(identity: string) {
    return this.users.get(identity);
  }

  async getNode(id: string) {
    return this.nodes.get(id);
  }

  async checkAccess(user: User, action: Action, resourceNodeId: string) {
    const node = this.nodes.get(resourceNodeId);
    if (!node) return undefined;
    return authorize(user, action, node, this.nodes, this.grants);
  }

  async listAccessibleNodes(user: User, action: Action, type?: ResourceNode["type"]) {
    return [...this.nodes.values()].filter(
      (node) => (!type || node.type === type) &&
        authorize(user, action, node, this.nodes, this.grants).allowed,
    );
  }

  async getCamera(id: string) {
    return this.cameras.get(id);
  }

  async listCamerasByIds(cameraIds: string[]) {
    const ids = new Set(cameraIds);
    return [...this.cameras.values()].filter((camera) => ids.has(camera.id));
  }

  async listNodesByIds(ids: string[]) {
    const keys = new Set(ids);
    return [...this.nodes.values()].filter((node) => keys.has(node.id));
  }

  async getDeviceIdentityByCamera(cameraId: string) {
    const identity = [...this.deviceIdentities.values()].find((item) => item.cameraId === cameraId);
    return identity ? structuredClone(identity) : undefined;
  }

  async listCamerasByBranch(user: User, branchId: string, action: Action) {
    return [...this.cameras.values()].filter((camera) => {
      if (camera.branchId !== branchId) return false;
      const node = this.nodes.get(camera.nodeId);
      return Boolean(node && authorize(user, action, node, this.nodes, this.grants).allowed);
    });
  }

  async listCamerasByEdgeAgent(edgeAgentId: string) {
    return [...this.cameras.values()].filter((camera) => camera.edgeAgentId === edgeAgentId);
  }

  async createBranch(tenant: string, parentNodeId: string, name: string) {
    const parent = this.nodes.get(parentNodeId);
    if (!parent || parent.tenantId !== tenant) throw new Error("invalid_parent");
    const id = randomUUID();
    const node: ResourceNode = {
      id, tenantId: tenant, parentId: parent.id, type: "branch", name,
      path: [...parent.path, id],
    };
    this.nodes.set(id, node);
    return node;
  }

  async registerEdgeAgent(branchId: string, name: string, version: string) {
    const agent: EdgeAgent = {
      id: randomUUID(), branchId, name, version, status: "pending", lastSeenAt: null,
    };
    this.edgeAgents.set(agent.id, agent);
    return agent;
  }

  async listEdgeAgentsByBranch(branchId: string) {
    return [...this.edgeAgents.values()].filter(
      (agent) => agent.branchId === branchId,
    );
  }

  async heartbeatEdgeAgent(id: string, version: string, publicMediaUrl?: string) {
    const agent = this.edgeAgents.get(id);
    if (!agent) return undefined;
    Object.assign(agent, {
      version,
      status: "online" as const,
      lastSeenAt: new Date().toISOString(),
      ...(publicMediaUrl ? { publicMediaUrl } : {}),
    });
    return agent;
  }

  async getEdgeAgent(id: string) {
    const agent = this.edgeAgents.get(id);
    return agent ? structuredClone(agent) : undefined;
  }

  async createEdgeActivation(input: {
    branchId: string; agentName: string; createdBy: string; expiresAt: string; tokenHash: string;
  }) {
    const branch = this.nodes.get(input.branchId);
    if (!branch || branch.type !== "branch") throw new Error("invalid_branch");
    const activation: EdgeActivation & { tokenHash: string } = {
      id: randomUUID(), tenantId: branch.tenantId, branchId: branch.id,
      agentName: input.agentName, createdBy: input.createdBy,
      createdAt: new Date().toISOString(), expiresAt: input.expiresAt,
      usedAt: null, revokedAt: null, tokenHash: input.tokenHash,
    };
    this.edgeActivations.set(activation.id, activation);
    const { tokenHash: _tokenHash, ...safe } = activation;
    return safe;
  }

  async activateEdgeAgent(input: {
    tokenHash: string; credentialHash: string; deviceUuid: string; version: string; commandPublicKey?: string;
  }) {
    const activation = [...this.edgeActivations.values()].find((item) => item.tokenHash === input.tokenHash);
    if (!activation || activation.usedAt || activation.revokedAt || Date.parse(activation.expiresAt) <= Date.now()) {
      throw new Error("activation_invalid_or_expired");
    }
    if ([...this.edgeAgents.values()].some((item) => item.deviceUuid === input.deviceUuid)) {
      throw new Error("device_already_enrolled");
    }
    const agent: EdgeAgent = {
      id: randomUUID(), branchId: activation.branchId, name: activation.agentName,
      version: input.version, status: "pending", lastSeenAt: null,
      deviceUuid: input.deviceUuid, credentialStatus: "active",
      credentialIssuedAt: new Date().toISOString(),
    };
    activation.usedAt = new Date().toISOString();
    this.edgeAgents.set(agent.id, agent);
    this.edgeCredentialHashes.set(agent.id, input.credentialHash);
    if (input.commandPublicKey) this.edgeCommandPublicKeys.set(agent.id, input.commandPublicKey);
    return { agent: structuredClone(agent), tenantId: activation.tenantId };
  }

  async verifyEdgeAgentCredential(id: string, credentialHash: string) {
    const agent = this.edgeAgents.get(id);
    return Boolean(agent && agent.credentialStatus === "active" &&
      this.edgeCredentialHashes.get(id) === credentialHash);
  }

  async getEdgeAgentCommandPublicKey(id: string) {
    return this.edgeCommandPublicKeys.get(id);
  }

  async revokeEdgeAgentCredential(id: string) {
    const agent = this.edgeAgents.get(id);
    if (!agent) return undefined;
    agent.credentialStatus = "revoked";
    agent.credentialRevokedAt = new Date().toISOString();
    agent.status = "offline";
    this.edgeCredentialHashes.delete(id);
    this.edgeCommandPublicKeys.delete(id);
    return structuredClone(agent);
  }

  async getEdgeManagedTunnel(branchId: string) {
    const tunnel = this.edgeManagedTunnels.get(branchId);
    return tunnel ? structuredClone(tunnel) : undefined;
  }

  async upsertEdgeManagedTunnel(
    input: Omit<EdgeManagedTunnel, "createdAt" | "updatedAt" | "lastCheckedAt" | "revokedAt">,
  ) {
    const now = new Date().toISOString();
    const current = this.edgeManagedTunnels.get(input.branchId);
    const tunnel: EdgeManagedTunnel = {
      ...structuredClone(input),
      createdAt: current?.createdAt ?? now,
      updatedAt: now,
      lastCheckedAt: current?.lastCheckedAt ?? null,
      revokedAt: input.status === "revoked" ? now : null,
    };
    this.edgeManagedTunnels.set(input.branchId, tunnel);
    return structuredClone(tunnel);
  }

  async updateEdgeManagedTunnelStatus(branchId: string, status: EdgeManagedTunnel["status"]) {
    const tunnel = this.edgeManagedTunnels.get(branchId);
    if (!tunnel) return undefined;
    const now = new Date().toISOString();
    tunnel.status = status;
    tunnel.updatedAt = now;
    tunnel.lastCheckedAt = now;
    if (status === "revoked") tunnel.revokedAt = now;
    return structuredClone(tunnel);
  }

  async getBranchConnectivityProfile(branchId: string) {
    const profile = this.branchConnectivityProfiles.get(branchId);
    return profile ? structuredClone(profile) : undefined;
  }

  async upsertBranchConnectivityProfile(
    input: Omit<BranchConnectivityProfile, "createdAt" | "updatedAt" | "lastVerifiedAt">,
  ) {
    const now = new Date().toISOString();
    const current = this.branchConnectivityProfiles.get(input.branchId);
    const profile: BranchConnectivityProfile = {
      ...structuredClone(input),
      createdAt: current?.createdAt ?? now,
      updatedAt: now,
      lastVerifiedAt: current?.lastVerifiedAt ?? null,
    };
    this.branchConnectivityProfiles.set(input.branchId, profile);
    return structuredClone(profile);
  }

  async updateBranchConnectivityStatus(
    branchId: string,
    status: BranchConnectivityProfile["status"],
  ) {
    const profile = this.branchConnectivityProfiles.get(branchId);
    if (!profile) return undefined;
    const now = new Date().toISOString();
    profile.status = status;
    profile.updatedAt = now;
    profile.lastVerifiedAt = now;
    return structuredClone(profile);
  }

  async createEdgeCommand(input: {
    edgeAgentId: string; type: EdgeCommand["type"]; payload: Record<string, unknown>; requestedBy: string;
  }) {
    const agent = this.edgeAgents.get(input.edgeAgentId);
    const branch = agent ? this.nodes.get(agent.branchId) : undefined;
    if (!agent || !branch || agent.credentialStatus === "revoked") throw new Error("edge_agent_not_found_or_revoked");
    const command: EdgeCommand = {
      id: randomUUID(), tenantId: branch.tenantId, branchId: branch.id, edgeAgentId: agent.id,
      type: input.type, payload: structuredClone(input.payload), status: "queued",
      result: null, error: null, requestedBy: input.requestedBy,
      requestedAt: new Date().toISOString(), startedAt: null, completedAt: null,
    };
    this.edgeCommands.set(command.id, command);
    return structuredClone(command);
  }

  async listEdgeCommands(branchId: string, limit = 100) {
    return [...this.edgeCommands.values()].filter((item) => item.branchId === branchId)
      .sort((left, right) => right.requestedAt.localeCompare(left.requestedAt))
      .slice(0, Math.max(1, Math.min(500, limit))).map((item) => structuredClone(item));
  }

  async claimEdgeCommand(edgeAgentId: string) {
    const staleBefore = Date.now() - 15 * 60_000;
    const command = [...this.edgeCommands.values()]
      .filter((item) => item.edgeAgentId === edgeAgentId && (
        item.status === "queued" ||
        (item.status === "running" && item.startedAt !== null && Date.parse(item.startedAt) < staleBefore)
      ))
      .sort((left, right) => left.requestedAt.localeCompare(right.requestedAt))[0];
    if (!command) return undefined;
    command.status = "running";
    command.startedAt = new Date().toISOString();
    return structuredClone(command);
  }

  async completeEdgeCommand(
    edgeAgentId: string,
    commandId: string,
    completion: { status: "succeeded" | "failed"; result?: Record<string, unknown>; error?: string },
  ) {
    const command = this.edgeCommands.get(commandId);
    if (!command || command.edgeAgentId !== edgeAgentId) return undefined;
    if (command.status === completion.status) return structuredClone(command);
    if (command.status !== "running") return undefined;
    command.status = completion.status;
    command.result = structuredClone(completion.result ?? {});
    command.error = completion.error ?? null;
    command.completedAt = new Date().toISOString();
    return structuredClone(command);
  }

  async createEdgeUpdateRelease(input: Omit<EdgeUpdateRelease, "id" | "createdAt">) {
    if ([...this.edgeUpdateReleases.values()].some((item) => item.version === input.version)) {
      throw Object.assign(new Error("release_exists"), { code: "23505" });
    }
    const release: EdgeUpdateRelease = { id: randomUUID(), createdAt: new Date().toISOString(), ...input };
    this.edgeUpdateReleases.set(release.id, release);
    return structuredClone(release);
  }

  async getEdgeUpdateReleaseForAgent(edgeAgentId: string, currentVersion: string) {
    const release = [...this.edgeUpdateReleases.values()]
      .filter((item) => item.enabled && item.version !== currentVersion)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
    if (!release || rolloutBucket(edgeAgentId, release.version) >= release.rolloutPercentage) return undefined;
    return structuredClone(release);
  }

  async listAccessibleCameras(
    user: User,
    action: Action,
    filters: { branchId?: string; search?: string; status?: CameraStatus; limit: number; offset: number },
  ) {
    const search = filters.search?.trim().toLowerCase();
    const cameras = [...this.cameras.values()].filter((camera) => {
      if (filters.branchId && camera.branchId !== filters.branchId) return false;
      if (filters.status && camera.status !== filters.status) return false;
      if (search && !`${camera.name} ${camera.model} ${camera.id}`.toLowerCase().includes(search)) return false;
      const node = this.nodes.get(camera.nodeId);
      return Boolean(node && authorize(user, action, node, this.nodes, this.grants).allowed);
    }).sort((left, right) => left.name.localeCompare(right.name));
    return {
      total: cameras.length,
      cameras: cameras.slice(filters.offset, filters.offset + filters.limit),
    };
  }

  async ingestOperationalTelemetry(envelope: OperationalTelemetryEnvelope) {
    const dedupeKey = `${envelope.tenantId}:${envelope.idempotencyKey}`;
    if (this.operationalTelemetryKeys.has(dedupeKey)) {
      return { accepted: true, duplicate: true };
    }
    this.operationalTelemetryKeys.add(dedupeKey);
    this.operationalTelemetryHistory.push(structuredClone(envelope));
    const stateKey = `${envelope.tenantId}:${envelope.branchId}:${envelope.deviceType}:${envelope.deviceId}`;
    const current = this.operationalTelemetry.get(stateKey);
    if (!current || Date.parse(current.observedAt) <= Date.parse(envelope.observedAt)) {
      this.operationalTelemetry.set(stateKey, structuredClone(envelope));
    }
    return { accepted: true, duplicate: false };
  }

  async listLatestOperationalTelemetry(tenant: string, branchIds?: string[]) {
    const allowed = branchIds ? new Set(branchIds) : undefined;
    return [...this.operationalTelemetry.values()]
      .filter((item) => item.tenantId === tenant && (!allowed || allowed.has(item.branchId)))
      .map((item) => structuredClone(item));
  }

  async getOperationalHealthPolicy(tenant: string, branchId?: string) {
    return this.operationalHealthPolicies.get(`${tenant}:${branchId ?? "*"}`)
      ?? this.operationalHealthPolicies.get(`${tenant}:*`);
  }

  async upsertOperationalHealthPolicy(
    tenant: string,
    branchId: string | undefined,
    policy: OperationalHealthPolicy,
  ) {
    this.operationalHealthPolicies.set(`${tenant}:${branchId ?? "*"}`, structuredClone(policy));
    return structuredClone(policy);
  }

  async listVideoWallLayouts(tenant: string, userId: string) {
    return this.videoWallLayouts.filter((layout) => layout.tenantId === tenant && layout.createdBy === userId)
      .map((layout) => structuredClone(layout));
  }

  async createVideoWallLayout(input: {
    tenantId: string; userId: string; name: string; gridSize: VideoWallGridSize;
    cameraPositions: VideoWallLayout["cameraPositions"];
  }) {
    const now = new Date().toISOString();
    const layout: VideoWallLayout = {
      id: randomUUID(), tenantId: input.tenantId, name: input.name,
      gridSize: input.gridSize, cameraPositions: structuredClone(input.cameraPositions),
      isDefault: false, createdBy: input.userId, createdAt: now, updatedAt: now,
    };
    this.videoWallLayouts.push(layout);
    return structuredClone(layout);
  }

  async createEdgeScanJob(branchId: string, edgeAgentId?: string, target?: import("./control-plane-store.js").EdgeScanTarget) {
    const agent = edgeAgentId
      ? this.edgeAgents.get(edgeAgentId)
      : [...this.edgeAgents.values()].find((item) => item.branchId === branchId && item.status === "online");
    if (!agent || agent.branchId !== branchId || agent.status !== "online") throw new Error("edge_agent_not_connected");
    const job: EdgeScanJob = {
      id: randomUUID(), branchId, edgeAgentId: agent.id, status: "queued",
      scope: target ? "device" : "branch",
      ...(target ? {
        targetDiscoveryId: target.discoveryId,
        targetIpAddress: target.ipAddress,
        ...(target.onvifPort ? { targetOnvifPort: target.onvifPort } : {}),
      } : {}),
      requestedAt: new Date().toISOString(), startedAt: null, completedAt: null,
      resultCount: 0, provisionedCount: 0, credentialsRequiredCount: 0,
      pendingVerificationCount: 0, verifiedCount: 0, recorderCount: 0,
      timeSynchronizedCount: 0, timeDriftCount: 0,
      analyticsCompatibleCount: 0, duplicateCount: 0,
      credentialsSkippedAt: null, skippedStages: {}, error: null,
    };
    this.edgeScanJobs.set(job.id, job);
    return job;
  }

  async getEdgeScanJob(branchId: string, jobId: string) {
    const job = this.edgeScanJobs.get(jobId);
    return job?.branchId === branchId ? job : undefined;
  }

  async getLatestEdgeScanJob(branchId: string) {
    return [...this.edgeScanJobs.values()]
      .filter((job) => job.branchId === branchId && job.scope !== "device")
      .sort((left, right) => right.requestedAt.localeCompare(left.requestedAt))[0];
  }

  async skipEdgeScanJobCredentials(branchId: string, jobId: string) {
    const job = this.edgeScanJobs.get(jobId);
    if (!job || job.branchId !== branchId || job.scope === "device" || job.status !== "completed") {
      return undefined;
    }
    const skippedAt = new Date().toISOString();
    if (!job.credentialsSkippedAt) job.credentialsSkippedAt = skippedAt;
    job.skippedStages = { ...job.skippedStages, "credential-resolution": skippedAt };
    return job;
  }

  async skipEdgeScanJobStage(branchId: string, jobId: string, stageId: ProvisioningStageId) {
    const job = this.edgeScanJobs.get(jobId);
    if (!job || job.branchId !== branchId || job.scope === "device") return undefined;
    const skippedAt = new Date().toISOString();
    job.skippedStages = { ...job.skippedStages, [stageId]: job.skippedStages?.[stageId] ?? skippedAt };
    if (stageId === "credential-resolution" && !job.credentialsSkippedAt) {
      job.credentialsSkippedAt = skippedAt;
    }
    return job;
  }

  async claimEdgeScanJob(edgeAgentId: string) {
    const job = [...this.edgeScanJobs.values()]
      .filter((item) => item.edgeAgentId === edgeAgentId && item.status === "queued")
      .sort((a, b) => a.requestedAt.localeCompare(b.requestedAt))[0];
    if (!job) return undefined;
    Object.assign(job, { status: "running" as const, startedAt: new Date().toISOString() });
    return job;
  }

  async completeEdgeScanJob(
    edgeAgentId: string,
    jobId: string,
    result: {
      status: "completed" | "failed";
      resultCount: number;
      provisionedCount?: number;
      credentialsRequiredCount?: number;
      pendingVerificationCount?: number;
      verifiedCount?: number;
      recorderCount?: number;
      timeSynchronizedCount?: number;
      timeDriftCount?: number;
      analyticsCompatibleCount?: number;
      duplicateCount?: number;
      error?: string;
    },
  ) {
    const job = this.edgeScanJobs.get(jobId);
    if (!job || job.edgeAgentId !== edgeAgentId || job.status !== "running") return undefined;
    Object.assign(job, {
      status: result.status,
      resultCount: result.resultCount,
      provisionedCount: result.provisionedCount ?? 0,
      credentialsRequiredCount: result.credentialsRequiredCount ?? 0,
      pendingVerificationCount: result.pendingVerificationCount ?? 0,
      verifiedCount: result.verifiedCount ?? 0,
      recorderCount: result.recorderCount ?? 0,
      timeSynchronizedCount: result.timeSynchronizedCount ?? 0,
      timeDriftCount: result.timeDriftCount ?? 0,
      analyticsCompatibleCount: result.analyticsCompatibleCount ?? 0,
      duplicateCount: result.duplicateCount ?? 0,
      error: result.error ?? null,
      completedAt: new Date().toISOString(),
    });
    return job;
  }

  private resolveDeviceIdentity(branchId: string, observation: DeviceIdentityObservation) {
    const branch = this.nodes.get(branchId);
    if (!branch) throw new Error("invalid_branch");
    const claims = identityClaims(observation);
    const claimKeys = claims.map((claim) => `${branch.tenantId}:${claim.type}:${claim.value}`);
    let identity = claimKeys
      .map((key) => this.deviceIdentities.get(this.deviceIdentityClaims.get(key) ?? ""))
      .find((candidate): candidate is DeviceIdentity => Boolean(candidate));
    if (!identity && claims.length === 0 && observation.ipAddress) {
      identity = [...this.deviceIdentities.values()].find((candidate) =>
        candidate.branchId === branchId &&
        candidate.deviceType === observation.deviceType &&
        candidate.currentIpAddress === observation.ipAddress &&
        candidate.channel === observation.channel
      );
    }

    const observedAt = new Date().toISOString();
    if (!identity) {
      identity = {
        deviceId: randomUUID(),
        tenantId: branch.tenantId,
        branchId,
        deviceType: observation.deviceType,
        ipHistory: [],
        firstSeenAt: observedAt,
        lastSeenAt: observedAt,
      };
      this.deviceIdentities.set(identity.deviceId, identity);
    }

    Object.assign(identity, clean({
      branchId,
      deviceType: observation.deviceType,
      hardwareSerial: observation.hardwareSerial,
      manufacturer: observation.manufacturer,
      model: observation.model,
      firmwareVersion: observation.firmwareVersion,
      macAddress: normalizeMacAddress(observation.macAddress) ?? observation.macAddress,
      currentIpAddress: observation.ipAddress,
      onvifUuid: observation.onvifUuid,
      dvrSerialNumber: observation.dvrSerialNumber,
      channel: observation.channel,
      certificateRef: observation.certificateRef,
      certificateFingerprint: observation.certificateFingerprint,
      credentialRef: observation.credentialRef,
      agentId: observation.agentId,
      lastSeenAt: observedAt,
    }));

    for (const key of claimKeys) {
      const existingIdentityId = this.deviceIdentityClaims.get(key);
      if (!existingIdentityId || existingIdentityId === identity.deviceId) {
        this.deviceIdentityClaims.set(key, identity.deviceId);
      }
    }

    if (observation.ipAddress) {
      const address = identity.ipHistory.find((item) => item.ipAddress === observation.ipAddress);
      if (address) {
        address.lastSeenAt = observedAt;
        address.observationCount += 1;
        if (observation.agentId) address.agentId = observation.agentId;
      } else {
        identity.ipHistory.push({
          ipAddress: observation.ipAddress,
          ...(observation.agentId ? { agentId: observation.agentId } : {}),
          firstSeenAt: observedAt,
          lastSeenAt: observedAt,
          observationCount: 1,
        });
      }
    }

    if (identity.cameraId) {
      const camera = this.cameras.get(identity.cameraId);
      if (camera) {
        Object.assign(camera, clean({
          deviceIdentityId: identity.deviceId,
          edgeAgentId: observation.agentId,
          serialNumber: observation.hardwareSerial,
          macAddress: observation.macAddress,
          firmwareVersion: observation.firmwareVersion,
          ipAddress: observation.ipAddress,
          onvifUuid: observation.onvifUuid,
          certificateRef: observation.certificateRef,
          certificateFingerprint: observation.certificateFingerprint,
          firstSeenAt: identity.firstSeenAt,
          lastSeenAt: identity.lastSeenAt,
        }));
      }
    }
    return identity;
  }

  async createDiscovery(branchId: string, input: CameraDiscoveryInput) {
    const agent = this.edgeAgents.get(input.edgeAgentId);
    if (!agent || agent.branchId !== branchId) throw new Error("invalid_edge_agent");

    const normalized = structuredClone(input);
    normalized.discoveryLayers = [
      ...(normalized.discoveryLayers ?? []),
      { layer: "register", status: "passed", detail: "Control plane registration completed" },
    ];
    const identity = this.resolveDeviceIdentity(branchId, observationFromDiscovery(normalized));

    const existing = [...this.discoveries.values()].find((item) => {
      const sameBranch = item.branchId === branchId;
      const sameIp = item.ipAddress === normalized.ipAddress && item.onvifPort === normalized.onvifPort;
      const sameSourceSlot = sameIp && (
        item.recorderChannel === normalized.recorderChannel ||
        (item.recorderChannel === undefined && normalized.recorderChannel === undefined)
      );
      const sameIdentity = item.deviceIdentityId === identity.deviceId;
      if (item.status === "rejected" && sameBranch && (sameSourceSlot || sameIdentity)) {
        return true;
      }
      return sameBranch && (sameIdentity || sameSourceSlot);
    });

    if (existing) {
      if (existing.status === "rejected") {
        return existing;
      }
      Object.assign(existing, normalized, {
        deviceIdentityId: identity.deviceId,
        ...(identity.cameraId ? {
          duplicateStatus: "duplicate" as const,
          existingDeviceAssociation: identity.cameraId,
          statusReason: normalized.statusReason ?? "matched_existing_device_identity",
        } : {}),
        discoveredAt: new Date().toISOString(),
      });
      return existing;
    }
    const discovery: DiscoveredCamera = {
      id: randomUUID(),
      deviceIdentityId: identity.deviceId,
      branchId,
      status: "pending", 
      discoveredAt: new Date().toISOString(),
      manufacturer: normalized.manufacturer || normalized.vendor || 'Unknown',
      ...(normalized.displayName ? { displayName: normalized.displayName } : {}),
      ...(normalized.statusReason ? { statusReason: normalized.statusReason } : {}),
      ...(normalized.credentialsRequired !== undefined ? { credentialsRequired: normalized.credentialsRequired } : {}),
      ...(normalized.streamVerified !== undefined ? { streamVerified: normalized.streamVerified } : {}),
      ...(normalized.compatibility ? { compatibility: normalized.compatibility } : {}),
      ...normalized,
      ...(identity.cameraId ? {
        duplicateStatus: "duplicate",
        existingDeviceAssociation: identity.cameraId,
        statusReason: normalized.statusReason ?? "matched_existing_device_identity",
      } : {}),
    };
    this.discoveries.set(discovery.id, discovery);
    return discovery;
  }

  async listDiscoveredCameras(branchId: string) {
    return [...this.discoveries.values()]
      .filter((discovery) =>
        discovery.branchId === branchId && discovery.status === "pending"
      )
      .sort((left, right) => right.discoveredAt.localeCompare(left.discoveredAt));
  }

  async rejectDiscovery(discoveryId: string, reason?: string) {
    const discovery = this.discoveries.get(discoveryId);
    if (!discovery) return undefined;
    discovery.status = "rejected";
    if (reason) discovery.statusReason = reason;
    return discovery;
  }

  async renameDiscovery(discoveryId: string, displayName: string) {
    const discovery = this.discoveries.get(discoveryId);
    if (!discovery) return undefined;
    discovery.displayName = displayName;
    return discovery;
  }

  async approveCamera(branchId: string, input: CameraApprovalInput) {
    const discovery = this.discoveries.get(input.discoveryId);
    const branch = this.nodes.get(branchId);
    if (!discovery || discovery.branchId !== branchId || !branch) return undefined;
    const identity = this.deviceIdentities.get(discovery.deviceIdentityId);
    if (!identity) throw new Error("device_identity_not_found");
    if (identity.cameraId) {
      const existingCamera = this.cameras.get(identity.cameraId);
      if (!existingCamera) throw new Error("identity_camera_not_found");
      Object.assign(existingCamera, clean({
        edgeAgentId: discovery.edgeAgentId,
        ipAddress: input.ipAddress ?? discovery.ipAddress,
        serialNumber: input.serialNumber ?? discovery.serialNumber,
        macAddress: input.macAddress ?? discovery.macAddress,
        firmwareVersion: discovery.firmwareVersion,
        onvifUuid: input.onvifUuid ?? discovery.onvifUuid,
        certificateRef: input.certificateRef ?? discovery.certificateRef,
        certificateFingerprint: input.certificateFingerprint ?? discovery.certificateFingerprint,
        lastSeenAt: identity.lastSeenAt,
      }));
      existingCamera.connectionSecretRef = input.connectionSecretRef;
      identity.credentialRef = input.connectionSecretRef;
      discovery.status = "approved";
      return existingCamera;
    }
    const nodeId = randomUUID();
    this.nodes.set(nodeId, {
      id: nodeId, tenantId: branch.tenantId, parentId: branchId, type: "camera",
      name: input.name, path: [...branch.path, nodeId],
    });
    const camera: Camera = {
      id: randomUUID(), deviceIdentityId: identity.deviceId,
      name: input.name, nodeId, branchId, vendor: discovery.vendor,
      model: discovery.model, channel: input.channel, protocol: input.protocol,
      status: "unknown", profiles: discovery.profiles,
      capabilities: discovery.capabilities,
      edgeAgentId: discovery.edgeAgentId,
      connectionSecretRef: input.connectionSecretRef,
      sourceType: input.sourceType ?? discovery.sourceType ?? "ip-camera",
      connectionTransport: input.connectionTransport,
      recorderId: input.recorderId ?? discovery.recorderId,
      recorderChannel: input.recorderChannel ?? discovery.recorderChannel,
      recorderSerialNumber: input.recorderSerialNumber ?? discovery.recorderSerialNumber,
      serialNumber: input.serialNumber ?? discovery.serialNumber,
      macAddress: input.macAddress ?? discovery.macAddress,
      firmwareVersion: discovery.firmwareVersion,
      ipAddress: input.ipAddress ?? discovery.ipAddress,
      onvifUuid: input.onvifUuid ?? discovery.onvifUuid,
      certificateRef: input.certificateRef ?? discovery.certificateRef,
      certificateFingerprint: input.certificateFingerprint ?? discovery.certificateFingerprint,
      firstSeenAt: identity.firstSeenAt,
      lastSeenAt: identity.lastSeenAt,
    };
    discovery.status = "approved";
    this.cameras.set(camera.id, camera);
    identity.cameraId = camera.id;
    identity.credentialRef = input.connectionSecretRef;
    return camera;
  }

  async replaceRecorderChannels(input: {
    branchId: string;
    oldRecorderSerialNumber: string;
    newRecorderSerialNumber: string;
    mappings: Array<{ cameraId: string; discoveryId: string; sourceChannel: number }>;
    actorUserId: string;
  }): Promise<RecorderReplacementResult> {
    const oldSerial = input.oldRecorderSerialNumber.trim().toUpperCase();
    const newSerial = input.newRecorderSerialNumber.trim().toUpperCase();
    if (!oldSerial || !newSerial || oldSerial === newSerial) throw new Error("invalid_recorder_replacement");
    if (input.mappings.length === 0) throw new Error("recorder_replacement_has_no_channels");

    const resolved = input.mappings.map((mapping) => {
      const camera = this.cameras.get(mapping.cameraId);
      const discovery = this.discoveries.get(mapping.discoveryId);
      const valid = camera?.branchId === input.branchId &&
        camera.recorderSerialNumber?.trim().toUpperCase() === oldSerial &&
        camera.recorderChannel === mapping.sourceChannel &&
        discovery?.branchId === input.branchId && discovery.status === "pending" &&
        discovery.recorderSerialNumber?.trim().toUpperCase() === newSerial &&
        discovery.recorderChannel === mapping.sourceChannel &&
        discovery.streamVerified === true && discovery.credentialsRequired !== true;
      if (!camera || !discovery || !valid) throw new Error("recorder_replacement_mapping_changed");
      return { camera, discovery };
    });
    if (new Set(input.mappings.map((item) => item.cameraId)).size !== input.mappings.length ||
        new Set(input.mappings.map((item) => item.discoveryId)).size !== input.mappings.length) {
      throw new Error("duplicate_recorder_replacement_mapping");
    }

    for (const { camera, discovery } of resolved) {
      const targetIdentity = camera.deviceIdentityId
        ? this.deviceIdentities.get(camera.deviceIdentityId)
        : undefined;
      const replacementIdentity = this.deviceIdentities.get(discovery.deviceIdentityId);
      if (targetIdentity && replacementIdentity && targetIdentity.deviceId !== replacementIdentity.deviceId) {
        for (const [claim, identityId] of this.deviceIdentityClaims) {
          if (identityId === replacementIdentity.deviceId) {
            this.deviceIdentityClaims.set(claim, targetIdentity.deviceId);
          }
        }
        for (const address of replacementIdentity.ipHistory) {
          const existingAddress = targetIdentity.ipHistory.find((item) => item.ipAddress === address.ipAddress);
          if (existingAddress) {
            existingAddress.lastSeenAt = address.lastSeenAt;
            existingAddress.observationCount += address.observationCount;
          } else {
            targetIdentity.ipHistory.push(structuredClone(address));
          }
        }
        Object.assign(targetIdentity, {
          dvrSerialNumber: discovery.recorderSerialNumber,
          channel: discovery.recorderChannel,
          currentIpAddress: discovery.ipAddress,
          firmwareVersion: discovery.firmwareVersion ?? targetIdentity.firmwareVersion,
          agentId: discovery.edgeAgentId,
          lastSeenAt: replacementIdentity.lastSeenAt,
        });
        discovery.deviceIdentityId = targetIdentity.deviceId;
        this.deviceIdentities.delete(replacementIdentity.deviceId);
      }
      Object.assign(camera, {
        edgeAgentId: discovery.edgeAgentId,
        vendor: discovery.vendor,
        model: discovery.model,
        protocol: "vendor-adapter" as const,
        status: "unknown" as const,
        profiles: structuredClone(discovery.profiles),
        capabilities: structuredClone(discovery.capabilities),
        connectionSecretRef: `edge://${discovery.edgeAgentId}/${discovery.id}`,
        sourceType: discovery.sourceType ?? camera.sourceType,
        recorderId: discovery.recorderId,
        recorderChannel: discovery.recorderChannel,
        recorderSerialNumber: discovery.recorderSerialNumber,
        firmwareVersion: discovery.firmwareVersion,
        ipAddress: discovery.ipAddress,
      });
      discovery.status = "approved";
      discovery.duplicateStatus = "duplicate";
      discovery.existingDeviceAssociation = camera.id;
      discovery.statusReason = `replacement_for:${oldSerial}`;
    }

    return {
      replacementId: randomUUID(), branchId: input.branchId,
      oldRecorderSerialNumber: oldSerial, newRecorderSerialNumber: newSerial,
      updatedCameraIds: resolved.map(({ camera }) => camera.id),
      preserved: ["camera-ids", "names", "permissions", "recording-history", "recording-policy", "analytics-rules", "alert-rules"],
      appliedAt: new Date().toISOString(),
    };
  }

  async createCameraFromManualRegistration(branchId: string, input: CameraApprovalInput) {
    const branch = this.nodes.get(branchId);
    if (!branch) return undefined;
    const identity = this.resolveDeviceIdentity(branchId, observationFromApproval(input));
    if (identity.cameraId) {
      const existingCamera = this.cameras.get(identity.cameraId);
      if (!existingCamera) return undefined;
      existingCamera.connectionSecretRef = input.connectionSecretRef;
      existingCamera.connectionTransport = input.connectionTransport ?? existingCamera.connectionTransport;
      if (input.profile) existingCamera.profiles = [structuredClone(input.profile)];
      identity.credentialRef = input.connectionSecretRef;
      return existingCamera;
    }
    const nodeId = randomUUID();
    this.nodes.set(nodeId, {
      id: nodeId, tenantId: branch.tenantId, parentId: branchId, type: "camera",
      name: input.name, path: [...branch.path, nodeId],
    });
    const camera: Camera = {
      id: randomUUID(), deviceIdentityId: identity.deviceId,
      name: input.name, nodeId, branchId,
      vendor: (input.manufacturer?.toLowerCase() === "hikvision" ? "hikvision" : "other") as Camera["vendor"],
      model: input.model ?? "manual",
      channel: input.channel,
      protocol: input.protocol,
      status: "unknown",
      profiles: [structuredClone(input.profile ?? {
        name: input.streamProfile ?? "main", codec: "H264", width: 1920, height: 1080,
        role: input.streamProfile === "sub" ? "sub" : "main",
      })],
      capabilities: { ptz: false, audio: false, events: true },
      edgeAgentId: undefined,
      connectionSecretRef: input.connectionSecretRef,
      connectionTransport: input.connectionTransport,
      sourceType: input.sourceType ?? "ip-camera",
      recorderId: input.recorderId,
      recorderChannel: input.recorderChannel,
      recorderSerialNumber: input.recorderSerialNumber,
      serialNumber: input.serialNumber,
      macAddress: input.macAddress,
      ipAddress: input.ipAddress,
      firmwareVersion: undefined,
      onvifUuid: input.onvifUuid,
      certificateRef: input.certificateRef,
      certificateFingerprint: input.certificateFingerprint,
      firstSeenAt: identity.firstSeenAt,
      lastSeenAt: identity.lastSeenAt,
    };
    this.cameras.set(camera.id, camera);
    identity.cameraId = camera.id;
    identity.credentialRef = input.connectionSecretRef;
    return camera;
  }

  async updateCameraStatus(id: string, status: CameraStatus) {
    const camera = this.cameras.get(id);
    if (!camera) return undefined;
    camera.status = status;
    return camera;
  }

  async createLiveSession(cameraId: string, userId: string, purpose: "view" | "talk" = "view"): Promise<LiveSession> {
    const camera = this.cameras.get(cameraId);
    const mediaGatewayUrl = camera?.edgeAgentId
      ? this.edgeAgents.get(camera.edgeAgentId)?.publicMediaUrl
      : undefined;
    const session = {
      id: randomUUID(), cameraId, userId,
      token: randomBytes(32).toString("base64url"),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      purpose,
      ...(mediaGatewayUrl ? { mediaGatewayUrl } : {}),
    };
    this.liveSessions.set(session.id, {
      ...session,
      tokenHash: hashToken(session.token),
      consumed: false,
    });
    return session;
  }

  async consumeLiveSession(token: string): Promise<ConsumedLiveSession | undefined> {
    const tokenHash = hashToken(token);
    const session = [...this.liveSessions.values()].find(
      (item) =>
        item.tokenHash === tokenHash &&
        !item.consumed &&
        Date.parse(item.expiresAt) > Date.now(),
    );
    if (!session) return undefined;
    const camera = this.cameras.get(session.cameraId);
    const user = this.users.get(session.userId);
    if (!camera || !user) return undefined;
    session.consumed = true;
    return {
      id: session.id,
      cameraId: camera.id,
      cameraNodeId: camera.nodeId,
      userId: user.id,
      tenantId: user.tenantId,
      connectionSecretRef: camera.connectionSecretRef,
      profiles: camera.profiles,
      purpose: session.purpose ?? "view",
      vendor: camera.vendor,
      model: camera.model,
      protocol: camera.protocol,
      ...(camera.sourceType ? { sourceType: camera.sourceType } : {}),
      channel: camera.channel,
      ...(camera.recorderChannel !== undefined ? { recorderChannel: camera.recorderChannel } : {}),
      capabilities: camera.capabilities,
    };
  }

  async getRecordingJob(cameraId: string) {
    return this.recordingJobs.get(cameraId);
  }

  async listOperationalTelemetryHistory(
    tenant: string,
    branchId: string,
    from: string,
    to: string,
    limit = 1000,
  ) {
    const start = Date.parse(from);
    const end = Date.parse(to);
    return this.operationalTelemetryHistory
      .filter((item) => item.tenantId === tenant && item.branchId === branchId)
      .filter((item) => {
        const observed = Date.parse(item.observedAt);
        return observed >= start && observed <= end;
      })
      .sort((left, right) => Date.parse(left.observedAt) - Date.parse(right.observedAt))
      .slice(-limit)
      .map((item) => structuredClone(item));
  }

  async listRecordingJobs(cameraIds: string[]) {
    const requested = new Set(cameraIds);
    return [...this.recordingJobs.values()].filter((job) => requested.has(job.cameraId));
  }

  async upsertRecordingJob(cameraId: string, input: Omit<RecordingJob, "id" | "cameraId" | "updatedAt">) {
    const existing = this.recordingJobs.get(cameraId);
    const job: RecordingJob = {
      id: existing?.id ?? randomUUID(), cameraId, ...structuredClone(input),
      updatedAt: new Date().toISOString(),
    };
    this.recordingJobs.set(cameraId, job);
    return job;
  }

  async listRecordingSegments(cameraId: string, from?: string, to?: string) {
    return this.recordingSegments.filter((segment) => segment.cameraId === cameraId &&
      (!from || segment.endedAt >= from) && (!to || segment.startedAt <= to));
  }

  async listRecordingSegmentsForCameras(cameraIds: string[], from?: string, to?: string) {
    const requested = new Set(cameraIds);
    return this.recordingSegments.filter((segment) => requested.has(segment.cameraId)
      && segment.status !== "deleted"
      && (!from || segment.endedAt >= from) && (!to || segment.startedAt <= to));
  }

  async getRecordingSegment(id: string) {
    return this.recordingSegments.find((segment) => segment.id === id);
  }

  async createRecordingSegment(input: Omit<RecordingSegment, "id" | "createdAt">) {
    const existing = this.recordingSegments.find((item) =>
      item.cameraId === input.cameraId && item.storagePath === input.storagePath
    );
    if (existing) {
      Object.assign(existing, structuredClone(input));
      return existing;
    }
    const segment: RecordingSegment = {
      id: randomUUID(), ...structuredClone(input), createdAt: new Date().toISOString(),
    };
    this.recordingSegments.push(segment);
    return segment;
  }

  async updateRecordingJobStatus(cameraId: string, status: RecordingJob["status"]) {
    const job = this.recordingJobs.get(cameraId);
    if (!job) return undefined;
    job.status = status;
    job.updatedAt = new Date().toISOString();
    return job;
  }

  async listRecordingLegalHolds(cameraId: string) {
    return this.recordingLegalHolds.filter((hold) => hold.cameraId === cameraId);
  }

  async createRecordingLegalHold(input: {
    tenantId: string; cameraId: string; fromAt: string; toAt: string;
    reason: string; createdBy: string;
  }) {
    const hold: RecordingLegalHold = {
      id: randomUUID(), ...structuredClone(input), createdAt: new Date().toISOString(),
    };
    this.recordingLegalHolds.push(hold);
    return hold;
  }

  async releaseRecordingLegalHold(
    id: string,
    inputTenantId: string,
    cameraId: string,
    releasedBy: string,
  ) {
    const hold = this.recordingLegalHolds.find((item) =>
      item.id === id && item.tenantId === inputTenantId &&
      item.cameraId === cameraId && !item.releasedAt
    );
    if (!hold) return undefined;
    hold.releasedBy = releasedBy;
    hold.releasedAt = new Date().toISOString();
    return hold;
  }

  async upsertRecordingStorageNode(input: {
    tenantId: string; externalId: string; name: string;
    scopeNodeId?: string | undefined;
    supportedTiers: Array<"hot" | "warm" | "cold">;
    capacityBytes: number; usedBytes: number; availableBytes: number;
    status: "healthy" | "warning" | "critical" | "offline";
    storageType?: "local-disk" | "nfs" | "smb" | "s3" | "cloud-archive" | "san";
    supportedProtocols?: string[];
    location?: string;
    mountPath?: string;
    temperatureCelsius?: number | undefined; writeMbps?: number | undefined;
    readMbps?: number | undefined; latencyMs?: number | undefined;
    smart?: any;
    raid?: any;
    lastWriteProbe?: any;
  }) {
    const key = `${input.tenantId}:${input.externalId}`;
    const existing = this.recordingStorageNodes.get(key);
    const node: RecordingStorageNode = {
      id: existing?.id ?? randomUUID(), ...structuredClone(input),
      lastSeenAt: new Date().toISOString(),
    };
    this.recordingStorageNodes.set(key, node);
    return node;
  }

  async listRecordingStorageNodes(tenantId: string) {
    return [...this.recordingStorageNodes.values()].filter(
      (node) => node.tenantId === tenantId,
    );
  }

  async createRecordingHealthEvent(input: {
    tenantId: string; cameraId?: string | undefined;
    storageNodeExternalId?: string | undefined; eventType: string;
    severity: "info" | "warning" | "critical"; message: string;
    details?: Record<string, unknown> | undefined;
  }) {
    const event: RecordingHealthEvent = {
      id: randomUUID(), ...structuredClone(input), details: input.details ?? {},
      occurredAt: new Date().toISOString(),
    };
    this.recordingHealthEvents.push(event);
    return event;
  }

  async listRecordingHealthEvents(cameraId: string, limit: number) {
    return this.recordingHealthEvents
      .filter((event) => event.cameraId === cameraId)
      .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
      .slice(0, limit);
  }

  private findApplicableCompliancePolicy(camera: Camera, node: ResourceNode) {
    const policies = this.compliancePolicies.filter((policy) => policy.tenantId === node.tenantId)
      .filter((policy) => {
        if (policy.entityType) {
          const matchesEntityType = node.path.some((nodeId) =>
            this.nodes.get(nodeId)?.type === policy.entityType,
          );
          if (!matchesEntityType) return false;
        }
        if (policy.locationType && policy.locationType !== camera.locationType) return false;
        if (policy.cameraType && policy.cameraType !== camera.physicalType) return false;
        return true;
      });
    policies.sort((left, right) => {
      const leftScore = Number(Boolean(left.entityType)) + Number(Boolean(left.locationType)) + Number(Boolean(left.cameraType));
      const rightScore = Number(Boolean(right.entityType)) + Number(Boolean(right.locationType)) + Number(Boolean(right.cameraType));
      if (leftScore !== rightScore) return rightScore - leftScore;
      return (right.updatedAt ?? right.createdAt).localeCompare(left.updatedAt ?? left.createdAt);
    });
    return policies[0];
  }

  private getPolicyRetentionDays(
    job: RecordingJob,
    policy: { normalRetentionDays?: number; hotStorageDays?: number; warmStorageDays?: number; coldStorageDays?: number } | undefined,
    storageTier: RecordingSegment["storageTier"],
  ) {
    const defaultTierDays = storageTier === "hot"
      ? job.hotRetentionDays
      : storageTier === "warm"
        ? job.warmRetentionDays
        : storageTier === "cold"
          ? job.coldRetentionDays
          : job.retentionDays;
    const policyTierDays = storageTier === "hot"
      ? policy?.hotStorageDays
      : storageTier === "warm"
        ? policy?.warmStorageDays
        : storageTier === "cold"
          ? policy?.coldStorageDays
          : undefined;
    return policyTierDays ?? policy?.normalRetentionDays ?? defaultTierDays;
  }

  private overlapsTimeRange(
    segment: RecordingSegment,
    range: { fromAt: string; toAt: string },
  ) {
    return range.fromAt < segment.endedAt && range.toAt > segment.startedAt;
  }

  async listRecordingRetentionCandidates(
    inputTenantId: string,
    storageNodeExternalId: string,
    limit: number,
  ) {
    const now = Date.now();
    return this.recordingSegments.filter((segment) => {
      const camera = this.cameras.get(segment.cameraId);
      const node = camera ? this.nodes.get(camera.nodeId) : undefined;
      const job = this.recordingJobs.get(segment.cameraId);
      if (!camera || !node || node.tenantId !== inputTenantId || !job ||
          !job.automaticDeletionEnabled || segment.status !== "ready" ||
          segment.storageNodeExternalId !== storageNodeExternalId) return false;
      const policy = this.findApplicableCompliancePolicy(camera, node);
      if (policy?.automaticDeletionEligibility === false) return false;
      if (job.backupRequired || policy?.backupRequired) return false;
      const baseRetentionDays = this.getPolicyRetentionDays(job, policy, segment.storageTier);
      const incidentRetentionDays = policy?.incidentRetentionDays ?? 0;
      const hasIncidentOverlap = incidentRetentionDays > 0 && this.incidentVideoRanges.some((range) =>
        range.cameraId === segment.cameraId && this.overlapsTimeRange(segment, range),
      );
      const retentionDays = hasIncidentOverlap
        ? Math.max(baseRetentionDays, incidentRetentionDays)
        : baseRetentionDays;
      if (Date.parse(segment.endedAt) >= now - retentionDays * 86_400_000) return false;
      const activeLegalHold = this.recordingLegalHolds.some((hold) =>
        hold.cameraId === segment.cameraId && !hold.releasedAt &&
        hold.fromAt < segment.endedAt && hold.toAt > segment.startedAt,
      );
      if (activeLegalHold && !policy?.legalHoldOverride) return false;
      return true;
    }).slice(0, limit);
  }

  async markRecordingSegmentsDeleted(
    inputTenantId: string,
    storageNodeExternalId: string,
    segmentIds: string[],
  ) {
    let updated = 0;
    for (const segment of this.recordingSegments) {
      const camera = this.cameras.get(segment.cameraId);
      const node = camera ? this.nodes.get(camera.nodeId) : undefined;
      if (node?.tenantId === inputTenantId &&
          segment.storageNodeExternalId === storageNodeExternalId &&
          segmentIds.includes(segment.id) && segment.status !== "deleted") {
        segment.status = "deleted";
        updated += 1;
      }
    }
    return updated;
  }

  async listLiveBookmarks(cameraId: string, limit: number) {
    return this.liveBookmarks
      .filter((bookmark) => bookmark.cameraId === cameraId)
      .sort((left, right) => right.bookmarkedAt.localeCompare(left.bookmarkedAt))
      .slice(0, limit);
  }

  async createLiveBookmark(
    input: Parameters<ControlPlaneStore["createLiveBookmark"]>[0],
  ) {
    if (!this.cameras.has(input.cameraId)) throw new Error("camera_not_found");
    const bookmark: LiveBookmark = {
      id: randomUUID(),
      tenantId: input.tenantId,
      cameraId: input.cameraId,
      operatorId: input.operatorId,
      bookmarkedAt: input.bookmarkedAt,
      reason: input.reason,
      priority: input.priority,
      ...(input.notes ? { notes: input.notes } : {}),
      ...(input.recordingSegmentId
        ? { recordingSegmentId: input.recordingSegmentId }
        : {}),
      ...(input.snapshotReference
        ? { snapshotReference: input.snapshotReference }
        : {}),
      createdAt: new Date().toISOString(),
    };
    this.liveBookmarks.push(bookmark);
    return bookmark;
  }

  async listLiveIncidents(cameraId: string, limit: number) {
    return this.liveIncidents
      .filter((incident) => incident.cameraId === cameraId)
      .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
      .slice(0, limit);
  }

  async createLiveIncident(
    input: Parameters<ControlPlaneStore["createLiveIncident"]>[0],
  ) {
    if (!this.cameras.has(input.cameraId)) throw new Error("camera_not_found");
    const occurredAt = new Date(input.occurredAt);
    const recordingFrom = new Date(
      occurredAt.getTime() - input.preRollSeconds * 1000,
    ).toISOString();
    const recordingTo = new Date(
      occurredAt.getTime() + input.postRollSeconds * 1000,
    ).toISOString();
    const incidentId = randomUUID();
    const legalHoldId = randomUUID();
    const bookmarkId = randomUUID();
    const now = new Date().toISOString();
    const bookmark: LiveBookmark = {
      id: bookmarkId,
      tenantId: input.tenantId,
      cameraId: input.cameraId,
      operatorId: input.createdBy,
      bookmarkedAt: input.occurredAt,
      reason: "suspicious-activity",
      priority: input.priority === "P1" ? "critical"
        : input.priority === "P2" ? "high"
        : input.priority === "P3" ? "medium" : "low",
      incidentId,
      ...(input.notes ? { notes: input.notes } : {}),
      createdAt: now,
    };
    const incident: LiveIncident = {
      id: incidentId,
      tenantId: input.tenantId,
      cameraId: input.cameraId,
      createdBy: input.createdBy,
      title: input.title,
      ...(input.notes ? { notes: input.notes } : {}),
      priority: input.priority,
      status: "new",
      occurredAt: input.occurredAt,
      recordingFrom,
      recordingTo,
      preRollSeconds: input.preRollSeconds,
      postRollSeconds: input.postRollSeconds,
      bookmarkId,
      legalHoldId,
      createdAt: now,
      updatedAt: now,
    };
    this.recordingLegalHolds.push({
      id: legalHoldId,
      tenantId: input.tenantId,
      cameraId: input.cameraId,
      fromAt: recordingFrom,
      toAt: recordingTo,
      reason: `Live incident ${input.priority}: ${input.title}`,
      createdBy: input.createdBy,
      createdAt: now,
    });
    this.liveBookmarks.push(bookmark);
    this.liveIncidents.push(incident);
    return incident;
  }

  // Incident management (investigation) - Use mixin methods
  createIncident = IncidentManagementMethods.createIncident;
  getIncident = IncidentManagementMethods.getIncident;
  listIncidents = IncidentManagementMethods.listIncidents;
  updateIncident = IncidentManagementMethods.updateIncident;
  updateIncidentStatus = IncidentManagementMethods.updateIncidentStatus;
  assignIncident = IncidentManagementMethods.assignIncident;
  escalateIncident = IncidentManagementMethods.escalateIncident;
  closeIncident = IncidentManagementMethods.closeIncident;
  reopenIncident = IncidentManagementMethods.reopenIncident;
  addIncidentParticipant = IncidentManagementMethods.addIncidentParticipant;
  listIncidentParticipants = IncidentManagementMethods.listIncidentParticipants;
  updateIncidentParticipant = IncidentManagementMethods.updateIncidentParticipant;
  removeIncidentParticipant = IncidentManagementMethods.removeIncidentParticipant;
  addIncidentCamera = IncidentManagementMethods.addIncidentCamera;
  listIncidentCameras = IncidentManagementMethods.listIncidentCameras;
  addIncidentVideoRange = IncidentManagementMethods.addIncidentVideoRange;
  listIncidentVideoRanges = IncidentManagementMethods.listIncidentVideoRanges;
  preserveIncidentVideoAutomatic = IncidentManagementMethods.preserveIncidentVideoAutomatic;
  listIncidentTimeline = IncidentManagementMethods.listIncidentTimeline;
  addIncidentEvent = IncidentManagementMethods.addIncidentEvent;
  createIncidentClip = IncidentManagementMethods.createIncidentClip;
  listIncidentClips = IncidentManagementMethods.listIncidentClips;
  getIncidentClip = IncidentManagementMethods.getIncidentClip;
  createIncidentSnapshot = IncidentManagementMethods.createIncidentSnapshot;
  listIncidentSnapshots = IncidentManagementMethods.listIncidentSnapshots;
  getIncidentSnapshot = IncidentManagementMethods.getIncidentSnapshot;
  addIncidentEvidenceItem = IncidentManagementMethods.addIncidentEvidenceItem;
  listIncidentEvidenceItems = IncidentManagementMethods.listIncidentEvidenceItems;
  createIncidentEvidencePackage = IncidentManagementMethods.createIncidentEvidencePackage;
  listIncidentEvidencePackages = IncidentManagementMethods.listIncidentEvidencePackages;
  getIncidentEvidencePackage = IncidentManagementMethods.getIncidentEvidencePackage;
  approveEvidencePackage = IncidentManagementMethods.approveEvidencePackage;
  updateEvidencePackageStatus = IncidentManagementMethods.updateEvidencePackageStatus;
  recordEvidencePackageDownload = IncidentManagementMethods.recordEvidencePackageDownload;
  createPoliceIntimation = IncidentManagementMethods.createPoliceIntimation;
  listPoliceIntimations = IncidentManagementMethods.listPoliceIntimations;
  getPoliceIntimation = IncidentManagementMethods.getPoliceIntimation;
  updatePoliceIntimation = IncidentManagementMethods.updatePoliceIntimation;
  recordPoliceEvidenceTransfer = IncidentManagementMethods.recordPoliceEvidenceTransfer;
  listPoliceEvidenceTransfers = IncidentManagementMethods.listPoliceEvidenceTransfers;
  createInsuranceClaim = IncidentManagementMethods.createInsuranceClaim;
  listInsuranceClaims = IncidentManagementMethods.listInsuranceClaims;
  getInsuranceClaim = IncidentManagementMethods.getInsuranceClaim;
  updateInsuranceClaim = IncidentManagementMethods.updateInsuranceClaim;
  addInsuranceDocument = IncidentManagementMethods.addInsuranceDocument;
  listInsuranceDocuments = IncidentManagementMethods.listInsuranceDocuments;
  createIncidentTask = IncidentManagementMethods.createIncidentTask;
  listIncidentTasks = IncidentManagementMethods.listIncidentTasks;
  updateIncidentTask = IncidentManagementMethods.updateIncidentTask;
  completeIncidentTask = IncidentManagementMethods.completeIncidentTask;
  addIncidentNote = IncidentManagementMethods.addIncidentNote;
  listIncidentNotes = IncidentManagementMethods.listIncidentNotes;
  updateIncidentNote = IncidentManagementMethods.updateIncidentNote;
  deleteIncidentNote = IncidentManagementMethods.deleteIncidentNote;
  createSecureShare = IncidentManagementMethods.createSecureShare;
  listSecureShares = IncidentManagementMethods.listSecureShares;
  getSecureShare = IncidentManagementMethods.getSecureShare;
  getSecureShareByToken = IncidentManagementMethods.getSecureShareByToken;
  verifySecureShareAccess = IncidentManagementMethods.verifySecureShareAccess;
  recordSecureShareDownload = IncidentManagementMethods.recordSecureShareDownload;
  revokeSecureShare = IncidentManagementMethods.revokeSecureShare;
  createIncidentReport = IncidentManagementMethods.createIncidentReport;
  listIncidentReports = IncidentManagementMethods.listIncidentReports;
  getIncidentReport = IncidentManagementMethods.getIncidentReport;
  updateIncidentReport = IncidentManagementMethods.updateIncidentReport;
  reviewIncidentReport = IncidentManagementMethods.reviewIncidentReport;
  approveIncidentReport = IncidentManagementMethods.approveIncidentReport;
  finalizeIncidentReport = IncidentManagementMethods.finalizeIncidentReport;
  getIncidentsDashboard = IncidentManagementMethods.getIncidentsDashboard;
  getIncidentStatistics = IncidentManagementMethods.getIncidentStatistics;

  async listComplianceFrameworks(tenantId: string) {
    return this.complianceFrameworks.filter((framework) => framework.tenantId === tenantId);
  }

  async getComplianceFramework(id: string) {
    return this.complianceFrameworks.find((framework) => framework.id === id);
  }

  async createComplianceFramework(input: Parameters<ControlPlaneStore["createComplianceFramework"]>[0]) {
    const now = new Date().toISOString();
    const framework: ComplianceFramework = {
      id: randomUUID(),
      tenantId: input.tenantId,
      name: input.name ?? "",
      status: input.status ?? "active",
      createdAt: now,
      updatedAt: now,
      ...(clean({ source: input.source, description: input.description, effectiveDate: input.effectiveDate, reviewDate: input.reviewDate, createdBy: input.createdBy }) as any),
    };
    this.complianceFrameworks.push(framework);
    return framework;
  }

  async updateComplianceFramework(id: string, input: Parameters<ControlPlaneStore["updateComplianceFramework"]>[1]) {
    const framework = this.complianceFrameworks.find((item) => item.id === id);
    if (!framework) return undefined;
    Object.assign(framework, {
      ...input,
      updatedAt: new Date().toISOString(),
    });
    return framework;
  }

  async listCompliancePolicies(tenantId: string, frameworkId?: string) {
    return this.compliancePolicies.filter((policy) =>
      policy.tenantId === tenantId && (!frameworkId || policy.frameworkId === frameworkId),
    );
  }

  async getCompliancePolicy(id: string) {
    return this.compliancePolicies.find((policy) => policy.id === id);
  }

  async createCompliancePolicy(input: Parameters<ControlPlaneStore["createCompliancePolicy"]>[0]) {
    const now = new Date().toISOString();
    const policy: CompliancePolicy = {
      id: randomUUID(),
      tenantId: input.tenantId,
      frameworkId: input.frameworkId,
      policyName: input.policyName ?? "",
      backupRequired: input.backupRequired ?? false,
      legalHoldOverride: input.legalHoldOverride ?? false,
      automaticDeletionEligibility: input.automaticDeletionEligibility ?? true,
      createdAt: now,
      updatedAt: now,
      ...(clean({ policyBasis: input.policyBasis, entityType: input.entityType, locationType: input.locationType, cameraType: input.cameraType, normalRetentionDays: input.normalRetentionDays, hotStorageDays: input.hotStorageDays, warmStorageDays: input.warmStorageDays, coldStorageDays: input.coldStorageDays, incidentRetentionDays: input.incidentRetentionDays, approvalAuthority: input.approvalAuthority, effectiveDate: input.effectiveDate, reviewDate: input.reviewDate, notes: input.notes, createdBy: input.createdBy }) as any),
    };
    this.compliancePolicies.push(policy);
    return policy;
  }

  async updateCompliancePolicy(id: string, input: Parameters<ControlPlaneStore["updateCompliancePolicy"]>[1]) {
    const policy = this.compliancePolicies.find((item) => item.id === id);
    if (!policy) return undefined;
    Object.assign(policy, {
      ...input,
      updatedAt: new Date().toISOString(),
    });
    return policy;
  }

  async listComplianceAssessments(tenantId: string, filters?: ComplianceAssessmentFilters) {
    return this.complianceAssessments.filter((assessment) => {
      if (assessment.tenantId !== tenantId) return false;
      if (filters?.frameworkId && assessment.frameworkId !== filters.frameworkId) return false;
      if (filters?.branchNodeId && assessment.branchNodeId !== filters.branchNodeId) return false;
      if (filters?.status && assessment.status !== filters.status) return false;
      return true;
    });
  }

  async getComplianceAssessment(id: string) {
    return this.complianceAssessments.find((assessment) => assessment.id === id);
  }

  async createComplianceAssessment(input: Parameters<ControlPlaneStore["createComplianceAssessment"]>[0]) {
    const now = new Date().toISOString();
    const assessment: ComplianceAssessment = {
      id: randomUUID(),
      tenantId: input.tenantId,
      frameworkId: input.frameworkId,
      status: input.status ?? "incomplete",
      createdAt: now,
      updatedAt: now,
      ...(clean({ branchNodeId: input.branchNodeId, assessmentPeriodStart: input.assessmentPeriodStart, assessmentPeriodEnd: input.assessmentPeriodEnd, summary: input.summary, evidence: input.evidence, createdBy: input.createdBy }) as any),
    };
    this.complianceAssessments.push(assessment);
    return assessment;
  }

  async updateComplianceAssessment(id: string, input: Parameters<ControlPlaneStore["updateComplianceAssessment"]>[1]) {
    const assessment = this.complianceAssessments.find((item) => item.id === id);
    if (!assessment) return undefined;
    Object.assign(assessment, {
      ...input,
      updatedAt: new Date().toISOString(),
    });
    return assessment;
  }

  async listComplianceCertificates(assessmentId: string) {
    return this.complianceCertificates.filter((certificate) => certificate.assessmentId === assessmentId);
  }

  async getComplianceCertificate(id: string) {
    return this.complianceCertificates.find((certificate) => certificate.id === id);
  }

  async createComplianceCertificate(input: Parameters<ControlPlaneStore["createComplianceCertificate"]>[0]) {
    const now = new Date().toISOString();
    const certificate: ComplianceCertificate = {
      id: randomUUID(),
      assessmentId: input.assessmentId,
      tenantId: input.tenantId,
      certificateNumber: input.certificateNumber,
      title: input.title ?? "",
      status: input.status ?? "incomplete",
      issuedAt: input.issuedAt ?? now,
      createdAt: now,
      updatedAt: now,
      ...(clean({ issuedBy: input.issuedBy, expiryDate: input.expiryDate, documentHash: input.documentHash, signature: input.signature, metadata: input.metadata }) as any),
    };
    this.complianceCertificates.push(certificate);
    return certificate;
  }

  async updateDeviceInventory(id: string, input: Parameters<ControlPlaneStore["updateDeviceInventory"]>[1]) {
    const record = this.deviceInventory.find((item) => item.id === id);
    if (!record) return undefined;
    Object.assign(record, { ...input, updatedAt: new Date().toISOString() });
    return record;
  }

  async createMaintenanceAsset(input: MaintenanceAssetInput): Promise<MaintenanceAsset> {
    const now = new Date().toISOString();
    const asset = {
      id: randomUUID(),
      tenantId: input.tenantId,
      category: input.category,
      assetType: input.assetType,
      status: input.status ?? "operational",
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
      ...(clean({ serialNumber: input.serialNumber, make: input.make, model: input.model, firmwareVersion: input.firmwareVersion, warrantyExpiresAt: input.warrantyExpiresAt, purchaseDate: input.purchaseDate, installationDate: input.installationDate, vendorId: input.vendorId, branchNodeId: input.branchNodeId, location: input.location, mountingHeight: input.mountingHeight, notes: input.notes }) as any),
    };
    this.maintenanceAssets.push(asset);
    return asset;
  }

  async listMaintenanceAssets(tenantId: string, category?: string) {
    return this.maintenanceAssets.filter((asset) => asset.tenantId === tenantId && (!category || asset.category === category));
  }

  async getMaintenanceAsset(id: string) {
    return this.maintenanceAssets.find((asset) => asset.id === id);
  }

  async updateMaintenanceAsset(id: string, input: Parameters<ControlPlaneStore["updateMaintenanceAsset"]>[1]) {
    const asset = this.maintenanceAssets.find((item) => item.id === id);
    if (!asset) return undefined;
    Object.assign(asset, {
      ...input,
      updatedAt: new Date().toISOString(),
    });
    return asset;
  }

  async createWorkOrder(input: WorkOrderInput): Promise<WorkOrder> {
    const now = new Date().toISOString();
    const workOrder = {
      id: randomUUID(),
      tenantId: input.tenantId,
      workOrderNumber: input.workOrderNumber,
      problem: input.problem,
      severity: input.severity ?? "medium",
      status: input.status ?? "open",
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
      ...(clean({ assetId: input.assetId, branchNodeId: input.branchNodeId, technician: input.technician, vendorId: input.vendorId, slaDueAt: input.slaDueAt, eta: input.eta, parts: input.parts, cost: input.cost, rootCause: input.rootCause, actionTaken: input.actionTaken, verification: input.verification }) as any),
    };
    this.workOrders.push(workOrder);
    return workOrder;
  }

  async listWorkOrders(tenantId: string, status?: string) {
    return this.workOrders.filter((order) => order.tenantId === tenantId && (!status || order.status === status));
  }

  async getWorkOrder(id: string) {
    return this.workOrders.find((order) => order.id === id);
  }

  async updateWorkOrder(id: string, input: Parameters<ControlPlaneStore["updateWorkOrder"]>[1]) {
    const workOrder = this.workOrders.find((order) => order.id === id);
    if (!workOrder) return undefined;
    Object.assign(workOrder, {
      ...input,
      updatedAt: new Date().toISOString(),
    });
    return workOrder;
  }

  async createMaintenanceVendor(input: MaintenanceVendorInput): Promise<MaintenanceVendor> {
    const now = new Date().toISOString();
    const vendor = {
      id: randomUUID(),
      tenantId: input.tenantId,
      name: input.name,
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
      ...(clean({ contact: input.contact, email: input.email, phone: input.phone, address: input.address, gstNumber: input.gstNumber, serviceCenters: input.serviceCenters, escalationMatrix: input.escalationMatrix, notes: input.notes }) as any),
    };
    this.maintenanceVendors.push(vendor);
    return vendor;
  }

  async listMaintenanceVendors(tenantId: string) {
    return this.maintenanceVendors.filter((vendor) => vendor.tenantId === tenantId);
  }

  async getMaintenanceVendor(id: string) {
    return this.maintenanceVendors.find((vendor) => vendor.id === id);
  }

  async updateMaintenanceVendor(id: string, input: Parameters<ControlPlaneStore["updateMaintenanceVendor"]>[1]) {
    const vendor = this.maintenanceVendors.find((item) => item.id === id);
    if (!vendor) return undefined;
    Object.assign(vendor, {
      ...input,
      updatedAt: new Date().toISOString(),
    });
    return vendor;
  }

  async createAmcContract(input: AmcContractInput): Promise<AmcContract> {
    const now = new Date().toISOString();
    const contract = {
      id: randomUUID(),
      tenantId: input.tenantId,
      contractNumber: input.contractNumber,
      vendorId: input.vendorId,
      startDate: input.startDate ?? new Date().toISOString(),
      endDate: input.endDate ?? new Date().toISOString(),
      status: input.status ?? "active",
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
      ...(clean({ startDate: input.startDate, endDate: input.endDate, warranty: input.warranty, coverage: input.coverage, exclusions: input.exclusions, paymentTerms: input.paymentTerms, cost: input.cost, renewal: input.renewal, sla: input.sla, notes: input.notes }) as any),
    };
    this.amcContracts.push(contract);
    return contract;
  }

  async createMaintenancePlan(input: { tenantId: string; name: string; cadence: string; checklistTemplate?: Record<string, any>; startDate?: string; endDate?: string; createdBy: string; }) {
    const now = new Date().toISOString();
    const plan = {
      id: randomUUID(), tenantId: input.tenantId, name: input.name, cadence: input.cadence,
      checklistTemplate: input.checklistTemplate ?? {}, startDate: input.startDate, endDate: input.endDate,
      createdBy: input.createdBy, createdAt: now, updatedAt: now,
    };
    this.maintenancePlans.push(plan);
    return plan;
  }

  async listMaintenancePlans(tenantId: string) {
    return this.maintenancePlans.filter((p) => p.tenantId === tenantId);
  }

  async getMaintenancePlan(id: string) {
    return this.maintenancePlans.find((p) => p.id === id);
  }

  async startPasswordRotation(input: { tenantId: string; deviceId: string; requestedBy: string; reason: string; rotationMode: 'scheduled' | 'emergency'; newPassword: string; }) {
    const now = new Date().toISOString();
    const secretRef = `device-credential://${input.tenantId}/${input.deviceId}/${randomUUID()}`;
    const rotation = {
      id: randomUUID(),
      tenantId: input.tenantId,
      deviceId: input.deviceId,
      requestedBy: input.requestedBy,
      reason: input.reason,
      rotationMode: input.rotationMode,
      status: 'pending-verification',
      secretRef,
      createdAt: now,
      updatedAt: now,
    };
    this.passwordRotations.push(rotation);
    return rotation;
  }

  async listPasswordRotations(tenantId: string) {
    return this.passwordRotations.filter((item) => item.tenantId === tenantId);
  }

  async createDeviceTemplate(input: { tenantId: string; name: string; templateType: 'camera-configuration' | 'recording' | 'analytics' | 'privacy' | 'network' | 'security-hardening' | 'location'; category: string; settings: Record<string, unknown>; createdBy: string; }) {
    const now = new Date().toISOString();
    const template = {
      id: randomUUID(),
      tenantId: input.tenantId,
      name: input.name,
      templateType: input.templateType,
      category: input.category,
      settings: input.settings,
      status: 'published',
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    };
    this.deviceTemplates.push(template);
    return template;
  }

  async applyDeviceTemplate(input: { tenantId: string; deviceId: string; templateId: string; appliedBy: string; }) {
    const template = this.deviceTemplates.find((item) => item.id === input.templateId);
    if (!template) {
      throw new Error('template_not_found');
    }
    const assignment = {
      id: randomUUID(),
      tenantId: input.tenantId,
      deviceId: input.deviceId,
      templateId: input.templateId,
      appliedBy: input.appliedBy,
      status: 'applied',
      appliedAt: new Date().toISOString(),
    };
    this.deviceTemplateAssignments.push(assignment);
    return assignment;
  }

  async getDeviceTemplateDrift(deviceId: string, templateId: string) {
    const template = this.deviceTemplates.find((item) => item.id === templateId);
    const assignment = this.deviceTemplateAssignments.find((item) => item.deviceId === deviceId && item.templateId === templateId);
    if (!template) {
      return { deviceId, templateId, status: 'unsupported' };
    }
    if (!assignment) {
      return { deviceId, templateId, status: 'minor-drift', templateVersion: template.settings };
    }
    return { deviceId, templateId, status: 'compliant', templateVersion: template.settings };
  }

  async assignDeviceIpAddress(input: { tenantId: string; deviceId: string; ipAddress: string; subnet: string; assignedBy: string; reservationStatus: 'dhcp' | 'static' | 'reserved'; }) {
    const existing = this.deviceIpAssignments.find((item) => item.tenantId === input.tenantId && item.ipAddress === input.ipAddress);
    const assignment = {
      id: randomUUID(),
      tenantId: input.tenantId,
      deviceId: input.deviceId,
      ipAddress: input.ipAddress,
      subnet: input.subnet,
      assignedBy: input.assignedBy,
      reservationStatus: input.reservationStatus,
      conflict: Boolean(existing),
      assignedAt: new Date().toISOString(),
    };
    this.deviceIpAssignments.push(assignment);
    return assignment;
  }

  async getIpConflicts(tenantId: string) {
    return this.deviceIpAssignments.filter((item) => item.tenantId === tenantId && item.conflict);
  }

  async createAnalyticsRule(
    inputTenantId: string,
    cameraId: string,
    createdBy: string | undefined,
    input: Parameters<ControlPlaneStore["createAnalyticsRule"]>[3],
  ) {
    const camera = this.cameras.get(cameraId);
    const node = camera ? this.nodes.get(camera.nodeId) : undefined;
    if (!camera || node?.tenantId !== inputTenantId) throw new Error("camera_not_found");
    const now = new Date().toISOString();
    const rule: AnalyticsRule = {
      id: randomUUID(), tenantId: inputTenantId, cameraId,
      ...(createdBy ? { createdBy } : {}),
      ...structuredClone(input), createdAt: now, updatedAt: now,
    };
    this.analyticsRules.push(rule);
    return rule;
  }

  async updateAnalyticsRule(
    id: string,
    inputTenantId: string,
    cameraId: string,
    input: Parameters<ControlPlaneStore["updateAnalyticsRule"]>[3],
  ) {
    const rule = this.analyticsRules.find((item) =>
      item.id === id && item.tenantId === inputTenantId && item.cameraId === cameraId
    );
    if (!rule) return undefined;
    Object.assign(rule, structuredClone(input), { updatedAt: new Date().toISOString() });
    return rule;
  }

  async deleteAnalyticsRule(id: string, inputTenantId: string, cameraId: string) {
    const index = this.analyticsRules.findIndex((rule) =>
      rule.id === id && rule.tenantId === inputTenantId && rule.cameraId === cameraId
    );
    if (index < 0) return false;
    this.analyticsRules.splice(index, 1);
    return true;
  }

  async processAnalyticsEvent(
    input: Parameters<ControlPlaneStore["processAnalyticsEvent"]>[0],
  ) {
    const camera = this.cameras.get(input.cameraId);
    const node = camera ? this.nodes.get(camera.nodeId) : undefined;
    if (!camera || node?.tenantId !== input.tenantId) throw new Error("camera_not_found");
    const duplicate = this.analyticsEvents.find((event) =>
      event.tenantId === input.tenantId && event.sourceEventId === input.sourceEventId
    );
    if (duplicate) {
      const alerts = this.analyticsAlerts.filter((alert) => alert.eventId === duplicate.id);
      return {
        event: { ...duplicate, status: "duplicate" as const },
        alerts,
        rules: this.analyticsRules.filter((rule) =>
          alerts.some((alert) => alert.ruleId === rule.id)
        ),
      };
    }

    const matchingRules = sortedMatchingRules(
      this.analyticsRules.filter((rule) => rule.cameraId === input.cameraId),
      input,
    );
    const now = new Date().toISOString();
    const eventId = randomUUID();
    const alerts: AnalyticsAlert[] = [];
    let created = 0;
    for (const rule of matchingRules) {
      const effectiveSeverity = resolveAlertSeverity({
        configuredSeverity: rule.severity,
        durationSeconds: input.durationSeconds,
        correlatedDetectionCount: correlationCount(input.metadata),
      });
      const recent = this.analyticsAlerts.find((alert) => {
        if (alert.ruleId !== rule.id || alert.cameraId !== input.cameraId ||
            isTerminalAlertStatus(alert.status)) return false;
        const elapsed = Date.parse(input.occurredAt) - Date.parse(alert.lastDetectedAt);
        return elapsed >= 0 && elapsed <= rule.cooldownSeconds * 1_000;
      });
      if (recent) {
        recent.lastDetectedAt = input.occurredAt;
        recent.occurrenceCount += 1;
        recent.confidence = Math.max(recent.confidence, input.confidence);
        recent.severity = moreSevere(recent.severity, effectiveSeverity);
        recent.updatedAt = now;
        alerts.push(recent);
        continue;
      }
      const alert: AnalyticsAlert = {
        id: randomUUID(), tenantId: input.tenantId, cameraId: input.cameraId,
        ruleId: rule.id, eventId, title: analyticsAlertTitle(rule),
        description: `Rule \"${rule.name}\" matched on camera ${camera.name}.`,
        severity: effectiveSeverity, status: "new", confidence: input.confidence,
        objectClasses: [...new Set(input.objects.map((object) => object.label))],
        modelVersion: input.modelVersion,
        ...(input.snapshotReference ? { snapshotReference: input.snapshotReference } : {}),
        ...(input.clipReference ? { clipReference: input.clipReference } : {}),
        firstDetectedAt: input.occurredAt, lastDetectedAt: input.occurredAt,
        occurrenceCount: 1,
        ...(rule.escalateAfterSeconds ? {
          slaDueAt: new Date(Date.parse(input.occurredAt) + rule.escalateAfterSeconds * 1_000).toISOString(),
        } : {}),
        correlationKey: typeof input.metadata?.correlationKey === "string"
          ? input.metadata.correlationKey : `${rule.id}:${input.cameraId}`,
        version: 1, createdAt: now, updatedAt: now,
      };
      this.analyticsAlerts.push(alert);
      alerts.push(alert);
      created += 1;
    }
    const event: AnalyticsEvent = {
      id: eventId, tenantId: input.tenantId, cameraId: input.cameraId,
      sourceEventId: input.sourceEventId,
      ...(matchingRules[0] ? { ruleId: matchingRules[0].id } : {}),
      detectionType: input.detectionType, occurredAt: input.occurredAt,
      ...(input.endedAt ? { endedAt: input.endedAt } : {}),
      confidence: input.confidence, durationSeconds: input.durationSeconds,
      modelVersion: input.modelVersion, objects: structuredClone(input.objects),
      ...(input.snapshotReference ? { snapshotReference: input.snapshotReference } : {}),
      ...(input.clipReference ? { clipReference: input.clipReference } : {}),
      metadata: structuredClone(input.metadata ?? {}),
      status: matchingRules.length === 0 ? "unmatched" : created > 0 ? "accepted" : "suppressed",
      ...(matchingRules.length === 0 ? { rejectionReason: "no_matching_rule" } : {}),
      createdAt: now,
    };
    this.analyticsEvents.push(event);
    return { event, alerts, rules: matchingRules };
  }

  async listAnalyticsAlerts(
    inputTenantId: string,
    filters: Parameters<ControlPlaneStore["listAnalyticsAlerts"]>[1],
  ) {
    return this.analyticsAlerts
      .filter((alert) => alert.tenantId === inputTenantId)
      .filter((alert) => !filters.cameraId || alert.cameraId === filters.cameraId)
      .filter((alert) => !filters.branchId ||
        this.cameras.get(alert.cameraId)?.branchId === filters.branchId)
      .filter((alert) => !filters.status || alert.status === filters.status)
      .filter((alert) => !filters.severity || alert.severity === filters.severity)
      .filter((alert) => !filters.from || alert.lastDetectedAt >= filters.from)
      .filter((alert) => !filters.to || alert.firstDetectedAt <= filters.to)
      .sort((left, right) => right.lastDetectedAt.localeCompare(left.lastDetectedAt))
      .slice(0, filters.limit);
  }

  async countAnalyticsAlerts(
    inputTenantId: string,
    filters: Parameters<ControlPlaneStore["countAnalyticsAlerts"]>[1],
  ) {
    const counts: Record<AnalyticsAlert["severity"], number> = {
      P1: 0,
      P2: 0,
      P3: 0,
      P4: 0,
      P5: 0,
    };
    for (const alert of this.analyticsAlerts) {
      if (alert.tenantId !== inputTenantId) continue;
      if (filters.cameraId && alert.cameraId !== filters.cameraId) continue;
      if (filters.branchId && this.cameras.get(alert.cameraId)?.branchId !== filters.branchId) continue;
      if (filters.from && alert.lastDetectedAt < filters.from) continue;
      if (filters.to && alert.firstDetectedAt > filters.to) continue;
      if (alert.status === "resolved" || alert.status === "false_alarm" || alert.status === "suppressed") continue;
      counts[alert.severity] += 1;
    }
    return counts;
  }

  async getAnalyticsAlert(id: string, inputTenantId: string) {
    return this.analyticsAlerts.find((alert) =>
      alert.id === id && alert.tenantId === inputTenantId
    );
  }

  async updateAnalyticsAlertEvidence(
    id: string,
    inputTenantId: string,
    input: { snapshotReference?: string; clipReference?: string },
  ) {
    const alert = await this.getAnalyticsAlert(id, inputTenantId);
    if (!alert) return undefined;
    let changed = false;
    if (!alert.snapshotReference && input.snapshotReference) {
      alert.snapshotReference = input.snapshotReference;
      changed = true;
    }
    if (!alert.clipReference && input.clipReference) {
      alert.clipReference = input.clipReference;
      changed = true;
    }
    if (changed) {
      alert.version += 1;
      alert.updatedAt = new Date().toISOString();
    }
    return alert;
  }

  async transitionAnalyticsAlert(
    id: string,
    inputTenantId: string,
    input: Parameters<ControlPlaneStore["transitionAnalyticsAlert"]>[2],
  ) {
    const alert = await this.getAnalyticsAlert(id, inputTenantId);
    if (!alert) return undefined;
    if (input.expectedVersion !== undefined && alert.version !== input.expectedVersion) {
      throw new Error("alert_version_conflict");
    }
    if (input.status === "acknowledged" && alert.acknowledgedAt) {
      throw new Error("alert_already_acknowledged");
    }
    if (isTerminalAlertStatus(alert.status) && alert.status !== input.status) {
      throw new Error("invalid_alert_transition");
    }
    const now = new Date().toISOString();
    alert.status = input.status;
    alert.version += 1;
    alert.updatedAt = now;
    if (input.status === "acknowledged") {
      alert.acknowledgedBy = input.actorUserId;
      alert.acknowledgedAt = now;
      this.analyticsAcknowledgements.push({
        id: randomUUID(), alertId: id, userId: input.actorUserId,
        notes: input.notes, acknowledgedAt: now,
      });
    }
    if (input.status === "escalated") {
      this.analyticsEscalations.push({
        id: randomUUID(), alertId: id, escalatedBy: input.actorUserId,
        notes: input.notes, recipients: input.recipients ?? [], escalatedAt: now,
      });
    }
    if (input.assignedTo) {
      alert.assignedTo = input.assignedTo;
      alert.assignedAt = now;
    }
    if (input.status === "resolved") alert.resolvedAt = now;
    if (input.status === "false_alarm") alert.falseAlarmReason = input.falseAlarmReason;
    return alert;
  }

  async getAlertNotificationPolicy(inputTenantId: string) {
    return structuredClone(this.alertNotificationPolicies.get(inputTenantId) ?? defaultAlertNotificationPolicy(inputTenantId));
  }

  async upsertAlertNotificationPolicy(policy: AlertNotificationPolicy) {
    const saved = { ...structuredClone(policy), updatedAt: new Date().toISOString() };
    this.alertNotificationPolicies.set(policy.tenantId, saved);
    return structuredClone(saved);
  }

  async enqueueAlertNotifications(input: Parameters<ControlPlaneStore["enqueueAlertNotifications"]>[0]) {
    const now = new Date().toISOString();
    const created: AlertNotification[] = [];
    for (const target of input) {
      const existing = this.analyticsNotifications.find((item) => item.alertId === target.alertId &&
        item.channel === target.channel && item.recipient === target.recipient);
      if (existing) { created.push(existing); continue; }
      const notification: AlertNotification = {
        id: randomUUID(), ...target, status: "queued", attempts: 0,
        nextAttemptAt: target.nextAttemptAt ?? now, createdAt: now, updatedAt: now,
      };
      this.analyticsNotifications.push(notification);
      created.push(notification);
    }
    return structuredClone(created);
  }

  async claimAlertNotifications(limit: number, now: string) {
    const claimed = this.analyticsNotifications.filter((item) =>
      ["queued", "failed"].includes(item.status) && item.nextAttemptAt <= now,
    ).slice(0, limit);
    for (const item of claimed) { item.status = "processing"; item.attempts += 1; item.updatedAt = now; }
    return structuredClone(claimed);
  }

  async completeAlertNotification(id: string, result: Parameters<ControlPlaneStore["completeAlertNotification"]>[1]) {
    const item = this.analyticsNotifications.find((notification) => notification.id === id);
    if (!item) return undefined;
    const now = new Date().toISOString();
    item.status = result.status;
    item.updatedAt = now;
    if (result.providerId) item.providerId = result.providerId;
    if (result.error) item.lastError = result.error;
    if (result.nextAttemptAt) item.nextAttemptAt = result.nextAttemptAt;
    if (["sent", "delivered"].includes(result.status)) item.sentAt = now;
    if (result.status === "delivered") item.deliveredAt = now;
    return structuredClone(item);
  }

  async recordVoiceCallEvent(id: string, event: Parameters<ControlPlaneStore["recordVoiceCallEvent"]>[1]) {
    const item = this.analyticsNotifications.find((notification) => notification.id === id);
    if (!item?.voiceCall) return undefined;
    item.voiceCall.status = event.status;
    if (event.provider) item.voiceCall.provider = event.provider;
    item.voiceCall.events.push({ status: event.status, occurredAt: event.occurredAt, ...(event.detail ? { detail: event.detail } : {}) });
    if (event.providerId) item.providerId = event.providerId;
    if (event.acknowledgedAt) item.voiceCall.acknowledgedAt = event.acknowledgedAt;
    if (event.acknowledgedBy) item.voiceCall.acknowledgedBy = event.acknowledgedBy;
    if (event.recordingUrl) item.voiceCall.recordingUrl = event.recordingUrl;
    if (event.durationSeconds !== undefined) item.voiceCall.durationSeconds = event.durationSeconds;
    item.updatedAt = event.occurredAt;
    return structuredClone(item);
  }

  async recordSmsDeliveryEvent(id: string, event: Parameters<ControlPlaneStore["recordSmsDeliveryEvent"]>[1]) {
    const item = this.analyticsNotifications.find((notification) => notification.id === id);
    if (!item) return undefined;
    if (!item.smsDelivery) {
      item.smsDelivery = { provider: event.provider ?? "webhook", status: event.status, template: "unknown", events: [] };
    }
    item.smsDelivery.status = event.status;
    if (event.provider) item.smsDelivery.provider = event.provider;
    item.smsDelivery.events.push({ status: event.status, occurredAt: event.occurredAt,
      ...(event.detail ? { detail: event.detail } : {}) });
    if (event.providerId) item.providerId = event.providerId;
    item.updatedAt = event.occurredAt;
    return structuredClone(item);
  }

  async recordEmailDeliveryEvent(id: string, event: Parameters<ControlPlaneStore["recordEmailDeliveryEvent"]>[1]) {
    const item = this.analyticsNotifications.find((notification) => notification.id === id);
    if (!item) return undefined;
    if (!item.emailDelivery) {
      item.emailDelivery = { provider: event.provider ?? "webhook", status: event.status, subject: event.subject ?? "", events: [] };
    }
    item.emailDelivery.status = event.status;
    if (event.provider) item.emailDelivery.provider = event.provider;
    if (event.subject) item.emailDelivery.subject = event.subject;
    item.emailDelivery.events.push({ status: event.status, occurredAt: event.occurredAt,
      ...(event.detail ? { detail: event.detail } : {}) });
    if (event.providerId) item.providerId = event.providerId;
    item.updatedAt = event.occurredAt;
    return structuredClone(item);
  }

  async reserveSmsRateLimit(inputTenantId: string, limit: number, requested: number, now: string) {
    const window = new Date(now).toISOString().slice(0, 16);
    const key = `${inputTenantId}:${window}`;
    const used = this.smsRateLimitWindows.get(key) ?? 0;
    const allowed = Math.max(0, Math.min(requested, limit - used));
    this.smsRateLimitWindows.set(key, used + allowed);
    return allowed;
  }

  async listAlertNotifications(inputTenantId: string, alertId?: string) {
    return this.analyticsNotifications.filter((item) => item.tenantId === inputTenantId &&
      (!alertId || item.alertId === alertId)).map((item) => structuredClone(item));
  }

  async listOperationalReportSchedules(inputTenantId: string) {
    return this.operationalReportSchedules.filter((item) => item.tenantId === inputTenantId)
      .sort((a, b) => a.name.localeCompare(b.name)).map((item) => structuredClone(item));
  }

  async createOperationalReportSchedule(input: Omit<OperationalReportSchedule, "id" | "lastRunAt" | "createdAt" | "updatedAt">) {
    const now = new Date().toISOString();
    const item: OperationalReportSchedule = { id: randomUUID(), ...structuredClone(input), lastRunAt: null, createdAt: now, updatedAt: now };
    this.operationalReportSchedules.push(item); return structuredClone(item);
  }

  async updateOperationalReportSchedule(id: string, inputTenantId: string, updates: Partial<Pick<OperationalReportSchedule, "name" | "timezone" | "dailyAt" | "template" | "formats" | "recipients" | "filters" | "enabled" | "nextRunAt" | "lastRunAt">>) {
    const item = this.operationalReportSchedules.find((entry) => entry.id === id && entry.tenantId === inputTenantId);
    if (!item) return undefined;
    Object.assign(item, structuredClone(updates), { updatedAt: new Date().toISOString() });
    this.operationalReportScheduleClaims.delete(id); return structuredClone(item);
  }

  async deleteOperationalReportSchedule(id: string, inputTenantId: string) {
    const index = this.operationalReportSchedules.findIndex((item) => item.id === id && item.tenantId === inputTenantId);
    if (index < 0) return false; this.operationalReportSchedules.splice(index, 1); return true;
  }

  async claimDueOperationalReportSchedules(now: string, limit: number) {
    const due = this.operationalReportSchedules.filter((item) => item.enabled && item.nextRunAt <= now && !this.operationalReportScheduleClaims.has(item.id)).slice(0, limit);
    for (const item of due) this.operationalReportScheduleClaims.add(item.id);
    return structuredClone(due);
  }

  async createOperationalReportRun(input: Omit<OperationalReportRun, "id" | "status" | "progress" | "attempts" | "nextAttemptAt" | "rowCount" | "summary" | "error" | "startedAt" | "completedAt" | "createdAt" | "updatedAt">) {
    const now = new Date().toISOString();
    const item: OperationalReportRun = { id: randomUUID(), ...structuredClone(input), status: "queued", progress: 0, attempts: 0, nextAttemptAt: now, rowCount: null, summary: null, error: null, startedAt: null, completedAt: null, createdAt: now, updatedAt: now };
    this.operationalReportRuns.push(item); return structuredClone(item);
  }

  async listOperationalReportRuns(inputTenantId: string, limit: number) {
    return this.operationalReportRuns.filter((item) => item.tenantId === inputTenantId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit).map((item) => structuredClone(item));
  }
  async getOperationalReportRun(id: string, inputTenantId: string) { const item = this.operationalReportRuns.find((entry) => entry.id === id && entry.tenantId === inputTenantId); return item ? structuredClone(item) : undefined; }
  async claimOperationalReportRuns(now: string, limit: number) {
    const items = this.operationalReportRuns.filter((item) => ["queued", "failed"].includes(item.status) && item.nextAttemptAt <= now && item.attempts < item.maxAttempts).slice(0, limit);
    for (const item of items) { item.status = "running"; item.attempts += 1; item.startedAt ??= now; item.updatedAt = now; }
    return structuredClone(items);
  }
  async updateOperationalReportRun(id: string, updates: Partial<Pick<OperationalReportRun, "status" | "progress" | "nextAttemptAt" | "rowCount" | "summary" | "error" | "startedAt" | "completedAt">>) {
    const item = this.operationalReportRuns.find((entry) => entry.id === id); if (!item) return undefined;
    Object.assign(item, structuredClone(updates), { updatedAt: new Date().toISOString() }); return structuredClone(item);
  }
  async createOperationalReportArtifact(input: Omit<OperationalReportArtifact, "id" | "createdAt">) {
    const existing = this.operationalReportArtifacts.find((item) => item.runId === input.runId && item.format === input.format);
    if (existing) {
      Object.assign(existing, structuredClone(input), { createdAt: new Date().toISOString() });
      return structuredClone(existing);
    }
    const item: OperationalReportArtifact = { id: randomUUID(), ...structuredClone(input), createdAt: new Date().toISOString() };
    this.operationalReportArtifacts.push(item); return structuredClone(item);
  }
  async listOperationalReportArtifacts(inputTenantId: string, runId: string) { return this.operationalReportArtifacts.filter((item) => item.tenantId === inputTenantId && item.runId === runId).map((item) => structuredClone(item)); }
  async getOperationalReportArtifact(id: string, inputTenantId: string) { const item = this.operationalReportArtifacts.find((entry) => entry.id === id && entry.tenantId === inputTenantId); return item ? structuredClone(item) : undefined; }
  async enqueueOperationalReportDeliveries(input: Array<{ tenantId: string; runId: string; recipient: string }>) {
    const now = new Date().toISOString(); return input.map((target) => { const existing = this.operationalReportDeliveries.find((item) => item.runId === target.runId && item.recipient === target.recipient); if (existing) return structuredClone(existing); const item: OperationalReportDelivery = { id: randomUUID(), ...target, status: "queued", attempts: 0, nextAttemptAt: now, providerId: null, error: null, deliveredAt: null, createdAt: now, updatedAt: now }; this.operationalReportDeliveries.push(item); return structuredClone(item); });
  }
  async claimOperationalReportDeliveries(now: string, limit: number) { const items = this.operationalReportDeliveries.filter((item) => ["queued", "failed"].includes(item.status) && item.nextAttemptAt <= now && item.attempts < 5).slice(0, limit); for (const item of items) { item.status = "processing"; item.attempts += 1; item.updatedAt = now; } return structuredClone(items); }
  async completeOperationalReportDelivery(id: string, result: Parameters<ControlPlaneStore["completeOperationalReportDelivery"]>[1]) { const item = this.operationalReportDeliveries.find((entry) => entry.id === id); if (!item) return undefined; item.status = result.status; item.providerId = result.providerId ?? item.providerId; item.error = result.error ?? null; item.nextAttemptAt = result.nextAttemptAt ?? item.nextAttemptAt; item.deliveredAt = result.status === "delivered" ? new Date().toISOString() : item.deliveredAt; item.updatedAt = new Date().toISOString(); return structuredClone(item); }
  async listOperationalReportDeliveries(inputTenantId: string, runId: string) { return this.operationalReportDeliveries.filter((item) => item.tenantId === inputTenantId && item.runId === runId).map((item) => structuredClone(item)); }

  async linkAnalyticsAlertIncident(
    id: string,
    inputTenantId: string,
    incidentId: string,
  ) {
    const alert = await this.getAnalyticsAlert(id, inputTenantId);
    if (!alert) return undefined;
    alert.incidentId = incidentId;
    alert.updatedAt = new Date().toISOString();
    return alert;
  }

  async writeAudit(event: AuditEventInput) {
    this.auditEvents.push(structuredClone(event));
  }

  // ============ HEALTH MONITORING ============

  async recordCameraHealth(input: {
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
  }) {
    const cameraHealth = {
      id: randomUUID(),
      tenantId: input.tenantId,
      cameraId: input.cameraId,
      onlineStatus: input.onlineStatus,
      fps: input.fps,
      bitrate: input.bitrate,
      streamQuality: input.streamQuality,
      temperature: input.temperature,
      tampering: input.tampering ?? false,
      recordingRunning: input.recordingRunning,
      latencyMs: input.latencyMs,
      packetLoss: input.packetLoss,
      lastFrameAt: new Date().toISOString(),
      lastCheckAt: new Date().toISOString(),
    };
    this.cameraHealth.push(cameraHealth);
    return cameraHealth;
  }

  async recordStorageHealth(input: {
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
  }) {
    const usagePercentage = (input.usedCapacityGb / input.totalCapacityGb) * 100;
    const status = usagePercentage >= 90 ? 'critical' : usagePercentage >= 80 ? 'warning' : 'healthy';
    
    const storageHealth = {
      id: randomUUID(),
      tenantId: input.tenantId,
      assetId: input.assetId,
      totalCapacityGb: input.totalCapacityGb,
      usedCapacityGb: input.usedCapacityGb,
      availableCapacityGb: input.availableCapacityGb,
      usagePercentage,
      status,
      smartStatus: input.smartStatus,
      temperature: input.temperature,
      badSectors: input.badSectors,
      readSpeedMbs: input.readSpeedMbs,
      writeSpeedMbs: input.writeSpeedMbs,
      remainingLifetimeYears: input.remainingLifetimeYears,
      errorCount: input.errorCount,
      lastCheckAt: new Date().toISOString(),
    };
    this.storageHealth.push(storageHealth);
    return storageHealth;
  }

  async recordNetworkHealth(input: {
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
  }) {
    const status = (input.packetLossPercentage ?? 0) > 5 ? 'critical' 
      : (input.packetLossPercentage ?? 0) > 1 ? 'warning' : 'healthy';
    
    const networkHealth = {
      id: randomUUID(),
      tenantId: input.tenantId,
      branchNodeId: input.branchNodeId,
      assetId: input.assetId,
      checkType: input.checkType,
      latencyMs: input.latencyMs,
      packetLossPercentage: input.packetLossPercentage,
      jitterMs: input.jitterMs,
      bandwidthAvailableMbps: input.bandwidthAvailableMbps,
      rtspAvailable: input.rtspAvailable ?? true,
      onvifAvailable: input.onvifAvailable ?? true,
      status,
      lastCheckAt: new Date().toISOString(),
    };
    this.networkHealth.push(networkHealth);
    return networkHealth;
  }

  async recordUpsHealth(input: {
    tenantId: string;
    assetId: string;
    batteryHealthPercentage: number;
    runtimeMinutes?: number;
    chargingStatus?: string;
    loadPercentage?: number;
    temperature?: number;
    alarmStatus?: string;
  }) {
    const status = input.batteryHealthPercentage < 70 ? 'critical'
      : input.batteryHealthPercentage < 85 ? 'warning' : 'healthy';
    
    const upsHealth = {
      id: randomUUID(),
      tenantId: input.tenantId,
      assetId: input.assetId,
      batteryHealthPercentage: input.batteryHealthPercentage,
      runtimeMinutes: input.runtimeMinutes,
      chargingStatus: input.chargingStatus,
      loadPercentage: input.loadPercentage,
      temperature: input.temperature,
      alarmStatus: input.alarmStatus,
      status,
      lastCheckAt: new Date().toISOString(),
    };
    this.upsHealth.push(upsHealth);
    return upsHealth;
  }

  async getHealthCheckSummary(tenantId: string) {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    
    const camerasOnline = this.cameraHealth.filter(
      h => h.tenantId === tenantId && h.lastCheckAt > oneHourAgo && h.onlineStatus === 'online'
    ).length;
    
    const camerasOffline = this.cameraHealth.filter(
      h => h.tenantId === tenantId && h.lastCheckAt > oneHourAgo && h.onlineStatus === 'offline'
    ).length;
    
    const storageWarnings = this.storageHealth.filter(
      h => h.tenantId === tenantId && h.lastCheckAt > oneHourAgo && h.status !== 'healthy'
    ).length;
    
    const networkIssues = this.networkHealth.filter(
      h => h.tenantId === tenantId && h.lastCheckAt > oneHourAgo && h.status !== 'healthy'
    ).length;

    const totalCameras = this.cameras.size;
    const healthPercentage = totalCameras > 0 ? Math.round((camerasOnline / totalCameras) * 100) : 100;
    
    return {
      healthPercentage,
      camerasOnline,
      camerasOffline,
      camerasCount: totalCameras,
      storageAlerts: storageWarnings,
      networkIssues,
      recordingIssues: 0,
      amcExpiring: 0,
      overdueMaintenanceCount: this.maintenanceVisits.filter(
        v => v.tenantId === tenantId && v.status === 'pending' && new Date(v.dueAt) < now
      ).length,
      openWorkOrders: this.workOrders.filter(
        w => w.tenantId === tenantId && w.status !== 'closed'
      ).length,
    };
  }

  async listFirmwareUpdatesRequired(tenantId: string) {
    return this.firmwareInventory.filter(
      f => f.tenantId === tenantId && f.requiresUpdate
    ).sort((a, b) => (b.criticalUpdate ? 1 : 0) - (a.criticalUpdate ? 1 : 0));
  }

  async listLowStockParts(tenantId: string) {
    return this.spareParts.filter(
      p => p.tenantId === tenantId && p.reorderLevel && p.quantity <= p.reorderLevel
    );
  }

  async generateMaintenanceReport(input: {
    tenantId: string;
    reportType: string;
    periodStart: string;
    periodEnd: string;
    branchNodeId?: string;
    assetId?: string;
  }) {
    const periodStart = new Date(input.periodStart);
    const periodEnd = new Date(input.periodEnd);

    let metrics: any = {};

    switch (input.reportType) {
      case 'preventive':
        metrics = {
          scheduledVisits: this.maintenanceVisits.filter(
            v => v.tenantId === input.tenantId
              && new Date(v.dueAt) >= periodStart
              && new Date(v.dueAt) <= periodEnd
          ).length,
          completedVisits: this.maintenanceVisits.filter(
            v => v.tenantId === input.tenantId
              && v.status === 'completed'
              && new Date(v.visited_at ?? new Date()) >= periodStart
              && new Date(v.visited_at ?? new Date()) <= periodEnd
          ).length,
          overdueVisits: this.maintenanceVisits.filter(
            v => v.tenantId === input.tenantId
              && v.status !== 'completed'
              && new Date(v.dueAt) < new Date()
          ).length,
        };
        break;

      case 'corrective':
        metrics = {
          totalWorkOrders: this.workOrders.filter(
            w => w.tenantId === input.tenantId
              && new Date(w.createdAt) >= periodStart
              && new Date(w.createdAt) <= periodEnd
          ).length,
          closedWorkOrders: this.workOrders.filter(
            w => w.tenantId === input.tenantId
              && w.status === 'closed'
              && new Date(w.updatedAt) >= periodStart
              && new Date(w.updatedAt) <= periodEnd
          ).length,
          openWorkOrders: this.workOrders.filter(
            w => w.tenantId === input.tenantId && w.status !== 'closed'
          ).length,
          averageResolutionHours: 24,
        };
        break;

      case 'amc':
        metrics = {
          activeContracts: this.amcContracts.filter(
            c => c.tenantId === input.tenantId && c.status === 'active'
          ).length,
          expiringContracts: this.amcContracts.filter(
            c => c.tenantId === input.tenantId
              && new Date(c.end_date) <= new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
          ).length,
          totalAnnualCost: this.amcContracts.filter(
            c => c.tenantId === input.tenantId && c.status === 'active'
          ).reduce((sum, c) => sum + (c.cost ?? 0), 0),
        };
        break;
    }

    const report = {
      id: randomUUID(),
      tenantId: input.tenantId,
      reportType: input.reportType,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      branchNodeId: input.branchNodeId,
      assetId: input.assetId,
      metrics,
      summary: `${input.reportType} maintenance report for ${input.periodStart} to ${input.periodEnd}`,
      generatedBy: 'system',
      generatedAt: new Date().toISOString(),
      filename: `${input.reportType}-report-${new Date().toISOString().split('T')[0]}.pdf`,
    };
    this.maintenanceReports.push(report);
    return report;
  }

  async listMaintenanceReports(tenantId: string, filters?: { reportType?: string; limit?: number }) {
    return this.maintenanceReports.filter(
      r => r.tenantId === tenantId && (!filters?.reportType || r.reportType === filters.reportType)
    ).sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))
      .slice(0, filters?.limit ?? 50);
  }

  async getMaintenanceComplianceStatus(tenantId: string) {
    const overdueVisits = this.maintenanceVisits.filter(
      v => v.tenantId === tenantId && v.status !== 'completed' && new Date(v.dueAt) < new Date()
    ).length;

    const openWorkOrders = this.workOrders.filter(
      w => w.tenantId === tenantId && w.status !== 'closed'
    ).length;

    const criticalAlerts = this.predictiveAlerts.filter(
      p => p.tenantId === tenantId && p.score > 0.8
    ).length;

    return {
      compliant: overdueVisits === 0 && openWorkOrders === 0 && criticalAlerts === 0,
      overdueMaintenanceCount: overdueVisits,
      openIssuesCount: openWorkOrders,
      criticalAlertsCount: criticalAlerts,
      status: overdueVisits > 0 || openWorkOrders > 5 ? 'non-compliant' : 'compliant',
    };
  }

  // ============ PRIVACY METHODS ============

  async getPrivacySummary(tenantId: string): Promise<any> {
    const purposes = this.privacyPurposes.filter((purpose) => purpose.tenantId === tenantId);
    const matchedCameraIds = [...this.cameras.values()]
      .filter((camera) => {
        const node = this.nodes.get(camera.nodeId);
        return node && node.tenantId === tenantId;
      })
      .map((camera) => camera.id);
    const assignedPurposes = this.cameraPrivacyPurposeAssignments.filter((assignment) =>
      matchedCameraIds.includes(assignment.cameraId),
    );
    const controls = [...this.cameraPrivacyControls.values()].filter((control) =>
      matchedCameraIds.includes(control.cameraId),
    );
    const openBreaches = this.privacyBreaches.filter((breach) =>
      breach.tenantId === tenantId && breach.status !== "closed",
    );

    return {
      activePurposes: purposes.filter((purpose) => purpose.active).length,
      totalPurposes: purposes.length,
      assignedPurposes: assignedPurposes.length,
      totalControls: controls.length,
      openBreaches: openBreaches.length,
    };
  }

  async listPrivacyPurposes(tenantId: string): Promise<any[]> {
    return this.privacyPurposes.filter((purpose) => purpose.tenantId === tenantId);
  }

  async getPrivacyPurpose(id: string): Promise<any | undefined> {
    return this.privacyPurposes.find((purpose) => purpose.id === id);
  }

  async createPrivacyPurpose(input: {
    tenantId: string;
    name: string;
    lawfulBasis: string;
    description?: string;
    riskLevel?: string;
    dataCategories?: string[];
    active?: boolean;
    createdBy?: string;
  }): Promise<any> {
    const purpose = {
      id: randomUUID(),
      tenantId: input.tenantId,
      name: input.name,
      lawfulBasis: input.lawfulBasis,
      description: input.description ?? null,
      riskLevel: input.riskLevel ?? "medium",
      dataCategories: input.dataCategories ?? [],
      active: input.active ?? true,
      createdBy: input.createdBy ?? null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.privacyPurposes.unshift(purpose);
    return purpose;
  }

  async updatePrivacyPurpose(id: string, input: Partial<{
    tenantId: string;
    name: string;
    lawfulBasis: string;
    description?: string;
    riskLevel?: string;
    dataCategories?: string[];
    active?: boolean;
    createdBy?: string;
  }>): Promise<any | undefined> {
    const purpose = this.privacyPurposes.find((item) => item.id === id);
    if (!purpose) return undefined;
    Object.assign(purpose, {
      tenantId: input.tenantId ?? purpose.tenantId,
      name: input.name ?? purpose.name,
      lawfulBasis: input.lawfulBasis ?? purpose.lawfulBasis,
      description: input.description ?? purpose.description,
      riskLevel: input.riskLevel ?? purpose.riskLevel,
      dataCategories: input.dataCategories ?? purpose.dataCategories,
      active: input.active ?? purpose.active,
      createdBy: input.createdBy ?? purpose.createdBy,
      updatedAt: new Date().toISOString(),
    });
    return purpose;
  }

  async listCameraPrivacyPurposes(cameraId: string): Promise<any[]> {
    return this.cameraPrivacyPurposeAssignments.filter((assignment) => assignment.cameraId === cameraId);
  }

  async assignCameraPrivacyPurpose(
    cameraId: string,
    purposeId: string,
    assignedBy: string,
    startDate?: string,
    endDate?: string,
    notes?: string,
  ): Promise<any> {
    const assignment = {
      id: randomUUID(),
      cameraId,
      purposeId,
      assignedBy,
      startDate: startDate ?? null,
      endDate: endDate ?? null,
      notes: notes ?? null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.cameraPrivacyPurposeAssignments.unshift(assignment);
    return assignment;
  }

  async getCameraPrivacyControls(cameraId: string): Promise<any> {
    return this.cameraPrivacyControls.get(cameraId) ?? {
      cameraId,
      audioRecordingApproved: false,
      encryptionEnabled: false,
      disposalPlan: null,
      dataProtectionOfficer: null,
      lastReviewedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  async upsertCameraPrivacyControls(cameraId: string, input: any): Promise<any> {
    const existing = this.cameraPrivacyControls.get(cameraId) ?? {
      id: randomUUID(),
      cameraId,
      audioRecordingApproved: false,
      encryptionEnabled: false,
      disposalPlan: null,
      dataProtectionOfficer: null,
      lastReviewedAt: null,
      createdBy: null,
      createdAt: new Date().toISOString(),
    };
    const updated = {
      ...existing,
      ...input,
      updatedAt: new Date().toISOString(),
    };
    this.cameraPrivacyControls.set(cameraId, updated);
    return updated;
  }

  async listPrivacyBreaches(tenantId: string, status?: string): Promise<any[]> {
    return this.privacyBreaches.filter((breach) => breach.tenantId === tenantId && (!status || breach.status === status));
  }

  async reportPrivacyBreach(input: {
    tenantId: string;
    branchNodeId?: string;
    cameraId?: string;
    breachType: string;
    severity: string;
    discoveredAt: string;
    description?: string;
    remediation?: string;
    createdBy?: string;
  }): Promise<any> {
    const breach = {
      id: randomUUID(),
      ...input,
      status: "reported",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.privacyBreaches.unshift(breach);
    return breach;
  }

  async updatePrivacyBreachStatus(id: string, status: string, updatedBy: string): Promise<any> {
    const breach = this.privacyBreaches.find((item) => item.id === id);
    if (!breach) return undefined;
    breach.status = status;
    breach.updatedBy = updatedBy;
    breach.updatedAt = new Date().toISOString();
    return breach;
  }

  // ============ FIRMWARE MANAGEMENT ============

  async recordFirmwareVersion(input: {
    tenantId: string;
    assetId: string;
    deviceType: string;
    currentVersion: string;
    latestVersion?: string | undefined;
    requiresUpdate?: boolean | undefined;
    criticalUpdate?: boolean | undefined;
  }): Promise<any> {
    const firmware = {
      id: randomUUID(),
      tenantId: input.tenantId,
      assetId: input.assetId,
      deviceType: input.deviceType,
      currentVersion: input.currentVersion,
      latestVersion: input.latestVersion ?? null,
      requiresUpdate: input.requiresUpdate ?? false,
      criticalUpdate: input.criticalUpdate ?? false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.firmwareInventory.unshift(firmware);
    return firmware;
  }

  async recordSoftwareVersion(input: {
    tenantId: string;
    componentName: string;
    environment: string;
    currentVersion: string;
    previousVersion?: string | undefined;
    upgradeApprovedBy?: string | undefined;
    upgradeApprovedAt?: string | undefined;
  }): Promise<any> {
    const software = {
      id: randomUUID(),
      tenantId: input.tenantId,
      componentName: input.componentName,
      environment: input.environment,
      currentVersion: input.currentVersion,
      previousVersion: input.previousVersion ?? null,
      upgradeApprovedBy: input.upgradeApprovedBy ?? null,
      upgradeApprovedAt: input.upgradeApprovedAt ?? null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.softwareVersions.unshift(software);
    return software;
  }

  // ============ SPARE PARTS INVENTORY ============

  async recordSparePart(input: {
    tenantId: string;
    partName: string;
    partCode: string;
    category: string;
    vendorId?: string | undefined;
    quantity: number;
    reorderLevel?: number | undefined;
    unitCost?: number | undefined;
    warrantyMonths?: number | undefined;
    location?: string | undefined;
    branchNodeId?: string | undefined;
  }): Promise<any> {
    const part = {
      id: randomUUID(),
      tenantId: input.tenantId,
      partName: input.partName,
      partCode: input.partCode,
      category: input.category,
      vendorId: input.vendorId ?? null,
      quantity: input.quantity,
      reorderLevel: input.reorderLevel ?? 10,
      unitCost: input.unitCost ?? null,
      warrantyMonths: input.warrantyMonths ?? null,
      location: input.location ?? null,
      branchNodeId: input.branchNodeId ?? null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.spareParts.unshift(part);
    return part;
  }

  async recordInventoryTransaction(input: {
    tenantId: string;
    partId: string;
    workOrderId?: string | undefined;
    transactionType: 'add' | 'remove' | 'used' | 'damaged';
    quantity: number;
    referenceNumber?: string | undefined;
    notes?: string | undefined;
    recordedBy?: string | undefined;
  }): Promise<any> {
    const transaction = {
      id: randomUUID(),
      tenantId: input.tenantId,
      partId: input.partId,
      workOrderId: input.workOrderId ?? null,
      transactionType: input.transactionType,
      quantity: input.quantity,
      referenceNumber: input.referenceNumber ?? null,
      notes: input.notes ?? null,
      recordedBy: input.recordedBy ?? null,
      createdAt: new Date().toISOString(),
    };
    this.inventoryTransactions.unshift(transaction);

    // Update part quantity
    const part = this.spareParts.find((p) => p.id === input.partId);
    if (part) {
      if (input.transactionType === 'add') {
        part.quantity += input.quantity;
      } else if (input.transactionType === 'remove' || input.transactionType === 'used' || input.transactionType === 'damaged') {
        part.quantity -= input.quantity;
      }
      part.updatedAt = new Date().toISOString();
    }

    return transaction;
  }

  // Requirements
  async listComplianceRequirements(tenantId: string, filters?: {
    frameworkId?: string;
    category?: string;
    status?: string;
  }): Promise<any[]> {
    return this.complianceRequirements.filter((req) => {
      if (req.tenantId !== tenantId) return false;
      if (filters?.frameworkId && req.frameworkId !== filters.frameworkId) return false;
      if (filters?.category && req.category !== filters.category) return false;
      if (filters?.status && req.status !== filters.status) return false;
      return true;
    });
  }

  async getComplianceRequirement(id: string): Promise<any | undefined> {
    return this.complianceRequirements.find((req) => req.id === id);
  }

  async createComplianceRequirement(input: any): Promise<any> {
    const now = new Date().toISOString();
    const requirement = {
      id: randomUUID(),
      tenantId: input.tenantId,
      frameworkId: input.frameworkId,
      requirementNumber: input.requirementNumber,
      title: input.title,
      description: input.description ?? null,
      category: input.category ?? null,
      priority: input.priority ?? 'medium',
      status: input.status ?? 'active',
      implementationGuidance: input.implementationGuidance ?? null,
      createdBy: input.createdBy ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.complianceRequirements.push(requirement);
    return requirement;
  }

  async updateComplianceRequirement(id: string, input: any): Promise<any | undefined> {
    const requirement = this.complianceRequirements.find((req) => req.id === id);
    if (!requirement) return undefined;
    Object.assign(requirement, input, { updatedAt: new Date().toISOString() });
    return requirement;
  }

  async deleteComplianceRequirement(id: string): Promise<void> {
    const index = this.complianceRequirements.findIndex((req) => req.id === id);
    if (index >= 0) this.complianceRequirements.splice(index, 1);
  }

  // Controls
  async listComplianceControls(tenantId: string, filters?: {
    requirementId?: string;
    implementationStatus?: string;
  }): Promise<any[]> {
    return this.complianceControls.filter((control) => {
      if (control.tenantId !== tenantId) return false;
      if (filters?.requirementId && control.requirementId !== filters.requirementId) return false;
      if (filters?.implementationStatus && control.implementationStatus !== filters.implementationStatus) return false;
      return true;
    });
  }

  async getComplianceControl(id: string): Promise<any | undefined> {
    return this.complianceControls.find((control) => control.id === id);
  }

  async createComplianceControl(input: any): Promise<any> {
    const now = new Date().toISOString();
    const control = {
      id: randomUUID(),
      tenantId: input.tenantId,
      requirementId: input.requirementId,
      controlNumber: input.controlNumber,
      title: input.title,
      description: input.description ?? null,
      controlType: input.controlType ?? null,
      implementationStatus: input.implementationStatus ?? 'not_started',
      implementationDetails: input.implementationDetails ?? null,
      owner: input.owner ?? null,
      testingFrequency: input.testingFrequency ?? null,
      lastTestDate: input.lastTestDate ?? null,
      nextTestDate: input.nextTestDate ?? null,
      effectivenessRating: input.effectivenessRating ?? null,
      createdBy: input.createdBy ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.complianceControls.push(control);
    return control;
  }

  async updateComplianceControl(id: string, input: any): Promise<any | undefined> {
    const control = this.complianceControls.find((c) => c.id === id);
    if (!control) return undefined;
    Object.assign(control, input, { updatedAt: new Date().toISOString() });
    return control;
  }

  async deleteComplianceControl(id: string): Promise<void> {
    const index = this.complianceControls.findIndex((c) => c.id === id);
    if (index >= 0) this.complianceControls.splice(index, 1);
  }

  async updateControlTestDates(id: string, input: {
    lastTestDate: string;
    nextTestDate: string;
    effectivenessRating?: number;
  }): Promise<any | undefined> {
    const control = this.complianceControls.find((c) => c.id === id);
    if (!control) return undefined;
    control.lastTestDate = input.lastTestDate;
    control.nextTestDate = input.nextTestDate;
    if (input.effectivenessRating !== undefined) {
      control.effectivenessRating = input.effectivenessRating;
    }
    control.updatedAt = new Date().toISOString();
    return control;
  }

  // Evidence
  async listComplianceEvidence(tenantId: string, filters?: {
    requirementId?: string;
    controlId?: string;
    assessmentId?: string;
    validated?: boolean;
  }): Promise<any[]> {
    return this.complianceEvidence.filter((evidence) => {
      if (evidence.tenantId !== tenantId) return false;
      if (filters?.requirementId && evidence.requirementId !== filters.requirementId) return false;
      if (filters?.controlId && evidence.controlId !== filters.controlId) return false;
      if (filters?.assessmentId && evidence.assessmentId !== filters.assessmentId) return false;
      if (filters?.validated !== undefined && evidence.validated !== filters.validated) return false;
      return true;
    });
  }

  async getComplianceEvidence(id: string): Promise<any | undefined> {
    return this.complianceEvidence.find((evidence) => evidence.id === id);
  }

  async createComplianceEvidence(input: any): Promise<any> {
    const now = new Date().toISOString();
    const evidence = {
      id: randomUUID(),
      tenantId: input.tenantId,
      requirementId: input.requirementId ?? null,
      controlId: input.controlId ?? null,
      assessmentId: input.assessmentId ?? null,
      evidenceType: input.evidenceType,
      title: input.title,
      description: input.description ?? null,
      evidenceUrl: input.evidenceUrl ?? null,
      collectedAt: input.collectedAt ?? now,
      validated: input.validated ?? false,
      validatorId: input.validatorId ?? null,
      validationNotes: input.validationNotes ?? null,
      createdBy: input.createdBy ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.complianceEvidence.push(evidence);
    return evidence;
  }

  async updateComplianceEvidence(id: string, input: any): Promise<any | undefined> {
    const evidence = this.complianceEvidence.find((e) => e.id === id);
    if (!evidence) return undefined;
    Object.assign(evidence, input, { updatedAt: new Date().toISOString() });
    return evidence;
  }

  async deleteComplianceEvidence(id: string): Promise<void> {
    const index = this.complianceEvidence.findIndex((e) => e.id === id);
    if (index >= 0) this.complianceEvidence.splice(index, 1);
  }

  async validateComplianceEvidence(id: string, validated: boolean, validatorId: string, notes?: string): Promise<any | undefined> {
    const evidence = this.complianceEvidence.find((e) => e.id === id);
    if (!evidence) return undefined;
    evidence.validated = validated;
    evidence.validatorId = validatorId;
    evidence.validationNotes = notes ?? null;
    evidence.updatedAt = new Date().toISOString();
    return evidence;
  }

  // Tests
  async listComplianceTests(tenantId: string, filters?: {
    controlId?: string;
    status?: string;
  }): Promise<any[]> {
    return this.complianceTests.filter((test) => {
      if (test.tenantId !== tenantId) return false;
      if (filters?.controlId && test.controlId !== filters.controlId) return false;
      if (filters?.status && test.status !== filters.status) return false;
      return true;
    });
  }

  async getComplianceTest(id: string): Promise<any | undefined> {
    return this.complianceTests.find((test) => test.id === id);
  }

  async createComplianceTest(input: any): Promise<any> {
    const now = new Date().toISOString();
    const test = {
      id: randomUUID(),
      tenantId: input.tenantId,
      controlId: input.controlId,
      testName: input.testName,
      testProcedure: input.testProcedure ?? null,
      scheduledDate: input.scheduledDate,
      completedDate: input.completedDate ?? null,
      testerId: input.testerId ?? null,
      status: input.status ?? 'scheduled',
      result: input.result ?? null,
      findings: input.findings ?? null,
      evidenceIds: input.evidenceIds ?? [],
      createdBy: input.createdBy ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.complianceTests.push(test);
    return test;
  }

  async updateComplianceTest(id: string, input: any): Promise<any | undefined> {
    const test = this.complianceTests.find((t) => t.id === id);
    if (!test) return undefined;
    Object.assign(test, input, { updatedAt: new Date().toISOString() });
    return test;
  }

  async deleteComplianceTest(id: string): Promise<void> {
    const index = this.complianceTests.findIndex((t) => t.id === id);
    if (index >= 0) this.complianceTests.splice(index, 1);
  }

  // Findings
  async listComplianceFindings(tenantId: string, filters?: {
    assessmentId?: string;
    severity?: string;
    status?: string;
  }): Promise<any[]> {
    return this.complianceFindings.filter((finding) => {
      if (finding.tenantId !== tenantId) return false;
      if (filters?.assessmentId && finding.assessmentId !== filters.assessmentId) return false;
      if (filters?.severity && finding.severity !== filters.severity) return false;
      if (filters?.status && finding.status !== filters.status) return false;
      return true;
    });
  }

  async getComplianceFinding(id: string): Promise<any | undefined> {
    return this.complianceFindings.find((finding) => finding.id === id);
  }

  async createComplianceFinding(input: any): Promise<any> {
    const now = new Date().toISOString();
    const finding = {
      id: randomUUID(),
      tenantId: input.tenantId,
      assessmentId: input.assessmentId ?? null,
      requirementId: input.requirementId ?? null,
      controlId: input.controlId ?? null,
      findingNumber: input.findingNumber,
      title: input.title,
      description: input.description,
      severity: input.severity,
      status: input.status ?? 'open',
      identifiedDate: input.identifiedDate ?? now,
      dueDate: input.dueDate ?? null,
      closedDate: input.closedDate ?? null,
      closedBy: input.closedBy ?? null,
      closureNotes: input.closureNotes ?? null,
      createdBy: input.createdBy ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.complianceFindings.push(finding);
    return finding;
  }

  async updateComplianceFinding(id: string, input: any): Promise<any | undefined> {
    const finding = this.complianceFindings.find((f) => f.id === id);
    if (!finding) return undefined;
    Object.assign(finding, input, { updatedAt: new Date().toISOString() });
    return finding;
  }

  async deleteComplianceFinding(id: string): Promise<void> {
    const index = this.complianceFindings.findIndex((f) => f.id === id);
    if (index >= 0) this.complianceFindings.splice(index, 1);
  }

  async closeComplianceFinding(id: string, closedBy: string, notes?: string): Promise<any | undefined> {
    const finding = this.complianceFindings.find((f) => f.id === id);
    if (!finding) return undefined;
    finding.status = 'closed';
    finding.closedDate = new Date().toISOString();
    finding.closedBy = closedBy;
    finding.closureNotes = notes ?? null;
    finding.updatedAt = new Date().toISOString();
    return finding;
  }

  // Remediation Plans
  async listRemediationPlans(tenantId: string, filters?: {
    findingId?: string;
    status?: string;
  }): Promise<any[]> {
    return this.remediationPlans.filter((plan) => {
      if (plan.tenantId !== tenantId) return false;
      if (filters?.findingId && plan.findingId !== filters.findingId) return false;
      if (filters?.status && plan.status !== filters.status) return false;
      return true;
    });
  }

  async getRemediationPlan(id: string): Promise<any | undefined> {
    return this.remediationPlans.find((plan) => plan.id === id);
  }

  async createRemediationPlan(input: any): Promise<any> {
    const now = new Date().toISOString();
    const plan = {
      id: randomUUID(),
      tenantId: input.tenantId,
      findingId: input.findingId,
      planName: input.planName,
      description: input.description ?? null,
      owner: input.owner ?? null,
      targetCompletionDate: input.targetCompletionDate,
      status: input.status ?? 'draft',
      approvedBy: input.approvedBy ?? null,
      approvedAt: input.approvedAt ?? null,
      verifiedBy: input.verifiedBy ?? null,
      verifiedAt: input.verifiedAt ?? null,
      verificationNotes: input.verificationNotes ?? null,
      effectivenessConfirmed: input.effectivenessConfirmed ?? false,
      createdBy: input.createdBy ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.remediationPlans.push(plan);
    return plan;
  }

  async updateRemediationPlan(id: string, input: any): Promise<any | undefined> {
    const plan = this.remediationPlans.find((p) => p.id === id);
    if (!plan) return undefined;
    Object.assign(plan, input, { updatedAt: new Date().toISOString() });
    return plan;
  }

  async deleteRemediationPlan(id: string): Promise<void> {
    const index = this.remediationPlans.findIndex((p) => p.id === id);
    if (index >= 0) this.remediationPlans.splice(index, 1);
  }

  async approveRemediationPlan(id: string, approverId: string): Promise<any | undefined> {
    const plan = this.remediationPlans.find((p) => p.id === id);
    if (!plan) return undefined;
    plan.status = 'approved';
    plan.approvedBy = approverId;
    plan.approvedAt = new Date().toISOString();
    plan.updatedAt = new Date().toISOString();
    return plan;
  }

  async verifyRemediationPlan(id: string, verifierId: string, input: {
    verificationNotes?: string;
    effectivenessConfirmed: boolean;
  }): Promise<any | undefined> {
    const plan = this.remediationPlans.find((p) => p.id === id);
    if (!plan) return undefined;
    plan.status = 'verified';
    plan.verifiedBy = verifierId;
    plan.verifiedAt = new Date().toISOString();
    plan.verificationNotes = input.verificationNotes ?? null;
    plan.effectivenessConfirmed = input.effectivenessConfirmed;
    plan.updatedAt = new Date().toISOString();
    return plan;
  }

  // Remediation Actions
  async listRemediationActions(planId: string): Promise<any[]> {
    return this.remediationActions.filter((action) => action.planId === planId);
  }

  async getRemediationAction(id: string): Promise<any | undefined> {
    return this.remediationActions.find((action) => action.id === id);
  }

  async createRemediationAction(input: any): Promise<any> {
    const now = new Date().toISOString();
    const action = {
      id: randomUUID(),
      planId: input.planId,
      actionName: input.actionName,
      description: input.description ?? null,
      assignedTo: input.assignedTo ?? null,
      dueDate: input.dueDate,
      status: input.status ?? 'pending',
      completedDate: input.completedDate ?? null,
      evidenceUrl: input.evidenceUrl ?? null,
      notes: input.notes ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.remediationActions.push(action);
    return action;
  }

  async updateRemediationAction(id: string, input: any): Promise<any | undefined> {
    const action = this.remediationActions.find((a) => a.id === id);
    if (!action) return undefined;
    Object.assign(action, input, { updatedAt: new Date().toISOString() });
    return action;
  }

  async deleteRemediationAction(id: string): Promise<void> {
    const index = this.remediationActions.findIndex((a) => a.id === id);
    if (index >= 0) this.remediationActions.splice(index, 1);
  }

  async completeRemediationAction(id: string, input: {
    evidenceUrl?: string;
    notes?: string;
  }): Promise<any | undefined> {
    const action = this.remediationActions.find((a) => a.id === id);
    if (!action) return undefined;
    action.status = 'completed';
    action.completedDate = new Date().toISOString();
    action.evidenceUrl = input.evidenceUrl ?? action.evidenceUrl;
    action.notes = input.notes ?? action.notes;
    action.updatedAt = new Date().toISOString();
    return action;
  }

  // Risks
  async listComplianceRisks(tenantId: string, filters?: {
    frameworkId?: string;
    category?: string;
    status?: string;
  }): Promise<any[]> {
    return this.complianceRisks.filter((risk) => {
      if (risk.tenantId !== tenantId) return false;
      if (filters?.frameworkId && risk.frameworkId !== filters.frameworkId) return false;
      if (filters?.category && risk.category !== filters.category) return false;
      if (filters?.status && risk.status !== filters.status) return false;
      return true;
    });
  }

  async getComplianceRisk(id: string): Promise<any | undefined> {
    return this.complianceRisks.find((risk) => risk.id === id);
  }

  async createComplianceRisk(input: any): Promise<any> {
    const now = new Date().toISOString();
    const risk = {
      id: randomUUID(),
      tenantId: input.tenantId,
      frameworkId: input.frameworkId ?? null,
      requirementId: input.requirementId ?? null,
      riskName: input.riskName,
      description: input.description ?? null,
      category: input.category ?? null,
      inherentLikelihood: input.inherentLikelihood,
      inherentImpact: input.inherentImpact,
      residualLikelihood: input.residualLikelihood ?? null,
      residualImpact: input.residualImpact ?? null,
      treatmentPlan: input.treatmentPlan ?? null,
      owner: input.owner ?? null,
      status: input.status ?? 'identified',
      lastReviewDate: input.lastReviewDate ?? null,
      nextReviewDate: input.nextReviewDate ?? null,
      reviewNotes: input.reviewNotes ?? null,
      createdBy: input.createdBy ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.complianceRisks.push(risk);
    return risk;
  }

  async updateComplianceRisk(id: string, input: any): Promise<any | undefined> {
    const risk = this.complianceRisks.find((r) => r.id === id);
    if (!risk) return undefined;
    Object.assign(risk, input, { updatedAt: new Date().toISOString() });
    return risk;
  }

  async deleteComplianceRisk(id: string): Promise<void> {
    const index = this.complianceRisks.findIndex((r) => r.id === id);
    if (index >= 0) this.complianceRisks.splice(index, 1);
  }

  async assessComplianceRisk(id: string, input: {
    residualLikelihood: string;
    residualImpact: string;
    treatmentPlan?: string;
  }): Promise<any | undefined> {
    const risk = this.complianceRisks.find((r) => r.id === id);
    if (!risk) return undefined;
    risk.residualLikelihood = input.residualLikelihood;
    risk.residualImpact = input.residualImpact;
    risk.treatmentPlan = input.treatmentPlan ?? risk.treatmentPlan;
    risk.status = 'assessed';
    risk.updatedAt = new Date().toISOString();
    return risk;
  }

  async reviewComplianceRisk(id: string, input: {
    reviewNotes?: string;
    nextReviewDate: string;
  }): Promise<any | undefined> {
    const risk = this.complianceRisks.find((r) => r.id === id);
    if (!risk) return undefined;
    risk.lastReviewDate = new Date().toISOString();
    risk.nextReviewDate = input.nextReviewDate;
    risk.reviewNotes = input.reviewNotes ?? risk.reviewNotes;
    risk.updatedAt = new Date().toISOString();
    return risk;
  }

  // Dashboard & Reporting
  async getComplianceDashboard(tenantId: string, frameworkId?: string): Promise<any> {
    const requirements = this.complianceRequirements.filter((r) => 
      r.tenantId === tenantId && (!frameworkId || r.frameworkId === frameworkId)
    );
    const controls = this.complianceControls.filter((c) => 
      c.tenantId === tenantId
    );
    const findings = this.complianceFindings.filter((f) => 
      f.tenantId === tenantId && f.status === 'open'
    );
    const risks = this.complianceRisks.filter((r) => 
      r.tenantId === tenantId && (!frameworkId || r.frameworkId === frameworkId)
    );

    return {
      totalRequirements: requirements.length,
      implementedControls: controls.filter((c) => c.implementationStatus === 'implemented').length,
      totalControls: controls.length,
      openFindings: findings.length,
      criticalFindings: findings.filter((f) => f.severity === 'critical').length,
      highRisks: risks.filter((r) => r.status === 'identified' && r.inherentImpact === 'high').length,
      complianceScore: controls.length > 0 
        ? Math.round((controls.filter((c) => c.implementationStatus === 'implemented').length / controls.length) * 100)
        : 0,
    };
  }

  async getRequirementStatus(id: string): Promise<any> {
    const requirement = this.complianceRequirements.find((r) => r.id === id);
    if (!requirement) return undefined;

    const controls = this.complianceControls.filter((c) => c.requirementId === id);
    const evidence = this.complianceEvidence.filter((e) => e.requirementId === id);

    return {
      requirement,
      totalControls: controls.length,
      implementedControls: controls.filter((c) => c.implementationStatus === 'implemented').length,
      totalEvidence: evidence.length,
      validatedEvidence: evidence.filter((e) => e.validated).length,
    };
  }

  async getFrameworkCoverage(id: string): Promise<any> {
    const requirements = this.complianceRequirements.filter((r) => r.frameworkId === id);
    const controls = this.complianceControls.filter((c) => 
      requirements.some((r) => r.id === c.requirementId)
    );

    const categories = [...new Set(requirements.map((r) => r.category))];
    const coverageByCategory = categories.map((category) => {
      const categoryReqs = requirements.filter((r) => r.category === category);
      const categoryControls = controls.filter((c) => 
        categoryReqs.some((r) => r.id === c.requirementId)
      );
      return {
        category,
        totalRequirements: categoryReqs.length,
        implementedControls: categoryControls.filter((c) => c.implementationStatus === 'implemented').length,
        totalControls: categoryControls.length,
      };
    });

    return {
      frameworkId: id,
      totalRequirements: requirements.length,
      totalControls: controls.length,
      implementedControls: controls.filter((c) => c.implementationStatus === 'implemented').length,
      coverageByCategory,
    };
  }

  async getComplianceAuditLog(tenantId: string, filters?: {
    entityType?: string;
    entityId?: string;
    action?: string;
    from?: string;
    to?: string;
    limit?: number;
  }): Promise<any[]> {
    return this.complianceAuditLog.filter((log) => {
      if (log.tenantId !== tenantId) return false;
      if (filters?.entityType && log.entityType !== filters.entityType) return false;
      if (filters?.entityId && log.entityId !== filters.entityId) return false;
      if (filters?.action && log.action !== filters.action) return false;
      if (filters?.from && log.createdAt < filters.from) return false;
      if (filters?.to && log.createdAt > filters.to) return false;
      return true;
    }).slice(0, filters?.limit ?? 100);
  }

  // Operational Alert Event methods
  async recordOperationalAlertEvent(event: {
    id: string | undefined;
    alertId: string;
    tenantId: string;
    branchId?: string;
    eventType: string;
    actorType: string;
    actorUserId?: string;
    actorUserName?: string;
    actorService?: string;
    targetUserId?: string;
    targetUserName?: string;
    previousStatus?: string;
    newStatus?: string;
    metadata?: Record<string, unknown>;
    requestId?: string;
    correlationId?: string;
    sessionId?: string;
    ipAddress?: string;
    userAgent?: string;
    occurredAt: Date;
    createdAt: Date;
  }): Promise<void> {
    // Store in generic storage (could add dedicated array if needed)
    console.debug(`Recorded operational alert event: ${event.eventType} for alert ${event.alertId}`);
  }

  async listOperationalAlertEvents(
    alertId: string,
    tenantId: string
  ): Promise<any[]> {
    // Return empty array for now (would need dedicated storage)
    return [];
  }

  // Missing methods from ControlPlaneStore interface
  async updateLiveIncidentStatus(id: string, tenantId: string, cameraId: string, status: any): Promise<any> {
    const incident = this.liveIncidents.find(i => i.id === id && i.tenantId === tenantId && i.cameraId === cameraId);
    if (!incident) return undefined;
    incident.status = status;
    incident.updatedAt = new Date().toISOString();
    return incident;
  }

  async listAnalyticsRules(cameraId: string): Promise<AnalyticsRule[]> {
    return this.analyticsRules.filter(rule => rule.cameraId === cameraId);
  }

  async listAnalyticsRulesByCameraIds(cameraIds: string[]): Promise<AnalyticsRule[]> {
    const ids = new Set(cameraIds);
    return this.analyticsRules.filter((rule) => ids.has(rule.cameraId));
  }

  async listAlertNotificationsByAlertIds(tenantId: string, alertIds: string[]): Promise<AlertNotification[]> {
    const ids = new Set(alertIds);
    return this.analyticsNotifications
      .filter((item) => item.tenantId === tenantId && ids.has(item.alertId))
      .map((item) => structuredClone(item));
  }

  async listAmcContracts(tenantId: string, vendorId?: string): Promise<AmcContract[]> {
    return this.amcContracts.filter(contract => 
      contract.tenantId === tenantId && (!vendorId || contract.vendorId === vendorId)
    );
  }

  async getAmcContract(id: string): Promise<AmcContract | undefined> {
    return this.amcContracts.find(contract => contract.id === id);
  }

  async updateAmcContract(id: string, input: any): Promise<AmcContract | undefined> {
    const contract = this.amcContracts.find(c => c.id === id);
    if (!contract) return undefined;
    Object.assign(contract, input, { updatedAt: new Date().toISOString() });
    return contract;
  }

  async createMaintenanceSchedule(input: any): Promise<any> {
    const now = new Date().toISOString();
    const schedule = {
      id: randomUUID(),
      tenantId: input.tenantId,
      planId: input.planId,
      assetId: input.assetId,
      dueAt: input.dueAt,
      status: input.status ?? 'pending',
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    };
    this.maintenanceSchedules.push(schedule);
    return schedule;
  }

  async listMaintenanceSchedules(tenantId: string): Promise<any[]> {
    return this.maintenanceSchedules.filter(s => s.tenantId === tenantId);
  }

  async createMaintenanceVisit(input: any): Promise<any> {
    const now = new Date().toISOString();
    const visit = {
      id: randomUUID(),
      tenantId: input.tenantId,
      scheduleId: input.scheduleId,
      assetId: input.assetId,
      dueAt: input.dueAt,
      status: input.status ?? 'pending',
      visitedAt: input.visitedAt,
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    };
    this.maintenanceVisits.push(visit);
    return visit;
  }

  async listMaintenanceVisits(tenantId: string): Promise<any[]> {
    return this.maintenanceVisits.filter(v => v.tenantId === tenantId);
  }

  async createPredictiveAlert(input: any): Promise<any> {
    const now = new Date().toISOString();
    const alert = {
      id: randomUUID(),
      tenantId: input.tenantId,
      assetId: input.assetId,
      alertType: input.alertType,
      score: input.score,
      predictedFailureDate: input.predictedFailureDate,
      createdAt: now,
      updatedAt: now,
    };
    this.predictiveAlerts.push(alert);
    return alert;
  }

  async listPredictiveAlerts(tenantId: string): Promise<any[]> {
    return this.predictiveAlerts.filter(a => a.tenantId === tenantId);
  }

  async updateMaintenanceVisit(id: string, input: any): Promise<any | undefined> {
    const visit = this.maintenanceVisits.find(v => v.id === id);
    if (!visit) return undefined;
    Object.assign(visit, input, { updatedAt: new Date().toISOString() });
    return visit;
  }

  async ingestPredictiveAlert(input: { 
    tenantId: string; 
    assetId?: string; 
    type: string; 
    score: number; 
    details?: Record<string, unknown>; 
    detectedAt: string; 
  }): Promise<any> {
    const now = new Date().toISOString();
    const alert = {
      id: randomUUID(),
      tenantId: input.tenantId,
      assetId: input.assetId,
      type: input.type,
      score: input.score,
      details: input.details ?? {},
      detectedAt: input.detectedAt,
      createdAt: now,
      updatedAt: now,
    };
    this.predictiveAlerts.push(alert);
    return alert;
  }

  // Evidence Management Methods
  readonly evidenceCases: any[] = [];
  readonly evidenceItems: any[] = [];
  readonly custodyEvents: any[] = [];
  readonly evidenceExports: any[] = [];
  readonly evidenceManifests: any[] = [];
  readonly evidenceLegalHolds: any[] = [];

  async verifyRecordingSegment(segmentId: string): Promise<{ status: "verified" | "mismatch" | "missing"; hash?: string }> {
    const segment = await this.getRecordingSegment(segmentId);
    if (!segment) return { status: "missing" };
    if (segment.checksumSha256) {
      return { status: "verified", hash: segment.checksumSha256 };
    }
    return { status: "missing" };
  }

  async createEvidenceCase(input: any): Promise<any> {
    const now = new Date().toISOString();
    const caseRecord = {
      id: randomUUID(),
      tenantId: input.tenantId,
      caseNumber: input.caseNumber,
      title: input.title,
      description: input.description,
      status: "open",
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    };
    this.evidenceCases.push(caseRecord);
    return caseRecord;
  }

  async getEvidenceCase(id: string): Promise<any | undefined> {
    return this.evidenceCases.find(c => c.id === id);
  }

  async listEvidenceCases(tenantId: string, filters?: any): Promise<any[]> {
    return this.evidenceCases.filter(c => 
      c.tenantId === tenantId && (!filters?.status || c.status === filters.status)
    ).slice(0, filters?.limit ?? 100);
  }

  async updateEvidenceCaseStatus(id: string, status: any): Promise<any> {
    const caseRecord = this.evidenceCases.find(c => c.id === id);
    if (!caseRecord) return undefined;
    caseRecord.status = status;
    caseRecord.updatedAt = new Date().toISOString();
    return caseRecord;
  }

  async addEvidenceItem(caseId: string, input: any): Promise<any> {
    const now = new Date().toISOString();
    const item = {
      id: randomUUID(),
      caseId,
      type: input.type,
      cameraId: input.cameraId,
      startTime: input.startTime,
      endTime: input.endTime,
      recordingSegmentId: input.recordingSegmentId,
      description: input.description,
      addedBy: input.addedBy,
      hash: input.hash,
      fileSize: input.fileSize,
      createdAt: now,
    };
    this.evidenceItems.push(item);
    return item;
  }

  async listEvidenceItems(caseId: string): Promise<any[]> {
    return this.evidenceItems.filter(item => item.caseId === caseId);
  }

  async recordCustodyEvent(input: {
    evidenceId?: string;
    action: string;
    performedBy: string;
    sourceIp?: string;
    reason?: string;
  }): Promise<any> {
    const now = new Date().toISOString();
    const event = {
      id: randomUUID(),
      evidenceId: input.evidenceId,
      action: input.action,
      performedBy: input.performedBy,
      sourceIp: input.sourceIp,
      reason: input.reason,
      occurredAt: now,
    };
    this.custodyEvents.push(event);
    return event;
  }

  async getCustodyLog(evidenceId: string): Promise<any[]> {
    return this.custodyEvents.filter(event => event.evidenceId === evidenceId);
  }

  async createLegalHold(input: any): Promise<any> {
    const now = new Date().toISOString();
    const hold = {
      id: randomUUID(),
      caseNumber: input.caseNumber,
      reason: input.reason,
      requestedBy: input.requestedBy,
      cameraIds: input.cameraIds,
      startTime: input.startTime,
      endTime: input.endTime,
      reviewDate: input.reviewDate,
      expiryDate: input.expiryDate,
      createdAt: now,
    };
    this.evidenceLegalHolds.push(hold);
    return hold;
  }

  async releaseLegalHold(holdId: string, releasedBy: string): Promise<any | undefined> {
    const hold = this.evidenceLegalHolds.find(h => h.id === holdId);
    if (!hold) return undefined;
    hold.releasedBy = releasedBy;
    hold.releasedAt = new Date().toISOString();
    return hold;
  }

  async getEvidenceExport(exportId: string): Promise<any | undefined> {
    return this.evidenceExports.find(e => e.id === exportId);
  }

  async getEvidenceManifest(manifestId: string): Promise<any | undefined> {
    return this.evidenceManifests.find(m => m.id === manifestId);
  }

  // Device Inventory Management
  private readonly deviceInventory: any[] = [];

  async listDeviceInventory(tenantId: string, branchNodeId?: string): Promise<any[]> {
    return this.deviceInventory.filter(d => 
      d.tenantId === tenantId && (!branchNodeId || d.branch === branchNodeId)
    );
  }

  async getDeviceInventory(id: string): Promise<any | null> {
    return this.deviceInventory.find(d => d.id === id) ?? null;
  }

  async createDeviceInventoryRecord(input: any): Promise<any> {
    const record = {
      id: randomUUID(),
      ...input,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.deviceInventory.push(record);
    return record;
  }
}


function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
