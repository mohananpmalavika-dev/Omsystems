import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  HsmEvidenceRepository,
  type RegisterTokenInput,
  type RegisterKeyInput,
} from '../../src/database/hsm-evidence-repository.js';
import {
  HsmEvidenceSignerService,
} from '../../src/security/hsm/hsm-evidence-signer.service.js';
import {
  HsmSigningProvider,
} from '../../src/evidence/signing/evidence-signing-provider.js';
import { ForensicEvidencePackageService } from '../../src/evidence/services/forensic-evidence-package.service.js';
import { EvidenceVerifierService } from '../../src/evidence/services/evidence-verifier.service.js';

describe('Hardware Security Module (HSM) Evidence Signing — Core Cryptography & Repository', () => {
  let repository: HsmEvidenceRepository;
  let signerService: HsmEvidenceSignerService;
  let tempKeyDir: string;

  beforeAll(() => {
    tempKeyDir = mkdtempSync(join(tmpdir(), 'hsm-test-keys-'));
  });

  afterAll(() => {
    try {
      rmSync(tempKeyDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  beforeEach(async () => {
    repository = new HsmEvidenceRepository(); // In-memory repo mode
    signerService = new HsmEvidenceSignerService(repository, {
      keyLabel: `test-hsm-key-${Date.now()}`,
      keyDir: tempKeyDir,
      algorithm: 'ECDSA_P256',
      tokenSerial: 'TEST-HSM-TOKEN-99',
      fipsLevel: 3,
      allowApplianceKeygen: true,
    });
    await signerService.initialize();
  });

  describe('HsmEvidenceRepository Persistence', () => {
    it('registers and retrieves PKCS#11 hardware tokens', async () => {
      const tokenInput: RegisterTokenInput = {
        slotId: 1,
        tokenLabel: 'VAULT_AIRGAP_TOKEN',
        tokenSerial: 'KL-AIRGAP-2026',
        manufacturer: 'Thales Luna',
        model: 'Luna HSM 7',
        firmwareVersion: '7.8.1',
        hardwareVersion: 'Rev 2.0',
        fipsLevel: 3,
        modulePath: '/usr/safenet/lunaclient/lib/libCryptoki2.so',
        status: 'ONLINE',
        pinSourceType: 'env',
        totalSessions: 8,
        activeSessions: 2,
        mechanisms: ['CKM_ECDSA', 'CKM_SHA256_RSA_PKCS_PSS'],
      };

      const token = await repository.registerToken(tokenInput);
      expect(token).toBeDefined();
      expect(token.tokenSerial).toBe('KL-AIRGAP-2026');
      expect(token.fipsLevel).toBe(3);
      expect(token.status).toBe('ONLINE');

      const fetched = await repository.getTokenBySerial('KL-AIRGAP-2026');
      expect(fetched).not.toBeNull();
      expect(fetched?.model).toBe('Luna HSM 7');
      expect(fetched?.slotId).toBe(1);

      const allTokens = await repository.listTokens();
      expect(allTokens.some((t) => t.tokenSerial === 'KL-AIRGAP-2026')).toBe(true);
    });

    it('registers and indexes persistent asymmetric keys', async () => {
      const keyInput: RegisterKeyInput = {
        keyLabel: 'bank-vault-master-signing-key',
        tokenSerial: 'TEST-HSM-TOKEN-99',
        ckaId: 'CKA-010203',
        algorithm: 'ECDSA_P256',
        keySize: 256,
        purpose: 'EVIDENCE_SIGNING',
        publicKeyPem: signerService.getPublicKeyPem(),
        publicKeyFingerprint: signerService.getKeyFingerprint(),
        certificatePem: '-----BEGIN CERTIFICATE-----\nTEST_CERT\n-----END CERTIFICATE-----',
        certificateChain: ['-----BEGIN CERTIFICATE-----\nROOT_CA\n-----END CERTIFICATE-----'],
        isActive: true,
      };

      const key = await repository.registerKey(keyInput);
      expect(key.keyLabel).toBe('bank-vault-master-signing-key');
      expect(key.signCount).toBe(0);
      expect(key.verifyCount).toBe(0);

      await repository.incrementKeyUsage('bank-vault-master-signing-key', 'sign');
      await repository.incrementKeyUsage('bank-vault-master-signing-key', 'verify');

      const updated = await repository.getKeyByLabel('bank-vault-master-signing-key');
      expect(updated?.signCount).toBe(1);
      expect(updated?.verifyCount).toBe(1);
      expect(updated?.lastUsedAt).toBeDefined();
    });

    it('records and queries append-only cryptographic audit logs', async () => {
      await repository.recordAudit({
        operation: 'SIGN_EVIDENCE',
        keyLabel: 'test-key',
        tokenSerial: 'TEST-HSM-TOKEN-99',
        evidenceId: 'EV-2026-001',
        actorId: 'forensic-officer-42',
        actorType: 'USER',
        status: 'SUCCESS',
        durationMs: 4,
        details: { algorithm: 'ECDSA_P256' },
      });

      const logs = await repository.getAuditLogs({ evidenceId: 'EV-2026-001' });
      expect(logs.length).toBeGreaterThan(0);
      expect(logs[0].operation).toBe('SIGN_EVIDENCE');
      expect(logs[0].actorId).toBe('forensic-officer-42');
      expect(logs[0].status).toBe('SUCCESS');
    });
  });

  describe('HsmEvidenceSignerService Cryptographic Operations', () => {
    it('generates authentic ECDSA P-256 digital signatures with valid mathematical verification', async () => {
      const manifest = {
        evidenceId: 'EV-2026-BANK-001',
        tenantId: 'bank-central',
        branchId: 'mumbai-vault-01',
        camera: { cameraId: 'cam-vault-door' },
        timestamp: '2026-09-12T08:00:00.000Z',
      };

      const payloadBuf = Buffer.from(JSON.stringify(manifest), 'utf-8');
      const digest = createHash('sha256').update(payloadBuf).digest();

      // Sign with HSM service
      const signResult = await signerService.signDigest(digest, {
        evidenceId: 'EV-2026-BANK-001',
        actorId: 'test-runner',
      });

      expect(signResult.signature).toBeDefined();
      expect(signResult.signature.length).toBeGreaterThan(60); // DER ASN.1 ECDSA signature
      expect(signResult.signatureBase64).toBeDefined();
      expect(signResult.signatureDerHex).toBeDefined();
      expect(signResult.keyFingerprint).toHaveLength(64);

      // Verify authentic signature
      const isValid = await signerService.verifyDigest(digest, signResult.signature);
      expect(isValid).toBe(true);

      // Tamper test: Alter digest by 1 byte -> Verification MUST fail
      const tamperedDigest = Buffer.from(digest);
      tamperedDigest[0] ^= 0xff;
      const isTamperedValid = await signerService.verifyDigest(tamperedDigest, signResult.signature);
      expect(isTamperedValid).toBe(false);
    });

    it('seals and persists complete forensic evidence package', async () => {
      const manifest = {
        schemaVersion: '1.0',
        evidenceId: 'EV-2026-SEAL-999',
        tenantId: 'omsystems',
        branchId: 'chennai-main-vault',
        incidentId: 'INC-2026-0042',
        artifacts: [
          { path: 'media/clip.mp4', sha256: 'a1b2c3d4e5f6', size: 10485760 },
          { path: 'media/snapshot.jpg', sha256: 'f6e5d4c3b2a1', size: 524288 },
        ],
      };

      const sealedPackage = await signerService.signEvidencePackage(manifest, 'omsystems', {
        evidenceId: 'EV-2026-SEAL-999',
        branchId: 'chennai-main-vault',
        actorId: 'forensic-investigator-01',
      });

      expect(sealedPackage.evidenceId).toBe('EV-2026-SEAL-999');
      expect(sealedPackage.manifestSha256).toBeDefined();
      expect(sealedPackage.signatureBase64).toBeDefined();
      expect(sealedPackage.verificationStatus).toBe('VERIFIED');

      // Verify retrieval from repository
      const fetched = await repository.getSignedPackage('EV-2026-SEAL-999');
      expect(fetched).not.toBeNull();
      expect(fetched?.manifestSha256).toBe(sealedPackage.manifestSha256);
      expect(fetched?.algorithm).toBe('ECDSA_P256');
    });

    it('executes diagnostic cryptographic loopback health check', async () => {
      const health = await signerService.getHealth();
      expect(health.status).toBe('ONLINE');
      expect(health.fipsLevel).toBe(3);
      expect(health.airGappedQualified).toBe(true);
      expect(health.sessionPool.authenticated).toBe(true);
      expect(health.supportedMechanisms).toContain('CKM_ECDSA');
    });

    it('supports RSA-PSS SHA-256 signing algorithm when configured', async () => {
      const rsaSigner = new HsmEvidenceSignerService(repository, {
        keyLabel: `test-rsa-key-${Date.now()}`,
        keyDir: tempKeyDir,
        algorithm: 'RSA_PSS_SHA256',
        tokenSerial: 'TEST-RSA-TOKEN-01',
        allowApplianceKeygen: true,
      });
      await rsaSigner.initialize();

      const testData = Buffer.from('Air-gapped 30-year archival evidence record');
      const digest = createHash('sha256').update(testData).digest();

      const signResult = await rsaSigner.signDigest(digest);
      expect(signResult.signature.length).toBeGreaterThan(256); // 3072-bit RSA signature

      const isValid = await rsaSigner.verifyDigest(digest, signResult.signature);
      expect(isValid).toBe(true);
    });
  });

  describe('HsmSigningProvider (EvidenceSigningProvider Contract)', () => {
    it('reports status PRODUCTION and fulfills authoritative signing contract', async () => {
      const provider = new HsmSigningProvider({
        keyLabel: 'prod-hsm-contract-key',
        keyDir: tempKeyDir,
        algorithm: 'ECDSA_P256',
        allowDevKeygen: true,
      });

      expect(provider.status).toBe('PRODUCTION');
      expect(await provider.getKeyId()).toBe('prod-hsm-contract-key');

      const pubKey = await provider.getPublicKeyPem();
      expect(pubKey).toContain('-----BEGIN PUBLIC KEY-----');

      const digest = createHash('sha256').update('critical forensic block').digest();
      const sigResult = await provider.signDigest(digest);

      expect(sigResult.algorithm).toBe('ECDSA_P256');
      expect(sigResult.signature.length).toBeGreaterThan(50);

      const isValid = await provider.verify(digest, sigResult.signature);
      expect(isValid).toBe(true);

      const isBadValid = await provider.verify(createHash('sha256').update('tampered').digest(), sigResult.signature);
      expect(isBadValid).toBe(false);
    });

    it('fails closed in production if persistent key or module is absent', () => {
      const originalEnv = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = 'production';
        expect(() => {
          new HsmSigningProvider({
            keyLabel: 'non-existent-hsm-key-12345',
            keyPath: '/non/existent/path/key.hsm.pem',
            keyDir: tempKeyDir,
            allowDevKeygen: false,
          });
        }).toThrow(/Production HSM Signing Error/);
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });
  });

  describe('End-to-End Forensic Package Pipeline with HSM Signer', () => {
    it('creates, signs, and independently verifies an evidence package using HSM', async () => {
      const hsmProvider = new HsmSigningProvider({
        keyLabel: 'vault-e2e-hsm-key',
        keyDir: tempKeyDir,
        algorithm: 'ECDSA_P256',
        allowDevKeygen: true,
      });

      const packageService = new ForensicEvidencePackageService(hsmProvider);
      const verifier = new EvidenceVerifierService();

      const snapshotBuffer = Buffer.from('FAKE-JPEG-DATA-SNAPSHOT-BYTES-12345');
      const clipBuffer = Buffer.from('FAKE-MP4-VIDEO-STREAM-BYTES-67890');

      const pkg = await packageService.createAndSealPackage({
        tenantId: 'omsystems',
        branchId: 'chennai-vault-central',
        cameraId: '00000000-0000-4000-8000-000000000001',
        cameraName: 'Vault Gate Camera 1',
        recorderId: 'rec-001',
        recorderChannel: 1,
        captureStart: '2026-09-12T07:00:00.000Z',
        captureEnd: '2026-09-12T07:05:00.000Z',
        capturedBy: 'security-admin-01',
        reason: 'Authorized audit export for judicial review',
        media: {
          snapshotBuffer,
          clipBuffer,
        },
      });

      expect(pkg.status).toBe('SEALED');
      expect(pkg.signature.algorithm).toBe('ECDSA_P256');
      expect(pkg.signature.signature).toBeDefined();

      // Independent verification using verifier service
      const verifyResult = await verifier.verifyPackage(pkg, {
        'media/snapshot.jpg': snapshotBuffer,
        'media/clip.mp4': clipBuffer,
      });

      expect(verifyResult.valid).toBe(true);
      expect(verifyResult.signatureValid).toBe(true);
      expect(verifyResult.manifestValid).toBe(true);
      expect(verifyResult.artifactsValid).toBe(true);
      expect(verifyResult.chainOfCustodyValid).toBe(true);
    });
  });
});
