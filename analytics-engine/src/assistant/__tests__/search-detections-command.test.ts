/**
 * Tests for SearchDetectionsCommand
 * 
 * Ensures search never invents detection IDs and handles zero results truthfully.
 */

import { SearchDetectionsCommand } from '../commands/search/search-detections.command';
import type { DetectionSearchService } from '../services/detection-search-service.interface';
import type { CameraService } from '../services/camera-service.interface';
import type { AuthorizationService } from '../types/authorization';
import type { AssistantAuditService } from '../types/audit';
import type { AssistantContext } from '../types/assistant-command';

describe('SearchDetectionsCommand', () => {
  let command: SearchDetectionsCommand;
  let detectionSearch: jest.Mocked<DetectionSearchService>;
  let cameraService: jest.Mocked<CameraService>;
  let authorization: jest.Mocked<AuthorizationService>;
  let audit: jest.Mocked<AssistantAuditService>;
  let context: AssistantContext;
  
  beforeEach(() => {
    detectionSearch = {
      search: jest.fn(),
      getById: jest.fn(),
      searchSimilar: jest.fn()
    };
    
    cameraService = {
      resolve: jest.fn(),
      getById: jest.fn(),
      findByLocation: jest.fn(),
      findBySite: jest.fn(),
      getRuntimeState: jest.fn(),
      list: jest.fn()
    };
    
    authorization = {
      can: jest.fn(),
      assert: jest.fn()
    };
    
    audit = {
      record: jest.fn().mockResolvedValue(undefined),
      query: jest.fn()
    };
    
    command = new SearchDetectionsCommand(
      detectionSearch,
      cameraService,
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
  
  describe('zero results', () => {
    it('returns verified success with zero results truthfully', async () => {
      authorization.can.mockResolvedValue({ allowed: true });
      
      detectionSearch.search.mockResolvedValue({
        query: {} as any,
        totalResults: 0,
        results: [],
        executionTimeMs: 45,
        queriedAt: new Date()
      });
      
      const result = await command.execute(
        { objectType: 'person', color: 'red' },
        context
      );
      
      expect(result.status).toBe('SUCCESS');
      expect(result.verified).toBe(true);
      expect(result.data.searchResult.totalResults).toBe(0);
      expect(result.data.searchResult.results).toHaveLength(0);
      
      // Evidence should exist even for zero results
      expect(result.evidence).toHaveLength(1);
      expect(result.evidence![0].source).toBe('event-store');
      expect(result.evidence![0].recordIds).toHaveLength(0);
    });
    
    it('does NOT invent fake detection IDs', async () => {
      authorization.can.mockResolvedValue({ allowed: true });
      
      detectionSearch.search.mockResolvedValue({
        query: {} as any,
        totalResults: 0,
        results: [],
        executionTimeMs: 45,
        queriedAt: new Date()
      });
      
      const result = await command.execute(
        { objectType: 'vehicle', color: 'blue' },
        context
      );
      
      const resultIds = result.data.searchResult.results.map((r: any) => r.detectionId);
      
      // Should not contain invented IDs like cam_001, cam_005, etc.
      expect(resultIds).not.toContain('cam_001');
      expect(resultIds).not.toContain('cam_005');
      expect(resultIds).not.toContain('cam_012');
      expect(resultIds).toHaveLength(0);
    });
  });
  
  describe('real results', () => {
    it('returns only detection IDs from service', async () => {
      authorization.can.mockResolvedValue({ allowed: true });
      
      const realResults = [
        {
          detectionId: 'det_abc123',
          cameraId: 'cam_entrance',
          cameraName: 'Main Entrance',
          timestamp: new Date(),
          objectType: 'person',
          confidence: 0.92,
          attributes: { color: 'red' }
        },
        {
          detectionId: 'det_def456',
          cameraId: 'cam_lobby',
          cameraName: 'Lobby',
          timestamp: new Date(),
          objectType: 'person',
          confidence: 0.88,
          attributes: { color: 'red' }
        }
      ];
      
      detectionSearch.search.mockResolvedValue({
        query: {} as any,
        totalResults: 2,
        results: realResults,
        executionTimeMs: 67,
        queriedAt: new Date()
      });
      
      const result = await command.execute(
        { objectType: 'person', color: 'red' },
        context
      );
      
      expect(result.status).toBe('SUCCESS');
      expect(result.verified).toBe(true);
      expect(result.data.searchResult.results).toEqual(realResults);
      
      // Evidence should contain actual detection IDs
      expect(result.evidence![0].recordIds).toContain('det_abc123');
      expect(result.evidence![0].recordIds).toContain('det_def456');
    });
  });
  
  describe('authorization', () => {
    it('fails when user is not authorized', async () => {
      authorization.can.mockResolvedValue({
        allowed: false,
        reason: 'Insufficient permissions'
      });
      
      const result = await command.execute(
        { objectType: 'person' },
        context
      );
      
      expect(result.status).toBe('DENIED');
      expect(result.verified).toBe(false);
      expect(result.code).toBe('FORBIDDEN');
    });
  });
  
  describe('location resolution', () => {
    it('resolves location to camera IDs', async () => {
      authorization.can.mockResolvedValue({ allowed: true });
      
      cameraService.findByLocation.mockResolvedValue([
        { id: 'cam_ent_1', name: 'Entrance 1', siteId: 'site_main', status: 'ONLINE' as const },
        { id: 'cam_ent_2', name: 'Entrance 2', siteId: 'site_main', status: 'ONLINE' as const }
      ]);
      
      detectionSearch.search.mockResolvedValue({
        query: {} as any,
        totalResults: 0,
        results: [],
        executionTimeMs: 45,
        queriedAt: new Date()
      });
      
      await command.execute(
        { location: 'entrance' },
        context
      );
      
      expect(cameraService.findByLocation).toHaveBeenCalledWith('entrance');
      expect(detectionSearch.search).toHaveBeenCalledWith(
        expect.objectContaining({
          cameraIds: ['cam_ent_1', 'cam_ent_2']
        })
      );
    });
    
    it('fails when location has no cameras', async () => {
      authorization.can.mockResolvedValue({ allowed: true });
      
      cameraService.findByLocation.mockResolvedValue([]);
      
      const result = await command.execute(
        { location: 'nonexistent' },
        context
      );
      
      expect(result.status).toBe('FAILED');
      expect(result.code).toBe('RESOURCE_NOT_FOUND');
    });
  });
  
  describe('service failure', () => {
    it('does NOT return success when search service fails', async () => {
      authorization.can.mockResolvedValue({ allowed: true });
      
      detectionSearch.search.mockRejectedValue(new Error('Search service unavailable'));
      
      const result = await command.execute(
        { objectType: 'person' },
        context
      );
      
      expect(result.status).toBe('FAILED');
      expect(result.verified).toBe(false);
      expect(result.code).toBe('SERVICE_UNAVAILABLE');
    });
  });
});
