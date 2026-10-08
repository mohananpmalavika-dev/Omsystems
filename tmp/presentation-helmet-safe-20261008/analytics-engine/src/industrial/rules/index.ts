/**
 * Industrial Rules Module
 * 
 * Exports for industrial safety and compliance rules
 */

// Types
export type {
  IndustrialRule,
  IndustrialRuleContext,
  IndustrialViolation,
  IndustrialViolationType,
  IndustrialConfig,
  ViolationEvidence,
  RuleState,
} from './types.js';

export { RuleStateManager } from './types.js';

// Rule implementations
export { UnsafeProximityRule } from './proximity-rule.js';
export {
  EquipmentRestrictedZoneRule,
  PersonEquipmentZoneRule,
} from './zone-violation-rule.js';
export { IdleEquipmentRule } from './idle-equipment-rule.js';

// Rule engine
export {
  IndustrialRuleEngine,
  getIndustrialRuleEngine,
  resetIndustrialRuleEngine,
} from './rule-engine.js';
