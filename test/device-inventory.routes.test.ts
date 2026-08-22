import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { MemoryStore } from "../src/store.js";

describe("device inventory routes", async () => {
  const app = await buildApp({ logger: false, store: new MemoryStore() });

  it("creates, lists, and updates a unified device inventory record", async () => {
    const headers = { "x-user-id": "user-global-admin" };

    const createResponse = await app.inject({
      method: "POST",
      url: "/v1/device-inventory",
      payload: {
        deviceId: "DEV-001",
        tenant: "tenant-demo",
        region: "South",
        branch: "branch-blr-001",
        deviceType: "ip-camera",
        manufacturer: "Hikvision",
        model: "DS-2CD2143G2",
        serialNumber: "SN-001",
        macAddress: "00:11:22:33:44:55",
        ipAddress: "192.168.1.10",
        firmwareVersion: "5.6.0",
        onvifVersion: "2.4.1",
        capabilities: ["ptz", "audio"],
        credentialReference: "vault://branches/blr-001/cameras/001",
        installationDate: "2024-01-15",
        warranty: "2028-01-15",
        amcContract: "AMC-001",
        healthStatus: "healthy",
        lastCommunication: "2026-07-22T10:15:00.000Z",
        configurationTemplate: "default-ip-camera",
        riskClassification: "medium",
        lifecycleState: "operational",
      },
      headers,
    });

    expect(createResponse.statusCode).toBe(201);
    const created = JSON.parse(createResponse.body);
    expect(created.deviceId).toBe("DEV-001");
    expect(created.capabilities).toEqual(["ptz", "audio"]);

    const listResponse = await app.inject({
      method: "GET",
      url: "/v1/device-inventory",
      headers,
    });

    expect(listResponse.statusCode).toBe(200);
    const listed = JSON.parse(listResponse.body);
    expect(listed.data.some((device: any) => device.deviceId === "DEV-001")).toBe(true);

    const getResponse = await app.inject({
      method: "GET",
      url: `/v1/device-inventory/${created.id}`,
      headers,
    });

    expect(getResponse.statusCode).toBe(200);
    const fetched = JSON.parse(getResponse.body);
    expect(fetched.deviceId).toBe("DEV-001");

    const patchResponse = await app.inject({
      method: "PATCH",
      url: `/v1/device-inventory/${created.id}`,
      payload: {
        healthStatus: "warning",
        lifecycleState: "maintenance",
      },
      headers,
    });

    expect(patchResponse.statusCode).toBe(200);
    const updated = JSON.parse(patchResponse.body);
    expect(updated.healthStatus).toBe("warning");
    expect(updated.lifecycleState).toBe("maintenance");
  });
});
