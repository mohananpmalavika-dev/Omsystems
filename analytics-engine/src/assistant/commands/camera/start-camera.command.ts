/**
 * Start Camera Command
 * 
 * Implements camera start with proper:
 * 1. Resource resolution
 * 2. Authorization
 * 3. Service execution
 * 4. State verification
 * 5. Audit trail
 * 
 * This replaces the fake camera control that claimed success without
 * actually starting anything.
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
  CameraService,
  CameraControlService,
  Camera
} from '../../services/camera-service.interface.js';

/**
 * Start camera input
 */
export interface StartCameraInput {
  /** Camera reference (ID, name, or partial match) */
  cameraReference: string;
}

/**
 * Start camera result
 */
export interface StartCameraResult {
  camera: Camera;
  operationId: string;
  previousState: string;
  currentState: string;
  verified: boolean;
  streamConnected: boolean;
}

/**
 * Start Camera Command
 */
export class StartCameraCommand implements AssistantCommand<StartCameraInput, StartCameraResult> {
  constructor(
    private cameraService: CameraService,
    private cameraControl: CameraControlService,
    private authorization: AuthorizationService,
    private audit: AssistantAuditService
  ) {}
  
  async execute(
    input: StartCameraInput,
    context: AssistantContext
  ): Promise<CommandResult<StartCameraResult>> {
    const startTime = Date.now();
    
    try {
      // Step 1: Resolve camera reference to actual camera
      const resolution = await this.cameraService.resolve(input.cameraReference);
      
      if (!resolution.found) {
        await this.auditFailure(context, input, 'CAMERA_NOT_FOUND', Date.now() - startTime);
        
        return CommandResultBuilder.failure(
          'RESOURCE_NOT_FOUND' as AssistantErrorCode,
          `Camera "${input.cameraReference}" was not found.`,
          { retryable: false }
        );
      }
      
      if (resolution.ambiguous) {
        await this.auditFailure(context, input, 'AMBIGUOUS_CAMERA', Date.now() - startTime);
        
        return CommandResultBuilder.failure(
          'AMBIGUOUS_RESOURCE' as AssistantErrorCode,
          `Multiple cameras match "${input.cameraReference}". Please be more specific.`,
          {
            retryable: false,
            choices: resolution.matches?.map(cam => ({
              id: cam.id,
              label: cam.name,
              description: cam.location ? `Location: ${cam.location}` : undefined
            }))
          }
        );
      }
      
      const camera = resolution.camera!;
      
      // Step 2: Check authorization
      const authDecision = await this.authorization.can({
        actor: context.user,
        action: 'camera.start',
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
          originalText: `Start camera ${input.cameraReference}`,
          parsedIntent: 'CAMERA_START',
          intentConfidence: 1.0,
          parsedEntities: [{ type: 'camera', value: input.cameraReference, confidence: 1.0 }],
          resolvedResources: [{ type: 'camera', id: camera.id, name: camera.name }],
          authorizationDecision: 'DENY',
          authorizationReason: authDecision.reason,
          command: 'StartCameraCommand',
          commandInput: input,
          resultStatus: 'DENIED',
          verified: false,
          durationMs: Date.now() - startTime
        });
        
        return CommandResultBuilder.failure(
          'FORBIDDEN' as AssistantErrorCode,
          authDecision.reason || 'You are not authorized to control this camera.',
          { retryable: false }
        );
      }
      
      // Step 3: Check current state
      const currentState = await this.cameraService.getRuntimeState(camera.id);
      
      // If already running, return success without action
      if (currentState.status === 'ONLINE' && currentState.streamConnected) {
        const evidence: AssistantEvidence[] = [{
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
          originalText: `Start camera ${input.cameraReference}`,
          parsedIntent: 'CAMERA_START',
          intentConfidence: 1.0,
          parsedEntities: [{ type: 'camera', value: input.cameraReference, confidence: 1.0 }],
          resolvedResources: [{ type: 'camera', id: camera.id, name: camera.name }],
          authorizationDecision: 'ALLOW',
          command: 'StartCameraCommand',
          commandInput: input,
          resultStatus: 'SUCCESS',
          verified: true,
          evidenceIds: [camera.id],
          durationMs: Date.now() - startTime
        });
        
        return CommandResultBuilder.verifiedSuccess(
          {
            camera,
            operationId: 'n/a',
            previousState: currentState.status,
            currentState: 'ONLINE',
            verified: true,
            streamConnected: true
          },
          evidence
        );
      }
      
      // Step 4: Execute start command with verification
      try {
        const result = await this.cameraControl.startAndVerify(camera.id, {
          timeoutMs: 10000,
          idempotencyKey: `${context.sessionId}:${context.requestId}:start:${camera.id}`
        });
        
        const evidence: AssistantEvidence[] = [{
          source: 'camera-control-service',
          recordIds: [camera.id, result.operationId],
          queriedAt: new Date(),
          queryDetails: {
            operationId: result.operationId,
            accepted: result.accepted,
            verified: result.verified
          }
        }];
        
        // Step 5: Handle result based on verification status
        if (!result.accepted) {
          await this.audit.record({
            eventId: `audit_${Date.now()}`,
            requestId: context.requestId,
            timestamp: new Date(),
            userId: context.user.id,
            sessionId: context.sessionId,
            originalText: `Start camera ${input.cameraReference}`,
            parsedIntent: 'CAMERA_START',
            intentConfidence: 1.0,
            parsedEntities: [{ type: 'camera', value: input.cameraReference, confidence: 1.0 }],
            resolvedResources: [{ type: 'camera', id: camera.id, name: camera.name }],
            authorizationDecision: 'ALLOW',
            command: 'StartCameraCommand',
            commandInput: input,
            resultStatus: 'FAILED',
            verified: false,
            operationIds: [result.operationId],
            errorCode: 'COMMAND_REJECTED',
            durationMs: Date.now() - startTime
          });
          
          return CommandResultBuilder.failure(
            'COMMAND_REJECTED' as AssistantErrorCode,
            result.reason || 'Camera rejected the start request.',
            { retryable: true }
          );
        }
        
        if (result.verified) {
          // Fully verified success
          await this.audit.record({
            eventId: `audit_${Date.now()}`,
            requestId: context.requestId,
            timestamp: new Date(),
            userId: context.user.id,
            sessionId: context.sessionId,
            originalText: `Start camera ${input.cameraReference}`,
            parsedIntent: 'CAMERA_START',
            intentConfidence: 1.0,
            parsedEntities: [{ type: 'camera', value: input.cameraReference, confidence: 1.0 }],
            resolvedResources: [{ type: 'camera', id: camera.id, name: camera.name }],
            authorizationDecision: 'ALLOW',
            command: 'StartCameraCommand',
            commandInput: input,
            resultStatus: 'SUCCESS',
            verified: true,
            evidenceIds: [camera.id],
            operationIds: [result.operationId],
            durationMs: Date.now() - startTime
          });
          
          return CommandResultBuilder.verifiedSuccess(
            {
              camera,
              operationId: result.operationId,
              previousState: result.previousState,
              currentState: result.finalState,
              verified: true,
              streamConnected: result.streamConnected
            },
            evidence
          );
        } else {
          // Accepted but not verified
          await this.audit.record({
            eventId: `audit_${Date.now()}`,
            requestId: context.requestId,
            timestamp: new Date(),
            userId: context.user.id,
            sessionId: context.sessionId,
            originalText: `Start camera ${input.cameraReference}`,
            parsedIntent: 'CAMERA_START',
            intentConfidence: 1.0,
            parsedEntities: [{ type: 'camera', value: input.cameraReference, confidence: 1.0 }],
            resolvedResources: [{ type: 'camera', id: camera.id, name: camera.name }],
            authorizationDecision: 'ALLOW',
            command: 'StartCameraCommand',
            commandInput: input,
            resultStatus: 'PARTIAL',
            verified: false,
            operationIds: [result.operationId],
            durationMs: Date.now() - startTime
          });
          
          return CommandResultBuilder.unverifiedSuccess(
            `The start request was accepted for ${camera.name}, but the running state could not be verified within the timeout period.`,
            {
              camera,
              operationId: result.operationId,
              previousState: result.previousState,
              currentState: result.finalState,
              verified: false,
              streamConnected: result.streamConnected
            },
            evidence
          );
        }
        
      } catch (error) {
        await this.auditFailure(context, input, 'CAMERA_CONTROL_FAILED', Date.now() - startTime);
        
        return CommandResultBuilder.failure(
          'SERVICE_UNAVAILABLE' as AssistantErrorCode,
          'Camera control service failed. Please try again.',
          { retryable: true }
        );
      }
      
    } catch (error) {
      console.error('[StartCameraCommand] Unexpected error:', error);
      
      await this.auditFailure(context, input, 'INTERNAL_ERROR', Date.now() - startTime);
      
      return CommandResultBuilder.failure(
        'INTERNAL_ERROR' as AssistantErrorCode,
        'An unexpected error occurred while starting the camera.',
        { retryable: true }
      );
    }
  }
  
  private async auditFailure(
    context: AssistantContext,
    input: StartCameraInput,
    errorCode: string,
    durationMs: number
  ): Promise<void> {
    try {
      await this.audit.record({
        eventId: `audit_${Date.now()}`,
        requestId: context.requestId,
        timestamp: new Date(),
        userId: context.user.id,
        sessionId: context.sessionId,
        originalText: `Start camera ${input.cameraReference}`,
        parsedIntent: 'CAMERA_START',
        intentConfidence: 1.0,
        parsedEntities: [{ type: 'camera', value: input.cameraReference, confidence: 1.0 }],
        authorizationDecision: 'NOT_REQUIRED',
        command: 'StartCameraCommand',
        commandInput: input,
        resultStatus: 'FAILED',
        verified: false,
        errorCode,
        durationMs
      });
    } catch (auditError) {
      console.error('[StartCameraCommand] Failed to audit failure:', auditError);
    }
  }
}
