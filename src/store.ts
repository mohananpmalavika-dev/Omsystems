import { createHash, randomBytes, randomUUID } from "node:crypto";
import type {
  AccessGrant,
  Action,
  AnalyticsAlert,
  AnalyticsEvent,
  AnalyticsRule,
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
  EdgeAgent,
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
import type {
  CameraApprovalInput,
  CameraDiscoveryInput,
  ControlPlaneStore,
  MaintenanceAssetInput,
  WorkOrderInput,
  MaintenanceVendorInput,
  AmcContractInput,
  ComplianceAssessmentFilters,
} from "./control-plane-store.js";
import { IncidentManagementMethods } from "./store-incident-extensions.js";

function clean<T extends Record<string, any>>(obj: T) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
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
  "live:view", "recording:view", "alarm:acknowledge",
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
      "live:view", "recording:view", "evidence:export", "ptz:operate", "alarm:acknowledge", 
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
      "live:view", "recording:view", 
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
    id: "cam-001", nodeId: "camera-entrance", branchId: "branch-blr-001",
    name: "Main Entrance",
    vendor: "hikvision", model: "DS-2CD example", channel: 1,
    protocol: "onvif-t", status: "online",
    profiles: [{ name: "main", codec: "H264", width: 1920, height: 1080 }],
    capabilities: { ptz: false, audio: true, events: true },
    connectionSecretRef: "vault://branches/blr-001/cameras/001",
  },
  {
    id: "cam-002", nodeId: "camera-cash-room", branchId: "branch-blr-001",
    name: "Cash Room",
    vendor: "cp-plus", model: "CP-UNC example", channel: 2,
    protocol: "onvif-s", status: "degraded",
    profiles: [{ name: "main", codec: "H264", width: 1920, height: 1080 }],
    capabilities: { ptz: false, audio: false, events: true },
    connectionSecretRef: "vault://branches/blr-001/cameras/002",
  },
];

export class MemoryStore implements ControlPlaneStore {
  readonly nodes = new Map(seedNodes.map((node) => [node.id, structuredClone(node)]));
  readonly users = new Map(seedUsers.map((user) => [user.id, structuredClone(user)]));
  readonly cameras = new Map(seedCameras.map((camera) => [camera.id, structuredClone(camera)]));
  readonly grants = structuredClone(seedGrants);
  readonly edgeAgents = new Map<string, EdgeAgent>();
  readonly edgeScanJobs = new Map<string, EdgeScanJob>();
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
  readonly analyticsNotifications: Array<Record<string, unknown>> = [];
  readonly maintenanceAssets: any[] = [];
  readonly workOrders: any[] = [];
  readonly maintenanceVendors: any[] = [];
  readonly amcContracts: any[] = [];
  readonly maintenancePlans: any[] = [];
  readonly maintenanceSchedules: any[] = [];
  readonly maintenanceVisits: any[] = [];
  readonly predictiveAlerts: any[] = [];
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

  async listCamerasByBranch(user: User, branchId: string, action: Action) {
    return [...this.cameras.values()].filter((camera) => {
      if (camera.branchId !== branchId) return false;
      const node = this.nodes.get(camera.nodeId);
      return Boolean(node && authorize(user, action, node, this.nodes, this.grants).allowed);
    });
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

  async createEdgeScanJob(branchId: string, edgeAgentId?: string) {
    const agent = edgeAgentId
      ? this.edgeAgents.get(edgeAgentId)
      : [...this.edgeAgents.values()].find((item) => item.branchId === branchId);
    if (!agent || agent.branchId !== branchId) throw new Error("edge_agent_not_found");
    const job: EdgeScanJob = {
      id: randomUUID(), branchId, edgeAgentId: agent.id, status: "queued",
      requestedAt: new Date().toISOString(), startedAt: null, completedAt: null,
      resultCount: 0, error: null,
    };
    this.edgeScanJobs.set(job.id, job);
    return job;
  }

  async getEdgeScanJob(branchId: string, jobId: string) {
    const job = this.edgeScanJobs.get(jobId);
    return job?.branchId === branchId ? job : undefined;
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
    result: { status: "completed" | "failed"; resultCount: number; error?: string },
  ) {
    const job = this.edgeScanJobs.get(jobId);
    if (!job || job.edgeAgentId !== edgeAgentId || job.status !== "running") return undefined;
    Object.assign(job, {
      status: result.status,
      resultCount: result.resultCount,
      error: result.error ?? null,
      completedAt: new Date().toISOString(),
    });
    return job;
  }

  async createDiscovery(branchId: string, input: CameraDiscoveryInput) {
    const agent = this.edgeAgents.get(input.edgeAgentId);
    if (!agent || agent.branchId !== branchId) throw new Error("invalid_edge_agent");
    const existing = [...this.discoveries.values()].find((item) =>
      item.edgeAgentId === input.edgeAgentId &&
      item.ipAddress === input.ipAddress &&
      item.onvifPort === input.onvifPort
    );
    if (existing) {
      Object.assign(existing, structuredClone(input), {
        discoveredAt: new Date().toISOString(),
      });
      return existing;
    }
    const discovery: DiscoveredCamera = {
      id: randomUUID(), branchId, ...structuredClone(input),
      status: "pending", discoveredAt: new Date().toISOString(),
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

  async approveCamera(branchId: string, input: CameraApprovalInput) {
    const discovery = this.discoveries.get(input.discoveryId);
    const branch = this.nodes.get(branchId);
    if (!discovery || discovery.branchId !== branchId || !branch) return undefined;
    const nodeId = randomUUID();
    this.nodes.set(nodeId, {
      id: nodeId, tenantId: branch.tenantId, parentId: branchId, type: "camera",
      name: input.name, path: [...branch.path, nodeId],
    });
    const camera: Camera = {
      id: randomUUID(), name: input.name, nodeId, branchId, vendor: discovery.vendor,
      model: discovery.model, channel: input.channel, protocol: input.protocol,
      status: "unknown", profiles: discovery.profiles,
      capabilities: discovery.capabilities,
      edgeAgentId: discovery.edgeAgentId,
      connectionSecretRef: input.connectionSecretRef,
    };
    discovery.status = "approved";
    this.cameras.set(camera.id, camera);
    return camera;
  }

  async updateCameraStatus(id: string, status: CameraStatus) {
    const camera = this.cameras.get(id);
    if (!camera) return undefined;
    camera.status = status;
    return camera;
  }

  async createLiveSession(cameraId: string, userId: string): Promise<LiveSession> {
    const camera = this.cameras.get(cameraId);
    const mediaGatewayUrl = camera?.edgeAgentId
      ? this.edgeAgents.get(camera.edgeAgentId)?.publicMediaUrl
      : undefined;
    const session = {
      id: randomUUID(), cameraId, userId,
      token: randomBytes(32).toString("base64url"),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
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
    };
  }

  async getRecordingJob(cameraId: string) {
    return this.recordingJobs.get(cameraId);
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

  async createMaintenanceSchedule(input: { tenantId: string; planId: string; branchNodeId?: string; assetId?: string; nextRunAt: string; cadence: string; createdBy: string; }) {
    const now = new Date().toISOString();
    const sched = { id: randomUUID(), tenantId: input.tenantId, planId: input.planId, branchNodeId: input.branchNodeId, assetId: input.assetId, nextRunAt: input.nextRunAt, cadence: input.cadence, createdBy: input.createdBy, createdAt: now, updatedAt: now };
    this.maintenanceSchedules.push(sched);
    return sched;
  }

  async listMaintenanceSchedules(tenantId: string) {
    return this.maintenanceSchedules.filter((s) => s.tenantId === tenantId);
  }

  async createMaintenanceVisit(input: { tenantId: string; scheduleId: string; assignedTo?: string; dueAt: string; status?: string; createdBy: string; }) {
    const now = new Date().toISOString();
    const visit = { id: randomUUID(), tenantId: input.tenantId, scheduleId: input.scheduleId, assignedTo: input.assignedTo, dueAt: input.dueAt, status: input.status ?? 'pending', createdBy: input.createdBy, createdAt: now, updatedAt: now };
    this.maintenanceVisits.push(visit);
    return visit;
  }

  async listMaintenanceVisits(tenantId: string, filters?: any) {
    return this.maintenanceVisits.filter((v) => v.tenantId === tenantId && (!filters?.status || v.status === filters.status));
  }

  async updateMaintenanceVisit(id: string, input: any) {
    const visit = this.maintenanceVisits.find((v) => v.id === id);
    if (!visit) return undefined;
    Object.assign(visit, input, { updatedAt: new Date().toISOString() });
    return visit;
  }

  async ingestPredictiveAlert(input: { tenantId: string; assetId?: string; type: string; score: number; details?: Record<string, unknown>; detectedAt: string; }) {
    const now = new Date().toISOString();
    const rec = { id: randomUUID(), tenantId: input.tenantId, assetId: input.assetId, type: input.type, score: input.score, details: input.details ?? {}, detectedAt: input.detectedAt, createdAt: now };
    this.predictiveAlerts.push(rec);
    return rec;
  }

  async listPredictiveAlerts(tenantId: string) {
    return this.predictiveAlerts.filter((p) => p.tenantId === tenantId).sort((a,b)=>b.detectedAt.localeCompare(a.detectedAt));
  }

  async listAmcContracts(tenantId: string, vendorId?: string) {
    return this.amcContracts.filter((contract) => contract.tenantId === tenantId && (!vendorId || contract.vendorId === vendorId));
  }

  async getAmcContract(id: string) {
    return this.amcContracts.find((contract) => contract.id === id);
  }

  async updateAmcContract(id: string, input: Parameters<ControlPlaneStore["updateAmcContract"]>[1]) {
    const contract = this.amcContracts.find((item) => item.id === id);
    if (!contract) return undefined;
    Object.assign(contract, {
      ...input,
      updatedAt: new Date().toISOString(),
    });
    return contract;
  }

  async updateLiveIncidentStatus(
    id: string,
    inputTenantId: string,
    cameraId: string,
    status: LiveIncident["status"],
  ) {
    const incident = this.liveIncidents.find((item) =>
      item.id === id && item.tenantId === inputTenantId &&
      item.cameraId === cameraId
    );
    if (!incident) return undefined;
    incident.status = status;
    incident.updatedAt = new Date().toISOString();
    return incident;
  }

  async listAnalyticsRules(cameraId: string) {
    return this.analyticsRules
      .filter((rule) => rule.cameraId === cameraId)
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  async createAnalyticsRule(
    inputTenantId: string,
    cameraId: string,
    createdBy: string,
    input: Parameters<ControlPlaneStore["createAnalyticsRule"]>[3],
  ) {
    const camera = this.cameras.get(cameraId);
    const node = camera ? this.nodes.get(camera.nodeId) : undefined;
    if (!camera || node?.tenantId !== inputTenantId) throw new Error("camera_not_found");
    const now = new Date().toISOString();
    const rule: AnalyticsRule = {
      id: randomUUID(), tenantId: inputTenantId, cameraId, createdBy,
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
        recent.updatedAt = now;
        alerts.push(recent);
        continue;
      }
      const alert: AnalyticsAlert = {
        id: randomUUID(), tenantId: input.tenantId, cameraId: input.cameraId,
        ruleId: rule.id, eventId, title: analyticsAlertTitle(rule),
        description: `Rule \"${rule.name}\" matched on camera ${camera.name}.`,
        severity: rule.severity, status: "new", confidence: input.confidence,
        objectClasses: [...new Set(input.objects.map((object) => object.label))],
        modelVersion: input.modelVersion,
        ...(input.snapshotReference ? { snapshotReference: input.snapshotReference } : {}),
        ...(input.clipReference ? { clipReference: input.clipReference } : {}),
        firstDetectedAt: input.occurredAt, lastDetectedAt: input.occurredAt,
        occurrenceCount: 1, createdAt: now, updatedAt: now,
      };
      this.analyticsAlerts.push(alert);
      alerts.push(alert);
      created += 1;
      for (const recipient of rule.recipients) {
        this.analyticsNotifications.push({
          id: randomUUID(), alertId: alert.id, recipient, channel: "configured",
          status: "queued", createdAt: now,
        });
      }
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

  async getAnalyticsAlert(id: string, inputTenantId: string) {
    return this.analyticsAlerts.find((alert) =>
      alert.id === id && alert.tenantId === inputTenantId
    );
  }

  async transitionAnalyticsAlert(
    id: string,
    inputTenantId: string,
    input: Parameters<ControlPlaneStore["transitionAnalyticsAlert"]>[2],
  ) {
    const alert = await this.getAnalyticsAlert(id, inputTenantId);
    if (!alert) return undefined;
    if (isTerminalAlertStatus(alert.status) && alert.status !== input.status) {
      throw new Error("invalid_alert_transition");
    }
    const now = new Date().toISOString();
    alert.status = input.status;
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
    if (input.status === "resolved") alert.resolvedAt = now;
    if (input.status === "false_alarm") alert.falseAlarmReason = input.falseAlarmReason;
    return alert;
  }

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
}


function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
