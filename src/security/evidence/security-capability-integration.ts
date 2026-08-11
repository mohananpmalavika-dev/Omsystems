/**
 * Security Capability Integration
 * 
 * Integrates security evidence collectors with the AI capability catalog system.
 * This ensures security capabilities follow the same activation and status tracking
 * patterns as AI analytics capabilities.
 */

import type {
  SecurityEvidence,
  SecureBootCollector,
  RansomwareCollector,
  TamperProtectionCollector,
  TamperConditionCollector,
} from './security-evidence-types.js';

/**
 * Security capability definition (parallel to AI capabilities)
 */
export interface SecurityCapabilityDefinition {
  id: string;
  name: string;
  category: 'device-security' | 'network-security' | 'data-security';
  stage: 'core' | 'enterprise' | 'optional';
  description: string;
  requiredCollector: string;
  collectorType: 'secure-boot' | 'ransomware' | 'tamper' | 'encryption' | 'certificate';
  platforms: Array<'windows' | 'linux' | 'edge-agent'>;
  configurationRequired: boolean;
  defaultEnabled: boolean;
}

/**
 * Security capability catalog
 * 
 * This is the canonical list of security capabilities, similar to
 * the AI capability catalog in src/analytics/capability-catalog.ts
 */
export const SECURITY_CAPABILITY_CATALOG: SecurityCapabilityDefinition[] = [
  {
    id: 'secure-boot-attestation',
    name: 'Secure Boot Attestation',
    category: 'device-security',
    stage: 'core',
    description: 'Verifies UEFI Secure Boot status and boot chain integrity via TPM',
    requiredCollector: 'SecureBootCollector',
    collectorType: 'secure-boot',
    platforms: ['windows', 'linux'],
    configurationRequired: false,
    defaultEnabled: true,
  },
  {
    id: 'ransomware-protection',
    name: 'Ransomware Protection Monitoring',
    category: 'device-security',
    stage: 'core',
    description: 'Monitors EDR/antivirus agent status and threat detection',
    requiredCollector: 'RansomwareCollector',
    collectorType: 'ransomware',
    platforms: ['windows', 'linux'],
    configurationRequired: true, // Requires EDR_API_ENDPOINT
    defaultEnabled: true,
  },
  {
    id: 'tamper-detection',
    name: 'Physical Tamper Detection',
    category: 'device-security',
    stage: 'enterprise',
    description: 'Detects physical tampering via enclosure, motion, and vibration sensors',
    requiredCollector: 'TamperProtectionCollector',
    collectorType: 'tamper',
    platforms: ['edge-agent'],
    configurationRequired: true, // Requires EDGE_AGENT_API
    defaultEnabled: false,
  },
  {
    id: 'tamper-condition-monitoring',
    name: 'Tamper Event Monitoring',
    category: 'device-security',
    stage: 'enterprise',
    description: 'Real-time monitoring of active tampering events',
    requiredCollector: 'TamperConditionCollector',
    collectorType: 'tamper',
    platforms: ['edge-agent'],
    configurationRequired: true,
    defaultEnabled: false,
  },
];

/**
 * Security capability status (runtime state)
 */
export interface SecurityCapabilityStatus {
  capabilityId: string;
  available: boolean;
  configured: boolean;
  enabled: boolean;
  status: 'active' | 'inactive' | 'not_configured' | 'error';
  collectorHealth: {
    available: boolean;
    lastCollection: Date | null;
    errorCount: number;
    lastError: string | null;
  } | null;
  reason?: string;
}

/**
 * Security capability registry
 * 
 * Runtime registry for security collectors and their capabilities
 */
export class SecurityCapabilityRegistry {
  private collectors: Map<string, any> = new Map();
  private capabilityStatus: Map<string, SecurityCapabilityStatus> = new Map();

  constructor() {
    // Initialize with catalog
    for (const capability of SECURITY_CAPABILITY_CATALOG) {
      this.capabilityStatus.set(capability.id, {
        capabilityId: capability.id,
        available: false,
        configured: false,
        enabled: false,
        status: 'inactive',
        collectorHealth: null,
      });
    }
  }

  /**
   * Register a security collector
   */
  registerCollector(
    collectorType: string,
    collector: SecureBootCollector | RansomwareCollector | TamperProtectionCollector | TamperConditionCollector,
  ): void {
    this.collectors.set(collectorType, collector);
    
    // Update capability statuses for this collector type
    this.updateCapabilityStatuses(collectorType);
  }

  /**
   * Get collector by type
   */
  getCollector(collectorType: string): any | undefined {
    return this.collectors.get(collectorType);
  }

  /**
   * Check if capability is available
   */
  isCapabilityAvailable(capabilityId: string): boolean {
    const status = this.capabilityStatus.get(capabilityId);
    return status?.available ?? false;
  }

  /**
   * Check if capability is enabled
   */
  isCapabilityEnabled(capabilityId: string): boolean {
    const status = this.capabilityStatus.get(capabilityId);
    return status?.enabled ?? false;
  }

  /**
   * Get capability status
   */
  getCapabilityStatus(capabilityId: string): SecurityCapabilityStatus | undefined {
    return this.capabilityStatus.get(capabilityId);
  }

  /**
   * Get all capability statuses
   */
  getAllCapabilityStatuses(): SecurityCapabilityStatus[] {
    return Array.from(this.capabilityStatus.values());
  }

  /**
   * Update capability statuses for a collector type
   */
  private async updateCapabilityStatuses(collectorType: string): Promise<void> {
    const collector = this.collectors.get(collectorType);
    if (!collector) return;

    // Find capabilities that use this collector
    const capabilities = SECURITY_CAPABILITY_CATALOG.filter(
      cap => cap.collectorType === collectorType
    );

    for (const capability of capabilities) {
      try {
        const health = await collector.getHealth();
        
        const status: SecurityCapabilityStatus = {
          capabilityId: capability.id,
          available: health.available,
          configured: health.available, // Available means it's configured
          enabled: capability.defaultEnabled && health.available,
          status: this.determineStatus(health),
          collectorHealth: health,
        };

        if (!health.available && capability.configurationRequired) {
          status.reason = 'Configuration required - check environment variables';
        }

        this.capabilityStatus.set(capability.id, status);
      } catch (error) {
        this.capabilityStatus.set(capability.id, {
          capabilityId: capability.id,
          available: false,
          configured: false,
          enabled: false,
          status: 'error',
          collectorHealth: null,
          reason: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }

  /**
   * Determine status from health
   */
  private determineStatus(health: {
    available: boolean;
    lastCollection: Date | null;
    errorCount: number;
    lastError: string | null;
  }): 'active' | 'inactive' | 'not_configured' | 'error' {
    if (!health.available) return 'not_configured';
    if (health.errorCount > 0) return 'error';
    if (health.lastCollection) return 'active';
    return 'inactive';
  }

  /**
   * Get coverage report (similar to AI evidence coverage)
   */
  getCoverageReport(): {
    total: number;
    available: number;
    configured: number;
    active: number;
    coverage: number;
  } {
    const statuses = this.getAllCapabilityStatuses();
    const total = statuses.length;
    const available = statuses.filter(s => s.available).length;
    const configured = statuses.filter(s => s.configured).length;
    const active = statuses.filter(s => s.status === 'active').length;
    const coverage = total > 0 ? active / total : 0;

    return {
      total,
      available,
      configured,
      active,
      coverage,
    };
  }

  /**
   * Validate required capabilities for environment
   */
  validateRequiredCapabilities(
    environment: 'development' | 'test' | 'production',
    strictMode: boolean,
  ): {
    valid: boolean;
    missing: string[];
    warnings: string[];
  } {
    const missing: string[] = [];
    const warnings: string[] = [];

    const coreCapabilities = SECURITY_CAPABILITY_CATALOG.filter(
      cap => cap.stage === 'core'
    );

    for (const capability of coreCapabilities) {
      const status = this.capabilityStatus.get(capability.id);
      
      if (!status?.available) {
        if (environment === 'production' && strictMode) {
          missing.push(capability.id);
        } else {
          warnings.push(`${capability.id} not available`);
        }
      }
    }

    return {
      valid: missing.length === 0,
      missing,
      warnings,
    };
  }
}

/**
 * Global registry instance
 */
let globalRegistry: SecurityCapabilityRegistry | null = null;

/**
 * Get or create global registry
 */
export function getSecurityCapabilityRegistry(): SecurityCapabilityRegistry {
  if (!globalRegistry) {
    globalRegistry = new SecurityCapabilityRegistry();
  }
  return globalRegistry;
}

/**
 * Initialize security capability registry with collectors
 */
export function initializeSecurityCapabilities(collectors: {
  secureBootCollector?: SecureBootCollector;
  ransomwareCollector?: RansomwareCollector;
  tamperProtectionCollector?: TamperProtectionCollector;
  tamperConditionCollector?: TamperConditionCollector;
}): SecurityCapabilityRegistry {
  const registry = getSecurityCapabilityRegistry();

  if (collectors.secureBootCollector) {
    registry.registerCollector('secure-boot', collectors.secureBootCollector);
  }

  if (collectors.ransomwareCollector) {
    registry.registerCollector('ransomware', collectors.ransomwareCollector);
  }

  if (collectors.tamperProtectionCollector) {
    registry.registerCollector('tamper', collectors.tamperProtectionCollector);
  }

  if (collectors.tamperConditionCollector) {
    registry.registerCollector('tamper', collectors.tamperConditionCollector);
  }

  return registry;
}

/**
 * Check if a security capability is available (parallel to isAiCapability check)
 */
export function isSecurityCapability(capabilityId: string): boolean {
  return SECURITY_CAPABILITY_CATALOG.some(cap => cap.id === capabilityId);
}

/**
 * Get security capability definition
 */
export function getSecurityCapability(capabilityId: string): SecurityCapabilityDefinition | undefined {
  return SECURITY_CAPABILITY_CATALOG.find(cap => cap.id === capabilityId);
}

/**
 * List all security capabilities by stage
 */
export function listSecurityCapabilitiesByStage(
  stage: 'core' | 'enterprise' | 'optional'
): SecurityCapabilityDefinition[] {
  return SECURITY_CAPABILITY_CATALOG.filter(cap => cap.stage === stage);
}

/**
 * List all security capabilities by category
 */
export function listSecurityCapabilitiesByCategory(
  category: 'device-security' | 'network-security' | 'data-security'
): SecurityCapabilityDefinition[] {
  return SECURITY_CAPABILITY_CATALOG.filter(cap => cap.category === category);
}
