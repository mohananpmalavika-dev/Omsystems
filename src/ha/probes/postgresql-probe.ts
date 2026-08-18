/**
 * PostgreSQL HA Health Probe
 * 
 * Queries actual PostgreSQL cluster for:
 * - Primary/standby roles
 * - Replication lag (bytes and time)
 * - WAL positions
 * - Connection health
 * - Performance metrics
 */

import { Pool, type PoolClient } from "pg";
import { BaseInfrastructureProbe, type ProbeResult } from "./base-probe.js";
import type { PostgreSQLNodeHealth } from "../domain/ha-telemetry.types.js";

interface PostgreSQLProbeConfig {
  nodes: Array<{
    nodeId: string;
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    expectedRole?: "primary" | "standby-sync" | "standby-async";
  }>;
  timeoutMs?: number;
}

export class PostgreSQLProbe extends BaseInfrastructureProbe<PostgreSQLNodeHealth[]> {
  private pools: Map<string, Pool> = new Map();
  private nodeConfigs: PostgreSQLProbeConfig["nodes"];

  constructor(config: PostgreSQLProbeConfig) {
    super({ timeoutMs: config.timeoutMs });
    this.nodeConfigs = config.nodes;

    // Initialize connection pools
    for (const node of config.nodes) {
      const pool = new Pool({
        host: node.host,
        port: node.port,
        database: node.database,
        user: node.user,
        password: node.password,
        max: 2, // Minimal connections for health checks
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      });

      this.pools.set(node.nodeId, pool);
    }
  }

  protected async probeImplementation(): Promise<PostgreSQLNodeHealth[]> {
    const probes = this.nodeConfigs.map((node) => this.probeNode(node));
    const results = await Promise.allSettled(probes);

    return results
      .map((result, index) => {
        if (result.status === "fulfilled") {
          return result.value;
        }

        // Return offline status for failed probes
        const node = this.nodeConfigs[index]!;
        return this.createOfflineNodeHealth(node, result.reason);
      })
      .filter((node): node is PostgreSQLNodeHealth => node !== null);
  }

  private async probeNode(
    nodeConfig: PostgreSQLProbeConfig["nodes"][0],
  ): Promise<PostgreSQLNodeHealth> {
    const pool = this.pools.get(nodeConfig.nodeId);
    if (!pool) {
      throw new Error(`No pool for node ${nodeConfig.nodeId}`);
    }

    let client: PoolClient | undefined;

    try {
      client = await pool.connect();
      const probeStart = Date.now();

      // Check if accepting connections
      const isAcceptingConnections = true; // Successfully connected

      // Get replication role
      const roleResult = await client.query<{ role: string }>(
        "SELECT CASE WHEN pg_is_in_recovery() THEN 'standby' ELSE 'primary' END AS role",
      );
      const actualRole = roleResult.rows[0]?.role;
      const role: PostgreSQLNodeHealth["role"] = actualRole === "primary"
        ? "primary"
        : nodeConfig.expectedRole === "standby-async"
          ? "standby-async"
          : "standby-sync";

      // Get replication state (for standbys)
      let replicationState: PostgreSQLNodeHealth["replicationState"] = "n/a";
      let replicationMode: PostgreSQLNodeHealth["replicationMode"] = "n/a";
      let replicationLagBytes = 0;
      let replicationLagSeconds = 0;
      let replayLsn: string | undefined;

      if (role !== "primary") {
        const replResult = await client.query<{
          status: string;
          received_lsn: string;
          replayed_lsn: string;
          lag_bytes: string;
        }>(
          `SELECT status, received_lsn, replay_lsn as replayed_lsn,
           pg_wal_lsn_diff(received_lsn, replay_lsn) as lag_bytes
           FROM pg_stat_wal_receiver`,
        );

        if (replResult.rows.length > 0) {
          const replRow = replResult.rows[0]!;
          replicationState = replRow.status === "streaming" ? "streaming" : "catchup";
          replayLsn = replRow.replayed_lsn;
          replicationLagBytes = parseInt(replRow.lag_bytes, 10) || 0;

          // Get replication mode
          const modeResult = await client.query<{ sync_state: string }>(
            "SELECT sync_state FROM pg_stat_replication WHERE application_name = $1",
            [nodeConfig.nodeId],
          );
          replicationMode = modeResult.rows[0]?.sync_state === "sync" ? "synchronous" : "asynchronous";

          // Calculate lag in seconds
          const lagTimeResult = await client.query<{ lag_seconds: number }>(
            "SELECT EXTRACT(EPOCH FROM (now() - pg_last_xact_replay_timestamp()))::int as lag_seconds",
          );
          replicationLagSeconds = lagTimeResult.rows[0]?.lag_seconds || 0;
        } else {
          replicationState = "disconnected";
        }
      }

      // Get WAL position
      const walResult = await client.query<{ wal_lsn: string }>(
        role === "primary"
          ? "SELECT pg_current_wal_lsn() as wal_lsn"
          : "SELECT pg_last_wal_receive_lsn() as wal_lsn",
      );
      const walLsn = walResult.rows[0]?.wal_lsn || "0/0";

      // Get connection stats
      const connResult = await client.query<{
        active: string;
        max_conn: string;
      }>(
        `SELECT count(*) as active,
         (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') as max_conn
         FROM pg_stat_activity WHERE state = 'active'`,
      );
      const activeConnections = parseInt(connResult.rows[0]?.active || "0", 10);
      const maxConnections = parseInt(connResult.rows[0]?.max_conn || "100", 10);

      // Get transaction stats
      const txResult = await client.query<{
        xact_commit: string;
        xact_rollback: string;
      }>(
        `SELECT xact_commit, xact_rollback
         FROM pg_stat_database WHERE datname = current_database()`,
      );
      const commits = parseInt(txResult.rows[0]?.xact_commit || "0", 10);
      const rollbacks = parseInt(txResult.rows[0]?.xact_rollback || "0", 10);
      const transactionsPerSecond = (commits + rollbacks) / 60; // Rough estimate

      // Get cache hit ratio
      const cacheResult = await client.query<{
        heap_read: string;
        heap_hit: string;
      }>(
        `SELECT sum(heap_blks_read) as heap_read, sum(heap_blks_hit) as heap_hit
         FROM pg_statio_user_tables`,
      );
      const heapRead = parseInt(cacheResult.rows[0]?.heap_read || "1", 10);
      const heapHit = parseInt(cacheResult.rows[0]?.heap_hit || "1", 10);
      const cacheHitRatio = heapHit / (heapRead + heapHit);

      // Get deadlocks
      const deadlockResult = await client.query<{ deadlocks: string }>(
        `SELECT deadlocks FROM pg_stat_database WHERE datname = current_database()`,
      );
      const deadlocks = parseInt(deadlockResult.rows[0]?.deadlocks || "0", 10);

      // System metrics (basic - would need system-level monitoring for accurate metrics)
      const cpuPercent = 0; // TODO: Integrate with system monitoring
      const memoryPercent = 0;
      const diskUsedPercent = 0;
      const diskIops = 0;
      const diskLatencyMs = Date.now() - probeStart;

      // Determine health status
      let status: PostgreSQLNodeHealth["status"] = "healthy";
      if (!isAcceptingConnections) {
        status = "failed";
      } else if (replicationState === "disconnected" && role !== "primary") {
        status = "degraded";
      } else if (replicationLagSeconds > 10) {
        status = "degraded";
      }

      return {
        nodeId: nodeConfig.nodeId,
        ipAddress: nodeConfig.host,
        port: nodeConfig.port,
        role,
        status,
        isReachable: true,
        replicationState,
        replicationMode,
        replicationLagBytes,
        replicationLagSeconds,
        walPosition: walLsn,
        walLsn,
        replayLsn,
        isAcceptingConnections,
        activeConnections,
        maxConnections,
        transactionsPerSecond,
        deadlocks,
        cachHitRatio: cacheHitRatio,
        cpuPercent,
        memoryPercent,
        diskUsedPercent,
        diskIops,
        diskLatencyMs,
        rpoTargetSeconds: 0, // Configuration-dependent
        rtoTargetSeconds: 60,
        lastProbeAt: new Date().toISOString(),
      };
    } finally {
      client?.release();
    }
  }

  private createOfflineNodeHealth(
    nodeConfig: PostgreSQLProbeConfig["nodes"][0],
    error: unknown,
  ): PostgreSQLNodeHealth {
    return {
      nodeId: nodeConfig.nodeId,
      ipAddress: nodeConfig.host,
      port: nodeConfig.port,
      role: nodeConfig.expectedRole || "primary",
      status: "failed",
      isReachable: false,
      replicationState: "disconnected",
      replicationMode: "n/a",
      replicationLagBytes: 0,
      replicationLagSeconds: 0,
      walPosition: "0/0",
      walLsn: "0/0",
      isAcceptingConnections: false,
      activeConnections: 0,
      maxConnections: 100,
      transactionsPerSecond: 0,
      deadlocks: 0,
      cachHitRatio: 0,
      cpuPercent: 0,
      memoryPercent: 0,
      diskUsedPercent: 0,
      diskIops: 0,
      diskLatencyMs: 0,
      rpoTargetSeconds: 0,
      rtoTargetSeconds: 60,
      lastProbeAt: new Date().toISOString(),
    };
  }

  async close(): Promise<void> {
    await Promise.all(
      Array.from(this.pools.values()).map((pool) => pool.end()),
    );
    this.pools.clear();
  }
}
