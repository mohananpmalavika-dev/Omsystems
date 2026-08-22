/**
 * Admin Cleanup Routes
 * Temporary routes for database cleanup operations
 */

import type { FastifyInstance } from "fastify";
import type { InfrastructureRepository } from "../database/infrastructure-repository.js";

export async function registerAdminCleanupRoutes(
  app: FastifyInstance,
  store: InfrastructureRepository,
) {
  // Delete all edge agents and cameras
  app.delete("/v1/admin/cleanup/edge-and-cameras", async (request, reply) => {
    // Only super admins can perform this operation
    if (request.currentUser.role !== "super_admin") {
      return reply.code(403).send({ error: "forbidden", message: "Super admin access required" });
    }

    const pool = (store as any).pool;
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      console.log("[CLEANUP] Starting deletion of edge agents and cameras...");

      // Track counts
      const counts: Record<string, number> = {};

      // Delete edge agent related data
      console.log("[CLEANUP] Deleting edge agent health...");
      const r1 = await client.query("DELETE FROM edge_agent_health");
      counts.edge_agent_health = r1.rowCount || 0;

      console.log("[CLEANUP] Deleting edge upgrade runs...");
      const r2 = await client.query("DELETE FROM edge_upgrade_runs");
      counts.edge_upgrade_runs = r2.rowCount || 0;

      console.log("[CLEANUP] Deleting edge deployments...");
      const r3 = await client.query("DELETE FROM edge_deployments");
      counts.edge_deployments = r3.rowCount || 0;

      console.log("[CLEANUP] Deleting edge activation tokens...");
      const r4 = await client.query("DELETE FROM edge_activation_tokens");
      counts.edge_activation_tokens = r4.rowCount || 0;

      console.log("[CLEANUP] Deleting edge commands...");
      const r5 = await client.query("DELETE FROM edge_commands");
      counts.edge_commands = r5.rowCount || 0;

      console.log("[CLEANUP] Deleting edge scan jobs...");
      const r6 = await client.query("DELETE FROM edge_scan_jobs");
      counts.edge_scan_jobs = r6.rowCount || 0;

      console.log("[CLEANUP] Deleting edge managed tunnels...");
      const r7 = await client.query("DELETE FROM edge_managed_tunnels");
      counts.edge_managed_tunnels = r7.rowCount || 0;

      // Delete camera related data
      console.log("[CLEANUP] Deleting camera health history...");
      const c1 = await client.query("DELETE FROM camera_health_history").catch(() => ({ rowCount: 0 }));
      counts.camera_health_history = c1.rowCount || 0;

      console.log("[CLEANUP] Deleting camera recovery logs...");
      const c2 = await client.query("DELETE FROM camera_recovery_log").catch(() => ({ rowCount: 0 }));
      counts.camera_recovery_log = c2.rowCount || 0;

      console.log("[CLEANUP] Deleting camera quality alerts...");
      const c3 = await client.query("DELETE FROM camera_quality_alerts").catch(() => ({ rowCount: 0 }));
      counts.camera_quality_alerts = c3.rowCount || 0;

      console.log("[CLEANUP] Deleting camera health checks...");
      const c4 = await client.query("DELETE FROM camera_health_checks").catch(() => ({ rowCount: 0 }));
      counts.camera_health_checks = c4.rowCount || 0;

      console.log("[CLEANUP] Deleting camera quality checks...");
      const c5 = await client.query("DELETE FROM camera_quality_checks").catch(() => ({ rowCount: 0 }));
      counts.camera_quality_checks = c5.rowCount || 0;

      console.log("[CLEANUP] Deleting camera recording status...");
      const c6 = await client.query("DELETE FROM camera_recording_status").catch(() => ({ rowCount: 0 }));
      counts.camera_recording_status = c6.rowCount || 0;

      console.log("[CLEANUP] Deleting camera specifications...");
      const c7 = await client.query("DELETE FROM camera_specifications").catch(() => ({ rowCount: 0 }));
      counts.camera_specifications = c7.rowCount || 0;

      console.log("[CLEANUP] Deleting camera installation compliance...");
      const c8 = await client.query("DELETE FROM camera_installation_compliance").catch(() => ({ rowCount: 0 }));
      counts.camera_installation_compliance = c8.rowCount || 0;

      console.log("[CLEANUP] Deleting camera privacy controls...");
      const c9 = await client.query("DELETE FROM camera_privacy_controls").catch(() => ({ rowCount: 0 }));
      counts.camera_privacy_controls = c9.rowCount || 0;

      console.log("[CLEANUP] Deleting camera privacy assignments...");
      const c10 = await client.query("DELETE FROM camera_privacy_purpose_assignments").catch(() => ({ rowCount: 0 }));
      counts.camera_privacy_purpose_assignments = c10.rowCount || 0;

      console.log("[CLEANUP] Deleting camera access group members...");
      const c11 = await client.query("DELETE FROM camera_access_group_members").catch(() => ({ rowCount: 0 }));
      counts.camera_access_group_members = c11.rowCount || 0;

      console.log("[CLEANUP] Deleting camera access requests...");
      const c12 = await client.query("DELETE FROM camera_access_requests").catch(() => ({ rowCount: 0 }));
      counts.camera_access_requests = c12.rowCount || 0;

      console.log("[CLEANUP] Deleting camera specific grants...");
      const c13 = await client.query("DELETE FROM camera_specific_grants").catch(() => ({ rowCount: 0 }));
      counts.camera_specific_grants = c13.rowCount || 0;

      console.log("[CLEANUP] Deleting discovered devices...");
      const c14 = await client.query("DELETE FROM discovered_devices").catch(() => ({ rowCount: 0 }));
      counts.discovered_devices = c14.rowCount || 0;

      // Delete main tables
      console.log("[CLEANUP] Deleting all cameras...");
      const deletedCameras = await client.query("DELETE FROM cameras");
      counts.cameras = deletedCameras.rowCount || 0;

      console.log("[CLEANUP] Deleting all edge agents...");
      const deletedEdgeAgents = await client.query("DELETE FROM edge_agents");
      counts.edge_agents = deletedEdgeAgents.rowCount || 0;

      await client.query("COMMIT");

      console.log("[CLEANUP] Deletion complete!");

      return {
        success: true,
        message: "All edge agents and cameras have been deleted",
        deletedCounts: counts,
      };
    } catch (error: any) {
      await client.query("ROLLBACK");
      console.error("[CLEANUP] Error during deletion:", error);
      return reply.code(500).send({
        error: "cleanup_failed",
        message: error.message,
      });
    } finally {
      client.release();
    }
  });

  // Get counts preview
  app.get("/v1/admin/cleanup/edge-and-cameras/preview", async (request, reply) => {
    if (request.currentUser.role !== "super_admin") {
      return reply.code(403).send({ error: "forbidden" });
    }

    const pool = (store as any).pool;

    try {
      const edgeCount = await pool.query("SELECT COUNT(*) FROM edge_agents");
      const cameraCount = await pool.query("SELECT COUNT(*) FROM cameras");

      return {
        edge_agents: parseInt(edgeCount.rows[0].count),
        cameras: parseInt(cameraCount.rows[0].count),
      };
    } catch (error: any) {
      return reply.code(500).send({ error: error.message });
    }
  });
}
