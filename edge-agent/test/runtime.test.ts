import { describe, expect, it } from "vitest";
import { loadEdgeConfig } from "../src/config.js";
import { parseEnvironmentFile } from "../src/runtime.js";

describe("edge-agent runtime configuration", () => {
  it("parses the branch installer environment format", () => {
    expect(parseEnvironmentFile([
      "\uFEFF# branch configuration",
      'CONTROL_PLANE_URL="https://control.example.com"',
      'EDGE_AGENT_NAME="Branch \\"A\\""',
      "export BRANCH_ID='branch-001'",
      "EMPTY=",
    ].join("\r\n"))).toEqual({
      CONTROL_PLANE_URL: "https://control.example.com",
      EDGE_AGENT_NAME: 'Branch "A"',
      BRANCH_ID: "branch-001",
      EMPTY: "",
    });
  });

  it("requires a dashboard-issued agent id when bridge authentication is enabled", () => {
    expect(() => loadEdgeConfig({
      CONTROL_PLANE_URL: "https://control.example.com",
      BRANCH_ID: "branch-001",
      EDGE_AGENT_NAME: "Branch edge",
      EDGE_BRIDGE_SHARED_KEY: "s".repeat(43),
    })).toThrow(/EDGE_AGENT_ID is required/);

    expect(loadEdgeConfig({
      CONTROL_PLANE_URL: "https://control.example.com",
      BRANCH_ID: "branch-001",
      EDGE_AGENT_ID: "edge-001",
      EDGE_AGENT_NAME: "Branch edge",
      EDGE_BRIDGE_SHARED_KEY: "s".repeat(43),
    }).EDGE_AGENT_ID).toBe("edge-001");
  });
});
