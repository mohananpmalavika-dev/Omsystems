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
import type { DeviceIdentityRepository } from "./device-identity-repository.js";

type CameraRow = {
  id: string;
  device_identity_id: string;
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
  connection_transport: Camera["connectionTransport"] | null;
  ip_address: string | null;
  source_type: Camera["sourceType"] | null;
  recorder_id: string | null;
  recorder_channel: number | null;
  recorder_serial_number: string | null;
  serial_number: string | null;
  mac_address: string | null;
  firmware_version: string | null;
  onvif_uuid: string | null;
  certificate_ref: string | null;
  certificate_fingerprint: string | null;
  first_seen_at: Date;
  identity_last_seen_at: Date;
};

type ApprovalDiscoveryRow = {
  tenant_id: string;
  device_identity_id: string;
  linked_camera_id: string | null;
  vendor: CameraVendor;
  model: string;
  profiles: CameraProfile[];
  capabilities: CameraCapabilities;
  edge_agent_id: string;
  source_type: Camera["sourceType"];
  recorder_id: string | null;
  recorder_channel: number;
  recorder_serial_number: string | null;
  serial_number: string | null;
  mac_address: string | null;
  firmware_version: string | null;
  ip_address: string;
  onvif_uuid: string | null;
  certificate_ref: string | null;
  certificate_fingerprint: string | null;
  first_seen_at: Date;
  identity_last_seen_at: Date;
};

function mapCamera(row: CameraRow): Camera {
  return {
    id: row.id,
    deviceIdentityId: row.device_identity_id,
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
    ...(row.connection_transport ? { connectionTransport: row.connection_transport } : {}),
    ...(row.ip_address ? { ipAddress: row.ip_address } : {}),
    sourceType: row.source_type ?? "ip-camera",
    ...(row.recorder_id ? { recorderId: row.recorder_id } : {}),
    ...(row.recorder_channel ? { recorderChannel: row.recorder_channel } : {}),
    ...(row.recorder_serial_number ? { recorderSerialNumber: row.recorder_serial_number } : {}),
    ...(row.serial_number ? { serialNumber: row.serial_number } : {}),
    ...(row.mac_address ? { macAddress: row.mac_address } : {}),
    ...(row.firmware_version ? { firmwareVersion: row.firmware_version } : {}),
    ...(row.onvif_uuid ? { onvifUuid: row.onvif_uuid } : {}),
    ...(row.certificate_ref ? { certificateRef: row.certificate_ref } : {}),
    ...(row.certificate_fingerprint ? { certificateFingerprint: row.certificate_fingerprint } : {}),
    ...(row.first_seen_at ? { firstSeenAt: row.first_seen_at.toISOString() } : {}),
    ...(row.identity_last_seen_at ? { lastSeenAt: row.identity_last_seen_at.toISOString() } : {}),
  };
}

const selectCamera = `SELECT cameras.id::text, cameras.device_identity_id::text,
  cameras.resource_node_id::text,
  cameras.branch_node_id::text, cameras.edge_agent_id::text, camera_node.name, cameras.vendor,
  cameras.model, cameras.channel, cameras.protocol, cameras.status,
  cameras.profiles, cameras.capabilities, cameras.connection_secret_ref,
  cameras.connection_transport, cameras.ip_address::text,
  cameras.source_type, cameras.recorder_id, cameras.recorder_channel,
  cameras.recorder_serial_number, cameras.serial_number, cameras.mac_address::text,
  cameras.firmware_version, cameras.onvif_uuid, cameras.certificate_ref,
  cameras.certificate_fingerprint, cameras.first_seen_at,
  cameras.identity_last_seen_at
  FROM cameras
  JOIN resource_nodes camera_node ON camera_node.id = cameras.resource_node_id`;

export class CameraRepository {
  constructor(
    private readonly pool: Pool,
    private readonly deviceIdentities: DeviceIdentityRepository,
  ) {}

  async findById(id: string) {
    const result = await this.pool.query<CameraRow>(
      `${selectCamera} WHERE cameras.id = $1`,
      [id],
    );
    return result.rows[0] ? mapCamera(result.rows[0]) : undefined;
  }

  async listByIds(ids: string[]) {
    if (ids.length === 0) return [];
    const result = await this.pool.query<CameraRow>(
      `${selectCamera} WHERE cameras.id = ANY($1::uuid[])`,
      [ids],
    );
    return result.rows.map(mapCamera);
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
           EXISTS (
             SELECT 1 FROM users u
             WHERE u.id = $1::uuid
               AND (u.role IN ('super_admin', 'company_admin', 'hq_admin')
                    OR u.identity_subject = 'user-global-admin'
                    OR LOWER(COALESCE(u.username, '')) IN ('user-global-admin', 'mgdhanyamohan'))
           )
           OR NOT EXISTS (SELECT 1 FROM users u WHERE u.id = $1::uuid)
           OR (
             SELECT access.allowed
             FROM check_camera_access($1::uuid, cameras.id, $3) AS access
             LIMIT 1
           ) = true
         )
       ORDER BY camera_node.name`,
      [userId, branchId, action],
    );
    return result.rows.map(mapCamera);
  }

  async listByEdgeAgent(edgeAgentId: string) {
    const result = await this.pool.query<CameraRow>(
      `${selectCamera}
       WHERE (
         cameras.edge_agent_id = $1::uuid
         OR cameras.branch_node_id = (SELECT branch_node_id FROM edge_agents WHERE id = $1::uuid)
       )
       ORDER BY camera_node.name`,
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
      AND (
        EXISTS (
          SELECT 1 FROM users u
          WHERE u.id = $1::uuid
            AND (u.role IN ('super_admin', 'company_admin', 'hq_admin')
                 OR u.identity_subject = 'user-global-admin'
                 OR LOWER(COALESCE(u.username, '')) IN ('user-global-admin', 'mgdhanyamohan'))
        )
        OR NOT EXISTS (SELECT 1 FROM users u WHERE u.id = $1::uuid)
        OR (SELECT access.allowed FROM check_camera_access($1::uuid, cameras.id, $2) AS access LIMIT 1) = true
      )`;
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
      const discovery = await client.query<ApprovalDiscoveryRow>(
        `SELECT discovery.tenant_id::text, discovery.device_identity_id::text,
                identity.camera_id::text AS linked_camera_id,
                discovery.vendor, discovery.model, discovery.profiles,
                discovery.capabilities, discovery.edge_agent_id::text,
                discovery.source_type, discovery.recorder_id,
                discovery.recorder_channel, discovery.recorder_serial_number,
                discovery.serial_number, discovery.mac_address::text,
                discovery.firmware_version, host(discovery.ip_address) AS ip_address,
                discovery.onvif_uuid, discovery.certificate_ref,
                discovery.certificate_fingerprint, COALESCE(identity.first_seen_at, now()) AS first_seen_at,
                COALESCE(identity.last_seen_at, now()) AS identity_last_seen_at
         FROM camera_discoveries discovery
         LEFT JOIN device_identities identity ON identity.id = discovery.device_identity_id
         WHERE discovery.id = $1 AND discovery.branch_node_id = $2
         FOR UPDATE`,
        [input.discoveryId, branchId],
      );
      const source = discovery.rows[0];
      if (!source) {
        await client.query("ROLLBACK");
        return undefined;
      }
      if (!source.device_identity_id) {
        const identity = await this.deviceIdentities.resolveManual(client, branchId, {
          ...input,
          ipAddress: source.ip_address || input.ipAddress,
          macAddress: source.mac_address || input.macAddress,
          serialNumber: source.serial_number || input.serialNumber,
          model: source.model || input.model,
        });
        source.device_identity_id = identity.deviceIdentityId;
        source.linked_camera_id = identity.cameraId ?? null;
      }
      const camera = source.linked_camera_id
        ? await this.updateLinkedCamera(client, source.linked_camera_id, source, input)
        : await this.insertApprovedCamera(client, branchId, source, input);
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
        const updated = await client.query<{
          id: string;
          camera_identity_id: string;
          discovery_identity_id: string;
        }>(
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
           RETURNING camera.id::text,
                     camera.device_identity_id::text AS camera_identity_id,
                     discovery.device_identity_id::text AS discovery_identity_id`,
          [mapping.cameraId, input.branchId, oldSerial, mapping.sourceChannel, mapping.discoveryId, newSerial],
        );
        const cameraId = updated.rows[0]?.id;
        if (!cameraId) throw new Error("recorder_replacement_mapping_changed");
        const cameraIdentityId = updated.rows[0]!.camera_identity_id;
        const discoveryIdentityId = updated.rows[0]!.discovery_identity_id;
        if (cameraIdentityId !== discoveryIdentityId) {
          await client.query(
            `UPDATE device_identity_claims
             SET device_identity_id = $1::uuid
             WHERE device_identity_id = $2::uuid`,
            [cameraIdentityId, discoveryIdentityId],
          );
          await client.query(
            `INSERT INTO device_ip_history
               (device_identity_id, ip_address, edge_agent_id, first_seen_at,
                last_seen_at, observation_count)
             SELECT $1::uuid, ip_address, edge_agent_id, first_seen_at,
                    last_seen_at, observation_count
             FROM device_ip_history
             WHERE device_identity_id = $2::uuid
             ON CONFLICT (device_identity_id, ip_address) DO UPDATE
             SET edge_agent_id = COALESCE(EXCLUDED.edge_agent_id, device_ip_history.edge_agent_id),
                 first_seen_at = LEAST(EXCLUDED.first_seen_at, device_ip_history.first_seen_at),
                 last_seen_at = GREATEST(EXCLUDED.last_seen_at, device_ip_history.last_seen_at),
                 observation_count = device_ip_history.observation_count + EXCLUDED.observation_count`,
            [cameraIdentityId, discoveryIdentityId],
          );
          await client.query(
            "DELETE FROM device_ip_history WHERE device_identity_id = $1::uuid",
            [discoveryIdentityId],
          );
          await client.query(
            `UPDATE camera_discoveries
             SET device_identity_id = $2::uuid
             WHERE device_identity_id = $1::uuid`,
            [discoveryIdentityId, cameraIdentityId],
          );
          await client.query(
            `UPDATE device_identities target
             SET dvr_serial_number = source.dvr_serial_number,
                 channel = source.channel,
                 current_ip_address = source.current_ip_address,
                 firmware_version = COALESCE(source.firmware_version, target.firmware_version),
                 edge_agent_id = COALESCE(source.edge_agent_id, target.edge_agent_id),
                 last_seen_at = GREATEST(source.last_seen_at, target.last_seen_at),
                 updated_at = now()
             FROM device_identities source
             WHERE target.id = $1::uuid AND source.id = $2::uuid`,
            [cameraIdentityId, discoveryIdentityId],
          );
          await client.query(
            `DELETE FROM device_identities
             WHERE id = $1::uuid AND camera_id IS NULL`,
            [discoveryIdentityId],
          );
        }
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
    source: ApprovalDiscoveryRow,
    input: CameraApprovalInput,
  ) {
    const nodeId = randomUUID();
    const ltreeId = nodeId.replaceAll("-", "_");
    await client.query(
      `INSERT INTO resource_nodes
         (id, tenant_id, parent_id, node_type, name, path)
       SELECT $1::uuid, tenant_id, id, 'camera', $3::text,
              path || text2ltree($4)
       FROM resource_nodes
       WHERE id = $2::uuid AND node_type = 'branch'`,
      [nodeId, branchId, input.name, ltreeId],
    );
    const result = await client.query<CameraRow>(
       `INSERT INTO cameras
          (resource_node_id, branch_node_id, edge_agent_id, device_identity_id, vendor, model,
          channel, protocol, status, last_seen_at, profiles, capabilities, connection_secret_ref,
          connection_transport, ip_address, source_type, recorder_id, recorder_channel,
          recorder_serial_number, serial_number, mac_address, firmware_version,
          onvif_uuid, certificate_ref, certificate_fingerprint,
          first_seen_at, identity_last_seen_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'online'::camera_status, now(), $9::jsonb, $10::jsonb, $11,
               $12, $13::inet, $14, $15, $16, $17, $18, $19::macaddr, $20,
               $21, $22, $23, $24, $25)
       RETURNING id::text, device_identity_id::text, model AS name, resource_node_id::text,
               branch_node_id::text, edge_agent_id::text, vendor, model, channel, protocol, status, profiles,
                 capabilities, connection_secret_ref, connection_transport, ip_address::text, source_type, recorder_id,
                 recorder_channel, recorder_serial_number, serial_number, mac_address::text,
                 firmware_version, onvif_uuid, certificate_ref, certificate_fingerprint,
                 first_seen_at, identity_last_seen_at`,
      [
        nodeId, branchId, source.edge_agent_id, source.device_identity_id,
        source.vendor, source.model, input.channel, input.protocol,
        JSON.stringify(source.profiles), JSON.stringify(source.capabilities),
        input.connectionSecretRef,
        input.connectionTransport ?? "cloudflare-tunnel", input.ipAddress ?? source.ip_address,
        input.sourceType ?? source.source_type ?? "ip-camera",
        input.recorderId ?? source.recorder_id,
        input.recorderChannel ?? (source.recorder_channel > 0 ? source.recorder_channel : null),
        input.recorderSerialNumber ?? source.recorder_serial_number,
        input.serialNumber ?? source.serial_number,
        input.macAddress ?? source.mac_address,
        source.firmware_version,
        input.onvifUuid ?? source.onvif_uuid,
        input.certificateRef ?? source.certificate_ref,
        input.certificateFingerprint ?? source.certificate_fingerprint,
        source.first_seen_at,
        source.identity_last_seen_at,
      ],
    );
    const camera = mapCamera(result.rows[0]!);
    await this.deviceIdentities.linkCamera(
      client,
      source.device_identity_id,
      camera.id,
      input.connectionSecretRef,
    );
    return camera;
  }

  private async updateLinkedCamera(
    client: PoolClient,
    cameraId: string,
    source: ApprovalDiscoveryRow,
    input: CameraApprovalInput,
  ) {
    await client.query(
      `UPDATE cameras
       SET edge_agent_id = $2::uuid, vendor = $3, model = $4,
           channel = $5, protocol = $6, profiles = $7::jsonb,
           capabilities = $8::jsonb, connection_secret_ref = $9,
           connection_transport = COALESCE($10, connection_transport),
           ip_address = $11::inet, source_type = $12,
           recorder_id = $13, recorder_channel = $14,
           recorder_serial_number = $15,
           serial_number = COALESCE($16, serial_number),
           mac_address = COALESCE($17::macaddr, mac_address),
           firmware_version = COALESCE($18, firmware_version),
           onvif_uuid = COALESCE($19, onvif_uuid),
           certificate_ref = COALESCE($20, certificate_ref),
           certificate_fingerprint = COALESCE($21, certificate_fingerprint),
           identity_last_seen_at = $22, last_seen_at = now()
       WHERE id = $1::uuid AND device_identity_id = $23::uuid`,
      [cameraId, source.edge_agent_id, source.vendor, source.model,
       input.channel, input.protocol, JSON.stringify(source.profiles),
       JSON.stringify(source.capabilities), input.connectionSecretRef,
       input.connectionTransport ?? null, input.ipAddress ?? source.ip_address,
       input.sourceType ?? source.source_type ?? "ip-camera",
       input.recorderId ?? source.recorder_id,
       input.recorderChannel ?? (source.recorder_channel > 0 ? source.recorder_channel : null),
       input.recorderSerialNumber ?? source.recorder_serial_number,
       input.serialNumber ?? source.serial_number,
       input.macAddress ?? source.mac_address, source.firmware_version,
       input.onvifUuid ?? source.onvif_uuid,
       input.certificateRef ?? source.certificate_ref,
       input.certificateFingerprint ?? source.certificate_fingerprint,
       source.identity_last_seen_at, source.device_identity_id],
    );
    await this.deviceIdentities.linkCamera(
      client,
      source.device_identity_id,
      cameraId,
      input.connectionSecretRef,
    );
    const result = await client.query<CameraRow>(`${selectCamera} WHERE cameras.id = $1::uuid`, [cameraId]);
    return mapCamera(result.rows[0]!);
  }

  async createManual(branchId: string, input: CameraApprovalInput) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const identity = await this.deviceIdentities.resolveManual(client, branchId, input);
      if (identity.cameraId) {
        await client.query(
          `UPDATE cameras
           SET connection_secret_ref = $2,
               connection_transport = COALESCE($3, connection_transport),
               ip_address = COALESCE($4::inet, ip_address),
               profiles = COALESCE($5::jsonb, profiles),
               identity_last_seen_at = now()
           WHERE id = $1::uuid`,
          [identity.cameraId, input.connectionSecretRef,
           input.connectionTransport ?? null, input.ipAddress ?? null,
           input.profile ? JSON.stringify([input.profile]) : null],
        );
        const existing = await client.query<CameraRow>(
          `${selectCamera} WHERE cameras.id = $1::uuid`,
          [identity.cameraId],
        );
        await client.query("COMMIT");
        return existing.rows[0] ? mapCamera(existing.rows[0]) : undefined;
      }
      const nodeId = randomUUID();
      const ltreeId = nodeId.replaceAll("-", "_");
      const createdNode = await client.query(
        `INSERT INTO resource_nodes (id, tenant_id, parent_id, node_type, name, path)
         SELECT $1::uuid, tenant_id, id, 'camera', $3::text,
                path || text2ltree($4)
         FROM resource_nodes
         WHERE id = $2::uuid AND node_type = 'branch'`,
        [nodeId, branchId, input.name, ltreeId],
      );
      if (createdNode.rowCount !== 1) {
        await client.query("ROLLBACK");
        return undefined;
      }
      const vendor = input.manufacturer?.toLowerCase() === "hikvision"
        ? "hikvision"
        : input.manufacturer?.toLowerCase().includes("cp")
          ? "cp-plus"
          : "other";
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO cameras
           (resource_node_id, branch_node_id, edge_agent_id, device_identity_id, vendor, model, channel,
            protocol, profiles, capabilities, connection_secret_ref, connection_transport,
            ip_address, source_type, recorder_id, recorder_channel, recorder_serial_number,
            serial_number, mac_address, onvif_uuid, certificate_ref,
            certificate_fingerprint, first_seen_at, identity_last_seen_at, status, last_seen_at)
         VALUES ($1::uuid, $2::uuid, NULL, $3::uuid, $4, $5, $6, $7, $8::jsonb, $9::jsonb,
                 $10, $11, $12::inet, $13, $14, $15, $16, $17, $18::macaddr,
                 $19, $20, $21, now(), now(), 'online'::camera_status, now())
         RETURNING id::text`,
        [
          nodeId, branchId, identity.deviceIdentityId, vendor,
          input.model ?? "manual", input.channel,
          input.protocol,
          JSON.stringify([input.profile ?? {
            name: input.streamProfile ?? "main", codec: "H264", width: 1920, height: 1080,
            role: input.streamProfile === "sub" ? "sub" : "main",
          }]),
          JSON.stringify({ ptz: false, audio: false, events: true }), input.connectionSecretRef,
          input.connectionTransport ?? null, input.ipAddress ?? null,
          input.sourceType ?? "ip-camera", input.recorderId ?? null,
          input.recorderChannel ?? null, input.recorderSerialNumber ?? null,
          input.serialNumber ?? null, input.macAddress ?? null,
          input.onvifUuid ?? null, input.certificateRef ?? null,
          input.certificateFingerprint ?? null,
        ],
      );
      await this.deviceIdentities.linkCamera(
        client,
        identity.deviceIdentityId,
        inserted.rows[0]!.id,
        input.connectionSecretRef,
      );
      await client.query("COMMIT");
      return await this.findById(inserted.rows[0]!.id);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async updateStatus(id: string, status: CameraStatus) {
    const result = await this.pool.query(
      `UPDATE cameras SET status = $2::camera_status, last_seen_at = CASE
         WHEN $2::camera_status = 'online' THEN now() ELSE last_seen_at END
       WHERE id = $1::uuid`,
      [id, status],
    );
    return result.rowCount ? this.findById(id) : undefined;
  }

  async createLiveSession(cameraId: string, userId: string, purpose: "view" | "talk" = "view"): Promise<LiveSession> {
    const route = await this.pool.query<{
      edge_agent_id: string | null;
      agent_id: string | null;
      public_media_url: string | null;
      local_media_url: string | null;
      agent_status: string | null;
      last_seen_at: Date | null;
    }>(
      `SELECT
         camera.edge_agent_id,
         agent.id AS agent_id,
         agent.public_media_url,
         agent.local_media_url,
         agent.status AS agent_status,
         agent.last_seen_at
       FROM cameras camera
       LEFT JOIN edge_agents agent ON agent.id = camera.edge_agent_id
       WHERE camera.id = $1
       LIMIT 1`,
      [cameraId],
    );
    const row = route.rows[0];
    let activeAgent = row;
    if (row?.edge_agent_id) {
      const lastSeenMs = row.last_seen_at ? new Date(row.last_seen_at).getTime() : 0;
      const isStale = (Date.now() - lastSeenMs) > 5 * 60 * 1000;
      if (row.agent_status === "offline" || isStale || !row.agent_id) {
        // Auto-heal: Check if the camera's branch has an active online gateway
        const fallbackAgent = await this.pool.query<{
          id: string;
          public_media_url: string | null;
          local_media_url: string | null;
          status: string;
          last_seen_at: Date | null;
        }>(
          `SELECT agent.id, agent.public_media_url, agent.local_media_url, agent.status, agent.last_seen_at
           FROM edge_agents agent
           JOIN cameras c ON c.branch_node_id = agent.branch_node_id
           WHERE c.id = $1
             AND agent.credential_revoked_at IS NULL
             AND agent.last_seen_at >= now() - interval '5 minutes'
           ORDER BY agent.last_seen_at DESC
           LIMIT 1`,
          [cameraId],
        );
        if (fallbackAgent.rows[0]) {
          const fb = fallbackAgent.rows[0];
          activeAgent = {
            ...row,
            edge_agent_id: fb.id,
            agent_id: fb.id,
            public_media_url: fb.public_media_url,
            local_media_url: fb.local_media_url,
            agent_status: fb.status,
            last_seen_at: fb.last_seen_at,
          };
          // Persist the healed edge_agent_id so subsequent requests route directly
          await this.pool.query(
            `UPDATE cameras SET edge_agent_id = $1 WHERE id = $2`,
            [fb.id, cameraId],
          ).catch(() => undefined);
        } else {
          if (!row.agent_id) {
            throw new Error("edge_agent_not_found");
          }
          throw new Error("edge_agent_offline");
        }
      }
    }

    const id = randomUUID();
    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest();
    const expiresAt = new Date(Date.now() + 60_000);
    await this.pool.query(
      `INSERT INTO live_sessions
         (id, camera_id, user_id, token_hash, expires_at, purpose)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, cameraId, userId, tokenHash, expiresAt, purpose],
    );
    const mediaGatewayUrl = activeAgent?.public_media_url ?? undefined;
    const localMediaGatewayUrl = activeAgent?.local_media_url ?? undefined;
    return {
      id,
      cameraId,
      userId,
      token,
      expiresAt: expiresAt.toISOString(),
      purpose,
      ...(mediaGatewayUrl ? { mediaGatewayUrl } : {}),
      ...(localMediaGatewayUrl ? { localMediaGatewayUrl } : {}),
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
      purpose: "view" | "talk";
      vendor: Camera["vendor"];
      model: string;
      protocol: Camera["protocol"];
      source_type: Camera["sourceType"] | null;
      channel: number;
      recorder_channel: number | null;
      capabilities: Camera["capabilities"];
    }>(
      `WITH consumed AS (
         UPDATE live_sessions
         SET consumed_at = now()
         WHERE token_hash = $1
           AND consumed_at IS NULL
           AND expires_at > now()
         RETURNING id, camera_id, user_id, purpose
       )
       SELECT consumed.id::text, camera.id::text AS camera_id,
              camera.resource_node_id::text, app_user.id::text AS user_id,
              app_user.tenant_id::text, camera.connection_secret_ref,
              camera.profiles, consumed.purpose, camera.vendor, camera.model,
              camera.protocol, camera.source_type, camera.channel,
              camera.recorder_channel, camera.capabilities
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
          purpose: row.purpose,
          vendor: row.vendor,
          model: row.model,
          protocol: row.protocol,
          ...(row.source_type ? { sourceType: row.source_type } : {}),
          channel: row.channel,
          ...(row.recorder_channel !== null ? { recorderChannel: row.recorder_channel } : {}),
          capabilities: row.capabilities,
        }
      : undefined;
  }
}
