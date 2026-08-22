/**
 * AI Command Center Prediction Service
 * 
 * Natural language query interface for predictions:
 * - "Which branches are most likely to fail tomorrow?"
 * - "What's the risk for Branch 183?"
 * - "Show me all critical predictions"
 * - "Which recorders need immediate attention?"
 * - "How accurate have disk failure predictions been?"
 * 
 * Integrates with existing AI Command Center to provide predictive insights.
 */

import { Pool } from 'pg';

// ============================================
// Types
// ============================================

interface PredictionQuery {
  intent: 'list_predictions' | 'branch_risk' | 'device_risk' | 'prediction_accuracy' | 'recommendations' | 'top_risks';
  filters?: {
    branchId?: string;
    deviceId?: string;
    predictionType?: string;
    riskLevel?: string;
    timeWindow?: string;
  };
  sortBy?: 'probability' | 'time' | 'impact';
  limit?: number;
}

interface CommandCenterResponse {
  answer: string;
  data: any;
  recommendations?: string[];
  nextQuestions?: string[];
}

// ============================================
// AI Command Center Prediction Service
// ============================================

export class AiCommandCenterPredictionService {
  constructor(private pool: Pool) {}

  /**
   * Parse natural language query and execute
   */
  async handleNaturalLanguageQuery(
    question: string,
    tenantId: string,
    userContext?: { branchIds?: string[]; regionIds?: string[] }
  ): Promise<CommandCenterResponse> {
    const query = this.parseQuery(question);
    
    switch (query.intent) {
      case 'list_predictions':
        return this.handleListPredictions(query, tenantId, userContext);
      
      case 'branch_risk':
        return this.handleBranchRisk(query, tenantId);
      
      case 'device_risk':
        return this.handleDeviceRisk(query, tenantId);
      
      case 'prediction_accuracy':
        return this.handlePredictionAccuracy(query, tenantId);
      
      case 'recommendations':
        return this.handleRecommendations(query, tenantId, userContext);
      
      case 'top_risks':
        return this.handleTopRisks(query, tenantId, userContext);
      
      default:
        return {
          answer: "I can help you with predictions. Try asking: 'Which branches are most likely to fail tomorrow?' or 'Show me all critical predictions'",
          data: null
        };
    }
  }

  /**
   * Parse natural language query into structured format
   */
  private parseQuery(question: string): PredictionQuery {
    const lowerQuestion = question.toLowerCase();

    // Intent detection
    let intent: PredictionQuery['intent'] = 'list_predictions';
    
    if (lowerQuestion.includes('most likely to fail') || lowerQuestion.includes('fail tomorrow') || lowerQuestion.includes('fail today')) {
      intent = 'list_predictions';
    } else if (lowerQuestion.includes('accuracy') || lowerQuestion.includes('how accurate') || lowerQuestion.includes('prediction performance')) {
      intent = 'prediction_accuracy';
    } else if (lowerQuestion.includes('risk for branch') || lowerQuestion.includes('branch risk') || lowerQuestion.includes('branch health')) {
      intent = 'branch_risk';
    } else if (lowerQuestion.includes('device risk') || lowerQuestion.includes('risk for device')) {
      intent = 'device_risk';
    } else if (lowerQuestion.includes('recommend') || lowerQuestion.includes('what should')) {
      intent = 'recommendations';
    } else if (lowerQuestion.includes('top risk') || lowerQuestion.includes('highest risk') || lowerQuestion.includes('most critical')) {
      intent = 'top_risks';
    }

    // Extract filters
    const filters: PredictionQuery['filters'] = {};

    // Branch ID extraction
    const branchMatch = lowerQuestion.match(/branch\s*(\d+|[a-z0-9-]+)/i);
    if (branchMatch) {
      filters.branchId = branchMatch[1];
    }

    // Device type extraction
    if (lowerQuestion.includes('recorder')) filters.predictionType = 'recorder_failure';
    else if (lowerQuestion.includes('disk')) filters.predictionType = 'disk_failure';
    else if (lowerQuestion.includes('network')) filters.predictionType = 'network_failure';
    else if (lowerQuestion.includes('camera')) filters.predictionType = 'camera_failure';
    else if (lowerQuestion.includes('ups') || lowerQuestion.includes('power')) filters.predictionType = 'ups_failure';
    else if (lowerQuestion.includes('storage') || lowerQuestion.includes('retention')) filters.predictionType = 'storage_retention_failure';

    // Risk level extraction
    if (lowerQuestion.includes('critical') || lowerQuestion.includes('imminent')) {
      filters.riskLevel = 'critical_risk,imminent_failure';
    } else if (lowerQuestion.includes('high')) {
      filters.riskLevel = 'high_risk';
    }

    // Time window extraction
    if (lowerQuestion.includes('tomorrow') || lowerQuestion.includes('next 24')) {
      filters.timeWindow = '24h';
    } else if (lowerQuestion.includes('today') || lowerQuestion.includes('right now')) {
      filters.timeWindow = '12h';
    } else if (lowerQuestion.includes('week') || lowerQuestion.includes('7 days')) {
      filters.timeWindow = '7d';
    } else if (lowerQuestion.includes('3 days')) {
      filters.timeWindow = '3d';
    }

    // Sort order
    let sortBy: PredictionQuery['sortBy'] = 'probability';
    if (lowerQuestion.includes('soonest') || lowerQuestion.includes('earliest')) {
      sortBy = 'time';
    } else if (lowerQuestion.includes('biggest impact') || lowerQuestion.includes('most cameras')) {
      sortBy = 'impact';
    }

    return {
      intent,
      filters,
      sortBy,
      limit: intent === 'top_risks' ? 10 : 50
    };
  }

  /**
   * Handle "list predictions" queries
   */
  private async handleListPredictions(
    query: PredictionQuery,
    tenantId: string,
    userContext?: { branchIds?: string[] }
  ): Promise<CommandCenterResponse> {
    let sql = `
      SELECT 
        fp.id,
        fp.device_id,
        fp.device_type,
        fp.branch_node_id,
        rn.name as branch_name,
        fp.prediction_type,
        fp.probability,
        fp.risk_classification,
        fp.expected_failure_from,
        fp.expected_failure_to,
        fp.predicted_impact,
        fp.recommended_action,
        EXTRACT(EPOCH FROM (fp.expected_failure_from - NOW())) / 3600 as hours_until_failure
      FROM failure_predictions fp
      JOIN resource_nodes rn ON rn.id = fp.branch_node_id
      WHERE fp.tenant_id = $1 
        AND fp.status = 'active'
        AND fp.expected_failure_to >= NOW()
    `;

    const params: any[] = [tenantId];
    let paramCount = 1;

    // Apply filters
    if (query.filters?.timeWindow) {
      const hours = query.filters.timeWindow === '12h' ? 12 : 
                    query.filters.timeWindow === '24h' ? 24 :
                    query.filters.timeWindow === '3d' ? 72 : 168;
      paramCount++;
      sql += ` AND fp.expected_failure_from <= NOW() + INTERVAL '${hours} hours'`;
    }

    if (query.filters?.predictionType) {
      paramCount++;
      sql += ` AND fp.prediction_type = $${paramCount}`;
      params.push(query.filters.predictionType);
    }

    if (query.filters?.riskLevel) {
      const riskLevels = query.filters.riskLevel.split(',');
      paramCount++;
      sql += ` AND fp.risk_classification = ANY($${paramCount})`;
      params.push(riskLevels);
    }

    if (query.filters?.branchId) {
      paramCount++;
      sql += ` AND fp.branch_node_id = $${paramCount}`;
      params.push(query.filters.branchId);
    }

    if (userContext?.branchIds && userContext.branchIds.length > 0) {
      paramCount++;
      sql += ` AND fp.branch_node_id = ANY($${paramCount})`;
      params.push(userContext.branchIds);
    }

    // Apply sorting
    if (query.sortBy === 'time') {
      sql += ` ORDER BY fp.expected_failure_from ASC`;
    } else if (query.sortBy === 'impact') {
      sql += ` ORDER BY (fp.predicted_impact->>'cameras')::int DESC NULLS LAST, fp.probability DESC`;
    } else {
      sql += ` ORDER BY fp.probability DESC, fp.expected_failure_from ASC`;
    }

    sql += ` LIMIT $${paramCount + 1}`;
    params.push(query.limit || 50);

    const result = await this.pool.query(sql, params);
    const predictions = result.rows;

    // Format natural language response
    let answer: string;
    if (predictions.length === 0) {
      answer = "Good news! No critical predictions match your criteria. All monitored devices appear stable.";
    } else {
      const topPrediction = predictions[0];
      const timeDesc = this.formatTimeUntilFailure(topPrediction.hours_until_failure);
      
      answer = `Found ${predictions.length} prediction(s). `;
      answer += `Top concern: ${topPrediction.branch_name} - ${this.formatPredictionType(topPrediction.prediction_type)} `;
      answer += `with ${Math.round(topPrediction.probability * 100)}% probability, expected ${timeDesc}. `;
      
      if (topPrediction.predicted_impact?.cameras) {
        answer += `${topPrediction.predicted_impact.cameras} cameras may be affected. `;
      }

      answer += `Recommended action: ${topPrediction.recommended_action}`;
    }

    // Generate follow-up questions
    const nextQuestions = [
      "Show me more details about this prediction",
      "What's the evidence for this prediction?",
      "Create a work order for this",
      "How accurate have similar predictions been?"
    ];

    return {
      answer,
      data: predictions,
      recommendations: predictions.slice(0, 3).map(p => p.recommended_action),
      nextQuestions
    };
  }

  /**
   * Handle "branch risk" queries
   */
  private async handleBranchRisk(query: PredictionQuery, tenantId: string): Promise<CommandCenterResponse> {
    if (!query.filters?.branchId) {
      return {
        answer: "Please specify a branch ID. Example: 'What's the risk for Branch 183?'",
        data: null
      };
    }

    // Get branch risk score
    const riskQuery = `
      SELECT 
        brs.*,
        rn.name as branch_name,
        (SELECT COUNT(*) FROM failure_predictions 
          WHERE branch_node_id = brs.branch_node_id 
          AND status = 'active' 
          AND risk_classification IN ('critical_risk', 'imminent_failure')) as critical_predictions
      FROM branch_risk_scores brs
      JOIN resource_nodes rn ON rn.id = brs.branch_node_id
      WHERE brs.branch_node_id = $1
        AND brs.tenant_id = $2
      ORDER BY brs.calculated_at DESC
      LIMIT 1
    `;

    const result = await this.pool.query(riskQuery, [query.filters.branchId, tenantId]);

    if (result.rows.length === 0) {
      return {
        answer: `No risk assessment available for Branch ${query.filters.branchId}`,
        data: null
      };
    }

    const risk = result.rows[0];
    const score = parseFloat(risk.overall_score);
    
    let answer = `${risk.branch_name}: Overall reliability score is ${score}/100 `;
    
    if (score >= 80) {
      answer += "(Excellent). ";
    } else if (score >= 60) {
      answer += "(Good). ";
    } else if (score >= 40) {
      answer += "(Fair - attention needed). ";
    } else {
      answer += "(Critical - immediate action required). ";
    }

    if (risk.critical_predictions > 0) {
      answer += `⚠️ ${risk.critical_predictions} critical prediction(s) active. `;
    }

    if (risk.top_risks && risk.top_risks.length > 0) {
      answer += `Top risks: ${risk.top_risks.slice(0, 2).join(', ')}. `;
    }

    if (risk.recommendations && risk.recommendations.length > 0) {
      answer += `Recommended: ${risk.recommendations[0]}`;
    }

    return {
      answer,
      data: risk,
      recommendations: risk.recommendations || [],
      nextQuestions: [
        "Show me all predictions for this branch",
        "What's causing the low score?",
        "Compare this branch with others"
      ]
    };
  }

  /**
   * Handle "device risk" queries
   */
  private async handleDeviceRisk(query: PredictionQuery, tenantId: string): Promise<CommandCenterResponse> {
    if (!query.filters?.deviceId) {
      return {
        answer: "Please specify a device ID. Example: 'What's the risk for recorder-123?'",
        data: null
      };
    }

    const predictions = await this.pool.query(
      `SELECT 
        fp.*,
        rn.name as branch_name,
        (SELECT json_agg(pe) FROM prediction_evidence pe WHERE pe.prediction_id = fp.id) as evidence
      FROM failure_predictions fp
      JOIN resource_nodes rn ON rn.id = fp.branch_node_id
      WHERE fp.device_id = $1
        AND fp.tenant_id = $2
        AND fp.status = 'active'
      ORDER BY fp.probability DESC`,
      [query.filters.deviceId, tenantId]
    );

    if (predictions.rows.length === 0) {
      return {
        answer: `Device ${query.filters.deviceId} has no active risk predictions. System appears healthy.`,
        data: null
      };
    }

    const pred = predictions.rows[0];
    const answer = `${pred.device_type} ${pred.device_id} at ${pred.branch_name}: ${Math.round(pred.probability * 100)}% probability of ${this.formatPredictionType(pred.prediction_type)} within ${this.formatTimeWindow(pred.expected_failure_from, pred.expected_failure_to)}. Evidence: ${pred.evidence?.slice(0, 2).map((e: any) => e.evidence_type).join(', ')}. ${pred.recommended_action}`;

    return {
      answer,
      data: predictions.rows,
      recommendations: [pred.recommended_action],
      nextQuestions: [
        "Show me the evidence details",
        "Create a maintenance ticket",
        "When was this device last maintained?"
      ]
    };
  }

  /**
   * Handle "prediction accuracy" queries
   */
  private async handlePredictionAccuracy(query: PredictionQuery, tenantId: string): Promise<CommandCenterResponse> {
    const { PredictionCalibrationService } = await import('./prediction-calibration.service.js');
    const calibrationService = new PredictionCalibrationService(this.pool);

    const performance = await calibrationService.getAllPredictionPerformance(90, tenantId);

    if (performance.length === 0) {
      return {
        answer: "Not enough prediction outcomes yet to calculate accuracy. Check back after predictions have been verified.",
        data: null
      };
    }

    // Filter by type if specified
    const targetPerf = query.filters?.predictionType
      ? performance.find(p => p.predictionType === query.filters?.predictionType)
      : performance.reduce((best, p) => p.metrics.totalPredictions > best.metrics.totalPredictions ? p : best);

    if (!targetPerf) {
      return {
        answer: `No accuracy data available for ${query.filters?.predictionType}`,
        data: null
      };
    }

    const metrics = targetPerf.metrics;
    const answer = `${this.formatPredictionType(targetPerf.predictionType)} predictions: ${(metrics.accuracy * 100).toFixed(1)}% accuracy over ${metrics.totalPredictions} predictions (Precision: ${(metrics.precision * 100).toFixed(1)}%, Recall: ${(metrics.recall * 100).toFixed(1)}%). Model health: ${targetPerf.modelHealth}. ${targetPerf.recommendations[0]}`;

    return {
      answer,
      data: targetPerf,
      recommendations: targetPerf.recommendations,
      nextQuestions: [
        "Show me recent false positives",
        "How can we improve accuracy?",
        "Compare accuracy across prediction types"
      ]
    };
  }

  /**
   * Handle "recommendations" queries
   */
  private async handleRecommendations(
    query: PredictionQuery,
    tenantId: string,
    userContext?: { branchIds?: string[] }
  ): Promise<CommandCenterResponse> {
    // Get top critical predictions
    const topQuery = await this.handleTopRisks(query, tenantId, userContext);
    
    const recommendations = [
      `Priority 1: ${topQuery.data[0]?.recommended_action || 'Review critical predictions'}`,
      `Priority 2: ${topQuery.data[1]?.recommended_action || 'Monitor emerging risks'}`,
      `Priority 3: ${topQuery.data[2]?.recommended_action || 'Perform preventive maintenance'}`
    ];

    const answer = `Based on current predictions, here are the top recommended actions: ${recommendations[0]}`;

    return {
      answer,
      data: topQuery.data,
      recommendations,
      nextQuestions: [
        "Create work orders for these",
        "Show me which branches need attention first",
        "How much will this maintenance cost?"
      ]
    };
  }

  /**
   * Handle "top risks" queries
   */
  private async handleTopRisks(
    query: PredictionQuery,
    tenantId: string,
    userContext?: { branchIds?: string[] }
  ): Promise<CommandCenterResponse> {
    let sql = `
      SELECT 
        fp.*,
        rn.name as branch_name,
        EXTRACT(EPOCH FROM (fp.expected_failure_from - NOW())) / 3600 as hours_until_failure
      FROM failure_predictions fp
      JOIN resource_nodes rn ON rn.id = fp.branch_node_id
      WHERE fp.tenant_id = $1 
        AND fp.status = 'active'
        AND fp.risk_classification IN ('critical_risk', 'imminent_failure')
      ORDER BY fp.probability DESC, fp.expected_failure_from ASC
      LIMIT $2
    `;

    const params = [tenantId, query.limit || 10];

    const result = await this.pool.query(sql, params);
    const risks = result.rows;

    const answer = risks.length > 0
      ? `Top ${risks.length} critical risks: ${risks.slice(0, 3).map(r => `${r.branch_name} (${this.formatPredictionType(r.prediction_type)})`).join(', ')}. Immediate action recommended.`
      : "No critical risks detected. All systems operating normally.";

    return {
      answer,
      data: risks,
      recommendations: risks.slice(0, 3).map(r => r.recommended_action),
      nextQuestions: [
        "Create maintenance tickets for all",
        "Which branch should we prioritize?",
        "Show me the evidence"
      ]
    };
  }

  /**
   * Helper: Format prediction type
   */
  private formatPredictionType(type: string): string {
    return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  /**
   * Helper: Format time until failure
   */
  private formatTimeUntilFailure(hours: number): string {
    if (hours < 0) return 'overdue';
    if (hours < 1) return 'within 1 hour';
    if (hours < 24) return `in ${Math.round(hours)} hours`;
    return `in ${Math.round(hours / 24)} days`;
  }

  /**
   * Helper: Format time window
   */
  private formatTimeWindow(from: string, to: string): string {
    const fromDate = new Date(from);
    const toDate = new Date(to);
    const diffHours = (toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60);
    
    if (diffHours < 24) return 'the next 12-24 hours';
    if (diffHours < 72) return 'the next 2-3 days';
    return 'the next week';
  }
}

export default AiCommandCenterPredictionService;
