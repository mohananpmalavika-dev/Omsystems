/**
 * Tests for SystemStatusCommand
 * 
 * Ensures system status never reports invented metrics and handles UNKNOWN states.
 */

import { SystemStatusCommand } from '../commands/system/system-status.command.js';
import type { SystemHealthService } from '../services/system-health-service.interface.js';
import type { AuthorizationService } from '../types/authorization.js';
import type { AssistantAuditService } from '../types/audit.js';
import type { AssistantContext } from '../types/assistant-command.js';

describe('SystemStatusCommand', () => {
  let command: SystemStatusCommand;
  let systemHealth: jest.Mocked<SystemHealthService>;
  let authorization: jest.Mocked<AuthorizationService>;
  let audit: jest.Mocked<AssistantAuditService>;
  let context: AssistantContext;
  
  beforeEach(() => {
    systemHealth = {
      getSnapshot: jest.fn(),
      getCameraHealth: jest.fn(),
      getIncidentSummary: jest.fn(),
      getStorageHealth: jest.fn(),
      getDetectionPipelineHealth: jest.fn()
    };
    
    authorization = {
      can: jest.fn(),
      assert: jest.fn()
    };
    
    audit = {
      record: jest.fn().mockResolvedValue(undefined),
      query: jest.fn()
    };
    
    command = new SystemStatusCommand(
      systemHealth,
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
  
  describe('real health data', () => {
    it('returns actual health snapshot from service', async () => {
      authorization.can.mockResolvedValue({ allowed: true });
      
      const snapshot = {
        timestamp: new Date(),
        overall: 'HEALTHY' as const,
        cameras: {
          total: 50,
          online: 48,
          offline: 2,
          degraded: 0,
          starting: 0,
          error: 0
        },
        detection: {
          healthy: true,
          processingLagMs: 125
        },
        incidents: {
          open: 3,
          critical: 0,
          high: 1,
          medium: 2,
          low: 0
        },
        storage: {
          healthy: true,
          usedBytes: 5000000000000,
          totalBytes: 10000000000000,
          usedPercentage: 50
        }
      };
      
      systemHealth.getSnapshot.mockResolvedValue(snapshot);
      
      const result = await command.execute({}, context);
      
      expect(result.status).toBe('SUCCESS');
      expect(result.verified).toBe(true);
      expect(result.data.snapshot).toEqual(snapshot);
      
      // Summary should reflect actual data
      expect(result.data.summary.camerasSummary).toContain('48/50');
      expect(result.data.summary.incidentsSummary).toContain('3 open');
    });
    
    it('does NOT return hardcoded values', async () => {
      authorization.can.mockResolvedValue({ allowed: true });
      
      systemHealth.getSnapshot.mockResolvedValue({
        timestamp: new Date(),
        overall: 'DEGRADED' as const,
        cameras: {
          total: 10,
          online: 7,
          offline: 3,
          degraded: 0,
          starting: 0,
          error: 0
        },
        detection: {
          healthy: false,
          processingLagMs: 5000
        },
        incidents: {
          open: 15,
          critical: 2,
          high: 5,
          medium: 8,
          low: 0
        },
        storage: {
          healthy: false,
          usedBytes: 9000000000000,
          totalBytes: 10000000000000,
          usedPercentage: 90
        }
      });
      
      const result = await command.execute({}, context);
      
      // Should NOT contain hardcoded values from original implementation
      expect(result.data.snapshot.cameras.total).not.toBe(147); // original fake value
      expect(result.data.snapshot.cameras.online).not.toBe(150); // original fake value
      expect(result.data.snapshot.incidents.open).not.toBe(3); // matches but coincidence
      
      // Should contain actual values from mock
      expect(result.data.snapshot.cameras.total).toBe(10);
      expect(result.data.snapshot.cameras.online).toBe(7);
      expect(result.data.snapshot.incidents.open).toBe(15);
    });
  });
  
  describe('service unavailable', () => {
    it('fails when health service is unavailable', async () => {
      authorization.can.mockResolvedValue({ allowed: true });
      
      systemHealth.getSnapshot.mockRejectedValue(new Error('Service down'));
      
      const result = await command.execute({}, context);
      
      expect(result.status).toBe('FAILED');
      expect(result.verified).toBe(false);
      expect(result.code).toBe('SERVICE_UNAVAILABLE');
    });
    
    it('does NOT return success with invented health data', async () => {
      authorization.can.mockResolvedValue({ allowed: true });
      
      systemHealth.getSnapshot.mockRejectedValue(new Error('Database timeout'));
      
      const result = await command.execute({}, context);
      
      // Should fail, not succeed with fake data
      expect(result.status).toBe('FAILED');
      expect(result.data).toBeUndefined();
    });
  });
  
  describe('UNKNOWN state handling', () => {
    it('explicitly handles UNKNOWN overall status', async () => {
      authorization.can.mockResolvedValue({ allowed: true });
      
      systemHealth.getSnapshot.mockResolvedValue({
        timestamp: new Date(),
        overall: 'UNKNOWN' as const,
        cameras: {
          total: 0,
          online: 0,
          offline: 0,
          degraded: 0,
          starting: 0,
          error: 0
        },
        detection: {
          healthy: false,
          processingLagMs: null
        },
        incidents: {
          open: 0,
          critical: 0,
          high: 0,
          medium: 0,
          low: 0
        },
        storage: {
          healthy: false,
          usedBytes: 0,
          totalBytes: 0,
          usedPercentage: 0
        }
      });
      
      const result = await command.execute({}, context);
      
      expect(result.status).toBe('SUCCESS');
      expect(result.verified).toBe(true);
      expect(result.data.snapshot.overall).toBe('UNKNOWN');
      expect(result.data.summary.overall).toContain('unknown');
    });
    
    it('handles null processing lag gracefully', async () => {
      authorization.can.mockResolvedValue({ allowed: true });
      
      systemHealth.getSnapshot.mockResolvedValue({
        timestamp: new Date(),
        overall: 'HEALTHY' as const,
        cameras: {
          total: 5,
          online: 5,
          offline: 0,
          degraded: 0,
          starting: 0,
          error: 0
        },
        detection: {
          healthy: false,
          processingLagMs: null // Cannot determine lag
        },
        incidents: {
          open: 0,
          critical: 0,
          high: 0,
          medium: 0,
          low: 0
        },
        storage: {
          healthy: true,
          usedBytes: 1000000000,
          totalBytes: 10000000000,
          usedPercentage: 10
        }
      });
      
      const result = await command.execute({}, context);
      
      expect(result.data.summary.detectionSummary).toContain('unknown');
    });
  });
  
  describe('authorization', () => {
    it('fails when user is not authorized', async () => {
      authorization.can.mockResolvedValue({
        allowed: false,
        reason: 'View-only access'
      });
      
      const result = await command.execute({}, context);
      
      expect(result.status).toBe('DENIED');
      expect(result.verified).toBe(false);
      expect(result.code).toBe('FORBIDDEN');
    });
  });
});
