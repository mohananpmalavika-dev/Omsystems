/**
 * Tests for CommandResultBuilder
 * 
 * These tests ensure that the architecture prevents false success claims.
 */

import { CommandResultBuilder, AssistantErrorCode } from '../types/assistant-command.js';

describe('CommandResultBuilder', () => {
  describe('verifiedSuccess', () => {
    it('creates verified success with evidence', () => {
      const data = { message: 'test' };
      const evidence = [{
        source: 'camera-service' as const,
        recordIds: ['cam_001'],
        queriedAt: new Date()
      }];
      
      const result = CommandResultBuilder.verifiedSuccess(data, evidence);
      
      expect(result.status).toBe('SUCCESS');
      expect(result.verified).toBe(true);
      expect(result.data).toEqual(data);
      expect(result.evidence).toEqual(evidence);
    });
    
    it('throws when evidence array is empty', () => {
      const data = { message: 'test' };
      
      expect(() => {
        CommandResultBuilder.verifiedSuccess(data, []);
      }).toThrow('Verified success results require evidence');
    });
    
    it('throws when evidence is undefined', () => {
      const data = { message: 'test' };
      
      expect(() => {
        CommandResultBuilder.verifiedSuccess(data, undefined as any);
      }).toThrow('Verified success results require evidence');
    });
    
    it('throws when evidence is null', () => {
      const data = { message: 'test' };
      
      expect(() => {
        CommandResultBuilder.verifiedSuccess(data, null as any);
      }).toThrow('Verified success results require evidence');
    });
  });
  
  describe('unverifiedSuccess', () => {
    it('creates unverified success with reason', () => {
      const reason = 'Command accepted but not verified';
      const data = { message: 'test' };
      
      const result = CommandResultBuilder.unverifiedSuccess(reason, data);
      
      expect(result.status).toBe('PARTIAL');
      expect(result.verified).toBe(false);
      expect(result.reason).toBe(reason);
      expect(result.data).toEqual(data);
    });
    
    it('allows unverified success without evidence', () => {
      const reason = 'Verification timeout';
      
      const result = CommandResultBuilder.unverifiedSuccess(reason);
      
      expect(result.status).toBe('PARTIAL');
      expect(result.verified).toBe(false);
      expect(result.evidence).toBeUndefined();
    });
  });
  
  describe('failure', () => {
    it('creates failure with code and message', () => {
      const code = AssistantErrorCode.RESOURCE_NOT_FOUND;
      const message = 'Camera not found';
      
      const result = CommandResultBuilder.failure(code, message);
      
      expect(result.status).toBe('FAILED');
      expect(result.verified).toBe(false);
      expect(result.code).toBe(code);
      expect(result.message).toBe(message);
    });
    
    it('maps FORBIDDEN to DENIED status', () => {
      const result = CommandResultBuilder.failure(
        AssistantErrorCode.FORBIDDEN,
        'Not authorized'
      );
      
      expect(result.status).toBe('DENIED');
    });
    
    it('maps AMBIGUOUS_RESOURCE to AMBIGUOUS status', () => {
      const result = CommandResultBuilder.failure(
        AssistantErrorCode.AMBIGUOUS_RESOURCE,
        'Multiple matches'
      );
      
      expect(result.status).toBe('AMBIGUOUS');
    });
    
    it('maps SERVICE_UNAVAILABLE to UNAVAILABLE status', () => {
      const result = CommandResultBuilder.failure(
        AssistantErrorCode.SERVICE_UNAVAILABLE,
        'Service down'
      );
      
      expect(result.status).toBe('UNAVAILABLE');
    });
    
    it('includes retryable flag when provided', () => {
      const result = CommandResultBuilder.failure(
        AssistantErrorCode.SERVICE_TIMEOUT,
        'Timeout',
        { retryable: true }
      );
      
      expect(result.retryable).toBe(true);
    });
    
    it('includes choices for ambiguous results', () => {
      const choices = [
        { id: '1', label: 'Camera 1' },
        { id: '2', label: 'Camera 2' }
      ];
      
      const result = CommandResultBuilder.failure(
        AssistantErrorCode.AMBIGUOUS_RESOURCE,
        'Multiple cameras match',
        { choices }
      );
      
      expect(result.choices).toEqual(choices);
    });
  });
});
