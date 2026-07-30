/**
 * Branch Risk Aggregation Service
 * 
 * Aggregates component-level risk scores into branch reliability scores.
 * Calculates composite scores considering:
 * - Recorder risk
 * - Storage risk
 * - Network risk
 * - Power/UPS risk
 * - Camera risk
 * - Compliance risk
 * - Redundancy weakness
 * - Historical incident frequency
 */

import { Pool } from 'pg';
import { logger } from '../utils/logger.js';

interface ComponentRiskScore {
  recorderRiskScore: number;
  storageRiskScore: number;
  networkRiskScore: number;
  powerRiskScore: number;
  cameraRiskScore: number;
  complianceRiskScore: number;
}

interface BranchRiskScore {
  branchNodeId: string;
  overallScore: number;
  overallClassification: string;
  componentScores: ComponentRiskScore;
  activePredictionsCount: number;
  criticalPredictionsCount: number;
  topRisks: string[];
  recommendedActions: string[];
}

export class BranchRiskAggregationService {
  // Component weights for overall score calculation
  private readonly WEIGHTS = {
    recorder: 0.30,    // Critical - affects all cameras
    storage: 0.25,     // Critical - affects retention
    network: 0.20,     // High - affects connectivity
    power: 0.15,       // High - complete outage risk
    camera: 0.05,      // Low - individual impact
    compliance: 0.05   // Low - indirect impact
  };

  constructor(private pool: Pool) {}

  /**
   * Calculate branch risk scores for all branches in tenant
   */
  async calculateBranchRiskScores(tenantId: string): Promise<number> {
    try {
      // Get all branches
      const branches = await this.pool.query(
        `SELECT id, name
        FROM resource_nodes
        WHERE tenant_id = $1 
          AND node_type = 'branch'
          AND deleted_at IS NULL`,
        [tenantId]
      );

      let scoresCalculated = 0;

      for (const branch of branches.rows) {
        const riskScore = await this.calculateBranchRisk(tenantId, branch.id);
        if (riskScore) {
          await this.storeBranchRiskScore(tenantId, riskScore);
          scoresCalculated++;
        }
      }

      logger.info('Branch risk scores calculated', { tenantId, scoresCalculated });
      return scoresCalculated;
    } catch (error) {
      logger.error('Error calculating branch risk scores', { error, tenantId });
      throw error;
    }
  }

  /**
   * Calculate risk score for a specific branch
   */
  async calculateBranchRisk(
    tenantId: string,
    branchNodeId: string
  ): Promise<BranchRiskScore | null> {
    try {
      // Get active predictions for this branch
      const predictions = await this.pool.query(
        `SELECT 
          prediction_type,
          probability,
          risk_classification,
          predicted_impact
        FROM failure_predictions
        WHERE tenant_id = $1 
          AND branch_node_id = $2
          AND status = 'active'`,
        [tenantId, branchNodeId]
      );

      // Calculate component risk scores
      const componentScores = this.calculateComponentRisks(predictions.rows);

      // Calculate overall score (0-100, higher is better)
      const overall Score = this.calculateOverallScore(componentScores);

      // Classify risk
      const overallClassification = this.classifyBranchRisk(overallScore);

      // Count predictions by severity
      const criticalPredictions = predictions.rows.filter(p =>
        p.risk_classification === 'critical_risk' || p.risk_classification === 'imminent_failure'
      ).length;

      // Identify top risks
      const topRisks = this.identifyTopRisks(componentScores, predictions.rows);

      // Generate recommendations
      const recommendedActions = this.generateRecommendations(componentScores, predictions.rows);

      return {
        branchNodeId,
        overallScore,
        overallClassification,
        componentScores,
        activePredictionsCount: predictions.rows.length,
        criticalPredictionsCount: criticalPredictions,
        topRisks,
        recommendedActions
      };
    } catch (error) {
      logger.error('Error calculating branch risk', { error, branchNodeId });
      return null;
    }
  }


  /**
   * Calculate risk scores for each component type
   */
  private calculateComponentRisks(predictions: any[]): ComponentRiskScore {
    const scores: ComponentRiskScore = {
      recorderRiskScore: 100,
      storageRiskScore: 100,
      networkRiskScore: 100,
      powerRiskScore: 100,
      cameraRiskScore: 100,
      complianceRiskScore: 100
    };

    // Group predictions by type
    const recorderPredictions = predictions.filter(p => p.prediction_type === 'recorder_failure');
    const diskPredictions = predictions.filter(p => p.prediction_type === 'disk_failure');
    const networkPredictions = predictions.filter(p => p.prediction_type === 'network_failure');
    const cameraPredictions = predictions.filter(p => p.prediction_type === 'camera_failure');
    const upsPredictions = predictions.filter(p => p.prediction_type === 'ups_failure');
    const storagePredictions = predictions.filter(p => p.prediction_type === 'storage_retention_failure');

    // Calculate recorder risk (worst prediction)
    if (recorderPredictions.length > 0) {
      const worstProbability = Math.max(...recorderPredictions.map(p => p.probability));
      scores.recorderRiskScore = Math.round((1 - worstProbability) * 100);
    }

    // Calculate storage risk (consider both disk and retention)
    const storageProblems = [...diskPredictions, ...storagePredictions];
    if (storageProblems.length > 0) {
      const worstProbability = Math.max(...storageProblems.map(p => p.probability));
      scores.storageRiskScore = Math.round((1 - worstProbability) * 100);
    }

    // Calculate network risk
    if (networkPredictions.length > 0) {
      const worstProbability = Math.max(...networkPredictions.map(p => p.probability));
      scores.networkRiskScore = Math.round((1 - worstProbability) * 100);
    }

    // Calculate power risk (UPS)
    if (upsPredictions.length > 0) {
      const worstProbability = Math.max(...upsPredictions.map(p => p.probability));
      scores.powerRiskScore = Math.round((1 - worstProbability) * 100);
    }

    // Calculate camera risk (average across cameras)
    if (cameraPredictions.length > 0) {
      const avgProbability = cameraPredictions.reduce((sum, p) => sum + p.probability, 0) / cameraPredictions.length;
      scores.cameraRiskScore = Math.round((1 - avgProbability) * 100);
    }

    // Calculate compliance risk
    const complianceImpact = predictions.filter(p => 
      p.predicted_impact?.complianceAtRisk === true
    );
    if (complianceImpact.length > 0) {
      const worstProbability = Math.max(...complianceImpact.map(p => p.probability));
      scores.complianceRiskScore = Math.round((1 - worstProbability) * 100);
    }

    return scores;
  }

  /**
   * Calculate overall branch reliability score (weighted average)
   */
  private calculateOverallScore(componentScores: ComponentRiskScore): number {
    const weightedScore = 
      componentScores.recorderRiskScore * this.WEIGHTS.recorder +
      componentScores.storageRiskScore * this.WEIGHTS.storage +
      componentScores.networkRiskScore * this.WEIGHTS.network +
      componentScores.powerRiskScore * this.WEIGHTS.power +
      componentScores.cameraRiskScore * this.WEIGHTS.camera +
      componentScores.complianceRiskScore * this.WEIGHTS.compliance;

    return Math.round(weightedScore);
  }

  /**
   * Classify branch risk based on overall score
   */
  private classifyBranchRisk(score: number): string {
    if (score < 20) return 'imminent_failure';
    if (score < 40) return 'critical_risk';
    if (score < 60) return 'high_risk';
    if (score < 75) return 'emerging_risk';
    return 'monitor';
  }

  /**
   * Identify top risks for the branch
   */
  private identifyTopRisks(componentScores: ComponentRiskScore, predictions: any[]): string[] {
    const risks: Array<{ component: string; score: number; priority: number }> = [
      { component: 'recorder', score: componentScores.recorderRiskScore, priority: 5 },
      { component: 'storage', score: componentScores.storageRiskScore, priority: 4 },
      { component: 'network', score: componentScores.networkRiskScore, priority: 3 },
      { component: 'power', score: componentScores.powerRiskScore, priority: 2 },
      { component: 'camera', score: componentScores.cameraRiskScore, priority: 1 }
    ];

    // Sort by score (lowest first) and priority
    risks.sort((a, b) => {
      if (a.score === b.score) return b.priority - a.priority;
      return a.score - b.score;
    });

    const topRisks: string[] = [];
    for (const risk of risks) {
      if (risk.score < 70 && topRisks.length < 3) {
        const riskLevel = risk.score < 40 ? 'Critical' : risk.score < 60 ? 'High' : 'Medium';
        topRisks.push(`${riskLevel} ${risk.component} risk`);
      }
    }

    return topRisks;
  }

  /**
   * Generate recommended actions based on risks
   */
  private generateRecommendations(componentScores: ComponentRiskScore, predictions: any[]): string[] {
    const recommendations: string[] = [];

    // Recorder recommendations
    if (componentScores.recorderRiskScore < 40) {
      recommendations.push('Urgent: Inspect or replace recorder immediately');
    } else if (componentScores.recorderRiskScore < 60) {
      recommendations.push('Schedule recorder maintenance within 48 hours');
    }

    // Storage recommendations
    if (componentScores.storageRiskScore < 40) {
      recommendations.push('Urgent: Address storage issues to prevent data loss');
    } else if (componentScores.storageRiskScore < 60) {
      recommendations.push('Review storage capacity and plan expansion');
    }

    // Network recommendations
    if (componentScores.networkRiskScore < 40) {
      recommendations.push('Urgent: Restore network connectivity and enable backup');
    } else if (componentScores.networkRiskScore < 60) {
      recommendations.push('Monitor network stability and contact ISP if issues persist');
    }

    // Power recommendations
    if (componentScores.powerRiskScore < 40) {
      recommendations.push('Urgent: Test and replace UPS to prevent outages');
    }

    // Compliance recommendations
    const complianceRisk = predictions.filter(p => p.predicted_impact?.complianceAtRisk === true);
    if (complianceRisk.length > 0) {
      recommendations.push('Address compliance risks to maintain regulatory compliance');
    }

    // General recommendation if multiple issues
    if (recommendations.length >= 3) {
      recommendations.unshift('Multiple critical issues detected - prioritize by business impact');
    }

    return recommendations.slice(0, 5); // Limit to top 5
  }


  /**
   * Store calculated branch risk score
   */
  private async storeBranchRiskScore(tenantId: string, riskScore: BranchRiskScore): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO branch_risk_scores (
          tenant_id,
          branch_node_id,
          calculated_at,
          overall_score,
          overall_classification,
          recorder_risk_score,
          storage_risk_score,
          network_risk_score,
          power_risk_score,
          camera_risk_score,
          compliance_risk_score,
          active_predictions_count,
          critical_predictions_count,
          top_risks,
          recommended_actions
        ) VALUES ($1, $2, NOW(), $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          tenantId,
          riskScore.branchNodeId,
          riskScore.overallScore,
          riskScore.overallClassification,
          riskScore.componentScores.recorderRiskScore,
          riskScore.componentScores.storageRiskScore,
          riskScore.componentScores.networkRiskScore,
          riskScore.componentScores.powerRiskScore,
          riskScore.componentScores.cameraRiskScore,
          riskScore.componentScores.complianceRiskScore,
          riskScore.activePredictionsCount,
          riskScore.criticalPredictionsCount,
          riskScore.topRisks,
          riskScore.recommendedActions
        ]
      );
    } catch (error) {
      logger.error('Error storing branch risk score', { error, branchNodeId: riskScore.branchNodeId });
    }
  }

  /**
   * Get latest branch risk score
   */
  async getLatestBranchRiskScore(
    tenantId: string,
    branchNodeId: string
  ): Promise<BranchRiskScore | null> {
    try {
      const result = await this.pool.query(
        `SELECT *
        FROM branch_risk_scores
        WHERE tenant_id = $1 
          AND branch_node_id = $2
        ORDER BY calculated_at DESC
        LIMIT 1`,
        [tenantId, branchNodeId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        branchNodeId: row.branch_node_id,
        overallScore: row.overall_score,
        overallClassification: row.overall_classification,
        componentScores: {
          recorderRiskScore: row.recorder_risk_score,
          storageRiskScore: row.storage_risk_score,
          networkRiskScore: row.network_risk_score,
          powerRiskScore: row.power_risk_score,
          cameraRiskScore: row.camera_risk_score,
          complianceRiskScore: row.compliance_risk_score
        },
        activePredictionsCount: row.active_predictions_count,
        criticalPredictionsCount: row.critical_predictions_count,
        topRisks: row.top_risks,
        recommendedActions: row.recommended_actions
      };
    } catch (error) {
      logger.error('Error getting branch risk score', { error, branchNodeId });
      return null;
    }
  }

  /**
   * Get all branches with critical risk
   */
  async getCriticalRiskBranches(tenantId: string): Promise<BranchRiskScore[]> {
    try {
      const result = await this.pool.query(
        `SELECT DISTINCT ON (branch_node_id)
          branch_node_id,
          overall_score,
          overall_classification,
          recorder_risk_score,
          storage_risk_score,
          network_risk_score,
          power_risk_score,
          camera_risk_score,
          compliance_risk_score,
          active_predictions_count,
          critical_predictions_count,
          top_risks,
          recommended_actions
        FROM branch_risk_scores
        WHERE tenant_id = $1 
          AND overall_classification IN ('critical_risk', 'imminent_failure')
        ORDER BY branch_node_id, calculated_at DESC`,
        [tenantId]
      );

      return result.rows.map(row => ({
        branchNodeId: row.branch_node_id,
        overallScore: row.overall_score,
        overallClassification: row.overall_classification,
        componentScores: {
          recorderRiskScore: row.recorder_risk_score,
          storageRiskScore: row.storage_risk_score,
          networkRiskScore: row.network_risk_score,
          powerRiskScore: row.power_risk_score,
          cameraRiskScore: row.camera_risk_score,
          complianceRiskScore: row.compliance_risk_score
        },
        activePredictionsCount: row.active_predictions_count,
        criticalPredictionsCount: row.critical_predictions_count,
        topRisks: row.top_risks,
        recommendedActions: row.recommended_actions
      }));
    } catch (error) {
      logger.error('Error getting critical risk branches', { error, tenantId });
      return [];
    }
  }
}
