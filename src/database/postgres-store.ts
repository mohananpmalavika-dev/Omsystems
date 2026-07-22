import { randomUUID } from "node:crypto";
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
  async heartbeatEdgeAgent(id: string, version: string, publicMediaUrl?: string) {
    return this.agents.heartbeat(id, version, publicMediaUrl);
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
  async updateIncident(id: string, updates: any) { throw new Error('Incident management not implemented in PostgresStore - use MemoryStore'); }
  async updateIncidentStatus(id: string, status: any, changedBy: string, notes?: string) { throw new Error('Incident management not implemented in PostgresStore - use MemoryStore'); }
  async assignIncident(id: string, userId: string, assignedBy: string) { throw new Error('Incident management not implemented in PostgresStore - use MemoryStore'); }
  async escalateIncident(id: string, escalatedBy: string, reason: string, recipients?: string[]) { throw new Error('Incident management not implemented in PostgresStore - use MemoryStore'); }
  async closeIncident(id: string, closedBy: string, notes?: string) { throw new Error('Incident management not implemented in PostgresStore - use MemoryStore'); }
  async reopenIncident(id: string, reopenedBy: string, reason: string) { throw new Error('Incident management not implemented in PostgresStore - use MemoryStore'); }
  
  async addIncidentParticipant(input: any) { throw new Error('Incident management not implemented in PostgresStore - use MemoryStore'); }
  async listIncidentParticipants(incidentId: string): Promise<any[]> { throw new Error('Incident management not implemented in PostgresStore - use MemoryStore'); }
  
  async addIncidentCamera(incidentId: string, cameraId: string, isPrimary: boolean, addedBy: string) { throw new Error('Incident management not implemented in PostgresStore - use MemoryStore'); }
  async listIncidentCameras(incidentId: string): Promise<any[]> { throw new Error('Incident management not implemented in PostgresStore - use MemoryStore'); }
  
  async addIncidentVideoRange(input: any) { throw new Error('Incident management not implemented in PostgresStore - use MemoryStore'); }
  async preserveIncidentVideoAutomatic(input: any) { throw new Error('Incident management not implemented in PostgresStore - use MemoryStore'); }
  async listIncidentVideoRanges(incidentId: string): Promise<any[]> { throw new Error('Incident management not implemented in PostgresStore - use MemoryStore'); }
  
  async listIncidentTimeline(incidentId: string): Promise<any[]> { throw new Error('Incident management not implemented in PostgresStore - use MemoryStore'); }
  async addIncidentEvent(input: any) { throw new Error('Incident management not implemented in PostgresStore - use MemoryStore'); }
  
  async createIncidentClip(input: any) { throw new Error('Incident management not implemented in PostgresStore - use MemoryStore'); }
  async listIncidentClips(incidentId: string): Promise<any[]> { throw new Error('Incident management not implemented in PostgresStore - use MemoryStore'); }
  
  async createIncidentSnapshot(input: any) { throw new Error('Incident management not implemented in PostgresStore - use MemoryStore'); }
  async listIncidentSnapshots(incidentId: string): Promise<any[]> { throw new Error('Incident management not implemented in PostgresStore - use MemoryStore'); }
  
  async addIncidentEvidenceItem(input: any) { throw new Error('Incident management not implemented in PostgresStore - use MemoryStore'); }
  async listIncidentEvidenceItems(incidentId: string): Promise<any[]> { throw new Error('Incident management not implemented in PostgresStore - use MemoryStore'); }
  
  async createIncidentEvidencePackage(input: any) { throw new Error('Incident management not implemented in PostgresStore - use MemoryStore'); }
  async getIncidentEvidencePackage(id: string) { throw new Error('Incident management not implemented in PostgresStore - use MemoryStore'); }
  async listIncidentEvidencePackages(incidentId: string): Promise<any[]> { throw new Error('Incident management not implemented in PostgresStore - use MemoryStore'); }
  async approveEvidencePackage(id: string, approvedBy: string) { throw new Error('Incident management not implemented in PostgresStore - use MemoryStore'); }
  async recordEvidencePackageDownload(id: string, downloadedBy: string) { throw new Error('Incident management not implemented in PostgresStore - use MemoryStore'); }
  
  async createPoliceIntimation(input: any) { throw new Error('Incident management not implemented in PostgresStore - use MemoryStore'); }
  async listPoliceIntimations(incidentId: string): Promise<any[]> { throw new Error('Incident management not implemented in PostgresStore - use MemoryStore'); }
  async updatePoliceIntimation(id: string, updates: any) { throw new Error('Incident management not implemented in PostgresStore - use MemoryStore'); }
  async recordPoliceEvidenceTransfer(input: any) { throw new Error('Incident management not implemented in PostgresStore - use MemoryStore'); }
  async listPoliceEvidenceTransfers(intimationId: string): Promise<any[]> { throw new Error('Incident management not implemented in PostgresStore - use MemoryStore'); }
  
  async createInsuranceClaim(input: any) { throw new Error('Incident management not implemented in PostgresStore - use MemoryStore'); }
  async listInsuranceClaims(incidentId: string): Promise<any[]> { throw new Error('Incident management not implemented in PostgresStore - use MemoryStore'); }
  async updateInsuranceClaim(id: string, updates: any) { throw new Error('Incident management not implemented in PostgresStore - use MemoryStore'); }
  async addInsuranceDocument(input: any) { throw new Error('Incident management not implemented in PostgresStore - use MemoryStore'); }
  async listInsuranceDocuments(claimId: string): Promise<any[]> { throw new Error('Incident management not implemented in PostgresStore - use MemoryStore'); }
  
  async createIncidentTask(input: any) { throw new Error('Incident management not implemented in PostgresStore - use MemoryStore'); }
  async listIncidentTasks(incidentId: string): Promise<any[]> { throw new Error('Incident management not implemented in PostgresStore - use MemoryStore'); }
  async updateIncidentTask(id: string, updates: any) { throw new Error('Incident management not implemented in PostgresStore - use MemoryStore'); }
  async completeIncidentTask(id: string, completedBy: string, notes?: string) { throw new Error('Incident management not implemented in PostgresStore - use MemoryStore'); }
  
  async addIncidentNote(input: any) { throw new Error('Incident management not implemented in PostgresStore - use MemoryStore'); }
  async listIncidentNotes(incidentId: string): Promise<any[]> { throw new Error('Incident management not implemented in PostgresStore - use MemoryStore'); }
  async updateIncidentNote(id: string, content: string) { throw new Error('Incident management not implemented in PostgresStore - use MemoryStore'); }
  async deleteIncidentNote(id: string) { throw new Error('Incident management not implemented in PostgresStore - use MemoryStore'); }
  
  async createIncidentSecureShare(input: any) { throw new Error('Incident management not implemented in PostgresStore - use MemoryStore'); }
  async listIncidentSecureShares(incidentId: string): Promise<any[]> { throw new Error('Incident management not implemented in PostgresStore - use MemoryStore'); }
  async verifySecureShareToken(token: string, otp: string) { throw new Error('Incident management not implemented in PostgresStore - use MemoryStore'); }
  async recordSecureShareDownload(input: { id: string; downloadedBy: string; downloadIp?: string }) { throw new Error('Incident management not implemented in PostgresStore - use MemoryStore'); }
  async revokeSecureShare(id: string, revokedBy: string, reason: string) { throw new Error('Incident management not implemented in PostgresStore - use MemoryStore'); }
  
  async createIncidentReport(input: any) { throw new Error('Incident management not implemented in PostgresStore - use MemoryStore'); }
  async listIncidentReports(incidentId: string): Promise<any[]> { throw new Error('Incident management not implemented in PostgresStore - use MemoryStore'); }
  async getIncidentReport(id: string) { throw new Error('Incident management not implemented in PostgresStore - use MemoryStore'); }
  async updateIncidentReport(id: string, updates: any) { throw new Error('Incident management not implemented in PostgresStore - use MemoryStore'); }
  async submitIncidentReportForReview(id: string, submittedBy: string) { throw new Error('Incident management not implemented in PostgresStore - use MemoryStore'); }
  async approveIncidentReport(id: string, approvedBy: string, comments?: string) { throw new Error('Incident management not implemented in PostgresStore - use MemoryStore'); }
  async finalizeIncidentReport(id: string, finalizedBy: string) { throw new Error('Incident management not implemented in PostgresStore - use MemoryStore'); }
  
  async getIncidentDashboard(tenantId: string, filters?: any) { throw new Error('Incident management not implemented in PostgresStore - use MemoryStore'); }
  async getIncidentAnalyticsByType(tenantId: string, from?: string, to?: string) { throw new Error('Incident management not implemented in PostgresStore - use MemoryStore'); }
  async getIncidentAnalyticsBySeverity(tenantId: string, from?: string, to?: string) { throw new Error('Incident management not implemented in PostgresStore - use MemoryStore'); }
  async getIncidentAnalyticsByStatus(tenantId: string, from?: string, to?: string) { throw new Error('Incident management not implemented in PostgresStore - use MemoryStore'); }
  async getIncidentResponseTimes(tenantId: string, from?: string, to?: string) { throw new Error('Incident management not implemented in PostgresStore - use MemoryStore'); }
  async transitionAnalyticsAlert(id: string, tenantId: string, input: any) {
    return this.analytics.transitionAlert(id, tenantId, input);
  }
  async linkAnalyticsAlertIncident(id: string, tenantId: string, incidentId: string) {
    return this.analytics.linkIncident(id, tenantId, incidentId);
  }
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
