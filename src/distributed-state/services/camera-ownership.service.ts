/**
 * Camera Ownership Service
 * Authoritatively manages camera-to-edge/gateway node leases, preventing duplicate camera polling.
 */

import { CameraOwnership } from '../domain/distributed-state.types.js';
import { DistributedLeaseService, distributedLeaseService } from './distributed-lease.service.js';

export class CameraOwnershipService {
  constructor(private readonly leaseService: DistributedLeaseService = distributedLeaseService) {}

  private getCameraKey(cameraId: string): string {
    return `camera:ownership:${cameraId}`;
  }

  /**
   * Acquires exclusive ownership over a camera for polling and PTZ control.
   */
  acquireCamera(cameraId: string, nodeId: string, ttlMs: number = 30_000): CameraOwnership | null {
    const key = this.getCameraKey(cameraId);
    const lease = this.leaseService.acquireLease({
      key,
      ownerId: nodeId,
      ttlMs,
      metadata: { cameraId, nodeId },
    });

    if (!lease) return null;

    return {
      cameraId,
      ownerNodeId: nodeId,
      fencingToken: lease.fencingToken,
      status: 'ACTIVE',
      leaseTtlMs: ttlMs,
      acquiredAt: lease.acquiredAt,
      expiresAt: lease.expiresAt,
    };
  }

  /**
   * Heartbeat renewal of camera ownership lease.
   */
  renewCamera(cameraId: string, nodeId: string, token: string, ttlMs: number = 30_000): boolean {
    const key = this.getCameraKey(cameraId);
    const renewed = this.leaseService.renewLease(key, nodeId, token, ttlMs);
    return renewed !== null;
  }

  /**
   * Releases camera ownership.
   */
  releaseCamera(cameraId: string, nodeId: string, token: string): boolean {
    const key = this.getCameraKey(cameraId);
    return this.leaseService.releaseLease(key, nodeId, token);
  }

  /**
   * Gets current camera owner.
   */
  getCameraOwner(cameraId: string): { ownerNodeId: string; fencingToken: number; expiresAt: number } | null {
    const key = this.getCameraKey(cameraId);
    const lease = this.leaseService.getLease(key);
    if (!lease) return null;
    return {
      ownerNodeId: lease.ownerId,
      fencingToken: lease.fencingToken,
      expiresAt: lease.expiresAt,
    };
  }
}

export const cameraOwnershipService = new CameraOwnershipService();
