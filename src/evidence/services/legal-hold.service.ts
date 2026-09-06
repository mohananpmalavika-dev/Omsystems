/**
 * Legal Hold Service
 * 
 * First-class legal hold management that protects forensic evidence packages,
 * central archives, and recorder recording intervals from retention policy deletion.
 * Persists directly to PostgreSQL with restart survival.
 */

import { randomUUID } from "node:crypto";
import type { LegalHoldRecord } from "../domain/forensic-evidence.types.js";
import { chainOfCustodyService } from "./chain-of-custody.service.js";
import { pool } from "../../database/pool.js";

export interface CreateLegalHoldInput {
  tenantId: string;
  caseNumber: string;
  reason: string;
  evidencePackageIds?: string[];
  cameraIds?: string[];
  startTime?: string;
  endTime?: string;
  createdBy: string;
}

export class LegalHoldService {
  private memoryHolds: Map<string, LegalHoldRecord> = new Map();

  /**
   * Applies a Legal Hold to evidence packages and camera recording ranges.
   * Persists to PostgreSQL with canonical UUID and reference number so it survives process restarts.
   */
  async createLegalHold(input: CreateLegalHoldInput): Promise<LegalHoldRecord> {
    const dbId = randomUUID();
    const year = new Date().getFullYear();
    const hexSuffix = randomUUID().substring(0, 8).toUpperCase();
    const referenceNumber = `LH-${year}-${hexSuffix}`;
    const now = new Date().toISOString();

    const record: LegalHoldRecord = {
      id: dbId,
      referenceNumber,
      tenantId: input.tenantId,
      caseNumber: input.caseNumber,
      reason: input.reason,
      evidencePackageIds: input.evidencePackageIds || [],
      cameraIds: input.cameraIds,
      startTime: input.startTime,
      endTime: input.endTime,
      status: "ACTIVE",
      createdBy: input.createdBy,
      createdAt: now,
    };

    if (pool) {
      await pool.query(
        `INSERT INTO recording_legal_holds (
           id, reference_number, tenant_id, case_number, reason, requested_by, camera_ids,
           evidence_package_ids, start_time, end_time, from_at, to_at, status, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $9, $10, 'active', now())`,
        [
          dbId,
          referenceNumber,
          input.tenantId,
          input.caseNumber,
          input.reason,
          input.createdBy,
          JSON.stringify(input.cameraIds || []),
          JSON.stringify(input.evidencePackageIds || []),
          input.startTime ?? null,
          input.endTime ?? null,
        ],
      );
    }

    this.memoryHolds.set(dbId, record);
    this.memoryHolds.set(referenceNumber, record);

    // Record custody events for all locked evidence packages
    for (const pkgId of record.evidencePackageIds) {
      await chainOfCustodyService.recordEvent({
        evidencePackageId: pkgId,
        event: "LEGAL_HOLD_APPLIED",
        actorId: input.createdBy,
        actorType: "USER",
        reason: `Legal Hold ${referenceNumber} (${dbId}) applied for case ${input.caseNumber}: ${input.reason}`,
      });
    }

    return record;
  }

  /**
   * Releases an active Legal Hold via row-locked transaction
   */
  async releaseLegalHold(holdIdOrRef: string, releasedBy: string, reason?: string): Promise<LegalHoldRecord> {
    let releasedRow: any = null;

    if (pool) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        // 1. Row-level exclusive lock to prevent concurrent release races
        const selectRes = await client.query(
          `SELECT * FROM recording_legal_holds
           WHERE (id::text = $1 OR reference_number = $1 OR case_number = $1)
           FOR UPDATE`,
          [holdIdOrRef],
        );

        if (selectRes.rows.length > 0) {
          const holdRow = selectRes.rows[0];
          if (holdRow.status !== "released") {
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
            releasedRow = updateRes.rows[0];
          } else {
            releasedRow = holdRow;
          }
        }

        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    }

    const hold = this.memoryHolds.get(holdIdOrRef);

    if (!hold) {
      const releasedRecord: LegalHoldRecord = {
        id: releasedRow?.id || holdIdOrRef,
        referenceNumber: releasedRow?.reference_number || (holdIdOrRef.startsWith("LH-") ? holdIdOrRef : undefined),
        tenantId: releasedRow?.tenant_id || "",
        caseNumber: releasedRow?.case_number || holdIdOrRef,
        reason: reason || "Investigation closed",
        evidencePackageIds: releasedRow?.evidence_package_ids
          ? (typeof releasedRow.evidence_package_ids === "string" ? JSON.parse(releasedRow.evidence_package_ids) : releasedRow.evidence_package_ids)
          : [],
        status: "RELEASED",
        createdBy: releasedRow?.requested_by || releasedBy,
        createdAt: releasedRow?.created_at?.toISOString?.() || new Date().toISOString(),
        releasedBy,
        releasedAt: new Date().toISOString(),
        releaseReason: reason,
      };
      this.memoryHolds.set(releasedRecord.id, releasedRecord);
      if (releasedRecord.referenceNumber) {
        this.memoryHolds.set(releasedRecord.referenceNumber, releasedRecord);
      }
      return releasedRecord;
    }

    if (hold.status === "RELEASED") {
      return hold;
    }

    hold.status = "RELEASED";
    hold.releasedBy = releasedBy;
    hold.releasedAt = new Date().toISOString();
    hold.releaseReason = reason;

    for (const pkgId of hold.evidencePackageIds) {
      await chainOfCustodyService.recordEvent({
        evidencePackageId: pkgId,
        event: "LEGAL_HOLD_RELEASED",
        actorId: releasedBy,
        actorType: "USER",
        reason: `Legal Hold ${hold.referenceNumber || hold.id} released: ${reason || "Investigation closed"}`,
      });
    }

    return hold;
  }

  /**
   * Evaluates if an evidence package or camera recording interval is protected from deletion
   */
  isProtected(evidencePackageId: string, cameraId?: string, timestamp?: string): boolean {
    for (const hold of this.memoryHolds.values()) {
      if (hold.status !== "ACTIVE") continue;

      if (hold.evidencePackageIds.includes(evidencePackageId)) {
        return true;
      }

      if (cameraId && hold.cameraIds && hold.cameraIds.includes(cameraId)) {
        if (!hold.startTime || !hold.endTime || !timestamp) {
          return true;
        }
        const t = new Date(timestamp).getTime();
        const start = new Date(hold.startTime).getTime();
        const end = new Date(hold.endTime).getTime();
        if (t >= start && t <= end) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Async database-first check for retention protection
   */
  async isProtectedAsync(params: {
    evidencePackageId?: string;
    cameraId?: string;
    timestamp?: Date | string;
    branchId?: string;
  }): Promise<{ protected: boolean; reason?: string }> {
    // 1. Check persistent database holds
    if (pool && params.cameraId) {
      try {
        const ts = params.timestamp ? new Date(params.timestamp).toISOString() : new Date().toISOString();
        const res = await pool.query(
          `SELECT * FROM recording_legal_holds
           WHERE (status = 'active' OR status IS NULL)
             AND released_at IS NULL
             AND (
               camera_id = $1::uuid
               OR (camera_ids IS NOT NULL AND camera_ids::text LIKE '%' || $1 || '%')
             )
             AND (from_at IS NULL OR from_at <= $2::timestamptz OR start_time IS NULL OR start_time <= $2::timestamptz)
             AND (to_at IS NULL OR to_at >= $2::timestamptz OR end_time IS NULL OR end_time >= $2::timestamptz)
           LIMIT 1`,
          [params.cameraId, ts],
        );
        if (res.rows[0]) {
          const row = res.rows[0];
          return {
            protected: true,
            reason: `Protected by persistent Legal Hold ${row.id} (${row.case_number || 'ACTIVE'}): ${row.reason}`,
          };
        }
      } catch {
        // Fall back to memory check
      }
    }

    // 2. Check in-memory holds
    const inMem = this.isProtected(
      params.evidencePackageId || "",
      params.cameraId,
      params.timestamp ? new Date(params.timestamp).toISOString() : undefined,
    );
    return {
      protected: inMem,
      reason: inMem ? "Protected by active legal hold in memory" : undefined,
    };
  }

  getLegalHold(holdId: string): LegalHoldRecord | undefined {
    return this.memoryHolds.get(holdId);
  }

  listActiveHolds(tenantId?: string): LegalHoldRecord[] {
    return Array.from(this.memoryHolds.values()).filter(
      (h) => h.status === "ACTIVE" && (!tenantId || h.tenantId === tenantId),
    );
  }
}

export const legalHoldService = new LegalHoldService();
