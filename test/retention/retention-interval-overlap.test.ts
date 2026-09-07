import { describe, it, expect } from 'vitest';
import { RetentionEngineService } from '../../src/retention/services/retention-engine.service.js';

describe('Retention Engine Interval Overlap & Math (P0-16)', () => {
  const engine = new RetentionEngineService();

  it('correctly calculates recorded seconds, missing seconds, and gaps for overlapping intervals', () => {
    // Test case specified in P0-16:
    // Window: 10:00 - 10:30 (1800s)
    // Seg 1: 10:00 - 10:10 (600s)
    // Seg 2: 10:08 - 10:18 (600s, overlaps by 2m)
    // Seg 3: 10:20 - 10:30 (600s)
    const start = new Date('2026-08-17T10:00:00.000Z');
    const end = new Date('2026-08-17T10:30:00.000Z');

    const segments = [
      {
        startTime: new Date('2026-08-17T10:00:00.000Z'),
        endTime: new Date('2026-08-17T10:10:00.000Z'),
      },
      {
        startTime: new Date('2026-08-17T10:08:00.000Z'),
        endTime: new Date('2026-08-17T10:18:00.000Z'),
      },
      {
        startTime: new Date('2026-08-17T10:20:00.000Z'),
        endTime: new Date('2026-08-17T10:30:00.000Z'),
      },
    ];

    const result = engine.calculateCoverage({ start, end, segments });

    expect(result.expectedSeconds).toBe(1800); // 30 minutes
    expect(result.recordedSeconds).toBe(1680); // 28 minutes (10:00-10:18 = 18m + 10:20-10:30 = 10m)
    expect(result.missingSeconds).toBe(120);   // 2 minutes missing (10:18-10:20)
    expect(result.numberOfGaps).toBe(1);       // exactly 1 gap
    expect(result.largestGapSeconds).toBe(120); // 2m gap
    expect(result.coveragePercent).toBeCloseTo(93.33, 1);
  });

  it('handles completely out-of-order and fully subsumed segments', () => {
    const start = new Date('2026-08-17T10:00:00.000Z');
    const end = new Date('2026-08-17T10:30:00.000Z');

    // Segments provided in reverse order with one completely inside another
    const segments = [
      {
        startTime: new Date('2026-08-17T10:20:00.000Z'),
        endTime: new Date('2026-08-17T10:30:00.000Z'),
      },
      {
        startTime: new Date('2026-08-17T10:02:00.000Z'),
        endTime: new Date('2026-08-17T10:06:00.000Z'), // Subsumed by 10:00-10:10
      },
      {
        startTime: new Date('2026-08-17T10:00:00.000Z'),
        endTime: new Date('2026-08-17T10:10:00.000Z'),
      },
    ];

    const result = engine.calculateCoverage({ start, end, segments });

    // Merged: [10:00-10:10] (600s) + [10:20-10:30] (600s) = 1200s
    expect(result.expectedSeconds).toBe(1800);
    expect(result.recordedSeconds).toBe(1200);
    expect(result.missingSeconds).toBe(600);
    expect(result.numberOfGaps).toBe(1);
    expect(result.largestGapSeconds).toBe(600); // 10:10 to 10:20 gap
    expect(result.coveragePercent).toBeCloseTo(66.67, 1);
  });

  it('handles gap at the start and gap at the end of the query window', () => {
    const start = new Date('2026-08-17T10:00:00.000Z');
    const end = new Date('2026-08-17T10:30:00.000Z');

    // Only recording is 10:10 - 10:20 (10 minutes in the middle)
    const segments = [
      {
        startTime: new Date('2026-08-17T10:10:00.000Z'),
        endTime: new Date('2026-08-17T10:20:00.000Z'),
      },
    ];

    const result = engine.calculateCoverage({ start, end, segments });

    expect(result.expectedSeconds).toBe(1800);
    expect(result.recordedSeconds).toBe(600);
    expect(result.missingSeconds).toBe(1200);
    expect(result.numberOfGaps).toBe(2); // 10:00-10:10 and 10:20-10:30
    expect(result.largestGapSeconds).toBe(600);
    expect(result.coveragePercent).toBeCloseTo(33.33, 1);
  });

  it('handles empty segments list with full window missing', () => {
    const start = new Date('2026-08-17T10:00:00.000Z');
    const end = new Date('2026-08-17T10:30:00.000Z');

    const result = engine.calculateCoverage({ start, end, segments: [] });

    expect(result.expectedSeconds).toBe(1800);
    expect(result.recordedSeconds).toBe(0);
    expect(result.missingSeconds).toBe(1800);
    expect(result.numberOfGaps).toBe(1);
    expect(result.largestGapSeconds).toBe(1800);
    expect(result.coveragePercent).toBe(0);
  });
});
