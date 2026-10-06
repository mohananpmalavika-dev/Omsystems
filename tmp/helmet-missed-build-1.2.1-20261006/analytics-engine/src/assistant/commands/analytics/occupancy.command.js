/**
 * Occupancy Analytics Command
 *
 * Queries real occupancy metrics instead of hardcoded values.
 */
import { CommandResultBuilder } from '../../types/index.js';
export class OccupancyCommand {
    analytics;
    authorization;
    audit;
    constructor(analytics, authorization, audit) {
        this.analytics = analytics;
        this.authorization = authorization;
        this.audit = audit;
    }
    async execute(input, context) {
        const startTime = Date.now();
        try {
            const authDecision = await this.authorization.can({
                actor: context.user,
                action: 'analytics.view'
            });
            if (!authDecision.allowed) {
                return CommandResultBuilder.failure('FORBIDDEN', 'You are not authorized to view analytics.', { retryable: false });
            }
            const metrics = await this.analytics.getOccupancy({
                siteId: input.siteId,
                siteIds: context.user.siteIds,
                zoneId: input.zoneId,
                at: new Date()
            });
            const evidence = [{
                    source: 'analytics-service',
                    recordIds: ['occupancy-query'],
                    queriedAt: metrics.calculatedAt,
                    queryDetails: {
                        count: metrics.count,
                        source: metrics.source,
                        freshnessMs: metrics.freshnessMs
                    }
                }];
            const summary = this.buildSummary(metrics);
            await this.audit.record({
                eventId: `audit_${Date.now()}`,
                requestId: context.requestId,
                timestamp: new Date(),
                userId: context.user.id,
                sessionId: context.sessionId,
                originalText: 'Current occupancy',
                parsedIntent: 'ANALYTICS_OCCUPANCY',
                intentConfidence: 1.0,
                parsedEntities: [],
                authorizationDecision: 'ALLOW',
                command: 'OccupancyCommand',
                resultStatus: 'SUCCESS',
                verified: true,
                durationMs: Date.now() - startTime
            });
            return CommandResultBuilder.verifiedSuccess({ metrics, summary }, evidence);
        }
        catch (error) {
            console.error('[OccupancyCommand] Error:', error);
            return CommandResultBuilder.failure('SERVICE_UNAVAILABLE', 'Analytics service is currently unavailable.', { retryable: true });
        }
    }
    buildSummary(metrics) {
        let summary = `Current occupancy: ${metrics.count} people`;
        if (metrics.capacity) {
            summary += ` (${metrics.percentage?.toFixed(1)}% of capacity)`;
        }
        const freshnessSec = Math.round(metrics.freshnessMs / 1000);
        summary += ` [Updated ${freshnessSec} second${freshnessSec === 1 ? '' : 's'} ago]`;
        if (metrics.source === 'ESTIMATED') {
            summary += ' (estimated)';
        }
        return summary;
    }
}
