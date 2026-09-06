import { randomUUID, createHash } from "node:crypto";
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

/**
 * Deterministic, canonical JSON stringifier for forensic hashing.
 * Sorts object keys recursively to guarantee byte-level repeatability.
 */
export function canonicalJsonStringify(obj: any): string {
  if (obj === null || typeof obj !== "object") {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return `[${obj.map((item) => canonicalJsonStringify(item)).join(",")}]`;
  }
  const sortedKeys = Object.keys(obj).sort();
  const entries = sortedKeys.map((key) => `"${key}":${canonicalJsonStringify(obj[key])}`);
  return `{${entries.join(",")}}`;
}

/**
 * Exception raised when legal hold status cannot be verified due to
 * database/authority unavailability.
 * Enforces the banking fail-closed invariant: DB unavailable -> retention deletion denied.
 */
export class LegalHoldStatusUnknownError extends Error {
  public readonly code = "LEGAL_HOLD_STATUS_UNKNOWN";
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "LegalHoldStatusUnknownError";
  }
}

export interface CustodyEventInput {
  evidenceId: string;
  action: CustodyAction | string;
  performedBy: string;
  actorType?: "USER" | "SYSTEM" | "SERVICE";
  reason?: string | null;
  sourceIp?: string | null;
  workstationId?: string | null;
  timestamp?: string;
  details?: any;
}

/**
 * Single Authoritative Custody Writer Transactional Function.
 * Serializes writes using PostgreSQL advisory transaction lock `pg_advisory_xact_lock`,
 * computes strict sequence numbers, chains SHA-256 hashes, and records immutable event entries.
 */
export async function appendCustodyEventTx(
  client: any,
  input: CustodyEventInput,
): Promise<ChainOfCustodyEvent> {
  const evidenceId = input.evidenceId;

  // 1. Transaction-scoped advisory lock serializes concurrent writers on the evidence entity
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [evidenceId]);

  // 2. Query the highest sequence and previous hash for this evidence ledger
  const prevResult = await client.query(
    `SELECT sequence, event_hash FROM chain_of_custody_events 
     WHERE evidence_id = $1
     ORDER BY sequence DESC NULLS LAST, created_at DESC
     LIMIT 1`,
    [evidenceId],
  );

  const nextSequence = (prevResult.rows[0]?.sequence || 0) + 1;
  const previousHash = prevResult.rows[0]?.event_hash || null;
  const timestamp = input.timestamp || new Date().toISOString();

  // 3. Build canonical payload including all security-relevant fields (P0-05)
  const canonicalPayload = canonicalJsonStringify({
    action: input.action,
    actorType: input.actorType || "USER",
    evidenceId,
    performedBy: input.performedBy,
    previousHash: previousHash || "0".repeat(64),
    reason: input.reason || null,
    sequence: nextSequence,
    sourceIp: input.sourceIp || null,
    timestamp,
    workstationId: input.workstationId || null,
  });

  const eventHash = createHash("sha256")
    .update(canonicalPayload + (previousHash || "0".repeat(64)))
    .digest("hex");

  const eventId = randomUUID();
  const result = await client.query(
    `INSERT INTO chain_of_custody_events (
       id, evidence_id, sequence, action, performed_by, actor_type, reason, source_ip,
       workstation_id, event_hash, previous_hash, created_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::timestamptz)
     RETURNING *`,
    [
      eventId,
      evidenceId,
      nextSequence,
      input.action,
      input.performedBy,
      input.actorType || "USER",
      input.reason ?? null,
      input.sourceIp ?? null,
      input.workstationId ?? null,
      eventHash,
      previousHash,
      timestamp,
    ],
  );

  return mapChainOfCustodyEvent(result.rows[0]);
}

export class EvidenceRepository {
  constructor(private readonly pool: Pool) {}

  // ============================================================================
  // EVIDENCE CASES (Scoped to tenantId for repository-level isolation - P0-17)
  // ============================================================================

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

  async getCase(caseId: string, tenantId?: string): Promise<EvidenceCase | undefined> {
    const result = await this.pool.query(
      `SELECT * FROM evidence_cases WHERE id = $1 ${tenantId ? "AND tenant_id = $2" : ""}`,
      tenantId ? [caseId, tenantId] : [caseId],
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

  async updateCaseStatus(
    caseId: string,
    status: EvidenceCaseStatus,
    tenantId?: string,
  ): Promise<EvidenceCase | undefined> {
    const result = await this.pool.query(
      `UPDATE evidence_cases 
       SET status = $2, updated_at = now()
       WHERE id = $1 ${tenantId ? "AND tenant_id = $3" : ""}
       RETURNING *`,
      tenantId ? [caseId, status, tenantId] : [caseId, status],
    );
    return result.rows[0] ? mapEvidenceCase(result.rows[0]) : undefined;
  }

  // ============================================================================
  // EVIDENCE ITEMS (Tenant-safe queries via case join - P0-17)
  // ============================================================================

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
    tenantId?: string,
  ): Promise<EvidenceItem> {
    if (tenantId) {
      const existingCase = await this.getCase(caseId, tenantId);
      if (!existingCase) {
        throw new Error("Evidence case not found or tenant unauthorized");
      }
    }

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

  async listItems(caseId: string, tenantId?: string): Promise<EvidenceItem[]> {
    const result = await this.pool.query(
      `SELECT ei.* FROM evidence_items ei
       ${tenantId ? "JOIN evidence_cases ec ON ec.id = ei.case_id" : ""}
       WHERE ei.case_id = $1
       ${tenantId ? "AND ec.tenant_id = $2" : ""}
       ORDER BY ei.created_at DESC`,
      tenantId ? [caseId, tenantId] : [caseId],
    );
    return result.rows.map(mapEvidenceItem);
  }

  async getItem(itemId: string, tenantId?: string): Promise<EvidenceItem | undefined> {
    const result = await this.pool.query(
      `SELECT ei.* FROM evidence_items ei
       ${tenantId ? "JOIN evidence_cases ec ON ec.id = ei.case_id" : ""}
       WHERE ei.id = $1
       ${tenantId ? "AND ec.tenant_id = $2" : ""}`,
      tenantId ? [itemId, tenantId] : [itemId],
    );
    return result.rows[0] ? mapEvidenceItem(result.rows[0]) : undefined;
  }

  // ============================================================================
  // EVIDENCE EXPORTS
  // ============================================================================

  async requestExport(
    caseId: string,
    input: {
      format: EvidenceExportFormat;
      reason: string;
      exportedBy: string;
    },
    tenantId?: string,
  ): Promise<EvidenceExport> {
    if (tenantId) {
      const existingCase = await this.getCase(caseId, tenantId);
      if (!existingCase) {
        throw new Error("Evidence case not found or tenant unauthorized");
      }
    }

    const result = await this.pool.query(
      `INSERT INTO evidence_exports (
         id, case_id, format, reason, exported_by, status, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, now())
       RETURNING *`,
      [randomUUID(), caseId, input.format, input.reason, input.exportedBy, "pending"],
    );
    return mapEvidenceExport(result.rows[0]);
  }

  async getExport(exportId: string, tenantId?: string): Promise<EvidenceExport | undefined> {
    const result = await this.pool.query(
      `SELECT ee.* FROM evidence_exports ee
       ${tenantId ? "JOIN evidence_cases ec ON ec.id = ee.case_id" : ""}
       WHERE ee.id = $1
       ${tenantId ? "AND ec.tenant_id = $2" : ""}`,
      tenantId ? [exportId, tenantId] : [exportId],
    );
    return result.rows[0] ? mapEvidenceExport(result.rows[0]) : undefined;
  }

  async updateExportStatus(
    exportId: string,
    status: "pending" | "processing" | "ready" | "failed",
    details?: Record<string, unknown>,
    tenantId?: string,
  ): Promise<EvidenceExport | undefined> {
    const result = await this.pool.query(
      `UPDATE evidence_exports ee
       SET status = $2, details = $3, updated_at = now()
       ${tenantId ? "FROM evidence_cases ec" : ""}
       WHERE ee.id = $1
       ${tenantId ? "AND ec.id = ee.case_id AND ec.tenant_id = $4" : ""}
       RETURNING ee.*`,
      tenantId ? [exportId, status, JSON.stringify(details ?? {}), tenantId] : [exportId, status, JSON.stringify(details ?? {})],
    );
    return result.rows[0] ? mapEvidenceExport(result.rows[0]) : undefined;
  }

  // ============================================================================
  // EVIDENCE MANIFESTS
  // ============================================================================

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

  async getManifest(manifestId: string, tenantId?: string): Promise<EvidenceManifest | undefined> {
    const result = await this.pool.query(
      `SELECT em.* FROM evidence_manifests em
       ${tenantId ? "LEFT JOIN evidence_cases ec ON ec.id = em.case_id" : ""}
       WHERE em.id = $1
       ${tenantId ? "AND (em.tenant_id = $2 OR ec.tenant_id = $2)" : ""}`,
      tenantId ? [manifestId, tenantId] : [manifestId],
    );
    return result.rows[0] ? mapEvidenceManifest(result.rows[0]) : undefined;
  }

  // ============================================================================
  // CHAIN OF CUSTODY (Authoritative Writer & Verifier - P0-03, P0-05, P0-07)
  // ============================================================================

  async recordCustodyEvent(input: CustodyEventInput): Promise<ChainOfCustodyEvent> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const event = await appendCustodyEventTx(client, input);
      await client.query("COMMIT");
      return event;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async appendCustodyEvent(input: {
    evidenceId?: string;
    eventType?: CustodyAction | string;
    action?: CustodyAction | string;
    actor?: string;
    performedBy?: string;
    actorType?: "USER" | "SYSTEM" | "SERVICE";
    reason?: string;
    sourceIp?: string;
    workstationId?: string;
    timestamp?: string;
    details?: any;
  }): Promise<ChainOfCustodyEvent> {
    const evidenceId = input.evidenceId || "system";
    const action = (input.eventType || input.action || "evidence_accessed") as CustodyAction;
    const performedBy = input.performedBy || input.actor || "system";
    return this.recordCustodyEvent({
      evidenceId,
      action,
      performedBy,
      actorType: input.actorType,
      reason: input.reason,
      sourceIp: input.sourceIp,
      workstationId: input.workstationId,
      timestamp: input.timestamp,
    });
  }

  async getCustodyLog(evidenceId: string, tenantId?: string): Promise<ChainOfCustodyEvent[]> {
    if (tenantId) {
      // Cross-tenant verification: check if this evidence entity belongs to the tenant
      const ownershipCheck = await this.pool.query(
        `SELECT id FROM evidence_cases WHERE id = $1 AND tenant_id = $2
         UNION
         SELECT id FROM recording_legal_holds WHERE id = $1 AND tenant_id = $2
         UNION
         SELECT id FROM forensic_export_jobs WHERE id = $1 AND tenant_id = $2`,
        [evidenceId, tenantId],
      );
      if (ownershipCheck.rows.length === 0) {
        return [];
      }
    }

    const result = await this.pool.query(
      `SELECT * FROM chain_of_custody_events
       WHERE evidence_id = $1
       ORDER BY sequence ASC NULLS FIRST, created_at ASC`,
      [evidenceId],
    );
    return result.rows.map(mapChainOfCustodyEvent);
  }

  async getCustodyHistory(evidenceId: string, tenantId?: string): Promise<ChainOfCustodyEvent[]> {
    return this.getCustodyLog(evidenceId, tenantId);
  }

  /**
   * Cryptographically verifies the custody chain.
   * Independent Recomputation (P0-05): Recomputes SHA-256 for EVERY event payload.
   * Any tampering with reason, performed_by, created_at, source_ip, or action
   * invalidates the chain.
   */
  async verifyCustodyChain(evidenceId: string, tenantId?: string): Promise<{
    valid: boolean;
    eventCount: number;
    brokenSequence?: number;
    error?: string;
  }> {
    const events = await this.getCustodyLog(evidenceId, tenantId);
    if (events.length === 0) return { valid: true, eventCount: 0 };

    let expectedPrevHash = "0".repeat(64);

    for (let i = 0; i < events.length; i++) {
      const cur = events[i]!;
      const expectedSeq = i + 1;

      // 1. Strict sequence monotonicity
      if (cur.sequence !== undefined && cur.sequence !== expectedSeq) {
        return {
          valid: false,
          eventCount: events.length,
          brokenSequence: cur.sequence,
          error: `Sequence mismatch: expected ${expectedSeq}, got ${cur.sequence}`,
        };
      }

      // 2. Cryptographic previous hash linkage
      if (i > 0 && cur.previousHash !== expectedPrevHash) {
        return {
          valid: false,
          eventCount: events.length,
          brokenSequence: cur.sequence || expectedSeq,
          error: `Hash link broken at sequence ${expectedSeq}`,
        };
      }

      // 3. Independent event hash recomputation from canonical fields (P0-05)
      const canonicalPayload = canonicalJsonStringify({
        action: cur.action,
        actorType: cur.actorType || "USER",
        evidenceId: cur.evidenceId || evidenceId,
        performedBy: cur.performedBy,
        previousHash: cur.previousHash || "0".repeat(64),
        reason: cur.reason || null,
        sequence: cur.sequence || expectedSeq,
        sourceIp: cur.sourceIp || null,
        timestamp: new Date(cur.performedAt).toISOString(),
        workstationId: cur.workstationId || null,
      });

      const recomputedHash = createHash("sha256")
        .update(canonicalPayload + (cur.previousHash || "0".repeat(64)))
        .digest("hex");

      if (recomputedHash !== cur.eventHash) {
        return {
          valid: false,
          eventCount: events.length,
          brokenSequence: cur.sequence || expectedSeq,
          error: `Event hash mismatch at sequence ${expectedSeq}: payload tampered (expected ${recomputedHash}, got ${cur.eventHash})`,
        };
      }

      expectedPrevHash = cur.eventHash;
    }

    return { valid: true, eventCount: events.length };
  }

  // ============================================================================
  // LEGAL HOLDS (Authoritative Single Authority - P0-08, P0-11, P0-12)
  // ============================================================================

  async createLegalHold(input: RecordingLegalHoldRequest & {
    requestedBy: string;
    tenantId?: string;
    branchId?: string;
    evidencePackageIds?: string[];
    referenceNumber?: string;
  }): Promise<RecordingLegalHold> {
    const id = randomUUID();
    const year = new Date().getFullYear();
    const hexSuffix = randomUUID().substring(0, 8).toUpperCase();
    const referenceNumber = input.referenceNumber || `LH-${year}-${hexSuffix}`;

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const result = await client.query(
        `INSERT INTO recording_legal_holds (
           id, reference_number, tenant_id, branch_id, case_number, reason, requested_by, camera_id, camera_ids,
           evidence_package_ids, start_time, end_time, from_at, to_at, review_date, expiry_date,
           status, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $11, $12, $13, $14, 'active', now())
         RETURNING *`,
        [
          id,
          referenceNumber,
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

      // Record custody event via authoritative transactional writer
      const hold = mapRecordingLegalHold(result.rows[0]);
      await appendCustodyEventTx(client, {
        evidenceId: hold.id,
        action: "LEGAL_HOLD_APPLIED",
        performedBy: input.requestedBy,
        reason: `Legal Hold ${referenceNumber} applied for case ${input.caseNumber}: ${input.reason}`,
      });

      // Record custody event for any associated evidence packages
      if (input.evidencePackageIds && input.evidencePackageIds.length > 0) {
        for (const pkgId of input.evidencePackageIds) {
          await appendCustodyEventTx(client, {
            evidenceId: pkgId,
            action: "LEGAL_HOLD_APPLIED",
            performedBy: input.requestedBy,
            reason: `Protected under Legal Hold ${referenceNumber} (${hold.id})`,
          });
        }
      }

      await client.query("COMMIT");
      return hold;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Release Legal Hold Transaction (P0-11):
   * Row-level lock, verify status, update row, append hash-chained custody event.
   * If custody write fails: ROLLBACK.
   */
  async releaseLegalHold(
    holdIdOrRef: string,
    releasedBy: string,
    reason?: string,
    auditContext?: { ipAddress?: string; workstationId?: string },
    tenantId?: string,
  ): Promise<RecordingLegalHold | undefined> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      // 1. SELECT hold FOR UPDATE (lock row)
      const selectRes = await client.query(
        `SELECT * FROM recording_legal_holds
         WHERE (id = $1 OR reference_number = $1 OR case_number = $1)
         ${tenantId ? "AND tenant_id = $2" : ""}
         FOR UPDATE`,
        tenantId ? [holdIdOrRef, tenantId] : [holdIdOrRef],
      );

      if (selectRes.rows.length === 0) {
        await client.query("ROLLBACK");
        return undefined;
      }

      const holdRow = selectRes.rows[0];
      if (holdRow.status === "released") {
        await client.query("COMMIT");
        return mapRecordingLegalHold(holdRow);
      }

      // 2. UPDATE status = 'released'
      const updateRes = await client.query(
        `UPDATE recording_legal_holds
         SET status = 'released',
             released_by = $2,
             release_reason = $3,
             released_at = now()
         WHERE id = $1
         RETURNING *`,
        [holdRow.id, releasedBy, reason ?? null],
      );

      const updatedHold = mapRecordingLegalHold(updateRes.rows[0]);

      // 3. Append custody event for the legal hold itself using appendCustodyEventTx
      await appendCustodyEventTx(client, {
        evidenceId: updatedHold.id,
        action: "LEGAL_HOLD_RELEASED",
        performedBy: releasedBy,
        reason: `Legal Hold ${updatedHold.referenceNumber || updatedHold.id} released: ${reason || "Closed"}`,
        sourceIp: auditContext?.ipAddress ?? null,
        workstationId: auditContext?.workstationId ?? null,
      });

      // 4. Append custody event for all associated evidence packages
      const evidencePkgIds = Array.isArray(holdRow.evidence_package_ids)
        ? holdRow.evidence_package_ids
        : typeof holdRow.evidence_package_ids === "string"
        ? JSON.parse(holdRow.evidence_package_ids)
        : [];

      for (const pkgId of evidencePkgIds) {
        await appendCustodyEventTx(client, {
          evidenceId: pkgId,
          action: "LEGAL_HOLD_RELEASED",
          performedBy: releasedBy,
          reason: `Legal Hold ${updatedHold.referenceNumber || updatedHold.id} released: ${reason || "Closed"}`,
          sourceIp: auditContext?.ipAddress ?? null,
          workstationId: auditContext?.workstationId ?? null,
        });
      }

      await client.query("COMMIT");
      return updatedHold;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async getLegalHold(holdId: string, tenantId?: string): Promise<RecordingLegalHold | undefined> {
    const result = await this.pool.query(
      `SELECT * FROM recording_legal_holds 
       WHERE (id = $1 OR reference_number = $1)
       ${tenantId ? "AND tenant_id = $2" : ""}`,
      tenantId ? [holdId, tenantId] : [holdId],
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
   * Evaluates if a segment/interval is protected under an active persistent legal hold.
   * Fail-Closed Invariant (P0-10): If PostgreSQL or legal-hold authority is unavailable,
   * it throws LegalHoldStatusUnknownError instead of assuming "NO HOLD".
   */
  async isSegmentProtected(params: {
    cameraId: string;
    timestamp?: Date | string;
    branchId?: string;
    tenantId?: string;
    segmentId?: string;
  }): Promise<{ protected: boolean; hold?: RecordingLegalHold; reason?: string }> {
    try {
      const ts = params.timestamp ? new Date(params.timestamp).toISOString() : new Date().toISOString();
      const conditions: string[] = [
        "(status = 'active' OR status IS NULL)",
        "released_at IS NULL",
        "(camera_id = $1 OR (camera_ids IS NOT NULL AND camera_ids::text LIKE '%' || $1 || '%'))",
        "(from_at IS NULL OR from_at <= $2::timestamptz OR start_time IS NULL OR start_time <= $2::timestamptz)",
        "(to_at IS NULL OR to_at >= $2::timestamptz OR end_time IS NULL OR end_time >= $2::timestamptz)",
      ];
      const sqlParams: any[] = [params.cameraId, ts];

      if (params.tenantId) {
        conditions.push(`(tenant_id = $3 OR tenant_id IS NULL)`);
        sqlParams.push(params.tenantId);
      }

      const result = await this.pool.query(
        `SELECT * FROM recording_legal_holds
         WHERE ${conditions.join(" AND ")}
         LIMIT 1`,
        sqlParams,
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
    } catch (err) {
      throw new LegalHoldStatusUnknownError(
        `LEGAL_HOLD_STATUS_UNKNOWN: Failed to verify legal hold protection for camera ${params.cameraId}: ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
    }
  }
}

// ============================================================================
// ENTITY MAPPERS
// ============================================================================

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
    performedAt: row.created_at instanceof Date ? row.created_at.toISOString() : new Date(row.created_at).toISOString(),
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
    referenceNumber: row.reference_number ?? undefined,
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
    releaseReason: row.release_reason ?? undefined,
  };
}
