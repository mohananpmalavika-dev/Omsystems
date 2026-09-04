/**
 * Immutable Merkle-Chained Audit Trail Service
 * Banking-Grade: Each audit event is SHA-256 chained to the previous,
 * enabling cryptographic tamper detection on the entire log history.
 */

import { createHash, randomBytes } from "node:crypto";

export type AuditEventCategory =
  | "AUTH_LOGIN"
  | "AUTH_LOGOUT"
  | "AUTH_FAILED"
  | "TOKEN_ISSUED"
  | "TOKEN_REVOKED"
  | "CREDENTIAL_ACCESSED"
  | "CREDENTIAL_ROTATED"
  | "CAMERA_ACCESSED"
  | "EVIDENCE_EXPORTED"
  | "ALARM_ACKNOWLEDGED"
  | "CONFIG_CHANGED"
  | "USER_CREATED"
  | "USER_DEACTIVATED"
  | "POLICY_VIOLATION"
  | "SECURITY_INCIDENT"
  | "PORTABLE_CAMERA_EVENT";

export interface AuditEvent {
  id: string;
  sequenceNumber: number;
  category: AuditEventCategory;
  tenantId: string;
  actorUserId: string;
  actorRoles: string[];
  targetResourceType?: string;
  targetResourceId?: string;
  branchId?: string;
  action: string;
  outcome: "SUCCESS" | "DENIED" | "ERROR";
  metadata?: Record<string, unknown>;
  sourceIp?: string;
  userAgent?: string;
  timestamp: string;  // ISO
  /** SHA-256 of the previous audit event record */
  previousHash: string;
  /** SHA-256 of this record's content + previousHash */
  hash: string;
}

export type AuditEventInput = Omit<AuditEvent, "id" | "sequenceNumber" | "previousHash" | "hash">;

export interface ChainVerificationResult {
  valid: boolean;
  totalEvents: number;
  firstBrokenIndex?: number;
  details: string;
}

function computeEventHash(event: Omit<AuditEvent, "hash">, previousHash: string): string {
  const content = JSON.stringify({
    id: event.id,
    sequenceNumber: event.sequenceNumber,
    category: event.category,
    tenantId: event.tenantId,
    actorUserId: event.actorUserId,
    action: event.action,
    outcome: event.outcome,
    timestamp: event.timestamp,
    previousHash,
  });
  return createHash("sha256").update(content, "utf8").digest("hex");
}

const GENESIS_HASH = createHash("sha256").update("SENTINEL_GRID_GENESIS_BLOCK_V1").digest("hex");

export class ImmutableAuditService {
  private chain: AuditEvent[] = [];
  private sequenceCounter = 0;

  /**
   * Append a new audit event to the chain.
   * The event is cryptographically linked to all previous events.
   */
  append(input: AuditEventInput): AuditEvent {
    const previousHash = this.chain.length === 0
      ? GENESIS_HASH
      : this.chain[this.chain.length - 1]!.hash;

    this.sequenceCounter++;
    const id = randomBytes(12).toString("hex");

    const partial: Omit<AuditEvent, "hash"> = {
      ...input,
      id,
      sequenceNumber: this.sequenceCounter,
      previousHash,
    };

    const hash = computeEventHash(partial, previousHash);
    const event: AuditEvent = { ...partial, hash };

    this.chain.push(event);
    return event;
  }

  /**
   * Verify the complete chain's integrity.
   * Returns the first broken link index if tampering is detected.
   */
  verifyChain(): ChainVerificationResult {
    if (this.chain.length === 0) {
      return { valid: true, totalEvents: 0, details: "Chain is empty" };
    }

    for (let i = 0; i < this.chain.length; i++) {
      const event = this.chain[i]!;
      const expectedPreviousHash = i === 0 ? GENESIS_HASH : this.chain[i - 1]!.hash;

      if (event.previousHash !== expectedPreviousHash) {
        return {
          valid: false,
          totalEvents: this.chain.length,
          firstBrokenIndex: i,
          details: `Chain break at event #${event.sequenceNumber} (index ${i}): previousHash mismatch`,
        };
      }

      const partial: Omit<AuditEvent, "hash"> = { ...event };
      const recomputedHash = computeEventHash(partial, expectedPreviousHash);

      if (recomputedHash !== event.hash) {
        return {
          valid: false,
          totalEvents: this.chain.length,
          firstBrokenIndex: i,
          details: `Tamper detected at event #${event.sequenceNumber} (index ${i}): hash mismatch — expected ${recomputedHash}, got ${event.hash}`,
        };
      }
    }

    return {
      valid: true,
      totalEvents: this.chain.length,
      details: `Chain of ${this.chain.length} events verified — all hashes valid from genesis`,
    };
  }

  /**
   * Retrieve events for a specific tenant/actor with optional category filter.
   */
  query(params: {
    tenantId?: string;
    actorUserId?: string;
    category?: AuditEventCategory;
    limit?: number;
  }): AuditEvent[] {
    let result = [...this.chain];
    if (params.tenantId) result = result.filter((e) => e.tenantId === params.tenantId);
    if (params.actorUserId) result = result.filter((e) => e.actorUserId === params.actorUserId);
    if (params.category) result = result.filter((e) => e.category === params.category);
    return params.limit ? result.slice(-params.limit) : result;
  }

  getChainLength(): number { return this.chain.length; }
  getGenesisHash(): string { return GENESIS_HASH; }
  getLatestHash(): string | null { return this.chain.length > 0 ? this.chain[this.chain.length - 1]!.hash : null; }
}

export const immutableAuditService = new ImmutableAuditService();
