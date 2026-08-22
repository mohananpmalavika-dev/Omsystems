/**
 * Risk Assessment Engine
 * 
 * Calculates multi-factor risk scores for predictions and alerts
 */

import { randomUUID } from 'crypto';
import type { Prediction } from '../../analytics-engine/src/detectors/ai-prediction-engine.js';
import type { RiskAssessment } from './types.js';

export class RiskAssessmentEngine {
  /**
   * Assess risk for prediction
   */
  async assessPredictionRisk(prediction: Prediction): Promise<RiskAssessment> {
    const factors: Array<{ factor: string; weight: number; contribution: number }> = [];

    // Factor 1: Prediction probability (30% weight)
    const probabilityContribution = prediction.probability * 30;
    factors.push({
      factor: 'Prediction Probability',
      weight: 0.3,
      contribution: probabilityContribution,
    });

    // Factor 2: Severity (30% weight)
    const severityMap: Record<string, number> = { low: 0.25, medium: 0.5, high: 0.75, critical: 1.0 };
    const severityContribution = (severityMap[prediction.prediction.severity as string] || 0) * 30;
    factors.push({
      factor: 'Severity',
      weight: 0.3,
      contribution: severityContribution,
    });

    // Factor 3: Timeframe urgency (20% weight)
    const urgencyFactor = Math.max(0, Math.min(1, 1 - prediction.timeframe.horizon / 60));
    const urgencyContribution = urgencyFactor * 20;
    factors.push({
      factor: 'Timeframe Urgency',
      weight: 0.2,
      contribution: urgencyContribution,
    });

    // Factor 4: Confidence (20% weight)
    const confidenceContribution = prediction.confidence * 20;
    factors.push({
      factor: 'Prediction Confidence',
      weight: 0.2,
      contribution: confidenceContribution,
    });

    // Calculate total risk score
    const riskScore = factors.reduce((sum, f) => sum + f.contribution, 0);

    // Determine risk level
    let riskLevel: 'low' | 'medium' | 'high' | 'critical';
    if (riskScore >= 85) riskLevel = 'critical';
    else if (riskScore >= 70) riskLevel = 'high';
    else if (riskScore >= 40) riskLevel = 'medium';
    else riskLevel = 'low';

    // Determine trend (simplified)
    const trend: 'increasing' | 'stable' | 'decreasing' = 'stable';

    const assessment: RiskAssessment = {
      id: `risk_${randomUUID()}`,
      targetId: prediction.target,
      targetType: this.determineTargetType(prediction.type),
      targetName: prediction.target,
      riskScore: Math.round(riskScore),
      riskLevel,
      factors,
      trend,
      assessedAt: new Date(),
      validUntil: prediction.timeframe.end,
      confidence: prediction.confidence,
    };

    return assessment;
  }

  /**
   * Assess risk for alert
   */
  async assessAlertRisk(alert: any): Promise<RiskAssessment> {
    const factors: Array<{ factor: string; weight: number; contribution: number }> = [];

    // Factor 1: Alert severity (40% weight)
    const severityMap: Record<string, number> = { low: 0.25, medium: 0.5, high: 0.75, critical: 1.0 };
    const severityContribution = (severityMap[alert.severity] || 0.5) * 40;
    factors.push({
      factor: 'Alert Severity',
      weight: 0.4,
      contribution: severityContribution,
    });

    // Factor 2: Alert type risk (30% weight)
    const typeRiskMap: Record<string, number> = {
      intrusion: 0.9,
      'camera-offline': 0.7,
      loitering: 0.6,
      'motion-detected': 0.4,
    };
    const typeRisk = typeRiskMap[alert.type] || 0.5;
    const typeContribution = typeRisk * 30;
    factors.push({
      factor: 'Alert Type Risk',
      weight: 0.3,
      contribution: typeContribution,
    });

    // Factor 3: Location criticality (30% weight)
    const locationRisk = 0.6; // Simplified, would check location history
    const locationContribution = locationRisk * 30;
    factors.push({
      factor: 'Location Criticality',
      weight: 0.3,
      contribution: locationContribution,
    });

    const riskScore = factors.reduce((sum, f) => sum + f.contribution, 0);

    let riskLevel: 'low' | 'medium' | 'high' | 'critical';
    if (riskScore >= 85) riskLevel = 'critical';
    else if (riskScore >= 70) riskLevel = 'high';
    else if (riskScore >= 40) riskLevel = 'medium';
    else riskLevel = 'low';

    const assessment: RiskAssessment = {
      id: `risk_${randomUUID()}`,
      targetId: alert.cameraId || alert.id,
      targetType: 'camera',
      targetName: alert.cameraId || alert.id,
      riskScore: Math.round(riskScore),
      riskLevel,
      factors,
      trend: 'stable',
      assessedAt: new Date(),
      validUntil: new Date(Date.now() + 24 * 60 * 60 * 1000),
      confidence: 0.8,
    };

    return assessment;
  }

  /**
   * Determine target type from prediction type
   */
  private determineTargetType(predictionType: string): 'location' | 'camera' | 'system' | 'user' {
    if (predictionType === 'hardware_failure') return 'camera';
    if (predictionType === 'storage_exhaustion') return 'system';
    if (predictionType === 'incident') return 'location';
    return 'system';
  }
}
