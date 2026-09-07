import { EventEmitter } from "node:events";
import type { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";

export interface MultiRegionPoolConfig {
  primaryPool: Pool;
  standbyPool?: Pool;
  healthCheckIntervalMs?: number;
  autoFailback?: boolean;
}

export type RegionRole = "PRIMARY" | "STANDBY";
export type NodeStatus = "HEALTHY" | "DEGRADED" | "OFFLINE";

export interface ClusterStatus {
  activeRole: RegionRole;
  primaryStatus: NodeStatus;
  standbyStatus: NodeStatus;
  failoverCount: number;
  lastFailoverAt?: Date;
  lastFailoverReason?: string;
}

/**
 * MultiRegionDatabasePoolRouter
 * 
 * Provides automated disaster recovery and transparent failover routing between
 * primary and standby PostgreSQL clusters (e.g. across AWS/GCP regions).
 * 
 * Invariants:
 * 1. Monotonicity & Zero-Drop: Write transactions encountering primary failure
 *    are seamlessly re-routed to the standby primary.
 * 2. Fail-Closed Security: If both primary and standby are unreachable, operations
 *    fail closed with a descriptive error.
 * 3. Lock & Transaction Continuity: Handled PoolClients are bound to the active cluster.
 */
export class MultiRegionDatabasePoolRouter extends EventEmitter {
  private activeRole: RegionRole = "PRIMARY";
  private primaryStatus: NodeStatus = "HEALTHY";
  private standbyStatus: NodeStatus = "HEALTHY";
  private failoverCount = 0;
  private lastFailoverAt?: Date;
  private lastFailoverReason?: string;
  private healthCheckTimer?: NodeJS.Timeout;
  private simulatedPrimaryFailure = false;

  private readonly primaryPool: Pool;
  private readonly standbyPool?: Pool;
  private readonly autoFailback: boolean;

  constructor(config: MultiRegionPoolConfig) {
    super();
    this.primaryPool = config.primaryPool;
    this.standbyPool = config.standbyPool;
    this.autoFailback = config.autoFailback ?? false;

    if (config.healthCheckIntervalMs && config.healthCheckIntervalMs > 0 && this.standbyPool) {
      this.healthCheckTimer = setInterval(() => {
        void this.checkClusterHealth();
      }, config.healthCheckIntervalMs);
      if (this.healthCheckTimer.unref) {
        this.healthCheckTimer.unref();
      }
    }
  }

  /**
   * Returns the pool for the currently active role
   */
  public getActivePool(): Pool {
    if (this.activeRole === "PRIMARY" && !this.simulatedPrimaryFailure) {
      return this.primaryPool;
    }
    if (this.standbyPool) {
      return this.standbyPool;
    }
    return this.primaryPool;
  }

  /**
   * Retrieves the current high-availability status of the database cluster
   */
  public getClusterStatus(): ClusterStatus {
    return {
      activeRole: this.activeRole,
      primaryStatus: this.simulatedPrimaryFailure ? "OFFLINE" : this.primaryStatus,
      standbyStatus: this.standbyStatus,
      failoverCount: this.failoverCount,
      lastFailoverAt: this.lastFailoverAt,
      lastFailoverReason: this.lastFailoverReason,
    };
  }

  /**
   * Simulates a primary regional outage for automated DR testing
   */
  public simulatePrimaryOutage(reason = "Simulated primary region network partition / crash") {
    this.simulatedPrimaryFailure = true;
    this.primaryStatus = "OFFLINE";
    this.triggerFailover("STANDBY", reason);
  }

  /**
   * Restores primary connectivity following an outage
   */
  public restorePrimary() {
    this.simulatedPrimaryFailure = false;
    this.primaryStatus = "HEALTHY";
    if (this.autoFailback) {
      this.triggerFailover("PRIMARY", "Primary region restored and verified healthy");
    }
  }

  /**
   * Explicitly triggers a failover to the specified target role
   */
  public triggerFailover(targetRole: RegionRole, reason: string): boolean {
    if (targetRole === this.activeRole) {
      return false;
    }
    if (targetRole === "STANDBY" && !this.standbyPool) {
      throw new Error("FAILOVER_REJECTED: No standby database pool configured");
    }

    const previousRole = this.activeRole;
    this.activeRole = targetRole;
    this.failoverCount++;
    this.lastFailoverAt = new Date();
    this.lastFailoverReason = reason;

    this.emit("failover", {
      fromRole: previousRole,
      toRole: targetRole,
      reason,
      timestamp: this.lastFailoverAt,
    });

    return true;
  }

  /**
   * Executes a query with automatic failover retry
   */
  public async query<R extends QueryResultRow = any, I extends any[] = any[]>(
    queryTextOrConfig: any,
    values?: I,
  ): Promise<QueryResult<R>> {
    const targetPool = this.getActivePool();

    try {
      if (this.simulatedPrimaryFailure && targetPool === this.primaryPool) {
        throw new Error("SIMULATED_PRIMARY_OUTAGE: Connection refused (regional partition)");
      }
      return await (targetPool.query as any)(queryTextOrConfig, values);
    } catch (err: any) {
      if (this.shouldTriggerFailover(err) && this.standbyPool && this.activeRole === "PRIMARY") {
        this.triggerFailover("STANDBY", `Primary query failure: ${err.message}`);
        // Seamlessly retry against the standby pool
        return await (this.standbyPool.query as any)(queryTextOrConfig, values);
      }
      throw err;
    }
  }

  /**
   * Checks out a client with automatic failover retry
   */
  public async connect(): Promise<PoolClient> {
    const targetPool = this.getActivePool();

    try {
      if (this.simulatedPrimaryFailure && targetPool === this.primaryPool) {
        throw new Error("SIMULATED_PRIMARY_OUTAGE: Connection refused (regional partition)");
      }
      return await targetPool.connect();
    } catch (err: any) {
      if (this.shouldTriggerFailover(err) && this.standbyPool && this.activeRole === "PRIMARY") {
        this.triggerFailover("STANDBY", `Primary connect checkout failure: ${err.message}`);
        return await this.standbyPool.connect();
      }
      throw err;
    }
  }

  /**
   * Terminates all connections in managed pools
   */
  public async end(): Promise<void> {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }
    await this.primaryPool.end();
    if (this.standbyPool) {
      await this.standbyPool.end();
    }
  }

  /**
   * Determines if a PostgreSQL or network error warrants an immediate regional failover
   */
  private shouldTriggerFailover(err: any): boolean {
    if (!err) return false;
    const msg = String(err.message || "");
    const code = String(err.code || "");

    // PostgreSQL specific error codes indicating failover conditions
    // 25006: read_only_sql_transaction (primary stepped down to read replica)
    // 57P01: admin_shutdown
    // 57P02: crash_shutdown
    // 57P03: cannot_connect_now
    // 08006: connection_failure
    // 08001: unable_to_establish_connection
    const failoverCodes = ["25006", "57P01", "57P02", "57P03", "08006", "08001", "ECONNREFUSED", "ETIMEDOUT", "EHOSTUNREACH"];
    if (failoverCodes.includes(code)) return true;

    if (
      msg.includes("read-only transaction") ||
      msg.includes("connection terminated") ||
      msg.includes("Connection refused") ||
      msg.includes("timeout") ||
      msg.includes("SIMULATED_PRIMARY_OUTAGE")
    ) {
      return true;
    }

    return false;
  }

  /**
   * Periodic health checker for standby and primary nodes
   */
  private async checkClusterHealth(): Promise<void> {
    // Probe primary
    if (!this.simulatedPrimaryFailure) {
      try {
        await (this.primaryPool.query as any)("SELECT 1");
        this.primaryStatus = "HEALTHY";
      } catch {
        this.primaryStatus = "DEGRADED";
        if (this.activeRole === "PRIMARY" && this.standbyPool) {
          this.triggerFailover("STANDBY", "Periodic health probe detected primary outage");
        }
      }
    }

    // Probe standby
    if (this.standbyPool) {
      try {
        await (this.standbyPool.query as any)("SELECT 1");
        this.standbyStatus = "HEALTHY";
      } catch {
        this.standbyStatus = "DEGRADED";
      }
    }
  }
}
