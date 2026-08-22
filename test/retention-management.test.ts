import { describe, it, expect } from 'vitest';
import {
  PolicyResolverService,
  StorageForecasterService,
  DeletionPlannerService,
  PolicySimulationService,
  RetentionEngineService,
} from '../src/retention/index.js';
import { RetentionSegmentMetadata } from '../src/retention/domain/retention-policy-engine.types.js';

describe('Retention Management Subsystem (Banking Policy & Storage Core)', () => {
  it('resolves effective retention policy through the 5-layer hierarchy', () => {
    const resolver = new PolicyResolverService();

    // 1. Tenant Default (Bank default 90 days)
    const lobbyRes = resolver.resolve({
      cameraId: 'CAM-LOBBY-01',
      branchId: 'BR-118',
      tenantId: 'BANK-001',
    });
    expect(lobbyRes.source).toBe('TENANT');
    expect(lobbyRes.minimumRetentionDays).toBe(90);
    expect(lobbyRes.targetRetentionDays).toBe(100);

    // 2. Camera Group Policy (ATM group 180 days)
    const atmRes = resolver.resolve({
      cameraId: 'ATM-04',
      cameraGroup: 'ATM',
      branchId: 'BR-118',
      tenantId: 'BANK-001',
    });
    expect(atmRes.source).toBe('GROUP');
    expect(atmRes.minimumRetentionDays).toBe(180);
    expect(atmRes.priority).toBe('CRITICAL');

    // 3. Camera Override (High-risk vault override 365 days)
    resolver.setCameraOverride('CAM-VAULT-SPECIAL', {
      id: 'pol-override-365d',
      tenantId: 'BANK-001',
      name: 'Special Vault 365-Day Override',
      minimumRetentionDays: 365,
      targetRetentionDays: 370,
      priority: 'CRITICAL',
      storageClass: 'ARCHIVE',
      deleteAfterRetention: false,
      allowTiering: true,
      legalHoldOverride: true,
      enabled: true,
      version: 1,
      effectiveFrom: new Date(),
      createdBy: 'chief-security-officer',
    });

    const overrideRes = resolver.resolve({
      cameraId: 'CAM-VAULT-SPECIAL',
      cameraGroup: 'VAULT',
      branchId: 'BR-118',
      tenantId: 'BANK-001',
    });
    expect(overrideRes.source).toBe('CAMERA');
    expect(overrideRes.minimumRetentionDays).toBe(365);
  });

  it('calculates weighted storage forecasting and predicts time-to-violation', () => {
    const usableStorage = 12 * 1024 * 1024 * 1024 * 1024; // 12 TB
    const usedStorage = 10 * 1024 * 1024 * 1024 * 1024; // 10 TB
    const baseDailyBytes = 150 * 1024 * 1024 * 1024; // 150 GB/day

    // 1. Forecast with capacity shortage (Projected 80d < Required 90d)
    const forecast = StorageForecasterService.forecastRetention({
      usableStorageBytes: usableStorage,
      usedStorageBytes: usedStorage,
      ingestStats: {
        bytesLast24h: baseDailyBytes,
        avgDailyBytes7d: baseDailyBytes * 1.05,
        avgDailyBytes30d: baseDailyBytes * 0.95,
        configuredDailyBitrateBytes: baseDailyBytes,
      },
      currentActualRetentionDays: 94,
      requiredRetentionDays: 90,
    });

    expect(forecast.projectedRetentionDays).toBeLessThan(90);
    expect(forecast.isProjectedCompliant).toBe(false);
    expect(forecast.daysUntilViolation).toBeDefined();
    expect(forecast.daysUntilViolation).toBeGreaterThan(0);
    expect(forecast.status).toBe('WARNING');
  });

  it('blocks deletion of segments under active legal holds and evidence locks', () => {
    const now = new Date('2026-08-17T12:00:00.000Z');
    const pastRetainDate = new Date('2026-07-01T00:00:00.000Z'); // Expired 47 days ago

    // 1. Expired segment with NO legal holds -> Can delete
    const freeSeg: RetentionSegmentMetadata = {
      id: 'seg-001',
      cameraId: 'CAM-01',
      startTime: new Date('2026-01-01'),
      endTime: new Date('2026-01-01T00:00:30'),
      sizeBytes: 15_000_000,
      storageNodeId: 'node-01',
      storageTier: 'WARM',
      retentionPolicyId: 'pol-90d',
      minimumRetainUntil: pastRetainDate,
      legalHoldCount: 0,
      isEvidenceLocked: false,
      priority: 'LOW',
      deletionState: 'ELIGIBLE',
    };
    expect(DeletionPlannerService.canDeleteSegment(freeSeg, now)).toBe(true);

    // 2. Expired segment WITH Legal Hold -> MUST NOT delete
    const heldSeg: RetentionSegmentMetadata = {
      ...freeSeg,
      id: 'seg-held-002',
      legalHoldCount: 1,
    };
    expect(DeletionPlannerService.canDeleteSegment(heldSeg, now)).toBe(false);

    // 3. Expired segment WITH Evidence Lock -> MUST NOT delete
    const lockedSeg: RetentionSegmentMetadata = {
      ...freeSeg,
      id: 'seg-locked-003',
      isEvidenceLocked: true,
    };
    expect(DeletionPlannerService.canDeleteSegment(lockedSeg, now)).toBe(false);
  });

  it('ranks deletion candidates by lowest priority first and fails loud under storage exhaustion', () => {
    const now = new Date('2026-08-17T12:00:00.000Z');
    const pastRetainDate = new Date('2026-07-01T00:00:00.000Z');

    const lowPrioritySeg: RetentionSegmentMetadata = {
      id: 'seg-low-01',
      cameraId: 'CAM-CORRIDOR',
      startTime: new Date('2026-01-01'),
      endTime: new Date('2026-01-01T00:00:30'),
      sizeBytes: 10_000_000,
      storageNodeId: 'node-01',
      storageTier: 'WARM',
      retentionPolicyId: 'pol-30d',
      minimumRetainUntil: pastRetainDate,
      legalHoldCount: 0,
      priority: 'LOW',
      deletionState: 'ELIGIBLE',
    };

    const criticalPrioritySeg: RetentionSegmentMetadata = {
      id: 'seg-crit-02',
      cameraId: 'CAM-ATM-04',
      startTime: new Date('2026-01-01'),
      endTime: new Date('2026-01-01T00:00:30'),
      sizeBytes: 20_000_000,
      storageNodeId: 'node-01',
      storageTier: 'WARM',
      retentionPolicyId: 'pol-180d',
      minimumRetainUntil: pastRetainDate,
      legalHoldCount: 0,
      priority: 'CRITICAL',
      deletionState: 'ELIGIBLE',
    };

    const plan = DeletionPlannerService.planDeletion([criticalPrioritySeg, lowPrioritySeg], 15_000_000, now);
    expect(plan.eligibleSegments.length).toBeGreaterThanOrEqual(1);
    // LOW priority segment selected first
    expect(plan.eligibleSegments[0]?.id).toBe('seg-low-01');

    // Fail-loud test: when all data is protected and cannot satisfy target reclaim
    const protectedSeg: RetentionSegmentMetadata = {
      ...criticalPrioritySeg,
      minimumRetainUntil: new Date('2026-09-01'), // Future minimum retention
    };
    const failLoudPlan = DeletionPlannerService.planDeletion([protectedSeg], 50_000_000, now);
    expect(failLoudPlan.storageExhaustionRisk).toBe(true);
    expect(failLoudPlan.exhaustionWarningMessage).toContain('CRITICAL: Storage pressure cannot be relieved');
  });

  it('simulates proposed retention policy changes before deployment', () => {
    const simulation = PolicySimulationService.simulatePolicyChange(
      {
        tenantId: 'BANK-001',
        policyName: 'ATM 90 to 180 Days Expansion',
        targetScope: { branches: ['BR-118', 'BR-281'], cameras: ['ATM-01', 'ATM-02'] },
        proposedMinimumDays: 180,
        proposedTargetDays: 190,
      },
      {
        totalCamerasInScope: 812,
        currentAvgBitrateMbps: 4.0,
        availableUsableStorageBytes: 645 * 1024 * 1024 * 1024 * 1024, // 645 TB
        currentBranchCount: 37,
      }
    );

    expect(simulation.simulationId).toBeDefined();
    expect(simulation.affectedCamerasCount).toBe(812);
    expect(simulation.newRequiredCapacityBytes).toBeGreaterThan(simulation.currentRequiredCapacityBytes);
    expect(simulation.capacityDeltaBytes).toBeGreaterThan(0);
    expect(simulation.calculatedAt).toBeDefined();
  });

  it('coordinates camera and branch retention health in RetentionEngineService', () => {
    const engine = new RetentionEngineService();

    // 1. Comprehensive camera status
    const camStatus = engine.evaluateCameraRetention({
      cameraId: 'ATM-04',
      cameraGroup: 'ATM',
      branchId: 'BR-118',
      tenantId: 'BANK-001',
    });
    expect(camStatus.requiredRetentionDays).toBe(180);
    expect(camStatus.currentRetentionDays).toBeGreaterThanOrEqual(180);
    expect(camStatus.coveragePercent).toBeGreaterThan(99.9);

    // 2. Branch overview
    const branchOverview = engine.getBranchOverview('BR-118');
    expect(branchOverview.branchId).toBe('BR-118');
    expect(branchOverview.usableStorageBytes).toBeGreaterThan(0);
    expect(branchOverview.daysUntilExhaustion).toBeGreaterThan(0);

    // 3. Legal Hold Lifecycle
    const newHold = engine.createLegalHold({
      tenantId: 'BANK-001',
      caseNumber: 'CASE-9921',
      reason: 'Lobby security review',
      createdBy: 'auditor-ramesh',
      scope: {
        branches: ['BR-118'],
        cameras: ['CAM-LOBBY-01'],
        startTime: new Date('2026-08-10'),
        endTime: new Date('2026-08-12'),
      },
    });
    expect(newHold.status).toBe('ACTIVE');

    const released = engine.releaseLegalHold(newHold.id, 'lead-investigator');
    expect(released?.status).toBe('RELEASED');
  });
});
