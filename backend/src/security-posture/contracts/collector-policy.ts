/**
 * Collector Policy Contract
 * 
 * Defines collection policies including timeouts, TTLs, and freshness requirements.
 */

/**
 * Collector execution policy
 */
export interface CollectorPolicy {
  /** Maximum execution time (ms) */
  timeoutMs: number;
  
  /** Evidence time-to-live (ms) */
  ttlMs: number;
  
  /** Consider evidence stale after (ms) */
  staleAfterMs: number;
  
  /** Maximum retry attempts on failure */
  maxRetries: number;
  
  /** Retry delay (ms) */
  retryDelayMs: number;
  
  /** Collection schedule */
  schedule?: CollectionSchedule;
}

/**
 * Collection schedule configuration
 */
export interface CollectionSchedule {
  /** Schedule type */
  type: 'interval' | 'cron' | 'event-driven' | 'on-demand';
  
  /** Interval in ms (for interval type) */
  intervalMs?: number;
  
  /** Cron expression (for cron type) */
  cronExpression?: string;
  
  /** Event triggers (for event-driven type) */
  events?: string[];
}

/**
 * Evidence freshness requirements by control type
 */
export const EVIDENCE_FRESHNESS_POLICY: Record<string, CollectorPolicy> = {
  // Network security - moderate freshness (hours)
  'tls-protocol': {
    timeoutMs: 10_000,
    ttlMs: 6 * 60 * 60 * 1000,       // 6 hours
    staleAfterMs: 12 * 60 * 60 * 1000, // 12 hours
    maxRetries: 2,
    retryDelayMs: 1_000,
    schedule: {
      type: 'interval',
      intervalMs: 6 * 60 * 60 * 1000,  // Every 6 hours
    },
  },
  
  'cipher-strength': {
    timeoutMs: 10_000,
    ttlMs: 6 * 60 * 60 * 1000,
    staleAfterMs: 12 * 60 * 60 * 1000,
    maxRetries: 2,
    retryDelayMs: 1_000,
    schedule: {
      type: 'interval',
      intervalMs: 6 * 60 * 60 * 1000,
    },
  },
  
  'certificate-chain': {
    timeoutMs: 15_000,
    ttlMs: 6 * 60 * 60 * 1000,
    staleAfterMs: 12 * 60 * 60 * 1000,
    maxRetries: 2,
    retryDelayMs: 2_000,
    schedule: {
      type: 'interval',
      intervalMs: 6 * 60 * 60 * 1000,
    },
  },
  
  'certificate-expiry': {
    timeoutMs: 5_000,
    ttlMs: 24 * 60 * 60 * 1000,      // 24 hours
    staleAfterMs: 48 * 60 * 60 * 1000, // 48 hours
    maxRetries: 3,
    retryDelayMs: 2_000,
    schedule: {
      type: 'interval',
      intervalMs: 24 * 60 * 60 * 1000, // Daily
    },
  },
  
  // Revocation checking - moderate freshness
  'ocsp-check': {
    timeoutMs: 30_000,
    ttlMs: 1 * 60 * 60 * 1000,       // 1 hour (until nextUpdate)
    staleAfterMs: 6 * 60 * 60 * 1000, // 6 hours
    maxRetries: 2,
    retryDelayMs: 5_000,
    schedule: {
      type: 'interval',
      intervalMs: 2 * 60 * 60 * 1000,  // Every 2 hours
    },
  },
  
  'ocsp-stapling': {
    timeoutMs: 15_000,
    ttlMs: 1 * 60 * 60 * 1000,
    staleAfterMs: 6 * 60 * 60 * 1000,
    maxRetries: 2,
    retryDelayMs: 2_000,
    schedule: {
      type: 'interval',
      intervalMs: 2 * 60 * 60 * 1000,
    },
  },
  
  'crl-check': {
    timeoutMs: 30_000,
    ttlMs: 6 * 60 * 60 * 1000,
    staleAfterMs: 24 * 60 * 60 * 1000,
    maxRetries: 2,
    retryDelayMs: 5_000,
    schedule: {
      type: 'interval',
      intervalMs: 12 * 60 * 60 * 1000, // Every 12 hours
    },
  },
  
  'ct-log-verification': {
    timeoutMs: 30_000,
    ttlMs: 24 * 60 * 60 * 1000,
    staleAfterMs: 7 * 24 * 60 * 60 * 1000, // 7 days
    maxRetries: 2,
    retryDelayMs: 5_000,
    schedule: {
      type: 'event-driven',
      events: ['certificate-changed'],
    },
  },
  
  // Certificate rotation - daily tracking
  'certificate-rotation': {
    timeoutMs: 10_000,
    ttlMs: 24 * 60 * 60 * 1000,
    staleAfterMs: 48 * 60 * 60 * 1000,
    maxRetries: 2,
    retryDelayMs: 2_000,
    schedule: {
      type: 'interval',
      intervalMs: 24 * 60 * 60 * 1000, // Daily
    },
  },
  
  // Video encryption - moderate freshness
  'video-transport-encryption': {
    timeoutMs: 30_000,
    ttlMs: 6 * 60 * 60 * 1000,
    staleAfterMs: 24 * 60 * 60 * 1000,
    maxRetries: 2,
    retryDelayMs: 5_000,
    schedule: {
      type: 'interval',
      intervalMs: 12 * 60 * 60 * 1000, // Every 12 hours
    },
  },
  
  // Platform integrity - boot-time + scheduled
  'secure-boot': {
    timeoutMs: 10_000,
    ttlMs: 24 * 60 * 60 * 1000,
    staleAfterMs: 48 * 60 * 60 * 1000,
    maxRetries: 2,
    retryDelayMs: 2_000,
    schedule: {
      type: 'event-driven',
      events: ['system-boot', 'scheduled-check'],
    },
  },
  
  'tpm-attestation': {
    timeoutMs: 30_000,
    ttlMs: 15 * 60 * 1000,           // 15 minutes
    staleAfterMs: 60 * 60 * 1000,    // 1 hour
    maxRetries: 2,
    retryDelayMs: 5_000,
    schedule: {
      type: 'interval',
      intervalMs: 30 * 60 * 1000,    // Every 30 minutes
    },
  },
  
  'pcr-validation': {
    timeoutMs: 15_000,
    ttlMs: 15 * 60 * 1000,
    staleAfterMs: 60 * 60 * 1000,
    maxRetries: 2,
    retryDelayMs: 2_000,
    schedule: {
      type: 'interval',
      intervalMs: 30 * 60 * 1000,
    },
  },
  
  'firmware-integrity': {
    timeoutMs: 30_000,
    ttlMs: 24 * 60 * 60 * 1000,
    staleAfterMs: 48 * 60 * 60 * 1000,
    maxRetries: 1,
    retryDelayMs: 10_000,
    schedule: {
      type: 'event-driven',
      events: ['firmware-update', 'system-boot'],
    },
  },
  
  // Physical security - real-time or near-real-time
  'tamper-detection': {
    timeoutMs: 5_000,
    ttlMs: 5_000,                    // 5 seconds
    staleAfterMs: 30_000,            // 30 seconds
    maxRetries: 3,
    retryDelayMs: 1_000,
    schedule: {
      type: 'event-driven',
      events: ['tamper-alarm', 'sensor-event'],
    },
  },
  
  'enclosure-tamper': {
    timeoutMs: 5_000,
    ttlMs: 60_000,                   // 1 minute
    staleAfterMs: 5 * 60_000,        // 5 minutes
    maxRetries: 3,
    retryDelayMs: 1_000,
    schedule: {
      type: 'interval',
      intervalMs: 60_000,            // Every minute
    },
  },
  
  'sensor-health': {
    timeoutMs: 10_000,
    ttlMs: 5 * 60 * 1000,            // 5 minutes
    staleAfterMs: 30 * 60 * 1000,    // 30 minutes
    maxRetries: 2,
    retryDelayMs: 2_000,
    schedule: {
      type: 'interval',
      intervalMs: 10 * 60 * 1000,    // Every 10 minutes
    },
  },
  
  // Endpoint protection - moderate freshness
  'edr-status': {
    timeoutMs: 10_000,
    ttlMs: 5 * 60 * 1000,
    staleAfterMs: 30 * 60 * 1000,
    maxRetries: 2,
    retryDelayMs: 2_000,
    schedule: {
      type: 'interval',
      intervalMs: 10 * 60 * 1000,
    },
  },
  
  'firewall-status': {
    timeoutMs: 10_000,
    ttlMs: 15 * 60 * 1000,
    staleAfterMs: 60 * 60 * 1000,
    maxRetries: 2,
    retryDelayMs: 2_000,
    schedule: {
      type: 'interval',
      intervalMs: 30 * 60 * 1000,    // Every 30 minutes
    },
  },
  
  'anti-malware-status': {
    timeoutMs: 10_000,
    ttlMs: 15 * 60 * 1000,
    staleAfterMs: 60 * 60 * 1000,
    maxRetries: 2,
    retryDelayMs: 2_000,
    schedule: {
      type: 'interval',
      intervalMs: 30 * 60 * 1000,
    },
  },
  
  // Encryption - moderate to low freshness
  'storage-encryption': {
    timeoutMs: 15_000,
    ttlMs: 24 * 60 * 60 * 1000,
    staleAfterMs: 48 * 60 * 60 * 1000,
    maxRetries: 2,
    retryDelayMs: 2_000,
    schedule: {
      type: 'interval',
      intervalMs: 24 * 60 * 60 * 1000, // Daily
    },
  },
  
  'recording-encryption': {
    timeoutMs: 15_000,
    ttlMs: 6 * 60 * 60 * 1000,
    staleAfterMs: 24 * 60 * 60 * 1000,
    maxRetries: 2,
    retryDelayMs: 2_000,
    schedule: {
      type: 'interval',
      intervalMs: 12 * 60 * 60 * 1000, // Every 12 hours
    },
  },
  
  'key-rotation': {
    timeoutMs: 10_000,
    ttlMs: 12 * 60 * 60 * 1000,
    staleAfterMs: 24 * 60 * 60 * 1000,
    maxRetries: 2,
    retryDelayMs: 2_000,
    schedule: {
      type: 'interval',
      intervalMs: 24 * 60 * 60 * 1000, // Daily
    },
  },
  
  'kms-health': {
    timeoutMs: 10_000,
    ttlMs: 60_000,                   // 1 minute
    staleAfterMs: 5 * 60_000,        // 5 minutes
    maxRetries: 3,
    retryDelayMs: 2_000,
    schedule: {
      type: 'interval',
      intervalMs: 2 * 60_000,        // Every 2 minutes
    },
  },
};

/**
 * Default collector policy for unspecified controls
 */
export const DEFAULT_COLLECTOR_POLICY: CollectorPolicy = {
  timeoutMs: 30_000,
  ttlMs: 6 * 60 * 60 * 1000,
  staleAfterMs: 24 * 60 * 60 * 1000,
  maxRetries: 2,
  retryDelayMs: 2_000,
  schedule: {
    type: 'interval',
    intervalMs: 6 * 60 * 60 * 1000,
  },
};

/**
 * Helper: Get policy for collector
 */
export function getCollectorPolicy(collectorId: string): CollectorPolicy {
  return EVIDENCE_FRESHNESS_POLICY[collectorId] || DEFAULT_COLLECTOR_POLICY;
}

/**
 * Helper: Check if evidence meets freshness requirement
 */
export function meetsFreshnessRequirement(
  observedAt: Date | null,
  policy: CollectorPolicy
): boolean {
  if (!observedAt) return false;
  
  const ageMs = Date.now() - observedAt.getTime();
  return ageMs <= policy.staleAfterMs;
}

/**
 * Helper: Calculate next collection time
 */
export function calculateNextCollection(
  lastCollectionAt: Date | null,
  policy: CollectorPolicy
): Date {
  if (!lastCollectionAt || !policy.schedule) {
    return new Date(); // Collect now
  }
  
  switch (policy.schedule.type) {
    case 'interval':
      if (policy.schedule.intervalMs) {
        return new Date(lastCollectionAt.getTime() + policy.schedule.intervalMs);
      }
      return new Date();
      
    case 'on-demand':
      return new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // Far future
      
    case 'event-driven':
      return new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // Far future
      
    default:
      return new Date();
  }
}
