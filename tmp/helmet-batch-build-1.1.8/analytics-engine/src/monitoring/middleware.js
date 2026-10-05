/**
 * Monitoring Middleware for Fastify Applications
 * Provides request tracking, performance profiling, and system metrics collection
 */
import { randomUUID } from 'crypto';
import * as os from 'os';
import { recordHTTPRequest, activeConnections, updateSystemMetrics, getMetricsText, getMetricsJSON, serviceUptime } from './metrics.js';
import { logger } from './logger.js';
// Track service start time
const SERVICE_START_TIME = Date.now();
// Update service uptime every 10 seconds
setInterval(() => {
    const uptimeSeconds = Math.floor((Date.now() - SERVICE_START_TIME) / 1000);
    serviceUptime.set(uptimeSeconds);
}, 10000);
/**
 * Register monitoring hooks on Fastify instance
 */
export function registerMonitoringHooks(fastify) {
    // Add request ID to all requests
    fastify.addHook('onRequest', async (request, reply) => {
        const requestId = request.headers['x-request-id'] || randomUUID();
        request.requestId = requestId;
        reply.header('X-Request-ID', requestId);
    });
    // Log incoming requests
    fastify.addHook('onRequest', async (request) => {
        const context = {
            requestId: request.requestId,
            method: request.method,
            url: request.url,
            ip: request.ip
        };
        logger.info('Incoming request', context, {
            headers: {
                ...request.headers,
                authorization: "[redacted]",
                cookie: "[redacted]",
                "x-analytics-source-key": "[redacted]",
                "x-sentinel-session": "[redacted]",
            },
            query: request.query
        }, 'http');
        activeConnections.inc();
        // Store start time on request for duration calculation
        request.startTime = Date.now();
    });
    // Track request metrics
    fastify.addHook('onResponse', async (request, reply) => {
        activeConnections.dec();
        const start = request.startTime || Date.now();
        const duration = Date.now() - start; // Calculate duration in milliseconds
        const durationSeconds = duration / 1000; // Convert to seconds
        const route = request.routeOptions?.url || request.url;
        const requestSize = parseInt(request.headers['content-length'] || '0', 10);
        // Get response size from reply (Fastify doesn't expose this easily, approximate it)
        const responseSize = 0; // Would need custom plugin to track accurately
        recordHTTPRequest(request.method, route, reply.statusCode, duration, requestSize, responseSize);
        // Record in performance profiler
        performanceProfiler.record(route, duration * 1000); // Convert back to ms
        // Log request completion
        const context = {
            requestId: request.requestId,
            method: request.method,
            url: request.url
        };
        if (reply.statusCode >= 400) {
            logger.warn('Request failed', context, {
                status: reply.statusCode,
                duration
            }, 'http');
        }
        else {
            logger.debug('Request completed', context, {
                status: reply.statusCode,
                duration
            }, 'http');
        }
    });
    // Log errors
    fastify.addHook('onError', async (request, reply, error) => {
        const context = {
            requestId: request.requestId,
            method: request.method,
            url: request.url,
            ip: request.ip
        };
        logger.error('Request error', error, context, {
            body: request.body,
            query: request.query,
            params: request.params
        }, 'http');
    });
}
/**
 * System Metrics Collector
 * Periodically collects system metrics (CPU, memory, disk)
 */
export class SystemMetricsCollector {
    intervalId;
    collectInterval;
    constructor(collectInterval = 10000) {
        this.collectInterval = collectInterval;
    }
    /**
     * Start collecting metrics
     */
    start() {
        if (this.intervalId) {
            return;
        }
        // Collect immediately
        this.collect();
        // Then collect at interval
        this.intervalId = setInterval(() => {
            this.collect();
        }, this.collectInterval);
        logger.info('System metrics collector started', undefined, {
            interval: this.collectInterval
        }, 'monitoring');
    }
    /**
     * Stop collecting metrics
     */
    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = undefined;
            logger.info('System metrics collector stopped', undefined, undefined, 'monitoring');
        }
    }
    /**
     * Collect system metrics
     */
    collect() {
        try {
            const metrics = {
                cpuUsage: this.getCPUUsage(),
                memoryUsage: process.memoryUsage().heapUsed,
                memoryTotal: os.totalmem(),
                diskUsage: this.getDiskUsage()
            };
            updateSystemMetrics(metrics);
            logger.debug('System metrics collected', undefined, metrics, 'monitoring');
        }
        catch (error) {
            logger.error('Failed to collect system metrics', error, undefined, undefined, 'monitoring');
        }
    }
    /**
     * Get CPU usage percentage
     */
    getCPUUsage() {
        const cpus = os.cpus();
        let totalIdle = 0;
        let totalTick = 0;
        for (const cpu of cpus) {
            for (const type in cpu.times) {
                totalTick += cpu.times[type];
            }
            totalIdle += cpu.times.idle;
        }
        const idle = totalIdle / cpus.length;
        const total = totalTick / cpus.length;
        const usage = 100 - Math.floor((idle / total) * 100);
        return usage;
    }
    /**
     * Get disk usage
     */
    getDiskUsage() {
        // This is a simplified version - in production, use a library like 'diskusage'
        // For now, we'll just return the home directory usage
        try {
            const homedir = os.homedir();
            return [
                {
                    mountPoint: homedir,
                    usage: 0 // Placeholder - would need native module for accurate disk usage
                }
            ];
        }
        catch (error) {
            return [];
        }
    }
}
/**
 * Health Check Handler for Fastify
 */
export async function healthCheckHandler(request, reply) {
    const uptime = Math.floor((Date.now() - SERVICE_START_TIME) / 1000);
    const memoryUsage = process.memoryUsage();
    const health = {
        status: 'healthy',
        uptime,
        timestamp: new Date().toISOString(),
        service: 'analytics-engine',
        version: process.env.npm_package_version || '1.0.0',
        memory: {
            heapUsed: Math.floor(memoryUsage.heapUsed / 1024 / 1024) + 'MB',
            heapTotal: Math.floor(memoryUsage.heapTotal / 1024 / 1024) + 'MB',
            rss: Math.floor(memoryUsage.rss / 1024 / 1024) + 'MB'
        },
        system: {
            cpus: os.cpus().length,
            totalMemory: Math.floor(os.totalmem() / 1024 / 1024 / 1024) + 'GB',
            freeMemory: Math.floor(os.freemem() / 1024 / 1024 / 1024) + 'GB',
            platform: os.platform(),
            arch: os.arch(),
            nodeVersion: process.version
        }
    };
    reply.send(health);
}
/**
 * Readiness Check Handler
 */
export async function readinessCheckHandler(request, reply) {
    // Check if service is ready (models loaded, connections established, etc.)
    const checks = {
        service: true, // Service is running
        models: true, // Models are loaded (would check actual model status)
        database: true // Database is connected (would check actual DB connection)
    };
    const ready = Object.values(checks).every(check => check);
    if (ready) {
        reply.send({
            status: 'ready',
            checks,
            timestamp: new Date().toISOString()
        });
    }
    else {
        reply.code(503).send({
            status: 'not ready',
            checks,
            timestamp: new Date().toISOString()
        });
    }
}
/**
 * Liveness Check Handler
 */
export async function livenessCheckHandler(request, reply) {
    reply.send({
        status: 'alive',
        timestamp: new Date().toISOString()
    });
}
/**
 * Metrics Endpoint Handler
 */
export async function metricsEndpointHandler(request, reply) {
    try {
        const metrics = await getMetricsText();
        reply.type('text/plain; version=0.0.4').send(metrics);
    }
    catch (error) {
        logger.error('Failed to get metrics', error, { requestId: request.requestId }, undefined, 'monitoring');
        reply.code(500).send({ error: 'Failed to get metrics' });
    }
}
/**
 * Metrics JSON Endpoint Handler
 */
export async function metricsJSONEndpointHandler(request, reply) {
    try {
        const metrics = await getMetricsJSON();
        reply.send(metrics);
    }
    catch (error) {
        logger.error('Failed to get metrics JSON', error, { requestId: request.requestId }, undefined, 'monitoring');
        reply.code(500).send({ error: 'Failed to get metrics' });
    }
}
/**
 * Performance Profiler
 * Profiles request performance and identifies slow endpoints
 */
export class PerformanceProfiler {
    profiles = new Map();
    /**
     * Record request performance
     */
    record(route, duration) {
        const profile = this.profiles.get(route);
        if (!profile) {
            this.profiles.set(route, {
                count: 1,
                totalDuration: duration,
                minDuration: duration,
                maxDuration: duration,
                avgDuration: duration
            });
        }
        else {
            profile.count++;
            profile.totalDuration += duration;
            profile.minDuration = Math.min(profile.minDuration, duration);
            profile.maxDuration = Math.max(profile.maxDuration, duration);
            profile.avgDuration = profile.totalDuration / profile.count;
        }
    }
    /**
     * Get performance profile for a route
     */
    getProfile(route) {
        return this.profiles.get(route);
    }
    /**
     * Get all performance profiles
     */
    getAllProfiles() {
        return Array.from(this.profiles.entries()).map(([route, profile]) => ({
            route,
            ...profile
        }));
    }
    /**
     * Get slow endpoints (avg duration > threshold)
     */
    getSlowEndpoints(thresholdMs = 1000) {
        return this.getAllProfiles()
            .filter(profile => profile.avgDuration > thresholdMs)
            .sort((a, b) => b.avgDuration - a.avgDuration);
    }
    /**
     * Clear all profiles
     */
    clear() {
        this.profiles.clear();
    }
}
// Export singleton instances
export const systemMetricsCollector = new SystemMetricsCollector();
export const performanceProfiler = new PerformanceProfiler();
