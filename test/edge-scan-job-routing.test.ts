import { describe, expect, it, vi } from "vitest";
import { EdgeAgentRepository } from "../src/database/edge-agent-repository.js";

describe("PostgreSQL edge scan job routing", () => {
  it("allows only the assigned edge agent to claim a queued scan", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const repository = new EdgeAgentRepository(
      { query } as never,
      {} as never,
    );

    await repository.claimScanJob("00000000-0000-4000-8000-000000000123");

    const sql = String(query.mock.calls[0]?.[0]);
    expect(sql).toContain("job.edge_agent_id = agent.id");
    expect(sql).not.toContain("job.branch_node_id = agent.branch_node_id");
  });

  it("never falls back to an agent from another branch when creating a scan", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const repository = new EdgeAgentRepository(
      { query } as never,
      {} as never,
    );

    await expect(repository.createScanJob(
      "00000000-0000-4000-8000-000000000111",
      "00000000-0000-4000-8000-000000000123",
    )).rejects.toThrow("edge_agent_not_found");

    const sql = String(query.mock.calls[0]?.[0]);
    expect(sql).toContain("WHERE branch_node_id = branch.id");
    expect(sql).not.toContain("OR true");
  });
});
