/**
 * Banking Rule Engine
 * 
 * Reusable framework for evaluating workflow rules.
 * Rules produce pass/fail/unknown results with evidence.
 */

import {
  CashVanSession,
  CashVanMonitorConfig,
  AlertSeverity,
  EvidenceReference,
} from '../models/cash-van-session.js';

/**
 * Rule evaluation status
 */
export type RuleStatus = 'pass' | 'fail' | 'unknown';

/**
 * Rule evaluation result
 */
export interface RuleResult {
  ruleId: string;
  ruleName: string;
  status: RuleStatus;
  severity?: AlertSeverity;
  confidence: number;
  
  // Human-readable description
  message: string;
  
  // Structured details for programmatic use
  details: Record<string, any>;
  
  // Evidence supporting this result
  evidence: EvidenceReference[];
  
  // Timestamp of evaluation
  evaluatedAt: Date;
}

/**
 * Rule evaluation context
 */
export interface RuleContext {
  session: CashVanSession;
  monitor: CashVanMonitorConfig;
  now: Date;
  
  // Optional helpers
  distanceCalculator?: (point1: any, point2: any) => number;
  zoneChecker?: (entityId: string, zoneId: string) => boolean;
}

/**
 * Base interface for all banking rules
 */
export interface BankingRule {
  /**
   * Unique rule identifier
   */
  readonly id: string;
  
  /**
   * Human-readable rule name
   */
  readonly name: string;
  
  /**
   * Rule description
   */
  readonly description: string;
  
  /**
   * Severity if this rule fails
   */
  readonly severity: AlertSeverity;
  
  /**
   * Whether this rule is enabled
   */
  enabled: boolean;
  
  /**
   * Evaluate the rule against a session
   */
  evaluate(context: RuleContext): Promise<RuleResult>;
}

/**
 * Abstract base class for rules
 */
export abstract class BaseRule implements BankingRule {
  constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly description: string,
    public readonly severity: AlertSeverity,
    public enabled: boolean = true
  ) {}
  
  abstract evaluate(context: RuleContext): Promise<RuleResult>;
  
  /**
   * Helper to create a pass result
   */
  protected pass(message: string, details: Record<string, any> = {}, evidence: EvidenceReference[] = []): RuleResult {
    return {
      ruleId: this.id,
      ruleName: this.name,
      status: 'pass',
      confidence: 1.0,
      message,
      details,
      evidence,
      evaluatedAt: new Date(),
    };
  }
  
  /**
   * Helper to create a fail result
   */
  protected fail(
    message: string,
    details: Record<string, any> = {},
    evidence: EvidenceReference[] = [],
    confidence: number = 1.0
  ): RuleResult {
    return {
      ruleId: this.id,
      ruleName: this.name,
      status: 'fail',
      severity: this.severity,
      confidence,
      message,
      details,
      evidence,
      evaluatedAt: new Date(),
    };
  }
  
  /**
   * Helper to create an unknown result
   */
  protected unknown(
    message: string,
    details: Record<string, any> = {},
    confidence: number = 0
  ): RuleResult {
    return {
      ruleId: this.id,
      ruleName: this.name,
      status: 'unknown',
      confidence,
      message,
      details,
      evidence: [],
      evaluatedAt: new Date(),
    };
  }
}

/**
 * Rule Engine
 * 
 * Orchestrates rule evaluation for cash van sessions
 */
export class CashVanRuleEngine {
  private rules: BankingRule[] = [];
  
  /**
   * Register a rule
   */
  registerRule(rule: BankingRule): void {
    const existing = this.rules.findIndex(r => r.id === rule.id);
    if (existing >= 0) {
      this.rules[existing] = rule;
    } else {
      this.rules.push(rule);
    }
  }
  
  /**
   * Register multiple rules
   */
  registerRules(rules: BankingRule[]): void {
    for (const rule of rules) {
      this.registerRule(rule);
    }
  }
  
  /**
   * Unregister a rule
   */
  unregisterRule(ruleId: string): boolean {
    const index = this.rules.findIndex(r => r.id === ruleId);
    if (index >= 0) {
      this.rules.splice(index, 1);
      return true;
    }
    return false;
  }
  
  /**
   * Get all registered rules
   */
  getRules(): BankingRule[] {
    return [...this.rules];
  }
  
  /**
   * Get enabled rules only
   */
  getEnabledRules(): BankingRule[] {
    return this.rules.filter(r => r.enabled);
  }
  
  /**
   * Evaluate all enabled rules for a session
   */
  async evaluate(
    session: CashVanSession,
    monitor: CashVanMonitorConfig,
    now: Date = new Date()
  ): Promise<RuleResult[]> {
    const context: RuleContext = {
      session,
      monitor,
      now,
    };
    
    const results: RuleResult[] = [];
    const enabledRules = this.getEnabledRules();
    
    for (const rule of enabledRules) {
      try {
        const result = await rule.evaluate(context);
        results.push(result);
      } catch (error) {
        // Log error but continue with other rules
        console.error(`Rule ${rule.id} evaluation failed:`, error);
        
        results.push({
          ruleId: rule.id,
          ruleName: rule.name,
          status: 'unknown',
          confidence: 0,
          message: `Rule evaluation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          details: { error: String(error) },
          evidence: [],
          evaluatedAt: new Date(),
        });
      }
    }
    
    return results;
  }
  
  /**
   * Evaluate specific rules by ID
   */
  async evaluateSpecific(
    ruleIds: string[],
    session: CashVanSession,
    monitor: CashVanMonitorConfig,
    now: Date = new Date()
  ): Promise<RuleResult[]> {
    const context: RuleContext = {
      session,
      monitor,
      now,
    };
    
    const results: RuleResult[] = [];
    
    for (const ruleId of ruleIds) {
      const rule = this.rules.find(r => r.id === ruleId);
      if (!rule) {
        continue;
      }
      
      try {
        const result = await rule.evaluate(context);
        results.push(result);
      } catch (error) {
        console.error(`Rule ${rule.id} evaluation failed:`, error);
        
        results.push({
          ruleId: rule.id,
          ruleName: rule.name,
          status: 'unknown',
          confidence: 0,
          message: `Rule evaluation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          details: { error: String(error) },
          evidence: [],
          evaluatedAt: new Date(),
        });
      }
    }
    
    return results;
  }
  
  /**
   * Get summary of rule results
   */
  summarize(results: RuleResult[]): RuleSummary {
    const summary: RuleSummary = {
      total: results.length,
      passed: 0,
      failed: 0,
      unknown: 0,
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      averageConfidence: 0,
    };
    
    let totalConfidence = 0;
    
    for (const result of results) {
      switch (result.status) {
        case 'pass':
          summary.passed++;
          break;
        case 'fail':
          summary.failed++;
          if (result.severity === 'critical') summary.critical++;
          if (result.severity === 'high') summary.high++;
          if (result.severity === 'medium') summary.medium++;
          if (result.severity === 'low') summary.low++;
          break;
        case 'unknown':
          summary.unknown++;
          break;
      }
      
      totalConfidence += result.confidence;
    }
    
    summary.averageConfidence = results.length > 0 ? totalConfidence / results.length : 0;
    
    return summary;
  }
}

/**
 * Summary of rule evaluation results
 */
export interface RuleSummary {
  total: number;
  passed: number;
  failed: number;
  unknown: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  averageConfidence: number;
}

/**
 * Helper to determine overall workflow assessment from rule results
 */
export function determineWorkflowAssessment(results: RuleResult[]): {
  assessment: 'compliant' | 'non_compliant' | 'suspicious' | 'insufficient_evidence';
  confidence: number;
} {
  const summary = new CashVanRuleEngine().summarize(results);
  
  // Critical failures = non-compliant
  if (summary.critical > 0) {
    return {
      assessment: 'non_compliant',
      confidence: summary.averageConfidence,
    };
  }
  
  // High or medium failures = suspicious
  if (summary.high > 0 || summary.medium > 0) {
    return {
      assessment: 'suspicious',
      confidence: summary.averageConfidence,
    };
  }
  
  // Unknown results = insufficient evidence
  if (summary.unknown > 0 && summary.passed === 0) {
    return {
      assessment: 'insufficient_evidence',
      confidence: summary.averageConfidence,
    };
  }
  
  // Mix of pass and unknown = still insufficient
  if (summary.unknown > 0) {
    return {
      assessment: 'insufficient_evidence',
      confidence: summary.averageConfidence,
    };
  }
  
  // All passed = compliant
  if (summary.failed === 0) {
    return {
      assessment: 'compliant',
      confidence: summary.averageConfidence,
    };
  }
  
  // Low-severity only = suspicious
  return {
    assessment: 'suspicious',
    confidence: summary.averageConfidence,
  };
}

/**
 * Singleton instance
 */
let ruleEngine: CashVanRuleEngine | null = null;

export function getCashVanRuleEngine(): CashVanRuleEngine {
  if (!ruleEngine) {
    ruleEngine = new CashVanRuleEngine();
  }
  return ruleEngine;
}

export function setCashVanRuleEngine(engine: CashVanRuleEngine): void {
  ruleEngine = engine;
}
