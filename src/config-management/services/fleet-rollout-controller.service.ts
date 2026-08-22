import { randomUUID } from 'node:crypto';
import type {
  ConfigurationRollout,
  RolloutStage,
  BranchRolloutAssignment,
  ConfigurationVersion,
} from '../domain/signed-config.types.js';
import { signedConfigService } from './signed-config.service.js';

export interface FleetConfigDispatcher {
  deploy(input: {
    rolloutId: string;
    branchId: string;
    version: ConfigurationVersion;
  }): Promise<void>;
  rollback(input: {
    rolloutId: string;
    branchId: string;
    targetVersion: number;
    reason: string;
  }): Promise<void>;
}

export class FleetRolloutControllerService {
  private readonly rollouts = new Map<string, ConfigurationRollout>();

  constructor(private readonly dispatcher?: FleetConfigDispatcher) {}

  async createRollout(input: {
    configVersionId: string;
    tenantId: string;
    branchIds: string[];
    createdBy: string;
    autoRollbackOnBreach?: boolean;
    rollbackTargetVersion?: number;
  }): Promise<ConfigurationRollout> {
    const version = signedConfigService.getVersion(input.configVersionId);
    if (!version || version.tenantId !== input.tenantId) {
      throw new Error(`Version ${input.configVersionId} not found`);
    }
    if (version.status !== 'SIGNED') {
      throw new Error(`Cannot start rollout for version in status ${version.status}. Version must be SIGNED.`);
    }
    if (!this.dispatcher) throw new Error('FLEET_CONFIG_DISPATCHER_NOT_CONFIGURED');

    const branchIds = Array.from(new Set(input.branchIds.filter(Boolean)));
    if (branchIds.length === 0) throw new Error('NO_REPORTED_BRANCHES');

    const totalBranches = branchIds.length;
    const rolloutId = `rollout-${randomUUID().slice(0, 8)}`;
    const percentages = [5, 25, 50, 100] as const;
    const names = ['5% Canary Cohort', '25% Regional Cohort', '50% Half-Fleet Wave', '100% Full Fleet Deployment'];
    const observationMinutes = [30, 60, 60, 120];
    const successThresholds = [98, 98, 99, 99.5];
    const failureThresholds = [2, 2, 1, 0.5];

    const stages: RolloutStage[] = percentages.map((percentage, index) => ({
      stageNumber: index + 1,
      name: names[index]!,
      percentage,
      targetBranchCount: Math.ceil(totalBranches * (percentage / 100)),
      minimumObservationMinutes: observationMinutes[index]!,
      successThresholdPercent: successThresholds[index]!,
      maxFailureRatePercent: failureThresholds[index]!,
    }));

    const branchAssignments = new Map<string, BranchRolloutAssignment>();
    branchIds.forEach((branchId, index) => {
      const ordinal = index + 1;
      const stage = stages.find((candidate) => ordinal <= candidate.targetBranchCount) ?? stages[3]!;
      branchAssignments.set(branchId, {
        branchId,
        stageNumber: stage.stageNumber,
        status: 'PENDING',
      });
    });

    const parentVersion = version.parentVersionId
      ? signedConfigService.getVersion(version.parentVersionId)
      : null;
    const rollbackTargetVersion = input.rollbackTargetVersion ?? parentVersion?.version;

    const rollout: ConfigurationRollout = {
      rolloutId,
      configVersionId: version.id,
      version: version.version,
      tenantId: input.tenantId,
      scope: { type: 'FLEET' },
      stages,
      currentStageIndex: 0,
      status: 'RUNNING',
      branchAssignments,
      healthGates: {
        minSuccessRatePercent: 98,
        maxCameraOfflineRatePercent: 2,
        maxRecordingFailureRatePercent: 1,
        maxGatewayCrashRate: 0,
      },
      autoRollbackOnBreach: input.autoRollbackOnBreach ?? true,
      ...(rollbackTargetVersion !== undefined ? { rollbackTargetVersion } : {}),
      createdBy: input.createdBy,
      startedAt: new Date(),
    };

    this.rollouts.set(rolloutId, rollout);
    await this.dispatchStage(rollout, version, 1);
    return rollout;
  }

  private async dispatchStage(
    rollout: ConfigurationRollout,
    version: ConfigurationVersion,
    stageNumber: number,
  ): Promise<void> {
    if (!this.dispatcher) throw new Error('FLEET_CONFIG_DISPATCHER_NOT_CONFIGURED');

    for (const assignment of rollout.branchAssignments.values()) {
      if (assignment.stageNumber !== stageNumber || assignment.status !== 'PENDING') continue;
      try {
        await this.dispatcher.deploy({
          rolloutId: rollout.rolloutId,
          branchId: assignment.branchId,
          version,
        });
        assignment.status = 'DEPLOYED';
        assignment.appliedAt = new Date();
      } catch (error) {
        assignment.status = 'FAILED';
        assignment.error = error instanceof Error ? error.message : 'CONFIGURATION_DISPATCH_FAILED';
      }
    }
  }

  recordBranchResult(
    rolloutId: string,
    branchId: string,
    result: { status: 'VERIFIED' | 'FAILED' | 'OFFLINE'; error?: string },
  ): BranchRolloutAssignment {
    const rollout = this.rollouts.get(rolloutId);
    if (!rollout) throw new Error(`Rollout ${rolloutId} not found`);
    const assignment = rollout.branchAssignments.get(branchId);
    if (!assignment) throw new Error(`Branch ${branchId} is not assigned to rollout ${rolloutId}`);

    assignment.status = result.status;
    assignment.error = result.error;
    if (result.status === 'VERIFIED') assignment.verifiedAt = new Date();
    return assignment;
  }

  async evaluateAndAdvance(rolloutId: string): Promise<{
    status: ConfigurationRollout['status'];
    currentStage: RolloutStage;
    healthPassed: boolean;
    stageMetrics: { total: number; verified: number; failed: number };
  }> {
    const rollout = this.rollouts.get(rolloutId);
    if (!rollout) throw new Error(`Rollout ${rolloutId} not found`);

    const currentStage = rollout.stages[rollout.currentStageIndex]!;
    const assignments = Array.from(rollout.branchAssignments.values())
      .filter((assignment) => assignment.stageNumber <= currentStage.stageNumber);
    const verified = assignments.filter((assignment) => assignment.status === 'VERIFIED').length;
    const failed = assignments.filter(
      (assignment) => assignment.status === 'FAILED' || assignment.status === 'OFFLINE',
    ).length;
    const completed = verified + failed;
    const stageMetrics = { total: assignments.length, verified, failed };

    if (completed < assignments.length) {
      return { status: rollout.status, currentStage, healthPassed: false, stageMetrics };
    }

    const successRate = assignments.length > 0 ? (verified / assignments.length) * 100 : 0;
    const healthPassed = successRate >= currentStage.successThresholdPercent;
    if (!healthPassed) {
      if (rollout.autoRollbackOnBreach && rollout.rollbackTargetVersion !== undefined) {
        await this.triggerRollback(
          rolloutId,
          rollout.rollbackTargetVersion,
          `Health gate breach in stage ${currentStage.stageNumber}`,
          'SYSTEM_AUTO_ROLLBACK',
        );
      } else {
        rollout.status = 'PAUSED';
      }
      return { status: rollout.status, currentStage, healthPassed: false, stageMetrics };
    }

    if (rollout.currentStageIndex >= rollout.stages.length - 1) {
      rollout.status = 'COMPLETED';
      rollout.completedAt = new Date();
      return { status: rollout.status, currentStage, healthPassed: true, stageMetrics };
    }

    rollout.currentStageIndex++;
    const nextStage = rollout.stages[rollout.currentStageIndex]!;
    const version = signedConfigService.getVersion(rollout.configVersionId);
    if (!version) throw new Error(`Version ${rollout.configVersionId} not found`);
    await this.dispatchStage(rollout, version, nextStage.stageNumber);
    return { status: rollout.status, currentStage: nextStage, healthPassed: true, stageMetrics };
  }

  async triggerRollback(
    rolloutId: string,
    targetVersion: number,
    reason: string,
    _initiatedBy: string,
    _incidentId?: string,
  ): Promise<ConfigurationRollout> {
    const rollout = this.rollouts.get(rolloutId);
    if (!rollout) throw new Error(`Rollout ${rolloutId} not found`);
    if (!this.dispatcher) throw new Error('FLEET_CONFIG_DISPATCHER_NOT_CONFIGURED');

    rollout.status = 'ROLLING_BACK';
    rollout.rollbackTargetVersion = targetVersion;
    for (const assignment of rollout.branchAssignments.values()) {
      if (assignment.status !== 'DEPLOYED' && assignment.status !== 'VERIFIED') continue;
      await this.dispatcher.rollback({
        rolloutId,
        branchId: assignment.branchId,
        targetVersion,
        reason,
      });
      assignment.status = 'PENDING';
      assignment.error = undefined;
    }
    rollout.status = 'ROLLED_BACK';
    rollout.completedAt = new Date();
    return rollout;
  }

  getRollout(rolloutId: string): ConfigurationRollout | null {
    return this.rollouts.get(rolloutId) || null;
  }

  listRollouts(tenantId?: string): ConfigurationRollout[] {
    return Array.from(this.rollouts.values())
      .filter((rollout) => !tenantId || rollout.tenantId === tenantId);
  }
}

export const fleetRolloutControllerService = new FleetRolloutControllerService();
