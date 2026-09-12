import { randomUUID } from "node:crypto";
import type { RedisClientType } from "redis";
import type {
  GatewayCapacity,
  GatewayReservation,
} from "../domain/distributed-lease.types.js";
import type { MediaGatewayRegistry } from "../domain/media-gateway-registry.contract.js";
import { DistributedStateUnavailableError } from "../../errors/distributed-state.errors.js";

const DEFAULT_GATEWAY_TTL_SECONDS = 15; // 15s heartbeat timeout
const DEFAULT_RESERVATION_TTL_SECONDS = 30;

export class RedisMediaGatewayRegistry implements MediaGatewayRegistry {
  private readonly memoryGateways = new Map<string, GatewayCapacity>();
  private readonly memoryReservations = new Map<string, GatewayReservation>();

  constructor(
    private readonly redis?: RedisClientType | any,
    private readonly keyPrefix = "media:gateway:",
  ) {}

  private isStandaloneOrTest(): boolean {
    return process.env.NODE_ENV === "test" || process.env.MEDIA_STATE_MODE === "standalone";
  }

  private assertDistributedBackendReady(operation: string): void {
    if (!this.redis && !this.isStandaloneOrTest()) {
      throw new DistributedStateUnavailableError(
        `Distributed state backend (Redis) is required for media gateways (${operation}) in production mode`,
      );
    }
  }

  private getGatewayKey(gatewayId: string): string {
    return `${this.keyPrefix}${gatewayId}:capacity`;
  }

  private getReservationKey(gatewayId: string, reservationId: string): string {
    return `${this.keyPrefix}${gatewayId}:reservation:${reservationId}`;
  }

  async registerHeartbeat(
    capacity: GatewayCapacity,
    ttlSeconds = DEFAULT_GATEWAY_TTL_SECONDS,
  ): Promise<void> {
    this.assertDistributedBackendReady("registerHeartbeat");
    const updated: GatewayCapacity = {
      ...capacity,
      lastHeartbeatAt: Date.now(),
    };

    if (this.redis) {
      try {
        const key = this.getGatewayKey(capacity.gatewayId);
        await this.redis.set(key, JSON.stringify(updated), {
          EX: ttlSeconds,
        });
        return;
      } catch (err) {
        if (!this.isStandaloneOrTest()) {
          throw new DistributedStateUnavailableError(
            `Redis error during gateway heartbeat: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
        console.warn("[RedisMediaGateway] Standalone/test heartbeat fallback:", err);
      }
    }

    if (!this.isStandaloneOrTest()) {
      throw new DistributedStateUnavailableError("Local in-memory gateway registration is prohibited in production mode");
    }

    this.memoryGateways.set(capacity.gatewayId, updated);
  }

  async getGateway(gatewayId: string): Promise<GatewayCapacity | null> {
    this.assertDistributedBackendReady("getGateway");
    const now = Date.now();

    if (this.redis) {
      try {
        const key = this.getGatewayKey(gatewayId);
        const raw = await this.redis.get(key);
        if (!raw) return null;
        return JSON.parse(raw) as GatewayCapacity;
      } catch (err) {
        if (!this.isStandaloneOrTest()) {
          throw new DistributedStateUnavailableError(
            `Redis error during getGateway: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
        console.warn("[RedisMediaGateway] Standalone/test getGateway error:", err);
      }
    }

    if (!this.isStandaloneOrTest()) {
      throw new DistributedStateUnavailableError("Local in-memory gateway state is prohibited in production mode");
    }

    const gateway = this.memoryGateways.get(gatewayId);
    if (gateway) {
      if (now - gateway.lastHeartbeatAt <= DEFAULT_GATEWAY_TTL_SECONDS * 1000) {
        return gateway;
      }
      this.memoryGateways.delete(gatewayId);
    }
    return null;
  }

  async listAvailableGateways(region?: string): Promise<GatewayCapacity[]> {
    this.assertDistributedBackendReady("listAvailableGateways");
    const results: GatewayCapacity[] = [];
    const now = Date.now();

    if (this.redis) {
      try {
        const keys = await this.redis.keys(`${this.keyPrefix}*:capacity`);
        for (const key of keys) {
          const raw = await this.redis.get(key);
          if (!raw) continue;
          try {
            const gw: GatewayCapacity = JSON.parse(raw);
            if (gw.healthStatus !== "OFFLINE" && (!region || gw.region === region)) {
              results.push(gw);
            }
          } catch {
            // ignore malformed
          }
        }
        return results.sort((a, b) => (a.activeStreams / (a.maxStreams || 1)) - (b.activeStreams / (b.maxStreams || 1)));
      } catch (err) {
        if (!this.isStandaloneOrTest()) {
          throw new DistributedStateUnavailableError(
            `Redis error during listAvailableGateways: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
        console.warn("[RedisMediaGateway] Standalone/test listAvailableGateways error:", err);
      }
    }

    if (!this.isStandaloneOrTest()) {
      throw new DistributedStateUnavailableError("Local in-memory gateway listing is prohibited in production mode");
    }

    for (const [id, gw] of this.memoryGateways.entries()) {
      if (now - gw.lastHeartbeatAt > DEFAULT_GATEWAY_TTL_SECONDS * 1000) {
        this.memoryGateways.delete(id);
      } else if (gw.healthStatus !== "OFFLINE" && (!region || gw.region === region)) {
        results.push(gw);
      }
    }

    return results.sort((a, b) => (a.activeStreams / (a.maxStreams || 1)) - (b.activeStreams / (b.maxStreams || 1)));
  }

  async reserveSlot(
    gatewayId: string,
    cameraId: string,
    sessionId: string,
    bandwidthMbps = 2,
    ttlSeconds = DEFAULT_RESERVATION_TTL_SECONDS,
  ): Promise<GatewayReservation | null> {
    this.assertDistributedBackendReady("reserveSlot");
    const reservationId = randomUUID();
    const now = Date.now();
    const expiresAt = now + ttlSeconds * 1000;

    const reservation: GatewayReservation = {
      reservationId,
      gatewayId,
      cameraId,
      sessionId,
      allocatedBandwidthMbps: bandwidthMbps,
      expiresAt,
    };

    if (this.redis) {
      try {
        const key = this.getReservationKey(gatewayId, reservationId);
        const setOk = await this.redis.set(key, JSON.stringify(reservation), {
          NX: true,
          EX: ttlSeconds,
        });
        if (!setOk) return null;
        return reservation;
      } catch (err) {
        if (!this.isStandaloneOrTest()) {
          throw new DistributedStateUnavailableError(
            `Redis error during reserveSlot: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
        console.warn("[RedisMediaGateway] Standalone/test reserveSlot error:", err);
      }
    }

    if (!this.isStandaloneOrTest()) {
      throw new DistributedStateUnavailableError("Local in-memory slot reservation is prohibited in production mode");
    }

    this.memoryReservations.set(reservationId, reservation);
    return reservation;
  }

  async releaseSlot(gatewayId: string, reservationId: string): Promise<boolean> {
    this.assertDistributedBackendReady("releaseSlot");
    if (this.redis) {
      try {
        const key = this.getReservationKey(gatewayId, reservationId);
        const deleted = await this.redis.del(key);
        return deleted > 0;
      } catch (err) {
        if (!this.isStandaloneOrTest()) {
          throw new DistributedStateUnavailableError(
            `Redis error during releaseSlot: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
        console.warn("[RedisMediaGateway] Standalone/test releaseSlot error:", err);
      }
    }

    if (!this.isStandaloneOrTest()) {
      throw new DistributedStateUnavailableError("Local in-memory slot release is prohibited in production mode");
    }

    return this.memoryReservations.delete(reservationId);
  }

  async selectOptimalGateway(
    region?: string,
    requiredBandwidthMbps = 2,
  ): Promise<GatewayCapacity | null> {
    const available = await this.listAvailableGateways(region);
    if (available.length === 0) {
      // Never manufacture synthetic healthy gateways (e.g. gateway-default-cluster-1 / 127.0.0.1)
      return null;
    }

    // Filter gateways that have capacity and bandwidth
    const viable = available.filter((gw) => {
      const hasStreamSlots = gw.activeStreams < gw.maxStreams;
      const hasBandwidth = (gw.bandwidthMbps + requiredBandwidthMbps) <= gw.maxBandwidthMbps;
      const isNotOverloaded = gw.healthStatus !== "OVERLOADED";
      return hasStreamSlots && hasBandwidth && isNotOverloaded;
    });

    if (viable.length === 0) {
      // All viable gateways saturated; fallback to the least loaded available
      return available[0] ?? null;
    }

    // Pick gateway with lowest stream saturation percentage and lowest CPU
    viable.sort((a, b) => {
      const satA = a.activeStreams / (a.maxStreams || 1);
      const satB = b.activeStreams / (b.maxStreams || 1);
      if (Math.abs(satA - satB) > 0.1) return satA - satB;
      return a.cpuPercent - b.cpuPercent;
    });

    return viable[0] ?? null;
  }
}
