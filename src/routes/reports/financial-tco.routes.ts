// @ts-nocheck
/**
 * Financial TCO (Total Cost of Ownership) Report Routes
 * 
 * Provides comprehensive financial analysis including:
 * - Capital Expenditure (CapEx) tracking
 * - Operating Expenditure (OpEx) tracking
 * - Cost per branch, camera, incident
 * - Budget utilization and variance
 * - Cost optimization recommendations
 */

import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { authenticateToken } from '../../middleware/auth.middleware.js';
import { requirePermission } from '../../middleware/require-permission.middleware.js';

export function createFinancialTcoRoutes(pool: Pool): Router {
  const router = Router();

  /**
   * GET /api/control/v1/reports/financial/tco
   * 
   * Get Total Cost of Ownership report
   * Query params:
   * - period: monthly | quarterly | annual (default: monthly)
   * - startDate: ISO date (default: current month start)
   * - endDate: ISO date (default: current month end)
   */
  router.get('/financial/tco', authenticateToken, requirePermission('reports:view'), async (req: Request, res: Response) => {
    try {
      const tenantId = req.user?.tenantId;
      if (!tenantId) {
        return res.status(400).json({ error: 'Tenant ID required' });
      }

      const period = (req.query.period as string) || 'monthly';
      const now = new Date();
      const startDate = req.query.startDate 
        ? new Date(req.query.startDate as string)
        : new Date(now.getFullYear(), now.getMonth(), 1);
      const endDate = req.query.endDate
        ? new Date(req.query.endDate as string)
        : new Date(now.getFullYear(), now.getMonth() + 1, 0);

      // Capital Expenditure (CapEx)
      const capex = await calculateCapex(pool, tenantId, startDate, endDate);

      // Operating Expenditure (OpEx)
      const opex = await calculateOpex(pool, tenantId, startDate, endDate);

      // Hidden/Indirect Costs
      const hiddenCosts = await calculateHiddenCosts(pool, tenantId, startDate, endDate);

      // Total Cost
      const totalCost = capex.total + opex.total + hiddenCosts.total;

      // Cost Breakdown by Category
      const categoryBreakdown = [
        ...capex.breakdown.map(item => ({ ...item, category: 'CapEx' })),
        ...opex.breakdown.map(item => ({ ...item, category: 'OpEx' })),
        ...hiddenCosts.breakdown.map(item => ({ ...item, category: 'Hidden' }))
      ];

      // Cost per Branch
      const costPerBranch = await calculateCostPerBranch(pool, tenantId, startDate, endDate);

      // Cost per Camera
      const cameras = await pool.query(
        'SELECT COUNT(*) as count FROM cameras WHERE tenant_id = $1',
        [tenantId]
      );
      const cameraCount = parseInt(cameras.rows[0]?.count || '0', 10);
      const costPerCamera = cameraCount > 0 ? totalCost / cameraCount : 0;

      // Cost per Incident
      const incidents = await pool.query(
        'SELECT COUNT(*) as count FROM incidents WHERE tenant_id = $1 AND detected_at >= $2 AND detected_at < $3',
        [tenantId, startDate, endDate]
      );
      const incidentCount = parseInt(incidents.rows[0]?.count || '0', 10);
      const costPerIncident = incidentCount > 0 ? totalCost / incidentCount : 0;

      // Budget Comparison (if budget data exists)
      const budgetData = await getBudgetData(pool, tenantId, startDate, endDate);

      // Cost Trends (last 6 periods)
      const trends = await getCostTrends(pool, tenantId, period, 6);

      // Cost Optimization Recommendations
      const recommendations = generateCostOptimizationRecommendations(
        capex,
        opex,
        hiddenCosts,
        costPerBranch,
        budgetData
      );

      const report = {
        period,
        dateRange: {
          start: startDate.toISOString(),
          end: endDate.toISOString()
        },
        generatedAt: new Date().toISOString(),
        
        summary: {
          totalCost,
          capex: capex.total,
          opex: opex.total,
          hiddenCosts: hiddenCosts.total,
          costPerCamera: Math.round(costPerCamera * 100) / 100,
          costPerIncident: Math.round(costPerIncident * 100) / 100,
          costPerBranch: Math.round((totalCost / Math.max(1, costPerBranch.length)) * 100) / 100
        },

        breakdown: {
          capex: capex.breakdown,
          opex: opex.breakdown,
          hiddenCosts: hiddenCosts.breakdown,
          byCategory: categoryBreakdown
        },

        branches: costPerBranch,

        budget: budgetData,

        trends,

        recommendations,

        insights: generateFinancialInsights(totalCost, capex, opex, budgetData, trends)
      };

      res.json({
        success: true,
        data: report
      });

    } catch (error) {
      console.error('[FinancialTCO] Error generating report:', error);
      res.status(500).json({
        error: 'Failed to generate TCO report',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * GET /api/control/v1/reports/financial/roi
   * 
   * Get Return on Investment analysis
   */
  router.get('/financial/roi', authenticateToken, requirePermission('reports:view'), async (req: Request, res: Response) => {
    try {
      const tenantId = req.user?.tenantId;
      if (!tenantId) {
        return res.status(400).json({ error: 'Tenant ID required' });
      }

      const now = new Date();
      const last12Months = new Date(now.getFullYear() - 1, now.getMonth(), 1);

      // Total Investment (CapEx + OpEx)
      const capex = await calculateCapex(pool, tenantId, last12Months, now);
      const opex = await calculateOpex(pool, tenantId, last12Months, now);
      const totalInvestment = capex.total + opex.total;

      // Quantified Benefits
      const benefits = await calculateQuantifiedBenefits(pool, tenantId, last12Months, now);

      // ROI Calculation
      const netBenefit = benefits.total - totalInvestment;
      const roiPercentage = totalInvestment > 0 
        ? (netBenefit / totalInvestment) * 100 
        : 0;

      // Payback Period (months)
      const monthlyBenefit = benefits.total / 12;
      const paybackMonths = monthlyBenefit > 0 
        ? Math.ceil(totalInvestment / monthlyBenefit)
        : 0;

      const report = {
        period: 'Last 12 Months',
        dateRange: {
          start: last12Months.toISOString(),
          end: now.toISOString()
        },
        generatedAt: new Date().toISOString(),

        investment: {
          capex: capex.total,
          opex: opex.total,
          total: totalInvestment
        },

        benefits: benefits.breakdown,
        totalBenefits: benefits.total,

        roi: {
          netBenefit,
          percentage: Math.round(roiPercentage * 100) / 100,
          paybackMonths,
          status: roiPercentage > 100 ? 'positive' : roiPercentage > 0 ? 'break-even' : 'negative'
        },

        insights: generateRoiInsights(roiPercentage, paybackMonths, benefits)
      };

      res.json({
        success: true,
        data: report
      });

    } catch (error) {
      console.error('[FinancialROI] Error generating report:', error);
      res.status(500).json({
        error: 'Failed to generate ROI report',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  return router;
}

// ========================
// Helper Functions
// ========================

async function calculateCapex(
  pool: Pool,
  tenantId: string,
  start: Date,
  end: Date
): Promise<any> {
  // In real implementation, would query asset purchases, equipment costs, etc.
  // For now, estimate based on camera count and typical costs
  
  const cameras = await pool.query(
    'SELECT COUNT(*) as count FROM cameras WHERE tenant_id = $1 AND created_at >= $2 AND created_at < $3',
    [tenantId, start, end]
  );
  
  const newCameras = parseInt(cameras.rows[0]?.count || '0', 10);
  const cameraCost = 500; // Average cost per camera
  const nvrCost = 2000; // Average NVR cost (assume 1 per 16 cameras)
  const networkCost = 200; // Network infrastructure per camera

  const breakdown = [
    { item: 'Cameras', quantity: newCameras, unitCost: cameraCost, total: newCameras * cameraCost },
    { item: 'NVR/DVR', quantity: Math.ceil(newCameras / 16), unitCost: nvrCost, total: Math.ceil(newCameras / 16) * nvrCost },
    { item: 'Network Infrastructure', quantity: newCameras, unitCost: networkCost, total: newCameras * networkCost },
    { item: 'Storage Hardware', quantity: Math.ceil(newCameras / 8), unitCost: 800, total: Math.ceil(newCameras / 8) * 800 }
  ];

  const total = breakdown.reduce((sum, item) => sum + item.total, 0);

  return { total, breakdown };
}

async function calculateOpex(
  pool: Pool,
  tenantId: string,
  start: Date,
  end: Date
): Promise<any> {
  // Query maintenance costs
  const maintenance = await pool.query(
    'SELECT SUM(cost) as total FROM maintenance_records WHERE tenant_id = $1 AND completed_at >= $2 AND completed_at < $3',
    [tenantId, start, end]
  );
  const maintenanceCost = parseFloat(maintenance.rows[0]?.total || '0');

  // Estimate other OpEx (electricity, bandwidth, labor)
  const cameras = await pool.query(
    'SELECT COUNT(*) as count FROM cameras WHERE tenant_id = $1',
    [tenantId]
  );
  const cameraCount = parseInt(cameras.rows[0]?.count || '0', 10);

  const monthsDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 30));
  const electricityCost = cameraCount * 10 * monthsDiff; // $10/camera/month
  const bandwidthCost = cameraCount * 20 * monthsDiff; // $20/camera/month
  const cloudStorageCost = cameraCount * 15 * monthsDiff; // $15/camera/month

  const breakdown = [
    { item: 'Maintenance & AMC', total: maintenanceCost },
    { item: 'Electricity', total: electricityCost },
    { item: 'Internet Bandwidth', total: bandwidthCost },
    { item: 'Cloud Storage', total: cloudStorageCost },
    { item: 'Labor Costs', total: monthsDiff * 5000 } // Estimate $5000/month for security ops
  ];

  const total = breakdown.reduce((sum, item) => sum + item.total, 0);

  return { total, breakdown };
}

async function calculateHiddenCosts(
  pool: Pool,
  tenantId: string,
  start: Date,
  end: Date
): Promise<any> {
  // Downtime impact
  const downtime = await pool.query(
    `SELECT COUNT(*) as incidents, 
            SUM(EXTRACT(EPOCH FROM (COALESCE(resolved_at, NOW()) - detected_at)) / 3600) as total_hours
     FROM incidents 
     WHERE tenant_id = $1 
       AND detected_at >= $2 
       AND detected_at < $3
       AND (detection_type LIKE '%camera%' OR detection_type = 'video-loss')`,
    [tenantId, start, end]
  );

  const downtimeHours = parseFloat(downtime.rows[0]?.total_hours || '0');
  const downtimeCost = downtimeHours * 100; // $100/hour cost of lost coverage

  // False alarm investigation cost
  const falseAlarms = await pool.query(
    'SELECT COUNT(*) as count FROM incidents WHERE tenant_id = $1 AND detected_at >= $2 AND detected_at < $3 AND metadata->>\'falsePositive\' = \'true\'',
    [tenantId, start, end]
  );
  const falseAlarmCount = parseInt(falseAlarms.rows[0]?.count || '0', 10);
  const falseAlarmCost = falseAlarmCount * 50; // $50 per false alarm investigation

  const breakdown = [
    { item: 'Downtime Impact', total: Math.round(downtimeCost) },
    { item: 'False Alarm Investigation', total: falseAlarmCost },
    { item: 'Training & Onboarding', total: 2000 }, // Estimate
    { item: 'Compliance Penalties', total: 0 } // Would come from compliance violations
  ];

  const total = breakdown.reduce((sum, item) => sum + item.total, 0);

  return { total, breakdown };
}

async function calculateCostPerBranch(
  pool: Pool,
  tenantId: string,
  start: Date,
  end: Date
): Promise<any[]> {
  // Get maintenance costs by branch/location
  const branches = await pool.query(
    `SELECT 
       COALESCE(location, 'Unknown') as branch,
       COUNT(*) as incident_count,
       SUM(COALESCE((metadata->>'estimatedCost')::numeric, 100)) as total_cost
     FROM incidents 
     WHERE tenant_id = $1 
       AND detected_at >= $2 
       AND detected_at < $3
     GROUP BY COALESCE(location, 'Unknown')
     ORDER BY total_cost DESC`,
    [tenantId, start, end]
  );

  return branches.rows.map(row => ({
    branch: row.branch,
    incidentCount: parseInt(row.incident_count, 10),
    totalCost: Math.round(parseFloat(row.total_cost || '0'))
  }));
}

async function getBudgetData(
  pool: Pool,
  tenantId: string,
  start: Date,
  end: Date
): Promise<any> {
  // Would query budget table if it exists
  // For now, return placeholder
  return {
    allocated: 0,
    spent: 0,
    remaining: 0,
    utilizationPercent: 0,
    variance: 0
  };
}

async function getCostTrends(
  pool: Pool,
  tenantId: string,
  period: string,
  periods: number
): Promise<any[]> {
  // Would query historical cost data
  // For now, return placeholder
  return [];
}

async function calculateQuantifiedBenefits(
  pool: Pool,
  tenantId: string,
  start: Date,
  end: Date
): Promise<any> {
  // Prevented losses (incidents detected and resolved)
  const preventedIncidents = await pool.query(
    `SELECT COUNT(*) as count, 
            COUNT(*) FILTER (WHERE severity = 'critical') as critical_count
     FROM incidents 
     WHERE tenant_id = $1 
       AND detected_at >= $2 
       AND detected_at < $3
       AND resolved = true`,
    [tenantId, start, end]
  );

  const preventedCount = parseInt(preventedIncidents.rows[0]?.count || '0', 10);
  const criticalCount = parseInt(preventedIncidents.rows[0]?.critical_count || '0', 10);
  
  // Estimate value of prevented losses
  const preventedLosses = (preventedCount * 5000) + (criticalCount * 20000);

  // Investigation time savings
  const investigations = await pool.query(
    `SELECT COUNT(*) as count,
            AVG(EXTRACT(EPOCH FROM (resolved_at - detected_at)) / 3600) as avg_hours
     FROM incidents 
     WHERE tenant_id = $1 
       AND detected_at >= $2 
       AND detected_at < $3
       AND resolved_at IS NOT NULL`,
    [tenantId, start, end]
  );

  const avgInvestigationHours = parseFloat(investigations.rows[0]?.avg_hours || '0');
  const investigationSavings = avgInvestigationHours * preventedCount * 75; // $75/hour labor rate

  const breakdown = [
    { item: 'Prevented Theft/Fraud', value: preventedLosses },
    { item: 'Investigation Time Savings', value: Math.round(investigationSavings) },
    { item: 'Insurance Premium Reduction', value: 10000 }, // Estimate
    { item: 'Compliance Cost Avoidance', value: 5000 } // Estimate
  ];

  const total = breakdown.reduce((sum, item) => sum + item.value, 0);

  return { total, breakdown };
}

function generateCostOptimizationRecommendations(
  capex: any,
  opex: any,
  hiddenCosts: any,
  costPerBranch: any[],
  budgetData: any
): any[] {
  const recommendations = [];

  // High OpEx recommendation
  if (opex.total > capex.total * 2) {
    recommendations.push({
      priority: 'high',
      category: 'Cost Reduction',
      title: 'OpEx significantly exceeds CapEx',
      description: 'Operating costs are unusually high compared to capital investment',
      recommendation: 'Review maintenance contracts, consider equipment upgrades to reduce ongoing costs',
      potentialSavings: Math.round(opex.total * 0.15)
    });
  }

  // Hidden costs recommendation
  if (hiddenCosts.total > (capex.total + opex.total) * 0.2) {
    recommendations.push({
      priority: 'medium',
      category: 'Efficiency',
      title: 'High hidden/indirect costs',
      description: 'Hidden costs (downtime, false alarms) are significant',
      recommendation: 'Invest in system reliability and AI model tuning to reduce false positives',
      potentialSavings: Math.round(hiddenCosts.total * 0.5)
    });
  }

  // High-cost branches
  if (costPerBranch.length > 0) {
    const avgCost = costPerBranch.reduce((sum, b) => sum + b.totalCost, 0) / costPerBranch.length;
    const highCostBranches = costPerBranch.filter(b => b.totalCost > avgCost * 1.5);
    
    if (highCostBranches.length > 0) {
      recommendations.push({
        priority: 'high',
        category: 'Branch Optimization',
        title: `${highCostBranches.length} branches with high costs`,
        description: 'Some branches significantly exceed average cost',
        recommendation: 'Audit high-cost branches for equipment issues or operational inefficiencies',
        branches: highCostBranches.map(b => b.branch),
        potentialSavings: Math.round(highCostBranches.reduce((sum, b) => sum + (b.totalCost - avgCost), 0) * 0.3)
      });
    }
  }

  return recommendations;
}

function generateFinancialInsights(
  totalCost: number,
  capex: any,
  opex: any,
  budgetData: any,
  trends: any[]
): any[] {
  const insights = [];

  // Cost breakdown insight
  insights.push({
    type: 'info',
    title: 'Cost Structure',
    message: `Total cost: $${totalCost.toLocaleString()}. CapEx: ${Math.round((capex.total / totalCost) * 100)}%, OpEx: ${Math.round((opex.total / totalCost) * 100)}%`,
    details: 'Typical security systems have 30-40% CapEx and 60-70% OpEx split'
  });

  if (budgetData.allocated > 0) {
    const utilizationPercent = (totalCost / budgetData.allocated) * 100;
    if (utilizationPercent > 90) {
      insights.push({
        type: 'warning',
        title: 'Budget Near Capacity',
        message: `${utilizationPercent.toFixed(0)}% of budget utilized`,
        details: 'Consider requesting budget increase or deferring non-critical expenses'
      });
    }
  }

  return insights;
}

function generateRoiInsights(
  roiPercentage: number,
  paybackMonths: number,
  benefits: any
): any[] {
  const insights = [];

  if (roiPercentage > 100) {
    insights.push({
      type: 'success',
      title: 'Positive ROI',
      message: `${roiPercentage.toFixed(0)}% return on investment with ${paybackMonths} month payback period`,
      details: 'Security investment is generating positive returns'
    });
  } else if (roiPercentage > 0) {
    insights.push({
      type: 'info',
      title: 'Break-Even ROI',
      message: `ROI near break-even at ${roiPercentage.toFixed(0)}%`,
      details: 'Consider opportunities to increase quantified benefits'
    });
  } else {
    insights.push({
      type: 'warning',
      title: 'Negative ROI',
      message: `Current ROI is ${roiPercentage.toFixed(0)}%`,
      details: 'Focus on quantifying additional benefits or reducing costs'
    });
  }

  return insights;
}
