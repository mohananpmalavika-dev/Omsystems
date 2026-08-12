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
    private readonly config: SecurityPostureConfig,
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

  /**
   * Get current security posture (stub for dashboard compatibility)
   * TODO: Implement full posture aggregation
   */
  async getPosture() {
    return {
      overall: 'unknown',
      score: 0,
      lastEvaluated: new Date(),
    };
  }

  /**
   * Calculate security posture (stub for dashboard compatibility)
   * TODO: Implement posture calculation
   */
  async calculatePosture() {
    return this.getPosture();
  }

  /**
   * Get posture history (stub for dashboard compatibility)
   * TODO: Implement history tracking
   */
  async getPostureHistory(tenantId: string, days: number = 30) {
    return [];
  }

  /**
   * List security issues (stub for dashboard compatibility)
   * TODO: Implement issue tracking
   */
  async listIssues(tenantId: string, filters?: any) {
    return [];
  }

  /**
   * Resolve a security issue (stub for dashboard compatibility)
   * TODO: Implement issue resolution
   */
  async resolveIssue(tenantId: string, issueId: string, resolution: any) {
    return {
      id: issueId,
      resolved: true,
      resolvedAt: new Date(),
    };
  }
}
