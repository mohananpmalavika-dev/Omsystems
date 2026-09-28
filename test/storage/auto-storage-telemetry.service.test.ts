import { describe, expect, it } from "vitest";
import { AutoStorageTelemetryService, type StorageMetrics } from "../../src/services/auto-storage-telemetry.service.js";

describe("AutoStorageTelemetryService", () => {
  it("provisions distinct MicroSD and HDD volumes when an SD-card camera is added", () => {
    const service = new AutoStorageTelemetryService({} as never) as unknown as {
      generateStorageProfile(config: Record<string, unknown>): StorageMetrics[];
    };

    const volumes = service.generateStorageProfile({
      deviceId: "camera-1",
      deviceName: "Entrance camera",
      branchId: "branch-1",
      tenantId: "tenant-1",
      deviceType: "ip-camera",
      storageTier: "sd_card",
    });

    expect(volumes.map((volume) => volume.deviceId)).toEqual([
      "camera-1:sdcard",
      "rec-camera-1:disk:1",
    ]);
    expect(new Set(volumes.map((volume) => volume.deviceId)).size).toBe(2);
  });
});
