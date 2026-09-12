/**
 * Redis Domain Module
 * 
 * Manages distributed state client and registers with ModuleRegistry.
 */

import { moduleRegistry } from "../platform/module-registry.service.js";
import { createClient, type RedisClientType } from "redis";

export class RedisModule {
  private client: RedisClientType | null = null;

  async initialize(redisUrl?: string): Promise<any> {
    const isProduction = process.env.NODE_ENV === "production";
    const url = redisUrl || process.env.REDIS_URL;

    moduleRegistry.registerModule({
      module: "redis",
      importance: isProduction ? "CRITICAL" : "REQUIRED",
      state: "STARTING",
      reason: "Initializing Redis distributed state connection",
    });

    if (!url && !isProduction) {
      moduleRegistry.updateModuleState("redis", "DEGRADED", "Running in local standalone test mode without Redis");
      return null;
    }

    try {
      const client = createClient({ url });
      client.on("error", (error) => {
        moduleRegistry.updateModuleState("redis", "UNAVAILABLE", `Redis client error: ${error.message}`);
      });
      await client.connect();
      this.client = client;
      moduleRegistry.updateModuleState("redis", "READY", "Connected to Redis cluster");
      return client;
    } catch (err: any) {
      moduleRegistry.updateModuleState("redis", "UNAVAILABLE", `Redis connection failed: ${err.message}`);
      if (isProduction) throw err;
      return null;
    }
  }

  getClient(): RedisClientType | null {
    return this.client;
  }

  async close(): Promise<void> {
    if (this.client?.isOpen) await this.client.quit();
    this.client = null;
  }
}

export const redisModule = new RedisModule();
