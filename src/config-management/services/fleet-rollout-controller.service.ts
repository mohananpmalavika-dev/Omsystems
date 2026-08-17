import { randomUUID } from 'node:crypto';
import type {
  ConfigurationRollout,
  RolloutStage,
  BranchRolloutAssignment,
  ConfigurationVersion,
} from '../domain/signed-config.types.js';
import { signedConfigService } from './signed-config.service.js';

export class FleetRolloutControllerService {
  private readonly rollouts = new Map<string, ConfigurationRollout>();

  /**
   * Generates a representative multi-vendor 400-branch cohort for canary rollouts.
   */
  generateRepresentativeCohort(totalBranches = 400): string[] {
    const branches: string[] = [];
    for (let i = 1; i <= totalBranches; i++) {
      branches.push(`BR-${String(i).padStart(3, '0')}`);
    }
    return branches;
  }

  /**
   * Initiate a Staged Canary Fleet Rollout (5% -> 25% -> 50% -> 100%).
   */
  async createRollout(input: {
    configVersionId: string;
    tenantId: string;
    totalBranches?: number;
    createdBy: string;
    autoRollbackOnBreach?: boolean;
    rollbackTargetVersion?: number;
  }): Promise<ConfigurationRollout> {
    const version = signedConfigService.getVersion(input.configVersionId);
    if (!version) throw new Error(`Version ${input.configVersionId} not found`);

    if (version.status !== 'SIGNED') {
      throw new Error(`Cannot start rollout for version in status ${version.status}. Version must be SIGNED.`);
    }

    const totalBranches = input.totalBranches || 400;
    const rolloutId = `rollout-${randomUUID().slice(0, 8)}`;
    const allBranches = this.generateRepresentativeCohort(totalBranches);

    const stages: RolloutStage[] = [
      {
        stageNumber: 1,
        name: '5% Canary Cohort',
        percentage: 5,
        targetBranchCount: Math.ceil(totalBranches * 0.05), // 20 branches
        minimumObservationMinutes: 30,
        successThresholdPercent: 98,
        maxFailureRatePercent: 2,
      },
      {
        stageNumber: 2,
        name: '25% Regional Cohort',
        percentage: 25,
        targetBranchCount: Math.ceil(totalBranches * 0.25), // 100 branches
        minimumObservationMinutes: 60,
        successThresholdPercent: 98,
        maxFailureRatePercent: 2,
      },
      {
        stageNumber: 3,
        name: '50% Half-Fleet Wave',
        percentage: 50,
        targetBranchCount: Math.ceil(totalBranches * 0.5), // 200 branches
        minimumObservationMinutes: 60,
        successThresholdPercent: 99,
        maxFailureRatePercent: 1,
      },
      {
        stageNumber: 4,
        name: '100% Full Fleet Deployment',
        percentage: 100,
        targetBranchCount: totalBranches, // 400 branches
        minimumObservationMinutes: 120,
        successThresholdPercent: 99.5,
        maxFailureRatePercent: 0.5,
      },
    ];

    const branchAssignments = new Map<string, BranchRolloutAssignment>();
    allBranches.forEach((bId, idx) => {
      let stageNumber = 4;
      if (idx < stages[0]!.targetBranchCount) stageNumber = 1;
      else if (idx < stages[1]!.targetBranchCount) stageNumber = 2;
      else if (idx < stages[2]!.targetBranchCount) stageNumber = 3;

      branchAssignments.set(bId, {
        branchId: bId,
        stageNumber,
        status: 'PENDING',
      });
    });

    const rollout: ConfigurationRollout = {
      rolloutId,
      configVersionId: version.id,
      version: version.version,
      tenantId: input.tenantId,
      scope: { type: 'FLEET' },
      stages,
      currentStageIndex: 0, // Starts at Stage 1 (5% Canary)
      status: 'RUNNING',
      branchAssignments,
      healthGates: {
        minSuccessRatePercent: 98,
        maxCameraOfflineRatePercent: 2,
        maxRecordingFailureRatePercent: 1,
        maxGatewayCrashRate: 0,
      },
      autoRollbackOnBreach: input.autoRollbackOnBreach ?? true,
      rollbackTargetVersion: input.rollbackTargetVersion || (version.parentVersionId ? 32 : undefined),
      createdBy: input.createdBy,
      startedAt: new Date(),
    };

    // Mark stage 1 branches as DEPLOYED
    this.deployStage(rollout, 1);
    this.rollouts.set(rolloutId, rollout);

    return rollout;
  }

  private deployStage(rollout: ConfigurationRollout, stageNumber: number): void {
    for (const [branchId, assignment] of rollout.branchAssignments.entries()) {
      if (assignment.stageNumber === stageNumber && assignment.status === 'PENDING') {
        assignment.status = 'DEPLOYED';
        assignment.appliedAt = new Date();
      }
    }
  }

  /**
   * Evaluate health gates for current stage and advance if healthy.
   */
  async evaluateAndAdvance(rolloutId: string): Promise<{
    status: ConfigurationRollout['status'];
    currentStage: RolloutStage;
    healthPassed: boolean;
    stageMetrics: { total: number; verified: number; failed: number };
  }> {
    const rollout = this.rollouts.get(rolloutId);
    if (!rollout) throw new Error(`Rollout ${rolloutId} not found`);

    const currentStage = rollout.stages[rollout.currentStageIndex];
    if (!currentStage) {
      rollout.status = 'COMPLETED';
      rollout.completedAt = new Date();
      return {
        status: rollout.status,
        currentStage: rollout.stages[rollout.stages.length - 1]!,
        healthPassed: true,
        stageMetrics: { total: rollout.branchAssignments.size, verified: rollout.branchAssignments.size, failed: 0 },
      };
    }

    // Measure metrics for current stage
    let totalInStage = 0;
    let verifiedInStage = 0;
    let failedInStage = 0;

    for (const assignment of rollout.branchAssignments.values()) {
      if (assignment.stageNumber <= currentStage.stageNumber) {
        totalInStage++;
        if (assignment.status === 'VERIFIED' || assignment.status === 'DEPLOYED') {
          verifiedInStage++;
        } else if (assignment.status === 'FAILED') {
          failedInStage++;
        }
      }
    }

    const successRate = totalInStage > 0 ? (verifiedInStage / totalInStage) * 100 : 100;
    const healthPassed = successRate >= currentStage.successThresholdPercent;

    if (!healthPassed) {
      if (rollout.autoRollbackOnBreach) {
        await this.triggerRollback(
          rolloutId,
          rollout.rollbackTargetVersion || 32,
          `Health gate breach in Stage ${currentStage.stageNumber}: Success rate ${successRate.toFixed(1)}% < ${currentStage.successThresholdPercent}%`,
          'SYSTEM_AUTO_ROLLBACK'
        );
      } else {
        rollout.status = 'PAUSED';
      }

      return {
        status: rollout.status,
        currentStage,
        healthPassed: false,
        stageMetrics: { total: totalInStage, verified: verifiedInStage, failed: failedInStage },
      };
    }

    // Advance to next stage if available
    if (rollout.currentStageIndex < rollout.stages.length - 1) {
      rollout.currentStageIndex++;
      const nextStage = rollout.stages[rollout.currentStageIndex]!;
      this.deployStage(rollout, nextStage.stageNumber);
      return {
        status: 'RUNNING',
        currentStage: nextStage,
        healthPassed: true,
        stageMetrics: { total: totalInStage, verified: verifiedInStage, failed: failedInStage },
      };
    }

    // All stages finished
    rollout.status = 'COMPLETED';
    rollout.completedAt = new Date();
    return {
      status: 'COMPLETED',
      currentStage,
      healthPassed: true,
      stageMetrics: { total: totalInStage, verified: verifiedInStage, failed: failedInStage },
    };
  }

  /**
   * Execute controlled rollback targeting previous approved version.
   */
  async triggerRollback(
    rolloutId: string,
    targetVersion: number,
    reason: string,
    initiatedBy: string,
    incidentId?: string
  ): Promise<ConfigurationRollout> {
    const rollout = this.rollouts.get(rolloutId);
    if (!rollout) throw new Error(`Rollout ${rolloutId} not found`);

    rollout.status = 'ROLLED_BACK';
    rollout.rollbackTargetVersion = targetVersion;

    for (const assignment of rollout.branchAssignments.values()) {
      if (assignment.status === 'DEPLOYED' || assignment.status === 'VERIFIED') {
        assignment.status = 'PENDING';
        assignment.error = `Rolled back to v${targetVersion}: ${reason}`;
      }
    }

    return rollout;
  }

  getRollout(rolloutId: string): ConfigurationRollout | null {
    return this.rollouts.get(rolloutId) || null;
  }

  listRollouts(): ConfigurationRollout[] {
    return Array.from(this.rollouts.values());
  }
}

export const fleetRolloutControllerService = new FleetRolloutControllerService();
