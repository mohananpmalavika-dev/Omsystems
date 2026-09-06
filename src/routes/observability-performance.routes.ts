/**
 * Performance observability API routes
 * Exposes metrics for dashboard consumption
 */

import type { FastifyInstance } from 'fastify';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { getPerformanceObserver } from '../observability/performance-observer.js';

/**
 * Fastify middleware to track request latencies
 */
export async function performanceTrackingMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const startTime = Date.now();
  
  const onSend = async (payload: any) => {
    const duration = Date.now() - startTime;
    const isError = reply.statusCode >= 400;
    
    getPerformanceObserver().recordEndpointLatency(
      request.url,
      request.method,
      duration,
      isError
    );

    return payload;
  };

  reply.onSend(onSend);
}
export async function registerPerformanceObservabilityRoutes(app: FastifyInstance) {
  /**
   * GET /api/observability/performance/endpoints
   * Returns endpoint latency metrics with percentiles
   */
  app.get(
   * Fastify hook to track request latencies
   * Should be registered with: app.addHook("onResponse", performanceTrackingMiddleware)
   */
  /**
   */
    async (request, reply) => {
  export function performanceTrackingMiddleware(
    request: FastifyRequest,
    reply: FastifyReply
  ) {
    const startTime = Date.now();
  
    // Store start time on request for use in response hook
    (request as any).__performanceStart = startTime;
  }
      const { method, path } = request.params as { method: string; path: string };
  export function performanceTrackingResponseHook(
    request: FastifyRequest,
    reply: FastifyReply
  ) {
    const startTime = (request as any).__performanceStart ?? Date.now();
    const duration = Date.now() - startTime;
    const isError = reply.statusCode >= 400;
  
    getPerformanceObserver().recordEndpointLatency(
      request.url,
      request.method,
      duration,
      isError
    );
  }
      const observer = getPerformanceObserver();
      const metrics = observer.getEndpointMetrics(path, method.toUpperCase());
      
      return reply.send({
        success: true,
        data: metrics[0] || null,
      });
    }
  );

  /**
   * GET /api/observability/performance/queries
   * Returns database query performance metrics
   */
  app.get(
    '/api/observability/performance/queries',
    async (request, reply) => {
      const { pattern } = request.query as { pattern?: string };
      const observer = getPerformanceObserver();
      const metrics = observer.getQueryMetrics(pattern);
      
      // Sort by P95 latency descending
      metrics.sort((a, b) => b.latencyPercentiles.p95 - a.latencyPercentiles.p95);
      
      return reply.send({
        success: true,
        data: {
          queries: metrics.slice(0, 50), // Top 50 slowest
          total: metrics.length,
          timestamp: new Date().toISOString(),
        },
      });
    }
  );

  /**
   * GET /api/observability/performance/snapshot
   * Returns full performance snapshot including system health
   */
  app.get(
    '/api/observability/performance/snapshot',
    async (request, reply) => {
      const observer = getPerformanceObserver();
      const snapshot = observer.getSnapshot();
      
      return reply.send({
        success: true,
        data: {
          timestamp: snapshot.timestamp,
          endpoints: Array.from(snapshot.endpoints.values()),
          queries: Array.from(snapshot.queries.values()),
          systemHealth: {
            uptime: snapshot.systemHealth.uptime,
            memory: {
              heapUsed: Math.round(snapshot.systemHealth.memoryUsage.heapUsed / 1024 / 1024),
              heapTotal: Math.round(snapshot.systemHealth.memoryUsage.heapTotal / 1024 / 1024),
              external: Math.round(snapshot.systemHealth.memoryUsage.external / 1024 / 1024),
              rss: Math.round(snapshot.systemHealth.memoryUsage.rss / 1024 / 1024),
            },
            eventLoopLag: snapshot.systemHealth.eventLoopLag,
          },
        },
      });
    }
  );

  /**
   * GET /api/observability/performance/health
   * Quick health check with key metrics
   */
  app.get(
    '/api/observability/performance/health',
    async (request, reply) => {
      const observer = getPerformanceObserver();
      const snapshot = observer.getSnapshot();
      
      // Calculate overall health score
      const endpoints = Array.from(snapshot.endpoints.values());
      const avgErrorRate = endpoints.reduce((sum, e) => sum + e.errorRate, 0) / Math.max(1, endpoints.length);
      const maxLatencyP99 = Math.max(...endpoints.map((e) => e.latencyPercentiles.p99), 0);
      
      const healthScore = Math.max(0, 100 - avgErrorRate - Math.min(maxLatencyP99 / 10, 50));
      
      return reply.send({
        success: true,
        data: {
          status: healthScore > 80 ? 'healthy' : healthScore > 50 ? 'degraded' : 'critical',
          healthScore: Math.round(healthScore),
          metrics: {
            endpointCount: endpoints.length,
            avgErrorRate: Math.round(avgErrorRate * 100) / 100,
            maxP99Latency: Math.round(maxLatencyP99),
            eventLoopLag: snapshot.systemHealth.eventLoopLag,
            memoryUsageMB: Math.round(snapshot.systemHealth.memoryUsage.heapUsed / 1024 / 1024),
          },
          timestamp: snapshot.timestamp,
        },
      });
    }
  );

  /**
   * POST /api/observability/web-vitals
   * Collect Core Web Vitals from dashboard
   */
  app.post(
    '/api/observability/web-vitals',
    async (request, reply) => {
      const payload = request.body as any;
      
      // Store metrics in observability system
      // In production, send to dedicated metrics backend (Prometheus, DataDog, etc.)
      
      return reply.send({
        success: true,
        data: {
          received: true,
          metrics: payload.webVitals?.length ?? 0,
        },
      });
    }
  );

  /**
   * GET /api/observability/performance/top-slow-endpoints
   * Returns endpoints with highest P95 latency
   */
  app.get(
    '/api/observability/performance/top-slow-endpoints',
    async (request, reply) => {
      const { limit } = request.query as { limit?: string };
      const observer = getPerformanceObserver();
      const metrics = observer.getEndpointMetrics();
      
      // Sort by P95 descending
      metrics.sort((a, b) => b.latencyPercentiles.p95 - a.latencyPercentiles.p95);
      
      return reply.send({
        success: true,
        data: {
          endpoints: metrics.slice(0, Math.min(parseInt(limit || '10'), 50)),
          timestamp: new Date().toISOString(),
        },
      });
    }
  );

  /**
   * GET /api/observability/performance/top-slow-queries
   * Returns database queries with highest P95 latency
   */
  app.get(
    '/api/observability/performance/top-slow-queries',
    async (request, reply) => {
      const { limit } = request.query as { limit?: string };
      const observer = getPerformanceObserver();
      const metrics = observer.getQueryMetrics();
      
      // Sort by P95 descending
      metrics.sort((a, b) => b.latencyPercentiles.p95 - a.latencyPercentiles.p95);
      
      return reply.send({
        success: true,
        data: {
          queries: metrics.slice(0, Math.min(parseInt(limit || '10'), 50)),
          timestamp: new Date().toISOString(),
        },
      });
    }
  );
}
