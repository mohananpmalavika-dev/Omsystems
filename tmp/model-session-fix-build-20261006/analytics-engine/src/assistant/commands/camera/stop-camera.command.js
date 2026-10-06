/**
 * Stop Camera Command
 *
 * Implements camera stop with proper verification.
 * Mirrors start camera logic with stop-specific handling.
 */
import { CommandResultBuilder } from '../../types/index.js';
/**
 * Stop Camera Command
 */
export class StopCameraCommand {
    cameraService;
    cameraControl;
    authorization;
    audit;
    constructor(cameraService, cameraControl, authorization, audit) {
        this.cameraService = cameraService;
        this.cameraControl = cameraControl;
        this.authorization = authorization;
        this.audit = audit;
    }
    async execute(input, context) {
        const startTime = Date.now();
        try {
            // Resolve camera
            const resolution = await this.cameraService.resolve(input.cameraReference);
            if (!resolution.found) {
                await this.auditFailure(context, input, 'CAMERA_NOT_FOUND', Date.now() - startTime);
                return CommandResultBuilder.failure('RESOURCE_NOT_FOUND', `Camera "${input.cameraReference}" was not found.`, { retryable: false });
            }
            if (resolution.ambiguous) {
                await this.auditFailure(context, input, 'AMBIGUOUS_CAMERA', Date.now() - startTime);
                return CommandResultBuilder.failure('AMBIGUOUS_RESOURCE', `Multiple cameras match "${input.cameraReference}". Please be more specific.`, {
                    retryable: false,
                    choices: resolution.matches?.map(cam => ({
                        id: cam.id,
                        label: cam.name,
                        description: cam.location ? `Location: ${cam.location}` : undefined
                    }))
                });
            }
            const camera = resolution.camera;
            // Check authorization
            const authDecision = await this.authorization.can({
                actor: context.user,
                action: 'camera.stop',
                resource: {
                    type: 'camera',
                    id: camera.id,
                    siteId: camera.siteId
                }
            });
            if (!authDecision.allowed) {
                await this.audit.record({
                    eventId: `audit_${Date.now()}`,
                    requestId: context.requestId,
                    timestamp: new Date(),
                    userId: context.user.id,
                    sessionId: context.sessionId,
                    originalText: `Stop camera ${input.cameraReference}`,
                    parsedIntent: 'CAMERA_STOP',
                    intentConfidence: 1.0,
                    parsedEntities: [{ type: 'camera', value: input.cameraReference, confidence: 1.0 }],
                    resolvedResources: [{ type: 'camera', id: camera.id, name: camera.name }],
                    authorizationDecision: 'DENY',
                    authorizationReason: authDecision.reason,
                    command: 'StopCameraCommand',
                    commandInput: input,
                    resultStatus: 'DENIED',
                    verified: false,
                    durationMs: Date.now() - startTime
                });
                return CommandResultBuilder.failure('FORBIDDEN', authDecision.reason || 'You are not authorized to control this camera.', { retryable: false });
            }
            // Check current state
            const currentState = await this.cameraService.getRuntimeState(camera.id);
            // If already stopped, return success
            if (currentState.status === 'OFFLINE') {
                const evidence = [{
                        source: 'camera-service',
                        recordIds: [camera.id],
                        queriedAt: new Date()
                    }];
                await this.audit.record({
                    eventId: `audit_${Date.now()}`,
                    requestId: context.requestId,
                    timestamp: new Date(),
                    userId: context.user.id,
                    sessionId: context.sessionId,
                    originalText: `Stop camera ${input.cameraReference}`,
                    parsedIntent: 'CAMERA_STOP',
                    intentConfidence: 1.0,
                    parsedEntities: [{ type: 'camera', value: input.cameraReference, confidence: 1.0 }],
                    resolvedResources: [{ type: 'camera', id: camera.id, name: camera.name }],
                    authorizationDecision: 'ALLOW',
                    command: 'StopCameraCommand',
                    commandInput: input,
                    resultStatus: 'SUCCESS',
                    verified: true,
                    evidenceIds: [camera.id],
                    durationMs: Date.now() - startTime
                });
                return CommandResultBuilder.verifiedSuccess({
                    camera,
                    operationId: 'n/a',
                    previousState: currentState.status,
                    currentState: 'OFFLINE',
                    verified: true
                }, evidence);
            }
            // Execute stop command
            try {
                const result = await this.cameraControl.stopAndVerify(camera.id, {
                    timeoutMs: 10000,
                    idempotencyKey: `${context.sessionId}:${context.requestId}:stop:${camera.id}`
                });
                const evidence = [{
                        source: 'camera-control-service',
                        recordIds: [camera.id, result.operationId],
                        queriedAt: new Date(),
                        queryDetails: {
                            operationId: result.operationId,
                            accepted: result.accepted,
                            verified: result.verified
                        }
                    }];
                if (!result.accepted) {
                    await this.audit.record({
                        eventId: `audit_${Date.now()}`,
                        requestId: context.requestId,
                        timestamp: new Date(),
                        userId: context.user.id,
                        sessionId: context.sessionId,
                        originalText: `Stop camera ${input.cameraReference}`,
                        parsedIntent: 'CAMERA_STOP',
                        intentConfidence: 1.0,
                        parsedEntities: [{ type: 'camera', value: input.cameraReference, confidence: 1.0 }],
                        resolvedResources: [{ type: 'camera', id: camera.id, name: camera.name }],
                        authorizationDecision: 'ALLOW',
                        command: 'StopCameraCommand',
                        commandInput: input,
                        resultStatus: 'FAILED',
                        verified: false,
                        operationIds: [result.operationId],
                        errorCode: 'COMMAND_REJECTED',
                        durationMs: Date.now() - startTime
                    });
                    return CommandResultBuilder.failure('COMMAND_REJECTED', result.reason || 'Camera rejected the stop request.', { retryable: true });
                }
                if (result.verified) {
                    await this.audit.record({
                        eventId: `audit_${Date.now()}`,
                        requestId: context.requestId,
                        timestamp: new Date(),
                        userId: context.user.id,
                        sessionId: context.sessionId,
                        originalText: `Stop camera ${input.cameraReference}`,
                        parsedIntent: 'CAMERA_STOP',
                        intentConfidence: 1.0,
                        parsedEntities: [{ type: 'camera', value: input.cameraReference, confidence: 1.0 }],
                        resolvedResources: [{ type: 'camera', id: camera.id, name: camera.name }],
                        authorizationDecision: 'ALLOW',
                        command: 'StopCameraCommand',
                        commandInput: input,
                        resultStatus: 'SUCCESS',
                        verified: true,
                        evidenceIds: [camera.id],
                        operationIds: [result.operationId],
                        durationMs: Date.now() - startTime
                    });
                    return CommandResultBuilder.verifiedSuccess({
                        camera,
                        operationId: result.operationId,
                        previousState: result.previousState,
                        currentState: result.finalState,
                        verified: true
                    }, evidence);
                }
                else {
                    await this.audit.record({
                        eventId: `audit_${Date.now()}`,
                        requestId: context.requestId,
                        timestamp: new Date(),
                        userId: context.user.id,
                        sessionId: context.sessionId,
                        originalText: `Stop camera ${input.cameraReference}`,
                        parsedIntent: 'CAMERA_STOP',
                        intentConfidence: 1.0,
                        parsedEntities: [{ type: 'camera', value: input.cameraReference, confidence: 1.0 }],
                        resolvedResources: [{ type: 'camera', id: camera.id, name: camera.name }],
                        authorizationDecision: 'ALLOW',
                        command: 'StopCameraCommand',
                        commandInput: input,
                        resultStatus: 'PARTIAL',
                        verified: false,
                        operationIds: [result.operationId],
                        durationMs: Date.now() - startTime
                    });
                    return CommandResultBuilder.unverifiedSuccess(`The stop request was accepted for ${camera.name}, but the stopped state could not be verified within the timeout period.`, {
                        camera,
                        operationId: result.operationId,
                        previousState: result.previousState,
                        currentState: result.finalState,
                        verified: false
                    }, evidence);
                }
            }
            catch (error) {
                await this.auditFailure(context, input, 'CAMERA_CONTROL_FAILED', Date.now() - startTime);
                return CommandResultBuilder.failure('SERVICE_UNAVAILABLE', 'Camera control service failed. Please try again.', { retryable: true });
            }
        }
        catch (error) {
            console.error('[StopCameraCommand] Unexpected error:', error);
            await this.auditFailure(context, input, 'INTERNAL_ERROR', Date.now() - startTime);
            return CommandResultBuilder.failure('INTERNAL_ERROR', 'An unexpected error occurred while stopping the camera.', { retryable: true });
        }
    }
    async auditFailure(context, input, errorCode, durationMs) {
        try {
            await this.audit.record({
                eventId: `audit_${Date.now()}`,
                requestId: context.requestId,
                timestamp: new Date(),
                userId: context.user.id,
                sessionId: context.sessionId,
                originalText: `Stop camera ${input.cameraReference}`,
                parsedIntent: 'CAMERA_STOP',
                intentConfidence: 1.0,
                parsedEntities: [{ type: 'camera', value: input.cameraReference, confidence: 1.0 }],
                authorizationDecision: 'NOT_REQUIRED',
                command: 'StopCameraCommand',
                commandInput: input,
                resultStatus: 'FAILED',
                verified: false,
                errorCode,
                durationMs
            });
        }
        catch (auditError) {
            console.error('[StopCameraCommand] Failed to audit failure:', auditError);
        }
    }
}
