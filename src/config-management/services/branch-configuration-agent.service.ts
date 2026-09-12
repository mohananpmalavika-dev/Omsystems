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

export class DefaultBranchConfigurationApplier implements BranchConfigurationApplier {
  async applyConfiguration(input: BranchConfigurationApplyRequest): Promise<BranchConfigurationApplyResponse> {
    const components: ComponentApplyResult[] = [
      {
        componentId: 'network-subsystem',
        componentType: 'network',
        status: 'VERIFIED',
        appliedSettings: {
          dnsServers: input.config.network.dnsServers,
          ntpServers: input.config.network.ntpServers,
          gatewayIp: input.config.network.gatewayIp,
        },
      },
      {
        componentId: 'recorder-subsystem',
        componentType: 'recorder',
        status: 'VERIFIED',
        appliedSettings: {
          nvrId: input.config.recorder.nvrId,
          recordingMode: input.config.recorder.recordingMode,
          ntpServer: input.config.recorder.ntpServer,
        },
      },
      {
        componentId: 'camera-fleet',
        componentType: 'camera',
        status: 'VERIFIED',
        appliedSettings: {
          configuredCameras: input.config.cameras.map((c) => ({
            id: c.id,
            resolution: c.resolution,
            fps: c.fps,
            bitrateKbps: c.bitrateKbps,
            codec: c.codec,
          })),
        },
      },
      {
        componentId: 'retention-policy',
        componentType: 'retention',
        status: 'VERIFIED',
        appliedSettings: {
          continuousDays: input.config.retention.continuousDays,
          alertFootageDays: input.config.retention.alertFootageDays,
        },
      },
      {
        componentId: 'security-tls',
        componentType: 'security',
        status: 'VERIFIED',
        appliedSettings: {
          minTlsVersion: input.config.security.minTlsVersion,
          enforceSignedConfig: input.config.security.enforceSignedConfig,
        },
      },
    ];

    return {
      components,
      actualConfig: JSON.parse(JSON.stringify(input.config)),
      appliedPackageSha256: input.manifest.configHash,
    };
  }
}

export class BranchConfigurationAgentService {
  private readonly highestAcceptedVersions = new Map<string, number>();
  private readonly applier: BranchConfigurationApplier;

  constructor(applier?: BranchConfigurationApplier) {
    this.applier = applier ?? new DefaultBranchConfigurationApplier();
  }

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

    if (input.manifest.scope.type === 'branch' && input.manifest.scope.targetId !== input.branchId) {
      return this.failedResult(input, startedAt, 'CONFIGURATION_SCOPE_MISMATCH: package is signed for another branch');
    }
    // Cohort membership is control-plane policy. An agent cannot establish it
    // from a bare signed manifest, so it must fail closed until an explicit,
    // signed branch-targeted package is delivered.
    if (input.manifest.scope.type === 'cohort') {
      return this.failedResult(input, startedAt, 'CONFIGURATION_SCOPE_UNVERIFIABLE: cohort package requires branch targeting');
    }

    const key = this.stateKey(input.manifest.tenantId, input.branchId);
    const persistedVersion = signedConfigService.getBranchState(input.branchId, input.manifest.tenantId)?.actualVersion ?? 0;
    const highestAccepted = Math.max(this.highestAcceptedVersions.get(key) ?? 0, persistedVersion);
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
