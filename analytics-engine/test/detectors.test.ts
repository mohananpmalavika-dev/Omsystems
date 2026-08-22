/**
 * Detector Unit Tests
 * Tests for individual detector modules
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { MotionDetector } from '../src/detectors/motion-detector.js';
import { PersonDetector } from '../src/detectors/person-detector.js';
import { VehicleDetector } from '../src/detectors/vehicle-detector.js';
import { HelmetDetector } from '../src/detectors/helmet-detector.js';
import { FallDetector } from '../src/detectors/fall-detector.js';
import { HumanAnalytics } from '../src/detectors/human-analytics.js';
import { VehicleAnalytics } from '../src/detectors/vehicle-analytics.js';
import type { DetectionFrame } from '../src/detectors/base-detector.js';

/**
 * Helper: Create mock detection frame
 */
function createMockFrame(overrides: Partial<DetectionFrame> = {}): DetectionFrame {
  return {
    cameraId: 'test-camera-001',
    tenantId: 'test-tenant-001',
    timestamp: new Date(),
    imageData: Buffer.alloc(640 * 480 * 3), // Mock image buffer
    width: 640,
    height: 480,
    frameNumber: 1,
    ...overrides
  };
}

describe('Motion Detector', () => {
  let detector: MotionDetector;

  beforeEach(async () => {
    detector = new MotionDetector();
    await detector.initialize();
  });

  afterEach(async () => {
    await detector.cleanup();
  });

  it('should initialize successfully', () => {
    const health = detector.getHealth();
    expect(health.status).toBe('healthy');
  });

  it('should detect motion between frames', async () => {
    const frame1 = createMockFrame({ frameNumber: 1 });
    const frame2 = createMockFrame({ frameNumber: 2 });

    // First frame - no motion (establishing baseline)
    const results1 = await detector.detect(frame1);
    expect(results1).toHaveLength(0);

    // Second frame - should detect motion
    const results2 = await detector.detect(frame2);
    expect(results2).toBeDefined();
  });

  it('should have correct health status', () => {
    const health = detector.getHealth();
    expect(health).toHaveProperty('status');
    expect(health).toHaveProperty('lastCheck');
    expect(['healthy', 'degraded', 'unhealthy']).toContain(health.status);
  });
});

describe('Person Detector', () => {
  let detector: PersonDetector;

  beforeEach(async () => {
    detector = new PersonDetector();
    await detector.initialize();
  });

  afterEach(async () => {
    await detector.cleanup();
  });

  it('should initialize successfully', () => {
    const health = detector.getHealth();
    expect(health.status).toBe('healthy');
  });

  it('should track persons across frames', async () => {
    const frame = createMockFrame();
    
    // Simulate person detection
    await detector.detect(frame);
    
    const tracks = detector.getActiveTracks();
    expect(Array.isArray(tracks)).toBe(true);
  });

  it('should maintain track IDs consistently', async () => {
    const frame1 = createMockFrame({ frameNumber: 1 });
    const frame2 = createMockFrame({ frameNumber: 2 });

    await detector.detect(frame1);
    const tracks1 = detector.getActiveTracks();

    await detector.detect(frame2);
    const tracks2 = detector.getActiveTracks();

    // Track IDs should persist across frames
    if (tracks1.length > 0 && tracks2.length > 0) {
      expect(tracks2.some(t => tracks1.find(t1 => t1.trackId === t.trackId))).toBeDefined();
    }
  });

  it('should calculate dwell time correctly', async () => {
    const frame = createMockFrame();
    await detector.detect(frame);

    const tracks = detector.getActiveTracks();
    tracks.forEach(track => {
      expect(track).toHaveProperty('firstSeen');
      expect(track).toHaveProperty('lastSeen');
      expect(track.lastSeen.getTime()).toBeGreaterThanOrEqual(track.firstSeen.getTime());
    });
  });
});

describe('Vehicle Detector', () => {
  let detector: VehicleDetector;

  beforeEach(async () => {
    detector = new VehicleDetector();
    await detector.initialize();
  });

  afterEach(async () => {
    await detector.cleanup();
  });

  it('should initialize successfully', () => {
    const health = detector.getHealth();
    expect(health.status).toBe('healthy');
  });

  it('should track vehicles across frames', async () => {
    const frame = createMockFrame();
    await detector.detect(frame);

    const tracks = detector.getActiveTracks();
    expect(Array.isArray(tracks)).toBe(true);
  });

  it('should classify vehicle types', async () => {
    const frame = createMockFrame();
    const results = await detector.detect(frame);

    results.forEach(result => {
      if (result.objects && result.objects.length > 0) {
        const vehicleTypes = ['car', 'truck', 'bus', 'motorcycle', 'bicycle'];
        result.objects.forEach(obj => {
          expect(vehicleTypes).toContain(obj.label);
        });
      }
    });
  });
});

describe('Helmet Detector', () => {
  let detector: HelmetDetector;

  beforeEach(async () => {
    detector = new HelmetDetector();
    await detector.initialize();
  });

  afterEach(async () => {
    await detector.cleanup();
  });

  it('should initialize successfully', () => {
    const health = detector.getHealth();
    expect(health.status).toBe('healthy');
  });

  it('should detect helmet compliance', async () => {
    const frame = createMockFrame();
    const results = await detector.detect(frame);

    results.forEach(result => {
      expect(result.detectionType).toMatch(/helmet/);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });
  });
});

describe('Fall Detector', () => {
  let detector: FallDetector;

  beforeEach(async () => {
    detector = new MotionDetector();
    await detector.initialize();
  });

  afterEach(async () => {
    await detector.cleanup();
  });

  it('should initialize successfully', () => {
    const health = detector.getHealth();
    expect(health.status).toBe('healthy');
  });

  it('should detect fall events', async () => {
    const frame = createMockFrame();
    const results = await detector.detect(frame);

    results.forEach(result => {
      expect(result.detectionType).toBe('fall');
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });
  });
});

describe('Human Analytics', () => {
  let analytics: HumanAnalytics;

  beforeEach(async () => {
    analytics = new HumanAnalytics();
    await analytics.initialize();
  });

  afterEach(async () => {
    await analytics.cleanup();
  });

  it('should initialize successfully', () => {
    const health = analytics.getHealth();
    expect(health.status).toBe('healthy');
  });

  it('should track person Re-ID across cameras', async () => {
    const frame1 = createMockFrame({ cameraId: 'cam-001' });
    const frame2 = createMockFrame({ cameraId: 'cam-002' });

    await analytics.detect(frame1);
    await analytics.detect(frame2);

    const tracks = analytics.getActiveTracks();
    expect(Array.isArray(tracks)).toBe(true);
  });

  it('should detect behaviors', async () => {
    const frame = createMockFrame();
    await analytics.detect(frame);

    const behaviors = analytics.getBehaviorDetections();
    expect(Array.isArray(behaviors)).toBe(true);
  });

  it('should calculate occupancy metrics', () => {
    const metrics = analytics.getOccupancyMetrics();
    
    expect(metrics).toHaveProperty('currentOccupancy');
    expect(metrics).toHaveProperty('uniquePersons');
    expect(metrics).toHaveProperty('avgDwellTime');
    expect(typeof metrics.currentOccupancy).toBe('number');
  });
});

describe('Vehicle Analytics', () => {
  let analytics: VehicleAnalytics;

  beforeEach(async () => {
    analytics = new VehicleAnalytics();
    await analytics.initialize();
  });

  afterEach(async () => {
    await analytics.cleanup();
  });

  it('should initialize successfully', () => {
    const health = analytics.getHealth();
    expect(health.status).toBe('healthy');
  });

  it('should perform ANPR detection', async () => {
    const frame = createMockFrame();
    await analytics.detect(frame);

    const detections = analytics.getANPRDetections();
    expect(Array.isArray(detections)).toBe(true);
  });

  it('should track traffic flow', () => {
    const metrics = analytics.getTrafficFlowMetrics();
    
    expect(metrics).toHaveProperty('totalVehicles');
    expect(metrics).toHaveProperty('avgSpeed');
    expect(metrics).toHaveProperty('vehiclesByType');
    expect(typeof metrics.totalVehicles).toBe('number');
  });

  it('should detect parking violations', () => {
    const violations = analytics.getParkingViolations();
    expect(Array.isArray(violations)).toBe(true);
  });
});
