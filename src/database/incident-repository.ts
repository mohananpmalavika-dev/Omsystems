import { randomBytes, randomUUID } from "node:crypto";
import type { Pool } from "pg";

export class IncidentRepository {
  constructor(private readonly pool: Pool) {}

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
    const result = await this.pool.query(
      `INSERT INTO incidents (
         id, tenant_id, incident_number, title, description, incident_type,
         severity, branch_id, occurred_at, reported_by, status, created_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'new', now()) RETURNING *`,
      [
        randomUUID(),
        input.tenantId,
        input.incidentNumber,
        input.title,
        input.description ?? null,
        input.incidentType ?? null,
        input.severity ?? null,
        input.branchId ?? null,
        input.occurredAt ?? null,
        input.reportedBy ?? null,
      ],
    );
    return mapIncident(result.rows[0]);
  }

  async getIncident(id: string) {
    const result = await this.pool.query(`SELECT * FROM incidents WHERE id=$1`, [id]);
    if (!result.rows[0]) return undefined;
    return mapIncident(result.rows[0]);
  }

  async listIncidents(tenantId: string, filters?: { status?: string; limit?: number }) {
    const limit = filters?.limit ?? 100;
    if (filters?.status) {
      const res = await this.pool.query(
        `SELECT * FROM incidents WHERE tenant_id=$1 AND status=$2 ORDER BY detected_at DESC LIMIT $3`,
        [tenantId, filters.status, limit],
      );
      return res.rows.map(mapIncident);
    }
    const res = await this.pool.query(
      `SELECT * FROM incidents WHERE tenant_id=$1 ORDER BY detected_at DESC LIMIT $2`,
      [tenantId, limit],
    );
    return res.rows.map(mapIncident);
  }

  async updateStatus(id: string, status: string, changedBy?: string, notes?: string) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const upd = await client.query(
        `UPDATE incidents SET status=$2, updated_at=now() WHERE id=$1 RETURNING *`,
        [id, status],
      );
      await client.query(
        `INSERT INTO incident_status_history (id, incident_id, status, changed_by, notes, created_at) VALUES ($1,$2,$3,$4,$5,now())`,
        [randomUUID(), id, status, changedBy ?? null, notes ?? null],
      );
      await client.query("COMMIT");
      return upd.rows[0] ? mapIncident(upd.rows[0]) : undefined;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async assignIncident(id: string, userId: string) {
    const res = await this.pool.query(
      `UPDATE incidents SET assigned_to=$2, updated_at=now() WHERE id=$1 RETURNING *`,
      [id, userId],
    );
    return res.rows[0] ? mapIncident(res.rows[0]) : undefined;
  }

  async addCamera(incidentId: string, cameraId: string) {
    await this.pool.query(
      `INSERT INTO incident_cameras (id, incident_id, camera_id, added_at) VALUES ($1,$2,$3,now())`,
      [randomUUID(), incidentId, cameraId],
    );
  }

  async addVideoRange(incidentId: string, cameraId: string, fromAt: string, toAt: string, preservedBy: string, applyLegalHold = false, notes?: string) {
    const res = await this.pool.query(
      `INSERT INTO incident_video_ranges (id, incident_id, camera_id, from_at, to_at, preserved_by, legal_hold_applied, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [randomUUID(), incidentId, cameraId, fromAt, toAt, preservedBy, applyLegalHold, notes ?? null],
    );
    return mapIncidentVideoRange(res.rows[0]);
  }

  async preserveIncidentVideoAutomatic(input: {
    incidentId: string;
    cameraId: string;
    incidentTime: string;
    preRollMinutes: number;
    postRollMinutes: number;
    preservedBy: string;
  }) {
    const incidentDate = new Date(input.incidentTime);
    const preRollMs = input.preRollMinutes * 60 * 1000;
    const postRollMs = input.postRollMinutes * 60 * 1000;
    const fromAt = new Date(incidentDate.getTime() - preRollMs).toISOString();
    const toAt = new Date(incidentDate.getTime() + postRollMs).toISOString();

    return this.addVideoRange(input.incidentId, input.cameraId, fromAt, toAt, input.preservedBy, true, `Automatic preservation: ${input.preRollMinutes}min pre-roll, ${input.postRollMinutes}min post-roll`);
  }

  async listTimeline(incidentId: string) {
    const res = await this.pool.query(
      `SELECT * FROM incident_events WHERE incident_id=$1 ORDER BY created_at ASC`,
      [incidentId],
    );
    return res.rows;
  }

  async addEvent(incidentId: string, eventType: string, details: any, createdBy?: string) {
    const res = await this.pool.query(
      `INSERT INTO incident_events (id, incident_id, event_type, description, details, created_by, created_at) VALUES ($1,$2,$3,$4,$5,$6,now()) RETURNING *`,
      [randomUUID(), incidentId, eventType, details?.description ?? '', JSON.stringify(details ?? {}), createdBy ?? null],
    );
    return mapIncidentEvent(res.rows[0]);
  }

  async escalateIncident(id: string, escalatedBy: string, reason: string, recipients: string[]) {
    const incident = await this.updateStatus(id, 'escalated', escalatedBy, reason);
    await this.addEvent(id, 'escalated', { description: 'Incident escalated', reason, recipients }, escalatedBy);
    return incident;
  }

  async closeIncident(id: string, closedBy: string, notes?: string) {
    return this.updateIncidentStatus(id, 'closed', closedBy, notes);
  }

  async reopenIncident(id: string, reopenedBy: string, reason: string) {
    const res = await this.pool.query(
      `UPDATE incidents SET status='reopened', updated_at=now(), closed_at=NULL WHERE id=$1 RETURNING *`,
      [id],
    );
    const incident = res.rows[0] ? mapIncident(res.rows[0]) : undefined;
    if (incident) {
      await this.addEvent(id, 'status_changed', { description: 'Incident reopened', reason }, reopenedBy);
    }
    return incident;
  }

  async updateIncident(id: string, updates: {
    title?: string;
    description?: string;
    incidentType?: string;
    severity?: string;
    estimatedLoss?: number;
    injuryDetails?: string;
    confidentialityLevel?: string;
    policeRequired?: boolean;
    insuranceRequired?: boolean;
  }) {
    const fields = buildUpdateFields(updates);
    if (!fields.setClauses.length) return this.getIncident(id);

    const result = await this.pool.query(
      `UPDATE incidents SET ${fields.setClauses.join(', ')}, updated_at=now() WHERE id=$${fields.params.length + 1} RETURNING *`,
      [...fields.params, id],
    );
    return result.rows[0] ? mapIncident(result.rows[0]) : undefined;
  }

  async updateIncidentParticipant(id: string, updates: any) {
    const fields = buildUpdateFields(updates);
    if (!fields.setClauses.length) return this.getIncidentParticipant(id);
    const result = await this.pool.query(
      `UPDATE incident_participants SET ${fields.setClauses.join(', ')}, added_at=now() WHERE id=$${fields.params.length + 1} RETURNING *`,
      [...fields.params, id],
    );
    return result.rows[0];
  }

  async removeIncidentParticipant(id: string) {
    await this.pool.query(`DELETE FROM incident_participants WHERE id=$1`, [id]);
  }

  async getIncidentParticipant(id: string) {
    const res = await this.pool.query(`SELECT * FROM incident_participants WHERE id=$1`, [id]);
    return res.rows[0];
  }

  async addParticipant(input: {
    incidentId: string;
    role: string;
    personType: string;
    name?: string;
    employeeId?: string;
    customerId?: string;
    contactPhone?: string;
    contactEmail?: string;
    notes?: string;
    addedBy: string;
  }) {
    const result = await this.pool.query(
      `INSERT INTO incident_participants (
         id, incident_id, role, person_type, name, employee_id,
         customer_id, contact_phone, contact_email, notes, added_by, added_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now()) RETURNING *`,
      [
        randomUUID(), input.incidentId, input.role, input.personType,
        input.name ?? null, input.employeeId ?? null,
        input.customerId ?? null, input.contactPhone ?? null,
        input.contactEmail ?? null, input.notes ?? null,
        input.addedBy,
      ],
    );
    return mapIncidentParticipant(result.rows[0]);
  }

  async listParticipants(incidentId: string) {
    const res = await this.pool.query(
      `SELECT * FROM incident_participants WHERE incident_id=$1 ORDER BY added_at DESC`,
      [incidentId],
    );
    return res.rows.map(mapIncidentParticipant);
  }

  async listCameras(incidentId: string) {
    const res = await this.pool.query(
      `SELECT * FROM incident_cameras WHERE incident_id=$1 ORDER BY added_at DESC`,
      [incidentId],
    );
    return res.rows.map(mapIncidentCamera);
  }

  async listVideoRanges(incidentId: string) {
    const res = await this.pool.query(
      `SELECT * FROM incident_video_ranges WHERE incident_id=$1 ORDER BY preserved_at DESC`,
      [incidentId],
    );
    return res.rows.map(mapIncidentVideoRange);
  }

  async createClip(input: {
    incidentId: string;
    cameraId: string;
    sourceSegmentIds: string[];
    startTime: string;
    endTime: string;
    clipType: string;
    storagePath?: string;
    sizeBytes?: number;
    checksumSha256?: string;
    format?: string;
    hasWatermark: boolean;
    hasTimestamp: boolean;
    createdBy: string;
    notes?: string;
  }) {
    const result = await this.pool.query(
      `INSERT INTO incident_clips (
         id, incident_id, camera_id, source_segment_ids, start_time, end_time,
         clip_type, storage_path, size_bytes, checksum_sha256, format,
         has_watermark, has_timestamp, created_by, created_at, notes
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,now(),$15) RETURNING *`,
      [
        randomUUID(), input.incidentId, input.cameraId, input.sourceSegmentIds,
        input.startTime, input.endTime, input.clipType, input.storagePath ?? null,
        input.sizeBytes ?? null, input.checksumSha256 ?? null, input.format ?? null,
        input.hasWatermark, input.hasTimestamp, input.createdBy, input.notes ?? null,
      ],
    );
    return mapIncidentClip(result.rows[0]);
  }

  async listClips(incidentId: string) {
    const res = await this.pool.query(
      `SELECT * FROM incident_clips WHERE incident_id=$1 ORDER BY created_at DESC`,
      [incidentId],
    );
    return res.rows.map(mapIncidentClip);
  }

  async createSnapshot(input: {
    incidentId: string;
    cameraId: string;
    segmentId?: string;
    timestamp: string;
    snapshotType: string;
    storagePath?: string;
    checksumSha256?: string;
    description?: string;
    annotations?: Record<string, unknown>;
    enhancementDetails?: Record<string, unknown>;
    createdBy: string;
  }) {
    const result = await this.pool.query(
      `INSERT INTO incident_snapshots (
         id, incident_id, camera_id, segment_id, timestamp, snapshot_type,
         storage_path, checksum_sha256, description, annotations,
         enhancement_details, created_by, created_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now()) RETURNING *`,
      [
        randomUUID(), input.incidentId, input.cameraId, input.segmentId ?? null,
        input.timestamp, input.snapshotType, input.storagePath ?? null,
        input.checksumSha256 ?? null, input.description ?? null,
        input.annotations ? JSON.stringify(input.annotations) : null,
        input.enhancementDetails ? JSON.stringify(input.enhancementDetails) : null,
        input.createdBy,
      ],
    );
    return mapIncidentSnapshot(result.rows[0]);
  }

  async listSnapshots(incidentId: string) {
    const res = await this.pool.query(
      `SELECT * FROM incident_snapshots WHERE incident_id=$1 ORDER BY created_at DESC`,
      [incidentId],
    );
    return res.rows.map(mapIncidentSnapshot);
  }

  async addEvidenceItem(input: {
    incidentId: string;
    itemType: string;
    title: string;
    description?: string;
    referenceId?: string;
    storagePath?: string;
    checksumSha256?: string;
    addedBy: string;
  }) {
    const result = await this.pool.query(
      `INSERT INTO incident_evidence_items (
         id, incident_id, item_type, title, description, reference_id,
         storage_path, checksum_sha256, added_by, added_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now()) RETURNING *`,
      [
        randomUUID(), input.incidentId, input.itemType, input.title,
        input.description ?? null, input.referenceId ?? null,
        input.storagePath ?? null, input.checksumSha256 ?? null,
        input.addedBy,
      ],
    );
    return mapIncidentEvidenceItem(result.rows[0]);
  }

  async listEvidenceItems(incidentId: string) {
    const res = await this.pool.query(
      `SELECT * FROM incident_evidence_items WHERE incident_id=$1 ORDER BY added_at DESC`,
      [incidentId],
    );
    return res.rows.map(mapIncidentEvidenceItem);
  }

  async createEvidencePackage(input: {
    incidentId: string;
    title: string;
    description?: string;
    includeOriginalVideo: boolean;
    includeInvestigationClips: boolean;
    includeSnapshots: boolean;
    includeTimeline: boolean;
    includeAlertLogs: boolean;
    includeDocuments: boolean;
    createdBy: string;
  }) {
    const incident = await this.getIncident(input.incidentId);
    if (!incident) throw new Error('incident_not_found');

    const countRes = await this.pool.query(
      `SELECT COUNT(*) as count FROM incident_evidence_packages WHERE incident_id=$1`,
      [input.incidentId],
    );
    const sequence = parseInt(countRes.rows[0].count, 10) + 1;
    const packageNumber = `PKG-${incident.incidentNumber}-${String(sequence).padStart(3, '0')}`;

    const result = await this.pool.query(
      `INSERT INTO incident_evidence_packages (
         id, incident_id, package_number, title, description, status,
         include_original_video, include_investigation_clips, include_snapshots,
         include_timeline, include_alert_logs, include_documents,
         created_by, created_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,now()) RETURNING *`,
      [
        randomUUID(), input.incidentId, packageNumber, input.title,
        input.description ?? null, 'draft', input.includeOriginalVideo,
        input.includeInvestigationClips, input.includeSnapshots,
        input.includeTimeline, input.includeAlertLogs,
        input.includeDocuments, input.createdBy,
      ],
    );
    return mapIncidentEvidencePackage(result.rows[0]);
  }

  async listEvidencePackages(incidentId: string) {
    const res = await this.pool.query(
      `SELECT * FROM incident_evidence_packages WHERE incident_id=$1 ORDER BY created_at DESC`,
      [incidentId],
    );
    return res.rows.map(mapIncidentEvidencePackage);
  }

  async getEvidencePackage(id: string) {
    const res = await this.pool.query(`SELECT * FROM incident_evidence_packages WHERE id=$1`, [id]);
    return res.rows[0] ? mapIncidentEvidencePackage(res.rows[0]) : undefined;
  }

  async approveEvidencePackage(id: string, approvedBy: string) {
    const res = await this.pool.query(
      `UPDATE incident_evidence_packages
       SET status='approved', approved_by=$2, approved_at=now()
       WHERE id=$1 RETURNING *`,
      [id, approvedBy],
    );
    return res.rows[0] ? mapIncidentEvidencePackage(res.rows[0]) : undefined;
  }

  async updateEvidencePackageStatus(id: string, status: string, details?: {
    packagePath?: string;
    packageSizeBytes?: number;
    checksumSha256?: string;
    manifestPath?: string;
    signature?: string;
    error?: string;
  }) {
    const fields = buildUpdateFields({ status, ...details });
    if (!fields.setClauses.length) return this.getEvidencePackage(id);
    const result = await this.pool.query(
      `UPDATE incident_evidence_packages SET ${fields.setClauses.join(', ')}, updated_at=now() WHERE id=$${fields.params.length + 1} RETURNING *`,
      [...fields.params, id],
    );
    return result.rows[0] ? mapIncidentEvidencePackage(result.rows[0]) : undefined;
  }

  async recordEvidencePackageDownload(id: string, downloadedBy: string) {
    const res = await this.pool.query(
      `UPDATE incident_evidence_packages
       SET status='downloaded', downloaded_by=$2, downloaded_at=now()
       WHERE id=$1 RETURNING *`,
      [id, downloadedBy],
    );
    return res.rows[0] ? mapIncidentEvidencePackage(res.rows[0]) : undefined;
  }

  async createPoliceIntimation(input: {
    incidentId: string;
    policeStation: string;
    policeStationAddress?: string;
    intimationMethod: string;
    intimatedAt: string;
    intimatedBy: string;
    officerName?: string;
    officerDesignation?: string;
    officerContact?: string;
    notes?: string;
  }) {
    const result = await this.pool.query(
      `INSERT INTO incident_police_intimations (
         id, incident_id, police_station, police_station_address,
         intimation_method, intimated_at, intimated_by, officer_name,
         officer_designation, officer_contact, status, notes, created_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'intimated',$11,now(),now()) RETURNING *`,
      [
        randomUUID(), input.incidentId, input.policeStation,
        input.policeStationAddress ?? null, input.intimationMethod,
        input.intimatedAt, input.intimatedBy, input.officerName ?? null,
        input.officerDesignation ?? null, input.officerContact ?? null,
        input.notes ?? null,
      ],
    );
    return mapIncidentPoliceIntimation(result.rows[0]);
  }

  async listPoliceIntimations(incidentId: string) {
    const res = await this.pool.query(
      `SELECT * FROM incident_police_intimations WHERE incident_id=$1 ORDER BY created_at DESC`,
      [incidentId],
    );
    return res.rows.map(mapIncidentPoliceIntimation);
  }

  async getPoliceIntimation(id: string) {
    const res = await this.pool.query(`SELECT * FROM incident_police_intimations WHERE id=$1`, [id]);
    return res.rows[0] ? mapIncidentPoliceIntimation(res.rows[0]) : undefined;
  }

  async updatePoliceIntimation(id: string, updates: Record<string, any>) {
    const fields = buildUpdateFields(updates);
    if (!fields.setClauses.length) return this.getPoliceIntimation(id);
    const result = await this.pool.query(
      `UPDATE incident_police_intimations SET ${fields.setClauses.join(', ')}, updated_at=now() WHERE id=$${fields.params.length + 1} RETURNING *`,
      [...fields.params, id],
    );
    return result.rows[0] ? mapIncidentPoliceIntimation(result.rows[0]) : undefined;
  }

  async recordPoliceEvidenceTransfer(input: {
    incidentId: string;
    policeIntimationId: string;
    transferDate: string;
    transferredBy: string;
    evidencePackageId?: string;
    evidenceDescription: string;
    recipientName: string;
    recipientDesignation?: string;
    receiptAcknowledgement?: string;
    transferMethod: string;
    notes?: string;
  }) {
    const result = await this.pool.query(
      `INSERT INTO incident_police_evidence_transfers (
         id, incident_id, police_intimation_id, transfer_date,
         transferred_by, evidence_package_id, evidence_description,
         recipient_name, recipient_designation, receipt_acknowledgement,
         transfer_method, notes, created_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now()) RETURNING *`,
      [
        randomUUID(), input.incidentId, input.policeIntimationId,
        input.transferDate, input.transferredBy,
        input.evidencePackageId ?? null, input.evidenceDescription,
        input.recipientName, input.recipientDesignation ?? null,
        input.receiptAcknowledgement ?? null, input.transferMethod,
        input.notes ?? null,
      ],
    );
    return result.rows[0];
  }

  async listPoliceEvidenceTransfers(incidentId: string) {
    const res = await this.pool.query(
      `SELECT * FROM incident_police_evidence_transfers WHERE incident_id=$1 ORDER BY created_at DESC`,
      [incidentId],
    );
    return res.rows;
  }

  async createInsuranceClaim(input: {
    incidentId: string;
    insuranceCompany: string;
    policyNumber: string;
    dateOfLoss: string;
    estimatedLoss: number;
    claimAmount?: number;
    notes?: string;
  }) {
    const result = await this.pool.query(
      `INSERT INTO incident_insurance_claims (
         id, incident_id, insurance_company, policy_number,
         date_of_loss, estimated_loss, claim_amount, status,
         notes, created_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,'to-be-filed',$8,now(),now()) RETURNING *`,
      [
        randomUUID(), input.incidentId, input.insuranceCompany,
        input.policyNumber, input.dateOfLoss, input.estimatedLoss,
        input.claimAmount ?? null, input.notes ?? null,
      ],
    );
    return mapIncidentInsuranceClaim(result.rows[0]);
  }

  async listInsuranceClaims(incidentId: string) {
    const res = await this.pool.query(
      `SELECT * FROM incident_insurance_claims WHERE incident_id=$1 ORDER BY created_at DESC`,
      [incidentId],
    );
    return res.rows.map(mapIncidentInsuranceClaim);
  }

  async getInsuranceClaim(id: string) {
    const res = await this.pool.query(`SELECT * FROM incident_insurance_claims WHERE id=$1`, [id]);
    return res.rows[0] ? mapIncidentInsuranceClaim(res.rows[0]) : undefined;
  }

  async updateInsuranceClaim(id: string, updates: Record<string, any>) {
    const fields = buildUpdateFields(updates);
    if (!fields.setClauses.length) return this.getInsuranceClaim(id);
    const result = await this.pool.query(
      `UPDATE incident_insurance_claims SET ${fields.setClauses.join(', ')}, updated_at=now() WHERE id=$${fields.params.length + 1} RETURNING *`,
      [...fields.params, id],
    );
    return result.rows[0] ? mapIncidentInsuranceClaim(result.rows[0]) : undefined;
  }

  async addInsuranceDocument(input: {
    incidentId: string;
    claimId: string;
    documentType: string;
    documentTitle: string;
    documentPath?: string;
    uploadedBy: string;
  }) {
    const result = await this.pool.query(
      `INSERT INTO incident_insurance_documents (
         id, incident_id, claim_id, document_type, document_title,
         document_path, uploaded_by, uploaded_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,now()) RETURNING *`,
      [
        randomUUID(), input.incidentId, input.claimId, input.documentType,
        input.documentTitle, input.documentPath ?? null, input.uploadedBy,
      ],
    );
    return result.rows[0];
  }

  async listInsuranceDocuments(incidentId: string, claimId?: string) {
    const query = claimId
      ? `SELECT * FROM incident_insurance_documents WHERE incident_id=$1 AND claim_id=$2 ORDER BY uploaded_at DESC`
      : `SELECT * FROM incident_insurance_documents WHERE incident_id=$1 ORDER BY uploaded_at DESC`;
    const params = claimId ? [incidentId, claimId] : [incidentId];
    const res = await this.pool.query(query, params);
    return res.rows;
  }

  async createIncidentTask(input: {
    incidentId: string;
    taskName: string;
    description?: string;
    assignedTo?: string;
    dueDate?: string;
    priority: string;
    isMandatory: boolean;
    createdBy: string;
  }) {
    const result = await this.pool.query(
      `INSERT INTO incident_tasks (
         id, incident_id, task_name, description, assigned_to,
         due_date, priority, status, is_mandatory,
         created_by, created_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,'pending',$8,$9,now()) RETURNING *`,
      [
        randomUUID(), input.incidentId, input.taskName,
        input.description ?? null, input.assignedTo ?? null,
        input.dueDate ?? null, input.priority, input.isMandatory,
        input.createdBy,
      ],
    );
    return result.rows[0];
  }

  async listIncidentTasks(incidentId: string) {
    const res = await this.pool.query(
      `SELECT * FROM incident_tasks WHERE incident_id=$1 ORDER BY created_at DESC`,
      [incidentId],
    );
    return res.rows;
  }

  async updateIncidentTask(id: string, updates: Record<string, any>) {
    const fields = buildUpdateFields(updates);
    if (!fields.setClauses.length) return this.getIncidentTask(id);
    const result = await this.pool.query(
      `UPDATE incident_tasks SET ${fields.setClauses.join(', ')} WHERE id=$${fields.params.length + 1} RETURNING *`,
      [...fields.params, id],
    );
    return result.rows[0];
  }

  async getIncidentTask(id: string) {
    const res = await this.pool.query(`SELECT * FROM incident_tasks WHERE id=$1`, [id]);
    return res.rows[0];
  }

  async completeIncidentTask(id: string, completedBy: string, completionNotes?: string) {
    const result = await this.pool.query(
      `UPDATE incident_tasks
       SET status='completed', completed_by=$2, completed_at=now(), completion_notes=$3
       WHERE id=$1 RETURNING *`,
      [id, completedBy, completionNotes ?? null],
    );
    return result.rows[0];
  }

  async addIncidentNote(input: {
    incidentId: string;
    noteType: string;
    content: string;
    createdBy: string;
  }) {
    const result = await this.pool.query(
      `INSERT INTO incident_notes (
         id, incident_id, note_type, content, created_by, created_at
       ) VALUES ($1,$2,$3,$4,$5,now()) RETURNING *`,
      [
        randomUUID(), input.incidentId, input.noteType, input.content,
        input.createdBy,
      ],
    );
    return result.rows[0];
  }

  async listIncidentNotes(incidentId: string, noteType?: string) {
    const query = noteType
      ? `SELECT * FROM incident_notes WHERE incident_id=$1 AND note_type=$2 ORDER BY created_at DESC`
      : `SELECT * FROM incident_notes WHERE incident_id=$1 ORDER BY created_at DESC`;
    const params = noteType ? [incidentId, noteType] : [incidentId];
    const res = await this.pool.query(query, params);
    return res.rows;
  }

  async updateIncidentNote(id: string, content: string) {
    const result = await this.pool.query(
      `UPDATE incident_notes SET content=$2, edited_at=now() WHERE id=$1 RETURNING *`,
      [id, content],
    );
    return result.rows[0];
  }

  async deleteIncidentNote(id: string) {
    await this.pool.query(`DELETE FROM incident_notes WHERE id=$1`, [id]);
  }

  async createSecureShare(input: {
    incidentId: string;
    evidencePackageId?: string;
    recipientName: string;
    recipientOrganization: string;
    recipientEmail?: string;
    purpose: string;
    maxDownloads: number;
    expiresAt: string;
    watermarked: boolean;
    encrypted: boolean;
    createdBy: string;
  }) {
    const shareToken = randomBytes(32).toString('base64url');
    const oneTimePassword = Math.floor(100000 + Math.random() * 900000).toString();
    const shareUrl = `https://evidence.example.com/share/${shareToken}`;

    const result = await this.pool.query(
      `INSERT INTO incident_secure_shares (
         id, incident_id, evidence_package_id, share_token, share_url,
         recipient_name, recipient_organization, recipient_email,
         recipient_verified, purpose, one_time_password, max_downloads,
         download_count, expires_at, status, watermarked, encrypted,
         created_by, created_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,false,$9,$10,$11,0,$12,'active',$13,$14,$15,now()) RETURNING *`,
      [
        randomUUID(), input.incidentId, input.evidencePackageId ?? null,
        shareToken, shareUrl, input.recipientName, input.recipientOrganization,
        input.recipientEmail ?? null, input.purpose, oneTimePassword,
        input.maxDownloads, input.expiresAt, input.watermarked,
        input.encrypted, input.createdBy,
      ],
    );
    return mapIncidentSecureShare(result.rows[0]);
  }

  async listSecureShares(incidentId: string) {
    const res = await this.pool.query(
      `SELECT * FROM incident_secure_shares WHERE incident_id=$1 ORDER BY created_at DESC`,
      [incidentId],
    );
    return res.rows.map(mapIncidentSecureShare);
  }

  async getSecureShare(id: string) {
    const res = await this.pool.query(`SELECT * FROM incident_secure_shares WHERE id=$1`, [id]);
    return res.rows[0] ? mapIncidentSecureShare(res.rows[0]) : undefined;
  }

  async getSecureShareByToken(token: string) {
    const res = await this.pool.query(`SELECT * FROM incident_secure_shares WHERE share_token=$1`, [token]);
    return res.rows[0] ? mapIncidentSecureShare(res.rows[0]) : undefined;
  }

  async verifySecureShareAccess(token: string, oneTimePassword?: string) {
    const share = await this.getSecureShareByToken(token);
    if (!share) {
      return { allowed: false, error: 'Invalid share token' };
    }

    if (share.status !== 'active') {
      return { allowed: false, share, error: 'Share is not active' };
    }

    if (new Date(share.expiresAt) < new Date()) {
      await this.pool.query(`UPDATE incident_secure_shares SET status='expired' WHERE id=$1`, [share.id]);
      return { allowed: false, share: { ...share, status: 'expired' }, error: 'Share has expired' };
    }

    if (share.downloadCount >= share.maxDownloads) {
      return { allowed: false, share, error: 'Maximum downloads reached' };
    }

    if (share.oneTimePassword && oneTimePassword !== share.oneTimePassword) {
      return { allowed: false, share, error: 'Invalid one-time password' };
    }

    return { allowed: true, share };
  }

  async recordSecureShareDownload(id: string, downloadedBy: string, downloadIp?: string) {
    const res = await this.pool.query(
      `UPDATE incident_secure_shares
       SET download_count = download_count + 1,
           downloaded_by = $2,
           downloaded_at = now(),
           download_ip = $3,
           status = CASE WHEN download_count + 1 >= max_downloads THEN 'downloaded' ELSE status END
       WHERE id=$1 RETURNING *`,
      [id, downloadedBy, downloadIp ?? null],
    );
    return res.rows[0] ? mapIncidentSecureShare(res.rows[0]) : undefined;
  }

  async revokeSecureShare(id: string, revokedBy: string, reason: string) {
    const res = await this.pool.query(
      `UPDATE incident_secure_shares
       SET status='revoked', revoked_by=$2, revoke_reason=$3, revoked_at=now()
       WHERE id=$1 RETURNING *`,
      [id, revokedBy, reason],
    );
    return res.rows[0] ? mapIncidentSecureShare(res.rows[0]) : undefined;
  }

  async createIncidentReport(input: {
    incidentId: string;
    reportType: string;
    executiveSummary?: string;
    detailedChronology?: string;
    findings?: string;
    rootCause?: string;
    controlFailures?: string;
    correctiveActions?: string;
    preventiveActions?: string;
    recommendations?: string;
    conclusions?: string;
    unresolvedQuestions?: string;
    createdBy: string;
  }) {
    const incident = await this.getIncident(input.incidentId);
    if (!incident) throw new Error('incident_not_found');

    const countRes = await this.pool.query(
      `SELECT COUNT(*) as count FROM incident_reports WHERE incident_id=$1 AND report_type=$2`,
      [input.incidentId, input.reportType],
    );
    const sequence = parseInt(countRes.rows[0].count, 10) + 1;
    const reportNumber = `RPT-${incident.incidentNumber}-${input.reportType.toUpperCase()}-${String(sequence).padStart(2, '0')}`;

    const result = await this.pool.query(
      `INSERT INTO incident_reports (
         id, incident_id, report_number, report_type, status,
         executive_summary, detailed_chronology, findings, root_cause,
         control_failures, corrective_actions, preventive_actions,
         recommendations, conclusions, unresolved_questions,
         created_by, created_at
       ) VALUES ($1,$2,$3,$4,'draft',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,now()) RETURNING *`,
      [
        randomUUID(), input.incidentId, reportNumber,
        input.reportType, input.executiveSummary ?? null,
        input.detailedChronology ?? null, input.findings ?? null,
        input.rootCause ?? null, input.controlFailures ?? null,
        input.correctiveActions ?? null, input.preventiveActions ?? null,
        input.recommendations ?? null, input.conclusions ?? null,
        input.unresolvedQuestions ?? null, input.createdBy,
      ],
    );
    return mapIncidentReport(result.rows[0]);
  }

  async listIncidentReports(incidentId: string) {
    const res = await this.pool.query(
      `SELECT * FROM incident_reports WHERE incident_id=$1 ORDER BY created_at DESC`,
      [incidentId],
    );
    return res.rows.map(mapIncidentReport);
  }

  async getIncidentReport(id: string) {
    const res = await this.pool.query(`SELECT * FROM incident_reports WHERE id=$1`, [id]);
    return res.rows[0] ? mapIncidentReport(res.rows[0]) : undefined;
  }

  async updateIncidentReport(id: string, updates: Record<string, any>) {
    const fields = buildUpdateFields(updates);
    if (!fields.setClauses.length) return this.getIncidentReport(id);
    const result = await this.pool.query(
      `UPDATE incident_reports SET ${fields.setClauses.join(', ')} WHERE id=$${fields.params.length + 1} RETURNING *`,
      [...fields.params, id],
    );
    return result.rows[0] ? mapIncidentReport(result.rows[0]) : undefined;
  }

  async reviewIncidentReport(id: string, reviewedBy: string) {
    const res = await this.pool.query(
      `UPDATE incident_reports
       SET status='pending-review', reviewed_by=$2, reviewed_at=now()
       WHERE id=$1 RETURNING *`,
      [id, reviewedBy],
    );
    return res.rows[0] ? mapIncidentReport(res.rows[0]) : undefined;
  }

  async approveIncidentReport(id: string, approvedBy: string) {
    const res = await this.pool.query(
      `UPDATE incident_reports
       SET status='approved', approved_by=$2, approved_at=now()
       WHERE id=$1 RETURNING *`,
      [id, approvedBy],
    );
    return res.rows[0] ? mapIncidentReport(res.rows[0]) : undefined;
  }

  async finalizeIncidentReport(id: string, reportPath?: string) {
    const res = await this.pool.query(
      `UPDATE incident_reports
       SET status='final', finalized_at=now(), report_path=$2
       WHERE id=$1 RETURNING *`,
      [id, reportPath ?? null],
    );
    return res.rows[0] ? mapIncidentReport(res.rows[0]) : undefined;
  }

  async getIncidentsDashboard(tenantId: string, filters?: {
    branchId?: string;
    from?: string;
    to?: string;
  }) {
    const clauses = ['tenant_id = $1'];
    const params: any[] = [tenantId];
    if (filters?.branchId) {
      clauses.push(`branch_id = $${params.length + 1}`);
      params.push(filters.branchId);
    }
    if (filters?.from) {
      clauses.push(`occurred_at >= $${params.length + 1}`);
      params.push(filters.from);
    }
    if (filters?.to) {
      clauses.push(`occurred_at <= $${params.length + 1}`);
      params.push(filters.to);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

    const counts = await this.pool.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status NOT IN ('closed', 'resolved', 'false-alarm'))::int AS open,
         COUNT(*) FILTER (WHERE severity = 'P1' AND status NOT IN ('closed', 'false-alarm'))::int AS critical,
         ROUND(AVG(EXTRACT(EPOCH FROM (closed_at - detected_at)) / 3600)::numeric, 1) AS average_resolution_hours
       FROM incidents
       ${where}`,
      params,
    );
    const typeRows = await this.pool.query(
      `SELECT incident_type, COUNT(*)::int AS count FROM incidents ${where} GROUP BY incident_type`,
      params,
    );
    const severityRows = await this.pool.query(
      `SELECT severity, COUNT(*)::int AS count FROM incidents ${where} GROUP BY severity`,
      params,
    );
    const statusRows = await this.pool.query(
      `SELECT status, COUNT(*)::int AS count FROM incidents ${where} GROUP BY status`,
      params,
    );
    const policeRows = await this.pool.query(
      `SELECT COUNT(DISTINCT ipi.id)::int AS count FROM incident_police_intimations ipi JOIN incidents i ON ipi.incident_id = i.id ${where.replace(/tenant_id/g, 'i.tenant_id')}`,
      params,
    );
    const insuranceRows = await this.pool.query(
      `SELECT COUNT(DISTINCT iic.id)::int AS count FROM incident_insurance_claims iic JOIN incidents i ON iic.incident_id = i.id ${where.replace(/tenant_id/g, 'i.tenant_id')}`,
      params,
    );

    const incidentsByType: Record<string, number> = {};
    typeRows.rows.forEach((row) => { incidentsByType[row.incident_type] = row.count; });
    const incidentsBySeverity: Record<string, number> = {};
    severityRows.rows.forEach((row) => { incidentsBySeverity[row.severity] = row.count; });
    const incidentsByStatus: Record<string, number> = {};
    statusRows.rows.forEach((row) => { incidentsByStatus[row.status] = row.count; });

    const dashboard = counts.rows[0];
    return {
      totalIncidents: dashboard.total,
      openIncidents: dashboard.open,
      criticalIncidents: dashboard.critical,
      incidentsByType,
      incidentsBySeverity,
      incidentsByStatus,
      averageResolutionHours: dashboard.average_resolution_hours ?? 0,
      policeIntimationsCount: policeRows.rows[0]?.count ?? 0,
      insuranceClaimsCount: insuranceRows.rows[0]?.count ?? 0,
    };
  }

  async getIncidentStatistics(tenantId: string, from?: string, to?: string) {
    const fromDate = from ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const toDate = to ?? new Date().toISOString();
    const result = await this.pool.query(
      `SELECT * FROM get_incident_statistics($1, $2::timestamptz, $3::timestamptz)`,
      [tenantId, fromDate, toDate],
    );
    return result.rows[0];
  }
}

function mapIncident(row: any) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    incidentNumber: row.incident_number,
    title: row.title,
    description: row.description ?? undefined,
    incidentType: row.incident_type ?? undefined,
    severity: row.severity ?? undefined,
    branchId: row.branch_id ?? undefined,
    occurredAt: row.occurred_at?.toISOString(),
    detectedAt: row.detected_at?.toISOString(),
    reportedBy: row.reported_by ?? undefined,
    assignedTo: row.assigned_to ?? undefined,
    status: row.status,
    legalHoldId: row.legal_hold_id ?? undefined,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at?.toISOString(),
  };
}

export default IncidentRepository;
