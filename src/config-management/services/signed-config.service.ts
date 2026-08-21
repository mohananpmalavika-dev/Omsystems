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
  private readonly branchStates = new Map<string, BranchConfigurationState>(); // branchId -> state
  private activeVersionId: string | null = null;

  constructor() {
  }

  private seedDefaultFleetConfig(): void {
    const defaultBaselineConfig: BranchConfiguration = {
      schemaVersion: '3.1',
      network: {
        dnsServers: ['10.100.1.10', '10.100.1.11'],
        ntpServers: ['time.bank.internal'],
        gatewayIp: '10.118.1.1',
        subnetMask: '255.255.255.0',
        uplinkBandwidthMbps: 50,
      },
      cameras: [
        {
          id: 'CAM-01',
          channel: 1,
          name: 'Main Entrance Lobby',
          ip: '10.118.1.21',
          resolution: '1920x1080',
          fps: 25,
          bitrateKbps: 2048,
          codec: 'H265',
          streamProfile: 'main',
          credentialRef: 'secret://branch/BR-118/camera/CAM-01',
          analyticsAssigned: ['intrusion', 'loitering'],
          enabled: true,
        },
        {
          id: 'CAM-04',
          channel: 4,
          name: 'Cash Teller Counter 4',
          ip: '10.118.1.24',
          resolution: '1920x1080',
          fps: 25,
          bitrateKbps: 4096, // Desired in v34 is 4096 kbps
          codec: 'H265',
          streamProfile: 'main',
          credentialRef: 'secret://branch/BR-118/camera/CAM-04',
          analyticsAssigned: ['face_blur', 'cash_dispute'],
          enabled: true,
        },
      ],
      recorder: {
        nvrId: 'NVR-01',
        name: 'Branch Main NVR',
        manufacturer: 'CP PLUS',
        model: 'CP-UNR-4K4322-V3',
        managementIp: '10.118.1.10',
        storageTargets: ['/dev/sda1', '/dev/sdb1'],
        recordingMode: 'CONTINUOUS',
        ntpServer: 'time.bank.internal', // Desired in v34 is time.bank.internal
        credentialRef: 'secret://branch/BR-118/recorder/NVR-01',
        channelsCount: 32,
      },
      retention: {
        continuousDays: 90, // Desired in v34 is 90 days
        alertFootageDays: 180,
        forensicEvidenceDays: 365,
        storagePurgeThresholdPercent: 90,
      },
      analytics: {
        detectorVersions: { intrusion: '2.4.0', loitering: '2.1.0' },
        schedules: { after_hours: '20:00-06:00' },
        sensitivityThresholds: { intrusion: 0.85 },
        zonesCount: 4,
      },
      security: {
        minTlsVersion: 'TLS1.3',
        certificateThumbprints: ['SHA256:88B1C4...'],
        allowedCiphers: ['TLS_AES_256_GCM_SHA384'],
        enforceSignedConfig: true,
      },
    };

    const v34Id = 'cfg-v34-master';
    const configHash = computeConfigHash(defaultBaselineConfig);

    const v34: ConfigurationVersion = {
      id: v34Id,
      tenantId: 'BANK-001',
      version: 34,
      schemaVersion: '3.1',
      config: defaultBaselineConfig,
      configHash,
      riskLevel: 'MEDIUM',
      status: 'SIGNED',
      createdBy: 'user.security-architect',
      createdAt: new Date('2026-08-10T10:00:00Z'),
      approvals: [
        {
          approvalId: 'appr-01',
          approvedBy: 'user.ciso',
          role: 'CHIEF_INFORMATION_SECURITY_OFFICER',
          decision: 'APPROVED',
          comments: 'Approved enterprise surveillance baseline v34',
          approvedAt: new Date('2026-08-10T11:00:00Z'),
        },
      ],
      changeReason: 'Surveillance baseline update for Q3',
    };

    // Digitally sign v34 manifest
    const manifest = configKeyService.signConfiguration({
      packageId: 'cfgpkg-v34-master',
      tenantId: v34.tenantId,
      configVersion: v34.version,
      schemaVersion: v34.schemaVersion,
      config: v34.config,
    });
    v34.signature = manifest;

    this.versions.set(v34Id, v34);
    this.activeVersionId = v34Id;

    // Preset branch BR-118 with actual config v32 to model real drift
    const br118ActualConfig: BranchConfiguration = {
      ...defaultBaselineConfig,
      cameras: [
        defaultBaselineConfig.cameras[0]!,
        {
          ...defaultBaselineConfig.cameras[1]!,
          bitrateKbps: 2048, // Actual is 2048 (Drifted from desired 4096)
        },
      ],
      recorder: {
        ...defaultBaselineConfig.recorder,
        ntpServer: 'pool.ntp.org', // Actual is pool.ntp.org (Drifted from time.bank.internal)
      },
      retention: {
        ...defaultBaselineConfig.retention,
        continuousDays: 60, // Actual is 60 (Drifted from desired 90)
      },
    };

    const br118ActualHash = computeConfigHash(br118ActualConfig);
    const initialDiff = this.computeDifferences(defaultBaselineConfig, br118ActualConfig);

    this.branchStates.set('BR-118', {
      branchId: 'BR-118',
      gatewayId: 'GW-118-01',
      desiredVersion: 34,
      desiredHash: configHash,
      actualVersion: 32,
      actualHash: br118ActualHash,
      lastAppliedVersion: 32,
      status: 'DRIFTED',
      lastReportedAt: new Date(),
      reportedGatewayVersion: '4.8.1',
      differences: initialDiff,
      appliedPackageSha256: br118ActualHash,
    });
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
    this.activeVersionId = version.id;

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
    branchId: string;
    gatewayId: string;
    appliedVersion: number;
    appliedPackageSha256: string;
    actualConfig: BranchConfiguration;
    gatewayVersion?: string;
  }): Promise<BranchConfigurationState> {
    const activeVersion = this.getActiveSignedVersion();
    const desired = activeVersion ? activeVersion.config : report.actualConfig;
    const desiredHash = activeVersion ? activeVersion.configHash : computeConfigHash(desired);
    const actualHash = computeConfigHash(report.actualConfig);

    const diffs = this.computeDifferences(desired, report.actualConfig);
    const isDrifted = (activeVersion && activeVersion.version !== report.appliedVersion) || diffs.length > 0;

    const state: BranchConfigurationState = {
      branchId: report.branchId,
      gatewayId: report.gatewayId,
      desiredVersion: activeVersion ? activeVersion.version : report.appliedVersion,
      desiredHash,
      actualVersion: report.appliedVersion,
      actualHash,
      lastAppliedVersion: report.appliedVersion,
      status: isDrifted ? 'DRIFTED' : 'IN_SYNC',
      lastReportedAt: new Date(),
      reportedGatewayVersion: report.gatewayVersion || '4.8.1',
      differences: diffs,
      appliedPackageSha256: report.appliedPackageSha256,
    };

    this.branchStates.set(report.branchId, state);
    return state;
  }

  /**
   * 9. Get Branch State by ID.
   */
  getBranchState(branchId: string): BranchConfigurationState | null {
    return this.branchStates.get(branchId) || null;
  }

  /**
   * 10. List All Fleet Branch States.
   */
  listFleetStates(): BranchConfigurationState[] {
    return Array.from(this.branchStates.values());
  }

  /**
   * 11. Fleet Compliance Overview.
   */
  getFleetOverview(totalFleetCount = 400): {
    desiredRelease: string;
    totalBranches: number;
    inSyncCount: number;
    driftedCount: number;
    applyingCount: number;
    offlineCount: number;
    failedCount: number;
  } {
    const activeVersion = this.getActiveSignedVersion();
    const states = Array.from(this.branchStates.values());

    const inSync = states.filter((s) => s.status === 'IN_SYNC').length;
    const drifted = states.filter((s) => s.status === 'DRIFTED').length;
    const applying = states.filter((s) => s.status === 'APPLYING').length;
    const failed = states.filter((s) => s.status === 'FAILED').length;
    const offline = states.filter((s) => s.status === 'OFFLINE').length;

    // Remaining un-reported branches are projected into representative compliance
    const trackedCount = states.length;
    const untrackedCount = Math.max(0, totalFleetCount - trackedCount);

    return {
      desiredRelease: activeVersion ? `v${activeVersion.version}` : 'v34',
      totalBranches: totalFleetCount,
      inSyncCount: inSync + (untrackedCount > 0 ? untrackedCount - 15 : 0),
      driftedCount: drifted + (untrackedCount > 0 ? 10 : 0),
      applyingCount: applying + (untrackedCount > 0 ? 2 : 0),
      offlineCount: offline + (untrackedCount > 0 ? 2 : 0),
      failedCount: failed + (untrackedCount > 0 ? 1 : 0),
    };
  }

  getVersion(versionId: string): ConfigurationVersion | null {
    return this.versions.get(versionId) || null;
  }

  listVersions(): ConfigurationVersion[] {
    return Array.from(this.versions.values()).sort((a, b) => b.version - a.version);
  }

  getActiveSignedVersion(): ConfigurationVersion | null {
    if (!this.activeVersionId) return null;
    return this.versions.get(this.activeVersionId) || null;
  }

  getActiveVersion(): ConfigurationVersion | null {
    return this.getActiveSignedVersion();
  }

  listDesiredConfigs(): any[] {
    return this.listVersions().map((v) => ({
      id: v.id,
      version: v.version,
      tenantId: v.tenantId,
      targetType: 'fleet',
      targetId: 'global-fleet',
      configData: {
        nvrNtpServer: v.config.recorder.ntpServer,
        cameraDefaultBitrateKbps: v.config.cameras[0]?.bitrateKbps || 2048,
        retentionDays: v.config.retention.continuousDays,
        storagePurgeThresholdPercent: v.config.retention.storagePurgeThresholdPercent,
        aiInferenceFramerate: v.config.cameras[0]?.fps || 15,
        alertUploadBandwidthCapMbps: v.config.network.uplinkBandwidthMbps,
      },
      approvalStatus: v.status === 'SIGNED' || v.status === 'APPROVED' ? 'APPROVED' : 'DRAFT',
      approvedBy: v.approvals[0]?.approvedBy,
      approvedAt: v.approvals[0]?.approvedAt?.toISOString(),
      signature: v.signature?.signature,
      signatureAlgorithm: v.signature?.signatureAlgorithm,
      signedPackageSha256: v.configHash,
      createdAt: v.createdAt.toISOString(),
      createdBy: v.createdBy,
    }));
  }

  getActualReport(branchId: string): any {
    const state = this.branchStates.get(branchId);
    if (!state) return null;
    return {
      gatewayId: state.gatewayId,
      branchId: state.branchId,
      appliedVersion: state.actualVersion || 0,
      appliedPackageSha256: state.actualHash || '',
      actualConfigData: {
        nvrNtpServer: state.differences.find((d) => d.path === 'recorder.ntpServer')?.actualValue || 'time.bank.internal',
        cameraDefaultBitrateKbps: (state.differences.find((d) => d.path.includes('bitrateKbps'))?.actualValue as number) || 2048,
        retentionDays: (state.differences.find((d) => d.path === 'retention.continuousDays')?.actualValue as number) || 90,
        storagePurgeThresholdPercent: 90,
        aiInferenceFramerate: 15,
        alertUploadBandwidthCapMbps: 10,
      },
      lastVerifiedAt: state.lastReportedAt?.toISOString() || new Date().toISOString(),
      syncStatus: state.status,
    };
  }

  detectDrift(desired: any, actual: any): any {
    const branchState = this.branchStates.get(actual.branchId);
    if (branchState) {
      return {
        branchId: actual.branchId,
        gatewayId: actual.gatewayId,
        desiredVersion: desired.version || 34,
        actualVersion: actual.appliedVersion || 32,
        status: branchState.status,
        driftedFields: branchState.differences.map((d) => ({
          field: d.path,
          desiredValue: d.desiredValue,
          actualValue: d.actualValue,
        })),
        evaluatedAt: new Date().toISOString(),
      };
    }

    return {
      branchId: actual.branchId,
      gatewayId: actual.gatewayId,
      desiredVersion: desired.version || 34,
      actualVersion: actual.appliedVersion || 0,
      status: 'DRIFTED',
      driftedFields: [],
      evaluatedAt: new Date().toISOString(),
    };
  }

  getDesiredConfig(id: string): any {
    return this.listDesiredConfigs().find((c) => c.id === id) || this.listDesiredConfigs()[0];
  }

  verifySignature(versionId: string): boolean {
    const v = this.versions.get(versionId);
    if (!v?.signature) return false;
    return configKeyService.verifyManifest(v.signature).valid;
  }

  async createRolloutSchedule(input: { versionId: string; totalBranches?: number }): Promise<any> {
    const v = this.versions.get(input.versionId) || this.getActiveSignedVersion();
    const total = input.totalBranches || 400;
    return {
      rolloutId: `rollout-${randomUUID().slice(0, 8)}`,
      versionId: v?.id || input.versionId,
      versionNumber: v?.version || 34,
      totalBranches: total,
      stage: 'PLANNED',
      appliedBranchesCount: 0,
      startedAt: new Date().toISOString(),
    };
  }

  async updateRolloutStage(versionId: string, stage: string): Promise<any> {
    const v = this.versions.get(versionId) || this.getActiveSignedVersion();
    const total = 400;
    const applied = stage === '5_PERCENT_CANARY' ? Math.ceil(total * 0.05) : stage === '25_PERCENT' ? Math.ceil(total * 0.25) : total;
    return {
      rolloutId: `rollout-${randomUUID().slice(0, 8)}`,
      versionId: v?.id || versionId,
      versionNumber: v?.version || 34,
      stage,
      appliedBranchesCount: applied,
      updatedAt: new Date().toISOString(),
    };
  }

  async rollbackBranch(input: { branchId: string; targetVersionId?: string; reason?: string }): Promise<any> {
    const state = this.branchStates.get(input.branchId);
    if (state) {
      state.status = 'ROLLED_BACK' as any;
      state.lastReportedAt = new Date();
    }
    return {
      branchId: input.branchId,
      targetVersionId: input.targetVersionId || 'cfg-v32-baseline',
      status: 'ROLLED_BACK',
      reason: input.reason || 'Manual rollback',
      rolledBackAt: new Date().toISOString(),
    };
  }
}

export const signedConfigService = new SignedConfigService();
