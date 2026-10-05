/**
 * System Status Command
 *
 * Provides real system health aggregation.
 * Replaces hardcoded values with actual health queries.
 * Explicitly handles UNKNOWN states when data is unavailable.
 */
import { CommandResultBuilder } from '../../types/index.js';
/**
 * System Status Command
 */
export class SystemStatusCommand {
    systemHealth;
    authorization;
    audit;
    constructor(systemHealth, authorization, audit) {
        this.systemHealth = systemHealth;
        this.authorization = authorization;
        this.audit = audit;
    }
    async execute(input, context) {
        const startTime = Date.now();
        try {
            // Check authorization
            const authDecision = await this.authorization.can({
                actor: context.user,
                action: 'system.health.view',
                resource: undefined // System-level permission
            });
            if (!authDecision.allowed) {
                await this.audit.record({
                    eventId: `audit_${Date.now()}`,
                    requestId: context.requestId,
                    timestamp: new Date(),
                    userId: context.user.id,
                    sessionId: context.sessionId,
                    originalText: 'System status',
                    parsedIntent: 'SYSTEM_STATUS',
                    intentConfidence: 1.0,
                    parsedEntities: [],
                    authorizationDecision: 'DENY',
                    authorizationReason: authDecision.reason,
                    command: 'SystemStatusCommand',
                    resultStatus: 'DENIED',
                    verified: false,
                    durationMs: Date.now() - startTime
                });
                return CommandResultBuilder.failure('FORBIDDEN', authDecision.reason || 'You are not authorized to view system health.', { retryable: false });
            }
            // Get system health snapshot
            try {
                const snapshot = await this.systemHealth.getSnapshot();
                // Build evidence trail
                const evidence = [{
                        source: 'system-health-service',
                        recordIds: ['system-health-snapshot'],
                        queriedAt: new Date(),
                        queryDetails: {
                            overall: snapshot.overall,
                            camerasTotal: snapshot.cameras.total,
                            incidentsOpen: snapshot.incidents.open,
                            storageHealthy: snapshot.storage.healthy
                        }
                    }];
                // Build human-readable summary
                const summary = this.buildSummary(snapshot);
                // Audit successful query
                await this.audit.record({
                    eventId: `audit_${Date.now()}`,
                    requestId: context.requestId,
                    timestamp: new Date(),
                    userId: context.user.id,
                    sessionId: context.sessionId,
                    originalText: 'System status',
                    parsedIntent: 'SYSTEM_STATUS',
                    intentConfidence: 1.0,
                    parsedEntities: [],
                    authorizationDecision: 'ALLOW',
                    command: 'SystemStatusCommand',
                    resultStatus: 'SUCCESS',
                    verified: true,
                    evidenceIds: ['system-health-snapshot'],
                    durationMs: Date.now() - startTime
                });
                return CommandResultBuilder.verifiedSuccess({
                    snapshot,
                    summary
                }, evidence);
            }
            catch (healthError) {
                console.error('[SystemStatusCommand] System health service error:', healthError);
                await this.audit.record({
                    eventId: `audit_${Date.now()}`,
                    requestId: context.requestId,
                    timestamp: new Date(),
                    userId: context.user.id,
                    sessionId: context.sessionId,
                    originalText: 'System status',
                    parsedIntent: 'SYSTEM_STATUS',
                    intentConfidence: 1.0,
                    parsedEntities: [],
                    authorizationDecision: 'ALLOW',
                    command: 'SystemStatusCommand',
                    resultStatus: 'FAILED',
                    verified: false,
                    errorCode: 'SERVICE_UNAVAILABLE',
                    durationMs: Date.now() - startTime
                });
                return CommandResultBuilder.failure('SERVICE_UNAVAILABLE', 'System health service is currently unavailable. Please try again later.', { retryable: true });
            }
        }
        catch (error) {
            console.error('[SystemStatusCommand] Unexpected error:', error);
            await this.audit.record({
                eventId: `audit_${Date.now()}`,
                requestId: context.requestId,
                timestamp: new Date(),
                userId: context.user.id,
                sessionId: context.sessionId,
                originalText: 'System status',
                parsedIntent: 'SYSTEM_STATUS',
                intentConfidence: 1.0,
                parsedEntities: [],
                authorizationDecision: 'NOT_REQUIRED',
                command: 'SystemStatusCommand',
                resultStatus: 'FAILED',
                verified: false,
                errorCode: 'INTERNAL_ERROR',
                durationMs: Date.now() - startTime
            });
            return CommandResultBuilder.failure('INTERNAL_ERROR', 'An unexpected error occurred while retrieving system status.', { retryable: true });
        }
    }
    /**
     * Build human-readable summary from snapshot
     */
    buildSummary(snapshot) {
        // Overall health
        const overallEmoji = this.getHealthEmoji(snapshot.overall);
        const overall = `${overallEmoji} System is ${snapshot.overall.toLowerCase()}`;
        // Cameras summary
        const { cameras } = snapshot;
        let camerasSummary;
        if (cameras.total === 0) {
            camerasSummary = 'No cameras configured';
        }
        else {
            const offlineCount = cameras.offline + cameras.error;
            camerasSummary = `${cameras.online}/${cameras.total} cameras online`;
            if (offlineCount > 0) {
                camerasSummary += ` (${offlineCount} offline/error)`;
            }
            if (cameras.degraded > 0) {
                camerasSummary += ` (${cameras.degraded} degraded)`;
            }
        }
        // Incidents summary
        const { incidents } = snapshot;
        let incidentsSummary;
        if (incidents.open === 0) {
            incidentsSummary = 'No open incidents';
        }
        else {
            incidentsSummary = `${incidents.open} open incident${incidents.open === 1 ? '' : 's'}`;
            if (incidents.critical > 0) {
                incidentsSummary += ` (${incidents.critical} critical)`;
            }
            else if (incidents.high > 0) {
                incidentsSummary += ` (${incidents.high} high priority)`;
            }
        }
        // Storage summary
        const { storage } = snapshot;
        let storageSummary;
        if (!storage.healthy) {
            storageSummary = `⚠️ Storage at ${storage.usedPercentage.toFixed(1)}% capacity`;
            if (storage.estimatedDaysRemaining !== undefined) {
                storageSummary += ` (~${storage.estimatedDaysRemaining} days remaining)`;
            }
        }
        else {
            storageSummary = `Storage at ${storage.usedPercentage.toFixed(1)}% capacity`;
        }
        // Detection pipeline summary
        const { detection } = snapshot;
        let detectionSummary;
        if (!detection.healthy) {
            if (detection.processingLagMs !== null) {
                detectionSummary = `⚠️ Detection pipeline lagging by ${detection.processingLagMs}ms`;
            }
            else {
                detectionSummary = '⚠️ Detection pipeline health unknown';
            }
        }
        else {
            if (detection.processingLagMs !== null) {
                detectionSummary = `Detection pipeline healthy (${detection.processingLagMs}ms lag)`;
            }
            else {
                detectionSummary = 'Detection pipeline healthy';
            }
        }
        return {
            overall,
            camerasSummary,
            incidentsSummary,
            storageSummary,
            detectionSummary
        };
    }
    /**
     * Get emoji for health status
     */
    getHealthEmoji(health) {
        switch (health) {
            case 'HEALTHY':
                return '✅';
            case 'DEGRADED':
                return '⚠️';
            case 'CRITICAL':
                return '🔴';
            case 'UNKNOWN':
                return '❓';
            default:
                return '•';
        }
    }
}
