/**
 * Telemetry Sync Service
 * 
 * Syncs data from existing health tables into device_health_snapshots
 * for prediction engine consumption. Runs periodically to aggregate
 * telemetry from multiple sources into normalized format.
 */

import { Pool } from 'pg';
import { logger } from '../utils/logger.js';

export class TelemetrySyncService {
  constructor(private pool: Pool) {}

  /**
   * Sync all telemetry sources for a tenant
   */
  async syncTelemetryForTenant(tenantId: string): Promise<void> {
    try {
      logger.info('Starting telemetry sync', { tenantId });

      // Sync recorder health
      await this.syncRecorderHealth(tenantId);

      // Sync disk health
      await this.syncDiskHealth(tenantId);

      // Sync network health
      await this.syncNetworkHealth(tenantId);

      // Sync camera health
      await this.syncCameraHealth(tenantId);

      // Sync UPS health
      await this.syncUpsHealth(tenantId);

      logger.info('Telemetry sync completed', { tenantId });
    } catch (error) {
      logger.error('Error syncing telemetry', { error, tenantId });
      throw error;
    }
  }

  /**
   * Sync recorder health from dvr_nvr_health
   */
  private async syncRecorderHealth(tenantId: string): Promise<void> {
    try {
      // Get recent recorder health data (last hour)
      const recorders = await this.pool.query(
        `SELECT 
          device_id,
          timestamp,
          status,
          latency_ms,
          cpu_usage,
          memory_usage,
          hdd_status,
          recording_status,
          connected_cameras,
          total_cameras,
          firmware_version,
          uptime,
          temperature,
          error_message
        FROM dvr_nvr_health
        WHERE timestamp >= NOW() - INTERVAL '1 hour'
        ORDER BY device_id, timestamp DESC`
      );

      for (const record of recorders.rows) {
        // Calculate health score
        const healthScore = this.calculateRecorderHealthScore(record);

        // Check if snapshot already exists
        const existing = await this.pool.query(
          `SELECT id FROM device_health_snapshots
          WHERE tenant_id = $1 
            AND device_id = $2
            AND snapshot_timestamp = $3`,
          [tenantId, record.device_id, record.timestamp]
        );

        if (existing.rows.length > 0) {
          continue; // Skip if already synced
        }

        // Get branch node ID from device inventory
        const branchResult = await this.pool.query(
          `SELECT branch_id FROM device_inventory WHERE id = $1`,
          [record.device_id]
        );

        const branchNodeId = branchResult.rows[0]?.branch_id || null;

        // Insert health snapshot
        await this.pool.query(
          `INSERT INTO device_health_snapshots (
            tenant_id,
            device_id,
            device_type,
            branch_node_id,
            snapshot_timestamp,
            health_score,
            metrics
          ) VALUES ($1, $2, 'recorder', $3, $4, $5, $6)
          ON CONFLICT (tenant_id, device_id, snapshot_timestamp) DO NOTHING`,
          [
            tenantId,
            record.device_id,
            branchNodeId,
            record.timestamp,
            healthScore,
            JSON.stringify({
              status: record.status,
              latency_ms: record.latency_ms,
              cpu_usage: record.cpu_usage,
              memory_usage: record.memory_usage,
              temperature: record.temperature,
              uptime: record.uptime,
              recording_status: record.recording_status,
              connected_cameras: record.connected_cameras,
              total_cameras: record.total_cameras,
              hdd_status: record.hdd_status,
              error_message: record.error_message
            })
          ]
        );
      }

      logger.debug('Recorder health synced', { count: recorders.rows.length });
    } catch (error) {
      logger.error('Error syncing recorder health', { error });
    }
  }

  /**
   * Sync disk health from storage_health
   */
  private async syncDiskHealth(tenantId: string): Promise<void> {
    try {
      const disks = await this.pool.query(
        `SELECT 
          ma.device_id,
          sh.last_check_at as timestamp,
          sh.status,
          sh.total_capacity_gb,
          sh.used_capacity_gb,
          sh.usage_percentage,
          sh.smart_status,
          sh.temperature_celsius,
          sh.bad_sectors,
          sh.reallocated_sectors,
          sh.pending_sectors,
          sh.uncorrectable_sectors,
          sh.read_speed_mbs,
          sh.write_speed_mbs,
          sh.error_count
        FROM storage_health sh
        JOIN maintenance_assets ma ON ma.id = sh.asset_id
        WHERE ma.tenant_id = $1
          AND sh.last_check_at >= NOW() - INTERVAL '1 hour'
        ORDER BY ma.device_id, sh.last_check_at DESC`,
        [tenantId]
      );

      for (const record of disks.rows) {
        const healthScore = this.calculateDiskHealthScore(record);

        const existing = await this.pool.query(
          `SELECT id FROM device_health_snapshots
          WHERE tenant_id = $1 
            AND device_id = $2
            AND snapshot_timestamp = $3`,
          [tenantId, record.device_id, record.timestamp]
        );

        if (existing.rows.length > 0) continue;

        await this.pool.query(
          `INSERT INTO device_health_snapshots (
            tenant_id,
            device_id,
            device_type,
            snapshot_timestamp,
            health_score,
            metrics
          ) VALUES ($1, $2, 'disk', $3, $4, $5)
          ON CONFLICT (tenant_id, device_id, snapshot_timestamp) DO NOTHING`,
          [
            tenantId,
            record.device_id,
            record.timestamp,
            healthScore,
            JSON.stringify({
              status: record.status,
              capacity_gb: record.total_capacity_gb,
              used_gb: record.used_capacity_gb,
              usage_percentage: record.usage_percentage,
              smart_status: record.smart_status,
              temperature: record.temperature_celsius,
              bad_sectors: record.bad_sectors,
              reallocated_sectors: record.reallocated_sectors,
              pending_sectors: record.pending_sectors,
              uncorrectable_sectors: record.uncorrectable_sectors,
              read_speed: record.read_speed_mbs,
              write_speed: record.write_speed_mbs,
              error_count: record.error_count
            })
          ]
        );
      }

      logger.debug('Disk health synced', { count: disks.rows.length });
    } catch (error) {
      logger.error('Error syncing disk health', { error });
    }
  }


  /**
   * Sync network health
   */
  private async syncNetworkHealth(tenantId: string): Promise<void> {
    try {
      const network = await this.pool.query(
        `SELECT 
          branch_node_id,
          last_check_at as timestamp,
          latency_ms,
          packet_loss_percentage,
          jitter_ms,
          bandwidth_available_mbps,
          status
        FROM network_health
        WHERE tenant_id = $1
          AND last_check_at >= NOW() - INTERVAL '1 hour'
        ORDER BY branch_node_id, last_check_at DESC`,
        [tenantId]
      );

      for (const record of network.rows) {
        const healthScore = this.calculateNetworkHealthScore(record);

        const deviceId = `network-${record.branch_node_id}`;

        const existing = await this.pool.query(
          `SELECT id FROM device_health_snapshots
          WHERE tenant_id = $1 
            AND device_id = $2
            AND snapshot_timestamp = $3`,
          [tenantId, deviceId, record.timestamp]
        );

        if (existing.rows.length > 0) continue;

        await this.pool.query(
          `INSERT INTO device_health_snapshots (
            tenant_id,
            device_id,
            device_type,
            branch_node_id,
            snapshot_timestamp,
            health_score,
            metrics
          ) VALUES ($1, $2, 'network', $3, $4, $5, $6)
          ON CONFLICT (tenant_id, device_id, snapshot_timestamp) DO NOTHING`,
          [
            tenantId,
            deviceId,
            record.branch_node_id,
            record.timestamp,
            healthScore,
            JSON.stringify({
              latency_ms: record.latency_ms,
              packet_loss: record.packet_loss_percentage,
              jitter_ms: record.jitter_ms,
              bandwidth_mbps: record.bandwidth_available_mbps,
              status: record.status
            })
          ]
        );
      }

      logger.debug('Network health synced', { count: network.rows.length });
    } catch (error) {
      logger.error('Error syncing network health', { error });
    }
  }

  /**
   * Sync camera health from camera_health_history
   */
  private async syncCameraHealth(tenantId: string): Promise<void> {
    try {
      const cameras = await this.pool.query(
        `SELECT 
          camera_id,
          timestamp,
          status,
          response_time_ms,
          current_fps,
          current_bitrate,
          packet_loss,
          latency_ms,
          stream_active,
          video_loss,
          image_frozen,
          black_screen
        FROM camera_health_history
        WHERE timestamp >= NOW() - INTERVAL '1 hour'
        ORDER BY camera_id, timestamp DESC`
      );

      for (const record of cameras.rows) {
        const healthScore = this.calculateCameraHealthScore(record);

        const existing = await this.pool.query(
          `SELECT id FROM device_health_snapshots
          WHERE tenant_id = $1 
            AND device_id = $2
            AND snapshot_timestamp = $3`,
          [tenantId, record.camera_id, record.timestamp]
        );

        if (existing.rows.length > 0) continue;

        await this.pool.query(
          `INSERT INTO device_health_snapshots (
            tenant_id,
            device_id,
            device_type,
            snapshot_timestamp,
            health_score,
            metrics
          ) VALUES ($1, $2, 'camera', $3, $4, $5)
          ON CONFLICT (tenant_id, device_id, snapshot_timestamp) DO NOTHING`,
          [
            tenantId,
            record.camera_id,
            record.timestamp,
            healthScore,
            JSON.stringify({
              status: record.status,
              response_time_ms: record.response_time_ms,
              fps: record.current_fps,
              bitrate: record.current_bitrate,
              packet_loss: record.packet_loss,
              latency_ms: record.latency_ms,
              stream_active: record.stream_active,
              video_loss: record.video_loss,
              image_frozen: record.image_frozen,
              black_screen: record.black_screen
            })
          ]
        );
      }

      logger.debug('Camera health synced', { count: cameras.rows.length });
    } catch (error) {
      logger.error('Error syncing camera health', { error });
    }
  }

  /**
   * Sync UPS health
   */
  private async syncUpsHealth(tenantId: string): Promise<void> {
    try {
      const ups = await this.pool.query(
        `SELECT 
          ma.device_id,
          uh.last_check_at as timestamp,
          uh.battery_health_percentage,
          uh.runtime_minutes,
          uh.load_percentage,
          uh.temperature,
          uh.charging_status,
          uh.alarm_status,
          uh.status
        FROM ups_health uh
        JOIN maintenance_assets ma ON ma.id = uh.asset_id
        WHERE ma.tenant_id = $1
          AND uh.last_check_at >= NOW() - INTERVAL '1 hour'
        ORDER BY ma.device_id, uh.last_check_at DESC`,
        [tenantId]
      );

      for (const record of ups.rows) {
        const healthScore = record.battery_health_percentage || 100;

        const existing = await this.pool.query(
          `SELECT id FROM device_health_snapshots
          WHERE tenant_id = $1 
            AND device_id = $2
            AND snapshot_timestamp = $3`,
          [tenantId, record.device_id, record.timestamp]
        );

        if (existing.rows.length > 0) continue;

        await this.pool.query(
          `INSERT INTO device_health_snapshots (
            tenant_id,
            device_id,
            device_type,
            snapshot_timestamp,
            health_score,
            metrics
          ) VALUES ($1, $2, 'ups', $3, $4, $5)
          ON CONFLICT (tenant_id, device_id, snapshot_timestamp) DO NOTHING`,
          [
            tenantId,
            record.device_id,
            record.timestamp,
            healthScore,
            JSON.stringify({
              battery_health: record.battery_health_percentage,
              runtime_minutes: record.runtime_minutes,
              load_percentage: record.load_percentage,
              temperature: record.temperature,
              charging_status: record.charging_status,
              alarm_status: record.alarm_status,
              status: record.status
            })
          ]
        );
      }

      logger.debug('UPS health synced', { count: ups.rows.length });
    } catch (error) {
      logger.error('Error syncing UPS health', { error });
    }
  }

  // Health score calculation methods
  private calculateRecorderHealthScore(record: any): number {
    let score = 100;

    if (record.status === 'offline') score -= 50;
    else if (record.status === 'degraded') score -= 25;

    if (record.cpu_usage > 90) score -= 15;
    else if (record.cpu_usage > 75) score -= 8;

    if (record.memory_usage > 90) score -= 15;
    else if (record.memory_usage > 75) score -= 8;

    if (record.temperature > 75) score -= 20;
    else if (record.temperature > 65) score -= 10;

    if (record.recording_status !== 'recording') score -= 30;

    return Math.max(0, Math.min(100, score));
  }

  private calculateDiskHealthScore(record: any): number {
    let score = 100;

    if (record.status === 'critical') score -= 50;
    else if (record.status === 'warning') score -= 25;

    if (record.smart_status === 'FAIL') score -= 40;

    if (record.reallocated_sectors > 10) score -= 30;
    else if (record.reallocated_sectors > 0) score -= 15;

    if (record.pending_sectors > 0) score -= 20;
    if (record.uncorrectable_sectors > 0) score -= 25;

    if (record.temperature_celsius > 60) score -= 20;
    else if (record.temperature_celsius > 50) score -= 10;

    if (record.usage_percentage > 95) score -= 15;
    else if (record.usage_percentage > 85) score -= 8;

    return Math.max(0, Math.min(100, score));
  }

  private calculateNetworkHealthScore(record: any): number {
    let score = 100;

    if (record.status === 'critical') score -= 50;
    else if (record.status === 'warning') score -= 25;

    if (record.packet_loss_percentage > 10) score -= 30;
    else if (record.packet_loss_percentage > 5) score -= 15;

    if (record.latency_ms > 200) score -= 20;
    else if (record.latency_ms > 100) score -= 10;

    if (record.jitter_ms > 50) score -= 15;

    return Math.max(0, Math.min(100, score));
  }

  private calculateCameraHealthScore(record: any): number {
    let score = 100;

    if (record.status === 'offline') score -= 50;
    else if (record.status === 'degraded') score -= 25;

    if (!record.stream_active) score -= 30;
    if (record.video_loss) score -= 25;
    if (record.image_frozen) score -= 20;
    if (record.black_screen) score -= 20;

    if (record.packet_loss > 10) score -= 15;
    else if (record.packet_loss > 5) score -= 8;

    if (record.response_time_ms > 2000) score -= 10;

    return Math.max(0, Math.min(100, score));
  }
}

/**
 * Initialize telemetry sync job (runs every 5 minutes)
 */
export function initializeTelemetrySyncJob(pool: Pool): NodeJS.Timeout {
  const syncService = new TelemetrySyncService(pool);

  // Run immediately
  (async () => {
    try {
      const tenants = await pool.query(`SELECT id FROM tenants WHERE deleted_at IS NULL`);
      for (const tenant of tenants.rows) {
        await syncService.syncTelemetryForTenant(tenant.id);
      }
    } catch (error) {
      logger.error('Error in initial telemetry sync', { error });
    }
  })();

  // Schedule every 5 minutes
  const interval = setInterval(async () => {
    try {
      const tenants = await pool.query(`SELECT id FROM tenants WHERE deleted_at IS NULL`);
      for (const tenant of tenants.rows) {
        await syncService.syncTelemetryForTenant(tenant.id);
      }
    } catch (error) {
      logger.error('Error in scheduled telemetry sync', { error });
    }
  }, 5 * 60 * 1000);

  logger.info('Telemetry sync job initialized (runs every 5 minutes)');
  return interval;
}
