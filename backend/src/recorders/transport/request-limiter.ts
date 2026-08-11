/**
 * Request Limiter
 * 
 * Controls concurrency and rate limiting for recorder requests.
 * Prevents overwhelming embedded devices with too many simultaneous requests.
 * 
 * Features:
 * - Per-recorder concurrency limits
 * - Global concurrency pool
 * - Request queuing with priority
 * - Timeout handling
 */

import { logger } from '../../utils/logger.js';

/**
 * Request limiter configuration
 */
export interface RequestLimiterConfig {
  /**
   * Maximum concurrent requests per recorder
   */
  maxConcurrentPerRecorder: number;

  /**
   * Global maximum concurrent requests
   */
  maxConcurrentGlobal: number;

  /**
   * Maximum queue size per recorder
   */
  maxQueueSize: number;

  /**
   * Request timeout in milliseconds
   */
  requestTimeoutMs: number;
}

/**
 * Request priority
 */
export enum RequestPriority {
  LOW = 0,
  NORMAL = 1,
  HIGH = 2,
  CRITICAL = 3
}

/**
 * Queued request
 */
interface QueuedRequest {
  recorderId: string;
  operation: string;
  priority: RequestPriority;
  executor: () => Promise<any>;
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  queuedAt: Date;
  timeoutHandle?: NodeJS.Timeout;
}

/**
 * Request statistics
 */
export interface RequestStats {
  recorderId: string;
  activeRequests: number;
  queuedRequests: number;
  completedRequests: number;
  failedRequests: number;
  averageLatencyMs: number;
  lastRequestAt?: Date;
}

/**
 * Request limiter
 * 
 * Manages concurrency and queuing for recorder requests.
 */
export class RecorderRequestLimiter {
  private readonly config: RequestLimiterConfig;
  
  // Per-recorder state
  private readonly activeRequests = new Map<string, number>();
  private readonly requestQueues = new Map<string, QueuedRequest[]>();
  private readonly stats = new Map<string, RequestStats>();
  
  // Global state
  private globalActiveRequests = 0;

  constructor(config?: Partial<RequestLimiterConfig>) {
    this.config = {
      maxConcurrentPerRecorder: config?.maxConcurrentPerRecorder ?? 4,
      maxConcurrentGlobal: config?.maxConcurrentGlobal ?? 50,
      maxQueueSize: config?.maxQueueSize ?? 20,
      requestTimeoutMs: config?.requestTimeoutMs ?? 30000
    };
  }

  /**
   * Execute request with concurrency control
   */
  async execute<T>(
    recorderId: string,
    operation: string,
    executor: () => Promise<T>,
    priority: RequestPriority = RequestPriority.NORMAL
  ): Promise<T> {
    // Check if we can execute immediately
    if (this.canExecuteNow(recorderId)) {
      return this.executeNow(recorderId, operation, executor);
    }

    // Check queue capacity
    const queue = this.getQueue(recorderId);
    if (queue.length >= this.config.maxQueueSize) {
      throw new Error(
        `Request queue full for recorder ${recorderId} (max: ${this.config.maxQueueSize})`
      );
    }

    // Queue the request
    return this.queueRequest(recorderId, operation, executor, priority);
  }

  /**
   * Check if request can execute immediately
   */
  private canExecuteNow(recorderId: string): boolean {
    const recorderActive = this.activeRequests.get(recorderId) ?? 0;
    
    return (
      recorderActive < this.config.maxConcurrentPerRecorder &&
      this.globalActiveRequests < this.config.maxConcurrentGlobal
    );
  }

  /**
   * Execute request immediately
   */
  private async executeNow<T>(
    recorderId: string,
    operation: string,
    executor: () => Promise<T>
  ): Promise<T> {
    // Increment counters
    this.incrementActive(recorderId);
    this.globalActiveRequests++;

    const startTime = Date.now();

    try {
      logger.debug('Executing recorder request', {
        recorderId,
        operation,
        activePerRecorder: this.activeRequests.get(recorderId),
        activeGlobal: this.globalActiveRequests
      });

      const result = await executor();
      
      const latencyMs = Date.now() - startTime;
      this.recordSuccess(recorderId, latencyMs);

      return result;

    } catch (error) {
      this.recordFailure(recorderId);
      throw error;

    } finally {
      // Decrement counters
      this.decrementActive(recorderId);
      this.globalActiveRequests--;

      // Process next in queue
      this.processQueue(recorderId);
    }
  }

  /**
   * Queue request for later execution
   */
  private queueRequest<T>(
    recorderId: string,
    operation: string,
    executor: () => Promise<T>,
    priority: RequestPriority
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const request: QueuedRequest = {
        recorderId,
        operation,
        priority,
        executor,
        resolve,
        reject,
        queuedAt: new Date()
      };

      // Set timeout
      request.timeoutHandle = setTimeout(() => {
        this.removeFromQueue(recorderId, request);
        reject(new Error(
          `Request timed out in queue after ${this.config.requestTimeoutMs}ms`
        ));
      }, this.config.requestTimeoutMs);

      // Add to queue (sorted by priority)
      const queue = this.getQueue(recorderId);
      queue.push(request);
      queue.sort((a, b) => b.priority - a.priority);

      logger.debug('Request queued', {
        recorderId,
        operation,
        priority,
        queueLength: queue.length
      });
    });
  }

  /**
   * Process next request in queue
   */
  private processQueue(recorderId: string): void {
    if (!this.canExecuteNow(recorderId)) {
      return;
    }

    const queue = this.getQueue(recorderId);
    const request = queue.shift();

    if (!request) {
      return;
    }

    // Clear timeout
    if (request.timeoutHandle) {
      clearTimeout(request.timeoutHandle);
    }

    // Execute request
    this.executeNow(recorderId, request.operation, request.executor)
      .then(request.resolve)
      .catch(request.reject);
  }

  /**
   * Remove request from queue
   */
  private removeFromQueue(recorderId: string, request: QueuedRequest): void {
    const queue = this.getQueue(recorderId);
    const index = queue.indexOf(request);
    
    if (index !== -1) {
      queue.splice(index, 1);
    }

    if (request.timeoutHandle) {
      clearTimeout(request.timeoutHandle);
    }
  }

  /**
   * Get or create request queue
   */
  private getQueue(recorderId: string): QueuedRequest[] {
    let queue = this.requestQueues.get(recorderId);
    
    if (!queue) {
      queue = [];
      this.requestQueues.set(recorderId, queue);
    }

    return queue;
  }

  /**
   * Increment active request counter
   */
  private incrementActive(recorderId: string): void {
    const current = this.activeRequests.get(recorderId) ?? 0;
    this.activeRequests.set(recorderId, current + 1);
  }

  /**
   * Decrement active request counter
   */
  private decrementActive(recorderId: string): void {
    const current = this.activeRequests.get(recorderId) ?? 0;
    const next = Math.max(0, current - 1);
    
    if (next === 0) {
      this.activeRequests.delete(recorderId);
    } else {
      this.activeRequests.set(recorderId, next);
    }
  }

  /**
   * Record successful request
   */
  private recordSuccess(recorderId: string, latencyMs: number): void {
    const stats = this.getStats(recorderId);
    
    stats.completedRequests++;
    stats.lastRequestAt = new Date();

    // Update rolling average
    const totalLatency = stats.averageLatencyMs * (stats.completedRequests - 1);
    stats.averageLatencyMs = (totalLatency + latencyMs) / stats.completedRequests;
  }

  /**
   * Record failed request
   */
  private recordFailure(recorderId: string): void {
    const stats = this.getStats(recorderId);
    stats.failedRequests++;
    stats.lastRequestAt = new Date();
  }

  /**
   * Get or create statistics
   */
  private getStats(recorderId: string): RequestStats {
    let stats = this.stats.get(recorderId);
    
    if (!stats) {
      stats = {
        recorderId,
        activeRequests: 0,
        queuedRequests: 0,
        completedRequests: 0,
        failedRequests: 0,
        averageLatencyMs: 0
      };
      this.stats.set(recorderId, stats);
    }

    return stats;
  }

  /**
   * Get current statistics for recorder
   */
  getRecorderStats(recorderId: string): RequestStats {
    const stats = this.getStats(recorderId);
    const queue = this.getQueue(recorderId);
    
    return {
      ...stats,
      activeRequests: this.activeRequests.get(recorderId) ?? 0,
      queuedRequests: queue.length
    };
  }

  /**
   * Get global statistics
   */
  getGlobalStats(): {
    activeRequests: number;
    totalQueued: number;
    totalRecorders: number;
  } {
    let totalQueued = 0;
    
    for (const queue of this.requestQueues.values()) {
      totalQueued += queue.length;
    }

    return {
      activeRequests: this.globalActiveRequests,
      totalQueued,
      totalRecorders: this.stats.size
    };
  }

  /**
   * Clear queue for recorder
   */
  clearQueue(recorderId: string): void {
    const queue = this.requestQueues.get(recorderId);
    
    if (queue) {
      // Reject all queued requests
      for (const request of queue) {
        if (request.timeoutHandle) {
          clearTimeout(request.timeoutHandle);
        }
        request.reject(new Error('Queue cleared'));
      }

      queue.length = 0;
    }
  }

  /**
   * Clear all queues
   */
  clearAllQueues(): void {
    for (const [recorderId] of this.requestQueues) {
      this.clearQueue(recorderId);
    }
  }

  /**
   * Cleanup and destroy limiter
   */
  destroy(): void {
    this.clearAllQueues();
    this.activeRequests.clear();
    this.requestQueues.clear();
    this.stats.clear();
    this.globalActiveRequests = 0;
  }
}

/**
 * Global request limiter instance
 */
export const globalRequestLimiter = new RecorderRequestLimiter();
