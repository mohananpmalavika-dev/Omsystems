/**
 * Recording Compliance Service V2
 * 
 * Refactored compliance service using the new evidence-based architecture.
 * Properly separates evidence acquisition from policy evaluation.
 * 
 * ARCHITECTURE:
 * 1. Evidence acquisition via RecordingEvidenceService
 * 2. Policy retrieval via RetentionPolicyRepository
 * 3. Compliance evaluation via RecordingComplianceEvaluator
 * 4. Results stored via ComplianceFindingsRepository
 */

import type { Pool } from 'pg';
import { logger } from '../../utils/logger.js';
import { RecordingEvidenceService } from '../evidence/recording-evidence.service.js';
import { RecordingEvidenceRepository } from '../persistence/recording-evidence.repository.js';
import { RetentionPolicyRepository } from '../persistence/retention-policy.repository.js';
import { ComplianceFindingsRepository } from '../persistence/compliance-findings.repository.js';
import { RecordingComplianceEvaluator } from './compliance-evaluator.js';
import type {
  RecordingEvidence
} from '../evidence/recording-evidence.types.js';
import type {
  ComplianceFinding,
  ComplianceEvaluationRequest,
  ComplianceEvaluationResult,
  ComplianceSummary,
  ComplianceReportConfig
} from './compliance.types.js';

/**
 * Recording Compliance Service
 */
export class RecordingComplianceService {
  private evidenceService: RecordingEvidenceService;
  private evidenceRepository: RecordingEvidenceRepository;
  private policyRepository: RetentionPolicyRepository;
  private findingsRepository: ComplianceFindingsRepository;
  private evaluator: RecordingComplianceEvaluator;
  
  constructor(private readonly pool: Pool) {
    this.evidenceRepository = new RecordingEvidenceRepository(pool);
    this.evidenceService = new RecordingEvidenceService(
      pool,
      this.evidenceRepository
    );
    this.policyRepository = new RetentionPolicyRepository(pool);
    this.findingsRepository = new ComplianceFindingsRepository(pool);
    this.evaluator = new RecordingComplianceEvaluator();
  }
  
  /**
   * Evaluate compliance for a camera
   * 
   * Main entry point for compliance evaluation.
   * Acquires evidence, finds policy, evaluates, and stores finding.
   */
  async evaluateCamera(
    request: ComplianceEvaluationRequest
  ): Promise<ComplianceEvaluationResult> {
    const startTime = Date.now();
    
    logger.info('Evaluating camera compliance', {
      tenantId: request.tenantId,
      cameraId: request.cameraId,
      forceRefresh: request.forceRefresh
    });
    
    try {
      // Step 1: Get camera details
      const cameraResult = await this.pool.query(
        `SELECT 
          c.id::text,
          c.recorder_id::text,
          c.recorder_channel,
          rn.name as camera_name,
          r.name as recorder_name,
          r.vendor,
          r.ip_address,
          r.port,
          r.protocol,
          r.username,
          r.password_encrypted
        FROM cameras c
        JOIN resource_nodes rn ON rn.id = c.resource_node_id
        LEFT JOIN recorders r ON r.id = c.recorder_id
        WHERE c.id = $1::uuid`,
        [request.cameraId]
      );
      
      if (cameraResult.rows.length === 0) {
        throw new Error(`Camera ${request.cameraId} not found`);
      }
      
      const camera = cameraResult.rows[0];
      
      if (!camera.recorder_id) {
        throw new Error(`Camera ${request.cameraId} has no recorder configured`);
      }
      
      // Step 2: Find applicable policy
      const policy = request.policyId
        ? await this.policyRepository.getById(request.policyId)
        : await this.policyRepository.findApplicablePolicy(
            request.tenantId,
            request.cameraId
          );
      
      if (!policy) {
        throw new Error(`No applicable policy found for camera ${request.cameraId}`);
      }
      
      // Step 3: Get or acquire evidence
      let evidence: RecordingEvidence;
      let evidenceFresh = false;
      
      if (request.forceRefresh) {
        // Force fresh evidence acquisition
        const adapter = await this.createAdapter(camera);
        const device = this.createRecorderDevice(camera, request.tenantId);
        const channel = this.createRecorderChannel(camera, request.tenantId);
        
        evidence = await this.evidenceService.acquire(adapter, device, channel);
        evidenceFresh = true;
        
        await adapter.disconnect();
      } else {
        // Try to use cached evidence if fresh enough
        const maxAgeSeconds = policy.maxEvidenceAgeMinutes * 60;
        const adapter = await this.createAdapter(camera);
        const device = this.createRecorderDevice(camera, request.tenantId);
        const channel = this.createRecorderChannel(camera, request.tenantId);
        
        evidence = await this.evidenceService.getOrAcquire(
          adapter,
          device,
          channel,
          maxAgeSeconds
        );
        
        evidenceFresh = evidence.verification.verifiedAt 
          ? (Date.now() - evidence.verification.verifiedAt.getTime()) < maxAgeSeconds * 1000
          : false;
        
        await adapter.disconnect();
      }
      
      // Step 4: Evaluate compliance
      const finding = this.evaluator.evaluate(
        policy,
        evidence,
        camera.camera_name,
        camera.recorder_name
      );
      
      // Step 5: Save finding
      const savedFinding = await this.findingsRepository.save(finding);
      
      const durationMs = Date.now() - startTime;
      
      logger.info('Compliance evaluation complete', {
        cameraId: request.cameraId,
        state: savedFinding.state,
        score: savedFinding.complianceScore,
        durationMs
      });
      
      return {
        finding: savedFinding,
        evidence: request.includeEvidence ? evidence : undefined,
        policy,
        metadata: {
          durationMs,
          evidenceFresh,
          adapterType: evidence.verification.source
        }
      };
    } catch (error) {
      logger.error('Compliance evaluation failed', {
        error,
        tenantId: request.tenantId,
        cameraId: request.cameraId
      });
      throw error;
    }
  }
  
  /**
   * Get latest compliance finding for a camera
   */
  async getLatestFinding(
    tenantId: string,
    cameraId: string
  ): Promise<ComplianceFinding | null> {
    return this.findingsRepository.getLatest(tenantId, cameraId);
  }
  
  /**
   * Get compliance summary for a scope
   */
  async getSummary(
    tenantId: string,
    branchId?: string,
    policyId?: string,
    periodStart?: Date,
    periodEnd?: Date
  ): Promise<ComplianceSummary> {
    return this.findingsRepository.getSummary(
      tenantId,
      branchId,
      policyId,
      periodStart,
      periodEnd
    );
  }
  
  /**
   * Evaluate all cameras in a branch
   */
  async evaluateBranch(
    tenantId: string,
    branchId: string,
    forceRefresh: boolean = false
  ): Promise<{
    total: number;
    succeeded: number;
    failed: number;
    findings: ComplianceFinding[];
  }> {
    logger.info('Evaluating branch compliance', {
      tenantId,
      branchId,
      forceRefresh
    });
    
    // Get all cameras in branch
    const camerasResult = await this.pool.query(
      `SELECT c.id::text
      FROM cameras c
      WHERE c.branch_node_id = $1::uuid
        AND c.recording_enabled = true
        AND c.recorder_id IS NOT NULL`,
      [branchId]
    );
    
    const cameraIds = camerasResult.rows.map(r => r.id);
    const findings: ComplianceFinding[] = [];
    let succeeded = 0;
    let failed = 0;
    
    // Evaluate each camera
    for (const cameraId of cameraIds) {
      try {
        const result = await this.evaluateCamera({
          tenantId,
          cameraId,
          forceRefresh
        });
        
        findings.push(result.finding);
        succeeded++;
      } catch (error) {
        logger.error('Failed to evaluate camera in branch', {
          error,
          cameraId,
          branchId
        });
        failed++;
      }
    }
    
    logger.info('Branch evaluation complete', {
      branchId,
      total: cameraIds.length,
      succeeded,
      failed
    });
    
    return {
      total: cameraIds.length,
      succeeded,
      failed,
      findings
    };
  }
  
  /**
   * Get cameras needing evaluation
   * 
   * Returns cameras where:
   * - No finding exists, OR
   * - next_evaluation_at has passed
   */
  async getCamerasNeedingEvaluation(
    tenantId: string,
    limit: number = 100
  ): Promise<string[]> {
    const result = await this.pool.query(
      `SELECT camera_id::text
      FROM v_cameras_needing_evaluation
      WHERE tenant_id = $1::uuid
      ORDER BY next_evaluation_at
      LIMIT $2`,
      [tenantId, limit]
    );
    
    return result.rows.map(r => r.camera_id);
  }
  
  /**
   * Generate compliance report
   */
  async generateReport(
    config: ComplianceReportConfig
  ): Promise<{
    summary: ComplianceSummary;
    findings: ComplianceFinding[];
    evidence?: RecordingEvidence[];
  }> {
    logger.info('Generating compliance report', {
      type: config.type,
      scope: config.scope
    });
    
    // Get summary
    const summary = await this.findingsRepository.getSummary(
      config.scope.tenantId,
      config.scope.branchIds?.[0],
      config.scope.policyIds?.[0],
      config.period.start,
      config.period.end
    );
    
    // Get detailed findings if requested
    let findings: ComplianceFinding[] = [];
    if (config.includeDetails.violations) {
      // Get non-compliant and indeterminate findings
      const nonCompliant = await this.findingsRepository.getByState(
        config.scope.tenantId,
        'NON_COMPLIANT',
        1000
      );
      
      const indeterminate = await this.findingsRepository.getByState(
        config.scope.tenantId,
        'INDETERMINATE',
        1000
      );
      
      findings = [...nonCompliant, ...indeterminate];
    }
    
    // Get evidence if requested
    let evidence: RecordingEvidence[] | undefined;
    if (config.includeDetails.evidence && findings.length > 0) {
      const evidenceIds = findings
        .map(f => f.evidenceSnapshotId)
        .filter((id): id is string => !!id);
      
      evidence = [];
      for (const id of evidenceIds) {
        const ev = await this.evidenceRepository.getById(id);
        if (ev) evidence.push(ev);
      }
    }
    
    return {
      summary,
      findings,
      evidence
    };
  }
  
  /**
   * Get latest evidence for a camera
   */
  async getLatestEvidence(
    tenantId: string,
    cameraId: string
  ): Promise<RecordingEvidence | null> {
    return this.evidenceRepository.getLatest(tenantId, cameraId);
  }
  
  /**
   * Create recorder adapter
   */
  private async createAdapter(camera: any): Promise<any> {
    const { RecorderAdapterFactory } = await import('../../recorders/recorder-adapter.factory.js');
    
    const recorder = {
      id: camera.recorder_id,
      name: camera.recorder_name,
      vendor: camera.vendor || 'unknown',
      model: camera.model,
      ipAddress: camera.ip_address,
      port: camera.port,
      protocol: camera.protocol || 'http',
      username: camera.username,
      passwordEncrypted: camera.password_encrypted
    };
    
    const factory = new RecorderAdapterFactory(this.pool);
    return factory.create(recorder);
  }
  
  /**
   * Create recorder device entity
   */
  private createRecorderDevice(camera: any, tenantId: string): any {
    return {
      id: camera.recorder_id,
      ipAddress: camera.ip_address,
      port: camera.port,
      protocol: camera.protocol || 'http',
      vendor: camera.vendor || 'unknown',
      model: camera.model,
      credentials: {
        username: camera.username,
        password: camera.password_encrypted // Will be decrypted by adapter
      },
      tenantId
    };
  }
  
  /**
   * Create recorder channel entity
   */
  private createRecorderChannel(camera: any, tenantId: string): any {
    return {
      id: camera.id,
      channelNumber: camera.recorder_channel,
      name: camera.camera_name,
      tenantId
    };
  }
}

/**
 * Global service instance
 */
let complianceServiceInstance: RecordingComplianceService | null = null;

/**
 * Get or create compliance service singleton
 */
export function getRecordingComplianceService(pool: Pool): RecordingComplianceService {
  if (!complianceServiceInstance) {
    complianceServiceInstance = new RecordingComplianceService(pool);
  }
  return complianceServiceInstance;
}
