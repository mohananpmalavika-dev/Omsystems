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
import type {
  CameraApprovalInput,
  RecorderReplacementResult,
} from "../control-plane-store.js";

type CameraRow = {
  id: string;
  name: string;
  resource_node_id: string;
  branch_node_id: string;
  edge_agent_id: string | null;
  vendor: CameraVendor;
  model: string;
  channel: number;
  protocol: Camera["protocol"];
  status: CameraStatus;
  profiles: CameraProfile[];
  capabilities: CameraCapabilities;
  connection_secret_ref: string;
  source_type: Camera["sourceType"] | null;
  recorder_id: string | null;
  recorder_channel: number | null;
  recorder_serial_number: string | null;
};

function mapCamera(row: CameraRow): Camera {
  return {
    id: row.id,
    name: row.name,
    nodeId: row.resource_node_id,
    branchId: row.branch_node_id,
    ...(row.edge_agent_id ? { edgeAgentId: row.edge_agent_id } : {}),
    vendor: row.vendor,
    model: row.model,
    channel: row.channel,
    protocol: row.protocol,
    status: row.status,
    profiles: row.profiles,
    capabilities: row.capabilities,
    connectionSecretRef: row.connection_secret_ref,
    sourceType: row.source_type ?? "ip-camera",
    ...(row.recorder_id ? { recorderId: row.recorder_id } : {}),
    ...(row.recorder_channel ? { recorderChannel: row.recorder_channel } : {}),
    ...(row.recorder_serial_number ? { recorderSerialNumber: row.recorder_serial_number } : {}),
  };
}

const selectCamera = `SELECT cameras.id::text, cameras.resource_node_id::text,
  cameras.branch_node_id::text, cameras.edge_agent_id::text, camera_node.name, cameras.vendor,
  cameras.model, cameras.channel, cameras.protocol, cameras.status,
  cameras.profiles, cameras.capabilities, cameras.connection_secret_ref,
  cameras.source_type, cameras.recorder_id, cameras.recorder_channel,
  cameras.recorder_serial_number
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

  async listByEdgeAgent(edgeAgentId: string) {
    const result = await this.pool.query<CameraRow>(
      `${selectCamera} WHERE cameras.edge_agent_id = $1::uuid ORDER BY camera_node.name`,
      [edgeAgentId],
    );
    return result.rows.map(mapCamera);
  }

  async listAuthorized(
    userId: string,
    action: string,
    filters: { branchId?: string; search?: string; status?: CameraStatus; limit: number; offset: number },
  ) {
    const where = `WHERE ($3::uuid IS NULL OR cameras.branch_node_id = $3)
      AND ($4::camera_status IS NULL OR cameras.status = $4)
      AND ($5::text IS NULL OR camera_node.name ILIKE '%' || $5 || '%' OR cameras.model ILIKE '%' || $5 || '%')
      AND (SELECT access.allowed FROM check_camera_access($1::uuid, cameras.id, $2) AS access LIMIT 1) = true`;
    const values = [userId, action, filters.branchId ?? null, filters.status ?? null, filters.search ?? null];
    const [items, count] = await Promise.all([
      this.pool.query<CameraRow>(
        `${selectCamera} ${where} ORDER BY camera_node.name LIMIT $6 OFFSET $7`,
        [...values, filters.limit, filters.offset],
      ),
      this.pool.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM cameras
         JOIN resource_nodes camera_node ON camera_node.id = cameras.resource_node_id
         ${where}`,
        values,
      ),
    ]);
    return { cameras: items.rows.map(mapCamera), total: Number(count.rows[0]?.count ?? 0) };
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
        edge_agent_id: string;
        source_type: Camera["sourceType"];
        recorder_id: string | null;
        recorder_channel: number;
        recorder_serial_number: string | null;
      }>(
        `SELECT tenant_id::text, vendor, model, profiles, capabilities,
                edge_agent_id::text, source_type, recorder_id,
                recorder_channel, recorder_serial_number
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

  async replaceRecorderChannels(input: {
    branchId: string;
    oldRecorderSerialNumber: string;
    newRecorderSerialNumber: string;
    mappings: Array<{ cameraId: string; discoveryId: string; sourceChannel: number }>;
    actorUserId: string;
  }): Promise<RecorderReplacementResult> {
    const client = await this.pool.connect();
    const oldSerial = input.oldRecorderSerialNumber.trim().toUpperCase();
    const newSerial = input.newRecorderSerialNumber.trim().toUpperCase();
    if (!oldSerial || !newSerial || oldSerial === newSerial) throw new Error("invalid_recorder_replacement");
    if (!input.mappings.length) throw new Error("recorder_replacement_has_no_channels");
    if (new Set(input.mappings.map((item) => item.cameraId)).size !== input.mappings.length ||
        new Set(input.mappings.map((item) => item.discoveryId)).size !== input.mappings.length) {
      throw new Error("duplicate_recorder_replacement_mapping");
    }

    try {
      await client.query("BEGIN");
      const branch = await client.query<{ tenant_id: string }>(
        `SELECT tenant_id::text FROM resource_nodes
         WHERE id = $1::uuid AND node_type = 'branch'
         FOR UPDATE`,
        [input.branchId],
      );
      const tenantId = branch.rows[0]?.tenant_id;
      if (!tenantId) throw new Error("branch_not_found");

      const updatedCameraIds: string[] = [];
      for (const mapping of input.mappings) {
        const updated = await client.query<{ id: string }>(
          `UPDATE cameras AS camera
           SET edge_agent_id = discovery.edge_agent_id,
               vendor = discovery.vendor,
               model = discovery.model,
               channel = discovery.recorder_channel,
               protocol = 'vendor-adapter',
               status = 'unknown',
               profiles = discovery.profiles,
               capabilities = discovery.capabilities,
               connection_secret_ref = 'edge://' || discovery.edge_agent_id::text || '/' || discovery.id::text,
               source_type = discovery.source_type,
               recorder_id = discovery.recorder_id,
               recorder_channel = discovery.recorder_channel,
               recorder_serial_number = discovery.recorder_serial_number,
               last_seen_at = NULL
           FROM camera_discoveries AS discovery
           WHERE camera.id = $1::uuid
             AND camera.branch_node_id = $2::uuid
             AND upper(btrim(camera.recorder_serial_number)) = $3
             AND camera.recorder_channel = $4
             AND discovery.id = $5::uuid
             AND discovery.branch_node_id = camera.branch_node_id
             AND discovery.status = 'pending'
             AND upper(btrim(discovery.recorder_serial_number)) = $6
             AND discovery.recorder_channel = $4
             AND discovery.stream_verified IS TRUE
             AND discovery.credentials_required IS NOT TRUE
           RETURNING camera.id::text`,
          [mapping.cameraId, input.branchId, oldSerial, mapping.sourceChannel, mapping.discoveryId, newSerial],
        );
        const cameraId = updated.rows[0]?.id;
        if (!cameraId) throw new Error("recorder_replacement_mapping_changed");
        updatedCameraIds.push(cameraId);
        await client.query(
          `UPDATE camera_discoveries
           SET status = 'approved', duplicate_status = 'duplicate',
               existing_device_association = $2,
               status_reason = $3
           WHERE id = $1::uuid`,
          [mapping.discoveryId, cameraId, `replacement_for:${oldSerial}`],
        );
      }

      const replacementId = randomUUID();
      const appliedAt = new Date().toISOString();
      await client.query(
        `INSERT INTO recorder_replacement_events
           (id, tenant_id, branch_node_id, old_recorder_serial_number,
            new_recorder_serial_number, channel_mappings, replaced_by, replaced_at)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)`,
        [replacementId, tenantId, input.branchId, oldSerial, newSerial,
         JSON.stringify(input.mappings), input.actorUserId, appliedAt],
      );
      await client.query("COMMIT");
      return {
        replacementId, branchId: input.branchId,
        oldRecorderSerialNumber: oldSerial, newRecorderSerialNumber: newSerial,
        updatedCameraIds,
        preserved: ["camera-ids", "names", "permissions", "recording-history", "recording-policy", "analytics-rules", "alert-rules"],
        appliedAt,
      };
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
      edge_agent_id: string;
      source_type: Camera["sourceType"];
      recorder_id: string | null;
      recorder_channel: number;
      recorder_serial_number: string | null;
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
         (resource_node_id, branch_node_id, edge_agent_id, vendor, model,
          channel, protocol, profiles, capabilities, connection_secret_ref,
          source_type, recorder_id, recorder_channel, recorder_serial_number)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10,
               $11, $12, $13, $14)
       RETURNING id::text, model AS name, resource_node_id::text,
                 branch_node_id::text, edge_agent_id::text, vendor, model, channel, protocol, status, profiles,
                 capabilities, connection_secret_ref, source_type, recorder_id,
                 recorder_channel, recorder_serial_number`,
      [
        nodeId, branchId, source.edge_agent_id, source.vendor, source.model,
        input.channel, input.protocol, JSON.stringify(source.profiles),
        JSON.stringify(source.capabilities), input.connectionSecretRef,
        input.sourceType ?? source.source_type ?? "ip-camera",
        input.recorderId ?? source.recorder_id,
        input.recorderChannel ?? (source.recorder_channel > 0 ? source.recorder_channel : null),
        input.recorderSerialNumber ?? source.recorder_serial_number,
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
                 capabilities, connection_secret_ref, source_type, recorder_id,
                 recorder_channel, recorder_serial_number`,
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
    const route = await this.pool.query<{ public_media_url: string | null }>(
      `SELECT agent.public_media_url
       FROM cameras camera
       LEFT JOIN edge_agents agent ON agent.id = camera.edge_agent_id
       WHERE camera.id = $1`,
      [cameraId],
    );
    const mediaGatewayUrl = route.rows[0]?.public_media_url ?? undefined;
    return {
      id,
      cameraId,
      userId,
      token,
      expiresAt: expiresAt.toISOString(),
      ...(mediaGatewayUrl ? { mediaGatewayUrl } : {}),
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
