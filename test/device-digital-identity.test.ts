import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { MemoryStore } from "../src/store.js";

const admin = { "x-user-id": "user-global-admin" };

describe("camera digital identity", () => {
  let app: FastifyInstance;
  let store: MemoryStore;
  let agentId: string;

  beforeEach(async () => {
    store = new MemoryStore();
    agentId = (await store.registerEdgeAgent(
      "branch-blr-001",
      "Identity gateway",
      "1.0.0",
    )).id;
    app = await buildApp({ logger: false, store });
  });

  afterEach(async () => app.close());

  it("keeps one camera and records IP history when its address changes", async () => {
    const firstDiscovery = await submitDiscovery("192.168.40.20", "5.7.0");
    expect(firstDiscovery.statusCode).toBe(202);
    const first = firstDiscovery.json();
    expect(first.discoveryLayers).toHaveLength(10);
    expect(first.discoveryLayers.at(-1)).toMatchObject({ layer: "register", status: "passed" });

    const approved = await app.inject({
      method: "POST",
      url: `/v1/branches/branch-blr-001/cameras/discovered/${first.id}/approve`,
      headers: admin,
      payload: { name: "Front entrance" },
    });
    expect(approved.statusCode).toBe(200);
    const cameraId = approved.json().cameraId as string;
    const cameraCount = store.cameras.size;

    const secondDiscovery = await submitDiscovery("192.168.40.87", "5.8.1");
    expect(secondDiscovery.statusCode).toBe(202);
    expect(secondDiscovery.json()).toMatchObject({
      deviceIdentityId: first.deviceIdentityId,
      status: "approved",
      duplicateStatus: "duplicate",
      existingDeviceAssociation: cameraId,
    });
    expect(store.cameras.size).toBe(cameraCount);
    expect(await store.getCamera(cameraId)).toMatchObject({
      id: cameraId,
      deviceIdentityId: first.deviceIdentityId,
      ipAddress: "192.168.40.87",
      firmwareVersion: "5.8.1",
      onvifUuid: "4e5f61f4-5747-4fde-b9e2-b2a36a90f085",
    });

    const identityResponse = await app.inject({
      method: "GET",
      url: `/v1/cameras/${cameraId}/identity`,
      headers: admin,
    });
    expect(identityResponse.statusCode).toBe(200);
    expect(identityResponse.json()).toMatchObject({
      deviceId: first.deviceIdentityId,
      cameraId,
      hardwareSerial: "CAMERA-SN-4500",
      manufacturer: "Hikvision",
      model: "DS-2CD-Test",
      firmwareVersion: "5.8.1",
      currentIpAddress: "192.168.40.87",
      onvifUuid: "4e5f61f4-5747-4fde-b9e2-b2a36a90f085",
      agentId,
    });
    expect(identityResponse.json().ipHistory).toEqual(expect.arrayContaining([
      expect.objectContaining({ ipAddress: "192.168.40.20", observationCount: 1 }),
      expect.objectContaining({ ipAddress: "192.168.40.87", observationCount: 1 }),
    ]));
  });

  it("keeps recorder channels as separate physical identities", async () => {
    const first = await submitRecorderChannel(1);
    const second = await submitRecorderChannel(2);

    expect(first.statusCode).toBe(202);
    expect(second.statusCode).toBe(202);
    expect(first.json().deviceIdentityId).not.toBe(second.json().deviceIdentityId);
  });

  it("keeps repeated fingerprint-only scans idempotent after an IP change", async () => {
    const firstResponse = await submitFingerprintDiscovery("192.168.60.20");
    expect(firstResponse.statusCode).toBe(202);
    const first = firstResponse.json();
    const approved = await app.inject({
      method: "POST",
      url: `/v1/branches/branch-blr-001/cameras/discovered/${first.id}/approve`,
      headers: admin,
      payload: { name: "Vendor fallback camera" },
    });
    expect(approved.statusCode).toBe(200);
    const cameraCount = store.cameras.size;

    const repeatedResponse = await submitFingerprintDiscovery("192.168.60.99");
    expect(repeatedResponse.statusCode).toBe(202);
    expect(repeatedResponse.json()).toMatchObject({
      id: first.id,
      deviceIdentityId: first.deviceIdentityId,
      status: "approved",
      duplicateStatus: "duplicate",
      existingDeviceAssociation: approved.json().cameraId,
    });
    expect(repeatedResponse.json().discoveryLayers).toHaveLength(10);
    expect(store.cameras.size).toBe(cameraCount);
    expect(await store.getCamera(approved.json().cameraId)).toMatchObject({ ipAddress: "192.168.60.99" });
  });

  function submitDiscovery(ipAddress: string, firmwareVersion: string) {
    return app.inject({
      method: "POST",
      url: "/v1/branches/branch-blr-001/cameras/discovered",
      headers: admin,
      payload: {
        edgeAgentId: agentId,
        discoveryMethod: "onvif-ws-discovery",
        vendor: "hikvision",
        manufacturer: "Hikvision",
        model: "DS-2CD-Test",
        ipAddress,
        macAddress: "00:11:22:33:44:55",
        serialNumber: "CAMERA-SN-4500",
        firmwareVersion,
        onvifEndpointReference: "urn:uuid:4e5f61f4-5747-4fde-b9e2-b2a36a90f085",
        onvifPort: 80,
        rtspPort: 554,
        discoveryLayers: completedEdgeLayers(),
        streamVerified: true,
        rtspValidated: true,
        profiles: [{ name: "main", codec: "H264", width: 1920, height: 1080 }],
        capabilities: { ptz: false, audio: true, events: true },
      },
    });
  }

  function submitFingerprintDiscovery(ipAddress: string) {
    return app.inject({
      method: "POST",
      url: "/v1/branches/branch-blr-001/cameras/discovered",
      headers: admin,
      payload: {
        edgeAgentId: agentId,
        discoveryMethod: "onvif-ws-discovery",
        vendor: "other",
        manufacturer: "Legacy camera",
        model: "RTSP-only",
        ipAddress,
        hardwareId: "sha256:9219f48625163036c560a45efc5685adddec385e3af5ef80191524258de13dcc",
        onvifPort: 80,
        rtspPort: 554,
        discoveryLayers: completedEdgeLayers(),
        streamVerified: true,
        rtspValidated: true,
        profiles: [{ name: "vendor main", codec: "H264", width: 1280, height: 720 }],
        capabilities: { ptz: false, audio: false, events: false },
      },
    });
  }

  function submitRecorderChannel(channel: number) {
    return app.inject({
      method: "POST",
      url: "/v1/branches/branch-blr-001/cameras/discovered",
      headers: admin,
      payload: {
        edgeAgentId: agentId,
        discoveryMethod: "nvr-dvr-channel-discovery",
        vendor: "other",
        manufacturer: "Branch DVR",
        model: "16 channel DVR",
        ipAddress: "192.168.50.10",
        sourceType: "analog-dvr-channel",
        recorderId: "branch-dvr-01",
        recorderSerialNumber: "DVR-SN-01",
        recorderChannel: channel,
        hardwareId: `DVR-SN-01:channel:${channel}`,
        onvifEndpointReference: "urn:uuid:7918e6d5-a840-4bfc-a276-7b5a0e88c835",
        onvifPort: 80,
        rtspPort: 554,
        profiles: [{ name: "main", codec: "H264", width: 1920, height: 1080 }],
        capabilities: { ptz: false, audio: false, events: true },
      },
    });
  }
});

function completedEdgeLayers() {
  return [
    { layer: "network-discovery", status: "passed", detail: "Host found" },
    { layer: "onvif-discovery", status: "passed", detail: "Service found" },
    { layer: "onvif-authentication", status: "passed", detail: "Authenticated" },
    { layer: "get-capabilities", status: "passed", detail: "Capabilities loaded" },
    { layer: "get-profiles", status: "passed", detail: "Profiles loaded" },
    { layer: "get-stream-uri", status: "passed", detail: "URI returned" },
    { layer: "rtsp-verification", status: "passed", detail: "Video decoded" },
    { layer: "vendor-adapter", status: "skipped", detail: "Not required" },
    { layer: "fingerprint", status: "passed", detail: "Fingerprint created" },
  ];
}
