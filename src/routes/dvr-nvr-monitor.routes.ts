import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { DVRNVRMonitorService } from "../services/dvr-nvr-monitor.service.js";
import type { Pool } from "pg";

export async function registerDVRNVRMonitorRoutes(
  app: FastifyInstance,
  monitorService: DVRNVRMonitorService,
  pool: Pool
) {
  // Get monitoring statistics
  app.get("/v1/dvr-nvr/monitor/stats", async (request, reply) => {
    const stats = monitorService.getStatistics();
    return { success: true, data: stats };
  });

  // Get all monitored devices
  app.get("/v1/dvr-nvr/monitor/devices", async (request, reply) => {
    const devices = monitorService.getAllDevices();
    return {
      success: true,
      data: devices.map((d) => ({
        id: d.id,
        deviceType: d.deviceType,
        manufacturer: d.manufacturer,
        model: d.model,
        ipAddress: d.ipAddress,
        status: d.status,
        lastHeartbeat: d.lastHeartbeat,
        lastPolled: d.lastPolled,
        consecutiveFailures: d.consecutiveFailures,
        pollingInterval: d.pollingInterval,
        enabled: d.enabled,
      })),
    };
  });

  // Get specific device status
  app.get("/v1/dvr-nvr/monitor/devices/:id", async (request, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);

    const device = monitorService.getDevice(id);
    if (!device) {
      return reply.code(404).send({
        success: false,
        error: "Device not found",
      });
    }

    const health = monitorService.getDeviceHealth(id);

    return {
      success: true,
      data: {
        device: {
          id: device.id,
          deviceType: device.deviceType,
          manufacturer: device.manufacturer,
          model: device.model,
          ipAddress: device.ipAddress,
          port: device.port,
          protocol: device.protocol,
          status: device.status,
          lastHeartbeat: device.lastHeartbeat,
          lastPolled: device.lastPolled,
          consecutiveFailures: device.consecutiveFailures,
          pollingInterval: device.pollingInterval,
          enabled: device.enabled,
        },
        health,
      },
    };
  });

  // Get device health history
  app.get("/v1/dvr-nvr/monitor/devices/:id/history", async (request, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const { hours = 24 } = z.object({ hours: z.coerce.number().default(24) }).parse(request.query);

    try {
      const result = await pool.query(
        `SELECT 
          timestamp,
          status,
          latency_ms as "latencyMs",
          cpu_usage as "cpuUsage",
          memory_usage as "memoryUsage",
          hdd_status as "hddStatus",
          recording_status as "recordingStatus",
          connected_cameras as "connectedCameras",
          total_cameras as "totalCameras",
          firmware_version as "firmwareVersion",
          uptime,
          temperature,
          error_message as "errorMessage"
        FROM dvr_nvr_health
        WHERE device_id = $1
        AND timestamp >= NOW() - INTERVAL '${hours} hours'
        ORDER BY timestamp DESC
        LIMIT 1000`,
        [id]
      );

      return {
        success: true,
        data: result.rows,
      };
    } catch (error) {
      return reply.code(500).send({
        success: false,
        error: "Failed to fetch health history",
      });
    }
  });

  // Get device uptime statistics
  app.get("/v1/dvr-nvr/monitor/devices/:id/uptime", async (request, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const { days = 7 } = z.object({ days: z.coerce.number().default(7) }).parse(request.query);

    try {
      const result = await pool.query(
        `SELECT 
          COUNT(*) as total_checks,
          SUM(CASE WHEN status = 'online' THEN 1 ELSE 0 END) as online_checks,
          SUM(CASE WHEN status = 'offline' THEN 1 ELSE 0 END) as offline_checks,
          SUM(CASE WHEN status = 'degraded' THEN 1 ELSE 0 END) as degraded_checks,
          ROUND(
            (SUM(CASE WHEN status = 'online' THEN 1 ELSE 0 END)::DECIMAL / COUNT(*)::DECIMAL * 100),
            2
          ) as uptime_percentage,
          AVG(latency_ms) as avg_latency_ms,
          MIN(timestamp) as period_start,
          MAX(timestamp) as period_end
        FROM dvr_nvr_health
        WHERE device_id = $1
        AND timestamp >= NOW() - INTERVAL '${days} days'`,
        [id]
      );

      return {
        success: true,
        data: result.rows[0],
      };
    } catch (error) {
      return reply.code(500).send({
        success: false,
        error: "Failed to fetch uptime statistics",
      });
    }
  });

  // Update device monitoring configuration
  app.patch("/v1/dvr-nvr/monitor/devices/:id/config", async (request, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const updateSchema = z.object({
      pollingInterval: z.number().min(10).max(3600).optional(),
      timeoutMs: z.number().min(1000).max(60000).optional(),
      enabled: z.boolean().optional(),
    });

    const updates = updateSchema.parse(request.body);

    try {
      await monitorService.updateDevice(id, updates);

      return {
        success: true,
        message: "Device configuration updated",
      };
    } catch (error) {
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : "Failed to update device",
      });
    }
  });

  // Get branch-level statistics
  app.get("/v1/dvr-nvr/monitor/branches/:branchId/stats", async (request, reply) => {
    const { branchId } = z.object({ branchId: z.string().min(1) }).parse(request.params);

    try {
      const result = await pool.query(
        `SELECT 
          di.device_type as "deviceType",
          di.manufacturer,
          COUNT(*) as total_devices,
          SUM(CASE WHEN di.health_status = 'online' THEN 1 ELSE 0 END) as online_devices,
          SUM(CASE WHEN di.health_status = 'offline' THEN 1 ELSE 0 END) as offline_devices,
          SUM(CASE WHEN di.health_status = 'degraded' THEN 1 ELSE 0 END) as degraded_devices
        FROM device_inventory di
        WHERE di.branch = $1
        AND di.device_type IN ('dvr', 'nvr')
        AND di.lifecycle_state = 'operational'
        GROUP BY di.device_type, di.manufacturer`,
        [branchId]
      );

      return {
        success: true,
        data: result.rows,
      };
    } catch (error) {
      return reply.code(500).send({
        success: false,
        error: "Failed to fetch branch statistics",
      });
    }
  });

  // Get tenant-level statistics
  app.get("/v1/dvr-nvr/monitor/tenants/:tenantId/stats", async (request, reply) => {
    const { tenantId } = z.object({ tenantId: z.string().min(1) }).parse(request.params);

    try {
      const result = await pool.query(
        `SELECT 
          di.device_type as "deviceType",
          COUNT(DISTINCT di.branch) as total_branches,
          COUNT(*) as total_devices,
          SUM(CASE WHEN di.health_status = 'online' THEN 1 ELSE 0 END) as online_devices,
          SUM(CASE WHEN di.health_status = 'offline' THEN 1 ELSE 0 END) as offline_devices,
          SUM(CASE WHEN di.health_status = 'degraded' THEN 1 ELSE 0 END) as degraded_devices,
          ROUND(
            (SUM(CASE WHEN di.health_status = 'online' THEN 1 ELSE 0 END)::DECIMAL / COUNT(*)::DECIMAL * 100),
            2
          ) as uptime_percentage
        FROM device_inventory di
        WHERE di.tenant = $1
        AND di.device_type IN ('dvr', 'nvr')
        AND di.lifecycle_state = 'operational'
        GROUP BY di.device_type`,
        [tenantId]
      );

      return {
        success: true,
        data: result.rows,
      };
    } catch (error) {
      return reply.code(500).send({
        success: false,
        error: "Failed to fetch tenant statistics",
      });
    }
  });

  // Trigger manual health check for a device
  app.post("/v1/dvr-nvr/monitor/devices/:id/check", async (request, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);

    const device = monitorService.getDevice(id);
    if (!device) {
      return reply.code(404).send({
        success: false,
        error: "Device not found",
      });
    }

    // Manual check will be performed on next poll cycle
    // You could also implement immediate check here
    return {
      success: true,
      message: "Health check queued",
      device: {
        id: device.id,
        status: device.status,
        lastPolled: device.lastPolled,
      },
    };
  });
}
