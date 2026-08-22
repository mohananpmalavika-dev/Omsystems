/**
 * Retention Policy Simulation & Pre-Deployment Capacity Planning Service
 */

import { randomUUID } from 'node:crypto';
import {
  RetentionSimulationInput,
  RetentionSimulationResult,
} from '../domain/retention-policy-engine.types.js';

export class PolicySimulationService {
  /**
   * Simulates proposed retention policy changes across camera fleets before deployment.
   */
  static simulatePolicyChange(
    input: RetentionSimulationInput,
    fleetContext: {
      totalCamerasInScope: number;
      currentAvgBitrateMbps: number;
      availableUsableStorageBytes: number;
      currentBranchCount: number;
    }
  ): RetentionSimulationResult {
    const { proposedMinimumDays, proposedTargetDays } = input;
    const {
      totalCamerasInScope,
      currentAvgBitrateMbps,
      availableUsableStorageBytes,
      currentBranchCount,
    } = fleetContext;

    // Daily storage per camera = Bitrate * 86,400 / 8
    const bytesPerCameraPerDay = (currentAvgBitrateMbps * 1_000_000 * 86400) / 8;
    const totalDailyIngestBytes = bytesPerCameraPerDay * totalCamerasInScope;

    const currentBaseDays = 90; // Default current baseline
    const currentRequiredCapacityBytes = totalDailyIngestBytes * currentBaseDays;
    const newRequiredCapacityBytes = totalDailyIngestBytes * proposedTargetDays;

    const capacityDeltaBytes = newRequiredCapacityBytes - currentRequiredCapacityBytes;
    const capacityShortfallBytes = Math.max(0, newRequiredCapacityBytes - availableUsableStorageBytes);
    const isFeasibleWithoutExpansion = capacityShortfallBytes === 0;

    let earliestProjectedViolationBranch: string | undefined;
    let earliestProjectedViolationDays: number | undefined;

    if (!isFeasibleWithoutExpansion) {
      earliestProjectedViolationBranch = input.targetScope.branches?.[0] || 'BR-281';
      const availableDaysUnderNewRate = availableUsableStorageBytes / (totalDailyIngestBytes || 1);
      earliestProjectedViolationDays = Math.max(1, Math.round(availableDaysUnderNewRate * 0.1));
    }

    return {
      simulationId: `sim-${randomUUID()}`,
      affectedCamerasCount: totalCamerasInScope,
      currentRequiredCapacityBytes,
      newRequiredCapacityBytes,
      availableUsableStorageBytes,
      capacityDeltaBytes,
      capacityShortfallBytes,
      isFeasibleWithoutExpansion,
      affectedBranchesCount: currentBranchCount,
      earliestProjectedViolationBranch,
      earliestProjectedViolationDays,
      calculatedAt: new Date(),
    };
  }
}
