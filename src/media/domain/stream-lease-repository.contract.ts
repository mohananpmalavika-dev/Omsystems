import type { StreamLease, StreamLeaseAcquireInput } from "./distributed-lease.types.js";

export interface StreamLeaseRepository {
  /**
   * Atomically acquire a stream lease using NX/PX semantics.
   * If an active lease already exists for this camera & profile, returns null.
   */
  acquire(input: StreamLeaseAcquireInput): Promise<StreamLease | null>;

  /**
   * Renew an existing lease.
   * Atomic token check ensures another backend didn't take over after an expiry.
   */
  renew(leaseId: string, token: string, ttlMs: number): Promise<boolean>;

  /**
   * Release a stream lease using token-guarded Lua script.
   * Prevents deleting a lease that was re-acquired by another instance.
   */
  release(leaseId: string, token: string): Promise<boolean>;

  /**
   * Look up an active stream lease by camera ID and profile.
   */
  getByCamera(cameraId: string, profile?: string): Promise<StreamLease | null>;

  /**
   * Look up an active stream lease by its lease ID.
   */
  getById(leaseId: string): Promise<StreamLease | null>;

  /**
   * List all active stream leases owned by a given instance (useful on crash cleanup).
   */
  listByInstance(ownerInstanceId: string): Promise<StreamLease[]>;

  /**
   * List all active stream leases routed through a specific media gateway.
   */
  listByGateway(gatewayId: string): Promise<StreamLease[]>;
}
