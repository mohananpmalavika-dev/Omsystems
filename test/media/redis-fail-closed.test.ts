import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { RedisStreamLeaseRepository } from "../../src/media/repositories/redis-stream-lease.repository.js";
import { RedisMediaGatewayRegistry } from "../../src/media/repositories/redis-media-gateway.repository.js";
import {
  DistributedStateUnavailableError,
  NoHealthyMediaGatewayError,
} from "../../src/errors/distributed-state.errors.js";

describe("Fail-Closed Distributed State & Truthfulness (P0 Phase 1 & 2)", () => {
  const originalEnv = process.env.NODE_ENV;
  const originalMediaMode = process.env.MEDIA_STATE_MODE;

  beforeEach(() => {
    process.env.NODE_ENV = "production";
    delete process.env.MEDIA_STATE_MODE;
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    if (originalMediaMode) {
      process.env.MEDIA_STATE_MODE = originalMediaMode;
    } else {
      delete process.env.MEDIA_STATE_MODE;
    }
  });

  describe("RedisStreamLeaseRepository Fail-Closed Invariants", () => {
    it("throws DistributedStateUnavailableError if redis is not provided in production", async () => {
      const repo = new RedisStreamLeaseRepository(undefined);
      await expect(
        repo.acquire({
          cameraId: "cam-vault-01",
          streamProfile: "main",
          sessionId: "sess-1",
          ownerInstanceId: "node-1",
          preferredGatewayId: "gw-delhi-01",
        }),
      ).rejects.toThrow(DistributedStateUnavailableError);
    });

    it("throws DistributedStateUnavailableError when Redis throws an unexpected error", async () => {
      const brokenRedis = {
        set: async () => {
          throw new Error("CLUSTERDOWN The cluster is down");
        },
      };

      const repo = new RedisStreamLeaseRepository(brokenRedis);
      await expect(
        repo.acquire({
          cameraId: "cam-vault-01",
          streamProfile: "main",
          sessionId: "sess-1",
          ownerInstanceId: "node-1",
          preferredGatewayId: "gw-delhi-01",
        }),
      ).rejects.toThrow(DistributedStateUnavailableError);
    });

    it("refuses to manufacture synthetic gateway-default-1 or sentinel.local", async () => {
      const mockRedis = {
        set: async () => "OK",
      };

      const repo = new RedisStreamLeaseRepository(mockRedis);
      await expect(
        repo.acquire({
          cameraId: "cam-vault-01",
          sessionId: "sess-1",
          ownerInstanceId: "node-1",
          // preferredGatewayId omitted
        }),
      ).rejects.toThrow(NoHealthyMediaGatewayError);
    });
  });

  describe("RedisMediaGatewayRegistry Fail-Closed Invariants", () => {
    it("returns null instead of fake gateway-default-cluster-1 / 127.0.0.1 when no gateways registered", async () => {
      const emptyRedis = {
        keys: async () => [],
      };

      const registry = new RedisMediaGatewayRegistry(emptyRedis);
      const optimal = await registry.selectOptimalGateway("ap-south-1");
      expect(optimal).toBeNull();
    });

    it("throws DistributedStateUnavailableError on Redis failure in production instead of memory fallback", async () => {
      const failingRedis = {
        set: async () => {
          throw new Error("ECONNREFUSED 10.0.1.50:6379");
        },
      };

      const registry = new RedisMediaGatewayRegistry(failingRedis);
      await expect(
        registry.registerHeartbeat({
          gatewayId: "gw-mumbai-01",
          instanceId: "inst-1",
          host: "10.0.2.10",
          port: 8554,
          region: "ap-south-1",
          activeStreams: 5,
          maxStreams: 100,
          activeRelays: 2,
          maxRelays: 50,
          cpuPercent: 20,
          gpuPercent: 15,
          bandwidthMbps: 50,
          maxBandwidthMbps: 1000,
          transcodingSessions: 0,
          healthStatus: "HEALTHY",
          registeredAt: Date.now(),
          lastHeartbeatAt: Date.now(),
        }),
      ).rejects.toThrow(DistributedStateUnavailableError);
    });
  });
});
