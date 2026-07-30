import { describe, expect, it } from "vitest";
import { loadEdgeConfig } from "../src/config.js";
import { parseEnvironmentFile } from "../src/runtime.js";
import { EMBEDDED_CONFIG_MARKER, readEmbeddedEnvironmentFile } from "../src/embedded-config.js";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

  it("reads a branch configuration appended to the single installer executable", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sentinel-embedded-config-"));
    const path = join(directory, "edge-agent.exe");
    const config = Buffer.from('BRANCH_ID="branch-embedded"\r\n', "utf8");
    const length = Buffer.alloc(4);
    length.writeUInt32LE(config.length, 0);
    await writeFile(path, Buffer.concat([Buffer.from("MZfixture"), config, length, EMBEDDED_CONFIG_MARKER]));
    try {
      expect(readEmbeddedEnvironmentFile(path)).toBe(config.toString("utf8"));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
