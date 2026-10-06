/**
 * Industrial Rule Engine
 *
 * Coordinates evaluation of all industrial safety and compliance rules.
 * Supports:
 * - Dynamic rule registration
 * - Parallel rule evaluation
 * - Rule filtering based on config
 * - Event deduplication
 */
// Import rule implementations
import { UnsafeProximityRule } from './proximity-rule.js';
import { EquipmentRestrictedZoneRule, PersonEquipmentZoneRule, } from './zone-violation-rule.js';
import { IdleEquipmentRule } from './idle-equipment-rule.js';
// ============================================================================
// Rule Engine
// ============================================================================
export class IndustrialRuleEngine {
    rules = new Map();
    constructor() {
        // Register default rules
        this.registerDefaultRules();
    }
    /**
     * Register default rules
     */
    registerDefaultRules() {
        this.registerRule(new UnsafeProximityRule());
        this.registerRule(new EquipmentRestrictedZoneRule());
        this.registerRule(new PersonEquipmentZoneRule());
        this.registerRule(new IdleEquipmentRule());
    }
    /**
     * Register a rule
     */
    registerRule(rule) {
        if (this.rules.has(rule.id)) {
            console.warn(`Rule ${rule.id} already registered. Replacing.`);
        }
        this.rules.set(rule.id, rule);
        console.log(`Registered industrial rule: ${rule.id} (${rule.name})`);
    }
    /**
     * Unregister a rule
     */
    unregisterRule(ruleId) {
        const removed = this.rules.delete(ruleId);
        if (removed) {
            console.log(`Unregistered industrial rule: ${ruleId}`);
        }
        return removed;
    }
    /**
     * Get rule by ID
     */
    getRule(ruleId) {
        return this.rules.get(ruleId);
    }
    /**
     * Get all registered rules
     */
    getAllRules() {
        return Array.from(this.rules.values());
    }
    /**
     * Evaluate all applicable rules
     */
    async evaluate(context) {
        const applicableRules = Array.from(this.rules.values()).filter((rule) => rule.isApplicable(context.config));
        if (applicableRules.length === 0) {
            return [];
        }
        // Evaluate rules in parallel
        const results = await Promise.allSettled(applicableRules.map(async (rule) => {
            try {
                const violations = await rule.evaluate(context);
                return violations;
            }
            catch (error) {
                console.error(`Error evaluating rule ${rule.id}:`, error);
                return [];
            }
        }));
        // Flatten and collect all violations
        const allViolations = [];
        for (const result of results) {
            if (result.status === 'fulfilled') {
                allViolations.push(...result.value);
            }
        }
        // Deduplicate and assign IDs
        return this.deduplicateViolations(allViolations);
    }
    /**
     * Evaluate specific rules only
     */
    async evaluateRules(ruleIds, context) {
        const rules = ruleIds
            .map((id) => this.rules.get(id))
            .filter((rule) => rule !== undefined)
            .filter((rule) => rule.isApplicable(context.config));
        if (rules.length === 0) {
            return [];
        }
        const results = await Promise.allSettled(rules.map(async (rule) => {
            try {
                return await rule.evaluate(context);
            }
            catch (error) {
                console.error(`Error evaluating rule ${rule.id}:`, error);
                return [];
            }
        }));
        const allViolations = [];
        for (const result of results) {
            if (result.status === 'fulfilled') {
                allViolations.push(...result.value);
            }
        }
        return this.deduplicateViolations(allViolations);
    }
    /**
     * Deduplicate violations and assign IDs
     */
    deduplicateViolations(violations) {
        // For now, simple deduplication by type + involved objects
        // In production, might use more sophisticated logic
        const seen = new Set();
        const unique = [];
        for (const violation of violations) {
            const key = this.createViolationKey(violation);
            if (!seen.has(key)) {
                seen.add(key);
                // Assign unique ID
                violation.id = this.generateViolationId(violation);
                unique.push(violation);
            }
        }
        return unique;
    }
    /**
     * Create deduplication key for violation
     */
    createViolationKey(violation) {
        const parts = [
            violation.type,
            violation.cameraId,
            ...(violation.equipmentTrackIds || []),
            ...(violation.personTrackIds || []),
            ...(violation.zoneIds || []),
        ];
        return parts.join(':');
    }
    /**
     * Generate unique violation ID
     */
    generateViolationId(violation) {
        const timestamp = violation.timestamp.getTime();
        const random = Math.random().toString(36).substr(2, 6);
        return `iv_${timestamp}_${random}`;
    }
    /**
     * Get rule statistics
     */
    getStatistics() {
        const rules = Array.from(this.rules.values());
        const bySeverity = new Map();
        for (const rule of rules) {
            const count = bySeverity.get(rule.severity) || 0;
            bySeverity.set(rule.severity, count + 1);
        }
        return {
            totalRules: rules.length,
            bySeverity: Object.fromEntries(bySeverity),
            ruleIds: rules.map((r) => r.id),
        };
    }
    /**
     * Get rule metadata
     */
    getRuleMetadata() {
        return Array.from(this.rules.values()).map((rule) => ({
            id: rule.id,
            name: rule.name,
            description: rule.description,
            severity: rule.severity,
        }));
    }
    /**
     * Clear all rules
     */
    clearRules() {
        this.rules.clear();
    }
    /**
     * Reset engine to default rules
     */
    reset() {
        this.clearRules();
        this.registerDefaultRules();
    }
}
// ============================================================================
// Singleton
// ============================================================================
let engineInstance = null;
/**
 * Get or create the global rule engine
 */
export function getIndustrialRuleEngine() {
    if (!engineInstance) {
        engineInstance = new IndustrialRuleEngine();
    }
    return engineInstance;
}
/**
 * Reset the rule engine
 */
export function resetIndustrialRuleEngine() {
    engineInstance = null;
}
