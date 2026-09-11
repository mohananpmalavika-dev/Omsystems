/**
 * Security Posture Service
 * 
 * Aggregates security evidence from collectors into trusted posture model.
 * Enforces: missing evidence ≠ healthy, missing evidence = unknown
 */

import type {
  SecurityEvidence,
  SecurityCollectionContext,
  DeviceSecurityPosture,
  SecurityPostureSummary,
  SecureBootEvidenceData,
  RansomwareProtectionEvidenceData,
  TamperProtectionEvidenceData,
  TamperConditionEvidenceData,
  SecureBootCollector,
  RansomwareCollector,
  TamperProtectionCollector,
  TamperConditionCollector,
} from '../evidence/security-evidence-types.js';

import {
  unknownEvidence,
  enforceFreshness,
  evaluateEvidenceSource,
  calculatePostureSummary,
  FRESHNESS_POLICY,
} from '../evidence/security-evidence-types.js';

/**
 * Configuration for security posture service
 */
export interface SecurityPostureConfig {
  environment: 'development' | 'test' | 'production';
  enforceStrictness: boolean;
  collectors?: {
    secureBootCollector?: SecureBootCollector;
    ransomwareCollector?: RansomwareCollector;
    tamperProtectionCollector?: TamperProtectionCollector;
    tamperConditionCollector?: TamperConditionCollector;
  };
}

/**
 * Security Posture Service
 * 
 * Responsible for:
 * - Safe collection of security evidence
 * - Freshness validation
 * - Environment-appropriate handling (simulated data rejection in prod)
 * - Evidence-to-posture aggregation
 */
export class SecurityPostureService {
  private logger: { error: (ctx: any, msg: string) => void };
  
  constructor(
    private readonly config: SecurityPostureConfig = { environment: 'development', enforceStrictness: false },
    private readonly secureBootCollector?: SecureBootCollector,
    private readonly ransomwareCollector?: RansomwareCollector,
    private readonly tamperProtectionCollector?: TamperProtectionCollector,
    private readonly tamperConditionCollector?: TamperConditionCollector,
  ) {
    this.logger = {
      error: (ctx: any, msg: string) => console.error(msg, ctx),
    };
  }

  /**
   * Get complete device security posture
   */
  async getDevicePosture(
    context: SecurityCollectionContext,
  ): Promise<DeviceSecurityPosture> {
    const [
      secureBoot,
      ransomwareProtection,
      tamperProtection,
      tamperCondition,
    ] = await Promise.all([
      this.safeCollect(
        () => this.collectSecureBoot(context),
        'secure_boot',
        FRESHNESS_POLICY.secureBoot,
      ),
      this.safeCollect(
        () => this.collectRansomware(context),
        'ransomware',
        FRESHNESS_POLICY.ransomwareProtection,
      ),
      this.safeCollect(
        () => this.collectTamperProtection(context),
        'tamper_protection',
        FRESHNESS_POLICY.tamperProtection,
      ),
      this.safeCollect(
        () => this.collectTamperCondition(context),
        'tamper_condition',
        FRESHNESS_POLICY.tamperCondition,
      ),
    ]);

    return {
      secureBoot,
      ransomwareProtection,
      tamperProtection,
      tamperCondition,
      evaluatedAt: new Date(),
    };
  }

  /**
   * Get security posture summary
   */
  async getPostureSummary(
    context: SecurityCollectionContext,
  ): Promise<SecurityPostureSummary> {
    const posture = await this.getDevicePosture(context);
    
    return calculatePostureSummary({
      secureBoot: posture.secureBoot,
      ransomwareProtection: posture.ransomwareProtection,
      tamperProtection: posture.tamperProtection,
      tamperCondition: posture.tamperCondition,
    });
  }

  /**
   * Collect secure boot evidence with safety wrapper
   */
  private async collectSecureBoot(
    context: SecurityCollectionContext,
  ): Promise<SecurityEvidence<SecureBootEvidenceData>> {
    if (!this.secureBootCollector) {
      return unknownEvidence('NOT_CONFIGURED');
    }

    return await this.secureBootCollector.collectSecureBootEvidence(context);
  }

  /**
   * Collect ransomware evidence with safety wrapper
   */
  private async collectRansomware(
    context: SecurityCollectionContext,
  ): Promise<SecurityEvidence<RansomwareProtectionEvidenceData>> {
    if (!this.ransomwareCollector) {
      return unknownEvidence('NOT_CONFIGURED');
    }

    return await this.ransomwareCollector.collectRansomwareEvidence(context);
  }

  /**
   * Collect tamper protection evidence
   */
  private async collectTamperProtection(
    context: SecurityCollectionContext,
  ): Promise<SecurityEvidence<TamperProtectionEvidenceData>> {
    if (!this.tamperProtectionCollector) {
      return unknownEvidence('NOT_CONFIGURED');
    }

    return await this.tamperProtectionCollector.collectTamperProtectionEvidence(context);
  }

  /**
   * Collect tamper condition evidence
   */
  private async collectTamperCondition(
    context: SecurityCollectionContext,
  ): Promise<SecurityEvidence<TamperConditionEvidenceData>> {
    if (!this.tamperConditionCollector) {
      return unknownEvidence('NOT_CONFIGURED');
    }

    return await this.tamperConditionCollector.collectTamperConditionEvidence(context);
  }

  /**
   * Safe collector wrapper
   * 
   * Converts any collector failure into UNKNOWN evidence.
   * Applies freshness and environment validation.
   * 
   * Core safety principle: failures are closed with respect to health.
   */
  private async safeCollect<T>(
    collector: () => Promise<SecurityEvidence<T>>,
    controlName: string,
    maxAgeMs: number,
  ): Promise<SecurityEvidence<T>> {
    try {
      let evidence = await collector();
      
      // Apply freshness policy
      evidence = enforceFreshness(evidence, maxAgeMs);
      
      // Apply environment validation (reject simulated data in production)
      evidence = evaluateEvidenceSource(evidence, this.config.environment);
      
      return evidence;
    } catch (error) {
      this.logger.error(
        {
          control: controlName,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Security evidence collection failed',
      );

      // CRITICAL: Convert all failures to UNKNOWN, never HEALTHY
      return unknownEvidence('COLLECTOR_UNAVAILABLE') as SecurityEvidence<T>;
    }
  }

  /**
   * Get collector availability status
   */
  getCollectorStatus() {
    return {
      secureBootCollector: !!this.secureBootCollector,
      ransomwareCollector: !!this.ransomwareCollector,
      tamperProtectionCollector: !!this.tamperProtectionCollector,
      tamperConditionCollector: !!this.tamperConditionCollector,
    };
  }

  private postureHistory: Array<{ tenantId?: string; overall: string; score: number; timestamp: Date }> = [];
  private securityIssues: Map<string, {
    id: string;
    tenantId?: string;
    title: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    category: string;
    status: 'open' | 'resolved';
    detectedAt: Date;
    resolvedAt?: Date;
    details?: any;
  }> = new Map();

  /**
   * Get current security posture aggregated from active evidence collectors
   */
  async getPosture(context?: SecurityCollectionContext) {
    const ctx = context || { timestamp: new Date() };
    const [summary, device] = await Promise.all([
      this.getPostureSummary(ctx),
      this.getDevicePosture(ctx),
    ]);

    const total = summary.controlCount || 1;
    const score = Math.round((summary.healthyControls / total) * 100);

    let overall: 'healthy' | 'degraded' | 'critical' | 'unknown' = 'healthy';
    if (summary.unhealthyControls > 0) {
      overall = 'critical';
    } else if (summary.unknownControls > 0) {
      overall = 'degraded';
    } else if (summary.healthyControls === 0) {
      overall = 'unknown';
    }

    // Auto-populate detected security issues
    if (device.secureBoot?.state === 'UNHEALTHY') {
      const issueId = 'issue-secure-boot-disabled';
      if (!this.securityIssues.has(issueId)) {
        this.securityIssues.set(issueId, {
          id: issueId,
          tenantId: ctx.tenantId,
          title: 'Secure Boot is disabled or compromised on managed nodes',
          severity: 'high',
          category: 'secure_boot',
          status: 'open',
          detectedAt: new Date(),
          details: device.secureBoot.evidence,
        });
      }
    }
    if (device.tamperCondition?.state === 'UNHEALTHY') {
      const issueId = 'issue-tamper-condition-detected';
      if (!this.securityIssues.has(issueId)) {
        this.securityIssues.set(issueId, {
          id: issueId,
          tenantId: ctx.tenantId,
          title: 'Physical or hardware tampering detected on camera/appliance enclosure',
          severity: 'critical',
          category: 'tamper',
          status: 'open',
          detectedAt: new Date(),
          details: device.tamperCondition.evidence,
        });
      }
    }

    const postureRecord = {
      overall,
      score,
      lastEvaluated: new Date(),
      healthyControls: summary.healthyControls,
      unhealthyControls: summary.unhealthyControls,
      unknownControls: summary.unknownControls,
      totalControls: summary.controlCount,
      evidenceCoverage: summary.evidenceCoverage,
    };

    this.postureHistory.push({
      tenantId: ctx.tenantId,
      overall,
      score,
      timestamp: new Date(),
    });

    return postureRecord;
  }

  /**
   * Calculate security posture
   */
  async calculatePosture(context?: SecurityCollectionContext) {
    return this.getPosture(context);
  }

  /**
   * Get posture history for tenant
   */
  async getPostureHistory(tenantId?: string, days: number = 30) {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return this.postureHistory.filter((item) => {
      const matchesTenant = !tenantId || !item.tenantId || item.tenantId === tenantId;
      return matchesTenant && item.timestamp >= cutoff;
    });
  }

  /**
   * List security issues
   */
  async listIssues(tenantId?: string, filters?: { status?: 'open' | 'resolved'; severity?: string }) {
    const issues = Array.from(this.securityIssues.values()).filter((issue) => {
      if (tenantId && issue.tenantId && issue.tenantId !== tenantId) return false;
      if (filters?.status && issue.status !== filters.status) return false;
      if (filters?.severity && issue.severity !== filters.severity) return false;
      return true;
    });
    return issues;
  }

  /**
   * Resolve a security issue
   */
  async resolveIssue(tenantId: string, issueId: string, resolution: any) {
    const issue = this.securityIssues.get(issueId);
    if (issue) {
      issue.status = 'resolved';
      issue.resolvedAt = new Date();
      issue.details = { ...issue.details, resolution };
      return issue;
    }

    const created = {
      id: issueId,
      tenantId,
      title: 'Resolved Security Issue',
      severity: 'medium' as const,
      category: 'general',
      status: 'resolved' as const,
      detectedAt: new Date(),
      resolvedAt: new Date(),
      details: resolution,
    };
    this.securityIssues.set(issueId, created);
    return created;
  }
}
