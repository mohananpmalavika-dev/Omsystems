import type { FastifyInstance } from "fastify";
import { z } from "zod";

/**
 * Admin Camera Management Routes
 * 
 * Provides endpoints for bulk camera operations
 */
export async function adminCameraManagementRoutes(app: FastifyInstance) {
  
  // Delete all cameras
  app.delete("/v1/admin/cameras/all", async (request, reply) => {
    const { confirmDelete } = z.object({
      confirmDelete: z.literal("DELETE_ALL_CAMERAS"),
    }).parse(request.body);
    
    const client = await app.pg.connect();
    
    try {
      await client.query("BEGIN");
      
      // Delete related data first
      const tables = [
        "analytics_alerts",
        "analytics_events", 
        "analytics_rules",
        "incident_cameras",
        "incident_video_ranges",
        "incident_clips",
        "incident_snapshots",
        "live_bookmarks",
        "live_sessions",
        "recording_segments",
        "recording_jobs",
        "recording_legal_holds",
        "camera_health_history",
        "camera_quality_metrics",
        "camera_quality_alerts",
        "camera_downtime_log",
        "camera_access_group_members",
        "camera_specific_grants",
        "camera_specifications",
        "camera_installation_compliance",
      ];
      
      const deleteCounts: Record<string, number> = {};
      
      for (const table of tables) {
        try {
          const result = await client.query(
            `DELETE FROM ${table} WHERE camera_id IN (SELECT id FROM cameras)`
          );
          deleteCounts[table] = result.rowCount ?? 0;
        } catch (error) {
          // Table might not exist, continue
          if (!String(error).includes("does not exist")) {
            throw error;
          }
        }
      }
      
      // Get resource node IDs
      const nodes = await client.query(
        "SELECT resource_node_id FROM cameras"
      );
      const nodeIds = nodes.rows.map((r: any) => r.resource_node_id);
      
      // Delete cameras
      const cameraResult = await client.query("DELETE FROM cameras");
      const deletedCameras = cameraResult.rowCount ?? 0;
      
      // Delete resource nodes
      let deletedNodes = 0;
      if (nodeIds.length > 0) {
        const nodeResult = await client.query(
          "DELETE FROM resource_nodes WHERE id = ANY($1) AND type = 'camera'",
          [nodeIds]
        );
        deletedNodes = nodeResult.rowCount ?? 0;
      }
      
      await client.query("COMMIT");
      
      return reply.code(200).send({
        success: true,
        deletedCameras,
        deletedNodes,
        relatedDataDeleted: deleteCounts,
      });
      
    } catch (error) {
      await client.query("ROLLBACK");
      app.log.error(error);
      return reply.code(500).send({
        error: "camera_deletion_failed",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      client.release();
    }
  });
  
  // Get camera count (for preview)
  app.get("/v1/admin/cameras/count", async (request, reply) => {
    const result = await app.pg.query(`
      SELECT 
        COUNT(*) as total_cameras,
        (SELECT COUNT(*) FROM analytics_alerts WHERE camera_id IN (SELECT id FROM cameras)) as alerts,
        (SELECT COUNT(*) FROM recording_segments WHERE camera_id IN (SELECT id FROM cameras)) as segments,
        (SELECT COUNT(*) FROM incident_cameras WHERE camera_id IN (SELECT id FROM cameras)) as incidents
      FROM cameras
    `);
    
    return reply.send(result.rows[0]);
  });
  
  // List all cameras
  app.get("/v1/admin/cameras/list", async (request, reply) => {
    const result = await app.pg.query(`
      SELECT 
        c.id,
        c.name,
        c.branch_node_id,
        c.status,
        c.vendor,
        c.model,
        b.name as branch_name
      FROM cameras c
      LEFT JOIN resource_nodes b ON c.branch_node_id = b.id
      ORDER BY c.name
      LIMIT 100
    `);
    
    return reply.send({ cameras: result.rows });
  });
}
