/**
 * Recorder Health Rules
 * 
 * Rules for evaluating recorder operational state
 */

import {
  BranchHealthRule,
  HealthRuleContext,
  HealthRuleResult,
} from '../types/health-rules.types';
import { HEALTH_PENALTIES, REASON_CODES } from '../types/operational-health.types';

/**
 * Critical: All recorders offline
 */
export const allRecordersOfflineRule: BranchHealthRule = {
  name: 'ALL_RECORDERS_OFFLINE',
  priority: 100,
  
  evaluate(ctx: HealthRuleContext): HealthRuleResult | null {
    if (ctx.recorders.total > 0 && ctx.recorders.online === 0) {
      return {
        state: 'CRITICAL',
        scorePenalty: HEALTH_PENALTIES.ALL_RECORDERS_OFFLINE,
        code: REASON_CODES.ALL_RECORDERS_OFFLINE,
        reason: 'All branch recorders are offline',
        domain: 'RECORDER',
      };
    }
    return null;
  },
};

/**
 * Warning: Some recorders offline
 */
export const recorderOfflineRule: BranchHealthRule = {
  name: 'RECORDER_OFFLINE',
  priority: 60,
  
  evaluate(ctx: HealthRuleContext): HealthRuleResult | null {
    const offlineCount = ctx.recorders.offline;
    
    if (offlineCount > 0 && ctx.recorders.online > 0) {
      return {
        state: 'WARNING',
        scorePenalty: HEALTH_PENALTIES.RECORDER_DEGRADED,
        code: REASON_CODES.RECORDER_OFFLINE,
        reason: `${offlineCount} of ${ctx.recorders.total} recorders offline`,
        domain: 'RECORDER',
      };
    }
    return null;
  },
};

export const recorderHealthRules: BranchHealthRule[] = [
  allRecordersOfflineRule,
  recorderOfflineRule,
];
