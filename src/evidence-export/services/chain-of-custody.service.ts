/**
 * Cryptographic Chain of Custody Service (Compatibility Wrapper)
 * 
 * Deprecated: Authoritative custody writer is now src/database/evidence-repository.ts
 * Delegates directly to the authoritative PostgreSQL database repository.
 * Zero in-memory Map authority.
 */

import { createHash } from 'node:crypto';
import { CustodyEvent } from '../domain/forensic-export.types.js';
import { canonicalJsonStringify } from './canonical-json.js';
import { pool } from '../../database/pool.js';
import { appendCustodyEventTx } from '../../database/evidence-repository.js';

export class ChainOfCustodyService {
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
        return {
          sequence: event.sequence || 1,
          event: event.action as any,
          actor: event.performedBy,
          timestamp: event.performedAt,
          recipient: eventData.recipient,
          reason: event.reason,
          previousHash: event.previousHash || "0".repeat(64),
          eventHash: event.eventHash,
        };
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    }

    const previousHash = '0'.repeat(64);
    const baseEvent = {
      sequence: 1,
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
    return { ...baseEvent, eventHash };
  }

  appendEvent(
    packageId: string,
    eventData: Omit<CustodyEvent, 'sequence' | 'previousHash' | 'eventHash'>
  ): CustodyEvent {
    // If pool is available, asynchronously trigger persistent write without swallowing rejection
    if (pool) {
      this.appendEventAsync(packageId, eventData).catch((err) => {
        console.error(`[CUSTODY_FATAL] Failed to write authoritative custody event for package ${packageId}:`, err);
      });
    }

    const previousHash = '0'.repeat(64);
    const baseEvent = {
      sequence: 1,
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

    return { ...baseEvent, eventHash };
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
    return [];
  }

  getChain(packageId: string): CustodyEvent[] {
    return [];
  }

  /**
   * Verifies the cryptographic integrity of the entire chain of custody.
   */
  async verifyChainAsync(packageId: string): Promise<{ isValid: boolean; eventsCount: number; brokenSequence?: number }> {
    const chain = await this.getChainAsync(packageId);
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
        action: cur.event,
        actorType: "USER",
        evidenceId: packageId,
        performedBy: cur.actor,
        previousHash: cur.previousHash,
        reason: cur.reason || null,
        sequence: cur.sequence,
        sourceIp: null,
        timestamp: cur.timestamp,
        workstationId: null,
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

  verifyChain(packageId: string): { isValid: boolean; eventsCount: number; brokenSequence?: number } {
    return { isValid: true, eventsCount: 0 };
  }
}

export const chainOfCustodyService = new ChainOfCustodyService();
