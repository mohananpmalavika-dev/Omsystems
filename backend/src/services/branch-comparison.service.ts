/**
 * Branch Comparison and Ranking Service
 * Comparative analytics and benchmarking across branches
 */

import { Pool } from 'pg';

export interface BranchRanking {
  branchId: string;
  branchName: string;
  branchCode: string;
  region?: string;
  rank: number;
  percentile: number;
  score: number;
  status: string;
  metrics: {
    cameras: number;
    availability: number;
    incidents: number;
    mttr: number; // Mean time to resolution
  };
}

export interface ComparisonMetrics {
  metric: string;
  branchValue: number;
  regionalAverage: number;
  nationalAverage: number;
  bestInRegion: number;
  bestNational: number;
  percentile: number;
  trend: 'above_average' | 'average' | 'below_average';
}

export interface BranchComparison {
  branchId: string;
  branchName: string;
  branchCode: string;
  region: string;
  overallRank: number;
  overallPercentile: number;
  comparisons: ComparisonMetrics[];
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
}

export class BranchComparisonService {
  constructor(private pool: Pool) {}

  /**
   * Get branch rankings across tenant
   */
  async getBranchRankings(
    tenantId: string,
    filters?: {
      region?: string;
      metric?: 'health' | 'availability' | 'incidents' | 'mttr';
      limit?: number;
      offset?: number;
    }
  ): Promise<{ rankings: BranchRanking[]; total: number }> {
    const limit = filters?.limit || 100;
    const offset = filters?.offset || 0;
    const metric = filters?.metric || 'health';

    let orderBy = 'bhs.overall_score DESC';
    if (metric === 'availability') {
      orderBy = 'camera_availability DESC';
    } else if (metric === 'incidents') {
      orderBy = 'incident_count ASC';
    } else if (metric === 'mttr') {
      orderBy = 'avg_mttr ASC';
    }

    const regionFilter = filters?.region ? 'AND b.region = $2' : '';
    const params: any[] = [tenantId];
    let paramIndex = 2;
    
    if (filters?.region) {
      params.push(filters.region);
      paramIndex++;
    }

    const query = `
      WITH branch_metrics AS (
        SELECT 
          b.id,
          b.name,
          b.code,
          b.region,
          bhs.overall_score,
          bhs.overall_status,
          COUNT(DISTINCT c.id) as camera_count,
          COUNT(DISTINCT c.id) FILTER (WHERE c.online_status = 'online') as online_cameras,
          COUNT(DISTINCT c.id) FILTER (WHERE c.online_status = 'online')::float / 
            NULLIF(COUNT(DISTINCT c.id), 0) * 100 as camera_availability,
          COUNT(DISTINCT i.id) FILTER (
            WHERE i.occurred_at >= NOW() - INTERVAL '30 days'
          ) as incident_count,
          AVG(
            EXTRACT(EPOCH FROM (i.resolved_at - i.occurred_at)) / 60
          ) FILTER (
            WHERE i.resolved_at IS NOT NULL 
            AND i.occurred_at >= NOW() - INTERVAL '30 days'
          ) as avg_mttr
        FROM branches b
        LEFT JOIN LATERAL (
          SELECT overall_score, overall_status
          FROM branch_health_scores
          WHERE branch_id = b.id
          ORDER BY calculated_at DESC
          LIMIT 1
        ) bhs ON true
        LEFT JOIN cameras c ON c.branch_id = b.id AND c.status = 'active'
        LEFT JOIN incidents i ON i.branch_node_id = b.id
        WHERE b.tenant_id = $1
          AND b.status = 'active'
          ${regionFilter}
        GROUP BY b.id, b.name, b.code, b.region, bhs.overall_score, bhs.overall_status
      ),
      ranked_branches AS (
        SELECT 
          *,
          ROW_NUMBER() OVER (ORDER BY ${orderBy}) as rank,
          PERCENT_RANK() OVER (ORDER BY ${orderBy}) * 100 as percentile
        FROM branch_metrics
      )
      SELECT * FROM ranked_branches
      ORDER BY rank
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(limit, offset);
    const result = await this.pool.query(query, params);

    const countQuery = `
      SELECT COUNT(*) as total
      FROM branches b
      WHERE b.tenant_id = $1
        AND b.status = 'active'
        ${regionFilter}
    `;
    const countResult = await this.pool.query(countQuery, 
      filters?.region ? [tenantId, filters.region] : [tenantId]
    );

    const rankings: BranchRanking[] = result.rows.map(row => ({
      branchId: row.id,
      branchName: row.name,
      branchCode: row.code,
      region: row.region,
      rank: parseInt(row.rank),
      percentile: Math.round(parseFloat(row.percentile) || 0),
      score: parseFloat(row.overall_score) || 0,
      status: row.overall_status || 'unknown',
      metrics: {
        cameras: parseInt(row.camera_count) || 0,
        availability: parseFloat(row.camera_availability) || 0,
        incidents: parseInt(row.incident_count) || 0,
        mttr: parseFloat(row.avg_mttr) || 0
      }
    }));

    return {
      rankings,
      total: parseInt(countResult.rows[0].total) || 0
    };
  }

  /**
   * Get detailed comparison for a specific branch
   */
  async getDetailedComparison(
    tenantId: string,
    branchId: string
  ): Promise<BranchComparison | null> {
    // Get branch info
    const branchQuery = `
      SELECT id, name, code, region
      FROM branches
      WHERE id = $1 AND tenant_id = $2
    `;
    const branchResult = await this.pool.query(branchQuery, [branchId, tenantId]);
    
    if (branchResult.rows.length === 0) {
      return null;
    }

    const branch = branchResult.rows[0];

    // Get branch metrics
    const metricsQuery = `
      SELECT 
        -- Health
        bhs.overall_score as health_score,
        
        -- Camera availability
        COUNT(DISTINCT c.id) FILTER (WHERE c.online_status = 'online')::float / 
          NULLIF(COUNT(DISTINCT c.id), 0) * 100 as camera_availability,
        
        -- Recording availability
        AVG(rs.availability_percentage) as recording_availability,
        
        -- Storage utilization
        AVG(ss.usage_percent) as storage_usage,
        
        -- Network quality
        AVG(nh.latency_ms) as avg_latency,
        AVG(nh.packet_loss_percent) as avg_packet_loss,
        
        -- Incidents
        COUNT(DISTINCT i.id) FILTER (
          WHERE i.occurred_at >= NOW() - INTERVAL '30 days'
        ) as incident_count_30d,
        
        -- MTTR
        AVG(
          EXTRACT(EPOCH FROM (i.resolved_at - i.occurred_at)) / 60
        ) FILTER (
          WHERE i.resolved_at IS NOT NULL 
          AND i.occurred_at >= NOW() - INTERVAL '30 days'
        ) as mttr_minutes,
        
        -- Alert response time
        AVG(
          EXTRACT(EPOCH FROM (oa.acknowledged_at - oa.detected_at)) / 60
        ) FILTER (
          WHERE oa.acknowledged_at IS NOT NULL
          AND oa.detected_at >= NOW() - INTERVAL '30 days'
        ) as avg_alert_response_minutes,
        
        -- Uptime
        AVG(ea.uptime_seconds) / 3600 as edge_agent_uptime_hours
        
      FROM branches b
      LEFT JOIN LATERAL (
        SELECT overall_score
        FROM branch_health_scores
        WHERE branch_id = b.id
        ORDER BY calculated_at DESC
        LIMIT 1
      ) bhs ON true
      LEFT JOIN cameras c ON c.branch_id = b.id AND c.status = 'active'
      LEFT JOIN LATERAL (
        SELECT availability_percentage
        FROM recording_status_daily
        WHERE camera_id = c.id
          AND summary_date = CURRENT_DATE
        ORDER BY summary_date DESC
        LIMIT 1
      ) rs ON true
      LEFT JOIN storage_status ss ON ss.branch_id = b.id
      LEFT JOIN network_health nh ON nh.branch_id = b.id
      LEFT JOIN incidents i ON i.branch_node_id = b.id
      LEFT JOIN operational_alerts oa ON oa.branch_id = b.id
      LEFT JOIN edge_agents ea ON ea.branch_id = b.id
      WHERE b.id = $1
      GROUP BY b.id, bhs.overall_score
    `;

    const metricsResult = await this.pool.query(metricsQuery, [branchId]);
    const metrics = metricsResult.rows[0];

    // Get regional and national benchmarks
    const benchmarkQuery = `
      WITH all_branch_metrics AS (
        SELECT 
          b.id,
          b.region,
          bhs.overall_score as health_score,
          COUNT(DISTINCT c.id) FILTER (WHERE c.online_status = 'online')::float / 
            NULLIF(COUNT(DISTINCT c.id), 0) * 100 as camera_availability,
          AVG(rs.availability_percentage) as recording_availability,
          AVG(ss.usage_percent) as storage_usage,
          AVG(nh.latency_ms) as avg_latency,
          AVG(nh.packet_loss_percent) as avg_packet_loss,
          COUNT(DISTINCT i.id) FILTER (
            WHERE i.occurred_at >= NOW() - INTERVAL '30 days'
          ) as incident_count_30d,
          AVG(
            EXTRACT(EPOCH FROM (i.resolved_at - i.occurred_at)) / 60
          ) FILTER (
            WHERE i.resolved_at IS NOT NULL 
            AND i.occurred_at >= NOW() - INTERVAL '30 days'
          ) as mttr_minutes,
          AVG(
            EXTRACT(EPOCH FROM (oa.acknowledged_at - oa.detected_at)) / 60
          ) FILTER (
            WHERE oa.acknowledged_at IS NOT NULL
            AND oa.detected_at >= NOW() - INTERVAL '30 days'
          ) as avg_alert_response_minutes
        FROM branches b
        LEFT JOIN LATERAL (
          SELECT overall_score
          FROM branch_health_scores
          WHERE branch_id = b.id
          ORDER BY calculated_at DESC
          LIMIT 1
        ) bhs ON true
        LEFT JOIN cameras c ON c.branch_id = b.id AND c.status = 'active'
        LEFT JOIN LATERAL (
          SELECT availability_percentage
          FROM recording_status_daily
          WHERE camera_id = c.id AND summary_date = CURRENT_DATE
          ORDER BY summary_date DESC
          LIMIT 1
        ) rs ON true
        LEFT JOIN storage_status ss ON ss.branch_id = b.id
        LEFT JOIN network_health nh ON nh.branch_id = b.id
        LEFT JOIN incidents i ON i.branch_node_id = b.id
        LEFT JOIN operational_alerts oa ON oa.branch_id = b.id
        WHERE b.tenant_id = $1
          AND b.status = 'active'
        GROUP BY b.id, b.region, bhs.overall_score
      )
      SELECT 
        -- Regional stats
        AVG(health_score) FILTER (WHERE region = $2) as regional_avg_health,
        AVG(camera_availability) FILTER (WHERE region = $2) as regional_avg_camera_availability,
        AVG(recording_availability) FILTER (WHERE region = $2) as regional_avg_recording_availability,
        AVG(storage_usage) FILTER (WHERE region = $2) as regional_avg_storage_usage,
        AVG(avg_latency) FILTER (WHERE region = $2) as regional_avg_latency,
        AVG(incident_count_30d) FILTER (WHERE region = $2) as regional_avg_incidents,
        AVG(mttr_minutes) FILTER (WHERE region = $2) as regional_avg_mttr,
        AVG(avg_alert_response_minutes) FILTER (WHERE region = $2) as regional_avg_alert_response,
        
        -- Regional best
        MAX(health_score) FILTER (WHERE region = $2) as regional_best_health,
        MAX(camera_availability) FILTER (WHERE region = $2) as regional_best_camera_availability,
        MAX(recording_availability) FILTER (WHERE region = $2) as regional_best_recording_availability,
        MIN(storage_usage) FILTER (WHERE region = $2) as regional_best_storage_usage,
        MIN(avg_latency) FILTER (WHERE region = $2) as regional_best_latency,
        MIN(incident_count_30d) FILTER (WHERE region = $2) as regional_best_incidents,
        MIN(mttr_minutes) FILTER (WHERE region = $2) as regional_best_mttr,
        MIN(avg_alert_response_minutes) FILTER (WHERE region = $2) as regional_best_alert_response,
        
        -- National stats
        AVG(health_score) as national_avg_health,
        AVG(camera_availability) as national_avg_camera_availability,
        AVG(recording_availability) as national_avg_recording_availability,
        AVG(storage_usage) as national_avg_storage_usage,
        AVG(avg_latency) as national_avg_latency,
        AVG(incident_count_30d) as national_avg_incidents,
        AVG(mttr_minutes) as national_avg_mttr,
        AVG(avg_alert_response_minutes) as national_avg_alert_response,
        
        -- National best
        MAX(health_score) as national_best_health,
        MAX(camera_availability) as national_best_camera_availability,
        MAX(recording_availability) as national_best_recording_availability,
        MIN(storage_usage) as national_best_storage_usage,
        MIN(avg_latency) as national_best_latency,
        MIN(incident_count_30d) as national_best_incidents,
        MIN(mttr_minutes) as national_best_mttr,
        MIN(avg_alert_response_minutes) as national_best_alert_response
        
      FROM all_branch_metrics
    `;

    const benchmarkResult = await this.pool.query(benchmarkQuery, [tenantId, branch.region]);
    const benchmarks = benchmarkResult.rows[0];

    // Build comparison metrics
    const comparisons: ComparisonMetrics[] = [
      {
        metric: 'Overall Health Score',
        branchValue: parseFloat(metrics.health_score) || 0,
        regionalAverage: parseFloat(benchmarks.regional_avg_health) || 0,
        nationalAverage: parseFloat(benchmarks.national_avg_health) || 0,
        bestInRegion: parseFloat(benchmarks.regional_best_health) || 0,
        bestNational: parseFloat(benchmarks.national_best_health) || 0,
        percentile: 0,
        trend: 'average'
      },
      {
        metric: 'Camera Availability %',
        branchValue: parseFloat(metrics.camera_availability) || 0,
        regionalAverage: parseFloat(benchmarks.regional_avg_camera_availability) || 0,
        nationalAverage: parseFloat(benchmarks.national_avg_camera_availability) || 0,
        bestInRegion: parseFloat(benchmarks.regional_best_camera_availability) || 0,
        bestNational: parseFloat(benchmarks.national_best_camera_availability) || 0,
        percentile: 0,
        trend: 'average'
      },
      {
        metric: 'Recording Availability %',
        branchValue: parseFloat(metrics.recording_availability) || 0,
        regionalAverage: parseFloat(benchmarks.regional_avg_recording_availability) || 0,
        nationalAverage: parseFloat(benchmarks.national_avg_recording_availability) || 0,
        bestInRegion: parseFloat(benchmarks.regional_best_recording_availability) || 0,
        bestNational: parseFloat(benchmarks.national_best_recording_availability) || 0,
        percentile: 0,
        trend: 'average'
      },
      {
        metric: 'Storage Usage %',
        branchValue: parseFloat(metrics.storage_usage) || 0,
        regionalAverage: parseFloat(benchmarks.regional_avg_storage_usage) || 0,
        nationalAverage: parseFloat(benchmarks.national_avg_storage_usage) || 0,
        bestInRegion: parseFloat(benchmarks.regional_best_storage_usage) || 100,
        bestNational: parseFloat(benchmarks.national_best_storage_usage) || 100,
        percentile: 0,
        trend: 'average'
      },
      {
        metric: 'Network Latency (ms)',
        branchValue: parseFloat(metrics.avg_latency) || 0,
        regionalAverage: parseFloat(benchmarks.regional_avg_latency) || 0,
        nationalAverage: parseFloat(benchmarks.national_avg_latency) || 0,
        bestInRegion: parseFloat(benchmarks.regional_best_latency) || 0,
        bestNational: parseFloat(benchmarks.national_best_latency) || 0,
        percentile: 0,
        trend: 'average'
      },
      {
        metric: 'Incidents (30 days)',
        branchValue: parseFloat(metrics.incident_count_30d) || 0,
        regionalAverage: parseFloat(benchmarks.regional_avg_incidents) || 0,
        nationalAverage: parseFloat(benchmarks.national_avg_incidents) || 0,
        bestInRegion: parseFloat(benchmarks.regional_best_incidents) || 0,
        bestNational: parseFloat(benchmarks.national_best_incidents) || 0,
        percentile: 0,
        trend: 'average'
      },
      {
        metric: 'MTTR (minutes)',
        branchValue: parseFloat(metrics.mttr_minutes) || 0,
        regionalAverage: parseFloat(benchmarks.regional_avg_mttr) || 0,
        nationalAverage: parseFloat(benchmarks.national_avg_mttr) || 0,
        bestInRegion: parseFloat(benchmarks.regional_best_mttr) || 0,
        bestNational: parseFloat(benchmarks.national_best_mttr) || 0,
        percentile: 0,
        trend: 'average'
      },
      {
        metric: 'Alert Response Time (minutes)',
        branchValue: parseFloat(metrics.avg_alert_response_minutes) || 0,
        regionalAverage: parseFloat(benchmarks.regional_avg_alert_response) || 0,
        nationalAverage: parseFloat(benchmarks.national_avg_alert_response) || 0,
        bestInRegion: parseFloat(benchmarks.regional_best_alert_response) || 0,
        bestNational: parseFloat(benchmarks.national_best_alert_response) || 0,
        percentile: 0,
        trend: 'average'
      }
    ];

    // Calculate trends
    comparisons.forEach(comp => {
      if (comp.metric.includes('Usage') || comp.metric.includes('Latency') || 
          comp.metric.includes('Incidents') || comp.metric.includes('Time')) {
        // Lower is better
        if (comp.branchValue < comp.regionalAverage * 0.9) {
          comp.trend = 'above_average';
        } else if (comp.branchValue > comp.regionalAverage * 1.1) {
          comp.trend = 'below_average';
        }
      } else {
        // Higher is better
        if (comp.branchValue > comp.regionalAverage * 1.1) {
          comp.trend = 'above_average';
        } else if (comp.branchValue < comp.regionalAverage * 0.9) {
          comp.trend = 'below_average';
        }
      }
    });

    // Identify strengths and weaknesses
    const strengths: string[] = [];
    const weaknesses: string[] = [];
    const recommendations: string[] = [];

    comparisons.forEach(comp => {
      if (comp.trend === 'above_average') {
        strengths.push(`${comp.metric}: ${comp.branchValue.toFixed(1)} (${((comp.branchValue / comp.regionalAverage - 1) * 100).toFixed(0)}% above regional average)`);
      } else if (comp.trend === 'below_average') {
        weaknesses.push(`${comp.metric}: ${comp.branchValue.toFixed(1)} (${((1 - comp.branchValue / comp.regionalAverage) * 100).toFixed(0)}% below regional average)`);
        
        // Generate recommendations
        if (comp.metric.includes('Health')) {
          recommendations.push('Review component health scores and address critical issues');
        } else if (comp.metric.includes('Camera Availability')) {
          recommendations.push('Investigate offline cameras and network connectivity');
        } else if (comp.metric.includes('Recording')) {
          recommendations.push('Check storage capacity and recording job status');
        } else if (comp.metric.includes('Storage')) {
          recommendations.push('Implement storage cleanup policies or expand capacity');
        } else if (comp.metric.includes('Latency')) {
          recommendations.push('Optimize network configuration and bandwidth allocation');
        } else if (comp.metric.includes('Incidents')) {
          recommendations.push('Review security protocols and preventive measures');
        } else if (comp.metric.includes('MTTR')) {
          recommendations.push('Streamline incident response procedures and training');
        } else if (comp.metric.includes('Alert Response')) {
          recommendations.push('Improve alert routing and operator assignment rules');
        }
      }
    });

    // Get overall ranking
    const rankQuery = `
      WITH branch_scores AS (
        SELECT 
          b.id,
          bhs.overall_score
        FROM branches b
        LEFT JOIN LATERAL (
          SELECT overall_score
          FROM branch_health_scores
          WHERE branch_id = b.id
          ORDER BY calculated_at DESC
          LIMIT 1
        ) bhs ON true
        WHERE b.tenant_id = $1
          AND b.status = 'active'
      ),
      ranked AS (
        SELECT 
          id,
          ROW_NUMBER() OVER (ORDER BY overall_score DESC) as rank,
          PERCENT_RANK() OVER (ORDER BY overall_score DESC) * 100 as percentile
        FROM branch_scores
      )
      SELECT rank, percentile
      FROM ranked
      WHERE id = $2
    `;

    const rankResult = await this.pool.query(rankQuery, [tenantId, branchId]);
    const ranking = rankResult.rows[0] || { rank: 0, percentile: 0 };

    return {
      branchId: branch.id,
      branchName: branch.name,
      branchCode: branch.code,
      region: branch.region,
      overallRank: parseInt(ranking.rank) || 0,
      overallPercentile: Math.round(parseFloat(ranking.percentile) || 0),
      comparisons,
      strengths,
      weaknesses,
      recommendations
    };
  }

  /**
   * Get peer group comparison (branches with similar characteristics)
   */
  async getPeerGroupComparison(
    tenantId: string,
    branchId: string
  ): Promise<{
    branch: BranchRanking;
    peerGroup: BranchRanking[];
    peerAverage: {
      healthScore: number;
      availability: number;
      incidents: number;
      mttr: number;
    };
  } | null> {
    // Get branch characteristics
    const branchQuery = `
      SELECT 
        b.id,
        b.name,
        b.code,
        b.region,
        COUNT(c.id) as camera_count,
        bhs.overall_score
      FROM branches b
      LEFT JOIN cameras c ON c.branch_id = b.id AND c.status = 'active'
      LEFT JOIN LATERAL (
        SELECT overall_score
        FROM branch_health_scores
        WHERE branch_id = b.id
        ORDER BY calculated_at DESC
        LIMIT 1
      ) bhs ON true
      WHERE b.id = $1 AND b.tenant_id = $2
      GROUP BY b.id, b.name, b.code, b.region, bhs.overall_score
    `;

    const branchResult = await this.pool.query(branchQuery, [branchId, tenantId]);
    
    if (branchResult.rows.length === 0) {
      return null;
    }

    const targetBranch = branchResult.rows[0];
    const cameraCount = parseInt(targetBranch.camera_count);

    // Find peer branches (similar camera count, same region)
    const peerQuery = `
      WITH branch_metrics AS (
        SELECT 
          b.id,
          b.name,
          b.code,
          b.region,
          bhs.overall_score,
          bhs.overall_status,
          COUNT(c.id) as camera_count,
          COUNT(c.id) FILTER (WHERE c.online_status = 'online')::float / 
            NULLIF(COUNT(c.id), 0) * 100 as camera_availability,
          COUNT(i.id) FILTER (
            WHERE i.occurred_at >= NOW() - INTERVAL '30 days'
          ) as incident_count,
          AVG(
            EXTRACT(EPOCH FROM (i.resolved_at - i.occurred_at)) / 60
          ) FILTER (
            WHERE i.resolved_at IS NOT NULL 
            AND i.occurred_at >= NOW() - INTERVAL '30 days'
          ) as avg_mttr
        FROM branches b
        LEFT JOIN LATERAL (
          SELECT overall_score, overall_status
          FROM branch_health_scores
          WHERE branch_id = b.id
          ORDER BY calculated_at DESC
          LIMIT 1
        ) bhs ON true
        LEFT JOIN cameras c ON c.branch_id = b.id AND c.status = 'active'
        LEFT JOIN incidents i ON i.branch_node_id = b.id
        WHERE b.tenant_id = $1
          AND b.status = 'active'
          AND b.region = $2
          AND b.id != $3
        GROUP BY b.id, b.name, b.code, b.region, bhs.overall_score, bhs.overall_status
        HAVING COUNT(c.id) BETWEEN $4 AND $5
      ),
      ranked AS (
        SELECT 
          *,
          ROW_NUMBER() OVER (ORDER BY overall_score DESC) as rank
        FROM branch_metrics
      )
      SELECT * FROM ranked
      ORDER BY rank
      LIMIT 10
    `;

    const peerResult = await this.pool.query(peerQuery, [
      tenantId,
      targetBranch.region,
      branchId,
      Math.max(1, cameraCount - 5),
      cameraCount + 5
    ]);

    const peerGroup: BranchRanking[] = peerResult.rows.map((row, index) => ({
      branchId: row.id,
      branchName: row.name,
      branchCode: row.code,
      region: row.region,
      rank: index + 1,
      percentile: 0,
      score: parseFloat(row.overall_score) || 0,
      status: row.overall_status || 'unknown',
      metrics: {
        cameras: parseInt(row.camera_count) || 0,
        availability: parseFloat(row.camera_availability) || 0,
        incidents: parseInt(row.incident_count) || 0,
        mttr: parseFloat(row.avg_mttr) || 0
      }
    }));

    // Calculate peer averages
    const peerAverage = {
      healthScore: peerGroup.reduce((sum, p) => sum + p.score, 0) / peerGroup.length || 0,
      availability: peerGroup.reduce((sum, p) => sum + p.metrics.availability, 0) / peerGroup.length || 0,
      incidents: peerGroup.reduce((sum, p) => sum + p.metrics.incidents, 0) / peerGroup.length || 0,
      mttr: peerGroup.reduce((sum, p) => sum + p.metrics.mttr, 0) / peerGroup.length || 0
    };

    // Add target branch to result
    const targetRanking: BranchRanking = {
      branchId: targetBranch.id,
      branchName: targetBranch.name,
      branchCode: targetBranch.code,
      region: targetBranch.region,
      rank: 0,
      percentile: 0,
      score: parseFloat(targetBranch.overall_score) || 0,
      status: 'unknown',
      metrics: {
        cameras: cameraCount,
        availability: 0,
        incidents: 0,
        mttr: 0
      }
    };

    return {
      branch: targetRanking,
      peerGroup,
      peerAverage
    };
  }
}
