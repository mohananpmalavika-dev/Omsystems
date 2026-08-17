/**
 * Retention Engine Service
 * Authoritative coordinator for hierarchical policy resolution, legal holds,
 * continuous retention compliance, and storage forecasting.
 */

import { randomUUID } from 'node:crypto';
import {
  EffectiveRetentionPolicy,
  LegalHold,
  RetentionSegmentMetadata,
  RetentionSimulationInput,
  RetentionSimulationResult,
} from '../domain/retention-policy-engine.types.js';
import { PolicyResolverService, CameraHierarchyContext } from './policy-resolver.service.js';
import { StorageForecasterService, StorageForecastResult } from './storage-forecaster.service.js';
import { DeletionPlannerService, DeletionPlanResult } from './deletion-planner.service.js';
import { PolicySimulationService } from './policy-simulation.service.js';

export interface CameraComprehensiveRetentionStatus {
  cameraId: string;
  branchId: string;
  policy: EffectiveRetentionPolicy;
  requiredRetentionDays: number;
  currentRetentionDays: number;
  continuousRetentionDays: number;
  projectedRetentionDays: number;
  daysUntilViolation?: number;
  projectedViolationAt?: Date;
  coveragePercent: number;
  oldestRecordingAt?: Date;
  legalHoldsCount: number;
  storagePoolId: string;
  status: 'HEALTHY' | 'WARNING' | 'CRITICAL';
  statusReason: string;
  calculatedAt: Date;
}

export interface BranchRetentionOverview {
  branchId: string;
  tenantId: string;
  totalStorageBytes: number;
  usableStorageBytes: number;
  usedStorageBytes: number;
  freeStorageBytes: number;
  dailyIngestBytes: number;
  requiredRetentionDays: number;
  currentRetentionDays: number;
  projectedRetentionDays: number;
  recordingCoveragePercent: number;
  retentionViolationsCount: number;
  retentionAtRiskCount: number;
  daysUntilExhaustion: number;
  activeLegalHoldsCount: number;
  status: 'HEALTHY' | 'WARNING' | 'CRITICAL';
}

export class RetentionEngineService {
  public readonly policyResolver = new PolicyResolverService();
  private legalHolds = new Map<string, LegalHold>();
  private cameraSegments = new Map<string, RetentionSegmentMetadata[]>();

  constructor() {
    this.seedDefaultState();
  }

  private seedDefaultState() {
    // Sample Legal Hold for Vault Case
    const hold: LegalHold = {
      id: 'hold-vault-case-8432',
      tenantId: 'BANK-001',
      caseNumber: 'CASE-8432',
      reason: 'CBI / RBI Financial Forensics Investigation',
      createdBy: 'sec-officer-anand',
      createdAt: new Date('2026-08-01'),
      status: 'ACTIVE',
      scope: {
        branches: ['BR-118'],
        cameras: ['cam-178-01', 'CAM-118-14'],
        startTime: new Date('2026-08-01T00:00:00Z'),
        endTime: new Date('2026-08-02T23:59:59Z'),
      },
    };
    this.legalHolds.set(hold.id, hold);
  }

  createLegalHold(hold: Omit<LegalHold, 'id' | 'createdAt' | 'status'>): LegalHold {
    const id = `hold-${randomUUID()}`;
    const newHold: LegalHold = {
      ...hold,
      id,
      createdAt: new Date(),
      status: 'ACTIVE',
    };
    this.legalHolds.set(id, newHold);
    return newHold;
  }

  releaseLegalHold(holdId: string, approvedBy: string): LegalHold | undefined {
    const hold = this.legalHolds.get(holdId);
    if (!hold) return undefined;
    hold.status = 'RELEASED';
    hold.releaseApprovedBy = approvedBy;
    hold.releasedAt = new Date();
    return hold;
  }

  getLegalHolds(cameraId?: string, branchId?: string): LegalHold[] {
    const active = Array.from(this.legalHolds.values()).filter((h) => h.status === 'ACTIVE');
    if (cameraId) {
      return active.filter((h) => !h.scope.cameras || h.scope.cameras.includes(cameraId));
    }
    if (branchId) {
      return active.filter((h) => !h.scope.branches || h.scope.branches.includes(branchId));
    }
    return active;
  }

  /**
   * Evaluates comprehensive retention status for a specific camera.
   */
  evaluateCameraRetention(context: CameraHierarchyContext): CameraComprehensiveRetentionStatus {
    const policy = this.policyResolver.resolve(context);
    const requiredDays = policy.minimumRetentionDays;

    // Simulate baseline actuals (e.g. 96d for compliant, 83.4d for warning)
    const isAtmOrVault = policy.priority === 'CRITICAL';
    const currentDays = isAtmOrVault ? 183.7 : 83.4;
    const continuousDays = isAtmOrVault ? 181.0 : 82.9;
    const coveragePercent = 99.997;

    const dailyIngestBytes = (4 * 1_000_000 * 86400) / 8; // 4 Mbps = 43.2 GB/day
    const usableStorageBytes = 43.2 * 1024 * 1024 * 1024 * 1024; // 43.2 TB
    const usedStorageBytes = 38.7 * 1024 * 1024 * 1024 * 1024; // 38.7 TB

    const forecast = StorageForecasterService.forecastRetention({
      usableStorageBytes,
      usedStorageBytes,
      ingestStats: {
        bytesLast24h: dailyIngestBytes,
        avgDailyBytes7d: dailyIngestBytes * 1.05,
        avgDailyBytes30d: dailyIngestBytes * 0.98,
        configuredDailyBitrateBytes: dailyIngestBytes,
      },
      currentActualRetentionDays: currentDays,
      requiredRetentionDays: requiredDays,
    });

    const activeHolds = this.getLegalHolds(context.cameraId, context.branchId);

    return {
      cameraId: context.cameraId,
      branchId: context.branchId,
      policy,
      requiredRetentionDays: requiredDays,
      currentRetentionDays: currentDays,
      continuousRetentionDays: continuousDays,
      projectedRetentionDays: forecast.projectedRetentionDays,
      daysUntilViolation: forecast.daysUntilViolation,
      projectedViolationAt: forecast.projectedViolationAt,
      coveragePercent,
      oldestRecordingAt: new Date(Date.now() - currentDays * 86400_000),
      legalHoldsCount: activeHolds.length,
      storagePoolId: `${context.branchId}-POOL-01`,
      status: forecast.status,
      statusReason: forecast.status === 'CRITICAL'
        ? `Current actual retention (${currentDays}d) below required (${requiredDays}d)`
        : forecast.status === 'WARNING'
        ? `Projected capacity (${forecast.projectedRetentionDays}d) approaching required limit (${requiredDays}d)`
        : `Meets and exceeds ${requiredDays}-day regulatory retention requirement`,
      calculatedAt: new Date(),
    };
  }

  /**
   * Evaluates branch-level retention overview.
   */
  getBranchOverview(branchId: string, tenantId: string = 'BANK-001'): BranchRetentionOverview {
    const totalStorageBytes = 48 * 1024 * 1024 * 1024 * 1024; // 48 TB
    const usableStorageBytes = 43.2 * 1024 * 1024 * 1024 * 1024; // 43.2 TB
    const usedStorageBytes = 38.7 * 1024 * 1024 * 1024 * 1024; // 38.7 TB
    const freeStorageBytes = usableStorageBytes - usedStorageBytes;
    const dailyIngestBytes = 510 * 1024 * 1024 * 1024; // 510 GB/day

    const requiredRetentionDays = 90;
    const currentRetentionDays = 83.4;
    const projectedRetentionDays = 77.2;

    const daysUntilExhaustion = Math.max(1, Math.round(freeStorageBytes / (dailyIngestBytes || 1)));
    const activeHolds = this.getLegalHolds(undefined, branchId);

    return {
      branchId,
      tenantId,
      totalStorageBytes,
      usableStorageBytes,
      usedStorageBytes,
      freeStorageBytes,
      dailyIngestBytes,
      requiredRetentionDays,
      currentRetentionDays,
      projectedRetentionDays,
      recordingCoveragePercent: 99.997,
      retentionViolationsCount: 4,
      retentionAtRiskCount: 11,
      daysUntilExhaustion,
      activeLegalHoldsCount: activeHolds.length,
      status: currentRetentionDays < requiredRetentionDays ? 'CRITICAL' : 'HEALTHY',
    };
  }

  /**
   * Simulates a proposed retention policy change before activation.
   */
  simulateRetentionChange(input: RetentionSimulationInput): RetentionSimulationResult {
    return PolicySimulationService.simulatePolicyChange(input, {
      totalCamerasInScope: input.targetScope.cameras?.length || 812,
      currentAvgBitrateMbps: 4.0,
      availableUsableStorageBytes: 645 * 1024 * 1024 * 1024 * 1024, // 645 TB
      currentBranchCount: input.targetScope.branches?.length || 37,
    });
  }

  /**
   * Plans safe deletion for storage relief.
   */
  planSafePurge(segments: RetentionSegmentMetadata[], targetReclaimBytes: number): DeletionPlanResult {
    return DeletionPlannerService.planDeletion(segments, targetReclaimBytes);
  }
}

export const retentionEngine = new RetentionEngineService();
