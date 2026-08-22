import { describe, expect, it } from "vitest";
import { MemoryStore } from "./store.js";

describe("device management workflows", () => {
  it("rotates credentials without exposing plaintext passwords", async () => {
    const store = new MemoryStore();
    const device = await store.createDeviceInventoryRecord({
      tenantId: "omsystems",
      tenant: "omsystems",
      deviceId: "cam-rot-001",
      region: "South",
      branch: "Bengaluru",
      deviceType: "ip-camera",
      manufacturer: "Hikvision",
      model: "DS-2CD",
      ipAddress: "10.0.0.10",
      healthStatus: "operational",
      lifecycleState: "operational",
    });

    const rotation = await store.startPasswordRotation({
      tenantId: "omsystems",
      deviceId: device.id,
      requestedBy: "tester",
      reason: "Scheduled rotation",
      rotationMode: "scheduled",
      newPassword: "StrongPass123!",
    });

    expect(rotation.status).toBe("pending-verification");
    expect(rotation.password).toBeUndefined();
    expect(rotation.newPassword).toBeUndefined();
    expect(rotation.secretRef).toContain("device-credential");

    const rotations = await store.listPasswordRotations("omsystems");
    expect(rotations).toHaveLength(1);
  });

  it("applies device templates and reports drift", async () => {
    const store = new MemoryStore();
    const device = await store.createDeviceInventoryRecord({
      tenantId: "omsystems",
      tenant: "omsystems",
      deviceId: "cam-template-001",
      region: "South",
      branch: "Bengaluru",
      deviceType: "ip-camera",
      manufacturer: "Hikvision",
      model: "DS-2CD",
      healthStatus: "operational",
      lifecycleState: "operational",
    });

    const template = await store.createDeviceTemplate({
      tenantId: "omsystems",
      name: "ATM Camera Standard",
      templateType: "camera-configuration",
      category: "camera",
      settings: {
        resolution: "4MP",
        codec: "H.265",
        wdr: true,
        tampering: true,
      },
      createdBy: "tester",
    });

    const applied = await store.applyDeviceTemplate({
      tenantId: "omsystems",
      deviceId: device.id,
      templateId: template.id,
      appliedBy: "tester",
    });

    expect(applied.status).toBe("applied");

    const drift = await store.getDeviceTemplateDrift(device.id, template.id);
    expect(drift.status).toBe("compliant");
  });

  it("detects duplicate IP assignments and surfaces conflicts", async () => {
    const store = new MemoryStore();
    const firstDevice = await store.createDeviceInventoryRecord({
      tenantId: "omsystems",
      tenant: "omsystems",
      deviceId: "cam-ip-001",
      region: "South",
      branch: "Bengaluru",
      deviceType: "ip-camera",
      manufacturer: "Hikvision",
      model: "DS-2CD",
      healthStatus: "operational",
      lifecycleState: "operational",
    });
    const secondDevice = await store.createDeviceInventoryRecord({
      tenantId: "omsystems",
      tenant: "omsystems",
      deviceId: "cam-ip-002",
      region: "South",
      branch: "Bengaluru",
      deviceType: "ip-camera",
      manufacturer: "CP Plus",
      model: "CP-UNC",
      healthStatus: "operational",
      lifecycleState: "operational",
    });

    const firstAssignment = await store.assignDeviceIpAddress({
      tenantId: "omsystems",
      deviceId: firstDevice.id,
      ipAddress: "10.0.0.50",
      subnet: "10.0.0.0/24",
      assignedBy: "tester",
      reservationStatus: "static",
    });

    const secondAssignment = await store.assignDeviceIpAddress({
      tenantId: "omsystems",
      deviceId: secondDevice.id,
      ipAddress: "10.0.0.50",
      subnet: "10.0.0.0/24",
      assignedBy: "tester",
      reservationStatus: "static",
    });

    expect(firstAssignment.conflict).toBe(false);
    expect(secondAssignment.conflict).toBe(true);

    const conflicts = await store.getIpConflicts("omsystems");
    expect(conflicts).toHaveLength(1);
  });
});
