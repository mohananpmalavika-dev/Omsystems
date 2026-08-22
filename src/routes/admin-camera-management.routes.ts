import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ControlPlaneStore } from "../control-plane-store.js";
import { isPgError, isConstraintViolation } from "../utils/pg-error-utils.js";

function hasDbPool(store: ControlPlaneStore): store is ControlPlaneStore & { db: { connect(): Promise<any>; query(sql: string, params?: any[]): Promise<any>; } } {
  return "db" in store && store.db !== undefined;
}

type CameraReference = {
  table_schema: string;
  table_name: string;
  column_name: string;
};

function quoteIdentifier(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

/**
 * Find every public-table foreign key that points at cameras.id. Keeping this
 * schema-driven avoids another production failure when a new camera-owned
 * table is added without also being added to a hard-coded cleanup list.
 */
async function listCameraReferences(client: any): Promise<CameraReference[]> {
  const result = await client.query(`
    SELECT
      child_namespace.nspname AS table_schema,
      child_table.relname AS table_name,
      child_column.attname AS column_name
    FROM pg_constraint constraint_info
    JOIN pg_class child_table
      ON child_table.oid = constraint_info.conrelid
    JOIN pg_namespace child_namespace
      ON child_namespace.oid = child_table.relnamespace
    JOIN unnest(constraint_info.conkey) WITH ORDINALITY AS child_key(attnum, position)
      ON true
    JOIN unnest(constraint_info.confkey) WITH ORDINALITY AS parent_key(attnum, position)
      ON parent_key.position = child_key.position
    JOIN pg_attribute child_column
      ON child_column.attrelid = child_table.oid
     AND child_column.attnum = child_key.attnum
    JOIN pg_attribute parent_column
      ON parent_column.attrelid = constraint_info.confrelid
     AND parent_column.attnum = parent_key.attnum
    WHERE constraint_info.contype = 'f'
      AND constraint_info.confrelid = 'cameras'::regclass
      AND child_namespace.nspname = 'public'
      AND parent_column.attname = 'id'
    ORDER BY child_namespace.nspname, child_table.relname, child_column.attname
  `);

  return result.rows as CameraReference[];
}

async function deleteCameraDependencies(
  client: any,
  cameraId?: string,
): Promise<Record<string, number>> {
  const references = await listCameraReferences(client);
  const deleteCounts: Record<string, number> = {};

  for (const reference of references) {
    const table = `${quoteIdentifier(reference.table_schema)}.${quoteIdentifier(reference.table_name)}`;
    const column = quoteIdentifier(reference.column_name);
    const result = cameraId
      ? await client.query(`DELETE FROM ${table} WHERE ${column} = $1`, [cameraId])
      : await client.query(`DELETE FROM ${table} WHERE ${column} IN (SELECT id FROM cameras)`);
    const key = `${reference.table_schema}.${reference.table_name}`;
    deleteCounts[key] = (deleteCounts[key] ?? 0) + (result.rowCount ?? 0);
  }

  return deleteCounts;
}

async function runBestEffort(
  client: any,
  savepoint: string,
  operation: () => Promise<any>,
): Promise<{ result?: any; error?: unknown }> {
  await client.query(`SAVEPOINT ${savepoint}`);
  try {
    const result = await operation();
    await client.query(`RELEASE SAVEPOINT ${savepoint}`);
    return { result };
  } catch (error) {
    await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
    await client.query(`RELEASE SAVEPOINT ${savepoint}`);
    return { error };
  }
}

async function cleanupResourceNodes(
  client: any,
  resourceNodeIds: string[],
  app: FastifyInstance,
): Promise<number> {
  if (resourceNodeIds.length === 0) return 0;

  const deletion = await runBestEffort(client, 'delete_camera_resource_nodes', () =>
    client.query(
      `DELETE FROM resource_nodes
       WHERE id = ANY($1) AND node_type = 'camera'`,
      [resourceNodeIds],
    ),
  );

  if (!deletion.error) return deletion.result?.rowCount ?? 0;

  app.log.warn(
    { resourceNodeIds, error: deletion.error },
    'Camera resource nodes are still referenced; deactivating them instead',
  );

  const deactivation = await runBestEffort(client, 'deactivate_camera_resource_nodes', () =>
    client.query(
      `UPDATE resource_nodes
       SET is_active = false
       WHERE id = ANY($1) AND node_type = 'camera'`,
      [resourceNodeIds],
    ),
  );

  if (deactivation.error) {
    app.log.warn(
      { resourceNodeIds, error: deactivation.error },
      'Unable to deactivate retained camera resource nodes',
    );
  }

  return 0;
}

async function deleteCamera(client: any, id: string, app: FastifyInstance) {
  const cameraResult = await client.query(
    `SELECT resource_node_id
     FROM cameras
     WHERE id::text = $1
     FOR UPDATE`,
    [id],
  );

  if (cameraResult.rowCount === 0) {
    return { found: false, deletedNodes: 0, relatedDataDeleted: {} as Record<string, number> };
  }

  const resourceNodeId = cameraResult.rows[0]?.resource_node_id as string | null;
  const relatedDataDeleted = await deleteCameraDependencies(client, id);
  const deleted = await client.query('DELETE FROM cameras WHERE id::text = $1', [id]);

  if (deleted.rowCount === 0) {
    return { found: false, deletedNodes: 0, relatedDataDeleted };
  }

  const deletedNodes = resourceNodeId
    ? await cleanupResourceNodes(client, [resourceNodeId], app)
    : 0;

  return { found: true, deletedNodes, relatedDataDeleted };
}

async function deleteAllCameras(client: any, app: FastifyInstance) {
  const cameraRows = await client.query(
    `SELECT resource_node_id
     FROM cameras
     FOR UPDATE`,
  );
  const resourceNodeIds = cameraRows.rows
    .map((row: any) => row.resource_node_id as string | null)
    .filter((id: string | null): id is string => Boolean(id));
  const relatedDataDeleted = await deleteCameraDependencies(client);
  const deleted = await client.query('DELETE FROM cameras');
  const deletedNodes = await cleanupResourceNodes(client, resourceNodeIds, app);

  return {
    deletedCameras: deleted.rowCount ?? 0,
    deletedNodes,
    relatedDataDeleted,
  };
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
      
      const deletion = await deleteAllCameras(client, app);
      
      await client.query("COMMIT");
      
      return reply.code(200).send({
        success: true,
        ...deletion,
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

      const deletion = await deleteCamera(client, id, app);
      if (!deletion.found) {
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

      const deletion = await deleteCamera(client, id, app);
      app.log.debug({ cameraId: id, found: deletion.found }, 'Camera lookup result');

      if (!deletion.found) {
        await client.query('ROLLBACK');
        app.log.info({ cameraId: id }, 'Camera not found, returning 404');
        return reply.code(404).send({ error: 'camera_not_found' });
      }

      await client.query('COMMIT');
      app.log.info({ cameraId: id }, 'Camera deleted successfully');
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

