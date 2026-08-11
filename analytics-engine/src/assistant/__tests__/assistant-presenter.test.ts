/**
 * Tests for AssistantPresenter
 * 
 * Ensures presenter never invents operational claims.
 */

import { DefaultAssistantPresenter } from '../presentation/assistant-presenter.js';
import type { AssistantEvidence, AssistantErrorCode } from '../types/assistant-command.js';

describe('DefaultAssistantPresenter', () => {
  let presenter: DefaultAssistantPresenter;
  
  beforeEach(() => {
    presenter = new DefaultAssistantPresenter();
  });
  
  describe('formatSuccess', () => {
    it('formats camera start verified success', () => {
      const evidence: AssistantEvidence[] = [{
        source: 'camera-control-service',
        recordIds: ['cam_5', 'op_123'],
        queriedAt: new Date()
      }];
      
      const response = presenter.formatSuccess({
        data: {
          camera: { id: 'cam_5', name: 'Camera 5' },
          verified: true,
          currentState: 'ONLINE',
          streamConnected: true
        },
        evidence,
        intent: 'CAMERA_START'
      });
      
      expect(response.success).toBe(true);
      expect(response.message).toContain('Camera 5');
      expect(response.message).toContain('running');
      expect(response.evidence).toEqual(evidence);
    });
    
    it('never invents data not in result', () => {
      const evidence: AssistantEvidence[] = [{
        source: 'camera-service',
        recordIds: ['cam_5'],
        queriedAt: new Date()
      }];
      
      const response = presenter.formatSuccess({
        data: { someField: 'value' },
        evidence,
        intent: 'UNKNOWN'
      });
      
      // Should not invent operational details
      expect(response.message).not.toContain('Camera');
      expect(response.message).not.toContain('started');
      expect(response.message).not.toContain('running');
    });
  });
  
  describe('formatPartial', () => {
    it('clearly indicates unverified state', () => {
      const response = presenter.formatPartial({
        reason: 'Start command sent but not verified',
        data: { camera: { name: 'Camera 5' } },
        intent: 'CAMERA_START'
      });
      
      expect(response.success).toBe(true);
      expect(response.message).toContain('not verified');
    });
    
    it('does not claim success for unverified operations', () => {
      const response = presenter.formatPartial({
        reason: 'Operation accepted but state unknown',
        intent: 'CAMERA_START'
      });
      
      // Should not say "camera started" or "success"
      expect(response.message.toLowerCase()).not.toMatch(/started|successful/);
    });
  });
  
  describe('formatFailure', () => {
    it('presents clear error messages', () => {
      const response = presenter.formatFailure({
        code: 'RESOURCE_NOT_FOUND' as AssistantErrorCode,
        message: 'Camera not found',
        intent: 'CAMERA_START'
      });
      
      expect(response.success).toBe(false);
      expect(response.message).toBe('Camera not found');
      expect(response.error).toBeDefined();
      expect(response.error!.code).toBe('RESOURCE_NOT_FOUND');
    });
    
    it('includes helpful suggestions', () => {
      const response = presenter.formatFailure({
        code: 'AMBIGUOUS_RESOURCE' as AssistantErrorCode,
        message: 'Multiple cameras match',
        intent: 'CAMERA_START'
      });
      
      expect(response.suggestions).toBeDefined();
      expect(response.suggestions!.length).toBeGreaterThan(0);
    });
  });
  
  describe('formatUnsupported', () => {
    it('indicates operation is not supported', () => {
      const response = presenter.formatUnsupported('UNKNOWN', 'dance a jig');
      
      expect(response.success).toBe(false);
      expect(response.message).toContain('support');
      expect(response.error).toBeDefined();
    });
    
    it('never claims unsupported operation succeeded', () => {
      const response = presenter.formatUnsupported('UNKNOWN', 'do something');
      
      expect(response.success).toBe(false);
    });
  });
  
  describe('system status formatting', () => {
    it('formats real health data accurately', () => {
      const evidence: AssistantEvidence[] = [{
        source: 'system-health-service',
        recordIds: ['health-snapshot'],
        queriedAt: new Date()
      }];
      
      const response = presenter.formatSuccess({
        data: {
          summary: {
            overall: '✅ System is healthy',
            camerasSummary: '48/50 cameras online',
            incidentsSummary: '3 open incidents (1 high priority)',
            storageSummary: 'Storage at 50.0% capacity',
            detectionSummary: 'Detection pipeline healthy (125ms lag)'
          }
        },
        evidence,
        intent: 'SYSTEM_STATUS'
      });
      
      expect(response.message).toContain('48/50 cameras online');
      expect(response.message).toContain('3 open incidents');
      expect(response.message).not.toContain('147'); // original fake value
    });
  });
  
  describe('search results formatting', () => {
    it('accurately reports zero results', () => {
      const evidence: AssistantEvidence[] = [{
        source: 'event-store',
        recordIds: [],
        queriedAt: new Date()
      }];
      
      const response = presenter.formatSuccess({
        data: {
          summary: {
            totalResults: 0,
            query: 'red person detections',
            topMatches: []
          },
          searchResult: {
            totalResults: 0,
            results: []
          }
        },
        evidence,
        intent: 'SEARCH_DETECTIONS'
      });
      
      expect(response.message).toContain('No matches');
      expect(response.message).not.toContain('cam_001'); // fake ID
      expect(response.message).not.toContain('cam_005'); // fake ID
    });
  });
});
