import type { Pool } from "pg";
import type {
  CameraApprovalInput,
  CameraDiscoveryInput,
  ControlPlaneStore,
} from "../control-plane-store.js";
import type {
  Action,
  AuditEventInput,
  CameraStatus,
  NodeType,
  User,
} from "../domain/models.js";
import { AuditRepository } from "./audit-repository.js";
import { CameraRepository } from "./camera-repository.js";
import { EdgeAgentRepository } from "./edge-agent-repository.js";
import { InfrastructureRepository } from "./infrastructure-repository.js";
import { ResourceRepository } from "./resource-repository.js";
import { UserRepository } from "./user-repository.js";
import { RecordingRepository } from "./recording-repository.js";

export class PostgresStore
  extends InfrastructureRepository
  implements ControlPlaneStore
{
  private readonly users: UserRepository;
  private readonly resources: ResourceRepository;
  private readonly cameras: CameraRepository;
  private readonly agents: EdgeAgentRepository;
  private readonly audits: AuditRepository;
  private readonly recordings: RecordingRepository;

  constructor(pool: Pool) {
    super(pool);
    this.users = new UserRepository(pool);
    this.resources = new ResourceRepository(pool);
    this.cameras = new CameraRepository(pool);
    this.agents = new EdgeAgentRepository(pool);
    this.audits = new AuditRepository(pool);
    this.recordings = new RecordingRepository(pool);
  }

  async close() { await this.pool.end(); }
  async getUser(identity: string) { return this.users.findByIdentity(identity); }
  async getNode(id: string) { return this.resources.findById(id); }
  async checkAccess(user: User, action: Action, id: string) {
    return this.resources.checkAccess(user, action, id);
  }
  async listAccessibleNodes(user: User, action: Action, type?: NodeType) {
    return this.resources.listAccessible(user, action, type);
  }
  async getCamera(id: string) { return this.cameras.findById(id); }
  async listCamerasByBranch(user: User, branchId: string, action: Action) {
    return this.cameras.listAuthorizedByBranch(user.id, branchId, action);
  }
  async createBranch(tenantId: string, parentId: string, name: string) {
    return this.resources.createBranch(tenantId, parentId, name);
  }
  async registerEdgeAgent(branchId: string, name: string, version: string) {
    return this.agents.register(branchId, name, version);
  }
  async listEdgeAgentsByBranch(branchId: string) {
    return this.agents.listByBranch(branchId);
  }
  async heartbeatEdgeAgent(id: string, version: string) {
    return this.agents.heartbeat(id, version);
  }
  async createDiscovery(branchId: string, input: CameraDiscoveryInput) {
    return this.agents.createDiscovery(branchId, input);
  }
  async approveCamera(branchId: string, input: CameraApprovalInput) {
    return this.cameras.approve(branchId, input);
  }
  async updateCameraStatus(id: string, status: CameraStatus) {
    return this.cameras.updateStatus(id, status);
  }
  async createLiveSession(cameraId: string, userId: string) {
    return this.cameras.createLiveSession(cameraId, userId);
  }
  async consumeLiveSession(token: string) {
    return this.cameras.consumeLiveSession(token);
  }
  async getRecordingJob(cameraId: string) { return this.recordings.getJob(cameraId); }
  async upsertRecordingJob(cameraId: string, input: any) { return this.recordings.upsertJob(cameraId, input); }
  async updateRecordingJobStatus(cameraId: string, status: any) {
    return this.recordings.updateJobStatus(cameraId, status);
  }
  async listRecordingSegments(cameraId: string, from?: string, to?: string) { return this.recordings.listSegments(cameraId, from, to); }
  async createRecordingSegment(input: any) { return this.recordings.createSegment(input); }
  async listRecordingLegalHolds(cameraId: string) { return this.recordings.listLegalHolds(cameraId); }
  async createRecordingLegalHold(input: any) { return this.recordings.createLegalHold(input); }
  async releaseRecordingLegalHold(id: string, tenantId: string, cameraId: string, releasedBy: string) {
    return this.recordings.releaseLegalHold(id, tenantId, cameraId, releasedBy);
  }
  async upsertRecordingStorageNode(input: any) { return this.recordings.upsertStorageNode(input); }
  async createRecordingHealthEvent(input: any) { return this.recordings.createHealthEvent(input); }
  async listRecordingRetentionCandidates(tenantId: string, externalId: string, limit: number) {
    return this.recordings.listRetentionCandidates(tenantId, externalId, limit);
  }
  async markRecordingSegmentsDeleted(tenantId: string, externalId: string, segmentIds: string[]) {
    return this.recordings.markSegmentsDeleted(tenantId, externalId, segmentIds);
  }
  async writeAudit(event: AuditEventInput) { await this.audits.write(event); }
}
