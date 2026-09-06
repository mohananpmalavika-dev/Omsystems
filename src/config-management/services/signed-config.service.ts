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

  constructor() {
    this.seedDefaultData();
  }

  private branchStateKey(tenantId: string, branchId: string): string {
    return `${tenantId}:${branchId}`;
  }

  public seedDefaultData(): void {
    const tenantId = 'BANK-001';
    const sampleBaseConfig: BranchConfiguration = {
      schemaVersion: '3.1',
      network: {
        dnsServers: ['10.100.1.10', '10.100.1.11'],
        ntpServers: ['time.bank.internal'],
        gatewayIp: '10.100.1.1',
        subnetMask: '255.255.255.0',
        uplinkBandwidthMbps: 100,
      },
      cameras: [
        {
          id: 'CAM-01',
          channel: 1,
          name: 'Main Lobby Entrance',
          ip: '10.100.1.21',
          resolution: '1920x1080',
          fps: 25,
          bitrateKbps: 2048,
          codec: 'H265',
          streamProfile: 'main',
          credentialRef: 'secret://branch/BR-001/camera/CAM-01',
          analyticsAssigned: ['intrusion'],
          enabled: true,
        },
        {
          id: 'CAM-04',
          channel: 4,
          name: 'Cash Counter 4',
          ip: '10.100.1.24',
          resolution: '1920x1080',
          fps: 25,
          bitrateKbps: 4096,
          codec: 'H265',
          streamProfile: 'main',
          credentialRef: 'secret://branch/BR-001/camera/CAM-04',
          analyticsAssigned: ['face_blur'],
          enabled: true,
        },
      ],
      recorder: {
        nvrId: 'NVR-01',
        name: 'Branch Main NVR',
        manufacturer: 'CP PLUS',
        model: 'CP-UNR-4K4322-V3',
        managementIp: '10.100.1.10',
        storageTargets: ['/dev/sda1'],
        recordingMode: 'CONTINUOUS',
        ntpServer: 'time.bank.internal',
        credentialRef: 'secret://branch/BR-001/recorder/NVR-01',
        channelsCount: 32,
      },
      retention: {
        continuousDays: 90,
        alertFootageDays: 180,
        forensicEvidenceDays: 365,
        storagePurgeThresholdPercent: 90,
      },
      analytics: {
        detectorVersions: { intrusion: '2.4.0' },
        schedules: { after_hours: '20:00-06:00' },
        sensitivityThresholds: { intrusion: 0.85 },
        zonesCount: 2,
      },
      security: {
        minTlsVersion: 'TLS1.3',
        certificateThumbprints: ['SHA256:CERT-THUMB-01'],
        allowedCiphers: ['TLS_AES_256_GCM_SHA384'],
        enforceSignedConfig: true,
      },
    };

    const v34Id = 'cfg-v34-master';
    const configHash = computeConfigHash(sampleBaseConfig);
    const manifest = configKeyService.signConfiguration({
      packageId: 'cfgpkg-v34-golden',
      tenantId,
      configVersion: 34,
      schemaVersion: '3.1',
      config: sampleBaseConfig,
    });

    const v34: ConfigurationVersion = {
      id: v34Id,
      tenantId,
      version: 34,
      schemaVersion: '3.1',
      config: sampleBaseConfig,
      configHash,
      riskLevel: 'LOW',
      status: 'SIGNED',
      createdBy: 'ciso.dhanya',
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      approvals: [
        {
          approvalId: 'appr-34-ciso',
          approvedBy: 'ciso.officer',
          role: 'CHIEF_INFORMATION_SECURITY_OFFICER',
          decision: 'APPROVED',
          comments: 'Approved baseline golden surveillance v34',
          approvedAt: new Date('2026-08-01T00:00:00.000Z'),
        },
      ],
      signature: manifest,
      changeReason: 'Baseline Signed Surveillance Release v34',
    };

    this.versions.set(v34Id, v34);
    this.activeVersionIds.set(tenantId, v34Id);

    // Pre-seed BR-118 with Drifted state
    const actualConfigBR118: BranchConfiguration = JSON.parse(JSON.stringify(sampleBaseConfig));
    actualConfigBR118.cameras[1]!.bitrateKbps = 2048;
    actualConfigBR118.recorder.ntpServer = 'pool.ntp.org';
    actualConfigBR118.retention.continuousDays = 60;

    const diffsBR118 = this.computeDifferences(sampleBaseConfig, actualConfigBR118);
    const actualHash118 = computeConfigHash(actualConfigBR118);

    const br118State: BranchConfigurationState = {
      tenantId,
      branchId: 'BR-118',
      gatewayId: 'gw-br-118',
      desiredVersion: 34,
      desiredHash: configHash,
      actualVersion: 32,
      actualHash: actualHash118,
      lastAppliedVersion: 32,
      status: 'DRIFTED',
      lastReportedAt: new Date(),
      differences: diffsBR118,
      appliedPackageSha256: actualHash118,
    };
    this.branchStates.set(this.branchStateKey(tenantId, 'BR-118'), br118State);

    const br001State: BranchConfigurationState = {
      tenantId,
      branchId: 'BR-001',
      gatewayId: 'GW-001-01',
      desiredVersion: 34,
      desiredHash: configHash,
      actualVersion: 34,
      actualHash: configHash,
      lastAppliedVersion: 34,
      status: 'IN_SYNC',
      lastReportedAt: new Date(),
      differences: [],
      appliedPackageSha256: configHash,
    };
    this.branchStates.set(this.branchStateKey(tenantId, 'BR-001'), br001State);
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
    if (this.activeVersionIds.size === 1) {
      const versionId = this.activeVersionIds.values().next().value as string | undefined;
      return versionId ? this.versions.get(versionId) || null : null;
    }
    const v34 = this.versions.get('cfg-v34-master');
    if (v34) return v34;
    return this.versions.values().next().value || null;
  }

  getActiveVersion(): ConfigurationVersion | null {
    return this.getActiveSignedVersion();
  }

  async createRolloutSchedule(input: {
    versionId: string;
    totalBranches: number;
  }): Promise<{ versionId: string; totalBranches: number; stages: string[] }> {
    return {
      versionId: input.versionId,
      totalBranches: input.totalBranches,
      stages: ['5_PERCENT_CANARY', '25_PERCENT_REGIONAL', '50_PERCENT_HALF_FLEET', '100_PERCENT_FULL'],
    };
  }

  async updateRolloutStage(
    versionId: string,
    stage: string
  ): Promise<{ versionId: string; stage: string; appliedBranchesCount: number }> {
    const percentage = stage.includes('5') ? 5 : stage.includes('25') ? 25 : stage.includes('50') ? 50 : 100;
    return {
      versionId,
      stage,
      appliedBranchesCount: Math.round(400 * (percentage / 100)),
    };
  }

  async rollbackBranch(input: {
    branchId: string;
    targetVersionId: string;
    reason: string;
  }): Promise<{ branchId: string; targetVersionId: string; status: string; reason: string }> {
    const state = this.getBranchState(input.branchId);
    if (state) {
      state.status = 'IN_SYNC';
      state.actualVersion = 34;
      state.differences = [];
    }
    return {
      branchId: input.branchId,
      targetVersionId: input.targetVersionId,
      status: 'ROLLED_BACK',
      reason: input.reason,
    };
  }

  verifySignature(versionId: string): boolean {
    const v = this.versions.get(versionId);
    if (!v?.signature) return false;
    return configKeyService.verifyManifest(v.signature).valid;
  }

}

export const signedConfigService = new SignedConfigService();
