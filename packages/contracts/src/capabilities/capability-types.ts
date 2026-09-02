/**
 * Canonical Sentinel Grid Capability Truth Types
 * 
 * Establishes three strictly separated concepts:
 * 1. Product Maturity: How complete, proven, and verified is this feature?
 * 2. Runtime State: What is the current operational health of the feature?
 * 3. Device Support: Does a specific camera/NVR/DVR hardware unit support this function?
 */

// ============================================================================
// 1. PRODUCT MATURITY (Release Truth)
// ============================================================================

export enum CapabilityMaturity {
  /**
   * Fully implemented, verified against production dependencies, tested end-to-end,
   * with no mock/placeholder execution paths in production.
   */
  PRODUCTION = 'PRODUCTION',

  /**
   * Core implementation exists and runs on real data end-to-end,
   * but scale testing, HA testing, or operational hardening is in progress.
   */
  BETA = 'BETA',

  /**
   * Implementation exists and may execute, but behavior/performance/accuracy is
   * unvalidated or model-dependent; suitable only for controlled testing.
   */
  EXPERIMENTAL = 'EXPERIMENTAL',

  /**
   * Backend is missing, UI-only stub, throws NotImplemented, fabricated data,
   * or depends on mock simulation in production path. Must NOT appear as functional controls.
   */
  NOT_IMPLEMENTED = 'NOT_IMPLEMENTED',
}

// ============================================================================
// 2. RUNTIME STATE (Operational Health)
// ============================================================================

export enum CapabilityRuntimeState {
  HEALTHY = 'HEALTHY',
  DEGRADED = 'DEGRADED',
  DOWN = 'DOWN',
  NOT_CONFIGURED = 'NOT_CONFIGURED',
  DISABLED = 'DISABLED',
  UNKNOWN = 'UNKNOWN',
}

// ============================================================================
// 3. DEVICE SUPPORT (Hardware Capability)
// ============================================================================

export enum DeviceCapabilityState {
  SUPPORTED = 'SUPPORTED',
  UNSUPPORTED = 'UNSUPPORTED',
  DEGRADED = 'DEGRADED',
  UNKNOWN = 'UNKNOWN',
}

// ============================================================================
// 4. CAPABILITY CATEGORIES
// ============================================================================

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

// ============================================================================
// 5. CANONICAL PLATFORM CAPABILITY CONTRACT
// ============================================================================

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
  /** Unique stable machine-readable identifier (e.g. 'video.live_view', 'analytics.person_detection') */
  id: string;

  /** Human-readable display name */
  name: string;

  /** Comprehensive description */
  description: string;

  /** Functional category */
  category: CapabilityCategory;

  /** Authoritative product maturity level */
  maturity: CapabilityMaturity;

  /** Dynamic runtime operational state */
  runtime: PlatformCapabilityRuntime;

  /** Implementation presence details */
  implementation: PlatformCapabilityImplementation;

  /** Verification and test coverage truth */
  verification: PlatformCapabilityVerification;

  /** Required technical dependencies */
  dependencies: PlatformCapabilityDependencies;

  /** Known operational limitations or constraints */
  limitations?: string[];

  /** Optional runtime or deprecation reason */
  reason?: string;

  /** Responsible engineering domain or owner */
  owner?: string;

  /** Initial release version introduced */
  introducedVersion?: string;

  /** Documentation reference link or path */
  documentation?: string;
}

// ============================================================================
// 6. IMPLEMENTATION EVIDENCE
// ============================================================================

export interface CapabilityImplementationEvidence {
  backendImplementation: boolean;
  apiEndpointExists: boolean;
  frontendIntegrationExists?: boolean;
  mockProductionPath: boolean;
  notImplementedException: boolean;
  unitTests: boolean;
  integrationTests: boolean;
  e2eTests: boolean;
  productionDependencyVerified: boolean;
  modelRequired?: boolean;
  modelExists?: boolean;
  realInferencePath?: boolean;
  qualityValidated?: boolean;
  hasHardwareDependency?: boolean;
  hardwareVerified?: boolean;
}

// ============================================================================
// 7. DEPLOYMENT POLICY
// ============================================================================

export interface CapabilityDeploymentPolicy {
  allowBeta: boolean;
  allowExperimental: boolean;
}

export const DEFAULT_BANK_DEPLOYMENT_POLICY: CapabilityDeploymentPolicy = {
  allowBeta: false,
  allowExperimental: false,
};

export const DEFAULT_STANDARD_DEPLOYMENT_POLICY: CapabilityDeploymentPolicy = {
  allowBeta: true,
  allowExperimental: false,
};

// ============================================================================
// 8. SUMMARY & REPORT TYPES
// ============================================================================

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
