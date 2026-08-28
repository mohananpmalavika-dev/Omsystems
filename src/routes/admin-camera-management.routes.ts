import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
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
  cameraId: string,
): Promise<Record<string, number>> {
  const references = await listCameraReferences(client);
  const deleteCounts: Record<string, number> = {};

  for (const reference of references) {
    const table = `${quoteIdentifier(reference.table_schema)}.${quoteIdentifier(reference.table_name)}`;
    const column = quoteIdentifier(reference.column_name);
    const result = await client.query(`DELETE FROM ${table} WHERE ${column} = $1`, [cameraId]);
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

const cameraAdminRoles = new Set([
  "super_admin",
  "superadmin",
  "global_admin",
  "company_admin",
  "hq_admin",
  "admin",
]);

async function requireCameraAdmin(request: FastifyRequest, reply: FastifyReply) {
  const user = request.currentUser;
  if (!user) {
    await reply.code(401).send({ error: "unauthenticated" });
    return false;
  }
  if (!user.role || !cameraAdminRoles.has(user.role)) {
    await reply.code(403).send({ error: "forbidden" });
    return false;
  }
  return true;
}

async function requireCameraDeleteAccess(
  request: FastifyRequest,
  reply: FastifyReply,
  store: ControlPlaneStore,
  cameraId: string,
) {
  if (!(await requireCameraAdmin(request, reply))) return false;
  const camera = await store.getCamera(cameraId);
  if (!camera) {
    await reply.code(404).send({ error: "camera_not_found" });
    return false;
  }
  const decision = await store.checkAccess(request.currentUser, "device:configure", camera.nodeId);
  if (!decision) {
    await reply.code(404).send({ error: "camera_not_found" });
    return false;
  }
  if (!decision.allowed) {
    await reply.code(403).send({ error: "forbidden", reason: decision.reason });
    return false;
  }
  return true;
}

/**
 * Admin Camera Management Routes
 * 
 * Provides endpoints for bulk camera operations
 */
export async function adminCameraManagementRoutes(app: FastifyInstance, store: ControlPlaneStore) {
  
  // Delete all cameras
  app.delete("/v1/admin/cameras/all", async (_request, reply) => {
    return reply.code(405).send({
      error: "bulk_camera_deletion_disabled",
      message: "Delete cameras individually so authorization and audit checks remain enforceable.",
    });
  });
  
  // Get camera count (for preview)
  app.get("/v1/admin/cameras/count", async (request, reply) => {
    if (!(await requireCameraAdmin(request, reply))) return;
    const result = await store.listAccessibleCameras(
      request.currentUser,
      "device:configure",
      { limit: 1, offset: 0 },
    );
    return reply.send({ total_cameras: result.total });
  });
  
  // List all cameras
  app.get("/v1/admin/cameras/list", async (request, reply) => {
    if (!(await requireCameraAdmin(request, reply))) return;
    const query = z.object({
      limit: z.coerce.number().int().min(1).max(500).default(100),
      offset: z.coerce.number().int().min(0).default(0),
      search: z.string().trim().max(120).optional(),
    }).parse(request.query);
    const result = await store.listAccessibleCameras(
      request.currentUser,
      "device:configure",
      {
        limit: query.limit,
        offset: query.offset,
        ...(query.search ? { search: query.search } : {}),
      },
    );
    return reply.send({
      cameras: result.cameras.map((camera) => ({
        id: camera.id,
        name: camera.name,
        branch_node_id: camera.branchId,
        edge_agent_id: camera.edgeAgentId ?? null,
        ip_address: camera.ipAddress ?? null,
        status: camera.status,
        vendor: camera.vendor,
        model: camera.model,
      })),
      total: result.total,
      limit: query.limit,
      offset: query.offset,
    });
  });

  // Delete a single camera by id (admin)
  app.delete('/v1/admin/cameras/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!(await requireCameraDeleteAccess(request, reply, store, id))) return;
    if (!hasDbPool(store)) {
      return reply.code(501).send({ error: 'not_implemented', message: 'This endpoint requires PostgreSQL store support' });
    }
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
    if (!(await requireCameraDeleteAccess(request, reply, store, id))) return;
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

