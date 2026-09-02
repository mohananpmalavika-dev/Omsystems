import { ServiceEndpoints, ServiceDependency, ConfigMetadata } from "../../packages/contracts/src/config/config-types.js";
import { ProductionConfigurationError } from "../../packages/contracts/src/config/config-errors.js";
import { resolveServiceEndpoints, EndpointResolverOptions } from "./service-endpoints.js";
import { redactConnectionString } from "./loopback-guard.js";

export class AppConfig {
  private static instance: AppConfig | null = null;
  public readonly endpoints: ServiceEndpoints;
  public readonly environment: "development" | "test" | "production";
  public readonly metadata: ConfigMetadata;

  constructor(options: EndpointResolverOptions = {}) {
    const env = options.env || process.env;
    const envMode = (env.NODE_ENV || "development").toLowerCase();
    this.environment = envMode === "production" ? "production" : envMode === "test" ? "test" : "development";
    this.endpoints = resolveServiceEndpoints(options);
    this.metadata = {
      source: env.CONFIG_SOURCE === "SECRET_FILE" ? "SECRET_FILE" : "ENVIRONMENT",
      validatedAt: new Date().toISOString(),
      environment: this.environment,
    };
  }

  public static initialize(options?: EndpointResolverOptions): AppConfig {
    AppConfig.instance = new AppConfig(options);
    return AppConfig.instance;
  }

  public static getInstance(): AppConfig {
    if (!AppConfig.instance) {
      AppConfig.instance = new AppConfig();
    }
    return AppConfig.instance;
  }

  public static getSafeSummary(): Record<string, any> {
    const config = AppConfig.getInstance();
    return {
      environment: config.environment,
      databaseUrl: redactConnectionString(config.endpoints.databaseUrl.toString()),
      controlApiUrl: config.endpoints.controlApiUrl.toString(),
      redisConfigured: !!config.endpoints.redisUrl,
      mediaGatewayConfigured: !!config.endpoints.mediaGatewayUrl,
      recordingEngineConfigured: !!config.endpoints.recordingEngineUrl,
      analyticsEngineConfigured: !!config.endpoints.analyticsEngineUrl,
      natsConfigured: !!config.endpoints.natsUrl,
    };
  }
}

/**
 * Validates dependencies before service start.
 */
export function validateServiceDependencies(
  dependencies: ServiceDependency[],
  isProduction: boolean
): void {
  if (!isProduction) return;

  for (const dep of dependencies) {
    if (dep.required && !dep.endpoint) {
      throw new ProductionConfigurationError({
        key: dep.name,
        reason: `Mandatory service dependency ${dep.name} is not configured in production.`,
      });
    }
  }
}
