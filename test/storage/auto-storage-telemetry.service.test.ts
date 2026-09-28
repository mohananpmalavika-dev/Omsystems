import { describe, expect, it, vi } from "vitest";
import { AutoStorageTelemetryService } from "../../src/services/auto-storage-telemetry.service.js";

describe("AutoStorageTelemetryService", () => {
  it("never creates disk evidence from inventory registration", async () => {
    const query = vi.fn();
    const service = new AutoStorageTelemetryService({ query } as never);
    expect(await service.collectStorageTelemetryForDevice({ id: "camera-1" })).toBe(0);
    expect(await service.ensureAllCamerasAndDevicesStorage()).toEqual({
      camerasProcessed: 0,
      storageRecordsCreated: 0,
    });
    expect(query).not.toHaveBeenCalled();
  });
});
