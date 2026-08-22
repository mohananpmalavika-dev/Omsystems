/**
 * Cryptographic Chain of Custody Service
 * Immutably tracks custody transactions using append-only, hash-chained records:
 * eventHash_n = SHA256(canonicalJson(event_n) + previousHash)
 */

import { createHash } from 'node:crypto';
import { CustodyEvent } from '../domain/forensic-export.types.js';
import { canonicalJsonStringify } from './canonical-json.js';

export class ChainOfCustodyService {
  private packageChains = new Map<string, CustodyEvent[]>();

  /**
   * Appends an immutable custody event to the package's hash-chain.
   */
  appendEvent(
    packageId: string,
    eventData: Omit<CustodyEvent, 'sequence' | 'previousHash' | 'eventHash'>
  ): CustodyEvent {
    const chain = this.packageChains.get(packageId) || [];
    const sequence = chain.length + 1;
    const previousHash = chain.length > 0 ? chain[chain.length - 1]!.eventHash : '0'.repeat(64);

    const baseEvent = {
      sequence,
      event: eventData.event,
      actor: eventData.actor,
      timestamp: eventData.timestamp,
      recipient: eventData.recipient,
      reason: eventData.reason,
      previousHash,
    };

    const canonicalEventString = canonicalJsonStringify(baseEvent);
    const eventHash = createHash('sha256')
      .update(canonicalEventString + previousHash, 'utf8')
      .digest('hex');

    const finalizedEvent: CustodyEvent = {
      ...baseEvent,
      eventHash,
    };

    chain.push(finalizedEvent);
    this.packageChains.set(packageId, chain);
    return finalizedEvent;
  }

  getChain(packageId: string): CustodyEvent[] {
    return this.packageChains.get(packageId) || [];
  }

  /**
   * Verifies the cryptographic integrity of the entire chain of custody.
   */
  verifyChain(packageId: string): { isValid: boolean; eventsCount: number; brokenSequence?: number } {
    const chain = this.packageChains.get(packageId) || [];
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
