/**
 * Performance Benchmarks
 * Tests for performance and scalability
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AnalyticsPipeline } from '../src/analytics-pipeline.js';
import { ModelManager } from '../src/model-manager.js';
import type { DetectionFrame } from '../src/detectors/base-detector.js';

/**
 * Helper: Create mock detection frame
 */
function createMockFrame(frameNumber: number = 1): DetectionFrame {
  return {
    cameraId: `camera-${Math.floor(frameNumber / 100)}`,
    tenantId: 'test-tenant',
    timestamp: new Date(),
    imageData: Buffer.alloc(640 * 480 * 3),
    width: 640,
    height: 480,
    frameNumber
  };
}

/**
 * Helper: Measure execution time
 */
async function measureTime(fn: () => Promise<any>): Promise<number> {
  const start = Date.now();
  await fn();
  return Date.now() - start;
}

describe('Performance Benchmarks', () => {
  let pipeline: AnalyticsPipeline;

  beforeAll(async () => {
    pipeline = new AnalyticsPipeline();
    await pipeline.initialize();
  });

  afterAll(async () => {
    await pipeline.cleanup();
  });

  describe('Frame Processing Latency', () => {
    it('should process single frame within 200ms', async () => {
      const frame = createMockFrame();
      const rules = [{
        id: 'perf-test-1',
        cameraId: frame.cameraId,
        detectionType: 'person' as const,
        enabled: true,
        minConfidence: 0.7,
        minDurationSeconds: 2
      }];

      const time = await measureTime(async () => {
        await pipeline.processFrame(frame, rules);
      });

      console.log(`  Frame processing time: ${time}ms`);
      expect(time).toBeLessThan(200);
    }, 10000);

    it('should maintain low latency under continuous processing', async () => {
      const frames = 10;
      const rules = [{
        id: 'perf-test-2',
        cameraId: 'camera-001',
        detectionType: 'person' as const,
        enabled: true,
        minConfidence: 0.7,
        minDurationSeconds: 2
      }];

      const times: number[] = [];

      for (let i = 0; i < frames; i++) {
        const frame = createMockFrame(i);
        const time = await measureTime(async () => {
          await pipeline.processFrame(frame, rules);
        });
        times.push(time);
      }

      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      const maxTime = Math.max(...times);

      console.log(`  Average time: ${avgTime.toFixed(1)}ms`);
      console.log(`  Max time: ${maxTime}ms`);

      expect(avgTime).toBeLessThan(250);
      expect(maxTime).toBeLessThan(500);
    }, 30000);
  });

  describe('Throughput', () => {
    it('should process at least 5 FPS (200ms per frame)', async () => {
      const framesToProcess = 50;
      const rules = [{
        id: 'throughput-test',
        cameraId: 'camera-001',
        detectionType: 'person' as const,
        enabled: true,
        minConfidence: 0.7,
        minDurationSeconds: 2
      }];

      const startTime = Date.now();

      for (let i = 0; i < framesToProcess; i++) {
        const frame = createMockFrame(i);
        await pipeline.processFrame(frame, rules);
      }

      const totalTime = Date.now() - startTime;
      const fps = (framesToProcess / totalTime) * 1000;

      console.log(`  Processed ${framesToProcess} frames in ${totalTime}ms`);
      console.log(`  Throughput: ${fps.toFixed(2)} FPS`);

      expect(fps).toBeGreaterThan(5);
    }, 60000);
  });

  describe('Memory Usage', () => {
    it('should not leak memory during processing', async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      const frames = 100;
      const rules = [{
        id: 'memory-test',
        cameraId: 'camera-001',
        detectionType: 'person' as const,
        enabled: true,
        minConfidence: 0.7,
        minDurationSeconds: 2
      }];

      for (let i = 0; i < frames; i++) {
        const frame = createMockFrame(i);
        await pipeline.processFrame(frame, rules);
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024;

      console.log(`  Memory increase: ${memoryIncrease.toFixed(2)} MB`);

      // Memory increase should be reasonable (<100MB for 100 frames)
      expect(memoryIncrease).toBeLessThan(100);
    }, 60000);

    it('should report model memory usage accurately', () => {
      const report = pipeline.getMemoryReport();

      console.log(`  Total: ${report.total.toFixed(1)} MB`);
      console.log(`  Used: ${report.used.toFixed(1)} MB`);
      console.log(`  Available: ${report.available.toFixed(1)} MB`);
      console.log(`  Loaded models: ${report.models.length}`);

      expect(report.used).toBeLessThanOrEqual(report.total);
      expect(report.available).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Model Loading Performance', () => {
    it('should load models quickly from cache', async () => {
      const modelManager = pipeline.getModelManager();
      const modelId = 'yolov8n';

      // First load (cache miss)
      const firstLoadTime = await measureTime(async () => {
        await modelManager.getModel(modelId);
      });

      // Second load (cache hit)
      const secondLoadTime = await measureTime(async () => {
        await modelManager.getModel(modelId);
      });

      console.log(`  First load: ${firstLoadTime}ms (cache miss)`);
      console.log(`  Second load: ${secondLoadTime}ms (cache hit)`);

      // Cache hit should be significantly faster
      expect(secondLoadTime).toBeLessThan(firstLoadTime / 10);
      expect(secondLoadTime).toBeLessThan(10); // < 10ms for cached model
    }, 30000);

    it('should maintain high cache hit rate', async () => {
      const modelManager = pipeline.getModelManager();
      const iterations = 100;

      for (let i = 0; i < iterations; i++) {
        await modelManager.getModel('yolov8n');
      }

      const stats = pipeline.getModelStats();
      const hitRate = stats.cacheHitRate;

      console.log(`  Cache hit rate: ${hitRate.toFixed(1)}%`);
      console.log(`  Cache hits: ${stats.cacheHits}`);
      console.log(`  Cache misses: ${stats.cacheMisses}`);

      expect(hitRate).toBeGreaterThan(90); // >90% hit rate
    }, 30000);
  });

  describe('Scalability', () => {
    it('should handle multiple cameras efficiently', async () => {
      const cameraCount = 10;
      const framesPerCamera = 5;
      const rules = Array.from({ length: cameraCount }, (_, i) => ({
        id: `rule-${i}`,
        cameraId: `camera-${i}`,
        detectionType: 'person' as const,
        enabled: true,
        minConfidence: 0.7,
        minDurationSeconds: 2
      }));

      const startTime = Date.now();

      for (let camera = 0; camera < cameraCount; camera++) {
        for (let frame = 0; frame < framesPerCamera; frame++) {
          const frameData = createMockFrame(camera * 100 + frame);
          frameData.cameraId = `camera-${camera}`;
          await pipeline.processFrame(frameData, rules.filter(r => r.cameraId === frameData.cameraId));
        }
      }

      const totalTime = Date.now() - startTime;
      const totalFrames = cameraCount * framesPerCamera;
      const avgTimePerFrame = totalTime / totalFrames;

      console.log(`  ${cameraCount} cameras, ${framesPerCamera} frames each`);
      console.log(`  Total time: ${totalTime}ms`);
      console.log(`  Avg time per frame: ${avgTimePerFrame.toFixed(1)}ms`);

      expect(avgTimePerFrame).toBeLessThan(300);
    }, 60000);
  });

  describe('Detector Performance', () => {
    it('should benchmark individual detectors', async () => {
      const frame = createMockFrame();
      const detectors = [
        { name: 'motion', detector: pipeline.getDetector('motion') },
        { name: 'person', detector: pipeline.getDetector('person') },
        { name: 'vehicle', detector: pipeline.getDetector('vehicle') },
        { name: 'helmet', detector: pipeline.getDetector('helmet') },
        { name: 'fall', detector: pipeline.getDetector('fall') }
      ];

      console.log('  Detector benchmarks:');

      for (const { name, detector } of detectors) {
        if (!detector) continue;

        const time = await measureTime(async () => {
          await detector.detect(frame);
        });

        console.log(`    ${name}: ${time}ms`);
        expect(time).toBeLessThan(100); // Each detector should be fast
      }
    }, 30000);
  });

  describe('Health Check Performance', () => {
    it('should return health status quickly', async () => {
      const time = await measureTime(async () => {
        pipeline.getHealth();
      });

      console.log(`  Health check time: ${time}ms`);
      expect(time).toBeLessThan(50);
    });

    it('should handle concurrent health checks', async () => {
      const concurrentChecks = 100;
      const startTime = Date.now();

      const promises = Array.from({ length: concurrentChecks }, () => 
        Promise.resolve(pipeline.getHealth())
      );

      await Promise.all(promises);

      const totalTime = Date.now() - startTime;
      const avgTime = totalTime / concurrentChecks;

      console.log(`  ${concurrentChecks} concurrent checks in ${totalTime}ms`);
      console.log(`  Avg time: ${avgTime.toFixed(2)}ms`);

      expect(avgTime).toBeLessThan(10);
    });
  });

  describe('Stress Testing', () => {
    it('should handle burst traffic', async () => {
      const burstSize = 20;
      const rules = [{
        id: 'stress-test',
        cameraId: 'camera-001',
        detectionType: 'person' as const,
        enabled: true,
        minConfidence: 0.7,
        minDurationSeconds: 2
      }];

      const startTime = Date.now();

      // Process frames in rapid succession
      const promises = Array.from({ length: burstSize }, (_, i) => 
        pipeline.processFrame(createMockFrame(i), rules)
      );

      await Promise.all(promises);

      const totalTime = Date.now() - startTime;
      const avgTime = totalTime / burstSize;

      console.log(`  Processed ${burstSize} frames concurrently in ${totalTime}ms`);
      console.log(`  Avg time: ${avgTime.toFixed(1)}ms`);

      expect(avgTime).toBeLessThan(500);
    }, 30000);
  });
});

describe('Model Manager Benchmarks', () => {
  let modelManager: ModelManager;

  beforeAll(async () => {
    modelManager = new ModelManager({
      modelsDirectory: './models',
      maxCacheSize: 2048,
      enableGPU: false,
      cacheEvictionPolicy: 'lru'
    });
    await modelManager.initialize();
  });

  afterAll(async () => {
    await modelManager.shutdown();
  });

  describe('Cache Performance', () => {
    it('should benchmark cache eviction', async () => {
      const models = ['yolov8n', 'deepsort', 'osnet', 'retinaface'];

      for (const modelId of models) {
        await modelManager.getModel(modelId);
      }

      const stats = modelManager.getStats();
      console.log(`  Models loaded: ${stats.loadedModels}`);
      console.log(`  Memory used: ${stats.memoryUsageMB.toFixed(1)} MB`);
      console.log(`  Cache hit rate: ${stats.cacheHitRate.toFixed(1)}%`);

      expect(stats.loadedModels).toBeGreaterThan(0);
    }, 30000);
  });
});
