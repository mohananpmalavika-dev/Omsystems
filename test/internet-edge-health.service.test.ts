import { describe, expect, it } from "vitest";
import { normalizeEdgeAgentMetrics } from "../src/operational-health/edge-agent-health.js";
import { normalizeNetworkMetrics } from "../src/operational-health/network-health.js";
import { defaultOperationalHealthPolicy } from "../src/operational-health/types.js";

describe("internet and edge health normalization", () => {
  it("turns a critical real edge resource measurement into degraded health", () => {
    const normalized = normalizeEdgeAgentMetrics({ status: "online", cpuUsedPercent: 96, memoryUsedPercent: 30, diskUsedPercent: 40 }, defaultOperationalHealthPolicy);
    expect(normalized.metrics.status).toBe("degraded");
    expect(normalized.reasonCodes).toContain("edge_agent_resource_critical");
  });

  it("keeps an unverified link explicit rather than using it in failover health", () => {
    const normalized = normalizeNetworkMetrics({ connectivity: true, routeVerified: false, latencyMs: 12 }, defaultOperationalHealthPolicy);
    expect(normalized.metrics.status).toBe("unknown");
    expect(normalized.reasonCodes).toContain("internet_route_unverified");
  });
});
