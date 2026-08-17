/**
 * Recording Writer Ownership Service
 * Enforces single-writer semantics per recording channel with monotonic fencing tokens to prevent split-brain writes.
 */

import { RecordingWriterLease } from '../domain/distributed-state.types.js';
import { DistributedLeaseService, distributedLeaseService } from './distributed-lease.service.js';

export class RecordingWriterOwnershipService {
  constructor(private readonly leaseService: DistributedLeaseService = distributedLeaseService) {}

  private getWriterKey(cameraId: string): string {
    return `recording:writer:${cameraId}`;
  }

  /**
   * Acquires exclusive writer lease for a recording channel.
   */
  acquireWriterLease(
    cameraId: string,
    recorderNodeId: string,
    storagePoolId: string,
    ttlMs: number = 30_000
  ): RecordingWriterLease | null {
    const key = this.getWriterKey(cameraId);
    const lease = this.leaseService.acquireLease({
      key,
      ownerId: recorderNodeId,
      ttlMs,
      metadata: { cameraId, recorderNodeId, storagePoolId },
    });

    if (!lease) return null;

    return {
      cameraId,
      recorderNodeId,
      storagePoolId,
      fencingToken: lease.fencingToken,
      acquiredAt: lease.acquiredAt,
      expiresAt: lease.expiresAt,
    };
  }

  /**
   * Validates if a writer write operation is permitted with the given fencing token.
   */
  validateWriteOperation(cameraId: string, recorderNodeId: string, writeFencingToken: number): boolean {
    const key = this.getWriterKey(cameraId);
    return this.leaseService.validateLease(key, recorderNodeId, writeFencingToken);
  }

  /**
   * Renews recording writer lease.
   */
  renewWriterLease(cameraId: string, recorderNodeId: string, token: string, ttlMs: number = 30_000): boolean {
    const key = this.getWriterKey(cameraId);
    const renewed = this.leaseService.renewLease(key, recorderNodeId, token, ttlMs);
    return renewed !== null;
  }
}

export const recordingWriterOwnershipService = new RecordingWriterOwnershipService();
