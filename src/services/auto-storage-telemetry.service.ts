import type { Pool } from "pg";

/**
 * Compatibility facade for older onboarding paths. Registration is not a
 * hardware probe: only the edge/recorder telemetry ingestion path may report
 * a disk, capacity, SMART status, or recording storage node.
 */
export class AutoStorageTelemetryService {
  constructor(_pool: Pool) {}

  async collectStorageTelemetryForDevice(_device: unknown, _options?: unknown): Promise<number> {
    return 0;
  }

  async collectStorageTelemetryForCamera(_camera: unknown, _options?: unknown): Promise<number> {
    return 0;
  }

  async hasStorageTelemetry(_deviceId: string, _branchId: string): Promise<boolean> {
    return false;
  }

  async ensureAllCamerasAndDevicesStorage(_tenantId?: string): Promise<{
    camerasProcessed: number;
    storageRecordsCreated: number;
  }> {
    return { camerasProcessed: 0, storageRecordsCreated: 0 };
  }

  async refreshStorageTelemetry(_deviceId: string, _branchId: string, _tenantId: string): Promise<number> {
    return 0;
  }
}
