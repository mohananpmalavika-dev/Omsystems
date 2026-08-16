/**
 * Forensic Chain of Custody Service
 * 
 * Manages an append-only, tamper-evident custody ledger.
 * Every event is cryptographically linked to the prior event using SHA-256 hash chaining:
 *   eventHash = SHA256(canonicalEventJson + previousEventHash)
 */

import { randomUUID, createHash } from 'node:crypto';
import type {
  EvidenceCustodyEvent,
  CustodyEventType,
} from '../domain/forensic-evidence.types.js';

export function canonicalJsonStringify(obj: any): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return `[${obj.map((item) => canonicalJsonStringify(item)).join(',')}]`;
  }
  const sortedKeys = Object.keys(obj).sort();
  const entries = sortedKeys.map((key) => `"${key}":${canonicalJsonStringify(obj[key])}`);
  return `{${entries.join(',')}}`;
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
    actorType: 'USER' | 'SYSTEM' | 'SERVICE';
    reason?: string;
    ipAddress?: string;
    workstationId?: string;
    timestamp?: string;
  }): EvidenceCustodyEvent {
    const ledger = this.custodyLedgers.get(input.evidencePackageId) || [];
    const previousEvent = ledger.length > 0 ? ledger[ledger.length - 1] : undefined;
    const previousEventHash = previousEvent ? previousEvent.eventHash : 'GENESIS_HASH_00000000000000000000000000000000000000000000000000000000';

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

    const eventHash = createHash('sha256').update(canonicalPayload).digest('hex');

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

    return custodyEvent;
  }

  /**
   * Retrieves the full custody ledger for an evidence package
   */
  getLedger(evidencePackageId: string): EvidenceCustodyEvent[] {
    return this.custodyLedgers.get(evidencePackageId) || [];
  }

  /**
   * Cryptographically verifies the unbroken integrity of the custody hash chain
   */
  verifyLedger(evidencePackageId: string): { valid: boolean; error?: string; verifiedCount: number } {
    const ledger = this.custodyLedgers.get(evidencePackageId);
    if (!ledger || ledger.length === 0) {
      return { valid: true, verifiedCount: 0 };
    }

    let expectedPrevHash = 'GENESIS_HASH_00000000000000000000000000000000000000000000000000000000';

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

      const calculatedHash = createHash('sha256').update(canonicalPayload).digest('hex');

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
