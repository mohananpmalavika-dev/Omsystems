/**
 * Forensic Chain of Custody Service (Authoritative Wrapper)
 * 
 * Delegates to the authoritative PostgreSQL database repository:
 *   src/database/evidence-repository.ts
 * Every event is cryptographically linked to the prior event using SHA-256 hash chaining:
 *   eventHash = SHA256(canonicalEventJson + previousEventHash)
 * Enforces transaction-level advisory locks (pg_advisory_xact_lock) and zero silent error swallowing.
 */

import { randomUUID, createHash } from "node:crypto";
import type {
  EvidenceCustodyEvent,
  CustodyEventType,
} from "../domain/forensic-evidence.types.js";
import { pool } from "../../database/pool.js";
import {
  canonicalJsonStringify,
  appendCustodyEventTx,
} from "../../database/evidence-repository.js";

export { canonicalJsonStringify };

export class CustodyAuthorityUnavailableError extends Error {
  public readonly code = "CUSTODY_AUTHORITY_UNAVAILABLE";
  constructor(message: string = "Custody write failed: PostgreSQL pool is unavailable and in-memory fallback is forbidden in non-test mode (P0-17 fail-closed)") {
    super(message);
    this.name = "CustodyAuthorityUnavailableError";
  }
}

export class ChainOfCustodyService {
  private inMemoryLedger: Map<string, EvidenceCustodyEvent[]> = new Map();

  /**
   * Appends a new custody event with cryptographic hash chaining.
   * Persists directly to PostgreSQL using transaction advisory lock.
   * Never silently swallows persistence errors.
   */
  async recordEvent(input: {
    evidencePackageId: string;
    event: CustodyEventType;
    actorId: string;
    actorType: "USER" | "SYSTEM" | "SERVICE";
    reason?: string;
    ipAddress?: string;
    workstationId?: string;
    timestamp?: string;
  }): Promise<EvidenceCustodyEvent> {
    const timestamp = input.timestamp || new Date().toISOString();

    if (pool) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const event = await appendCustodyEventTx(client, {
          evidenceId: input.evidencePackageId,
          action: input.event,
          performedBy: input.actorId,
          actorType: input.actorType,
          reason: input.reason ?? null,
          sourceIp: input.ipAddress ?? null,
          workstationId: input.workstationId ?? null,
          timestamp,
        });
        await client.query("COMMIT");

        return {
          id: event.id,
          evidencePackageId: input.evidencePackageId,
          event: input.event,
          actorId: input.actorId,
          actorType: input.actorType,
          reason: input.reason,
          ipAddress: input.ipAddress,
          workstationId: input.workstationId,
          timestamp: event.performedAt,
          previousEventHash: event.previousHash || "0".repeat(64),
          eventHash: event.eventHash,
        };
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    }

    // Fail-closed enforcement in production (P0-17)
    if (process.env.NODE_ENV !== "test") {
      throw new CustodyAuthorityUnavailableError();
    }

    // Fallback when running in decoupled unit tests without a database pool
    const eventId = randomUUID();
    const list = this.inMemoryLedger.get(input.evidencePackageId) || [];
    const seq = list.length + 1;
    const previousEventHash = list.length > 0 ? list[list.length - 1]!.eventHash : "0".repeat(64);

    const canonicalPayload = canonicalJsonStringify({
      action: input.event,
      actorType: input.actorType,
      evidenceId: input.evidencePackageId,
      performedBy: input.actorId,
      previousHash: previousEventHash,
      reason: input.reason || null,
      sequence: seq,
      sourceIp: input.ipAddress || null,
      timestamp,
      workstationId: input.workstationId || null,
    });

    const eventHash = createHash("sha256")
      .update(canonicalPayload + previousEventHash)
      .digest("hex");

    const event: EvidenceCustodyEvent = {
      id: eventId,
      evidencePackageId: input.evidencePackageId,
      event: input.event,
      actorId: input.actorId,
      actorType: input.actorType,
      reason: input.reason,
      ipAddress: input.ipAddress,
      workstationId: input.workstationId,
      timestamp,
      previousEventHash,
      eventHash,
    };

    list.push(event);
    this.inMemoryLedger.set(input.evidencePackageId, list);
    return event;
  }

  /**
   * Retrieves the full custody ledger for an evidence package from PostgreSQL
   */
  async getLedger(evidencePackageId: string): Promise<EvidenceCustodyEvent[]> {
    return this.loadLedgerFromDb(evidencePackageId);
  }

  /**
   * Loads ledger from database (survives restarts)
   */
  async loadLedgerFromDb(evidencePackageId: string): Promise<EvidenceCustodyEvent[]> {
    if (pool) {
      const res = await pool.query(
        `SELECT * FROM chain_of_custody_events
         WHERE evidence_id = $1
         ORDER BY sequence ASC NULLS FIRST, created_at ASC`,
        [evidencePackageId],
      );
      return res.rows.map((r: any) => ({
        id: r.id,
        evidencePackageId: r.evidence_id,
        event: r.action as CustodyEventType,
        actorId: r.performed_by,
        actorType: (r.actor_type as any) || "SYSTEM",
        reason: r.reason || undefined,
        ipAddress: r.source_ip || undefined,
        workstationId: r.workstation_id || undefined,
        timestamp: r.created_at instanceof Date ? r.created_at.toISOString() : new Date(r.created_at).toISOString(),
        previousEventHash: r.previous_hash || "0".repeat(64),
        eventHash: r.event_hash,
      }));
    }
    return this.inMemoryLedger.get(evidencePackageId) || [];
  }

  /**
   * Cryptographically verifies the unbroken integrity of the custody hash chain,
   * independently recomputing every event hash (P0-05).
   * Supports both synchronous inspection and Promise await.
   */
  verifyLedger(evidencePackageId: string): Promise<{ valid: boolean; error?: string; verifiedCount: number }> & {
    valid: boolean;
    error?: string;
    verifiedCount: number;
  } {
    const computeSync = (): { valid: boolean; error?: string; verifiedCount: number } => {
      const ledger = this.inMemoryLedger.get(evidencePackageId) || [];
      if (ledger.length === 0) {
        return { valid: true, verifiedCount: 0 };
      }

      let expectedPrevHash = "0".repeat(64);
      for (let i = 0; i < ledger.length; i++) {
        const entry = ledger[i]!;
        const expectedSeq = i + 1;

        if (i > 0 && entry.previousEventHash !== expectedPrevHash) {
          return {
            valid: false,
            error: `Broken chain link at index ${i}: expected prevHash ${expectedPrevHash}, found ${entry.previousEventHash}`,
            verifiedCount: i,
          };
        }

        const canonicalPayload = canonicalJsonStringify({
          action: entry.event,
          actorType: entry.actorType,
          evidenceId: entry.evidencePackageId,
          performedBy: entry.actorId,
          previousHash: i === 0 ? "0".repeat(64) : entry.previousEventHash,
          reason: entry.reason || null,
          sequence: expectedSeq,
          sourceIp: entry.ipAddress || null,
          timestamp: entry.timestamp,
          workstationId: entry.workstationId || null,
        });

        const calculatedHash = createHash("sha256")
          .update(canonicalPayload + (i === 0 ? "0".repeat(64) : entry.previousEventHash))
          .digest("hex");

        if (calculatedHash !== entry.eventHash) {
          return {
            valid: false,
            error: `Tampered event payload at index ${i}: hash mismatch`,
            verifiedCount: i,
          };
        }

        expectedPrevHash = entry.eventHash;
      }

      return { valid: true, verifiedCount: ledger.length };
    };

    const syncResult = computeSync();

    const asyncPromise = (async () => {
      if (pool) {
        const ledger = await this.loadLedgerFromDb(evidencePackageId);
        if (ledger.length === 0) {
          return { valid: true, verifiedCount: 0 };
        }

        let expectedPrevHash = "0".repeat(64);
        for (let i = 0; i < ledger.length; i++) {
          const entry = ledger[i]!;
          const expectedSeq = i + 1;

          if (i > 0 && entry.previousEventHash !== expectedPrevHash) {
            return {
              valid: false,
              error: `Broken chain link at index ${i}: expected prevHash ${expectedPrevHash}, found ${entry.previousEventHash}`,
              verifiedCount: i,
            };
          }

          const canonicalPayload = canonicalJsonStringify({
            action: entry.event,
            actorType: entry.actorType,
            evidenceId: entry.evidencePackageId,
            performedBy: entry.actorId,
            previousHash: i === 0 ? "0".repeat(64) : entry.previousEventHash,
            reason: entry.reason || null,
            sequence: expectedSeq,
            sourceIp: entry.ipAddress || null,
            timestamp: entry.timestamp,
            workstationId: entry.workstationId || null,
          });

          const calculatedHash = createHash("sha256")
            .update(canonicalPayload + (i === 0 ? "0".repeat(64) : entry.previousEventHash))
            .digest("hex");

          if (calculatedHash !== entry.eventHash) {
            return {
              valid: false,
              error: `Tampered event payload at index ${i}: hash mismatch`,
              verifiedCount: i,
            };
          }

          expectedPrevHash = entry.eventHash;
        }

        return { valid: true, verifiedCount: ledger.length };
      }
      return syncResult;
    })();

    return Object.assign(asyncPromise, syncResult);
  }
}

export const chainOfCustodyService = new ChainOfCustodyService();
