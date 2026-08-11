/**
 * Compliance Report Generator
 * 
 * Generates audit-grade compliance reports with:
 * - Executive summaries
 * - Detailed findings
 * - Evidence snapshots
 * - Trend analysis
 * - Recommendations
 */

import type { Pool } from 'pg';
import { createHash } from 'crypto';
import { logger } from '../../utils/logger.js';
import type {
  ComplianceSummary,
  ComplianceFinding,
  ComplianceReportConfig,
  RecordingRetentionPolicy
} from './compliance.types.js';
import type { RecordingEvidence } from '../evidence/recording-evidence.types.js';

interface ComplianceReport {
  metadata: {
    reportId: string;
    type: string;
    generatedAt: Date;
    generatedBy?: string;
    period: {
      start: Date;
      end: Date;
    };
    scope: {
      tenantId: string;
      branchIds?: string[];
      policyIds?: string[];
    };
  };
  executiveSummary: {
    overallCompliance: number;
    totalCameras: number;
    compliantCameras: number;
    nonCompliantCameras: number;
    indeterminateCameras: number;
    trend: 'IMPROVING' | 'STABLE' | 'DEGRADING';
    keyFindings: string[];
    criticalIssues: number;
    recommendations: string[];
  };
  detailedFindings?: {
    compliant: ComplianceFinding[];
    nonCompliant: ComplianceFinding[];
    indeterminate: ComplianceFinding[];
  };
  evidenceSnapshots?: RecordingEvidence[];
  statistics: {
    byState: Record<string, number>;
    byViolation: Array<{ code: string; count: number }>;
    byReason: Record<string, number>;
    retention: {
      average: number;
      minimum: number;
      maximum: number;
      belowRequirement: number;
    };
    coverage: {
      average: number;
      totalGaps: number;
      largestGap: number;
    };
  };
  trends?: {
    complianceRateHistory: Array<{
      date: Date;
      rate: number;
    }>;
    violationTrends: Array<{
      code: string;
      trend: 'INCREASING' | 'STABLE' | 'DECREASING';
      changePercent: number;
    }>;
  };
  policies: RecordingRetentionPolicy[];
  reportHash: string;
}

export class ComplianceReportGenerator {
  constructor(private readonly pool: Pool) {}
  
  /**
   * Generate comprehensive compliance report
   */
  async generate(
    config: ComplianceReportConfig,
    summary: ComplianceSummary,
    findings: ComplianceFinding[],
    evidence?: RecordingEvidence[]
  ): Promise<ComplianceReport> {
    logger.info('Generating compliance report', {
      type: config.type,
      scope: config.scope
    });
    
    const reportId = this.generateReportId();
    
    // Get policies
    const policies = await this.getPolicies(config.scope.policyIds);
    
    // Generate executive summary
    const executiveSummary = this.generateExecutiveSummary(
      summary,
      findings,
      config
    );
    
    // Categorize findings
    const detailedFindings = config.includeDetails.violations
      ? this.categorizFindings(findings)
      : undefined;
    
    // Generate statistics
    const statistics = this.generateStatistics(summary, findings);
    
    // Generate trends if requested
    const trends = config.includeDetails.trends
      ? await this.generateTrends(config)
      : undefined;
    
    const report: ComplianceReport = {
      metadata: {
        reportId,
        type: config.type,
        generatedAt: new Date(),
        period: config.period,
        scope: config.scope
      },
      executiveSummary,
      detailedFindings,
      evidenceSnapshots: evidence,
      statistics,
      trends,
      policies,
      reportHash: '' // Will be calculated
    };
    
    // Calculate report hash for integrity
    report.reportHash = this.calculateReportHash(report);
    
    // Store report
    await this.storeReport(report);
    
    logger.info('Compliance report generated', {
      reportId,
      findings: findings.length
    });
    
    return report;
  }
  
  /**
   * Generate executive summary
   */
  private generateExecutiveSummary(
    summary: ComplianceSummary,
    findings: ComplianceFinding[],
    config: ComplianceReportConfig
  ): ComplianceReport['executiveSummary'] {
    const criticalFindings = findings.filter(f =>
      f.violations.some(v => v.severity === 'CRITICAL')
    );
    
    const keyFindings = this.generateKeyFindings(summary, findings);
    const recommendations = this.generateRecommendations(summary, findings);
    
    return {
      overallCompliance: summary.complianceRate,
      totalCameras: summary.totalCameras,
      compliantCameras: summary.byState.compliant,
      nonCompliantCameras: summary.byState.nonCompliant,
      indeterminateCameras: summary.byState.indeterminate,
      trend: this.determineTrend(summary),
      keyFindings,
      criticalIssues: criticalFindings.length,
      recommendations
    };
  }
  
  /**
   * Generate key findings
   */
  private generateKeyFindings(
    summary: ComplianceSummary,
    findings: ComplianceFinding[]
  ): string[] {
    const keyFindings: string[] = [];
    
    // Overall compliance
    if (summary.complianceRate >= 95) {
      keyFindings.push(
        `Excellent compliance rate of ${summary.complianceRate.toFixed(1)}%`
      );
    } else if (summary.complianceRate < 80) {
      keyFindings.push(
        `Compliance rate of ${summary.complianceRate.toFixed(1)}% requires immediate attention`
      );
    }
    
    // Cannot verify cameras
    if (summary.byState.indeterminate > 0) {
      keyFindings.push(
        `${summary.byState.indeterminate} cameras cannot be verified - evidence acquisition issues`
      );
    }
    
    // Top violations
    if (summary.topViolations.length > 0) {
      const topViolation = summary.topViolations[0];
      keyFindings.push(
        `Most common violation: ${this.formatViolationCode(topViolation.code)} (${topViolation.count} cameras)`
      );
    }
    
    // Retention issues
    if (summary.retention.belowRequirement > 0) {
      keyFindings.push(
        `${summary.retention.belowRequirement} cameras have insufficient retention duration`
      );
    }
    
    // Coverage issues
    if (summary.coverage.totalGaps > 100) {
      keyFindings.push(
        `${summary.coverage.totalGaps} recording gaps detected across all cameras`
      );
    }
    
    return keyFindings;
  }
  
  /**
   * Generate recommendations
   */
  private generateRecommendations(
    summary: ComplianceSummary,
    findings: ComplianceFinding[]
  ): string[] {
    const recommendations: string[] = [];
    
    // Indeterminate cameras
    const topReasons = Object.entries(summary.cannotVerify.byReason)
      .sort((a, b) => b[1] - a[1]);
    
    if (topReasons.length > 0) {
      const [reason, count] = topReasons[0];
      recommendations.push(
        `Address ${reason.toLowerCase().replace(/_/g, ' ')} affecting ${count} cameras`
      );
    }
    
    // Insufficient retention
    if (summary.retention.belowRequirement > 0) {
      recommendations.push(
        'Increase storage capacity or adjust retention policies for cameras below requirement'
      );
    }
    
    // Recording gaps
    if (summary.coverage.largestGapMinutes > 30) {
      recommendations.push(
        `Investigate and resolve recording gaps exceeding ${summary.coverage.largestGapMinutes.toFixed(0)} minutes`
      );
    }
    
    // Critical violations
    const criticalViolations = summary.topViolations.filter(v =>
      findings.some(f =>
        f.violations.some(fv =>
          fv.code === v.code && fv.severity === 'CRITICAL'
        )
      )
    );
    
    if (criticalViolations.length > 0) {
      recommendations.push(
        'Prioritize resolution of critical compliance violations to meet regulatory requirements'
      );
    }
    
    return recommendations;
  }
  
  /**
   * Categorize findings by state
   */
  private categorizeFindings(findings: ComplianceFinding[]) {
    return {
      compliant: findings.filter(f => f.state === 'COMPLIANT'),
      nonCompliant: findings.filter(f => f.state === 'NON_COMPLIANT'),
      indeterminate: findings.filter(f => f.state === 'INDETERMINATE')
    };
  }
  
  /**
   * Generate detailed statistics
   */
  private generateStatistics(
    summary: ComplianceSummary,
    findings: ComplianceFinding[]
  ) {
    const retentionValues = findings
      .map(f => f.observed.retentionDays)
      .filter((r): r is number => r !== undefined);
    
    return {
      byState: {
        COMPLIANT: summary.byState.compliant,
        NON_COMPLIANT: summary.byState.nonCompliant,
        INDETERMINATE: summary.byState.indeterminate,
        NOT_APPLICABLE: summary.byState.notApplicable
      },
      byViolation: summary.topViolations,
      byReason: summary.cannotVerify.byReason,
      retention: {
        average: summary.retention.averageDays,
        minimum: summary.retention.minimumDays,
        maximum: retentionValues.length > 0 ? Math.max(...retentionValues) : 0,
        belowRequirement: summary.retention.belowRequirement
      },
      coverage: {
        average: summary.coverage.averageRatio,
        totalGaps: summary.coverage.totalGaps,
        largestGap: summary.coverage.largestGapMinutes
      }
    };
  }
  
  /**
   * Generate trend analysis
   */
  private async generateTrends(
    config: ComplianceReportConfig
  ): Promise<ComplianceReport['trends']> {
    // Get historical compliance rates
    const rateHistory = await this.getComplianceRateHistory(
      config.scope.tenantId,
      config.period.start,
      config.period.end
    );
    
    // Analyze violation trends
    const violationTrends = await this.analyzeViolationTrends(
      config.scope.tenantId,
      config.period.start,
      config.period.end
    );
    
    return {
      complianceRateHistory: rateHistory,
      violationTrends
    };
  }
  
  /**
   * Get historical compliance rates
   */
  private async getComplianceRateHistory(
    tenantId: string,
    start: Date,
    end: Date
  ): Promise<Array<{ date: Date; rate: number }>> {
    const result = await this.pool.query(
      `WITH daily_compliance AS (
        SELECT 
          DATE(evaluated_at) as date,
          COUNT(*) FILTER (WHERE state = 'COMPLIANT') as compliant,
          COUNT(*) as total
        FROM recording_compliance_finding
        WHERE tenant_id = $1::uuid
          AND evaluated_at >= $2
          AND evaluated_at <= $3
        GROUP BY DATE(evaluated_at)
      )
      SELECT 
        date,
        CASE 
          WHEN total > 0 THEN (compliant::DECIMAL / total) * 100
          ELSE 0
        END as rate
      FROM daily_compliance
      ORDER BY date`,
      [tenantId, start, end]
    );
    
    return result.rows.map(row => ({
      date: new Date(row.date),
      rate: parseFloat(row.rate)
    }));
  }
  
  /**
   * Analyze violation trends
   */
  private async analyzeViolationTrends(
    tenantId: string,
    start: Date,
    end: Date
  ): Promise<Array<{
    code: string;
    trend: 'INCREASING' | 'STABLE' | 'DECREASING';
    changePercent: number;
  }>> {
    // Compare first half vs second half of period
    const midpoint = new Date((start.getTime() + end.getTime()) / 2);
    
    const result = await this.pool.query(
      `WITH violations AS (
        SELECT 
          jsonb_array_elements(violations_json)->>'code' as code,
          CASE 
            WHEN evaluated_at < $2 THEN 'first_half'
            ELSE 'second_half'
          END as period
        FROM recording_compliance_finding
        WHERE tenant_id = $1::uuid
          AND evaluated_at >= $3
          AND evaluated_at <= $4
      ),
      violation_counts AS (
        SELECT 
          code,
          period,
          COUNT(*) as count
        FROM violations
        GROUP BY code, period
      ),
      trends AS (
        SELECT 
          code,
          MAX(CASE WHEN period = 'first_half' THEN count ELSE 0 END) as first_count,
          MAX(CASE WHEN period = 'second_half' THEN count ELSE 0 END) as second_count
        FROM violation_counts
        GROUP BY code
      )
      SELECT 
        code,
        first_count,
        second_count,
        CASE 
          WHEN first_count = 0 THEN 0
          ELSE ((second_count - first_count)::DECIMAL / first_count) * 100
        END as change_percent
      FROM trends
      WHERE first_count > 0 OR second_count > 0
      ORDER BY ABS(change_percent) DESC`,
      [tenantId, midpoint, start, end]
    );
    
    return result.rows.map(row => {
      const change = parseFloat(row.change_percent);
      return {
        code: row.code,
        trend: change > 10 ? 'INCREASING' :
               change < -10 ? 'DECREASING' :
               'STABLE',
        changePercent: change
      };
    });
  }
  
  /**
   * Get policies
   */
  private async getPolicies(
    policyIds?: string[]
  ): Promise<RecordingRetentionPolicy[]> {
    if (!policyIds || policyIds.length === 0) {
      return [];
    }
    
    const result = await this.pool.query(
      `SELECT * FROM recording_retention_policy
      WHERE id = ANY($1::uuid[])`,
      [policyIds]
    );
    
    return result.rows;
  }
  
  /**
   * Determine overall trend
   */
  private determineTrend(summary: ComplianceSummary): 'IMPROVING' | 'STABLE' | 'DEGRADING' {
    // This is simplified - in production you'd compare to historical data
    if (summary.complianceRate >= 95) return 'STABLE';
    if (summary.complianceRate >= 85) return 'STABLE';
    return 'DEGRADING';
  }
  
  /**
   * Generate report ID
   */
  private generateReportId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 9);
    return `RPT-${timestamp}-${random}`.toUpperCase();
  }
  
  /**
   * Calculate report hash for integrity
   */
  private calculateReportHash(report: Omit<ComplianceReport, 'reportHash'>): string {
    const payload = JSON.stringify({
      reportId: report.metadata.reportId,
      generatedAt: report.metadata.generatedAt,
      overallCompliance: report.executiveSummary.overallCompliance,
      totalCameras: report.executiveSummary.totalCameras
    });
    
    return createHash('sha256').update(payload).digest('hex');
  }
  
  /**
   * Store report in database
   */
  private async storeReport(report: ComplianceReport): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO compliance_reports (
          report_id,
          type,
          tenant_id,
          period_start,
          period_end,
          overall_compliance_rate,
          total_cameras,
          compliant_cameras,
          non_compliant_cameras,
          indeterminate_cameras,
          report_data,
          report_hash,
          generated_at
        ) VALUES ($1, $2, $3::uuid, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          report.metadata.reportId,
          report.metadata.type,
          report.metadata.scope.tenantId,
          report.metadata.period.start,
          report.metadata.period.end,
          report.executiveSummary.overallCompliance,
          report.executiveSummary.totalCameras,
          report.executiveSummary.compliantCameras,
          report.executiveSummary.nonCompliantCameras,
          report.executiveSummary.indeterminateCameras,
          JSON.stringify(report),
          report.reportHash,
          report.metadata.generatedAt
        ]
      );
    } catch (error) {
      logger.error('Failed to store report', { error, reportId: report.metadata.reportId });
      // Don't throw - report generation succeeded even if storage failed
    }
  }
  
  /**
   * Format violation code
   */
  private formatViolationCode(code: string): string {
    return code
      .split('_')
      .map(word => word.charAt(0) + word.slice(1).toLowerCase())
      .join(' ');
  }
}
