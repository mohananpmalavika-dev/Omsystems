import { describe, expect, it } from "vitest";
import { CameraLeaseManager } from "../../src/ha/services/camera-lease-manager.service.js";
import { StaleLeaseEpochError } from "../../src/errors/distributed-state.errors.js";

describe("Media Side-Effecting Operation Fencing (P0 Phase 1)", () => {
  it("allows operation when epoch and owner match active lease", async () => {
    const mockRedis = {
      get: async (key: string) => {
        if (key.includes("lease")) {
          return JSON.stringify({
            cameraId: "cam-vault-01",
            ownerId: "node-primary-01",
            epoch: 152,
            acquiredAt: new Date().toISOString(),
          });
        }
        return null;
      },
      ttl: async () => 25,
    };

    const manager = new CameraLeaseManager({
      redisClient: mockRedis,
      leaseTimeoutSeconds: 30,
      renewalIntervalSeconds: 10,
      heartbeatIntervalSeconds: 5,
    });

    await expect(
      manager.assertOperationFencing("cam-vault-01", "node-primary-01", 152, "start_recording"),
    ).resolves.not.toThrow();
  });

  it("throws StaleLeaseEpochError when operation carries stale epoch", async () => {
    const mockRedis = {
      get: async (key: string) => {
        if (key.includes("lease")) {
          return JSON.stringify({
            cameraId: "cam-vault-01",
            ownerId: "node-primary-01",
            epoch: 152,
            acquiredAt: new Date().toISOString(),
          });
        }
        return null;
      },
      ttl: async () => 25,
    };

    const manager = new CameraLeaseManager({
      redisClient: mockRedis,
      leaseTimeoutSeconds: 30,
      renewalIntervalSeconds: 10,
      heartbeatIntervalSeconds: 5,
    });

    // Request comes with epoch 151, active epoch is 152
    await expect(
      manager.assertOperationFencing("cam-vault-01", "node-primary-01", 151, "start_recording"),
    ).rejects.toThrow(StaleLeaseEpochError);
  });

  it("rejects operation when lease is owned by another node", async () => {
    const mockRedis = {
      get: async (key: string) => {
        if (key.includes("lease")) {
          return JSON.stringify({
            cameraId: "cam-vault-01",
            ownerId: "node-primary-02",
            epoch: 152,
            acquiredAt: new Date().toISOString(),
          });
        }
        return null;
      },
      ttl: async () => 25,
    };

    const manager = new CameraLeaseManager({
      redisClient: mockRedis,
      leaseTimeoutSeconds: 30,
      renewalIntervalSeconds: 10,
      heartbeatIntervalSeconds: 5,
    });

    await expect(
      manager.assertOperationFencing("cam-vault-01", "node-primary-01", 152, "start_recording"),
    ).rejects.toThrow(/ownership_lost/);
  });

  it("rejects operation when lease has expired or is not found", async () => {
    const mockRedis = {
      get: async () => null,
      ttl: async () => -2,
    };

    const manager = new CameraLeaseManager({
      redisClient: mockRedis,
      leaseTimeoutSeconds: 30,
      renewalIntervalSeconds: 10,
      heartbeatIntervalSeconds: 5,
    });

    await expect(
      manager.assertOperationFencing("cam-vault-01", "node-primary-01", 152, "ptz_control"),
    ).rejects.toThrow(/lease_expired/);
  });
});
