/**
 * Network Health Rules
 * 
 * Rules for evaluating internet connectivity and network health
 */

import {
  BranchHealthRule,
  HealthRuleContext,
  HealthRuleResult,
} from '../types/health-rules.types';
import { HEALTH_PENALTIES, REASON_CODES } from '../types/operational-health.types';

/**
 * Critical: Internet offline with no failover
 */
export const internetOfflineRule: BranchHealthRule = {
  name: 'INTERNET_OFFLINE',
  priority: 80,
  
  evaluate(ctx: HealthRuleContext): HealthRuleResult | null {
    if (ctx.network.internetState === 'OFFLINE') {
      return {
        state: 'CRITICAL',
        scorePenalty: HEALTH_PENALTIES.INTERNET_OFFLINE,
        code: REASON_CODES.INTERNET_OFFLINE,
        reason: 'Internet connectivity offline',
        domain: 'NETWORK',
      };
    }
    return null;
  },
};

/**
 * Warning: Internet on failover
 */
export const internetFailoverRule: BranchHealthRule = {
  name: 'INTERNET_FAILOVER',
  priority: 55,
  
  evaluate(ctx: HealthRuleContext): HealthRuleResult | null {
    if (ctx.network.internetState === 'FAILOVER') {
      return {
        state: 'WARNING',
        scorePenalty: 10,
        code: REASON_CODES.INTERNET_FAILOVER,
        reason: 'Running on failover internet connection',
        domain: 'NETWORK',
      };
    }
    return null;
  },
};

/**
 * Warning: Internet degraded
 */
export const internetDegradedRule: BranchHealthRule = {
  name: 'INTERNET_DEGRADED',
  priority: 50,
  
  evaluate(ctx: HealthRuleContext): HealthRuleResult | null {
    if (ctx.network.internetState === 'DEGRADED') {
      return {
        state: 'WARNING',
        scorePenalty: HEALTH_PENALTIES.NETWORK_DEGRADED,
        code: REASON_CODES.INTERNET_DEGRADED,
        reason: 'Internet connectivity degraded',
        domain: 'NETWORK',
      };
    }
    return null;
  },
};

/**
 * Critical: Edge agent disconnected
 */
export const edgeAgentOfflineRule: BranchHealthRule = {
  name: 'EDGE_AGENT_OFFLINE',
  priority: 75,
  
  evaluate(ctx: HealthRuleContext): HealthRuleResult | null {
    if (!ctx.network.edgeAgentConnected) {
      return {
        state: 'CRITICAL',
        scorePenalty: HEALTH_PENALTIES.EDGE_AGENT_OFFLINE,
        code: REASON_CODES.EDGE_AGENT_OFFLINE,
        reason: 'Edge agent disconnected',
        domain: 'EDGE_AGENT',
      };
    }
    return null;
  },
};

export const networkHealthRules: BranchHealthRule[] = [
  internetOfflineRule,
  internetFailoverRule,
  internetDegradedRule,
  edgeAgentOfflineRule,
];
