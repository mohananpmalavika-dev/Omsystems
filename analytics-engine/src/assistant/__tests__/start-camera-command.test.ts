/**
 * Tests for StartCameraCommand
 * 
 * Critical tests to prevent false confirmation of camera start operations.
 */

import { StartCameraCommand } from '../commands/camera/start-camera.command.js';
import type { CameraService, CameraControlService } from '../services/camera-service.interface.js';
import type { AuthorizationService } from '../types/authorization.js';
import type { AssistantAuditService } from '../types/audit.js';
import type { AssistantContext } from '../types/assistant-command.js';

describe('StartCameraCommand', () => {
  let command: StartCameraCommand;
  let cameraService: jest.Mocked<CameraService>;
  let cameraControl: jest.Mocked<CameraControlService>;
  let authorization: jest.Mocked<AuthorizationService>;
  let audit: jest.Mocked<AssistantAuditService>;
  let context: AssistantContext;
  
  beforeEach(() => {
    cameraService = {
      resolve: jest.fn(),
      getById: jest.fn(),
      findByLocation: jest.fn(),
      findBySite: jest.fn(),
      getRuntimeState: jest.fn(),
      list: jest.fn()
    };
    
    cameraControl = {
      startAndVerify: jest.fn(),
      stopAndVerify: jest.fn(),
      restart: jest.fn(),
      start: jest.fn(),
      stop: jest.fn()
    };
    
    authorization = {
      can: jest.fn(),
      assert: jest.fn()
    };
    
    audit = {
      record: jest.fn().mockResolvedValue(undefined),
      query: jest.fn()
    };
    
    command = new StartCameraCommand(
      cameraService,
      cameraControl,
      authorization,
      audit
    );
    
    context = {
      user: {
        id: 'user_123',
        roles: ['operator'],
        siteIds: ['site_main']
      },
      sessionId: 'session_abc',
      requestId: 'req_xyz',
      timestamp: new Date()
    };
  });
  
  describe('resource resolution', () => {
    it('fails when camera is not found', async () => {
      cameraService.resolve.mockResolvedValue({
        found: false,
        ambiguous: false
      });
      
      const result = await command.execute(
        { cameraReference: 'camera 999' },
        context
      );
      
      expect(result.status).toBe('FAILED');
      expect(result.verified).toBe(false);
      expect(result.code).toBe('RESOURCE_NOT_FOUND');
      expect(result.message).toContain('not found');
    });
    
    it('fails when multiple cameras match', async () => {
      cameraService.resolve.mockResolvedValue({
        found: true,
        ambiguous: true,
        matches: [
          { id: 'cam_1', name: 'Lobby East', siteId: 'site_main', status: 'ONLINE' as const },
          { id: 'cam_2', name: 'Lobby West', siteId: 'site_main', status: 'ONLINE' as const }
        ]
      });
      
      const result = await command.execute(
        { cameraReference: 'lobby' },
        context
      );
      
      expect(result.status).toBe('AMBIGUOUS');
      expect(result.verified).toBe(false);
      expect(result.code).toBe('AMBIGUOUS_RESOURCE');
      expect(result.choices).toHaveLength(2);
    });
  });
  
  describe('authorization', () => {
    it('fails when user is not authorized', async () => {
      cameraService.resolve.mockResolvedValue({
        found: true,
        ambiguous: false,
        camera: { id: 'cam_5', name: 'Camera 5', siteId: 'site_main', status: 'OFFLINE' as const }
      });
      
      authorization.can.mockResolvedValue({
        allowed: false,
        reason: 'Insufficient permissions'
      });
      
      const result = await command.execute(
        { cameraReference: 'camera 5' },
        context
      );
      
      expect(result.status).toBe('DENIED');
      expect(result.verified).toBe(false);
      expect(result.code).toBe('FORBIDDEN');
      expect(authorization.can).toHaveBeenCalledWith({
        actor: context.user,
        action: 'camera.start',
        resource: {
          type: 'camera',
          id: 'cam_5',
          siteId: 'site_main'
        }
      });
    });
  });
  
  describe('camera already running', () => {
    it('returns verified success when camera is already online', async () => {
      cameraService.resolve.mockResolvedValue({
        found: true,
        ambiguous: false,
        camera: { id: 'cam_5', name: 'Camera 5', siteId: 'site_main', status: 'ONLINE' as const }
      });
      
      authorization.can.mockResolvedValue({ allowed: true });
      
      cameraService.getRuntimeState.mockResolvedValue({
        cameraId: 'cam_5',
        status: 'ONLINE' as const,
        streamConnected: true,
        recordingActive: true,
        analyticsActive: true
      });
      
      const result = await command.execute(
        { cameraReference: 'camera 5' },
        context
      );
      
      expect(result.status).toBe('SUCCESS');
      expect(result.verified).toBe(true);
      expect(result.data.currentState).toBe('ONLINE');
      expect(result.evidence).toHaveLength(1);
      expect(result.evidence![0].source).toBe('camera-service');
      
      // Should NOT call camera control
      expect(cameraControl.startAndVerify).not.toHaveBeenCalled();
    });
  });
  
  describe('service execution', () => {
    beforeEach(() => {
      cameraService.resolve.mockResolvedValue({
        found: true,
        ambiguous: false,
        camera: { id: 'cam_5', name: 'Camera 5', siteId: 'site_main', status: 'OFFLINE' as const }
      });
      
      authorization.can.mockResolvedValue({ allowed: true });
      
      cameraService.getRuntimeState.mockResolvedValue({
        cameraId: 'cam_5',
        status: 'OFFLINE' as const,
        streamConnected: false,
        recordingActive: false,
        analyticsActive: false
      });
    });
    
    it('does NOT report success when service fails', async () => {
      cameraControl.startAndVerify.mockRejectedValue(new Error('Service unavailable'));
      
      const result = await command.execute(
        { cameraReference: 'camera 5' },
        context
      );
      
      expect(result.status).toBe('FAILED');
      expect(result.verified).toBe(false);
      expect(result.code).toBe('SERVICE_UNAVAILABLE');
    });
    
    it('does NOT report success when command is rejected', async () => {
      cameraControl.startAndVerify.mockResolvedValue({
        operationId: 'op_123',
        cameraId: 'cam_5',
        requestedState: 'ONLINE' as const,
        previousState: 'OFFLINE' as const,
        accepted: false,
        reason: 'Camera offline',
        verified: false,
        finalState: 'OFFLINE' as const,
        streamConnected: false
      });
      
      const result = await command.execute(
        { cameraReference: 'camera 5' },
        context
      );
      
      expect(result.status).toBe('FAILED');
      expect(result.verified).toBe(false);
      expect(result.code).toBe('COMMAND_REJECTED');
    });
    
    it('returns PARTIAL when command accepted but not verified', async () => {
      cameraControl.startAndVerify.mockResolvedValue({
        operationId: 'op_123',
        cameraId: 'cam_5',
        requestedState: 'ONLINE' as const,
        previousState: 'OFFLINE' as const,
        accepted: true,
        verified: false,
        finalState: 'STARTING' as const,
        streamConnected: false
      });
      
      const result = await command.execute(
        { cameraReference: 'camera 5' },
        context
      );
      
      expect(result.status).toBe('PARTIAL');
      expect(result.verified).toBe(false);
      expect(result.reason).toContain('not be verified');
    });
    
    it('returns verified SUCCESS only when state is confirmed', async () => {
      cameraControl.startAndVerify.mockResolvedValue({
        operationId: 'op_123',
        cameraId: 'cam_5',
        requestedState: 'ONLINE' as const,
        previousState: 'OFFLINE' as const,
        accepted: true,
        verified: true,
        finalState: 'ONLINE' as const,
        streamConnected: true
      });
      
      const result = await command.execute(
        { cameraReference: 'camera 5' },
        context
      );
      
      expect(result.status).toBe('SUCCESS');
      expect(result.verified).toBe(true);
      expect(result.data.verified).toBe(true);
      expect(result.data.currentState).toBe('ONLINE');
      expect(result.data.streamConnected).toBe(true);
      expect(result.evidence).toHaveLength(1);
      expect(result.evidence![0].recordIds).toContain('op_123');
    });
  });
  
  describe('audit trail', () => {
    it('audits all operations with evidence', async () => {
      cameraService.resolve.mockResolvedValue({
        found: true,
        ambiguous: false,
        camera: { id: 'cam_5', name: 'Camera 5', siteId: 'site_main', status: 'OFFLINE' as const }
      });
      
      authorization.can.mockResolvedValue({ allowed: true });
      
      cameraService.getRuntimeState.mockResolvedValue({
        cameraId: 'cam_5',
        status: 'OFFLINE' as const,
        streamConnected: false,
        recordingActive: false,
        analyticsActive: false
      });
      
      cameraControl.startAndVerify.mockResolvedValue({
        operationId: 'op_123',
        cameraId: 'cam_5',
        requestedState: 'ONLINE' as const,
        previousState: 'OFFLINE' as const,
        accepted: true,
        verified: true,
        finalState: 'ONLINE' as const,
        streamConnected: true
      });
      
      await command.execute({ cameraReference: 'camera 5' }, context);
      
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user_123',
          parsedIntent: 'CAMERA_START',
          authorizationDecision: 'ALLOW',
          command: 'StartCameraCommand',
          resultStatus: 'SUCCESS',
          verified: true,
          evidenceIds: expect.arrayContaining(['cam_5']),
          operationIds: expect.arrayContaining(['op_123'])
        })
      );
    });
  });
  
  describe('idempotency', () => {
    it('includes idempotency key in service call', async () => {
      cameraService.resolve.mockResolvedValue({
        found: true,
        ambiguous: false,
        camera: { id: 'cam_5', name: 'Camera 5', siteId: 'site_main', status: 'OFFLINE' as const }
      });
      
      authorization.can.mockResolvedValue({ allowed: true });
      
      cameraService.getRuntimeState.mockResolvedValue({
        cameraId: 'cam_5',
        status: 'OFFLINE' as const,
        streamConnected: false,
        recordingActive: false,
        analyticsActive: false
      });
      
      cameraControl.startAndVerify.mockResolvedValue({
        operationId: 'op_123',
        cameraId: 'cam_5',
        requestedState: 'ONLINE' as const,
        previousState: 'OFFLINE' as const,
        accepted: true,
        verified: true,
        finalState: 'ONLINE' as const,
        streamConnected: true
      });
      
      await command.execute({ cameraReference: 'camera 5' }, context);
      
      expect(cameraControl.startAndVerify).toHaveBeenCalledWith(
        'cam_5',
        expect.objectContaining({
          idempotencyKey: `${context.sessionId}:${context.requestId}:start:cam_5`
        })
      );
    });
  });
});
