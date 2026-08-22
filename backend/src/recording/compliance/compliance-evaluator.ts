/**
 * Recording Compliance Evaluator
 * 
 * Pure policy evaluation logic. Receives evidence and policy,
 * returns compliance finding. Never manufactures evidence.
 * 
 * CRITICAL PRINCIPLES:
 * 1. UNKNOWN evidence → INDETERMINATE compliance
 * 2. Four-state outcomes: COMPLIANT, NON_COMPLIANT, INDETERMINATE, NOT_APPLICABLE
 * 3. Three-valued logic for requirement composition
 * 4. Evidence quality thresholds must be met
 * 5. Stale evidence → INDETERMINATE
 */

import type {
  RecordingEvidence,
  EvidenceFreshness
} from '../evidence/recording-evidence.types.js';
import type {
  RecordingRetentionPolicy,
  ComplianceState,
  ComplianceFinding,
  ComplianceViolation,
  ViolationCode,
  ComplianceRequirements,
  ObservedValues
} from './compliance.types.js';
import { logger } from '../../utils/logger.js';

/**
 * Recording Compliance Evaluator
 */
export class RecordingComplianceEvaluator {
  /**
   * Evaluate evidence against policy
   * 
   * This is a pure function - same evidence + policy always returns same finding.
   */
  evaluate(
    policy: RecordingRetentionPolicy,
    evidence: RecordingEvidence,
    cameraName?: string,
    recorderName?: string,
    now: Date = new Date()
  ): ComplianceFinding {
    logger.debug('Evaluating compliance', {
      policyId: policy.id,
      cameraId: evidence.channelId,
      evidenceStatus: evidence.verification.status
    });
    
    const violations: ComplianceViolation[] = [];
    
    // Step 1: Check if evidence is available
    if (evidence.verification.status !== 'VERIFIED') {
      return this.createIndeterminateFinding({
        policy,
        evidence,
        cameraName,
        recorderName,
        reason: evidence.reason ? `Evidence unavailable: ${evidence.reason}` : 'Evidence unavailable',
        reasonCode: 'EVIDENCE_UNAVAILABLE',
        violations: [{
          code: 'EVIDENCE_UNAVAILABLE',
          message: `Cannot verify compliance: ${evidence.reason || 'unknown reason'}`,
          severity: 'HIGH',
          evidenceReason: evidence.reason
        }],
        now
      });
    }
    
    // Step 2: Check evidence freshness
    const evidenceAgeMs = now.getTime() - (evidence.verification.verifiedAt?.getTime() || 0);
    const maxEvidenceAgeMs = policy.maxEvidenceAgeMinutes * 60 * 1000;
    
    if (evidenceAgeMs > maxEvidenceAgeMs) {
      return this.createIndeterminateFinding({
        policy,
        evidence,
        cameraName,
        recorderName,
        reason: 'Evidence is stale',
        reasonCode: 'EVIDENCE_STALE',
        violations: [{
          code: 'EVIDENCE_STALE',
          message: `Evidence is ${Math.round(evidenceAgeMs / 60000)} minutes old (max: ${policy.maxEvidenceAgeMinutes} minutes)`,
          severity: 'MEDIUM',
          required: policy.maxEvidenceAgeMinutes,
          observed: Math.round(evidenceAgeMs / 60000)
        }],
        now
      });
    }
    
    // Step 3: Check evidence confidence
    if (evidence.verification.confidence < policy.minimumEvidenceConfidence) {
      return this.createIndeterminateFinding({
        policy,
        evidence,
        cameraName,
        recorderName,
        reason: 'Evidence confidence too low',
        reasonCode: 'INSUFFICIENT_EVIDENCE_CONFIDENCE',
        violations: [{
          code: 'INSUFFICIENT_EVIDENCE_CONFIDENCE',
          message: `Evidence confidence ${evidence.verification.confidence.toFixed(2)} below requirement ${policy.minimumEvidenceConfidence.toFixed(2)}`,
          severity: 'MEDIUM',
          required: policy.minimumEvidenceConfidence,
          observed: evidence.verification.confidence
        }],
        now
      });
    }
    
    // Step 4: Check recording state
    if (evidence.recordingState === 'UNKNOWN') {
      violations.push({
        code: 'RECORDING_DISABLED',
        message: 'Recording state unknown',
        severity: 'HIGH'
      });
      
      return this.createIndeterminateFinding({
        policy,
        evidence,
        cameraName,
        recorderName,
        reason: 'Recording state unknown',
        reasonCode: 'RECORDING_DISABLED',
        violations,
        now
      });
    }
    
    if (evidence.recordingState === 'NOT_RECORDING') {
      violations.push({
        code: 'RECORDING_DISABLED',
        message: 'Recording is currently stopped or disabled',
        severity: 'CRITICAL',
        required: 'RECORDING',
        observed: 'NOT_RECORDING'
      });
      
      return this.createNonCompliantFinding({
        policy,
        evidence,
        cameraName,
        recorderName,
        reason: 'Recording is disabled',
        reasonCode: 'RECORDING_DISABLED',
        violations,
        now
      });
    }
    
    // Step 5: Check retention requirement
    if (!evidence.oldestRecordingAt) {
      violations.push({
        code: 'RETENTION_RANGE_UNAVAILABLE',
        message: 'Cannot determine retention duration - no archive found',
        severity: 'HIGH'
      });
      
      return this.createIndeterminateFinding({
        policy,
        evidence,
        cameraName,
        recorderName,
        reason: 'Retention range unavailable',
        reasonCode: 'RETENTION_RANGE_UNAVAILABLE',
        violations,
        now
      });
    }
    
    const retentionMs = now.getTime() - evidence.oldestRecordingAt.getTime();
    const retentionDays = retentionMs / 86400000;
    const requiredMs = policy.requiredRetentionDays * 86400000;
    
    if (retentionMs < requiredMs) {
      const gapDays = policy.requiredRetentionDays - retentionDays;
      
      violations.push({
        code: 'INSUFFICIENT_RETENTION',
        message: `Retention is ${retentionDays.toFixed(1)} days, requirement is ${policy.requiredRetentionDays} days`,
        severity: 'CRITICAL',
        required: policy.requiredRetentionDays,
        observed: Math.round(retentionDays * 10) / 10,
        gap: Math.round(gapDays * 10) / 10
      });
      
      return this.createNonCompliantFinding({
        policy,
        evidence,
        cameraName,
        recorderName,
        reason: `Insufficient retention: ${retentionDays.toFixed(1)} of ${policy.requiredRetentionDays} days required`,
        reasonCode: 'INSUFFICIENT_RETENTION',
        violations,
        now
      });
    }
    
    // Step 6: Check recording coverage (if available and required)
    if (policy.minimumCoverageRatio && evidence.coverage) {
      if (evidence.coverage.coverageRatio !== null) {
        if (evidence.coverage.coverageRatio < policy.minimumCoverageRatio) {
          violations.push({
            code: 'INSUFFICIENT_COVERAGE',
            message: `Coverage ${(evidence.coverage.coverageRatio * 100).toFixed(2)}% below requirement ${(policy.minimumCoverageRatio * 100).toFixed(2)}%`,
            severity: 'HIGH',
            required: policy.minimumCoverageRatio * 100,
            observed: Math.round(evidence.coverage.coverageRatio * 10000) / 100
          });
        }
      }
      
      // Check max gap requirement
      if (evidence.coverage.longestGapSeconds) {
        const longestGapMinutes = evidence.coverage.longestGapSeconds / 60;
        
        if (longestGapMinutes > policy.maxRecordingGapMinutes) {
          violations.push({
            code: 'RECORDING_GAP_EXCEEDED',
            message: `Largest gap ${longestGapMinutes.toFixed(1)} minutes exceeds limit ${policy.maxRecordingGapMinutes} minutes`,
            severity: 'HIGH',
            required: policy.maxRecordingGapMinutes,
            observed: Math.round(longestGapMinutes * 10) / 10
          });
        }
      }
    }
    
    // Step 7: Check clock drift (if available)
    if (policy.maxClockDriftSeconds && evidence.checks.clockSynchronization.driftSeconds) {
      if (Math.abs(evidence.checks.clockSynchronization.driftSeconds) > policy.maxClockDriftSeconds) {
        violations.push({
          code: 'CLOCK_SKEW_EXCESSIVE',
          message: `Clock drift ${evidence.checks.clockSynchronization.driftSeconds}s exceeds limit ${policy.maxClockDriftSeconds}s`,
          severity: 'MEDIUM',
          required: policy.maxClockDriftSeconds,
          observed: Math.abs(evidence.checks.clockSynchronization.driftSeconds)
        });
      }
    }
    
    // Step 8: Check storage health
    if (evidence.storage.status === 'FULL') {
      violations.push({
        code: 'STORAGE_CRITICAL',
        message: 'Storage is full - recording may stop',
        severity: 'CRITICAL'
      });
    } else if (evidence.storage.status === 'DEGRADED') {
      violations.push({
        code: 'STORAGE_CRITICAL',
        message: 'Storage is degraded',
        severity: 'HIGH'
      });
    }
    
    // Step 9: Determine final compliance state
    if (violations.length === 0) {
      return this.createCompliantFinding({
        policy,
        evidence,
        cameraName,
        recorderName,
        now
      });
    }
    
    // Check if violations are critical
    const hasCriticalViolations = violations.some(v => 
      v.severity === 'CRITICAL' && 
      (v.code === 'RECORDING_DISABLED' || 
       v.code === 'INSUFFICIENT_RETENTION' ||
       v.code === 'STORAGE_CRITICAL')
    );
    
    if (hasCriticalViolations) {
      return this.createNonCompliantFinding({
        policy,
        evidence,
        cameraName,
        recorderName,
        reason: violations[0].message,
        reasonCode: violations[0].code,
        violations,
        now
      });
    }
    
    // Non-critical violations - still compliant but degraded
    // Based on enforcement level
    if (policy.enforcementLevel === 'STRICT') {
      return this.createNonCompliantFinding({
        policy,
        evidence,
        cameraName,
        recorderName,
        reason: `${violations.length} policy violations detected`,
        reasonCode: violations[0].code,
        violations,
        now
      });
    }
    
    // Lenient or standard enforcement - consider compliant with warnings
    return this.createCompliantFinding({
      policy,
      evidence,
      cameraName,
      recorderName,
      violations, // Include warnings
      now
    });
  }
  
  /**
   * Create COMPLIANT finding
   */
  private createCompliantFinding(params: {
    policy: RecordingRetentionPolicy;
    evidence: RecordingEvidence;
    cameraName?: string;
    recorderName?: string;
    violations?: ComplianceViolation[];
    now: Date;
  }): ComplianceFinding {
    const retentionDays = params.evidence.oldestRecordingAt
      ? (params.now.getTime() - params.evidence.oldestRecordingAt.getTime()) / 86400000
      : undefined;
    
    const evidenceAgeSeconds = params.evidence.verification.verifiedAt
      ? (params.now.getTime() - params.evidence.verification.verifiedAt.getTime()) / 1000
      : undefined;
    
    return {
      tenantId: params.policy.tenantId,
      policyId: params.policy.id,
      policyVersion: params.policy.version,
      policyName: params.policy.name,
      cameraId: params.evidence.channelId,
      cameraName: params.cameraName,
      recorderId: params.evidence.recorderId,
      recorderName: params.recorderName,
      state: 'COMPLIANT',
      reason: params.violations && params.violations.length > 0
        ? `Compliant with ${params.violations.length} warnings`
        : 'All requirements satisfied',
      evaluatedAt: params.now,
      evidenceSnapshotId: params.evidence.id,
      evidenceStatus: params.evidence.verification.status,
      evidenceVerifiedAt: params.evidence.verification.verifiedAt,
      evidenceAgeSeconds,
      requirements: this.extractRequirements(params.policy),
      observed: this.extractObserved(params.evidence, params.now),
      violations: params.violations || [],
      complianceScore: this.calculateScore(params.evidence, params.policy, params.violations || []),
      nextEvaluationAt: this.calculateNextEvaluation(params.policy, params.now)
    };
  }
  
  /**
   * Create NON_COMPLIANT finding
   */
  private createNonCompliantFinding(params: {
    policy: RecordingRetentionPolicy;
    evidence: RecordingEvidence;
    cameraName?: string;
    recorderName?: string;
    reason: string;
    reasonCode: ViolationCode;
    violations: ComplianceViolation[];
    now: Date;
  }): ComplianceFinding {
    const retentionDays = params.evidence.oldestRecordingAt
      ? (params.now.getTime() - params.evidence.oldestRecordingAt.getTime()) / 86400000
      : undefined;
    
    const evidenceAgeSeconds = params.evidence.verification.verifiedAt
      ? (params.now.getTime() - params.evidence.verification.verifiedAt.getTime()) / 1000
      : undefined;
    
    return {
      tenantId: params.policy.tenantId,
      policyId: params.policy.id,
      policyVersion: params.policy.version,
      policyName: params.policy.name,
      cameraId: params.evidence.channelId,
      cameraName: params.cameraName,
      recorderId: params.evidence.recorderId,
      recorderName: params.recorderName,
      state: 'NON_COMPLIANT',
      reason: params.reason,
      reasonCode: params.reasonCode,
      evaluatedAt: params.now,
      evidenceSnapshotId: params.evidence.id,
      evidenceStatus: params.evidence.verification.status,
      evidenceVerifiedAt: params.evidence.verification.verifiedAt,
      evidenceAgeSeconds,
      requirements: this.extractRequirements(params.policy),
      observed: this.extractObserved(params.evidence, params.now),
      violations: params.violations,
      complianceScore: this.calculateScore(params.evidence, params.policy, params.violations),
      nextEvaluationAt: this.calculateNextEvaluation(params.policy, params.now)
    };
  }
  
  /**
   * Create INDETERMINATE finding
   */
  private createIndeterminateFinding(params: {
    policy: RecordingRetentionPolicy;
    evidence: RecordingEvidence;
    cameraName?: string;
    recorderName?: string;
    reason: string;
    reasonCode: ViolationCode;
    violations: ComplianceViolation[];
    now: Date;
  }): ComplianceFinding {
    const evidenceAgeSeconds = params.evidence.verification.verifiedAt
      ? (params.now.getTime() - params.evidence.verification.verifiedAt.getTime()) / 1000
      : undefined;
    
    return {
      tenantId: params.policy.tenantId,
      policyId: params.policy.id,
      policyVersion: params.policy.version,
      policyName: params.policy.name,
      cameraId: params.evidence.channelId,
      cameraName: params.cameraName,
      recorderId: params.evidence.recorderId,
      recorderName: params.recorderName,
      state: 'INDETERMINATE',
      reason: params.reason,
      reasonCode: params.reasonCode,
      evaluatedAt: params.now,
      evidenceSnapshotId: params.evidence.id,
      evidenceStatus: params.evidence.verification.status,
      evidenceVerifiedAt: params.evidence.verification.verifiedAt,
      evidenceAgeSeconds,
      requirements: this.extractRequirements(params.policy),
      observed: this.extractObserved(params.evidence, params.now),
      violations: params.violations,
      complianceScore: 0,
      nextEvaluationAt: this.calculateNextEvaluation(params.policy, params.now)
    };
  }
  
  /**
   * Extract requirements from policy
   */
  private extractRequirements(policy: RecordingRetentionPolicy): ComplianceRequirements {
    return {
      retentionDays: policy.requiredRetentionDays,
      minimumCoverage: policy.minimumCoverageRatio || 1.0,
      maximumGapMinutes: policy.maxRecordingGapMinutes,
      continuousRequired: policy.requireContinuousRecording,
      maxEvidenceAgeMinutes: policy.maxEvidenceAgeMinutes,
      minimumConfidence: policy.minimumEvidenceConfidence
    };
  }
  
  /**
   * Extract observed values from evidence
   */
  private extractObserved(evidence: RecordingEvidence, now: Date): ObservedValues {
    const retentionDays = evidence.oldestRecordingAt
      ? (now.getTime() - evidence.oldestRecordingAt.getTime()) / 86400000
      : undefined;
    
    const evidenceAgeMinutes = evidence.verification.verifiedAt
      ? (now.getTime() - evidence.verification.verifiedAt.getTime()) / 60000
      : undefined;
    
    const largestGapMinutes = evidence.coverage?.longestGapSeconds
      ? evidence.coverage.longestGapSeconds / 60
      : undefined;
    
    return {
      retentionDays: retentionDays ? Math.round(retentionDays * 10) / 10 : undefined,
      coverage: evidence.coverage?.coverageRatio
        ? Math.round(evidence.coverage.coverageRatio * 10000) / 100
        : undefined,
      largestGapMinutes: largestGapMinutes
        ? Math.round(largestGapMinutes * 10) / 10
        : undefined,
      evidenceAgeMinutes: evidenceAgeMinutes
        ? Math.round(evidenceAgeMinutes * 10) / 10
        : undefined,
      evidenceConfidence: Math.round(evidence.verification.confidence * 100) / 100,
      recordingState: evidence.recordingState,
      clockDriftSeconds: evidence.checks.clockSynchronization.driftSeconds
    };
  }
  
  /**
   * Calculate compliance score (0-100)
   */
  private calculateScore(
    evidence: RecordingEvidence,
    policy: RecordingRetentionPolicy,
    violations: ComplianceViolation[]
  ): number {
    let score = 100;
    
    // Deduct points for violations
    for (const violation of violations) {
      switch (violation.severity) {
        case 'CRITICAL':
          score -= 30;
          break;
        case 'HIGH':
          score -= 15;
          break;
        case 'MEDIUM':
          score -= 5;
          break;
        case 'LOW':
          score -= 2;
          break;
      }
    }
    
    return Math.max(0, Math.min(100, score));
  }
  
  /**
   * Calculate next evaluation time
   */
  private calculateNextEvaluation(
    policy: RecordingRetentionPolicy,
    now: Date
  ): Date {
    // Schedule next evaluation based on evidence TTL
    const ttlMs = policy.maxEvidenceAgeMinutes * 60 * 1000;
    return new Date(now.getTime() + ttlMs);
  }
}
