/**
 * Banking Rule Engine
 *
 * Reusable framework for evaluating workflow rules.
 * Rules produce pass/fail/unknown results with evidence.
 */
/**
 * Abstract base class for rules
 */
export class BaseRule {
    id;
    name;
    description;
    severity;
    enabled;
    constructor(id, name, description, severity, enabled = true) {
        this.id = id;
        this.name = name;
        this.description = description;
        this.severity = severity;
        this.enabled = enabled;
    }
    /**
     * Helper to create a pass result
     */
    pass(message, details = {}, evidence = []) {
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
    fail(message, details = {}, evidence = [], confidence = 1.0) {
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
    unknown(message, details = {}, confidence = 0) {
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
    rules = [];
    /**
     * Register a rule
     */
    registerRule(rule) {
        const existing = this.rules.findIndex(r => r.id === rule.id);
        if (existing >= 0) {
            this.rules[existing] = rule;
        }
        else {
            this.rules.push(rule);
        }
    }
    /**
     * Register multiple rules
     */
    registerRules(rules) {
        for (const rule of rules) {
            this.registerRule(rule);
        }
    }
    /**
     * Unregister a rule
     */
    unregisterRule(ruleId) {
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
    getRules() {
        return [...this.rules];
    }
    /**
     * Get enabled rules only
     */
    getEnabledRules() {
        return this.rules.filter(r => r.enabled);
    }
    /**
     * Evaluate all enabled rules for a session
     */
    async evaluate(session, monitor, now = new Date()) {
        const context = {
            session,
            monitor,
            now,
        };
        const results = [];
        const enabledRules = this.getEnabledRules();
        for (const rule of enabledRules) {
            try {
                const result = await rule.evaluate(context);
                results.push(result);
            }
            catch (error) {
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
    async evaluateSpecific(ruleIds, session, monitor, now = new Date()) {
        const context = {
            session,
            monitor,
            now,
        };
        const results = [];
        for (const ruleId of ruleIds) {
            const rule = this.rules.find(r => r.id === ruleId);
            if (!rule) {
                continue;
            }
            try {
                const result = await rule.evaluate(context);
                results.push(result);
            }
            catch (error) {
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
    summarize(results) {
        const summary = {
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
                    if (result.severity === 'critical')
                        summary.critical++;
                    if (result.severity === 'high')
                        summary.high++;
                    if (result.severity === 'medium')
                        summary.medium++;
                    if (result.severity === 'low')
                        summary.low++;
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
 * Helper to determine overall workflow assessment from rule results
 */
export function determineWorkflowAssessment(results) {
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
let ruleEngine = null;
export function getCashVanRuleEngine() {
    if (!ruleEngine) {
        ruleEngine = new CashVanRuleEngine();
    }
    return ruleEngine;
}
export function setCashVanRuleEngine(engine) {
    ruleEngine = engine;
}
