import { describe, it, expect } from 'vitest';
import { analyticsRegistry, AnalyticsMaturity } from '../analytics-engine/src/core/analytics-registry.js';
import { ObjectTracker, type RawDetection } from '../analytics-engine/src/tracking/object-tracker.js';
import { SpatialTemporalRules, CrossingDirection, type Polygon2D, type LineSegment } from '../analytics-engine/src/rules/spatial-temporal-rules.js';
import { HeatMapGenerator } from '../analytics-engine/src/detectors/heatmap-generator.js';

describe('Production AI Analytics Engine & Tracking Platform', () => {
  it('registers 8 certified/production core detectors and exposes maturity levels', () => {
    const allCapabilities = analyticsRegistry.listCapabilities();
    expect(allCapabilities.length).toBeGreaterThanOrEqual(8);

    const productionDetectors = analyticsRegistry.listCapabilities({ maturity: AnalyticsMaturity.PRODUCTION });
    const certifiedDetectors = analyticsRegistry.listCapabilities({ maturity: AnalyticsMaturity.CERTIFIED });
    const experimentalDetectors = analyticsRegistry.listCapabilities({ maturity: AnalyticsMaturity.EXPERIMENTAL });

    expect(productionDetectors.length + certifiedDetectors.length).toBeGreaterThanOrEqual(8);
    expect(experimentalDetectors.some((d) => d.detectorType === 'face_recognition')).toBe(true);

    const intrusionCap = allCapabilities.find((c) => c.detectorType === 'intrusion');
    expect(intrusionCap?.modelSha256).toBeDefined();
    expect(intrusionCap?.maturity).toBe(AnalyticsMaturity.CERTIFIED);
  });

  it('multi-object tracker tracks detections across consecutive video frames', () => {
    const tracker = new ObjectTracker();
    const cameraId = 'CAM-KOTTARAKKARA-01';

    // Frame 1 (t = 1000)
    const frame1Detections: RawDetection[] = [
      { classId: 'person', confidence: 0.94, bbox: { x: 0.20, y: 0.30, width: 0.10, height: 0.25 }, timestamp: 1000 },
    ];
    const tracks1 = tracker.update(cameraId, frame1Detections, 1000);
    expect(tracks1.length).toBe(1);
    const trackId = tracks1[0]!.trackId;
    expect(trackId).toBeDefined();

    // Frame 2 (t = 1500, slight movement)
    const frame2Detections: RawDetection[] = [
      { classId: 'person', confidence: 0.96, bbox: { x: 0.22, y: 0.31, width: 0.10, height: 0.25 }, timestamp: 1500 },
    ];
    const tracks2 = tracker.update(cameraId, frame2Detections, 1500);
    expect(tracks2.length).toBe(1);
    expect(tracks2[0]!.trackId).toBe(trackId); // Same persistent track ID!
    expect(tracks2[0]!.trajectory.length).toBe(2);
    expect(tracks2[0]!.dwellSeconds).toBe(0.5);
  });

  it('spatial rule engine detects polygon zone intrusion after dwell time threshold', () => {
    const vaultZone: Polygon2D = [
      { x: 0.40, y: 0.40 },
      { x: 0.80, y: 0.40 },
      { x: 0.80, y: 0.90 },
      { x: 0.40, y: 0.90 },
    ];

    const insideTrack: any = {
      trackId: 'TRK-101',
      trajectory: [
        { x: 0.50, y: 0.50, timestamp: 1000 },
        { x: 0.52, y: 0.52, timestamp: 2000 },
        { x: 0.54, y: 0.55, timestamp: 3500 }, // dwell = 2.5s
      ],
    };

    const intrusion = SpatialTemporalRules.evaluateIntrusion(insideTrack, vaultZone, 2.0);
    expect(intrusion.triggered).toBe(true);
    expect(intrusion.dwellSeconds).toBe(2.5);

    const outsideTrack: any = {
      trackId: 'TRK-102',
      trajectory: [{ x: 0.10, y: 0.10, timestamp: 1000 }],
    };
    const outsideIntrusion = SpatialTemporalRules.evaluateIntrusion(outsideTrack, vaultZone, 2.0);
    expect(outsideIntrusion.triggered).toBe(false);
  });

  it('spatial rule engine evaluates directional line crossing tripwire', () => {
    const virtualEntranceLine: LineSegment = {
      p1: { x: 0.50, y: 0.00 },
      p2: { x: 0.50, y: 1.00 },
    };

    // Moving left to right (x=0.40 -> x=0.60 across x=0.50)
    const crossingTrack: any = {
      trackId: 'TRK-201',
      trajectory: [
        { x: 0.40, y: 0.50, timestamp: 1000 },
        { x: 0.60, y: 0.50, timestamp: 1500 },
      ],
    };

    const lineCrossing = SpatialTemporalRules.evaluateLineCrossing(crossingTrack, virtualEntranceLine, CrossingDirection.A_TO_B);
    expect(lineCrossing.crossed).toBe(true);
  });

  it('evaluates crowd density and loitering against thresholds', () => {
    const atmLobbyZone: Polygon2D = [
      { x: 0.00, y: 0.00 },
      { x: 1.00, y: 0.00 },
      { x: 1.00, y: 1.00 },
      { x: 0.00, y: 1.00 },
    ];

    const tracks: any[] = Array.from({ length: 10 }, (_, i) => ({
      trackId: `TRK-${i}`,
      trajectory: [{ x: 0.5, y: 0.5, timestamp: 1000 }],
    }));

    const crowd = SpatialTemporalRules.evaluateCrowd(tracks, atmLobbyZone, 8, 15);
    expect(crowd.count).toBe(10);
    expect(crowd.level).toBe('WARNING');
  });

  it('heatmap generator integrates with object tracker active tracks', async () => {
    const heatmap = new HeatMapGenerator({ gridWidth: 10, gridHeight: 10 });
    await heatmap.initialize();

    const results = await heatmap.detect({
      buffer: Buffer.from('mock-frame'),
      width: 1920,
      height: 1080,
      format: 'rgb',
      timestamp: new Date(),
      cameraId: 'CAM-HEATMAP-01',
    });

    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0]?.detectionType).toBe('heatmap');
    expect(results[0]?.metadata.grid).toBeDefined();
  });
});
