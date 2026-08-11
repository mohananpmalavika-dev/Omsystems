/**
 * Tamper Protection and Condition Evidence Collectors
 * 
 * Monitors device tampering detection and protection status.
 * Returns structured evidence, NEVER raw booleans.
 */

import type {
  TamperProtectionCollector,
  TamperConditionCollector,
  SecurityEvidence,
  TamperProtectionEvidenceData,
  TamperConditionEvidenceData,
  SecurityCollectionContext,
} from '../evidence/security-evidence-types.js';

import {
  healthyEvidence,
  unhealthyEvidence,
  unknownEvidence,
} from '../evidence/security-evidence-types.js';

/**
 * Tamper Protection Collector
 * 
 * Verifies that tamper detection mechanisms are enabled and functioning
 */
export class TamperProtectionEvidenceCollector implements TamperProtectionCollector {
  private lastCollection: Date | null = null;
  private errorCount = 0;
  private lastError: string | null = null;

  async collect(
    context: SecurityCollectionContext,
  ): Promise<SecurityEvidence<TamperProtectionEvidenceData>> {
    return await this.collectTamperProtectionEvidence(context);
  }

  async collectTamperProtectionEvidence(
    context: SecurityCollectionContext,
  ): Promise<SecurityEvidence<TamperProtectionEvidenceData>> {
    const now = new Date();
    
    try {
      const protection = await this.checkTamperProtection(context);

      if (!protection) {
        this.lastError = 'No tamper protection sensors available';
        this.errorCount++;
        return unknownEvidence('NOT_SUPPORTED');
      }

      this.lastCollection = now;
      this.errorCount = 0;
      this.lastError = null;

      // Check if protection sensors are enabled
      const isHealthy = protection.protectionEnabled;

      if (isHealthy) {
        return healthyEvidence(protection, now, 0.9);
      }

      return unhealthyEvidence(protection, now, 0.8);

    } catch (error) {
      this.lastError = error instanceof Error ? error.message : 'Unknown error';
      this.errorCount++;
      
      return unknownEvidence('COLLECTOR_UNAVAILABLE');
    }
  }

  /**
   * Check tamper protection status
   */
  private async checkTamperProtection(
    context: SecurityCollectionContext,
  ): Promise<TamperProtectionEvidenceData | null> {
    const deviceId = context.deviceId || 'local-device';

    // Check if tamper sensors are available
    const edgeAgentApi = process.env.EDGE_AGENT_API;
    const tamperSensorApi = process.env.TAMPER_SENSOR_API;

    if (!edgeAgentApi && !tamperSensorApi) {
      // No tamper detection configured
      return null;
    }

    // TODO: Implement actual tamper sensor integration:
    // - Query edge agent for sensor status
    // - Check enclosure, motion, vibration sensors
    // - Verify last sensor reading timestamps
    
    return null;
  }

  async getHealth() {
    return {
      available: !!process.env.EDGE_AGENT_API || !!process.env.TAMPER_SENSOR_API,
      lastCollection: this.lastCollection,
      errorCount: this.errorCount,
      lastError: this.lastError,
    };
  }
}

/**
 * Tamper Condition Collector
 * 
 * Detects actual tampering events (not just protection status)
 */
export class TamperConditionEvidenceCollector implements TamperConditionCollector {
  private lastCollection: Date | null = null;
  private errorCount = 0;
  private lastError: string | null = null;

  async collect(
    context: SecurityCollectionContext,
  ): Promise<SecurityEvidence<TamperConditionEvidenceData>> {
    return await this.collectTamperConditionEvidence(context);
  }

  async collectTamperConditionEvidence(
    context: SecurityCollectionContext,
  ): Promise<SecurityEvidence<TamperConditionEvidenceData>> {
    const now = new Date();
    
    try {
      const condition = await this.checkTamperCondition(context);

      if (!condition) {
        this.lastError = 'No tamper condition data available';
        this.errorCount++;
        return unknownEvidence('NOT_SUPPORTED');
      }

      this.lastCollection = now;
      this.errorCount = 0;
      this.lastError = null;

      // Check if any tamper conditions are detected
      const tamperDetected = 
        condition.enclosureOpened === true ||
        condition.cameraMoved === true ||
        condition.lensObstructed === true ||
        condition.cableDisconnected === true ||
        condition.vibrationDetected === true;

      if (tamperDetected) {
        return unhealthyEvidence(condition, now, 0.95);
      }

      return healthyEvidence(condition, now, 0.9);

    } catch (error) {
      this.lastError = error instanceof Error ? error.message : 'Unknown error';
      this.errorCount++;
      
      return unknownEvidence('COLLECTOR_UNAVAILABLE');
    }
  }

  /**
   * Check actual tamper conditions
   */
  private async checkTamperCondition(
    context: SecurityCollectionContext,
  ): Promise<TamperConditionEvidenceData | null> {
    const deviceId = context.deviceId || 'local-device';

    // Check if tamper sensors are available
    const edgeAgentApi = process.env.EDGE_AGENT_API;
    const tamperSensorApi = process.env.TAMPER_SENSOR_API;

    if (!edgeAgentApi && !tamperSensorApi) {
      // No tamper detection configured
      return null;
    }

    // TODO: Implement actual tamper event detection:
    // - Query recent tamper events from edge agents
    // - Check sensor readings for anomalies
    // - Correlate multiple sensor triggers
    
    return null;
  }

  async getHealth() {
    return {
      available: !!process.env.EDGE_AGENT_API || !!process.env.TAMPER_SENSOR_API,
      lastCollection: this.lastCollection,
      errorCount: this.errorCount,
      lastError: this.lastError,
    };
  }
}
