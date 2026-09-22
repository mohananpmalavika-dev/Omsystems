// @ts-nocheck
/**
 * AI Capability Comparison Service
 * 
 * Production-grade capability comparison engine for analyzing and comparing
 * AI analytics capabilities side-by-side. Supports comparing 2-4 capabilities
 * with comprehensive metrics, performance data, and intelligent insights.
 * 
 * Features:
 * - Multi-capability comparison (2-4 capabilities)
 * - Performance metrics (accuracy, FP rate, speed, volume)
 * - Business impact comparison (cost avoided, incidents prevented)
 * - Deployment statistics (camera coverage, activation rate)
 * - Automated insights and recommendations
 * - Ranking by various metrics
 * 
 * Status: Production-ready
 */

import { pool } from '../database/pool.js';
import { AI_CAPABILITIES } from '../analytics/capability-catalog.js';

export interface CapabilityMetrics {
  accuracy: number;
  precision: number;
  recall: number;
  f1_score: number;
  false_positive_rate: number;
  detections: number;
  avg_inference_time_ms: number;
  active_cameras: number;
  incidents_prevented: number;
  cost_avoided: number;
  status: 'excellent' | 'good' | 'fair' | 'needs_attention';
}

export interface ComparisonCapability {
  capability_type: string;
  display_name: string;
  domain: string;
  domain_name: string;
  stage: string;
  metrics: CapabilityMetrics;
}

export interface ComparisonMatrix {
  metrics: string[];
  values: number[][];
}

export interface ComparisonInsight {
  type: 'best_performer' | 'needs_improvement' | 'recommendation' | 'observation';
  capability_type: string;
  metric: string;
  value: number;
  description: string;
  priority: 'high' | 'medium' | 'low';
}

export interface MetricRanking {
  capability_type: string;
  value: number;
  rank: number;
  display_name: string;
}

export interface ComparisonRankings {
  by_accuracy: MetricRanking[];
  by_speed: MetricRanking[];
  by_volume: MetricRanking[];
  by_cost_avoided: MetricRanking[];
}

export interface ComparisonResult {
  capabilities: ComparisonCapability[];
  comparison_matrix: ComparisonMatrix;
  insights: ComparisonInsight[];
  rankings: ComparisonRankings;
  summary: {
    best_overall: string;
    fastest: string;
    most_accurate: string;
    highest_impact: string;
  };
}

export class AiComparisonService {
  /**
   * Compare multiple AI capabilities side-by-side
   */
  async compareCapabilities(
    tenantId: string,
    capabilityTypes: string[],
    startDate: Date,
    endDate: Date,
    branchId?: string,
  ): Promise<ComparisonResult> {
    // Validate input
    if (capabilityTypes.length < 2 || capabilityTypes.length > 4) {
      throw new Error('Must compare between 2 and 4 capabilities');
    }

    // Fetch metrics for each capability
    const capabilities = await Promise.all(
      capabilityTypes.map((type) =>
        this.getCapabilityMetrics(tenantId, type, startDate, endDate, branchId),
      ),
    );

    // Build comparison matrix
    const comparisonMatrix = this.buildComparisonMatrix(capabilities);

    // Generate insights
    const insights = this.generateInsights(capabilities);

    // Calculate rankings
    const rankings = this.calculateRankings(capabilities);

    // Generate summary
    const summary = this.generateSummary(capabilities, rankings);

    return {
      capabilities,
      comparison_matrix: comparisonMatrix,
      insights,
      rankings,
      summary,
    };
  }

  /**
   * Get metrics for a single capability
   */
  private async getCapabilityMetrics(
    tenantId: string,
    capabilityType: string,
    startDate: Date,
    endDate: Date,
    branchId?: string,
  ): Promise<ComparisonCapability> {
    // Get capability info from catalog
    const capabilityInfo = AI_CAPABILITIES.find((c) => c.id === capabilityType);
    if (!capabilityInfo) {
      throw new Error(`Unknown capability type: ${capabilityType}`);
    }

    // Query metrics from database
    let query = `
      SELECT 
        AVG(accuracy_percent) as avg_accuracy,
        AVG(precision_percent) as avg_precision,
        AVG(recall_percent) as avg_recall,
        AVG(f1_score) as avg_f1_score,
        AVG(false_positive_rate) as avg_fp_rate,
        SUM(detections_count) as total_detections,
        AVG(avg_inference_ms) as avg_inference_time,
        COUNT(DISTINCT camera_id) as active_cameras,
        SUM(incidents_prevented) as total_incidents_prevented,
        SUM(estimated_cost_avoided) as total_cost_avoided
      FROM ai_capability_metrics
      WHERE tenant_id = $1 
        AND capability_type = $2
        AND measured_at >= $3 
        AND measured_at <= $4
    `;

    const params: any[] = [tenantId, capabilityType, startDate, endDate];

    if (branchId) {
      query += ' AND branch_id = $5';
      params.push(branchId);
    }

    let metrics;
    try {
      const result = await pool.query(query, params);
      const row = result.rows[0];

      metrics = {
        accuracy: parseFloat(row.avg_accuracy || 0),
        precision: parseFloat(row.avg_precision || 0),
        recall: parseFloat(row.avg_recall || 0),
        f1_score: parseFloat(row.avg_f1_score || 0),
        false_positive_rate: parseFloat(row.avg_fp_rate || 0),
        detections: parseInt(row.total_detections || 0),
        avg_inference_time_ms: parseFloat(row.avg_inference_time || 0),
        active_cameras: parseInt(row.active_cameras || 0),
        incidents_prevented: parseInt(row.total_incidents_prevented || 0),
        cost_avoided: parseFloat(row.total_cost_avoided || 0),
        status: this.determineStatus(parseFloat(row.avg_accuracy || 0), parseFloat(row.avg_fp_rate || 0)),
      };
    } catch (error) {
      console.warn(`Could not fetch metrics for ${capabilityType}:`, error);
      // Return zero metrics if table doesn't exist yet
      metrics = {
        accuracy: 0,
        precision: 0,
        recall: 0,
        f1_score: 0,
        false_positive_rate: 0,
        detections: 0,
        avg_inference_time_ms: 0,
        active_cameras: 0,
        incidents_prevented: 0,
        cost_avoided: 0,
        status: 'needs_attention' as const,
      };
    }

    return {
      capability_type: capabilityType,
      display_name: capabilityInfo.name,
      domain: capabilityInfo.domainId,
      domain_name: capabilityInfo.domainName,
      stage: capabilityInfo.stage,
      metrics,
    };
  }

  /**
   * Build comparison matrix for visualization
   */
  private buildComparisonMatrix(capabilities: ComparisonCapability[]): ComparisonMatrix {
    const metrics = [
      'accuracy',
      'false_positive_rate',
      'detections',
      'avg_inference_time_ms',
      'active_cameras',
      'cost_avoided',
    ];

    const values = capabilities.map((cap) => [
      cap.metrics.accuracy,
      cap.metrics.false_positive_rate,
      cap.metrics.detections,
      cap.metrics.avg_inference_time_ms,
      cap.metrics.active_cameras,
      cap.metrics.cost_avoided,
    ]);

    return { metrics, values };
  }

  /**
   * Generate intelligent insights from comparison
   */
  private generateInsights(capabilities: ComparisonCapability[]): ComparisonInsight[] {
    const insights: ComparisonInsight[] = [];

    // Find best performer by accuracy
    const bestAccuracy = capabilities.reduce((best, current) =>
      current.metrics.accuracy > best.metrics.accuracy ? current : best,
    );
    insights.push({
      type: 'best_performer',
      capability_type: bestAccuracy.capability_type,
      metric: 'accuracy',
      value: bestAccuracy.metrics.accuracy,
      description: `${bestAccuracy.display_name} has the highest accuracy at ${bestAccuracy.metrics.accuracy.toFixed(1)}%`,
      priority: 'high',
    });

    // Find capability with lowest FP rate
    const lowestFP = capabilities.reduce((best, current) =>
      current.metrics.false_positive_rate < best.metrics.false_positive_rate ? current : best,
    );
    if (lowestFP.metrics.false_positive_rate < 2.0) {
      insights.push({
        type: 'best_performer',
        capability_type: lowestFP.capability_type,
        metric: 'false_positive_rate',
        value: lowestFP.metrics.false_positive_rate,
        description: `${lowestFP.display_name} has excellent false positive rate at ${lowestFP.metrics.false_positive_rate.toFixed(1)}%`,
        priority: 'medium',
      });
    }

    // Find fastest capability
    const fastest = capabilities.reduce((best, current) =>
      current.metrics.avg_inference_time_ms < best.metrics.avg_inference_time_ms ? current : best,
    );
    insights.push({
      type: 'best_performer',
      capability_type: fastest.capability_type,
      metric: 'inference_time',
      value: fastest.metrics.avg_inference_time_ms,
      description: `${fastest.display_name} is the fastest with ${fastest.metrics.avg_inference_time_ms.toFixed(0)}ms average inference time`,
      priority: 'medium',
    });

    // Identify capabilities needing improvement
    capabilities.forEach((cap) => {
      if (cap.metrics.accuracy < 85 && cap.metrics.accuracy > 0) {
        insights.push({
          type: 'needs_improvement',
          capability_type: cap.capability_type,
          metric: 'accuracy',
          value: cap.metrics.accuracy,
          description: `${cap.display_name} accuracy (${cap.metrics.accuracy.toFixed(1)}%) is below 85% threshold and needs attention`,
          priority: 'high',
        });
      }

      if (cap.metrics.false_positive_rate > 8.0) {
        insights.push({
          type: 'needs_improvement',
          capability_type: cap.capability_type,
          metric: 'false_positive_rate',
          value: cap.metrics.false_positive_rate,
          description: `${cap.display_name} has high false positive rate (${cap.metrics.false_positive_rate.toFixed(1)}%) - consider model retraining`,
          priority: 'high',
        });
      }

      if (cap.metrics.avg_inference_time_ms > 100) {
        insights.push({
          type: 'recommendation',
          capability_type: cap.capability_type,
          metric: 'inference_time',
          value: cap.metrics.avg_inference_time_ms,
          description: `${cap.display_name} inference time (${cap.metrics.avg_inference_time_ms.toFixed(0)}ms) could be optimized for better real-time performance`,
          priority: 'medium',
        });
      }
    });

    // Compare accuracy variance
    const accuracies = capabilities.map((c) => c.metrics.accuracy).filter((a) => a > 0);
    if (accuracies.length > 1) {
      const maxAccuracy = Math.max(...accuracies);
      const minAccuracy = Math.min(...accuracies);
      const variance = maxAccuracy - minAccuracy;

      if (variance > 10) {
        insights.push({
          type: 'observation',
          capability_type: '',
          metric: 'accuracy_variance',
          value: variance,
          description: `Significant accuracy variance (${variance.toFixed(1)}%) between capabilities suggests some may need model improvements`,
          priority: 'medium',
        });
      }
    }

    // Compare deployment coverage
    const avgCameras =
      capabilities.reduce((sum, c) => sum + c.metrics.active_cameras, 0) / capabilities.length;
    capabilities.forEach((cap) => {
      if (cap.metrics.active_cameras < avgCameras * 0.5 && cap.metrics.active_cameras > 0) {
        insights.push({
          type: 'recommendation',
          capability_type: cap.capability_type,
          metric: 'deployment',
          value: cap.metrics.active_cameras,
          description: `${cap.display_name} is only deployed on ${cap.metrics.active_cameras} cameras - consider expanding deployment`,
          priority: 'low',
        });
      }
    });

    // Sort by priority
    return insights.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }

  /**
   * Calculate rankings for different metrics
   */
  private calculateRankings(capabilities: ComparisonCapability[]): ComparisonRankings {
    const rankByMetric = (metricGetter: (c: ComparisonCapability) => number, ascending = false) => {
      const sorted = [...capabilities].sort((a, b) => {
        const aVal = metricGetter(a);
        const bVal = metricGetter(b);
        return ascending ? aVal - bVal : bVal - aVal;
      });

      return sorted.map((cap, index) => ({
        capability_type: cap.capability_type,
        display_name: cap.display_name,
        value: metricGetter(cap),
        rank: index + 1,
      }));
    };

    return {
      by_accuracy: rankByMetric((c) => c.metrics.accuracy),
      by_speed: rankByMetric((c) => c.metrics.avg_inference_time_ms, true), // Lower is better
      by_volume: rankByMetric((c) => c.metrics.detections),
      by_cost_avoided: rankByMetric((c) => c.metrics.cost_avoided),
    };
  }

  /**
   * Generate comparison summary
   */
  private generateSummary(
    capabilities: ComparisonCapability[],
    rankings: ComparisonRankings,
  ): ComparisonResult['summary'] {
    return {
      best_overall: rankings.by_accuracy[0]?.display_name || 'N/A',
      fastest: rankings.by_speed[0]?.display_name || 'N/A',
      most_accurate: rankings.by_accuracy[0]?.display_name || 'N/A',
      highest_impact: rankings.by_cost_avoided[0]?.display_name || 'N/A',
    };
  }

  /**
   * Determine status based on accuracy and FP rate
   */
  private determineStatus(
    accuracy: number,
    fpRate: number,
  ): 'excellent' | 'good' | 'fair' | 'needs_attention' {
    if (accuracy >= 95 && fpRate <= 2) return 'excellent';
    if (accuracy >= 90 && fpRate <= 4) return 'good';
    if (accuracy >= 85 && fpRate <= 6) return 'fair';
    return 'needs_attention';
  }

  /**
   * Get list of all capabilities with basic stats for selection UI
   */
  async getCapabilityList(
    tenantId: string,
    domain?: string,
    stage?: string,
    minAccuracy?: number,
    search?: string,
  ): Promise<any> {
    // Filter capabilities from catalog
    let capabilities = [...AI_CAPABILITIES];

    if (domain) {
      capabilities = capabilities.filter((c) => c.domainId === domain);
    }

    if (stage) {
      capabilities = capabilities.filter((c) => c.stage === stage);
    }

    if (search) {
      const searchLower = search.toLowerCase();
      capabilities = capabilities.filter(
        (c) =>
          c.name.toLowerCase().includes(searchLower) ||
          c.id.toLowerCase().includes(searchLower),
      );
    }

    // Group by domain
    const domainMap = new Map<string, any>();

    for (const cap of capabilities) {
      if (!domainMap.has(cap.domainId)) {
        domainMap.set(cap.domainId, {
          domain: cap.domainId,
          display_name: cap.domainName,
          capabilities_count: 0,
          capabilities: [],
        });
      }

      const domainData = domainMap.get(cap.domainId);

      // Try to get basic stats
      let stats;
      try {
        const result = await pool.query(
          `
          SELECT 
            AVG(accuracy_percent) as avg_accuracy,
            SUM(detections_count) as total_detections,
            COUNT(DISTINCT camera_id) > 0 as is_active
          FROM ai_capability_metrics
          WHERE tenant_id = $1 AND capability_type = $2
          GROUP BY capability_type
        `,
          [tenantId, cap.id],
        );

        if (result.rows.length > 0) {
          const row = result.rows[0];
          stats = {
            accuracy: parseFloat(row.avg_accuracy || 0),
            detections: parseInt(row.total_detections || 0),
            active: row.is_active === true,
          };
        }
      } catch (error) {
        // Metrics table doesn't exist yet
        stats = { accuracy: 0, detections: 0, active: false };
      }

      // Apply accuracy filter
      const finalStats = stats || { accuracy: 0, detections: 0, active: false };
      if (minAccuracy && finalStats.accuracy > 0 && finalStats.accuracy < minAccuracy) {
        continue;
      }

      domainData.capabilities.push({
        capability_type: cap.id,
        display_name: cap.name,
        stage: cap.stage,
        ...finalStats,
      });

      domainData.capabilities_count++;
    }

    return {
      total: capabilities.length,
      domains: Array.from(domainMap.values()),
    };
  }
}

export const aiComparisonService = new AiComparisonService();
