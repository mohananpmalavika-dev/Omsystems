import type { Pool } from "pg";
import type { DiscoveredCamera, EdgeAgent, EdgeScanJob } from "../domain/models.js";
import type { CameraDiscoveryInput } from "../control-plane-store.js";

type AgentRow = {
  id: string;
  branch_node_id: string;
  name: string;
  version: string;
  status: EdgeAgent["status"];
  last_seen_at: Date | null;
  public_media_url: string | null;
  device_uuid: string | null;
  credential_issued_at: Date | null;
  credential_revoked_at: Date | null;
};

function mapAgent(row: AgentRow): EdgeAgent {
  return {
    id: row.id,
    branchId: row.branch_node_id,
    name: row.name,
    version: row.version,
    status: row.status,
    lastSeenAt: row.last_seen_at?.toISOString() ?? null,
    ...(row.public_media_url ? { publicMediaUrl: row.public_media_url } : {}),
    ...(row.device_uuid ? { deviceUuid: row.device_uuid } : {}),
    credentialStatus: row.credential_revoked_at ? "revoked" : row.credential_issued_at ? "active" : "not-enrolled",
    ...(row.credential_issued_at ? { credentialIssuedAt: row.credential_issued_at.toISOString() } : {}),
    ...(row.credential_revoked_at ? { credentialRevokedAt: row.credential_revoked_at.toISOString() } : {}),
  };
}

type ScanRow = {
  id: string;
  branch_node_id: string;
  edge_agent_id: string;
  status: EdgeScanJob["status"];
  requested_at: Date;
  started_at: Date | null;
  completed_at: Date | null;
  result_count: number;
  error: string | null;
};

function mapScan(row: ScanRow): EdgeScanJob {
  return {
    id: row.id,
    branchId: row.branch_node_id,
    edgeAgentId: row.edge_agent_id,
    status: row.status,
    requestedAt: row.requested_at.toISOString(),
    startedAt: row.started_at?.toISOString() ?? null,
    completedAt: row.completed_at?.toISOString() ?? null,
    resultCount: row.result_count,
    error: row.error,
  };
}

export class EdgeAgentRepository {
  constructor(private readonly pool: Pool) {}

  async register(branchId: string, name: string, version: string) {
    const result = await this.pool.query<AgentRow>(
      `INSERT INTO edge_agents (tenant_id, branch_node_id, name, version)
       SELECT tenant_id, id, $2, $3
       FROM resource_nodes
       WHERE id = $1 AND node_type = 'branch'
       RETURNING id::text, branch_node_id::text, name, version, status,
                 last_seen_at, public_media_url, device_uuid,
                 credential_issued_at, credential_revoked_at`,
      [branchId, name, version],
    );
    if (!result.rows[0]) throw new Error("invalid_branch");
    return mapAgent(result.rows[0]);
  }

  async listByBranch(branchId: string) {
    const result = await this.pool.query<AgentRow>(
      `SELECT id::text, branch_node_id::text, name, version,
              CASE WHEN last_seen_at < now() - interval '90 seconds'
                THEN 'offline'::edge_agent_status ELSE status END AS status,
              last_seen_at, public_media_url, device_uuid,
              credential_issued_at, credential_revoked_at
       FROM edge_agents
       WHERE branch_node_id = $1
       ORDER BY name, created_at`,
      [branchId],
    );
    return result.rows.map(mapAgent);
  }

  async get(id: string) {
    const result = await this.pool.query<AgentRow>(
      `SELECT id::text, branch_node_id::text, name, version,
              CASE WHEN last_seen_at < now() - interval '90 seconds'
                THEN 'offline'::edge_agent_status ELSE status END AS status,
              last_seen_at, public_media_url, device_uuid,
              credential_issued_at, credential_revoked_at
       FROM edge_agents WHERE id = $1`,
      [id],
    );
    return result.rows[0] ? mapAgent(result.rows[0]) : undefined;
  }

  async heartbeat(id: string, version: string, publicMediaUrl?: string) {
    const result = await this.pool.query<AgentRow>(
      `UPDATE edge_agents
       SET version = $2, status = 'online', last_seen_at = now(),
           public_media_url = COALESCE($3, public_media_url)
       WHERE id = $1
       RETURNING id::text, branch_node_id::text, name, version, status,
                 last_seen_at, public_media_url, device_uuid,
                 credential_issued_at, credential_revoked_at`,
      [id, version, publicMediaUrl ?? null],
    );
    return result.rows[0] ? mapAgent(result.rows[0]) : undefined;
  }

  async createScanJob(branchId: string, edgeAgentId?: string) {
    const result = await this.pool.query<ScanRow>(
      `INSERT INTO edge_scan_jobs (tenant_id, branch_node_id, edge_agent_id)
       SELECT branch.tenant_id, branch.id, agent.id
       FROM resource_nodes branch
       JOIN LATERAL (
         SELECT id
         FROM edge_agents
         WHERE branch_node_id = branch.id
           AND ($2::uuid IS NULL OR id = $2::uuid)
           AND status = 'online'
           AND last_seen_at >= now() - interval '90 seconds'
         ORDER BY last_seen_at DESC NULLS LAST
         LIMIT 1
       ) agent ON true
       WHERE branch.id = $1 AND branch.node_type = 'branch'
       RETURNING id::text, branch_node_id::text, edge_agent_id::text, status,
                 requested_at, started_at, completed_at, result_count, error`,
      [branchId, edgeAgentId ?? null],
    );
    if (!result.rows[0]) throw new Error("edge_agent_not_found");
    return mapScan(result.rows[0]);
  }

  async getScanJob(branchId: string, jobId: string) {
    const result = await this.pool.query<ScanRow>(
      `SELECT id::text, branch_node_id::text, edge_agent_id::text, status,
              requested_at, started_at, completed_at, result_count, error
       FROM edge_scan_jobs WHERE id = $1 AND branch_node_id = $2`,
      [jobId, branchId],
    );
    return result.rows[0] ? mapScan(result.rows[0]) : undefined;
  }

  async claimScanJob(edgeAgentId: string) {
    const result = await this.pool.query<ScanRow>(
      `WITH next_job AS (
         SELECT id FROM edge_scan_jobs
         WHERE edge_agent_id = $1 AND status = 'queued'
         ORDER BY requested_at
         FOR UPDATE SKIP LOCKED LIMIT 1
       )
       UPDATE edge_scan_jobs job
       SET status = 'running', started_at = now()
       FROM next_job
       WHERE job.id = next_job.id
       RETURNING job.id::text, job.branch_node_id::text, job.edge_agent_id::text,
                 job.status, job.requested_at, job.started_at, job.completed_at,
                 job.result_count, job.error`,
      [edgeAgentId],
    );
    return result.rows[0] ? mapScan(result.rows[0]) : undefined;
  }

  async completeScanJob(
    edgeAgentId: string,
    jobId: string,
    result: { status: "completed" | "failed"; resultCount: number; error?: string },
  ) {
    const updated = await this.pool.query<ScanRow>(
      `UPDATE edge_scan_jobs
       SET status = $3::edge_scan_status, result_count = $4,
           error = $5, completed_at = now()
       WHERE id = $1 AND edge_agent_id = $2 AND status = 'running'
       RETURNING id::text, branch_node_id::text, edge_agent_id::text, status,
                 requested_at, started_at, completed_at, result_count, error`,
      [jobId, edgeAgentId, result.status, result.resultCount, result.error ?? null],
    );
    return updated.rows[0] ? mapScan(updated.rows[0]) : undefined;
  }

  async createDiscovery(
    branchId: string,
    input: CameraDiscoveryInput,
  ): Promise<DiscoveredCamera> {
    const result = await this.pool.query<{
      id: string;
      discovered_at: Date;
    }>(
      `INSERT INTO camera_discoveries
         (tenant_id, branch_node_id, edge_agent_id, discovery_method,
          manufacturer, vendor, model, ip_address, onvif_port, rtsp_port,
          profiles, capabilities, source_type, recorder_id, recorder_channel,
          recorder_serial_number, serial_number, firmware_version, display_name,
          credentials_required, stream_verified, rtsp_validated, compatibility,
          duplicate_status, compatibility_status, hardware_id,
          existing_device_association, status_reason)
       SELECT n.tenant_id, n.id, $2, $3, $4, $5, $6, $7::inet, $8, $9, $10::jsonb,
              $11::jsonb, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21,
              $22, $23, $24, $25, $26, $27
       FROM resource_nodes n
       JOIN edge_agents agent
         ON agent.id = $2
        AND agent.branch_node_id = n.id
        AND agent.tenant_id = n.tenant_id
       WHERE n.id = $1 AND n.node_type = 'branch'
       ON CONFLICT (branch_node_id, physical_channel_key) DO UPDATE
       SET edge_agent_id = EXCLUDED.edge_agent_id,
           discovery_method = EXCLUDED.discovery_method,
           manufacturer = EXCLUDED.manufacturer,
           vendor = EXCLUDED.vendor,
           model = EXCLUDED.model,
           ip_address = EXCLUDED.ip_address,
           onvif_port = EXCLUDED.onvif_port,
           rtsp_port = EXCLUDED.rtsp_port,
           profiles = EXCLUDED.profiles,
           capabilities = EXCLUDED.capabilities,
           source_type = EXCLUDED.source_type,
           recorder_id = EXCLUDED.recorder_id,
           recorder_serial_number = EXCLUDED.recorder_serial_number,
           serial_number = EXCLUDED.serial_number,
           firmware_version = EXCLUDED.firmware_version,
           display_name = EXCLUDED.display_name,
           credentials_required = EXCLUDED.credentials_required,
           stream_verified = EXCLUDED.stream_verified,
           rtsp_validated = EXCLUDED.rtsp_validated,
           compatibility = EXCLUDED.compatibility,
           duplicate_status = EXCLUDED.duplicate_status,
           compatibility_status = EXCLUDED.compatibility_status,
           hardware_id = EXCLUDED.hardware_id,
           existing_device_association = EXCLUDED.existing_device_association,
           status_reason = EXCLUDED.status_reason,
           discovered_at = now()
       RETURNING id::text, discovered_at`,
      [
        branchId,
        input.edgeAgentId,
        input.discoveryMethod,
        input.manufacturer ?? input.vendor,
        input.vendor,
        input.model,
        input.ipAddress,
        input.onvifPort,
        input.rtspPort,
        JSON.stringify(input.profiles),
        JSON.stringify(input.capabilities),
        input.sourceType ?? "ip-camera",
        input.recorderId ?? null,
        input.recorderChannel ?? 0,
        input.recorderSerialNumber ?? null,
        input.serialNumber ?? null,
        input.firmwareVersion ?? null,
        input.displayName ?? null,
        input.credentialsRequired ?? null,
        input.streamVerified ?? null,
        input.rtspValidated ?? null,
        input.compatibility ?? null,
        input.duplicateStatus ?? null,
        input.compatibilityStatus ?? null,
        input.hardwareId ?? null,
        input.existingDeviceAssociation ?? null,
        input.statusReason ?? null,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error("invalid_branch");
    return {
      id: row.id,
      branchId,
      ...input,
      status: "pending",
      discoveredAt: row.discovered_at.toISOString(),
    };
  }

  async listDiscoveries(branchId: string): Promise<DiscoveredCamera[]> {
    const result = await this.pool.query<{
      id: string;
      branch_node_id: string;
      edge_agent_id: string;
      discovery_method: string;
      manufacturer: string;
      vendor: string;
      model: string;
      ip_address: string;
      onvif_port: number;
      rtsp_port: number;
      profiles: string;
      capabilities: string;
      discovered_at: Date;
      status: string;
      source_type: "ip-camera" | "analog-dvr-channel" | "nvr-channel";
      recorder_id: string | null;
      recorder_channel: number;
      recorder_serial_number: string | null;
      serial_number: string | null;
      firmware_version: string | null;
      display_name: string | null;
      credentials_required: boolean | null;
      stream_verified: boolean | null;
      rtsp_validated: boolean | null;
      compatibility: string | null;
      duplicate_status: string | null;
      compatibility_status: string | null;
      hardware_id: string | null;
      existing_device_association: string | null;
      status_reason: string | null;
    }>(
      `SELECT id::text, branch_node_id::text, edge_agent_id::text,
              COALESCE(discovery_method, 'edge-agent-reported-inventory') AS discovery_method,
              COALESCE(manufacturer, vendor) AS manufacturer,
              vendor, model, host(ip_address) AS ip_address, onvif_port,
              rtsp_port, profiles, capabilities, discovered_at, status,
              source_type, recorder_id, recorder_channel, recorder_serial_number,
              serial_number, firmware_version, display_name, credentials_required,
              stream_verified, rtsp_validated, compatibility, duplicate_status,
              compatibility_status, hardware_id, existing_device_association,
              status_reason
       FROM camera_discoveries
       WHERE branch_node_id = $1 AND status = 'pending'
       ORDER BY discovered_at DESC`,
      [branchId],
    );

    return result.rows.map((row) => ({
      id: row.id,
      branchId: row.branch_node_id,
      edgeAgentId: row.edge_agent_id,
      discoveryMethod: row.discovery_method as any,
      manufacturer: row.manufacturer || 'Unknown',
      vendor: row.vendor as "hikvision" | "cp-plus" | "other",
      model: row.model,
      ipAddress: row.ip_address,
      onvifPort: row.onvif_port,
      rtspPort: row.rtsp_port,
      profiles: typeof row.profiles === "string"
        ? JSON.parse(row.profiles)
        : row.profiles,
      capabilities: typeof row.capabilities === "string"
        ? JSON.parse(row.capabilities)
        : row.capabilities,
      sourceType: row.source_type,
      ...(row.recorder_id ? { recorderId: row.recorder_id } : {}),
      ...(row.recorder_channel > 0 ? { recorderChannel: row.recorder_channel } : {}),
      ...(row.recorder_serial_number ? { recorderSerialNumber: row.recorder_serial_number } : {}),
      ...(row.serial_number ? { serialNumber: row.serial_number } : {}),
      ...(row.firmware_version ? { firmwareVersion: row.firmware_version } : {}),
      ...(row.display_name ? { displayName: row.display_name } : {}),
      ...(row.credentials_required !== null ? { credentialsRequired: row.credentials_required } : {}),
      ...(row.stream_verified !== null ? { streamVerified: row.stream_verified } : {}),
      ...(row.rtsp_validated !== null ? { rtspValidated: row.rtsp_validated } : {}),
      ...(row.compatibility ? { compatibility: row.compatibility } : {}),
      ...(row.duplicate_status ? { duplicateStatus: row.duplicate_status as DiscoveredCamera["duplicateStatus"] } : {}),
      ...(row.compatibility_status ? { compatibilityStatus: row.compatibility_status as DiscoveredCamera["compatibilityStatus"] } : {}),
      ...(row.hardware_id ? { hardwareId: row.hardware_id } : {}),
      ...(row.existing_device_association ? { existingDeviceAssociation: row.existing_device_association } : {}),
      ...(row.status_reason ? { statusReason: row.status_reason } : {}),
      discoveredAt: row.discovered_at.toISOString(),
      status: row.status as "pending" | "approved" | "rejected",
    }));
  }
}
