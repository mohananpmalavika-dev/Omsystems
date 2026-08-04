import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ControlPlaneStore } from "../control-plane-store.js";

function hasDbPool(store: ControlPlaneStore): store is ControlPlaneStore & { db: { connect(): Promise<any>; query(sql: string, params?: any[]): Promise<any>; } } {
  return "db" in store && store.db !== undefined;
}

/**
 * Admin Camera Management Routes
 * 
 * Provides endpoints for bulk camera operations
 */
export async function adminCameraManagementRoutes(app: FastifyInstance, store: ControlPlaneStore) {
  
  // Delete all cameras
  app.delete("/v1/admin/cameras/all", async (request, reply) => {
    if (!hasDbPool(store)) {
      return reply.code(501).send({ error: "not_implemented", message: "This endpoint requires PostgreSQL store support" });
    }

    const { confirmDelete } = z.object({
      confirmDelete: z.literal("DELETE_ALL_CAMERAS"),
    }).parse(request.body);
    
    const client = await store.db.connect();
    
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
    if (!hasDbPool(store)) {
      return reply.code(501).send({ error: "not_implemented", message: "This endpoint requires PostgreSQL store support" });
    }

    const result = await store.db.query(`
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
    if (!hasDbPool(store)) {
      return reply.code(501).send({ error: "not_implemented", message: "This endpoint requires PostgreSQL store support" });
    }

    const result = await store.db.query(`
      SELECT 
        c.id::text,
        rn.name,
        c.branch_node_id::text,
        c.status,
        c.vendor,
        c.model,
        b.name as branch_name
      FROM cameras c
      JOIN resource_nodes rn ON c.resource_node_id = rn.id
      LEFT JOIN resource_nodes b ON c.branch_node_id = b.id
      ORDER BY rn.name
      LIMIT 100
    `);
    
    return reply.send({ cameras: result.rows });
  });

  // Delete a single camera by id (admin)
  app.delete('/v1/admin/cameras/:id', async (request, reply) => {
    if (!hasDbPool(store)) {
      return reply.code(501).send({ error: 'not_implemented', message: 'This endpoint requires PostgreSQL store support' });
    }

    const { id } = request.params as { id: string };
    const client = await store.db.connect();

    try {
      await client.query('BEGIN');

      // Ensure camera exists and get its resource node id
      const cameraRow = await client.query('SELECT id, resource_node_id FROM cameras WHERE id::text = $1', [id]);
      if (cameraRow.rowCount === 0) {
        await client.query('ROLLBACK');
        return reply.code(404).send({ error: 'camera_not_found' });
      }
      const resourceNodeId = cameraRow.rows[0].resource_node_id;

      // Delete dependent records referencing this camera
      const dependentTables = [
        'analytics_alerts', 'analytics_events', 'incident_cameras', 'incident_video_ranges',
        'incident_clips', 'incident_snapshots', 'live_bookmarks', 'live_sessions', 'recording_segments',
        'recording_jobs', 'recording_legal_holds', 'camera_health_history', 'camera_quality_metrics',
        'camera_quality_alerts', 'camera_downtime_log', 'camera_access_group_members', 'camera_specific_grants',
        'camera_specifications', 'camera_installation_compliance', 'discovered_cameras'
      ];

      for (const table of dependentTables) {
        try {
          await client.query(`DELETE FROM ${table} WHERE camera_id = $1`, [id]);
        } catch (err) {
          // Non-fatal if table missing
          if (!String(err).includes('does not exist')) throw err;
        }
      }

      // Delete camera
      await client.query('DELETE FROM cameras WHERE id::text = $1', [id]);

      // Remove resource node if present
      if (resourceNodeId) {
        try {
          await client.query("DELETE FROM resource_nodes WHERE id = $1 AND type = 'camera'", [resourceNodeId]);
        } catch (err) {
          // ignore
        }
      }

      await client.query('COMMIT');
      return reply.code(204).send();
    } catch (error) {
      await client.query('ROLLBACK');
      app.log.error(error);
      return reply.code(500).send({ error: 'camera_deletion_failed', message: error instanceof Error ? error.message : String(error) });
    } finally {
      client.release();
    }
  });

  // New: delete camera by POST with JSON body { id }
  app.post('/v1/admin/cameras/delete', async (request, reply) => {
    if (!hasDbPool(store)) {
      return reply.code(501).send({ error: 'not_implemented', message: 'This endpoint requires PostgreSQL store support' });
    }

    const body = z.object({ id: z.string() }).safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'invalid_payload', message: 'Expected JSON body { id: string }' });
    }

    const id = body.data.id;
    const client = await store.db.connect();

    try {
      await client.query('BEGIN');

      // Ensure camera exists and get its resource node id
      const cameraRow = await client.query('SELECT id, resource_node_id FROM cameras WHERE id::text = $1', [id]);
      if (cameraRow.rowCount === 0) {
        await client.query('ROLLBACK');
        return reply.code(404).send({ error: 'camera_not_found' });
      }
      const resourceNodeId = cameraRow.rows[0].resource_node_id;

      // Delete dependent records referencing this camera
      const dependentTables = [
        'analytics_alerts', 'analytics_events', 'incident_cameras', 'incident_video_ranges',
        'incident_clips', 'incident_snapshots', 'live_bookmarks', 'live_sessions', 'recording_segments',
        'recording_jobs', 'recording_legal_holds', 'camera_health_history', 'camera_quality_metrics',
        'camera_quality_alerts', 'camera_downtime_log', 'camera_access_group_members', 'camera_specific_grants',
        'camera_specifications', 'camera_installation_compliance', 'discovered_cameras'
      ];

      for (const table of dependentTables) {
        try {
          await client.query(`DELETE FROM ${table} WHERE camera_id = $1`, [id]);
        } catch (err) {
          // Non-fatal if table missing
          if (!String(err).includes('does not exist')) throw err;
        }
      }

      // Delete camera
      await client.query('DELETE FROM cameras WHERE id::text = $1', [id]);

      // Remove resource node if present
      if (resourceNodeId) {
        try {
          await client.query("DELETE FROM resource_nodes WHERE id = $1 AND type = 'camera'", [resourceNodeId]);
        } catch (err) {
          // ignore
        }
      }

      await client.query('COMMIT');
      return reply.code(204).send();
    } catch (error) {
      await client.query('ROLLBACK');
      app.log.error(error);
      return reply.code(500).send({ error: 'camera_deletion_failed', message: error instanceof Error ? error.message : String(error) });
    } finally {
      client.release();
    }
  });
}

