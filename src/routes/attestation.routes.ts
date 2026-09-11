/**
 * Fastify Routes for TPM 2.0 Remote Attestation
 * Production endpoints for device AK enrollment, challenge issuance, and cryptographic quote verification
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { ControlPlaneStore } from '../control-plane-store.js';
import { AttestationRepository } from '../database/attestation-repository.js';
import { TpmAttestationService } from '../security/attestation/application/tpm-attestation.service.js';
import { TpmState, SecureBootState } from '../security/attestation/domain/attestation.types.js';

export async function registerAttestationRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore
) {
  const pool = (store as any).pool || (store as any).db;

  if (!pool) {
    app.log.warn('[AttestationRoutes] No PostgreSQL pool available on store; attestation routes will be disabled');
    return;
  }

  const repository = new AttestationRepository(pool);
  const attestationService = new TpmAttestationService(repository);

  // Helper to extract tenantId from request or fallback to default
  const getTenantId = (req: FastifyRequest): string => {
    const user = (req as any).user;
    return user?.tenantId || (req.headers['x-tenant-id'] as string) || '00000000-0000-4000-8000-000000000000';
  };

  // 1. Enroll Device Attestation Key (AK)
  const enrollBodySchema = z.object({
    deviceId: z.string().optional(),
    akName: z.string().min(1).default('default-ak'),
    akPublicKeyPem: z.string().min(32),
    tpmInfo: z
      .object({
        manufacturer: z.string().optional(),
        firmwareVersion: z.string().optional(),
        ekPublicKeyHash: z.string().optional(),
      })
      .optional(),
  });

  const handleEnroll = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const params = request.params as { deviceId?: string };
      const body = enrollBodySchema.parse(request.body);
      const deviceId = params.deviceId || body.deviceId;

      if (!deviceId) {
        return reply.code(400).send({ success: false, error: 'deviceId is required' });
      }

      const tenantId = getTenantId(request);
      const identity = await attestationService.enrollDeviceAk(
        tenantId,
        deviceId,
        body.akName,
        body.akPublicKeyPem,
        {
          endorsementKeyFingerprint: body.tpmInfo?.ekPublicKeyHash,
          manufacturer: body.tpmInfo?.manufacturer,
          firmwareVersion: body.tpmInfo?.firmwareVersion,
        }
      );

      return reply.code(201).send({
        success: true,
        data: {
          identityId: identity.id,
          deviceId: identity.deviceId,
          akName: identity.akName,
          akFingerprint: identity.akPublicKeyFingerprint,
          trustLevel: identity.trustLevel,
          enrolledAt: identity.enrolledAt.toISOString(),
        },
      });
    } catch (error) {
      app.log.error({ error }, 'Attestation identity enrollment failed');
      return reply.code(400).send({
        success: false,
        error: error instanceof Error ? error.message : 'Enrollment failed',
      });
    }
  };

  app.post('/api/v1/attestation/devices/:deviceId/enroll', handleEnroll);
  app.post('/api/attestation/devices/:deviceId/enroll', handleEnroll);
  app.post('/api/attestation/identities/enroll', handleEnroll);

  // 2. Issue Attestation Challenge
  const challengeBodySchema = z.object({
    deviceId: z.string().optional(),
    requestedPcrs: z.array(z.number().int().min(0).max(23)).optional(),
    hashAlgorithm: z.enum(['sha1', 'sha256', 'sha384', 'sha512']).optional(),
  });

  const handleChallenge = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const params = request.params as { deviceId?: string };
      const body = challengeBodySchema.parse(request.body || {});
      const deviceId = params.deviceId || body.deviceId;

      if (!deviceId) {
        return reply.code(400).send({ success: false, error: 'deviceId is required' });
      }

      const tenantId = getTenantId(request);
      const challenge = await attestationService.issueChallenge(tenantId, deviceId, {
        requestedPcrs: body.requestedPcrs,
        hashAlgorithm: body.hashAlgorithm,
      });

      return reply.code(201).send({
        success: true,
        data: {
          challengeId: challenge.id,
          nonce: challenge.nonce,
          pcrSelection: {
            hashAlgorithm: challenge.hashAlgorithm,
            pcrs: challenge.requestedPcrs,
          },
          expiresAt: challenge.expiresAt.toISOString(),
        },
      });
    } catch (error) {
      app.log.error({ error }, 'Attestation challenge issuance failed');
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Challenge issuance failed',
      });
    }
  };

  app.post('/api/v1/attestation/devices/:deviceId/challenge', handleChallenge);
  app.post('/api/attestation/devices/:deviceId/challenge', handleChallenge);
  app.post('/api/attestation/challenges', handleChallenge);

  // 3. Submit Evidence & Verify Hardware Quote
  const evidenceBodySchema = z.object({
    deviceId: z.string().optional(),
    challengeId: z.string().min(1),
    quote: z.string().min(1), // base64
    signature: z.string().min(1), // base64
    pcrValues: z.record(z.string()), // index -> hex
    pcrSelection: z
      .object({
        hashAlgorithm: z.enum(['sha1', 'sha256', 'sha384', 'sha512']),
        pcrs: z.array(z.number()),
      })
      .optional(),
    secureBootState: z.object({ enabled: z.boolean() }).optional(),
    secureBootReported: z.boolean().optional(),
  });

  const handleEvidence = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const params = request.params as { deviceId?: string };
      const body = evidenceBodySchema.parse(request.body);
      const deviceId = params.deviceId || body.deviceId;

      if (!deviceId) {
        return reply.code(400).send({ success: false, error: 'deviceId is required' });
      }

      const tenantId = getTenantId(request);
      const secureBootReported =
        body.secureBootReported ?? (body.secureBootState ? body.secureBootState.enabled : undefined);

      const verificationResult = await attestationService.submitEvidence(tenantId, deviceId, {
        challengeId: body.challengeId,
        quote: body.quote,
        signature: body.signature,
        pcrValues: body.pcrValues,
        pcrSelection: body.pcrSelection as any,
        secureBootReported,
      });

      const httpCode = verificationResult.valid ? 200 : 403;

      return reply.code(httpCode).send({
        success: verificationResult.valid,
        data: {
          status: verificationResult.tpmState,
          secureBootState: verificationResult.secureBootState,
          failureReason: verificationResult.failureReason,
          checks: {
            structureValid: verificationResult.structureValid,
            nonceVerified: verificationResult.nonceVerified,
            signatureVerified: verificationResult.quoteSignatureVerified,
            pcrDigestVerified: verificationResult.pcrDigestVerified,
            akTrusted: verificationResult.akTrusted,
            policyMatched: verificationResult.policyMatched,
          },
          evidenceId: verificationResult.evidenceId,
          challengeId: verificationResult.challengeId,
        },
      });
    } catch (error) {
      app.log.error({ error }, 'Attestation evidence verification failed');
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Verification failed',
      });
    }
  };

  app.post('/api/v1/attestation/devices/:deviceId/evidence', handleEvidence);
  app.post('/api/attestation/devices/:deviceId/evidence', handleEvidence);
  app.post('/api/attestation/verify', handleEvidence);

  // 4. Get Live Device Attestation Status
  const handleStatus = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const params = request.params as { deviceId: string };
      const status = await attestationService.getDeviceStatus(params.deviceId);
      return reply.send({ success: true, data: status });
    } catch (error) {
      app.log.error({ error }, 'Device attestation status retrieval failed');
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to retrieve status',
      });
    }
  };

  app.get('/api/v1/attestation/devices/:deviceId/status', handleStatus);
  app.get('/api/attestation/devices/:deviceId/status', handleStatus);
  app.get('/api/attestation/status/:deviceId', handleStatus);

  // 5. Get Device Evidence Audit History
  app.get('/api/v1/attestation/devices/:deviceId/history', async (request, reply) => {
    try {
      const params = request.params as { deviceId: string };
      const query = request.query as { limit?: string };
      const limit = query.limit ? parseInt(query.limit, 10) : 20;

      const history = await attestationService.getHistory(params.deviceId, limit);
      return reply.send({ success: true, data: history });
    } catch (error) {
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to retrieve history',
      });
    }
  });

  // 6. Revoke Device Attestation Key
  app.post('/api/v1/attestation/devices/:deviceId/revoke', async (request, reply) => {
    try {
      const params = request.params as { deviceId: string };
      const body = z.object({ reason: z.string().min(1) }).parse(request.body);
      const tenantId = getTenantId(request);

      const revoked = await attestationService.revokeDevice(params.deviceId, body.reason, tenantId);
      return reply.send({ success: revoked });
    } catch (error) {
      return reply.code(400).send({
        success: false,
        error: error instanceof Error ? error.message : 'Revocation failed',
      });
    }
  });

  // 7. Fleet-wide Attestation Statistics
  app.get('/api/v1/attestation/stats', async (request, reply) => {
    try {
      const stats = await attestationService.getFleetStats();
      return reply.send({ success: true, data: stats });
    } catch (error) {
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to retrieve stats',
      });
    }
  });
}
