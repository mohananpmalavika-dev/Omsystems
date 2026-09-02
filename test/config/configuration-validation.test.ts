import { describe, it, expect } from "vitest";
import { resolveServiceEndpoints } from "../../src/config/service-endpoints.js";
import { ProductionConfigurationError } from "../../packages/contracts/src/config/config-errors.js";
import { ConfigurationErrorCode } from "../../packages/contracts/src/config/config-types.js";

describe("Production Configuration & Startup Validation Tests", () => {
  it("allows localhost fallbacks in development mode", () => {
    const endpoints = resolveServiceEndpoints({
      env: {
        NODE_ENV: "development",
      },
    });

    expect(endpoints.databaseUrl.hostname).toBe("localhost");
    expect(endpoints.controlApiUrl.hostname).toBe("localhost");
    expect(endpoints.redisUrl?.hostname).toBe("localhost");
  });

  it("strictly throws ProductionConfigurationError when DATABASE_URL is missing in production", () => {
    expect(() => {
      resolveServiceEndpoints({
        env: {
          NODE_ENV: "production",
          CONTROL_API_URL: "https://control.sentinel.internal",
        },
      });
    }).toThrow(ProductionConfigurationError);
  });

  it("strictly throws ProductionConfigurationError when CONTROL_API_URL is missing in production", () => {
    expect(() => {
      resolveServiceEndpoints({
        env: {
          NODE_ENV: "production",
          DATABASE_URL: "postgresql://user:pass@postgres.service.internal:5432/sentinel",
        },
      });
    }).toThrow(ProductionConfigurationError);
  });

  it("strictly throws ProductionConfigurationError when an endpoint points to loopback in production", () => {
    try {
      resolveServiceEndpoints({
        env: {
          NODE_ENV: "production",
          DATABASE_URL: "postgresql://user:pass@127.0.0.1:5432/sentinel",
          CONTROL_API_URL: "https://control.sentinel.internal",
        },
      });
      expect.unreachable("Should have thrown ProductionConfigurationError");
    } catch (err: any) {
      expect(err).toBeInstanceOf(ProductionConfigurationError);
      expect(err.code).toBe(ConfigurationErrorCode.LOOPBACK_NOT_ALLOWED);
    }
  });

  it("permits loopback endpoint when explicitly approved by EndpointPolicy", () => {
    const endpoints = resolveServiceEndpoints({
      env: {
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://user:pass@postgres.service.internal:5432/sentinel",
        CONTROL_API_URL: "https://control.sentinel.internal",
        MEDIA_GATEWAY_URL: "http://127.0.0.1:8090",
      },
      policies: {
        MEDIA_GATEWAY_URL: {
          service: "LOCAL_MEDIAMTX",
          allowLoopback: true,
          reason: "Colocated Edge sidecar",
        },
      },
    });

    expect(endpoints.mediaGatewayUrl?.hostname).toBe("127.0.0.1");
  });
});
