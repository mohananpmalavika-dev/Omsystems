import { describe, expect, it, vi } from "vitest";
import { EdgeAgentRepository } from "../src/database/edge-agent-repository.js";
import { EdgeOperationsRepository } from "../src/database/edge-operations-repository.js";

function assignmentRepository(options: { homeNetworks?: string[]; existingNetworks?: string[]; allowTarget?: boolean } = {}) {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes("SELECT tenant_id::text")) return { rows: [{ tenant_id: "tenant", branch_node_id: "home" }] };
    if (sql.includes("SELECT branch_node_id::text, vpn_networks")) return { rows: options.existingNetworks ? [{ branch_node_id: "existing", vpn_networks: options.existingNetworks }] : [] };
    if (sql.includes("SELECT branch.id")) return { rows: options.allowTarget === false ? [] : [{ id: "new" }] };
    if (sql.includes("SELECT vpn_remote_networks")) return { rows: [{ vpn_remote_networks: options.homeNetworks ?? [] }] };
    return { rows: [], rowCount: 1 };
  });
  const client = { query, release: vi.fn() };
  const pool = { connect: vi.fn(async () => client), query: vi.fn()
    .mockResolvedValueOnce({ rows: [{ id: "agent", branch_node_id: "home", name: "HO", version: "0.1.47", status: "online", last_seen_at: new Date(), credential_issued_at: new Date() }] })
    .mockResolvedValueOnce({ rows: [{ edge_agent_id: "agent", branch_node_id: "new", scope_node_id: "region", vpn_networks: ["10.20.1.0/24"] }] }),
  };
  return { repository: new EdgeAgentRepository(pool as never, {} as never), client, pool };
}

describe("PostgreSQL shared branch assignments", () => {
  it("locks the existing agent and commits the branch map before returning hydrated assignments", async () => {
    const { repository, client } = assignmentRepository();
    const result = await repository.assignBranches("agent", [{ branchId: "new", scopeNodeId: "region", vpnNetworks: ["10.20.1.0/24"] }]);
    expect(result).toMatchObject({ branchId: "home", branchAssignments: [{ branchId: "new", scopeNodeId: "region", vpnNetworks: ["10.20.1.0/24"] }] });
    const queries = client.query.mock.calls.map(([sql]) => sql);
    expect(queries[0]).toBe("BEGIN");
    expect(queries[1]).toContain("FOR UPDATE");
    expect(queries.at(-1)).toBe("COMMIT");
    expect(client.release).toHaveBeenCalledOnce();
  });

  it.each([
    { existingNetworks: ["10.20.1.0/24"] },
    { homeNetworks: ["10.20.1.42/32"] },
  ])("rolls back overlap against home or previously assigned branches without writing", async options => {
    const { repository, client, pool } = assignmentRepository(options);
    await expect(repository.assignBranches("agent", [{ branchId: "new", scopeNodeId: "region", vpnNetworks: ["10.20.1.0/24"] }])).rejects.toThrow("overlapping_branch_networks");
    expect(client.query.mock.calls.map(([sql]) => sql).some(sql => sql.includes("INSERT INTO"))).toBe(false);
    expect(client.query).toHaveBeenLastCalledWith("ROLLBACK");
    expect(client.release).toHaveBeenCalledOnce();
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("rolls back when a target fails tenant, hierarchy, or active-node validation", async () => {
    const { repository, client } = assignmentRepository({ allowTarget: false });
    await expect(repository.assignBranches("agent", [{ branchId: "new", scopeNodeId: "region", vpnNetworks: ["10.20.1.0/24"] }])).rejects.toThrow("invalid_branch_assignment");
    expect(client.query).toHaveBeenLastCalledWith("ROLLBACK");
    expect(client.query.mock.calls.map(([sql]) => sql).some(sql => sql.includes("INSERT INTO"))).toBe(false);
  });

  it("retains the requested branch when creating a command and enforces membership in SQL", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const repository = new EdgeOperationsRepository({ query } as never);
    await expect(repository.createCommand({ edgeAgentId: "agent", type: "rediscover", payload: { branchId: "remote" }, requestedBy: "admin" })).rejects.toThrow("edge_agent_not_found_or_revoked");
    const [sql, values] = query.mock.calls[0]! as unknown as [string, unknown[]];
    expect(sql).toContain("COALESCE($5::uuid, agent.branch_node_id)");
    expect(sql).toContain("assignment.tenant_id=agent.tenant_id");
    expect(values.at(-1)).toBe("remote");
  });
});
