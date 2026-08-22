/**
 * Retention Health Rules
 * 
 * Rules for evaluating retention compliance.
 * Retention violations are critical compliance issues.
 */

import {
  BranchHealthRule,
  HealthRuleContext,
  HealthRuleResult,
} from '../types/health-rules.types';
import { HEALTH_PENALTIES, REASON_CODES } from '../types/operational-health.types';

/**
 * Critical: Retention below policy requirement
 */
export const retentionBelowPolicyRule: BranchHealthRule = {
  name: 'RETENTION_BELOW_POLICY',
  priority: 85,
  
  evaluate(ctx: HealthRuleContext): HealthRuleResult | null {
    // Can only evaluate if we have actual retention data
    if (ctx.retention.actualDays == null) {
      return null;
    }
    
    if (ctx.retention.actualDays < ctx.retention.requiredDays) {
      const gap = ctx.retention.requiredDays - ctx.retention.actualDays;
      
      return {
        state: 'CRITICAL',
        scorePenalty: HEALTH_PENALTIES.RETENTION_VIOLATION,
        code: REASON_CODES.RETENTION_BELOW_POLICY,
        reason: `Retention ${ctx.retention.actualDays} days (${gap} days below ${ctx.retention.requiredDays}-day policy)`,
        domain: 'RETENTION',
      };
    }
    return null;
  },
};

/**
 * Unknown: Retention evidence unavailable
 */
export const retentionUnknownRule: BranchHealthRule = {
  name: 'RETENTION_UNKNOWN',
  priority: 40,
  
  evaluate(ctx: HealthRuleContext): HealthRuleResult | null {
    // If actual days is null or confidence is very low, retention is unknown
    if (ctx.retention.actualDays == null || ctx.retention.confidence < 0.3) {
      return {
        state: 'UNKNOWN',
        scorePenalty: 0,
        code: REASON_CODES.RETENTION_UNKNOWN,
        reason: 'Retention evidence unavailable',
        domain: 'RETENTION',
      };
    }
    return null;
  },
};

/**
 * Warning: Retention low confidence
 */
export const retentionLowConfidenceRule: BranchHealthRule = {
  name: 'RETENTION_LOW_CONFIDENCE',
  priority: 45,
  
  evaluate(ctx: HealthRuleContext): HealthRuleResult | null {
    if (ctx.retention.actualDays != null && 
        ctx.retention.confidence >= 0.3 && 
        ctx.retention.confidence < 0.7 &&
        ctx.retention.actualDays >= ctx.retention.requiredDays) {
      return {
        state: 'WARNING',
        scorePenalty: 5,
        code: REASON_CODES.RETENTION_GAP,
        reason: `Retention ${ctx.retention.actualDays} days (low confidence: ${Math.round(ctx.retention.confidence * 100)}%)`,
        domain: 'RETENTION',
      };
    }
    return null;
  },
};

export const retentionHealthRules: BranchHealthRule[] = [
  retentionBelowPolicyRule,
  retentionUnknownRule,
  retentionLowConfidenceRule,
];
