import { describe, it, expect } from 'vitest';
import { operationalMapService } from '../src/operations/services/operational-map.service.js';
import { clockMonitoringService } from '../src/clock-monitoring/services/clock-monitoring.service.js';
import { FleetRolloutControllerService } from '../src/config-management/services/fleet-rollout-controller.service.js';
import { signedConfigService } from '../src/config-management/services/signed-config.service.js';
import { forensicEvidencePackageService } from '../src/evidence/services/forensic-evidence-package.service.js';
import { privacyDecisionService } from '../src/privacy/services/privacy-decision.service.js';
import { BankingPermissions } from '../src/identity/domain/identity.types.js';
import { socOperatorAnalyticsService } from '../src/analytics/services/soc-operator-analytics.service.js';
import { synchronizedPlaybackService } from '../src/vms/services/synchronized-playback.service.js';
import { investigationWorkspaceService } from '../src/incidents/services/investigation-workspace.service.js';
import { analyticsRegistry, AnalyticsMaturity } from '../analytics-engine/src/core/analytics-registry.js';
import { ObjectTracker } from '../analytics-engine/src/tracking/object-tracker.js';

describe('SENTINEL GRID / BANK VMS: End-to-End Enterprise Architecture Verification', () => {
  it('executes complete Sentinel Grid flow: Control Plane -> Edge Gateways -> NVRs -> Analytics -> Forensics -> SOC', async () => {
    // 1. CONTROL PLANE: Multi-Tier National Grid Navigation (400 Branches)
    const indiaRoot = await operationalMapService.getRootNode();
    expect(indiaRoot.level).toBe('COUNTRY');
    expect(indiaRoot.metrics.totalBranches).toBe(400);

    const states = await operationalMapService.getChildrenNodes(indiaRoot.id);
    expect(states.length).toBeGreaterThanOrEqual(4);

    const kerala = states.find((s) => s.code === 'KL')!;
    const regions = await operationalMapService.getChildrenNodes(kerala.id);
    const southKerala = regions.find((r) => r.id === 'node-region-south-kerala')!;
    const branches = await operationalMapService.getChildrenNodes(southKerala.id);
    const br118 = branches.find((b) => b.id === 'BR-118')!;
    expect(br118).toBeDefined();

    // 2. EDGE GATEWAY & HARDWARE NVR CLOCK TELEMETRY
    const branchClock = await clockMonitoringService.getBranchClockHealth('BR-118');
    expect(branchClock).toBeDefined();
    expect(branchClock?.overallHealth).toBeDefined();
    expect(branchClock?.averageJitterMs).toBeDefined();

    // 3. CERTIFIED AI DETECTOR & MULTI-OBJECT TRACKING
    const capabilities = analyticsRegistry.listCapabilities({ maturity: AnalyticsMaturity.CERTIFIED });
    expect(capabilities.length).toBeGreaterThanOrEqual(4);
    const tracker = new ObjectTracker();
    const tracks = tracker.update('CAM-118-14', [
      { classId: 'person', confidence: 0.95, bbox: { x: 0.2, y: 0.3, width: 0.1, height: 0.25 }, timestamp: 1000 },
    ], 1000);
    expect(tracks.length).toBe(1);

    // 4. SYNCHRONIZED MULTI-CAMERA PLAYBACK
    const playbackSession = await synchronizedPlaybackService.createSession({
      tenantId: 'BANK-001',
      branchId: 'BR-118',
      title: 'Active SOC Threat Scrutiny',
      cameraIds: ['CAM-118-01', 'CAM-118-04', 'CAM-118-14'],
      startTime: '2026-08-17T02:00:00.000Z',
      endTime: '2026-08-17T03:00:00.000Z',
    });
    expect(playbackSession.tracks.length).toBe(3);

    // 5. INVESTIGATION CASE DOSSIER & LEGAL HOLD
    const caseDossier = await investigationWorkspaceService.createCase({
      tenantId: 'BANK-001',
      branchId: 'BR-118',
      title: 'Incident 2026-009821 Forensic Examination',
      description: 'Armored cash-van vault door trigger examination',
      leadInvestigator: 'lead-investigator-iyer',
      cameraIds: ['CAM-118-14'],
      timeRangeStart: '2026-08-17T02:00:00.000Z',
      timeRangeEnd: '2026-08-17T02:30:00.000Z',
    });
    await investigationWorkspaceService.placeUnderLegalHold(caseDossier.caseId);

    // 6. FORENSIC EVIDENCE PACKAGE SEALING WITH ED25519 & 4-TIER CLOCK MANIFEST
    const snapshotBuffer = Buffer.from('forensic-unredacted-snapshot');
    const clipBuffer = Buffer.from('forensic-unredacted-video');
    const evidencePkg = await forensicEvidencePackageService.createAndSealPackage({
      tenantId: 'BANK-001',
      branchId: 'BR-118',
      cameraId: 'CAM-118-14',
      recorderId: 'NVR-01',
      recorderChannel: 14,
      caseNumber: caseDossier.caseNumber,
      captureStart: '2026-08-17T02:00:00.000Z',
      captureEnd: '2026-08-17T02:05:00.000Z',
      capturedBy: 'lead-investigator-iyer',
      reason: 'Official Evidence Package for Law Enforcement',
      media: { snapshotBuffer, clipBuffer },
    });

    expect(evidencePkg.signature).toBeDefined();
    expect(evidencePkg.signature?.algorithm).toBe('Ed25519');
    expect(evidencePkg.timeSync.hoTime).toBeDefined();
    expect(evidencePkg.timeSync.gatewayTime).toBeDefined();
    expect(evidencePkg.timeSync.nvrTime).toBeDefined();
    expect(evidencePkg.timeSync.cameraTime).toBeDefined();

    // 7. PRIVACY REDACTION & DUAL-AUTHORIZATION GOVERNANCE
    const privacyDecision = await privacyDecisionService.evaluate({
      principal: {
        userId: 'usr-operator-01',
        tenantId: 'BANK-001',
        username: 'operator.anand',
        email: 'anand@bank.internal',
        displayName: 'Anand Operator',
        roles: ['BANK_OPERATOR'],
        permissions: [BankingPermissions.CAMERA_LIVE_VIEW, BankingPermissions.CAMERA_PLAYBACK_VIEW],
        scope: { type: 'ALL_BRANCHES' },
        authMethod: 'LOCAL',
        sessionId: 'sess-01',
        issuedAt: new Date(),
        expiresAt: new Date(Date.now() + 3600000),
      },
      cameraId: 'CAM-118-14',
      operation: 'LIVE_VIEW',
    });
    expect(privacyDecision.allow).toBe(true);
    expect(privacyDecision.mode).toBe('MASKED');
    expect(privacyDecision.transformations.faceBlur).toBe(true);

    // 8. 400-BRANCH SIGNED CONFIG ROLLOUT (5% -> 25% -> 50% -> 100%)
    const sampleConfig = {
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
          codec: 'H265' as const,
          streamProfile: 'main' as const,
          credentialRef: 'secret://branch/BR-001/camera/CAM-01',
          analyticsAssigned: ['intrusion'],
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
        recordingMode: 'CONTINUOUS' as const,
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
        minTlsVersion: 'TLS1.3' as const,
        certificateThumbprints: ['SHA256:CERT-THUMB-01'],
        allowedCiphers: ['TLS_AES_256_GCM_SHA384'],
        enforceSignedConfig: true,
      },
    };

    const draftVersion = await signedConfigService.createDraftVersion(
      {
        tenantId: 'BANK-001',
        version: 35,
        config: sampleConfig,
        changeReason: 'Fleet hardening release',
      },
      'sec-admin'
    );
    await signedConfigService.validateVersion(draftVersion.id);
    const approvedVersion = await signedConfigService.approveVersion({
      versionId: draftVersion.id,
      approver: 'sec-lead-approver',
      role: 'CHIEF_SECURITY_OFFICER',
      decision: 'APPROVED',
      comments: 'Approved for rollout',
    });
    const signedManifest = await signedConfigService.signVersion(approvedVersion.id);

    const rolloutController = new FleetRolloutControllerService({
      deploy: async () => undefined,
      rollback: async () => undefined,
    });
    const rollout = await rolloutController.createRollout({
      tenantId: 'BANK-001',
      configVersionId: approvedVersion.id,
      branchIds: Array.from({ length: 400 }, (_, index) => `BR-${String(index + 1).padStart(3, '0')}`),
      createdBy: 'sec-lead-approver',
    });
    expect(rollout.stages.length).toBe(4);
    expect(rollout.stages[0]?.percentage).toBe(5);
    expect(rollout.stages[0]?.targetBranchCount).toBe(20);
    expect(rollout.stages[1]?.percentage).toBe(25);
    expect(rollout.stages[1]?.targetBranchCount).toBe(100);
    expect(rollout.stages[2]?.percentage).toBe(50);
    expect(rollout.stages[2]?.targetBranchCount).toBe(200);
    expect(rollout.stages[3]?.percentage).toBe(100);
    expect(rollout.stages[3]?.targetBranchCount).toBe(400);

    // 9. SOC OPERATOR PERFORMANCE & SLA LEARNING
    const socSummary = await socOperatorAnalyticsService.getDashboardSummary('LAST_30_DAYS');
    expect(socSummary.fleetSummary.mttaSeconds).toBeLessThan(30);
    expect(socSummary.byOperator.length).toBeGreaterThanOrEqual(4);
    expect(socSummary.byBranch.length).toBeGreaterThanOrEqual(5);
  });
});
