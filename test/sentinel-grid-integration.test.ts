import { describe, it, expect } from 'vitest';
import { operationalMapService } from '../src/operations/services/operational-map.service.js';
import { clockMonitoringService } from '../src/clock-monitoring/services/clock-monitoring.service.js';
import { fleetRolloutControllerService } from '../src/config-management/services/fleet-rollout-controller.service.js';
import { signedConfigService } from '../src/config-management/services/signed-config.service.js';
import { forensicEvidencePackageService } from '../src/evidence/services/forensic-evidence-package.service.js';
import { privacyPolicyService } from '../src/privacy/services/privacy-policy.service.js';
import { socOperatorAnalyticsService } from '../src/analytics/services/soc-operator-analytics.service.js';
import { synchronizedPlaybackService } from '../src/vms/services/synchronized-playback.service.js';
import { investigationWorkspaceService } from '../src/incidents/services/investigation-workspace.service.js';
import { productionAnalyticsEngine } from '../src/analytics/services/production-analytics-engine.service.js';

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
    const aiFrame = {
      width: 1920,
      height: 1080,
      timestamp: new Date().toISOString(),
      frameData: Buffer.from('vault-security-frame-data'),
    };
    const analyticsResult = await productionAnalyticsEngine.processFrame('CAM-118-14', aiFrame);
    expect(analyticsResult.detections.length).toBeGreaterThanOrEqual(1);

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

    expect(evidencePkg.manifest.signatures.length).toBeGreaterThanOrEqual(1);
    expect(evidencePkg.timeSync.hoTime).toBeDefined();
    expect(evidencePkg.timeSync.gatewayTime).toBeDefined();
    expect(evidencePkg.timeSync.nvrTime).toBeDefined();
    expect(evidencePkg.timeSync.cameraTime).toBeDefined();

    // 7. PRIVACY REDACTION & DUAL-AUTHORIZATION GOVERNANCE
    const privacyEval = await privacyPolicyService.evaluateMediaAccess(
      'operator-regular',
      'CAM-118-14',
      'BR-118',
      'EXPORT'
    );
    expect(privacyEval.requiresMasking).toBe(true);
    expect(privacyEval.activePolicy.faceBlur).toBe(true);

    // 8. 400-BRANCH SIGNED CONFIG ROLLOUT (5% -> 25% -> 50% -> 100%)
    const draftVersion = await signedConfigService.createDraftVersion('BANK-001', 'sec-admin', 'Fleet hardening release');
    await signedConfigService.validateVersion(draftVersion.id);
    const approvedVersion = await signedConfigService.approveVersion(draftVersion.id, 'sec-lead-approver', 'Approved for rollout');
    const signedVersion = await signedConfigService.signVersion(approvedVersion.id);

    const rollout = await fleetRolloutControllerService.startRollout(signedVersion.manifest, 'sec-lead-approver');
    expect(rollout.totalBranches).toBe(400);
    expect(rollout.stages.length).toBe(4);
    expect(rollout.stages[0]?.cohortPercentage).toBe(5);
    expect(rollout.stages[0]?.branchCount).toBe(20);

    // 9. SOC OPERATOR PERFORMANCE & SLA LEARNING
    const socSummary = await socOperatorAnalyticsService.getDashboardSummary('LAST_30_DAYS');
    expect(socSummary.fleetSummary.mttaSeconds).toBeLessThan(30);
    expect(socSummary.byOperator.length).toBeGreaterThanOrEqual(4);
    expect(socSummary.byBranch.length).toBeGreaterThanOrEqual(5);
  });
});
