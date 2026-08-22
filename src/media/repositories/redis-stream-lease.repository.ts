import { randomUUID } from "node:crypto";
import type { RedisClientType } from "redis";
import type { StreamLease, StreamLeaseAcquireInput } from "../domain/distributed-lease.types.js";
import type { StreamLeaseRepository } from "../domain/stream-lease-repository.contract.js";

const DEFAULT_LEASE_TTL_MS = 30_000; // 30 seconds

export class RedisStreamLeaseRepository implements StreamLeaseRepository {
  // In-memory fallback for local dev / testing if Redis is not provided
  private readonly memoryLeases = new Map<string, StreamLease>();

  constructor(
    private readonly redis?: RedisClientType | any,
    private readonly keyPrefix = "media:stream-lease:",
  ) {}

  private getCameraKey(cameraId: string, profile = "main"): string {
    return `${this.keyPrefix}${cameraId}:${profile}`;
  }

  private getLeaseLookupKey(leaseId: string): string {
    return `${this.keyPrefix}id:${leaseId}`;
  }

  async acquire(input: StreamLeaseAcquireInput): Promise<StreamLease | null> {
    const profile = input.streamProfile || "main";
    const key = this.getCameraKey(input.cameraId, profile);
    const ttlMs = input.ttlMs || DEFAULT_LEASE_TTL_MS;
    const now = Date.now();
    const token = randomUUID();
    const leaseId = randomUUID();
    const gatewayId = input.preferredGatewayId || "gateway-default-1";

    const lease: StreamLease = {
      leaseId,
      cameraId: input.cameraId,
      streamProfile: profile,
      gatewayId,
      sessionId: input.sessionId,
      ownerInstanceId: input.ownerInstanceId,
      token,
      relayUrl: `wss://${gatewayId}.sentinel.local/live/${input.cameraId}/${profile}`,
      webrtcSessionId: randomUUID(),
      bitrateKbps: input.bitrateKbps || (profile === "main" ? 2048 : 512),
      acquiredAt: now,
      expiresAt: now + ttlMs,
    };

    if (this.redis) {
      try {
        const payload = JSON.stringify(lease);
        // Atomically set only if not exists (NX) with expiry in ms (PX)
        const result = await this.redis.set(key, payload, {
          NX: true,
          PX: ttlMs,
        });

        if (!result) {
          // Lease already acquired by another node or active session
          return null;
        }

        // Secondary lookup index by leaseId
        await this.redis.set(this.getLeaseLookupKey(leaseId), key, { PX: ttlMs });
        return lease;
      } catch (err) {
        console.warn("[RedisStreamLease] Redis error during acquire, falling back to memory:", err);
      }
    }

    // In-memory fallback
    const existing = this.memoryLeases.get(key);
    if (existing && existing.expiresAt > now) {
      return null; // Active lease exists
    }

    this.memoryLeases.set(key, lease);
    return lease;
  }

  async renew(leaseId: string, token: string, ttlMs = DEFAULT_LEASE_TTL_MS): Promise<boolean> {
    const now = Date.now();
    const newExpiresAt = now + ttlMs;

    if (this.redis) {
      try {
        // Resolve camera key from lease lookup index
        const key = await this.redis.get(this.getLeaseLookupKey(leaseId));
        if (!key) return false;

        // Lua Script for atomic token-guarded renewal
        const luaScript = `
          local cur = redis.call("get", KEYS[1])
          if not cur then return 0 end
          local data = cjson.decode(cur)
          if data.token == ARGV[1] then
            data.expiresAt = tonumber(ARGV[3])
            redis.call("set", KEYS[1], cjson.encode(data), "PX", tonumber(ARGV[2]))
            redis.call("pexpire", KEYS[2], tonumber(ARGV[2]))
            return 1
          else
            return 0
          end
        `;

        const result = await this.redis.eval(luaScript, {
          keys: [key, this.getLeaseLookupKey(leaseId)],
          arguments: [token, ttlMs.toString(), newExpiresAt.toString()],
        });

        return result === 1;
      } catch (err) {
        console.warn("[RedisStreamLease] Redis renew error:", err);
      }
    }

    // In-memory renewal check
    for (const [k, l] of this.memoryLeases.entries()) {
      if (l.leaseId === leaseId && l.token === token) {
        if (l.expiresAt < now) {
          this.memoryLeases.delete(k);
          return false;
        }
        l.expiresAt = newExpiresAt;
        return true;
      }
    }

    return false;
  }

  async release(leaseId: string, token: string): Promise<boolean> {
    if (this.redis) {
      try {
        const lookupKey = this.getLeaseLookupKey(leaseId);
        const key = await this.redis.get(lookupKey);
        if (!key) return false;

        // Lua script: only delete if token matches
        const luaScript = `
          local cur = redis.call("get", KEYS[1])
          if not cur then 
            redis.call("del", KEYS[2])
            return 0 
          end
          local data = cjson.decode(cur)
          if data.token == ARGV[1] then
            redis.call("del", KEYS[1])
            redis.call("del", KEYS[2])
            return 1
          else
            return 0
          end
        `;

        const result = await this.redis.eval(luaScript, {
          keys: [key, lookupKey],
          arguments: [token],
        });

        return result === 1;
      } catch (err) {
        console.warn("[RedisStreamLease] Redis release error:", err);
      }
    }

    // In-memory release
    for (const [k, l] of this.memoryLeases.entries()) {
      if (l.leaseId === leaseId && l.token === token) {
        this.memoryLeases.delete(k);
        return true;
      }
    }

    return false;
  }

  async getByCamera(cameraId: string, profile = "main"): Promise<StreamLease | null> {
    const key = this.getCameraKey(cameraId, profile);
    const now = Date.now();

    if (this.redis) {
      try {
        const raw = await this.redis.get(key);
        if (!raw) return null;
        const lease: StreamLease = JSON.parse(raw);
        if (lease.expiresAt <= now) return null;
        return lease;
      } catch (err) {
        console.warn("[RedisStreamLease] Redis getByCamera error:", err);
      }
    }

    const lease = this.memoryLeases.get(key);
    if (lease && lease.expiresAt > now) {
      return lease;
    }
    if (lease) {
      this.memoryLeases.delete(key);
    }
    return null;
  }

  async getById(leaseId: string): Promise<StreamLease | null> {
    const now = Date.now();

    if (this.redis) {
      try {
        const key = await this.redis.get(this.getLeaseLookupKey(leaseId));
        if (!key) return null;
        const raw = await this.redis.get(key);
        if (!raw) return null;
        const lease: StreamLease = JSON.parse(raw);
        if (lease.expiresAt <= now) return null;
        return lease;
      } catch (err) {
        console.warn("[RedisStreamLease] Redis getById error:", err);
      }
    }

    for (const [k, l] of this.memoryLeases.entries()) {
      if (l.leaseId === leaseId) {
        if (l.expiresAt > now) return l;
        this.memoryLeases.delete(k);
        return null;
      }
    }
    return null;
  }

  async listByInstance(ownerInstanceId: string): Promise<StreamLease[]> {
    const results: StreamLease[] = [];
    const now = Date.now();

    if (this.redis) {
      try {
        const keys = await this.redis.keys(`${this.keyPrefix}*`);
        for (const key of keys) {
          if (key.includes(":id:")) continue;
          const raw = await this.redis.get(key);
          if (!raw) continue;
          try {
            const lease: StreamLease = JSON.parse(raw);
            if (lease.ownerInstanceId === ownerInstanceId && lease.expiresAt > now) {
              results.push(lease);
            }
          } catch {
            // ignore invalid
          }
        }
        return results;
      } catch (err) {
        console.warn("[RedisStreamLease] Redis listByInstance error:", err);
      }
    }

    for (const [k, l] of this.memoryLeases.entries()) {
      if (l.expiresAt <= now) {
        this.memoryLeases.delete(k);
      } else if (l.ownerInstanceId === ownerInstanceId) {
        results.push(l);
      }
    }
    return results;
  }

  async listByGateway(gatewayId: string): Promise<StreamLease[]> {
    const results: StreamLease[] = [];
    const now = Date.now();

    if (this.redis) {
      try {
        const keys = await this.redis.keys(`${this.keyPrefix}*`);
        for (const key of keys) {
          if (key.includes(":id:")) continue;
          const raw = await this.redis.get(key);
          if (!raw) continue;
          try {
            const lease: StreamLease = JSON.parse(raw);
            if (lease.gatewayId === gatewayId && lease.expiresAt > now) {
              results.push(lease);
            }
          } catch {
            // ignore
          }
        }
        return results;
      } catch (err) {
        console.warn("[RedisStreamLease] Redis listByGateway error:", err);
      }
    }

    for (const [k, l] of this.memoryLeases.entries()) {
      if (l.expiresAt <= now) {
        this.memoryLeases.delete(k);
      } else if (l.gatewayId === gatewayId) {
        results.push(l);
      }
    }
    return results;
  }
}
