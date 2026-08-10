/**
 * Recommendation Engine
 * 
 * Generates actionable recommendations from predictions, RCA, and patterns
 */

import { randomUUID } from 'crypto';
import type { Prediction } from '../../analytics-engine/src/detectors/ai-prediction-engine';
import type { RootCauseAnalysis } from '../../root-cause-analysis-engine/src/types';
import type { RiskAssessment, Recommendation } from './types';

export class RecommendationEngine {
  /**
   * Generate recommendations from prediction
   */
  async generateFromPrediction(
    prediction: Prediction,
    riskAssessment: RiskAssessment
  ): Promise<Recommendation[]> {
    const recommendations: Recommendation[] = [];

    // Use prediction's built-in recommendations
    if (prediction.recommendations && prediction.recommendations.length > 0) {
      prediction.recommendations.forEach((rec, index) => {
        const priority = this.determinePriority(prediction, riskAssessment, index);
        const category = this.determineCategory(prediction.type);

        recommendations.push({
          id: `rec_${randomUUID()}`,
          sourceId: prediction.target,
          sourceType: 'prediction',
          title: rec,
          description: rec,
          rationale: `Based on prediction: ${prediction.prediction.description}`,
          priority,
          category,
          estimatedImpact: prediction.prediction.severity,
          autoExecutable: this.isAutoExecutable(rec),
          requiresApproval: !this.isAutoExecutable(rec) || priority === 'immediate',
          status: 'pending',
          createdAt: new Date(),
        });
      });
    }

    // Add preventive action recommendations
    if (prediction.preventiveActions && prediction.preventiveActions.length > 0) {
      prediction.preventiveActions.forEach((action) => {
        recommendations.push({
          id: `rec_${randomUUID()}`,
          sourceId: prediction.target,
          sourceType: 'prediction',
          title: action,
          description: action,
          rationale: `Preventive action for: ${prediction.prediction.description}`,
          priority: 'preventive',
          category: this.determineCategory(prediction.type),
          estimatedImpact: 'medium',
          autoExecutable: true,
          requiresApproval: false,
          status: 'pending',
          createdAt: new Date(),
        });
      });
    }

    return recommendations;
  }

  /**
   * Generate recommendations from alert
   */
  async generateFromAlert(alert: any, riskAssessment: RiskAssessment): Promise<Recommendation[]> {
    const recommendations: Recommendation[] = [];

    if (riskAssessment.riskLevel === 'critical') {
      recommendations.push({
        id: `rec_${randomUUID()}`,
        sourceId: alert.id,
        sourceType: 'pattern',
        title: 'Immediate Response Required',
        description: `Critical alert detected: ${alert.type}`,
        rationale: `Risk score ${riskAssessment.riskScore}/100 requires immediate attention`,
        priority: 'immediate',
        category: 'security',
        estimatedImpact: 'critical',
        autoExecutable: false,
        requiresApproval: false,
        status: 'pending',
        createdAt: new Date(),
      });
    }

    return recommendations;
  }

  /**
   * Generate recommendations from RCA
   */
  async generateFromRCA(rca: RootCauseAnalysis): Promise<Recommendation[]> {
    const recommendations: Recommendation[] = [];

    // Remediation steps → Immediate/Short-term recommendations
    rca.remediationSteps.forEach((step) => {
      recommendations.push({
        id: `rec_${randomUUID()}`,
        sourceId: rca.incidentId,
        sourceType: 'rca',
        title: step,
        description: step,
        rationale: `Remediation for root cause: ${rca.rootCause}`,
        priority: 'immediate',
        category: 'security',
        estimatedImpact: 'high',
        autoExecutable: false,
        requiresApproval: true,
        status: 'pending',
        createdAt: new Date(),
      });
    });

    // Preventive measures → Long-term recommendations
    rca.preventiveMeasures.forEach((measure) => {
      recommendations.push({
        id: `rec_${randomUUID()}`,
        sourceId: rca.incidentId,
        sourceType: 'rca',
        title: measure,
        description: measure,
        rationale: `Preventive measure to avoid recurrence`,
        priority: 'long-term',
        category: 'process',
        estimatedImpact: 'medium',
        autoExecutable: false,
        requiresApproval: true,
        status: 'pending',
        createdAt: new Date(),
      });
    });

    return recommendations;
  }

  /**
   * Determine recommendation priority
   */
  private determinePriority(
    prediction: Prediction,
    riskAssessment: RiskAssessment,
    index: number
  ): 'immediate' | 'short-term' | 'long-term' | 'preventive' {
    // First recommendation for critical risk = immediate
    if (index === 0 && riskAssessment.riskLevel === 'critical') {
      return 'immediate';
    }

    // Short timeframe = short-term
    if (prediction.timeframe.horizon < 7) {
      return 'short-term';
    }

    // High severity = short-term
    if (prediction.prediction.severity === 'high' || prediction.prediction.severity === 'critical') {
      return 'short-term';
    }

    // Otherwise preventive
    return 'preventive';
  }

  /**
   * Determine recommendation category
   */
  private determineCategory(
    predictionType: string
  ): 'hardware' | 'software' | 'process' | 'security' | 'capacity' {
    if (predictionType === 'hardware_failure') return 'hardware';
    if (predictionType === 'storage_exhaustion') return 'capacity';
    if (predictionType === 'incident') return 'security';
    return 'process';
  }

  /**
   * Check if recommendation can be auto-executed
   */
  private isAutoExecutable(recommendation: string): boolean {
    const autoKeywords = [
      'create',
      'schedule',
      'backup',
      'archive',
      'reduce',
      'enable',
      'adjust',
    ];

    const manualKeywords = [
      'replace',
      'install',
      'purchase',
      'order',
      'review',
      'inspect',
      'contact',
    ];

    const recLower = recommendation.toLowerCase();

    // Check if contains manual keywords
    if (manualKeywords.some((kw) => recLower.includes(kw))) {
      return false;
    }

    // Check if contains auto keywords
    if (autoKeywords.some((kw) => recLower.includes(kw))) {
      return true;
    }

    // Default: not auto-executable
    return false;
  }
}
