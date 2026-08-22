/**
 * Camera ownership leases backed by Redis Lua transactions.
 *
 * A configured Redis client is authoritative. If it becomes unavailable this
 * service fails closed; it never creates a second local ownership universe.
 * Memory leases are available only when the service is explicitly running in
 * standalone mode (development and tests).
 */

import { randomUUID } from "node:crypto";
import type { CameraLease, CameraLeaseManager } from "./camera-lease.types.js";

export type CameraLeaseMode = "distributed-required" | "standalone";

export interface RedisClientContract {
  eval(script: string, numkeys: number, ...args: (string | number)[]): Promise<unknown>;
  get(key: string): Promise<string | null>;
  keys(pattern: string): Promise<string[]>;
}

export class DistributedCoordinationUnavailableError extends Error {
  readonly code = "DISTRIBUTED_COORDINATION_UNAVAILABLE";

  constructor(message = "Redis camera lease coordination is unavailable") {
    super(message);
    this.name = "DistributedCoordinationUnavailableError";
  }
}

const ACQUIRE_LUA = `
local ownerKey = KEYS[1]
local tokenKey = KEYS[2]
if redis.call("EXISTS", ownerKey) == 1 then
  return nil
end
local token = redis.call("INCR", tokenKey)
local payload = cjson.encode({
  tenantId = ARGV[1],
  cameraId = ARGV[2],
  nodeId = ARGV[3],
  instanceId = ARGV[4],
  leaseId = ARGV[5],
  fencingToken = token,
  acquiredAt = tonumber(ARGV[6]),
  expiresAt = tonumber(ARGV[6]) + tonumber(ARGV[7])
})
redis.call("SET", ownerKey, payload, "PX", ARGV[7])
return payload
`;

const RENEW_LUA = `
local ownerKey = KEYS[1]
local current = redis.call("GET", ownerKey)
if not current then return 0 end
local obj = cjson.decode(current)
if obj.nodeId == ARGV[1] and obj.instanceId == ARGV[2] and obj.leaseId == ARGV[3] and obj.fencingToken == tonumber(ARGV[4]) then
  obj.expiresAt = tonumber(ARGV[5]) + tonumber(ARGV[6])
  redis.call("SET", ownerKey, cjson.encode(obj), "PX", ARGV[6])
  return 1
end
return 0
`;

const RELEASE_LUA = `
local ownerKey = KEYS[1]
local current = redis.call("GET", ownerKey)
if not current then return 1 end
local obj = cjson.decode(current)
if obj.nodeId == ARGV[1] and obj.instanceId == ARGV[2] and obj.leaseId == ARGV[3] and obj.fencingToken == tonumber(ARGV[4]) then
  redis.call("DEL", ownerKey)
  return 1
end
return 0
`;

export class CameraLeaseService implements CameraLeaseManager {
  private readonly defaultTtlMs = 15_000;
  private readonly memoryLeases = new Map<string, { lease: CameraLease; expiresAt: number }>();
  private readonly memoryFencingTokens = new Map<string, number>();
  private readonly mode: CameraLeaseMode;

  constructor(
    private readonly redisClient?: RedisClientContract,
    options: { mode?: CameraLeaseMode } = {},
  ) {
    this.mode = options.mode ?? (process.env.NODE_ENV === "production" ? "distributed-required" : "standalone");
  }

  private ownerKey(tenantId: string, cameraId: string): string {
    return `vms:camera-owner:${tenantId}:${cameraId}`;
  }

  private tokenKey(tenantId: string, cameraId: string): string {
    return `vms:camera-fencing:${tenantId}:${cameraId}`;
  }

  private requireRedis(): RedisClientContract {
    if (!this.redisClient) {
      throw new DistributedCoordinationUnavailableError("Redis client is required for distributed camera leases");
    }
    return this.redisClient;
  }

  private redisFailure(error: unknown): never {
    const message = error instanceof Error ? error.message : String(error);
    throw new DistributedCoordinationUnavailableError(`Redis lease operation failed: ${message}`);
  }

  private useMemoryStore(): boolean {
    return !this.redisClient && this.mode === "standalone";
  }

  private failWithoutRedis(): never {
    this.requireRedis();
    throw new DistributedCoordinationUnavailableError();
  }

  async acquire(
    tenantId: string,
    cameraId: string,
    nodeId: string,
    instanceId: string,
    ttlMs = this.defaultTtlMs,
  ): Promise<CameraLease | null> {
    const leaseId = randomUUID();
    const now = Date.now();

    if (this.redisClient) {
      try {
        const result = await this.redisClient.eval(
          ACQUIRE_LUA,
          2,
          this.ownerKey(tenantId, cameraId),
          this.tokenKey(tenantId, cameraId),
          tenantId,
          cameraId,
          nodeId,
          instanceId,
          leaseId,
          now,
          ttlMs,
        );
        if (!result) return null;
        return typeof result === "string" ? JSON.parse(result) as CameraLease : result as CameraLease;
      } catch (error) {
        return this.redisFailure(error);
      }
    }

    if (!this.useMemoryStore()) return this.failWithoutRedis();

    const key = `${tenantId}:${cameraId}`;
    const existing = this.memoryLeases.get(key);
    if (existing && existing.expiresAt > now) return null;

    const currentToken = (this.memoryFencingTokens.get(key) ?? 0) + 1;
    this.memoryFencingTokens.set(key, currentToken);
    const lease: CameraLease = {
      tenantId,
      cameraId,
      nodeId,
      instanceId,
      leaseId,
      fencingToken: currentToken,
      acquiredAt: now,
      expiresAt: now + ttlMs,
    };
    this.memoryLeases.set(key, { lease, expiresAt: now + ttlMs });
    return lease;
  }

  async renew(lease: CameraLease, ttlMs = this.defaultTtlMs): Promise<boolean> {
    const now = Date.now();
    if (this.redisClient) {
      try {
        const result = await this.redisClient.eval(
          RENEW_LUA,
          1,
          this.ownerKey(lease.tenantId, lease.cameraId),
          lease.nodeId,
          lease.instanceId,
          lease.leaseId,
          lease.fencingToken,
          now,
          ttlMs,
        );
        if (Number(result) === 1) lease.expiresAt = now + ttlMs;
        return Number(result) === 1;
      } catch (error) {
        return this.redisFailure(error);
      }
    }

    if (!this.useMemoryStore()) return this.failWithoutRedis();
    const existing = this.memoryLeases.get(`${lease.tenantId}:${lease.cameraId}`);
    if (!existing) return false;
    const current = existing.lease;
    if (current.nodeId !== lease.nodeId || current.instanceId !== lease.instanceId || current.leaseId !== lease.leaseId || current.fencingToken !== lease.fencingToken) return false;
    existing.expiresAt = now + ttlMs;
    existing.lease.expiresAt = now + ttlMs;
    lease.expiresAt = now + ttlMs;
    return true;
  }

  async release(lease: CameraLease): Promise<boolean> {
    if (this.redisClient) {
      try {
        const result = await this.redisClient.eval(
          RELEASE_LUA,
          1,
          this.ownerKey(lease.tenantId, lease.cameraId),
          lease.nodeId,
          lease.instanceId,
          lease.leaseId,
          lease.fencingToken,
        );
        return Number(result) === 1;
      } catch (error) {
        return this.redisFailure(error);
      }
    }

    if (!this.useMemoryStore()) return this.failWithoutRedis();
    const key = `${lease.tenantId}:${lease.cameraId}`;
    const existing = this.memoryLeases.get(key);
    if (!existing) return true;
    const current = existing.lease;
    if (current.nodeId !== lease.nodeId || current.instanceId !== lease.instanceId || current.leaseId !== lease.leaseId || current.fencingToken !== lease.fencingToken) return false;
    this.memoryLeases.delete(key);
    return true;
  }

  async getOwner(tenantId: string, cameraId: string): Promise<CameraLease | null> {
    if (this.redisClient) {
      try {
        const raw = await this.redisClient.get(this.ownerKey(tenantId, cameraId));
        if (!raw) return null;
        const lease = JSON.parse(raw) as CameraLease;
        return lease.expiresAt > Date.now() ? lease : null;
      } catch (error) {
        return this.redisFailure(error);
      }
    }

    if (!this.useMemoryStore()) return this.failWithoutRedis();
    const entry = this.memoryLeases.get(`${tenantId}:${cameraId}`);
    if (!entry || entry.expiresAt <= Date.now()) return null;
    return entry.lease;
  }

  async listActiveLeases(tenantId?: string): Promise<CameraLease[]> {
    if (this.redisClient) {
      try {
        const pattern = this.ownerKey(tenantId ?? "*", "*");
        const keys = await this.redisClient.keys(pattern);
        const leases: CameraLease[] = [];
        for (const key of keys) {
          const raw = await this.redisClient.get(key);
          if (!raw) continue;
          const lease = JSON.parse(raw) as CameraLease;
          if (lease.expiresAt > Date.now()) leases.push(lease);
        }
        return leases;
      } catch (error) {
        return this.redisFailure(error);
      }
    }

    if (!this.useMemoryStore()) return this.failWithoutRedis();
    const active: CameraLease[] = [];
    for (const [key, entry] of this.memoryLeases.entries()) {
      if (entry.expiresAt <= Date.now()) {
        this.memoryLeases.delete(key);
      } else if (!tenantId || entry.lease.tenantId === tenantId) {
        active.push(entry.lease);
      }
    }
    return active;
  }

  async getCurrentFencingToken(tenantId: string, cameraId: string): Promise<number> {
    if (this.redisClient) {
      try {
        const raw = await this.redisClient.get(this.tokenKey(tenantId, cameraId));
        return raw ? Number(raw) : 0;
      } catch (error) {
        return this.redisFailure(error);
      }
    }
    if (!this.useMemoryStore()) return this.failWithoutRedis();
    return this.memoryFencingTokens.get(`${tenantId}:${cameraId}`) ?? 0;
  }
}
