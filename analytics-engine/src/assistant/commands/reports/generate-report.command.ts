/**
 * Generate Report Command
 * 
 * Generates real reports with actual aggregated data.
 * Replaces hardcoded incident counts.
 */

import type {
  AssistantCommand,
  CommandResult,
  AssistantContext,
  AssistantErrorCode,
  AssistantEvidence,
  CommandResultBuilder
} from '../../types/index.js';
import type { AuthorizationService } from '../../types/authorization.js';
import type { AssistantAuditService } from '../../types/audit.js';
import type {
  ReportService,
  Report,
  ReportType
} from '../../services/report-service.interface.js';

export interface GenerateReportInput {
  reportType: 'daily' | 'weekly' | 'monthly' | 'incidents' | 'analytics';
  period?: {
    from?: Date;
    to?: Date;
  };
}

export interface GenerateReportResult {
  report: Report;
  summary: string;
}

export class GenerateReportCommand implements AssistantCommand<GenerateReportInput, GenerateReportResult> {
  constructor(
    private reportService: ReportService,
    private authorization: AuthorizationService,
    private audit: AssistantAuditService
  ) {}
  
  async execute(
    input: GenerateReportInput,
    context: AssistantContext
  ): Promise<CommandResult<GenerateReportResult>> {
    const startTime = Date.now();
    
    try {
      const authDecision = await this.authorization.can({
        actor: context.user,
        action: 'report.generate'
      });
      
      if (!authDecision.allowed) {
        return CommandResultBuilder.failure(
          'FORBIDDEN' as AssistantErrorCode,
          'You are not authorized to generate reports.',
          { retryable: false }
        );
      }
      
      // Determine report type and period
      const reportType = this.mapReportType(input.reportType);
      const period = this.resolvePeriod(input);
      
      const report = await this.reportService.generate({
        type: reportType,
        period,
        requestedBy: context.user.id,
        siteIds: context.user.siteIds.length > 0 ? context.user.siteIds : undefined
      });
      
      const evidence: AssistantEvidence[] = [{
        source: 'report-service',
        recordIds: [report.id],
        queriedAt: report.generatedAt,
        queryDetails: {
          reportType: report.type,
          period: report.period
        }
      }];
      
      const summary = this.buildSummary(report);
      
      await this.audit.record({
        eventId: `audit_${Date.now()}`,
        requestId: context.requestId,
        timestamp: new Date(),
        userId: context.user.id,
        sessionId: context.sessionId,
        originalText: `Generate ${input.reportType} report`,
        parsedIntent: 'REPORT_INCIDENTS',
        intentConfidence: 1.0,
        parsedEntities: [
          { type: 'action', value: 'generate', confidence: 1.0 },
          { type: 'report', value: input.reportType, confidence: 1.0 }
        ],
        authorizationDecision: 'ALLOW',
        command: 'GenerateReportCommand',
        resultStatus: 'SUCCESS',
        verified: true,
        evidenceIds: [report.id],
        durationMs: Date.now() - startTime
      });
      
      return CommandResultBuilder.verifiedSuccess({ report, summary }, evidence);
      
    } catch (error) {
      console.error('[GenerateReportCommand] Error:', error);
      
      return CommandResultBuilder.failure(
        'SERVICE_UNAVAILABLE' as AssistantErrorCode,
        'Report service is currently unavailable.',
        { retryable: true }
      );
    }
  }
  
  private mapReportType(input: string): ReportType {
    const map: Record<string, ReportType> = {
      'daily': 'DAILY' as ReportType,
      'weekly': 'WEEKLY' as ReportType,
      'monthly': 'MONTHLY' as ReportType,
      'incidents': 'INCIDENT_SUMMARY' as ReportType,
      'analytics': 'ANALYTICS_SUMMARY' as ReportType
    };
    
    return map[input] || ('DAILY' as ReportType);
  }
  
  private resolvePeriod(input: GenerateReportInput): { from: Date; to: Date; label?: string } {
    if (input.period?.from && input.period?.to) {
      return {
        from: input.period.from,
        to: input.period.to
      };
    }
    
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    switch (input.reportType) {
      case 'daily':
        return {
          from: today,
          to: now,
          label: 'Today'
        };
      
      case 'weekly': {
        const weekAgo = new Date(today);
        weekAgo.setDate(weekAgo.getDate() - 7);
        return {
          from: weekAgo,
          to: now,
          label: 'Last 7 days'
        };
      }
      
      case 'monthly': {
        const monthAgo = new Date(today);
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        return {
          from: monthAgo,
          to: now,
          label: 'Last 30 days'
        };
      }
      
      default:
        return {
          from: today,
          to: now
        };
    }
  }
  
  private buildSummary(report: Report): string {
    const typeLabel = report.type.replace('_', ' ').toLowerCase();
    const periodLabel = report.period.label || 
      `${report.period.from.toLocaleDateString()} to ${report.period.to.toLocaleDateString()}`;
    
    let summary = `${typeLabel.charAt(0).toUpperCase() + typeLabel.slice(1)} report generated for ${periodLabel}`;
    
    // Add data summary if available
    if ('summary' in report.data) {
      const data = report.data as any;
      if (data.summary?.total !== undefined) {
        summary += ` - ${data.summary.total} total items`;
      }
    }
    
    summary += ` (Report ID: ${report.id})`;
    
    return summary;
  }
}
