import { describe, expect, it } from "vitest";
import { MemoryStore } from "../store.js";
import { FirmwareManager } from "./firmware-manager.js";

describe("FirmwareManager", () => {
  it("registers firmware catalog entries and updates device inventory", async () => {
    const store = new MemoryStore();
    const manager = new FirmwareManager(store, console);

    const version = await manager.registerFirmwareVersion({
      tenantId: "omsystems",
      assetCategory: "camera",
      vendor: "Hikvision",
      model: "DS-2CD2xx",
      version: "5.7.2",
      releaseDate: new Date("2024-11-01T00:00:00.000Z"),
      fileUrl: "https://example.test/firmware.bin",
      fileHash: "abc123",
      fileSize: 42_000,
      releaseNotes: "Security fixes and stability updates",
      criticality: "critical",
      compatibility: ["DS-2CD2xx"],
      createdBy: "tester",
    });

    const approval = await manager.requestApproval({
      tenantId: "omsystems",
      firmwareVersionId: version.id,
      requestedBy: "tester",
      justification: "Security hardening for branch cameras",
    });
    await manager.approveFirmware({
      requestId: approval.id,
      reviewedBy: "tester",
      reviewNotes: "Approved for rollout",
    });

    const catalog = await manager.listFirmwareCatalog("omsystems");
    expect(catalog).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: version.id, version: version.version })
    ]));

    const update = await manager.scheduleFirmwareUpdate({
      tenantId: "omsystems",
      firmwareVersionId: version.id,
      targetAssets: ["cam-001"],
      createdBy: "tester",
    });

    await manager.executeFirmwareUpdate(update.id);

    const inventory = await manager.getAssetFirmwareInventory("omsystems", "cam-001");
    expect(inventory).toEqual(expect.objectContaining({
      assetId: "cam-001",
      currentVersion: version.version,
      latestApprovedVersion: version.version,
      classification: "current",
    }));
  });

  it("blocks firmware rollout plans when live asset and incident state is unsafe", async () => {
    const store = new MemoryStore();
    const manager = new FirmwareManager(store, console);

    const version = await manager.registerFirmwareVersion({
      tenantId: "omsystems",
      assetCategory: "camera",
      vendor: "Hikvision",
      model: "DS-2CD2xx",
      version: "5.7.4",
      releaseDate: new Date("2024-11-03T00:00:00.000Z"),
      fileUrl: "https://example.test/firmware.bin",
      fileHash: "abc123",
      fileSize: 42_000,
      releaseNotes: "Security fixes",
      criticality: "critical",
      compatibility: ["DS-2CD2xx"],
      checksum: "abc123",
      signature: "sig-123",
      createdBy: "tester",
    });

    const approval = await manager.requestApproval({
      tenantId: "omsystems",
      firmwareVersionId: version.id,
      requestedBy: "tester",
      justification: "Approve live-state enforcement rollout",
    });
    await manager.approveFirmware({
      requestId: approval.id,
      reviewedBy: "tester",
      reviewNotes: "Approved for live enforcement test",
    });

    const asset = await store.createMaintenanceAsset({
      tenantId: "omsystems",
      category: "camera",
      assetType: "camera",
      status: "degraded",
      createdBy: "tester",
      model: "DS-2CD2xx",
      make: "Hikvision",
    });

    const incident = await store.createIncident({
      tenantId: "omsystems",
      title: "Camera maintenance incident",
      description: "Asset is under investigation",
      incidentType: "maintenence",
      severity: "P2",
      detectionSource: "manual",
      occurredAt: new Date().toISOString(),
      reportedBy: "tester",
    });
    await store.addIncidentCamera(incident.id, asset.id, true, "tester");

    const plan = await manager.createUpgradePlan({
      tenantId: "omsystems",
      firmwareVersionId: version.id,
      targetAssets: [asset.id],
      strategy: "single-device",
      requestedBy: "tester",
      safetyContext: {
        modelConfirmed: true,
        exactVersionConfirmed: true,
        powerConfirmed: true,
        upsConfirmed: true,
        networkStable: true,
        backupCompleted: true,
        redundancyVerified: true,
        activeIncidentsPresent: false,
        alertsSuspended: true,
        maintenanceWindowApproved: true,
        rollbackPlanned: true,
        packageVerified: true,
        compatibilityVerified: true,
      },
    });

    expect(plan.status).toBe("blocked");
    expect(plan.safetyChecks.blockers).toEqual(expect.arrayContaining([
      expect.stringContaining("not in an operational state"),
      expect.stringContaining("active incident"),
    ]));
  });

  it("blocks unsafe firmware rollout plans until safety checks pass", async () => {
    const store = new MemoryStore();
    const manager = new FirmwareManager(store, console);

    const version = await manager.registerFirmwareVersion({
      tenantId: "omsystems",
      assetCategory: "camera",
      vendor: "Hikvision",
      model: "DS-2CD2xx",
      version: "5.7.3",
      releaseDate: new Date("2024-11-02T00:00:00.000Z"),
      fileUrl: "https://example.test/firmware.bin",
      fileHash: "abc123",
      fileSize: 42_000,
      releaseNotes: "Security fixes and stability updates",
      criticality: "critical",
      compatibility: ["DS-2CD2xx"],
      checksum: "abc123",
      signature: "sig-123",
      createdBy: "tester",
    });

    const approval = await manager.requestApproval({
      tenantId: "omsystems",
      firmwareVersionId: version.id,
      requestedBy: "tester",
      justification: "Approve the test rollout package",
    });
    await manager.approveFirmware({
      requestId: approval.id,
      reviewedBy: "tester",
      reviewNotes: "Approved for test rollout",
    });

    const unsafePlan = await manager.createUpgradePlan({
      tenantId: "omsystems",
      firmwareVersionId: version.id,
      targetAssets: ["cam-001"],
      strategy: "single-device",
      requestedBy: "tester",
      safetyContext: {
        modelConfirmed: true,
        exactVersionConfirmed: true,
        powerConfirmed: true,
        upsConfirmed: true,
        networkStable: true,
        backupCompleted: true,
        redundancyVerified: true,
        activeIncidentsPresent: true,
        alertsSuspended: true,
        maintenanceWindowApproved: true,
        rollbackPlanned: true,
        packageVerified: true,
        compatibilityVerified: true,
      },
    });

    expect(unsafePlan.status).toBe("blocked");
    expect(unsafePlan.safetyChecks.blockers).toContain("Active incidents must be cleared before upgrade.");

    const safePlan = await manager.createUpgradePlan({
      tenantId: "omsystems",
      firmwareVersionId: version.id,
      targetAssets: ["cam-001"],
      strategy: "test-group",
      requestedBy: "tester",
      safetyContext: {
        modelConfirmed: true,
        exactVersionConfirmed: true,
        powerConfirmed: true,
        upsConfirmed: true,
        networkStable: true,
        backupCompleted: true,
        redundancyVerified: true,
        activeIncidentsPresent: false,
        alertsSuspended: true,
        maintenanceWindowApproved: true,
        rollbackPlanned: true,
        packageVerified: true,
        compatibilityVerified: true,
      },
    });

    expect(safePlan.status).toBe("planned");
    expect(safePlan.safetyChecks.blockers).toEqual([]);
  });
});
