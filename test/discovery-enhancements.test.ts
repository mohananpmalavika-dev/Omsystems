import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { MemoryStore } from "../src/store.js";

describe("enhanced device discovery", () => {
  it("preserves ONVIF service coverage and capability test results", async () => {
    const store = new MemoryStore();
    const app = await buildApp({ logger: false, store });
    const headers = { "x-user-id": "user-global-admin" };
    const agent = await store.registerEdgeAgent("branch-blr-001", "gateway-test", "0.1.0");

    const response = await app.inject({
      method: "POST",
      url: "/v1/branches/branch-blr-001/cameras/discovered",
      headers,
      payload: {
        edgeAgentId: agent.id,
        discoveryMethod: "onvif-ws-discovery",
        vendor: "hikvision",
        manufacturer: "Hikvision",
        model: "DS-2CD-Test",
        ipAddress: "192.168.10.25",
        macAddress: "00:11:22:33:44:66",
        serialNumber: "SN-101",
        firmwareVersion: "5.8.0",
        onvifSupport: true,
        onvifEndpointReference: "http://camera-2/onvif/device_service",
        onvifServices: ["DeviceManagement", "Media", "Media2", "PTZ", "Events", "Imaging", "Analytics", "Recording", "DeviceIO", "Replay"],
        onvifCapabilityTests: [
          { name: "ONVIF authentication", status: "pass", detail: "Authenticated SOAP calls succeeded" },
          { name: "Device information", status: "pass", detail: "Device metadata available" },
          { name: "Media profiles", status: "pass", detail: "Profiles discovered" },
          { name: "RTSP URI", status: "pass", detail: "Stream URI retrieved" },
          { name: "H.264", status: "pass", detail: "H.264 profile present" },
          { name: "H.265", status: "unsupported", detail: "No H.265 profile" },
          { name: "PTZ", status: "unsupported", detail: "PTZ service not exposed" },
          { name: "Events", status: "pass", detail: "Event service available" },
          { name: "Imaging control", status: "pass", detail: "Imaging service available" },
          { name: "Firmware upgrade", status: "vendor-specific", detail: "Vendor-specific upgrade path" },
        ],
        mediaProfiles: [{ name: "main", codec: "H264", width: 1920, height: 1080 }],
        rtspValidated: true,
        ptzCapability: false,
        audioCapability: true,
        analyticsCapability: true,
        timeSynchronization: "synchronized",
        duplicateStatus: "unique",
        compatibilityStatus: "compatible",
        hardwareId: "HW-101",
        existingDeviceAssociation: "camera-legacy-002",
        onvifPort: 80,
        rtspPort: 554,
        profiles: [{ name: "main", codec: "H264", width: 1920, height: 1080 }],
        capabilities: { ptz: false, audio: true, events: true },
      },
    });

    expect(response.statusCode).toBe(202);
    const discovery = await store.listDiscoveredCameras("branch-blr-001");
    expect(discovery).toHaveLength(1);
    expect(discovery[0].onvifServices).toEqual(["DeviceManagement", "Media", "Media2", "PTZ", "Events", "Imaging", "Analytics", "Recording", "DeviceIO", "Replay"]);
    const tests = discovery[0].onvifCapabilityTests ?? [];
    expect(tests.find((t: any) => t.name === "ONVIF authentication")?.status).toBe("pass");
    expect(tests.find((t: any) => t.name === "PTZ")?.status).toBe("unsupported");
    expect(tests.find((t: any) => t.name === "Firmware upgrade")?.status).toBe("vendor-specific");
  });

  it("deduplicates discoveries using serial number and other identifiers", async () => {
    const store = new MemoryStore();
    const app = await buildApp({ logger: false, store });
    const headers = { "x-user-id": "user-global-admin" };
    const agent = await store.registerEdgeAgent("branch-blr-001", "gateway-test", "0.1.0");

    const firstPayload = {
      edgeAgentId: agent.id,
      discoveryMethod: "onvif-ws-discovery",
      vendor: "hikvision",
      manufacturer: "Hikvision",
      model: "DS-2CD-Test",
      ipAddress: "192.168.10.20",
      macAddress: "00:11:22:33:44:55",
      serialNumber: "SN-100",
      firmwareVersion: "5.7.0",
      onvifSupport: true,
      onvifEndpointReference: "http://camera-1/onvif/device_service",
      mediaProfiles: [{ name: "main", codec: "H264", width: 1920, height: 1080 }],
      rtspValidated: true,
      ptzCapability: true,
      audioCapability: true,
      analyticsCapability: true,
      timeSynchronization: "synchronized",
      duplicateStatus: "unique",
      compatibilityStatus: "compatible",
      hardwareId: "HW-100",
      existingDeviceAssociation: "camera-legacy-001",
      onvifPort: 80,
      rtspPort: 554,
      profiles: [{ name: "main", codec: "H264", width: 1920, height: 1080 }],
      capabilities: { ptz: true, audio: true, events: true },
    };

    const firstResponse = await app.inject({
      method: "POST",
      url: "/v1/branches/branch-blr-001/cameras/discovered",
      headers,
      payload: firstPayload,
    });
    expect(firstResponse.statusCode).toBe(202);

    const secondResponse = await app.inject({
      method: "POST",
      url: "/v1/branches/branch-blr-001/cameras/discovered",
      headers,
      payload: {
        ...firstPayload,
        ipAddress: "192.168.10.21",
        onvifPort: 81,
        rtspPort: 555,
        macAddress: "00:11:22:33:44:56",
      },
    });

    expect(secondResponse.statusCode).toBe(202);

    const discoveries = await store.listDiscoveredCameras("branch-blr-001");
    expect(discoveries).toHaveLength(1);
    expect(discoveries[0].serialNumber).toBe("SN-100");
    expect(discoveries[0].discoveryMethod).toBe("onvif-ws-discovery");
  });
});
