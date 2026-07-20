import { createHash, randomBytes, randomUUID } from "node:crypto";
import type {
  AccessGrant,
  Action,
  AuditEventInput,
  Camera,
  CameraStatus,
  DiscoveredCamera,
  EdgeAgent,
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
import type {
  CameraApprovalInput,
  CameraDiscoveryInput,
  ControlPlaneStore,
} from "./control-plane-store.js";

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

const operatorActions: Action[] = ["live:view", "recording:view", "alarm:acknowledge"];
const seedGrants: AccessGrant[] = [
  { userId: "user-global-admin", scopeNodeId: "company-1", actions: ["live:view", "recording:view", "evidence:export", "ptz:operate", "alarm:acknowledge", "device:configure", "user:manage", "audit:view"], effect: "allow" },
  { userId: "user-south-operator", scopeNodeId: "region-south", actions: operatorActions, effect: "allow" },
  { userId: "user-branch-manager", scopeNodeId: "branch-blr-001", actions: ["live:view", "recording:view"], effect: "allow" },
  { userId: "user-branch-manager", scopeNodeId: "group-sensitive-blr-001", actions: ["live:view", "recording:view"], effect: "deny" },
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

  async writeAudit(event: AuditEventInput) {
    this.auditEvents.push(structuredClone(event));
  }
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
