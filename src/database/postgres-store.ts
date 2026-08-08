import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type {
  CameraApprovalInput,
  CameraDiscoveryInput,
  ControlPlaneStore,
  DeviceInventoryInput,
  DeviceInventoryRecord,
} from "../control-plane-store.js";
import type {
  Action,
  AuditEventInput,
  CameraStatus,
  BranchConnectivityProfile,
  NodeType,
  User,
} from "../domain/models.js";
import { AuditRepository } from "./audit-repository.js";
import { CameraRepository } from "./camera-repository.js";
import { EdgeAgentRepository } from "./edge-agent-repository.js";
import { EdgeOperationsRepository } from "./edge-operations-repository.js";
import { InfrastructureRepository } from "./infrastructure-repository.js";
import { camelRow, camelRows } from "./infrastructure-repository.js";
import { ResourceRepository } from "./resource-repository.js";
import { UserRepository } from "./user-repository.js";
import { RecordingRepository } from "./recording-repository.js";
import { LiveOperationsRepository } from "./live-operations-repository.js";
import { AnalyticsRepository } from "./analytics-repository.js";
import { EvidenceRepository } from "./evidence-repository.js";
import IncidentRepository from "./incident-repository.js";
import { ComplianceRepository } from "./compliance-repository.js";
import { MaintenanceRepository } from "./maintenance-repository.js";
import { PrivacyRepository } from "./privacy-repository.js";
import { OperationalHealthRepository } from "./operational-health-repository.js";
import { GridLayoutRepository } from "./grid-layout-repository.js";
import { OperationalReportRepository } from "./operational-report-repository.js";
import { ActivityTrackingRepository } from "./activity-tracking-repository.js";
import type {
  OperationalHealthPolicy,
  OperationalTelemetryEnvelope,
  VideoWallGridSize,
  VideoWallLayout,
} from "../operational-health/types.js";

function mapBranchConnectivityProfile(row: any): BranchConnectivityProfile {
  return {
    branchId: row.branch_id,
    tenantId: row.tenant_id,
    primaryTransport: row.primary_transport,
    ...(row.fallback_transport ? { fallbackTransport: row.fallback_transport } : {}),
    ...(row.vpn_protocol ? { vpnProtocol: row.vpn_protocol } : {}),
    ...(row.vpn_remote_networks?.length ? { vpnRemoteNetworks: row.vpn_remote_networks } : {}),
    status: row.status,
    lastVerifiedAt: row.last_verified_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

// TODO: PostgresStore is a partial implementation of ControlPlaneStore
// Some methods from the interface are not yet implemented but are not used in production
// This needs to be properly fixed by either implementing missing methods or restructuring the interface
export class PostgresStore
  extends InfrastructureRepository
  implements Partial<ControlPlaneStore>
{
  private readonly users: UserRepository;
  private readonly resources: ResourceRepository;
  private readonly cameras: CameraRepository;
  private readonly agents: EdgeAgentRepository;
  private readonly edgeOperations: EdgeOperationsRepository;
  private readonly audits: AuditRepository;
  private readonly recordings: RecordingRepository;
  private readonly liveOperations: LiveOperationsRepository;
  private readonly analytics: AnalyticsRepository;
  private readonly evidence: EvidenceRepository;
  private readonly incidents: IncidentRepository;
  private readonly compliance: ComplianceRepository;
  private readonly maintenance: MaintenanceRepository;
  private readonly privacy: PrivacyRepository;
  private readonly operationalHealth: OperationalHealthRepository;
  private readonly gridLayouts: GridLayoutRepository;
  private readonly operationalReports: OperationalReportRepository;
  private readonly activityTracking: ActivityTrackingRepository;

  // Public getter for direct database access (use sparingly)
  get db() {
    return this.pool;
  }

  constructor(pool: Pool) {
    super(pool);
    this.users = new UserRepository(pool);
    this.resources = new ResourceRepository(pool);
    this.cameras = new CameraRepository(pool);
    this.agents = new EdgeAgentRepository(pool);
    this.edgeOperations = new EdgeOperationsRepository(pool);
    this.audits = new AuditRepository(pool);
    this.recordings = new RecordingRepository(pool);
    this.liveOperations = new LiveOperationsRepository(pool);
    this.analytics = new AnalyticsRepository(pool);
    this.evidence = new EvidenceRepository(pool);
    this.incidents = new IncidentRepository(pool);
    this.compliance = new ComplianceRepository(pool);
    this.maintenance = new MaintenanceRepository(pool);
    this.privacy = new PrivacyRepository(pool);
    this.operationalHealth = new OperationalHealthRepository(pool);
    this.gridLayouts = new GridLayoutRepository(pool);
    this.operationalReports = new OperationalReportRepository(pool);
    this.activityTracking = new ActivityTrackingRepository(pool);
  }
    this.compliance = new ComplianceRepository(pool);
    this.maintenance = new MaintenanceRepository(pool);
    this.privacy = new PrivacyRepository(pool);
    this.operationalHealth = new OperationalHealthRepository(pool);
    this.gridLayouts = new GridLayoutRepository(pool);
    this.operationalReports = new OperationalReportRepository(pool);
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
  async listDeviceInventory(tenantId: string, branchNodeId?: string): Promise<DeviceInventoryRecord[]> {
    const result = await this.pool.query(
      `SELECT id::text, tenant_id, device_id, tenant, region, branch, device_type,
              manufacturer, model, serial_number, mac_address, ip_address,
              firmware_version, onvif_version, capabilities, credential_reference,
              installation_date, warranty, amc_contract, health_status,
              last_communication, configuration_template, risk_classification,
              lifecycle_state, created_at, updated_at
       FROM device_inventory
       WHERE tenant_id=$1 AND ($2::varchar IS NULL OR branch=$2)
       ORDER BY device_id`,
      [tenantId, branchNodeId ?? null],
    );
    return camelRows(result.rows);
  }

  async getDeviceInventory(id: string): Promise<DeviceInventoryRecord | undefined> {
    const result = await this.pool.query(
      `SELECT id::text, tenant_id, device_id, tenant, region, branch, device_type,
              manufacturer, model, serial_number, mac_address, ip_address,
              firmware_version, onvif_version, capabilities, credential_reference,
              installation_date, warranty, amc_contract, health_status,
              last_communication, configuration_template, risk_classification,
              lifecycle_state, created_at, updated_at
       FROM device_inventory WHERE id=$1`,
      [id],
    );
    return result.rows[0] ? camelRow(result.rows[0]) : undefined;
  }

  async createDeviceInventoryRecord(input: DeviceInventoryInput): Promise<DeviceInventoryRecord> {
    const result = await this.pool.query(
      `INSERT INTO device_inventory (
         tenant_id, device_id, tenant, region, branch, device_type, manufacturer,
         model, serial_number, mac_address, ip_address, firmware_version,
         onvif_version, capabilities, credential_reference, installation_date,
         warranty, amc_contract, health_status, last_communication,
         configuration_template, risk_classification, lifecycle_state
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$16,$17,$18,
         $19,$20,$21,$22,$23
       )
       RETURNING id::text, tenant_id, device_id, tenant, region, branch,
                 device_type, manufacturer, model, serial_number, mac_address,
                 ip_address, firmware_version, onvif_version, capabilities,
                 credential_reference, installation_date, warranty, amc_contract,
                 health_status, last_communication, configuration_template,
                 risk_classification, lifecycle_state, created_at, updated_at`,
      [
        input.tenantId, input.deviceId, input.tenant, input.region, input.branch,
        input.deviceType, input.manufacturer, input.model,
        input.serialNumber ?? null, input.macAddress ?? null,
        input.ipAddress ?? null, input.firmwareVersion ?? null,
        input.onvifVersion ?? null,
        JSON.stringify(input.capabilities ?? []),
        input.credentialReference ?? null, input.installationDate ?? null,
        input.warranty ?? null, input.amcContract ?? null,
        input.healthStatus ?? 'unknown', input.lastCommunication ?? null,
        input.configurationTemplate ?? null,
        input.riskClassification ?? 'medium',
        input.lifecycleState ?? 'discovered',
      ],
    );
    return camelRow(result.rows[0]!);
  }

  async updateDeviceInventory(id: string, input: Partial<DeviceInventoryInput>): Promise<DeviceInventoryRecord | undefined> {
    const fields: Array<[string, unknown, string?]> = [
      ["device_id", input.deviceId],
      ["tenant", input.tenant],
      ["region", input.region],
      ["branch", input.branch],
      ["device_type", input.deviceType],
      ["manufacturer", input.manufacturer],
      ["model", input.model],
      ["serial_number", input.serialNumber],
      ["mac_address", input.macAddress],
      ["ip_address", input.ipAddress],
      ["firmware_version", input.firmwareVersion],
      ["onvif_version", input.onvifVersion],
      ["capabilities", input.capabilities, "jsonb"],
      ["credential_reference", input.credentialReference],
      ["installation_date", input.installationDate],
      ["warranty", input.warranty],
      ["amc_contract", input.amcContract],
      ["health_status", input.healthStatus],
      ["last_communication", input.lastCommunication],
      ["configuration_template", input.configurationTemplate],
      ["risk_classification", input.riskClassification],
      ["lifecycle_state", input.lifecycleState],
    ];
    const supplied = fields.filter(([, value]) => value !== undefined);
    if (supplied.length === 0) return this.getDeviceInventory(id);

    const assignments = supplied.map(
      ([column, , cast], index) =>
        `${column}=$${index + 2}${cast ? `::${cast}` : ""}`,
    );
    const values = supplied.map(([, value, cast]) =>
      cast === "jsonb" ? JSON.stringify(value) : value,
    );

    await this.pool.query(
      `UPDATE device_inventory SET ${assignments.join(", ")}, updated_at=now() WHERE id=$1`,
      [id, ...values],
    );

    return this.getDeviceInventory(id);
  }

  async getCamera(id: string) { return this.cameras.findById(id); }
  async listCamerasByBranch(user: User, branchId: string, action: Action) {
    return this.cameras.listAuthorizedByBranch(user.id, branchId, action);
  }
  async listCamerasByEdgeAgent(edgeAgentId: string) {
    return this.cameras.listByEdgeAgent(edgeAgentId);
  }
  async listAccessibleCameras(user: User, action: Action, filters: any) {
    return this.cameras.listAuthorized(user.id, action, filters);
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
  async getEdgeAgent(id: string) {
    return this.agents.get(id);
  }
  async heartbeatEdgeAgent(id: string, version: string, publicMediaUrl?: string) {
    return this.agents.heartbeat(id, version, publicMediaUrl);
  }
  async createEdgeActivation(input: Parameters<EdgeOperationsRepository["createActivation"]>[0]) {
    return this.edgeOperations.createActivation(input);
  }
  async activateEdgeAgent(input: Parameters<EdgeOperationsRepository["activate"]>[0]) {
    return this.edgeOperations.activate(input);
  }
  async verifyEdgeAgentCredential(id: string, credentialHash: string) {
    return this.edgeOperations.verifyCredential(id, credentialHash);
  }
  async getEdgeAgentCommandPublicKey(id: string) {
    return this.edgeOperations.getCommandPublicKey(id);
  }
  async revokeEdgeAgentCredential(id: string) {
    return this.edgeOperations.revokeCredential(id);
  }
  async getEdgeManagedTunnel(branchId: string) {
    return this.edgeOperations.getManagedTunnel(branchId);
  }
  async upsertEdgeManagedTunnel(input: Parameters<EdgeOperationsRepository["upsertManagedTunnel"]>[0]) {
    return this.edgeOperations.upsertManagedTunnel(input);
  }
  async updateEdgeManagedTunnelStatus(
    branchId: string,
    status: Parameters<EdgeOperationsRepository["updateManagedTunnelStatus"]>[1],
  ) {
    return this.edgeOperations.updateManagedTunnelStatus(branchId, status);
  }
  async createEdgeCommand(input: Parameters<EdgeOperationsRepository["createCommand"]>[0]) {
    return this.edgeOperations.createCommand(input);
  }
  async listEdgeCommands(branchId: string, limit?: number) {
    return this.edgeOperations.listCommands(branchId, limit);
  }
  async claimEdgeCommand(edgeAgentId: string) {
    return this.edgeOperations.claimCommand(edgeAgentId);
  }
  async completeEdgeCommand(edgeAgentId: string, commandId: string, result: any) {
    return this.edgeOperations.completeCommand(edgeAgentId, commandId, result);
  }
  async createEdgeUpdateRelease(input: Parameters<EdgeOperationsRepository["createRelease"]>[0]) {
    return this.edgeOperations.createRelease(input);
  }
  async getEdgeUpdateReleaseForAgent(edgeAgentId: string, currentVersion: string) {
    return this.edgeOperations.getReleaseForAgent(edgeAgentId, currentVersion);
  }
  async ingestOperationalTelemetry(envelope: OperationalTelemetryEnvelope) {
    return this.operationalHealth.ingest(envelope);
  }
  async listLatestOperationalTelemetry(tenantId: string, branchIds?: string[]) {
    return this.operationalHealth.listLatest(tenantId, branchIds);
  }
  async listOperationalTelemetryHistory(tenantId: string, branchId: string, from: string, to: string, limit?: number) {
    return this.operationalHealth.listHistory(tenantId, branchId, from, to, limit);
  }
  async getOperationalHealthPolicy(tenantId: string, branchId?: string) {
    return this.operationalHealth.getPolicy(tenantId, branchId);
  }
  async upsertOperationalHealthPolicy(tenantId: string, branchId: string | undefined, policy: OperationalHealthPolicy) {
    return this.operationalHealth.upsertPolicy(tenantId, branchId, policy);
  }
  async listVideoWallLayouts(tenantId: string, userId: string) {
    return this.gridLayouts.listLayouts(tenantId, userId);
  }
  async createVideoWallLayout(input: {
    tenantId: string;
    userId: string;
    name: string;
    gridSize: VideoWallGridSize;
    cameraPositions: VideoWallLayout["cameraPositions"];
  }) {
    return this.gridLayouts.createLayout({
      tenantId: input.tenantId, createdBy: input.userId, name: input.name,
      gridSize: input.gridSize, cameraPositions: input.cameraPositions,
    });
  }
  async createEdgeScanJob(branchId: string, edgeAgentId?: string) {
    return this.agents.createScanJob(branchId, edgeAgentId);
  }
  async getEdgeScanJob(branchId: string, jobId: string) {
    return this.agents.getScanJob(branchId, jobId);
  }
  async claimEdgeScanJob(edgeAgentId: string) {
    return this.agents.claimScanJob(edgeAgentId);
  }
  async completeEdgeScanJob(edgeAgentId: string, jobId: string, result: any) {
    return this.agents.completeScanJob(edgeAgentId, jobId, result);
  }
  async createDiscovery(branchId: string, input: CameraDiscoveryInput) {
    return this.agents.createDiscovery(branchId, input);
  }
  async listDiscoveredCameras(branchId: string) {
    return this.agents.listDiscoveries(branchId);
  }
  async approveCamera(branchId: string, input: CameraApprovalInput) {
    return this.cameras.approve(branchId, input);
  }
  async createCameraFromManualRegistration(branchId: string, input: CameraApprovalInput) {
    return this.cameras.createManual(branchId, input);
  }
  async replaceRecorderChannels(input: Parameters<CameraRepository["replaceRecorderChannels"]>[0]) {
    return this.cameras.replaceRecorderChannels(input);
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
  async getBranchConnectivityProfile(branchId: string): Promise<BranchConnectivityProfile | undefined> {
    const result = await this.pool.query(
      `SELECT branch_node_id::text AS branch_id, tenant_id::text AS tenant_id,
              primary_transport, fallback_transport, vpn_protocol, vpn_remote_networks,
              status, last_verified_at, created_at, updated_at
       FROM branch_connectivity_profiles WHERE branch_node_id = $1::uuid`,
      [branchId],
    );
    return result.rows[0] ? mapBranchConnectivityProfile(result.rows[0]) : undefined;
  }
  async upsertBranchConnectivityProfile(
    input: Omit<BranchConnectivityProfile, "createdAt" | "updatedAt" | "lastVerifiedAt">,
  ): Promise<BranchConnectivityProfile> {
    const result = await this.pool.query(
      `INSERT INTO branch_connectivity_profiles
         (branch_node_id, tenant_id, primary_transport, fallback_transport, vpn_protocol,
          vpn_remote_networks, status)
       SELECT id, tenant_id, $2, $3, $4, $5::text[], $6
       FROM resource_nodes WHERE id = $1::uuid AND node_type = 'branch'
       ON CONFLICT (branch_node_id) DO UPDATE
       SET primary_transport = EXCLUDED.primary_transport,
           fallback_transport = EXCLUDED.fallback_transport,
           vpn_protocol = EXCLUDED.vpn_protocol,
           vpn_remote_networks = EXCLUDED.vpn_remote_networks,
           status = EXCLUDED.status, updated_at = now()
       RETURNING branch_node_id::text AS branch_id, tenant_id::text AS tenant_id,
                 primary_transport, fallback_transport, vpn_protocol, vpn_remote_networks,
                 status, last_verified_at, created_at, updated_at`,
      [input.branchId, input.primaryTransport, input.fallbackTransport ?? null,
        input.vpnProtocol ?? null, input.vpnRemoteNetworks ?? [], input.status],
    );
    if (!result.rows[0]) throw new Error("branch_not_found");
    return mapBranchConnectivityProfile(result.rows[0]);
  }
  async updateBranchConnectivityStatus(branchId: string, status: BranchConnectivityProfile["status"]) {
    const result = await this.pool.query(
      `UPDATE branch_connectivity_profiles
       SET status=$2, last_verified_at=now(), updated_at=now()
       WHERE branch_node_id=$1::uuid
       RETURNING branch_node_id::text AS branch_id, tenant_id::text AS tenant_id,
                 primary_transport, fallback_transport, vpn_protocol, vpn_remote_networks,
                 status, last_verified_at, created_at, updated_at`,
      [branchId, status],
    );
    return result.rows[0] ? mapBranchConnectivityProfile(result.rows[0]) : undefined;
  }
  async writeAudit(event: AuditEventInput) {
    await this.pool.query(
      `INSERT INTO audit_events (
         tenant_id, actor_user_id, action, resource_node_id,
         outcome, source_ip, details
       ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [
        event.tenantId,
        event.actorUserId,
        event.action,
        event.resourceNodeId,
        event.outcome,
        event.sourceIp ?? null,
        JSON.stringify(event.details ?? {}),
      ],
    );
  }
  async getRecordingJob(cameraId: string) { return this.recordings.getJob(cameraId); }
  async listRecordingJobs(cameraIds: string[]) { return this.recordings.listJobs(cameraIds); }
  async upsertRecordingJob(cameraId: string, input: any) { return this.recordings.upsertJob(cameraId, input); }
  async updateRecordingJobStatus(cameraId: string, status: any) {
    return this.recordings.updateJobStatus(cameraId, status);
  }
  async listRecordingSegments(cameraId: string, from?: string, to?: string) { return this.recordings.listSegments(cameraId, from, to); }
  async listRecordingSegmentsForCameras(cameraIds: string[], from?: string, to?: string) { return this.recordings.listSegmentsForCameras(cameraIds, from, to); }
  async getRecordingSegment(id: string) { return this.recordings.getSegment(id); }
  async verifyRecordingSegment(segmentId: string) { return this.recordings.verifyRecordingSegment(segmentId); }
  async createRecordingSegment(input: any) { return this.recordings.createSegment(input); }
  async listRecordingLegalHolds(cameraId: string) { return this.recordings.listLegalHolds(cameraId); }
  async createRecordingLegalHold(input: any) { return this.recordings.createLegalHold(input); }
  async releaseRecordingLegalHold(id: string, tenantId: string, cameraId: string, releasedBy: string) {
    return this.recordings.releaseLegalHold(id, tenantId, cameraId, releasedBy);
  }
  // Evidence repository delegations
  async createEvidenceCase(input: any) { return this.evidence.createCase(input); }
  async getEvidenceCase(id: string) { return this.evidence.getCase(id); }
  async listEvidenceCases(tenantId: string, filters?: any) { return this.evidence.listCases(tenantId, filters); }
  async updateEvidenceCaseStatus(id: string, status: any) { return this.evidence.updateCaseStatus(id, status); }
  async addEvidenceItem(caseId: string, input: any) { return this.evidence.addItem(caseId, input); }
  async listEvidenceItems(caseId: string) { return this.evidence.listItems(caseId); }
  async getEvidenceItem(itemId: string) { return this.evidence.getItem(itemId); }
  async requestEvidenceExport(caseId: string, input: any) { return this.evidence.requestExport(caseId, input); }
  async getEvidenceExport(exportId: string) { return this.evidence.getExport(exportId); }
  async updateEvidenceExportStatus(exportId: string, status: any, details?: any) { return this.evidence.updateExportStatus(exportId, status, details); }
  async createEvidenceManifest(input: any) { return this.evidence.createManifest(input); }
  async getEvidenceManifest(id: string) { return this.evidence.getManifest(id); }
  async recordCustodyEvent(input: any) { return this.evidence.recordCustodyEvent(input); }
  async getCustodyLog(evidenceId: string) { return this.evidence.getCustodyLog(evidenceId); }
  async createLegalHold(input: any) { return this.evidence.createLegalHold(input); }
  async releaseLegalHold(id: string, releasedBy: string) { return this.evidence.releaseLegalHold(id, releasedBy); }
  async getLegalHold(id: string) { return this.evidence.getLegalHold(id); }
  async upsertRecordingStorageNode(input: any) { return this.recordings.upsertStorageNode(input); }
  async listRecordingStorageNodes(tenantId: string) { return this.recordings.listStorageNodes(tenantId); }
  async createRecordingHealthEvent(input: any) { return this.recordings.createHealthEvent(input); }
  async listRecordingHealthEvents(cameraId: string, limit: number) {
    return this.recordings.listHealthEvents(cameraId, limit);
  }
  async listRecordingRetentionCandidates(tenantId: string, externalId: string, limit: number) {
    return this.recordings.listRetentionCandidates(tenantId, externalId, limit);
  }
  async markRecordingSegmentsDeleted(tenantId: string, externalId: string, segmentIds: string[]) {
    return this.recordings.markSegmentsDeleted(tenantId, externalId, segmentIds);
  }
  async listLiveBookmarks(cameraId: string, limit: number) {
    return this.liveOperations.listBookmarks(cameraId, limit);
  }
  async createLiveBookmark(input: any) {
    return this.liveOperations.createBookmark(input);
  }
  async listLiveIncidents(cameraId: string, limit: number) {
    return this.liveOperations.listIncidents(cameraId, limit);
  }
  async createLiveIncident(input: any) {
    return this.liveOperations.createIncident(input);
  }
  async updateLiveIncidentStatus(id: string, tenantId: string, cameraId: string, status: any) {
    return this.liveOperations.updateIncidentStatus(id, tenantId, cameraId, status);
  }
  async listAnalyticsRules(cameraId: string) { return this.analytics.listRules(cameraId); }
  async createAnalyticsRule(tenantId: string, cameraId: string, createdBy: string, input: any) {
    return this.analytics.createRule(tenantId, cameraId, createdBy, input);
  }
  async updateAnalyticsRule(id: string, tenantId: string, cameraId: string, input: any) {
    return this.analytics.updateRule(id, tenantId, cameraId, input);
  }
  async deleteAnalyticsRule(id: string, tenantId: string, cameraId: string) {
    return this.analytics.deleteRule(id, tenantId, cameraId);
  }
  async processAnalyticsEvent(input: any) { return this.analytics.processEvent(input); }
  async listAnalyticsAlerts(tenantId: string, filters: any) {
    return this.analytics.listAlerts(tenantId, filters);
  }
  async getAnalyticsAlert(id: string, tenantId: string) {
    return this.analytics.getAlert(id, tenantId);
  }
  async updateAnalyticsAlertEvidence(id: string, tenantId: string, input: any) {
    return this.analytics.updateAlertEvidence(id, tenantId, input);
  }
  async listComplianceFrameworks(tenantId: string) { return this.compliance.listFrameworks(tenantId); }
  async getComplianceFramework(id: string) { return this.compliance.getFramework(id); }
  async createComplianceFramework(input: any) { return this.compliance.createFramework(input); }
  async updateComplianceFramework(id: string, input: any) { return this.compliance.updateFramework(id, input); }
  async listCompliancePolicies(tenantId: string, frameworkId?: string) { return this.compliance.listPolicies(tenantId, frameworkId); }
  async getCompliancePolicy(id: string) { return this.compliance.getPolicy(id); }
  async createCompliancePolicy(input: any) { return this.compliance.createPolicy(input); }
  async updateCompliancePolicy(id: string, input: any) { return this.compliance.updatePolicy(id, input); }
  async listComplianceAssessments(tenantId: string, filters?: any) { return this.compliance.listAssessments(tenantId, filters); }
  async getComplianceAssessment(id: string) { return this.compliance.getAssessment(id); }
  async createComplianceAssessment(input: any) { return this.compliance.createAssessment(input); }
  async updateComplianceAssessment(id: string, input: any) { return this.compliance.updateAssessment(id, input); }
  async listComplianceCertificates(assessmentId: string) { return this.compliance.listCertificates(assessmentId); }
  async getComplianceCertificate(id: string) { return this.compliance.getCertificate(id); }
  async createComplianceCertificate(input: any) { return this.compliance.createCertificate(input); }
  async getPrivacySummary(tenantId: string) { return this.privacy.getPrivacySummary(tenantId); }
  async listPrivacyPurposes(tenantId: string) { return this.privacy.listPrivacyPurposes(tenantId); }
  async getPrivacyPurpose(id: string) { return this.privacy.getPrivacyPurpose(id); }
  async createPrivacyPurpose(input: any) { return this.privacy.createPrivacyPurpose(input); }
  async updatePrivacyPurpose(id: string, input: any) { return this.privacy.updatePrivacyPurpose(id, input); }
  async listCameraPrivacyPurposes(cameraId: string) { return this.privacy.listCameraPrivacyPurposes(cameraId); }
  async assignCameraPrivacyPurpose(
    cameraId: string,
    purposeId: string,
    createdBy: string,
    startDate?: string,
    endDate?: string,
    notes?: string,
  ) {
    return this.privacy.assignCameraPrivacyPurpose(cameraId, purposeId, createdBy, startDate, endDate, notes);
  }
  async getCameraPrivacyControls(cameraId: string) { return this.privacy.getCameraPrivacyControls(cameraId); }
  async upsertCameraPrivacyControls(cameraId: string, input: any) { return this.privacy.upsertCameraPrivacyControls(cameraId, input); }
  async listPrivacyBreaches(tenantId: string, status?: string) { return this.privacy.listPrivacyBreaches(tenantId, status); }
  async reportPrivacyBreach(input: any) { return this.privacy.reportPrivacyBreach(input); }
  async updatePrivacyBreachStatus(id: string, status: string, changedBy: string) { return this.privacy.updatePrivacyBreachStatus(id, status, changedBy); }
  async createMaintenanceAsset(input: any) { return this.maintenance.createAsset(input); }
  async listMaintenanceAssets(tenantId: string, category?: string) { return this.maintenance.listAssets(tenantId, category); }
  async getMaintenanceAsset(id: string) { return this.maintenance.getAsset(id); }
  async updateMaintenanceAsset(id: string, input: any) { return this.maintenance.updateAsset(id, input); }
  async createWorkOrder(input: any) { return this.maintenance.createWorkOrder(input); }
  async listWorkOrders(tenantId: string, status?: string) { return this.maintenance.listWorkOrders(tenantId, status); }
  async getWorkOrder(id: string) { return this.maintenance.getWorkOrder(id); }
  async updateWorkOrder(id: string, input: any) { return this.maintenance.updateWorkOrder(id, input); }
  async createMaintenanceVendor(input: any) { return this.maintenance.createMaintenanceVendor(input); }
  async listMaintenanceVendors(tenantId: string) { return this.maintenance.listMaintenanceVendors(tenantId); }
  async getMaintenanceVendor(id: string) { return this.maintenance.getMaintenanceVendor(id); }
  async updateMaintenanceVendor(id: string, input: any) { return this.maintenance.updateMaintenanceVendor(id, input); }
  async createAmcContract(input: any) { return this.maintenance.createAmcContract(input); }
  async listAmcContracts(tenantId: string, vendorId?: string) { return this.maintenance.listAmcContracts(tenantId, vendorId); }
  async getAmcContract(id: string) { return this.maintenance.getAmcContract(id); }
  async updateAmcContract(id: string, input: any) { return this.maintenance.updateAmcContract(id, input); }
  async createMaintenancePlan(input: any) { return this.maintenance.createMaintenancePlan(input); }
  async listMaintenancePlans(tenantId: string) { return this.maintenance.listMaintenancePlans(tenantId); }
  async getMaintenancePlan(id: string) { return this.maintenance.getMaintenancePlan(id); }
  async createMaintenanceSchedule(input: any) { return this.maintenance.createMaintenanceSchedule(input); }
  async listMaintenanceSchedules(tenantId: string) { return this.maintenance.listMaintenanceSchedules(tenantId); }
  async createMaintenanceVisit(input: any) { return this.maintenance.createMaintenanceVisit(input); }
  async listMaintenanceVisits(tenantId: string, filters?: any) { return this.maintenance.listMaintenanceVisits(tenantId, filters); }
  async updateMaintenanceVisit(id: string, input: any) { return this.maintenance.updateMaintenanceVisit(id, input); }
  async ingestPredictiveAlert(input: any) { return this.maintenance.ingestPredictiveAlert(input); }
  async listPredictiveAlerts(tenantId: string) { return this.maintenance.listPredictiveAlerts(tenantId); }
  async recordCameraHealth(input: any) { return this.maintenance.recordCameraHealth(input); }
  async recordStorageHealth(input: any) { return this.maintenance.recordStorageHealth(input); }
  async recordNetworkHealth(input: any) { return this.maintenance.recordNetworkHealth(input); }
  async recordUpsHealth(input: any) { return this.maintenance.recordUpsHealth(input); }
  async getHealthCheckSummary(tenantId: string) { return this.maintenance.getHealthCheckSummary(tenantId); }
  async recordFirmwareVersion(input: any) { return this.maintenance.recordFirmwareVersion(input); }
  async listFirmwareUpdatesRequired(tenantId: string) { return this.maintenance.listFirmwareUpdatesRequired(tenantId); }
  async recordSoftwareVersion(input: any) { return this.maintenance.recordSoftwareVersion(input); }
  async recordSparePart(input: any) { return this.maintenance.recordSparePart(input); }
  async recordInventoryTransaction(input: any) { return this.maintenance.recordInventoryTransaction(input); }
  async listLowStockParts(tenantId: string) { return this.maintenance.listLowStockParts(tenantId); }
  async generateMaintenanceReport(input: any) { return this.maintenance.generateMaintenanceReport(input); }
  async listMaintenanceReports(tenantId: string, filters?: any) { return this.maintenance.listMaintenanceReports(tenantId, filters); }
  async getMaintenanceComplianceStatus(tenantId: string) { return this.maintenance.getMaintenanceComplianceStatus(tenantId); }
  // Incident delegations
  async createIncident(input: any) { return this.incidents.createIncident(input); }
  async getIncident(id: string) { return this.incidents.getIncident(id); }
  async listIncidents(tenantId: string, filters?: any) { return this.incidents.listIncidents(tenantId, filters); }
  async updateIncident(id: string, updates: any) { return this.incidents.updateIncident(id, updates); }
  async updateIncidentStatus(id: string, status: any, changedBy: string, notes?: string) { return this.incidents.updateStatus(id, status, changedBy, notes); }
  async assignIncident(id: string, userId: string, assignedBy: string) { return this.incidents.assignIncident(id, userId); }
  async escalateIncident(id: string, escalatedBy: string, reason: string, recipients?: string[]) { return this.incidents.escalateIncident(id, escalatedBy, reason, recipients ?? []); }
  async closeIncident(id: string, closedBy: string, notes?: string) { return this.incidents.closeIncident(id, closedBy, notes); }
  async reopenIncident(id: string, reopenedBy: string, reason: string) { return this.incidents.reopenIncident(id, reopenedBy, reason); }
  
  async addIncidentParticipant(input: any) { return this.incidents.addParticipant(input); }
  async listIncidentParticipants(incidentId: string): Promise<any[]> { return this.incidents.listParticipants(incidentId); }
  async updateIncidentParticipant(id: string, updates: any) { return this.incidents.updateIncidentParticipant(id, updates); }
  async removeIncidentParticipant(id: string) { return this.incidents.removeIncidentParticipant(id); }
  
  async addIncidentCamera(incidentId: string, cameraId: string, isPrimary: boolean, addedBy: string) { return this.incidents.addCamera(incidentId, cameraId); }
  async listIncidentCameras(incidentId: string): Promise<any[]> { return this.incidents.listCameras(incidentId); }
  
  async addIncidentVideoRange(input: any) { return this.incidents.addVideoRange(input.incidentId, input.cameraId, input.fromAt, input.toAt, input.preservedBy, input.applyLegalHold, input.notes); }
  async preserveIncidentVideoAutomatic(input: any) { return this.incidents.preserveIncidentVideoAutomatic(input); }
  async listIncidentVideoRanges(incidentId: string): Promise<any[]> { return this.incidents.listVideoRanges(incidentId); }
  
  async listIncidentTimeline(incidentId: string): Promise<any[]> { return this.incidents.listTimeline(incidentId); }
  async addIncidentEvent(input: any) { return this.incidents.addEvent(input.incidentId, input.eventType, { description: input.description, ...input.details }, input.performedBy); }
  
  async createIncidentClip(input: any) { return this.incidents.createClip(input); }
  async listIncidentClips(incidentId: string): Promise<any[]> { return this.incidents.listClips(incidentId); }
  
  async createIncidentSnapshot(input: any) { return this.incidents.createSnapshot(input); }
  async listIncidentSnapshots(incidentId: string): Promise<any[]> { return this.incidents.listSnapshots(incidentId); }
  
  async addIncidentEvidenceItem(input: any) { return this.incidents.addEvidenceItem(input); }
  async listIncidentEvidenceItems(incidentId: string): Promise<any[]> { return this.incidents.listEvidenceItems(incidentId); }
  
  async createIncidentEvidencePackage(input: any) { return this.incidents.createEvidencePackage(input); }
  async getIncidentEvidencePackage(id: string) { return this.incidents.getEvidencePackage(id); }
  async listIncidentEvidencePackages(incidentId: string): Promise<any[]> { return this.incidents.listEvidencePackages(incidentId); }
  async approveEvidencePackage(id: string, approvedBy: string) { return this.incidents.approveEvidencePackage(id, approvedBy); }
  async recordEvidencePackageDownload(id: string, downloadedBy: string) { return this.incidents.recordEvidencePackageDownload(id, downloadedBy); }
  
  async createPoliceIntimation(input: any) { return this.incidents.createPoliceIntimation(input); }
  async listPoliceIntimations(incidentId: string): Promise<any[]> { return this.incidents.listPoliceIntimations(incidentId); }
  async updatePoliceIntimation(id: string, updates: any) { return this.incidents.updatePoliceIntimation(id, updates); }
  async recordPoliceEvidenceTransfer(input: any) { return this.incidents.recordPoliceEvidenceTransfer(input); }
  async listPoliceEvidenceTransfers(incidentId: string): Promise<any[]> { return this.incidents.listPoliceEvidenceTransfers(incidentId); }
  
  async createInsuranceClaim(input: any) { return this.incidents.createInsuranceClaim(input); }
  async listInsuranceClaims(incidentId: string): Promise<any[]> { return this.incidents.listInsuranceClaims(incidentId); }
  async updateInsuranceClaim(id: string, updates: any) { return this.incidents.updateInsuranceClaim(id, updates); }
  async addInsuranceDocument(input: any) { return this.incidents.addInsuranceDocument(input); }
  async listInsuranceDocuments(incidentId: string, claimId?: string): Promise<any[]> { return this.incidents.listInsuranceDocuments(incidentId, claimId); }
  
  async createIncidentTask(input: any) { return this.incidents.createIncidentTask(input); }
  async listIncidentTasks(incidentId: string): Promise<any[]> { return this.incidents.listIncidentTasks(incidentId); }
  async updateIncidentTask(id: string, updates: any) { return this.incidents.updateIncidentTask(id, updates); }
  async completeIncidentTask(id: string, completedBy: string, notes?: string) { return this.incidents.completeIncidentTask(id, completedBy, notes); }
  
  async addIncidentNote(input: any) { return this.incidents.addIncidentNote(input); }
  async listIncidentNotes(incidentId: string, noteType?: string): Promise<any[]> { return this.incidents.listIncidentNotes(incidentId, noteType); }
  async updateIncidentNote(id: string, content: string) { return this.incidents.updateIncidentNote(id, content); }
  async deleteIncidentNote(id: string) { return this.incidents.deleteIncidentNote(id); }
  
  async createIncidentSecureShare(input: any) { return this.incidents.createSecureShare(input); }
  async listIncidentSecureShares(incidentId: string): Promise<any[]> { return this.incidents.listSecureShares(incidentId); }
  async verifySecureShareAccess(token: string, otp?: string) { return this.incidents.verifySecureShareAccess(token, otp); }
  async recordSecureShareDownload(input: { id: string; downloadedBy: string; downloadIp?: string }) { return this.incidents.recordSecureShareDownload(input.id, input.downloadedBy, input.downloadIp); }
  async revokeSecureShare(id: string, revokedBy: string, reason: string) { return this.incidents.revokeSecureShare(id, revokedBy, reason); }
  
  async createIncidentReport(input: any) { return this.incidents.createIncidentReport(input); }
  async listIncidentReports(incidentId: string): Promise<any[]> { return this.incidents.listIncidentReports(incidentId); }
  async getIncidentReport(id: string) { return this.incidents.getIncidentReport(id); }
  async updateIncidentReport(id: string, updates: any) { return this.incidents.updateIncidentReport(id, updates); }
  async submitIncidentReportForReview(id: string, submittedBy: string) { return this.reviewIncidentReport(id, submittedBy); }
  async reviewIncidentReport(id: string, reviewedBy: string) { return this.incidents.reviewIncidentReport(id, reviewedBy); }
  async approveIncidentReport(id: string, approvedBy: string, comments?: string) { return this.incidents.approveIncidentReport(id, approvedBy); }
  async finalizeIncidentReport(id: string, reportPath?: string) { return this.incidents.finalizeIncidentReport(id, reportPath); }
  
  async getIncidentsDashboard(tenantId: string, filters?: any) { return this.incidents.getIncidentsDashboard(tenantId, filters); }
  async getIncidentDashboard(tenantId: string, filters?: any) { return this.getIncidentsDashboard(tenantId, filters); }
  async getIncidentStatistics(tenantId: string, period: string) {
    const now = new Date();
    const from = new Date(now);
    switch (period) {
      case 'week':
        from.setDate(now.getDate() - 7);
        break;
      case 'month':
        from.setMonth(now.getMonth() - 1);
        break;
      case 'quarter':
        from.setMonth(now.getMonth() - 3);
        break;
      case 'year':
        from.setFullYear(now.getFullYear() - 1);
        break;
      default:
        from.setMonth(now.getMonth() - 1);
    }
    return this.incidents.getIncidentStatistics(tenantId, from.toISOString(), now.toISOString());
  }
  async getIncidentAnalyticsByType(tenantId: string, from?: string, to?: string) { return this.getIncidentsDashboard(tenantId, { from, to }).then((dashboard) => dashboard.incidentsByType); }
  async getIncidentAnalyticsBySeverity(tenantId: string, from?: string, to?: string) { return this.getIncidentsDashboard(tenantId, { from, to }).then((dashboard) => dashboard.incidentsBySeverity); }
  async getIncidentAnalyticsByStatus(tenantId: string, from?: string, to?: string) { return this.getIncidentsDashboard(tenantId, { from, to }).then((dashboard) => dashboard.incidentsByStatus); }
  async getIncidentResponseTimes(tenantId: string, from?: string, to?: string) { return this.getIncidentsDashboard(tenantId, { from, to }).then((dashboard) => ({ averageResolutionHours: dashboard.averageResolutionHours })); }
  async transitionAnalyticsAlert(id: string, tenantId: string, input: any) {
    return this.analytics.transitionAlert(id, tenantId, input);
  }
  async linkAnalyticsAlertIncident(id: string, tenantId: string, incidentId: string) {
    return this.analytics.linkIncident(id, tenantId, incidentId);
  }
  async getAlertNotificationPolicy(tenantId: string) {
    return this.analytics.getNotificationPolicy(tenantId);
  }
  async upsertAlertNotificationPolicy(policy: import("../domain/models.js").AlertNotificationPolicy) {
    return this.analytics.upsertNotificationPolicy(policy);
  }
  async enqueueAlertNotifications(input: Parameters<ControlPlaneStore["enqueueAlertNotifications"]>[0]) {
    return this.analytics.enqueueNotifications(input);
  }
  async claimAlertNotifications(limit: number, now: string) {
    return this.analytics.claimNotifications(limit, now);
  }
  async completeAlertNotification(id: string, result: Parameters<ControlPlaneStore["completeAlertNotification"]>[1]) {
    return this.analytics.completeNotification(id, result);
  }
  async recordVoiceCallEvent(id: string, event: Parameters<ControlPlaneStore["recordVoiceCallEvent"]>[1]) {
    return this.analytics.recordVoiceCallEvent(id, event);
  }
  async recordSmsDeliveryEvent(id: string, event: Parameters<ControlPlaneStore["recordSmsDeliveryEvent"]>[1]) {
    return this.analytics.recordSmsDeliveryEvent(id, event);
  }
  async recordEmailDeliveryEvent(id: string, event: Parameters<ControlPlaneStore["recordEmailDeliveryEvent"]>[1]) {
    return this.analytics.recordEmailDeliveryEvent(id, event);
  }
  async reserveSmsRateLimit(tenantId: string, limit: number, requested: number, now: string) {
    return this.analytics.reserveSmsRateLimit(tenantId, limit, requested, now);
  }
  async listAlertNotifications(tenantId: string, alertId?: string) {
    return this.analytics.listNotifications(tenantId, alertId);
  }
  async listOperationalReportSchedules(tenantId: string) { return this.operationalReports.listSchedules(tenantId); }
  async createOperationalReportSchedule(input: Parameters<ControlPlaneStore["createOperationalReportSchedule"]>[0]) { return this.operationalReports.createSchedule(input); }
  async updateOperationalReportSchedule(id: string, tenantId: string, updates: Parameters<ControlPlaneStore["updateOperationalReportSchedule"]>[2]) { return this.operationalReports.updateSchedule(id, tenantId, updates); }
  async deleteOperationalReportSchedule(id: string, tenantId: string) { return this.operationalReports.deleteSchedule(id, tenantId); }
  async claimDueOperationalReportSchedules(now: string, limit: number) { return this.operationalReports.claimDueSchedules(now, limit); }
  async createOperationalReportRun(input: Parameters<ControlPlaneStore["createOperationalReportRun"]>[0]) { return this.operationalReports.createRun(input); }
  async listOperationalReportRuns(tenantId: string, limit: number) { return this.operationalReports.listRuns(tenantId, limit); }
  async getOperationalReportRun(id: string, tenantId: string) { return this.operationalReports.getRun(id, tenantId); }
  async claimOperationalReportRuns(now: string, limit: number) { return this.operationalReports.claimRuns(now, limit); }
  async updateOperationalReportRun(id: string, updates: Parameters<ControlPlaneStore["updateOperationalReportRun"]>[1]) { return this.operationalReports.updateRun(id, updates); }
  async createOperationalReportArtifact(input: Parameters<ControlPlaneStore["createOperationalReportArtifact"]>[0]) { return this.operationalReports.createArtifact(input); }
  async listOperationalReportArtifacts(tenantId: string, runId: string) { return this.operationalReports.listArtifacts(tenantId, runId); }
  async getOperationalReportArtifact(id: string, tenantId: string) { return this.operationalReports.getArtifact(id, tenantId); }
  async enqueueOperationalReportDeliveries(input: Parameters<ControlPlaneStore["enqueueOperationalReportDeliveries"]>[0]) { return this.operationalReports.enqueueDeliveries(input); }
  async claimOperationalReportDeliveries(now: string, limit: number) { return this.operationalReports.claimDeliveries(now, limit); }
  async completeOperationalReportDelivery(id: string, result: Parameters<ControlPlaneStore["completeOperationalReportDelivery"]>[1]) { return this.operationalReports.completeDelivery(id, result); }
  async listOperationalReportDeliveries(tenantId: string, runId: string) { return this.operationalReports.listDeliveries(tenantId, runId); }
  // Audit method removed - not part of AuditRepository interface

  // ============ COMPLIANCE ENHANCED METHODS ============
  
  // Requirements
  async listComplianceRequirements(tenantId: string, filters?: {
    frameworkId?: string;
    category?: string;
    status?: string;
  }): Promise<any[]> {
    const result = await this.pool.query(
      `SELECT * FROM compliance_requirements
       WHERE tenant_id=$1
         AND ($2::uuid IS NULL OR framework_id=$2)
         AND ($3::text IS NULL OR category=$3)
         AND ($4::text IS NULL OR status=$4)
       ORDER BY requirement_number`,
      [tenantId, filters?.frameworkId ?? null, filters?.category ?? null, filters?.status ?? null]
    );
    return result.rows.map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      frameworkId: row.framework_id,
      requirementNumber: row.requirement_number,
      title: row.title,
      description: row.description,
      category: row.category,
      priority: row.priority,
      status: row.status,
      implementationGuidance: row.implementation_guidance,
      createdBy: row.created_by,
      createdAt: row.created_at?.toISOString(),
      updatedAt: row.updated_at?.toISOString(),
    }));
  }

  async getComplianceRequirement(id: string): Promise<any | undefined> {
    const result = await this.pool.query(`SELECT * FROM compliance_requirements WHERE id=$1`, [id]);
    if (!result.rows[0]) return undefined;
    const row = result.rows[0];
    return {
      id: row.id,
      tenantId: row.tenant_id,
      frameworkId: row.framework_id,
      requirementNumber: row.requirement_number,
      title: row.title,
      description: row.description,
      category: row.category,
      priority: row.priority,
      status: row.status,
      implementationGuidance: row.implementation_guidance,
      createdBy: row.created_by,
      createdAt: row.created_at?.toISOString(),
      updatedAt: row.updated_at?.toISOString(),
    };
  }

  async createComplianceRequirement(input: any): Promise<any> {
    const result = await this.pool.query(
      `INSERT INTO compliance_requirements (
        id, tenant_id, framework_id, requirement_number, title, description,
        category, priority, status, implementation_guidance, created_by, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now(),now()) RETURNING *`,
      [
        randomUUID(),
        input.tenantId,
        input.frameworkId,
        input.requirementNumber,
        input.title,
        input.description ?? null,
        input.category ?? null,
        input.priority ?? 'medium',
        input.status ?? 'active',
        input.implementationGuidance ?? null,
        input.createdBy ?? null,
      ]
    );
    const row = result.rows[0];
    return {
      id: row.id,
      tenantId: row.tenant_id,
      frameworkId: row.framework_id,
      requirementNumber: row.requirement_number,
      title: row.title,
      description: row.description,
      category: row.category,
      priority: row.priority,
      status: row.status,
      implementationGuidance: row.implementation_guidance,
      createdBy: row.created_by,
      createdAt: row.created_at?.toISOString(),
      updatedAt: row.updated_at?.toISOString(),
    };
  }

  async updateComplianceRequirement(id: string, input: any): Promise<any | undefined> {
    const updates: string[] = [];
    const values: any[] = [id];
    let paramIndex = 2;

    if (input.requirementNumber !== undefined) {
      updates.push(`requirement_number = $${paramIndex++}`);
      values.push(input.requirementNumber);
    }
    if (input.title !== undefined) {
      updates.push(`title = $${paramIndex++}`);
      values.push(input.title);
    }
    if (input.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(input.description);
    }
    if (input.category !== undefined) {
      updates.push(`category = $${paramIndex++}`);
      values.push(input.category);
    }
    if (input.priority !== undefined) {
      updates.push(`priority = $${paramIndex++}`);
      values.push(input.priority);
    }
    if (input.status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      values.push(input.status);
    }
    if (input.implementationGuidance !== undefined) {
      updates.push(`implementation_guidance = $${paramIndex++}`);
      values.push(input.implementationGuidance);
    }

    if (updates.length === 0) return this.getComplianceRequirement(id);

    updates.push('updated_at = now()');
    const result = await this.pool.query(
      `UPDATE compliance_requirements SET ${updates.join(', ')} WHERE id=$1 RETURNING *`,
      values
    );
    if (!result.rows[0]) return undefined;
    const row = result.rows[0];
    return {
      id: row.id,
      tenantId: row.tenant_id,
      frameworkId: row.framework_id,
      requirementNumber: row.requirement_number,
      title: row.title,
      description: row.description,
      category: row.category,
      priority: row.priority,
      status: row.status,
      implementationGuidance: row.implementation_guidance,
      createdBy: row.created_by,
      createdAt: row.created_at?.toISOString(),
      updatedAt: row.updated_at?.toISOString(),
    };
  }

  async deleteComplianceRequirement(id: string): Promise<void> {
    await this.pool.query(`DELETE FROM compliance_requirements WHERE id=$1`, [id]);
  }

  // Controls
  async listComplianceControls(tenantId: string, filters?: {
    requirementId?: string;
    implementationStatus?: string;
  }): Promise<any[]> {
    const result = await this.pool.query(
      `SELECT * FROM compliance_controls
       WHERE tenant_id=$1
         AND ($2::uuid IS NULL OR requirement_id=$2)
         AND ($3::text IS NULL OR implementation_status=$3)
       ORDER BY control_number`,
      [tenantId, filters?.requirementId ?? null, filters?.implementationStatus ?? null]
    );
    return result.rows.map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      requirementId: row.requirement_id,
      controlNumber: row.control_number,
      title: row.title,
      description: row.description,
      controlType: row.control_type,
      implementationStatus: row.implementation_status,
      implementationDetails: row.implementation_details,
      owner: row.owner,
      testingFrequency: row.testing_frequency,
      lastTestDate: row.last_test_date?.toISOString(),
      nextTestDate: row.next_test_date?.toISOString(),
      effectivenessRating: row.effectiveness_rating,
      createdBy: row.created_by,
      createdAt: row.created_at?.toISOString(),
      updatedAt: row.updated_at?.toISOString(),
    }));
  }

  async getComplianceControl(id: string): Promise<any | undefined> {
    const result = await this.pool.query(`SELECT * FROM compliance_controls WHERE id=$1`, [id]);
    if (!result.rows[0]) return undefined;
    const row = result.rows[0];
    return {
      id: row.id,
      tenantId: row.tenant_id,
      requirementId: row.requirement_id,
      controlNumber: row.control_number,
      title: row.title,
      description: row.description,
      controlType: row.control_type,
      implementationStatus: row.implementation_status,
      implementationDetails: row.implementation_details,
      owner: row.owner,
      testingFrequency: row.testing_frequency,
      lastTestDate: row.last_test_date?.toISOString(),
      nextTestDate: row.next_test_date?.toISOString(),
      effectivenessRating: row.effectiveness_rating,
      createdBy: row.created_by,
      createdAt: row.created_at?.toISOString(),
      updatedAt: row.updated_at?.toISOString(),
    };
  }

  async createComplianceControl(input: any): Promise<any> {
    const result = await this.pool.query(
      `INSERT INTO compliance_controls (
        id, tenant_id, requirement_id, control_number, title, description,
        control_type, implementation_status, implementation_details, owner,
        testing_frequency, last_test_date, next_test_date, effectiveness_rating,
        created_by, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,now(),now()) RETURNING *`,
      [
        randomUUID(),
        input.tenantId,
        input.requirementId,
        input.controlNumber,
        input.title,
        input.description ?? null,
        input.controlType ?? null,
        input.implementationStatus ?? 'not_started',
        input.implementationDetails ?? null,
        input.owner ?? null,
        input.testingFrequency ?? null,
        input.lastTestDate ?? null,
        input.nextTestDate ?? null,
        input.effectivenessRating ?? null,
        input.createdBy ?? null,
      ]
    );
    const row = result.rows[0];
    return {
      id: row.id,
      tenantId: row.tenant_id,
      requirementId: row.requirement_id,
      controlNumber: row.control_number,
      title: row.title,
      description: row.description,
      controlType: row.control_type,
      implementationStatus: row.implementation_status,
      implementationDetails: row.implementation_details,
      owner: row.owner,
      testingFrequency: row.testing_frequency,
      lastTestDate: row.last_test_date?.toISOString(),
      nextTestDate: row.next_test_date?.toISOString(),
      effectivenessRating: row.effectiveness_rating,
      createdBy: row.created_by,
      createdAt: row.created_at?.toISOString(),
      updatedAt: row.updated_at?.toISOString(),
    };
  }

  async updateComplianceControl(id: string, input: any): Promise<any | undefined> {
    const updates: string[] = [];
    const values: any[] = [id];
    let paramIndex = 2;

    const fields = [
      'controlNumber', 'title', 'description', 'controlType', 'implementationStatus',
      'implementationDetails', 'owner', 'testingFrequency', 'lastTestDate',
      'nextTestDate', 'effectivenessRating'
    ];
    
    for (const field of fields) {
      if (input[field] !== undefined) {
        const snakeCase = field.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
        updates.push(`${snakeCase} = $${paramIndex++}`);
        values.push(input[field]);
      }
    }

    if (updates.length === 0) return this.getComplianceControl(id);

    updates.push('updated_at = now()');
    const result = await this.pool.query(
      `UPDATE compliance_controls SET ${updates.join(', ')} WHERE id=$1 RETURNING *`,
      values
    );
    if (!result.rows[0]) return undefined;
    return this.getComplianceControl(id);
  }

  async deleteComplianceControl(id: string): Promise<void> {
    await this.pool.query(`DELETE FROM compliance_controls WHERE id=$1`, [id]);
  }

  async updateControlTestDates(id: string, input: {
    lastTestDate: string;
    nextTestDate: string;
    effectivenessRating?: number;
  }): Promise<any | undefined> {
    const result = await this.pool.query(
      `UPDATE compliance_controls
       SET last_test_date=$2, next_test_date=$3, effectiveness_rating=$4, updated_at=now()
       WHERE id=$1 RETURNING *`,
      [id, input.lastTestDate, input.nextTestDate, input.effectivenessRating ?? null]
    );
    if (!result.rows[0]) return undefined;
    return this.getComplianceControl(id);
  }

  // Evidence
  async listComplianceEvidence(tenantId: string, filters?: {
    requirementId?: string;
    controlId?: string;
    assessmentId?: string;
    validated?: boolean;
  }): Promise<any[]> {
    const result = await this.pool.query(
      `SELECT * FROM compliance_evidence
       WHERE tenant_id=$1
         AND ($2::uuid IS NULL OR requirement_id=$2)
         AND ($3::uuid IS NULL OR control_id=$3)
         AND ($4::uuid IS NULL OR assessment_id=$4)
         AND ($5::boolean IS NULL OR validated=$5)
       ORDER BY collected_at DESC`,
      [tenantId, filters?.requirementId ?? null, filters?.controlId ?? null, filters?.assessmentId ?? null, filters?.validated ?? null]
    );
    return result.rows.map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      requirementId: row.requirement_id,
      controlId: row.control_id,
      assessmentId: row.assessment_id,
      evidenceType: row.evidence_type,
      title: row.title,
      description: row.description,
      evidenceUrl: row.evidence_url,
      collectedAt: row.collected_at?.toISOString(),
      validated: row.validated,
      validatorId: row.validator_id,
      validationNotes: row.validation_notes,
      createdBy: row.created_by,
      createdAt: row.created_at?.toISOString(),
      updatedAt: row.updated_at?.toISOString(),
    }));
  }

  async getComplianceEvidence(id: string): Promise<any | undefined> {
    const result = await this.pool.query(`SELECT * FROM compliance_evidence WHERE id=$1`, [id]);
    if (!result.rows[0]) return undefined;
    const row = result.rows[0];
    return {
      id: row.id,
      tenantId: row.tenant_id,
      requirementId: row.requirement_id,
      controlId: row.control_id,
      assessmentId: row.assessment_id,
      evidenceType: row.evidence_type,
      title: row.title,
      description: row.description,
      evidenceUrl: row.evidence_url,
      collectedAt: row.collected_at?.toISOString(),
      validated: row.validated,
      validatorId: row.validator_id,
      validationNotes: row.validation_notes,
      createdBy: row.created_by,
      createdAt: row.created_at?.toISOString(),
      updatedAt: row.updated_at?.toISOString(),
    };
  }

  async createComplianceEvidence(input: any): Promise<any> {
    const result = await this.pool.query(
      `INSERT INTO compliance_evidence (
        id, tenant_id, requirement_id, control_id, assessment_id, evidence_type,
        title, description, evidence_url, collected_at, validated, validator_id,
        validation_notes, created_by, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,now(),now()) RETURNING *`,
      [
        randomUUID(),
        input.tenantId,
        input.requirementId ?? null,
        input.controlId ?? null,
        input.assessmentId ?? null,
        input.evidenceType,
        input.title,
        input.description ?? null,
        input.evidenceUrl ?? null,
        input.collectedAt ?? new Date().toISOString(),
        input.validated ?? false,
        input.validatorId ?? null,
        input.validationNotes ?? null,
        input.createdBy ?? null,
      ]
    );
    const row = result.rows[0];
    return {
      id: row.id,
      tenantId: row.tenant_id,
      requirementId: row.requirement_id,
      controlId: row.control_id,
      assessmentId: row.assessment_id,
      evidenceType: row.evidence_type,
      title: row.title,
      description: row.description,
      evidenceUrl: row.evidence_url,
      collectedAt: row.collected_at?.toISOString(),
      validated: row.validated,
      validatorId: row.validator_id,
      validationNotes: row.validation_notes,
      createdBy: row.created_by,
      createdAt: row.created_at?.toISOString(),
      updatedAt: row.updated_at?.toISOString(),
    };
  }

  async updateComplianceEvidence(id: string, input: any): Promise<any | undefined> {
    const updates: string[] = [];
    const values: any[] = [id];
    let paramIndex = 2;

    const fieldMapping: Record<string, string> = {
      evidenceType: 'evidence_type',
      title: 'title',
      description: 'description',
      evidenceUrl: 'evidence_url',
      collectedAt: 'collected_at',
      validated: 'validated',
      validatorId: 'validator_id',
      validationNotes: 'validation_notes',
    };

    for (const [camelKey, snakeKey] of Object.entries(fieldMapping)) {
      if (input[camelKey] !== undefined) {
        updates.push(`${snakeKey} = $${paramIndex++}`);
        values.push(input[camelKey]);
      }
    }

    if (updates.length === 0) return this.getComplianceEvidence(id);

    updates.push('updated_at = now()');
    const result = await this.pool.query(
      `UPDATE compliance_evidence SET ${updates.join(', ')} WHERE id=$1 RETURNING *`,
      values
    );
    if (!result.rows[0]) return undefined;
    return this.getComplianceEvidence(id);
  }

  async deleteComplianceEvidence(id: string): Promise<void> {
    await this.pool.query(`DELETE FROM compliance_evidence WHERE id=$1`, [id]);
  }

  async validateComplianceEvidence(id: string, validated: boolean, validatorId: string, notes?: string): Promise<any | undefined> {
    const result = await this.pool.query(
      `UPDATE compliance_evidence
       SET validated=$2, validator_id=$3, validation_notes=$4, updated_at=now()
       WHERE id=$1 RETURNING *`,
      [id, validated, validatorId, notes ?? null]
    );
    if (!result.rows[0]) return undefined;
    return this.getComplianceEvidence(id);
  }

  // Tests
  async listComplianceTests(tenantId: string, filters?: {
    controlId?: string;
    status?: string;
  }): Promise<any[]> {
    const result = await this.pool.query(
      `SELECT * FROM compliance_tests
       WHERE tenant_id=$1
         AND ($2::uuid IS NULL OR control_id=$2)
         AND ($3::text IS NULL OR status=$3)
       ORDER BY scheduled_date DESC`,
      [tenantId, filters?.controlId ?? null, filters?.status ?? null]
    );
    return result.rows.map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      controlId: row.control_id,
      testName: row.test_name,
      testProcedure: row.test_procedure,
      scheduledDate: row.scheduled_date?.toISOString(),
      completedDate: row.completed_date?.toISOString(),
      testerId: row.tester_id,
      status: row.status,
      result: row.result,
      findings: row.findings,
      evidenceIds: row.evidence_ids,
      createdBy: row.created_by,
      createdAt: row.created_at?.toISOString(),
      updatedAt: row.updated_at?.toISOString(),
    }));
  }

  async getComplianceTest(id: string): Promise<any | undefined> {
    const result = await this.pool.query(`SELECT * FROM compliance_tests WHERE id=$1`, [id]);
    if (!result.rows[0]) return undefined;
    const row = result.rows[0];
    return {
      id: row.id,
      tenantId: row.tenant_id,
      controlId: row.control_id,
      testName: row.test_name,
      testProcedure: row.test_procedure,
      scheduledDate: row.scheduled_date?.toISOString(),
      completedDate: row.completed_date?.toISOString(),
      testerId: row.tester_id,
      status: row.status,
      result: row.result,
      findings: row.findings,
      evidenceIds: row.evidence_ids,
      createdBy: row.created_by,
      createdAt: row.created_at?.toISOString(),
      updatedAt: row.updated_at?.toISOString(),
    };
  }

  async createComplianceTest(input: any): Promise<any> {
    const result = await this.pool.query(
      `INSERT INTO compliance_tests (
        id, tenant_id, control_id, test_name, test_procedure, scheduled_date,
        completed_date, tester_id, status, result, findings, evidence_ids,
        created_by, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,now(),now()) RETURNING *`,
      [
        randomUUID(),
        input.tenantId,
        input.controlId,
        input.testName,
        input.testProcedure ?? null,
        input.scheduledDate,
        input.completedDate ?? null,
        input.testerId ?? null,
        input.status ?? 'scheduled',
        input.result ?? null,
        input.findings ?? null,
        input.evidenceIds ? JSON.stringify(input.evidenceIds) : '[]',
        input.createdBy ?? null,
      ]
    );
    return this.getComplianceTest(result.rows[0].id);
  }

  async updateComplianceTest(id: string, input: any): Promise<any | undefined> {
    const updates: string[] = [];
    const values: any[] = [id];
    let paramIndex = 2;

    if (input.testName !== undefined) {
      updates.push(`test_name = $${paramIndex++}`);
      values.push(input.testName);
    }
    if (input.testProcedure !== undefined) {
      updates.push(`test_procedure = $${paramIndex++}`);
      values.push(input.testProcedure);
    }
    if (input.scheduledDate !== undefined) {
      updates.push(`scheduled_date = $${paramIndex++}`);
      values.push(input.scheduledDate);
    }
    if (input.completedDate !== undefined) {
      updates.push(`completed_date = $${paramIndex++}`);
      values.push(input.completedDate);
    }
    if (input.testerId !== undefined) {
      updates.push(`tester_id = $${paramIndex++}`);
      values.push(input.testerId);
    }
    if (input.status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      values.push(input.status);
    }
    if (input.result !== undefined) {
      updates.push(`result = $${paramIndex++}`);
      values.push(input.result);
    }
    if (input.findings !== undefined) {
      updates.push(`findings = $${paramIndex++}`);
      values.push(input.findings);
    }
    if (input.evidenceIds !== undefined) {
      updates.push(`evidence_ids = $${paramIndex++}`);
      values.push(JSON.stringify(input.evidenceIds));
    }

    if (updates.length === 0) return this.getComplianceTest(id);

    updates.push('updated_at = now()');
    const result = await this.pool.query(
      `UPDATE compliance_tests SET ${updates.join(', ')} WHERE id=$1 RETURNING *`,
      values
    );
    if (!result.rows[0]) return undefined;
    return this.getComplianceTest(id);
  }

  async deleteComplianceTest(id: string): Promise<void> {
    await this.pool.query(`DELETE FROM compliance_tests WHERE id=$1`, [id]);
  }

  // Findings
  async listComplianceFindings(tenantId: string, filters?: {
    assessmentId?: string;
    severity?: string;
    status?: string;
  }): Promise<any[]> {
    const result = await this.pool.query(
      `SELECT * FROM compliance_findings
       WHERE tenant_id=$1
         AND ($2::uuid IS NULL OR assessment_id=$2)
         AND ($3::text IS NULL OR severity=$3)
         AND ($4::text IS NULL OR status=$4)
       ORDER BY identified_date DESC`,
      [tenantId, filters?.assessmentId ?? null, filters?.severity ?? null, filters?.status ?? null]
    );
    return result.rows.map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      assessmentId: row.assessment_id,
      requirementId: row.requirement_id,
      controlId: row.control_id,
      findingNumber: row.finding_number,
      title: row.title,
      description: row.description,
      severity: row.severity,
      status: row.status,
      identifiedDate: row.identified_date?.toISOString(),
      dueDate: row.due_date?.toISOString(),
      closedDate: row.closed_date?.toISOString(),
      closedBy: row.closed_by,
      closureNotes: row.closure_notes,
      createdBy: row.created_by,
      createdAt: row.created_at?.toISOString(),
      updatedAt: row.updated_at?.toISOString(),
    }));
  }

  async getComplianceFinding(id: string): Promise<any | undefined> {
    const result = await this.pool.query(`SELECT * FROM compliance_findings WHERE id=$1`, [id]);
    if (!result.rows[0]) return undefined;
    const row = result.rows[0];
    return {
      id: row.id,
      tenantId: row.tenant_id,
      assessmentId: row.assessment_id,
      requirementId: row.requirement_id,
      controlId: row.control_id,
      findingNumber: row.finding_number,
      title: row.title,
      description: row.description,
      severity: row.severity,
      status: row.status,
      identifiedDate: row.identified_date?.toISOString(),
      dueDate: row.due_date?.toISOString(),
      closedDate: row.closed_date?.toISOString(),
      closedBy: row.closed_by,
      closureNotes: row.closure_notes,
      createdBy: row.created_by,
      createdAt: row.created_at?.toISOString(),
      updatedAt: row.updated_at?.toISOString(),
    };
  }

  async createComplianceFinding(input: any): Promise<any> {
    const result = await this.pool.query(
      `INSERT INTO compliance_findings (
        id, tenant_id, assessment_id, requirement_id, control_id, finding_number,
        title, description, severity, status, identified_date, due_date,
        closed_date, closed_by, closure_notes, created_by, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,now(),now()) RETURNING *`,
      [
        randomUUID(),
        input.tenantId,
        input.assessmentId ?? null,
        input.requirementId ?? null,
        input.controlId ?? null,
        input.findingNumber,
        input.title,
        input.description,
        input.severity,
        input.status ?? 'open',
        input.identifiedDate ?? new Date().toISOString(),
        input.dueDate ?? null,
        input.closedDate ?? null,
        input.closedBy ?? null,
        input.closureNotes ?? null,
        input.createdBy ?? null,
      ]
    );
    return this.getComplianceFinding(result.rows[0].id);
  }

  async updateComplianceFinding(id: string, input: any): Promise<any | undefined> {
    const updates: string[] = [];
    const values: any[] = [id];
    let paramIndex = 2;

    const fieldMapping: Record<string, string> = {
      findingNumber: 'finding_number',
      title: 'title',
      description: 'description',
      severity: 'severity',
      status: 'status',
      identifiedDate: 'identified_date',
      dueDate: 'due_date',
      closedDate: 'closed_date',
      closedBy: 'closed_by',
      closureNotes: 'closure_notes',
    };

    for (const [camelKey, snakeKey] of Object.entries(fieldMapping)) {
      if (input[camelKey] !== undefined) {
        updates.push(`${snakeKey} = $${paramIndex++}`);
        values.push(input[camelKey]);
      }
    }

    if (updates.length === 0) return this.getComplianceFinding(id);

    updates.push('updated_at = now()');
    const result = await this.pool.query(
      `UPDATE compliance_findings SET ${updates.join(', ')} WHERE id=$1 RETURNING *`,
      values
    );
    if (!result.rows[0]) return undefined;
    return this.getComplianceFinding(id);
  }

  async deleteComplianceFinding(id: string): Promise<void> {
    await this.pool.query(`DELETE FROM compliance_findings WHERE id=$1`, [id]);
  }

  async closeComplianceFinding(id: string, closedBy: string, notes?: string): Promise<any | undefined> {
    const result = await this.pool.query(
      `UPDATE compliance_findings
       SET status='closed', closed_date=now(), closed_by=$2, closure_notes=$3, updated_at=now()
       WHERE id=$1 RETURNING *`,
      [id, closedBy, notes ?? null]
    );
    if (!result.rows[0]) return undefined;
    return this.getComplianceFinding(id);
  }

  // Remediation Plans
  async listRemediationPlans(tenantId: string, filters?: {
    findingId?: string;
    status?: string;
  }): Promise<any[]> {
    const result = await this.pool.query(
      `SELECT * FROM remediation_plans
       WHERE tenant_id=$1
         AND ($2::uuid IS NULL OR finding_id=$2)
         AND ($3::text IS NULL OR status=$3)
       ORDER BY target_completion_date`,
      [tenantId, filters?.findingId ?? null, filters?.status ?? null]
    );
    return result.rows.map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      findingId: row.finding_id,
      planName: row.plan_name,
      description: row.description,
      owner: row.owner,
      targetCompletionDate: row.target_completion_date?.toISOString(),
      status: row.status,
      approvedBy: row.approved_by,
      approvedAt: row.approved_at?.toISOString(),
      verifiedBy: row.verified_by,
      verifiedAt: row.verified_at?.toISOString(),
      verificationNotes: row.verification_notes,
      effectivenessConfirmed: row.effectiveness_confirmed,
      createdBy: row.created_by,
      createdAt: row.created_at?.toISOString(),
      updatedAt: row.updated_at?.toISOString(),
    }));
  }

  async getRemediationPlan(id: string): Promise<any | undefined> {
    const result = await this.pool.query(`SELECT * FROM remediation_plans WHERE id=$1`, [id]);
    if (!result.rows[0]) return undefined;
    const row = result.rows[0];
    return {
      id: row.id,
      tenantId: row.tenant_id,
      findingId: row.finding_id,
      planName: row.plan_name,
      description: row.description,
      owner: row.owner,
      targetCompletionDate: row.target_completion_date?.toISOString(),
      status: row.status,
      approvedBy: row.approved_by,
      approvedAt: row.approved_at?.toISOString(),
      verifiedBy: row.verified_by,
      verifiedAt: row.verified_at?.toISOString(),
      verificationNotes: row.verification_notes,
      effectivenessConfirmed: row.effectiveness_confirmed,
      createdBy: row.created_by,
      createdAt: row.created_at?.toISOString(),
      updatedAt: row.updated_at?.toISOString(),
    };
  }

  async createRemediationPlan(input: any): Promise<any> {
    const result = await this.pool.query(
      `INSERT INTO remediation_plans (
        id, tenant_id, finding_id, plan_name, description, owner, target_completion_date,
        status, approved_by, approved_at, verified_by, verified_at, verification_notes,
        effectiveness_confirmed, created_by, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,now(),now()) RETURNING *`,
      [
        randomUUID(),
        input.tenantId,
        input.findingId,
        input.planName,
        input.description ?? null,
        input.owner ?? null,
        input.targetCompletionDate,
        input.status ?? 'draft',
        input.approvedBy ?? null,
        input.approvedAt ?? null,
        input.verifiedBy ?? null,
        input.verifiedAt ?? null,
        input.verificationNotes ?? null,
        input.effectivenessConfirmed ?? false,
        input.createdBy ?? null,
      ]
    );
    return this.getRemediationPlan(result.rows[0].id);
  }

  async updateRemediationPlan(id: string, input: any): Promise<any | undefined> {
    const updates: string[] = [];
    const values: any[] = [id];
    let paramIndex = 2;

    const fieldMapping: Record<string, string> = {
      planName: 'plan_name',
      description: 'description',
      owner: 'owner',
      targetCompletionDate: 'target_completion_date',
      status: 'status',
    };

    for (const [camelKey, snakeKey] of Object.entries(fieldMapping)) {
      if (input[camelKey] !== undefined) {
        updates.push(`${snakeKey} = $${paramIndex++}`);
        values.push(input[camelKey]);
      }
    }

    if (updates.length === 0) return this.getRemediationPlan(id);

    updates.push('updated_at = now()');
    const result = await this.pool.query(
      `UPDATE remediation_plans SET ${updates.join(', ')} WHERE id=$1 RETURNING *`,
      values
    );
    if (!result.rows[0]) return undefined;
    return this.getRemediationPlan(id);
  }

  async deleteRemediationPlan(id: string): Promise<void> {
    await this.pool.query(`DELETE FROM remediation_plans WHERE id=$1`, [id]);
  }

  async approveRemediationPlan(id: string, approverId: string): Promise<any | undefined> {
    const result = await this.pool.query(
      `UPDATE remediation_plans
       SET status='approved', approved_by=$2, approved_at=now(), updated_at=now()
       WHERE id=$1 RETURNING *`,
      [id, approverId]
    );
    if (!result.rows[0]) return undefined;
    return this.getRemediationPlan(id);
  }

  async verifyRemediationPlan(id: string, verifierId: string, input: {
    verificationNotes?: string;
    effectivenessConfirmed: boolean;
  }): Promise<any | undefined> {
    const result = await this.pool.query(
      `UPDATE remediation_plans
       SET status='verified', verified_by=$2, verified_at=now(),
           verification_notes=$3, effectiveness_confirmed=$4, updated_at=now()
       WHERE id=$1 RETURNING *`,
      [id, verifierId, input.verificationNotes ?? null, input.effectivenessConfirmed]
    );
    if (!result.rows[0]) return undefined;
    return this.getRemediationPlan(id);
  }

  // Remediation Actions
  async listRemediationActions(planId: string): Promise<any[]> {
    const result = await this.pool.query(
      `SELECT * FROM remediation_actions WHERE plan_id=$1 ORDER BY due_date`,
      [planId]
    );
    return result.rows.map((row) => ({
      id: row.id,
      planId: row.plan_id,
      actionName: row.action_name,
      description: row.description,
      assignedTo: row.assigned_to,
      dueDate: row.due_date?.toISOString(),
      status: row.status,
      completedDate: row.completed_date?.toISOString(),
      evidenceUrl: row.evidence_url,
      notes: row.notes,
      createdAt: row.created_at?.toISOString(),
      updatedAt: row.updated_at?.toISOString(),
    }));
  }

  async getRemediationAction(id: string): Promise<any | undefined> {
    const result = await this.pool.query(`SELECT * FROM remediation_actions WHERE id=$1`, [id]);
    if (!result.rows[0]) return undefined;
    const row = result.rows[0];
    return {
      id: row.id,
      planId: row.plan_id,
      actionName: row.action_name,
      description: row.description,
      assignedTo: row.assigned_to,
      dueDate: row.due_date?.toISOString(),
      status: row.status,
      completedDate: row.completed_date?.toISOString(),
      evidenceUrl: row.evidence_url,
      notes: row.notes,
      createdAt: row.created_at?.toISOString(),
      updatedAt: row.updated_at?.toISOString(),
    };
  }

  async createRemediationAction(input: any): Promise<any> {
    const result = await this.pool.query(
      `INSERT INTO remediation_actions (
        id, plan_id, action_name, description, assigned_to, due_date,
        status, completed_date, evidence_url, notes, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now(),now()) RETURNING *`,
      [
        randomUUID(),
        input.planId,
        input.actionName,
        input.description ?? null,
        input.assignedTo ?? null,
        input.dueDate,
        input.status ?? 'pending',
        input.completedDate ?? null,
        input.evidenceUrl ?? null,
        input.notes ?? null,
      ]
    );
    return this.getRemediationAction(result.rows[0].id);
  }

  async updateRemediationAction(id: string, input: any): Promise<any | undefined> {
    const updates: string[] = [];
    const values: any[] = [id];
    let paramIndex = 2;

    const fieldMapping: Record<string, string> = {
      actionName: 'action_name',
      description: 'description',
      assignedTo: 'assigned_to',
      dueDate: 'due_date',
      status: 'status',
      completedDate: 'completed_date',
      evidenceUrl: 'evidence_url',
      notes: 'notes',
    };

    for (const [camelKey, snakeKey] of Object.entries(fieldMapping)) {
      if (input[camelKey] !== undefined) {
        updates.push(`${snakeKey} = $${paramIndex++}`);
        values.push(input[camelKey]);
      }
    }

    if (updates.length === 0) return this.getRemediationAction(id);

    updates.push('updated_at = now()');
    const result = await this.pool.query(
      `UPDATE remediation_actions SET ${updates.join(', ')} WHERE id=$1 RETURNING *`,
      values
    );
    if (!result.rows[0]) return undefined;
    return this.getRemediationAction(id);
  }

  async deleteRemediationAction(id: string): Promise<void> {
    await this.pool.query(`DELETE FROM remediation_actions WHERE id=$1`, [id]);
  }

  async completeRemediationAction(id: string, input: {
    evidenceUrl?: string;
    notes?: string;
  }): Promise<any | undefined> {
    const result = await this.pool.query(
      `UPDATE remediation_actions
       SET status='completed', completed_date=now(), evidence_url=$2, notes=$3, updated_at=now()
       WHERE id=$1 RETURNING *`,
      [id, input.evidenceUrl ?? null, input.notes ?? null]
    );
    if (!result.rows[0]) return undefined;
    return this.getRemediationAction(id);
  }

  // Risks
  async listComplianceRisks(tenantId: string, filters?: {
    frameworkId?: string;
    category?: string;
    status?: string;
  }): Promise<any[]> {
    const result = await this.pool.query(
      `SELECT * FROM compliance_risks
       WHERE tenant_id=$1
         AND ($2::uuid IS NULL OR framework_id=$2)
         AND ($3::text IS NULL OR category=$3)
         AND ($4::text IS NULL OR status=$4)
       ORDER BY created_at DESC`,
      [tenantId, filters?.frameworkId ?? null, filters?.category ?? null, filters?.status ?? null]
    );
    return result.rows.map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      frameworkId: row.framework_id,
      requirementId: row.requirement_id,
      riskName: row.risk_name,
      description: row.description,
      category: row.category,
      inherentLikelihood: row.inherent_likelihood,
      inherentImpact: row.inherent_impact,
      residualLikelihood: row.residual_likelihood,
      residualImpact: row.residual_impact,
      treatmentPlan: row.treatment_plan,
      owner: row.owner,
      status: row.status,
      lastReviewDate: row.last_review_date?.toISOString(),
      nextReviewDate: row.next_review_date?.toISOString(),
      reviewNotes: row.review_notes,
      createdBy: row.created_by,
      createdAt: row.created_at?.toISOString(),
      updatedAt: row.updated_at?.toISOString(),
    }));
  }

  async getComplianceRisk(id: string): Promise<any | undefined> {
    const result = await this.pool.query(`SELECT * FROM compliance_risks WHERE id=$1`, [id]);
    if (!result.rows[0]) return undefined;
    const row = result.rows[0];
    return {
      id: row.id,
      tenantId: row.tenant_id,
      frameworkId: row.framework_id,
      requirementId: row.requirement_id,
      riskName: row.risk_name,
      description: row.description,
      category: row.category,
      inherentLikelihood: row.inherent_likelihood,
      inherentImpact: row.inherent_impact,
      residualLikelihood: row.residual_likelihood,
      residualImpact: row.residual_impact,
      treatmentPlan: row.treatment_plan,
      owner: row.owner,
      status: row.status,
      lastReviewDate: row.last_review_date?.toISOString(),
      nextReviewDate: row.next_review_date?.toISOString(),
      reviewNotes: row.review_notes,
      createdBy: row.created_by,
      createdAt: row.created_at?.toISOString(),
      updatedAt: row.updated_at?.toISOString(),
    };
  }

  async createComplianceRisk(input: any): Promise<any> {
    const result = await this.pool.query(
      `INSERT INTO compliance_risks (
        id, tenant_id, framework_id, requirement_id, risk_name, description,
        category, inherent_likelihood, inherent_impact, residual_likelihood,
        residual_impact, treatment_plan, owner, status, last_review_date,
        next_review_date, review_notes, created_by, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,now(),now()) RETURNING *`,
      [
        randomUUID(),
        input.tenantId,
        input.frameworkId ?? null,
        input.requirementId ?? null,
        input.riskName,
        input.description ?? null,
        input.category ?? null,
        input.inherentLikelihood,
        input.inherentImpact,
        input.residualLikelihood ?? null,
        input.residualImpact ?? null,
        input.treatmentPlan ?? null,
        input.owner ?? null,
        input.status ?? 'identified',
        input.lastReviewDate ?? null,
        input.nextReviewDate ?? null,
        input.reviewNotes ?? null,
        input.createdBy ?? null,
      ]
    );
    return this.getComplianceRisk(result.rows[0].id);
  }

  async updateComplianceRisk(id: string, input: any): Promise<any | undefined> {
    const updates: string[] = [];
    const values: any[] = [id];
    let paramIndex = 2;

    const fieldMapping: Record<string, string> = {
      riskName: 'risk_name',
      description: 'description',
      category: 'category',
      inherentLikelihood: 'inherent_likelihood',
      inherentImpact: 'inherent_impact',
      residualLikelihood: 'residual_likelihood',
      residualImpact: 'residual_impact',
      treatmentPlan: 'treatment_plan',
      owner: 'owner',
      status: 'status',
      lastReviewDate: 'last_review_date',
      nextReviewDate: 'next_review_date',
      reviewNotes: 'review_notes',
    };

    for (const [camelKey, snakeKey] of Object.entries(fieldMapping)) {
      if (input[camelKey] !== undefined) {
        updates.push(`${snakeKey} = $${paramIndex++}`);
        values.push(input[camelKey]);
      }
    }

    if (updates.length === 0) return this.getComplianceRisk(id);

    updates.push('updated_at = now()');
    const result = await this.pool.query(
      `UPDATE compliance_risks SET ${updates.join(', ')} WHERE id=$1 RETURNING *`,
      values
    );
    if (!result.rows[0]) return undefined;
    return this.getComplianceRisk(id);
  }

  async deleteComplianceRisk(id: string): Promise<void> {
    await this.pool.query(`DELETE FROM compliance_risks WHERE id=$1`, [id]);
  }

  async assessComplianceRisk(id: string, input: {
    residualLikelihood: string;
    residualImpact: string;
    treatmentPlan?: string;
  }): Promise<any | undefined> {
    const result = await this.pool.query(
      `UPDATE compliance_risks
       SET residual_likelihood=$2, residual_impact=$3, treatment_plan=$4, status='assessed', updated_at=now()
       WHERE id=$1 RETURNING *`,
      [id, input.residualLikelihood, input.residualImpact, input.treatmentPlan ?? null]
    );
    if (!result.rows[0]) return undefined;
    return this.getComplianceRisk(id);
  }

  async reviewComplianceRisk(id: string, input: {
    reviewNotes?: string;
    nextReviewDate: string;
  }): Promise<any | undefined> {
    const result = await this.pool.query(
      `UPDATE compliance_risks
       SET last_review_date=now(), next_review_date=$2, review_notes=$3, updated_at=now()
       WHERE id=$1 RETURNING *`,
      [id, input.nextReviewDate, input.reviewNotes ?? null]
    );
    if (!result.rows[0]) return undefined;
    return this.getComplianceRisk(id);
  }

  // Dashboard & Reporting
  async getComplianceDashboard(tenantId: string, frameworkId?: string): Promise<any> {
    const requirementsQuery = await this.pool.query(
      `SELECT COUNT(*) as total FROM compliance_requirements
       WHERE tenant_id=$1 AND ($2::uuid IS NULL OR framework_id=$2)`,
      [tenantId, frameworkId ?? null]
    );

    const controlsQuery = await this.pool.query(
      `SELECT COUNT(*) as total,
              COUNT(*) FILTER (WHERE implementation_status='implemented') as implemented
       FROM compliance_controls c
       INNER JOIN compliance_requirements r ON c.requirement_id = r.id
       WHERE r.tenant_id=$1 AND ($2::uuid IS NULL OR r.framework_id=$2)`,
      [tenantId, frameworkId ?? null]
    );

    const findingsQuery = await this.pool.query(
      `SELECT COUNT(*) as total,
              COUNT(*) FILTER (WHERE severity='critical') as critical
       FROM compliance_findings
       WHERE tenant_id=$1 AND status='open'`,
      [tenantId]
    );

    const risksQuery = await this.pool.query(
      `SELECT COUNT(*) as high_risks
       FROM compliance_risks
       WHERE tenant_id=$1
         AND ($2::uuid IS NULL OR framework_id=$2)
         AND status='identified' AND inherent_impact='high'`,
      [tenantId, frameworkId ?? null]
    );

    const totalRequirements = parseInt(requirementsQuery.rows[0]?.total || '0', 10);
    const totalControls = parseInt(controlsQuery.rows[0]?.total || '0', 10);
    const implementedControls = parseInt(controlsQuery.rows[0]?.implemented || '0', 10);
    const openFindings = parseInt(findingsQuery.rows[0]?.total || '0', 10);
    const criticalFindings = parseInt(findingsQuery.rows[0]?.critical || '0', 10);
    const highRisks = parseInt(risksQuery.rows[0]?.high_risks || '0', 10);

    return {
      totalRequirements,
      implementedControls,
      totalControls,
      openFindings,
      criticalFindings,
      highRisks,
      complianceScore: totalControls > 0
        ? Math.round((implementedControls / totalControls) * 100)
        : 0,
    };
  }

  async getRequirementStatus(id: string): Promise<any> {
    const requirement = await this.getComplianceRequirement(id);
    if (!requirement) return undefined;

    const controlsQuery = await this.pool.query(
      `SELECT COUNT(*) as total,
              COUNT(*) FILTER (WHERE implementation_status='implemented') as implemented
       FROM compliance_controls WHERE requirement_id=$1`,
      [id]
    );

    const evidenceQuery = await this.pool.query(
      `SELECT COUNT(*) as total,
              COUNT(*) FILTER (WHERE validated=true) as validated
       FROM compliance_evidence WHERE requirement_id=$1`,
      [id]
    );

    return {
      requirement,
      totalControls: parseInt(controlsQuery.rows[0]?.total || '0', 10),
      implementedControls: parseInt(controlsQuery.rows[0]?.implemented || '0', 10),
      totalEvidence: parseInt(evidenceQuery.rows[0]?.total || '0', 10),
      validatedEvidence: parseInt(evidenceQuery.rows[0]?.validated || '0', 10),
    };
  }

  async getFrameworkCoverage(id: string): Promise<any> {
    const requirementsQuery = await this.pool.query(
      `SELECT category, COUNT(*) as total
       FROM compliance_requirements
       WHERE framework_id=$1
       GROUP BY category`,
      [id]
    );

    const controlsQuery = await this.pool.query(
      `SELECT r.category,
              COUNT(*) as total_controls,
              COUNT(*) FILTER (WHERE c.implementation_status='implemented') as implemented_controls
       FROM compliance_controls c
       INNER JOIN compliance_requirements r ON c.requirement_id = r.id
       WHERE r.framework_id=$1
       GROUP BY r.category`,
      [id]
    );

    const totalRequirementsQuery = await this.pool.query(
      `SELECT COUNT(*) as total FROM compliance_requirements WHERE framework_id=$1`,
      [id]
    );

    const totalControlsQuery = await this.pool.query(
      `SELECT COUNT(*) as total,
              COUNT(*) FILTER (WHERE implementation_status='implemented') as implemented
       FROM compliance_controls c
       INNER JOIN compliance_requirements r ON c.requirement_id = r.id
       WHERE r.framework_id=$1`,
      [id]
    );

    const coverageByCategory = requirementsQuery.rows.map((reqRow) => {
      const controlRow = controlsQuery.rows.find((c) => c.category === reqRow.category);
      return {
        category: reqRow.category,
        totalRequirements: parseInt(reqRow.total, 10),
        totalControls: parseInt(controlRow?.total_controls || '0', 10),
        implementedControls: parseInt(controlRow?.implemented_controls || '0', 10),
      };
    });

    return {
      frameworkId: id,
      totalRequirements: parseInt(totalRequirementsQuery.rows[0]?.total || '0', 10),
      totalControls: parseInt(totalControlsQuery.rows[0]?.total || '0', 10),
      implementedControls: parseInt(totalControlsQuery.rows[0]?.implemented || '0', 10),
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
    const result = await this.pool.query(
      `SELECT * FROM compliance_audit_log
       WHERE tenant_id=$1
         AND ($2::text IS NULL OR entity_type=$2)
         AND ($3::uuid IS NULL OR entity_id=$3)
         AND ($4::text IS NULL OR action=$4)
         AND ($5::timestamptz IS NULL OR created_at >= $5)
         AND ($6::timestamptz IS NULL OR created_at <= $6)
       ORDER BY created_at DESC
       LIMIT $7`,
      [
        tenantId,
        filters?.entityType ?? null,
        filters?.entityId ?? null,
        filters?.action ?? null,
        filters?.from ?? null,
        filters?.to ?? null,
        filters?.limit ?? 100,
      ]
    );

    return result.rows.map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      entityType: row.entity_type,
      entityId: row.entity_id,
      action: row.action,
      userId: row.user_id,
      changes: row.changes,
      createdAt: row.created_at?.toISOString(),
    }));
  }
}

  // ============================================
  // Activity Tracking Store Methods
  // ============================================

  async startActivitySession(
    userId: string,
    tenantId: string,
    deviceInfo: any,
    ipAddress: string,
    locationInfo?: any
  ): Promise<string> {
    return this.activityTracking.startActivitySession(userId, tenantId, deviceInfo, ipAddress, locationInfo);
  }

  async endActivitySession(sessionId: string, userId: string): Promise<void> {
    return this.activityTracking.endActivitySession(sessionId, userId);
  }

  async updateSessionHeartbeat(sessionId: string, userId: string): Promise<void> {
    return this.activityTracking.updateSessionHeartbeat(sessionId, userId);
  }

  async trackPageVisit(
    userId: string,
    tenantId: string,
    sessionId: string,
    pagePath: string,
    pageTitle: string | null,
    pageModule: string,
    pageCategory: string | null,
    referrerPath: string | null,
    queryParameters: any
  ): Promise<string> {
    return this.activityTracking.trackPageVisit(
      userId, tenantId, sessionId, pagePath, pageTitle,
      pageModule, pageCategory, referrerPath, queryParameters
    );
  }

  async endPageVisit(
    pageVisitId: string,
    userId: string,
    durationSeconds: number,
    activeTimeSeconds: number,
    idleTimeSeconds: number,
    clickCount: number,
    scrollDepthPercentage: number,
    formInteractionsCount: number,
    nextPagePath: string | null
  ): Promise<void> {
    return this.activityTracking.endPageVisit(
      pageVisitId, userId, durationSeconds, activeTimeSeconds, idleTimeSeconds,
      clickCount, scrollDepthPercentage, formInteractionsCount, nextPagePath
    );
  }

  async startControlRoomActivity(
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
  ): Promise<string> {
    return this.activityTracking.startControlRoomActivity(
      userId, tenantId, sessionId, pageVisitId, monitoringType,
      branchNodeId, branchGroupId, branchGroupName,
      cameraIds, branchIds, branchNames, monitoringMode
    );
  }

  async endControlRoomActivity(
    activityId: string,
    userId: string,
    durationSeconds: number,
    alertCount: number,
    incidentCount: number,
    cameraSwitchCount: number,
    playbackCount: number,
    snapshotCount: number,
    exportCount: number
  ): Promise<void> {
    return this.activityTracking.endControlRoomActivity(
      activityId, userId, durationSeconds, alertCount, incidentCount,
      cameraSwitchCount, playbackCount, snapshotCount, exportCount
    );
  }

  async updateControlRoomActivity(
    activityId: string,
    userId: string,
    alertCount: number | null,
    incidentCount: number | null,
    cameraSwitchCount: number | null
  ): Promise<void> {
    return this.activityTracking.updateControlRoomActivity(
      activityId, userId, alertCount, incidentCount, cameraSwitchCount
    );
  }

  async logUserAction(
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
  ): Promise<void> {
    return this.activityTracking.logUserAction(
      userId, tenantId, sessionId, pageVisitId, actionType,
      actionCategory, actionTarget, actionDescription,
      moduleName, featureName, actionMetadata
    );
  }

  async getCurrentActivity(tenantId: string): Promise<any[]> {
    return this.activityTracking.getCurrentActivity(tenantId);
  }

  async getUserCurrentActivity(userId: string): Promise<any | null> {
    return this.activityTracking.getUserCurrentActivity(userId);
  }

  async getActivitySessions(
    tenantId: string,
    userId: string,
    startDate: string | null,
    endDate: string | null,
    limit: number,
    offset: number
  ): Promise<{ sessions: any[]; total: number }> {
    return this.activityTracking.getActivitySessions(
      tenantId, userId, startDate, endDate, limit, offset
    );
  }

  async getPageVisits(
    tenantId: string,
    userId: string,
    sessionId: string | null,
    module: string | null,
    startDate: string | null,
    endDate: string | null,
    limit: number,
    offset: number
  ): Promise<any[]> {
    return this.activityTracking.getPageVisits(
      tenantId, userId, sessionId, module, startDate, endDate, limit, offset
    );
  }

  async getControlRoomActivities(
    tenantId: string,
    userId: string,
    branchId: string | null,
    startDate: string | null,
    endDate: string | null,
    limit: number,
    offset: number
  ): Promise<any[]> {
    return this.activityTracking.getControlRoomActivities(
      tenantId, userId, branchId, startDate, endDate, limit, offset
    );
  }

  async getDailySummary(
    tenantId: string,
    userId: string,
    startDate: string,
    endDate: string
  ): Promise<any[]> {
    return this.activityTracking.getDailySummary(tenantId, userId, startDate, endDate);
  }

  async getWeeklySummary(
    tenantId: string,
    userId: string,
    year: number,
    weeks: number
  ): Promise<any[]> {
    return this.activityTracking.getWeeklySummary(tenantId, userId, year, weeks);
  }

  async getMonthlySummary(
    tenantId: string,
    userId: string,
    year: number,
    months: number
  ): Promise<any[]> {
    return this.activityTracking.getMonthlySummary(tenantId, userId, year, months);
  }

  async getComprehensiveReport(
    tenantId: string,
    userId: string,
    startDate: string,
    endDate: string
  ): Promise<any> {
    return this.activityTracking.getComprehensiveReport(tenantId, userId, startDate, endDate);
  }
}
