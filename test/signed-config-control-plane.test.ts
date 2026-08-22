import { describe, it, expect } from 'vitest';
import { signedConfigService } from '../src/config-management/services/signed-config.service.js';
import { configValidatorService } from '../src/config-management/services/config-validator.service.js';
import { configKeyService, computeConfigHash, canonicalJsonStringify } from '../src/config-management/services/config-key.service.js';
import { fleetRolloutControllerService } from '../src/config-management/services/fleet-rollout-controller.service.js';
import { branchConfigurationAgentService } from '../src/config-management/services/branch-configuration-agent.service.js';
import { configReconciliationService } from '../src/config-management/services/config-reconciliation.service.js';
import type { BranchConfiguration } from '../src/config-management/domain/signed-config.types.js';

describe('Signed Configuration & Fleet Version Management Control Plane', () => {
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

  it('canonicalizes JSON deterministically and produces identical SHA-256 regardless of key order', () => {
    const objA = { b: 2, a: 1, c: { y: 'val', x: 10 } };
    const objB = { a: 1, c: { x: 10, y: 'val' }, b: 2 };

    const canonicalA = canonicalJsonStringify(objA);
    const canonicalB = canonicalJsonStringify(objB);

    expect(canonicalA).toBe(canonicalB);
    expect(computeConfigHash(objA as any)).toBe(computeConfigHash(objB as any));
  });

  it('validates static/semantic constraints and scores risk (CRITICAL for retention reduction)', () => {
    // 1. Valid config
    const validRes = configValidatorService.validate(sampleBaseConfig);
    expect(validRes.valid).toBe(true);
    expect(validRes.estimatedBandwidthMbps).toBe(6.14); // 2048 + 4096 = 6144 kbps = 6.14 Mbps

    // 2. Retention reduction from 90 to 30 days -> CRITICAL risk
    const retentionReducedConfig: BranchConfiguration = {
      ...sampleBaseConfig,
      retention: { ...sampleBaseConfig.retention, continuousDays: 30 },
    };
    const criticalRes = configValidatorService.validate(retentionReducedConfig, sampleBaseConfig);
    expect(criticalRes.riskLevel).toBe('CRITICAL');
    expect(criticalRes.requiresDualApproval).toBe(true);
  });

  it('enforces Separation of Duties: Creator cannot approve their own configuration', async () => {
    const draft = await signedConfigService.createDraftVersion(
      {
        tenantId: 'BANK-001',
        version: 35,
        config: sampleBaseConfig,
        changeReason: 'Q3 Camera optimization',
      },
      'architect.dhanya'
    );

    expect(draft.status).toBe('DRAFT');

    // Attempt self-approval -> Must fail!
    await expect(
      signedConfigService.approveVersion({
        versionId: draft.id,
        approver: 'architect.dhanya', // Same user!
        role: 'CHIEF_INFORMATION_SECURITY_OFFICER',
        decision: 'APPROVED',
        comments: 'Self-approving my own draft',
      })
    ).rejects.toThrow(/Separation of duties violation/);

    // Approval by distinct CISO succeeds
    const approved = await signedConfigService.approveVersion({
      versionId: draft.id,
      approver: 'ciso.officer',
      role: 'CHIEF_INFORMATION_SECURITY_OFFICER',
      decision: 'APPROVED',
      comments: 'Approved by independent CISO',
    });

    expect(approved.status).toBe('APPROVED');
  });

  it('cryptographically signs approved manifest using Ed25519 and detects package tampering', async () => {
    const draft = await signedConfigService.createDraftVersion(
      {
        tenantId: 'BANK-001',
        version: 36,
        config: sampleBaseConfig,
        changeReason: 'Baseline v36 release',
      },
      'engineer.anand'
    );

    await signedConfigService.approveVersion({
      versionId: draft.id,
      approver: 'ciso.officer',
      role: 'CISO',
      decision: 'APPROVED',
      comments: 'Approved',
    });

    const manifest = await signedConfigService.signVersion(draft.id);
    expect(manifest.signatureAlgorithm).toBe('Ed25519');
    expect(manifest.signature).toBeDefined();

    // Verify valid package
    const validCheck = configKeyService.verifyPackage(manifest, draft.config);
    expect(validCheck.valid).toBe(true);

    // Tamper with camera bitrate inside payload
    const tamperedConfig: BranchConfiguration = {
      ...draft.config,
      cameras: [{ ...draft.config.cameras[0]!, bitrateKbps: 9999 }],
    };

    const tamperedCheck = configKeyService.verifyPackage(manifest, tamperedConfig);
    expect(tamperedCheck.valid).toBe(false);
    expect(tamperedCheck.reason).toContain('Configuration hash mismatch');
  });

  it('edge agent enforces anti-downgrade monotonic version guard and read-back verification', async () => {
    const v34 = signedConfigService.getActiveSignedVersion()!;

    // 1. Initial application of v34
    const applyRes = await branchConfigurationAgentService.reconcileBranch({
      branchId: 'BR-001',
      gatewayId: 'GW-001-01',
      manifest: v34.signature!,
      config: v34.config,
    });

    expect(applyRes.overallStatus).toBe('VERIFIED');
    expect(applyRes.components.length).toBeGreaterThanOrEqual(4);

    // 2. Replay attack with older v28 package -> Must be rejected by monotonic guard
    const olderManifest = configKeyService.signConfiguration({
      packageId: 'cfgpkg-v28-legacy',
      tenantId: 'BANK-001',
      configVersion: 28,
      schemaVersion: '3.1',
      config: v34.config,
    });

    const downgradeRes = await branchConfigurationAgentService.reconcileBranch({
      branchId: 'BR-001',
      gatewayId: 'GW-001-01',
      manifest: olderManifest,
      config: v34.config,
    });

    expect(downgradeRes.overallStatus).toBe('APPLY_FAILED');
    expect(downgradeRes.components[0]?.errorMessage).toContain('DOWNGRADE_NOT_AUTHORIZED');
  });

  it('runs 400-branch canary rollout through 5% -> 25% -> 50% -> 100% stages', async () => {
    const activeVersion = signedConfigService.getActiveSignedVersion()!;

    const rollout = await fleetRolloutControllerService.createRollout({
      configVersionId: activeVersion.id,
      tenantId: 'BANK-001',
      totalBranches: 400,
      createdBy: 'ops.lead',
    });

    expect(rollout.stages.length).toBe(4);
    expect(rollout.stages[0]?.name).toBe('5% Canary Cohort');
    expect(rollout.stages[0]?.targetBranchCount).toBe(20);

    // Stage 1 (5% Canary) -> Advance
    const stage1Adv = await fleetRolloutControllerService.evaluateAndAdvance(rollout.rolloutId);
    expect(stage1Adv.healthPassed).toBe(true);
    expect(stage1Adv.currentStage.percentage).toBe(25);

    // Stage 2 (25%) -> Advance
    const stage2Adv = await fleetRolloutControllerService.evaluateAndAdvance(rollout.rolloutId);
    expect(stage2Adv.currentStage.percentage).toBe(50);

    // Stage 3 (50%) -> Advance
    const stage3Adv = await fleetRolloutControllerService.evaluateAndAdvance(rollout.rolloutId);
    expect(stage3Adv.currentStage.percentage).toBe(100);

    // Stage 4 (100%) -> Finalize
    const stage4Adv = await fleetRolloutControllerService.evaluateAndAdvance(rollout.rolloutId);
    expect(stage4Adv.status).toBe('COMPLETED');
  });

  it('detects granular deep drift on BR-118 and auto-remediates drift', async () => {
    const activeVersion = signedConfigService.getActiveSignedVersion()!;

    // BR-118 pre-seeded with desired version vs actual v32
    const br118State = signedConfigService.getBranchState('BR-118');
    expect(br118State).toBeDefined();
    expect(br118State?.status).toBe('DRIFTED');
    expect(br118State?.actualVersion).toBe(32);

    // Check specific drifted fields
    const bitrateDiff = br118State?.differences.find((d) => d.path.includes('bitrateKbps'));
    expect(bitrateDiff?.desiredValue).toBe(4096);
    expect(bitrateDiff?.actualValue).toBe(2048);

    const ntpDiff = br118State?.differences.find((d) => d.path === 'recorder.ntpServer');
    expect(ntpDiff?.desiredValue).toBe('time.bank.internal');
    expect(ntpDiff?.actualValue).toBe('pool.ntp.org');

    const retentionDiff = br118State?.differences.find((d) => d.path === 'retention.continuousDays');
    expect(retentionDiff?.desiredValue).toBe(90);
    expect(retentionDiff?.actualValue).toBe(60);

    // Auto-remediate drift
    const reconResult = await configReconciliationService.runFleetReconciliation('AUTO_REMEDIATE');
    expect(reconResult.driftedCount).toBeGreaterThanOrEqual(1);
    expect(reconResult.remediatedCount).toBeGreaterThanOrEqual(1);

    // BR-118 is now IN_SYNC with the active signed version
    const updatedState = signedConfigService.getBranchState('BR-118');
    expect(updatedState?.status).toBe('IN_SYNC');
    expect(updatedState?.actualVersion).toBe(activeVersion.version);
  });
});
