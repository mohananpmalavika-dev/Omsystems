import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type {
  FederatedServer,
  FederatedServerRecord,
  FederationFailoverEvent,
  FederationHeartbeatInput,
  GlobalAlertCorrelation,
  RegisterFederatedServerInput,
} from "./types.js";

export interface FederationRepository {
  registerServer(input: RegisterFederatedServerInput): Promise<FederatedServerRecord>;
  getServerByExternalId(externalId: string): Promise<FederatedServerRecord | undefined>;
  getServer(tenantId: string, id: string): Promise<FederatedServerRecord | undefined>;
  listServers(
    tenantId: string,
    filters?: { region?: string; countryCode?: string },
  ): Promise<FederatedServerRecord[]>;
  recordHeartbeat(
    server: FederatedServerRecord,
    input: FederationHeartbeatInput,
    observedAt: string,
  ): Promise<FederatedServerRecord>;
  resolveServerForResource(tenantId: string, scopeNodeId: string): Promise<FederatedServerRecord | undefined>;
  activateFailover(input: {
    tenantId: string;
    failedServerId: string;
    activeServerId: string;
    eventType: "automatic" | "manual" | "planned";
    reason: string;
    triggeredBy: string;
    now: string;
  }): Promise<FederationFailoverEvent>;
  listActiveCorrelations(tenantId: string, limit: number): Promise<GlobalAlertCorrelation[]>;
}

export class MemoryFederationRepository implements FederationRepository {
  private readonly servers = new Map<string, FederatedServerRecord>();
  private readonly scopeMappings = new Map<string, string>();
  private readonly correlations: GlobalAlertCorrelation[] = [];
  readonly failoverEvents: FederationFailoverEvent[] = [];

  async registerServer(input: RegisterFederatedServerInput) {
    const existing = [...this.servers.values()].find((server) => server.externalId === input.externalId);
    if (existing && existing.tenantId !== input.tenantId) throw new Error("federation_external_id_conflict");
    const now = new Date().toISOString();
    const server: FederatedServerRecord = {
      id: existing?.id ?? randomUUID(),
      externalId: input.externalId,
      tenantId: input.tenantId,
      name: input.name,
      description: input.description ?? null,
      role: input.role,
      countryCode: input.countryCode,
      region: input.region,
      area: input.area ?? null,
      timezone: input.timezone,
      baseUrl: input.baseUrl,
      apiUrl: input.apiUrl,
      websocketUrl: input.websocketUrl ?? null,
      sharedSecretHash: input.sharedSecretHash,
      status: existing?.status ?? "offline",
      lastHeartbeat: existing?.lastHeartbeat ?? null,
      lastSeenAt: existing?.lastSeenAt ?? null,
      healthScore: existing?.healthScore ?? 0,
      totalCameras: existing?.totalCameras ?? 0,
      onlineCameras: existing?.onlineCameras ?? 0,
      totalBranches: existing?.totalBranches ?? 0,
      storageCapacityGb: existing?.storageCapacityGb ?? null,
      storageUsedGb: existing?.storageUsedGb ?? null,
      avgResponseTimeMs: existing?.avgResponseTimeMs ?? null,
      requestsPerMinute: existing?.requestsPerMinute ?? null,
      bandwidthMbps: existing?.bandwidthMbps ?? null,
      primaryServerId: input.primaryServerId ?? null,
      backupServerId: input.backupServerId ?? null,
      failoverPriority: input.failoverPriority,
      autoFailoverEnabled: input.autoFailoverEnabled,
      syncEnabled: input.syncEnabled,
      syncIntervalSeconds: input.syncIntervalSeconds,
      metadata: structuredClone(input.metadata),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    this.servers.set(server.id, server);
    for (const scopeNodeId of input.scopeNodeIds) this.scopeMappings.set(this.scopeKey(input.tenantId, scopeNodeId), server.id);
    return structuredClone(server);
  }

  async getServerByExternalId(externalId: string) {
    const server = [...this.servers.values()].find((candidate) => candidate.externalId === externalId);
    return server ? structuredClone(server) : undefined;
  }

  async getServer(tenantId: string, id: string) {
    const server = this.servers.get(id);
    return server?.tenantId === tenantId ? structuredClone(server) : undefined;
  }

  async listServers(tenantId: string, filters: { region?: string; countryCode?: string } = {}) {
    return [...this.servers.values()]
      .filter((server) => server.tenantId === tenantId)
      .filter((server) => !filters.region || server.region === filters.region)
      .filter((server) => !filters.countryCode || server.countryCode === filters.countryCode)
      .sort((a, b) => a.region.localeCompare(b.region) || a.name.localeCompare(b.name))
      .map((server) => structuredClone(server));
  }

  async recordHeartbeat(server: FederatedServerRecord, input: FederationHeartbeatInput, observedAt: string) {
    const updated: FederatedServerRecord = {
      ...server,
      ...input,
      storageCapacityGb: input.storageCapacityGb ?? server.storageCapacityGb,
      storageUsedGb: input.storageUsedGb ?? server.storageUsedGb,
      avgResponseTimeMs: input.avgResponseTimeMs ?? server.avgResponseTimeMs,
      requestsPerMinute: input.requestsPerMinute ?? server.requestsPerMinute,
      bandwidthMbps: input.bandwidthMbps ?? server.bandwidthMbps,
      lastHeartbeat: observedAt,
      lastSeenAt: observedAt,
      updatedAt: observedAt,
    };
    this.servers.set(server.id, updated);
    return structuredClone(updated);
  }

  async resolveServerForResource(tenantId: string, scopeNodeId: string) {
    const serverId = this.scopeMappings.get(this.scopeKey(tenantId, scopeNodeId));
    return serverId ? this.getServer(tenantId, serverId) : undefined;
  }

  async activateFailover(input: {
    tenantId: string;
    failedServerId: string;
    activeServerId: string;
    eventType: "automatic" | "manual" | "planned";
    reason: string;
    triggeredBy: string;
    now: string;
  }) {
    const failed = await this.getServer(input.tenantId, input.failedServerId);
    const active = await this.getServer(input.tenantId, input.activeServerId);
    if (!failed || !active) throw new Error("federation_server_not_found");
    this.servers.set(failed.id, { ...failed, status: "offline", updatedAt: input.now });
    this.servers.set(active.id, { ...active, status: "failover_active", lastSeenAt: input.now, updatedAt: input.now });
    for (const [key, serverId] of this.scopeMappings) {
      if (serverId === failed.id) this.scopeMappings.set(key, active.id);
    }
    const event: FederationFailoverEvent = {
      id: randomUUID(),
      tenantId: input.tenantId,
      failedServerId: failed.id,
      activeServerId: active.id,
      eventType: input.eventType,
      reason: input.reason,
      detectedAt: input.now,
      initiatedAt: input.now,
      completedAt: input.now,
      restoredAt: null,
      affectedBranches: failed.totalBranches,
      affectedCameras: failed.totalCameras,
      affectedUsers: null,
      downtimeSeconds: 0,
      status: "completed",
      success: true,
      errorMessage: null,
      triggeredBy: input.triggeredBy,
      metadata: {},
    };
    this.failoverEvents.unshift(event);
    return structuredClone(event);
  }

  async listActiveCorrelations(tenantId: string, limit: number) {
    return this.correlations.filter((item) => (item as GlobalAlertCorrelation & { tenantId?: string }).tenantId === tenantId)
      .slice(0, limit).map((item) => structuredClone(item));
  }

  private scopeKey(tenantId: string, scopeNodeId: string) {
    return `${tenantId}:${scopeNodeId}`;
  }
}

export class PostgresFederationRepository implements FederationRepository {
  constructor(private readonly pool: Pool) {}

  async registerServer(input: RegisterFederatedServerInput) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `INSERT INTO federated_servers (
           external_id,tenant_id,name,description,role,country_code,region,area,timezone,
           base_url,api_url,websocket_url,shared_secret_hash,primary_server_id,backup_server_id,
           failover_priority,auto_failover_enabled,sync_enabled,sync_interval_seconds,metadata,created_by
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21
         )
         ON CONFLICT (external_id) DO UPDATE SET
           name=EXCLUDED.name,description=EXCLUDED.description,role=EXCLUDED.role,
           country_code=EXCLUDED.country_code,region=EXCLUDED.region,area=EXCLUDED.area,
           timezone=EXCLUDED.timezone,base_url=EXCLUDED.base_url,api_url=EXCLUDED.api_url,
           websocket_url=EXCLUDED.websocket_url,shared_secret_hash=EXCLUDED.shared_secret_hash,
           primary_server_id=EXCLUDED.primary_server_id,backup_server_id=EXCLUDED.backup_server_id,
           failover_priority=EXCLUDED.failover_priority,auto_failover_enabled=EXCLUDED.auto_failover_enabled,
           sync_enabled=EXCLUDED.sync_enabled,sync_interval_seconds=EXCLUDED.sync_interval_seconds,
           metadata=EXCLUDED.metadata
         WHERE federated_servers.tenant_id=EXCLUDED.tenant_id
         RETURNING *`,
        [
          input.externalId, input.tenantId, input.name, input.description ?? null, input.role,
          input.countryCode, input.region, input.area ?? null, input.timezone, input.baseUrl,
          input.apiUrl, input.websocketUrl ?? null, input.sharedSecretHash,
          input.primaryServerId ?? null, input.backupServerId ?? null, input.failoverPriority,
          input.autoFailoverEnabled, input.syncEnabled, input.syncIntervalSeconds,
          JSON.stringify(input.metadata), input.createdBy,
        ],
      );
      const row = result.rows[0];
      if (!row) throw new Error("federation_external_id_conflict");
      await client.query("DELETE FROM regional_server_mappings WHERE tenant_id=$1 AND server_id=$2", [input.tenantId, row.id]);
      for (const scopeNodeId of input.scopeNodeIds) {
        await client.query(
          `INSERT INTO regional_server_mappings (tenant_id,server_id,scope_node_id,is_primary)
           VALUES ($1,$2,$3,true) ON CONFLICT (scope_node_id,server_id) DO UPDATE SET is_primary=true`,
          [input.tenantId, row.id, scopeNodeId],
        );
      }
      await client.query("COMMIT");
      return mapServer(row);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getServerByExternalId(externalId: string) {
    const result = await this.pool.query("SELECT * FROM federated_servers WHERE external_id=$1", [externalId]);
    return result.rows[0] ? mapServer(result.rows[0]) : undefined;
  }

  async getServer(tenantId: string, id: string) {
    const result = await this.pool.query("SELECT * FROM federated_servers WHERE tenant_id=$1 AND id=$2", [tenantId, id]);
    return result.rows[0] ? mapServer(result.rows[0]) : undefined;
  }

  async listServers(tenantId: string, filters: { region?: string; countryCode?: string } = {}) {
    const values: unknown[] = [tenantId];
    const conditions = ["tenant_id=$1"];
    if (filters.region) { values.push(filters.region); conditions.push(`region=$${values.length}`); }
    if (filters.countryCode) { values.push(filters.countryCode); conditions.push(`country_code=$${values.length}`); }
    const result = await this.pool.query(
      `SELECT * FROM federated_servers WHERE ${conditions.join(" AND ")} ORDER BY region,name`, values,
    );
    return result.rows.map(mapServer);
  }

  async recordHeartbeat(server: FederatedServerRecord, input: FederationHeartbeatInput, observedAt: string) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `UPDATE federated_servers SET
           status=$3,last_heartbeat=$4,last_seen_at=$4,health_score=$5,total_cameras=$6,
           online_cameras=$7,total_branches=$8,storage_capacity_gb=COALESCE($9,storage_capacity_gb),
           storage_used_gb=COALESCE($10,storage_used_gb),avg_response_time_ms=COALESCE($11,avg_response_time_ms),
           requests_per_minute=COALESCE($12,requests_per_minute),bandwidth_mbps=COALESCE($13,bandwidth_mbps)
         WHERE tenant_id=$1 AND id=$2 RETURNING *`,
        [server.tenantId, server.id, input.status, observedAt, input.healthScore, input.totalCameras,
          input.onlineCameras, input.totalBranches, input.storageCapacityGb ?? null,
          input.storageUsedGb ?? null, input.avgResponseTimeMs ?? null,
          input.requestsPerMinute ?? null, input.bandwidthMbps ?? null],
      );
      await client.query(
        `INSERT INTO federation_server_health_history (
           server_id,status,health_score,response_time_ms,cpu_usage,memory_usage,disk_usage,
           active_connections,requests_per_minute,bandwidth_mbps,total_cameras,online_cameras,
           offline_cameras,error_count,warning_count,recorded_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [server.id, input.status, input.healthScore, input.avgResponseTimeMs ?? null,
          input.cpuUsage ?? null, input.memoryUsage ?? null, input.diskUsage ?? null,
          input.activeConnections ?? null, input.requestsPerMinute ?? null,
          input.bandwidthMbps ?? null, input.totalCameras, input.onlineCameras,
          Math.max(0, input.totalCameras - input.onlineCameras), input.errorCount ?? 0,
          input.warningCount ?? 0, observedAt],
      );
      await client.query("COMMIT");
      return mapServer(result.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async resolveServerForResource(tenantId: string, scopeNodeId: string) {
    const result = await this.pool.query("SELECT get_server_for_resource($1,$2) AS server_id", [tenantId, scopeNodeId]);
    const id = result.rows[0]?.server_id;
    return id ? this.getServer(tenantId, id) : undefined;
  }

  async activateFailover(input: {
    tenantId: string;
    failedServerId: string;
    activeServerId: string;
    eventType: "automatic" | "manual" | "planned";
    reason: string;
    triggeredBy: string;
    now: string;
  }) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const locked = await client.query(
        "SELECT * FROM federated_servers WHERE tenant_id=$1 AND id=ANY($2::uuid[]) FOR UPDATE",
        [input.tenantId, [input.failedServerId, input.activeServerId]],
      );
      if (locked.rowCount !== 2) throw new Error("federation_server_not_found");
      const failed = locked.rows.find((row) => row.id === input.failedServerId);
      await client.query("UPDATE federated_servers SET status='offline' WHERE tenant_id=$1 AND id=$2", [input.tenantId, input.failedServerId]);
      await client.query(
        "UPDATE federated_servers SET status='failover_active',last_seen_at=$3 WHERE tenant_id=$1 AND id=$2",
        [input.tenantId, input.activeServerId, input.now],
      );
      await remapFailoverScopes(client, input.tenantId, input.failedServerId, input.activeServerId);
      const eventResult = await client.query(
        `INSERT INTO federation_failover_events (
           tenant_id,failed_server_id,active_server_id,event_type,reason,detected_at,initiated_at,
           completed_at,affected_branches,affected_cameras,downtime_seconds,status,success,triggered_by,metadata
         ) VALUES ($1,$2,$3,$4,$5,$6,$6,$6,$7,$8,0,'completed',true,$9,'{}'::jsonb) RETURNING *`,
        [input.tenantId, input.failedServerId, input.activeServerId, input.eventType,
          input.reason, input.now, failed.total_branches, failed.total_cameras, input.triggeredBy],
      );
      await client.query("COMMIT");
      return mapFailoverEvent(eventResult.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async listActiveCorrelations(tenantId: string, limit: number) {
    const result = await this.pool.query(
      `SELECT * FROM active_global_correlations WHERE tenant_id=$1
       ORDER BY severity DESC,started_at DESC LIMIT $2`, [tenantId, limit],
    );
    return result.rows.map((row) => ({
      id: row.id,
      correlationType: row.correlation_type,
      confidenceScore: Number(row.confidence_score),
      severity: row.severity,
      alertCount: Number(row.alert_count),
      regions: row.regions ?? [],
      startedAt: iso(row.started_at),
      endedAt: iso(row.ended_at),
      ...(row.tracked_entity_type ? { trackedEntityType: row.tracked_entity_type } : {}),
      ...(row.tracked_entity_id ? { trackedEntityId: row.tracked_entity_id } : {}),
      involvedServers: row.involved_servers ?? [],
    }));
  }
}

async function remapFailoverScopes(client: PoolClient, tenantId: string, failedServerId: string, activeServerId: string) {
  await client.query(
    `INSERT INTO regional_server_mappings (tenant_id,server_id,scope_node_id,is_primary)
     SELECT tenant_id,$3,scope_node_id,true FROM regional_server_mappings
     WHERE tenant_id=$1 AND server_id=$2 AND is_primary=true
     ON CONFLICT (scope_node_id,server_id) DO UPDATE SET is_primary=true`,
    [tenantId, failedServerId, activeServerId],
  );
  await client.query(
    "UPDATE regional_server_mappings SET is_primary=false WHERE tenant_id=$1 AND server_id=$2",
    [tenantId, failedServerId],
  );
}

function mapServer(row: any): FederatedServerRecord {
  return {
    id: row.id,
    externalId: row.external_id,
    tenantId: row.tenant_id,
    name: row.name,
    description: row.description ?? null,
    role: row.role,
    countryCode: row.country_code,
    region: row.region,
    area: row.area ?? null,
    timezone: row.timezone,
    baseUrl: row.base_url,
    apiUrl: row.api_url,
    websocketUrl: row.websocket_url ?? null,
    sharedSecretHash: row.shared_secret_hash,
    status: row.status,
    lastHeartbeat: row.last_heartbeat ? iso(row.last_heartbeat) : null,
    lastSeenAt: row.last_seen_at ? iso(row.last_seen_at) : null,
    healthScore: Number(row.health_score ?? 0),
    totalCameras: Number(row.total_cameras ?? 0),
    onlineCameras: Number(row.online_cameras ?? 0),
    totalBranches: Number(row.total_branches ?? 0),
    storageCapacityGb: nullableNumber(row.storage_capacity_gb),
    storageUsedGb: nullableNumber(row.storage_used_gb),
    avgResponseTimeMs: nullableNumber(row.avg_response_time_ms),
    requestsPerMinute: nullableNumber(row.requests_per_minute),
    bandwidthMbps: nullableNumber(row.bandwidth_mbps),
    primaryServerId: row.primary_server_id ?? null,
    backupServerId: row.backup_server_id ?? null,
    failoverPriority: Number(row.failover_priority ?? 100),
    autoFailoverEnabled: Boolean(row.auto_failover_enabled),
    syncEnabled: Boolean(row.sync_enabled),
    syncIntervalSeconds: Number(row.sync_interval_seconds ?? 60),
    metadata: row.metadata ?? {},
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function mapFailoverEvent(row: any): FederationFailoverEvent {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    failedServerId: row.failed_server_id,
    activeServerId: row.active_server_id,
    eventType: row.event_type,
    reason: row.reason,
    detectedAt: iso(row.detected_at),
    initiatedAt: iso(row.initiated_at),
    completedAt: row.completed_at ? iso(row.completed_at) : null,
    restoredAt: row.restored_at ? iso(row.restored_at) : null,
    affectedBranches: Number(row.affected_branches ?? 0),
    affectedCameras: Number(row.affected_cameras ?? 0),
    affectedUsers: nullableNumber(row.affected_users),
    downtimeSeconds: nullableNumber(row.downtime_seconds),
    status: row.status,
    success: row.success == null ? null : Boolean(row.success),
    errorMessage: row.error_message ?? null,
    triggeredBy: row.triggered_by,
    metadata: row.metadata ?? {},
  };
}

function nullableNumber(value: unknown) {
  return value == null ? null : Number(value);
}

function iso(value: string | Date) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function publicServer(server: FederatedServerRecord): FederatedServer {
  const { sharedSecretHash: _secret, ...safe } = server;
  return safe;
}

