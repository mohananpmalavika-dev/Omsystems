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
// Initialization Service
// ============================================================================
export class IndustrialInitializer {
    isInitialized = false;
    /**
     * Initialize all industrial analytics components
     */
    async initialize(options) {
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
        const initialized = [];
        const failed = [];
        const warnings = [];
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
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            failed.push(`equipment_detector: ${message}`);
            warnings.push('Equipment detection unavailable - industrial analytics will operate in degraded mode');
            console.warn('⚠ Equipment detector initialization failed:', message);
        }
        // 2. Initialize rule engine (always succeeds)
        try {
            this.initializeRuleEngine();
            initialized.push('rule_engine');
            capabilityStatus.rule_engine = true;
            console.log('✓ Rule engine initialized');
        }
        catch (error) {
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
            }
            catch (error) {
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
        }
        else {
            console.error('Industrial analytics initialization failed');
            console.error('Failed components:', failed);
        }
        return this.getInitResult(initialized, failed, warnings, capabilityStatus);
    }
    /**
     * Initialize equipment detector
     */
    async initializeEquipmentDetector() {
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
        console.log(`Registered equipment detector: ${INDUSTRIAL_EQUIPMENT_MODEL.id}`);
    }
    /**
     * Initialize rule engine
     */
    initializeRuleEngine() {
        const ruleEngine = getIndustrialRuleEngine();
        // Rules are registered by default in constructor
        const stats = ruleEngine.getStatistics();
        console.log(`Rule engine initialized with ${stats.totalRules} rules`);
    }
    /**
     * Cleanup all components
     */
    async cleanup() {
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
    getInitialized() {
        return this.isInitialized;
    }
    /**
     * Get initialization result
     */
    getInitResult(initialized, failed, warnings, capabilityStatus) {
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
    async getStatus() {
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
let initializerInstance = null;
/**
 * Get or create the initializer
 */
export function getIndustrialInitializer() {
    if (!initializerInstance) {
        initializerInstance = new IndustrialInitializer();
    }
    return initializerInstance;
}
/**
 * Initialize industrial analytics (convenience function)
 */
export async function initializeIndustrialAnalytics(options) {
    const initializer = getIndustrialInitializer();
    return initializer.initialize(options);
}
/**
 * Cleanup industrial analytics (convenience function)
 */
export async function cleanupIndustrialAnalytics() {
    const initializer = getIndustrialInitializer();
    await initializer.cleanup();
}
/**
 * Reset initializer (for testing)
 */
export function resetIndustrialInitializer() {
    initializerInstance = null;
}
