/**
 * Recording Health Rules
 * 
 * Rules for evaluating video recording operational state.
 * Separate from camera health - camera can be online but not recording.
 */

import {
  BranchHealthRule,
  HealthRuleContext,
  HealthRuleResult,
} from '../types/health-rules.types';
import { HEALTH_PENALTIES, REASON_CODES } from '../types/operational-health.types';

/**
 * Critical: No cameras recording (but cameras exist and are online)
 */
export const recordingStoppedRule: BranchHealthRule = {
  name: 'RECORDING_STOPPED',
  priority: 95,
  
  evaluate(ctx: HealthRuleContext): HealthRuleResult | null {
    // Only evaluate if cameras exist and some are online
    if (ctx.cameras.total > 0 && ctx.cameras.online > 0) {
      if (ctx.cameras.recording === 0) {
        return {
          state: 'CRITICAL',
          scorePenalty: HEALTH_PENALTIES.RECORDING_STOPPED,
          code: REASON_CODES.RECORDING_STOPPED,
          reason: `No cameras recording despite ${ctx.cameras.online} cameras online`,
          domain: 'RECORDING',
        };
      }
    }
    return null;
  },
};

/**
 * Critical: Recording availability below 50%
 */
export const recordingLowAvailabilityRule: BranchHealthRule = {
  name: 'RECORDING_LOW_AVAILABILITY',
  priority: 75,
  
  evaluate(ctx: HealthRuleContext): HealthRuleResult | null {
    if (ctx.cameras.total === 0) return null;
    
    const recordingRate = ctx.cameras.recording / ctx.cameras.total;
    
    if (recordingRate > 0 && recordingRate < 0.5) {
      return {
        state: 'CRITICAL',
        scorePenalty: 30,
        code: REASON_CODES.RECORDING_FAILURE,
        reason: `Only ${ctx.cameras.recording} of ${ctx.cameras.total} cameras recording (${Math.round(recordingRate * 100)}%)`,
        domain: 'RECORDING',
      };
    }
    return null;
  },
};

/**
 * Warning: Some cameras not recording
 */
export const camerasNotRecordingRule: BranchHealthRule = {
  name: 'CAMERAS_NOT_RECORDING',
  priority: 55,
  
  evaluate(ctx: HealthRuleContext): HealthRuleResult | null {
    const notRecording = ctx.cameras.notRecording;
    
    if (notRecording > 0 && ctx.cameras.recording > 0) {
      const recordingRate = ctx.cameras.recording / ctx.cameras.total;
      
      // Only warning if recording rate >= 50%
      if (recordingRate >= 0.5) {
        const penalty = Math.min(
          notRecording * HEALTH_PENALTIES.PER_RECORDING_FAILURE,
          20 // Cap the penalty
        );
        
        return {
          state: 'WARNING',
          scorePenalty: penalty,
          code: REASON_CODES.CAMERAS_NOT_RECORDING,
          reason: `${notRecording} of ${ctx.cameras.total} cameras not recording`,
          domain: 'RECORDING',
        };
      }
    }
    return null;
  },
};

export const recordingHealthRules: BranchHealthRule[] = [
  recordingStoppedRule,
  recordingLowAvailabilityRule,
  camerasNotRecordingRule,
];
