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
import { LiveOperationsRepository } from "./live-operations-repository.js";
import { AnalyticsRepository } from "./analytics-repository.js";
import { EvidenceRepository } from "./evidence-repository.js";
import IncidentRepository from "./incident-repository.js";
import { ComplianceRepository } from "./compliance-repository.js";
import { MaintenanceRepository } from "./maintenance-repository.js";
import { PrivacyRepository } from "./privacy-repository.js";

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
  private readonly liveOperations: LiveOperationsRepository;
  private readonly analytics: AnalyticsRepository;
  private readonly evidence: EvidenceRepository;
  private readonly incidents: IncidentRepository;
  private readonly compliance: ComplianceRepository;
  private readonly maintenance: MaintenanceRepository;
  private readonly privacy: PrivacyRepository;

  constructor(pool: Pool) {
    super(pool);
    this.users = new UserRepository(pool);
    this.resources = new ResourceRepository(pool);
    this.cameras = new CameraRepository(pool);
    this.agents = new EdgeAgentRepository(pool);
    this.audits = new AuditRepository(pool);
    this.recordings = new RecordingRepository(pool);
    this.liveOperations = new LiveOperationsRepository(pool);
    this.analytics = new AnalyticsRepository(pool);
    this.evidence = new EvidenceRepository(pool);
    this.incidents = new IncidentRepository(pool);
    this.compliance = new ComplianceRepository(pool);
    this.maintenance = new MaintenanceRepository(pool);
    this.privacy = new PrivacyRepository(pool);
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
  async listDiscoveredCameras(branchId: string) {
    return this.agents.listDiscoveries(branchId);
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
  async getRecordingSegment(id: string) { return this.recordings.getSegment(id); }
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
  async updateIncidentStatus(id: string, status: any, changedBy?: string, notes?: string) { return this.incidents.updateStatus(id, status, changedBy, notes); }
  async assignIncident(id: string, userId: string) { return this.incidents.assignIncident(id, userId); }
  async addIncidentCamera(incidentId: string, cameraId: string) { return this.incidents.addCamera(incidentId, cameraId); }
  async addIncidentVideoRange(incidentId: string, cameraId: string, fromAt: string, toAt: string) { return this.incidents.addVideoRange(incidentId, cameraId, fromAt, toAt); }
  async listIncidentTimeline(incidentId: string) { return this.incidents.listTimeline(incidentId); }
  async addIncidentEvent(incidentId: string, eventType: string, details: any, createdBy?: string) { return this.incidents.addEvent(incidentId, eventType, details, createdBy); }
  async transitionAnalyticsAlert(id: string, tenantId: string, input: any) {
    return this.analytics.transitionAlert(id, tenantId, input);
  }
  async linkAnalyticsAlertIncident(id: string, tenantId: string, incidentId: string) {
    return this.analytics.linkIncident(id, tenantId, incidentId);
  }
  async writeAudit(event: AuditEventInput) { await this.audits.write(event); }

}
