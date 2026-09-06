/**
 * Performance observability service for backend metrics.
 * Tracks latency percentiles, database query performance, and API endpoint metrics.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { metrics, type Histogram } from '@opentelemetry/api';

export interface LatencyPercentiles {
  p50: number;
  p75: number;
  p90: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
  mean: number;
  count: number;
}

export interface EndpointMetrics {
  path: string;
  method: string;
  totalRequests: number;
  successCount: number;
  errorCount: number;
  latencyPercentiles: LatencyPercentiles;
  errorRate: number;
  lastUpdated: string;
}

export interface DatabaseQueryMetrics {
  query: string;
  totalExecutions: number;
  totalDurationMs: number;
  latencyPercentiles: LatencyPercentiles;
  errorCount: number;
  lastExecutedAt: string;
}

export interface PerformanceSnapshot {
  timestamp: string;
  endpoints: Map<string, EndpointMetrics>;
  queries: Map<string, DatabaseQueryMetrics>;
  webVitals: Record<string, LatencyPercentiles>;
  systemHealth: {
    uptime: number;
    memoryUsage: NodeJS.MemoryUsage;
    eventLoopLag: number;
  };
}

class PerformanceObserver {
  private endpointMetrics = new Map<string, { latencies: number[]; errors: number; successes: number }>();
  private queryMetrics = new Map<string, { latencies: number[]; errors: number; executions: number }>();
  private startTime = Date.now();
  private eventLoopLag = 0;
  private webVitals = new Map<string, number[]>();
  private webVitalHistogram: Histogram | undefined;

  constructor() {
    this.monitorEventLoop();
  }

  private monitorEventLoop() {
    let lastCheck = Date.now();
    setInterval(() => {
      const now = Date.now();
      const delta = now - lastCheck - 100; // 100ms interval
      if (delta > 50) {
        this.eventLoopLag = delta;
      }
      lastCheck = now;
    }, 100);
  }

  recordEndpointLatency(path: string, method: string, durationMs: number, isError: boolean = false) {
    const key = `${method} ${path}`;
    if (!this.endpointMetrics.has(key)) {
      this.endpointMetrics.set(key, { latencies: [], errors: 0, successes: 0 });
    }

    const metrics = this.endpointMetrics.get(key)!;
    metrics.latencies.push(durationMs);
    
    // Keep only last 1000 samples to avoid memory bloat
    if (metrics.latencies.length > 1000) {
      metrics.latencies = metrics.latencies.slice(-1000);
    }

    if (isError) {
      metrics.errors++;
    } else {
      metrics.successes++;
    }
  }

  recordQueryLatency(query: string, durationMs: number, isError: boolean = false) {
    // Normalize query to group similar queries
    const normalizedQuery = this.normalizeQuery(query);
    
    if (!this.queryMetrics.has(normalizedQuery)) {
      this.queryMetrics.set(normalizedQuery, { latencies: [], errors: 0, executions: 0 });
    }

    const metrics = this.queryMetrics.get(normalizedQuery)!;
    metrics.latencies.push(durationMs);
    metrics.executions++;

    // Keep only last 500 samples
    if (metrics.latencies.length > 500) {
      metrics.latencies = metrics.latencies.slice(-500);
    }

    if (isError) {
      metrics.errors++;
    }
  }

  recordWebVital(metric: Record<string, unknown>) {
    const name = typeof metric.name === "string" ? metric.name.toUpperCase() : "UNKNOWN";
    const value = typeof metric.value === "number" ? metric.value : Number(metric.value);
    if (!Number.isFinite(value) || value < 0 || name === "UNKNOWN") return;
    const values = this.webVitals.get(name) ?? [];
    values.push(value);
    if (values.length > 1_000) values.splice(0, values.length - 1_000);
    this.webVitals.set(name, values);
    this.webVitalHistogram ??= metrics.getMeter('sentinel-web-vitals').createHistogram('web_vital_value', {
      description: 'Browser Core Web Vital values reported by the dashboard',
      unit: 'ms',
    });
    this.webVitalHistogram.record(value, { name });
  }

  private normalizeQuery(query: string): string {
    // Remove parameter values to group similar queries
    return query
      .replace(/\$\d+/g, '$N')
      .replace(/\$\d+::\w+/g, '$N::type')
      .replace(/'[^']*'/g, "'?'")
      .substring(0, 200);
  }

  getEndpointMetrics(path?: string, method?: string): EndpointMetrics[] {
    const key = path && method ? `${method} ${path}` : null;
    
    return Array.from(this.endpointMetrics.entries())
      .filter(([k]) => !key || k === key)
      .map(([k, v]) => {
         const [m, p] = k.split(' ') as [string, string];
        return {
           path: p || '/',
           method: m || 'GET',
          totalRequests: v.successes + v.errors,
          successCount: v.successes,
          errorCount: v.errors,
          latencyPercentiles: this.calculatePercentiles(v.latencies),
          errorRate: v.errors > 0 ? (v.errors / (v.successes + v.errors)) * 100 : 0,
          lastUpdated: new Date().toISOString(),
        };
      });
  }

  getQueryMetrics(pattern?: string): DatabaseQueryMetrics[] {
    return Array.from(this.queryMetrics.entries())
      .filter(([q]) => !pattern || q.includes(pattern))
      .map(([q, v]) => ({
        query: q,
        totalExecutions: v.executions,
        totalDurationMs: v.latencies.reduce((a, b) => a + b, 0),
        latencyPercentiles: this.calculatePercentiles(v.latencies),
        errorCount: v.errors,
        lastExecutedAt: new Date().toISOString(),
      }));
  }

  private calculatePercentiles(latencies: number[]): LatencyPercentiles {
    if (latencies.length === 0) {
      return { p50: 0, p75: 0, p90: 0, p95: 0, p99: 0, min: 0, max: 0, mean: 0, count: 0 };
    }

    const sorted = [...latencies].sort((a, b) => a - b);
    const percentile = (p: number) => {
      const index = Math.ceil((p / 100) * sorted.length) - 1;
      return sorted[Math.max(0, index)];
    };

    const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length;

    return {
       p50: percentile(50) ?? 0,
       p75: percentile(75) ?? 0,
       p90: percentile(90) ?? 0,
       p95: percentile(95) ?? 0,
       p99: percentile(99) ?? 0,
       min: sorted[0] ?? 0,
       max: sorted[sorted.length - 1] ?? 0,
      mean: Math.round(mean * 100) / 100,
      count: sorted.length,
    };
  }

  getSnapshot(): PerformanceSnapshot {
    return {
      timestamp: new Date().toISOString(),
      endpoints: new Map(
        this.getEndpointMetrics().map((m) => [`${m.method} ${m.path}`, m])
      ),
      queries: new Map(
        this.getQueryMetrics().map((m) => [m.query, m])
      ),
      webVitals: Object.fromEntries(
        [...this.webVitals.entries()].map(([name, values]) => [name, this.calculatePercentiles(values)]),
      ),
      systemHealth: {
        uptime: Date.now() - this.startTime,
        memoryUsage: process.memoryUsage(),
        eventLoopLag: this.eventLoopLag,
      },
    };
  }

  reset() {
    this.endpointMetrics.clear();
    this.queryMetrics.clear();
    this.webVitals.clear();
    this.startTime = Date.now();
  }
}

// Singleton instance
let instance: PerformanceObserver | null = null;

export function initializePerformanceObserver() {
  if (!instance) {
    instance = new PerformanceObserver();
  }
  return instance;
}

export function getPerformanceObserver() {
  return instance || initializePerformanceObserver();
}




/**
 * Wrapper for database queries to track performance
 */
export async function trackDatabaseQuery<T>(
  query: string,
  executor: () => Promise<T>
): Promise<T> {
  const startTime = Date.now();
  
  try {
    const result = await executor();
    const duration = Date.now() - startTime;
    getPerformanceObserver().recordQueryLatency(query, duration, false);
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    getPerformanceObserver().recordQueryLatency(query, duration, true);
    throw error;
  }
}
