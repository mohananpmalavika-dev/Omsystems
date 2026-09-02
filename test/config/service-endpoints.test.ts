import { describe, it, expect } from "vitest";
import { resolveServiceEndpoints } from "../../src/config/service-endpoints.js";

describe("Dynamic Service Relocation & Non-Standard Hostname Tests", () => {
  it("resolves externalized endpoints with non-standard service hostnames without modification", () => {
    const endpoints = resolveServiceEndpoints({
      env: {
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://user:pass@db-test-748.database.svc.cluster.local:5432/sentinel",
        CONTROL_API_URL: "https://control-test-182.sentinel.internal",
        REDIS_URL: "rediss://redis-test-934.cache.svc.cluster.local:6379",
        MEDIA_GATEWAY_URL: "http://media-test-550.svc:8090",
        RECORDING_ENGINE_URL: "http://rec-test-310.svc:8095",
        ANALYTICS_ENGINE_URL: "http://ai-test-625.svc:8092",
        NATS_URL: "nats://nats-test-01.svc:4222",
      },
    });

    expect(endpoints.databaseUrl.hostname).toBe("db-test-748.database.svc.cluster.local");
    expect(endpoints.controlApiUrl.hostname).toBe("control-test-182.sentinel.internal");
    expect(endpoints.redisUrl?.hostname).toBe("redis-test-934.cache.svc.cluster.local");
    expect(endpoints.mediaGatewayUrl?.hostname).toBe("media-test-550.svc");
    expect(endpoints.recordingEngineUrl?.hostname).toBe("rec-test-310.svc");
    expect(endpoints.analyticsEngineUrl?.hostname).toBe("ai-test-625.svc");
    expect(endpoints.natsUrl?.hostname).toBe("nats-test-01.svc");
  });
});
