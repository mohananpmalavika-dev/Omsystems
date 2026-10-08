/**
 * Heatmap Service
 * 
 * High-level service for querying and aggregating heatmaps.
 * Coordinates between accumulators, storage, and rendering.
 */

import { HeatmapStore } from './heatmap-store.js';
import {
    HeatmapQuery,
    AggregatedHeatmap,
    HeatmapBucket,
    HeatmapMetric,
} from './heatmap-types.js';
import { TrackedObjectType } from '../tracking.js';

export interface HeatmapServiceConfig {
    store: HeatmapStore;
}

/**
 * Service for querying and aggregating heatmaps
 */
export class HeatmapService {
    private readonly store: HeatmapStore;

    constructor(config: HeatmapServiceConfig) {
        this.store = config.store;
    }

    /**
     * Get aggregated heatmap for time range
     */
    async getHeatmap(query: HeatmapQuery): Promise<AggregatedHeatmap | null> {
        const metric = query.metric ?? 'traffic';

        // Query buckets from storage
        const buckets = await this.store.query(
            query.tenantId,
            query.cameraId,
            metric,
            query.from,
            query.to,
        );

        if (buckets.length === 0) {
            return null;
        }

        // Filter by object types if specified
        let filteredBuckets = buckets;
        if (query.objectTypes && query.objectTypes.length > 0) {
            // For now, we don't filter since buckets already contain filtered data
            // Object type filtering happens during accumulation
            filteredBuckets = buckets;
        }

        // Aggregate buckets
        return this.aggregateBuckets(
            query.cameraId,
            metric,
            query.from,
            query.to,
            filteredBuckets,
        );
    }

    /**
     * Get latest heatmap (most recent bucket)
     */
    async getLatestHeatmap(
        tenantId: string,
        cameraId: string,
        metric: HeatmapMetric = 'traffic',
    ): Promise<HeatmapBucket | null> {
        const now = Date.now();
        const oneHourAgo = now - 3600000;

        const buckets = await this.store.query(
            tenantId,
            cameraId,
            metric,
            oneHourAgo,
            now,
        );

        if (buckets.length === 0) {
            return null;
        }

        // Return most recent bucket
        return buckets[buckets.length - 1];
    }

    /**
     * Get heatmap for specific time bucket
     */
    async getBucket(
        tenantId: string,
        cameraId: string,
        metric: HeatmapMetric,
        bucketStart: number,
    ): Promise<HeatmapBucket | null> {
        return await this.store.retrieve(
            tenantId,
            cameraId,
            metric,
            bucketStart,
        );
    }

    /**
     * Compare two time periods
     */
    async compareHeatmaps(
        tenantId: string,
        cameraId: string,
        metric: HeatmapMetric,
        period1: { from: number; to: number },
        period2: { from: number; to: number },
    ): Promise<{
        period1: AggregatedHeatmap | null;
        period2: AggregatedHeatmap | null;
        difference: Float32Array | null;
    }> {
        const [heatmap1, heatmap2] = await Promise.all([
            this.getHeatmap({
                tenantId,
                cameraId,
                metric,
                from: period1.from,
                to: period1.to,
            }),
            this.getHeatmap({
                tenantId,
                cameraId,
                metric,
                from: period2.from,
                to: period2.to,
            }),
        ]);

        let difference: Float32Array | null = null;

        if (heatmap1 && heatmap2) {
            // Calculate difference (period2 - period1)
            difference = new Float32Array(heatmap1.grid.length);
            
            for (let i = 0; i < difference.length; i++) {
                difference[i] = heatmap2.grid[i] - heatmap1.grid[i];
            }
        }

        return {
            period1: heatmap1,
            period2: heatmap2,
            difference,
        };
    }

    /**
     * Get hotspot locations (top N cells by value)
     */
    getHotspots(
        heatmap: AggregatedHeatmap,
        topN = 10,
    ): Array<{
        x: number;
        y: number;
        value: number;
        normalizedX: number;
        normalizedY: number;
    }> {
        const cells: Array<{
            x: number;
            y: number;
            value: number;
        }> = [];

        // Collect all non-zero cells
        for (let y = 0; y < heatmap.height; y++) {
            for (let x = 0; x < heatmap.width; x++) {
                const idx = y * heatmap.width + x;
                const value = heatmap.grid[idx];

                if (value > 0) {
                    cells.push({ x, y, value });
                }
            }
        }

        // Sort by value descending
        cells.sort((a, b) => b.value - a.value);

        // Take top N and add normalized coordinates
        return cells.slice(0, topN).map(cell => ({
            ...cell,
            normalizedX: cell.x / heatmap.width,
            normalizedY: cell.y / heatmap.height,
        }));
    }

    /**
     * Calculate heatmap statistics
     */
    calculateStats(heatmap: AggregatedHeatmap) {
        const nonZeroValues: number[] = [];
        
        for (let i = 0; i < heatmap.grid.length; i++) {
            const value = heatmap.grid[i];
            if (value > 0) {
                nonZeroValues.push(value);
            }
        }

        if (nonZeroValues.length === 0) {
            return {
                min: 0,
                max: 0,
                mean: 0,
                median: 0,
                percentile95: 0,
                percentile99: 0,
                coverage: 0,
            };
        }

        nonZeroValues.sort((a, b) => a - b);

        const min = nonZeroValues[0];
        const max = nonZeroValues[nonZeroValues.length - 1];
        const sum = nonZeroValues.reduce((a, b) => a + b, 0);
        const mean = sum / nonZeroValues.length;
        const median = this.getPercentile(nonZeroValues, 0.5);
        const percentile95 = this.getPercentile(nonZeroValues, 0.95);
        const percentile99 = this.getPercentile(nonZeroValues, 0.99);
        const coverage = nonZeroValues.length / heatmap.grid.length;

        return {
            min,
            max,
            mean,
            median,
            percentile95,
            percentile99,
            coverage,
        };
    }

    /**
     * Delete old heatmap data
     */
    async cleanup(
        tenantId: string,
        cameraId: string,
        metric: HeatmapMetric,
        beforeTimestamp: number,
    ): Promise<number> {
        return await this.store.deleteOldBuckets(
            tenantId,
            cameraId,
            metric,
            beforeTimestamp,
        );
    }

    // --- Private methods ---

    /**
     * Aggregate multiple buckets into single heatmap
     */
    private aggregateBuckets(
        cameraId: string,
        metric: HeatmapMetric,
        from: number,
        to: number,
        buckets: HeatmapBucket[],
    ): AggregatedHeatmap {
        if (buckets.length === 0) {
            throw new Error('Cannot aggregate empty bucket list');
        }

        const firstBucket = buckets[0];
        const width = firstBucket.width;
        const height = firstBucket.height;

        // Aggregate grids
        const aggregatedGrid = new Float32Array(width * height);
        let totalSamples = 0;
        let totalTracks = 0;

        for (const bucket of buckets) {
            // Validate dimensions match
            if (bucket.width !== width || bucket.height !== height) {
                console.warn(
                    `[HeatmapService] Bucket dimension mismatch: expected ${width}x${height}, got ${bucket.width}x${bucket.height}`,
                );
                continue;
            }

            // Add bucket grid to aggregate
            for (let i = 0; i < aggregatedGrid.length; i++) {
                aggregatedGrid[i] += bucket.grid[i];
            }

            totalSamples += bucket.sampleCount;
            totalTracks += bucket.trackCount;
        }

        // Calculate statistics
        let min = Infinity;
        let max = -Infinity;
        let sum = 0;

        for (let i = 0; i < aggregatedGrid.length; i++) {
            const value = aggregatedGrid[i];
            if (value > 0) {
                min = Math.min(min, value);
                max = Math.max(max, value);
                sum += value;
            }
        }

        return {
            cameraId,
            metric,
            from,
            to,
            width,
            height,
            grid: aggregatedGrid,
            statistics: {
                samples: totalSamples,
                tracks: totalTracks,
                min: min === Infinity ? 0 : min,
                max: max === -Infinity ? 0 : max,
                mean: sum / aggregatedGrid.length,
                buckets: buckets.length,
            },
        };
    }

    /**
     * Calculate percentile from sorted array
     */
    private getPercentile(sortedValues: number[], percentile: number): number {
        if (sortedValues.length === 0) {
            return 0;
        }

        const index = Math.ceil(sortedValues.length * percentile) - 1;
        return sortedValues[Math.max(0, Math.min(index, sortedValues.length - 1))];
    }
}
