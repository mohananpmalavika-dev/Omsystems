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
];

const operatorActions: Action[] = [
  "live:view", "recording:view", "alarm:acknowledge",
  "analytics:view", "alerts:acknowledge",
];
const seedGrants: AccessGrant[] = [
  { userId: "user-global-admin", scopeNodeId: "company-1", actions: ["live:view", "recording:view", "evidence:export", "ptz:operate", "alarm:acknowledge", "device:configure", "user:manage", "audit:view", "org:manage", "analytics:view", "analytics:configure", "alerts:acknowledge", "alerts:escalate", "analytics:export"], effect: "allow" },
  { userId: "user-south-operator", scopeNodeId: "region-south", actions: operatorActions, effect: "allow" },
  { userId: "user-branch-manager", scopeNodeId: "branch-blr-001", actions: ["live:view", "recording:view", "analytics:view", "analytics:configure", "alerts:acknowledge", "alerts:escalate", "analytics:export"], effect: "allow" },
  { userId: "user-branch-manager", scopeNodeId: "group-sensitive-blr-001", actions: ["live:view", "recording:view", "analytics:view", "analytics:configure", "alerts:acknowledge", "alerts:escalate", "analytics:export"], effect: "deny" },
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
  readonly incidents: any[] = [];
  readonly incidentEvents: any[] = [];
  readonly incidentVideoRanges: any[] = [];
  readonly incidentCameras: any[] = [];
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

  async heartbeatEdgeAgent(id: string, version: string) {
    const agent = this.edgeAgents.get(id);
    if (!agent) return undefined;
    Object.assign(agent, { version, status: "online" as const, lastSeenAt: new Date().toISOString() });
    return agent;
  }

  async createDiscovery(branchId: string, input: CameraDiscoveryInput) {
    const agent = this.edgeAgents.get(input.edgeAgentId);
    if (!agent || agent.branchId !== branchId) throw new Error("invalid_edge_agent");
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
    const session = {
      id: randomUUID(), cameraId, userId,
      token: randomBytes(32).toString("base64url"),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
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
    temperatureCelsius?: number | undefined; writeMbps?: number | undefined;
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
      if (!node || node.tenantId !== inputTenantId || !job ||
          !job.automaticDeletionEnabled || segment.status !== "ready" ||
          segment.storageNodeExternalId !== storageNodeExternalId ||
          Date.parse(segment.endedAt) >= now - job.retentionDays * 86_400_000) return false;
      return !this.recordingLegalHolds.some((hold) =>
        hold.cameraId === segment.cameraId && !hold.releasedAt &&
        hold.fromAt < segment.endedAt && hold.toAt > segment.startedAt
      );
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

  // Incident management (investigation)
  async createIncident(input: {
    tenantId: string;
    incidentNumber: string;
    title: string;
    description?: string;
    incidentType?: string;
    severity?: string;
    branchId?: string;
    occurredAt?: string;
    reportedBy?: string;
  }) {
    const now = new Date().toISOString();
    const incident = {
      id: randomUUID(),
      tenantId: input.tenantId,
      incidentNumber: input.incidentNumber,
      title: input.title,
      description: input.description ?? undefined,
      incidentType: input.incidentType ?? undefined,
      severity: input.severity ?? undefined,
      branchId: input.branchId ?? undefined,
      occurredAt: input.occurredAt ?? now,
      detectedAt: now,
      reportedBy: input.reportedBy ?? undefined,
      assignedTo: undefined,
      status: 'new',
      createdAt: now,
      updatedAt: now,
    };
    this.incidents.push(incident);
    return incident;
  }

  async getIncident(id: string) {
    return this.incidents.find((i) => i.id === id);
  }

  async listIncidents(tenantId: string, filters?: { status?: string; limit?: number }) {
    const list = this.incidents.filter((i) => i.tenantId === tenantId && (!filters?.status || i.status === filters.status));
    return list.slice(0, filters?.limit ?? 100);
  }

  async updateIncidentStatus(id: string, status: any, changedBy?: string, notes?: string) {
    const incident = this.incidents.find((i) => i.id === id);
    if (!incident) return undefined;
    incident.status = status;
    incident.updatedAt = new Date().toISOString();
    this.incidentEvents.push({ id: randomUUID(), incidentId: id, eventType: 'status_changed', details: { status, notes }, createdBy: changedBy ?? null, createdAt: new Date().toISOString() });
    return incident;
  }

  async assignIncident(id: string, userId: string) {
    const incident = this.incidents.find((i) => i.id === id);
    if (!incident) return undefined;
    incident.assignedTo = userId;
    incident.updatedAt = new Date().toISOString();
    this.incidentEvents.push({ id: randomUUID(), incidentId: id, eventType: 'assigned', details: { assignedTo: userId }, createdBy: null, createdAt: new Date().toISOString() });
    return incident;
  }

  async addIncidentCamera(incidentId: string, cameraId: string) {
    const rec = { id: randomUUID(), incidentId, cameraId, addedAt: new Date().toISOString() };
    this.incidentCameras.push(rec);
    return;
  }

  async addIncidentVideoRange(incidentId: string, cameraId: string, fromAt: string, toAt: string) {
    const rec = { id: randomUUID(), incidentId, cameraId, fromAt, toAt };
    this.incidentVideoRanges.push(rec);
    this.incidentEvents.push({ id: randomUUID(), incidentId, eventType: 'video_range_added', details: rec, createdBy: null, createdAt: new Date().toISOString() });
    return rec;
  }

  async listIncidentTimeline(incidentId: string) {
    return this.incidentEvents.filter((e) => e.incidentId === incidentId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async addIncidentEvent(incidentId: string, eventType: string, details: any, createdBy?: string) {
    const rec = { id: randomUUID(), incidentId, eventType, details, createdBy: createdBy ?? null, createdAt: new Date().toISOString() };
    this.incidentEvents.push(rec);
    return rec;
  }

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
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
