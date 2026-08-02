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
      protocol: "vendor-adapter",
      sourceType: "analog-dvr-channel",
      recorderId: "recorder-branch-01",
      recorderChannel: 4,
      connectionSecretRef: `edge://${agentId}/${discoveryId}`,
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
});
