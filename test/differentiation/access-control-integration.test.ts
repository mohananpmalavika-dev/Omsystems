import { describe, it, expect } from "vitest";
import { UnifiedAccessControlService } from "../../src/access-control/services/unified-access-control.service.js";

describe("Unified Access Control Integration (Phase 31)", () => {
  it("registers doors and binds cameras with pre/post event time windows", async () => {
    const ac = new UnifiedAccessControlService();

    const door = await ac.registerDoor({
      tenantId: "bank-corp",
      branchId: "BR-001",
      doorCode: "DOOR-VAULT-01",
      name: "Main Vault Secure Airlock",
      locationType: "VAULT",
      antiPassbackEnabled: true,
    });

    expect(door.id).toBeDefined();
    expect(door.state).toBe("LOCKED");

    const binding = await ac.bindDoorToCamera({
      tenantId: "bank-corp",
      doorId: door.id,
      cameraId: "CAM-VAULT-DOOR-01",
      direction: "BOTH",
      preEventSeconds: 15,
      postEventSeconds: 30,
    });

    expect(binding.id).toBeDefined();
    expect(binding.cameraId).toBe("CAM-VAULT-DOOR-01");
  });

  it("enforces anti-passback rule when same badge enters twice consecutively", async () => {
    const ac = new UnifiedAccessControlService();

    const door = await ac.registerDoor({
      tenantId: "bank-corp",
      branchId: "BR-001",
      doorCode: "DOOR-ENTRY-01",
      name: "Front Branch Entrance",
      locationType: "ENTRANCE",
      antiPassbackEnabled: true,
    });

    // First entry: granted
    const entry1 = await ac.evaluateAndRecordAccess({
      tenantId: "bank-corp",
      branchId: "BR-001",
      doorId: door.id,
      credentialType: "BADGE",
      badgeId: "CARD-88392",
      direction: "ENTRY",
      detectedPersonCount: 1,
    });

    expect(entry1.granted).toBe(true);
    expect(entry1.denialReason).toBeUndefined();

    // Second entry without exit: anti-passback violation
    const entry2 = await ac.evaluateAndRecordAccess({
      tenantId: "bank-corp",
      branchId: "BR-001",
      doorId: door.id,
      credentialType: "BADGE",
      badgeId: "CARD-88392",
      direction: "ENTRY",
      detectedPersonCount: 1,
    });

    expect(entry2.granted).toBe(false);
    expect(entry2.denialReason).toBe("ANTI_PASSBACK");
  });

  it("detects tailgating when camera detects multiple persons on single badge swipe", async () => {
    const ac = new UnifiedAccessControlService();

    const door = await ac.registerDoor({
      tenantId: "bank-corp",
      branchId: "BR-001",
      doorCode: "DOOR-SERVER-01",
      name: "Server Room Entrance",
      locationType: "SERVER_ROOM",
      antiPassbackEnabled: false,
    });

    await ac.bindDoorToCamera({
      tenantId: "bank-corp",
      doorId: door.id,
      cameraId: "CAM-SERVER-01",
      direction: "IN",
    });

    const access = await ac.evaluateAndRecordAccess({
      tenantId: "bank-corp",
      branchId: "BR-001",
      doorId: door.id,
      credentialType: "BIOMETRIC",
      badgeId: "BIO-USR-44",
      direction: "ENTRY",
      detectedPersonCount: 2, // Tailgating! 2 persons detected with 1 authorization
    });

    expect(access.granted).toBe(true);
    expect(access.tailgatingDetected).toBe(true);
    expect(access.tailgatingIncidentId).toBeDefined();
    expect(access.boundCameraIds).toContain("CAM-SERVER-01");
    expect(access.bookmarkCreated).toBe(true);
  });
});
