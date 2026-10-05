/**
 * Investigate Person Command
 *
 * Creates real persistent investigations with ReID and timeline.
 * Replaces fake track_123 generated stories with actual workflows.
 */
import { CommandResultBuilder } from '../../types/index.js';
/**
 * Investigate Person Command
 */
export class InvestigatePersonCommand {
    investigationService;
    detectionSearch;
    authorization;
    audit;
    constructor(investigationService, detectionSearch, authorization, audit) {
        this.investigationService = investigationService;
        this.detectionSearch = detectionSearch;
        this.authorization = authorization;
        this.audit = audit;
    }
    async execute(input, context) {
        const startTime = Date.now();
        try {
            // Check authorization
            const authDecision = await this.authorization.can({
                actor: context.user,
                action: 'investigation.create'
            });
            if (!authDecision.allowed) {
                await this.auditFailure(context, input, 'DENIED', Date.now() - startTime);
                return CommandResultBuilder.failure('FORBIDDEN', authDecision.reason || 'You are not authorized to create investigations.', { retryable: false });
            }
            // Resolve subject detection ID
            let subjectDetectionId = input.subjectDetectionId;
            if (!subjectDetectionId && input.searchCriteria) {
                // Try to find subject from search criteria
                const searchResult = await this.detectionSearch.search({
                    objectTypes: ['person'],
                    attributes: {
                        color: input.searchCriteria.color
                    },
                    timeRange: input.searchCriteria.timestamp ? {
                        from: new Date(input.searchCriteria.timestamp.getTime() - 5 * 60 * 1000), // 5 min before
                        to: new Date(input.searchCriteria.timestamp.getTime() + 5 * 60 * 1000) // 5 min after
                    } : undefined,
                    limit: 1,
                    minConfidence: 0.8
                });
                if (searchResult.results.length === 0) {
                    await this.auditFailure(context, input, 'FAILED', Date.now() - startTime);
                    return CommandResultBuilder.failure('RESOURCE_NOT_FOUND', 'No person matching the search criteria was found.', { retryable: false });
                }
                if (searchResult.results && searchResult.results.length > 0 && searchResult.results[0]) {
                    subjectDetectionId = searchResult.results[0].detectionId;
                }
            }
            if (!subjectDetectionId) {
                await this.auditFailure(context, input, 'FAILED', Date.now() - startTime);
                return CommandResultBuilder.failure('INVALID_ARGUMENT', 'Please provide either a detection ID or search criteria to identify the person.', { retryable: false });
            }
            // Verify subject detection exists
            const subjectDetection = await this.detectionSearch.getById(subjectDetectionId);
            if (!subjectDetection) {
                await this.auditFailure(context, input, 'FAILED', Date.now() - startTime);
                return CommandResultBuilder.failure('RESOURCE_NOT_FOUND', `Detection ${subjectDetectionId} was not found.`, { retryable: false });
            }
            // Create investigation
            try {
                const timeRange = input.timeRange && input.timeRange.from && input.timeRange.to
                    ? { from: input.timeRange.from, to: input.timeRange.to }
                    : undefined;
                const investigation = await this.investigationService.create({
                    type: 'person',
                    subjectDetectionId,
                    requestedBy: context.user.id,
                    options: {
                        timeRange,
                        cameraIds: input.cameraIds,
                        minConfidence: 0.75
                    }
                });
                // Build evidence trail
                const evidence = [
                    {
                        source: 'investigation-service',
                        recordIds: [investigation.id],
                        queriedAt: new Date(),
                        queryDetails: {
                            investigationId: investigation.id,
                            status: investigation.status,
                            totalAppearances: investigation.summary.totalAppearances
                        }
                    },
                    {
                        source: 'reid-service',
                        recordIds: investigation.matches.map(m => m.detectionId),
                        queriedAt: new Date(),
                        queryDetails: {
                            matchCount: investigation.matches.length
                        }
                    },
                    {
                        source: 'timeline-service',
                        recordIds: investigation.timeline.map(t => t.detectionId),
                        queriedAt: new Date(),
                        queryDetails: {
                            timelineEntries: investigation.timeline.length
                        }
                    }
                ];
                // Build summary
                const summary = this.buildSummary(investigation);
                // Audit successful investigation
                await this.audit.record({
                    eventId: `audit_${Date.now()}`,
                    requestId: context.requestId,
                    timestamp: new Date(),
                    userId: context.user.id,
                    sessionId: context.sessionId,
                    originalText: `Investigate person ${subjectDetectionId}`,
                    parsedIntent: 'INVESTIGATE_PERSON',
                    intentConfidence: 1.0,
                    parsedEntities: [
                        { type: 'person', value: subjectDetectionId, confidence: 1.0 }
                    ],
                    resolvedResources: [
                        { type: 'detection', id: subjectDetectionId },
                        { type: 'investigation', id: investigation.id }
                    ],
                    authorizationDecision: 'ALLOW',
                    command: 'InvestigatePersonCommand',
                    commandInput: input,
                    resultStatus: 'SUCCESS',
                    verified: true,
                    evidenceIds: [investigation.id, ...investigation.matches.map(m => m.detectionId)],
                    durationMs: Date.now() - startTime
                });
                return CommandResultBuilder.verifiedSuccess({
                    investigation,
                    summary
                }, evidence);
            }
            catch (serviceError) {
                console.error('[InvestigatePersonCommand] Investigation service error:', serviceError);
                await this.auditFailure(context, input, 'FAILED', Date.now() - startTime);
                return CommandResultBuilder.failure('SERVICE_UNAVAILABLE', 'Investigation service is currently unavailable. Please try again later.', { retryable: true });
            }
        }
        catch (error) {
            console.error('[InvestigatePersonCommand] Unexpected error:', error);
            await this.auditFailure(context, input, 'FAILED', Date.now() - startTime);
            return CommandResultBuilder.failure('INTERNAL_ERROR', 'An unexpected error occurred while creating the investigation.', { retryable: true });
        }
    }
    /**
     * Build human-readable summary
     */
    buildSummary(investigation) {
        const { summary, timeline } = investigation;
        // Format duration
        const durationMinutes = summary.totalDurationMinutes;
        let duration;
        if (durationMinutes < 60) {
            duration = `${durationMinutes} minute${durationMinutes === 1 ? '' : 's'}`;
        }
        else {
            const hours = Math.floor(durationMinutes / 60);
            const mins = durationMinutes % 60;
            duration = `${hours} hour${hours === 1 ? '' : 's'}`;
            if (mins > 0) {
                duration += ` ${mins} minute${mins === 1 ? '' : 's'}`;
            }
        }
        // Build timeline summary (top 5 entries)
        const timelineSummary = timeline.slice(0, 5).map(entry => {
            const time = entry.timestamp.toLocaleTimeString();
            const location = entry.cameraName || entry.cameraId;
            const confidence = Math.round(entry.confidence * 100);
            let text = `${time} at ${location}: ${entry.action}`;
            if (entry.dwellTimeSeconds !== undefined && entry.dwellTimeSeconds > 0) {
                const dwellMins = Math.floor(entry.dwellTimeSeconds / 60);
                if (dwellMins > 0) {
                    text += ` (${dwellMins} min)`;
                }
            }
            text += ` [${confidence}% match]`;
            return text;
        });
        if (timeline.length > 5) {
            timelineSummary.push(`... and ${timeline.length - 5} more appearance${timeline.length - 5 === 1 ? '' : 's'}`);
        }
        return {
            investigationId: investigation.id,
            totalAppearances: summary.totalAppearances,
            camerasVisited: summary.camerasVisited,
            duration,
            timeline: timelineSummary
        };
    }
    /**
     * Audit failure helper
     */
    async auditFailure(context, input, status, durationMs) {
        try {
            await this.audit.record({
                eventId: `audit_${Date.now()}`,
                requestId: context.requestId,
                timestamp: new Date(),
                userId: context.user.id,
                sessionId: context.sessionId,
                originalText: `Investigate person ${input.subjectDetectionId || 'unknown'}`,
                parsedIntent: 'INVESTIGATE_PERSON',
                intentConfidence: 1.0,
                parsedEntities: input.subjectDetectionId ? [
                    { type: 'person', value: input.subjectDetectionId, confidence: 1.0 }
                ] : [],
                authorizationDecision: status === 'DENIED' ? 'DENY' : 'ALLOW',
                command: 'InvestigatePersonCommand',
                commandInput: input,
                resultStatus: status,
                verified: false,
                durationMs
            });
        }
        catch (auditError) {
            console.error('[InvestigatePersonCommand] Failed to audit:', auditError);
        }
    }
}
