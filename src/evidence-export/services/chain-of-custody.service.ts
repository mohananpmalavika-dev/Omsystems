/**
 * Cryptographic Chain of Custody Service
 * 
 * Authoritative custody coordinator for evidence exports:
 * - Direct delegation to PostgreSQL transactional repository (appendCustodyEventTx)
 * - Zero silent .catch(() => {}) fire-and-forget
 * - Fail-closed in non-test mode when database is unavailable (P0-17 & P0-18)
 * - In-memory ledger maintained for transient test execution
 */

import { createHash } from 'node:crypto';
import { CustodyEvent } from '../domain/forensic-export.types.js';
import { canonicalJsonStringify } from './canonical-json.js';
import { pool } from '../../database/pool.js';
import { appendCustodyEventTx } from '../../database/evidence-repository.js';

export class CustodyAuthorityUnavailableError extends Error {
  public readonly code = "CUSTODY_AUTHORITY_UNAVAILABLE";
  constructor(message: string = "Custody write failed: PostgreSQL pool is unavailable and in-memory fallback is forbidden in non-test mode (P0-17 fail-closed)") {
    super(message);
    this.name = "CustodyAuthorityUnavailableError";
  }
}

export class ChainOfCustodyService {
  private localLedger: Map<string, CustodyEvent[]> = new Map();

  /**
   * Appends an immutable custody event via authoritative transactional writer.
   */
  async appendEventAsync(
    packageId: string,
    eventData: Omit<CustodyEvent, 'sequence' | 'previousHash' | 'eventHash'>
  ): Promise<CustodyEvent> {
    if (pool) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const event = await appendCustodyEventTx(client, {
          evidenceId: packageId,
          action: eventData.event as any,
          performedBy: eventData.actor,
          actorType: "USER",
          reason: eventData.reason || null,
          timestamp: eventData.timestamp,
        });
        await client.query("COMMIT");

        const custodyEvent: CustodyEvent = {
          sequence: event.sequence || 1,
          event: event.action as any,
          actor: event.performedBy,
          timestamp: event.performedAt,
          recipient: eventData.recipient,
          reason: event.reason,
          previousHash: event.previousHash || "0".repeat(64),
          eventHash: event.eventHash,
        };

        const list = this.localLedger.get(packageId) || [];
        list.push(custodyEvent);
        this.localLedger.set(packageId, list);

        return custodyEvent;
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    }

    if (process.env.NODE_ENV !== "test") {
      throw new CustodyAuthorityUnavailableError();
    }

    return this.appendEvent(packageId, eventData);
  }

  appendEvent(
    packageId: string,
    eventData: Omit<CustodyEvent, 'sequence' | 'previousHash' | 'eventHash'>
  ): CustodyEvent {
    if (process.env.NODE_ENV !== "test" && !pool) {
      throw new CustodyAuthorityUnavailableError();
    }

    const list = this.localLedger.get(packageId) || [];
    const sequence = list.length + 1;
    const previousHash = list.length > 0 ? list[list.length - 1]!.eventHash : '0'.repeat(64);

    const baseEvent = {
      sequence,
      event: eventData.event,
      actor: eventData.actor,
      timestamp: eventData.timestamp,
      recipient: eventData.recipient,
      reason: eventData.reason,
      previousHash,
    };

    const eventHash = createHash('sha256')
      .update(canonicalJsonStringify(baseEvent) + previousHash, 'utf8')
      .digest('hex');

    const ev: CustodyEvent = { ...baseEvent, eventHash };
    list.push(ev);
    this.localLedger.set(packageId, list);

    return ev;
  }

  async getChainAsync(packageId: string): Promise<CustodyEvent[]> {
    if (pool) {
      const res = await pool.query(
        `SELECT * FROM chain_of_custody_events WHERE evidence_id = $1 ORDER BY sequence ASC`,
        [packageId],
      );
      return res.rows.map((r: any) => ({
        sequence: r.sequence || 1,
        event: r.action,
        actor: r.performed_by,
        timestamp: r.created_at instanceof Date ? r.created_at.toISOString() : new Date(r.created_at).toISOString(),
        reason: r.reason || undefined,
        previousHash: r.previous_hash || '0'.repeat(64),
        eventHash: r.event_hash,
      }));
    }
    return this.getChain(packageId);
  }

  getChain(packageId: string): CustodyEvent[] {
    return this.localLedger.get(packageId) || [];
  }

  /**
   * Verifies the cryptographic integrity of the entire chain of custody.
   */
  async verifyChainAsync(packageId: string): Promise<{ isValid: boolean; eventsCount: number; brokenSequence?: number }> {
    const chain = await this.getChainAsync(packageId);
    return this.verifyChainEvents(packageId, chain);
  }

  verifyChain(packageId: string): { isValid: boolean; eventsCount: number; brokenSequence?: number } {
    const chain = this.getChain(packageId);
    return this.verifyChainEvents(packageId, chain);
  }

  private verifyChainEvents(
    packageId: string,
    chain: CustodyEvent[]
  ): { isValid: boolean; eventsCount: number; brokenSequence?: number } {
    if (chain.length === 0) return { isValid: true, eventsCount: 0 };

    let expectedPrevHash = '0'.repeat(64);

    for (let i = 0; i < chain.length; i++) {
      const cur = chain[i]!;
      if (cur.sequence !== i + 1) {
        return { isValid: false, eventsCount: chain.length, brokenSequence: cur.sequence };
      }
      if (cur.previousHash !== expectedPrevHash) {
        return { isValid: false, eventsCount: chain.length, brokenSequence: cur.sequence };
      }

      const baseEvent = {
        sequence: cur.sequence,
        event: cur.event,
        actor: cur.actor,
        timestamp: cur.timestamp,
        recipient: cur.recipient,
        reason: cur.reason,
        previousHash: cur.previousHash,
      };

      const calculatedHash = createHash('sha256')
        .update(canonicalJsonStringify(baseEvent) + expectedPrevHash, 'utf8')
        .digest('hex');

      if (calculatedHash !== cur.eventHash) {
        return { isValid: false, eventsCount: chain.length, brokenSequence: cur.sequence };
      }

      expectedPrevHash = cur.eventHash;
    }

    return { isValid: true, eventsCount: chain.length };
  }
}

export const chainOfCustodyService = new ChainOfCustodyService();
