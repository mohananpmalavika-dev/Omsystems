/**
 * Intelligence Pipeline Types
 * 
 * Types for closed-loop intelligence system:
 * Prediction → Risk → Alert → RCA → Recommendation → Prevention
 */

import type { Prediction } from '../../analytics-engine/src/detectors/ai-prediction-engine';
import type { RootCauseAnalysis } from '../../root-cause-analysis-engine/src/types';

export { Prediction, RootCauseAnalysis };

/**
 * Risk Assessment
 */
export interface RiskAssessment {
  id: string;
  targetId: string;
  targetType: 'location' | 'camera' | 'system' | 'user';
  targetName: string;
  
  // Risk score (0-100)
  riskScore: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  
  // Contributing factors
  factors: Array<{
    factor: string;
    weight: number;
    contribution: number;
  }>;
  
  // Trend
  trend: 'increasing' | 'stable' | 'decreasing';
  previousScore?: number;
  
  // Time-based risk
  peakRiskTime?: {
    day: string;
    hour: number;
    probability: number;
  };
  
  // Metadata
  assessedAt: Date;
  validUntil: Date;
  confidence: number;
}

/**
 * Recommendation
 */
export interface Recommendation {
  id: string;
  sourceId: string;
  sourceType: 'prediction' | 'rca' | 'pattern' | 'manual';
  
  // Recommendation content
  title: string;
  description: string;
  rationale: string;
  
  // Priority and categorization
  priority: 'immediate' | 'short-term' | 'long-term' | 'preventive';
  category: 'hardware' | 'software' | 'process' | 'security' | 'capacity';
  
  // Impact
  estimatedImpact: 'low' | 'medium' | 'high' | 'critical';
  estimatedCost?: number;
  estimatedTimeHours?: number;
  
  // Execution
  autoExecutable: boolean;
  requiresApproval: boolean;
  
  // Status
  status: 'pending' | 'approved' | 'rejected' | 'executing' | 'completed' | 'failed';
  createdAt: Date;
  executedAt?: Date;
  completedAt?: Date;
  
  // Outcome
  outcome?: {
    success: boolean;
    actualImpact: string;
    lessonsLearned: string[];
  };
  
  effectivenessScore?: number; // 0-1
}

/**
 * Preventive Action
 */
export interface PreventiveAction {
  id: string;
  recommendationId: string;
  
  // Action details
  actionType: 'alert-rule' | 'threshold-adjustment' | 'maintenance-schedule' |
              'config-change' | 'notification-route' | 'monitoring-enhancement' |
              'purchase-order' | 'policy-update';
  
  description: string;
  payload: Record<string, any>;
  
  // Approval
  requiresApproval: boolean;
  approvedBy?: string;
  approvedAt?: Date;
  approvalNotes?: string;
  
  // Execution
  status: 'pending' | 'approved' | 'rejected' | 'executing' | 'completed' | 'failed' | 'rolled-back';
  executedAt?: Date;
  completedAt?: Date;
  
  // Outcome
  outcome?: 'success' | 'failure' | 'partial';
  impactDescription?: string;
  
  // Rollback
  rollbackAvailable: boolean;
  rolledBackAt?: Date;
  rollbackReason?: string;
  
  // Metadata
  createdAt: Date;
  createdBy: 'system' | 'user';
  estimatedCost?: number;
}

/**
 * Intelligence Feedback
 */
export interface IntelligenceFeedback {
  id: string;
  
  // Source
  predictionId?: string;
  actionId?: string;
  recommendationId?: string;
  
  // Feedback type
  feedbackType: 'prediction-outcome' | 'action-outcome' | 'recommendation-effectiveness' | 'manual';
  
  // Outcome
  expectedOutcome: string;
  actualOutcome: string;
  accuracyDelta: number; // -1 to 1 (negative = worse than expected, positive = better)
  
  // Learning
  lessonsLearned: string[];
  adjustments: Array<{
    parameter: string;
    oldValue: any;
    newValue: any;
    reason: string;
  }>;
  
  // Metadata
  createdAt: Date;
  createdBy: string;
}

/**
 * Intelligence Dashboard
 */
export interface IntelligenceDashboard {
  summary: {
    activePredictions: number;
    highRiskAlerts: number;
    pendingRecommendations: number;
    preventiveActionsToday: number;
  };
  
  metrics: {
    predictionAccuracy: number; // 0-1
    preventionRate: number; // 0-1
    avgEarlyWarningDays: number;
    recommendationEffectiveness: number; // 0-1
    autoActionSuccessRate: number; // 0-1
  };
  
  recentActivity: {
    predictions: Prediction[];
    recommendations: Recommendation[];
    preventiveActions: PreventiveAction[];
    feedback: IntelligenceFeedback[];
  };
  
  topRisks: Array<{
    target: string;
    riskScore: number;
    trend: string;
  }>;
  
  generatedAt: Date;
}

/**
 * Intelligence Context
 * 
 * Full context for a prediction/incident including all pipeline stages
 */
export interface IntelligenceContext {
  // Source
  prediction?: Prediction;
  incidentId?: string;
  
  // Pipeline stages
  riskAssessment?: RiskAssessment;
  alerts: Array<{
    id: string;
    type: string;
    severity: string;
    createdAt: Date;
  }>;
  
  rca?: RootCauseAnalysis;
  
  recommendations: Recommendation[];
  preventiveActions: PreventiveAction[];
  
  // Feedback
  feedback: IntelligenceFeedback[];
  
  // Status
  pipelineStatus: {
    predictionGenerated: boolean;
    riskAssessed: boolean;
    alertsCreated: boolean;
    rcaComplete: boolean;
    recommendationsGenerated: boolean;
    actionsExecuted: boolean;
    feedbackRecorded: boolean;
  };
  
  // Timeline
  timeline: Array<{
    stage: string;
    timestamp: Date;
    details: string;
  }>;
}
