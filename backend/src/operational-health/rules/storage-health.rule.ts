/**
 * Storage Health Rules
 * 
 * Rules for evaluating HDD and storage operational state
 */

import {
  BranchHealthRule,
  HealthRuleContext,
  HealthRuleResult,
} from '../types/health-rules.types';
import { HEALTH_PENALTIES, REASON_CODES } from '../types/operational-health.types';

/**
 * Critical: Any disk failed
 */
export const diskFailedRule: BranchHealthRule = {
  name: 'HDD_FAILED',
  priority: 90,
  
  evaluate(ctx: HealthRuleContext): HealthRuleResult | null {
    if (ctx.storage.disks.failed > 0) {
      return {
        state: 'CRITICAL',
        scorePenalty: HEALTH_PENALTIES.STORAGE_FAILURE,
        code: REASON_CODES.HDD_FAILED,
        reason: `${ctx.storage.disks.failed} disk(s) failed`,
        domain: 'STORAGE',
      };
    }
    return null;
  },
};

/**
 * Warning: Disk warning state
 */
export const diskWarningRule: BranchHealthRule = {
  name: 'HDD_WARNING',
  priority: 65,
  
  evaluate(ctx: HealthRuleContext): HealthRuleResult | null {
    if (ctx.storage.disks.warning > 0 && ctx.storage.disks.failed === 0) {
      return {
        state: 'WARNING',
        scorePenalty: HEALTH_PENALTIES.STORAGE_WARNING,
        code: REASON_CODES.HDD_WARNING,
        reason: `${ctx.storage.disks.warning} disk(s) in warning state`,
        domain: 'STORAGE',
      };
    }
    return null;
  },
};

/**
 * Critical: Storage capacity critical (>95%)
 */
export const storageCapacityCriticalRule: BranchHealthRule = {
  name: 'STORAGE_CAPACITY_CRITICAL',
  priority: 85,
  
  evaluate(ctx: HealthRuleContext): HealthRuleResult | null {
    if (ctx.storage.capacity && ctx.storage.capacity.usagePercent > 95) {
      return {
        state: 'CRITICAL',
        scorePenalty: 30,
        code: REASON_CODES.STORAGE_CAPACITY_CRITICAL,
        reason: `Storage ${ctx.storage.capacity.usagePercent.toFixed(1)}% full (${ctx.storage.capacity.availableGB.toFixed(0)}GB remaining)`,
        domain: 'STORAGE',
      };
    }
    return null;
  },
};

/**
 * Warning: Storage capacity warning (>85%)
 */
export const storageCapacityWarningRule: BranchHealthRule = {
  name: 'STORAGE_CAPACITY_WARNING',
  priority: 50,
  
  evaluate(ctx: HealthRuleContext): HealthRuleResult | null {
    if (ctx.storage.capacity && ctx.storage.capacity.usagePercent > 85 && ctx.storage.capacity.usagePercent <= 95) {
      return {
        state: 'WARNING',
        scorePenalty: 8,
        code: REASON_CODES.STORAGE_CAPACITY_WARNING,
        reason: `Storage ${ctx.storage.capacity.usagePercent.toFixed(1)}% full`,
        domain: 'STORAGE',
      };
    }
    return null;
  },
};

export const storageHealthRules: BranchHealthRule[] = [
  diskFailedRule,
  diskWarningRule,
  storageCapacityCriticalRule,
  storageCapacityWarningRule,
];
