/**
 * Dashboard API Routes
 * Endpoints for executive dashboard with real-time operational metrics
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { ControlPlaneStore } from "../control-plane-store.js";

interface DashboardSummary {
  systemStatus: string;
  systemHealthScore: number;
  criticalAlerts: number;
  activeIncidents: number;
  lastUpdated: string;
}

interface CameraMetrics {
  totalRegistered: number;
  operational: number;
  online: number;
  offline: number;
  degraded: number;
  underMaintenance: number;
  availabilityPercentage: number;
}

interface RecordingMetrics {
  recordingNormally: number;
  recordingWithGaps: number;
  recordingStopped: number;
  verificationPending: number;
  availabilityPercentage: number;
}

interface StorageMetrics {
  totalCapacityBytes: bigint;
  usedCapacityBytes: bigint;
  availableCapacityBytes: bigint;
  utilizationPercentage: number;
  forecastFullDays: number;
  criticalNodes: number;
}

interface AlertMetrics {
  totalActive: number;
  unacknowledged: number;
  critical: number;
  escalated: number;
  slaBreached: number;
}

export async function registerDashboardRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore
): Promise<void> {
  /**
   * GET /v1/dashboard/summary
   * Get dashboard header summary with system status
   */
  app.get("/v1/dashboard/summary", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = request.currentUser?.tenantId;
      if (!tenantId) {
        return reply.code(401).send({ error: "unauthorized" });
      }

      // Get overall system health
      const branches = await store.listBranches(request.currentUser);
      const cameras = await Promise.all(
        branches.map(async (branch) => {
          return await store.listCameras({ ...request.currentUser, nodeId: branch.nodeId });
        })
      );
      const allCameras = cameras.flat();

      // Calculate health score (simplified - can be enhanced)
      const onlineCameras = allCameras.filter(c => c.status === "online").length;
      const systemHealthScore = allCameras.length > 0 
        ? (onlineCameras / allCameras.length) * 100 
        : 100;

      // Get active incidents count (simplified)
      const incidents = await store.listIncidents(request.currentUser, { limit: 1000, offset: 0 });
      const activeIncidents = incidents.data.filter(i => 
        i.status !== "resolved" && i.status !== "closed"
      ).length;

      const summary: DashboardSummary = {
        systemStatus: systemHealthScore >= 95 ? "operational" : systemHealthScore >= 80 ? "degraded" : "critical",
        systemHealthScore,
        criticalAlerts: 0, // Will be populated by alert system
        activeIncidents,
        lastUpdated: new Date().toISOString(),
      };

      return reply.send({
        success: true,
        data: summary,
      });
    } catch (error) {
      app.log.error({ error }, "Error fetching dashboard summary");
      return reply.code(500).send({
        success: false,
        error: "Failed to fetch dashboard summary",
      });
    }
  });

  /**
   * GET /v1/dashboard/camera-health
   * Get camera health metrics
   */
  app.get("/v1/dashboard/camera-health", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = request.currentUser?.tenantId;
      if (!tenantId) {
        return reply.code(401).send({ error: "unauthorized" });
      }

      const branches = await store.listBranches(request.currentUser);
      const cameras = await Promise.all(
        branches.map(async (branch) => {
          return await store.listCameras({ ...request.currentUser, nodeId: branch.nodeId });
        })
      );
      const allCameras = cameras.flat();

      const online = allCameras.filter(c => c.status === "online").length;
      const offline = allCameras.filter(c => c.status === "offline").length;
      const degraded = allCameras.filter(c => c.status === "degraded").length;
      const operational = online + degraded;

      const metrics: CameraMetrics = {
        totalRegistered: allCameras.length,
        operational,
        online,
        offline,
        degraded,
        underMaintenance: 0, // Will be enhanced with maintenance status
        availabilityPercentage: allCameras.length > 0 ? (online / allCameras.length) * 100 : 100,
      };

      return reply.send({
        success: true,
        data: metrics,
      });
    } catch (error) {
      app.log.error({ error }, "Error fetching camera health");
      return reply.code(500).send({
        success: false,
        error: "Failed to fetch camera health metrics",
      });
    }
  });

  /**
   * GET /v1/dashboard/recording-status
   * Get recording status metrics
   */
  app.get("/v1/dashboard/recording-status", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = request.currentUser?.tenantId;
      if (!tenantId) {
        return reply.code(401).send({ error: "unauthorized" });
      }

      const branches = await store.listBranches(request.currentUser);
      const cameras = await Promise.all(
        branches.map(async (branch) => {
          return await store.listCameras({ ...request.currentUser, nodeId: branch.nodeId });
        })
      );
      const allCameras = cameras.flat();

      // Get recording jobs
      const recordingJobs = await Promise.all(
        allCameras.map(async (camera) => {
          try {
            return await store.getRecordingJob(request.currentUser, camera.nodeId);
          } catch {
            return null;
          }
        })
      );

      const validJobs = recordingJobs.filter(job => job !== null);
      const recordingNormally = validJobs.filter(job => job?.enabled).length;
      const recordingStopped = validJobs.filter(job => !job?.enabled).length;

      const metrics: RecordingMetrics = {
        recordingNormally,
        recordingWithGaps: 0, // Will be enhanced with retention verification
        recordingStopped,
        verificationPending: 0,
        availabilityPercentage: validJobs.length > 0 ? (recordingNormally / validJobs.length) * 100 : 0,
      };

      return reply.send({
        success: true,
        data: metrics,
      });
    } catch (error) {
      app.log.error({ error }, "Error fetching recording status");
      return reply.code(500).send({
        success: false,
        error: "Failed to fetch recording status",
      });
    }
  });

  /**
   * GET /v1/dashboard/storage
   * Get storage capacity metrics
   */
  app.get("/v1/dashboard/storage", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = request.currentUser?.tenantId;
      if (!tenantId) {
        return reply.code(401).send({ error: "unauthorized" });
      }

      // Simplified storage metrics - will be enhanced with actual storage telemetry
      const totalCapacityBytes = BigInt(100 * 1024 * 1024 * 1024 * 1024); // 100 TB
      const usedCapacityBytes = BigInt(45 * 1024 * 1024 * 1024 * 1024); // 45 TB
      const availableCapacityBytes = totalCapacityBytes - usedCapacityBytes;
      const utilizationPercentage = Number((usedCapacityBytes * BigInt(100)) / totalCapacityBytes);

      // Calculate forecast (simplified)
      const dailyGrowthRate = 0.5; // 0.5% per day
      const remainingCapacity = Number(availableCapacityBytes) / Number(totalCapacityBytes);
      const forecastFullDays = Math.floor((remainingCapacity * 100) / dailyGrowthRate);

      const metrics: StorageMetrics = {
        totalCapacityBytes,
        usedCapacityBytes,
        availableCapacityBytes,
        utilizationPercentage,
        forecastFullDays,
        criticalNodes: utilizationPercentage > 90 ? 1 : 0,
      };

      // Convert BigInt to string for JSON serialization
      const serializedMetrics = {
        ...metrics,
        totalCapacityBytes: metrics.totalCapacityBytes.toString(),
        usedCapacityBytes: metrics.usedCapacityBytes.toString(),
        availableCapacityBytes: metrics.availableCapacityBytes.toString(),
      };

      return reply.send({
        success: true,
        data: serializedMetrics,
      });
    } catch (error) {
      app.log.error({ error }, "Error fetching storage metrics");
      return reply.code(500).send({
        success: false,
        error: "Failed to fetch storage metrics",
      });
    }
  });

  /**
   * GET /v1/dashboard/alerts
   * Get active alerts metrics
   */
  app.get("/v1/dashboard/alerts", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = request.currentUser?.tenantId;
      if (!tenantId) {
        return reply.code(401).send({ error: "unauthorized" });
      }

      // Simplified alert metrics - will be enhanced with actual alert system
      const metrics: AlertMetrics = {
        totalActive: 0,
        unacknowledged: 0,
        critical: 0,
        escalated: 0,
        slaBreached: 0,
      };

      return reply.send({
        success: true,
        data: metrics,
      });
    } catch (error) {
      app.log.error({ error }, "Error fetching alert metrics");
      return reply.code(500).send({
        success: false,
        error: "Failed to fetch alert metrics",
      });
    }
  });

  /**
   * GET /v1/dashboard/incidents
   * Get recent incidents
   */
  app.get("/v1/dashboard/incidents", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = request.currentUser?.tenantId;
      if (!tenantId) {
        return reply.code(401).send({ error: "unauthorized" });
      }

      const limitQuery = z.object({
        limit: z.coerce.number().int().min(1).max(100).default(10),
      });

      const { limit } = limitQuery.parse(request.query);

      const incidents = await store.listIncidents(request.currentUser, { limit, offset: 0 });

      return reply.send({
        success: true,
        data: incidents.data || [],
      });
    } catch (error) {
      app.log.error({ error }, "Error fetching recent incidents");
      return reply.code(500).send({
        success: false,
        error: "Failed to fetch recent incidents",
      });
    }
  });

  app.log.info("Dashboard routes registered");
}
