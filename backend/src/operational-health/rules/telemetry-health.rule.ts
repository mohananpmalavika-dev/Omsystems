/**
 * Telemetry Freshness Rules
 * 
 * Rules for evaluating whether telemetry data is current, stale, or offline
 */

import {
  BranchHealthRule,
  HealthRuleContext,
  HealthRuleResult,
} from '../types/health-rules.types';
import { REASON_CODES, TELEMETRY_THRESHOLDS } from '../types/operational-health.types';

/**
 * Unknown: Telemetry very stale (> 5 min)
 */
export const telemetryOfflineRule: BranchHealthRule = {
  name: 'TELEMETRY_OFFLINE',
  priority: 35,
  
  evaluate(ctx: HealthRuleContext): HealthRuleResult | null {
    if (ctx.telemetryAgeMs > TELEMETRY_THRESHOLDS.OFFLINE) {
      const minutesAgo = Math.floor(ctx.telemetryAgeMs / 60000);
      
      return {
        state: 'UNKNOWN',
        scorePenalty: 0,
        code: REASON_CODES.EDGE_AGENT_DISCONNECTED,
        reason: `No telemetry for ${minutesAgo} minutes`,
        domain: 'EDGE_AGENT',
      };
    }
    return null;
  },
};

/**
 * Warning: Telemetry stale (30 sec - 5 min)
 */
export const telemetryStaleRule: BranchHealthRule = {
  name: 'TELEMETRY_STALE',
  priority: 30,
  
  evaluate(ctx: HealthRuleContext): HealthRuleResult | null {
    if (ctx.telemetryAgeMs > TELEMETRY_THRESHOLDS.STALE && 
        ctx.telemetryAgeMs <= TELEMETRY_THRESHOLDS.OFFLINE) {
      const secondsAgo = Math.floor(ctx.telemetryAgeMs / 1000);
      
      return {
        state: 'WARNING',
        scorePenalty: 5,
        code: REASON_CODES.TELEMETRY_STALE,
        reason: `Telemetry ${secondsAgo} seconds old`,
        domain: 'EDGE_AGENT',
      };
    }
    return null;
  },
};

export const telemetryHealthRules: BranchHealthRule[] = [
  telemetryOfflineRule,
  telemetryStaleRule,
];
