/**
 * Platform Capability Types for Sentinel Grid Dashboard
 * 
 * Re-exports the canonical contracts defined in @sentinel/contracts
 */

export enum CapabilityMaturity {
  PRODUCTION = 'PRODUCTION',
  BETA = 'BETA',
  EXPERIMENTAL = 'EXPERIMENTAL',
  NOT_IMPLEMENTED = 'NOT_IMPLEMENTED',
}

export enum CapabilityRuntimeState {
  HEALTHY = 'HEALTHY',
  DEGRADED = 'DEGRADED',
  DOWN = 'DOWN',
  NOT_CONFIGURED = 'NOT_CONFIGURED',
  DISABLED = 'DISABLED',
  UNKNOWN = 'UNKNOWN',
}

export enum DeviceCapabilityState {
  SUPPORTED = 'SUPPORTED',
  UNSUPPORTED = 'UNSUPPORTED',
  DEGRADED = 'DEGRADED',
  UNKNOWN = 'UNKNOWN',
}

export type CapabilityCategory =
  | 'VIDEO'
  | 'RECORDING'
  | 'EVIDENCE'
  | 'ANALYTICS'
  | 'HA'
  | 'SECURITY'
  | 'OPERATIONS'
  | 'STORAGE'
  | 'EDGE'
  | 'INTEGRATION';

export interface PlatformCapabilityRuntime {
  state: CapabilityRuntimeState;
  checkedAt?: string;
  reason?: string;
  errorCode?: string;
}

export interface PlatformCapabilityImplementation {
  backend: boolean;
  frontend: boolean;
  api: boolean;
  persistenceRequired: boolean;
  persistenceImplemented: boolean;
}

export interface PlatformCapabilityVerification {
  unitTests: boolean;
  integrationTests: boolean;
  e2eTests: boolean;
  productionDependencyVerified: boolean;
  lastVerifiedAt?: string;
  verifiedVersion?: string;
}

export interface PlatformCapabilityDependencies {
  services?: string[];
  infrastructure?: string[];
  models?: string[];
  hardware?: string[];
  configuration?: string[];
}

export interface PlatformCapability {
  id: string;
  name: string;
  description: string;
  category: CapabilityCategory;
  maturity: CapabilityMaturity;
  runtime: PlatformCapabilityRuntime;
  implementation: PlatformCapabilityImplementation;
  verification: PlatformCapabilityVerification;
  dependencies: PlatformCapabilityDependencies;
  limitations?: string[];
  reason?: string;
  owner?: string;
  introducedVersion?: string;
  documentation?: string;
}

export interface CapabilitySummary {
  total: number;
  byMaturity: {
    production: number;
    beta: number;
    experimental: number;
    notImplemented: number;
  };
  byRuntimeState: {
    healthy: number;
    degraded: number;
    down: number;
    notConfigured: number;
    disabled: number;
    unknown: number;
  };
  byCategory: Record<CapabilityCategory, number>;
  generatedAt: string;
}

export interface CapabilityBlocker {
  capabilityId: string;
  name: string;
  category: CapabilityCategory;
  maturity: CapabilityMaturity;
  blockers: string[];
}

export interface CapabilitiesApiResponse {
  success: boolean;
  capabilities: PlatformCapability[];
  summary: CapabilitySummary;
  timestamp: string;
}
