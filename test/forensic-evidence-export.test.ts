import { describe, it, expect } from 'vitest';
import {
  EvidenceExportService,
  EvidenceVerifierService,
  EvidenceSignerService,
  ChainOfCustodyService,
  canonicalJsonStringify,
} from '../src/evidence-export/index.js';
import { retentionEngine } from '../src/retention/services/retention-engine.service.js';

describe('Forensic-Grade Evidence Export Subsystem', () => {
  it('guarantees deterministic canonical JSON stringification (RFC 8785)', () => {
    const objA = { b: 2, a: 1, nested: { y: 'test', x: 10 } };
    const objB = { nested: { x: 10, y: 'test' }, a: 1, b: 2 };

    const canonA = canonicalJsonStringify(objA);
    const canonB = canonicalJsonStringify(objB);

    expect(canonA).toBe(canonB);
    expect(canonA).toBe('{"a":1,"b":2,"nested":{"x":10,"y":"test"}}');
  });

  it('generates and verifies asymmetric Ed25519 digital signatures', () => {
    const signer = new EvidenceSignerService();
    const payload = { evidenceId: 'EV-2026-001', caseNumber: 'CASE-884', reason: 'Forensic Audit' };

    const sigResult = signer.signPayload(payload);
    expect(sigResult.algorithm).toBe('ED25519');
    expect(sigResult.signatureBase64).toBeDefined();

    // Valid verification
    const isValid = signer.verifySignature(payload, sigResult.signatureBase64, sigResult.certificatePem);
    expect(isValid).toBe(true);

    // Tampered payload verification MUST fail
    const tamperedPayload = { ...payload, reason: 'Tampered Audit' };
    const isTamperedValid = signer.verifySignature(tamperedPayload, sigResult.signatureBase64, sigResult.certificatePem);
    expect(isTamperedValid).toBe(false);
  });

  it('maintains a cryptographically linked, hash-chained chain of custody (H(event_n + prev_hash))', () => {
    const custody = new ChainOfCustodyService();
    const pkgId = 'EV-2026-TEST-01';

    const ev1 = custody.appendEvent(pkgId, {
      event: 'EXPORT_CREATED',
      actor: 'USR-472',
      timestamp: '2026-08-17T16:21:19.000Z',
      reason: 'Vault intrusion investigation',
    });
    expect(ev1.sequence).toBe(1);
    expect(ev1.previousHash).toBe('0'.repeat(64));
    expect(ev1.eventHash).toBeDefined();

    const ev2 = custody.appendEvent(pkgId, {
      event: 'PACKAGE_DOWNLOADED',
      actor: 'USR-472',
      timestamp: '2026-08-17T16:22:01.000Z',
    });
    expect(ev2.sequence).toBe(2);
    expect(ev2.previousHash).toBe(ev1.eventHash);

    const ev3 = custody.appendEvent(pkgId, {
      event: 'PACKAGE_SHARED',
      actor: 'USR-514',
      timestamp: '2026-08-17T17:03:52.000Z',
      recipient: 'CBI / RBI Financial Forensics',
    });
    expect(ev3.sequence).toBe(3);
    expect(ev3.previousHash).toBe(ev2.eventHash);

    const check = custody.verifyChain(pkgId);
    expect(check.isValid).toBe(true);
    expect(check.eventsCount).toBe(3);
  });

  it('assembles complete forensic package with remux provenance, clock drift, gaps, and legal hold binding', async () => {
    const exportService = new EvidenceExportService();

    const manifest = await exportService.exportEvidencePackage({
      tenantId: 'BANK-001',
      branchId: 'BR-118',
      branchName: 'Mumbai Main Vault Branch',
      caseNumber: 'CASE-KLM-2026-0412',
      reason: 'P1 Vault intrusion investigation',
      incidentId: 'INC-883412',
      cameraIds: ['CAM-VAULT-01', 'CAM-CORRIDOR-04'],
      startTime: '2026-08-17T14:30:00.000Z',
      endTime: '2026-08-17T14:45:00.000Z',
      mode: 'FORENSIC',
      operatorId: 'investigator-anand',
      applyLegalHold: true,
    });

    // 1. Evidence ID & Case
    expect(manifest.evidencePackageId).toContain('EV-2026-');
    expect(manifest.case.caseNumber).toBe('CASE-KLM-2026-0412');
    expect(manifest.case.investigatorUserId).toBe('investigator-anand');

    // 2. Media Processing (REMUX preserving stream with source hashes)
    expect(manifest.mediaProcessing.operation).toBe('REMUX');
    expect(manifest.mediaProcessing.videoTranscoded).toBe(false);
    expect(manifest.mediaProcessing.sourceSegments.length).toBe(4);

    // 3. Clock & Gap Disclosures
    expect(manifest.clock.estimatedClockOffsetMs).toBe(5200);
    expect(manifest.recordingCoverage.gaps.length).toBe(1);
    expect(manifest.recordingCoverage.coveragePercent).toBe(99.11);

    // 4. Required Package Artifacts
    const filePaths = manifest.files.map((f) => f.path);
    expect(filePaths).toContain('footage/CAM-VAULT-01_clip.mp4');
    expect(filePaths).toContain('snapshots/CAM-VAULT-01_keyframe.jpg');
    expect(filePaths).toContain('metadata.json');
    expect(filePaths).toContain('timeline.json');
    expect(filePaths).toContain('recording-gaps.json');
    expect(filePaths).toContain('clock-observations.json');
    expect(filePaths).toContain('audit.json');
    expect(filePaths).toContain('README.txt');

    // 5. Digital Signature
    expect(manifest.digitalSignature.algorithm).toBe('ED25519');
    expect(manifest.digitalSignature.signatureBase64).toBeDefined();

    // 6. Legal Hold bound to Retention Engine
    expect(manifest.legalHold?.applied).toBe(true);
    expect(manifest.legalHold?.holdId).toBeDefined();
    const activeHolds = retentionEngine.getLegalHolds('CAM-VAULT-01');
    expect(activeHolds.some((h) => h.caseNumber === 'CASE-KLM-2026-0412')).toBe(true);
  });

  it('verifies forensic evidence package and catches file byte-level tampering', async () => {
    const exportService = new EvidenceExportService();
    const verifier = new EvidenceVerifierService();

    const manifest = await exportService.exportEvidencePackage({
      tenantId: 'BANK-001',
      branchId: 'BR-118',
      caseNumber: 'CASE-TAMPER-009',
      reason: 'Tamper-resistance verification test',
      cameraIds: ['CAM-VAULT-01'],
      startTime: '2026-08-17T14:30:00.000Z',
      endTime: '2026-08-17T14:45:00.000Z',
      operatorId: 'auditor-ramesh',
    });

    // 1. Untampered Package Verification
    const cleanResult = verifier.verifyEvidencePackage(manifest);
    expect(cleanResult.isOverallValid).toBe(true);
    expect(cleanResult.signatureValid).toBe(true);
    expect(cleanResult.chainOfCustodyValid).toBe(true);
    expect(cleanResult.corruptFiles.length).toBe(0);

    // 2. Tampered Video Footage Verification
    const fileBuffers = new Map<string, Buffer | string>();
    // Provide altered video content that produces a mismatched SHA-256 hash
    fileBuffers.set('footage/CAM-VAULT-01_clip.mp4', 'TAMPERED_VIDEO_DATA_WITH_CORRUPT_FRAME');

    const tamperedResult = verifier.verifyEvidencePackage(manifest, fileBuffers);
    expect(tamperedResult.isOverallValid).toBe(false);
    expect(tamperedResult.corruptFiles.length).toBe(1);
    expect(tamperedResult.corruptFiles[0]?.path).toBe('footage/CAM-VAULT-01_clip.mp4');
  });

  it('enforces strict RBAC export policy validation', () => {
    const exportService = new EvidenceExportService();

    // 1. Missing Case Number
    expect(() => {
      exportService.assertCanExport({
        branchId: 'BR-118',
        caseNumber: '',
        reason: 'Valid investigation reason',
        cameraIds: ['CAM-01'],
        startTime: '2026-08-17T14:30:00Z',
        endTime: '2026-08-17T14:45:00Z',
        operatorId: 'investigator-anand',
      });
    }).toThrow('Case number is mandatory');

    // 2. Missing Detailed Reason
    expect(() => {
      exportService.assertCanExport({
        branchId: 'BR-118',
        caseNumber: 'CASE-01',
        reason: 'few',
        cameraIds: ['CAM-01'],
        startTime: '2026-08-17T14:30:00Z',
        endTime: '2026-08-17T14:45:00Z',
        operatorId: 'investigator-anand',
      });
    }).toThrow('Detailed justification reason is mandatory');
  });
});
