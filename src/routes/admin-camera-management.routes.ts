import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ControlPlaneStore } from "../control-plane-store.js";
import { isPgError, isConstraintViolation, isTableMissing, isColumnMissing } from "../utils/pg-error-utils.js";

function hasDbPool(store: ControlPlaneStore): store is ControlPlaneStore & { db: { connect(): Promise<any>; query(sql: string, params?: any[]): Promise<any>; } } {
  return "db" in store && store.db !== undefined;
}

async function softDeleteCamera(client: any, id: string, app: FastifyInstance) {
  const cameraResult = await client.query(
    `UPDATE cameras
     SET status = 'inactive'
     WHERE id::text = $1
     RETURNING id, resource_node_id`,
    [id]
  );

  if (cameraResult.rowCount === 0) {
    return { found: false, resourceNodeId: null as string | null };
  }

  const resourceNodeId = cameraResult.rows[0]?.resource_node_id ?? null;

  if (resourceNodeId) {
    try {
      await client.query(
        `UPDATE resource_nodes
         SET is_active = false
         WHERE id = $1 AND node_type = 'camera'`,
        [resourceNodeId]
      );
    } catch (err) {
      app.log.warn({ cameraId: id, resourceNodeId, error: err }, 'Unable to deactivate resource node during soft delete');
    }
  }

  return { found: true, resourceNodeId };
}

async function softDeleteAllCameras(client: any, app: FastifyInstance) {
  const cameraRows = await client.query(
    `SELECT id::text, resource_node_id
     FROM cameras
     WHERE status IS DISTINCT FROM 'inactive'`
  );

  const resourceNodeIds = cameraRows.rows
    .map((row: any) => row.resource_node_id)
    .filter(Boolean);

  await client.query(
    `UPDATE cameras
     SET status = 'inactive'
     WHERE status IS DISTINCT FROM 'inactive'`
  );

  if (resourceNodeIds.length > 0) {
    try {
      await client.query(
        `UPDATE resource_nodes
         SET is_active = false
         WHERE id = ANY($1) AND node_type = 'camera'`,
        [resourceNodeIds]
      );
    } catch (err) {
      app.log.warn({ resourceNodeIds, error: err }, 'Unable to deactivate resources during bulk soft delete');
    }
  }

  return cameraRows.rowCount ?? 0;
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
      
      const deletedCameras = await softDeleteAllCameras(client, app);
      
      await client.query("COMMIT");
      
      return reply.code(200).send({
        success: true,
        deletedCameras,
        deletedNodes: deletedCameras,
        relatedDataDeleted: {},
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
    let client: Awaited<ReturnType<typeof store.db.connect>> | undefined;

    try {
      client = await store.db.connect();
      await client.query('BEGIN');

      // Ensure camera exists and get its resource node id
      const cameraRow = await client.query('SELECT id, resource_node_id FROM cameras WHERE id::text = $1', [id]);
      if (cameraRow.rowCount === 0) {
        await client.query('ROLLBACK');
        return reply.code(404).send({ error: 'camera_not_found' });
      }

      const softDeleteResult = await softDeleteCamera(client, id, app);
      if (!softDeleteResult.found) {
        await client.query('ROLLBACK');
        return reply.code(404).send({ error: 'camera_not_found' });
      }

      await client.query('COMMIT');
      return reply.code(204).send();
    } catch (error) {
      if (client) {
        await client.query('ROLLBACK').catch(() => undefined);
      }
      
      // Handle specific error types with appropriate status codes
      if (isPgError(error)) {
        // Constraint violation (e.g., foreign key, unique constraint)
        if (isConstraintViolation(error.code)) {
          app.log.error({ error, cameraId: id }, 'Camera deletion failed due to constraint violation');
          return reply.code(409).send({
            error: 'deletion_constrained',
            message: 'Cannot delete camera due to database constraints',
            constraint: error.constraint || 'unknown'
          });
        }
      }
      
      // Log full error for debugging but return sanitized message
      app.log.error({ error, cameraId: id }, 'Camera deletion failed');
      return reply.code(500).send({ 
        error: 'camera_deletion_failed', 
        message: 'An unexpected error occurred during deletion'
      });
    } finally {
      if (client) {
        client.release();
      }
    }
  });

  // New: delete camera by POST with JSON body { id }
  app.post('/v1/admin/cameras/delete', async (request, reply) => {
    if (!hasDbPool(store)) {
      return reply.code(501).send({ error: 'not_implemented', message: 'This endpoint requires PostgreSQL store support' });
    }

    const body = z.object({ id: z.string() }).safeParse(request.body);
    if (!body.success) {
      app.log.error({ body: request.body, errors: body.error }, 'Invalid camera deletion payload');
      return reply.code(400).send({ error: 'invalid_payload', message: 'Expected JSON body { id: string }' });
    }

    const id = body.data.id;
    app.log.info({ cameraId: id }, 'Camera deletion requested');
    let client: Awaited<ReturnType<typeof store.db.connect>> | undefined;

    try {
      client = await store.db.connect();
      await client.query('BEGIN');

      // Ensure camera exists and get its resource node id
      const cameraRow = await client.query('SELECT id, resource_node_id FROM cameras WHERE id::text = $1', [id]);
      app.log.debug({ cameraId: id, found: cameraRow.rowCount }, 'Camera lookup result');
      
      if (cameraRow.rowCount === 0) {
        await client.query('ROLLBACK');
        app.log.info({ cameraId: id }, 'Camera not found, returning 404');
        return reply.code(404).send({ error: 'camera_not_found' });
      }

      const softDeleteResult = await softDeleteCamera(client, id, app);
      if (!softDeleteResult.found) {
        await client.query('ROLLBACK');
        app.log.info({ cameraId: id }, 'Camera not found, returning 404');
        return reply.code(404).send({ error: 'camera_not_found' });
      }

      await client.query('COMMIT');
      app.log.info({ cameraId: id }, 'Camera soft-deleted successfully');
      return reply.code(204).send();
    } catch (error) {
      if (client) {
        await client.query('ROLLBACK').catch(() => undefined);
      }
      
      // Log the full error for debugging
      app.log.error({ error, cameraId: id, errorType: error?.constructor?.name }, 'Camera deletion error occurred');
      
      // Handle specific error types with appropriate status codes
      if (isPgError(error)) {
        app.log.debug({ errorCode: error.code, errorDetail: error.detail }, 'PostgreSQL error details');
        
        // Constraint violation (e.g., foreign key, unique constraint)
        if (isConstraintViolation(error.code)) {
          app.log.error({ error, cameraId: id, constraint: error.constraint }, 'Camera deletion failed due to constraint violation');
          return reply.code(409).send({
            error: 'deletion_constrained',
            message: 'Cannot delete camera due to database constraints',
            constraint: error.constraint || 'unknown'
          });
        }
      }
      
      // Log full error for debugging but return sanitized message
      app.log.error({ error, cameraId: id }, 'Camera deletion failed with unexpected error');
      return reply.code(500).send({ 
        error: 'camera_deletion_failed', 
        message: 'An unexpected error occurred during deletion'
      });
    } finally {
      if (client) {
        client.release();
      }
    }
  });
}

