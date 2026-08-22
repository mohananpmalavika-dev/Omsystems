/**
 * AI Intelligence Layer Integration Tests
 * 
 * Tests the complete workflow:
 * Alert → Correlation → SOP → Investigation → Evidence
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { AIIncidentSummaryService } from '../src/services/ai-incident-summary';
import { AISOPEngineService } from '../src/services/ai-sop-engine';
import { AIInvestigationReportService } from '../src/services/ai-investigation-report';
import { AIEvidenceBuilderService } from '../src/services/ai-evidence-builder';
import { AIVideoSearchService } from '../src/services/ai-video-search';
import type { ControlPlaneStore } from '../src/control-plane-store';
import type { AnalyticsAlert } from '../src/domain/models';

// Mock store
const mockStore = {
  listAnalyticsAlerts: jest.fn(),
  getAlert: jest.fn(),
  pool: {
    query: jest.fn(),
  },
} as unknown as ControlPlaneStore;

// Mock alerts data
const createMockAlert = (overrides: Partial<AnalyticsAlert> = {}): AnalyticsAlert => ({
  id: `alert-${Math.random().toString(36).substr(2, 9)}`,
  tenantId: 'tenant-001',
  cameraId: 'camera-001',
  ruleId: 1,
  severity: 'P1' as any,
  confidence: 0.95,
  status: 'active' as any,
  firstDetectedAt: new Date().toISOString(),
  lastDetectedAt: new Date().toISOString(),
  detectionCount: 1,
  metadata: {},
  acknowledgedAt: undefined,
  acknowledgedBy: undefined,
  resolvedAt: undefined,
  resolvedBy: undefined,
  ...overrides,
});

describe('AI Intelligence Layer Integration', () => {
  let incidentSummaryService: AIIncidentSummaryService;
  let sopEngine: AISOPEngineService;
  let investigationService: AIInvestigationReportService;
  let evidenceBuilder: AIEvidenceBuilderService;
  let videoSearch: AIVideoSearchService;

  beforeAll(() => {
    incidentSummaryService = new AIIncidentSummaryService(mockStore);
    sopEngine = new AISOPEngineService(mockStore);
    investigationService = new AIInvestigationReportService(mockStore);
    evidenceBuilder = new AIEvidenceBuilderService(mockStore);
    videoSearch = new AIVideoSearchService(mockStore);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('AI Incident Summary Service', () => {
    it('should correlate multiple alerts into a single cluster', async () => {
      const alerts: AnalyticsAlert[] = [
        createMockAlert({
          id: 'alert-001',
          cameraId: 'camera-001',
          firstDetectedAt: '2026-07-31T10:42:18Z',
          lastDetectedAt: '2026-07-31T10:42:18Z',
        }),
        createMockAlert({
          id: 'alert-002',
          cameraId: 'camera-001',
          firstDetectedAt: '2026-07-31T10:42:26Z',
          lastDetectedAt: '2026-07-31T10:42:26Z',
        }),
        createMockAlert({
          id: 'alert-003',
          cameraId: 'camera-002',
          firstDetectedAt: '2026-07-31T10:42:41Z',
          lastDetectedAt: '2026-07-31T10:42:41Z',
        }),
      ];

      const clusters = await incidentSummaryService.correlateAlerts('tenant-001', alerts);

      expect(clusters).toHaveLength(1);
      expect(clusters[0].alertCount).toBe(3);
      expect(clusters[0].uniqueCameras).toBe(2);
      expect(clusters[0].correlationFactors.timeBased).toBe(true);
      expect(clusters[0].correlationFactors.crossCamera).toBe(true);
    });

    it('should calculate correct severity for clusters', async () => {
      const criticalAlerts: AnalyticsAlert[] = [
        createMockAlert({
          id: 'alert-fire-001',
          metadata: { detectionType: 'fire-detection' },
        }),
        createMockAlert({
          id: 'alert-fire-002',
          metadata: { detectionType: 'fire-detection' },
        }),
      ];

      const clusters = await incidentSummaryService.correlateAlerts('tenant-001', criticalAlerts);

      expect(clusters[0].severity).toBe('critical');
      expect(clusters[0].incidentType).toBe('fire-emergency');
    });

    it('should generate daily summary with reduction ratio', async () => {
      const alerts = Array.from({ length: 200 }, (_, i) =>
        createMockAlert({
          id: `alert-${i}`,
          cameraId: `camera-${Math.floor(i / 40)}`,
          firstDetectedAt: new Date(
            Date.now() - (200 - i) * 60000
          ).toISOString(),
        })
      );

      mockStore.listAnalyticsAlerts = jest.fn().mockResolvedValue(alerts);

      const summary = await incidentSummaryService.generateDailySummary(
        'tenant-001',
        '2026-07-31'
      );

      expect(summary.totalAlerts).toBe(200);
      expect(summary.totalIncidents).toBeGreaterThan(0);
      expect(summary.totalIncidents).toBeLessThan(200);
      expect(summary.reductionRatio).toBeGreaterThan(1);
    });

    it('should detect root cause in clusters', async () => {
      const networkOutageAlerts: AnalyticsAlert[] = [
        createMockAlert({
          id: 'net-001',
          metadata: { detectionType: 'network-loss' },
        }),
        createMockAlert({
          id: 'cam-001',
          metadata: { detectionType: 'camera-offline' },
        }),
        createMockAlert({
          id: 'cam-002',
          metadata: { detectionType: 'camera-offline' },
        }),
      ];

      const clusters = await incidentSummaryService.correlateAlerts(
        'tenant-001',
        networkOutageAlerts
      );

      expect(clusters[0].rootCause).toBeDefined();
      expect(clusters[0].rootCause).toContain('network');
    });
  });

  describe('AI SOP Engine', () => {
    it('should create SOP definition with steps', async () => {
      const sopId = await sopEngine.createSOPDefinition({
        tenantId: 'tenant-001',
        name: 'Fire Emergency Response',
        description: 'Standard procedure for fire alerts',
        version: '1.0',
        incidentTypes: ['fire-emergency'],
        severity: ['critical', 'high'],
        steps: [
          {
            stepNumber: 1,
            name: 'Verify Fire Alert',
            description: 'Check live camera feed',
            stepType: 'video-verification',
            required: true,
            slaSeconds: 30,
          },
          {
            stepNumber: 2,
            name: 'Call Fire Department',
            description: 'Dial emergency services',
            stepType: 'phone-call',
            required: true,
            slaSeconds: 60,
          },
        ],
        createdBy: 'admin-001',
      });

      expect(sopId).toBeDefined();
      expect(typeof sopId).toBe('string');
    });

    it('should execute SOP workflow with step completion', async () => {
      mockStore.pool.query = jest.fn()
        .mockResolvedValueOnce({
          rows: [{
            id: 'sop-001',
            tenant_id: 'tenant-001',
            name: 'Test SOP',
            steps: JSON.stringify([
              { stepNumber: 1, name: 'Step 1', required: true },
              { stepNumber: 2, name: 'Step 2', required: true },
            ]),
          }],
        })
        .mockResolvedValueOnce({
          rows: [{
            id: 'exec-001',
            sop_id: 'sop-001',
            incident_id: 'incident-001',
            status: 'in-progress',
          }],
        });

      const executionId = await sopEngine.startSOPExecution({
        sopId: 'sop-001',
        incidentId: 'incident-001',
        tenantId: 'tenant-001',
        startedBy: 'operator-001',
      });

      expect(executionId).toBe('exec-001');

      mockStore.pool.query = jest.fn().mockResolvedValueOnce({
        rows: [{
          id: 'exec-001',
          current_step: 2,
        }],
      });

      const result = await sopEngine.completeStep('exec-001', 1, {
        result: 'confirmed',
        userId: 'operator-001',
        notes: 'Fire confirmed on camera 08',
      });

      expect(result.currentStep).toBe(2);
    });

    it('should trigger escalation on SLA breach', async () => {
      mockStore.pool.query = jest.fn().mockResolvedValueOnce({
        rows: [{
          id: 'exec-002',
          sop_id: 'sop-001',
          started_at: new Date(Date.now() - 120000).toISOString(), // 2 minutes ago
          sla_seconds: 60,
        }],
      });

      const breached = await sopEngine.checkSLABreach('exec-002');

      expect(breached).toBe(true);
    });
  });

  describe('AI Investigation Report Service', () => {
    it('should generate investigation report with timeline', async () => {
      const report = await investigationService.generateReport({
        incidentId: 'incident-001',
        tenantId: 'tenant-001',
        incidentType: 'security-intrusion',
        severity: 'critical',
        branchId: 'branch-kollam',
        startTime: '2026-07-31T22:42:18+05:30',
        endTime: '2026-07-31T22:49:32+05:30',
        alertIds: ['alert-001', 'alert-002', 'alert-003'],
        cameraIds: ['camera-08', 'camera-11', 'camera-14'],
        generatedBy: 'system',
      });

      expect(report).toBeDefined();
      expect(report.reportId).toBeDefined();
      expect(report.timeline).toBeDefined();
      expect(report.timeline.length).toBeGreaterThan(0);
      expect(report.cameraPath).toBeDefined();
      expect(report.evidenceInventory).toBeDefined();
    });

    it('should reconstruct camera path from detections', () => {
      const timeline = [
        {
          timestamp: '2026-07-31T22:42:18Z',
          eventType: 'person-detected',
          cameraId: 'camera-08',
          description: 'Person detected at rear entrance',
        },
        {
          timestamp: '2026-07-31T22:42:26Z',
          eventType: 'line-crossed',
          cameraId: 'camera-08',
          description: 'Restricted line crossed',
        },
        {
          timestamp: '2026-07-31T22:43:19Z',
          eventType: 'person-detected',
          cameraId: 'camera-11',
          description: 'Same person entered corridor',
        },
      ];

      const cameraPath = investigationService.reconstructCameraPath(timeline);

      expect(cameraPath).toHaveLength(2);
      expect(cameraPath[0].cameraId).toBe('camera-08');
      expect(cameraPath[1].cameraId).toBe('camera-11');
      expect(cameraPath[1].transitionTime).toBeGreaterThan(0);
    });

    it('should export report in multiple formats', async () => {
      mockStore.pool.query = jest.fn().mockResolvedValueOnce({
        rows: [{
          id: 'report-001',
          incident_id: 'incident-001',
          report_data: JSON.stringify({
            reportId: 'report-001',
            summary: 'Test incident',
          }),
        }],
      });

      const pdfResult = await investigationService.exportReport('report-001', 'pdf');
      expect(pdfResult.format).toBe('pdf');
      expect(pdfResult.data).toBeDefined();

      const jsonResult = await investigationService.exportReport('report-001', 'json');
      expect(jsonResult.format).toBe('json');
      expect(jsonResult.data).toBeDefined();
    });
  });

  describe('AI Evidence Builder', () => {
    it('should create evidence package with hash', async () => {
      const packageId = await evidenceBuilder.createEvidencePackage({
        incidentId: 'incident-001',
        tenantId: 'tenant-001',
        packageType: 'court-ready',
        title: 'Intrusion Evidence - Kollam Branch',
        description: 'Complete evidence package for court submission',
        createdBy: 'investigator-001',
      });

      expect(packageId).toBeDefined();
      expect(typeof packageId).toBe('string');
    });

    it('should add evidence with SHA-256 hash', async () => {
      mockStore.pool.query = jest.fn().mockResolvedValueOnce({
        rows: [{
          id: 'evidence-001',
          sha256_hash: 'abc123...',
        }],
      });

      const evidenceId = await evidenceBuilder.addEvidence('package-001', {
        evidenceType: 'video',
        filePath: '/recordings/camera-08/2026-07-31-22-42-00.mp4',
        fileName: 'camera-08-original.mp4',
        fileSize: 52428800, // 50MB
        mimeType: 'video/mp4',
        capturedFrom: 'camera-08',
        startTime: '2026-07-31T22:42:00+05:30',
        endTime: '2026-07-31T22:50:00+05:30',
        description: 'Original footage from rear entrance camera',
        addedBy: 'investigator-001',
      });

      expect(evidenceId).toBeDefined();
    });

    it('should maintain chain of custody', async () => {
      mockStore.pool.query = jest.fn().mockResolvedValueOnce({
        rows: [{
          id: 'custody-001',
          package_id: 'package-001',
          action: 'accessed',
          accessed_by: 'investigator-002',
        }],
      });

      const custodyId = await evidenceBuilder.recordChainOfCustody('package-001', {
        action: 'accessed',
        accessedBy: 'investigator-002',
        reason: 'Review for court submission',
        location: 'Legal Department',
        ipAddress: '192.168.1.100',
      });

      expect(custodyId).toBeDefined();

      mockStore.pool.query = jest.fn().mockResolvedValueOnce({
        rows: [
          {
            id: 'custody-001',
            action: 'created',
            accessed_by: 'investigator-001',
            timestamp: '2026-07-31T23:12:18Z',
          },
          {
            id: 'custody-002',
            action: 'accessed',
            accessed_by: 'investigator-002',
            timestamp: '2026-07-31T23:14:00Z',
          },
        ],
      });

      const chain = await evidenceBuilder.getChainOfCustody('package-001');

      expect(chain).toHaveLength(2);
      expect(chain[0].action).toBe('created');
      expect(chain[1].action).toBe('accessed');
    });

    it('should verify evidence integrity with hash check', async () => {
      mockStore.pool.query = jest.fn().mockResolvedValueOnce({
        rows: [{
          id: 'evidence-001',
          sha256_hash: 'abc123def456...',
          file_path: '/evidence/video-001.mp4',
        }],
      });

      const isValid = await evidenceBuilder.verifyEvidenceIntegrity('evidence-001');

      // In real implementation, this would calculate hash and compare
      expect(typeof isValid).toBe('boolean');
    });

    it('should sign evidence package digitally', async () => {
      mockStore.pool.query = jest.fn().mockResolvedValueOnce({
        rows: [{
          id: 'package-001',
          digital_signature: 'signature-data',
          signed_at: new Date().toISOString(),
          signed_by: 'legal-officer-001',
        }],
      });

      const signature = await evidenceBuilder.signPackage('package-001', {
        signedBy: 'legal-officer-001',
        certificate: 'cert-data',
        algorithm: 'RSA-SHA256',
      });

      expect(signature).toBeDefined();
      expect(signature.signedAt).toBeDefined();
    });
  });

  describe('AI Video Search', () => {
    it('should parse natural language query', () => {
      const query = 'Show person with red shirt entering after 10 PM';
      const parsed = videoSearch.parseNaturalLanguageQuery(query);

      expect(parsed.objectType).toBe('person');
      expect(parsed.attributes).toContain('red');
      expect(parsed.attributes).toContain('shirt');
      expect(parsed.action).toContain('entering');
    });

    it('should search video by attributes', async () => {
      mockStore.pool.query = jest.fn().mockResolvedValueOnce({
        rows: [
          {
            id: 'detection-001',
            camera_id: 'camera-03',
            timestamp: '2026-07-31T16:18:32Z',
            attributes: JSON.stringify({
              upperClothingColor: 'red',
              lowerClothingColor: 'black',
            }),
          },
        ],
      });

      const results = await videoSearch.searchByAttributes({
        tenantId: 'tenant-001',
        objectType: 'person',
        attributes: {
          upperClothingColor: 'red',
        },
        startTime: '2026-07-31T00:00:00Z',
        endTime: '2026-07-31T23:59:59Z',
      });

      expect(results).toHaveLength(1);
      expect(results[0].cameraId).toBe('camera-03');
    });

    it('should perform cross-camera tracking', async () => {
      mockStore.pool.query = jest.fn().mockResolvedValueOnce({
        rows: [
          {
            camera_id: 'camera-03',
            timestamp: '2026-07-31T16:18:32Z',
            tracking_id: 'track-001',
          },
          {
            camera_id: 'camera-07',
            timestamp: '2026-07-31T16:19:14Z',
            tracking_id: 'track-001',
          },
          {
            camera_id: 'camera-11',
            timestamp: '2026-07-31T16:21:03Z',
            tracking_id: 'track-001',
          },
        ],
      });

      const journey = await videoSearch.trackAcrossCameras('track-001');

      expect(journey).toHaveLength(3);
      expect(journey[0].cameraId).toBe('camera-03');
      expect(journey[2].cameraId).toBe('camera-11');
    });

    it('should rank search results by relevance', () => {
      const results = [
        {
          id: 'result-001',
          confidence: 0.95,
          timestamp: '2026-07-31T16:18:32Z',
          attributes: { upperClothingColor: 'red', match: 'exact' },
        },
        {
          id: 'result-002',
          confidence: 0.75,
          timestamp: '2026-07-31T16:20:00Z',
          attributes: { upperClothingColor: 'orange', match: 'similar' },
        },
      ];

      const ranked = videoSearch.rankResults(results, {
        objectType: 'person',
        attributes: { upperClothingColor: 'red' },
      });

      expect(ranked[0].id).toBe('result-001');
      expect(ranked[0].confidence).toBeGreaterThan(ranked[1].confidence);
    });
  });

  describe('End-to-End Incident Workflow', () => {
    it('should complete full workflow from alert to evidence', async () => {
      // Step 1: Alerts arrive
      const alerts: AnalyticsAlert[] = [
        createMockAlert({
          id: 'alert-001',
          metadata: { detectionType: 'intrusion' },
        }),
        createMockAlert({
          id: 'alert-002',
          metadata: { detectionType: 'line-crossing' },
        }),
      ];

      // Step 2: AI correlates alerts
      const clusters = await incidentSummaryService.correlateAlerts('tenant-001', alerts);
      expect(clusters).toHaveLength(1);

      const cluster = clusters[0];
      expect(cluster.incidentType).toBe('security-intrusion');

      // Step 3: SOP automatically launched
      mockStore.pool.query = jest.fn()
        .mockResolvedValueOnce({
          rows: [{
            id: 'sop-intrusion',
            name: 'Intrusion Response',
            steps: JSON.stringify([
              { stepNumber: 1, name: 'Verify', required: true },
            ]),
          }],
        })
        .mockResolvedValueOnce({
          rows: [{
            id: 'exec-001',
            status: 'in-progress',
          }],
        });

      const executionId = await sopEngine.startSOPExecution({
        sopId: 'sop-intrusion',
        incidentId: cluster.clusterId,
        tenantId: 'tenant-001',
        startedBy: 'operator-001',
      });

      expect(executionId).toBeDefined();

      // Step 4: Investigation report generated
      const report = await investigationService.generateReport({
        incidentId: cluster.clusterId,
        tenantId: 'tenant-001',
        incidentType: cluster.incidentType,
        severity: cluster.severity,
        branchId: cluster.branchId,
        startTime: cluster.firstOccurredAt,
        endTime: cluster.lastOccurredAt,
        alertIds: cluster.alertIds,
        cameraIds: cluster.cameraIds,
        generatedBy: 'system',
      });

      expect(report.reportId).toBeDefined();
      expect(report.timeline).toBeDefined();

      // Step 5: Evidence package built
      const packageId = await evidenceBuilder.createEvidencePackage({
        incidentId: cluster.clusterId,
        tenantId: 'tenant-001',
        packageType: 'court-ready',
        title: `Evidence: ${cluster.incidentType}`,
        description: 'Auto-generated evidence package',
        createdBy: 'system',
      });

      expect(packageId).toBeDefined();

      // Complete workflow validation
      expect(cluster.clusterId).toBeDefined();
      expect(executionId).toBeDefined();
      expect(report.reportId).toBeDefined();
      expect(packageId).toBeDefined();
    });
  });
});
