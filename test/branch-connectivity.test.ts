import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { MemoryStore } from "../src/store.js";

const headers = { "x-user-id": "user-global-admin" };
const branchId = "branch-blr-001";

describe("branch VPN and tunnel connectivity", () => {
  let app: FastifyInstance;
  let store: MemoryStore;

  beforeEach(async () => {
    store = new MemoryStore();
    app = await buildApp({ store });
  });
  afterEach(async () => app.close());

  it("uses an existing VPN for both direct IP cameras and analog DVR channels", async () => {
    const configured = await app.inject({
      method: "PUT", url: `/v1/branches/${branchId}/connectivity`, headers,
      payload: {
        primaryTransport: "vpn",
        fallbackTransport: "cloudflare-tunnel",
        vpnProtocol: "ipsec",
        vpnRemoteNetworks: ["10.42.0.0/16"],
      },
    });
    expect(configured.statusCode).toBe(200);
    expect(configured.json().profile).toMatchObject({ primaryTransport: "vpn", vpnProtocol: "ipsec" });

    const ipCamera = await app.inject({
      method: "POST", url: `/v1/branches/${branchId}/cameras`, headers,
      payload: {
        name: "VPN entrance camera", channel: 1, protocol: "onvif-t",
        manufacturer: "Hikvision", model: "DS-2CD", ipAddress: "10.42.5.20",
      },
    });
    expect(ipCamera.statusCode).toBe(201);
    expect(ipCamera.json()).toMatchObject({
      sourceType: "ip-camera", connectionTransport: "vpn",
    });
    const ipStored = await store.getCamera(ipCamera.json().id);
    expect(ipStored?.connectionSecretRef).toBe(`vpn://${branchId}/camera/10.42.5.20`);
    expect((await store.getRecordingJob(ipStored!.id))?.primaryRecordingStorage).toBe("sentinel-local");

    const analogChannel = await app.inject({
      method: "POST", url: `/v1/branches/${branchId}/cameras`, headers,
      payload: {
        name: "VPN vault analog channel", channel: 4, protocol: "vendor-adapter",
        manufacturer: "CP Plus", model: "XVR", ipAddress: "10.42.5.10",
        sourceType: "analog-dvr-channel", recorderId: "dvr-vault-01", recorderChannel: 4,
      },
    });
    expect(analogChannel.statusCode).toBe(201);
    expect(analogChannel.json()).toMatchObject({
      sourceType: "analog-dvr-channel", recorderId: "dvr-vault-01", recorderChannel: 4,
      connectionTransport: "vpn",
    });
    const analogStored = await store.getCamera(analogChannel.json().id);
    expect(analogStored?.connectionSecretRef).toBe(`vpn://${branchId}/recorder/dvr-vault-01/channel/4`);
    expect((await store.getRecordingJob(analogStored!.id))).toMatchObject({
      primaryRecordingStorage: "recorder-local", cloudArchivePolicy: "incident-evidence-only",
    });
  });

  it("blocks public or unrouted addresses from being treated as VPN devices", async () => {
    await app.inject({
      method: "PUT", url: `/v1/branches/${branchId}/connectivity`, headers,
      payload: { primaryTransport: "vpn", vpnProtocol: "wireguard", vpnRemoteNetworks: ["192.168.90.0/24"] },
    });
    const publicAddress = await app.inject({
      method: "POST", url: `/v1/branches/${branchId}/cameras`, headers,
      payload: { name: "Unsafe", channel: 1, protocol: "rtsp", ipAddress: "8.8.8.8" },
    });
    expect(publicAddress.statusCode).toBe(400);
    expect(publicAddress.json().error).toBe("vpn_requires_private_camera_or_recorder_address");

    const outsideRoute = await app.inject({
      method: "POST", url: `/v1/branches/${branchId}/cameras`, headers,
      payload: { name: "Wrong branch", channel: 1, protocol: "rtsp", ipAddress: "192.168.91.20" },
    });
    expect(outsideRoute.statusCode).toBe(400);
    expect(outsideRoute.json().error).toBe("camera_address_outside_configured_vpn_networks");
  });

  it("keeps Cloudflare Tunnel available as the alternative branch transport", async () => {
    const configured = await app.inject({
      method: "PUT", url: `/v1/branches/${branchId}/connectivity`, headers,
      payload: { primaryTransport: "cloudflare-tunnel", fallbackTransport: "vpn", vpnProtocol: "openvpn", vpnRemoteNetworks: ["10.43.0.0/16"] },
    });
    expect(configured.statusCode).toBe(200);
    const read = await app.inject({ method: "GET", url: `/v1/branches/${branchId}/connectivity`, headers });
    expect(read.json().profile).toMatchObject({ primaryTransport: "cloudflare-tunnel", fallbackTransport: "vpn" });
    expect(read.json().supported.vpn.cameraTypes).toEqual(expect.arrayContaining(["ip-camera", "analog-dvr-channel"]));
  });

  it("approves locally discovered DVR channels onto the configured VPN route", async () => {
    await app.inject({
      method: "PUT", url: `/v1/branches/${branchId}/connectivity`, headers,
      payload: { primaryTransport: "vpn", vpnProtocol: "ipsec", vpnRemoteNetworks: ["192.168.20.0/24"] },
    });
    const agent = await store.registerEdgeAgent(branchId, "Temporary local scanner", "1.0.0");
    const submitted = await app.inject({
      method: "POST", url: `/v1/branches/${branchId}/cameras/discovered`, headers,
      payload: {
        edgeAgentId: agent.id, discoveryMethod: "nvr-dvr-channel-discovery",
        vendor: "other", manufacturer: "Legacy DVR", model: "16 channel DVR",
        ipAddress: "192.168.20.10", onvifPort: 80, rtspPort: 554,
        profiles: [{ name: "main", codec: "H264", width: 1920, height: 1080 }],
        capabilities: { ptz: false, audio: false, events: true },
        streamVerified: true, rtspValidated: true, duplicateStatus: "unique", compatibilityStatus: "compatible",
        sourceType: "analog-dvr-channel", recorderId: "dvr-local-01", recorderChannel: 7,
      },
    });
    expect(submitted.statusCode).toBe(202);
    const approved = await app.inject({
      method: "POST", url: `/v1/branches/${branchId}/cameras/discovered/${submitted.json().id}/approve`, headers,
      payload: { name: "Local scanner analog channel" },
    });
    expect(approved.statusCode).toBe(200);
    expect(await store.getCamera(approved.json().cameraId)).toMatchObject({
      connectionTransport: "vpn",
      connectionSecretRef: `vpn://${branchId}/recorder/dvr-local-01/channel/7`,
      sourceType: "analog-dvr-channel",
    });
  });
});
