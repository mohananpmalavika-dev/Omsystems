/**
 * Industrial Analytics Module
 * 
 * Central export for all industrial analytics functionality
 */

// Rules
export type {
  IndustrialRule,
  IndustrialRuleContext,
  IndustrialViolation,
  IndustrialViolationType,
  IndustrialConfig,
  ViolationEvidence,
  RuleState,
} from './rules/types.js';

export { RuleStateManager } from './rules/types.js';

export { UnsafeProximityRule } from './rules/proximity-rule.js';
export {
  EquipmentRestrictedZoneRule,
  PersonEquipmentZoneRule,
} from './rules/zone-violation-rule.js';
export { IdleEquipmentRule } from './rules/idle-equipment-rule.js';

export {
  IndustrialRuleEngine,
  getIndustrialRuleEngine,
  resetIndustrialRuleEngine,
} from './rules/rule-engine.js';

// Capability health
export type {
  CapabilityStatus,
  CapabilityHealthReport,
  DependencyHealth,
  IndustrialHealthSummary,
} from './capability-health.js';

export {
  IndustrialCapabilityHealth,
  getIndustrialCapabilityHealth,
  resetIndustrialCapabilityHealth,
} from './capability-health.js';

// Initialization
export type { IndustrialInitResult } from './industrial-init.js';

export {
  IndustrialInitializer,
  getIndustrialInitializer,
  initializeIndustrialAnalytics,
  cleanupIndustrialAnalytics,
  resetIndustrialInitializer,
} from './industrial-init.js';
