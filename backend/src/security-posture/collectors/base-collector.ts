/**
 * Base Security Collector
 * 
 * Abstract base class for all security evidence collectors.
 * Enforces canonical evidence contract and provides common utilities.
 */

import {
  SecurityEvidence,
  SecurityTarget,
  CollectorMetadata,
  CollectorCapability,
  CollectorFailureReason,
  createUnavailableEvidence,
  createUnknownEvidence,
  isEvidenceStale,
} from '../contracts/security-evidence';
import {
  SecurityCapabilities,
  getDefaultCapabilities,
} from '../contracts/target-capabilities';
import {
  CollectorPolicy,
  getCollectorPolicy,
} from '../contracts/collector-policy';

/**
 * Collector context for execution
 */
export interface CollectorContext {
  /** Security target */
  target: SecurityTarget;
  
  /** Target capabilities */
  capabilities: SecurityCapabilities;
  
  /** Execution policy */
  policy: CollectorPolicy;
  
  /** Additional context */
  metadata?: Record<string, unknown>;
}

/**
 * Base security collector interface
 */
export interface SecurityCollector<T = unknown> {
  /** Unique collector identifier */
  readonly id: string;
  
  /** Collector version */
  readonly version: string;
  
  /** Collector capability type */
  readonly capability: CollectorCapability;
  
  /** Execution timeout (ms) */
  readonly timeoutMs: number;
  
  /**
   * Check if collector supports this target
   */
  supports(
    target: SecurityTarget,
    capabilities: SecurityCapabilities
  ): boolean;
  
  /**
   * Collect evidence for target
   */
  collect(context: CollectorContext): Promise<SecurityEvidence<T>>;
}

/**
 * Abstract base collector with common functionality
 */
export abstract class BaseSecurityCollector<T = unknown> implements SecurityCollector<T> {
  abstract readonly id: string;
  abstract readonly version: string;
  
  readonly capability: CollectorCapability = 'LIVE';
  
  constructor(
    protected readonly collectorId: string,
    protected readonly collectorVersion: string = '1.0.0',
    protected readonly collectorCapability: CollectorCapability = 'LIVE'
  ) {
    this.id = collectorId;
    this.version = collectorVersion;
    this.capability = collectorCapability;
  }
  
  /**
   * Get execution timeout from policy
   */
  get timeoutMs(): number {
    const policy = getCollectorPolicy(this.id);
    return policy.timeoutMs;
  }
  
  /**
   * Check if collector supports target (override in subclasses)
   */
  supports(
    target: SecurityTarget,
    capabilities: SecurityCapabilities
  ): boolean {
    // Default: support all targets
    // Subclasses should override with specific capability checks
    return true;
  }
  
  /**
   * Collect evidence with error handling and timeout
   */
  async collect(context: CollectorContext): Promise<SecurityEvidence<T>> {
    // Production guard: prevent simulated collectors from running
    if (this.capability === 'SIMULATED' && this.isProduction()) {
      return createUnavailableEvidence<T>(
        this.getMetadata(),
        context.target,
        'NOT_CONFIGURED',
        'Simulated collector disabled in production',
        CollectorFailureReason.COLLECTOR_NOT_IMPLEMENTED
      );
    }
    
    // Check if collector supports this target
    if (!this.supports(context.target, context.capabilities)) {
      return createUnavailableEvidence<T>(
        this.getMetadata(),
        context.target,
        'UNSUPPORTED',
        `Target type ${context.target.entityType} does not support ${this.id}`,
        CollectorFailureReason.UNSUPPORTED
      );
    }
    
    // Execute collection with timeout and error handling
    try {
      const evidence = await this.withTimeout(
        this.doCollect(context),
        context.policy.timeoutMs
      );
      
      // Validate evidence freshness
      if (evidence.available && isEvidenceStale(evidence, context.policy.staleAfterMs)) {
        return {
          ...evidence,
          state: 'UNKNOWN',
          reason: 'Evidence is stale',
          failureReason: CollectorFailureReason.STALE_EVIDENCE,
        };
      }
      
      return evidence;
    } catch (error) {
      return this.handleCollectionError(error, context);
    }
  }
  
  /**
   * Actual collection implementation (override in subclasses)
   */
  protected abstract doCollect(context: CollectorContext): Promise<SecurityEvidence<T>>;
  
  /**
   * Get collector metadata
   */
  protected getMetadata(): CollectorMetadata {
    return {
      id: this.id,
      version: this.version,
      capability: this.capability,
    };
  }
  
  /**
   * Check if running in production
   */
  protected isProduction(): boolean {
    return process.env.NODE_ENV === 'production';
  }
  
  /**
   * Execute with timeout
   */
  protected async withTimeout<R>(
    promise: Promise<R>,
    timeoutMs: number
  ): Promise<R> {
    return Promise.race([
      promise,
      new Promise<R>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Collector timeout after ${timeoutMs}ms`)),
          timeoutMs
        )
      ),
    ]);
  }
  
  /**
   * Handle collection errors
   */
  protected handleCollectionError(
    error: any,
    context: CollectorContext
  ): SecurityEvidence<T> {
    let failureReason: CollectorFailureReason = CollectorFailureReason.INTERNAL_ERROR;
    let availability: 'TEMPORARILY_UNAVAILABLE' | 'PERMISSION_DENIED' | 'UNSUPPORTED' = 'TEMPORARILY_UNAVAILABLE';
    
    const message = error?.message || String(error);
    
    // Classify error
    if (message.includes('timeout')) {
      failureReason = CollectorFailureReason.TIMEOUT;
    } else if (message.includes('auth') || message.includes('unauthorized')) {
      failureReason = CollectorFailureReason.AUTHENTICATION_FAILED;
    } else if (message.includes('permission') || message.includes('forbidden')) {
      failureReason = CollectorFailureReason.PERMISSION_DENIED;
      availability = 'PERMISSION_DENIED';
    } else if (message.includes('offline') || message.includes('unreachable')) {
      failureReason = CollectorFailureReason.DEVICE_OFFLINE;
    } else if (message.includes('unsupported') || message.includes('not supported')) {
      failureReason = CollectorFailureReason.UNSUPPORTED;
      availability = 'UNSUPPORTED';
    } else if (message.includes('not configured')) {
      failureReason = CollectorFailureReason.PROVIDER_NOT_CONFIGURED;
    } else if (message.includes('malformed') || message.includes('invalid response')) {
      failureReason = CollectorFailureReason.MALFORMED_RESPONSE;
    }
    
    return createUnknownEvidence<T>(
      this.getMetadata(),
      context.target,
      `Collection failed: ${message}`,
      failureReason
    );
  }
  
  /**
   * Log collector execution (override for custom logging)
   */
  protected log(level: 'info' | 'warn' | 'error', message: string, meta?: any): void {
    const logMessage = `[${this.id}] ${message}`;
    
    switch (level) {
      case 'info':
        console.log(logMessage, meta || '');
        break;
      case 'warn':
        console.warn(logMessage, meta || '');
        break;
      case 'error':
        console.error(logMessage, meta || '');
        break;
    }
  }
}

/**
 * Unavailable collector (for unsupported controls)
 */
export class UnavailableCollector extends BaseSecurityCollector<never> {
  constructor(
    collectorId: string,
    private readonly unavailableReason: string
  ) {
    super(collectorId, '1.0.0', 'UNAVAILABLE');
  }
  
  supports(): boolean {
    return false;
  }
  
  protected async doCollect(context: CollectorContext): Promise<SecurityEvidence<never>> {
    return createUnavailableEvidence(
      this.getMetadata(),
      context.target,
      'UNSUPPORTED',
      this.unavailableReason,
      CollectorFailureReason.UNSUPPORTED
    );
  }
}

/**
 * Helper: Execute collector with retry
 */
export async function executeCollectorWithRetry<T>(
  collector: SecurityCollector<T>,
  context: CollectorContext
): Promise<SecurityEvidence<T>> {
  let lastError: any;
  const maxRetries = context.policy.maxRetries;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const evidence = await collector.collect(context);
      
      // Success or non-retryable failure
      if (
        evidence.available ||
        evidence.failureReason === CollectorFailureReason.UNSUPPORTED ||
        evidence.failureReason === CollectorFailureReason.PERMISSION_DENIED
      ) {
        return evidence;
      }
      
      // Retry on temporary failures
      lastError = evidence;
      
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, context.policy.retryDelayMs));
      }
    } catch (error) {
      lastError = error;
      
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, context.policy.retryDelayMs));
      }
    }
  }
  
  // All retries exhausted
  if (lastError && 'state' in lastError) {
    return lastError;
  }
  
  return createUnknownEvidence<T>(
    { id: collector.id, version: collector.version, capability: collector.capability },
    context.target,
    `Collection failed after ${maxRetries} retries`,
    CollectorFailureReason.INTERNAL_ERROR
  );
}
