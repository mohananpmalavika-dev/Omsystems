import { describe, expect, it } from "vitest";
import { analyze } from "../src/services/command-center/rca.js";
import type { CommandTimelineEvent, OperationalGraph } from "../src/services/command-center/types.js";

describe("Command Center RCA engine", () => {
  it("identifies WAN failure when a branch loses network and camera connectivity simultaneously", () => {
    const graph: OperationalGraph = {
      branch: { id: "branch-001", name: "Branch 001", status: "critical" },
      entities: [
        { id: "branch:branch-001", entityType: "branch", name: "Branch 001", status: "critical", observedAt: "2026-08-10T14:07:12Z", source: "inventory", quality: "inventory", reasonCodes: [], metrics: {} },
        { id: "network:wan-1", entityType: "network", name: "WAN uplink", status: "offline", observedAt: "2026-08-10T14:07:12Z", source: "telemetry", quality: "verified", reasonCodes: [], metrics: { connectivity: false, latencyMs: 450, packetLossPercent: 85 } },
        { id: "recorder:rec-1", entityType: "recorder", name: "DVR 1", status: "offline", observedAt: "2026-08-10T14:07:13Z", source: "telemetry", quality: "verified", reasonCodes: [], metrics: { reachable: false } },
        { id: "camera:cam-1", entityType: "camera", name: "Camera 1", status: "offline", observedAt: "2026-08-10T14:07:14Z", source: "telemetry", quality: "verified", reasonCodes: [], metrics: { reachable: false } },
        { id: "camera:cam-2", entityType: "camera", name: "Camera 2", status: "offline", observedAt: "2026-08-10T14:07:14Z", source: "telemetry", quality: "verified", reasonCodes: [], metrics: { reachable: false } },
      ],
      dependencies: [
        { fromEntityId: "branch:branch-001", toEntityId: "network:wan-1", relationship: "depends_on", source: "telemetry" },
        { fromEntityId: "branch:branch-001", toEntityId: "recorder:rec-1", relationship: "contains", source: "telemetry" },
        { fromEntityId: "camera:cam-1", toEntityId: "recorder:rec-1", relationship: "records_to", source: "telemetry" },
        { fromEntityId: "camera:cam-2", toEntityId: "recorder:rec-1", relationship: "records_to", source: "telemetry" },
      ],
      summary: {
        totalEntities: 5,
        unhealthyEntities: 5,
        totalCameras: 2,
        unavailableCameras: 2,
        recorders: 1,
        offlineRecorders: 1,
        networks: 1,
        availableNetworks: 0,
      },
      generatedAt: "2026-08-10T14:07:15Z",
    };

    const timeline: CommandTimelineEvent[] = [
      {
        id: "telemetry:wan-1",
        tenantId: "tenant-1",
        branchId: "branch-001",
        occurredAt: "2026-08-10T14:07:12Z",
        eventType: "network_unavailable",
        category: "telemetry",
        entityId: "wan-1",
        entityType: "network",
        title: "WAN link unreachable",
        detail: "connectivity false; latency 450ms; packet loss 85%",
        severity: "critical",
        certainty: "confirmed",
        source: "network:verified",
        evidenceId: "telemetry:wan-1",
        raw: { metrics: { connectivity: false, latencyMs: 450, packetLossPercent: 85 } },
      },
      {
        id: "telemetry:rec-1",
        tenantId: "tenant-1",
        branchId: "branch-001",
        occurredAt: "2026-08-10T14:07:13Z",
        eventType: "recorder_unavailable",
        category: "telemetry",
        entityId: "rec-1",
        entityType: "recorder",
        title: "Recorder unreachable",
        detail: "reachable false",
        severity: "critical",
        certainty: "confirmed",
        source: "recorder:verified",
        evidenceId: "telemetry:rec-1",
        raw: { metrics: { reachable: false } },
      },
      {
        id: "telemetry:cam-1",
        tenantId: "tenant-1",
        branchId: "branch-001",
        occurredAt: "2026-08-10T14:07:14Z",
        eventType: "camera_offline",
        category: "telemetry",
        entityId: "cam-1",
        entityType: "camera",
        title: "Camera offline",
        detail: "reachable false",
        severity: "critical",
        certainty: "confirmed",
        source: "camera:verified",
        evidenceId: "telemetry:cam-1",
        raw: { metrics: { reachable: false } },
      },
    ];

    const result = analyze(graph, timeline);

    expect(result.rootCause.code).toBe("wan_failure");
    expect(result.rootCause.confidence).toBeGreaterThan(0.75);
    expect(result.rootCause.summary).toContain("WAN failure");
    expect(result.rootCause.confidenceDetails?.length).toBeGreaterThan(0);
    expect(result.alternatives.some((item) => item.code === "isp_outage")).toBe(true);
    expect(result.evidence.some((item) => item.assertion.includes("WAN link unreachable"))).toBe(true);
  });

  it("marks root cause unknown when telemetry evidence is missing", () => {
    const graph: OperationalGraph = {
      branch: { id: "branch-002", name: "Branch 002", status: "unknown" },
      entities: [{ id: "branch:branch-002", entityType: "branch", name: "Branch 002", status: "unknown", observedAt: "2026-08-10T15:00:00Z", source: "inventory", quality: "inventory", reasonCodes: [], metrics: {} }],
      dependencies: [],
      summary: { totalEntities: 1, unhealthyEntities: 0, totalCameras: 0, unavailableCameras: 0, recorders: 0, offlineRecorders: 0, networks: 0, availableNetworks: 0 },
      generatedAt: "2026-08-10T15:00:00Z",
    };

    const result = analyze(graph, []);

    expect(result.rootCause.code).toBe("insufficient_evidence");
    expect(result.rootCause.confidence).toBe(0);
    expect(result.rootCause.certainty).toBe("unknown");
    expect(result.evidence).toEqual([]);
  });
});
