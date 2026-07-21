import type { Pool } from "pg";
import type { DiscoveredCamera, EdgeAgent } from "../domain/models.js";
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
