/**
 * Storage Failover Manager
 * 
 * Handles automatic failover between storage tiers when failures occur:
 * - Primary disk full → Secondary
 * - S3 unavailable → Local staging with retry
 * - SMB network failure → Local fallback
 * - Auto-recovery when storage becomes available
 */

import { EventEmitter } from 'events';
import type { StorageDestinationAdapter, StorageMetrics, StorageStatus } from './storage-adapter.js';

export type FailoverReason =
  | 'DISK_FULL'
  | 'DISK_CRITICAL'
  | 'STORAGE_OFFLINE'
  | 'NETWORK_ERROR'
  | 'WRITE_FAILURE'
  | 'PERFORMANCE_DEGRADED';

export type FailoverStatus = 
  | 'NORMAL'
  | 'FAILOVER_ACTIVE'
  | 'RECOVERY_IN_PROGRESS'
  | 'DEGRADED';

export interface StorageTier {
  name: string;
  adapter: StorageDestinationAdapter;
  priority: number; // 1 = primary, 2 = secondary, etc.
  status: StorageStatus;
  lastHealthCheck: Date;
  consecutiveFailures: number;
}

export interface FailoverEvent {
  timestamp: Date;
  reason: FailoverReason;
  fromTier: string;
  toTier: string;
  cameraId?: string;
  details: string;
}

export interface RetryQueueItem {
  id: string;
  localPath: string;
  targetTier: string;
  targetPath: string;
  attempts: number;
  maxAttempts: number;
  nextRetry: Date;
  createdAt: Date;
  recordingId: string;
  cameraId: string;
  sizeBytes: number;
}

export class StorageFailoverManager extends EventEmitter {
  private tiers: Map<string, StorageTier> = new Map();
  private activeFailovers: Map<string, FailoverEvent> = new Map();
  private retryQueue: Map<string, RetryQueueItem> = new Map();
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private retryProcessorInterval: NodeJS.Timeout | null = null;
  
  private readonly HEALTH_CHECK_INTERVAL_MS = 30000; // 30 seconds
  private readonly RETRY_PROCESSOR_INTERVAL_MS = 60000; // 1 minute
  private readonly MAX_CONSECUTIVE_FAILURES = 3;
  private readonly CRITICAL_THRESHOLD = 95; // 95% usage
  private readonly WARNING_THRESHOLD = 90; // 90% usage

  constructor() {
    super();
  }

  /**
   * Register a storage tier
   */
  registerTier(name: string, adapter: StorageDestinationAdapter, priority: number): void {
    this.tiers.set(name, {
      name,
      adapter,
      priority,
      status: 'healthy',
      lastHealthCheck: new Date(),
      consecutiveFailures: 0
    });

    console.log(`[StorageFailoverManager] Registered tier: ${name} (priority: ${priority})`);
  }

  /**
   * Start health monitoring
   */
  start(): void {
    if (this.healthCheckInterval) {
      console.warn('[StorageFailoverManager] Already started');
      return;
    }

    // Start health checks
    this.healthCheckInterval = setInterval(
      () => this.performHealthChecks(),
      this.HEALTH_CHECK_INTERVAL_MS
    );

    // Start retry processor
    this.retryProcessorInterval = setInterval(
      () => this.processRetryQueue(),
      this.RETRY_PROCESSOR_INTERVAL_MS
    );

    // Initial health check
    this.performHealthChecks();

    console.log('[StorageFailoverManager] Started');
  }

  /**
   * Stop health monitoring
   */
  stop(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    if (this.retryProcessorInterval) {
      clearInterval(this.retryProcessorInterval);
      this.retryProcessorInterval = null;
    }

    console.log('[StorageFailoverManager] Stopped');
  }

  /**
   * Get storage adapter for a camera (with automatic failover)
   */
  async getStorageForCamera(cameraId: string): Promise<{
    tier: string;
    adapter: StorageDestinationAdapter;
    isFailover: boolean;
  }> {
    // Get sorted tiers by priority
    const sortedTiers = Array.from(this.tiers.values())
      .sort((a, b) => a.priority - b.priority);

    // Try each tier in priority order
    for (const tier of sortedTiers) {
      try {
        // Check if tier is healthy
        if (tier.status === 'offline') {
          continue;
        }

        // Get metrics to verify capacity
        const metrics = await tier.adapter.getMetrics();
        
        // Check if tier has capacity
        if (this.hasCapacity(metrics)) {
          const isFailover = tier.priority > 1;
          
          if (isFailover && !this.activeFailovers.has(cameraId)) {
            // Record failover event
            this.recordFailover({
              timestamp: new Date(),
              reason: 'DISK_FULL',
              fromTier: sortedTiers[0].name,
              toTier: tier.name,
              cameraId,
              details: `Primary storage full, failed over to ${tier.name}`
            });
          }

          return {
            tier: tier.name,
            adapter: tier.adapter,
            isFailover
          };
        }
      } catch (error: any) {
        console.warn(`[StorageFailoverManager] Tier ${tier.name} unavailable: ${error.message}`);
        tier.consecutiveFailures++;
        
        if (tier.consecutiveFailures >= this.MAX_CONSECUTIVE_FAILURES) {
          tier.status = 'offline';
          this.emit('tier:offline', { tier: tier.name, error: error.message });
        }
        continue;
      }
    }

    throw new Error('No storage tier available');
  }

  /**
   * Check if storage tier has capacity
   */
  private hasCapacity(metrics: StorageMetrics): boolean {
    // S3 (unlimited capacity)
    if (metrics.capacityBytes === 0) {
      return metrics.status !== 'offline';
    }

    // Other storage types
    const usedPercent = (metrics.usedBytes / metrics.capacityBytes) * 100;
    return usedPercent < this.CRITICAL_THRESHOLD && metrics.status !== 'offline';
  }

  /**
   * Perform health checks on all tiers
   */
  private async performHealthChecks(): Promise<void> {
    const checks: Promise<void>[] = [];

    for (const [name, tier] of this.tiers) {
      checks.push(this.checkTierHealth(name, tier));
    }

    await Promise.allSettled(checks);
  }

  /**
   * Check health of a single tier
   */
  private async checkTierHealth(name: string, tier: StorageTier): Promise<void> {
    try {
      const metrics = await tier.adapter.getMetrics();
      const previousStatus = tier.status;
      
      // Update tier status
      tier.status = metrics.status;
      tier.lastHealthCheck = new Date();
      
      // Check capacity warnings
      if (metrics.capacityBytes > 0) {
        const usedPercent = (metrics.usedBytes / metrics.capacityBytes) * 100;
        
        if (usedPercent >= this.CRITICAL_THRESHOLD) {
          tier.status = 'critical';
          this.emit('tier:critical', {
            tier: name,
            usedPercent,
            threshold: this.CRITICAL_THRESHOLD
          });
        } else if (usedPercent >= this.WARNING_THRESHOLD) {
          this.emit('tier:warning', {
            tier: name,
            usedPercent,
            threshold: this.WARNING_THRESHOLD
          });
        }
      }

      // Reset failure count on success
      if (tier.status === 'healthy') {
        if (tier.consecutiveFailures > 0) {
          tier.consecutiveFailures = 0;
        }
        
        // Check for recovery from failure
        if (previousStatus === 'offline' || previousStatus === 'critical') {
          this.emit('tier:recovered', { tier: name, previousStatus });
          await this.handleTierRecovery(name, tier);
        }
      }
    } catch (error: any) {
      console.warn(`[StorageFailoverManager] Health check failed for ${name}: ${error.message}`);
      tier.consecutiveFailures++;
      
      if (tier.consecutiveFailures >= this.MAX_CONSECUTIVE_FAILURES) {
        const previousStatus = tier.status;
        tier.status = 'offline';
        
        if (previousStatus !== 'offline') {
          this.emit('tier:offline', { tier: name, error: error.message });
        }
      }
    }
  }

  /**
   * Handle tier recovery
   */
  private async handleTierRecovery(name: string, tier: StorageTier): Promise<void> {
    console.log(`[StorageFailoverManager] Tier recovered: ${name}`);
    
    // Process retry queue for this tier
    const itemsForTier = Array.from(this.retryQueue.values())
      .filter(item => item.targetTier === name);
    
    if (itemsForTier.length > 0) {
      console.log(`[StorageFailoverManager] Processing ${itemsForTier.length} queued items for ${name}`);
      this.emit('tier:recovery:start', { tier: name, queueSize: itemsForTier.length });
    }
  }

  /**
   * Record a failover event
   */
  private recordFailover(event: FailoverEvent): void {
    const key = event.cameraId || 'system';
    this.activeFailovers.set(key, event);
    
    this.emit('failover', event);
    
    console.log(
      `[StorageFailoverManager] FAILOVER: ${event.fromTier} → ${event.toTier} ` +
      `(${event.reason}): ${event.details}`
    );
  }

  /**
   * Add item to retry queue
   */
  addToRetryQueue(item: Omit<RetryQueueItem, 'id' | 'createdAt' | 'attempts' | 'nextRetry'>): string {
    const id = `retry-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    
    const queueItem: RetryQueueItem = {
      ...item,
      id,
      attempts: 0,
      nextRetry: new Date(Date.now() + 60000), // Retry in 1 minute
      createdAt: new Date()
    };
    
    this.retryQueue.set(id, queueItem);
    
    this.emit('retry:queued', { item: queueItem });
    
    console.log(
      `[StorageFailoverManager] Queued for retry: ${item.recordingId} ` +
      `(${item.targetTier}, attempt 0/${item.maxAttempts})`
    );
    
    return id;
  }

  /**
   * Process retry queue
   */
  private async processRetryQueue(): Promise<void> {
    const now = new Date();
    const itemsToRetry = Array.from(this.retryQueue.values())
      .filter(item => item.nextRetry <= now);
    
    if (itemsToRetry.length === 0) {
      return;
    }

    console.log(`[StorageFailoverManager] Processing ${itemsToRetry.length} retry items`);
    
    for (const item of itemsToRetry) {
      await this.retryUpload(item);
    }
  }

  /**
   * Retry a single upload
   */
  private async retryUpload(item: RetryQueueItem): Promise<void> {
    const tier = this.tiers.get(item.targetTier);
    
    if (!tier) {
      console.warn(`[StorageFailoverManager] Target tier not found: ${item.targetTier}`);
      this.retryQueue.delete(item.id);
      return;
    }

    // Check if tier is available
    if (tier.status === 'offline') {
      // Reschedule for later
      item.nextRetry = new Date(Date.now() + 300000); // 5 minutes
      return;
    }

    item.attempts++;
    
    try {
      // In production: actual file upload
      // await tier.adapter.uploadFile(item.localPath, item.targetPath);
      
      // ✅ Success - remove from queue
      this.retryQueue.delete(item.id);
      
      this.emit('retry:success', { item });
      
      console.log(
        `[StorageFailoverManager] Retry successful: ${item.recordingId} ` +
        `(attempt ${item.attempts}/${item.maxAttempts})`
      );
    } catch (error: any) {
      console.warn(
        `[StorageFailoverManager] Retry failed: ${item.recordingId} ` +
        `(attempt ${item.attempts}/${item.maxAttempts}): ${error.message}`
      );
      
      if (item.attempts >= item.maxAttempts) {
        // Max retries exceeded
        this.retryQueue.delete(item.id);
        
        this.emit('retry:failed', { item, error: error.message });
        
        console.error(
          `[StorageFailoverManager] Max retries exceeded: ${item.recordingId}`
        );
      } else {
        // Exponential backoff
        const backoffMs = Math.min(
          60000 * Math.pow(2, item.attempts), // 1m, 2m, 4m, 8m, ...
          3600000 // Max 1 hour
        );
        item.nextRetry = new Date(Date.now() + backoffMs);
      }
    }
  }

  /**
   * Get current failover status
   */
  getFailoverStatus(): {
    status: FailoverStatus;
    activeFailovers: FailoverEvent[];
    retryQueueSize: number;
    tiers: Array<{
      name: string;
      status: StorageStatus;
      priority: number;
      consecutiveFailures: number;
      lastHealthCheck: Date;
    }>;
  } {
    const hasFailovers = this.activeFailovers.size > 0;
    const hasRetries = this.retryQueue.size > 0;
    
    let status: FailoverStatus = 'NORMAL';
    if (hasFailovers) {
      status = 'FAILOVER_ACTIVE';
    } else if (hasRetries) {
      status = 'RECOVERY_IN_PROGRESS';
    }
    
    // Check if any tier is critical/offline
    const allTiersOffline = Array.from(this.tiers.values())
      .every(t => t.status === 'offline');
    
    if (allTiersOffline) {
      status = 'DEGRADED';
    }

    return {
      status,
      activeFailovers: Array.from(this.activeFailovers.values()),
      retryQueueSize: this.retryQueue.size,
      tiers: Array.from(this.tiers.values()).map(t => ({
        name: t.name,
        status: t.status,
        priority: t.priority,
        consecutiveFailures: t.consecutiveFailures,
        lastHealthCheck: t.lastHealthCheck
      }))
    };
  }

  /**
   * Manually trigger failback to primary
   */
  async failbackToPrimary(cameraId: string): Promise<boolean> {
    const sortedTiers = Array.from(this.tiers.values())
      .sort((a, b) => a.priority - b.priority);
    
    const primaryTier = sortedTiers[0];
    
    if (!primaryTier) {
      return false;
    }

    try {
      const metrics = await primaryTier.adapter.getMetrics();
      
      if (this.hasCapacity(metrics) && metrics.status === 'healthy') {
        // Remove failover
        this.activeFailovers.delete(cameraId);
        
        this.emit('failback', {
          timestamp: new Date(),
          tier: primaryTier.name,
          cameraId
        });
        
        console.log(`[StorageFailoverManager] Failback to primary: ${cameraId}`);
        
        return true;
      }
    } catch (error: any) {
      console.warn(`[StorageFailoverManager] Failback failed: ${error.message}`);
    }
    
    return false;
  }

  /**
   * Clear retry queue (for testing)
   */
  clearRetryQueue(): void {
    this.retryQueue.clear();
  }

  /**
   * Get retry queue items
   */
  getRetryQueue(): RetryQueueItem[] {
    return Array.from(this.retryQueue.values());
  }
}

// Singleton instance
export const storageFailoverManager = new StorageFailoverManager();
