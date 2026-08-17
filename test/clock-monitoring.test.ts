import { describe, it, expect } from 'vitest';
import { clockMonitoringService, ClockMonitoringService } from '../src/clock-monitoring/services/clock-monitoring.service.js';
import { forensicEvidencePackageService } from '../src/evidence/services/forensic-evidence-package.service.js';

describe('Clock-Drift Monitoring & Evidence Time Synchronization Subsystem', () => {
  it('enforces strict banking threshold rules: <5s HEALTHY, 5-30s WARNING, >30s CRITICAL', () => {
    const service = new ClockMonitoringService();

    // < 5 sec -> HEALTHY
    expect(service.classifyOffsetHealth(0.05)).toBe('HEALTHY');
    expect(service.classifyOffsetHealth(1.8)).toBe('HEALTHY');
    expect(service.classifyOffsetHealth(4.99)).toBe('HEALTHY');

    // 5–30 sec -> WARNING
    expect(service.classifyOffsetHealth(5.0)).toBe('WARNING');
    expect(service.classifyOffsetHealth(18.2)).toBe('WARNING');
    expect(service.classifyOffsetHealth(30.0)).toBe('WARNING');

    // > 30 sec -> CRITICAL
    expect(service.classifyOffsetHealth(30.01)).toBe('CRITICAL');
    expect(service.classifyOffsetHealth(65.4)).toBe('CRITICAL');
    expect(service.classifyOffsetHealth(3600)).toBe('CRITICAL');
  });

  it('tracks 4-tier timestamps (HO time, Gateway time, NVR time, Camera time), offset, jitter, and NTP source', async () => {
    const service = new ClockMonitoringService();
    const now = new Date();

    // 1. Record Head Office Master Reference Time
    await service.recordEvidence({
      deviceId: 'time-server-ho-01',
      deviceName: 'Stratum-1 Primary NTP Master',
      deviceType: 'HO_TIME_SERVER',
      branchId: 'BR-034',
      deviceTime: now,
      referenceTime: now,
      roundTripTimeMs: 4,
      signedOffsetSeconds: 0.001,
      absoluteOffsetSeconds: 0.001,
      jitterMs: 2,
      ntpServer: 'time.bank.internal',
      ntpSynchronized: true,
      ntpWhitelisted: true,
      healthState: 'HEALTHY',
      source: 'NTP_INTERNAL',
      timezoneMismatch: false,
      observedAt: now,
    });

    // 2. Record Edge Gateway Clock
    await service.recordEvidence({
      deviceId: 'gw-br-034',
      deviceName: 'Branch Gateway Controller',
      deviceType: 'GATEWAY',
      branchId: 'BR-034',
      deviceTime: new Date(now.getTime() - 400),
      referenceTime: now,
      roundTripTimeMs: 8,
      signedOffsetSeconds: -0.4,
      absoluteOffsetSeconds: 0.4,
      jitterMs: 5,
      ntpServer: 'time.bank.internal',
      ntpSynchronized: true,
      ntpWhitelisted: true,
      healthState: 'HEALTHY',
      source: 'EDGE_SYSTEM',
      timezoneMismatch: false,
      observedAt: now,
    });

    // 3. Record NVR Clock
    await service.recordEvidence({
      deviceId: 'nvr-br-034',
      deviceName: 'CP PLUS Branch Master NVR',
      deviceType: 'RECORDER',
      branchId: 'BR-034',
      deviceTime: new Date(now.getTime() - 800),
      referenceTime: now,
      roundTripTimeMs: 12,
      signedOffsetSeconds: -0.8,
      absoluteOffsetSeconds: 0.8,
      jitterMs: 6,
      ntpServer: 'time.bank.internal',
      ntpSynchronized: true,
      ntpWhitelisted: true,
      lastSyncAt: new Date(now.getTime() - 60000),
      healthState: 'HEALTHY',
      source: 'EDGE_SYSTEM',
      timezoneMismatch: false,
      observedAt: now,
    });

    // 4. Record Camera Clock
    await service.recordEvidence({
      deviceId: 'cam-301-17',
      deviceName: 'Vault Camera 17',
      deviceType: 'CAMERA',
      branchId: 'BR-034',
      deviceTime: new Date(now.getTime() - 1200),
      referenceTime: now,
      roundTripTimeMs: 16,
      signedOffsetSeconds: -1.2,
      absoluteOffsetSeconds: 1.2,
      jitterMs: 8,
      ntpServer: 'time.bank.internal',
      ntpSynchronized: true,
      ntpWhitelisted: true,
      healthState: 'HEALTHY',
      source: 'ONVIF',
      timezoneMismatch: false,
      observedAt: now,
    });

    // Evaluate branch-level multi-point clock health
    const branchHealth = await service.getBranchClockHealth('BR-034');
    expect(branchHealth).toBeDefined();
    expect(branchHealth?.overallHealth).toBe('HEALTHY');
    expect(branchHealth?.maxOffsetSeconds).toBe(1.2);
    expect(branchHealth?.hoTime).toBeDefined();
    expect(branchHealth?.gatewayTime).toBeDefined();
    expect(branchHealth?.recorderTime).toBeDefined();
    expect(branchHealth?.comparisons.length).toBeGreaterThanOrEqual(1);

    // Verify relative camera-to-NVR offset comparison
    const camNvrComp = branchHealth?.comparisons[0];
    expect(camNvrComp?.cameraId).toBe('cam-301-17');
    expect(camNvrComp?.recorderId).toBe('nvr-br-034');
    expect(camNvrComp?.relativeOffsetSeconds).toBe(0.4); // Math.abs(-1.2 - (-0.8)) = 0.4s
    expect(camNvrComp?.healthState).toBe('HEALTHY');
  });

  it('builds evidence clock manifests containing 4-tier timestamps, observed offset, and forensic confidence', async () => {
    const manifest = await clockMonitoringService.buildEvidenceClockManifest(
      'EV-2026-TEST01',
      'BR-034',
      'cam-301-17'
    );

    expect(manifest.evidenceId).toBe('EV-2026-TEST01');
    expect(manifest.branchId).toBe('BR-034');
    expect(manifest.cameraId).toBe('cam-301-17');
    expect(manifest.hoReferenceTime).toBeDefined();
    expect(manifest.gatewayTime).toBeDefined();
    expect(manifest.nvrTime).toBeDefined();
    expect(manifest.cameraTime).toBeDefined();
    expect(manifest.observedOffsetSeconds).toBeLessThan(5);
    expect(manifest.jitterMs).toBeDefined();
    expect(manifest.ntpSource).toBe('time.bank.internal');
    expect(manifest.clockHealthStatus).toBe('HEALTHY');
    expect(manifest.forensicTimestampConfidence).toBe('HIGH');
  });

  it('forensic evidence packages automatically embed observed clock offset manifest at capture time', async () => {
    const snapshotBuffer = Buffer.from('forensic-snapshot-bytes');
    const clipBuffer = Buffer.from('forensic-video-bytes');

    const pkg = await forensicEvidencePackageService.createAndSealPackage({
      tenantId: 'BANK-001',
      branchId: 'BR-034',
      cameraId: 'cam-301-17',
      cameraName: 'Vault Strongroom Entrance',
      recorderId: 'nvr-br-034',
      recorderChannel: 17,
      captureStart: '2026-08-17T02:00:00.000Z',
      captureEnd: '2026-08-17T02:01:30.000Z',
      capturedBy: 'auditor-soc',
      reason: 'Forensic time-drift verification test',
      media: {
        snapshotBuffer,
        clipBuffer,
      },
    });

    expect(pkg.timeSync).toBeDefined();
    expect(pkg.timeSync.hoTime).toBeDefined();
    expect(pkg.timeSync.gatewayTime).toBeDefined();
    expect(pkg.timeSync.nvrTime).toBeDefined();
    expect(pkg.timeSync.cameraTime).toBeDefined();
    expect(pkg.timeSync.observedOffsetSeconds).toBeDefined();
    expect(pkg.timeSync.jitterMs).toBeDefined();
    expect(pkg.timeSync.ntpServer).toBe('time.bank.internal');
    expect(pkg.timeSync.clockHealthStatus).toBe('HEALTHY');
    expect(pkg.timeSync.forensicConfidence).toBe('HIGH');
  });
});
