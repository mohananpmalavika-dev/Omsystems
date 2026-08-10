/**
 * Collector Health Monitoring Service
 * 
 * Monitors the health of all security posture collectors and provides
 * aggregated health status and diagnostics.
 */

import { CollectorHealth, HealthAwareCollector } from '../contracts/security-posture-collector';

/**
 * Aggregated health status for all collectors
 */
export interface CollectorHealthSummary {
  overall: 'healthy' | 'degraded' | 'failed';
  timestamp: Date;
  healthyCount: number;
  degradedCount: number;
  failedCount: number;
  totalCount: number;
  collectors: CollectorHealth[];
}

/**
 * Collector health monitoring service
 */
export class CollectorHealthService {
  private collectors: Map<string, HealthAwareCollector> = new Map();
  
  /**
   * Register a collector for health monitoring
   */
  registerCollector(collector: HealthAwareCollector): void {
    const collectorId = (collector as any).collectorId || 'unknown';
    this.collectors.set(collectorId, collector);
  }
  
  /**
   * Unregister a collector
   */
  unregisterCollector(collectorId: string): void {
    this.collectors.delete(collectorId);
  }
  
  /**
   * Get health status for a specific collector
   */
  async getCollectorHealth(collectorId: string): Promise<CollectorHealth | null> {
    const collector = this.collectors.get(collectorId);
    if (!collector) {
      return null;
    }
    
    try {
      return await collector.getHealth();
    } catch (error) {
      return {
        collectorId,
        status: 'failed',
        failures24h: 0,
        error: `Health check failed: ${error.message}`,
      };
    }
  }
  
  /**
   * Get health status for all collectors
   */
  async getAllCollectorHealth(): Promise<CollectorHealthSummary> {
    const timestamp = new Date();
    const healthPromises: Promise<CollectorHealth>[] = [];
    
    for (const collector of this.collectors.values()) {
      healthPromises.push(
        collector.getHealth().catch((error) => ({
          collectorId: 'unknown',
          status: 'failed' as const,
          failures24h: 0,
          error: error.message,
        }))
      );
    }
    
    const collectors = await Promise.all(healthPromises);
    
    // Count statuses
    let healthyCount = 0;
    let degradedCount = 0;
    let failedCount = 0;
    
    for (const collector of collectors) {
      switch (collector.status) {
        case 'healthy':
          healthyCount++;
          break;
        case 'degraded':
          degradedCount++;
          break;
        case 'failed':
          failedCount++;
          break;
      }
    }
    
    // Determine overall status
    let overall: 'healthy' | 'degraded' | 'failed';
    if (failedCount > collectors.length / 2) {
      overall = 'failed';
    } else if (degradedCount > 0 || failedCount > 0) {
      overall = 'degraded';
    } else {
      overall = 'healthy';
    }
    
    return {
      overall,
      timestamp,
      healthyCount,
      degradedCount,
      failedCount,
      totalCount: collectors.length,
      collectors,
    };
  }
  
  /**
   * Get collectors that are currently failing
   */
  async getFailingCollectors(): Promise<CollectorHealth[]> {
    const summary = await this.getAllCollectorHealth();
    return summary.collectors.filter(c => c.status === 'failed');
  }
  
  /**
   * Get collectors that are degraded
   */
  async getDegradedCollectors(): Promise<CollectorHealth[]> {
    const summary = await this.getAllCollectorHealth();
    return summary.collectors.filter(c => c.status === 'degraded');
  }
  
  /**
   * Reset health tracking for a collector
   */
  async resetCollectorHealth(collectorId: string): Promise<boolean> {
    const collector = this.collectors.get(collectorId);
    if (!collector) {
      return false;
    }
    
    // Reset health tracking if the collector supports it
    if (typeof (collector as any).resetHealth === 'function') {
      (collector as any).resetHealth();
      return true;
    }
    
    return false;
  }
  
  /**
   * Get health metrics for monitoring/alerting
   */
  async getHealthMetrics(): Promise<{
    failureRate: number;
    averageLatency: number;
    slowestCollectors: Array<{ id: string; latency: number }>;
    recentFailures: Array<{ id: string; failures: number }>;
  }> {
    const summary = await this.getAllCollectorHealth();
    
    const totalFailures = summary.collectors.reduce(
      (sum, c) => sum + c.failures24h,
      0
    );
    
    const failureRate = summary.totalCount > 0
      ? totalFailures / summary.totalCount
      : 0;
    
    const latencies = summary.collectors
      .filter(c => c.averageDurationMs !== undefined)
      .map(c => c.averageDurationMs!);
    
    const averageLatency = latencies.length > 0
      ? latencies.reduce((sum, l) => sum + l, 0) / latencies.length
      : 0;
    
    const slowestCollectors = summary.collectors
      .filter(c => c.averageDurationMs !== undefined)
      .map(c => ({ id: c.collectorId, latency: c.averageDurationMs! }))
      .sort((a, b) => b.latency - a.latency)
      .slice(0, 5);
    
    const recentFailures = summary.collectors
      .filter(c => c.failures24h > 0)
      .map(c => ({ id: c.collectorId, failures: c.failures24h }))
      .sort((a, b) => b.failures - a.failures);
    
    return {
      failureRate,
      averageLatency,
      slowestCollectors,
      recentFailures,
    };
  }
}

/**
 * Singleton instance
 */
let instance: CollectorHealthService | null = null;

export function getCollectorHealthService(): CollectorHealthService {
  if (!instance) {
    instance = new CollectorHealthService();
  }
  return instance;
}
