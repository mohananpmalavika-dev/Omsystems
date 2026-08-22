import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type {
  ChainOfCustodyEvent,
  CustodyAction,
  EvidenceCase,
  EvidenceCaseStatus,
  EvidenceExport,
  EvidenceExportFormat,
  EvidenceItem,
  EvidenceManifest,
  RecordingLegalHold,
  RecordingLegalHoldRequest,
} from "../domain/models.js";

export class EvidenceRepository {
  constructor(private readonly pool: Pool) {}

  // Evidence Cases
  async createCase(input: {
    tenantId: string;
    caseNumber: string;
    title: string;
    description?: string;
    createdBy: string;
  }): Promise<EvidenceCase> {
    const result = await this.pool.query(
      `INSERT INTO evidence_cases (
         id, tenant_id, case_number, title, description, status, created_by, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, now())
       RETURNING *`,
      [randomUUID(), input.tenantId, input.caseNumber, input.title, input.description ?? null, "open", input.createdBy],
    );
    return mapEvidenceCase(result.rows[0]);
  }

  async getCase(caseId: string): Promise<EvidenceCase | undefined> {
    const result = await this.pool.query(
      `SELECT * FROM evidence_cases WHERE id = $1`,
      [caseId],
    );
    return result.rows[0] ? mapEvidenceCase(result.rows[0]) : undefined;
  }

  async listCases(
    tenantId: string,
    filters?: { status?: EvidenceCaseStatus; limit?: number },
  ): Promise<EvidenceCase[]> {
    const limit = filters?.limit ?? 100;
    const result = await this.pool.query(
      `SELECT * FROM evidence_cases 
       WHERE tenant_id = $1 
       ${filters?.status ? "AND status = $2" : ""}
       ORDER BY created_at DESC
       LIMIT $${filters?.status ? 3 : 2}`,
      filters?.status
        ? [tenantId, filters.status, limit]
        : [tenantId, limit],
    );
    return result.rows.map(mapEvidenceCase);
  }

  async updateCaseStatus(caseId: string, status: EvidenceCaseStatus): Promise<EvidenceCase | undefined> {
    const result = await this.pool.query(
      `UPDATE evidence_cases 
       SET status = $2, updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [caseId, status],
    );
    return result.rows[0] ? mapEvidenceCase(result.rows[0]) : undefined;
  }

  // Evidence Items
  async addItem(
    caseId: string,
    input: {
      type: "recording" | "snapshot" | "exported-video" | "manifest" | "document";
      cameraId?: string;
      startTime?: string;
      endTime?: string;
      description: string;
      addedBy: string;
      hash?: string;
      fileSize?: number;
    },
  ): Promise<EvidenceItem> {
    const result = await this.pool.query(
      `INSERT INTO evidence_items (
         id, case_id, type, camera_id, start_time, end_time, description,
         added_by, hash, file_size, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
       RETURNING *`,
      [
        randomUUID(),
        caseId,
        input.type,
        input.cameraId ?? null,
        input.startTime ?? null,
        input.endTime ?? null,
        input.description,
        input.addedBy,
        input.hash ?? null,
        input.fileSize ?? null,
      ],
    );
    return mapEvidenceItem(result.rows[0]);
  }

  async listItems(caseId: string): Promise<EvidenceItem[]> {
    const result = await this.pool.query(
      `SELECT * FROM evidence_items 
       WHERE case_id = $1
       ORDER BY created_at DESC`,
      [caseId],
    );
    return result.rows.map(mapEvidenceItem);
  }

  async getItem(itemId: string): Promise<EvidenceItem | undefined> {
    const result = await this.pool.query(
      `SELECT * FROM evidence_items WHERE id = $1`,
      [itemId],
    );
    return result.rows[0] ? mapEvidenceItem(result.rows[0]) : undefined;
  }

  // Evidence Exports
  async requestExport(
    caseId: string,
    input: {
      format: EvidenceExportFormat;
      reason: string;
      exportedBy: string;
    },
  ): Promise<EvidenceExport> {
    const result = await this.pool.query(
      `INSERT INTO evidence_exports (
         id, case_id, format, reason, exported_by, status, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, now())
       RETURNING *`,
      [randomUUID(), caseId, input.format, input.reason, input.exportedBy, "pending"],
    );
    return mapEvidenceExport(result.rows[0]);
  }

  async getExport(exportId: string): Promise<EvidenceExport | undefined> {
    const result = await this.pool.query(
      `SELECT * FROM evidence_exports WHERE id = $1`,
      [exportId],
    );
    return result.rows[0] ? mapEvidenceExport(result.rows[0]) : undefined;
  }

  async updateExportStatus(
    exportId: string,
    status: "pending" | "processing" | "ready" | "failed",
    details?: Record<string, unknown>,
  ): Promise<EvidenceExport | undefined> {
    const result = await this.pool.query(
      `UPDATE evidence_exports
       SET status = $2, details = $3, updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [exportId, status, JSON.stringify(details ?? {})],
    );
    return result.rows[0] ? mapEvidenceExport(result.rows[0]) : undefined;
  }

  // Evidence Manifests
  async createManifest(input: {
    caseId: string;
    exportedBy: string;
    sourceSegments: Array<{
      segmentId: string;
      cameraId: string;
      startTime: string;
      endTime: string;
      sha256: string;
    }>;
    destinationFile: { format: string; sha256: string; fileSize: number };
    timestamp: {
      cameraTime: string;
      recorderTime: string;
      clockOffset: number;
      ntpStatus: string;
    };
  }): Promise<EvidenceManifest> {
    const result = await this.pool.query(
      `INSERT INTO evidence_manifests (
         id, case_id, source_segments, destination_file, timestamp,
         exported_by, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, now())
       RETURNING *`,
      [
        randomUUID(),
        input.caseId,
        JSON.stringify(input.sourceSegments),
        JSON.stringify(input.destinationFile),
        JSON.stringify(input.timestamp),
        input.exportedBy,
      ],
    );
    return mapEvidenceManifest(result.rows[0]);
  }

  async getManifest(manifestId: string): Promise<EvidenceManifest | undefined> {
    const result = await this.pool.query(
      `SELECT * FROM evidence_manifests WHERE id = $1`,
      [manifestId],
    );
    return result.rows[0] ? mapEvidenceManifest(result.rows[0]) : undefined;
  }

  // Chain of Custody
  async recordCustodyEvent(input: {
    evidenceId?: string;
    action: CustodyAction;
    performedBy: string;
    reason?: string;
    sourceIp?: string;
  }): Promise<ChainOfCustodyEvent> {
    // Get the previous event's hash for linkage
    let previousHash: string | null = null;
    if (input.evidenceId) {
      const prevResult = await this.pool.query(
        `SELECT event_hash FROM chain_of_custody_events 
         WHERE evidence_id = $1
         ORDER BY created_at DESC
         LIMIT 1`,
        [input.evidenceId],
      );
      previousHash = prevResult.rows[0]?.event_hash ?? null;
    }

    // Create hash of this event
    const eventData = JSON.stringify({
      action: input.action,
      performedBy: input.performedBy,
      timestamp: new Date().toISOString(),
      reason: input.reason,
      sourceIp: input.sourceIp,
      previousHash,
    });
    const eventHash = require("crypto")
      .createHash("sha256")
      .update(eventData)
      .digest("hex");

    const result = await this.pool.query(
      `INSERT INTO chain_of_custody_events (
         id, evidence_id, action, performed_by, reason, source_ip,
         event_hash, previous_hash, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
       RETURNING *`,
      [
        randomUUID(),
        input.evidenceId ?? null,
        input.action,
        input.performedBy,
        input.reason ?? null,
        input.sourceIp ?? null,
        eventHash,
        previousHash,
      ],
    );
    return mapChainOfCustodyEvent(result.rows[0]);
  }

  async getCustodyLog(evidenceId: string): Promise<ChainOfCustodyEvent[]> {
    const result = await this.pool.query(
      `SELECT * FROM chain_of_custody_events
       WHERE evidence_id = $1
       ORDER BY created_at ASC`,
      [evidenceId],
    );
    return result.rows.map(mapChainOfCustodyEvent);
  }

  // Legal Holds
  async createLegalHold(input: RecordingLegalHoldRequest & { requestedBy: string }): Promise<RecordingLegalHold> {
    const result = await this.pool.query(
      `INSERT INTO recording_legal_holds (
         id, case_number, reason, requested_by, camera_ids, start_time, end_time,
         review_date, expiry_date, status, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
       RETURNING *`,
      [
        randomUUID(),
        input.caseNumber,
        input.reason,
        input.requestedBy,
        JSON.stringify(input.cameraIds),
        input.startTime,
        input.endTime,
        input.reviewDate ?? null,
        input.expiryDate ?? null,
        "active",
      ],
    );
    return mapRecordingLegalHold(result.rows[0]);
  }

  async releaseLegalHold(holdId: string, releasedBy: string): Promise<RecordingLegalHold | undefined> {
    const result = await this.pool.query(
      `UPDATE recording_legal_holds
       SET status = $2, released_by = $3, released_at = now()
       WHERE id = $1
       RETURNING *`,
      [holdId, "released", releasedBy],
    );
    return result.rows[0] ? mapRecordingLegalHold(result.rows[0]) : undefined;
  }

  async getLegalHold(holdId: string): Promise<RecordingLegalHold | undefined> {
    const result = await this.pool.query(
      `SELECT * FROM recording_legal_holds WHERE id = $1`,
      [holdId],
    );
    return result.rows[0] ? mapRecordingLegalHold(result.rows[0]) : undefined;
  }
}

// Mapping functions
function mapEvidenceCase(row: any): EvidenceCase {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    caseNumber: row.case_number,
    title: row.title,
    description: row.description ?? undefined,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    closedAt: row.updated_at?.toISOString(),
    reason: row.reason ?? undefined,
    relatedIncidents: [],
    legalHoldItems: [],
  };
}

function mapEvidenceItem(row: any): EvidenceItem {
  return {
    id: row.id,
    caseId: row.case_id,
    type: row.type,
    cameraId: row.camera_id ?? undefined,
    startTime: row.start_time?.toISOString(),
    endTime: row.end_time?.toISOString(),
    description: row.description,
    addedBy: row.added_by,
    addedAt: row.created_at.toISOString(),
    hash: row.hash ?? undefined,
    fileSize: row.file_size ?? undefined,
  };
}

function mapEvidenceExport(row: any): EvidenceExport {
  return {
    id: row.id,
    caseId: row.case_id,
    exportedBy: row.exported_by,
    reason: row.reason,
    format: row.format,
    status: row.status,
    requestedAt: row.created_at.toISOString(),
    completedAt: row.updated_at?.toISOString(),
    downloadUrl: row.details ? JSON.parse(row.details).downloadUrl : undefined,
    expiresAt: row.details ? JSON.parse(row.details).expiresAt : undefined,
    manifestId: row.details ? JSON.parse(row.details).manifestId : undefined,
    checksumSha256: row.details ? JSON.parse(row.details).checksumSha256 : undefined,
    errors: row.details ? (JSON.parse(row.details).errors ?? []) : [],
  };
}

function mapEvidenceManifest(row: any): EvidenceManifest {
  return {
    evidenceId: row.id,
    caseId: row.case_id,
    exportedBy: row.exported_by,
    exportedAt: row.created_at.toISOString(),
    sourceSegments: JSON.parse(row.source_segments),
    destinationFile: JSON.parse(row.destination_file),
    timestamp: JSON.parse(row.timestamp),
    signature: row.signature ?? undefined,
  };
}

function mapChainOfCustodyEvent(row: any): ChainOfCustodyEvent {
  return {
    id: row.id,
    evidenceId: row.evidence_id ?? undefined,
    action: row.action,
    performedBy: row.performed_by,
    performedAt: row.created_at.toISOString(),
    sourceIp: row.source_ip ?? undefined,
    reason: row.reason ?? undefined,
    previousHash: row.previous_hash ?? undefined,
    eventHash: row.event_hash,
    signature: row.signature ?? undefined,
  };
}

function mapRecordingLegalHold(row: any): RecordingLegalHold {
  return {
    id: row.id,
    tenantId: row.tenant_id ?? undefined,
    cameraId: row.camera_id ?? undefined,
    fromAt: (row.from_at ?? row.start_time)?.toISOString(),
    toAt: (row.to_at ?? row.end_time)?.toISOString(),
    reason: row.reason,
    createdBy: row.created_by ?? row.requested_by,
    createdAt: row.created_at.toISOString(),
    releasedBy: row.released_by ?? undefined,
    releasedAt: row.released_at?.toISOString(),
  };
}
