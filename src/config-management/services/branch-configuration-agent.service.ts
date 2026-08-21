import type {
  BranchConfiguration,
  SignedConfigManifest,
  BranchApplyResult,
  ComponentApplyResult,
} from '../domain/signed-config.types.js';
import { computeConfigHash, configKeyService } from './config-key.service.js';
import { signedConfigService } from './signed-config.service.js';

export interface BranchConfigurationApplyRequest {
  branchId: string;
  gatewayId: string;
  manifest: SignedConfigManifest;
  config: BranchConfiguration;
  isRollbackOperation?: boolean;
}

export interface BranchConfigurationApplyResponse {
  components: ComponentApplyResult[];
  actualConfig: BranchConfiguration;
  appliedPackageSha256?: string;
}

export interface BranchConfigurationRestoreResponse {
  actualConfig: BranchConfiguration;
  appliedVersion: number;
  appliedPackageSha256?: string;
}

export interface BranchConfigurationApplier {
  applyConfiguration(input: BranchConfigurationApplyRequest): Promise<BranchConfigurationApplyResponse>;
  restoreCheckpoint?(
    tenantId: string,
    branchId: string,
    gatewayId: string,
  ): Promise<BranchConfigurationRestoreResponse | null>;
}

export class BranchConfigurationAgentService {
  private readonly highestAcceptedVersions = new Map<string, number>();

  constructor(private readonly applier?: BranchConfigurationApplier) {}

  private stateKey(tenantId: string, branchId: string): string {
    return `${tenantId}:${branchId}`;
  }

  private failedResult(
    input: BranchConfigurationApplyRequest,
    startedAt: Date,
    message: string,
  ): BranchApplyResult {
    return {
      branchId: input.branchId,
      gatewayId: input.gatewayId,
      version: input.manifest.configVersion,
      packageId: input.manifest.packageId,
      overallStatus: 'APPLY_FAILED',
      components: [{
        componentId: 'configuration-applier',
        componentType: 'security',
        status: 'FAILED',
        errorMessage: message,
      }],
      startedAt,
      completedAt: new Date(),
    };
  }

  async reconcileBranch(input: BranchConfigurationApplyRequest): Promise<BranchApplyResult> {
    const startedAt = new Date();
    const verification = configKeyService.verifyPackage(input.manifest, input.config);
    if (!verification.valid) {
      return this.failedResult(input, startedAt, `Integrity verification rejected: ${verification.reason}`);
    }

    const key = this.stateKey(input.manifest.tenantId, input.branchId);
    const highestAccepted = this.highestAcceptedVersions.get(key) ?? 0;
    if (!input.isRollbackOperation && input.manifest.configVersion < highestAccepted) {
      return this.failedResult(
        input,
        startedAt,
        `DOWNGRADE_NOT_AUTHORIZED: Incoming v${input.manifest.configVersion} < highest accepted v${highestAccepted}`,
      );
    }

    if (!this.applier) {
      return this.failedResult(input, startedAt, 'CONFIGURATION_APPLIER_NOT_CONFIGURED');
    }

    try {
      const applied = await this.applier.applyConfiguration(input);
      const hasFailure = applied.components.some(
        (component) => component.status === 'FAILED' || component.status === 'SKIPPED',
      );
      const allVerified = applied.components.length > 0
        && applied.components.every((component) => component.status === 'VERIFIED');

      await signedConfigService.reportActualState({
        tenantId: input.manifest.tenantId,
        branchId: input.branchId,
        gatewayId: input.gatewayId,
        appliedVersion: input.manifest.configVersion,
        appliedPackageSha256: applied.appliedPackageSha256 ?? computeConfigHash(applied.actualConfig),
        actualConfig: applied.actualConfig,
      });

      if (allVerified) {
        this.highestAcceptedVersions.set(
          key,
          Math.max(highestAccepted, input.manifest.configVersion),
        );
      }

      return {
        branchId: input.branchId,
        gatewayId: input.gatewayId,
        version: input.manifest.configVersion,
        packageId: input.manifest.packageId,
        overallStatus: allVerified
          ? 'VERIFIED'
          : hasFailure
            ? 'APPLY_FAILED'
            : 'PARTIALLY_APPLIED',
        components: applied.components,
        startedAt,
        completedAt: new Date(),
      };
    } catch (error) {
      return this.failedResult(
        input,
        startedAt,
        error instanceof Error ? error.message : 'CONFIGURATION_APPLY_FAILED',
      );
    }
  }

  async restoreCheckpoint(
    tenantId: string,
    branchId: string,
    gatewayId: string,
  ): Promise<BranchConfiguration | null> {
    if (!this.applier?.restoreCheckpoint) return null;

    const restored = await this.applier.restoreCheckpoint(tenantId, branchId, gatewayId);
    if (!restored) return null;

    await signedConfigService.reportActualState({
      tenantId,
      branchId,
      gatewayId,
      appliedVersion: restored.appliedVersion,
      appliedPackageSha256: restored.appliedPackageSha256 ?? computeConfigHash(restored.actualConfig),
      actualConfig: restored.actualConfig,
    });

    return restored.actualConfig;
  }
}

export const branchConfigurationAgentService = new BranchConfigurationAgentService();
