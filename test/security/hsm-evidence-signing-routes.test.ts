import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerHsmSigningRoutes, setHsmSignerService } from '../../src/routes/hsm-signing.routes.js';
import { HsmEvidenceRepository } from '../../src/database/hsm-evidence-repository.js';
import { HsmEvidenceSignerService } from '../../src/security/hsm/hsm-evidence-signer.service.js';

describe('Fastify HSM Evidence Signing Routes Integration', () => {
  let app: FastifyInstance;
  let repository: HsmEvidenceRepository;
  let signerService: HsmEvidenceSignerService;
  let tempKeyDir: string;

  beforeAll(async () => {
    tempKeyDir = mkdtempSync(join(tmpdir(), 'hsm-routes-keys-'));
    app = Fastify();
    repository = new HsmEvidenceRepository();
    signerService = new HsmEvidenceSignerService(repository, {
      keyLabel: 'route-test-hsm-key',
      keyDir: tempKeyDir,
      algorithm: 'ECDSA_P256',
      tokenSerial: 'ROUTE-TOKEN-001',
      allowApplianceKeygen: true,
    });
    await signerService.initialize();
    setHsmSignerService(signerService);

    const mockStore: any = {
      checkAccess: async () => ({ allowed: true }),
    };

    await registerHsmSigningRoutes(app, mockStore);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    try {
      rmSync(tempKeyDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  describe('Status & Health Endpoints', () => {
    it('GET /v1/security/hsm/status returns hardware module diagnostics', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/v1/security/hsm/status',
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.success).toBe(true);
      expect(json.data.status).toBe('ONLINE');
      expect(json.data.fipsLevel).toBe(3);
      expect(json.data.activeKeyLabel).toBe('route-test-hsm-key');
      expect(json.data.airGappedQualified).toBe(true);
    });

    it('GET /v1/security/hsm/health returns 200 for healthy loopback test', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/v1/security/hsm/health',
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.success).toBe(true);
      expect(json.data.status).toBe('ONLINE');
    });
  });

  describe('Token Registration Endpoints', () => {
    it('POST /v1/security/hsm/tokens/register enrolls physical PKCS#11 appliance token', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/security/hsm/tokens/register',
        payload: {
          slotId: 0,
          tokenLabel: 'VAULT_HSM_PRIMARY',
          tokenSerial: 'KL-HSM-LUNA-01',
          manufacturer: 'Thales',
          model: 'Luna HSM 7',
          modulePath: '/usr/safenet/lunaclient/lib/libCryptoki2.so',
          fipsLevel: 3,
        },
      });

      expect(res.statusCode).toBe(201);
      const json = JSON.parse(res.body);
      expect(json.success).toBe(true);
      expect(json.data.tokenSerial).toBe('KL-HSM-LUNA-01');
      expect(json.data.fipsLevel).toBe(3);
    });

    it('GET /v1/security/hsm/tokens lists enrolled tokens', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/v1/security/hsm/tokens',
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.success).toBe(true);
      expect(Array.isArray(json.data)).toBe(true);
      expect(json.data.length).toBeGreaterThan(0);
    });
  });

  describe('Key Registry Endpoints', () => {
    it('POST /v1/security/hsm/keys/register provisions signing key metadata', async () => {
      const pubKey = signerService.getPublicKeyPem();
      const res = await app.inject({
        method: 'POST',
        url: '/v1/security/hsm/keys/register',
        payload: {
          keyLabel: 'evidence-court-cert-key',
          algorithm: 'ECDSA_P256',
          publicKeyPem: pubKey,
          certificateChain: ['-----BEGIN CERTIFICATE-----\nROOT_CA_CERT\n-----END CERTIFICATE-----'],
        },
      });

      expect(res.statusCode).toBe(201);
      const json = JSON.parse(res.body);
      expect(json.success).toBe(true);
      expect(json.data.keyLabel).toBe('evidence-court-cert-key');
      expect(json.data.publicKeyFingerprint).toBeDefined();
    });

    it('GET /v1/security/hsm/keys lists registered signing keys', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/v1/security/hsm/keys',
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.success).toBe(true);
      expect(json.data.length).toBeGreaterThan(0);
    });

    it('GET /v1/security/hsm/keys/:keyLabel/certificate returns public cert data', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/v1/security/hsm/keys/evidence-court-cert-key/certificate',
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.success).toBe(true);
      expect(json.data.keyLabel).toBe('evidence-court-cert-key');
      expect(json.data.publicKeyPem).toContain('-----BEGIN PUBLIC KEY-----');
      expect(json.data.certificateChain.length).toBe(1);
    });
  });

  describe('Evidence Signing & Verification Operations', () => {
    let sealedEvidenceId: string;
    let sealedManifestSha256: string;
    let sealedSignatureBase64: string;

    it('POST /v1/security/hsm/sign-evidence seals manifest with hardware signature', async () => {
      const manifest = {
        schemaVersion: '1.0',
        evidenceId: 'EV-ROUTE-TEST-001',
        camera: { cameraId: 'cam-001' },
        reason: 'Judicial audit package sealing',
      };

      const res = await app.inject({
        method: 'POST',
        url: '/v1/security/hsm/sign-evidence',
        payload: {
          evidenceId: 'EV-ROUTE-TEST-001',
          tenantId: 'omsystems',
          branchId: 'chennai-vault-01',
          manifest,
        },
      });

      expect(res.statusCode).toBe(201);
      const json = JSON.parse(res.body);
      expect(json.success).toBe(true);
      expect(json.data.evidenceId).toBe('EV-ROUTE-TEST-001');
      expect(json.data.manifestSha256).toBeDefined();
      expect(json.data.signatureBase64).toBeDefined();
      expect(json.data.algorithm).toBe('ECDSA_P256');

      sealedEvidenceId = json.data.evidenceId;
      sealedManifestSha256 = json.data.manifestSha256;
      sealedSignatureBase64 = json.data.signatureBase64;
    });

    it('GET /v1/security/hsm/packages/:evidenceId retrieves sealed package record', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/v1/security/hsm/packages/${sealedEvidenceId}`,
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.success).toBe(true);
      expect(json.data.evidenceId).toBe(sealedEvidenceId);
      expect(json.data.verificationStatus).toBe('VERIFIED');
    });

    it('POST /v1/security/hsm/verify-evidence validates authentic signature', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/security/hsm/verify-evidence',
        payload: {
          manifestSha256: sealedManifestSha256,
          signatureBase64: sealedSignatureBase64,
        },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.success).toBe(true);
      expect(json.data.isValid).toBe(true);
    });

    it('POST /v1/security/hsm/verify-evidence detects tampered signature', async () => {
      // Corrupt signature Base64
      const corruptBase64 = Buffer.from('corrupt-signature-data').toString('base64');
      const res = await app.inject({
        method: 'POST',
        url: '/v1/security/hsm/verify-evidence',
        payload: {
          manifestSha256: sealedManifestSha256,
          signatureBase64: corruptBase64,
        },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.success).toBe(true);
      expect(json.data.isValid).toBe(false);
    });
  });

  describe('Audit Trail Endpoint', () => {
    it('GET /v1/security/hsm/audit-log returns immutable operation records', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/v1/security/hsm/audit-log?limit=10',
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.success).toBe(true);
      expect(Array.isArray(json.data)).toBe(true);
      expect(json.data.length).toBeGreaterThan(0);
      expect(json.data[0].operation).toBeDefined();
      expect(json.data[0].timestamp).toBeDefined();
    });
  });
});
