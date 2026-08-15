/**
 * Camera Health Rules
 * 
 * Rules for evaluating camera availability and operational state
 */

import {
  BranchHealthRule,
  HealthRuleContext,
  HealthRuleResult,
} from '../types/health-rules.types';
import { HEALTH_PENALTIES, REASON_CODES } from '../types/operational-health.types';

/**
 * Critical: All cameras offline
 */
export const allCamerasOfflineRule: BranchHealthRule = {
  name: 'ALL_CAMERAS_OFFLINE',
  priority: 100,
  
  evaluate(ctx: HealthRuleContext): HealthRuleResult | null {
    if (ctx.cameras.total > 0 && ctx.cameras.online === 0) {
      return {
        state: 'CRITICAL',
        scorePenalty: HEALTH_PENALTIES.ALL_CAMERAS_OFFLINE,
        code: REASON_CODES.ALL_CAMERAS_OFFLINE,
        reason: 'All branch cameras are offline',
        domain: 'CAMERA',
      };
    }
    return null;
  },
};

/**
 * Critical: Camera availability below 50%
 */
export const cameraLowAvailabilityRule: BranchHealthRule = {
  name: 'CAMERA_LOW_AVAILABILITY',
  priority: 80,
  
  evaluate(ctx: HealthRuleContext): HealthRuleResult | null {
    if (ctx.cameras.total === 0) return null;
    
    const availability = ctx.cameras.online / ctx.cameras.total;
    
    if (availability < 0.5 && availability > 0) {
      return {
        state: 'CRITICAL',
        scorePenalty: 35,
        code: REASON_CODES.CAMERA_LOW_AVAILABILITY,
        reason: `Only ${ctx.cameras.online} of ${ctx.cameras.total} cameras online (${Math.round(availability * 100)}%)`,
        domain: 'CAMERA',
      };
    }
    return null;
  },
};

/**
 * Warning: Some cameras offline
 */
export const camerasOfflineRule: BranchHealthRule = {
  name: 'CAMERAS_OFFLINE',
  priority: 60,
  
  evaluate(ctx: HealthRuleContext): HealthRuleResult | null {
    const offlineCount = ctx.cameras.offline;
    
    if (offlineCount > 0 && ctx.cameras.online > 0) {
      const availability = ctx.cameras.online / ctx.cameras.total;
      
      // Only warning if availability >= 50%
      if (availability >= 0.5) {
        const penalty = Math.min(
          offlineCount * HEALTH_PENALTIES.PER_CAMERA_OFFLINE,
          20 // Cap the penalty
        );
        
        return {
          state: 'WARNING',
          scorePenalty: penalty,
          code: REASON_CODES.CAMERAS_OFFLINE,
          reason: `${offlineCount} of ${ctx.cameras.total} cameras offline`,
          domain: 'CAMERA',
        };
      }
    }
    return null;
  },
};

export const cameraHealthRules: BranchHealthRule[] = [
  allCamerasOfflineRule,
  cameraLowAvailabilityRule,
  camerasOfflineRule,
];
