import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { projectProvisioningRun } from "../src/provisioning/provisioning-status.js";
import { MemoryStore } from "../src/store.js";

const headers = { "x-user-id": "user-global-admin" };

function addTestBranch(store: MemoryStore) {
  store.nodes.set("company-1", {
    id: "company-1",
    parentId: null,
    tenantId: "omsystems",
    type: "company",
    name: "Test company",
    path: ["company-1"],
  });
  store.nodes.set("branch-blr-001", {
    id: "branch-blr-001",
    parentId: "company-1",
    tenantId: "omsystems",
    type: "branch",
    name: "Test branch",
    path: ["company-1", "branch-blr-001"],
  });
  store.users.set("user-global-admin", {
    id: "user-global-admin",
    displayName: "Test administrator",
    tenantId: "omsystems",
    role: "super_admin",
    status: "active",
  });
  store.grants.push({
    userId: "user-global-admin",
    scopeNodeId: "company-1",
    actions: ["device:configure"],
    effect: "allow",
  });
}

describe("zero-touch provisioning integration", () => {
  it("creates a durable edge run and reports actionable credential blockers", async () => {
    const store = new MemoryStore();
    addTestBranch(store);
    const app = await buildApp({ logger: false, store });
    const agent = await store.registerEdgeAgent("branch-blr-001", "Provisioning edge", "0.1.6");
    await store.heartbeatEdgeAgent(agent.id, "0.1.6");

    const started = await app.inject({
      method: "POST",
      url: "/v1/branches/branch-blr-001/provisioning",
      headers,
      payload: { edgeAgentId: agent.id },
    });
    expect(started.statusCode).toBe(202);
    expect(started.json().run).toMatchObject({
      branchId: "branch-blr-001",
      status: "queued",
      currentStage: "ONVIF, subnet and recorder discovery",
    });
    const runId = started.json().run.id as string;

    const claimed = await store.claimEdgeScanJob(agent.id);
    expect(claimed?.id).toBe(runId);

    await store.createDiscovery("branch-blr-001", discovery(agent.id, "192.168.50.20", {
      streamVerified: true,
      compatibilityStatus: "compatible",
      timeSynchronization: "synchronized",
    }));
    await store.createDiscovery("branch-blr-001", discovery(agent.id, "192.168.50.21", {
      streamVerified: false,
      credentialsRequired: true,
      compatibilityStatus: "review-required",
      timeSynchronization: "drifted",
    }));

    const completed = await app.inject({
      method: "POST",
      url: `/v1/edge-agents/${agent.id}/scan-jobs/${runId}/complete`,
      headers,
      payload: { status: "completed", resultCount: 2 },
    });
    expect(completed.statusCode).toBe(200);
    expect(completed.json()).toMatchObject({
      status: "completed",
      resultCount: 2,
      verifiedCount: 1,
      credentialsRequiredCount: 1,
      timeSynchronizedCount: 1,
      timeDriftCount: 1,
    });

    const status = await app.inject({
      method: "GET",
      url: `/v1/branches/branch-blr-001/provisioning/${runId}`,
      headers,
    });
    expect(status.statusCode).toBe(200);
    expect(status.json().run).toMatchObject({
      status: "waiting_for_input",
      readyForActivation: false,
      summary: {
        discoveredDevices: 2,
        importedChannels: 1,
        verifiedStreams: 1,
        credentialsRequired: 1,
        timeSynchronized: 1,
        timeDrifted: 1,
      },
    });
    expect(status.json().run.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "DEVICE_CREDENTIAL_REQUIRED", severity: "blocker" }),
      expect.objectContaining({ code: "TIME_DRIFT_EXCEEDED", severity: "warning" }),
    ]));
    expect(status.json().run.steps.find((step: any) => step.id === "credential-resolution")).toMatchObject({
      status: "blocked",
      action: "provide-credentials",
    });

    const skipped = await app.inject({
      method: "POST",
      url: `/v1/branches/branch-blr-001/provisioning/${runId}/skip-credentials`,
      headers,
    });
    expect(skipped.statusCode).toBe(200);
    expect(skipped.json().run).toMatchObject({
      credentialsSkipped: true,
      canSkipCredentialResolution: false,
      status: "blocked",
    });
    expect(skipped.json().run.steps.find((step: any) => step.id === "credential-resolution")).toMatchObject({
      status: "skipped",
    });
    expect(skipped.json().run.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "DEVICE_CREDENTIAL_DEFERRED", severity: "warning" }),
    ]));

    const stageSkipped = await app.inject({
      method: "POST",
      url: `/v1/branches/branch-blr-001/provisioning/${runId}/stages/time-verification/skip`,
      headers,
    });
    expect(stageSkipped.statusCode).toBe(200);
    expect(stageSkipped.json().run.steps.find((step: any) => step.id === "time-verification")).toMatchObject({
      status: "skipped",
      canSkip: false,
    });

    const completedStage = await app.inject({
      method: "POST",
      url: `/v1/branches/branch-blr-001/provisioning/${runId}/stages/branch-registration/skip`,
      headers,
    });
    expect(completedStage.statusCode).toBe(409);

    await app.close();
  }, 15_000);

  it("starts only an enrolled local installation and never fabricates an online heartbeat", async () => {
    const store = new MemoryStore();
    addTestBranch(store);
    const app = await buildApp({ logger: false, store });
    const agent = await store.registerEdgeAgent("branch-blr-001", "Installed branch edge", "0.1.9");

    const requested = await app.inject({
      method: "POST",
      url: "/v1/branches/branch-blr-001/activate-edge-online",
      headers,
    });
    expect(requested.statusCode).toBe(202);
    expect(requested.json()).toMatchObject({
      success: false,
      status: "start-required",
      installRequired: false,
      activationRequired: true,
      agent: { id: agent.id },
    });
    expect(store.edgeAgents.get(agent.id)?.status).not.toBe("online");

    const blocked = await app.inject({
      method: "POST",
      url: "/v1/branches/branch-blr-001/provisioning",
      headers,
      payload: { edgeAgentId: agent.id },
    });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json()).toMatchObject({
      error: "online_edge_agent_required",
      installRequired: false,
      activationRequired: true,
    });
    expect(store.edgeAgents.get(agent.id)?.status).not.toBe("online");

    await store.heartbeatEdgeAgent(agent.id, "0.1.9");
    const online = await app.inject({
      method: "POST",
      url: "/v1/branches/branch-blr-001/activate-edge-online",
      headers,
    });
    expect(online.statusCode).toBe(200);
    expect(online.json()).toMatchObject({
      success: true,
      status: "online",
      installRequired: false,
      activationRequired: false,
    });

    await app.close();
  });

  it("offers first installation only when the branch has no enrolled edge agent", async () => {
    const store = new MemoryStore();
    addTestBranch(store);
    const app = await buildApp({ logger: false, store });

    const response = await app.inject({
      method: "POST",
      url: "/v1/branches/branch-blr-001/activate-edge-online",
      headers,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      success: false,
      status: "not-enrolled",
      installRequired: true,
      activationRequired: false,
    });

    await app.close();
  });

  it("keeps edge enrollment pending when an enrolled agent is offline", () => {
    const projected = projectProvisioningRun({
      branchId: "branch-1",
      agents: [{
        id: "agent-1", branchId: "branch-1", name: "edge", version: "1.0.0",
        status: "offline",
      }],
      pendingDiscoveries: [],
      importedCameraIds: [],
      recordingJobs: [],
      storageNodes: [],
      analyticsCameraIds: [],
      recentPlatformRecordingCameraIds: [],
      telemetry: [],
    });

    expect(projected.steps.find((step) => step.id === "edge-enrollment")).toMatchObject({
      status: "pending",
      action: "install-agent",
    });
    expect(projected.summary.agentsOnline).toBe(0);
    expect(projected.issues.map((issue) => issue.code)).toContain("EDGE_AGENT_OFFLINE");
  });

  it("does not allow a completed function call to hide storage or recording blockers", () => {
    const now = new Date().toISOString();
    const projected = projectProvisioningRun({
      branchId: "branch-1",
      job: {
        id: "run-1", branchId: "branch-1", edgeAgentId: "agent-1", status: "completed",
        requestedAt: now, startedAt: now, completedAt: now, resultCount: 4,
        provisionedCount: 4, credentialsRequiredCount: 0, pendingVerificationCount: 0,
        verifiedCount: 4, recorderCount: 1, timeSynchronizedCount: 4, timeDriftCount: 0,
        analyticsCompatibleCount: 4, duplicateCount: 0, credentialsSkippedAt: null, error: null,
      },
      agents: [{
        id: "agent-1", branchId: "branch-1", name: "edge", version: "1.0.0",
        status: "online", lastSeenAt: now,
      }],
      pendingDiscoveries: [],
      importedCameraIds: ["cam-1", "cam-2", "cam-3", "cam-4"],
      recordingJobs: ["cam-1", "cam-2", "cam-3", "cam-4"].map((cameraId) => ({
        id: `recording-${cameraId}`, cameraId, mode: "continuous" as const, enabled: true,
        status: "idle" as const, primaryRecordingStorage: "recorder-local" as const,
        cloudArchivePolicy: "incident-evidence-only" as const, retentionDays: 30,
        segmentDurationSeconds: 60, hotRetentionDays: 30, warmRetentionDays: 0,
        coldRetentionDays: 0, critical: false, backupRequired: false,
        automaticDeletionEnabled: true, evidenceProtection: true, recordMainStream: true,
        preRollSeconds: 30, postRollSeconds: 120, minMotionDurationSeconds: 1,
        motionConfidenceThreshold: 0.65, cooldownSeconds: 60, maxEventDurationSeconds: 600,
        updatedAt: now,
      })),
      storageNodes: [],
      analyticsCameraIds: ["cam-1", "cam-2", "cam-3", "cam-4"],
      recentPlatformRecordingCameraIds: [],
      telemetry: [],
    });

    expect(projected.status).toBe("blocked");
    expect(projected.readyForActivation).toBe(false);
    expect(projected.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "STORAGE_EVIDENCE_REQUIRED",
      "RECORDING_EVIDENCE_REQUIRED",
    ]));
  });

  it("does not present completed scans as an indefinitely running RTSP check after credentials are skipped", () => {
    const now = new Date().toISOString();
    const projected = projectProvisioningRun({
      branchId: "branch-1",
      job: {
        id: "run-1", branchId: "branch-1", edgeAgentId: "agent-1", status: "completed",
        requestedAt: now, startedAt: now, completedAt: now, resultCount: 1,
        provisionedCount: 0, credentialsRequiredCount: 1, pendingVerificationCount: 0,
        verifiedCount: 0, recorderCount: 0, timeSynchronizedCount: 0, timeDriftCount: 0,
        analyticsCompatibleCount: 0, duplicateCount: 0, credentialsSkippedAt: now, error: null,
      },
      agents: [{
        id: "agent-1", branchId: "branch-1", name: "edge", version: "1.0.0",
        status: "online", lastSeenAt: now,
      }],
      pendingDiscoveries: [discovery("agent-1", "192.168.50.21", {
        id: "disc-1",
        deviceIdentityId: "dev-1",
        branchId: "branch-1",
        status: "pending",
        discoveredAt: now,
        streamVerified: false,
        credentialsRequired: true,
      }) as any],
      importedCameraIds: [],
      connectedCameraCount: 1,
      recordingJobs: [],
      storageNodes: [],
      analyticsCameraIds: [],
      recentPlatformRecordingCameraIds: [],
      telemetry: [],
    });

    expect(projected.status).toBe("awaiting_evidence");
    expect(projected.summary.verifiedStreams).toBe(1);
    expect(projected.steps.find((step) => step.id === "stream-verification")).toMatchObject({
      status: "completed",
    });
  });

  it("marks a run active only when current stream, storage and recording evidence all pass", () => {
    const now = new Date().toISOString();
    const projected = projectProvisioningRun({
      branchId: "branch-1",
      job: {
        id: "run-1", branchId: "branch-1", edgeAgentId: "agent-1", status: "completed",
        requestedAt: now, startedAt: now, completedAt: now, resultCount: 1,
        provisionedCount: 1, credentialsRequiredCount: 0, pendingVerificationCount: 0,
        verifiedCount: 1, recorderCount: 0, timeSynchronizedCount: 1, timeDriftCount: 0,
        analyticsCompatibleCount: 1, duplicateCount: 0, credentialsSkippedAt: null, error: null,
      },
      agents: [{
        id: "agent-1", branchId: "branch-1", name: "edge", version: "1.0.0",
        status: "online", lastSeenAt: now,
      }],
      pendingDiscoveries: [],
      importedCameraIds: ["cam-1"],
      recordingJobs: [{
        id: "recording-cam-1", cameraId: "cam-1", mode: "continuous", enabled: true,
        status: "recording", primaryRecordingStorage: "sentinel-local",
        cloudArchivePolicy: "none", retentionDays: 30, segmentDurationSeconds: 60,
        hotRetentionDays: 30, warmRetentionDays: 0, coldRetentionDays: 0,
        critical: false, backupRequired: false, automaticDeletionEnabled: true,
        evidenceProtection: true, recordMainStream: true, preRollSeconds: 30,
        postRollSeconds: 120, minMotionDurationSeconds: 1,
        motionConfidenceThreshold: 0.65, cooldownSeconds: 60,
        maxEventDurationSeconds: 600, updatedAt: now,
      }],
      storageNodes: [{
        id: "storage-1", tenantId: "tenant-1", name: "Local archive", kind: "local",
        endpoint: "C:\\recordings", pathPrefix: "sentinel", status: "healthy",
        capacityBytes: 1_000_000, usedBytes: 100, reservedBytes: 0,
        lastWriteProbe: { status: "passed", latencyMs: 4 } as any,
        createdAt: now, updatedAt: now,
      } as any],
      analyticsCameraIds: ["cam-1"],
      recentPlatformRecordingCameraIds: ["cam-1"],
      telemetry: [],
    });

    expect(projected.status).toBe("active");
    expect(projected.readyForActivation).toBe(true);
    expect(projected.issues).toEqual([]);
  });
});

function discovery(
  edgeAgentId: string,
  ipAddress: string,
  overrides: Record<string, unknown>,
) {
  return {
    edgeAgentId,
    discoveryMethod: "onvif-ws-discovery" as const,
    vendor: "hikvision" as const,
    manufacturer: "Hikvision",
    model: "DS-2CD-Provisioning",
    ipAddress,
    onvifSupport: true,
    onvifPort: 80,
    rtspPort: 554,
    profiles: [{ name: "main", codec: "H264" as const, width: 1920, height: 1080 }],
    capabilities: { ptz: false, audio: true, events: true },
    duplicateStatus: "unique" as const,
    ...overrides,
  };
}
