// @ts-nocheck
/**
 * Branch Performance Benchmarking Routes
 * 
 * Provides comparative analysis across branches to identify:
 * - Best and worst performers
 * - Security metrics comparison
 * - Operational efficiency benchmarks
 * - Cost efficiency analysis
 * - Improvement opportunities
 */

import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { authenticateToken } from '../../middleware/auth.middleware.js';
import { requirePermission } from '../../middleware/require-permission.middleware.js';

export function createBranchBenchmarkingRoutes(pool: Pool): Router {
  const router = Router();

  /**
   * GET /api/control/v1/reports/branch-benchmarking
   * 
   * Get comprehensive branch performance comparison
   * Query params:
   * - period: 7d | 30d | 90d | 12m (default: 30d)
   * - metric: security | operations | cost | overall (default: overall)
   */
  router.get('/branch-benchmarking', authenticateToken, requirePermission('reports:view'), async (req: Request, res: Response) => {
    try {
      const tenantId = req.user?.tenantId;
      if (!tenantId) {
        return res.status(400).json({ error: 'Tenant ID required' });
      }

      const period = (req.query.period as string) || '30d';
      const metric = (req.query.metric as string) || 'overall';

      const { start, end } = getPeriodDates(period);

      // Get all branches with their metrics
      const branches = await calculateBranchMetrics(pool, tenantId, start, end);

      if (branches.length === 0) {
        return res.json({
          success: true,
          data: {
            period,
            metric,
            dateRange: { start: start.toISOString(), end: end.toISOString() },
            branches: [],
            summary: {
              totalBranches: 0,
              avgScore: 0,
              topPerformer: null,
              needsImprovement: []
            }
          }
        });
      }

      // Calculate overall scores
      const branchesWithScores = branches.map(branch => ({
        ...branch,
        overallScore: calculateOverallScore(branch),
        securityScore: calculateSecurityScore(branch),
        operationsScore: calculateOperationsScore(branch),
        costScore: calculateCostScore(branch, branches)
      }));

      // Sort by selected metric
      const sortedBranches = sortBranchesByMetric(branchesWithScores, metric);

      // Calculate statistics
      const avgScore = sortedBranches.reduce((sum, b) => sum + b.overallScore, 0) / sortedBranches.length;
      const topPerformer = sortedBranches[0];
      const needsImprovement = sortedBranches.filter(b => b.overallScore < avgScore * 0.8);

      // Generate insights
      const insights = generateBranchInsights(sortedBranches, avgScore);

      // Generate recommendations
      const recommendations = generateBranchRecommendations(sortedBranches, avgScore);

      const report = {
        period,
        metric,
        dateRange: { start: start.toISOString(), end: end.toISOString() },
        generatedAt: new Date().toISOString(),

        summary: {
          totalBranches: branches.length,
          avgScore: Math.round(avgScore),
          topPerformer: {
            branch: topPerformer.branch,
            score: topPerformer.overallScore,
            highlights: getTopPerformerHighlights(topPerformer)
          },
          needsImprovement: needsImprovement.map(b => ({
            branch: b.branch,
            score: b.overallScore,
            issues: identifyIssues(b, avgScore)
          }))
        },

        branches: sortedBranches.map(b => ({
          branch: b.branch,
          rank: sortedBranches.indexOf(b) + 1,
          scores: {
            overall: b.overallScore,
            security: b.securityScore,
            operations: b.operationsScore,
            cost: b.costScore
          },
          metrics: {
            incidents: b.incidentCount,
            criticalIncidents: b.criticalCount,
            cameras: b.cameraCount,
            uptime: b.uptime,
            responseTime: b.avgResponseTime,
            cost: b.totalCost
          },
          status: getPerformanceStatus(b.overallScore, avgScore),
          percentile: calculatePercentile(b.overallScore, sortedBranches.map(x => x.overallScore))
        })),

        comparison: {
          security: calculateCategoryComparison(sortedBranches, 'securityScore'),
          operations: calculateCategoryComparison(sortedBranches, 'operationsScore'),
          cost: calculateCategoryComparison(sortedBranches, 'costScore')
        },

        insights,
        recommendations
      };

      res.json({
        success: true,
        data: report
      });

    } catch (error) {
      console.error('[BranchBenchmarking] Error generating report:', error);
      res.status(500).json({
        error: 'Failed to generate benchmarking report',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * GET /api/control/v1/reports/branch-benchmarking/:branchId
   * 
   * Get detailed analysis for a specific branch
   */
  router.get('/branch-benchmarking/:branchId', authenticateToken, requirePermission('reports:view'), async (req: Request, res: Response) => {
    try {
      const tenantId = req.user?.tenantId;
      const branchId = req.params.branchId;

      if (!tenantId) {
        return res.status(400).json({ error: 'Tenant ID required' });
      }

      const period = (req.query.period as string) || '30d';
      const { start, end } = getPeriodDates(period);

      // Get branch metrics
      const branches = await calculateBranchMetrics(pool, tenantId, start, end);
      const branch = branches.find(b => b.branch === branchId);

      if (!branch) {
        return res.status(404).json({ error: 'Branch not found' });
      }

      // Calculate scores
      const branchWithScores = {
        ...branch,
        overallScore: calculateOverallScore(branch),
        securityScore: calculateSecurityScore(branch),
        operationsScore: calculateOperationsScore(branch),
        costScore: calculateCostScore(branch, branches)
      };

      // Calculate peer comparison
      const avgMetrics = calculateAverageMetrics(branches);
      const peerComparison = compareToPeers(branchWithScores, avgMetrics);

      // Get historical trends
      const trends = await getBranchTrends(pool, tenantId, branchId, 6);

      // Generate improvement plan
      const improvementPlan = generateImprovementPlan(branchWithScores, avgMetrics);

      const report = {
        branch: branchId,
        period,
        dateRange: { start: start.toISOString(), end: end.toISOString() },
        generatedAt: new Date().toISOString(),

        scores: {
          overall: branchWithScores.overallScore,
          security: branchWithScores.securityScore,
          operations: branchWithScores.operationsScore,
          cost: branchWithScores.costScore
        },

        metrics: {
          incidents: branch.incidentCount,
          criticalIncidents: branch.criticalCount,
          cameras: branch.cameraCount,
          uptime: branch.uptime,
          responseTime: branch.avgResponseTime,
          cost: branch.totalCost
        },

        peerComparison,
        trends,
        improvementPlan
      };

      res.json({
        success: true,
        data: report
      });

    } catch (error) {
      console.error('[BranchBenchmarking] Error generating branch report:', error);
      res.status(500).json({
        error: 'Failed to generate branch report',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  return router;
}

// ========================
// Helper Functions
// ========================

function getPeriodDates(period: string): { start: Date; end: Date } {
  const end = new Date();
  const start = new Date();

  switch (period) {
    case '7d':
      start.setDate(end.getDate() - 7);
      break;
    case '30d':
      start.setDate(end.getDate() - 30);
      break;
    case '90d':
      start.setDate(end.getDate() - 90);
      break;
    case '12m':
      start.setFullYear(end.getFullYear() - 1);
      break;
    default:
      start.setDate(end.getDate() - 30);
  }

  return { start, end };
}

async function calculateBranchMetrics(
  pool: Pool,
  tenantId: string,
  start: Date,
  end: Date
): Promise<any[]> {
  // Get incident data by branch
  const incidents = await pool.query(
    `SELECT 
      COALESCE(location, 'Unknown') as branch,
      COUNT(*) as incident_count,
      COUNT(*) FILTER (WHERE severity = 'critical') as critical_count,
      AVG(EXTRACT(EPOCH FROM (COALESCE(acknowledged_at, NOW()) - detected_at))) as avg_response_time
     FROM incidents 
     WHERE tenant_id = $1 
       AND detected_at >= $2 
       AND detected_at < $3
     GROUP BY COALESCE(location, 'Unknown')`,
    [tenantId, start, end]
  );

  // Get camera data by branch
  const cameras = await pool.query(
    `SELECT 
      COALESCE(location, 'Unknown') as branch,
      COUNT(*) as camera_count,
      COUNT(*) FILTER (WHERE status = 'active') as active_cameras
     FROM cameras 
     WHERE tenant_id = $1
     GROUP BY COALESCE(location, 'Unknown')`,
    [tenantId]
  );

  // Combine data
  const branchMap = new Map<string, any>();

  incidents.rows.forEach(row => {
    branchMap.set(row.branch, {
      branch: row.branch,
      incidentCount: parseInt(row.incident_count, 10),
      criticalCount: parseInt(row.critical_count, 10),
      avgResponseTime: Math.round(parseFloat(row.avg_response_time || '0')),
      cameraCount: 0,
      activeCameras: 0,
      uptime: 0,
      totalCost: 0
    });
  });

  cameras.rows.forEach(row => {
    const branch = branchMap.get(row.branch) || {
      branch: row.branch,
      incidentCount: 0,
      criticalCount: 0,
      avgResponseTime: 0,
      cameraCount: 0,
      activeCameras: 0,
      uptime: 0,
      totalCost: 0
    };

    branch.cameraCount = parseInt(row.camera_count, 10);
    branch.activeCameras = parseInt(row.active_cameras, 10);
    branch.uptime = branch.cameraCount > 0 
      ? Math.round((branch.activeCameras / branch.cameraCount) * 100)
      : 0;

    branchMap.set(row.branch, branch);
  });

  // Estimate costs (would come from maintenance/cost tables in production)
  branchMap.forEach((branch, key) => {
    branch.totalCost = branch.incidentCount * 100 + branch.cameraCount * 50; // Simplified
    branchMap.set(key, branch);
  });

  return Array.from(branchMap.values());
}

function calculateOverallScore(branch: any): number {
  const securityScore = calculateSecurityScore(branch);
  const operationsScore = calculateOperationsScore(branch);
  const costScore = 75; // Simplified - would use calculateCostScore in production

  return Math.round((securityScore * 0.4 + operationsScore * 0.4 + costScore * 0.2));
}

function calculateSecurityScore(branch: any): number {
  // Lower incidents = higher score
  const incidentScore = Math.max(0, 100 - (branch.incidentCount / Math.max(1, branch.cameraCount) * 50));
  // No critical incidents = higher score
  const criticalScore = branch.criticalCount === 0 ? 100 : Math.max(0, 100 - branch.criticalCount * 20);
  // Fast response = higher score
  const responseScore = branch.avgResponseTime < 300 
    ? 100 
    : Math.max(0, 100 - ((branch.avgResponseTime - 300) / 60));

  return Math.round((incidentScore * 0.4 + criticalScore * 0.4 + responseScore * 0.2));
}

function calculateOperationsScore(branch: any): number {
  // High uptime = high score
  const uptimeScore = branch.uptime;
  // Good coverage = high score
  const coverageScore = branch.cameraCount > 0 ? 100 : 0;

  return Math.round((uptimeScore * 0.7 + coverageScore * 0.3));
}

function calculateCostScore(branch: any, allBranches: any[]): number {
  // Lower cost = higher score (compared to peers)
  const avgCost = allBranches.reduce((sum, b) => sum + b.totalCost, 0) / allBranches.length;
  const costRatio = branch.totalCost / avgCost;
  
  return Math.round(Math.max(0, Math.min(100, (2 - costRatio) * 100)));
}

function sortBranchesByMetric(branches: any[], metric: string): any[] {
  const scoreKey = `${metric === 'overall' ? 'overall' : metric}Score`;
  return branches.sort((a, b) => (b[scoreKey] || 0) - (a[scoreKey] || 0));
}

function calculatePercentile(score: number, allScores: number[]): number {
  const below = allScores.filter(s => s < score).length;
  return Math.round((below / allScores.length) * 100);
}

function getPerformanceStatus(score: number, avgScore: number): string {
  if (score >= avgScore * 1.2) return 'excellent';
  if (score >= avgScore) return 'good';
  if (score >= avgScore * 0.8) return 'fair';
  return 'needs-improvement';
}

function getTopPerformerHighlights(branch: any): string[] {
  const highlights = [];
  
  if (branch.criticalCount === 0) {
    highlights.push('Zero critical incidents');
  }
  if (branch.uptime > 99) {
    highlights.push(`${branch.uptime}% uptime`);
  }
  if (branch.avgResponseTime < 180) {
    highlights.push(`Fast response time (${branch.avgResponseTime}s avg)`);
  }
  
  return highlights;
}

function identifyIssues(branch: any, avgScore: number): string[] {
  const issues = [];
  
  if (branch.criticalCount > 0) {
    issues.push(`${branch.criticalCount} critical incidents`);
  }
  if (branch.uptime < 95) {
    issues.push(`Low uptime (${branch.uptime}%)`);
  }
  if (branch.avgResponseTime > 600) {
    issues.push(`Slow response time (${Math.round(branch.avgResponseTime / 60)} min avg)`);
  }
  if (branch.incidentCount > 50) {
    issues.push(`High incident volume (${branch.incidentCount})`);
  }
  
  return issues;
}

function calculateCategoryComparison(branches: any[], category: string): any {
  const scores = branches.map(b => b[category]);
  return {
    highest: Math.max(...scores),
    lowest: Math.min(...scores),
    average: Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length),
    median: calculateMedian(scores)
  };
}

function calculateMedian(numbers: number[]): number {
  const sorted = numbers.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function generateBranchInsights(branches: any[], avgScore: number): any[] {
  const insights = [];

  const excellentCount = branches.filter(b => b.overallScore >= avgScore * 1.2).length;
  const poorCount = branches.filter(b => b.overallScore < avgScore * 0.8).length;

  if (excellentCount > 0) {
    insights.push({
      type: 'success',
      title: `${excellentCount} Top Performing Branch${excellentCount > 1 ? 'es' : ''}`,
      message: `${excellentCount} branch${excellentCount > 1 ? 'es' : ''} performing significantly above average`,
      action: 'Document and share best practices from top performers'
    });
  }

  if (poorCount > 0) {
    insights.push({
      type: 'warning',
      title: `${poorCount} Branch${poorCount > 1 ? 'es' : ''} Need${poorCount === 1 ? 's' : ''} Improvement`,
      message: `${poorCount} branch${poorCount > 1 ? 'es' : ''} performing below 80% of average`,
      action: 'Develop targeted improvement plans for underperforming branches'
    });
  }

  // Check for high incident rates
  const highIncidentBranches = branches.filter(b => b.incidentCount > avgScore * 1.5);
  if (highIncidentBranches.length > 0) {
    insights.push({
      type: 'warning',
      title: 'High Incident Rate',
      message: `${highIncidentBranches.length} branch${highIncidentBranches.length > 1 ? 'es' : ''} with unusually high incident counts`,
      action: 'Investigate root causes: equipment issues, training needs, or environmental factors'
    });
  }

  return insights;
}

function generateBranchRecommendations(branches: any[], avgScore: number): any[] {
  const recommendations = [];

  // Identify branches that could benefit from best practices
  const topBranches = branches.filter(b => b.overallScore >= avgScore * 1.2).slice(0, 3);
  const poorBranches = branches.filter(b => b.overallScore < avgScore * 0.8);

  if (topBranches.length > 0 && poorBranches.length > 0) {
    recommendations.push({
      priority: 'high',
      title: 'Best Practice Sharing Program',
      description: 'Significant performance gap between top and bottom performers',
      action: `Establish mentorship program pairing ${topBranches[0].branch} with underperforming branches`,
      expectedImpact: 'Could improve bottom performers by 20-30%'
    });
  }

  // Equipment upgrade recommendations
  const lowUptimeBranches = branches.filter(b => b.uptime < 95);
  if (lowUptimeBranches.length > 0) {
    recommendations.push({
      priority: 'medium',
      title: 'Equipment Reliability Issues',
      description: `${lowUptimeBranches.length} branches with uptime below 95%`,
      action: 'Schedule equipment audits and consider selective hardware upgrades',
      branches: lowUptimeBranches.map(b => b.branch),
      expectedImpact: 'Improve uptime to 99%+ standard'
    });
  }

  return recommendations;
}

function calculateAverageMetrics(branches: any[]): any {
  return {
    incidentCount: Math.round(branches.reduce((sum, b) => sum + b.incidentCount, 0) / branches.length),
    criticalCount: Math.round(branches.reduce((sum, b) => sum + b.criticalCount, 0) / branches.length),
    uptime: Math.round(branches.reduce((sum, b) => sum + b.uptime, 0) / branches.length),
    avgResponseTime: Math.round(branches.reduce((sum, b) => sum + b.avgResponseTime, 0) / branches.length),
    totalCost: Math.round(branches.reduce((sum, b) => sum + b.totalCost, 0) / branches.length)
  };
}

function compareToPeers(branch: any, avgMetrics: any): any {
  return {
    incidents: {
      branch: branch.incidentCount,
      peer: avgMetrics.incidentCount,
      variance: branch.incidentCount - avgMetrics.incidentCount,
      status: branch.incidentCount < avgMetrics.incidentCount ? 'better' : 'worse'
    },
    uptime: {
      branch: branch.uptime,
      peer: avgMetrics.uptime,
      variance: branch.uptime - avgMetrics.uptime,
      status: branch.uptime > avgMetrics.uptime ? 'better' : 'worse'
    },
    responseTime: {
      branch: branch.avgResponseTime,
      peer: avgMetrics.avgResponseTime,
      variance: branch.avgResponseTime - avgMetrics.avgResponseTime,
      status: branch.avgResponseTime < avgMetrics.avgResponseTime ? 'better' : 'worse'
    },
    cost: {
      branch: branch.totalCost,
      peer: avgMetrics.totalCost,
      variance: branch.totalCost - avgMetrics.totalCost,
      status: branch.totalCost < avgMetrics.totalCost ? 'better' : 'worse'
    }
  };
}

async function getBranchTrends(
  pool: Pool,
  tenantId: string,
  branchId: string,
  months: number
): Promise<any[]> {
  // Would query historical data - placeholder for now
  return [];
}

function generateImprovementPlan(branch: any, avgMetrics: any): any[] {
  const plan = [];

  if (branch.incidentCount > avgMetrics.incidentCount * 1.5) {
    plan.push({
      area: 'Incident Reduction',
      currentState: `${branch.incidentCount} incidents`,
      target: `Reduce to ${avgMetrics.incidentCount} (peer average)`,
      actions: [
        'Conduct root cause analysis of top 3 incident types',
        'Implement targeted prevention measures',
        'Increase operator training frequency'
      ],
      timeline: '60 days'
    });
  }

  if (branch.uptime < 95) {
    plan.push({
      area: 'System Reliability',
      currentState: `${branch.uptime}% uptime`,
      target: '99% uptime',
      actions: [
        'Audit camera and NVR hardware',
        'Replace failing equipment',
        'Implement proactive maintenance schedule'
      ],
      timeline: '30 days'
    });
  }

  if (branch.avgResponseTime > avgMetrics.avgResponseTime * 1.5) {
    plan.push({
      area: 'Response Time',
      currentState: `${Math.round(branch.avgResponseTime / 60)} min average`,
      target: `${Math.round(avgMetrics.avgResponseTime / 60)} min average`,
      actions: [
        'Review and optimize alert routing',
        'Provide response procedure refresher training',
        'Consider additional SOC staffing during peak hours'
      ],
      timeline: '45 days'
    });
  }

  return plan;
}
