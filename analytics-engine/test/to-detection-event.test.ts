import { describe, it, expect } from 'vitest';
import { toDetectionEvent } from '../src/events/to-detection-event.js';

describe('toDetectionEvent', () => {
  it('maps basic detection to shared DetectionEvent', () => {
    const input = {
      tenantId: 'tenant1',
      branchId: 'branchA',
      cameraId: 'cam-123',
      type: 'person',
      timestamp: new Date().toISOString(),
      confidence: 0.92,
      zone: 'entrance',
      trackedObjectId: 'track-1',
      metadata: { foo: 'bar' },
    };

    const ev = toDetectionEvent(input as any);

    expect(ev).toBeDefined();
    expect(ev.eventId).toBeTruthy();
    expect(ev.cameraId).toBe('cam-123');
    expect(ev.eventType).toBe('person');
    expect(ev.detectionType).toBe('person');
    expect(ev.confidence).toBeCloseTo(0.92);
    expect(ev.zoneId).toBe('entrance');
    expect(ev.trackIds).toEqual(['track-1']);
    expect(ev.metadata).toEqual(input.metadata);
  });
});
