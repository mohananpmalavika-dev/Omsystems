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

  async saveManifest(input: {
    id: string;
    tenantId?: string;
    caseId?: string;
    exportJobId?: string;
    manifestData: any;
    signature: string;
    signingKeyId: string;
  }): Promise<EvidenceManifest> {
    const manifestJson = typeof input.manifestData === "string" ? input.manifestData : JSON.stringify(input.manifestData);
    const result = await this.pool.query(
      `INSERT INTO evidence_manifests (
         id, tenant_id, case_id, destination_file, signature, signing_key_id, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, now())
       ON CONFLICT (id) DO UPDATE SET
         signature = EXCLUDED.signature,
         signing_key_id = EXCLUDED.signing_key_id
       RETURNING *`,
      [
        input.id,
        input.tenantId || null,
        input.caseId || null,
        manifestJson,
        input.signature,
        input.signingKeyId,
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
    actorType?: "USER" | "SYSTEM" | "SERVICE";
    reason?: string;
    sourceIp?: string;
    workstationId?: string;
  }): Promise<ChainOfCustodyEvent> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      let nextSequence = 1;
      let previousHash: string | null = null;

      if (input.evidenceId) {
        // Prevent concurrent writer race conditions and ledger forking via transaction advisory lock
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [input.evidenceId]);

        const prevResult = await client.query(
          `SELECT sequence, event_hash FROM chain_of_custody_events 
           WHERE evidence_id = $1
           ORDER BY sequence DESC NULLS LAST, created_at DESC
           LIMIT 1`,
          [input.evidenceId],
        );

        if (prevResult.rows[0]) {
          nextSequence = (prevResult.rows[0].sequence || 0) + 1;
          previousHash = prevResult.rows[0].event_hash || null;
        }
      }

      const timestamp = new Date().toISOString();
      const canonicalPayload = JSON.stringify({
        evidenceId: input.evidenceId,
        sequence: nextSequence,
        action: input.action,
        performedBy: input.performedBy,
        actorType: input.actorType || "USER",
        reason: input.reason || null,
        sourceIp: input.sourceIp || null,
        workstationId: input.workstationId || null,
        timestamp,
        previousHash: previousHash || "0".repeat(64),
      });

      const { createHash } = await import("node:crypto");
      const eventHash = createHash("sha256")
        .update(canonicalPayload + (previousHash || "0".repeat(64)))
        .digest("hex");

      const result = await client.query(
        `INSERT INTO chain_of_custody_events (
           id, evidence_id, sequence, action, performed_by, actor_type, reason, source_ip,
           workstation_id, event_hash, previous_hash, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
         RETURNING *`,
        [
          randomUUID(),
          input.evidenceId ?? null,
          nextSequence,
          input.action,
          input.performedBy,
          input.actorType || "USER",
          input.reason ?? null,
          input.sourceIp ?? null,
          input.workstationId ?? null,
          eventHash,
          previousHash,
        ],
      );

      await client.query("COMMIT");
      return mapChainOfCustodyEvent(result.rows[0]);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async appendCustodyEvent(input: {
    evidenceId?: string;
    eventType: CustodyAction;
    actor: string;
    actorType?: "USER" | "SYSTEM" | "SERVICE";
    reason?: string;
    sourceIp?: string;
    workstationId?: string;
    details?: any;
  }): Promise<ChainOfCustodyEvent> {
    return this.recordCustodyEvent({
      evidenceId: input.evidenceId,
      action: input.eventType,
      performedBy: input.actor,
      actorType: input.actorType,
      reason: input.reason,
      sourceIp: input.sourceIp,
      workstationId: input.workstationId,
    });
  }

  async getCustodyLog(evidenceId: string): Promise<ChainOfCustodyEvent[]> {
    const result = await this.pool.query(
      `SELECT * FROM chain_of_custody_events
       WHERE evidence_id = $1
       ORDER BY sequence ASC NULLS FIRST, created_at ASC`,
      [evidenceId],
    );
    return result.rows.map(mapChainOfCustodyEvent);
  }

  async getCustodyHistory(evidenceId: string): Promise<ChainOfCustodyEvent[]> {
    return this.getCustodyLog(evidenceId);
  }

  async verifyCustodyChain(evidenceId: string): Promise<{
    valid: boolean;
    eventCount: number;
    brokenSequence?: number;
    error?: string;
  }> {
    const events = await this.getCustodyLog(evidenceId);
    if (events.length === 0) return { valid: true, eventCount: 0 };

    let expectedPrevHash = "0".repeat(64);

    for (let i = 0; i < events.length; i++) {
      const cur = events[i]!;
      const expectedSeq = i + 1;
      if (cur.sequence !== undefined && cur.sequence !== expectedSeq) {
        return {
          valid: false,
          eventCount: events.length,
          brokenSequence: cur.sequence,
          error: `Sequence mismatch: expected ${expectedSeq}, got ${cur.sequence}`,
        };
      }

      if (i > 0 && cur.previousHash !== expectedPrevHash) {
        return {
          valid: false,
          eventCount: events.length,
          brokenSequence: cur.sequence || expectedSeq,
          error: `Hash link broken at sequence ${expectedSeq}`,
        };
      }

      expectedPrevHash = cur.eventHash;
    }

    return { valid: true, eventCount: events.length };
  }

  // Legal Holds
  async createLegalHold(input: RecordingLegalHoldRequest & {
    requestedBy: string;
    tenantId?: string;
    branchId?: string;
    evidencePackageIds?: string[];
  }): Promise<RecordingLegalHold> {
    const id = randomUUID();
    const result = await this.pool.query(
      `INSERT INTO recording_legal_holds (
         id, tenant_id, branch_id, case_number, reason, requested_by, camera_id, camera_ids,
         evidence_package_ids, start_time, end_time, from_at, to_at, review_date, expiry_date,
         status, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $10, $11, $12, $13, 'active', now())
       RETURNING *`,
      [
        id,
        input.tenantId ?? null,
        input.branchId ?? null,
        input.caseNumber,
        input.reason,
        input.requestedBy,
        input.cameraIds?.[0] ?? null,
        JSON.stringify(input.cameraIds || []),
        JSON.stringify(input.evidencePackageIds || []),
        input.startTime,
        input.endTime,
        input.reviewDate ?? null,
        input.expiryDate ?? null,
      ],
    );
    return mapRecordingLegalHold(result.rows[0]);
  }

  async releaseLegalHold(
    holdId: string,
    releasedBy: string,
    reason?: string,
  ): Promise<RecordingLegalHold | undefined> {
    const result = await this.pool.query(
      `UPDATE recording_legal_holds
       SET status = 'released',
           released_by = $2,
           release_reason = $3,
           released_at = now()
       WHERE id = $1
       RETURNING *`,
      [holdId, releasedBy, reason ?? null],
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

  async listLegalHolds(filters?: {
    tenantId?: string;
    cameraId?: string;
    branchId?: string;
    status?: string;
  }): Promise<RecordingLegalHold[]> {
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (filters?.tenantId) {
      conditions.push(`tenant_id = $${idx++}`);
      params.push(filters.tenantId);
    }
    if (filters?.cameraId) {
      conditions.push(`(camera_id = $${idx} OR (camera_ids IS NOT NULL AND camera_ids::text LIKE '%' || $${idx} || '%'))`);
      params.push(filters.cameraId);
      idx++;
    }
    if (filters?.branchId) {
      conditions.push(`branch_id = $${idx++}`);
      params.push(filters.branchId);
    }
    if (filters?.status) {
      conditions.push(`status = $${idx++}`);
      params.push(filters.status);
    } else {
      conditions.push(`(status = 'active' OR status IS NULL) AND released_at IS NULL`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const result = await this.pool.query(
      `SELECT * FROM recording_legal_holds ${whereClause} ORDER BY created_at DESC`,
      params,
    );
    return result.rows.map(mapRecordingLegalHold);
  }

  /**
   * Evaluates if a segment/interval is protected under an active persistent legal hold
   */
  async isSegmentProtected(params: {
    cameraId: string;
    timestamp?: Date | string;
    branchId?: string;
    tenantId?: string;
    segmentId?: string;
  }): Promise<{ protected: boolean; hold?: RecordingLegalHold; reason?: string }> {
    const ts = params.timestamp ? new Date(params.timestamp).toISOString() : new Date().toISOString();
    const result = await this.pool.query(
      `SELECT * FROM recording_legal_holds
       WHERE (status = 'active' OR status IS NULL)
         AND released_at IS NULL
         AND (
           camera_id = $1
           OR (camera_ids IS NOT NULL AND camera_ids::text LIKE '%' || $1 || '%')
         )
         AND (from_at IS NULL OR from_at <= $2::timestamptz OR start_time IS NULL OR start_time <= $2::timestamptz)
         AND (to_at IS NULL OR to_at >= $2::timestamptz OR end_time IS NULL OR end_time >= $2::timestamptz)
       LIMIT 1`,
      [params.cameraId, ts],
    );

    if (result.rows[0]) {
      const hold = mapRecordingLegalHold(result.rows[0]);
      return {
        protected: true,
        hold,
        reason: `Protected by active Legal Hold ${hold.id} (${hold.caseNumber || 'Active Case'}): ${hold.reason}`,
      };
    }

    return { protected: false };
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
    sourceSegments: typeof row.source_segments === 'string' ? JSON.parse(row.source_segments) : row.source_segments,
    destinationFile: typeof row.destination_file === 'string' ? JSON.parse(row.destination_file) : row.destination_file,
    timestamp: typeof row.timestamp === 'string' ? JSON.parse(row.timestamp) : row.timestamp,
    signature: row.signature ?? row.digital_signature ?? undefined,
  };
}

function mapChainOfCustodyEvent(row: any): ChainOfCustodyEvent {
  return {
    id: row.id,
    evidenceId: row.evidence_id ?? undefined,
    sequence: row.sequence !== null && row.sequence !== undefined ? Number(row.sequence) : undefined,
    action: row.action,
    performedBy: row.performed_by,
    actorType: row.actor_type ?? "USER",
    performedAt: row.created_at.toISOString(),
    sourceIp: row.source_ip ?? undefined,
    workstationId: row.workstation_id ?? undefined,
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
    caseNumber: row.case_number ?? undefined,
    fromAt: (row.from_at ?? row.start_time)?.toISOString(),
    toAt: (row.to_at ?? row.end_time)?.toISOString(),
    reason: row.reason,
    status: row.status ?? "active",
    createdBy: row.created_by ?? row.requested_by,
    createdAt: row.created_at.toISOString(),
    releasedBy: row.released_by ?? undefined,
    releasedAt: row.released_at?.toISOString(),
  };
}
