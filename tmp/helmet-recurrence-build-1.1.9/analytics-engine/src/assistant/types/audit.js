/**
 * Assistant audit trail types
 *
 * Every assistant action must be auditable for accountability
 * in surveillance/security contexts.
 */
/**
 * Helper to create audit event from execution
 */
export function createAuditEvent(requestId, context, parsed, execution) {
    return {
        eventId: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        requestId,
        timestamp: new Date(),
        userId: context.user.id,
        sessionId: context.sessionId,
        originalText: parsed.originalQuery,
        parsedIntent: parsed.intent,
        intentConfidence: parsed.confidence,
        parsedEntities: parsed.entities.map(e => ({
            type: e.type,
            value: e.value,
            confidence: e.confidence
        })),
        authorizationDecision: execution.authorizationDecision,
        authorizationReason: execution.authorizationReason,
        command: execution.command,
        commandInput: execution.commandInput,
        resultStatus: execution.resultStatus,
        verified: execution.verified,
        evidenceIds: execution.evidenceIds,
        operationIds: execution.operationIds,
        errorCode: execution.errorCode,
        durationMs: execution.durationMs
    };
}
