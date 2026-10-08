/**
 * Industrial Analytics Capability Health
 * 
 * Monitors health and availability of industrial analytics capabilities.
 * Implements graceful degradation when dependencies are unavailable.
 * 
 * Dependency Graph:
 * 
 *   industrial_equipment_detection (model)
 *           │
 *           ├──> equipment_tracking
 *           │         │
 *           │         └──> scene_state
 *           │                   │
 *           │                   ├──> proximity_detection (requires person_tracking)
 *           │                   ├──> zone_violation_detection
 *           │                   └──> idle_detection
 *           │
 *           └──> Direct capability reports
 * 
 * Health States:
 * - healthy: All dependencies available
 * - degraded: Some non-critical dependencies unavailable
 * - unavailable: Critical dependency missing
 */

import { getInferenceRegistry } from '../inference/inference-registry.js';
import { getIndustrialRuleEngine } from './rules/rule-engine.js';
import type { InferenceCapability, InferenceHealth } from '../inference/specialty-inference-provider.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Capability status
 */
export type CapabilityStatus = 'healthy' | 'degraded' | 'unavailable';

/**
 * Capability health report
 */
export interface CapabilityHealthReport {
  capability: string;
  status: CapabilityStatus;
  available: boolean;
  reason?: string;
  dependencies?: DependencyHealth[];
  lastCheckedAt: Date;
}

/**
 * Dependency health
 */
export interface DependencyHealth {
  name: string;
  type: 'inference' | 'service' | 'rule';
  required: boolean;
  available: boolean;
  reason?: string;
}

/**
 * Industrial analytics health summary
 */
export interface IndustrialHealthSummary {
  overall: CapabilityStatus;
  capabilities: {
    equipment_detection: CapabilityHealthReport;
    equipment_tracking: CapabilityHealthReport;
    proximity_detection: CapabilityHealthReport;
    zone_violation_detection: CapabilityHealthReport;
    idle_detection: CapabilityHealthReport;
  };
  degradationReasons: string[];
  lastCheckedAt: Date;
}

// ============================================================================
// Capability Health Service
// ============================================================================

export class IndustrialCapabilityHealth {
  private lastHealthCheck?: IndustrialHealthSummary;
  private healthCheckInterval?: NodeJS.Timeout;

  /**
   * Check health of all industrial capabilities
   */
  async checkHealth(): Promise<IndustrialHealthSummary> {
    const now = new Date();
    const inferenceRegistry = getInferenceRegistry();

    // Check equipment detection (critical dependency)
    const equipmentDetection = await this.checkEquipmentDetection();

    // Check equipment tracking (depends on detection)
    const equipmentTracking = await this.checkEquipmentTracking(equipmentDetection);

    // Check proximity detection (depends on tracking + person detection)
    const proximityDetection = await this.checkProximityDetection(equipmentTracking);

    // Check zone violation detection (depends on tracking)
    const zoneViolationDetection = await this.checkZoneViolationDetection(equipmentTracking);

    // Check idle detection (depends on tracking)
    const idleDetection = await this.checkIdleDetection(equipmentTracking);

    // Determine overall status
    const capabilities = [
      equipmentDetection,
      equipmentTracking,
      proximityDetection,
      zoneViolationDetection,
      idleDetection,
    ];

    const unavailable = capabilities.filter((c) => c.status === 'unavailable');
    const degraded = capabilities.filter((c) => c.status === 'degraded');

    let overall: CapabilityStatus;
    const degradationReasons: string[] = [];

    if (unavailable.length > 0) {
      overall = 'unavailable';
      degradationReasons.push(
        ...unavailable
          .map((c) => `${c.capability}: ${c.reason}`)
          .filter((r): r is string => r !== undefined)
      );
    } else if (degraded.length > 0) {
      overall = 'degraded';
      degradationReasons.push(
        ...degraded
          .map((c) => `${c.capability}: ${c.reason}`)
          .filter((r): r is string => r !== undefined)
      );
    } else {
      overall = 'healthy';
    }

    const summary: IndustrialHealthSummary = {
      overall,
      capabilities: {
        equipment_detection: equipmentDetection,
        equipment_tracking: equipmentTracking,
        proximity_detection: proximityDetection,
        zone_violation_detection: zoneViolationDetection,
        idle_detection: idleDetection,
      },
      degradationReasons,
      lastCheckedAt: now,
    };

    this.lastHealthCheck = summary;
    return summary;
  }

  /**
   * Check equipment detection capability
   */
  private async checkEquipmentDetection(): Promise<CapabilityHealthReport> {
    const inferenceRegistry = getInferenceRegistry();
    const capability: InferenceCapability = 'industrial_equipment_detection';

    const dependencies: DependencyHealth[] = [];

    // Check if provider is registered
    const provider = inferenceRegistry.get(capability);
    if (!provider) {
      return {
        capability: 'equipment_detection',
        status: 'unavailable',
        available: false,
        reason: 'Inference provider not registered',
        dependencies,
        lastCheckedAt: new Date(),
      };
    }

    dependencies.push({
      name: 'inference_provider',
      type: 'inference',
      required: true,
      available: true,
    });

    // Check if model is available
    const available = await provider.isAvailable();
    if (!available) {
      const health = await provider.health();
      return {
        capability: 'equipment_detection',
        status: 'unavailable',
        available: false,
        reason: health.error || 'Model not available',
        dependencies: [
          ...dependencies,
          {
            name: 'equipment_model',
            type: 'inference',
            required: true,
            available: false,
            reason: health.error,
          },
        ],
        lastCheckedAt: new Date(),
      };
    }

    dependencies.push({
      name: 'equipment_model',
      type: 'inference',
      required: true,
      available: true,
    });

    return {
      capability: 'equipment_detection',
      status: 'healthy',
      available: true,
      dependencies,
      lastCheckedAt: new Date(),
    };
  }

  /**
   * Check equipment tracking capability
   */
  private async checkEquipmentTracking(
    detectionHealth: CapabilityHealthReport
  ): Promise<CapabilityHealthReport> {
    const dependencies: DependencyHealth[] = [
      {
        name: 'equipment_detection',
        type: 'inference',
        required: true,
        available: detectionHealth.available,
        reason: detectionHealth.reason,
      },
    ];

    if (!detectionHealth.available) {
      return {
        capability: 'equipment_tracking',
        status: 'unavailable',
        available: false,
        reason: 'Equipment detection unavailable',
        dependencies,
        lastCheckedAt: new Date(),
      };
    }

    // Tracking service is always available if detection is available
    return {
      capability: 'equipment_tracking',
      status: 'healthy',
      available: true,
      dependencies,
      lastCheckedAt: new Date(),
    };
  }

  /**
   * Check proximity detection capability
   */
  private async checkProximityDetection(
    trackingHealth: CapabilityHealthReport
  ): Promise<CapabilityHealthReport> {
    const inferenceRegistry = getInferenceRegistry();
    const dependencies: DependencyHealth[] = [
      {
        name: 'equipment_tracking',
        type: 'service',
        required: true,
        available: trackingHealth.available,
        reason: trackingHealth.reason,
      },
    ];

    // Check if rule is available
    const ruleEngine = getIndustrialRuleEngine();
    const rule = ruleEngine.getRule('unsafe_proximity');

    dependencies.push({
      name: 'proximity_rule',
      type: 'rule',
      required: true,
      available: rule !== undefined,
      reason: rule ? undefined : 'Rule not registered',
    });

    if (!trackingHealth.available) {
      return {
        capability: 'proximity_detection',
        status: 'unavailable',
        available: false,
        reason: 'Equipment tracking unavailable',
        dependencies,
        lastCheckedAt: new Date(),
      };
    }

    // Check person detection (optional but needed for full functionality)
    const personDetectorAvailable = await inferenceRegistry.isAvailable(
      'person_detection'
    );

    dependencies.push({
      name: 'person_detection',
      type: 'inference',
      required: false, // Not strictly required, but needed for proximity
      available: personDetectorAvailable,
      reason: personDetectorAvailable
        ? undefined
        : 'Person detector not available',
    });

    if (!personDetectorAvailable) {
      return {
        capability: 'proximity_detection',
        status: 'degraded',
        available: false,
        reason: 'Person detection unavailable - cannot detect worker proximity',
        dependencies,
        lastCheckedAt: new Date(),
      };
    }

    return {
      capability: 'proximity_detection',
      status: 'healthy',
      available: true,
      dependencies,
      lastCheckedAt: new Date(),
    };
  }

  /**
   * Check zone violation detection capability
   */
  private async checkZoneViolationDetection(
    trackingHealth: CapabilityHealthReport
  ): Promise<CapabilityHealthReport> {
    const dependencies: DependencyHealth[] = [
      {
        name: 'equipment_tracking',
        type: 'service',
        required: true,
        available: trackingHealth.available,
        reason: trackingHealth.reason,
      },
    ];

    const ruleEngine = getIndustrialRuleEngine();
    const equipmentRule = ruleEngine.getRule('equipment_restricted_zone');
    const personRule = ruleEngine.getRule('person_restricted_zone');

    dependencies.push(
      {
        name: 'equipment_zone_rule',
        type: 'rule',
        required: true,
        available: equipmentRule !== undefined,
      },
      {
        name: 'person_zone_rule',
        type: 'rule',
        required: false,
        available: personRule !== undefined,
      }
    );

    if (!trackingHealth.available) {
      return {
        capability: 'zone_violation_detection',
        status: 'unavailable',
        available: false,
        reason: 'Equipment tracking unavailable',
        dependencies,
        lastCheckedAt: new Date(),
      };
    }

    if (!equipmentRule) {
      return {
        capability: 'zone_violation_detection',
        status: 'unavailable',
        available: false,
        reason: 'Zone violation rule not registered',
        dependencies,
        lastCheckedAt: new Date(),
      };
    }

    return {
      capability: 'zone_violation_detection',
      status: 'healthy',
      available: true,
      dependencies,
      lastCheckedAt: new Date(),
    };
  }

  /**
   * Check idle detection capability
   */
  private async checkIdleDetection(
    trackingHealth: CapabilityHealthReport
  ): Promise<CapabilityHealthReport> {
    const dependencies: DependencyHealth[] = [
      {
        name: 'equipment_tracking',
        type: 'service',
        required: true,
        available: trackingHealth.available,
        reason: trackingHealth.reason,
      },
    ];

    const ruleEngine = getIndustrialRuleEngine();
    const rule = ruleEngine.getRule('equipment_idle_too_long');

    dependencies.push({
      name: 'idle_detection_rule',
      type: 'rule',
      required: true,
      available: rule !== undefined,
    });

    if (!trackingHealth.available) {
      return {
        capability: 'idle_detection',
        status: 'unavailable',
        available: false,
        reason: 'Equipment tracking unavailable',
        dependencies,
        lastCheckedAt: new Date(),
      };
    }

    if (!rule) {
      return {
        capability: 'idle_detection',
        status: 'unavailable',
        available: false,
        reason: 'Idle detection rule not registered',
        dependencies,
        lastCheckedAt: new Date(),
      };
    }

    return {
      capability: 'idle_detection',
      status: 'healthy',
      available: true,
      dependencies,
      lastCheckedAt: new Date(),
    };
  }

  /**
   * Get last health check result (cached)
   */
  getLastHealthCheck(): IndustrialHealthSummary | undefined {
    return this.lastHealthCheck;
  }

  /**
   * Start periodic health checks
   */
  startPeriodicHealthChecks(intervalMs: number = 60000): void {
    if (this.healthCheckInterval) {
      console.warn('Periodic health checks already running');
      return;
    }

    console.log(
      `Starting periodic industrial health checks (interval: ${intervalMs}ms)`
    );

    // Run initial check
    this.checkHealth().catch((error) => {
      console.error('Initial health check failed:', error);
    });

    // Schedule periodic checks
    this.healthCheckInterval = setInterval(() => {
      this.checkHealth().catch((error) => {
        console.error('Periodic health check failed:', error);
      });
    }, intervalMs);
  }

  /**
   * Stop periodic health checks
   */
  stopPeriodicHealthChecks(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
      console.log('Stopped periodic industrial health checks');
    }
  }

  /**
   * Get capability availability matrix
   */
  async getCapabilityMatrix(): Promise<
    Record<string, { available: boolean; reason?: string }>
  > {
    const health = await this.checkHealth();

    return {
      equipment_detection: {
        available: health.capabilities.equipment_detection.available,
        reason: health.capabilities.equipment_detection.reason,
      },
      equipment_tracking: {
        available: health.capabilities.equipment_tracking.available,
        reason: health.capabilities.equipment_tracking.reason,
      },
      proximity_detection: {
        available: health.capabilities.proximity_detection.available,
        reason: health.capabilities.proximity_detection.reason,
      },
      zone_violation_detection: {
        available: health.capabilities.zone_violation_detection.available,
        reason: health.capabilities.zone_violation_detection.reason,
      },
      idle_detection: {
        available: health.capabilities.idle_detection.available,
        reason: health.capabilities.idle_detection.reason,
      },
    };
  }
}

// ============================================================================
// Singleton
// ============================================================================

let healthInstance: IndustrialCapabilityHealth | null = null;

/**
 * Get or create the capability health service
 */
export function getIndustrialCapabilityHealth(): IndustrialCapabilityHealth {
  if (!healthInstance) {
    healthInstance = new IndustrialCapabilityHealth();
  }
  return healthInstance;
}

/**
 * Reset the health service
 */
export function resetIndustrialCapabilityHealth(): void {
  if (healthInstance) {
    healthInstance.stopPeriodicHealthChecks();
  }
  healthInstance = null;
}
