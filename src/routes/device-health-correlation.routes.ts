import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Pool } from "pg";

export interface DeviceHealthCorrelationOptions {
  pool: Pool;
}

export async function registerDeviceHealthCorrelationRoutes(
  app: FastifyInstance,
  options: DeviceHealthCorrelationOptions
) {
  const { pool } = options;

  function getUser(request: FastifyRequest) {
    const user = request.currentUser;
    if (!user?.tenantId || !user.id) throw new Error("authenticated_user_required");
    return { tenantId: user.tenantId, userId: user.id, role: user.role };
  }

  // ============================================================================
  // Device Health Snapshot API
  // ============================================================================

  // Get current device health for branches
  app.get("/v1/security/device-health", async (request, reply) => {
    const { tenantId } = getUser(request);
    const query = z.object({
      branchId: z.string().uuid().optional(),
    }).parse(request.query);

    let sql = `
      WITH latest_snapshots AS (
        SELECT DISTINCT ON (branch_id)
          dhs.*
        FROM device_health_snapshots dhs
        WHERE dhs.tenant_id = $1
        ORDER BY branch_id, snapshot_time DESC
      ),
      branch_info AS (
        SELECT 
          id as branch_id,
          name as branch_name,
          code as branch_code
        FROM branches
        WHERE tenant_id = $1
      )
      SELECT 
        ls.*,
        bi.branch_name,
        bi.branch_code,
        (SELECT json_agg(json_build_object(
          'type', di.device_type,
          'severity', di.severity,
          'message', di.message,
          'deviceId', di.device_id,
          'timestamp', di.detected_at
        ))
        FROM device_critical_issues di
        WHERE di.branch_id = ls.branch_id 
          AND di.tenant_id = $1
          AND di.resolved = false
        ORDER BY di.detected_at DESC
        ) as critical_issues,
        (SELECT json_agg(json_build_object(
          'id', ce.id,
          'type', ce.event_type,
          'message', ce.message,
          'affectedDevices', ce.affected_devices,
          'timestamp', ce.detected_at,
          'resolved', ce.resolved
        ))
        FROM device_correlated_events ce
        WHERE ce.branch_id = ls.branch_id
          AND ce.tenant_id = $1
          AND ce.detected_at > NOW() - INTERVAL '7 days'
        ORDER BY ce.detected_at DESC
        ) as correlated_events
      FROM latest_snapshots ls
      LEFT JOIN branch_info bi ON ls.branch_id = bi.branch_id
    `;

    const params: any[] = [tenantId];

    if (query.branchId) {
      sql += ` WHERE ls.branch_id = $2`;
      params.push(query.branchId);
    }

    sql += ` ORDER BY ls.overall_health DESC, bi.branch_name`;

    const result = await pool.query(sql, params);

    const data = result.rows.map(row => ({
      branchId: row.branch_id,
      branchName: row.branch_name,
      branchCode: row.branch_code,
      cameras: {
        total: row.cameras_total,
        online: row.cameras_online,
        recording: row.cameras_recording,
        healthy: row.cameras_healthy,
        warning: row.cameras_warning,
        critical: row.cameras_critical,
        offline: row.cameras_offline,
        healthScore: parseFloat(row.camera_health_score || 0),
      },
      recorders: {
        total: row.recorders_total,
        online: row.recorders_online,
        healthy: row.recorders_healthy,
        degraded: row.recorders_degraded,
        full: row.recorders_full,
        offline: row.recorders_offline,
      },
      network: {
        status: row.network_status,
        latencyMs: row.network_latency_ms,
        packetLoss: parseFloat(row.network_packet_loss || 0),
        bandwidth: row.network_bandwidth_mbps,
        issues: row.network_status !== "healthy" ? ["High latency detected"] : [],
      },
      power: {
        status: row.power_status,
        upsOnline: row.ups_online,
        batteryPercent: row.ups_battery_percent,
        powerOutages24h: row.power_outages_24h,
        issues: row.ups_battery_percent < 50 ? [`UPS battery low - ${row.ups_battery_percent}%`] : [],
      },
      overallHealth: row.overall_health,
      criticalIssues: row.critical_issues || [],
      correlatedEvents: row.correlated_events || [],
    }));

    // Calculate summary
    const summary = {
      totalBranches: data.length,
      healthyBranches: data.filter(d => d.overallHealth === "healthy").length,
      warningBranches: data.filter(d => d.overallHealth === "warning").length,
      criticalBranches: data.filter(d => d.overallHealth === "critical").length,
      totalCriticalIssues: data.reduce((sum, d) => sum + d.criticalIssues.length, 0),
      totalCorrelatedEvents: data.reduce((sum, d) => sum + d.correlatedEvents.length, 0),
      avgCameraHealth: data.reduce((sum, d) => sum + d.cameras.healthScore, 0) / (data.length || 1),
      avgRecorderHealth: data.reduce((sum, d) => 
        sum + (d.recorders.total > 0 ? (d.recorders.healthy / d.recorders.total * 100) : 100), 0
      ) / (data.length || 1),
    };

    return reply.send({
      success: true,
      data,
      summary,
    });
  });

  // Capture device health snapshot (called by monitoring service)
  app.post("/v1/security/device-health/snapshot", async (request, reply) => {
    const { tenantId } = getUser(request);
    const body = z.object({
      branchId: z.string().uuid(),
      cameras: z.object({
        total: z.number().int().min(0),
        online: z.number().int().min(0),
        recording: z.number().int().min(0),
        healthy: z.number().int().min(0),
        warning: z.number().int().min(0),
        critical: z.number().int().min(0),
        offline: z.number().int().min(0),
      }),
      recorders: z.object({
        total: z.number().int().min(0),
        online: z.number().int().min(0),
        healthy: z.number().int().min(0),
        degraded: z.number().int().min(0),
        full: z.number().int().min(0),
        offline: z.number().int().min(0),
      }),
      network: z.object({
        latencyMs: z.number().int().min(0),
        packetLoss: z.number().min(0).max(100),
        bandwidthMbps: z.number().int().min(0),
      }),
      power: z.object({
        upsOnline: z.boolean(),
        batteryPercent: z.number().int().min(0).max(100),
        powerOutages24h: z.number().int().min(0),
      }),
    }).parse(request.body);

    // Calculate overall health status
    const cameraHealthScore = body.cameras.total > 0 
      ? (body.cameras.healthy / body.cameras.total * 100) 
      : 0;
    
    let overallHealth = "healthy";
    if (
      body.cameras.critical > 0 ||
      body.power.batteryPercent < 30 ||
      body.recorders.offline > 0 ||
      body.network.packetLoss > 5
    ) {
      overallHealth = "critical";
    } else if (
      body.cameras.warning > 0 ||
      body.power.batteryPercent < 50 ||
      body.recorders.degraded > 0 ||
      body.network.latencyMs > 100
    ) {
      overallHealth = "warning";
    }

    const networkStatus = 
      body.network.packetLoss > 5 ? "critical" :
      body.network.latencyMs > 100 ? "warning" : "healthy";

    const powerStatus = 
      body.power.batteryPercent < 30 || !body.power.upsOnline ? "critical" :
      body.power.batteryPercent < 50 ? "warning" : "healthy";

    const result = await pool.query(
      `INSERT INTO device_health_snapshots (
        tenant_id, branch_id, overall_health,
        cameras_total, cameras_online, cameras_recording, cameras_healthy, 
        cameras_warning, cameras_critical, cameras_offline, camera_health_score,
        recorders_total, recorders_online, recorders_healthy, recorders_degraded,
        recorders_full, recorders_offline,
        network_status, network_latency_ms, network_packet_loss, network_bandwidth_mbps,
        power_status, ups_online, ups_battery_percent, power_outages_24h
      ) VALUES (
        $1, $2, $3,
        $4, $5, $6, $7, $8, $9, $10, $11,
        $12, $13, $14, $15, $16, $17,
        $18, $19, $20, $21,
        $22, $23, $24, $25
      )
      RETURNING *`,
      [
        tenantId, body.branchId, overallHealth,
        body.cameras.total, body.cameras.online, body.cameras.recording, body.cameras.healthy,
        body.cameras.warning, body.cameras.critical, body.cameras.offline, cameraHealthScore,
        body.recorders.total, body.recorders.online, body.recorders.healthy, body.recorders.degraded,
        body.recorders.full, body.recorders.offline,
        networkStatus, body.network.latencyMs, body.network.packetLoss, body.network.bandwidthMbps,
        powerStatus, body.power.upsOnline, body.power.batteryPercent, body.power.powerOutages24h,
      ]
    );

    // Detect correlations and create events
    await detectCorrelations(pool, tenantId, body.branchId);

    return reply.code(201).send({
      success: true,
      data: result.rows[0],
    });
  });

  // ============================================================================
  // Critical Issues API
  // ============================================================================

  // Report critical issue
  app.post("/v1/security/device-health/issues", async (request, reply) => {
    const { tenantId, userId } = getUser(request);
    const body = z.object({
      branchId: z.string().uuid(),
      deviceType: z.enum(["camera", "recorder", "network", "power"]),
      deviceId: z.string().max(200).optional(),
      severity: z.enum(["critical", "high", "medium", "low"]).default("medium"),
      message: z.string(),
    }).parse(request.body);

    const result = await pool.query(
      `INSERT INTO device_critical_issues (
        tenant_id, branch_id, device_type, device_id, severity, message
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *`,
      [tenantId, body.branchId, body.deviceType, body.deviceId, body.severity, body.message]
    );

    return reply.code(201).send({
      success: true,
      data: result.rows[0],
    });
  });

  // Resolve issue
  app.patch("/v1/security/device-health/issues/:id/resolve", async (request, reply) => {
    const { tenantId, userId } = getUser(request);
    const params = z.object({ id: z.string().uuid() }).parse(request.params);

    const result = await pool.query(
      `UPDATE device_critical_issues
       SET resolved = true, resolved_at = NOW(), resolved_by = $1
       WHERE id = $2 AND tenant_id = $3
       RETURNING *`,
      [userId, params.id, tenantId]
    );

    if (result.rows.length === 0) {
      return reply.code(404).send({ error: "issue_not_found" });
    }

    return reply.send({
      success: true,
      data: result.rows[0],
    });
  });

  app.log.info("[DeviceHealthCorrelation] Routes registered");
}

// ============================================================================
// Helper Functions
// ============================================================================

async function detectCorrelations(pool: Pool, tenantId: string, branchId: string) {
  // Get latest snapshot
  const snapshot = await pool.query(
    `SELECT * FROM device_health_snapshots 
     WHERE tenant_id = $1 AND branch_id = $2 
     ORDER BY snapshot_time DESC LIMIT 1`,
    [tenantId, branchId]
  );

  if (snapshot.rows.length === 0) return;

  const data = snapshot.rows[0];

  // Power-Camera correlation
  if (data.power_status === "critical" && data.cameras_offline > 0) {
    await pool.query(
      `INSERT INTO device_correlated_events (
        tenant_id, branch_id, event_type, message, affected_devices, confidence
      ) VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT DO NOTHING`,
      [
        tenantId,
        branchId,
        "power_camera_correlation",
        `Power issue detected ${data.power_outages_24h} outage(s) correlates with ${data.cameras_offline} offline cameras`,
        JSON.stringify(["UPS", `${data.cameras_offline} cameras`]),
        0.85,
      ]
    );
  }

  // Network-Recorder correlation
  if (data.network_status !== "healthy" && data.recorders_degraded > 0) {
    await pool.query(
      `INSERT INTO device_correlated_events (
        tenant_id, branch_id, event_type, message, affected_devices, confidence
      ) VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT DO NOTHING`,
      [
        tenantId,
        branchId,
        "network_recorder_correlation",
        `Network latency ${data.network_latency_ms}ms correlates with ${data.recorders_degraded} degraded recorders`,
        JSON.stringify(["Network", `${data.recorders_degraded} recorders`]),
        0.75,
      ]
    );
  }

  // Storage-Recording correlation
  if (data.recorders_full > 0 && data.cameras_recording < data.cameras_online) {
    await pool.query(
      `INSERT INTO device_correlated_events (
        tenant_id, branch_id, event_type, message, affected_devices, confidence
      ) VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT DO NOTHING`,
      [
        tenantId,
        branchId,
        "storage_recording_correlation",
        `${data.recorders_full} full recorders prevent ${data.cameras_online - data.cameras_recording} cameras from recording`,
        JSON.stringify([`${data.recorders_full} recorders`, `${data.cameras_online - data.cameras_recording} cameras`]),
        0.90,
      ]
    );
  }
}
