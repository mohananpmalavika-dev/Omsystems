/**
 * Ransomware Protection Evidence Collector
 * 
 * Monitors ransomware protection status (agent, definitions, monitoring).
 * Returns structured evidence, NEVER raw booleans.
 */

import type {
  RansomwareCollector,
  SecurityEvidence,
  RansomwareProtectionEvidenceData,
  SecurityCollectionContext,
} from '../evidence/security-evidence-types.js';

import {
  healthyEvidence,
  unhealthyEvidence,
  unknownEvidence,
} from '../evidence/security-evidence-types.js';

/**
 * Ransomware Protection Collector
 * 
 * Checks:
 * - EDR/antivirus agent installed and running
 * - Threat definitions up to date
 * - Behavioral monitoring enabled
 * - Recent scan activity
 * - Active threats
 */
export class RansomwareEvidenceCollector implements RansomwareCollector {
  private lastCollection: Date | null = null;
  private errorCount = 0;
  private lastError: string | null = null;

  async collect(
    context: SecurityCollectionContext,
  ): Promise<SecurityEvidence<RansomwareProtectionEvidenceData>> {
    return await this.collectRansomwareEvidence(context);
  }

  async collectRansomwareEvidence(
    context: SecurityCollectionContext,
  ): Promise<SecurityEvidence<RansomwareProtectionEvidenceData>> {
    const now = new Date();
    
    try {
      const protection = await this.checkRansomwareProtection(context);

      if (!protection) {
        this.lastError = 'No ransomware protection agent found';
        this.errorCount++;
        return unknownEvidence('NOT_CONFIGURED');
      }

      this.lastCollection = now;
      this.errorCount = 0;
      this.lastError = null;

      // Check if protection is properly configured and running
      const isHealthy = 
        protection.agentInstalled &&
        protection.agentConnected &&
        protection.definitionsCurrent &&
        protection.behaviorMonitoringEnabled &&
        protection.activeThreatCount === 0;

      if (isHealthy) {
        return healthyEvidence(protection, now, 0.95);
      }

      // Active threats or protection gaps
      return unhealthyEvidence(protection, now, 0.9);

    } catch (error) {
      this.lastError = error instanceof Error ? error.message : 'Unknown error';
      this.errorCount++;
      
      return unknownEvidence('COLLECTOR_UNAVAILABLE');
    }
  }

  /**
   * Check ransomware protection status
   */
  private async checkRansomwareProtection(
    context: SecurityCollectionContext,
  ): Promise<RansomwareProtectionEvidenceData | null> {
    // Check if EDR/antivirus integration is configured
    const edrApiEndpoint = process.env.EDR_API_ENDPOINT;
    const threatDetectionApi = process.env.THREAT_DETECTION_API;

    if (!edrApiEndpoint && !threatDetectionApi) {
      // No integration configured
      return null;
    }

    // In real implementation, would query EDR API
    // For now, return placeholder indicating not configured
    // This ensures we return UNKNOWN, not fake HEALTHY
    
    // TODO: Implement actual EDR integration:
    // - Query agent status from EDR console API
    // - Check definition version and age
    // - Verify behavioral monitoring is active
    // - Query for active threats
    
    return null;
  }

  async getHealth() {
    return {
      available: !!process.env.EDR_API_ENDPOINT || !!process.env.THREAT_DETECTION_API,
      lastCollection: this.lastCollection,
      errorCount: this.errorCount,
      lastError: this.lastError,
    };
  }
}
