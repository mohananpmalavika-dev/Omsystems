import { describe, it, expect } from 'vitest';
import { forensicEvidencePackageService } from '../src/evidence/services/forensic-evidence-package.service.js';
import { chainOfCustodyService } from '../src/evidence/services/chain-of-custody.service.js';
import { legalHoldService } from '../src/evidence/services/legal-hold.service.js';
import { evidenceVerifierService } from '../src/evidence/services/evidence-verifier.service.js';

describe('Forensic Evidence & Legal Hold Subsystem', () => {
  it('creates and seals a forensic evidence package with canonical manifest and digital signature', async () => {
    const snapshotBuffer = Buffer.from('mock-high-res-snapshot-bytes-camera-vault-08');
    const clipBuffer = Buffer.from('mock-h264-video-stream-payload-incident-103821');

    const pkg = await forensicEvidencePackageService.createAndSealPackage({
      tenantId: 'BANK-001',
      branchId: 'BR-0142',
      cameraId: 'CAM-08',
      cameraName: 'Vault Strongroom Entrance',
      incidentId: 'INC-2026-009821',
      alertId: 'ALT-2026-103821',
      caseNumber: 'CASE-2026-00191',
      recorderId: 'NVR-01',
      recorderName: 'CP PLUS Branch Master NVR',
      recorderChannel: 8,
      manufacturer: 'CP PLUS',
      model: 'CP-UNR-4K4322-V3',
      serialNumber: 'SN-CPP-2026-88129',
      captureStart: '2026-08-17T01:21:00.000Z',
      captureEnd: '2026-08-17T01:22:30.000Z',
      serverTime: '2026-08-17T01:22:31.291Z',
      deviceTime: '2026-08-17T01:22:28.812Z',
      capturedBy: 'operator-128',
      reason: 'Vault intrusion investigation',
      media: {
        snapshotBuffer,
        clipBuffer,
      },
    });

    expect(pkg.id).toMatch(/^EV-2026-/);
    expect(pkg.status).toBe('SEALED');
    expect(pkg.artifacts.length).toBe(2);
    expect(pkg.timeSync.clockOffsetMs).toBe(-2479); // 2026-08-17T01:22:28.812Z - 2026-08-17T01:22:31.291Z
    expect(pkg.provenance.manufacturer).toBe('CP PLUS');
    expect(pkg.manifest).toBeDefined();
    expect(pkg.signature).toBeDefined();
    expect(pkg.signature?.algorithm).toBe('Ed25519');
    expect(pkg.signature?.signature).toBeDefined();

    // Verify unbroken chain of custody
    const custodyValidation = chainOfCustodyService.verifyLedger(pkg.id);
    expect(custodyValidation.valid).toBe(true);
    expect(custodyValidation.verifiedCount).toBeGreaterThanOrEqual(3);

    // Independent verification
    const verification = await evidenceVerifierService.verifyPackage(pkg, {
      'media/snapshot.jpg': snapshotBuffer,
      'media/clip.mp4': clipBuffer,
    });

    expect(verification.valid).toBe(true);
    expect(verification.manifestValid).toBe(true);
    expect(verification.signatureValid).toBe(true);
    expect(verification.artifactsValid).toBe(true);
    expect(verification.chainOfCustodyValid).toBe(true);
  });

  it('detects artifact tampering during independent verification', async () => {
    const snapshotBuffer = Buffer.from('original-snapshot');
    const clipBuffer = Buffer.from('original-clip');

    const pkg = await forensicEvidencePackageService.createAndSealPackage({
      tenantId: 'BANK-001',
      branchId: 'BR-0142',
      cameraId: 'CAM-01',
      recorderId: 'NVR-01',
      recorderChannel: 1,
      captureStart: '2026-08-17T01:00:00.000Z',
      captureEnd: '2026-08-17T01:05:00.000Z',
      capturedBy: 'operator-1',
      reason: 'Routine check',
      media: { snapshotBuffer, clipBuffer },
    });

    const tamperedClipBuffer = Buffer.from('tampered-clip-content-replaced');

    const verification = await evidenceVerifierService.verifyPackage(pkg, {
      'media/snapshot.jpg': snapshotBuffer,
      'media/clip.mp4': tamperedClipBuffer,
    });

    expect(verification.valid).toBe(false);
    expect(verification.artifactsValid).toBe(false);
    expect(verification.errors.some((e) => e.includes('Corrupted artifact'))).toBe(true);
  });

  it('Legal Hold protects evidence packages and recorder time windows from deletion', async () => {
    const pkg = await forensicEvidencePackageService.createAndSealPackage({
      tenantId: 'BANK-001',
      branchId: 'BR-0142',
      cameraId: 'CAM-05',
      recorderId: 'NVR-01',
      recorderChannel: 5,
      captureStart: '2026-08-17T02:00:00.000Z',
      captureEnd: '2026-08-17T02:10:00.000Z',
      capturedBy: 'auditor',
      reason: 'Audit inquiry',
      media: { snapshotBuffer: Buffer.from('snap') },
    });

    expect(legalHoldService.isProtected(pkg.id)).toBe(false);

    const hold = await legalHoldService.createLegalHold({
      tenantId: 'BANK-001',
      caseNumber: 'CASE-POLICE-8891',
      reason: 'Police subpoena for vault footage',
      evidencePackageIds: [pkg.id],
      cameraIds: ['CAM-05'],
      startTime: '2026-08-17T00:00:00.000Z',
      endTime: '2026-08-17T04:00:00.000Z',
      createdBy: 'legal-counsel',
    });

    expect(legalHoldService.isProtected(pkg.id)).toBe(true);
    expect(legalHoldService.isProtected('other-id', 'CAM-05', '2026-08-17T02:00:00.000Z')).toBe(true);

    // Release hold
    await legalHoldService.releaseLegalHold(hold.id, 'legal-counsel');
    expect(legalHoldService.isProtected(pkg.id)).toBe(false);
  });
});
