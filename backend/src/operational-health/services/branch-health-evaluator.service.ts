/**
 * Branch Health Evaluator Service
 * 
 * Core service that evaluates branch operational health by:
 * 1. Collecting component health summaries
 * 2. Applying health rules in priority order
 * 3. Determining overall health state and score
 * 4. Generating reason codes and messages
 */

import {
  HealthState,
  BranchHealthReason,
  CameraHealthSummary,
  RecorderHealthSummary,
  StorageHealthSummary,
  RetentionHealthSummary,
  NetworkHealthSummary,
  UPSHealthSummary,
  AlertHealthSummary,
  TELEMETRY_THRESHOLDS,
} from '../types/operational-health.types';
import {
  HealthRuleContext,
  HealthRuleResult,
  HealthEvaluationResult,
} from '../types/health-rules.types';
import { ALL_HEALTH_RULES } from '../rules';

interface ComponentHealthInput {
  cameras: CameraHealthSummary;
  recorders: RecorderHealthSummary;
  storage: StorageHealthSummary;
  retention: RetentionHealthSummary;
  network: NetworkHealthSummary;
  ups: UPSHealthSummary;
  alerts: AlertHealthSummary;
  lastTelemetryAt: Date | null;
}

export class BranchHealthEvaluatorService {
  /**
   * Evaluate overall branch health from component summaries
   */
  evaluateBranchHealth(input: ComponentHealthInput): HealthEvaluationResult {
    // Calculate telemetry age
    const telemetryAgeMs = input.lastTelemetryAt
      ? Date.now() - input.lastTelemetryAt.getTime()
      : Number.MAX_SAFE_INTEGER;

    // Build rule evaluation context
    const context: HealthRuleContext = {
      cameras: input.cameras,
      recorders: input.recorders,
      storage: input.storage,
      retention: input.retention,
      network: input.network,
      ups: input.ups,
      alerts: input.alerts,
      telemetryAgeMs,
    };

    // Apply all rules in priority order
    const ruleResults: HealthRuleResult[] = [];
    const appliedRules: string[] = [];

    for (const rule of ALL_HEALTH_RULES) {
      const result = rule.evaluate(context);
      if (result) {
        ruleResults.push(result);
        appliedRules.push(rule.name);
      }
    }

    // Determine overall state (most severe rule wins)
    const overallState = this.determineOverallState(ruleResults);

    // Calculate health score (100 - sum of penalties, min 0)
    const healthScore = Math.max(
      0,
      100 - ruleResults.reduce((sum, r) => sum + r.scorePenalty, 0)
    );

    // Build reason codes and messages
    const reasonCodes = ruleResults.map(r => r.code);
    const reasons: BranchHealthReason[] = ruleResults.map(r => ({
      domain: r.domain,
      severity: r.state,
      code: r.code,
      message: r.reason,
      assetId: r.assetId,
      observedAt: new Date().toISOString(),
    }));

    return {
      overallState,
      healthScore,
      reasonCodes,
      reasons,
      appliedRules,
    };
  }

  /**
   * Determine overall state from all rule results
   * Priority: CRITICAL > WARNING > UNKNOWN > HEALTHY
   */
  private determineOverallState(results: HealthRuleResult[]): HealthState {
    if (results.length === 0) {
      return 'HEALTHY';
    }

    // Critical wins
    if (results.some(r => r.state === 'CRITICAL')) {
      return 'CRITICAL';
    }

    // Warning is next
    if (results.some(r => r.state === 'WARNING')) {
      return 'WARNING';
    }

    // Unknown is next
    if (results.some(r => r.state === 'UNKNOWN')) {
      return 'UNKNOWN';
    }

    return 'HEALTHY';
  }

  /**
   * Determine telemetry freshness
   */
  determineTelemetryFreshness(
    lastTelemetryAt: Date | null
  ): 'CURRENT' | 'STALE' | 'OFFLINE' {
    if (!lastTelemetryAt) {
      return 'OFFLINE';
    }

    const ageMs = Date.now() - lastTelemetryAt.getTime();

    if (ageMs < TELEMETRY_THRESHOLDS.CURRENT) {
      return 'CURRENT';
    } else if (ageMs < TELEMETRY_THRESHOLDS.OFFLINE) {
      return 'STALE';
    } else {
      return 'OFFLINE';
    }
  }

  /**
   * Get primary reason for branch state (highest priority critical/warning)
   */
  getPrimaryReason(reasons: BranchHealthReason[]): string | undefined {
    // Find first CRITICAL reason
    const critical = reasons.find(r => r.severity === 'CRITICAL');
    if (critical) {
      return critical.message;
    }

    // Find first WARNING reason
    const warning = reasons.find(r => r.severity === 'WARNING');
    if (warning) {
      return warning.message;
    }

    // Find first UNKNOWN reason
    const unknown = reasons.find(r => r.severity === 'UNKNOWN');
    if (unknown) {
      return unknown.message;
    }

    return undefined;
  }
}

export const branchHealthEvaluator = new BranchHealthEvaluatorService();
