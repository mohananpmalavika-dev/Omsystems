import type { Pool, PoolClient } from "pg";
import type { CameraApprovalInput, CameraDiscoveryInput } from "../control-plane-store.js";
import type { DeviceIdentity } from "../domain/models.js";
import {
  identityClaims,
  normalizeMacAddress,
  observationFromApproval,
  observationFromDiscovery,
  type DeviceIdentityObservation,
} from "../device-identity.js";

type IdentityLink = {
  deviceIdentityId: string;
  cameraId?: string;
  recorderPlaceholderUpgrade?: boolean;
};

type IdentityRow = {
  id: string;
  tenant_id: string;
  branch_node_id: string;
  camera_id: string | null;
  device_type: DeviceIdentity["deviceType"];
  hardware_serial: string | null;
  manufacturer: string | null;
  model: string | null;
  firmware_version: string | null;
  mac_address: string | null;
  current_ip_address: string | null;
  onvif_uuid: string | null;
  dvr_serial_number: string | null;
  channel: number | null;
  certificate_ref: string | null;
  certificate_fingerprint: string | null;
  credential_ref: string | null;
  edge_agent_id: string | null;
  first_seen_at: Date;
  last_seen_at: Date;
};

function databaseMac(value: string | undefined) {
  const normalized = normalizeMacAddress(value);
  return normalized?.match(/.{2}/g)?.join(":") ?? null;
}

function mapIdentity(row: IdentityRow, ipHistory: DeviceIdentity["ipHistory"]): DeviceIdentity {
  return {
    deviceId: row.id,
    tenantId: row.tenant_id,
    branchId: row.branch_node_id,
    ...(row.camera_id ? { cameraId: row.camera_id } : {}),
    deviceType: row.device_type,
    ...(row.hardware_serial ? { hardwareSerial: row.hardware_serial } : {}),
    ...(row.manufacturer ? { manufacturer: row.manufacturer } : {}),
    ...(row.model ? { model: row.model } : {}),
    ...(row.firmware_version ? { firmwareVersion: row.firmware_version } : {}),
    ...(row.mac_address ? { macAddress: row.mac_address } : {}),
    ...(row.current_ip_address ? { currentIpAddress: row.current_ip_address } : {}),
    ipHistory,
    ...(row.onvif_uuid ? { onvifUuid: row.onvif_uuid } : {}),
    ...(row.dvr_serial_number ? { dvrSerialNumber: row.dvr_serial_number } : {}),
    ...(row.channel ? { channel: row.channel } : {}),
    ...(row.certificate_ref ? { certificateRef: row.certificate_ref } : {}),
    ...(row.certificate_fingerprint ? { certificateFingerprint: row.certificate_fingerprint } : {}),
    ...(row.credential_ref ? { credentialRef: row.credential_ref } : {}),
    ...(row.edge_agent_id ? { agentId: row.edge_agent_id } : {}),
    firstSeenAt: row.first_seen_at.toISOString(),
    lastSeenAt: row.last_seen_at.toISOString(),
  };
}

export class DeviceIdentityRepository {
  constructor(private readonly pool: Pool) {}

  async resolveDiscovery(
    client: PoolClient,
    branchId: string,
    input: CameraDiscoveryInput,
  ): Promise<IdentityLink> {
    const context = await client.query<{ tenant_id: string }>(
      `SELECT branch.tenant_id::text
       FROM resource_nodes branch
       JOIN edge_agents agent
         ON agent.id = $2::uuid
        AND agent.branch_node_id = branch.id
        AND agent.tenant_id = branch.tenant_id
       WHERE branch.id = $1::uuid AND branch.node_type = 'branch'`,
      [branchId, input.edgeAgentId],
    );
    const tenantId = context.rows[0]?.tenant_id;
    if (!tenantId) throw new Error("invalid_edge_agent");
    return this.resolveObservation(client, tenantId, branchId, observationFromDiscovery(input));
  }

  async resolveManual(
    client: PoolClient,
    branchId: string,
    input: CameraApprovalInput,
  ): Promise<IdentityLink> {
    const context = await client.query<{ tenant_id: string }>(
      `SELECT tenant_id::text FROM resource_nodes
       WHERE id = $1::uuid AND node_type = 'branch'`,
      [branchId],
    );
    const tenantId = context.rows[0]?.tenant_id;
    if (!tenantId) throw new Error("branch_not_found");
    return this.resolveObservation(client, tenantId, branchId, observationFromApproval(input));
  }

  async linkCamera(
    client: PoolClient,
    deviceIdentityId: string,
    cameraId: string,
    credentialRef: string,
  ) {
    await client.query(
      `UPDATE device_identities
       SET camera_id = $2::uuid, credential_ref = $3, updated_at = now()
       WHERE id = $1::uuid AND (camera_id IS NULL OR camera_id = $2::uuid)`,
      [deviceIdentityId, cameraId, credentialRef],
    );
  }

  async findByCamera(cameraId: string): Promise<DeviceIdentity | undefined> {
    const result = await this.pool.query<IdentityRow>(
      `SELECT identity.id::text, identity.tenant_id::text,
              identity.branch_node_id::text, identity.camera_id::text,
              identity.device_type, identity.hardware_serial,
              identity.manufacturer, identity.model, identity.firmware_version,
              identity.mac_address::text, host(identity.current_ip_address) AS current_ip_address,
              identity.onvif_uuid, identity.dvr_serial_number, identity.channel,
              identity.certificate_ref, identity.certificate_fingerprint,
              identity.credential_ref, identity.edge_agent_id::text,
              identity.first_seen_at, identity.last_seen_at
       FROM device_identities identity
       WHERE identity.camera_id = $1::uuid`,
      [cameraId],
    );
    const row = result.rows[0];
    if (!row) return undefined;
    const history = await this.pool.query<{
      ip_address: string;
      edge_agent_id: string | null;
      first_seen_at: Date;
      last_seen_at: Date;
      observation_count: string;
    }>(
      `SELECT host(ip_address) AS ip_address, edge_agent_id::text,
              first_seen_at, last_seen_at, observation_count::text
       FROM device_ip_history
       WHERE device_identity_id = $1::uuid
       ORDER BY last_seen_at DESC`,
      [row.id],
    );
    return mapIdentity(row, history.rows.map((item) => ({
      ipAddress: item.ip_address,
      ...(item.edge_agent_id ? { agentId: item.edge_agent_id } : {}),
      firstSeenAt: item.first_seen_at.toISOString(),
      lastSeenAt: item.last_seen_at.toISOString(),
      observationCount: Number(item.observation_count),
    })));
  }

  private async resolveObservation(
    client: PoolClient,
    tenantId: string,
    branchId: string,
    observation: DeviceIdentityObservation,
  ): Promise<IdentityLink> {
    const claims = identityClaims(observation);
    for (const claim of [...claims].sort((left, right) => `${left.type}:${left.value}`.localeCompare(`${right.type}:${right.value}`))) {
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
        `${tenantId}:${claim.type}:${claim.value}`,
      ]);
    }
    if (!claims.length && observation.ipAddress) {
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
        `${tenantId}:${branchId}:ip:${observation.ipAddress}:${observation.deviceType}:channel:${observation.channel ?? 0}`,
      ]);
    }

    let match: { id: string; camera_id: string | null } | undefined;
    let recorderPlaceholderUpgrade = false;
    if (claims.length > 0) {
      const result = await client.query<{ id: string; camera_id: string | null }>(
        `SELECT identity.id::text, identity.camera_id::text
         FROM unnest($2::text[], $3::text[]) WITH ORDINALITY
              AS candidate(claim_type, normalized_value, priority)
         JOIN device_identity_claims claim
           ON claim.tenant_id = $1::uuid
          AND claim.claim_type = candidate.claim_type
          AND claim.normalized_value = candidate.normalized_value
         JOIN device_identities identity ON identity.id = claim.device_identity_id
         ORDER BY (identity.camera_id IS NOT NULL) DESC, candidate.priority, identity.created_at
         LIMIT 1
         FOR UPDATE OF identity`,
        [tenantId, claims.map((claim) => claim.type), claims.map((claim) => claim.value)],
      );
      match = result.rows[0];
    }

    // Older agents could approve a recorder's first RTSP path as one generic
    // IP camera. Once authenticated channel evidence arrives, reuse that
    // identity for channel 1 so the existing camera is upgraded in place and
    // operators do not get a stale duplicate beside the recorder channels.
    if (!match && observation.ipAddress && observation.channel === 1 &&
      (observation.deviceType === "analog-dvr-channel" || observation.deviceType === "nvr-channel")) {
      const result = await client.query<{ id: string; camera_id: string | null }>(
        `SELECT identity.id::text, identity.camera_id::text
         FROM device_identities identity
         LEFT JOIN cameras camera ON camera.id = identity.camera_id
         WHERE identity.tenant_id = $1::uuid
           AND identity.branch_node_id = $2::uuid
           AND identity.current_ip_address = $3::inet
           AND identity.device_type = 'ip-camera'
           AND (
             COALESCE(identity.model, '') ~* '(dvr|nvr|xvr|uvr|recorder|multi[- ]?channel)'
             OR COALESCE(camera.model, '') ~* '(dvr|nvr|xvr|uvr|recorder|multi[- ]?channel)'
           )
         ORDER BY (identity.camera_id IS NOT NULL) DESC, identity.last_seen_at DESC
         LIMIT 1
         FOR UPDATE OF identity`,
        [tenantId, branchId, observation.ipAddress],
      );
      match = result.rows[0];
      recorderPlaceholderUpgrade = Boolean(match);
    }
    // A previous scan may have created an IP-only identity before the scanner
    // learned a MAC address or hardware fingerprint. Enrich that identity
    // instead of creating a second identity that collides with the existing
    // camera-discovery source slot.
    if (!match && observation.ipAddress) {
      const result = await client.query<{ id: string; camera_id: string | null }>(
        `SELECT id::text, camera_id::text
         FROM device_identities
         WHERE tenant_id = $1::uuid AND branch_node_id = $2::uuid
           AND current_ip_address = $3::inet
           AND device_type = $4
           AND channel IS NOT DISTINCT FROM $5::integer
         ORDER BY last_seen_at DESC
         LIMIT 1
         FOR UPDATE`,
        [tenantId, branchId, observation.ipAddress, observation.deviceType, observation.channel ?? null],
      );
      match = result.rows[0];
    }

    const identityId = match?.id ?? (await client.query<{ id: string }>(
      `INSERT INTO device_identities
         (tenant_id, branch_node_id, device_type, hardware_serial,
          manufacturer, model, firmware_version, mac_address,
          current_ip_address, onvif_uuid, dvr_serial_number, channel,
          certificate_ref, certificate_fingerprint, credential_ref, edge_agent_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::macaddr, $9::inet,
               $10, $11, $12, $13, $14, $15, $16)
       RETURNING id::text`,
      [tenantId, branchId, observation.deviceType, observation.hardwareSerial ?? null,
       observation.manufacturer ?? null, observation.model ?? null,
       observation.firmwareVersion ?? null, databaseMac(observation.macAddress),
       observation.ipAddress ?? null, observation.onvifUuid ?? null,
       observation.dvrSerialNumber ?? null, observation.channel ?? null,
       observation.certificateRef ?? null, observation.certificateFingerprint ?? null,
       observation.credentialRef ?? null, observation.agentId ?? null],
    )).rows[0]!.id;

    await client.query(
      `UPDATE device_identities
       SET branch_node_id = $2::uuid,
           device_type = $3,
           hardware_serial = COALESCE($4, hardware_serial),
           manufacturer = COALESCE($5, manufacturer),
           model = COALESCE($6, model),
           firmware_version = COALESCE($7, firmware_version),
           mac_address = COALESCE($8::macaddr, mac_address),
           current_ip_address = COALESCE($9::inet, current_ip_address),
           onvif_uuid = COALESCE($10, onvif_uuid),
           dvr_serial_number = COALESCE($11, dvr_serial_number),
           channel = COALESCE($12, channel),
           certificate_ref = COALESCE($13, certificate_ref),
           certificate_fingerprint = COALESCE($14, certificate_fingerprint),
           credential_ref = COALESCE($15, credential_ref),
           edge_agent_id = COALESCE($16::uuid, edge_agent_id),
           last_seen_at = now(), updated_at = now()
       WHERE id = $1::uuid`,
      [identityId, branchId, observation.deviceType, observation.hardwareSerial ?? null,
       observation.manufacturer ?? null, observation.model ?? null,
       observation.firmwareVersion ?? null, databaseMac(observation.macAddress),
       observation.ipAddress ?? null, observation.onvifUuid ?? null,
       observation.dvrSerialNumber ?? null, observation.channel ?? null,
       observation.certificateRef ?? null, observation.certificateFingerprint ?? null,
       observation.credentialRef ?? null, observation.agentId ?? null],
    );

    for (const claim of claims) {
      await client.query(
        `INSERT INTO device_identity_claims
           (tenant_id, device_identity_id, claim_type, normalized_value)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (tenant_id, claim_type, normalized_value) DO UPDATE
         SET last_seen_at = now()
         WHERE device_identity_claims.device_identity_id = EXCLUDED.device_identity_id`,
        [tenantId, identityId, claim.type, claim.value],
      );
    }

    if (observation.ipAddress) {
      await client.query(
        `INSERT INTO device_ip_history (device_identity_id, ip_address, edge_agent_id)
         VALUES ($1, $2::inet, $3::uuid)
         ON CONFLICT (device_identity_id, ip_address) DO UPDATE
         SET edge_agent_id = COALESCE(EXCLUDED.edge_agent_id, device_ip_history.edge_agent_id),
             last_seen_at = now(),
             observation_count = device_ip_history.observation_count + 1`,
        [identityId, observation.ipAddress, observation.agentId ?? null],
      );
    }

    if (match?.camera_id) {
      const cameraExists = await client.query(
        `SELECT 1 FROM cameras WHERE id = $1::uuid`,
        [match.camera_id],
      );
      if (cameraExists.rowCount === 0) {
        // The camera was previously deleted; unlink it from device_identities so it can be cleanly re-added
        await client.query(
          `UPDATE device_identities SET camera_id = NULL, updated_at = now() WHERE id = $1::uuid`,
          [identityId],
        );
        match.camera_id = null;
      } else {
        await client.query(
          `UPDATE cameras
           SET edge_agent_id = COALESCE($2::uuid, edge_agent_id),
               serial_number = COALESCE($3, serial_number),
               mac_address = COALESCE($4::macaddr, mac_address),
               firmware_version = COALESCE($5, firmware_version),
               ip_address = COALESCE($6::inet, ip_address),
               onvif_uuid = COALESCE($7, onvif_uuid),
               certificate_ref = COALESCE($8, certificate_ref),
               certificate_fingerprint = COALESCE($9, certificate_fingerprint),
               identity_last_seen_at = now(), last_seen_at = now()
           WHERE id = $1::uuid`,
          [match.camera_id, observation.agentId ?? null, observation.hardwareSerial ?? null,
           databaseMac(observation.macAddress), observation.firmwareVersion ?? null,
           observation.ipAddress ?? null, observation.onvifUuid ?? null,
           observation.certificateRef ?? null, observation.certificateFingerprint ?? null],
        );
      }
    }

    return {
      deviceIdentityId: identityId,
      ...(match?.camera_id ? { cameraId: match.camera_id } : {}),
      ...(recorderPlaceholderUpgrade ? { recorderPlaceholderUpgrade: true } : {}),
    };
  }
}
