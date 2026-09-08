import { describe, expect, it } from "vitest";
import { normalizeEdgeAgentMetrics } from "../src/operational-health/edge-agent-health.js";
import { normalizeNetworkMetrics, projectInternetLink, summarizeBranchInternet } from "../src/operational-health/network-health.js";
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

  it("does not turn missing reachability evidence into an online link", () => {
    const normalized = normalizeNetworkMetrics({ latencyMs: 12 }, defaultOperationalHealthPolicy);
    expect(normalized.metrics.status).toBe("unknown");
    expect(normalized.metrics.connectivity).toBeNull();
    expect(normalized.reasonCodes).toContain("internet_connectivity_unreported");
  });

  it("keeps stale WAN evidence out of failover and outage decisions", () => {
    const now = Date.parse("2026-09-08T12:00:00.000Z");
    const link = projectInternetLink({
      tenantId: "tenant", branchId: "branch", edgeAgentId: "edge", deviceType: "network", deviceId: "backup",
      observedAt: new Date(now - 91_000).toISOString(), receivedAt: new Date(now - 91_000).toISOString(),
      source: "system", quality: "verified", idempotencyKey: "backup:1",
      metrics: { role: "backup", connectivity: true, routeVerified: true, status: "online" }, reasonCodes: [],
    }, { id: "branch", name: "Branch" }, defaultOperationalHealthPolicy, now);
    expect(link.status).toBe("unknown");
    expect(link.connectivity).toBe(false);
    expect(link.reasonCodes).toContain("internet_telemetry_stale");
    expect(summarizeBranchInternet([link]).status).toBe("unknown");
  });
});
