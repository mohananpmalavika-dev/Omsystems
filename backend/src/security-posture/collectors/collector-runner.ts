/**
 * Security Collector Runner
 * 
 * Executes collectors and aggregates evidence.
 * Handles parallel execution, error recovery, and evidence aggregation.
 */

import {
  SecurityCollector,
  CollectorContext,
  executeCollectorWithRetry,
} from './base-collector';
import {
  SecurityEvidence,
  SecurityTarget,
  CollectorFailureReason,
  createUnavailableEvidence,
} from '../contracts/security-evidence';
import {
  SecurityCapabilities,
  getDefaultCapabilities,
} from '../contracts/target-capabilities';
import {
  CollectorPolicy,
  getCollectorPolicy,
} from '../contracts/collector-policy';
import { CollectorRegistry } from './collector-registry';

/**
 * Collector execution result
 */
export interface CollectorExecutionResult<T = unknown> {
  /** Collector ID */
  collectorId: string;
  
  /** Execution status */
  status: 'success' | 'failed' | 'timeout' | 'unsupported';
  
  /** Evidence (if available) */
  evidence?: SecurityEvidence<T>;
  
  /** Error (if failed) */
  error?: Error;
  
  /** Execution duration (ms) */
  durationMs: number;
  
  /** Started at */
  startedAt: Date;
  
  /** Completed at */
  completedAt: Date;
}

/**
 * Batch execution result
 */
export interface BatchExecutionResult {
  /** Target */
  target: SecurityTarget;
  
  /** Execution results */
  results: CollectorExecutionResult[];
  
  /** Success count */
  successCount: number;
  
  /** Failure count */
  failureCount: number;
  
  /** Total duration (ms) */
  totalDurationMs: number;
  
  /** Executed at */
  executedAt: Date;
}

/**
 * Collector Runner
 */
export class CollectorRunner {
  constructor(private registry: CollectorRegistry) {}
  
  /**
   * Run single collector
   */
  async runOne<T>(
    collector: SecurityCollector<T>,
    target: SecurityTarget,
    capabilities?: SecurityCapabilities,
    policy?: CollectorPolicy
  ): Promise<CollectorExecutionResult<T>> {
    const startedAt = new Date();
    const startTime = Date.now();
    
    try {
      // Get capabilities and policy
      const targetCapabilities = capabilities || getDefaultCapabilities(target.entityType || 'camera');
      const executionPolicy = policy || getCollectorPolicy(collector.id);
      
      // Build context
      const context: CollectorContext = {
        target,
        capabilities: targetCapabilities,
        policy: executionPolicy,
      };
      
      // Execute collector with retry
      const evidence = await executeCollectorWithRetry(collector, context);
      
      const completedAt = new Date();
      const durationMs = Date.now() - startTime;
      
      return {
        collectorId: collector.id,
        status: evidence.available ? 'success' : 
                evidence.failureReason === CollectorFailureReason.TIMEOUT ? 'timeout' :
                evidence.failureReason === CollectorFailureReason.UNSUPPORTED ? 'unsupported' :
                'failed',
        evidence,
        durationMs,
        startedAt,
        completedAt,
      };
    } catch (error) {
      const completedAt = new Date();
      const durationMs = Date.now() - startTime;
      
      return {
        collectorId: collector.id,
        status: 'failed',
        error: error instanceof Error ? error : new Error(String(error)),
        durationMs,
        startedAt,
        completedAt,
      };
    }
  }
  
  /**
   * Run multiple collectors in parallel
   */
  async runMany(
    collectors: SecurityCollector[],
    target: SecurityTarget,
    capabilities?: SecurityCapabilities
  ): Promise<BatchExecutionResult> {
    const executedAt = new Date();
    const startTime = Date.now();
    
    // Get capabilities once
    const targetCapabilities = capabilities || getDefaultCapabilities(target.entityType || 'camera');
    
    // Execute collectors in parallel
    const resultPromises = collectors.map(collector =>
      this.runOne(collector, target, targetCapabilities)
    );
    
    const results = await Promise.all(resultPromises);
    
    const totalDurationMs = Date.now() - startTime;
    
    // Calculate statistics
    const successCount = results.filter(r => r.status === 'success').length;
    const failureCount = results.filter(r => r.status === 'failed' || r.status === 'timeout').length;
    
    return {
      target,
      results,
      successCount,
      failureCount,
      totalDurationMs,
      executedAt,
    };
  }
  
  /**
   * Run all collectors for target
   */
  async runAll(
    target: SecurityTarget,
    capabilities?: SecurityCapabilities
  ): Promise<BatchExecutionResult> {
    // Get supported collectors from registry
    const collectors = await this.registry.getSupportedCollectors(target);
    
    // Execute all
    return this.runMany(collectors, target, capabilities);
  }
  
  /**
   * Run collectors by category
   */
  async runCategory(
    category: string,
    target: SecurityTarget,
    capabilities?: SecurityCapabilities
  ): Promise<BatchExecutionResult> {
    // Get collectors in category
    const collectors = this.registry.byCategory(category);
    
    // Filter by target support
    const targetCapabilities = capabilities || getDefaultCapabilities(target.entityType || 'camera');
    const supported = collectors.filter(c => c.supports(target, targetCapabilities));
    
    // Execute
    return this.runMany(supported, target, capabilities);
  }
  
  /**
   * Run specific collectors by ID
   */
  async runByIds(
    collectorIds: string[],
    target: SecurityTarget,
    capabilities?: SecurityCapabilities
  ): Promise<BatchExecutionResult> {
    // Resolve collector instances
    const collectors = collectorIds
      .map(id => this.registry.get(id))
      .filter((c): c is SecurityCollector => c !== undefined);
    
    if (collectors.length === 0) {
      return {
        target,
        results: [],
        successCount: 0,
        failureCount: 0,
        totalDurationMs: 0,
        executedAt: new Date(),
      };
    }
    
    // Execute
    return this.runMany(collectors, target, capabilities);
  }
  
  /**
   * Extract evidence from execution results
   */
  extractEvidence(result: BatchExecutionResult): SecurityEvidence[] {
    return result.results
      .map(r => r.evidence)
      .filter((e): e is SecurityEvidence => e !== undefined);
  }
  
  /**
   * Extract evidence by state
   */
  extractByState(
    result: BatchExecutionResult,
    state: 'HEALTHY' | 'UNHEALTHY' | 'UNKNOWN'
  ): SecurityEvidence[] {
    return this.extractEvidence(result).filter(e => e.state === state);
  }
  
  /**
   * Get execution summary
   */
  getSummary(result: BatchExecutionResult): {
    total: number;
    successful: number;
    failed: number;
    timeout: number;
    unsupported: number;
    healthy: number;
    unhealthy: number;
    unknown: number;
    averageDurationMs: number;
  } {
    const evidence = this.extractEvidence(result);
    
    return {
      total: result.results.length,
      successful: result.successCount,
      failed: result.results.filter(r => r.status === 'failed').length,
      timeout: result.results.filter(r => r.status === 'timeout').length,
      unsupported: result.results.filter(r => r.status === 'unsupported').length,
      healthy: evidence.filter(e => e.state === 'HEALTHY').length,
      unhealthy: evidence.filter(e => e.state === 'UNHEALTHY').length,
      unknown: evidence.filter(e => e.state === 'UNKNOWN').length,
      averageDurationMs: result.results.length > 0
        ? result.results.reduce((sum, r) => sum + r.durationMs, 0) / result.results.length
        : 0,
    };
  }
}

/**
 * Singleton runner instance
 */
let runnerInstance: CollectorRunner | null = null;

/**
 * Get global collector runner
 */
export function getCollectorRunner(registry?: CollectorRegistry): CollectorRunner {
  if (!runnerInstance) {
    const reg = registry || require('./collector-registry').getCollectorRegistry();
    runnerInstance = new CollectorRunner(reg);
  }
  
  return runnerInstance;
}

/**
 * Reset runner (for testing)
 */
export function resetCollectorRunner(): void {
  runnerInstance = null;
}
