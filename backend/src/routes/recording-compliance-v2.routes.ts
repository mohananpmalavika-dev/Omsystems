/**
 * Recording Compliance API Routes V2
 * 
 * Evidence-based compliance API with proper separation of concerns.
 * 
 * ENDPOINTS:
 * - Evidence acquisition
 * - Policy management
 * - Compliance evaluation
 * - Reporting and analytics
 */

import { Router, type Request, type Response } from 'express';
import type { Pool } from 'pg';
import { getRecordingComplianceService } from '../recording/compliance/recording-compliance.service.js';
import { RetentionPolicyRepository } from '../recording/persistence/retention-policy.repository.js';
import { ComplianceFindingsRepository } from '../recording/persistence/compliance-findings.repository.js';
import { RecordingEvidenceRepository } from '../recording/persistence/recording-evidence.repository.js';
import { logger } from '../utils/logger.js';

export function createRecordingComplianceV2Routes(pool: Pool): Router {
  const router = Router();
  const complianceService = getRecordingComplianceService(pool);
  const policyRepository = new RetentionPolicyRepository(pool);
  const findingsRepository = new ComplianceFindingsRepository(pool);
  const evidenceRepository = new RecordingEvidenceRepository(pool);
  
  // ============================================================================
  // COMPLIANCE EVALUATION
  // ============================================================================
  
  /**
   * POST /api/v2/compliance/evaluate
   * 
   * Evaluate compliance for a camera
   */
  router.post('/evaluate', async (req: Request, res: Response) => {
    try {
      const {
        tenantId,
        cameraId,
        policyId,
        forceRefresh = false,
        includeEvidence = false
      } = req.body;
      
      if (!tenantId || !cameraId) {
        return res.status(400).json({
          error: 'tenantId and cameraId are required'
        });
      }
      
      const result = await complianceService.evaluateCamera({
        tenantId,
        cameraId,
        policyId,
        forceRefresh,
        includeEvidence
      });
      
      return res.json(result);
    } catch (error) {
      logger.error('Failed to evaluate compliance', { error });
      return res.status(500).json({
        error: 'Failed to evaluate compliance',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  /**
   * POST /api/v2/compliance/evaluate/branch/:branchId
   * 
   * Evaluate compliance for all cameras in a branch
   */
  router.post('/evaluate/branch/:branchId', async (req: Request, res: Response) => {
    try {
      const { branchId } = req.params;
      const { tenantId, forceRefresh = false } = req.body;
      
      if (!tenantId) {
        return res.status(400).json({
          error: 'tenantId is required'
        });
      }
      
      const result = await complianceService.evaluateBranch(
        tenantId,
        branchId,
        forceRefresh
      );
      
      return res.json(result);
    } catch (error) {
      logger.error('Failed to evaluate branch compliance', { error });
      return res.status(500).json({
        error: 'Failed to evaluate branch compliance'
      });
    }
  });
  
  /**
   * GET /api/v2/compliance/camera/:cameraId/latest
   * 
   * Get latest compliance finding for a camera
   */
  router.get('/camera/:cameraId/latest', async (req: Request, res: Response) => {
    try {
      const { cameraId } = req.params;
      const { tenantId } = req.query;
      
      if (!tenantId) {
        return res.status(400).json({
          error: 'tenantId query parameter required'
        });
      }
      
      const finding = await complianceService.getLatestFinding(
        tenantId as string,
        cameraId
      );
      
      if (!finding) {
        return res.status(404).json({
          error: 'No compliance finding found for this camera'
        });
      }
      
      return res.json(finding);
    } catch (error) {
      logger.error('Failed to get latest finding', { error });
      return res.status(500).json({
        error: 'Failed to get latest finding'
      });
    }
  });
  
  /**
   * GET /api/v2/compliance/summary
   * 
   * Get compliance summary for a scope
   */
  router.get('/summary', async (req: Request, res: Response) => {
    try {
      const {
        tenantId,
        branchId,
        policyId,
        periodStart,
        periodEnd
      } = req.query;
      
      if (!tenantId) {
        return res.status(400).json({
          error: 'tenantId query parameter required'
        });
      }
      
      const summary = await complianceService.getSummary(
        tenantId as string,
        branchId as string | undefined,
        policyId as string | undefined,
        periodStart ? new Date(periodStart as string) : undefined,
        periodEnd ? new Date(periodEnd as string) : undefined
      );
      
      return res.json(summary);
    } catch (error) {
      logger.error('Failed to get compliance summary', { error });
      return res.status(500).json({
        error: 'Failed to get compliance summary'
      });
    }
  });
  
  /**
   * GET /api/v2/compliance/needing-evaluation
   * 
   * Get cameras that need compliance evaluation
   */
  router.get('/needing-evaluation', async (req: Request, res: Response) => {
    try {
      const { tenantId, limit = 100 } = req.query;
      
      if (!tenantId) {
        return res.status(400).json({
          error: 'tenantId query parameter required'
        });
      }
      
      const cameraIds = await complianceService.getCamerasNeedingEvaluation(
        tenantId as string,
        parseInt(limit as string)
      );
      
      return res.json({ cameraIds });
    } catch (error) {
      logger.error('Failed to get cameras needing evaluation', { error });
      return res.status(500).json({
        error: 'Failed to get cameras needing evaluation'
      });
    }
  });
  
  // ============================================================================
  // EVIDENCE
  // ============================================================================
  
  /**
   * GET /api/v2/evidence/camera/:cameraId/latest
   * 
   * Get latest evidence snapshot for a camera
   */
  router.get('/evidence/camera/:cameraId/latest', async (req: Request, res: Response) => {
    try {
      const { cameraId } = req.params;
      const { tenantId } = req.query;
      
      if (!tenantId) {
        return res.status(400).json({
          error: 'tenantId query parameter required'
        });
      }
      
      const evidence = await complianceService.getLatestEvidence(
        tenantId as string,
        cameraId
      );
      
      if (!evidence) {
        return res.status(404).json({
          error: 'No evidence found for this camera'
        });
      }
      
      return res.json(evidence);
    } catch (error) {
      logger.error('Failed to get latest evidence', { error });
      return res.status(500).json({
        error: 'Failed to get latest evidence'
      });
    }
  });
  
  /**
   * GET /api/v2/evidence/:evidenceId
   * 
   * Get evidence by ID
   */
  router.get('/evidence/:evidenceId', async (req: Request, res: Response) => {
    try {
      const { evidenceId } = req.params;
      
      const evidence = await evidenceRepository.getById(evidenceId);
      
      if (!evidence) {
        return res.status(404).json({
          error: 'Evidence not found'
        });
      }
      
      return res.json(evidence);
    } catch (error) {
      logger.error('Failed to get evidence', { error });
      return res.status(500).json({
        error: 'Failed to get evidence'
      });
    }
  });
  
  /**
   * GET /api/v2/evidence/coverage/daily
   * 
   * Get daily coverage summaries
   */
  router.get('/evidence/coverage/daily', async (req: Request, res: Response) => {
    try {
      const { tenantId, cameraId, from, to } = req.query;
      
      if (!tenantId || !cameraId || !from || !to) {
        return res.status(400).json({
          error: 'tenantId, cameraId, from, and to query parameters required'
        });
      }
      
      const summaries = await evidenceRepository.getDailyCoverage(
        tenantId as string,
        cameraId as string,
        new Date(from as string),
        new Date(to as string)
      );
      
      return res.json(summaries);
    } catch (error) {
      logger.error('Failed to get daily coverage', { error });
      return res.status(500).json({
        error: 'Failed to get daily coverage'
      });
    }
  });
  
  // ============================================================================
  // POLICY MANAGEMENT
  // ============================================================================
  
  /**
   * POST /api/v2/policy
   * 
   * Create retention policy
   */
  router.post('/policy', async (req: Request, res: Response) => {
    try {
      const policy = await policyRepository.create(req.body);
      return res.status(201).json(policy);
    } catch (error) {
      logger.error('Failed to create policy', { error });
      return res.status(500).json({
        error: 'Failed to create policy'
      });
    }
  });
  
  /**
   * PUT /api/v2/policy/:policyId
   * 
   * Update retention policy (creates new version)
   */
  router.put('/policy/:policyId', async (req: Request, res: Response) => {
    try {
      const { policyId } = req.params;
      const { updates, updatedBy } = req.body;
      
      if (!updatedBy) {
        return res.status(400).json({
          error: 'updatedBy is required'
        });
      }
      
      const policy = await policyRepository.update(
        policyId,
        updates,
        updatedBy
      );
      
      return res.json(policy);
    } catch (error) {
      logger.error('Failed to update policy', { error });
      return res.status(500).json({
        error: 'Failed to update policy'
      });
    }
  });
  
  /**
   * GET /api/v2/policy/:policyId
   * 
   * Get policy by ID
   */
  router.get('/policy/:policyId', async (req: Request, res: Response) => {
    try {
      const { policyId } = req.params;
      
      const policy = await policyRepository.getById(policyId);
      
      if (!policy) {
        return res.status(404).json({
          error: 'Policy not found'
        });
      }
      
      return res.json(policy);
    } catch (error) {
      logger.error('Failed to get policy', { error });
      return res.status(500).json({
        error: 'Failed to get policy'
      });
    }
  });
  
  /**
   * GET /api/v2/policy
   * 
   * Get all policies for a tenant
   */
  router.get('/policy', async (req: Request, res: Response) => {
    try {
      const { tenantId } = req.query;
      
      if (!tenantId) {
        return res.status(400).json({
          error: 'tenantId query parameter required'
        });
      }
      
      const policies = await policyRepository.getByTenant(tenantId as string);
      
      return res.json(policies);
    } catch (error) {
      logger.error('Failed to get policies', { error });
      return res.status(500).json({
        error: 'Failed to get policies'
      });
    }
  });
  
  /**
   * GET /api/v2/policy/:policyId/history
   * 
   * Get policy version history
   */
  router.get('/policy/:policyId/history', async (req: Request, res: Response) => {
    try {
      const { policyId } = req.params;
      
      const history = await policyRepository.getHistory(policyId);
      
      return res.json(history);
    } catch (error) {
      logger.error('Failed to get policy history', { error });
      return res.status(500).json({
        error: 'Failed to get policy history'
      });
    }
  });
  
  /**
   * GET /api/v2/policy/:policyId/changes
   * 
   * Get policy change records
   */
  router.get('/policy/:policyId/changes', async (req: Request, res: Response) => {
    try {
      const { policyId } = req.params;
      
      const changes = await policyRepository.getChangeRecords(policyId);
      
      return res.json(changes);
    } catch (error) {
      logger.error('Failed to get policy changes', { error });
      return res.status(500).json({
        error: 'Failed to get policy changes'
      });
    }
  });
  
  /**
   * DELETE /api/v2/policy/:policyId
   * 
   * Delete policy
   */
  router.delete('/policy/:policyId', async (req: Request, res: Response) => {
    try {
      const { policyId } = req.params;
      
      await policyRepository.delete(policyId);
      
      return res.status(204).send();
    } catch (error) {
      logger.error('Failed to delete policy', { error });
      return res.status(500).json({
        error: 'Failed to delete policy'
      });
    }
  });
  
  // ============================================================================
  // REPORTING
  // ============================================================================
  
  /**
   * POST /api/v2/compliance/report
   * 
   * Generate compliance report
   */
  router.post('/report', async (req: Request, res: Response) => {
    try {
      const config = req.body;
      
      const report = await complianceService.generateReport(config);
      
      return res.json(report);
    } catch (error) {
      logger.error('Failed to generate report', { error });
      return res.status(500).json({
        error: 'Failed to generate report'
      });
    }
  });
  
  /**
   * GET /api/v2/compliance/findings/:findingId
   * 
   * Get finding by ID
   */
  router.get('/findings/:findingId', async (req: Request, res: Response) => {
    try {
      const { findingId } = req.params;
      
      const finding = await findingsRepository.getById(findingId);
      
      if (!finding) {
        return res.status(404).json({
          error: 'Finding not found'
        });
      }
      
      return res.json(finding);
    } catch (error) {
      logger.error('Failed to get finding', { error });
      return res.status(500).json({
        error: 'Failed to get finding'
      });
    }
  });
  
  /**
   * GET /api/v2/compliance/findings/:findingId/audit
   * 
   * Get audit records for a finding
   */
  router.get('/findings/:findingId/audit', async (req: Request, res: Response) => {
    try {
      const { findingId } = req.params;
      
      const records = await findingsRepository.getAuditRecords(findingId);
      
      return res.json(records);
    } catch (error) {
      logger.error('Failed to get audit records', { error });
      return res.status(500).json({
        error: 'Failed to get audit records'
      });
    }
  });
  
  return router;
}
