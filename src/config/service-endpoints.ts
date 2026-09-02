import { ServiceEndpoints, EndpointPolicy, ConfigurationErrorCode } from "../../packages/contracts/src/config/config-types.js";
import { ProductionConfigurationError } from "../../packages/contracts/src/config/config-errors.js";
import { assertNotLoopback, isLoopbackUrl } from "./loopback-guard.js";

export interface EndpointResolverOptions {
  env?: Record<string, string | undefined>;
  policies?: Record<string, EndpointPolicy>;
}

export function resolveServiceEndpoints(options: EndpointResolverOptions = {}): ServiceEndpoints {
  const env = options.env || process.env;
  const isProduction = (env.NODE_ENV || "development").toLowerCase() === "production";
  const policies = options.policies || {};

  // 1. DATABASE_URL (Mandatory)
  const rawDbUrl = env.DATABASE_URL;
  if (!rawDbUrl) {
    if (isProduction) {
      throw new ProductionConfigurationError({
        key: "DATABASE_URL",
        code: ConfigurationErrorCode.REQUIRED_CONFIG_MISSING,
        reason: "DATABASE_URL is required in production.",
      });
    }
  }
  const dbUrlString = rawDbUrl || "postgresql://sentinel:sentinel@localhost:5432/sentinel";
  assertNotLoopback("DATABASE_URL", dbUrlString, isProduction, policies["DATABASE_URL"]);
  const databaseUrl = new URL(dbUrlString);

  // 2. CONTROL_API_URL (Mandatory for Edge/Workers)
  const rawControlUrl = env.CONTROL_API_URL || env.CONTROL_PLANE_URL || env.CONTROL_PLANE_INTERNAL_URL;
  let controlApiUrl: URL;
  if (rawControlUrl) {
    assertNotLoopback("CONTROL_API_URL", rawControlUrl, isProduction, policies["CONTROL_API_URL"]);
    controlApiUrl = new URL(rawControlUrl);
  } else {
    if (isProduction) {
      throw new ProductionConfigurationError({
        key: "CONTROL_API_URL",
        code: ConfigurationErrorCode.REQUIRED_CONFIG_MISSING,
        reason: "CONTROL_API_URL is required in production.",
      });
    }
    controlApiUrl = new URL("http://localhost:3000");
  }

  // 3. REDIS_URL (Required for clustered production)
  let redisUrl: URL | undefined;
  const rawRedisUrl = env.REDIS_URL;
  if (rawRedisUrl) {
    assertNotLoopback("REDIS_URL", rawRedisUrl, isProduction, policies["REDIS_URL"]);
    redisUrl = new URL(rawRedisUrl);
  } else if (!isProduction) {
    redisUrl = new URL("redis://localhost:6379");
  }

  // 4. MEDIA_GATEWAY_URL (Optional or Registry Bootstrap)
  let mediaGatewayUrl: URL | undefined;
  const rawMediaUrl = env.MEDIA_GATEWAY_URL || env.MEDIA_GATEWAY_INTERNAL_URL;
  if (rawMediaUrl) {
    assertNotLoopback("MEDIA_GATEWAY_URL", rawMediaUrl, isProduction, policies["MEDIA_GATEWAY_URL"]);
    mediaGatewayUrl = new URL(rawMediaUrl);
  } else if (!isProduction) {
    mediaGatewayUrl = new URL("http://localhost:8090");
  }

  // 5. RECORDING_ENGINE_URL (Optional or Node Registry)
  let recordingEngineUrl: URL | undefined;
  const rawRecordingUrl = env.RECORDING_ENGINE_URL;
  if (rawRecordingUrl) {
    assertNotLoopback("RECORDING_ENGINE_URL", rawRecordingUrl, isProduction, policies["RECORDING_ENGINE_URL"]);
    recordingEngineUrl = new URL(rawRecordingUrl);
  } else if (!isProduction) {
    recordingEngineUrl = new URL("http://localhost:8095");
  }

  // 6. ANALYTICS_ENGINE_URL (Optional)
  let analyticsEngineUrl: URL | undefined;
  const rawAnalyticsUrl = env.ANALYTICS_ENGINE_URL;
  if (rawAnalyticsUrl) {
    assertNotLoopback("ANALYTICS_ENGINE_URL", rawAnalyticsUrl, isProduction, policies["ANALYTICS_ENGINE_URL"]);
    analyticsEngineUrl = new URL(rawAnalyticsUrl);
  } else if (!isProduction) {
    analyticsEngineUrl = new URL("http://localhost:8092");
  }

  // 7. NATS_URL (Optional or Cluster Bus)
  let natsUrl: URL | undefined;
  const rawNatsUrl = env.NATS_URL || (env.NATS_SERVERS ? env.NATS_SERVERS.split(",")[0] : undefined);
  if (rawNatsUrl) {
    assertNotLoopback("NATS_URL", rawNatsUrl, isProduction, policies["NATS_URL"]);
    natsUrl = new URL(rawNatsUrl);
  } else if (!isProduction) {
    natsUrl = new URL("nats://localhost:4222");
  }

  return {
    databaseUrl,
    controlApiUrl,
    redisUrl,
    mediaGatewayUrl,
    recordingEngineUrl,
    analyticsEngineUrl,
    natsUrl,
  };
}
