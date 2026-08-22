/**
 * Analytics Pipeline Integration Tests
 * Tests for the complete analytics pipeline
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { AnalyticsPipeline } from '../src/analytics-pipeline.js';
import type { DetectionFrame } from '../src/detectors/base-detector.js';
import type { AnalyticsRule } from '../src/analytics-pipeline.js';

/**
 * Helper: Create mock detection frame
 */
function createMockFrame(overrides: Partial<DetectionFrame> = {}): DetectionFrame {
  return {
    cameraId: 'test-camera-001',
    tenantId: 'test-tenant-001',
    timestamp: new Date(),
    imageData: Buffer.alloc(640 * 480 * 3),
    width: 640,
    height: 480,
    frameNumber: 1,
    ...overrides
  };
}

/**
 * Helper: Create mock analytics rule
 */
function createMockRule(overrides: Partial<AnalyticsRule> = {}): AnalyticsRule {
  return {
    id: 'test-rule-001',
    cameraId: 'test-camera-001',
    detectionType: 'person',
    enabled: true,
    minConfidence: 0.7,
    minDurationSeconds: 2,
    objectClasses: ['person'],
    ...overrides
  };
}

describe('Analytics Pipeline', () => {
  let pipeline: AnalyticsPipeline;

  beforeAll(async () => {
    pipeline = new AnalyticsPipeline();
    await pipeline.initialize();
  });

  afterAll(async () => {
    await pipeline.cleanup();
  });

  describe('Initialization', () => {
    it('should initialize successfully', () => {
      const health = pipeline.getHealth();
      expect(health.initialized).toBe(true);
    });

    it('should initialize all detectors', () => {
      const health = pipeline.getHealth();
      expect(health.detectors).toBeDefined();
      expect(Object.keys(health.detectors).length).toBeGreaterThan(0);
    });

    it('should have all core detectors loaded', () => {
      const health = pipeline.getHealth();
      const expectedDetectors = [
        'motion', 'person', 'vehicle', 'helmet', 'fall',
        'smoke', 'crowd', 'tailgating', 'queue', 'heatmap'
      ];

      expectedDetectors.forEach(detectorType => {
        expect(health.detectors).toHaveProperty(detectorType);
      });
    });
  });

  describe('Frame Processing', () => {
    it('should process frame with enabled rules', async () => {
      const frame = createMockFrame();
      const rules = [createMockRule({ enabled: true })];

      const events = await pipeline.processFrame(frame, rules);
      expect(Array.isArray(events)).toBe(true);
    });

    it('should skip processing with disabled rules', async () => {
      const frame = createMockFrame();
      const rules = [createMockRule({ enabled: false })];

      const events = await pipeline.processFrame(frame, rules);
      expect(events.length).toBe(0);
    });

    it('should respect confidence thresholds', async () => {
      const frame = createMockFrame();
      const rules = [createMockRule({ minConfidence: 0.9 })];

      const events = await pipeline.processFrame(frame, rules);
      
      events.forEach(event => {
        expect(event.confidence).toBeGreaterThanOrEqual(0.9);
      });
    });

    it('should handle multiple rules', async () => {
      const frame = createMockFrame();
      const rules = [
        createMockRule({ id: 'rule-1', detectionType: 'person' }),
        createMockRule({ id: 'rule-2', detectionType: 'vehicle' }),
        createMockRule({ id: 'rule-3', detectionType: 'motion' })
      ];

      const events = await pipeline.processFrame(frame, rules);
      expect(Array.isArray(events)).toBe(true);
    });
  });

  describe('Zone Detection', () => {
    it('should detect intrusion in polygon zones', async () => {
      const frame = createMockFrame();
      const rule = createMockRule({
        detectionType: 'intrusion',
        zone: {
          id: 'zone-001',
          name: 'Restricted Area',
          shape: 'polygon',
          points: [
            { x: 0.1, y: 0.1 },
            { x: 0.9, y: 0.1 },
            { x: 0.9, y: 0.9 },
            { x: 0.1, y: 0.9 }
          ]
        }
      });

      const events = await pipeline.processFrame(frame, [rule]);
      expect(Array.isArray(events)).toBe(true);
    });

    it('should detect line crossing', async () => {
      const frame = createMockFrame();
      const rule = createMockRule({
        detectionType: 'line-crossing',
        zone: {
          id: 'line-001',
          name: 'Entry Line',
          shape: 'line',
          points: [
            { x: 0.0, y: 0.5 },
            { x: 1.0, y: 0.5 }
          ]
        },
        direction: 'a-to-b'
      });

      const events = await pipeline.processFrame(frame, [rule]);
      expect(Array.isArray(events)).toBe(true);
    });

    it('should filter by object classes', async () => {
      const frame = createMockFrame();
      const rule = createMockRule({
        objectClasses: ['person'],
        zone: {
          id: 'zone-002',
          name: 'Person Only Zone',
          shape: 'polygon',
          points: [
            { x: 0.2, y: 0.2 },
            { x: 0.8, y: 0.2 },
            { x: 0.8, y: 0.8 },
            { x: 0.2, y: 0.8 }
          ]
        }
      });

      const events = await pipeline.processFrame(frame, [rule]);
      
      events.forEach(event => {
        if (event.objects && event.objects.length > 0) {
          event.objects.forEach(obj => {
            expect(rule.objectClasses).toContain(obj.label);
          });
        }
      });
    });
  });

  describe('Advanced Analytics Modules', () => {
    it('should access human analytics module', () => {
      const humanAnalytics = pipeline.getHumanAnalytics();
      expect(humanAnalytics).toBeDefined();
    });

    it('should access vehicle analytics module', () => {
      const vehicleAnalytics = pipeline.getVehicleAnalytics();
      expect(vehicleAnalytics).toBeDefined();
    });

    it('should access face analytics module', () => {
      const faceAnalytics = pipeline.getFaceAnalytics();
      expect(faceAnalytics).toBeDefined();
    });

    it('should access AI search engine', () => {
      const searchEngine = pipeline.getAISearchEngine();
      expect(searchEngine).toBeDefined();
    });

    it('should access AI assistant', () => {
      const assistant = pipeline.getAIAssistant();
      expect(assistant).toBeDefined();
    });
  });

  describe('Optional Modules', () => {
    it('should enable industrial analytics', () => {
      pipeline.enableIndustrialAnalytics();
      const industrial = pipeline.getIndustrialAnalytics();
      expect(industrial).toBeDefined();
    });

    it('should enable smart city analytics', () => {
      pipeline.enableSmartCityAnalytics();
      const smartCity = pipeline.getSmartCityAnalytics();
      expect(smartCity).toBeDefined();
    });
  });

  describe('Real-time Tracking', () => {
    it('should track persons', async () => {
      const frame = createMockFrame();
      await pipeline.processFrame(frame, [createMockRule({ detectionType: 'person' })]);

      const tracks = pipeline.getPersonTracks();
      expect(Array.isArray(tracks)).toBe(true);
    });

    it('should track vehicles', async () => {
      const frame = createMockFrame();
      await pipeline.processFrame(frame, [createMockRule({ detectionType: 'vehicle' })]);

      const tracks = pipeline.getVehicleTracks();
      expect(Array.isArray(tracks)).toBe(true);
    });

    it('should generate heat map', async () => {
      const frame = createMockFrame();
      await pipeline.processFrame(frame, [createMockRule()]);

      const heatMap = pipeline.getHeatMap();
      expect(heatMap).toBeDefined();
      expect(Array.isArray(heatMap)).toBe(true);
    });
  });

  describe('Camera Health', () => {
    it('should track camera health', async () => {
      const frame = createMockFrame();
      await pipeline.processFrame(frame, [createMockRule()]);

      const health = pipeline.getCameraHealth('test-camera-001');
      expect(health).toBeDefined();
    });

    it('should detect camera issues', async () => {
      const health = pipeline.getCameraHealth('test-camera-001');
      
      if (health) {
        expect(health).toHaveProperty('status');
        expect(['healthy', 'warning', 'critical', 'offline']).toContain(health.status);
      }
    });
  });

  describe('Model Manager Integration', () => {
    it('should have model manager initialized', () => {
      const modelManager = pipeline.getModelManager();
      expect(modelManager).toBeDefined();
      expect(modelManager.isReady()).toBe(true);
    });

    it('should provide model statistics', () => {
      const stats = pipeline.getModelStats();
      expect(stats).toHaveProperty('totalLoads');
      expect(stats).toHaveProperty('cacheHits');
      expect(stats).toHaveProperty('cacheMisses');
      expect(stats).toHaveProperty('avgLoadTime');
    });

    it('should provide memory report', () => {
      const report = pipeline.getMemoryReport();
      expect(report).toHaveProperty('total');
      expect(report).toHaveProperty('used');
      expect(report).toHaveProperty('available');
      expect(report).toHaveProperty('models');
    });
  });

  describe('Health Monitoring', () => {
    it('should report overall health status', () => {
      const health = pipeline.getHealth();
      expect(health).toHaveProperty('initialized');
      expect(health).toHaveProperty('detectors');
    });

    it('should report detector health', () => {
      const health = pipeline.getHealth();
      
      Object.values(health.detectors).forEach((detectorHealth: any) => {
        expect(detectorHealth).toHaveProperty('status');
        expect(['healthy', 'degraded', 'unhealthy']).toContain(detectorHealth.status);
      });
    });
  });

  describe('Cleanup', () => {
    it('should cleanup resources properly', async () => {
      const testPipeline = new AnalyticsPipeline();
      await testPipeline.initialize();
      await testPipeline.cleanup();

      // After cleanup, health should reflect uninitialized state
      const health = testPipeline.getHealth();
      expect(health.initialized).toBe(false);
    });
  });
});
