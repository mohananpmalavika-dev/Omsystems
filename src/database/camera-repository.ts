import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type {
  Camera,
  CameraCapabilities,
  CameraProfile,
  CameraStatus,
  CameraVendor,
  ConsumedLiveSession,
  LiveSession,
} from "../domain/models.js";
import type { CameraApprovalInput } from "../control-plane-store.js";

type CameraRow = {
  id: string;
  name: string;
  resource_node_id: string;
  branch_node_id: string;
  vendor: CameraVendor;
  model: string;
  channel: number;
  protocol: Camera["protocol"];
  status: CameraStatus;
  profiles: CameraProfile[];
  capabilities: CameraCapabilities;
  connection_secret_ref: string;
};

function mapCamera(row: CameraRow): Camera {
  return {
    id: row.id,
    name: row.name,
    nodeId: row.resource_node_id,
    branchId: row.branch_node_id,
    vendor: row.vendor,
    model: row.model,
    channel: row.channel,
    protocol: row.protocol,
    status: row.status,
    profiles: row.profiles,
    capabilities: row.capabilities,
    connectionSecretRef: row.connection_secret_ref,
  };
}

const selectCamera = `SELECT cameras.id::text, cameras.resource_node_id::text,
  cameras.branch_node_id::text, camera_node.name, cameras.vendor,
  cameras.model, cameras.channel, cameras.protocol, cameras.status,
  cameras.profiles, cameras.capabilities, cameras.connection_secret_ref
  FROM cameras
  JOIN resource_nodes camera_node ON camera_node.id = cameras.resource_node_id`;

export class CameraRepository {
  constructor(private readonly pool: Pool) {}

  async findById(id: string) {
    const result = await this.pool.query<CameraRow>(
      `${selectCamera} WHERE cameras.id = $1`,
      [id],
    );
    return result.rows[0] ? mapCamera(result.rows[0]) : undefined;
  }

  async listAuthorizedByBranch(
    userId: string,
    branchId: string,
    action: string,
  ) {
    const result = await this.pool.query<CameraRow>(
      `${selectCamera}
       WHERE cameras.branch_node_id = $2
         AND (
           SELECT access.allowed
           FROM check_camera_access($1::uuid, cameras.id, $3) AS access
           LIMIT 1
         ) = true`,
      [userId, branchId, action],
    );
    return result.rows.map(mapCamera);
  }

  async approve(branchId: string, input: CameraApprovalInput) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const discovery = await client.query<{
        tenant_id: string;
        vendor: CameraVendor;
        model: string;
        profiles: CameraProfile[];
        capabilities: CameraCapabilities;
      }>(
        `SELECT tenant_id::text, vendor, model, profiles, capabilities
         FROM camera_discoveries
         WHERE id = $1 AND branch_node_id = $2 AND status = 'pending'
         FOR UPDATE`,
        [input.discoveryId, branchId],
      );
      const source = discovery.rows[0];
      if (!source) {
        await client.query("ROLLBACK");
        return undefined;
      }
      const camera = await this.insertApprovedCamera(client, branchId, source, input);
      await client.query(
        "UPDATE camera_discoveries SET status = 'approved' WHERE id = $1",
        [input.discoveryId],
      );
      await client.query("COMMIT");
      return camera;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private async insertApprovedCamera(
    client: PoolClient,
    branchId: string,
    source: {
      tenant_id: string;
      vendor: CameraVendor;
      model: string;
      profiles: CameraProfile[];
      capabilities: CameraCapabilities;
    },
    input: CameraApprovalInput,
  ) {
    const nodeId = randomUUID();
    await client.query(
      `INSERT INTO resource_nodes
         (id, tenant_id, parent_id, node_type, name, path)
       SELECT $1::uuid, tenant_id, id, 'camera', $3,
              path || text2ltree(replace($1::text, '-', '_'))
       FROM resource_nodes
       WHERE id = $2::uuid AND node_type = 'branch'`,
      [nodeId, branchId, input.name],
    );
    const result = await client.query<CameraRow>(
      `INSERT INTO cameras
         (resource_node_id, branch_node_id, vendor, model, channel, protocol,
          profiles, capabilities, connection_secret_ref)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9)
       RETURNING id::text, model AS name, resource_node_id::text,
                 branch_node_id::text, vendor, model, channel, protocol, status, profiles,
                 capabilities, connection_secret_ref`,
      [
        nodeId, branchId, source.vendor, source.model, input.channel,
        input.protocol, JSON.stringify(source.profiles),
        JSON.stringify(source.capabilities), input.connectionSecretRef,
      ],
    );
    return mapCamera(result.rows[0]!);
  }

  async updateStatus(id: string, status: CameraStatus) {
    const result = await this.pool.query<CameraRow>(
      `UPDATE cameras SET status = $2::camera_status, last_seen_at = CASE
         WHEN $2::camera_status = 'online' THEN now() ELSE last_seen_at END
       WHERE id = $1::uuid
       RETURNING id::text, model AS name, resource_node_id::text,
                 branch_node_id::text, vendor, model, channel, protocol, status, profiles,
                 capabilities, connection_secret_ref`,
      [id, status],
    );
    return result.rows[0] ? mapCamera(result.rows[0]) : undefined;
  }

  async createLiveSession(cameraId: string, userId: string): Promise<LiveSession> {
    const id = randomUUID();
    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest();
    const expiresAt = new Date(Date.now() + 60_000);
    await this.pool.query(
      `INSERT INTO live_sessions
         (id, camera_id, user_id, token_hash, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, cameraId, userId, tokenHash, expiresAt],
    );
    return {
      id,
      cameraId,
      userId,
      token,
      expiresAt: expiresAt.toISOString(),
    };
  }

  async consumeLiveSession(token: string): Promise<ConsumedLiveSession | undefined> {
    const tokenHash = createHash("sha256").update(token).digest();
    const result = await this.pool.query<{
      id: string;
      camera_id: string;
      resource_node_id: string;
      user_id: string;
      tenant_id: string;
      connection_secret_ref: string;
      profiles: CameraProfile[];
    }>(
      `WITH consumed AS (
         UPDATE live_sessions
         SET consumed_at = now()
         WHERE token_hash = $1
           AND consumed_at IS NULL
           AND expires_at > now()
         RETURNING id, camera_id, user_id
       )
       SELECT consumed.id::text, camera.id::text AS camera_id,
              camera.resource_node_id::text, app_user.id::text AS user_id,
              app_user.tenant_id::text, camera.connection_secret_ref,
              camera.profiles
       FROM consumed
       JOIN cameras camera ON camera.id = consumed.camera_id
       JOIN users app_user ON app_user.id = consumed.user_id`,
      [tokenHash],
    );
    const row = result.rows[0];
    return row
      ? {
          id: row.id,
          cameraId: row.camera_id,
          cameraNodeId: row.resource_node_id,
          userId: row.user_id,
          tenantId: row.tenant_id,
          connectionSecretRef: row.connection_secret_ref,
          profiles: row.profiles,
        }
      : undefined;
  }
}
