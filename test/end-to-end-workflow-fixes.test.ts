import { describe, it, expect, vi } from 'vitest';
import { KeyProviderFactory } from '../src/security/keys/key-provider.factory.js';
import { SecurityPostureService } from '../src/security/services/security-posture.service.js';
import {
  TamperProtectionEvidenceCollector,
  TamperConditionEvidenceCollector,
} from '../src/security/collectors/tamper-evidence.collector.js';
import { RCAEngine } from '../src/services/command-center/rca/engine.js';
import type { RootCauseCandidate } from '../src/services/command-center/rca/types.js';
import { IncidentOrchestrator } from '../src/services/incident-orchestrator.service.js';
import { MobileOperationsService } from '../src/mobile/services/mobile-operations.service.js';
import { BranchLifecycleService } from '../src/services/branch-lifecycle.service.js';
import { BranchStatus } from '../src/domain/branch-lifecycle.types.js';

describe('End-to-End Workflow Gap Fixes', () => {
  describe('Domain A: Security & Cryptography', () => {
    it('initializes AWS KMS key provider via KeyProviderFactory and reports capabilities', async () => {
      const provider = await KeyProviderFactory.createProvider({
        type: 'aws-kms',
        region: 'us-east-1',
      });

      expect(provider.getName()).toBe('aws-kms');
      const caps = provider.getCapabilities();
      expect(caps.securityLevel).toBe('REMOTE_HARDWARE_BACKED');
      expect(caps.operations.sign).toBe(true);
      expect(caps.operations.encrypt).toBe(true);
      expect(caps.operations.generateKey).toBe(true);
    });

    it('aggregates live posture, tracks history, and manages issues in SecurityPostureService', async () => {
      const postureService = new SecurityPostureService({
        environment: 'test',
        enforceStrictness: false,
      });

      const posture = await postureService.getPosture({ tenantId: 'tenant-1', timestamp: new Date() });
      expect(posture).toHaveProperty('overall');
      expect(posture).toHaveProperty('score');
      expect(typeof posture.score).toBe('number');

      // Check history
      const history = await postureService.getPostureHistory('tenant-1', 7);
      expect(history.length).toBeGreaterThanOrEqual(1);

      // Resolve issue
      const resolved = await postureService.resolveIssue('tenant-1', 'test-issue-1', { fixedBy: 'admin' });
      expect(resolved.status).toBe('resolved');

      const issues = await postureService.listIssues('tenant-1');
      expect(issues.find((i) => i.id === 'test-issue-1')?.status).toBe('resolved');
    });

    it('collects hardware tamper protection and condition evidence', async () => {
      const protectionCollector = new TamperProtectionEvidenceCollector();
      const conditionCollector = new TamperConditionEvidenceCollector();

      const protection = await protectionCollector.collect({ timestamp: new Date() });
      expect(protection.available).toBe(true);

      const condition = await conditionCollector.collect({ timestamp: new Date() });
      expect(condition.available).toBe(true);
      expect(condition.state).toBe('HEALTHY');
    });
  });

  describe('Domain B: AI Vision & Incident Orchestration', () => {
    it('dispatches verification analytics event in IncidentOrchestrator', async () => {
      const mockStore: any = {
        processAnalyticsEvent: vi.fn().mockResolvedValue({ status: 'ingested', eventId: 'evt-1' }),
        listAccessibleCameras: vi.fn().mockResolvedValue({ cameras: [] }),
        listIncidents: vi.fn().mockResolvedValue([]),
        listIncidentNotes: vi.fn().mockResolvedValue([]),
      };

      const orchestrator = new IncidentOrchestrator(mockStore);
      // invoke private method via any
      await (orchestrator as any).createVerificationAlert(
        {
          cameraId: 'cam-001',
          tenantId: 'tenant-1',
          detectionType: 'loitering',
          timestamp: Date.now(),
          confidence: 0.92,
        },
        { reason: 'Low lighting condition' }
      );

      expect(mockStore.processAnalyticsEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-1',
          cameraId: 'cam-001',
          detectionType: 'loitering',
          metadata: expect.objectContaining({
            requiresVerification: true,
            verificationReason: 'Low lighting condition',
          }),
        })
      );
    });
  });

  describe('Domain C: Command Center RCA & Mobile Operations', () => {
    it('records and correlates historical cases in RCAEngine', async () => {
      const engine = new RCAEngine();

      // Record a historical resolution
      await engine.recordCaseOutcome(
        'diag-101',
        'wan_failure',
        'Failover to backup cellular gateway',
        true,
        15
      );

      const candidate: RootCauseCandidate = {
        code: 'wan_failure',
        label: 'WAN Uplink Failure',
        score: 0.85,
        confidence: 0.9,
        certainty: 'definite' as any,
        supportingEvidence: [],
        contradictingEvidence: [],
        missingEvidence: [],
        affectedEntities: { cameras: 4, dvrs: 1, branches: 1, networks: 1, edgeAgents: 1 },
        temporalPattern: { firstFailure: '', lastFailure: '', timeSpreadSeconds: 0, simultaneousFailures: true },
        explanation: 'ISP gateway timeout',
        recommendedActions: [],
        confidenceDetails: [],
      };

      await (engine as any).enhanceWithHistoricalCases(candidate, []);

      expect(candidate.confidenceDetails.some((d) => d.includes('Historical correlation'))).toBe(true);
      expect(candidate.recommendedActions.some((a) => a.includes('Failover to backup cellular gateway'))).toBe(true);
    });

    it('evaluates technician on-call dynamically in MobileOperationsService', async () => {
      const mockStore: any = {
        getUser: vi.fn().mockImplementation(async (id) => {
          if (id === 'user-1') return { id: 'user-1', username: 'guard', role: 'SOC Operator' };
          return { id: 'user-2', username: 'tech1', role: 'field_technician' };
        }),
        listIncidents: vi.fn().mockResolvedValue([]),
      };

      const mobileService = new MobileOperationsService(mockStore);

      const regularUserContext = await (mobileService as any).getOperatorInfo('tenant-1', 'user-1');
      expect(regularUserContext).toHaveProperty('onCall');

      const techUserContext = await (mobileService as any).getOperatorInfo('tenant-1', 'user-2');
      expect(techUserContext).toHaveProperty('onCall');
    });
  });

  describe('Domain D: User Onboarding & Branch Lifecycle', () => {
    it('evaluates scheduledJobs and activeUsers in BranchLifecycleService impact analysis', async () => {
      const mockStore: any = {
        getOrganizationNodeDetails: vi.fn().mockResolvedValue({
          id: 'branch-1',
          name: 'Downtown Flagship',
          tenantId: 'tenant-1',
          metadata: { lifecycleStatus: BranchStatus.DISABLED },
        }),
        getDescendantNodes: vi.fn().mockResolvedValue([]),
        listAccessibleCameras: vi.fn().mockResolvedValue({ cameras: [] }),
        listIncidents: vi.fn().mockResolvedValue([]),
        listAnalyticsAlerts: vi.fn().mockResolvedValue([]),
      };

      const lifecycleService = new BranchLifecycleService(mockStore);
      const impact = await lifecycleService.getLifecycleImpact(
        'tenant-1',
        'branch-1',
        BranchStatus.ARCHIVED
      );

      expect(impact.impact).toHaveProperty('scheduledJobs');
      expect(impact.impact).toHaveProperty('activeUsers');
      expect(impact.impact).toHaveProperty('cameras');
      expect(impact.impact).toHaveProperty('recorders');
      expect(impact.allowed).toBe(true);
    });
  });
});
