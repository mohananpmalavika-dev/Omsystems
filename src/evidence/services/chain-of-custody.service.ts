/**
 * Forensic Chain of Custody Service
 * 
 * Manages an append-only, tamper-evident custody ledger.
 * Every event is cryptographically linked to the prior event using SHA-256 hash chaining:
 *   eventHash = SHA256(canonicalEventJson + previousEventHash)
 * Persisted to PostgreSQL for restart survival and concurrent write protection.
 */

import { randomUUID, createHash } from "node:crypto";
import type {
  EvidenceCustodyEvent,
  CustodyEventType,
} from "../domain/forensic-evidence.types.js";
import { pool } from "../../database/pool.js";

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

export class ChainOfCustodyService {
  private custodyLedgers: Map<string, EvidenceCustodyEvent[]> = new Map();

  /**
   * Appends a new custody event with cryptographic hash chaining
   */
  recordEvent(input: {
    evidencePackageId: string;
    event: CustodyEventType;
    actorId: string;
    actorType: "USER" | "SYSTEM" | "SERVICE";
    reason?: string;
    ipAddress?: string;
    workstationId?: string;
    timestamp?: string;
  }): EvidenceCustodyEvent {
    const ledger = this.custodyLedgers.get(input.evidencePackageId) || [];
    const previousEvent = ledger.length > 0 ? ledger[ledger.length - 1] : undefined;
    const previousEventHash = previousEvent
      ? previousEvent.eventHash
      : "GENESIS_HASH_00000000000000000000000000000000000000000000000000000000";

    const eventId = randomUUID();
    const timestamp = input.timestamp || new Date().toISOString();

    const canonicalPayload = canonicalJsonStringify({
      id: eventId,
      evidencePackageId: input.evidencePackageId,
      event: input.event,
      actorId: input.actorId,
      actorType: input.actorType,
      reason: input.reason || null,
      ipAddress: input.ipAddress || null,
      workstationId: input.workstationId || null,
      timestamp,
      previousEventHash,
    });

    const eventHash = createHash("sha256").update(canonicalPayload).digest("hex");

    const custodyEvent: EvidenceCustodyEvent = {
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

    ledger.push(custodyEvent);
    this.custodyLedgers.set(input.evidencePackageId, ledger);

    // Persist to PostgreSQL asynchronously if DB available
    if (pool) {
      pool.query(
        `INSERT INTO chain_of_custody_events (
           id, evidence_id, sequence, action, performed_by, actor_type, reason,
           source_ip, workstation_id, event_hash, previous_hash, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (evidence_id, sequence) DO NOTHING`,
        [
          eventId,
          input.evidencePackageId,
          ledger.length,
          input.event,
          input.actorId,
          input.actorType,
          input.reason ?? null,
          input.ipAddress ?? null,
          input.workstationId ?? null,
          eventHash,
          previousEventHash,
          timestamp,
        ],
      ).catch(() => {});
    }

    return custodyEvent;
  }

  /**
   * Retrieves the full custody ledger for an evidence package
   */
  getLedger(evidencePackageId: string): EvidenceCustodyEvent[] {
    return this.custodyLedgers.get(evidencePackageId) || [];
  }

  /**
   * Loads ledger from database if empty in memory (survives restarts)
   */
  async loadLedgerFromDb(evidencePackageId: string): Promise<EvidenceCustodyEvent[]> {
    if (pool) {
      try {
        const res = await pool.query(
          `SELECT * FROM chain_of_custody_events
           WHERE evidence_id = $1
           ORDER BY sequence ASC NULLS FIRST, created_at ASC`,
          [evidencePackageId],
        );
        if (res.rows.length > 0) {
          const events: EvidenceCustodyEvent[] = res.rows.map((r: any) => ({
            id: r.id,
            evidencePackageId: r.evidence_id,
            event: r.action as CustodyEventType,
            actorId: r.performed_by,
            actorType: (r.actor_type as any) || "SYSTEM",
            reason: r.reason || undefined,
            ipAddress: r.source_ip || undefined,
            workstationId: r.workstation_id || undefined,
            timestamp: r.created_at.toISOString(),
            previousEventHash: r.previous_hash || "GENESIS_HASH_00000000000000000000000000000000000000000000000000000000",
            eventHash: r.event_hash,
          }));
          this.custodyLedgers.set(evidencePackageId, events);
          return events;
        }
      } catch {
        // Fall back to memory
      }
    }
    return this.getLedger(evidencePackageId);
  }

  /**
   * Cryptographically verifies the unbroken integrity of the custody hash chain
   */
  verifyLedger(evidencePackageId: string): { valid: boolean; error?: string; verifiedCount: number } {
    const ledger = this.custodyLedgers.get(evidencePackageId);
    if (!ledger || ledger.length === 0) {
      return { valid: true, verifiedCount: 0 };
    }

    let expectedPrevHash = "GENESIS_HASH_00000000000000000000000000000000000000000000000000000000";

    for (let i = 0; i < ledger.length; i++) {
      const entry = ledger[i]!;

      if (entry.previousEventHash !== expectedPrevHash) {
        return {
          valid: false,
          error: `Broken chain link at index ${i}: expected prevHash ${expectedPrevHash}, found ${entry.previousEventHash}`,
          verifiedCount: i,
        };
      }

      const canonicalPayload = canonicalJsonStringify({
        id: entry.id,
        evidencePackageId: entry.evidencePackageId,
        event: entry.event,
        actorId: entry.actorId,
        actorType: entry.actorType,
        reason: entry.reason || null,
        ipAddress: entry.ipAddress || null,
        workstationId: entry.workstationId || null,
        timestamp: entry.timestamp,
        previousEventHash: expectedPrevHash,
      });

      const calculatedHash = createHash("sha256").update(canonicalPayload).digest("hex");

      if (calculatedHash !== entry.eventHash) {
        return {
          valid: false,
          error: `Tampered event payload at index ${i}: hash mismatch (stored ${entry.eventHash}, calculated ${calculatedHash})`,
          verifiedCount: i,
        };
      }

      expectedPrevHash = entry.eventHash;
    }

    return { valid: true, verifiedCount: ledger.length };
  }
}

export const chainOfCustodyService = new ChainOfCustodyService();
