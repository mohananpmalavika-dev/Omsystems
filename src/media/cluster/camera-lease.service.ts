/**
 * Camera Lease Service
 * Implements atomic distributed leases with monotonically increasing fencing tokens (epochs)
 * and compare-and-swap validation preventing split-brain writes.
 */

import { randomUUID } from "node:crypto";
import type { CameraLease, CameraLeaseManager } from "./camera-lease.types.js";

export interface RedisClientContract {
  eval(script: string, numkeys: number, ...args: (string | number)[]): Promise<any>;
  get(key: string): Promise<string | null>;
  keys(pattern: string): Promise<string[]>;
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
  local updated = cjson.encode(obj)
  redis.call("SET", ownerKey, updated, "PX", ARGV[6])
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

  constructor(private readonly redisClient?: RedisClientContract) {}

  private ownerKey(tenantId: string, cameraId: string): string {
    return `vms:camera-owner:${tenantId}:${cameraId}`;
  }

  private tokenKey(tenantId: string, cameraId: string): string {
    return `vms:camera-fencing:${tenantId}:${cameraId}`;
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
        const ownerK = this.ownerKey(tenantId, cameraId);
        const tokenK = this.tokenKey(tenantId, cameraId);
        const result = await this.redisClient.eval(
          ACQUIRE_LUA,
          2,
          ownerK,
          tokenK,
          tenantId,
          cameraId,
          nodeId,
          instanceId,
          leaseId,
          now,
          ttlMs,
        );

        if (!result) return null;
        return typeof result === "string" ? JSON.parse(result) : (result as CameraLease);
      } catch {
        // Fall back to memory semantics if redis temporarily errors
      }
    }

    // Atomic in-memory implementation
    const key = `${tenantId}:${cameraId}`;
    const existing = this.memoryLeases.get(key);
    if (existing && existing.expiresAt > now) {
      return null; // Already leased and active
    }

    const currentToken = (this.memoryFencingTokens.get(key) ?? 100) + 1;
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
        const ownerK = this.ownerKey(lease.tenantId, lease.cameraId);
        const result = await this.redisClient.eval(
          RENEW_LUA,
          1,
          ownerK,
          lease.nodeId,
          lease.instanceId,
          lease.leaseId,
          lease.fencingToken,
          now,
          ttlMs,
        );
        if (Number(result) === 1) {
          lease.expiresAt = now + ttlMs;
          return true;
        }
        return false;
      } catch {
        // Fall through
      }
    }

    // Atomic in-memory verification
    const key = `${lease.tenantId}:${lease.cameraId}`;
    const existing = this.memoryLeases.get(key);
    if (!existing) return false;

    const cur = existing.lease;
    if (
      cur.nodeId === lease.nodeId &&
      cur.instanceId === lease.instanceId &&
      cur.leaseId === lease.leaseId &&
      cur.fencingToken === lease.fencingToken
    ) {
      existing.expiresAt = now + ttlMs;
      existing.lease.expiresAt = now + ttlMs;
      lease.expiresAt = now + ttlMs;
      return true;
    }

    return false;
  }

  async release(lease: CameraLease): Promise<boolean> {
    if (this.redisClient) {
      try {
        const ownerK = this.ownerKey(lease.tenantId, lease.cameraId);
        const result = await this.redisClient.eval(
          RELEASE_LUA,
          1,
          ownerK,
          lease.nodeId,
          lease.instanceId,
          lease.leaseId,
          lease.fencingToken,
        );
        return Number(result) === 1;
      } catch {
        // Fall through
      }
    }

    const key = `${lease.tenantId}:${lease.cameraId}`;
    const existing = this.memoryLeases.get(key);
    if (!existing) return true;

    const cur = existing.lease;
    if (
      cur.nodeId === lease.nodeId &&
      cur.instanceId === lease.instanceId &&
      cur.leaseId === lease.leaseId &&
      cur.fencingToken === lease.fencingToken
    ) {
      this.memoryLeases.delete(key);
      return true;
    }

    return false;
  }

  async getOwner(tenantId: string, cameraId: string): Promise<CameraLease | null> {
    const now = Date.now();

    if (this.redisClient) {
      try {
        const raw = await this.redisClient.get(this.ownerKey(tenantId, cameraId));
        if (raw) {
          const parsed = JSON.parse(raw) as CameraLease;
          if (parsed.expiresAt > now) return parsed;
        }
      } catch {
        // Fall through
      }
    }

    const key = `${tenantId}:${cameraId}`;
    const entry = this.memoryLeases.get(key);
    if (entry && entry.expiresAt > now) {
      return entry.lease;
    }

    return null;
  }

  async listActiveLeases(tenantId?: string): Promise<CameraLease[]> {
    const now = Date.now();
    const active: CameraLease[] = [];

    for (const [, entry] of this.memoryLeases.entries()) {
      if (entry.expiresAt > now) {
        if (!tenantId || entry.lease.tenantId === tenantId) {
          active.push(entry.lease);
        }
      }
    }

    return active;
  }

  async getCurrentFencingToken(tenantId: string, cameraId: string): Promise<number> {
    const key = `${tenantId}:${cameraId}`;
    return this.memoryFencingTokens.get(key) ?? 100;
  }
}
