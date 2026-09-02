/**
 * Canonical Sentinel Grid Configuration Contracts
 */

export type LocalhostUsage =
  | 'DEVELOPMENT_DEFAULT'
  | 'TEST_FIXTURE'
  | 'DOCUMENTATION'
  | 'BIND_ADDRESS'
  | 'BROWSER_LOCAL_DEV'
  | 'PRODUCTION_SERVICE_ENDPOINT'
  | 'PRODUCTION_FALLBACK'
  | 'HEALTHCHECK'
  | 'CONTAINER_INTERNAL'
  | 'UNKNOWN';

export enum ConfigurationErrorCode {
  REQUIRED_CONFIG_MISSING = 'REQUIRED_CONFIG_MISSING',
  INVALID_URL = 'INVALID_URL',
  LOOPBACK_NOT_ALLOWED = 'LOOPBACK_NOT_ALLOWED',
  INVALID_SCHEME = 'INVALID_SCHEME',
  INSECURE_ENDPOINT = 'INSECURE_ENDPOINT',
  DEPENDENCY_CONFIG_INVALID = 'DEPENDENCY_CONFIG_INVALID',
}

export interface EndpointPolicy {
  service: string;
  allowLoopback: boolean;
  reason?: string;
  allowedSchemes?: string[];
}

export interface ServiceEndpoints {
  controlApiUrl: URL;
  mediaGatewayUrl?: URL;
  recordingEngineUrl?: URL;
  analyticsEngineUrl?: URL;
  natsUrl?: URL;
  redisUrl?: URL;
  databaseUrl: URL;
}

export interface ServiceDependency {
  name: string;
  required: boolean;
  endpoint?: string;
  capability?: string;
}

export interface ConfigMetadata {
  source: 'ENVIRONMENT' | 'SECRET_FILE' | 'SERVICE_DISCOVERY' | 'DEVELOPMENT_DEFAULT';
  validatedAt: string;
  environment: 'development' | 'test' | 'production';
}
