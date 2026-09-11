import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import crypto from 'crypto';
import { registerAttestationRoutes } from '../../src/routes/attestation.routes.js';
import {
  computePcrCompositeDigest,
} from '../../src/security/attestation/crypto/pcr-digest.verifier.js';
import {
  buildTpmsAttestBuffer,
} from '../../src/security/attestation/crypto/tpms-attest.parser.js';
import { TpmHashAlgorithm } from '../../src/security/attestation/domain/attestation.types.js';

describe('TPM 2.0 Fastify Routes Integration', () => {
  let app: ReturnType<typeof Fastify>;

  // In-memory fake database pool for Fastify route tests
  const tables = {
    identities: new Map<string, any>(),
    challenges: new Map<string, any>(),
    evidence: new Map<string, any>(),
    audit: [] as any[],
  };

  const fakePool: any = {
    query: async (text: string, params?: any[]) => {
      const q = text.trim();

      // INSERT INTO tpm_identities
      if (q.includes('INSERT INTO tpm_identities')) {
        const id = params![0];
        const tenantId = params![1];
        const deviceId = params![2];
        tables.identities.set(`${tenantId}:${deviceId}`, {
          id,
          tenant_id: tenantId,
          device_id: deviceId,
          ak_name: params![3],
          ak_public_key_fingerprint: params![4],
          ak_public_key_pem: params![5],
          endorsement_key_fingerprint: params![6],
          manufacturer: params![7],
          firmware_version: params![8],
          trust_level: params![9],
          enrolled_at: params![10],
          revoked_at: null,
          revocation_reason: null,
        });
        return { rows: [], rowCount: 1 };
      }

      // SELECT FROM tpm_identities
      if (q.includes('FROM tpm_identities')) {
        const deviceId = params![0];
        for (const row of tables.identities.values()) {
          if (row.device_id === deviceId) {
            return { rows: [row], rowCount: 1 };
          }
        }
        return { rows: [], rowCount: 0 };
      }

      // INSERT INTO tpm_attestation_challenges
      if (q.includes('INSERT INTO tpm_attestation_challenges')) {
        const id = params![0];
        tables.challenges.set(id, {
          id,
          tenant_id: params![1],
          device_id: params![2],
          nonce: params![3],
          requested_pcrs: params![4],
          hash_algorithm: params![5],
          created_at: params![6],
          expires_at: params![7],
          consumed_at: null,
        });
        return { rows: [], rowCount: 1 };
      }

      // SELECT FROM tpm_attestation_challenges
      if (q.includes('FROM tpm_attestation_challenges')) {
        const id = params![0];
        const row = tables.challenges.get(id);
        return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
      }

      // UPDATE tpm_attestation_challenges SET consumed_at
      if (q.includes('SET consumed_at = NOW()')) {
        const id = params![0];
        const row = tables.challenges.get(id);
        if (row && !row.consumed_at && row.expires_at > new Date()) {
          row.consumed_at = new Date();
          return { rows: [{ id }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }

      // INSERT INTO tpm_attestation_evidence
      if (q.includes('INSERT INTO tpm_attestation_evidence')) {
        const id = params![0];
        tables.evidence.set(id, {
          id,
          tenant_id: params![1],
          device_id: params![2],
          challenge_id: params![3],
          quote: params![4],
          signature: params![5],
          pcr_values: params![6],
          pcr_selection: params![7],
          pcr_digest: params![8],
          structure_valid: params![9],
          nonce_verified: params![10],
          signature_verified: params![11],
          pcr_digest_verified: params![12],
          ak_trusted: params![13],
          policy_matched: params![14],
          tpm_state: params![15],
          secure_boot_state: params![16],
          failure_reason: params![17],
          received_at: params![18],
          verified_at: params![19],
        });
        return { rows: [], rowCount: 1 };
      }

      // SELECT FROM tpm_attestation_evidence (latest)
      if (q.includes('FROM tpm_attestation_evidence') && q.includes('ORDER BY received_at DESC')) {
        const deviceId = params![0];
        const matches = Array.from(tables.evidence.values()).filter((e) => e.device_id === deviceId);
        return { rows: matches.slice(0, 1), rowCount: matches.length ? 1 : 0 };
      }

      // Baseline policy
      if (q.includes('FROM tpm_pcr_policies')) {
        return {
          rows: [
            {
              id: 'policy_standard_uefi_v1',
              name: 'Standard UEFI Policy',
              platform_type: 'linux_standard',
              expected_pcrs: JSON.stringify({ required_pcrs: [0, 2, 4, 7] }),
              hash_algorithm: 'sha256',
              is_active: true,
            },
          ],
          rowCount: 1,
        };
      }

      // Audit log
      if (q.includes('INSERT INTO tpm_attestation_audit_log')) {
        tables.audit.push({ params });
        return { rows: [], rowCount: 1 };
      }

      // Update identity status
      if (q.includes('UPDATE tpm_identities SET last_attestation_status')) {
        return { rows: [], rowCount: 1 };
      }

      // Fleet stats
      if (q.includes('COUNT(*) AS total')) {
        return {
          rows: [
            {
              total: '1',
              active: '1',
              verified: '1',
              failed: '0',
              enrolled: '1',
              revoked: '0',
            },
          ],
          rowCount: 1,
        };
      }

      return { rows: [], rowCount: 0 };
    },
  };

  const fakeStore: any = {
    pool: fakePool,
  };

  const { publicKey: akPublicKeyPem, privateKey: akPrivateKeyPem } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  const samplePcrs: Record<string, string> = {
    '0': 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90',
    '2': '11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff',
    '4': 'f0e1d2c3b4a5968778695a4b3c2d1e0ff0e1d2c3b4a5968778695a4b3c2d1e0f',
    '7': '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
  };

  beforeAll(async () => {
    app = Fastify();
    await registerAttestationRoutes(app, fakeStore);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('enrolls device Attestation Key via POST /api/v1/attestation/devices/:deviceId/enroll', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/attestation/devices/dev-edge-100/enroll',
      headers: { 'x-tenant-id': '00000000-0000-4000-8000-000000000000' },
      payload: {
        akName: 'edge-gateway-ak',
        akPublicKeyPem,
        tpmInfo: {
          manufacturer: 'Nuvoton Technology',
          firmwareVersion: '7.2.0.1',
        },
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.akFingerprint).toHaveLength(64);
    expect(body.data.trustLevel).toBe('ENROLLED');
  });

  it('issues challenge via POST /api/v1/attestation/devices/:deviceId/challenge', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/attestation/devices/dev-edge-100/challenge',
      headers: { 'x-tenant-id': '00000000-0000-4000-8000-000000000000' },
      payload: {
        requestedPcrs: [0, 2, 4, 7],
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.challengeId).toMatch(/^chal_/);
    expect(body.data.nonce).toBeDefined();
  });

  it('submits and cryptographically verifies evidence via POST /api/v1/attestation/devices/:deviceId/evidence', async () => {
    // 1. Get challenge
    const chalRes = await app.inject({
      method: 'POST',
      url: '/api/v1/attestation/devices/dev-edge-100/challenge',
      headers: { 'x-tenant-id': '00000000-0000-4000-8000-000000000000' },
      payload: { requestedPcrs: [0, 2, 4, 7] },
    });
    const { challengeId, nonce } = JSON.parse(chalRes.body).data;

    // 2. Hardware generates quote
    const selection = { hashAlgorithm: TpmHashAlgorithm.SHA256, pcrs: [0, 2, 4, 7] };
    const pcrDigest = computePcrCompositeDigest(samplePcrs, selection);
    const quoteBuffer = buildTpmsAttestBuffer({
      extraData: Buffer.from(nonce, 'base64'),
      pcrSelection: selection,
      pcrDigest,
    });

    // 3. Sign quote
    const signer = crypto.createSign('sha256');
    signer.update(quoteBuffer);
    signer.end();
    const signatureBuffer = signer.sign(akPrivateKeyPem);

    // 4. Submit evidence
    const verifyRes = await app.inject({
      method: 'POST',
      url: '/api/v1/attestation/devices/dev-edge-100/evidence',
      headers: { 'x-tenant-id': '00000000-0000-4000-8000-000000000000' },
      payload: {
        challengeId,
        quote: quoteBuffer.toString('base64'),
        signature: signatureBuffer.toString('base64'),
        pcrValues: samplePcrs,
        secureBootReported: true,
      },
    });

    expect(verifyRes.statusCode).toBe(200);
    const verifyBody = JSON.parse(verifyRes.body);
    expect(verifyBody.success).toBe(true);
    expect(verifyBody.data.status).toBe('ATTESTED');
    expect(verifyBody.data.secureBootState).toBe('VERIFIED');
    expect(verifyBody.data.checks.nonceVerified).toBe(true);
    expect(verifyBody.data.checks.signatureVerified).toBe(true);
    expect(verifyBody.data.checks.pcrDigestVerified).toBe(true);
  });

  it('queries live device status via GET /api/v1/attestation/devices/:deviceId/status', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/attestation/devices/dev-edge-100/status',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.enrolled).toBe(true);
    expect(body.data.tpmState).toBe('ATTESTED');
    expect(body.data.secureBootState).toBe('VERIFIED');
  });

  it('queries fleet statistics via GET /api/v1/attestation/stats', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/attestation/stats',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.totalChallenges).toBeDefined();
  });
});
