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
};

function mapAgent(row: AgentRow): EdgeAgent {
  return {
    id: row.id,
    branchId: row.branch_node_id,
    name: row.name,
    version: row.version,
    status: row.status,
    lastSeenAt: row.last_seen_at?.toISOString() ?? null,
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
                 last_seen_at`,
      [branchId, name, version],
    );
    if (!result.rows[0]) throw new Error("invalid_branch");
    return mapAgent(result.rows[0]);
  }

  async listByBranch(branchId: string) {
    const result = await this.pool.query<AgentRow>(
      `SELECT id::text, branch_node_id::text, name, version, status,
              last_seen_at
       FROM edge_agents
       WHERE branch_node_id = $1
       ORDER BY name, created_at`,
      [branchId],
    );
    return result.rows.map(mapAgent);
  }

  async heartbeat(id: string, version: string) {
    const result = await this.pool.query<AgentRow>(
      `UPDATE edge_agents
       SET version = $2, status = 'online', last_seen_at = now()
       WHERE id = $1
       RETURNING id::text, branch_node_id::text, name, version, status,
                 last_seen_at`,
      [id, version],
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
         ORDER BY CASE status WHEN 'online' THEN 0 ELSE 1 END, last_seen_at DESC NULLS LAST
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
         (tenant_id, branch_node_id, edge_agent_id, vendor, model, ip_address,
          onvif_port, rtsp_port, profiles, capabilities)
       SELECT n.tenant_id, n.id, $2, $3, $4, $5::inet, $6, $7, $8::jsonb,
              $9::jsonb
       FROM resource_nodes n
       JOIN edge_agents agent
         ON agent.id = $2
        AND agent.branch_node_id = n.id
        AND agent.tenant_id = n.tenant_id
       WHERE n.id = $1 AND n.node_type = 'branch'
       ON CONFLICT (edge_agent_id, ip_address, onvif_port) DO UPDATE
       SET vendor = EXCLUDED.vendor,
           model = EXCLUDED.model,
           rtsp_port = EXCLUDED.rtsp_port,
           profiles = EXCLUDED.profiles,
           capabilities = EXCLUDED.capabilities,
           status = 'pending',
           discovered_at = now()
       RETURNING id::text, discovered_at`,
      [
        branchId,
        input.edgeAgentId,
        input.vendor,
        input.model,
        input.ipAddress,
        input.onvifPort,
        input.rtspPort,
        JSON.stringify(input.profiles),
        JSON.stringify(input.capabilities),
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
      vendor: string;
      model: string;
      ip_address: string;
      onvif_port: number;
      rtsp_port: number;
      profiles: string;
      capabilities: string;
      discovered_at: Date;
      status: string;
    }>(
      `SELECT id::text, branch_node_id::text, edge_agent_id::text, vendor, model,
              host(ip_address) as ip_address, onvif_port, rtsp_port, profiles,
              capabilities, discovered_at, status
       FROM camera_discoveries
       WHERE branch_node_id = $1 AND status = 'pending'
       ORDER BY discovered_at DESC`,
      [branchId],
    );

    return result.rows.map((row) => ({
      id: row.id,
      branchId: row.branch_node_id,
      edgeAgentId: row.edge_agent_id,
      vendor: row.vendor as "hikvision" | "cp-plus" | "other",
      model: row.model,
      ipAddress: row.ip_address,
      onvifPort: row.onvif_port,
      rtspPort: row.rtsp_port,
      profiles: JSON.parse(row.profiles),
      capabilities: JSON.parse(row.capabilities),
      discoveredAt: row.discovered_at.toISOString(),
      status: row.status as "pending" | "approved" | "rejected",
    }));
  }
}
