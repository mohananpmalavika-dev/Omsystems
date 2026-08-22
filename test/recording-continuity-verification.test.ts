import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import {
  IntervalMerger,
  GapDetector,
  CoverageCalculator,
  SegmentVerifier,
  VerificationLevel,
  RecordingContinuityCoordinatorService,
} from '../src/recording-continuity/index.js';

describe('Recording Continuity Verification Subsystem (Banking Compliance Core)', () => {
  it('merges adjacent intervals with tolerance and prevents duration inflation on overlapping ranges', () => {
    // Overlapping and adjacent intervals
    const intervals = [
      { start: 0, end: 30000 },
      { start: 25000, end: 60000 }, // Overlap of 5s
      { start: 60200, end: 90000 }, // Gap of 200ms (within 500ms tolerance)
      { start: 95000, end: 120000 }, // Real gap of 5000ms
    ];

    const merged = IntervalMerger.merge(intervals, 500);
    expect(merged.length).toBe(2);

    // First range: 0 -> 90000 (90s)
    expect(merged[0]?.start).toBe(0);
    expect(merged[0]?.end).toBe(90000);

    // Second range: 95000 -> 120000 (25s)
    expect(merged[1]?.start).toBe(95000);
    expect(merged[1]?.end).toBe(120000);

    const totalSeconds = IntervalMerger.totalSeconds(merged);
    expect(totalSeconds).toBe(115.0); // 90s + 25s = 115s (without double-counting 5s overlap)
  });

  it('subtracts planned maintenance exclusions from expected calendar recording time', () => {
    // 24 hours: 00:00 to 24:00 (86,400s = 86,400,000ms)
    const calendarRange = [{ start: 0, end: 86400_000 }];

    // Planned maintenance exclusion: 02:00 to 02:30 (1,800s = 1,800,000ms)
    const exclusions = [{ start: 7200_000, end: 9000_000 }];

    const effectiveExpected = IntervalMerger.subtract(calendarRange, exclusions);
    expect(effectiveExpected.length).toBe(2);

    const totalExpectedSeconds = IntervalMerger.totalSeconds(effectiveExpected);
    expect(totalExpectedSeconds).toBe(84600.0); // 86,400s - 1,800s = 84,600s
  });

  it('detects recording gaps and computes duration accurately', () => {
    const expected = [{ start: 0, end: 86400_000 }];
    const recorded = [
      { start: 0, end: 43200_000 }, // 00:00 -> 12:00
      { start: 43202_000, end: 86400_000 }, // 12:00:02 -> 24:00 (2-second gap)
    ];

    const gaps = GapDetector.detectGaps('BANK-001', 'BR-118', 'CAM-14', expected, recorded, 0.5);
    expect(gaps.length).toBe(1);
    expect(gaps[0]?.durationSeconds).toBe(2.0);
    expect(gaps[0]?.classification).toBe('UNEXPLAINED');
    expect(gaps[0]?.status).toBe('OPEN');
  });

  it('calculates high-precision daily coverage (99.99769%, 1 gap, largest gap 2s)', () => {
    const calendarRange = { start: 0, end: 86400_000 };
    const recordedSegments = [
      { start: new Date(0), end: new Date(43200_000), isCorrupt: false },
      { start: new Date(43202_000), end: new Date(86400_000), isCorrupt: false }, // 2s missing
    ];

    const coverage = CoverageCalculator.calculateDailyCoverage({
      tenantId: 'BANK-001',
      branchId: 'BR-118',
      cameraId: 'CAM-14',
      coverageDate: '2026-08-16',
      calendarRange,
      exclusionRanges: [],
      recordedSegments,
    });

    expect(coverage.expectedSeconds).toBe(86400);
    expect(coverage.recordedSeconds).toBe(86398);
    expect(coverage.missingSeconds).toBe(2);
    expect(coverage.coveragePercent).toBe(99.99769); // Exact high-precision percentage
    expect(coverage.gapCount).toBe(1);
    expect(coverage.largestGapSeconds).toBe(2);
    expect(coverage.healthStatus).toBe('HEALTHY'); // >= 99.99% and gap <= 5s
  });

  it('verifies progressive segment integrity levels and detects SHA-256 hash tampering', () => {
    const buffer = Buffer.from('vault-security-camera-h265-raw-video-bytes');
    const validSha256 = createHash('sha256').update(buffer).digest('hex');

    // 1. Valid Level 6 evidence-grade verification
    const verified = SegmentVerifier.verifySegment({
      segmentId: 'seg-vault-001',
      cameraId: 'CAM-14',
      storagePath: '/mnt/storage/BR-118/CAM-14/seg-001.mp4',
      sha256: validSha256,
      sizeBytes: buffer.length,
      packetCount: 750,
      firstPts: 0,
      lastPts: 30000,
      rawBuffer: buffer,
    });
    expect(verified.isValid).toBe(true);
    expect(verified.highestVerificationLevel).toBe(VerificationLevel.LEVEL_6_EVIDENCE_GRADE);

    // 2. Corrupt / Tampered SHA-256 verification
    const tampered = SegmentVerifier.verifySegment({
      segmentId: 'seg-vault-002',
      cameraId: 'CAM-14',
      storagePath: '/mnt/storage/BR-118/CAM-14/seg-002.mp4',
      sha256: 'tampered-sha256-hash-value',
      sizeBytes: buffer.length,
      packetCount: 750,
      rawBuffer: buffer,
    });
    expect(tampered.isValid).toBe(false);
    expect(tampered.corruptReason).toContain('SHA-256 hash mismatch');
  });

  it('distinguishes physical recording gaps from index gaps via orphan recovery scanning', () => {
    const gapStart = new Date('2026-08-16T12:00:00.000Z');
    const gapEnd = new Date('2026-08-16T12:05:00.000Z');

    const storageFiles = [
      {
        path: '/mnt/storage/BR-118/CAM-14/orphan-120000.mp4',
        start: new Date('2026-08-16T12:00:00.000Z'),
        end: new Date('2026-08-16T12:05:00.000Z'),
        sha256: 'hash-orphan-01',
      },
    ];

    const result = SegmentVerifier.scanOrphanSegments('CAM-14', gapStart, gapEnd, storageFiles);
    expect(result.recoveredCount).toBe(1);
    expect(result.recoveredSegments[0]?.segmentId).toBe('recovered-seg-1');
  });

  it('evaluates live recording health across 4 independent dimensions', () => {
    const coordinator = new RecordingContinuityCoordinatorService();
    const now = new Date('2026-08-17T15:00:00.000Z');

    // Simulate active media received 3.2s ago
    coordinator.recordMediaPacket('cam-178-01', new Date(now.getTime() - 3200));

    const health = coordinator.getLiveRecordingHealth('cam-178-01', now);

    // Dimension 1: Live Recording
    expect(health.isRecordingActive).toBe(true);
    expect(health.recordingLagSeconds).toBe(3.2);

    // Dimension 2: Yesterday Coverage
    expect(health.yesterdayCoverage.coveragePercent).toBe(99.99769);
    expect(health.yesterdayCoverage.gapCount).toBe(1);
    expect(health.yesterdayCoverage.largestGapSeconds).toBe(2);

    // Dimension 3: Retention (89.4 days vs 90 days required)
    expect(health.retention.availableDays).toBe(89.4);
    expect(health.retention.retentionCompliant).toBe(false);

    // Dimension 4: Media Integrity
    expect(health.mediaIntegrity.status).toBe('VERIFIED');
    expect(health.mediaIntegrity.corruptSegments).toBe(0);
  });

  it('aggregates branch-level continuity rollups', () => {
    const coordinator = new RecordingContinuityCoordinatorService();
    const summary = coordinator.getBranchSummary('BR-118');

    expect(summary.branchId).toBe('BR-118');
    expect(summary.cameraCount).toBeGreaterThanOrEqual(3);
    expect(summary.overallCoveragePercent).toBeGreaterThan(99.9);
    expect(summary.total24hExpectedSeconds).toBeGreaterThan(0);
    expect(summary.total24hRecordedSeconds).toBeGreaterThan(0);
  });

  it('generates cryptographically signed daily continuity audit certificates', () => {
    const coordinator = new RecordingContinuityCoordinatorService();
    const cert = coordinator.generateSignedAuditCertificate('cam-178-01', '2026-08-16');

    expect(cert.certificateId).toBeDefined();
    expect(cert.coveragePercent).toBe(99.99769);
    expect(cert.verificationLevel).toBe(VerificationLevel.LEVEL_6_EVIDENCE_GRADE);
    expect(cert.signature.algorithm).toBe('Ed25519');
    expect(cert.signature.publicKey).toContain('BEGIN PUBLIC KEY');
    expect(cert.signature.signatureHex.length).toBeGreaterThan(64);
  });
});
