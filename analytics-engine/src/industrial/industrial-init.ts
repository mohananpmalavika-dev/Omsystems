/**
 * Industrial Analytics Initialization
 * 
 * Orchestrates initialization of industrial analytics components:
 * 1. Register inference providers
 * 2. Initialize trackers
 * 3. Register rules
 * 4. Start health monitoring
 * 
 * Handles failures gracefully and reports exact capability status.
 */

import { getInferenceRegistry } from '../inference/inference-registry.js';
import { IndustrialEquipmentDetector } from '../inference/providers/industrial-equipment-detector.js';
import { getIndustrialRuleEngine } from './rules/rule-engine.js';
import { getIndustrialCapabilityHealth } from './capability-health.js';
import { INDUSTRIAL_EQUIPMENT_MODEL } from '../inference/model-manifest.js';

// ============================================================================
// Types
// ============================================================================

export interface IndustrialInitResult {
  success: boolean;
  initialized: string[];
  failed: string[];
  warnings: string[];
  capabilityStatus: {
    equipment_detection: boolean;
    equipment_tracking: boolean;
    rule_engine: boolean;
    health_monitoring: boolean;
  };
}

// ============================================================================
// Initialization Service
// ============================================================================

export class IndustrialInitializer {
  private isInitialized = false;

  /**
   * Initialize all industrial analytics components
   */
  async initialize(options?: {
    enableHealthMonitoring?: boolean;
    healthCheckIntervalMs?: number;
  }): Promise<IndustrialInitResult> {
    if (this.isInitialized) {
      console.warn('Industrial analytics already initialized');
      return this.getInitResult(['already_initialized'], [], [], {
        equipment_detection: true,
        equipment_tracking: true,
        rule_engine: true,
        health_monitoring: true,
      });
    }

    console.log('Initializing industrial analytics...');

    const initialized: string[] = [];
    const failed: string[] = [];
    const warnings: string[] = [];
    const capabilityStatus = {
      equipment_detection: false,
      equipment_tracking: false,
      rule_engine: false,
      health_monitoring: false,
    };

    // 1. Initialize equipment detector
    try {
      await this.initializeEquipmentDetector();
      initialized.push('equipment_detector');
      capabilityStatus.equipment_detection = true;
      console.log('✓ Equipment detector initialized');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failed.push(`equipment_detector: ${message}`);
      warnings.push(
        'Equipment detection unavailable - industrial analytics will operate in degraded mode'
      );
      console.warn('⚠ Equipment detector initialization failed:', message);
    }

    // 2. Initialize rule engine (always succeeds)
    try {
      this.initializeRuleEngine();
      initialized.push('rule_engine');
      capabilityStatus.rule_engine = true;
      console.log('✓ Rule engine initialized');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failed.push(`rule_engine: ${message}`);
      console.error('✗ Rule engine initialization failed:', message);
    }

    // 3. Tracking is always available (no dependencies)
    capabilityStatus.equipment_tracking = true;
    initialized.push('equipment_tracking');
    console.log('✓ Equipment tracking initialized');

    // 4. Start health monitoring
    if (options?.enableHealthMonitoring !== false) {
      try {
        const healthService = getIndustrialCapabilityHealth();
        const intervalMs = options?.healthCheckIntervalMs || 60000;
        healthService.startPeriodicHealthChecks(intervalMs);
        initialized.push('health_monitoring');
        capabilityStatus.health_monitoring = true;
        console.log(`✓ Health monitoring started (interval: ${intervalMs}ms)`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failed.push(`health_monitoring: ${message}`);
        warnings.push('Health monitoring unavailable');
        console.warn('⚠ Health monitoring startup failed:', message);
      }
    }

    this.isInitialized = true;

    const success = failed.length === 0 || capabilityStatus.rule_engine;

    if (success) {
      console.log('Industrial analytics initialized successfully');
      if (warnings.length > 0) {
        console.log('Warnings:', warnings);
      }
    } else {
      console.error('Industrial analytics initialization failed');
      console.error('Failed components:', failed);
    }

    return this.getInitResult(initialized, failed, warnings, capabilityStatus);
  }

  /**
   * Initialize equipment detector
   */
  private async initializeEquipmentDetector(): Promise<void> {
    const registry = getInferenceRegistry();

    // Check if already registered
    if (registry.get('industrial_equipment_detection')) {
      console.log('Equipment detector already registered');
      return;
    }

    // Create detector
    const detector = new IndustrialEquipmentDetector();

    // Initialize (will throw if model not available)
    await detector.initialize();

    // Register with inference registry
    registry.register(detector);

    console.log(
      `Registered equipment detector: ${INDUSTRIAL_EQUIPMENT_MODEL.id}`
    );
  }

  /**
   * Initialize rule engine
   */
  private initializeRuleEngine(): void {
    const ruleEngine = getIndustrialRuleEngine();

    // Rules are registered by default in constructor
    const stats = ruleEngine.getStatistics();
    console.log(`Rule engine initialized with ${stats.totalRules} rules`);
  }

  /**
   * Cleanup all components
   */
  async cleanup(): Promise<void> {
    console.log('Cleaning up industrial analytics...');

    // Stop health monitoring
    const healthService = getIndustrialCapabilityHealth();
    healthService.stopPeriodicHealthChecks();

    // Cleanup inference registry
    const registry = getInferenceRegistry();
    const detector = registry.get('industrial_equipment_detection');
    if (detector && detector.cleanup) {
      await detector.cleanup();
    }

    this.isInitialized = false;
    console.log('Industrial analytics cleaned up');
  }

  /**
   * Check if initialized
   */
  getInitialized(): boolean {
    return this.isInitialized;
  }

  /**
   * Get initialization result
   */
  private getInitResult(
    initialized: string[],
    failed: string[],
    warnings: string[],
    capabilityStatus: IndustrialInitResult['capabilityStatus']
  ): IndustrialInitResult {
    return {
      success: failed.length === 0 || capabilityStatus.rule_engine,
      initialized,
      failed,
      warnings,
      capabilityStatus,
    };
  }

  /**
   * Get current status
   */
  async getStatus(): Promise<{
    initialized: boolean;
    health: any;
  }> {
    const healthService = getIndustrialCapabilityHealth();
    const health = await healthService.checkHealth();

    return {
      initialized: this.isInitialized,
      health,
    };
  }
}

// ============================================================================
// Singleton
// ============================================================================

let initializerInstance: IndustrialInitializer | null = null;

/**
 * Get or create the initializer
 */
export function getIndustrialInitializer(): IndustrialInitializer {
  if (!initializerInstance) {
    initializerInstance = new IndustrialInitializer();
  }
  return initializerInstance;
}

/**
 * Initialize industrial analytics (convenience function)
 */
export async function initializeIndustrialAnalytics(options?: {
  enableHealthMonitoring?: boolean;
  healthCheckIntervalMs?: number;
}): Promise<IndustrialInitResult> {
  const initializer = getIndustrialInitializer();
  return initializer.initialize(options);
}

/**
 * Cleanup industrial analytics (convenience function)
 */
export async function cleanupIndustrialAnalytics(): Promise<void> {
  const initializer = getIndustrialInitializer();
  await initializer.cleanup();
}

/**
 * Reset initializer (for testing)
 */
export function resetIndustrialInitializer(): void {
  initializerInstance = null;
}
