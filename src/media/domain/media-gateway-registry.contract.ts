import type { GatewayCapacity, GatewayReservation } from "./distributed-lease.types.js";

export interface MediaGatewayRegistry {
  /**
   * Register or update a media gateway's heartbeat and live capacities.
   * Stored with TTL (e.g. 15s) in Redis.
   */
  registerHeartbeat(capacity: GatewayCapacity, ttlSeconds?: number): Promise<void>;

  /**
   * Get live status and metrics for a specific gateway.
   */
  getGateway(gatewayId: string): Promise<GatewayCapacity | null>;

  /**
   * List all healthy and active media gateways across the cluster.
   */
  listAvailableGateways(region?: string): Promise<GatewayCapacity[]>;

  /**
   * Atomically reserve streaming capacity on the optimal gateway.
   * Uses Redis transactions/atomic counters to prevent over-admission.
   */
  reserveSlot(
    gatewayId: string,
    cameraId: string,
    sessionId: string,
    bandwidthMbps?: number,
    ttlSeconds?: number,
  ): Promise<GatewayReservation | null>;

  /**
   * Release a previously reserved streaming slot.
   */
  releaseSlot(gatewayId: string, reservationId: string): Promise<boolean>;

  /**
   * Select the least loaded, healthiest gateway for a given region.
   */
  selectOptimalGateway(region?: string, requiredBandwidthMbps?: number): Promise<GatewayCapacity | null>;
}
