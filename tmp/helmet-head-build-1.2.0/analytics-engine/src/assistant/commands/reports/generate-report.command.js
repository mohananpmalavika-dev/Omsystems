/**
 * Generate Report Command
 *
 * Generates real reports with actual aggregated data.
 * Replaces hardcoded incident counts.
 */
import { CommandResultBuilder } from '../../types/index.js';
export class GenerateReportCommand {
    reportService;
    authorization;
    audit;
    constructor(reportService, authorization, audit) {
        this.reportService = reportService;
        this.authorization = authorization;
        this.audit = audit;
    }
    async execute(input, context) {
        const startTime = Date.now();
        try {
            const authDecision = await this.authorization.can({
                actor: context.user,
                action: 'report.generate'
            });
            if (!authDecision.allowed) {
                return CommandResultBuilder.failure('FORBIDDEN', 'You are not authorized to generate reports.', { retryable: false });
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
            const evidence = [{
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
        }
        catch (error) {
            console.error('[GenerateReportCommand] Error:', error);
            return CommandResultBuilder.failure('SERVICE_UNAVAILABLE', 'Report service is currently unavailable.', { retryable: true });
        }
    }
    mapReportType(input) {
        const map = {
            'daily': 'DAILY',
            'weekly': 'WEEKLY',
            'monthly': 'MONTHLY',
            'incidents': 'INCIDENT_SUMMARY',
            'analytics': 'ANALYTICS_SUMMARY'
        };
        return map[input] || 'DAILY';
    }
    resolvePeriod(input) {
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
    buildSummary(report) {
        const typeLabel = report.type.replace('_', ' ').toLowerCase();
        const periodLabel = report.period.label ||
            `${report.period.from.toLocaleDateString()} to ${report.period.to.toLocaleDateString()}`;
        let summary = `${typeLabel.charAt(0).toUpperCase() + typeLabel.slice(1)} report generated for ${periodLabel}`;
        // Add data summary if available
        if ('summary' in report.data) {
            const data = report.data;
            if (data.summary?.total !== undefined) {
                summary += ` - ${data.summary.total} total items`;
            }
        }
        summary += ` (Report ID: ${report.id})`;
        return summary;
    }
}
