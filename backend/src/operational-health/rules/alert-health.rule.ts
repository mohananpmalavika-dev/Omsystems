/**
 * Alert Health Rules
 * 
 * Rules for evaluating active alert impact on branch health
 */

import {
  BranchHealthRule,
  HealthRuleContext,
  HealthRuleResult,
} from '../types/health-rules.types';
import { REASON_CODES } from '../types/operational-health.types';

/**
 * Critical: Unacknowledged P1 alerts
 */
export const unacknowledgedP1AlertsRule: BranchHealthRule = {
  name: 'UNACKNOWLEDGED_P1_ALERTS',
  priority: 70,
  
  evaluate(ctx: HealthRuleContext): HealthRuleResult | null {
    if (ctx.alerts.p1Count > 0 && ctx.alerts.unacknowledgedCount > 0) {
      return {
        state: 'CRITICAL',
        scorePenalty: 15,
        code: REASON_CODES.UNACKNOWLEDGED_P1_ALERTS,
        reason: `${ctx.alerts.p1Count} unacknowledged P1 alert(s)`,
        domain: 'ALERT',
      };
    }
    return null;
  },
};

/**
 * Warning: P1 alerts present (acknowledged)
 */
export const activeP1AlertsRule: BranchHealthRule = {
  name: 'CRITICAL_ALERTS_ACTIVE',
  priority: 40,
  
  evaluate(ctx: HealthRuleContext): HealthRuleResult | null {
    if (ctx.alerts.p1Count > 0 && ctx.alerts.unacknowledgedCount === 0) {
      return {
        state: 'WARNING',
        scorePenalty: 8,
        code: REASON_CODES.CRITICAL_ALERTS_ACTIVE,
        reason: `${ctx.alerts.p1Count} active P1 alert(s)`,
        domain: 'ALERT',
      };
    }
    return null;
  },
};

export const alertHealthRules: BranchHealthRule[] = [
  unacknowledgedP1AlertsRule,
  activeP1AlertsRule,
];
