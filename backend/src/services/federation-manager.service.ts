/**
 * Federation Manager Service
 * Core service for managing federated servers, health monitoring, and routing decisions
 */

import { EventEmitter } from 'events';
import { Pool } from 'pg';
import { createHash, randomBytes } from 'crypto';
import { logger } from '../utils/logger.js';

export type FederationServerRole = 'global_command_center' | 'regional_control_center' | 'backup_server' | 'edge_server';
export type FederationServerStatus = 'online' | 'degraded' | 'offline' | 'maintenance' | 'failover_active';

export interface FederatedServer {
  id: string;
  externalId: string;
  tenantId: string;
  name: string;
  description?: string;
  role: FederationServerRole;
  countryCode: string;
  region: string;
  area?: string;
  timezone: string;
  baseUrl: string;
  apiUrl: string;
  websocketUrl?: string;
  status: FederationServerStatus;
  lastHeartbeat?: Date;
  lastSeenAt?: Date;
  healthScore: number;
  totalCameras: number;
  onlineCameras: number;
  totalBranches: number;
  storageCapacityGb?: number;
  storageUsedGb?: number;
  avgResponseTimeMs?: number;
  requestsPerMinute?: number;
  bandwidthMbps?: number;
  primaryServerId?: string;
  backupServerId?: string;
  failoverPriority: number;
  autoFailoverEnabled: boolean;
  syncEnabled: boolean;
  syncIntervalSeconds: number;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface ServerRegistration {
  externalId: string;
  tenantId: string;
  name: string;
  role: FederationServerRole;
  countryCode: string;
  region: string;
  area?: string;
  timezone?: string;
  baseUrl: string;
  apiUrl: string;
  websocketUrl?: string;
  sharedSecret: string;
  primaryServerId?: string;
  backupServerId?: string;
  metadata?: Record<string, any>;
}

export interface ServerHealthMetrics {
  status: FederationServerStatus;
  healthScore: number;
  responseTimeMs?: number;
  cpuUsage?: number;
  memoryUsage?: number;
  diskUsage?: number;
  activeConnections?: number;
  requestsPerMinute?: number;
  bandwidthMbps?: number;
  totalCameras: number;
  onlineCameras: number;
  offlineCameras: number;
  errorCount?: number;
  warningCount?: number;
}

export interface RoutingDecision {
  serverId: string;
  serverUrl: string;
  confidence: number;
  reason: string;
  fallbackServers?: string[];
}

export class FederationManagerService extends EventEmitter {
  private pool: Pool;
  private heartbeatInterval?: NodeJS.Timeout;
  private healthCheckInterval?: NodeJS.Timeout;
  private serverCache: Map<string, FederatedServer> = new Map();
  private lastCacheUpdate: Date = new Date(0);
  private readonly CACHE_TTL_MS = 30000; // 30 seconds
  private readonly HEARTBEAT_INTERVAL_MS = 15000; // 15 seconds
  private readonly HEALTH_CHECK_INTERVAL_MS = 60000; // 60 seconds

  constructor(pool: Pool) {
    super();
    this.pool = pool;
  }

  /**
   * Start the federation manager service
   */
  async start(): Promise<void> {
    logger.info('Starting Federation Manager Service');

    // Load server registry
    await this.refreshServerCache();

    // Start heartbeat monitoring
    this.startHeartbeatMonitoring();

    // Start health checks
    this.startHealthChecks();

    logger.info('Federation Manager Service started successfully');
  }

  /**
   * Stop the federation manager service
   */
  async stop(): Promise<void> {
    logger.info('Stopping Federation Manager Service');

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    logger.info('Federation Manager Service stopped');
  }

  /**
   * Register a new federated server
   */
  async registerServer(registration: ServerRegistration): Promise<FederatedServer> {
    logger.info('Registering new federated server', {
      externalId: registration.externalId,
      name: registration.name,
      role: registration.role,
      region: registration.region
    });

    // Hash the shared secret
    const sharedSecretHash = this.hashSecret(registration.sharedSecret);

    // Validate primary server if it's a backup
    if (registration.role === 'backup_server' && !registration.primaryServerId) {
      throw new Error('Backup server must specify a primary server');
    }

    const result = await this.pool.query(
      `INSERT INTO federated_servers (
        external_id, tenant_id, name, description, role,
        country_code, region, area, timezone,
        base_url, api_url, websocket_url,
        shared_secret_hash,
        primary_server_id, backup_server_id,
        status, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING 
        id::text,
        external_id as "externalId",
        tenant_id::text as "tenantId",
        name,
        description,
        role,
        country_code as "countryCode",
        region,
        area,
        timezone,
        base_url as "baseUrl",
        api_url as "apiUrl",
        websocket_url as "websocketUrl",
        status,
        health_score as "healthScore",
        total_cameras as "totalCameras",
        online_cameras as "onlineCameras",
        total_branches as "totalBranches",
        failover_priority as "failoverPriority",
        auto_failover_enabled as "autoFailoverEnabled",
        sync_enabled as "syncEnabled",
        sync_interval_seconds as "syncIntervalSeconds",
        metadata,
        created_at as "createdAt",
        updated_at as "updatedAt"`,
      [
        registration.externalId,
        registration.tenantId,
        registration.name,
        null, // description
        registration.role,
        registration.countryCode,
        registration.region,
        registration.area,
        registration.timezone || 'UTC',
        registration.baseUrl,
        registration.apiUrl,
        registration.websocketUrl,
        sharedSecretHash,
        registration.primaryServerId,
        registration.backupServerId,
        'offline', // Initial status
        JSON.stringify(registration.metadata || {})
      ]
    );

    const server = result.rows[0] as FederatedServer;

    // Clear cache
    this.serverCache.clear();

    // Emit event
    this.emit('server:registered', server);

    logger.info('Federated server registered successfully', {
      serverId: server.id,
      externalId: server.externalId
    });

    return server;
  }

  /**
   * Update server status and metrics
   */
  async updateServerStatus(
    serverId: string,
    metrics: ServerHealthMetrics
  ): Promise<void> {
    await this.pool.query(
      `UPDATE federated_servers
       SET status = $1,
           health_score = $2,
           avg_response_time_ms = $3,
           requests_per_minute = $4,
           bandwidth_mbps = $5,
           total_cameras = $6,
           online_cameras = $7,
           last_heartbeat = now(),
           last_seen_at = now(),
           updated_at = now()
       WHERE id = $8::uuid`,
      [
        metrics.status,
        metrics.healthScore,
        metrics.responseTimeMs,
        metrics.requestsPerMinute,
        metrics.bandwidthMbps,
        metrics.totalCameras,
        metrics.onlineCameras,
        serverId
      ]
    );

    // Record health history
    await this.recordHealthHistory(serverId, metrics);

    // Clear cache
    this.serverCache.clear();

    // Check if status changed and emit event
    const server = await this.getServerById(serverId);
    if (server) {
      this.emit('server:status_changed', {
        serverId: server.id,
        status: metrics.status,
        healthScore: metrics.healthScore
      });
    }

    // Check for failover conditions
    if (metrics.status === 'offline' || metrics.healthScore < 30) {
      await this.checkFailoverConditions(serverId);
    }
  }

  /**
   * Process server heartbeat
   */
  async processHeartbeat(
    externalId: string,
    metrics: ServerHealthMetrics
  ): Promise<FederatedServer> {
    // Find server by external ID
    const result = await this.pool.query(
      `SELECT id::text FROM federated_servers WHERE external_id = $1`,
      [externalId]
    );

    if (result.rows.length === 0) {
      throw new Error(`Server not found: ${externalId}`);
    }

    const serverId = result.rows[0].id;

    // Update status
    await this.updateServerStatus(serverId, metrics);

    // Get updated server
    const server = await this.getServerById(serverId);
    if (!server) {
      throw new Error(`Server not found after update: ${serverId}`);
    }

    logger.debug('Heartbeat processed', {
      serverId: server.id,
      externalId: server.externalId,
      status: server.status,
      healthScore: server.healthScore
    });

    return server;
  }

  /**
   * Get server by ID
   */
  async getServerById(serverId: string): Promise<FederatedServer | null> {
    // Check cache first
    if (this.serverCache.has(serverId)) {
      return this.serverCache.get(serverId)!;
    }

    const result = await this.pool.query(
      `SELECT 
        id::text,
        external_id as "externalId",
        tenant_id::text as "tenantId",
        name,
        description,
        role,
        country_code as "countryCode",
        region,
        area,
        timezone,
        base_url as "baseUrl",
        api_url as "apiUrl",
        websocket_url as "websocketUrl",
        status,
        last_heartbeat as "lastHeartbeat",
        last_seen_at as "lastSeenAt",
        health_score as "healthScore",
        total_cameras as "totalCameras",
        online_cameras as "onlineCameras",
        total_branches as "totalBranches",
        storage_capacity_gb as "storageCapacityGb",
        storage_used_gb as "storageUsedGb",
        avg_response_time_ms as "avgResponseTimeMs",
        requests_per_minute as "requestsPerMinute",
        bandwidth_mbps as "bandwidthMbps",
        primary_server_id::text as "primaryServerId",
        backup_server_id::text as "backupServerId",
        failover_priority as "failoverPriority",
        auto_failover_enabled as "autoFailoverEnabled",
        sync_enabled as "syncEnabled",
        sync_interval_seconds as "syncIntervalSeconds",
        metadata,
        created_at as "createdAt",
        updated_at as "updatedAt"
       FROM federated_servers
       WHERE id = $1::uuid`,
      [serverId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const server = result.rows[0] as FederatedServer;
    this.serverCache.set(serverId, server);

    return server;
  }

  /**
   * Get server by external ID
   */
  async getServerByExternalId(externalId: string): Promise<FederatedServer | null> {
    const result = await this.pool.query(
      `SELECT id::text FROM federated_servers WHERE external_id = $1`,
      [externalId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.getServerById(result.rows[0].id);
  }

  /**
   * List all servers for a tenant
   */
  async listServers(
    tenantId: string,
    filters?: {
      role?: FederationServerRole;
      status?: FederationServerStatus;
      region?: string;
    }
  ): Promise<FederatedServer[]> {
    let query = `
      SELECT 
        id::text,
        external_id as "externalId",
        tenant_id::text as "tenantId",
        name,
        role,
        country_code as "countryCode",
        region,
        area,
        status,
        health_score as "healthScore",
        total_cameras as "totalCameras",
        online_cameras as "onlineCameras",
        total_branches as "totalBranches",
        last_heartbeat as "lastHeartbeat",
        base_url as "baseUrl",
        api_url as "apiUrl",
        created_at as "createdAt"
      FROM federated_servers
      WHERE tenant_id = $1
    `;

    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (filters?.role) {
      query += ` AND role = $${paramIndex++}`;
      params.push(filters.role);
    }

    if (filters?.status) {
      query += ` AND status = $${paramIndex++}`;
      params.push(filters.status);
    }

    if (filters?.region) {
      query += ` AND region = $${paramIndex++}`;
      params.push(filters.region);
    }

    query += ` ORDER BY 
      CASE role 
        WHEN 'global_command_center' THEN 1
        WHEN 'regional_control_center' THEN 2
        WHEN 'backup_server' THEN 3
        WHEN 'edge_server' THEN 4
      END,
      region, name`;

    const result = await this.pool.query(query, params);
    return result.rows;
  }

  /**
   * Route request to appropriate server based on resource
   */
  async routeToServer(
    tenantId: string,
    scopeNodeId: string
  ): Promise<RoutingDecision> {
    // Use database function to find the appropriate server
    const result = await this.pool.query(
      `SELECT get_server_for_resource($1::uuid, $2::uuid)::text as server_id`,
      [tenantId, scopeNodeId]
    );

    const serverId = result.rows[0]?.server_id;

    if (!serverId) {
      throw new Error(`No server found for resource: ${scopeNodeId}`);
    }

    const server = await this.getServerById(serverId);
    if (!server) {
      throw new Error(`Server not found: ${serverId}`);
    }

    // Check if server is healthy
    if (server.status === 'offline') {
      // Try to find backup server
      if (server.backupServerId) {
        const backupServer = await this.getServerById(server.backupServerId);
        if (backupServer && backupServer.status === 'online') {
          return {
            serverId: backupServer.id,
            serverUrl: backupServer.apiUrl,
            confidence: 0.8,
            reason: 'Primary server offline, using backup',
            fallbackServers: []
          };
        }
      }

      throw new Error(`Server is offline and no healthy backup available: ${serverId}`);
    }

    // Get fallback servers in same region
    const fallbackServers = await this.getFallbackServers(tenantId, server.region, serverId);

    return {
      serverId: server.id,
      serverUrl: server.apiUrl,
      confidence: server.healthScore / 100,
      reason: 'Primary server for resource',
      fallbackServers: fallbackServers.map(s => s.id)
    };
  }

  /**
   * Get fallback servers for a region
   */
  private async getFallbackServers(
    tenantId: string,
    region: string,
    excludeServerId: string
  ): Promise<FederatedServer[]> {
    const result = await this.pool.query(
      `SELECT 
        id::text,
        external_id as "externalId",
        name,
        api_url as "apiUrl",
        status,
        health_score as "healthScore"
       FROM federated_servers
       WHERE tenant_id = $1::uuid
         AND region = $2
         AND id != $3::uuid
         AND status IN ('online', 'degraded')
         AND role IN ('regional_control_center', 'backup_server')
       ORDER BY 
         CASE status 
           WHEN 'online' THEN 1
           WHEN 'degraded' THEN 2
         END,
         health_score DESC
       LIMIT 3`,
      [tenantId, region, excludeServerId]
    );

    return result.rows;
  }

  /**
   * Get federation dashboard summary
   */
  async getDashboardSummary(tenantId: string): Promise<any> {
    const result = await this.pool.query(
      `SELECT * FROM federation_dashboard_summary WHERE tenant_id = $1::uuid`,
      [tenantId]
    );

    if (result.rows.length === 0) {
      return {
        totalServers: 0,
        onlineServers: 0,
        offlineServers: 0,
        degradedServers: 0,
        totalRegions: 0,
        totalCameras: 0,
        onlineCameras: 0,
        totalBranches: 0,
        totalStorageGb: 0,
        usedStorageGb: 0,
        avgHealthScore: 0,
        lastHeartbeat: null
      };
    }

    const row = result.rows[0];
    return {
      totalServers: parseInt(row.total_servers) || 0,
      onlineServers: parseInt(row.online_servers) || 0,
      offlineServers: parseInt(row.offline_servers) || 0,
      degradedServers: parseInt(row.degraded_servers) || 0,
      totalRegions: parseInt(row.total_regions) || 0,
      totalCameras: parseInt(row.total_cameras) || 0,
      onlineCameras: parseInt(row.online_cameras) || 0,
      totalBranches: parseInt(row.total_branches) || 0,
      totalStorageGb: parseInt(row.total_storage_gb) || 0,
      usedStorageGb: parseInt(row.used_storage_gb) || 0,
      avgHealthScore: parseFloat(row.avg_health_score) || 0,
      lastHeartbeat: row.last_heartbeat
    };
  }

  /**
   * Start heartbeat monitoring
   */
  private startHeartbeatMonitoring(): void {
    this.heartbeatInterval = setInterval(async () => {
      try {
        await this.checkStaleHeartbeats();
      } catch (error) {
        logger.error('Error checking stale heartbeats', { error });
      }
    }, this.HEARTBEAT_INTERVAL_MS);
  }

  /**
   * Start health checks
   */
  private startHealthChecks(): void {
    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.performHealthChecks();
      } catch (error) {
        logger.error('Error performing health checks', { error });
      }
    }, this.HEALTH_CHECK_INTERVAL_MS);
  }

  /**
   * Check for stale heartbeats and mark servers offline
   */
  private async checkStaleHeartbeats(): Promise<void> {
    const staleThresholdSeconds = 60; // 1 minute

    await this.pool.query(
      `UPDATE federated_servers
       SET status = 'offline',
           updated_at = now()
       WHERE status IN ('online', 'degraded')
         AND last_heartbeat < now() - interval '${staleThresholdSeconds} seconds'
         AND last_heartbeat IS NOT NULL`
    );

    // Clear cache after updates
    this.serverCache.clear();
  }

  /**
   * Perform active health checks on all servers
   */
  private async performHealthChecks(): Promise<void> {
    const servers = await this.pool.query(
      `SELECT id::text, external_id, api_url, status
       FROM federated_servers
       WHERE status != 'maintenance'`
    );

    for (const server of servers.rows) {
      try {
        await this.checkServerHealth(server.id, server.api_url);
      } catch (error) {
        logger.warn('Health check failed for server', {
          serverId: server.id,
          externalId: server.external_id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  }

  /**
   * Check individual server health
   */
  private async checkServerHealth(serverId: string, apiUrl: string): Promise<void> {
    const startTime = Date.now();

    try {
      const response = await fetch(`${apiUrl}/health`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        },
        signal: AbortSignal.timeout(5000) // 5 second timeout
      });

      const responseTime = Date.now() - startTime;

      if (response.ok) {
        const data = await response.json();

        // Calculate health score based on response time and metrics
        let healthScore = 100;
        if (responseTime > 1000) healthScore -= 20;
        if (responseTime > 2000) healthScore -= 30;

        await this.updateServerStatus(serverId, {
          status: 'online',
          healthScore: Math.max(0, healthScore),
          responseTimeMs: responseTime,
          totalCameras: data.totalCameras || 0,
          onlineCameras: data.onlineCameras || 0,
          offlineCameras: data.offlineCameras || 0
        });
      } else {
        await this.updateServerStatus(serverId, {
          status: 'degraded',
          healthScore: 50,
          responseTimeMs: responseTime,
          totalCameras: 0,
          onlineCameras: 0,
          offlineCameras: 0
        });
      }
    } catch (error) {
      // Server unreachable
      await this.updateServerStatus(serverId, {
        status: 'offline',
        healthScore: 0,
        totalCameras: 0,
        onlineCameras: 0,
        offlineCameras: 0
      });
    }
  }

  /**
   * Record server health history
   */
  private async recordHealthHistory(
    serverId: string,
    metrics: ServerHealthMetrics
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO federation_server_health_history (
        server_id, status, health_score,
        response_time_ms, cpu_usage, memory_usage, disk_usage,
        active_connections, requests_per_minute, bandwidth_mbps,
        total_cameras, online_cameras, offline_cameras,
        error_count, warning_count
      ) VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        serverId,
        metrics.status,
        metrics.healthScore,
        metrics.responseTimeMs,
        metrics.cpuUsage,
        metrics.memoryUsage,
        metrics.diskUsage,
        metrics.activeConnections,
        metrics.requestsPerMinute,
        metrics.bandwidthMbps,
        metrics.totalCameras,
        metrics.onlineCameras,
        metrics.offlineCameras,
        metrics.errorCount,
        metrics.warningCount
      ]
    );
  }

  /**
   * Check if failover is needed
   */
  private async checkFailoverConditions(serverId: string): Promise<void> {
    const server = await this.getServerById(serverId);
    if (!server || !server.autoFailoverEnabled) {
      return;
    }

    // Check if server has been offline/unhealthy for threshold period
    const unhealthyThresholdMinutes = 5;

    const result = await this.pool.query(
      `SELECT COUNT(*) as unhealthy_count
       FROM federation_server_health_history
       WHERE server_id = $1::uuid
         AND recorded_at > now() - interval '${unhealthyThresholdMinutes} minutes'
         AND (status = 'offline' OR health_score < 30)`,
      [serverId]
    );

    const unhealthyCount = parseInt(result.rows[0].unhealthy_count);

    // If consistently unhealthy, trigger failover
    if (unhealthyCount >= 3) {
      logger.warn('Server consistently unhealthy, checking failover', {
        serverId,
        unhealthyCount
      });

      this.emit('server:failover_required', {
        serverId: server.id,
        reason: 'Consistently unhealthy',
        unhealthyCount
      });
    }
  }

  /**
   * Refresh server cache
   */
  private async refreshServerCache(): Promise<void> {
    const now = new Date();
    if (now.getTime() - this.lastCacheUpdate.getTime() < this.CACHE_TTL_MS) {
      return; // Cache still valid
    }

    this.serverCache.clear();
    this.lastCacheUpdate = now;

    logger.debug('Server cache refreshed');
  }

  /**
   * Hash shared secret for storage
   */
  private hashSecret(secret: string): string {
    return createHash('sha256').update(secret).digest('hex');
  }

  /**
   * Verify shared secret
   */
  async verifyServerSecret(externalId: string, secret: string): Promise<boolean> {
    const hashedSecret = this.hashSecret(secret);

    const result = await this.pool.query(
      `SELECT 1 FROM federated_servers 
       WHERE external_id = $1 AND shared_secret_hash = $2`,
      [externalId, hashedSecret]
    );

    return result.rows.length > 0;
  }
}

// Singleton instance
let federationManagerInstance: FederationManagerService | null = null;

export function getFederationManager(pool: Pool): FederationManagerService {
  if (!federationManagerInstance) {
    federationManagerInstance = new FederationManagerService(pool);
  }
  return federationManagerInstance;
}
