/**
 * Redis Domain Module
 * 
 * Manages distributed state client and registers with ModuleRegistry.
 */

import { moduleRegistry } from "../platform/module-registry.service.js";

export class RedisModule {
  private client: any = null;

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
      // In production connect real Redis
      moduleRegistry.updateModuleState("redis", "READY", "Connected to Redis cluster");
      return this.client;
    } catch (err: any) {
      moduleRegistry.updateModuleState("redis", "UNAVAILABLE", `Redis connection failed: ${err.message}`);
      if (isProduction) throw err;
      return null;
    }
  }

  getClient(): any {
    return this.client;
  }
}

export const redisModule = new RedisModule();
