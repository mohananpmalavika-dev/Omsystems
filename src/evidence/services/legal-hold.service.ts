/**
 * Legal Hold Service (Authoritative Wrapper)
 * 
 * First-class legal hold management that protects forensic evidence packages,
 * central archives, and recorder recording intervals from retention policy deletion.
 * Authoritative persistence resides in PostgreSQL (recording_legal_holds) via EvidenceRepository.
 * Fails closed (LEGAL_HOLD_AUTHORITY_UNAVAILABLE) if the database authority is unavailable.
 */

import { randomUUID } from "node:crypto";
import type { LegalHoldRecord } from "../domain/forensic-evidence.types.js";
import { chainOfCustodyService } from "./chain-of-custody.service.js";
import { pool } from "../../database/pool.js";
import {
  EvidenceRepository,
  LegalHoldStatusUnknownError,
  appendCustodyEventTx,
} from "../../database/evidence-repository.js";

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
  private testHolds = new Map<string, LegalHoldRecord>();

  /**
   * Applies a Legal Hold to evidence packages and camera recording ranges.
   * Persists to PostgreSQL with canonical UUID and reference number so it survives process restarts.
   * In production, strictly fails closed (503 LEGAL_HOLD_AUTHORITY_UNAVAILABLE) if DB is unavailable.
   */
  async createLegalHold(input: CreateLegalHoldInput): Promise<LegalHoldRecord> {
    const dbId = randomUUID();
    const year = new Date().getFullYear();
    const hexSuffix = randomUUID().substring(0, 8).toUpperCase();
    const referenceNumber = `LH-${year}-${hexSuffix}`;
    const now = new Date().toISOString();

    if (pool) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
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

        // Transactional custody event for the hold
        await appendCustodyEventTx(client, {
          evidenceId: dbId,
          action: "LEGAL_HOLD_APPLIED",
          performedBy: input.createdBy,
          reason: `Legal Hold ${referenceNumber} (${dbId}) applied for case ${input.caseNumber}: ${input.reason}`,
        });

        // Record custody events for all locked evidence packages
        if (input.evidencePackageIds) {
          for (const pkgId of input.evidencePackageIds) {
            await appendCustodyEventTx(client, {
              evidenceId: pkgId,
              action: "LEGAL_HOLD_APPLIED",
              performedBy: input.createdBy,
              reason: `Legal Hold ${referenceNumber} (${dbId}) applied for case ${input.caseNumber}: ${input.reason}`,
            });
          }
        }

        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    } else {
      if (process.env.NODE_ENV !== "test") {
        const err = new Error("LEGAL_HOLD_AUTHORITY_UNAVAILABLE: PostgreSQL database authority is unreachable");
        (err as any).code = "LEGAL_HOLD_AUTHORITY_UNAVAILABLE";
        (err as any).statusCode = 503;
        throw err;
      }

      // Unit test fallback in test environment
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
      this.testHolds.set(dbId, record);
      if (referenceNumber) this.testHolds.set(referenceNumber, record);
      return record;
    }

    return {
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
  }

  /**
   * Releases an active Legal Hold via row-locked transaction (P0-11).
   * In production, strictly fails closed (503 LEGAL_HOLD_AUTHORITY_UNAVAILABLE) if DB is unavailable.
   */
  async releaseLegalHold(holdIdOrRef: string, releasedBy: string, reason?: string): Promise<LegalHoldRecord> {
    if (!pool) {
      if (process.env.NODE_ENV !== "test") {
        const err = new Error("LEGAL_HOLD_AUTHORITY_UNAVAILABLE: PostgreSQL database authority is unreachable");
        (err as any).code = "LEGAL_HOLD_AUTHORITY_UNAVAILABLE";
        (err as any).statusCode = 503;
        throw err;
      }

      // Unit test release
      const hold = this.testHolds.get(holdIdOrRef);
      if (hold) {
        hold.status = "RELEASED";
        hold.releasedBy = releasedBy;
        hold.releasedAt = new Date().toISOString();
        hold.releaseReason = reason;
        return hold;
      }
      throw new Error(`Legal Hold not found: ${holdIdOrRef}`);
    }

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

      if (selectRes.rows.length === 0) {
        await client.query("ROLLBACK");
        throw new Error(`Legal Hold not found: ${holdIdOrRef}`);
      }

      const holdRow = selectRes.rows[0];
      let releasedRow = holdRow;

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
      }

      // 2. Append custody event transactionally using appendCustodyEventTx (P0-11)
      await appendCustodyEventTx(client, {
        evidenceId: releasedRow.id,
        action: "LEGAL_HOLD_RELEASED",
        performedBy: releasedBy,
        reason: `Legal Hold ${releasedRow.reference_number || releasedRow.id} released: ${reason || "Closed"}`,
      });

      const evidencePkgIds = Array.isArray(releasedRow.evidence_package_ids)
        ? releasedRow.evidence_package_ids
        : typeof releasedRow.evidence_package_ids === "string"
        ? JSON.parse(releasedRow.evidence_package_ids)
        : [];

      for (const pkgId of evidencePkgIds) {
        await appendCustodyEventTx(client, {
          evidenceId: pkgId,
          action: "LEGAL_HOLD_RELEASED",
          performedBy: releasedBy,
          reason: `Legal Hold ${releasedRow.reference_number || releasedRow.id} released: ${reason || "Closed"}`,
        });
      }

      await client.query("COMMIT");

      return {
        id: releasedRow.id,
        referenceNumber: releasedRow.reference_number,
        tenantId: releasedRow.tenant_id,
        caseNumber: releasedRow.case_number,
        reason: releasedRow.reason,
        evidencePackageIds: evidencePkgIds,
        cameraIds: Array.isArray(releasedRow.camera_ids)
          ? releasedRow.camera_ids
          : typeof releasedRow.camera_ids === "string"
          ? JSON.parse(releasedRow.camera_ids)
          : [],
        startTime: releasedRow.start_time?.toISOString?.(),
        endTime: releasedRow.end_time?.toISOString?.(),
        status: "RELEASED",
        createdBy: releasedRow.requested_by,
        createdAt: releasedRow.created_at?.toISOString?.() || new Date().toISOString(),
        releasedBy,
        releasedAt: releasedRow.released_at?.toISOString?.() || new Date().toISOString(),
        releaseReason: reason,
      };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Async database-first check for retention protection.
   * Fails closed if the database is unreachable (P0-04, P0-10).
   */
  async isProtectedAsync(params: {
    evidencePackageId?: string;
    cameraId?: string;
    timestamp?: Date | string;
    branchId?: string;
    tenantId?: string;
  }): Promise<{ protected: boolean; reason?: string }> {
    if (!pool) {
      if (process.env.NODE_ENV !== "test") {
        throw new LegalHoldStatusUnknownError(
          "LEGAL_HOLD_AUTHORITY_UNAVAILABLE: PostgreSQL authority unreachable. Legal hold status unknown (failing closed to prevent destructive retention).",
        );
      }

      // Unit test fallback
      for (const hold of this.testHolds.values()) {
        if (hold.status === "ACTIVE") {
          if (params.evidencePackageId && hold.evidencePackageIds?.includes(params.evidencePackageId)) {
            return { protected: true, reason: `Protected by test hold ${hold.id}` };
          }
          if (params.cameraId && hold.cameraIds?.includes(params.cameraId)) {
            return { protected: true, reason: `Protected by test hold ${hold.id}` };
          }
        }
      }
      return { protected: false };
    }

    try {
      const repo = new EvidenceRepository(pool);
      if (params.cameraId) {
        const check = await repo.isSegmentProtected({
          cameraId: params.cameraId,
          timestamp: params.timestamp,
          branchId: params.branchId,
          tenantId: params.tenantId,
        });
        return {
          protected: check.protected,
          reason: check.reason,
        };
      }

      if (params.evidencePackageId) {
        const res = await pool.query(
          `SELECT * FROM recording_legal_holds
           WHERE (status = 'active' OR status IS NULL)
             AND released_at IS NULL
             AND (evidence_package_ids::text LIKE '%' || $1 || '%')
           LIMIT 1`,
          [params.evidencePackageId],
        );
        if (res.rows[0]) {
          return {
            protected: true,
            reason: `Protected by active Legal Hold ${res.rows[0].id}`,
          };
        }
      }

      return { protected: false };
    } catch (err) {
      // P0-10: Fail closed on database unavailability
      throw new LegalHoldStatusUnknownError(
        `LEGAL_HOLD_STATUS_UNKNOWN: Legal hold authority unreachable: ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
    }
  }

  /**
   * Synchronous check used by tests and fast memory validations.
   * In production with database pool, requires isProtectedAsync to ensure authoritative correctness.
   */
  isProtected(evidencePackageId?: string, cameraId?: string, timestamp?: Date | string): boolean {
    if (!pool) {
      if (process.env.NODE_ENV !== "test") {
        throw new LegalHoldStatusUnknownError("LEGAL_HOLD_AUTHORITY_UNAVAILABLE: Fail closed in production");
      }
      for (const hold of this.testHolds.values()) {
        if (hold.status === "ACTIVE") {
          if (evidencePackageId && (hold.evidencePackageIds?.includes(evidencePackageId) || hold.id === evidencePackageId)) {
            return true;
          }
          if (cameraId && hold.cameraIds?.includes(cameraId)) {
            if (!timestamp) return true;
            const ts = new Date(timestamp).getTime();
            const from = hold.startTime ? new Date(hold.startTime).getTime() : 0;
            const to = hold.endTime ? new Date(hold.endTime).getTime() : Infinity;
            if (ts >= from && ts <= to) return true;
          }
        }
      }
      return false;
    }

    throw new LegalHoldStatusUnknownError("Synchronous legal hold check not permitted against live database; use isProtectedAsync");
  }

  async getLegalHold(holdId: string): Promise<LegalHoldRecord | undefined> {
    if (!pool) return this.testHolds.get(holdId);
    const repo = new EvidenceRepository(pool);
    const hold = await repo.getLegalHold(holdId);
    if (!hold) return undefined;
    return {
      id: hold.id,
      referenceNumber: hold.referenceNumber,
      tenantId: hold.tenantId || "",
      caseNumber: hold.caseNumber || "",
      reason: hold.reason,
      evidencePackageIds: [],
      status: (hold.status || "active").toUpperCase() as any,
      createdBy: hold.createdBy,
      createdAt: hold.createdAt,
      releasedBy: hold.releasedBy,
      releasedAt: hold.releasedAt,
      releaseReason: hold.releaseReason,
    };
  }

  async listActiveHolds(tenantId?: string): Promise<LegalHoldRecord[]> {
    if (!pool) {
      return Array.from(this.testHolds.values()).filter((h) => h.status === "ACTIVE" && (!tenantId || h.tenantId === tenantId));
    }
    const repo = new EvidenceRepository(pool);
    const holds = await repo.listLegalHolds({ tenantId, status: "active" });
    return holds.map((h) => ({
      id: h.id,
      referenceNumber: h.referenceNumber,
      tenantId: h.tenantId || "",
      caseNumber: h.caseNumber || "",
      reason: h.reason,
      evidencePackageIds: [],
      status: "ACTIVE",
      createdBy: h.createdBy,
      createdAt: h.createdAt,
      releasedBy: h.releasedBy,
      releasedAt: h.releasedAt,
      releaseReason: h.releaseReason,
    }));
  }
}

export const legalHoldService = new LegalHoldService();
