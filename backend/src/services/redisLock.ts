import { connectRedis, getRedisClient } from "./redisClient";
import { logger } from "../utils/logger.js";

export class RedisLock {
  private readonly prefix: string;

  constructor(prefix = "lock") {
    this.prefix = prefix;
  }

  private keyFor(name: string): string {
    return `${this.prefix}:${name}`;
  }

  async acquire(name: string, holderId: string, ttlMs = 60000): Promise<boolean> {
    try {
      const client = await connectRedis();
      const key = this.keyFor(name);
      // SET key value NX PX ttl
      const res = await client.set(key, holderId, { NX: true, PX: ttlMs });
      return res === "OK";
    } catch (err) {
      logger.error("RedisLock.acquire error", { error: err, name, holderId });
      return false;
    }
  }

  async release(name: string, holderId: string): Promise<boolean> {
    try {
      const client = getRedisClient();
      if (!client) return false;
      const key = this.keyFor(name);
      const lua = `if redis.call('get', KEYS[1]) == ARGV[1] then \n  return redis.call('del', KEYS[1])\nelse\n  return 0\nend`;
      const res = await client.eval(lua, { keys: [key], arguments: [holderId] });
      return Number(res) === 1;
    } catch (err) {
      logger.error("RedisLock.release error", { error: err, name, holderId });
      return false;
    }
  }

  async extend(name: string, holderId: string, ttlMs = 60000): Promise<boolean> {
    try {
      const client = getRedisClient();
      if (!client) return false;
      const key = this.keyFor(name);
      const lua = `if redis.call('get', KEYS[1]) == ARGV[1] then \n  return redis.call('pexpire', KEYS[1], ARGV[2])\nelse\n  return 0\nend`;
      const res = await client.eval(lua, { keys: [key], arguments: [holderId, String(ttlMs)] });
      return Number(res) === 1;
    } catch (err) {
      logger.error("RedisLock.extend error", { error: err, name, holderId });
      return false;
    }
  }
}
