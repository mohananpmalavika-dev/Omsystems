/**
 * Core command execution contracts for AI Assistant
 *
 * These types enforce the principle that no assistant handler may produce
 * operational claims without domain service verification.
 */
/**
 * Standard error codes
 */
export var AssistantErrorCode;
(function (AssistantErrorCode) {
    // Resource errors
    AssistantErrorCode["RESOURCE_NOT_FOUND"] = "RESOURCE_NOT_FOUND";
    AssistantErrorCode["AMBIGUOUS_RESOURCE"] = "AMBIGUOUS_RESOURCE";
    AssistantErrorCode["RESOURCE_UNAVAILABLE"] = "RESOURCE_UNAVAILABLE";
    // Authorization errors
    AssistantErrorCode["FORBIDDEN"] = "FORBIDDEN";
    AssistantErrorCode["INSUFFICIENT_PERMISSION"] = "INSUFFICIENT_PERMISSION";
    // Service errors
    AssistantErrorCode["SERVICE_UNAVAILABLE"] = "SERVICE_UNAVAILABLE";
    AssistantErrorCode["SERVICE_TIMEOUT"] = "SERVICE_TIMEOUT";
    AssistantErrorCode["COMMAND_REJECTED"] = "COMMAND_REJECTED";
    // Verification errors
    AssistantErrorCode["VERIFICATION_TIMEOUT"] = "VERIFICATION_TIMEOUT";
    AssistantErrorCode["VERIFICATION_FAILED"] = "VERIFICATION_FAILED";
    AssistantErrorCode["STATE_MISMATCH"] = "STATE_MISMATCH";
    // Input errors
    AssistantErrorCode["INVALID_ARGUMENT"] = "INVALID_ARGUMENT";
    AssistantErrorCode["MISSING_REQUIRED_FIELD"] = "MISSING_REQUIRED_FIELD";
    // Intent errors
    AssistantErrorCode["UNSUPPORTED_INTENT"] = "UNSUPPORTED_INTENT";
    AssistantErrorCode["CAPABILITY_UNAVAILABLE"] = "CAPABILITY_UNAVAILABLE";
    AssistantErrorCode["NOT_IMPLEMENTED"] = "NOT_IMPLEMENTED";
    // General errors
    AssistantErrorCode["INTERNAL_ERROR"] = "INTERNAL_ERROR";
    AssistantErrorCode["UNKNOWN_ERROR"] = "UNKNOWN_ERROR";
})(AssistantErrorCode || (AssistantErrorCode = {}));
/**
 * Helper class for creating command results
 * Enforces evidence requirements
 */
export class CommandResultBuilder {
    /**
     * Create a verified success result
     * Requires evidence to prevent false claims
     */
    static verifiedSuccess(data, evidence) {
        if (!evidence || evidence.length === 0) {
            throw new Error('Verified success results require evidence. ' +
                'Cannot claim success without proof from domain services.');
        }
        return {
            status: 'SUCCESS',
            verified: true,
            data,
            evidence
        };
    }
    /**
     * Create an unverified/partial success result
     * For operations accepted but not confirmed
     */
    static unverifiedSuccess(reason, data, evidence) {
        return {
            status: 'PARTIAL',
            verified: false,
            data,
            reason,
            evidence
        };
    }
    /**
     * Create a failure result
     */
    static failure(code, message, options) {
        const status = code === AssistantErrorCode.FORBIDDEN ||
            code === AssistantErrorCode.INSUFFICIENT_PERMISSION
            ? 'DENIED'
            : code === AssistantErrorCode.AMBIGUOUS_RESOURCE
                ? 'AMBIGUOUS'
                : code === AssistantErrorCode.SERVICE_UNAVAILABLE ||
                    code === AssistantErrorCode.CAPABILITY_UNAVAILABLE
                    ? 'UNAVAILABLE'
                    : 'FAILED';
        return {
            status,
            verified: false,
            code,
            message,
            retryable: options?.retryable,
            choices: options?.choices
        };
    }
}
/**
 * Risk classification for commands
 * Determines authorization and confidence requirements
 */
export var CommandRisk;
(function (CommandRisk) {
    /** Read-only operations */
    CommandRisk["READ_ONLY"] = "READ_ONLY";
    /** Operations with side effects */
    CommandRisk["SIDE_EFFECT"] = "SIDE_EFFECT";
    /** Destructive operations */
    CommandRisk["DESTRUCTIVE"] = "DESTRUCTIVE";
})(CommandRisk || (CommandRisk = {}));
