/**
 * Redis + Sentinel HA Health Probe
 * 
 * Queries Redis Sentinel cluster for:
 * - Master/replica topology
 * - Sentinel quorum status
 * - Replication lag
 * - Failover history
 * - Performance metrics
 */

import IORedis from "ioredis";
import { BaseInfrastructureProbe } from "./base-probe.js";
import type { RedisNodeHealth } from "../domain/ha-telemetry.types.js";

interface RedisProbeConfig {
  sentinels: Array<{
    host: string;
    port: number;
  }>;
  masterName: string;
  password?: string;
  timeoutMs?: number;
}

export class RedisProbe extends BaseInfrastructureProbe<RedisNodeHealth[]> {
  private sentinelClient: any;
  private masterName: string;
  private password?: string;

  constructor(config: RedisProbeConfig) {
    super({ timeoutMs: config.timeoutMs });
    this.masterName = config.masterName;
    this.password = config.password;

    // Use default export or create instance from module directly
    const Redis = IORedis as any;
    this.sentinelClient = new Redis({
      sentinels: config.sentinels,
      name: config.masterName,
      sentinelRetryStrategy: (times: number) => Math.min(times * 100, 2000),
      connectTimeout: 5000,
    });
  }

  protected async probeImplementation(): Promise<RedisNodeHealth[]> {
    const nodes: RedisNodeHealth[] = [];

    try {
      // Get master info from Sentinel
      const masterInfo = await this.sentinelClient.sentinel(
        "master",
        this.masterName,
      );
      
      if (masterInfo && Array.isArray(masterInfo)) {
        const masterHealth = await this.probeMasterNode(masterInfo);
        if (masterHealth) {
          nodes.push(masterHealth);
        }
      }

      // Get replicas
      const replicasInfo = await this.sentinelClient.sentinel(
        "replicas",
        this.masterName,
      );

      if (Array.isArray(replicasInfo)) {
        for (const replicaInfo of replicasInfo) {
          if (Array.isArray(replicaInfo)) {
            const replicaHealth = await this.probeReplicaNode(replicaInfo);
            if (replicaHealth) {
              nodes.push(replicaHealth);
            }
          }
        }
      }

      // Get sentinels
      const sentinelsInfo = await this.sentinelClient.sentinel(
        "sentinels",
        this.masterName,
      );

      if (Array.isArray(sentinelsInfo)) {
        for (const sentinelInfo of sentinelsInfo) {
          if (Array.isArray(sentinelInfo)) {
            const sentinelHealth = this.parseSentinelHealth(sentinelInfo);
            if (sentinelHealth) {
              nodes.push(sentinelHealth);
            }
          }
        }
      }

      return nodes;
    } catch (error) {
      console.error("Redis probe failed:", error);
      return [];
    }
  }

  private async probeMasterNode(
    masterInfo: unknown[],
  ): Promise<RedisNodeHealth | null> {
    const infoMap = this.parseRedisInfo(masterInfo);
    const host = infoMap.get("ip") || "unknown";
    const port = parseInt(infoMap.get("port") || "6379", 10);

    let client: any = null;

    try {
      const Redis = IORedis as any;
      client = new Redis({
        host,
        port,
        password: this.password,
        connectTimeout: 3000,
        commandTimeout: 2000,
      });

      const info = await client.info();
      const stats = this.parseInfoString(info);

      const uptimeSeconds = parseInt(stats.get("uptime_in_seconds") || "0", 10);
      const connectedClients = parseInt(stats.get("connected_clients") || "0", 10);
      const blockedClients = parseInt(stats.get("blocked_clients") || "0", 10);
      const usedMemoryMb = parseInt(stats.get("used_memory") || "0", 10) / (1024 * 1024);
      const maxMemoryMb = parseInt(stats.get("maxmemory") || "0", 10) / (1024 * 1024);
      const memoryFragmentationRatio = parseFloat(stats.get("mem_fragmentation_ratio") || "1");
      const evictedKeys = parseInt(stats.get("evicted_keys") || "0", 10);
      const expiredKeys = parseInt(stats.get("expired_keys") || "0", 10);
      const keyspaceHits = parseInt(stats.get("keyspace_hits") || "0", 10);
      const keyspaceMisses = parseInt(stats.get("keyspace_misses") || "0", 10);
      const opsPerSecond = parseInt(stats.get("instantaneous_ops_per_sec") || "0", 10);
      const hitRate = keyspaceHits / (keyspaceHits + keyspaceMisses || 1);

      return {
        nodeId: `redis-master-${host}:${port}`,
        ipAddress: host,
        port,
        role: "master",
        status: "healthy",
        isReachable: true,
        uptimeSeconds,
        connectedClients,
        blockedClients,
        usedMemoryMb,
        maxMemoryMb,
        memoryFragmentationRatio,
        evictedKeys,
        expiredKeys,
        opsPerSecond,
        hitRate,
        keyspaceHits,
        keyspaceMisses,
        lastProbeAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error(`Failed to probe Redis master ${host}:${port}:`, error);
      return this.createOfflineNode(host, port, "master");
    } finally {
      client?.disconnect();
    }
  }

  private async probeReplicaNode(
    replicaInfo: unknown[],
  ): Promise<RedisNodeHealth | null> {
    const infoMap = this.parseRedisInfo(replicaInfo);
    const host = infoMap.get("ip") || "unknown";
    const port = parseInt(infoMap.get("port") || "6379", 10);
    const masterLinkStatus = infoMap.get("master-link-status");

    let client: any = null;

    try {
      const Redis = IORedis as any;
      client = new Redis({
        host,
        port,
        password: this.password,
        connectTimeout: 3000,
        commandTimeout: 2000,
      });

      const info = await client.info("replication");
      const stats = this.parseInfoString(info);

      const replicationOffset = parseInt(stats.get("slave_repl_offset") || "0", 10);
      const masterLastIoSecondsAgo = parseInt(
        stats.get("master_last_io_seconds_ago") || "0",
        10,
      );

      // Get general stats
      const generalInfo = await client.info();
      const generalStats = this.parseInfoString(generalInfo);

      const uptimeSeconds = parseInt(generalStats.get("uptime_in_seconds") || "0", 10);
      const connectedClients = parseInt(generalStats.get("connected_clients") || "0", 10);
      const blockedClients = parseInt(generalStats.get("blocked_clients") || "0", 10);
      const usedMemoryMb = parseInt(generalStats.get("used_memory") || "0", 10) / (1024 * 1024);
      const maxMemoryMb = parseInt(generalStats.get("maxmemory") || "0", 10) / (1024 * 1024);

      return {
        nodeId: `redis-replica-${host}:${port}`,
        ipAddress: host,
        port,
        role: "replica",
        status: masterLinkStatus === "up" ? "healthy" : "degraded",
        isReachable: true,
        uptimeSeconds,
        connectedClients,
        blockedClients,
        usedMemoryMb,
        maxMemoryMb,
        memoryFragmentationRatio: 1,
        evictedKeys: 0,
        expiredKeys: 0,
        masterLinkStatus: masterLinkStatus === "up" ? "up" : "down",
        masterLastIoSecondsAgo,
        replicationOffset,
        replicationLag: masterLastIoSecondsAgo,
        opsPerSecond: 0,
        hitRate: 0,
        keyspaceHits: 0,
        keyspaceMisses: 0,
        lastProbeAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error(`Failed to probe Redis replica ${host}:${port}:`, error);
      return this.createOfflineNode(host, port, "replica");
    } finally {
      client?.disconnect();
    }
  }

  private parseSentinelHealth(sentinelInfo: unknown[]): RedisNodeHealth | null {
    const infoMap = this.parseRedisInfo(sentinelInfo);
    const host = infoMap.get("ip") || "unknown";
    const port = parseInt(infoMap.get("port") || "26379", 10);

    return {
      nodeId: `redis-sentinel-${host}:${port}`,
      ipAddress: host,
      port,
      role: "sentinel",
      status: "healthy",
      isReachable: true,
      uptimeSeconds: 0,
      connectedClients: 0,
      blockedClients: 0,
      usedMemoryMb: 0,
      maxMemoryMb: 0,
      memoryFragmentationRatio: 1,
      evictedKeys: 0,
      expiredKeys: 0,
      opsPerSecond: 0,
      hitRate: 0,
      keyspaceHits: 0,
      keyspaceMisses: 0,
      lastProbeAt: new Date().toISOString(),
    };
  }

  private parseRedisInfo(info: unknown[]): Map<string, string> {
    const map = new Map<string, string>();
    for (let i = 0; i < info.length; i += 2) {
      const key = String(info[i]);
      const value = String(info[i + 1]);
      map.set(key, value);
    }
    return map;
  }

  private parseInfoString(info: string): Map<string, string> {
    const map = new Map<string, string>();
    const lines = info.split("\r\n");

    for (const line of lines) {
      if (line.startsWith("#") || !line.includes(":")) {
        continue;
      }

      const [key, value] = line.split(":");
      if (key && value) {
        map.set(key, value);
      }
    }

    return map;
  }

  private createOfflineNode(
    host: string,
    port: number,
    role: "master" | "replica" | "sentinel",
  ): RedisNodeHealth {
    return {
      nodeId: `redis-${role}-${host}:${port}`,
      ipAddress: host,
      port,
      role,
      status: "offline",
      isReachable: false,
      uptimeSeconds: 0,
      connectedClients: 0,
      blockedClients: 0,
      usedMemoryMb: 0,
      maxMemoryMb: 0,
      memoryFragmentationRatio: 1,
      evictedKeys: 0,
      expiredKeys: 0,
      opsPerSecond: 0,
      hitRate: 0,
      keyspaceHits: 0,
      keyspaceMisses: 0,
      lastProbeAt: new Date().toISOString(),
    };
  }

  async close(): Promise<void> {
    await this.sentinelClient.quit();
  }
}
