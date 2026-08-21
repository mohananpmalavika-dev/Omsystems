/**
 * Attestation API Routes
 * REST endpoints for TPM attestation and boot integrity verification
 */

import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { AttestationService } from '../services/attestation.service';
import { AttestationChallengeService } from '../services/attestation-challenge.service';
import { BootPolicyService } from '../services/boot-policy.service';
import {
  CreateChallengeRequest,
  SubmitQuoteRequest,
  EnrollIdentityRequest,
  PolicyStatus
} from '../types/attestation.types';

export function createAttestationRoutes(pool: Pool): Router {
  const router = Router();
  const attestationService = new AttestationService(pool, {
    mockVerifier: process.env.NODE_ENV !== 'production' && process.env.TPM_MOCK_VERIFIER === 'true',
    useTpm2Tools: process.env.TPM_USE_TPM2_TOOLS === 'true'
  });
  const challengeService = new AttestationChallengeService(pool);
  const policyService = new BootPolicyService(pool);

  /**
   * POST /api/attestation/identities/enroll
   * Enroll device attestation identity (AK public key)
   */
  router.post('/identities/enroll', async (req: Request, res: Response) => {
    try {
      const tenantId = req.user?.tenantId || req.body.tenantId;

      if (!tenantId) {
        return res.status(400).json({
          success: false,
          error: 'Tenant ID required'
        });
      }

      const enrollRequest: EnrollIdentityRequest = req.body;

      // Validate request
      if (!enrollRequest.deviceId || !enrollRequest.akPublicKeyPem) {
        return res.status(400).json({
          success: false,
          error: 'Device ID and AK public key required'
        });
      }

      const result = await attestationService.enrollIdentity(
        tenantId,
        enrollRequest
      );

      res.status(201).json({
        success: true,
        data: result
      });
    } catch (error: any) {
      console.error('Identity enrollment error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/attestation/challenges
   * Create attestation challenge for device
   */
  router.post('/challenges', async (req: Request, res: Response) => {
    try {
      const tenantId = req.user?.tenantId || req.body.tenantId;

      if (!tenantId) {
        return res.status(400).json({
          success: false,
          error: 'Tenant ID required'
        });
      }

      const challengeRequest: CreateChallengeRequest = req.body;

      if (!challengeRequest.deviceId) {
        return res.status(400).json({
          success: false,
          error: 'Device ID required'
        });
      }

      const challenge = await challengeService.createChallenge(
        tenantId,
        challengeRequest
      );

      res.status(201).json({
        success: true,
        data: challenge
      });
    } catch (error: any) {
      console.error('Challenge creation error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/attestation/verify
   * Submit TPM quote for verification
   */
  router.post('/verify', async (req: Request, res: Response) => {
    try {
      const tenantId = req.user?.tenantId || req.body.tenantId;

      if (!tenantId) {
        return res.status(400).json({
          success: false,
          error: 'Tenant ID required'
        });
      }

      const submission: SubmitQuoteRequest = req.body;

      // Validate submission
      if (
        !submission.challengeId ||
        !submission.deviceId ||
        !submission.quote ||
        !submission.signature ||
        !submission.pcrValues
      ) {
        return res.status(400).json({
          success: false,
          error: 'Complete TPM quote submission required'
        });
      }

      const result = await attestationService.verifyAttestation(
        tenantId,
        submission
      );

      const statusCode = result.status === 'VERIFIED' ? 200 : 403;

      res.status(statusCode).json({
        success: result.status === 'VERIFIED',
        data: {
          status: result.status,
          verified: result.status === 'VERIFIED',
          result
        }
      });
    } catch (error: any) {
      console.error('Attestation verification error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/attestation/status/:deviceId
   * Get attestation status for device
   */
  router.get('/status/:deviceId', async (req: Request, res: Response) => {
    try {
      const tenantId = req.user?.tenantId || req.query.tenantId as string;
      const { deviceId } = req.params;
      const maxAgeSeconds = parseInt(req.query.maxAgeSeconds as string) || 86400;

      if (!tenantId) {
        return res.status(400).json({
          success: false,
          error: 'Tenant ID required'
        });
      }

      const status = await attestationService.getDeviceAttestationStatus(
        tenantId,
        deviceId,
        maxAgeSeconds
      );

      res.json({
        success: true,
        data: {
          deviceId,
          status: status.status,
          assurance: status.assurance,
          lastAttestation: status.measuredAt
            ? {
                attestedAt: status.measuredAt.toISOString(),
                ageSeconds: Math.floor(
                  (Date.now() - status.measuredAt.getTime()) / 1000
                ),
                result: status
              }
            : undefined
        }
      });
    } catch (error: any) {
      console.error('Get attestation status error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/attestation/statistics
   * Get attestation statistics for tenant
   */
  router.get('/statistics', async (req: Request, res: Response) => {
    try {
      const tenantId = req.user?.tenantId || req.query.tenantId as string;

      if (!tenantId) {
        return res.status(400).json({
          success: false,
          error: 'Tenant ID required'
        });
      }

      const stats = await attestationService.getStatistics(tenantId);

      res.json({
        success: true,
        data: stats
      });
    } catch (error: any) {
      console.error('Get statistics error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/attestation/policies
   * Create boot attestation policy
   */
  router.post('/policies', async (req: Request, res: Response) => {
    try {
      const tenantId = req.user?.tenantId || req.body.tenantId;
      const userId = req.user?.id || req.body.userId;

      if (!tenantId || !userId) {
        return res.status(400).json({
          success: false,
          error: 'Tenant ID and User ID required'
        });
      }

      const policyData = {
        ...req.body,
        tenantId,
        createdBy: userId
      };

      const policy = await policyService.createPolicy(policyData);

      res.status(201).json({
        success: true,
        data: policy
      });
    } catch (error: any) {
      console.error('Policy creation error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/attestation/policies
   * List boot attestation policies
   */
  router.get('/policies', async (req: Request, res: Response) => {
    try {
      const tenantId = req.user?.tenantId || req.query.tenantId as string;

      if (!tenantId) {
        return res.status(400).json({
          success: false,
          error: 'Tenant ID required'
        });
      }

      const filter = {
        status: req.query.status as PolicyStatus | undefined,
        platformType: req.query.platformType as string | undefined
      };

      const policies = await policyService.listPolicies(tenantId, filter);

      res.json({
        success: true,
        data: policies
      });
    } catch (error: any) {
      console.error('List policies error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/attestation/policies/:policyId
   * Get policy by ID
   */
  router.get('/policies/:policyId', async (req: Request, res: Response) => {
    try {
      const { policyId } = req.params;

      const policy = await policyService.getPolicy(policyId);

      if (!policy) {
        return res.status(404).json({
          success: false,
          error: 'Policy not found'
        });
      }

      res.json({
        success: true,
        data: policy
      });
    } catch (error: any) {
      console.error('Get policy error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * PATCH /api/attestation/policies/:policyId/activate
   * Activate policy
   */
  router.patch('/policies/:policyId/activate', async (req: Request, res: Response) => {
    try {
      const { policyId } = req.params;

      const policy = await policyService.activate(policyId);

      if (!policy) {
        return res.status(404).json({
          success: false,
          error: 'Policy not found'
        });
      }

      res.json({
        success: true,
        data: policy
      });
    } catch (error: any) {
      console.error('Activate policy error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * PATCH /api/attestation/policies/:policyId/retire
   * Retire policy
   */
  router.patch('/policies/:policyId/retire', async (req: Request, res: Response) => {
    try {
      const { policyId } = req.params;

      const policy = await policyService.retire(policyId);

      if (!policy) {
        return res.status(404).json({
          success: false,
          error: 'Policy not found'
        });
      }

      res.json({
        success: true,
        data: policy
      });
    } catch (error: any) {
      console.error('Retire policy error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/attestation/policies/:policyId/observe
   * Start observing mode for policy
   */
  router.post('/policies/:policyId/observe', async (req: Request, res: Response) => {
    try {
      const { policyId } = req.params;

      const policy = await policyService.startObserving(policyId);

      if (!policy) {
        return res.status(404).json({
          success: false,
          error: 'Policy not found'
        });
      }

      res.json({
        success: true,
        data: policy
      });
    } catch (error: any) {
      console.error('Start observing error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/attestation/policies/:policyId/approve
   * Approve policy
   */
  router.post('/policies/:policyId/approve', async (req: Request, res: Response) => {
    try {
      const { policyId } = req.params;

      const policy = await policyService.approve(policyId);

      if (!policy) {
        return res.status(404).json({
          success: false,
          error: 'Policy not found'
        });
      }

      res.json({
        success: true,
        data: policy
      });
    } catch (error: any) {
      console.error('Approve policy error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/attestation/policies/statistics
   * Get policy statistics
   */
  router.get('/policies-statistics', async (req: Request, res: Response) => {
    try {
      const tenantId = req.user?.tenantId || req.query.tenantId as string;

      if (!tenantId) {
        return res.status(400).json({
          success: false,
          error: 'Tenant ID required'
        });
      }

      const stats = await policyService.getStatistics(tenantId);

      res.json({
        success: true,
        data: stats
      });
    } catch (error: any) {
      console.error('Get policy statistics error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  return router;
}
