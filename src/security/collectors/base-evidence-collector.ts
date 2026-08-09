/**
 * Base Evidence Collector
 * Abstract base class for all security evidence collectors
 */

import { EventEmitter } from 'events';
import {
  SecurityEvidence,
  EvidenceSource,
  EvidenceCollectorConfig,
} from '../types.js';
import { v4 as uuidv4 } from 'uuid';

export interface IEvidenceCollector {
  readonly name: string;
  readonly type: EvidenceSource;
  readonly config: EvidenceCollectorConfig;
  
  collect(): Promise<SecurityEvidence[]>;
  isHealthy(): Promise<boolean>;
  getStatus(): CollectorHealth;
}

export interface CollectorHealth {
  name: string;
  type: EvidenceSource;
  enabled: boolean;
  healthy: boolean;
  lastRun?: Date;
  lastError?: string;
  evidenceCount: number;
}

export abstract class BaseEvidenceCollector extends EventEmitter implements IEvidenceCollector {
  protected lastRunAt?: Date;
  protected lastError?: string;
  protected evidenceCache: SecurityEvidence[] = [];
  
  constructor(
    public readonly name: string,
    public readonly type: EvidenceSource,
    public readonly config: EvidenceCollectorConfig
  ) {
    super();
  }

  /**
   * Collect evidence - must be implemented by subclasses
   */
  abstract collect(): Promise<SecurityEvidence[]>;

  /**
   * Check if collector is healthy and can collect evidence
   */
  async isHealthy(): Promise<boolean> {
    try {
      // Basic health check - subclasses can override for custom checks
      return this.config.enabled && !this.lastError;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get collector status
   */
  getStatus(): CollectorHealth {
    return {
      name: this.name,
      type: this.type,
      enabled: this.config.enabled,
      healthy: !this.lastError,
      lastRun: this.lastRunAt,
      lastError: this.lastError,
      evidenceCount: this.evidenceCache.length,
    };
  }

  /**
   * Create evidence object with standard fields
   */
  protected createEvidence(
    rawData: any,
    confidence: number,
    metadata?: Record<string, any>
  ): SecurityEvidence {
    const now = new Date();
    const freshnessMs = 0; // Just collected
    
    return {
      id: uuidv4(),
      source: this.type,
      collectorType: this.name,
      collectedAt: now,
      expiresAt: this.config.maxStalenessMs
        ? new Date(now.getTime() + this.config.maxStalenessMs)
        : undefined,
      freshnessMs,
      confidence: Math.min(100, Math.max(0, confidence)),
      status: 'valid',
      rawData,
      metadata,
    };
  }

  /**
   * Update evidence freshness status
   */
  protected updateEvidenceFreshness(evidence: SecurityEvidence): SecurityEvidence {
    const now = Date.now();
    const collectedAt = new Date(evidence.collectedAt).getTime();
    const freshnessMs = now - collectedAt;

    let status: SecurityEvidence['status'] = 'valid';
    
    if (evidence.expiresAt && now > new Date(evidence.expiresAt).getTime()) {
      status = 'expired';
    } else if (this.config.maxStalenessMs && freshnessMs > this.config.maxStalenessMs) {
      status = 'stale';
    }

    return {
      ...evidence,
      freshnessMs,
      status,
    };
  }

  /**
   * Filter out stale or expired evidence
   */
  protected filterValidEvidence(evidence: SecurityEvidence[]): SecurityEvidence[] {
    return evidence
      .map(e => this.updateEvidenceFreshness(e))
      .filter(e => e.status === 'valid');
  }

  /**
   * Safe collect with error handling
   */
  async collectSafely(): Promise<SecurityEvidence[]> {
    if (!this.config.enabled) {
      return [];
    }

    try {
      this.lastRunAt = new Date();
      this.lastError = undefined;
      
      const evidence = await this.collect();
      this.evidenceCache = evidence;
      
      this.emit('evidence:collected', {
        collector: this.name,
        count: evidence.length,
      });

      return evidence;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : 'Unknown error';
      
      this.emit('evidence:error', {
        collector: this.name,
        error: this.lastError,
      });

      // Return cached evidence if available
      return this.filterValidEvidence(this.evidenceCache);
    }
  }

  /**
   * Get cached evidence (with freshness validation)
   */
  getCachedEvidence(): SecurityEvidence[] {
    return this.filterValidEvidence(this.evidenceCache);
  }

  /**
   * Clear cached evidence
   */
  clearCache(): void {
    this.evidenceCache = [];
  }
}
