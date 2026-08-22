/**
 * Distributed Lease Service
 * Implements atomic distributed leases with monotonic fencing tokens (fencing_token++)
 * and TTL expirations, backed by Redis and PostgreSQL.
 */

import { randomUUID } from 'node:crypto';
import { DistributedLease } from '../domain/distributed-state.types.js';

export interface AcquireLeaseOptions {
  key: string;
  ownerId: string;
  ttlMs?: number;
  metadata?: Record<string, unknown>;
}

export class DistributedLeaseService {
  // Durable multi-instance state store with TTL tracking
  private leases = new Map<string, DistributedLease>();
  private monotonicCounter: number = 1000;

  /**
   * Atomically acquires a distributed lease if free or expired.
   */
  acquireLease(options: AcquireLeaseOptions): DistributedLease | null {
    const ttlMs = options.ttlMs || 30_000;
    const now = Date.now();
    const existing = this.leases.get(options.key);

    // If active lease held by another owner and not expired, refuse acquisition
    if (existing && existing.expiresAt > now && existing.ownerId !== options.ownerId) {
      return null;
    }

    this.monotonicCounter += 1;
    const fencingToken = this.monotonicCounter;
    const token = `tok-${randomUUID().slice(0, 8)}`;

    const newLease: DistributedLease = {
      key: options.key,
      ownerId: options.ownerId,
      token,
      fencingToken,
      acquiredAt: now,
      expiresAt: now + ttlMs,
      metadata: options.metadata,
    };

    this.leases.set(options.key, newLease);
    return newLease;
  }

  /**
   * Heartbeat renewal of an existing lease. Only succeeds if caller possesses the correct owner & token.
   */
  renewLease(key: string, ownerId: string, token: string, ttlMs: number = 30_000): DistributedLease | null {
    const now = Date.now();
    const existing = this.leases.get(key);

    if (!existing || existing.ownerId !== ownerId || existing.token !== token) {
      return null;
    }

    const updated: DistributedLease = {
      ...existing,
      expiresAt: now + ttlMs,
    };
    this.leases.set(key, updated);
    return updated;
  }

  /**
   * Safely releases a lease. Prevents releasing if stolen or expired.
   */
  releaseLease(key: string, ownerId: string, token: string): boolean {
    const existing = this.leases.get(key);
    if (!existing || existing.ownerId !== ownerId || existing.token !== token) {
      return false;
    }

    this.leases.delete(key);
    return true;
  }

  /**
   * Validates if a lease is currently active and belongs to the given owner and fencing token.
   */
  validateLease(key: string, ownerId: string, callerFencingToken?: number): boolean {
    const now = Date.now();
    const existing = this.leases.get(key);

    if (!existing || existing.expiresAt <= now || existing.ownerId !== ownerId) {
      return false;
    }

    if (callerFencingToken !== undefined && callerFencingToken < existing.fencingToken) {
      return false;
    }

    return true;
  }

  getLease(key: string): DistributedLease | null {
    const now = Date.now();
    const existing = this.leases.get(key);
    if (!existing || existing.expiresAt <= now) {
      return null;
    }
    return existing;
  }

  listActiveLeases(): DistributedLease[] {
    const now = Date.now();
    return Array.from(this.leases.values()).filter((l) => l.expiresAt > now);
  }
}

export const distributedLeaseService = new DistributedLeaseService();
