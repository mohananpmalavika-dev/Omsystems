/**
 * UPS Health Rules
 * 
 * Rules for evaluating UPS and power backup health
 */

import {
  BranchHealthRule,
  HealthRuleContext,
  HealthRuleResult,
} from '../types/health-rules.types';
import { HEALTH_PENALTIES, REASON_CODES } from '../types/operational-health.types';

/**
 * Critical: UPS offline
 */
export const upsOfflineRule: BranchHealthRule = {
  name: 'UPS_OFFLINE',
  priority: 70,
  
  evaluate(ctx: HealthRuleContext): HealthRuleResult | null {
    if (!ctx.ups.online && ctx.ups.state !== 'UNKNOWN') {
      return {
        state: 'CRITICAL',
        scorePenalty: 20,
        code: REASON_CODES.UPS_OFFLINE,
        reason: 'UPS offline or unreachable',
        domain: 'UPS',
      };
    }
    return null;
  },
};

/**
 * Critical: UPS low battery
 */
export const upsLowBatteryRule: BranchHealthRule = {
  name: 'UPS_LOW_BATTERY',
  priority: 75,
  
  evaluate(ctx: HealthRuleContext): HealthRuleResult | null {
    if (ctx.ups.onBattery && ctx.ups.batteryPercent != null && ctx.ups.batteryPercent < 30) {
      return {
        state: 'CRITICAL',
        scorePenalty: 15,
        code: REASON_CODES.UPS_LOW_BATTERY,
        reason: `UPS on battery with ${ctx.ups.batteryPercent}% charge remaining`,
        domain: 'UPS',
      };
    }
    return null;
  },
};

/**
 * Warning: UPS on battery
 */
export const upsOnBatteryRule: BranchHealthRule = {
  name: 'UPS_ON_BATTERY',
  priority: 45,
  
  evaluate(ctx: HealthRuleContext): HealthRuleResult | null {
    if (ctx.ups.onBattery && (ctx.ups.batteryPercent == null || ctx.ups.batteryPercent >= 30)) {
      return {
        state: 'WARNING',
        scorePenalty: HEALTH_PENALTIES.UPS_ON_BATTERY,
        code: REASON_CODES.UPS_ON_BATTERY,
        reason: ctx.ups.batteryPercent != null 
          ? `UPS on battery (${ctx.ups.batteryPercent}% remaining)`
          : 'UPS on battery',
        domain: 'UPS',
      };
    }
    return null;
  },
};

export const upsHealthRules: BranchHealthRule[] = [
  upsOfflineRule,
  upsLowBatteryRule,
  upsOnBatteryRule,
];
