import { randomUUID } from 'node:crypto';
import type {
  BranchConfiguration,
  ConfigurationVersion,
  SignedConfigManifest,
  BranchConfigurationState,
  ConfigurationDifference,
  ConfigurationApproval,
  VersionStatus,
} from '../domain/signed-config.types.js';
import { configKeyService, computeConfigHash } from './config-key.service.js';
import { configValidatorService } from './config-validator.service.js';

export interface CreateDraftVersionInput {
  tenantId: string;
  version: number;
  schemaVersion?: string;
  config: BranchConfiguration;
  parentVersionId?: string;
  changeReason: string;
  ticketId?: string;
}

export class SignedConfigService {
  private readonly versions = new Map<string, ConfigurationVersion>(); // versionId -> version
  private readonly branchStates = new Map<string, BranchConfigurationState>();
  private readonly activeVersionIds = new Map<string, string>();

  private branchStateKey(tenantId: string, branchId: string): string {
    return `${tenantId}:${branchId}`;
  }


  /**
   * 1. Create a new immutable configuration draft.
   */
  async createDraftVersion(
    input: CreateDraftVersionInput,
    creator: string
  ): Promise<ConfigurationVersion> {
    const parent = input.parentVersionId ? this.versions.get(input.parentVersionId) : undefined;
    const validation = configValidatorService.validate(input.config, parent?.config);

    const versionId = `cfg-v${input.version}-${randomUUID().slice(0, 8)}`;
    const configHash = computeConfigHash(input.config);

    const version: ConfigurationVersion = {
      id: versionId,
      tenantId: input.tenantId,
      version: input.version,
      schemaVersion: input.schemaVersion || '3.1',
      config: input.config,
      configHash,
      riskLevel: validation.riskLevel,
      status: 'DRAFT',
      createdBy: creator,
      createdAt: new Date(),
      approvals: [],
      parentVersionId: input.parentVersionId,
      changeReason: input.changeReason,
      ticketId: input.ticketId,
    };

    this.versions.set(versionId, version);
    return version;
  }

  /**
   * 2. Validate configuration version.
   */
  async validateVersion(versionId: string) {
    const version = this.versions.get(versionId);
    if (!version) throw new Error(`Version ${versionId} not found`);

    const parent = version.parentVersionId ? this.versions.get(version.parentVersionId) : undefined;
    const result = configValidatorService.validate(version.config, parent?.config);

    version.riskLevel = result.riskLevel;
    if (!result.valid) {
      version.status = 'DRAFT';
    } else if (version.status === 'DRAFT') {
      version.status = 'PENDING_APPROVAL';
    }

    return {
      versionId,
      ...result,
    };
  }

  /**
   * 3. Approve configuration version with strict Separation of Duties.
   */
  async approveVersion(input: {
    versionId: string;
    approver: string;
    role: string;
    decision: 'APPROVED' | 'REJECTED';
    comments: string;
  }): Promise<ConfigurationVersion> {
    const version = this.versions.get(input.versionId);
    if (!version) throw new Error(`Version ${input.versionId} not found`);

    if (version.status === 'SIGNED' || version.status === 'SUPERSEDED' || version.status === 'REVOKED') {
      throw new Error(`Cannot approve version in status ${version.status}`);
    }

    // Separation of duties check: Creator cannot approve their own configuration
    if (version.createdBy === input.approver) {
      throw new Error(`Separation of duties violation: Creator (${version.createdBy}) cannot approve their own configuration`);
    }

    // Check duplicate approval from same approver
    if (version.approvals.some((a) => a.approvedBy === input.approver)) {
      throw new Error(`Approver ${input.approver} has already submitted a decision for this version`);
    }

    const approval: ConfigurationApproval = {
      approvalId: `appr-${randomUUID().slice(0, 8)}`,
      approvedBy: input.approver,
      role: input.role,
      decision: input.decision,
      comments: input.comments,
      approvedAt: new Date(),
    };

    version.approvals.push(approval);

    if (input.decision === 'REJECTED') {
      version.status = 'DRAFT';
      return version;
    }

    // Check approval threshold: CRITICAL requires 2 distinct approvals
    const approvedCount = version.approvals.filter((a) => a.decision === 'APPROVED').length;
    const requiredApprovals = version.riskLevel === 'CRITICAL' ? 2 : 1;

    if (approvedCount >= requiredApprovals) {
      version.status = 'APPROVED';
    } else {
      version.status = 'PENDING_APPROVAL';
    }

    return version;
  }

  /**
   * 4. Cryptographically sign an approved configuration package.
   */
  async signVersion(versionId: string, signerKeyId?: string): Promise<SignedConfigManifest> {
    const version = this.versions.get(versionId);
    if (!version) throw new Error(`Version ${versionId} not found`);

    if (version.status !== 'APPROVED') {
      throw new Error(`Cannot sign version ${versionId}: Status must be APPROVED (currently ${version.status})`);
    }

    const manifest = configKeyService.signConfiguration({
      packageId: `cfgpkg-v${version.version}-${randomUUID().slice(0, 6)}`,
      tenantId: version.tenantId,
      configVersion: version.version,
      schemaVersion: version.schemaVersion,
      config: version.config,
      previousVersion: version.parentVersionId ? this.versions.get(version.parentVersionId)?.version : undefined,
    });

    version.signature = manifest;
    version.status = 'SIGNED';
    this.activeVersionIds.set(version.tenantId, version.id);

    return manifest;
  }

  /**
   * 5. Clone existing immutable version to next version draft (v34 -> v35).
   */
  async cloneVersion(
    sourceVersionId: string,
    creator: string,
    modifications: Partial<BranchConfiguration>,
    changeReason: string,
    ticketId?: string
  ): Promise<ConfigurationVersion> {
    const source = this.versions.get(sourceVersionId);
    if (!source) throw new Error(`Source version ${sourceVersionId} not found`);

    const nextVersionNumber = source.version + 1;
    const mergedConfig: BranchConfiguration = {
      ...source.config,
      ...modifications,
      network: { ...source.config.network, ...(modifications.network || {}) },
      cameras: modifications.cameras || source.config.cameras,
      recorder: { ...source.config.recorder, ...(modifications.recorder || {}) },
      retention: { ...source.config.retention, ...(modifications.retention || {}) },
      analytics: { ...source.config.analytics, ...(modifications.analytics || {}) },
      security: { ...source.config.security, ...(modifications.security || {}) },
    };

    return this.createDraftVersion(
      {
        tenantId: source.tenantId,
        version: nextVersionNumber,
        schemaVersion: source.schemaVersion,
        config: mergedConfig,
        parentVersionId: source.id,
        changeReason,
        ticketId,
      },
      creator
    );
  }

  /**
   * 6. Revoke a signed configuration version.
   */
  async revokeVersion(versionId: string, reason: string, revokedBy: string): Promise<ConfigurationVersion> {
    const version = this.versions.get(versionId);
    if (!version) throw new Error(`Version ${versionId} not found`);

    version.status = 'REVOKED';
    version.changeReason = `[REVOKED by ${revokedBy}]: ${reason}`;

    return version;
  }

  /**
   * 7. Deep granular diff comparison between two configurations.
   */
  computeDifferences(desired: BranchConfiguration, actual: BranchConfiguration): ConfigurationDifference[] {
    const diffs: ConfigurationDifference[] = [];

    // Network Diffs
    if (desired.network.ntpServers[0] !== actual.network.ntpServers[0]) {
      diffs.push({
        path: 'network.ntpServers',
        desiredValue: desired.network.ntpServers,
        actualValue: actual.network.ntpServers,
        category: 'network',
        severity: 'WARNING',
        driftType: 'VALUE_CHANGED',
      });
    }

    // Cameras Diffs
    for (const desiredCam of desired.cameras) {
      const actualCam = actual.cameras.find((c) => c.id === desiredCam.id);
      if (!actualCam) {
        diffs.push({
          path: `cameras.${desiredCam.id}`,
          desiredValue: desiredCam.name,
          actualValue: null,
          category: 'cameras',
          severity: 'CRITICAL',
          deviceId: desiredCam.id,
          driftType: 'MISSING',
        });
        continue;
      }

      if (desiredCam.bitrateKbps !== actualCam.bitrateKbps) {
        diffs.push({
          path: `cameras.${desiredCam.id}.bitrateKbps`,
          desiredValue: desiredCam.bitrateKbps,
          actualValue: actualCam.bitrateKbps,
          category: 'cameras',
          severity: 'WARNING',
          deviceId: desiredCam.id,
          driftType: 'VALUE_CHANGED',
        });
      }

      if (desiredCam.fps !== actualCam.fps) {
        diffs.push({
          path: `cameras.${desiredCam.id}.fps`,
          desiredValue: desiredCam.fps,
          actualValue: actualCam.fps,
          category: 'cameras',
          severity: 'WARNING',
          deviceId: desiredCam.id,
          driftType: 'VALUE_CHANGED',
        });
      }
    }

    // Recorder Diffs
    if (desired.recorder.ntpServer !== actual.recorder.ntpServer) {
      diffs.push({
        path: 'recorder.ntpServer',
        desiredValue: desired.recorder.ntpServer,
        actualValue: actual.recorder.ntpServer,
        category: 'recorder',
        severity: 'WARNING',
        deviceId: desired.recorder.nvrId,
        driftType: 'VALUE_CHANGED',
      });
    }

    if (desired.recorder.recordingMode !== actual.recorder.recordingMode) {
      diffs.push({
        path: 'recorder.recordingMode',
        desiredValue: desired.recorder.recordingMode,
        actualValue: actual.recorder.recordingMode,
        category: 'recorder',
        severity: 'CRITICAL',
        deviceId: desired.recorder.nvrId,
        driftType: 'VALUE_CHANGED',
      });
    }

    // Retention Diffs
    if (desired.retention.continuousDays !== actual.retention.continuousDays) {
      diffs.push({
        path: 'retention.continuousDays',
        desiredValue: desired.retention.continuousDays,
        actualValue: actual.retention.continuousDays,
        category: 'retention',
        severity: 'CRITICAL',
        driftType: 'VALUE_CHANGED',
      });
    }

    return diffs;
  }

  /**
   * 8. Report actual state from branch gateway.
   */
  async reportActualState(report: {
    tenantId: string;
    branchId: string;
    gatewayId: string;
    appliedVersion: number;
    appliedPackageSha256: string;
    actualConfig: BranchConfiguration;
    gatewayVersion?: string;
  }): Promise<BranchConfigurationState> {
    const activeVersion = this.getActiveSignedVersion(report.tenantId);
    const desired = activeVersion ? activeVersion.config : report.actualConfig;
    const desiredHash = activeVersion ? activeVersion.configHash : computeConfigHash(desired);
    const actualHash = computeConfigHash(report.actualConfig);

    const diffs = this.computeDifferences(desired, report.actualConfig);
    const isDrifted = (activeVersion && activeVersion.version !== report.appliedVersion) || diffs.length > 0;

    const state: BranchConfigurationState = {
      tenantId: report.tenantId,
      branchId: report.branchId,
      gatewayId: report.gatewayId,
      desiredVersion: activeVersion ? activeVersion.version : report.appliedVersion,
      desiredHash,
      actualVersion: report.appliedVersion,
      actualHash,
      lastAppliedVersion: report.appliedVersion,
      status: isDrifted ? 'DRIFTED' : 'IN_SYNC',
      lastReportedAt: new Date(),
      ...(report.gatewayVersion ? { reportedGatewayVersion: report.gatewayVersion } : {}),
      differences: diffs,
      appliedPackageSha256: report.appliedPackageSha256,
    };

    const key = this.branchStateKey(report.tenantId, report.branchId);
    this.branchStates.set(key, state);
    return state;
  }

  /**
   * 9. Get Branch State by ID.
   */
  getBranchState(branchId: string, tenantId?: string): BranchConfigurationState | null {
    if (tenantId) return this.branchStates.get(this.branchStateKey(tenantId, branchId)) || null;
    const matches = Array.from(this.branchStates.values()).filter((state) => state.branchId === branchId);
    return matches.length === 1 ? matches[0]! : null;
  }

  /**
   * 10. List All Fleet Branch States.
   */
  listFleetStates(tenantId?: string): BranchConfigurationState[] {
    return Array.from(this.branchStates.values()).filter((state) => !tenantId || state.tenantId === tenantId);
  }

  /**
   * 11. Fleet Compliance Overview.
   */
  getFleetOverview(tenantId?: string): {
    desiredRelease: string;
    totalBranches: number;
    inSyncCount: number;
    driftedCount: number;
    applyingCount: number;
    offlineCount: number;
    failedCount: number;
  } {
    const activeVersion = this.getActiveSignedVersion(tenantId);
    const states = this.listFleetStates(tenantId);

    const inSync = states.filter((s) => s.status === 'IN_SYNC').length;
    const drifted = states.filter((s) => s.status === 'DRIFTED').length;
    const applying = states.filter((s) => s.status === 'APPLYING').length;
    const failed = states.filter((s) => s.status === 'FAILED').length;
    const offline = states.filter((s) => s.status === 'OFFLINE').length;

    return {
      desiredRelease: activeVersion ? `v${activeVersion.version}` : 'unconfigured',
      totalBranches: states.length,
      inSyncCount: inSync,
      driftedCount: drifted,
      applyingCount: applying,
      offlineCount: offline,
      failedCount: failed,
    };
  }

  getVersion(versionId: string): ConfigurationVersion | null {
    return this.versions.get(versionId) || null;
  }

  listVersions(tenantId?: string): ConfigurationVersion[] {
    return Array.from(this.versions.values())
      .filter((version) => !tenantId || version.tenantId === tenantId)
      .sort((a, b) => b.version - a.version);
  }

  getActiveSignedVersion(tenantId?: string): ConfigurationVersion | null {
    if (tenantId) {
      const versionId = this.activeVersionIds.get(tenantId);
      return versionId ? this.versions.get(versionId) || null : null;
    }
    if (this.activeVersionIds.size !== 1) return null;
    const versionId = this.activeVersionIds.values().next().value as string | undefined;
    return versionId ? this.versions.get(versionId) || null : null;
  }

  getActiveVersion(): ConfigurationVersion | null {
    return this.getActiveSignedVersion();
  }


  verifySignature(versionId: string): boolean {
    const v = this.versions.get(versionId);
    if (!v?.signature) return false;
    return configKeyService.verifyManifest(v.signature).valid;
  }

}

export const signedConfigService = new SignedConfigService();
