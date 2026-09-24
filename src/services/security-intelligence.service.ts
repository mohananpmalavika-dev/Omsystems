/**
 * Security Intelligence Service
 * 
 * Main orchestration service for AI-Powered Predictive Security Intelligence ("SecurityGPT").
 * Coordinates behavioral learning, risk prediction, and patrol optimization.
 * 
 * Features:
 * - Real-time behavioral observation recording
 * - Automated anomaly detection
 * - Risk heat map generation
 * - Incident prediction (24-48hr horizon)
 * - Proactive patrol plan generation
 * - Security intelligence reporting
 * - WebSocket real-time updates
 * 
 * Architecture:
 * - Observation Layer: Record and learn from behavioral data
 * - Analysis Layer: Detect anomalies and calculate risk
 * - Prediction Layer: Forecast incidents and generate heat maps
 * - Action Layer: Generate patrol plans and recommendations
 * - Reporting Layer: Generate intelligence summaries
 */

import type { Pool } from 'pg';
import { BehavioralPatternLearningDetector } from '../../analytics-engine/src/detectors/behavioral-pattern-learning-detector.js';
import { SecurityRiskPredictionEngine, type RiskHeatMap, type IncidentPrediction } from '../../analytics-engine/src/core/security-risk-prediction-engine.js';
import { PatrolOptimizationEngine, type PatrolPlan } from '../../analytics-engine/src/core/patrol-optimization-engine.js';
import type { DetectionFrame } from '../../analytics-engine/src/detectors/base-detector.js';

// =====================================================
// TYPES
// =====================================================

export interface SecurityIntelligenceReport {
  id: string;
  tenantId: string;
  branchId?: string;
  reportType: 'daily' | 'shift' | 'weekly' | 'realtime';
  reportPeriodStart: Date;
  reportPeriodEnd: Date;
  
  // Summary metrics
  totalObservations: number;
  totalAnomalies: number;
  totalIncidents: number;
  anomaliesBySeverity: Record<string, number>;
  incidentsByType: Record<string, number>;
  
  // Risk assessment
  overallRiskScore: number;
  riskTrend: 'increasing' | 'stable' | 'decreasing';
  topRiskZones: Array<{
    zoneId: string;
    riskScore: number;
    anomalyCount: number;
  }>;
  
  // Patrol effectiveness
  patrolsCompleted: number;
  patrolCoveragePercentage?: number;
  incidentsPreventedEstimate?: number;
  
  // Predictions
  activePredictionsCount: number;
  highRiskPredictionsCount: number;
  
  // Recommendations
  recommendations: string[];
  priorityActions: string[];
  
  generatedAt: Date;
}

export interface AnomalyAlert {
  id: string;
  tenantId: string;
  branchId: string;
  detectedAt: Date;
  anomalyType: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  anomalyScore: number;
  location?: { lat: number; lon: number };
  zoneId?: string;
  cameraId?: string;
  description: string;
  expectedValue: any;
  actualValue: any;
  recommendedActions: string[];
}

export interface SecurityIntelligenceOptions {
  enableRealTimeUpdates: boolean;
  anomalyDetectionEnabled: boolean;
  riskPredictionEnabled: boolean;
  patrolOptimizationEnabled: boolean;
  reportGenerationInterval: number; // minutes
  heatMapUpdateInterval: number; // minutes
}

// =====================================================
// SECURITY INTELLIGENCE SERVICE
// =====================================================

export class SecurityIntelligenceService {
  private readonly db: Pool;
  private readonly behavioralLearning: BehavioralPatternLearningDetector;
  private readonly riskPrediction: SecurityRiskPredictionEngine;
  private readonly patrolOptimization: PatrolOptimizationEngine;
  private readonly options: SecurityIntelligenceOptions;
  
  // Real-time update subscriptions
  private updateSubscribers = new Map<string, Set<(data: any) => void>>();
  
  // Performance metrics
  private metrics = {
    totalObservationsProcessed: 0,
    totalAnomaliesDetected: 0,
    totalPredictionsGenerated: 0,
    totalPatrolPlansCreated: 0,
    totalReportsGenerated: 0,
    avgProcessingTimeMs: 0,
  };
  
  constructor(db: Pool, options?: Partial<SecurityIntelligenceOptions>) {
    this.db = db;
    this.behavioralLearning = new BehavioralPatternLearningDetector(db);
    this.riskPrediction = new SecurityRiskPredictionEngine(db);
    this.patrolOptimization = new PatrolOptimizationEngine(db);
    
    this.options = {
      enableRealTimeUpdates: options?.enableRealTimeUpdates ?? true,
      anomalyDetectionEnabled: options?.anomalyDetectionEnabled ?? true,
      riskPredictionEnabled: options?.riskPredictionEnabled ?? true,
      patrolOptimizationEnabled: options?.patrolOptimizationEnabled ?? true,
      reportGenerationInterval: options?.reportGenerationInterval ?? 60, // 1 hour
      heatMapUpdateInterval: options?.heatMapUpdateInterval ?? 15, // 15 minutes
    };
  }
  
  async initialize(): Promise<void> {
    console.log('[SecurityIntelligence] Initializing...');
    
    // Initialize sub-engines
    await this.behavioralLearning.initialize();
    
    // Start background jobs
    this.startBackgroundJobs();
    
    console.log('[SecurityIntelligence] Initialized successfully');
  }
  
  async cleanup(): Promise<void> {
    await this.behavioralLearning.cleanup();
    this.updateSubscribers.clear();
  }
  
  // =====================================================
  // OBSERVATION & LEARNING
  // =====================================================
  
  /**
   * Process detection frame and record behavioral observations
   */
  async processDetectionFrame(
    frame: DetectionFrame,
    detections: any[]
  ): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Record observations
      const observations = await this.behavioralLearning.recordObservation(frame, detections);
      
      this.metrics.totalObservationsProcessed += observations.length;
      
      // Detect anomalies if enabled
      if (this.options.anomalyDetectionEnabled) {
        for (const observation of observations) {
          const anomalies = await this.behavioralLearning.detectAnomalies(observation);
          
          if (anomalies.length > 0) {
            this.metrics.totalAnomaliesDetected += anomalies.length;
            
            // Trigger real-time alerts for high/critical anomalies
            for (const anomaly of anomalies) {
              if (anomaly.severity === 'high' || anomaly.severity === 'critical') {
                await this.handleAnomalyAlert(anomaly);
              }
            }
          }
        }
      }
      
      this.metrics.avgProcessingTimeMs = 
        (this.metrics.avgProcessingTimeMs + (Date.now() - startTime)) / 2;
    } catch (error) {
      console.error('[SecurityIntelligence] Error processing detection frame:', error);
    }
  }
  
  private async handleAnomalyAlert(anomaly: any): Promise<void> {
    const alert: AnomalyAlert = {
      id: anomaly.id,
      tenantId: anomaly.tenantId,
      branchId: anomaly.branchId,
      detectedAt: anomaly.detectedAt,
      anomalyType: anomaly.anomalyType,
      severity: anomaly.severity,
      anomalyScore: anomaly.anomalyScore,
      location: anomaly.location,
      zoneId: anomaly.zoneId,
      cameraId: anomaly.cameraId,
      description: this.formatAnomalyDescription(anomaly),
      expectedValue: anomaly.expectedValue,
      actualValue: anomaly.actualValue,
      recommendedActions: this.generateAnomalyActions(anomaly),
    };
    
    // Broadcast to subscribers
    this.broadcastUpdate(`${anomaly.tenantId}:${anomaly.branchId}`, {
      type: 'anomaly_detected',
      data: alert,
    });
    
    // Create incident if critical
    if (anomaly.severity === 'critical') {
      await this.createIncidentFromAnomaly(anomaly);
    }
  }
  
  private formatAnomalyDescription(anomaly: any): string {
    const deviations = anomaly.deviationDetails || [];
    if (deviations.length === 0) {
      return `Anomalous ${anomaly.anomalyType} behavior detected`;
    }
    
    const mainDeviation = deviations[0];
    return `${mainDeviation.metric}: Expected ${mainDeviation.expected.toFixed(1)}, observed ${mainDeviation.actual.toFixed(1)} (${mainDeviation.standardDeviations.toFixed(1)}σ deviation)`;
  }
  
  private generateAnomalyActions(anomaly: any): string[] {
    const actions: string[] = [];
    
    if (anomaly.severity === 'critical') {
      actions.push('Dispatch security personnel immediately');
      actions.push('Activate real-time monitoring');
    }
    
    if (anomaly.cameraId) {
      actions.push(`Review camera ${anomaly.cameraId} footage`);
    }
    
    if (anomaly.zoneId) {
      actions.push(`Inspect zone ${anomaly.zoneId}`);
    }
    
    actions.push('Investigate deviation cause');
    actions.push('Update behavioral baseline if false positive');
    
    return actions;
  }
  
  private async createIncidentFromAnomaly(anomaly: any): Promise<void> {
    try {
      // Mark anomaly as having incident created
      await this.db.query(
        `UPDATE behavioral_anomaly SET incident_created = true WHERE id = $1`,
        [anomaly.id]
      );
      
      // Note: Integration with incident management system would go here
      console.log(`[SecurityIntelligence] Critical anomaly ${anomaly.id} flagged for incident creation`);
    } catch (error) {
      console.error('[SecurityIntelligence] Failed to create incident from anomaly:', error);
    }
  }
  
  // =====================================================
  // RISK PREDICTION
  // =====================================================
  
  /**
   * Generate risk heat map for a branch
   */
  async generateRiskHeatMap(
    tenantId: string,
    branchId: string,
    predictionForTime?: Date
  ): Promise<RiskHeatMap> {
    const targetTime = predictionForTime || new Date();
    
    const heatMap = await this.riskPrediction.generateRiskHeatMap(
      tenantId,
      branchId,
      targetTime
    );
    
    // Broadcast update
    this.broadcastUpdate(`${tenantId}:${branchId}`, {
      type: 'heatmap_updated',
      data: {
        id: heatMap.id,
        highRiskAreasCount: heatMap.highRiskAreasCount,
        overallRiskScore: heatMap.overallRiskScore,
      },
    });
    
    return heatMap;
  }
  
  /**
   * Get latest risk heat map
   */
  async getLatestRiskHeatMap(
    tenantId: string,
    branchId: string
  ): Promise<RiskHeatMap | null> {
    return await this.riskPrediction.getLatestHeatMap(tenantId, branchId);
  }
  
  /**
   * Generate incident predictions for multiple horizons
   */
  async generateIncidentPredictions(
    tenantId: string,
    branchId: string,
    incidentTypes: string[] = ['intrusion', 'theft', 'violence', 'unauthorized_access']
  ): Promise<IncidentPrediction[]> {
    const predictions: IncidentPrediction[] = [];
    const horizons = [24, 48, 72]; // 24h, 48h, 72h
    
    for (const incidentType of incidentTypes) {
      for (const horizon of horizons) {
        const prediction = await this.riskPrediction.generateIncidentPrediction(
          tenantId,
          branchId,
          incidentType,
          'branch',
          branchId,
          horizon
        );
        
        if (prediction) {
          predictions.push(prediction);
          this.metrics.totalPredictionsGenerated++;
          
          // Alert on high-risk predictions
          if (prediction.riskLevel === 'critical' || prediction.riskLevel === 'high') {
            this.broadcastUpdate(`${tenantId}:${branchId}`, {
              type: 'high_risk_prediction',
              data: {
                id: prediction.id,
                incidentType: prediction.incidentType,
                probability: prediction.probability,
                horizon: prediction.predictionHorizonHours,
                riskLevel: prediction.riskLevel,
              },
            });
          }
        }
      }
    }
    
    return predictions;
  }
  
  /**
   * Get active predictions
   */
  async getActivePredictions(
    tenantId: string,
    branchId: string
  ): Promise<IncidentPrediction[]> {
    return await this.riskPrediction.getActivePredictions(tenantId, branchId);
  }
  
  // =====================================================
  // PATROL OPTIMIZATION
  // =====================================================
  
  /**
   * Generate proactive patrol plan
   */
  async generatePatrolPlan(
    tenantId: string,
    branchId: string,
    plannedForDate: Date,
    shiftStartTime: string,
    shiftEndTime: string,
    availableOfficers: number,
    objective: 'minimize_risk' | 'maximize_coverage' | 'balanced' | 'rapid_response' = 'balanced'
  ): Promise<PatrolPlan> {
    // Get latest heat map
    const heatMap = await this.getLatestRiskHeatMap(tenantId, branchId);
    
    if (!heatMap) {
      throw new Error('No risk heat map available. Generate heat map first.');
    }
    
    const plan = await this.patrolOptimization.generatePatrolPlan(
      tenantId,
      branchId,
      heatMap,
      plannedForDate,
      shiftStartTime,
      shiftEndTime,
      availableOfficers,
      objective
    );
    
    this.metrics.totalPatrolPlansCreated++;
    
    // Broadcast update
    this.broadcastUpdate(`${tenantId}:${branchId}`, {
      type: 'patrol_plan_generated',
      data: {
        id: plan.id,
        coveragePercentage: plan.coveragePercentage,
        priorityZonesCount: plan.priorityZones.length,
      },
    });
    
    return plan;
  }
  
  /**
   * Get patrol plan
   */
  async getPatrolPlan(patrolPlanId: string): Promise<PatrolPlan | null> {
    return await this.patrolOptimization.getPatrolPlan(patrolPlanId);
  }
  
  /**
   * Get active patrol plans
   */
  async getActivePatrolPlans(
    tenantId: string,
    branchId: string
  ): Promise<PatrolPlan[]> {
    return await this.patrolOptimization.getActivePlans(tenantId, branchId);
  }
  
  /**
   * Approve patrol plan
   */
  async approvePatrolPlan(
    patrolPlanId: string,
    approvedBy: string
  ): Promise<boolean> {
    const success = await this.patrolOptimization.approvePlan(patrolPlanId, approvedBy);
    
    if (success) {
      const plan = await this.patrolOptimization.getPatrolPlan(patrolPlanId);
      if (plan) {
        this.broadcastUpdate(`${plan.tenantId}:${plan.branchId}`, {
          type: 'patrol_plan_approved',
          data: { id: plan.id },
        });
      }
    }
    
    return success;
  }
  
  /**
   * Start patrol execution
   */
  async startPatrol(patrolPlanId: string): Promise<boolean> {
    const success = await this.patrolOptimization.startPatrol(patrolPlanId);
    
    if (success) {
      const plan = await this.patrolOptimization.getPatrolPlan(patrolPlanId);
      if (plan) {
        this.broadcastUpdate(`${plan.tenantId}:${plan.branchId}`, {
          type: 'patrol_started',
          data: { id: plan.id },
        });
      }
    }
    
    return success;
  }
  
  /**
   * Complete patrol with effectiveness score
   */
  async completePatrol(
    patrolPlanId: string,
    effectivenessScore: number,
    incidentsDetected: number = 0,
    anomaliesFound: number = 0
  ): Promise<boolean> {
    const success = await this.patrolOptimization.completePatrol(
      patrolPlanId,
      effectivenessScore
    );
    
    if (success) {
      // Update checkpoint statistics
      await this.db.query(
        `UPDATE patrol_plan
         SET incidents_prevented_estimate = $2, anomalies_detected_count = $3
         WHERE id = $1`,
        [patrolPlanId, incidentsDetected, anomaliesFound]
      );
      
      const plan = await this.patrolOptimization.getPatrolPlan(patrolPlanId);
      if (plan) {
        this.broadcastUpdate(`${plan.tenantId}:${plan.branchId}`, {
          type: 'patrol_completed',
          data: {
            id: plan.id,
            effectivenessScore,
            incidentsDetected,
            anomaliesFound,
          },
        });
      }
    }
    
    return success;
  }
  
  // =====================================================
  // REPORTING
  // =====================================================
  
  /**
   * Generate security intelligence report
   */
  async generateReport(
    tenantId: string,
    branchId: string | null,
    reportType: SecurityIntelligenceReport['reportType'],
    startDate: Date,
    endDate: Date
  ): Promise<SecurityIntelligenceReport> {
    // Gather metrics
    const observations = await this.getObservationCount(tenantId, branchId, startDate, endDate);
    const anomalies = await this.getAnomalyMetrics(tenantId, branchId, startDate, endDate);
    const incidents = await this.getIncidentMetrics(tenantId, branchId, startDate, endDate);
    const riskAssessment = await this.getRiskAssessment(tenantId, branchId);
    const patrolMetrics = await this.getPatrolMetrics(tenantId, branchId, startDate, endDate);
    const predictions = await this.getPredictionMetrics(tenantId, branchId);
    
    // Calculate risk trend
    const riskTrend = await this.calculateRiskTrend(tenantId, branchId, startDate, endDate);
    
    // Generate recommendations
    const recommendations = this.generateRecommendations(
      anomalies,
      riskAssessment,
      predictions
    );
    
    const report: SecurityIntelligenceReport = {
      id: `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      tenantId,
      branchId: branchId || undefined,
      reportType,
      reportPeriodStart: startDate,
      reportPeriodEnd: endDate,
      totalObservations: observations,
      totalAnomalies: anomalies.total,
      totalIncidents: incidents.total,
      anomaliesBySeverity: anomalies.bySeverity,
      incidentsByType: incidents.byType,
      overallRiskScore: riskAssessment.overallRiskScore,
      riskTrend,
      topRiskZones: riskAssessment.topRiskZones,
      patrolsCompleted: patrolMetrics.completed,
      patrolCoveragePercentage: patrolMetrics.coveragePercentage,
      incidentsPreventedEstimate: patrolMetrics.incidentsPreventedEstimate,
      activePredictionsCount: predictions.activeCount,
      highRiskPredictionsCount: predictions.highRiskCount,
      recommendations,
      priorityActions: this.generatePriorityActions(anomalies, riskAssessment, predictions),
      generatedAt: new Date(),
    };
    
    // Store report
    await this.storeReport(report);
    
    this.metrics.totalReportsGenerated++;
    
    return report;
  }
  
  private async getObservationCount(
    tenantId: string,
    branchId: string | null,
    start: Date,
    end: Date
  ): Promise<number> {
    try {
      let query = `SELECT COUNT(*) as count FROM behavioral_observation
                   WHERE tenant_id = $1 AND observed_at BETWEEN $2 AND $3`;
      const params: any[] = [tenantId, start, end];
      
      if (branchId) {
        query += ` AND branch_id = $4`;
        params.push(branchId);
      }
      
      const result = await this.db.query(query, params);
      return parseInt(result.rows[0]?.count || '0');
    } catch (error) {
      console.error('[SecurityIntelligence] Failed to get observation count:', error);
      return 0;
    }
  }
  
  private async getAnomalyMetrics(
    tenantId: string,
    branchId: string | null,
    start: Date,
    end: Date
  ): Promise<{ total: number; bySeverity: Record<string, number> }> {
    try {
      let query = `SELECT severity, COUNT(*) as count FROM behavioral_anomaly
                   WHERE tenant_id = $1 AND detected_at BETWEEN $2 AND $3`;
      const params: any[] = [tenantId, start, end];
      
      if (branchId) {
        query += ` AND branch_id = $4`;
        params.push(branchId);
      }
      
      query += ` GROUP BY severity`;
      
      const result = await this.db.query(query, params);
      
      const bySeverity: Record<string, number> = {
        low: 0,
        medium: 0,
        high: 0,
        critical: 0,
      };
      
      let total = 0;
      for (const row of result.rows) {
        bySeverity[row.severity] = parseInt(row.count);
        total += parseInt(row.count);
      }
      
      return { total, bySeverity };
    } catch (error) {
      console.error('[SecurityIntelligence] Failed to get anomaly metrics:', error);
      return { total: 0, bySeverity: { low: 0, medium: 0, high: 0, critical: 0 } };
    }
  }
  
  private async getIncidentMetrics(
    tenantId: string,
    branchId: string | null,
    start: Date,
    end: Date
  ): Promise<{ total: number; byType: Record<string, number> }> {
    try {
      let query = `SELECT observation_type as type, COUNT(*) as count FROM behavioral_observation
                   WHERE tenant_id = $1 AND observed_at BETWEEN $2 AND $3`;
      const params: any[] = [tenantId, start, end];
      
      if (branchId) {
        query += ` AND branch_id = $4`;
        params.push(branchId);
      }
      
      query += ` GROUP BY observation_type`;
      
      const result = await this.db.query(query, params);
      
      const byType: Record<string, number> = {};
      let total = 0;
      
      for (const row of result.rows) {
        byType[row.type] = parseInt(row.count);
        total += parseInt(row.count);
      }
      
      return { total, byType };
    } catch (error) {
      console.error('[SecurityIntelligence] Failed to get incident metrics:', error);
      return { total: 0, byType: {} };
    }
  }
  
  private async getRiskAssessment(
    tenantId: string,
    branchId: string | null
  ): Promise<{
    overallRiskScore: number;
    topRiskZones: Array<{ zoneId: string; riskScore: number; anomalyCount: number }>;
  }> {
    try {
      // Get latest heat map data
      let query = `SELECT grid_cell_id, risk_score FROM security_risk_heatmap
                   WHERE tenant_id = $1 AND expires_at > NOW()`;
      const params: any[] = [tenantId];
      
      if (branchId) {
        query += ` AND branch_id = $2`;
        params.push(branchId);
      }
      
      query += ` ORDER BY risk_score DESC LIMIT 100`;
      
      const result = await this.db.query(query, params);
      
      if (result.rows.length === 0) {
        return { overallRiskScore: 0, topRiskZones: [] };
      }
      
      const avgRisk = result.rows.reduce((sum, row) => sum + parseFloat(row.risk_score), 0) / result.rows.length;
      
      // Get anomaly counts by zone
      const topZones = result.rows.slice(0, 5).map(row => ({
        zoneId: row.grid_cell_id,
        riskScore: parseFloat(row.risk_score),
        anomalyCount: 0, // Would query anomaly table for actual count
      }));
      
      return {
        overallRiskScore: avgRisk,
        topRiskZones: topZones,
      };
    } catch (error) {
      console.error('[SecurityIntelligence] Failed to get risk assessment:', error);
      return { overallRiskScore: 0, topRiskZones: [] };
    }
  }
  
  private async getPatrolMetrics(
    tenantId: string,
    branchId: string | null,
    start: Date,
    end: Date
  ): Promise<{
    completed: number;
    coveragePercentage?: number;
    incidentsPreventedEstimate?: number;
  }> {
    try {
      let query = `SELECT COUNT(*) as count,
                          AVG(coverage_percentage) as avg_coverage,
                          SUM(incidents_prevented_estimate) as total_prevented
                   FROM patrol_plan
                   WHERE tenant_id = $1 AND status = 'COMPLETED'
                   AND planned_for_date BETWEEN $2 AND $3`;
      const params: any[] = [tenantId, start, end];
      
      if (branchId) {
        query += ` AND branch_id = $4`;
        params.push(branchId);
      }
      
      const result = await this.db.query(query, params);
      const row = result.rows[0];
      
      return {
        completed: parseInt(row?.count || '0'),
        coveragePercentage: row?.avg_coverage ? parseFloat(row.avg_coverage) : undefined,
        incidentsPreventedEstimate: row?.total_prevented ? parseInt(row.total_prevented) : undefined,
      };
    } catch (error) {
      console.error('[SecurityIntelligence] Failed to get patrol metrics:', error);
      return { completed: 0 };
    }
  }
  
  private async getPredictionMetrics(
    tenantId: string,
    branchId: string | null
  ): Promise<{ activeCount: number; highRiskCount: number }> {
    try {
      let query = `SELECT COUNT(*) as total,
                          COUNT(*) FILTER (WHERE risk_level IN ('high', 'critical')) as high_risk
                   FROM security_incident_prediction
                   WHERE tenant_id = $1 AND status = 'ACTIVE' AND expires_at > NOW()`;
      const params: any[] = [tenantId];
      
      if (branchId) {
        query += ` AND branch_id = $2`;
        params.push(branchId);
      }
      
      const result = await this.db.query(query, params);
      const row = result.rows[0];
      
      return {
        activeCount: parseInt(row?.total || '0'),
        highRiskCount: parseInt(row?.high_risk || '0'),
      };
    } catch (error) {
      console.error('[SecurityIntelligence] Failed to get prediction metrics:', error);
      return { activeCount: 0, highRiskCount: 0 };
    }
  }
  
  private async calculateRiskTrend(
    tenantId: string,
    branchId: string | null,
    start: Date,
    end: Date
  ): Promise<'increasing' | 'stable' | 'decreasing'> {
    try {
      // Compare first half vs second half of period
      const midpoint = new Date((start.getTime() + end.getTime()) / 2);
      
      const query = `SELECT 
                       COUNT(*) FILTER (WHERE detected_at < $3) as first_half,
                       COUNT(*) FILTER (WHERE detected_at >= $3) as second_half
                     FROM behavioral_anomaly
                     WHERE tenant_id = $1 AND detected_at BETWEEN $2 AND $4
                     ${branchId ? 'AND branch_id = $5' : ''}`;
      
      const params = branchId
        ? [tenantId, start, midpoint, end, branchId]
        : [tenantId, start, midpoint, end];
      
      const result = await this.db.query(query, params);
      const row = result.rows[0];
      
      const firstHalf = parseInt(row?.first_half || '0');
      const secondHalf = parseInt(row?.second_half || '0');
      
      if (secondHalf > firstHalf * 1.2) return 'increasing';
      if (secondHalf < firstHalf * 0.8) return 'decreasing';
      return 'stable';
    } catch (error) {
      console.error('[SecurityIntelligence] Failed to calculate risk trend:', error);
      return 'stable';
    }
  }
  
  private generateRecommendations(
    anomalies: any,
    riskAssessment: any,
    predictions: any
  ): string[] {
    const recommendations: string[] = [];
    
    if (anomalies.bySeverity.critical > 0) {
      recommendations.push('Immediate investigation required for critical anomalies');
    }
    
    if (riskAssessment.overallRiskScore > 70) {
      recommendations.push('Deploy additional security resources');
      recommendations.push('Increase patrol frequency');
    }
    
    if (predictions.highRiskCount > 3) {
      recommendations.push('Review and activate proactive patrol plans');
    }
    
    if (riskAssessment.topRiskZones.length > 0) {
      const topZone = riskAssessment.topRiskZones[0];
      recommendations.push(`Focus security efforts on high-risk zone: ${topZone?.zoneId}`);
    }
    
    recommendations.push('Continue behavioral pattern learning');
    recommendations.push('Review and update security protocols');
    
    return recommendations;
  }
  
  private generatePriorityActions(
    anomalies: any,
    riskAssessment: any,
    predictions: any
  ): string[] {
    const actions: string[] = [];
    
    if (anomalies.bySeverity.critical > 0) {
      actions.push(`Investigate ${anomalies.bySeverity.critical} critical anomalies`);
    }
    
    if (predictions.highRiskCount > 0) {
      actions.push(`Review ${predictions.highRiskCount} high-risk incident predictions`);
    }
    
    if (riskAssessment.overallRiskScore > 80) {
      actions.push('Activate emergency security protocols');
    }
    
    return actions;
  }
  
  private async storeReport(report: SecurityIntelligenceReport): Promise<void> {
    try {
      await this.db.query(
        `INSERT INTO security_intelligence_report
         (id, tenant_id, branch_id, report_type, report_period_start, report_period_end,
          total_observations, total_anomalies, total_incidents, anomalies_by_severity,
          incidents_by_type, overall_risk_score, risk_trend, top_risk_zones,
          patrols_completed, patrol_coverage_percentage, incidents_prevented_estimate,
          active_predictions_count, high_risk_predictions_count, recommendations,
          priority_actions, generated_at, generated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12, $13, $14::jsonb,
                 $15, $16, $17, $18, $19, $20::jsonb, $21::jsonb, $22, $23)`,
        [
          report.id, report.tenantId, report.branchId, report.reportType,
          report.reportPeriodStart, report.reportPeriodEnd, report.totalObservations,
          report.totalAnomalies, report.totalIncidents,
          JSON.stringify(report.anomaliesBySeverity),
          JSON.stringify(report.incidentsByType), report.overallRiskScore,
          report.riskTrend, JSON.stringify(report.topRiskZones), report.patrolsCompleted,
          report.patrolCoveragePercentage, report.incidentsPreventedEstimate,
          report.activePredictionsCount, report.highRiskPredictionsCount,
          JSON.stringify(report.recommendations), JSON.stringify(report.priorityActions),
          report.generatedAt, 'SYSTEM',
        ]
      );
    } catch (error) {
      console.error('[SecurityIntelligence] Failed to store report:', error);
    }
  }
  
  // =====================================================
  // REAL-TIME UPDATES
  // =====================================================
  
  subscribe(tenantBranchKey: string, callback: (data: any) => void): () => void {
    if (!this.updateSubscribers.has(tenantBranchKey)) {
      this.updateSubscribers.set(tenantBranchKey, new Set());
    }
    
    this.updateSubscribers.get(tenantBranchKey)!.add(callback);
    
    // Return unsubscribe function
    return () => {
      this.updateSubscribers.get(tenantBranchKey)?.delete(callback);
    };
  }
  
  private broadcastUpdate(tenantBranchKey: string, update: any): void {
    if (!this.options.enableRealTimeUpdates) return;
    
    const subscribers = this.updateSubscribers.get(tenantBranchKey);
    if (subscribers) {
      for (const callback of subscribers) {
        try {
          callback(update);
        } catch (error) {
          console.error('[SecurityIntelligence] Error in subscriber callback:', error);
        }
      }
    }
  }
  
  // =====================================================
  // BACKGROUND JOBS
  // =====================================================
  
  private startBackgroundJobs(): void {
    // Periodic heat map updates
    if (this.options.riskPredictionEnabled) {
      setInterval(async () => {
        console.log('[SecurityIntelligence] Running scheduled heat map update');
        // This would be triggered for active branches
      }, this.options.heatMapUpdateInterval * 60000);
    }
    
    // Periodic report generation
    setInterval(async () => {
      console.log('[SecurityIntelligence] Running scheduled report generation');
      // This would be triggered for active branches
    }, this.options.reportGenerationInterval * 60000);
  }
  
  // =====================================================
  // METRICS
  // =====================================================
  
  getMetrics() {
    return {
      ...this.metrics,
      behavioralLearning: this.behavioralLearning.getHealth(),
      riskPrediction: this.riskPrediction.getMetrics(),
      patrolOptimization: this.patrolOptimization.getMetrics(),
    };
  }
}

/**
 * Factory function
 */
export function createSecurityIntelligenceService(db: Pool): SecurityIntelligenceService {
  return new SecurityIntelligenceService(db);
}
