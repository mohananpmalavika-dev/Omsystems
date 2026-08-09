/**
 * Evidence Collector Registry
 * Manages all security evidence collectors
 */

import { EventEmitter } from 'events';
import { IEvidenceCollector, CollectorHealth } from './base-evidence-collector.js';
import { SecurityEvidence, EvidenceCollectorConfig, CollectorStatus } from '../types.js';
import { CertificateCollector } from './certificate-collector.js';
import { PasswordRotationCollector } from './password-rotation-collector.js';
import { MFAComplianceCollector } from './mfa-compliance-collector.js';

export class CollectorRegistry extends EventEmitter {
  private collectors: Map<string, IEvidenceCollector> = new Map();
  private collectionInterval?: NodeJS.Timeout;
  private isRunning: boolean = false;

  constructor() {
    super();
  }

  /**
   * Register a collector
   */
  register(collector: IEvidenceCollector): void {
    this.collectors.set(collector.type, collector);
    
    // Forward collector events
    collector.on('evidence:collected', (data) => {
      this.emit('evidence:collected', data);
    });
    
    collector.on('evidence:error', (data) => {
      this.emit('evidence:error', data);
    });
  }

  /**
   * Initialize default collectors
   */
  initializeDefaultCollectors(config: {
    certificate?: EvidenceCollectorConfig;
    passwordRotation?: EvidenceCollectorConfig;
    mfaCompliance?: EvidenceCollectorConfig;
  } = {}): void {
    // Default config
    const defaultConfig: EvidenceCollectorConfig = {
      enabled: true,
      intervalMs: 5 * 60 * 1000, // 5 minutes
      timeoutMs: 30 * 1000, // 30 seconds
      maxStalenessMs: 10 * 60 * 1000, // 10 minutes
    };

    // Register certificate collector
    if (config.certificate?.enabled !== false) {
      this.register(new CertificateCollector({
        ...defaultConfig,
        ...config.certificate,
      }));
    }

    // Register password rotation collector
    if (config.passwordRotation?.enabled !== false) {
      this.register(new PasswordRotationCollector({
        ...defaultConfig,
        ...config.passwordRotation,
      }));
    }

    // Register MFA compliance collector
    if (config.mfaCompliance?.enabled !== false) {
      this.register(new MFAComplianceCollector({
        ...defaultConfig,
        ...config.mfaCompliance,
      }));
    }
  }

  /**
   * Get collector by type
   */
  getCollector(type: string): IEvidenceCollector | undefined {
    return this.collectors.get(type);
  }

  /**
   * Get all collectors
   */
  getAllCollectors(): IEvidenceCollector[] {
    return Array.from(this.collectors.values());
  }

  /**
   * Collect evidence from all enabled collectors
   */
  async collectAll(): Promise<Map<string, SecurityEvidence[]>> {
    const results = new Map<string, SecurityEvidence[]>();

    await Promise.all(
      Array.from(this.collectors.values()).map(async (collector) => {
        try {
          const evidence = await collector.collectSafely();
          results.set(collector.type, evidence);
        } catch (error) {
          // Error already handled by collectSafely
          results.set(collector.type, []);
        }
      })
    );

    return results;
  }

  /**
   * Get collector health status for all collectors
   */
  async getHealthStatus(): Promise<CollectorHealth[]> {
    return Promise.all(
      Array.from(this.collectors.values()).map(async (collector) => {
        return collector.getStatus();
      })
    );
  }

  /**
   * Get collector status for API responses
   */
  async getCollectorStatus(): Promise<CollectorStatus[]> {
    const healthStatuses = await this.getHealthStatus();
    
    return healthStatuses.map(health => ({
      name: health.name,
      type: health.type,
      enabled: health.enabled,
      status: health.enabled
        ? (health.healthy ? 'active' : 'error')
        : 'inactive',
      lastRun: health.lastRun,
      nextRun: undefined, // TODO: Calculate based on interval
      description: this.getCollectorDescription(health.type),
    }));
  }

  /**
   * Start automatic collection
   */
  startAutoCollection(intervalMs: number = 5 * 60 * 1000): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    // Collect immediately
    this.collectAll().catch(error => {
      console.error('Initial collection failed:', error);
    });

    // Then collect periodically
    this.collectionInterval = setInterval(() => {
      this.collectAll().catch(error => {
        console.error('Scheduled collection failed:', error);
      });
    }, intervalMs);

    this.emit('auto-collection:started', { intervalMs });
  }

  /**
   * Stop automatic collection
   */
  stopAutoCollection(): void {
    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
      this.collectionInterval = undefined;
    }
    
    this.isRunning = false;
    this.emit('auto-collection:stopped');
  }

  /**
   * Get all evidence from cache (without collecting)
   */
  getCachedEvidence(): Map<string, SecurityEvidence[]> {
    const results = new Map<string, SecurityEvidence[]>();
    
    for (const collector of this.collectors.values()) {
      results.set(collector.type, collector.getCachedEvidence());
    }

    return results;
  }

  /**
   * Clear all cached evidence
   */
  clearAllCaches(): void {
    for (const collector of this.collectors.values()) {
      collector.clearCache();
    }
  }

  /**
   * Get collector description
   */
  private getCollectorDescription(type: string): string {
    const descriptions: Record<string, string> = {
      certificate_scan: 'Monitors TLS/SSH certificates for expiration and strength',
      password_rotation_check: 'Tracks password rotation compliance and overdue rotations',
      user_mfa_status: 'Monitors MFA enrollment and usage across users',
      secret_vault_query: 'Tracks secret vault health and rotation compliance',
      tpm_attestation: 'Verifies TPM attestation and device trust',
      device_identity_check: 'Validates device identity and certificates',
      zero_trust_policy: 'Evaluates zero trust policy effectiveness',
      video_encryption_scan: 'Monitors video encryption coverage',
      threat_detection: 'Collects ransomware and threat indicators',
      access_log_analysis: 'Analyzes access patterns and anomalies',
    };

    return descriptions[type] || 'Security evidence collector';
  }

  /**
   * Cleanup
   */
  destroy(): void {
    this.stopAutoCollection();
    this.collectors.clear();
    this.removeAllListeners();
  }
}

// Singleton instance
let registry: CollectorRegistry | null = null;

export function getCollectorRegistry(): CollectorRegistry {
  if (!registry) {
    registry = new CollectorRegistry();
  }
  return registry;
}

export function destroyCollectorRegistry(): void {
  if (registry) {
    registry.destroy();
    registry = null;
  }
}
