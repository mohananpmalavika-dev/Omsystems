/**
 * Heatmap API Routes
 * 
 * Complete heatmap endpoints with:
 * - JSON grid data
 * - PNG/JPEG image rendering
 * - Transparent overlays
 * - Time range queries
 * - Comparison views
 * - Hotspot extraction
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { HeatmapService } from '../heatmaps/heatmap-service.js';
import type { HeatmapRenderer } from '../heatmaps/heatmap-renderer.js';
import type { HeatmapMetric, HeatmapNormalization } from '../heatmaps/heatmap-types.js';
import type { TrackedObjectType } from '../tracking/index.js';

export interface HeatmapApiConfig {
    heatmapService: HeatmapService;
    heatmapRenderer: HeatmapRenderer;
    snapshotService?: {
        getCameraSnapshot(cameraId: string): Promise<Buffer | null>;
    };
}

/**
 * Register heatmap API routes
 */
export async function registerHeatmapApiRoutes(
    app: FastifyInstance,
    config: HeatmapApiConfig,
) {
    const { heatmapService, heatmapRenderer, snapshotService } = config;

    /**
     * Query heatmap data
     * 
     * GET /v1/analytics/heatmaps/:cameraId
     * 
     * Query parameters:
     * - from: Start timestamp (ISO 8601 or Unix ms)
     * - to: End timestamp (ISO 8601 or Unix ms)
     * - metric: traffic|occupancy|dwell|entry_density
     * - objectTypes: person,vehicle,bicycle (comma-separated)
     * - format: json|png|jpeg
     * - overlay: true|false (include camera snapshot)
     * - normalization: linear|log|percentile
     * - percentile: 0.99 (for percentile normalization)
     * - opacity: 0.65 (overlay opacity)
     * - colormap: jet|viridis|hot|cool
     * - width: Output width (for images)
     * - height: Output height (for images)
     */
    app.get('/v1/analytics/heatmaps/:cameraId', async (request, reply) => {
        const params = z.object({
            cameraId: z.string(),
        }).parse(request.params);

        const query = z.object({
            from: z.string().optional(),
            to: z.string().optional(),
            metric: z.enum(['traffic', 'occupancy', 'dwell', 'entry_density']).default('traffic'),
            objectTypes: z.string().optional(),
            format: z.enum(['json', 'png', 'jpeg']).default('json'),
            overlay: z.enum(['true', 'false']).default('false'),
            normalization: z.enum(['linear', 'log', 'percentile']).default('log'),
            percentile: z.coerce.number().min(0).max(1).default(0.99),
            opacity: z.coerce.number().min(0).max(1).default(0.65),
            colormap: z.enum(['jet', 'viridis', 'hot', 'cool']).default('jet'),
            width: z.coerce.number().int().positive().optional(),
            height: z.coerce.number().int().positive().optional(),
        }).parse(request.query);

        // Parse time range (default to last hour)
        const now = Date.now();
        const from = query.from
            ? new Date(query.from).getTime()
            : now - 3600000; // 1 hour ago
        const to = query.to
            ? new Date(query.to).getTime()
            : now;

        // Parse object types
        const objectTypes = query.objectTypes
            ? query.objectTypes.split(',').map(t => t.trim() as TrackedObjectType)
            : undefined;

        // Get tenant from request (authentication middleware should set this)
        const tenantId = (request as any).user?.tenantId || 'default';

        // Query heatmap data
        const heatmap = await heatmapService.getHeatmap({
            tenantId,
            cameraId: params.cameraId,
            from,
            to,
            metric: query.metric as HeatmapMetric,
            objectTypes,
        });

        if (!heatmap) {
            return reply.code(404).send({
                error: 'heatmap_not_found',
                message: 'No heatmap data available for the specified time range',
                cameraId: params.cameraId,
                from: new Date(from).toISOString(),
                to: new Date(to).toISOString(),
            });
        }

        // Return JSON format
        if (query.format === 'json') {
            return {
                cameraId: heatmap.cameraId,
                metric: heatmap.metric,
                from: new Date(heatmap.from).toISOString(),
                to: new Date(heatmap.to).toISOString(),
                width: heatmap.width,
                height: heatmap.height,
                data: Array.from(heatmap.grid),
                statistics: heatmap.statistics,
            };
        }

        // Render image format
        const outputWidth = query.width || 1920;
        const outputHeight = query.height || 1080;

        let background: Buffer | undefined;
        if (query.overlay === 'true' && snapshotService) {
            const snapshot = await snapshotService.getCameraSnapshot(params.cameraId);
            if (snapshot) {
                background = snapshot;
            }
        }

        const imageBuffer = query.format === 'png'
            ? await heatmapRenderer.renderPNG({
                grid: heatmap.grid,
                width: heatmap.width,
                height: heatmap.height,
                outputWidth,
                outputHeight,
                normalization: query.normalization as HeatmapNormalization,
                percentile: query.percentile,
                background,
                opacity: query.opacity,
                colormap: query.colormap,
            })
            : await heatmapRenderer.renderJPEG({
                grid: heatmap.grid,
                width: heatmap.width,
                height: heatmap.height,
                outputWidth,
                outputHeight,
                normalization: query.normalization as HeatmapNormalization,
                percentile: query.percentile,
                background,
                opacity: query.opacity,
                colormap: query.colormap,
            });

        reply.header(
            'Content-Type',
            query.format === 'png' ? 'image/png' : 'image/jpeg',
        );

        return reply.send(imageBuffer);
    });

    /**
     * Get latest heatmap (most recent bucket)
     */
    app.get('/v1/analytics/heatmaps/:cameraId/latest', async (request, reply) => {
        const params = z.object({
            cameraId: z.string(),
        }).parse(request.params);

        const query = z.object({
            metric: z.enum(['traffic', 'occupancy', 'dwell', 'entry_density']).default('traffic'),
            format: z.enum(['json', 'png', 'jpeg']).default('json'),
        }).parse(request.query);

        const tenantId = (request as any).user?.tenantId || 'default';

        const bucket = await heatmapService.getLatestHeatmap(
            tenantId,
            params.cameraId,
            query.metric as HeatmapMetric,
        );

        if (!bucket) {
            return reply.code(404).send({
                error: 'heatmap_not_found',
                message: 'No recent heatmap data available',
                cameraId: params.cameraId,
            });
        }

        if (query.format === 'json') {
            return {
                cameraId: bucket.cameraId,
                metric: bucket.metric,
                bucketStart: new Date(bucket.bucketStart).toISOString(),
                bucketEnd: new Date(bucket.bucketEnd).toISOString(),
                width: bucket.width,
                height: bucket.height,
                data: Array.from(bucket.grid),
                sampleCount: bucket.sampleCount,
                trackCount: bucket.trackCount,
                min: bucket.min,
                max: bucket.max,
            };
        }

        // Render image
        const imageBuffer = query.format === 'png'
            ? await heatmapRenderer.renderPNG({
                grid: bucket.grid,
                width: bucket.width,
                height: bucket.height,
                outputWidth: 1920,
                outputHeight: 1080,
            })
            : await heatmapRenderer.renderJPEG({
                grid: bucket.grid,
                width: bucket.width,
                height: bucket.height,
                outputWidth: 1920,
                outputHeight: 1080,
            });

        reply.header(
            'Content-Type',
            query.format === 'png' ? 'image/png' : 'image/jpeg',
        );

        return reply.send(imageBuffer);
    });

    /**
     * Get hotspots (top intensity locations)
     */
    app.get('/v1/analytics/heatmaps/:cameraId/hotspots', async (request, reply) => {
        const params = z.object({
            cameraId: z.string(),
        }).parse(request.params);

        const query = z.object({
            from: z.string().optional(),
            to: z.string().optional(),
            metric: z.enum(['traffic', 'occupancy', 'dwell', 'entry_density']).default('traffic'),
            topN: z.coerce.number().int().positive().default(10),
        }).parse(request.query);

        const now = Date.now();
        const from = query.from ? new Date(query.from).getTime() : now - 3600000;
        const to = query.to ? new Date(query.to).getTime() : now;

        const tenantId = (request as any).user?.tenantId || 'default';

        const heatmap = await heatmapService.getHeatmap({
            tenantId,
            cameraId: params.cameraId,
            from,
            to,
            metric: query.metric as HeatmapMetric,
        });

        if (!heatmap) {
            return reply.code(404).send({
                error: 'heatmap_not_found',
                message: 'No heatmap data available',
            });
        }

        const hotspots = heatmapService.getHotspots(heatmap, query.topN);

        return {
            cameraId: heatmap.cameraId,
            metric: heatmap.metric,
            from: new Date(heatmap.from).toISOString(),
            to: new Date(heatmap.to).toISOString(),
            hotspots,
        };
    });

    /**
     * Compare two time periods
     */
    app.get('/v1/analytics/heatmaps/:cameraId/compare', async (request, reply) => {
        const params = z.object({
            cameraId: z.string(),
        }).parse(request.params);

        const query = z.object({
            period1From: z.string(),
            period1To: z.string(),
            period2From: z.string(),
            period2To: z.string(),
            metric: z.enum(['traffic', 'occupancy', 'dwell', 'entry_density']).default('traffic'),
        }).parse(request.query);

        const tenantId = (request as any).user?.tenantId || 'default';

        const comparison = await heatmapService.compareHeatmaps(
            tenantId,
            params.cameraId,
            query.metric as HeatmapMetric,
            {
                from: new Date(query.period1From).getTime(),
                to: new Date(query.period1To).getTime(),
            },
            {
                from: new Date(query.period2From).getTime(),
                to: new Date(query.period2To).getTime(),
            },
        );

        if (!comparison.period1 || !comparison.period2) {
            return reply.code(404).send({
                error: 'insufficient_data',
                message: 'Not enough data for comparison',
            });
        }

        return {
            cameraId: params.cameraId,
            metric: query.metric,
            period1: {
                from: new Date(comparison.period1.from).toISOString(),
                to: new Date(comparison.period1.to).toISOString(),
                statistics: comparison.period1.statistics,
            },
            period2: {
                from: new Date(comparison.period2.from).toISOString(),
                to: new Date(comparison.period2.to).toISOString(),
                statistics: comparison.period2.statistics,
            },
            difference: comparison.difference ? {
                min: Math.min(...Array.from(comparison.difference)),
                max: Math.max(...Array.from(comparison.difference)),
                data: Array.from(comparison.difference),
            } : null,
        };
    });

    /**
     * Get heatmap statistics
     */
    app.get('/v1/analytics/heatmaps/:cameraId/statistics', async (request, reply) => {
        const params = z.object({
            cameraId: z.string(),
        }).parse(request.params);

        const query = z.object({
            from: z.string().optional(),
            to: z.string().optional(),
            metric: z.enum(['traffic', 'occupancy', 'dwell', 'entry_density']).default('traffic'),
        }).parse(request.query);

        const now = Date.now();
        const from = query.from ? new Date(query.from).getTime() : now - 3600000;
        const to = query.to ? new Date(query.to).getTime() : now;

        const tenantId = (request as any).user?.tenantId || 'default';

        const heatmap = await heatmapService.getHeatmap({
            tenantId,
            cameraId: params.cameraId,
            from,
            to,
            metric: query.metric as HeatmapMetric,
        });

        if (!heatmap) {
            return reply.code(404).send({
                error: 'heatmap_not_found',
            });
        }

        const stats = heatmapService.calculateStats(heatmap);

        return {
            cameraId: heatmap.cameraId,
            metric: heatmap.metric,
            from: new Date(heatmap.from).toISOString(),
            to: new Date(heatmap.to).toISOString(),
            statistics: {
                ...heatmap.statistics,
                ...stats,
            },
        };
    });

    /**
     * Delete old heatmap data (cleanup)
     */
    app.delete('/v1/analytics/heatmaps/:cameraId', async (request, reply) => {
        const params = z.object({
            cameraId: z.string(),
        }).parse(request.params);

        const query = z.object({
            before: z.string(),
            metric: z.enum(['traffic', 'occupancy', 'dwell', 'entry_density']).default('traffic'),
        }).parse(request.query);

        const tenantId = (request as any).user?.tenantId || 'default';
        const beforeTimestamp = new Date(query.before).getTime();

        const deleted = await heatmapService.cleanup(
            tenantId,
            params.cameraId,
            query.metric as HeatmapMetric,
            beforeTimestamp,
        );

        return {
            success: true,
            cameraId: params.cameraId,
            metric: query.metric,
            deleted,
            before: new Date(beforeTimestamp).toISOString(),
        };
    });
}
