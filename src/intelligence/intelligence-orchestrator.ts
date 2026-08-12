/**
 * Intelligence Orchestrator
 * 
 * Connects the entire closed-loop intelligence pipeline:
 * Prediction → Risk → Alert → RCA → Recommendation → Prevention → Feedback
 * 
 * This is the brain of the autonomous security intelligence system.
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import type { Prediction } from '../../analytics-engine/src/detectors/ai-prediction-engine.js';
import type { RootCauseAnalysis } from '../../root-cause-analysis-engine/src/types.js';
import type {
  RiskAssessment,
  Recommendation,
  PreventiveAction,
  IntelligenceFeedback,
  IntelligenceDashboard,
  IntelligenceContext,
} from './types.js';
import { RiskAssessmentEngine } from './risk-assessment-engine.js';
import { RecommendationEngine } from './recommendation-engine.js';
import { PreventiveActionExecutor } from './preventive-action-executor.js';

export class IntelligenceOrchestrator extends EventEmitter {
  private riskEngine: RiskAssessmentEngine;
  private recommendationEngine: RecommendationEngine;
  private actionExecutor: PreventiveActionExecutor;

  // In-memory storage (in production, use database)
  private predictions: Map<string, Prediction> = new Map();
  private riskAssessments: Map<string, RiskAssessment> = new Map();
  private recommendations: Map<string, Recommendation> = new Map();
  private preventiveActions: Map<string, PreventiveAction> = new Map();
  private feedback: IntelligenceFeedback[] = [];
  private contexts: Map<string, IntelligenceContext> = new Map();

  // Metrics
  private metrics = {
    totalPredictions: 0,
    materializedPredictions: 0,
    preventedIncidents: 0,
    totalRecommendations: 0,
    successfulActions: 0,
    failedActions: 0,
  };

  constructor() {
    super();
    this.riskEngine = new RiskAssessmentEngine();
    this.recommendationEngine = new RecommendationEngine();
    this.actionExecutor = new PreventiveActionExecutor();

    this.setupEventHandlers();
  }

  /**
   * Setup event handlers for closed-loop intelligence
   */
  private setupEventHandlers(): void {
    // Action executor events
    this.actionExecutor.on('action-completed', (action, outcome) => {
      this.handleActionCompleted(action, outcome);
    });

    this.actionExecutor.on('action-failed', (action, error) => {
      this.handleActionFailed(action, error);
    });
  }

  /**
   * Process prediction from AI Prediction Engine
   * 
   * This is the entry point for the intelligence pipeline
   */
  async processPrediction(prediction: Prediction): Promise<void> {
    console.log(`[Intelligence] Processing prediction: ${prediction.type} for ${prediction.target}`);
    
    const predictionId = `pred_${randomUUID()}`;
    this.predictions.set(predictionId, prediction);
    this.metrics.totalPredictions++;

    // Create intelligence context
    const context: IntelligenceContext = {
      prediction,
      alerts: [],
      recommendations: [],
      preventiveActions: [],
      feedback: [],
      pipelineStatus: {
        predictionGenerated: true,
        riskAssessed: false,
        alertsCreated: false,
        rcaComplete: false,
        recommendationsGenerated: false,
        actionsExecuted: false,
        feedbackRecorded: false,
      },
      timeline: [
        {
          stage: 'prediction',
          timestamp: new Date(),
          details: `Prediction generated: ${prediction.prediction.description}`,
        },
      ],
    };

    this.contexts.set(predictionId, context);

    // Step 1: Risk Assessment
    const riskAssessment = await this.assessRisk(prediction);
    context.riskAssessment = riskAssessment;
    context.pipelineStatus.riskAssessed = true;
    context.timeline.push({
      stage: 'risk-assessment',
      timestamp: new Date(),
      details: `Risk assessed: ${riskAssessment.riskScore}/100 (${riskAssessment.riskLevel})`,
    });

    // Step 2: Alert Generation (if high risk)
    if (riskAssessment.riskLevel === 'high' || riskAssessment.riskLevel === 'critical') {
      await this.generatePredictiveAlert(prediction, riskAssessment);
      context.pipelineStatus.alertsCreated = true;
      context.timeline.push({
        stage: 'alert-generation',
        timestamp: new Date(),
        details: `Alert created for high-risk prediction`,
      });

      this.emit('high-risk-prediction', prediction, riskAssessment);
    }

    // Step 3: Generate Recommendations
    const recommendations = await this.recommendationEngine.generateFromPrediction(
      prediction,
      riskAssessment
    );
    
    recommendations.forEach((rec) => {
      this.recommendations.set(rec.id, rec);
      context.recommendations.push(rec);
    });

    this.metrics.totalRecommendations += recommendations.length;
    context.pipelineStatus.recommendationsGenerated = true;
    context.timeline.push({
      stage: 'recommendations',
      timestamp: new Date(),
      details: `Generated ${recommendations.length} recommendations`,
    });

    // Step 4: Execute Preventive Actions
    for (const recommendation of recommendations) {
      if (recommendation.autoExecutable) {
        const action = await this.actionExecutor.createAction(recommendation);
        this.preventiveActions.set(action.id, action);
        context.preventiveActions.push(action);

        if (!action.requiresApproval) {
          await this.actionExecutor.executeAction(action);
          context.timeline.push({
            stage: 'preventive-action',
            timestamp: new Date(),
            details: `Executed automatic action: ${action.description}`,
          });
        } else {
          context.timeline.push({
            stage: 'preventive-action',
            timestamp: new Date(),
            details: `Action queued for approval: ${action.description}`,
          });
        }
      }
    }

    context.pipelineStatus.actionsExecuted = true;

    console.log(`[Intelligence] Pipeline complete for ${prediction.target}: ${recommendations.length} recommendations, ${context.preventiveActions.length} actions`);
    
    this.emit('pipeline-complete', predictionId, context);
  }

  /**
   * Process alert from alert system
   */
  async processAlert(alert: any): Promise<void> {
    console.log(`[Intelligence] Processing alert: ${alert.type}`);

    // Check if alert is related to existing prediction
    const relatedPrediction = this.findRelatedPrediction(alert);

    if (relatedPrediction) {
      // Update prediction as materialized
      const predictionId = Array.from(this.predictions.entries()).find(
        ([_, p]) => p === relatedPrediction
      )?.[0];

      if (predictionId) {
        this.metrics.materializedPredictions++;
        const context = this.contexts.get(predictionId);
        if (context) {
          context.alerts.push({
            id: alert.id,
            type: alert.type,
            severity: alert.severity,
            createdAt: new Date(),
          });
          context.timeline.push({
            stage: 'alert-materialized',
            timestamp: new Date(),
            details: `Prediction materialized: ${alert.type}`,
          });
        }
      }
    }

    // Assess risk for alert
    const riskAssessment = await this.assessRiskForAlert(alert);
    
    // Generate recommendations if needed
    if (riskAssessment.riskLevel === 'high' || riskAssessment.riskLevel === 'critical') {
      const recommendations = await this.recommendationEngine.generateFromAlert(alert, riskAssessment);
      recommendations.forEach((rec) => this.recommendations.set(rec.id, rec));
    }
  }

  /**
   * Process RCA results
   */
  async processRCA(incidentId: string, rca: RootCauseAnalysis): Promise<void> {
    console.log(`[Intelligence] Processing RCA for incident ${incidentId}`);

    // Find context if this relates to a prediction
    const context = Array.from(this.contexts.values()).find(
      (ctx) => ctx.incidentId === incidentId
    );

    if (context) {
      context.rca = rca;
      context.pipelineStatus.rcaComplete = true;
      context.timeline.push({
        stage: 'rca',
        timestamp: new Date(),
        details: `RCA completed: ${rca.rootCause}`,
      });
    }

    // Generate recommendations from RCA
    const recommendations = await this.recommendationEngine.generateFromRCA(rca);
    
    recommendations.forEach((rec) => {
      this.recommendations.set(rec.id, rec);
      if (context) {
        context.recommendations.push(rec);
      }
    });

    // Execute high-priority recommendations
    const immediateRecs = recommendations.filter((r) => r.priority === 'immediate');
    for (const rec of immediateRecs) {
      if (rec.autoExecutable) {
        const action = await this.actionExecutor.createAction(rec);
        this.preventiveActions.set(action.id, action);
        
        if (!action.requiresApproval) {
          await this.actionExecutor.executeAction(action);
        }
      }
    }
  }

  /**
   * Assess risk for prediction
   */
  private async assessRisk(prediction: Prediction): Promise<RiskAssessment> {
    const assessment = await this.riskEngine.assessPredictionRisk(prediction);
    this.riskAssessments.set(assessment.id, assessment);
    return assessment;
  }

  /**
   * Assess risk for alert
   */
  private async assessRiskForAlert(alert: any): Promise<RiskAssessment> {
    const assessment = await this.riskEngine.assessAlertRisk(alert);
    this.riskAssessments.set(assessment.id, assessment);
    return assessment;
  }

  /**
   * Generate predictive alert
   */
  private async generatePredictiveAlert(
    prediction: Prediction,
    riskAssessment: RiskAssessment
  ): Promise<void> {
    // In production, integrate with actual alert manager
    console.log(`[Intelligence] Creating predictive alert for ${prediction.target}`);
    console.log(`  Type: ${prediction.type}, Probability: ${(prediction.probability * 100).toFixed(1)}%`);
    console.log(`  Risk: ${riskAssessment.riskScore}/100 (${riskAssessment.riskLevel})`);
    console.log(`  Timeframe: ${prediction.timeframe.horizon} days`);

    this.emit('predictive-alert-created', {
      type: 'predictive',
      source: prediction.type,
      target: prediction.target,
      severity: prediction.prediction.severity,
      description: prediction.prediction.description,
      probability: prediction.probability,
      riskScore: riskAssessment.riskScore,
      timeframe: prediction.timeframe,
      recommendations: prediction.recommendations,
    });
  }

  /**
   * Find prediction related to alert
   */
  private findRelatedPrediction(alert: any): Prediction | null {
    for (const prediction of this.predictions.values()) {
      // Match by target and type
      if (prediction.target === alert.cameraId && this.isRelatedType(prediction.type, alert.type)) {
        return prediction;
      }
    }
    return null;
  }

  /**
   * Check if prediction type relates to alert type
   */
  private isRelatedType(predictionType: string, alertType: string): boolean {
    const relations: Record<string, string[]> = {
      hardware_failure: ['camera-offline', 'camera-health', 'video-loss'],
      storage_exhaustion: ['storage-full', 'recording-failed'],
      incident: ['intrusion', 'loitering', 'person-detected'],
    };

    return relations[predictionType]?.includes(alertType) ?? false;
  }

  /**
   * Handle action completion
   */
  private async handleActionCompleted(action: PreventiveAction, outcome: any): Promise<void> {
    console.log(`[Intelligence] Action completed: ${action.description}`);
    
    this.metrics.successfulActions++;

    // Find related prediction
    const context = Array.from(this.contexts.values()).find((ctx) =>
      ctx.preventiveActions.some((a) => a.id === action.id)
    );

    if (context) {
      context.timeline.push({
        stage: 'action-completed',
        timestamp: new Date(),
        details: `Action completed successfully: ${action.description}`,
      });

      // Record feedback
      const feedback = await this.recordFeedback({
        actionId: action.id,
        predictionId: context.prediction ? Array.from(this.predictions.entries()).find(
          ([_, p]) => p === context.prediction
        )?.[0] : undefined,
        feedbackType: 'action-outcome',
        expectedOutcome: action.description,
        actualOutcome: outcome.description || 'Success',
        accuracyDelta: 1.0, // Positive outcome
        lessonsLearned: outcome.lessonsLearned || [],
        adjustments: [],
      });

      context.feedback.push(feedback);
      context.pipelineStatus.feedbackRecorded = true;
    }

    this.emit('action-success', action, outcome);
  }

  /**
   * Handle action failure
   */
  private async handleActionFailed(action: PreventiveAction, error: Error): Promise<void> {
    console.error(`[Intelligence] Action failed: ${action.description}`, error);
    
    this.metrics.failedActions++;

    // Find related context
    const context = Array.from(this.contexts.values()).find((ctx) =>
      ctx.preventiveActions.some((a) => a.id === action.id)
    );

    if (context) {
      context.timeline.push({
        stage: 'action-failed',
        timestamp: new Date(),
        details: `Action failed: ${error.message}`,
      });

      // Record feedback
      const feedback = await this.recordFeedback({
        actionId: action.id,
        feedbackType: 'action-outcome',
        expectedOutcome: action.description,
        actualOutcome: `Failed: ${error.message}`,
        accuracyDelta: -1.0, // Negative outcome
        lessonsLearned: [`Action type ${action.actionType} failed: ${error.message}`],
        adjustments: [],
      });

      context.feedback.push(feedback);
    }

    this.emit('action-failure', action, error);
  }

  /**
   * Record feedback for learning
   */
  async recordFeedback(partial: Partial<IntelligenceFeedback>): Promise<IntelligenceFeedback> {
    const feedback: IntelligenceFeedback = {
      id: `feedback_${randomUUID()}`,
      feedbackType: partial.feedbackType || 'manual',
      expectedOutcome: partial.expectedOutcome || '',
      actualOutcome: partial.actualOutcome || '',
      accuracyDelta: partial.accuracyDelta || 0,
      lessonsLearned: partial.lessonsLearned || [],
      adjustments: partial.adjustments || [],
      createdAt: new Date(),
      createdBy: partial.createdBy || 'system',
      ...partial,
    };

    this.feedback.push(feedback);
    this.emit('feedback-recorded', feedback);

    return feedback;
  }

  /**
   * Get intelligence dashboard
   */
  getDashboard(): IntelligenceDashboard {
    const activePredictions = Array.from(this.predictions.values()).filter(
      (p) => new Date() < p.timeframe.end
    );

    const highRiskAlerts = Array.from(this.riskAssessments.values()).filter(
      (r) => r.riskLevel === 'high' || r.riskLevel === 'critical'
    );

    const pendingRecommendations = Array.from(this.recommendations.values()).filter(
      (r) => r.status === 'pending'
    );

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const preventiveActionsToday = Array.from(this.preventiveActions.values()).filter(
      (a) => a.createdAt >= today
    );

    // Calculate metrics
    const predictionAccuracy =
      this.metrics.totalPredictions > 0
        ? this.metrics.materializedPredictions / this.metrics.totalPredictions
        : 0;

    const preventionRate =
      this.metrics.materializedPredictions > 0
        ? this.metrics.preventedIncidents / this.metrics.materializedPredictions
        : 0;

    const avgEarlyWarningDays =
      activePredictions.length > 0
        ? activePredictions.reduce((sum, p) => sum + p.timeframe.horizon, 0) /
          activePredictions.length
        : 0;

    const completedRecommendations = Array.from(this.recommendations.values()).filter(
      (r) => r.status === 'completed' && r.effectivenessScore !== undefined
    );
    
    const recommendationEffectiveness =
      completedRecommendations.length > 0
        ? completedRecommendations.reduce((sum, r) => sum + (r.effectivenessScore || 0), 0) /
          completedRecommendations.length
        : 0;

    const totalActions = this.metrics.successfulActions + this.metrics.failedActions;
    const autoActionSuccessRate =
      totalActions > 0 ? this.metrics.successfulActions / totalActions : 0;

    // Top risks
    const topRisks = Array.from(this.riskAssessments.values())
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, 10)
      .map((r) => ({
        target: r.targetName,
        riskScore: r.riskScore,
        trend: r.trend,
      }));

    return {
      summary: {
        activePredictions: activePredictions.length,
        highRiskAlerts: highRiskAlerts.length,
        pendingRecommendations: pendingRecommendations.length,
        preventiveActionsToday: preventiveActionsToday.length,
      },
      metrics: {
        predictionAccuracy,
        preventionRate,
        avgEarlyWarningDays,
        recommendationEffectiveness,
        autoActionSuccessRate,
      },
      recentActivity: {
        predictions: activePredictions.slice(0, 10),
        recommendations: Array.from(this.recommendations.values()).slice(-10),
        preventiveActions: Array.from(this.preventiveActions.values()).slice(-10),
        feedback: this.feedback.slice(-10),
      },
      topRisks,
      generatedAt: new Date(),
    };
  }

  /**
   * Get intelligence context for prediction
   */
  getContext(predictionId: string): IntelligenceContext | null {
    return this.contexts.get(predictionId) || null;
  }

  /**
   * Get all contexts
   */
  getAllContexts(): IntelligenceContext[] {
    return Array.from(this.contexts.values());
  }

  /**
   * Approve preventive action
   */
  async approveAction(actionId: string, approvedBy: string, notes?: string): Promise<void> {
    const action = this.preventiveActions.get(actionId);
    if (!action) {
      throw new Error(`Action ${actionId} not found`);
    }

    action.status = 'approved';
    action.approvedBy = approvedBy;
    action.approvedAt = new Date();
    action.approvalNotes = notes;

    // Execute approved action
    await this.actionExecutor.executeAction(action);
  }

  /**
   * Get metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      successRate: this.metrics.successfulActions / (this.metrics.successfulActions + this.metrics.failedActions) || 0,
    };
  }
}

/**
 * Singleton instance
 */
let orchestratorInstance: IntelligenceOrchestrator | null = null;

export function getIntelligenceOrchestrator(): IntelligenceOrchestrator {
  if (!orchestratorInstance) {
    orchestratorInstance = new IntelligenceOrchestrator();
  }
  return orchestratorInstance;
}
