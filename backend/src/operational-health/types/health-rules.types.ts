/**
 * Health Rule Evaluation Types
 * 
 * Defines the rule-based health evaluation system.
 * Rules determine branch health state based on component telemetry.
 */

import {
  HealthState,
  CameraHealthSummary,
  RecorderHealthSummary,
  StorageHealthSummary,
  RetentionHealthSummary,
  NetworkHealthSummary,
  UPSHealthSummary,
  AlertHealthSummary,
  BranchHealthReason,
} from './operational-health.types';

/**
 * Context provided to health rules for evaluation
 */
export interface HealthRuleContext {
  cameras: CameraHealthSummary;
  recorders: RecorderHealthSummary;
  storage: StorageHealthSummary;
  retention: RetentionHealthSummary;
  network: NetworkHealthSummary;
  ups: UPSHealthSummary;
  alerts: AlertHealthSummary;
  telemetryAgeMs: number;
}

/**
 * Result of a health rule evaluation
 */
export interface HealthRuleResult {
  state: HealthState;
  scorePenalty: number;
  code: string;
  reason: string;
  domain: BranchHealthReason['domain'];
  assetId?: string;
}

/**
 * Health rule interface - all rules implement this
 */
export interface BranchHealthRule {
  name: string;
  priority: number; // Higher priority rules evaluated first
  evaluate(ctx: HealthRuleContext): HealthRuleResult | null;
}

/**
 * Aggregated health evaluation result
 */
export interface HealthEvaluationResult {
  overallState: HealthState;
  healthScore: number; // 0-100
  reasonCodes: string[];
  reasons: BranchHealthReason[];
  appliedRules: string[];
}
