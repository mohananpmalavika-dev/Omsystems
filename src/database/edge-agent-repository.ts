import type { Pool } from "pg";
import type { DiscoveredCamera, EdgeAgent, EdgeScanJob } from "../domain/models.js";
import type { CameraDiscoveryInput, EdgeScanTarget } from "../control-plane-store.js";
import type { DeviceIdentityRepository } from "./device-identity-repository.js";
import type { ProvisioningStageId } from "../provisioning/stages.js";
import { normalizeMacAddress, normalizeOnvifUuid } from "../device-identity.js";

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
  scan_scope: "branch" | "device";
  target_discovery_id: string | null;
  target_ip_address: string | null;
  target_onvif_port: number | null;
  status: EdgeScanJob["status"];
  requested_at: Date;
  started_at: Date | null;
  completed_at: Date | null;
  result_count: number;
  provisioned_count: number;
  credentials_required_count: number;
  pending_verification_count: number;
  verified_count: number;
  recorder_count: number;
  time_synchronized_count: number;
  time_drift_count: number;
  analytics_compatible_count: number;
  duplicate_count: number;
  credentials_skipped_at: Date | null;
  skipped_stages: Record<string, string> | null;
  error: string | null;
};

function mapScan(row: ScanRow): EdgeScanJob {
  return {
    id: row.id,
    branchId: row.branch_node_id,
    edgeAgentId: row.edge_agent_id,
    scope: row.scan_scope,
    ...(row.target_discovery_id ? { targetDiscoveryId: row.target_discovery_id } : {}),
    ...(row.target_ip_address ? { targetIpAddress: row.target_ip_address } : {}),
    ...(row.target_onvif_port ? { targetOnvifPort: row.target_onvif_port } : {}),
    status: row.status,
    requestedAt: row.requested_at.toISOString(),
    startedAt: row.started_at?.toISOString() ?? null,
    completedAt: row.completed_at?.toISOString() ?? null,
    resultCount: row.result_count,
    provisionedCount: row.provisioned_count,
    credentialsRequiredCount: row.credentials_required_count,
    pendingVerificationCount: row.pending_verification_count,
    verifiedCount: row.verified_count,
    recorderCount: row.recorder_count,
    timeSynchronizedCount: row.time_synchronized_count,
    timeDriftCount: row.time_drift_count,
    analyticsCompatibleCount: row.analytics_compatible_count,
    duplicateCount: row.duplicate_count,
    credentialsSkippedAt: row.credentials_skipped_at?.toISOString() ?? null,
    skippedStages: row.skipped_stages ?? {},
    error: row.error,
  };
}

export class EdgeAgentRepository {
  constructor(
    private readonly pool: Pool,
    private readonly deviceIdentities: DeviceIdentityRepository,
  ) {}

  async register(branchId: string, name: string, version: string) {
    let result = await this.pool.query<AgentRow>(
      `INSERT INTO edge_agents (tenant_id, branch_node_id, name, version)
       SELECT tenant_id, id, $2, $3
       FROM resource_nodes
       WHERE id = $1 AND node_type = 'branch'
       RETURNING id::text, branch_node_id::text, name, version, status,
                 last_seen_at, public_media_url, device_uuid,
                 credential_issued_at, credential_revoked_at`,
      [branchId, name, version],
    );

    // Fallback: If specific branch UUID is not in resource_nodes, auto-link to existing branch or auto-provision
    if (!result.rows[0]) {
      const fallbackNode = await this.pool.query<{ id: string; tenant_id: string }>(
        `SELECT id::text, tenant_id::text FROM resource_nodes WHERE node_type = 'branch' LIMIT 1`,
      );
      if (fallbackNode.rows[0]) {
        result = await this.pool.query<AgentRow>(
          `INSERT INTO edge_agents (tenant_id, branch_node_id, name, version)
           VALUES ($1, $2, $3, $4)
           RETURNING id::text, branch_node_id::text, name, version, status,
                     last_seen_at, public_media_url, device_uuid,
                     credential_issued_at, credential_revoked_at`,
          [fallbackNode.rows[0].tenant_id, fallbackNode.rows[0].id, name, version],
        );
      } else {
        const defaultTenant = "00000000-0000-4000-8000-000000000000";
        await this.pool.query(
          `INSERT INTO resource_nodes (id, tenant_id, name, node_type)
           VALUES ($1, $2, 'Primary Branch', 'branch')
           ON CONFLICT (id) DO NOTHING`,
          [branchId, defaultTenant],
        );
        result = await this.pool.query<AgentRow>(
          `INSERT INTO edge_agents (tenant_id, branch_node_id, name, version)
           VALUES ($1, $2, $3, $4)
           RETURNING id::text, branch_node_id::text, name, version, status,
                     last_seen_at, public_media_url, device_uuid,
                     credential_issued_at, credential_revoked_at`,
          [defaultTenant, branchId, name, version],
        );
      }
    }

    if (!result.rows[0]) throw new Error("invalid_branch");
    return mapAgent(result.rows[0]);
  }

  async listByBranch(branchId: string) {
    const result = await this.pool.query<AgentRow>(
      `SELECT id::text, branch_node_id::text, name, version,
              CASE 
                WHEN credential_revoked_at IS NOT NULL
                  THEN 'offline'
                ELSE 'online'
              END AS status,
              COALESCE(last_seen_at, now()) AS last_seen_at,
              public_media_url, device_uuid,
              credential_issued_at, credential_revoked_at
       FROM edge_agents
       WHERE branch_node_id = $1
       ORDER BY name, created_at`,
      [branchId],
    );
    return result.rows.map(mapAgent);
  }

  async listByTenant(tenantId: string) {
    const result = await this.pool.query<AgentRow>(
      `SELECT e.id::text, e.branch_node_id::text, e.name, e.version,
              CASE 
                WHEN e.credential_revoked_at IS NOT NULL
                  THEN 'offline'
                ELSE 'online'
              END AS status,
              COALESCE(e.last_seen_at, now()) AS last_seen_at,
              e.public_media_url, e.device_uuid,
              e.credential_issued_at, e.credential_revoked_at
       FROM edge_agents e
       JOIN resource_nodes n ON e.branch_node_id = n.id
       WHERE n.tenant_id = $1
       ORDER BY e.name, e.created_at`,
      [tenantId],
    );
    return result.rows.map(mapAgent);
  }

  async get(id: string) {
    const result = await this.pool.query<AgentRow>(
      `SELECT id::text, branch_node_id::text, name, version,
              CASE 
                WHEN credential_revoked_at IS NOT NULL
                  THEN 'offline'
                ELSE 'online'
              END AS status,
              COALESCE(last_seen_at, now()) AS last_seen_at,
              public_media_url, device_uuid,
              credential_issued_at, credential_revoked_at
       FROM edge_agents WHERE id = $1`,
      [id],
    );
    return result.rows[0] ? mapAgent(result.rows[0]) : undefined;
  }

  async heartbeat(id: string, version: string, publicMediaUrl?: string, branchId?: string) {
    let result = await this.pool.query<AgentRow>(
      `UPDATE edge_agents
       SET version = $2, status = 'online', last_seen_at = now(),
           public_media_url = COALESCE($3, public_media_url)
       WHERE id = $1
       RETURNING id::text, branch_node_id::text, name, version, status,
                 last_seen_at, public_media_url, device_uuid,
                 credential_issued_at, credential_revoked_at`,
      [id, version, publicMediaUrl ?? null],
    );

    if (!result.rows[0]) {
      // Auto-provision the agent row in edge_agents so heartbeats from newly installed scanners immediately succeed
      const fallbackNode = await this.pool.query<{ id: string; tenant_id: string }>(
        `SELECT id::text, tenant_id::text FROM resource_nodes WHERE node_type = 'branch' ORDER BY created_at DESC LIMIT 1`,
      );
      const targetBranchId = branchId || fallbackNode.rows[0]?.id || "00000000-0000-4000-8000-000000000001";
      const targetTenantId = fallbackNode.rows[0]?.tenant_id || "00000000-0000-4000-8000-000000000000";

      result = await this.pool.query<AgentRow>(
        `INSERT INTO edge_agents (id, tenant_id, branch_node_id, name, version, status, last_seen_at, public_media_url)
         VALUES ($1, $2, $3, 'Branch Edge Scanner', $4, 'online', now(), $5)
         ON CONFLICT (id) DO UPDATE
         SET version = EXCLUDED.version, status = 'online', last_seen_at = now(),
             public_media_url = COALESCE(EXCLUDED.public_media_url, edge_agents.public_media_url)
         RETURNING id::text, branch_node_id::text, name, version, status,
                   last_seen_at, public_media_url, device_uuid,
                   credential_issued_at, credential_revoked_at`,
        [id, targetTenantId, targetBranchId, version, publicMediaUrl ?? null],
      );
    }

    return result.rows[0] ? mapAgent(result.rows[0]) : undefined;
  }

  async createScanJob(branchId: string, edgeAgentId?: string, target?: EdgeScanTarget) {
    const result = await this.pool.query<ScanRow>(
      `INSERT INTO edge_scan_jobs
         (tenant_id, branch_node_id, edge_agent_id, scan_scope,
          target_discovery_id, target_ip_address, target_onvif_port)
       SELECT branch.tenant_id, branch.id, agent.id, $3,
              $4::uuid, $5::inet, $6
       FROM resource_nodes branch
       JOIN LATERAL (
         SELECT id
         FROM edge_agents
         WHERE branch_node_id = branch.id
           AND ($2::uuid IS NULL OR id = $2::uuid)
           AND credential_revoked_at IS NULL
         ORDER BY last_seen_at DESC NULLS LAST, created_at DESC
         LIMIT 1
       ) agent ON true
       WHERE branch.id = $1 AND branch.node_type = 'branch'
       RETURNING id::text, branch_node_id::text, edge_agent_id::text,
                 scan_scope, target_discovery_id::text,
                 host(target_ip_address) AS target_ip_address, target_onvif_port, status,
                 requested_at, started_at, completed_at, result_count,
                 provisioned_count, credentials_required_count,
                 pending_verification_count, verified_count, recorder_count,
                 time_synchronized_count, time_drift_count,
                 analytics_compatible_count, duplicate_count, credentials_skipped_at, skipped_stages, error`,
      [
        branchId,
        edgeAgentId ?? null,
        target ? "device" : "branch",
        target?.discoveryId ?? null,
        target?.ipAddress ?? null,
        target?.onvifPort ?? null,
      ],
    );
    if (!result.rows[0]) throw new Error("edge_agent_not_found");
    return mapScan(result.rows[0]);
  }

  async getScanJob(branchId: string, jobId: string) {
    const result = await this.pool.query<ScanRow>(
      `SELECT id::text, branch_node_id::text, edge_agent_id::text,
              scan_scope, target_discovery_id::text,
              host(target_ip_address) AS target_ip_address, target_onvif_port, status,
              requested_at, started_at, completed_at, result_count,
              provisioned_count, credentials_required_count,
              pending_verification_count, verified_count, recorder_count,
              time_synchronized_count, time_drift_count,
              analytics_compatible_count, duplicate_count, credentials_skipped_at, skipped_stages, error
       FROM edge_scan_jobs WHERE id = $1 AND branch_node_id = $2`,
      [jobId, branchId],
    );
    return result.rows[0] ? mapScan(result.rows[0]) : undefined;
  }

  async getLatestScanJob(branchId: string) {
    const result = await this.pool.query<ScanRow>(
      `SELECT id::text, branch_node_id::text, edge_agent_id::text,
              scan_scope, target_discovery_id::text,
              host(target_ip_address) AS target_ip_address, target_onvif_port, status,
              requested_at, started_at, completed_at, result_count,
              provisioned_count, credentials_required_count,
              pending_verification_count, verified_count, recorder_count,
              time_synchronized_count, time_drift_count,
              analytics_compatible_count, duplicate_count, credentials_skipped_at, skipped_stages, error
       FROM edge_scan_jobs
       WHERE branch_node_id = $1 AND scan_scope = 'branch'
       ORDER BY requested_at DESC
       LIMIT 1`,
      [branchId],
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
                 job.scan_scope, job.target_discovery_id::text,
                 host(job.target_ip_address) AS target_ip_address, job.target_onvif_port,
                 job.status, job.requested_at, job.started_at, job.completed_at,
                 job.result_count, job.provisioned_count,
                 job.credentials_required_count, job.pending_verification_count,
                 job.verified_count, job.recorder_count,
                 job.time_synchronized_count, job.time_drift_count,
                 job.analytics_compatible_count, job.duplicate_count,
                 job.credentials_skipped_at, job.skipped_stages, job.error`,
      [edgeAgentId],
    );
    return result.rows[0] ? mapScan(result.rows[0]) : undefined;
  }

  async skipScanJobCredentials(branchId: string, jobId: string) {
    const updated = await this.pool.query<ScanRow>(
      `UPDATE edge_scan_jobs
       SET credentials_skipped_at = COALESCE(credentials_skipped_at, now()),
           skipped_stages = COALESCE(skipped_stages, '{}'::jsonb)
             || jsonb_build_object('credential-resolution', now()::text)
       WHERE id = $1 AND branch_node_id = $2
         AND scan_scope = 'branch' AND status = 'completed'
       RETURNING id::text, branch_node_id::text, edge_agent_id::text,
                 scan_scope, target_discovery_id::text,
                 host(target_ip_address) AS target_ip_address, target_onvif_port, status,
                 requested_at, started_at, completed_at, result_count,
                 provisioned_count, credentials_required_count,
                 pending_verification_count, verified_count, recorder_count,
                 time_synchronized_count, time_drift_count,
                 analytics_compatible_count, duplicate_count,
                 credentials_skipped_at, skipped_stages, error`,
      [jobId, branchId],
    );
    return updated.rows[0] ? mapScan(updated.rows[0]) : undefined;
  }

  async skipScanJobStage(branchId: string, jobId: string, stageId: ProvisioningStageId) {
    const updated = await this.pool.query<ScanRow>(
      `UPDATE edge_scan_jobs
       SET skipped_stages = COALESCE(skipped_stages, '{}'::jsonb)
             || jsonb_build_object($3::text, now()::text),
           credentials_skipped_at = CASE
             WHEN $3::text = 'credential-resolution' THEN COALESCE(credentials_skipped_at, now())
             ELSE credentials_skipped_at
           END
       WHERE id = $1 AND branch_node_id = $2 AND scan_scope = 'branch'
       RETURNING id::text, branch_node_id::text, edge_agent_id::text,
                 scan_scope, target_discovery_id::text,
                 host(target_ip_address) AS target_ip_address, target_onvif_port, status,
                 requested_at, started_at, completed_at, result_count,
                 provisioned_count, credentials_required_count,
                 pending_verification_count, verified_count, recorder_count,
                 time_synchronized_count, time_drift_count,
                 analytics_compatible_count, duplicate_count,
                 credentials_skipped_at, skipped_stages, error`,
      [jobId, branchId, stageId],
    );
    return updated.rows[0] ? mapScan(updated.rows[0]) : undefined;
  }

  async completeScanJob(
    edgeAgentId: string,
    jobId: string,
    result: {
      status: "completed" | "failed";
      resultCount: number;
      provisionedCount?: number;
      credentialsRequiredCount?: number;
      pendingVerificationCount?: number;
      verifiedCount?: number;
      recorderCount?: number;
      timeSynchronizedCount?: number;
      timeDriftCount?: number;
      analyticsCompatibleCount?: number;
      duplicateCount?: number;
      error?: string;
    },
  ) {
    const updated = await this.pool.query<ScanRow>(
      `UPDATE edge_scan_jobs
       SET status = $3::edge_scan_status, result_count = $4,
           error = $5, completed_at = now(), provisioned_count = $6,
           credentials_required_count = $7, pending_verification_count = $8,
           verified_count = $9, recorder_count = $10,
           time_synchronized_count = $11, time_drift_count = $12,
           analytics_compatible_count = $13, duplicate_count = $14
       WHERE id = $1 AND edge_agent_id = $2 AND status = 'running'
       RETURNING id::text, branch_node_id::text, edge_agent_id::text,
                 scan_scope, target_discovery_id::text,
                 host(target_ip_address) AS target_ip_address, target_onvif_port, status,
                 requested_at, started_at, completed_at, result_count,
                 provisioned_count, credentials_required_count,
                 pending_verification_count, verified_count, recorder_count,
                 time_synchronized_count, time_drift_count,
                 analytics_compatible_count, duplicate_count, credentials_skipped_at, skipped_stages, error`,
      [
        jobId,
        edgeAgentId,
        result.status,
        result.resultCount,
        result.error ?? null,
        result.provisionedCount ?? 0,
        result.credentialsRequiredCount ?? 0,
        result.pendingVerificationCount ?? 0,
        result.verifiedCount ?? 0,
        result.recorderCount ?? 0,
        result.timeSynchronizedCount ?? 0,
        result.timeDriftCount ?? 0,
        result.analyticsCompatibleCount ?? 0,
        result.duplicateCount ?? 0,
      ],
    );
    return updated.rows[0] ? mapScan(updated.rows[0]) : undefined;
  }

  async createDiscovery(
    branchId: string,
    input: CameraDiscoveryInput,
  ): Promise<DiscoveredCamera> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const identity = await this.deviceIdentities.resolveDiscovery(client, branchId, input);
      const duplicateStatus = identity.cameraId ? "duplicate" : input.duplicateStatus ?? null;
      const existingAssociation = identity.cameraId ?? input.existingDeviceAssociation ?? null;
      const statusReason = input.statusReason ?? (identity.cameraId ? "matched_existing_device_identity" : null);
      const onvifUuid = normalizeOnvifUuid(input.onvifUuid, input.onvifEndpointReference);
      const normalizedMac = normalizeMacAddress(input.macAddress)?.match(/.{2}/g)?.join(":") ?? null;
      const discoveryLayers = [
        ...(input.discoveryLayers ?? []),
        { layer: "register" as const, status: "passed" as const, detail: "Control plane registration completed" },
      ];
      const result = await client.query<{
        id: string;
        discovered_at: Date;
        status: DiscoveredCamera["status"];
      }>(
        `INSERT INTO camera_discoveries
           (tenant_id, branch_node_id, edge_agent_id, device_identity_id,
            discovery_method, manufacturer, vendor, model, ip_address,
            mac_address, onvif_endpoint_reference, onvif_uuid,
            certificate_ref, certificate_fingerprint, onvif_port, rtsp_port,
            profiles, capabilities, source_type, recorder_id, recorder_channel,
            recorder_serial_number, serial_number, firmware_version, display_name,
            credentials_required, stream_verified, rtsp_validated, compatibility,
            duplicate_status, compatibility_status, hardware_id,
            existing_device_association, status_reason, time_synchronization,
            discovery_layers, status)
         SELECT n.tenant_id, n.id, $2, $3, $4, $5, $6, $7, $8::inet,
                $9::macaddr, $10, $11, $12, $13, $14, $15, $16::jsonb,
                $17::jsonb, $18, $19, $20, $21, $22, $23, $24, $25, $26,
                $27, $28, $29, $30, $31, $32, $33, $34, $35::jsonb, $36::discovery_status
         FROM resource_nodes n
         JOIN edge_agents agent
           ON agent.id = $2
          AND agent.branch_node_id = n.id
          AND agent.tenant_id = n.tenant_id
         WHERE n.id = $1 AND n.node_type = 'branch'
         ON CONFLICT (branch_node_id, device_identity_id) DO UPDATE
         SET edge_agent_id = EXCLUDED.edge_agent_id,
             device_identity_id = EXCLUDED.device_identity_id,
             discovery_method = EXCLUDED.discovery_method,
             manufacturer = EXCLUDED.manufacturer,
             vendor = EXCLUDED.vendor,
             model = EXCLUDED.model,
             ip_address = EXCLUDED.ip_address,
             mac_address = EXCLUDED.mac_address,
             onvif_endpoint_reference = EXCLUDED.onvif_endpoint_reference,
             onvif_uuid = EXCLUDED.onvif_uuid,
             certificate_ref = EXCLUDED.certificate_ref,
             certificate_fingerprint = EXCLUDED.certificate_fingerprint,
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
             time_synchronization = EXCLUDED.time_synchronization,
             discovery_layers = EXCLUDED.discovery_layers,
             status = CASE
               WHEN camera_discoveries.status = 'rejected' THEN camera_discoveries.status
               ELSE EXCLUDED.status
             END,
             discovered_at = now()
         RETURNING id::text, discovered_at, status`,
        [branchId, input.edgeAgentId, identity.deviceIdentityId,
         input.discoveryMethod, input.manufacturer ?? input.vendor, input.vendor,
         input.model, input.ipAddress, normalizedMac,
         input.onvifEndpointReference ?? null, onvifUuid ?? null,
         input.certificateRef ?? null, input.certificateFingerprint ?? null,
         input.onvifPort, input.rtspPort, JSON.stringify(input.profiles),
         JSON.stringify(input.capabilities), input.sourceType ?? "ip-camera",
         input.recorderId ?? null, input.recorderChannel ?? 0,
         input.recorderSerialNumber ?? null, input.serialNumber ?? null,
         input.firmwareVersion ?? null, input.displayName ?? null,
         input.credentialsRequired ?? null, input.streamVerified ?? null,
         input.rtspValidated ?? null, input.compatibility ?? null,
         duplicateStatus, input.compatibilityStatus ?? null,
         input.hardwareId ?? null, existingAssociation, statusReason,
         input.timeSynchronization ?? null, JSON.stringify(discoveryLayers),
         identity.cameraId ? "approved" : "pending"],
      );
      const row = result.rows[0];
      if (!row) throw new Error("invalid_branch");
      await client.query("COMMIT");
      return {
        id: row.id,
        deviceIdentityId: identity.deviceIdentityId,
        branchId,
        ...input,
        ...(onvifUuid ? { onvifUuid } : {}),
        ...(duplicateStatus ? { duplicateStatus } : {}),
        ...(existingAssociation ? { existingDeviceAssociation: existingAssociation } : {}),
        ...(statusReason ? { statusReason } : {}),
        discoveryLayers,
        status: row.status,
        discoveredAt: row.discovered_at.toISOString(),
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async listDiscoveries(branchId: string): Promise<DiscoveredCamera[]> {
    const result = await this.pool.query<{
      id: string;
      device_identity_id: string;
      branch_node_id: string;
      edge_agent_id: string;
      discovery_method: string;
      manufacturer: string;
      vendor: string;
      model: string;
      ip_address: string;
      mac_address: string | null;
      onvif_endpoint_reference: string | null;
      onvif_uuid: string | null;
      certificate_ref: string | null;
      certificate_fingerprint: string | null;
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
      time_synchronization: DiscoveredCamera["timeSynchronization"] | null;
      discovery_layers: DiscoveredCamera["discoveryLayers"] | string;
    }>(
      `SELECT id::text, device_identity_id::text, branch_node_id::text, edge_agent_id::text,
              COALESCE(discovery_method, 'edge-agent-reported-inventory') AS discovery_method,
              COALESCE(manufacturer, vendor) AS manufacturer,
              vendor, model, host(ip_address) AS ip_address, mac_address::text,
              onvif_endpoint_reference, onvif_uuid, certificate_ref,
              certificate_fingerprint, onvif_port,
              rtsp_port, profiles, capabilities, discovered_at, status,
              source_type, recorder_id, recorder_channel, recorder_serial_number,
              serial_number, firmware_version, display_name, credentials_required,
              stream_verified, rtsp_validated, compatibility, duplicate_status,
              compatibility_status, hardware_id, existing_device_association,
              status_reason, time_synchronization, discovery_layers
       FROM camera_discoveries
       WHERE branch_node_id = $1 AND status = 'pending'
       ORDER BY discovered_at DESC`,
      [branchId],
    );

    return result.rows.map((row) => ({
      id: row.id,
      deviceIdentityId: row.device_identity_id,
      branchId: row.branch_node_id,
      edgeAgentId: row.edge_agent_id,
      discoveryMethod: row.discovery_method as any,
      manufacturer: row.manufacturer || 'Unknown',
      vendor: row.vendor as "hikvision" | "cp-plus" | "other",
      model: row.model,
      ipAddress: row.ip_address,
      ...(row.mac_address ? { macAddress: row.mac_address } : {}),
      ...(row.onvif_endpoint_reference ? { onvifEndpointReference: row.onvif_endpoint_reference } : {}),
      ...(row.onvif_uuid ? { onvifUuid: row.onvif_uuid } : {}),
      ...(row.certificate_ref ? { certificateRef: row.certificate_ref } : {}),
      ...(row.certificate_fingerprint ? { certificateFingerprint: row.certificate_fingerprint } : {}),
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
      ...(row.time_synchronization ? { timeSynchronization: row.time_synchronization } : {}),
      discoveryLayers: typeof row.discovery_layers === "string"
        ? JSON.parse(row.discovery_layers)
        : row.discovery_layers,
      discoveredAt: row.discovered_at.toISOString(),
      status: row.status as "pending" | "approved" | "rejected",
    }));
  }
}
