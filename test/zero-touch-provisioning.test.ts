import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { projectProvisioningRun } from "../src/provisioning/provisioning-status.js";
import { MemoryStore } from "../src/store.js";

const headers = { "x-user-id": "user-global-admin" };

describe("zero-touch provisioning integration", () => {
  it("creates a durable edge run and reports actionable credential blockers", async () => {
    const store = new MemoryStore();
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
      currentStage: "Network inventory",
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

    await app.close();
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
        analyticsCompatibleCount: 4, duplicateCount: 0, error: null,
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

  it("marks a run active only when current stream, storage and recording evidence all pass", () => {
    const now = new Date().toISOString();
    const projected = projectProvisioningRun({
      branchId: "branch-1",
      job: {
        id: "run-1", branchId: "branch-1", edgeAgentId: "agent-1", status: "completed",
        requestedAt: now, startedAt: now, completedAt: now, resultCount: 1,
        provisionedCount: 1, credentialsRequiredCount: 0, pendingVerificationCount: 0,
        verifiedCount: 1, recorderCount: 0, timeSynchronizedCount: 1, timeDriftCount: 0,
        analyticsCompatibleCount: 1, duplicateCount: 0, error: null,
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
        lastWriteProbe: { status: "passed", checkedAt: now, latencyMs: 4 },
        createdAt: now, updatedAt: now,
      }],
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
