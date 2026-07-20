import type {
  Action,
  AuditEventInput,
  Camera,
  CameraCapabilities,
  CameraProfile,
  CameraStatus,
  CameraVendor,
  DiscoveredCamera,
  EdgeAgent,
  LiveSession,
  ConsumedLiveSession,
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
  heartbeatEdgeAgent(
    id: string,
    version: string,
  ): Promise<EdgeAgent | undefined>;
  createDiscovery(
    branchId: string,
    input: CameraDiscoveryInput,
  ): Promise<DiscoveredCamera>;
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
  writeAudit(event: AuditEventInput): Promise<void>;
}
