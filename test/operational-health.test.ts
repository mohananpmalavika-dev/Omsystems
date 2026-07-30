import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { MemoryStore } from "../src/store.js";
import { telemetryStatus, verifyContinuousRetention } from "../src/operational-health/service.js";
import { defaultOperationalHealthPolicy } from "../src/operational-health/types.js";

const admin = { "x-user-id": "user-global-admin" };

describe("Phase 1 operational health", () => {
  let app: FastifyInstance;
  let store: MemoryStore;
  let agentId: string;

  beforeEach(async () => {
    store = new MemoryStore();
    const agent = await store.registerEdgeAgent("branch-blr-001", "Pilot edge", "1.0.0");
    agentId = agent.id;
    app = await buildApp({ store });
  });

  afterEach(async () => app.close());

  it("ingests an idempotent normalized camera envelope and projects it", async () => {
    const payload = {
      branchId: "branch-blr-001",
      edgeAgentId: agentId,
      deviceType: "camera",
      deviceId: "cam-001",
      observedAt: new Date().toISOString(),
      source: "rtsp",
      quality: "verified",
      idempotencyKey: "pilot:cam-001:one",
      metrics: { status: "online", streamActive: true, responseTimeMs: 24, blackScreen: true },
      reasonCodes: ["fps_unavailable"],
    };
    const accepted = await app.inject({
      method: "POST", url: `/v1/edge-agents/${agentId}/telemetry`, headers: admin, payload,
    });
    expect(accepted.statusCode).toBe(202);
    expect(accepted.json().duplicate).toBe(false);

    const duplicate = await app.inject({
      method: "POST", url: `/v1/edge-agents/${agentId}/telemetry`, headers: admin, payload,
    });
    expect(duplicate.statusCode).toBe(200);
    expect(duplicate.json().duplicate).toBe(true);

    const cameras = await app.inject({
      method: "GET", url: "/v1/operations/health/cameras?branchId=branch-blr-001", headers: admin,
    });
    expect(cameras.statusCode).toBe(200);
    const camera = cameras.json().data.cameras.find((item: { id: string }) => item.id === "cam-001");
    expect(camera.onlineStatus).toBe("online");
    expect(camera.currentFps).toBeNull();
    expect(camera.blackScreen).toBe(true);
    expect(camera.reasonCodes).toContain("fps_unavailable");

    const summary = await app.inject({ method: "GET", url: "/v1/operations/health/summary", headers: admin });
    expect(summary.json().data).toMatchObject({ camerasOnline: 1, camerasOffline: 0 });
  });

  it("returns only an owning agent's camera monitoring assignments and opaque secret references", async () => {
    const discovery = await store.createDiscovery("branch-blr-001", {
      edgeAgentId: agentId,
      discoveryMethod: "edge-agent-reported-inventory",
      vendor: "other",
      model: "Test camera",
      ipAddress: "192.168.10.20",
      onvifPort: 80,
      rtspPort: 554,
      profiles: [{ name: "main", codec: "H264", width: 1920, height: 1080 }],
      capabilities: { ptz: false, audio: false, events: false },
    });
    const camera = await store.approveCamera("branch-blr-001", {
      discoveryId: discovery.id,
      name: "Front door",
      channel: 1,
      protocol: "rtsp",
      connectionSecretRef: `edge://${agentId}/${discovery.id}`,
    });
    expect(camera).toBeDefined();

    const response = await app.inject({
      method: "GET", url: `/v1/edge-agents/${agentId}/cameras/monitoring`, headers: admin,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual([{
      id: camera!.id,
      name: "Front door",
      profiles: [{ name: "main", codec: "H264", width: 1920, height: 1080 }],
      connectionSecretRef: `edge://${agentId}/${discovery.id}`,
    }]);
  });

  it("rejects an edge agent reporting outside its registered branch", async () => {
    const response = await app.inject({
      method: "POST", url: `/v1/edge-agents/${agentId}/telemetry`, headers: admin,
      payload: {
        branchId: "other-branch", edgeAgentId: agentId,
        deviceType: "network", deviceId: "internet", observedAt: new Date().toISOString(),
        source: "system", quality: "verified", idempotencyKey: "wrong-scope",
        metrics: { status: "online" }, reasonCodes: [],
      },
    });
    expect(response.statusCode).toBe(404);
  });

  it("returns paginated branches and preserves unknown components", async () => {
    const response = await app.inject({
      method: "GET", url: "/v1/operations/health/branches?limit=1&offset=0", headers: admin,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.total).toBe(1);
    expect(response.json().data.branches[0].healthStatus).toBe("unknown");
    expect(response.json().data.branches[0].unknownComponents).toContain("storage");
  });

  it("turns measured edge CPU, memory, or disk saturation into branch edge-health warning", async () => {
    const observedAt = new Date().toISOString();
    const accepted = await app.inject({
      method: "POST", url: `/v1/edge-agents/${agentId}/telemetry`, headers: admin,
      payload: {
        branchId: "branch-blr-001", edgeAgentId: agentId, deviceType: "edge-agent", deviceId: agentId,
        observedAt, source: "system", quality: "verified", idempotencyKey: `edge-resource:${observedAt}`,
        metrics: { status: "online", cpuUsedPercent: 96, memoryUsedPercent: 42, diskUsedPercent: 37 }, reasonCodes: [],
      },
    });
    expect(accepted.statusCode).toBe(202);
    const branch = await app.inject({ method: "GET", url: "/v1/operations/health/branches/branch-blr-001", headers: admin });
    expect(branch.json().data).toMatchObject({ edgeAgentStatus: "warning", components: { edgeAgent: { status: "warning" } } });
    expect(branch.json().data.edgeAgent.cpuUsage).toBe(96);
  });

  it("returns summary metrics and supports connectivity click-through filtering", async () => {
    const summary = await app.inject({
      method: "GET", url: "/v1/operations/health/summary", headers: admin,
    });
    expect(summary.statusCode).toBe(200);
    expect(summary.json().data).toMatchObject({
      totalBranches: 1, onlineBranches: 0, offlineBranches: 0,
      overallHealthScore: expect.any(Number),
    });

    const filtered = await app.inject({
      method: "GET", url: "/v1/operations/health/branches?connectivity=unknown", headers: admin,
    });
    expect(filtered.statusCode).toBe(200);
    expect(filtered.json().data.total).toBe(1);
    expect(filtered.json().data.branches[0].internetStatus).toBe("unknown");
  });

  it("persists tenant policy defaults and branch overrides", async () => {
    const policy = { ...defaultOperationalHealthPolicy, retentionDays: 120 };
    const saved = await app.inject({
      method: "PUT", url: "/v1/operations/health/policy", headers: admin,
      payload: { policy },
    });
    expect(saved.statusCode).toBe(200);

    const inherited = await app.inject({
      method: "GET", url: "/v1/operations/health/policy?branchId=branch-blr-001", headers: admin,
    });
    expect(inherited.json().data.retentionDays).toBe(120);

    const overridden = await app.inject({
      method: "PUT", url: "/v1/operations/health/policy", headers: admin,
      payload: { branchId: "branch-blr-001", policy: { ...policy, retentionDays: 180 } },
    });
    expect(overridden.statusCode).toBe(200);
    const effective = await app.inject({
      method: "GET", url: "/v1/operations/health/policy?branchId=branch-blr-001", headers: admin,
    });
    expect(effective.json().data.retentionDays).toBe(180);
  });

  it("normalizes recorder HDD payloads and creates disk-specific alerts", async () => {
    const accepted = await app.inject({
      method: "POST", url: `/v1/edge-agents/${agentId}/recorder-hdd`, headers: admin,
      payload: {
        branchId: "branch-blr-001", recorderId: "nvr-001",
        observedAt: new Date().toISOString(), source: "cp-plus-adapter",
        idempotencyKey: "nvr-001:hdd:one",
        hddStatus: [
          { diskNo: 1, model: "SkyHawk 4TB", serial: "BAD-001", state: "failed", temperature: 67, capacityBytes: 4_000_000_000_000 },
          { diskNo: 2, model: "SkyHawk 4TB", serial: "OK-002", state: "normal", temperature: 39, capacityBytes: 4_000_000_000_000 },
        ],
      },
    });
    expect(accepted.statusCode).toBe(202);
    expect(accepted.json()).toMatchObject({ accepted: 2, duplicates: 0 });

    const disks = await app.inject({ method: "GET", url: "/v1/operations/health/disks", headers: admin });
    expect(disks.statusCode).toBe(200);
    expect(disks.json().data).toHaveLength(2);
    expect(disks.json().data[0]).toMatchObject({
      branchId: "branch-blr-001", smartStatus: "failed", serialNumber: "BAD-001",
    });
    expect(disks.json().data[0].failureProbability).toBeGreaterThanOrEqual(80);

    const alerts = await app.inject({
      method: "GET", url: "/v1/operations/alerts?component=storage&severity=critical", headers: admin,
    });
    expect(alerts.statusCode).toBe(200);
    expect(alerts.json().data.alerts.some((alert: { id: string; deviceId: string }) =>
      alert.id.startsWith("hdd:") && alert.deviceId === "nvr-001:disk:1",
    )).toBe(true);
  });

  it("publishes a warning before retained footage falls below policy", async () => {
    const now = Date.now();
    await store.createRecordingSegment({
      cameraId: "cam-001", jobId: "retention-warning-job",
      startedAt: new Date(now - 36 * 3_600_000).toISOString(),
      endedAt: new Date(now).toISOString(), storagePath: "retention-warning",
      sizeBytes: 1, storageNodeExternalId: "node", storageTier: "hot", status: "ready",
    });
    const policy = { ...defaultOperationalHealthPolicy, retentionDays: 1, retentionWarningDays: 1 };
    expect((await app.inject({ method: "PUT", url: "/v1/operations/health/policy", headers: admin, payload: { branchId: "branch-blr-001", policy } })).statusCode).toBe(200);
    const response = await app.inject({
      method: "GET", url: "/v1/operations/alerts?component=retention&severity=warning", headers: admin,
    });
    const alert = response.json().data.alerts.find((item: { deviceId: string }) => item.deviceId === "cam-001");
    expect(alert).toMatchObject({ severity: "warning", componentType: "retention" });
    expect(alert.title).toContain("approaching threshold");
  });

  it("projects complete DVR archive evidence even when the platform has no indexed segments", async () => {
    const now = Date.now();
    const policy = { ...defaultOperationalHealthPolicy, retentionDays: 30, retentionWarningDays: 3 };
    expect((await app.inject({ method: "PUT", url: "/v1/operations/health/policy", headers: admin, payload: { branchId: "branch-blr-001", policy } })).statusCode).toBe(200);
    const submitted = await app.inject({
      method: "POST", url: `/v1/edge-agents/${agentId}/recorder-archive`, headers: admin,
      payload: {
        branchId: "branch-blr-001", recorderId: "nvr-main", observedAt: new Date(now).toISOString(),
        source: "system", quality: "verified", idempotencyKey: `nvr-main:archive:${now}`,
        entries: [{
          cameraId: "cam-001", sourceChannel: 1, status: "available",
          oldestContinuousAt: new Date(now - 35 * 86_400_000).toISOString(), newestPlayableAt: new Date(now).toISOString(),
          retentionLowerBound: false, coverageComplete: true, continuityGapSeconds: 30,
          searchStartedAt: new Date(now).toISOString(), reasonCodes: [],
        }],
      },
    });
    expect(submitted.statusCode).toBe(202);
    const retention = await app.inject({ method: "GET", url: "/v1/operations/health/retention?branchId=branch-blr-001", headers: admin });
    const camera = retention.json().data.items.find((item: { cameraId: string }) => item.cameraId === "cam-001");
    expect(camera).toMatchObject({
      actualDays: 35, status: "compliant", dataSource: "recorder_archive", archiveVerified: true,
    });
  });

  it("tracks primary and backup internet links and detects failover", async () => {
    const observedAt = new Date().toISOString();
    const submit = (deviceId: string, metrics: Record<string, unknown>) => app.inject({
      method: "POST", url: `/v1/edge-agents/${agentId}/telemetry`, headers: admin,
      payload: {
        branchId: "branch-blr-001", edgeAgentId: agentId, deviceType: "network", deviceId,
        observedAt, source: "system", quality: "verified", idempotencyKey: `${deviceId}:${observedAt}`,
        metrics, reasonCodes: [],
      },
    });
    expect((await submit("internet-primary", { linkId: "primary", role: "primary", ispName: "ISP A", connectivity: false, active: false, packetLossPercent: 100 })).statusCode).toBe(202);
    expect((await submit("internet-backup", { linkId: "backup", role: "backup", ispName: "ISP B", connectivity: true, active: true, latencyMs: 48, jitterMs: 4, packetLossPercent: 0, bandwidthUtilizationPercent: 35 })).statusCode).toBe(202);

    const network = await app.inject({ method: "GET", url: "/v1/operations/health/network", headers: admin });
    expect(network.statusCode).toBe(200);
    expect(network.json().data.branches[0]).toMatchObject({ status: "failover", failoverActive: true, activeLinkId: "backup" });
    expect(network.json().data.summary.failover).toBe(1);

    const alerts = await app.inject({ method: "GET", url: "/v1/operations/alerts?component=network&severity=critical", headers: admin });
    expect(alerts.json().data.alerts.some((alert: { id: string }) => alert.id.includes("internet:branch-blr-001:primary"))).toBe(true);
  });

  it("projects DVR/NVR status and creates an outage alert", async () => {
    const observedAt = new Date().toISOString();
    const response = await app.inject({
      method: "POST", url: `/v1/edge-agents/${agentId}/telemetry`, headers: admin,
      payload: {
        branchId: "branch-blr-001", edgeAgentId: agentId, deviceType: "recorder", deviceId: "nvr-main",
        observedAt, source: "system", quality: "verified", idempotencyKey: `nvr-main:${observedAt}`,
        metrics: { name: "Main NVR", deviceType: "nvr", vendor: "hikvision", model: "DS-7608", ipAddress: "192.168.1.20", reachable: false, recordingStatus: "unknown" },
        reasonCodes: [],
      },
    });
    expect(response.statusCode).toBe(202);
    const recorders = await app.inject({ method: "GET", url: "/v1/operations/health/recorders", headers: admin });
    expect(recorders.json().data.recorders[0]).toMatchObject({ id: "nvr-main", status: "offline", vendor: "hikvision" });
    expect(recorders.json().data.summary).toMatchObject({ total: 1, offline: 1, affectedBranches: 1 });
    const alerts = await app.inject({ method: "GET", url: "/v1/operations/alerts?component=recording&severity=critical", headers: admin });
    expect(alerts.json().data.alerts.some((alert: { id: string }) => alert.id === "recorder:branch-blr-001:nvr-main")).toBe(true);
  });

  it("projects recorder archive evidence without degrading an active recorder", async () => {
    const observedAt = new Date().toISOString();
    const response = await app.inject({
      method: "POST", url: `/v1/edge-agents/${agentId}/telemetry`, headers: admin,
      payload: {
        branchId: "branch-blr-001", edgeAgentId: agentId, deviceType: "recorder", deviceId: "nvr-evidence",
        observedAt, source: "system", quality: "verified", idempotencyKey: `nvr-evidence:${observedAt}`,
        metrics: {
          name: "Archive-verified NVR", deviceType: "nvr", vendor: "hikvision", model: "DS-7608",
          reachable: true, recordingStatus: "recording", recordingChannels: 8,
          recordingStatusSource: "recent-media-search", totalCameras: 8,
        }, reasonCodes: [],
      },
    });
    expect(response.statusCode).toBe(202);

    const recorders = await app.inject({ method: "GET", url: "/v1/operations/health/recorders", headers: admin });
    expect(recorders.json().data.recorders[0]).toMatchObject({
      id: "nvr-evidence", status: "online", recordingStatus: "recording",
      recordingChannels: 8, recordingStatusSource: "recent-media-search",
    });
  });

  it("projects channel-scoped recording evidence and newest recorder media", async () => {
    const observedAt = new Date().toISOString();
    const lastRecordedAt = new Date(Date.now() - 2_000).toISOString();
    const recorder = await app.inject({
      method: "POST", url: `/v1/edge-agents/${agentId}/telemetry`, headers: admin,
      payload: {
        branchId: "branch-blr-001", edgeAgentId: agentId, deviceType: "recorder", deviceId: "nvr-channels",
        observedAt, source: "system", quality: "verified", idempotencyKey: `nvr-channels:${observedAt}`,
        metrics: { reachable: true, recordingStatus: "partial", recordingChannels: 1, totalCameras: 2 },
        reasonCodes: ["some_channels_not_recording"],
      },
    });
    expect(recorder.statusCode).toBe(202);
    for (const [sourceChannel, status, timestamp] of [[1, "recording", lastRecordedAt], [2, "stopped", null]] as const) {
      const channel = await app.inject({
        method: "POST", url: `/v1/edge-agents/${agentId}/telemetry`, headers: admin,
        payload: {
          branchId: "branch-blr-001", edgeAgentId: agentId, deviceType: "recorder-channel",
          deviceId: `nvr-channels:channel:${sourceChannel}`, observedAt, source: "system", quality: "verified",
          idempotencyKey: `nvr-channels:${sourceChannel}:${observedAt}`,
          metrics: { recorderId: "nvr-channels", sourceChannel, status, connected: true, lastRecordedAt: timestamp, recordingStatusSource: "recent-media-search" },
          reasonCodes: status === "stopped" ? ["hikvision_no_recent_recording_evidence"] : [],
        },
      });
      expect(channel.statusCode).toBe(202);
    }

    const response = await app.inject({ method: "GET", url: "/v1/operations/health/recorders", headers: admin });
    expect(response.json().data.recorders[0]).toMatchObject({
      id: "nvr-channels", status: "degraded", recordingStatus: "partial", lastRecordedAt,
      channels: [
        expect.objectContaining({ sourceChannel: 1, status: "recording", lastRecordedAt }),
        expect.objectContaining({ sourceChannel: 2, status: "stopped", lastRecordedAt: null }),
      ],
    });
    expect(response.json().data.summary).toMatchObject({ partial: 1, recording: 0, stopped: 0, unverified: 0 });
  });
});

describe("operational health evidence rules", () => {
  it("does not convert unavailable or stale telemetry to healthy", () => {
    const base = {
      tenantId: "tenant", branchId: "branch", edgeAgentId: "agent",
      deviceType: "camera" as const, deviceId: "camera", receivedAt: "2026-07-28T00:00:00.000Z",
      source: "rtsp" as const, idempotencyKey: "one", metrics: { status: "online" }, reasonCodes: [],
    };
    expect(telemetryStatus({ ...base, observedAt: "2026-07-28T00:00:00.000Z", quality: "unavailable" }, defaultOperationalHealthPolicy, Date.parse("2026-07-28T00:00:10.000Z"))).toBe("unknown");
    expect(telemetryStatus({ ...base, observedAt: "2026-07-27T23:50:00.000Z", quality: "verified" }, defaultOperationalHealthPolicy, Date.parse("2026-07-28T00:00:00.000Z"))).toBe("critical");
  });

  it("marks continuous playable footage below policy as a breach", () => {
    const verification = verifyContinuousRetention("camera", [
      segment("2026-07-27T00:00:00.000Z", "2026-07-28T00:00:00.000Z", "one"),
      segment("2026-07-26T00:00:00.000Z", "2026-07-27T00:00:00.000Z", "two"),
    ], { retentionDays: 3, maxRecordingGapSeconds: 120 }, Date.parse("2026-07-28T00:00:30.000Z"));
    expect(verification.status).toBe("breach");
    expect(verification.actualDays).toBe(2);
    expect(verification.reasonCodes).toContain("retention_below_policy");
    expect(verification.shortfallDays).toBe(1);
    expect(verification.forecastDaysIn7Days).toBe(9);
  });

  it("raises an early warning while retention remains just above policy", () => {
    const now = Date.parse("2026-07-28T00:00:00.000Z");
    const verification = verifyContinuousRetention("camera", [
      segment("2026-06-26T00:00:00.000Z", "2026-07-28T00:00:00.000Z", "window"),
    ], { retentionDays: 30, retentionWarningDays: 3, maxRecordingGapSeconds: 120 }, now + 30_000);
    expect(verification.status).toBe("at_risk");
    expect(verification.marginDays).toBe(2);
    expect(verification.reasonCodes).toContain("retention_approaching_threshold");
    expect(verification.coverageTrend).toHaveLength(14);
  });

  it("uses complete, fresh recorder archive evidence when no platform segment was indexed", () => {
    const now = Date.parse("2026-07-28T00:00:00.000Z");
    const verification = verifyContinuousRetention("camera", [], {
      retentionDays: 30, retentionWarningDays: 3, maxRecordingGapSeconds: 120,
    }, now, {
      recorderId: "nvr-main", observedAt: new Date(now).toISOString(), sourceChannel: 1,
      status: "available", oldestContinuousAt: new Date(now - 35 * 86_400_000).toISOString(),
      newestPlayableAt: new Date(now).toISOString(), retentionLowerBound: false,
      coverageComplete: true, continuityGapSeconds: 30, reasonCodes: [],
    });
    expect(verification).toMatchObject({
      status: "compliant", actualDays: 35, dataSource: "recorder_archive",
      archiveVerified: true, archiveRecorderId: "nvr-main", archiveCoverageComplete: true,
    });
  });
});

function segment(startedAt: string, endedAt: string, id: string) {
  return {
    id, cameraId: "camera", jobId: "job", startedAt, endedAt,
    storagePath: id, sizeBytes: 1, storageNodeExternalId: "node",
    storageTier: "hot" as const, status: "ready" as const, createdAt: startedAt,
  };
}
