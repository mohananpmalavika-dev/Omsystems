import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { MemoryStore } from "../src/store.js";

const admin = { "x-user-id": "user-global-admin" };

describe("analog camera channels behind DVRs", () => {
  let app: FastifyInstance;
  let store: MemoryStore;
  let agentId: string;

  beforeEach(async () => {
    store = new MemoryStore();
    agentId = (await store.registerEdgeAgent("branch-blr-001", "Branch appliance", "1.0.0")).id;
    app = await buildApp({ store });
  });

  afterEach(async () => app.close());

  it("keeps multiple analog channels on one DVR as distinct camera discoveries", async () => {
    const first = await submitChannel(1, "Entrance");
    const second = await submitChannel(2, "Cash Counter");

    expect(first.statusCode).toBe(202);
    expect(second.statusCode).toBe(202);
    expect(first.json().id).not.toBe(second.json().id);
    expect(await store.listDiscoveredCameras("branch-blr-001")).toHaveLength(2);
  });

  it("approves a DVR channel without asking the operator for protocol, channel or secret details", async () => {
    const discovery = await submitChannel(4, "Vault");
    const discoveryId = discovery.json().id as string;
    const approved = await app.inject({
      method: "POST",
      url: `/v1/branches/branch-blr-001/cameras/discovered/${discoveryId}/approve`,
      headers: admin,
      payload: { name: "Vault" },
    });

    expect(approved.statusCode).toBe(200);
    const camera = await store.getCamera(approved.json().cameraId);
    expect(camera).toMatchObject({
      name: "Vault",
      channel: 4,
      protocol: "rtsp",
      sourceType: "analog-dvr-channel",
      recorderId: "recorder-branch-01",
      recorderChannel: 4,
      connectionSecretRef: `edge://${agentId}/${discoveryId}`,
    });
    expect(approved.json().recordingArchitecture).toBe("recorder-local-evidence-only");
    expect(await store.getRecordingJob(camera!.id)).toMatchObject({
      mode: "continuous",
      primaryRecordingStorage: "recorder-local",
      cloudArchivePolicy: "incident-evidence-only",
      backupRequired: false,
    });
    const forbiddenCloudTimeline = await app.inject({
      method: "PUT",
      url: `/v1/cameras/${camera!.id}/recording`,
      headers: admin,
      payload: {
        mode: "continuous",
        enabled: true,
        primaryRecordingStorage: "sentinel-local",
      },
    });
    expect(forbiddenCloudTimeline.statusCode).toBe(409);
    expect(forbiddenCloudTimeline.json().error).toBe(
      "recorder_backed_camera_requires_recorder_local_storage",
    );
    const playback = await app.inject({
      method: "GET",
      url: `/v1/cameras/${camera!.id}/playback?from=2026-08-01T00:00:00.000Z&to=2026-08-01T01:00:00.000Z`,
      headers: admin,
    });
    expect(playback.statusCode).toBe(200);
    expect(playback.json()).toMatchObject({
      source: "recorder-local",
      transferMode: "on-demand",
      cloudArchivePolicy: "incident-evidence-only",
    });

    const assignments = await app.inject({
      method: "GET",
      url: `/v1/edge-agents/${agentId}/cameras/monitoring`,
      headers: { ...admin, "x-edge-agent-version": "1.0.0" },
    });
    expect(assignments.statusCode).toBe(200);
    expect(assignments.json().data[0]).toMatchObject({
      sourceType: "analog-dvr-channel",
      recorderId: "recorder-branch-01",
      recorderChannel: 4,
    });
  });

  it("replaces a DVR in place so channel camera IDs and recording policy survive", async () => {
    const first = await submitChannel(1, "Entrance");
    const second = await submitChannel(2, "Cash Counter");
    const firstApproval = await approve(first.json().id, "Entrance");
    const secondApproval = await approve(second.json().id, "Cash Counter");
    const firstCameraId = firstApproval.json().cameraId as string;
    const secondCameraId = secondApproval.json().cameraId as string;
    const originalNodeId = (await store.getCamera(firstCameraId))!.nodeId;
    await store.upsertRecordingJob(firstCameraId, {
      mode: "continuous", enabled: true, status: "recording", retentionDays: 180,
      primaryRecordingStorage: "recorder-local", cloudArchivePolicy: "incident-evidence-only",
      segmentDurationSeconds: 60, hotRetentionDays: 30, warmRetentionDays: 30,
      coldRetentionDays: 120, critical: true, backupRequired: true,
      automaticDeletionEnabled: true, evidenceProtection: true,
      recordMainStream: true, preRollSeconds: 30, postRollSeconds: 120,
      minMotionDurationSeconds: 1, motionConfidenceThreshold: 0.65,
      cooldownSeconds: 60, maxEventDurationSeconds: 600, triggerEventTypes: [],
    });

    await submitReplacementChannel(1, "New DVR channel 1");
    await submitReplacementChannel(2, "New DVR channel 2");
    const plan = await app.inject({
      method: "POST",
      url: "/v1/branches/branch-blr-001/recorders/replacements/plan",
      headers: admin,
      payload: { oldRecorderSerialNumber: "DVR-SERIAL-01", newRecorderSerialNumber: "DVR-SERIAL-02" },
    });
    expect(plan.statusCode).toBe(200);
    expect(plan.json()).toMatchObject({ status: "ready", missingChannels: [], extraChannels: [] });
    expect(plan.json().mappings).toHaveLength(2);

    const applied = await app.inject({
      method: "POST",
      url: "/v1/branches/branch-blr-001/recorders/replacements/apply",
      headers: admin,
      payload: {
        oldRecorderSerialNumber: "DVR-SERIAL-01",
        newRecorderSerialNumber: "DVR-SERIAL-02",
        confirmPreserveCameraIds: true,
        expectedMappingCount: 2,
      },
    });
    expect(applied.statusCode).toBe(201);
    expect(applied.json().updatedCameraIds).toEqual(expect.arrayContaining([firstCameraId, secondCameraId]));
    expect(await store.getCamera(firstCameraId)).toMatchObject({
      id: firstCameraId, nodeId: originalNodeId, name: "Entrance",
      recorderId: "recorder-branch-02", recorderSerialNumber: "DVR-SERIAL-02", recorderChannel: 1,
    });
    expect(await store.getRecordingJob(firstCameraId)).toMatchObject({ retentionDays: 180, critical: true });
  });

  async function approve(discoveryId: string, name: string) {
    return app.inject({
      method: "POST",
      url: `/v1/branches/branch-blr-001/cameras/discovered/${discoveryId}/approve`,
      headers: admin,
      payload: { name },
    });
  }

  async function submitChannel(channel: number, displayName: string) {
    return app.inject({
      method: "POST",
      url: "/v1/branches/branch-blr-001/cameras/discovered",
      headers: admin,
      payload: {
        edgeAgentId: agentId,
        discoveryMethod: "nvr-dvr-channel-discovery",
        vendor: "other",
        manufacturer: "Legacy DVR",
        model: "16 channel DVR",
        ipAddress: "192.168.20.10",
        onvifPort: 80,
        rtspPort: 554,
        profiles: [{ name: "main", codec: "H264", width: 1920, height: 1080 }],
        capabilities: { ptz: false, audio: false, events: true },
        displayName,
        streamVerified: true,
        rtspValidated: true,
        duplicateStatus: "unique",
        compatibilityStatus: "compatible",
        hardwareId: `recorder-branch-01:channel:${channel}`,
        existingDeviceAssociation: "recorder-branch-01",
        sourceType: "analog-dvr-channel",
        recorderId: "recorder-branch-01",
        recorderChannel: channel,
        recorderSerialNumber: "DVR-SERIAL-01",
      },
    });
  }

  async function submitReplacementChannel(channel: number, displayName: string) {
    return app.inject({
      method: "POST",
      url: "/v1/branches/branch-blr-001/cameras/discovered",
      headers: admin,
      payload: {
        edgeAgentId: agentId,
        discoveryMethod: "nvr-dvr-channel-discovery",
        vendor: "other",
        manufacturer: "Replacement DVR",
        model: "16 channel XVR",
        ipAddress: "192.168.20.11",
        onvifPort: 80,
        rtspPort: 554,
        profiles: [{ name: "main", codec: "H264", width: 1920, height: 1080 }],
        capabilities: { ptz: false, audio: false, events: true },
        displayName,
        streamVerified: true,
        rtspValidated: true,
        duplicateStatus: "unique",
        compatibilityStatus: "compatible",
        hardwareId: `DVR-SERIAL-02:channel:${channel}`,
        existingDeviceAssociation: "recorder-branch-02",
        sourceType: "analog-dvr-channel",
        recorderId: "recorder-branch-02",
        recorderChannel: channel,
        recorderSerialNumber: "DVR-SERIAL-02",
      },
    });
  }
});
