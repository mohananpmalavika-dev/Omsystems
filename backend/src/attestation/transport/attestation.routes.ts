/**
 * TPM Attestation API Routes
 * REST endpoints for challenge issuance and evidence submission
 */

import { Router, Request, Response } from 'express';
import { tpmAttestationService } from '../application/tpm-attestation.service';
import { AttestationError } from '../domain/attestation-errors';

const router = Router();

/**
 * Issue attestation challenge
 * POST /api/attestation/devices/:deviceId/challenge
 */
router.post('/devices/:deviceId/challenge', async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.params;
    const tenantId = (req as any).tenantId ?? 'default-tenant'; // From auth middleware
    const { requestedPcrs } = req.body;

    const challenge = await tpmAttestationService.issueChallenge(
      tenantId,
      deviceId,
      { requestedPcrs }
    );

    res.status(201).json({
      success: true,
      challenge: {
        challengeId: challenge.id,
        nonce: challenge.nonce,
        pcrs: challenge.requestedPcrs,
        hashAlgorithm: challenge.hashAlgorithm,
        expiresAt: challenge.expiresAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('Challenge issuance error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to issue attestation challenge',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * Submit attestation evidence
 * POST /api/attestation/devices/:deviceId/evidence
 */
router.post('/devices/:deviceId/evidence', async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.params;
    const tenantId = (req as any).tenantId ?? 'default-tenant';
    
    const submission = {
      challengeId: req.body.challengeId,
      quote: req.body.quote,
      signature: req.body.signature,
      pcrValues: req.body.pcrValues,
      akPublicKey: req.body.akPublicKey,
      akCertificate: req.body.akCertificate,
      akCertificateChain: req.body.akCertificateChain,
      eventLog: req.body.eventLog,
      metadata: req.body.metadata ?? {},
    };

    const result = await tpmAttestationService.submitEvidence(
      tenantId,
      deviceId,
      submission
    );

    const statusCode = result.tpmState === 'ATTESTED' ? 200 : 400;

    res.status(statusCode).json({
      success: result.tpmState === 'ATTESTED',
      attestation: {
        tpmState: result.tpmState,
        secureBootState: result.secureBootState,
        verifiedAt: result.verifiedAt?.toISOString(),
        freshness: result.freshness,
        checks: {
          nonce: result.nonceVerified,
          signature: result.quoteSignatureVerified,
          pcrDigest: result.pcrDigestVerified,
          akTrust: result.akTrusted,
          policy: result.policyMatched,
        },
        failureReason: result.failureReason,
        policyViolations: result.policyViolations,
        evidenceId: result.evidenceId,
        challengeId: result.challengeId,
      },
    });
  } catch (error) {
    console.error('Evidence submission error:', error);
    
    if (error instanceof AttestationError) {
      res.status(400).json({
        success: false,
        error: 'Attestation failed',
        reason: error.reason,
        message: error.message,
        details: error.details,
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Internal attestation error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
});

/**
 * Get latest attestation for device
 * GET /api/attestation/devices/:deviceId/latest
 */
router.get('/devices/:deviceId/latest', async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.params;

    const attestation = await tpmAttestationService.getLatestAttestation(deviceId);

    if (!attestation) {
      return res.status(404).json({
        success: false,
        error: 'No attestation found for device',
      });
    }

    res.json({
      success: true,
      attestation: {
        tpmState: attestation.tpmState,
        secureBootState: attestation.secureBootState,
        verifiedAt: attestation.verifiedAt?.toISOString(),
        freshness: attestation.freshness,
        checks: {
          nonce: attestation.nonceVerified,
          signature: attestation.quoteSignatureVerified,
          pcrDigest: attestation.pcrDigestVerified,
          akTrust: attestation.akTrusted,
          policy: attestation.policyMatched,
        },
        failureReason: attestation.failureReason,
        evidenceId: attestation.evidenceId,
        challengeId: attestation.challengeId,
      },
    });
  } catch (error) {
    console.error('Get latest attestation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve attestation',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * Get evidence history for device
 * GET /api/attestation/devices/:deviceId/evidence
 */
router.get('/devices/:deviceId/evidence', async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.params;
    const limit = parseInt(req.query.limit as string) || 10;

    const evidence = await tpmAttestationService.listDeviceEvidence(deviceId, limit);

    res.json({
      success: true,
      evidence: evidence.map((e) => ({
        id: e.id,
        deviceId: e.deviceId,
        challengeId: e.challengeId,
        receivedAt: e.receivedAt.toISOString(),
        verifiedAt: e.verifiedAt?.toISOString(),
        verificationStatus: e.verificationStatus,
        failureReason: e.failureReason,
        pcrValues: e.pcrValues,
        metadata: e.metadata,
      })),
      count: evidence.length,
    });
  } catch (error) {
    console.error('Get evidence history error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve evidence',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * Enroll device Attestation Key
 * POST /api/attestation/devices/:deviceId/enroll
 */
router.post('/devices/:deviceId/enroll', async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.params;
    const tenantId = (req as any).tenantId ?? 'default-tenant';
    
    const {
      akName,
      akPublicKey,
      endorsementKeyFingerprint,
      manufacturer,
      model,
    } = req.body;

    if (!akName || !akPublicKey) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: akName, akPublicKey',
      });
    }

    const akService = tpmAttestationService.getAkService();
    const identity = await akService.enrollAttestationKey({
      tenantId,
      deviceId,
      akName,
      akPublicKeyPem: akPublicKey,
      endorsementKeyFingerprint,
      manufacturer,
      model,
    });

    res.status(201).json({
      success: true,
      identity: {
        id: identity.id,
        deviceId: identity.deviceId,
        akFingerprint: identity.akPublicKeyFingerprint,
        enrolledAt: identity.enrolledAt.toISOString(),
        manufacturer: identity.manufacturer,
        model: identity.model,
      },
    });
  } catch (error) {
    console.error('AK enrollment error:', error);
    
    if (error instanceof AttestationError) {
      res.status(400).json({
        success: false,
        error: 'Enrollment failed',
        reason: error.reason,
        message: error.message,
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to enroll AK',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
});

/**
 * Get device AK status
 * GET /api/attestation/devices/:deviceId/ak-status
 */
router.get('/devices/:deviceId/ak-status', async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.params;

    const akService = tpmAttestationService.getAkService();
    const identity = await akService.getDeviceIdentity(deviceId);

    if (!identity) {
      return res.status(404).json({
        success: false,
        error: 'No AK enrolled for device',
      });
    }

    res.json({
      success: true,
      identity: {
        id: identity.id,
        deviceId: identity.deviceId,
        akFingerprint: identity.akPublicKeyFingerprint,
        enrolledAt: identity.enrolledAt.toISOString(),
        revokedAt: identity.revokedAt?.toISOString(),
        revocationReason: identity.revocationReason,
        manufacturer: identity.manufacturer,
        model: identity.model,
      },
    });
  } catch (error) {
    console.error('Get AK status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve AK status',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * Revoke device AK
 * POST /api/attestation/devices/:deviceId/revoke
 */
router.post('/devices/:deviceId/revoke', async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.params;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: reason',
      });
    }

    const akService = tpmAttestationService.getAkService();
    const revoked = await akService.revokeAttestationKey(deviceId, reason);

    if (!revoked) {
      return res.status(404).json({
        success: false,
        error: 'No AK found to revoke',
      });
    }

    res.json({
      success: true,
      message: 'AK revoked successfully',
    });
  } catch (error) {
    console.error('AK revocation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to revoke AK',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * Get attestation statistics
 * GET /api/attestation/statistics
 */
router.get('/statistics', async (req: Request, res: Response) => {
  try {
    const stats = await tpmAttestationService.getStatistics();

    res.json({
      success: true,
      statistics: stats,
    });
  } catch (error) {
    console.error('Get statistics error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve statistics',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * Create PCR policy
 * POST /api/attestation/policies
 */
router.post('/policies', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId ?? 'default-tenant';
    
    const {
      name,
      platform,
      deviceModel,
      firmwareVersion,
      allowedMeasurements,
    } = req.body;

    if (!name || !platform || !allowedMeasurements) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: name, platform, allowedMeasurements',
      });
    }

    const policyService = tpmAttestationService.getPolicyService();
    const policy = await policyService.createPolicy({
      tenantId,
      name,
      platform,
      deviceModel,
      firmwareVersion,
      allowedMeasurements,
    });

    res.status(201).json({
      success: true,
      policy: {
        id: policy.id,
        name: policy.name,
        platform: policy.platform,
        deviceModel: policy.deviceModel,
        firmwareVersion: policy.firmwareVersion,
        status: policy.status,
        createdAt: policy.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('Create policy error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create policy',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * List PCR policies
 * GET /api/attestation/policies
 */
router.get('/policies', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId ?? 'default-tenant';
    const platform = req.query.platform as string;

    const policyService = tpmAttestationService.getPolicyService();
    const policies = await policyService.listPolicies({
      tenantId,
      platform,
      includeRevoked: false,
    });

    res.json({
      success: true,
      policies: policies.map((p) => ({
        id: p.id,
        name: p.name,
        platform: p.platform,
        deviceModel: p.deviceModel,
        firmwareVersion: p.firmwareVersion,
        status: p.status,
        createdAt: p.createdAt.toISOString(),
      })),
      count: policies.length,
    });
  } catch (error) {
    console.error('List policies error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list policies',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
