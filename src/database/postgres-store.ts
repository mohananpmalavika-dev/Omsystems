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
import { ResourceRepository } from "./resource-repository.js";
import { UserRepository } from "./user-repository.js";

export class PostgresStore implements ControlPlaneStore {
  private readonly users: UserRepository;
  private readonly resources: ResourceRepository;
  private readonly cameras: CameraRepository;
  private readonly agents: EdgeAgentRepository;
  private readonly audits: AuditRepository;

  constructor(private readonly pool: Pool) {
    this.users = new UserRepository(pool);
    this.resources = new ResourceRepository(pool);
    this.cameras = new CameraRepository(pool);
    this.agents = new EdgeAgentRepository(pool);
    this.audits = new AuditRepository(pool);
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
  async writeAudit(event: AuditEventInput) { await this.audits.write(event); }
}
