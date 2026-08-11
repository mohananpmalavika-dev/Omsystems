/**
 * Heatmap type definitions
 */

import { TrackedObjectType } from '../tracking';

/**
 * Heatmap metric types - different semantic meanings
 */
export type HeatmapMetric =
    | 'traffic'      // Where did objects move? (count-based)
    | 'occupancy'    // Where did objects spend time? (dwell-based)
    | 'dwell'        // Weighted by time spent
    | 'entry_density'; // Where do tracks first appear?

/**
 * Normalization strategies for rendering
 */
export type HeatmapNormalization =
    | 'linear'       // Direct linear mapping
    | 'log'          // Logarithmic (better for high-dynamic-range)
    | 'percentile';  // Clip at percentile to handle outliers

/**
 * Heatmap configuration per camera
 */
export interface HeatmapConfig {
    /** Grid dimensions (normalized space) */
    width: number;
    height: number;

    /** Object types to include */
    objectTypes: TrackedObjectType[];

    /** Minimum sampling interval per track (milliseconds) */
    sampleIntervalMs: number;

    /** Gaussian kernel radius (grid cells) */
    kernelRadius: number;

    /** Decay half-life for live heatmaps (milliseconds) */
    decayHalfLifeMs?: number;

    /** Time bucket size for historical heatmaps (milliseconds) */
    bucketSizeMs: number;

    /** Maximum buckets to retain in memory */
    maxMemoryBuckets: number;

    /** Heatmap metric type */
    metric: HeatmapMetric;
}

/**
 * Default heatmap configuration
 */
export const DEFAULT_HEATMAP_CONFIG: HeatmapConfig = {
    width: 160,
    height: 90,
    objectTypes: ['person', 'vehicle'],
    sampleIntervalMs: 500,
    kernelRadius: 3,
    decayHalfLifeMs: 60000, // 1 minute
    bucketSizeMs: 60000,     // 1 minute buckets
    maxMemoryBuckets: 60,    // Keep 1 hour in memory
    metric: 'traffic',
};

/**
 * Time-bucketed heatmap data
 */
export interface HeatmapBucket {
    tenantId: string;
    cameraId: string;

    metric: HeatmapMetric;

    bucketStart: number;
    bucketEnd: number;

    width: number;
    height: number;

    /** Heatmap grid data */
    grid: Float32Array;

    /** Number of samples accumulated */
    sampleCount: number;

    /** Number of unique tracks */
    trackCount: number;

    /** Statistics */
    min: number;
    max: number;
    sum: number;
}

/**
 * Track sampling state for rate limiting
 */
export interface TrackSampleState {
    trackId: string;
    lastSampleAt: number;
    lastSeenAt: number;
    sampleCount: number;
}

/**
 * Heatmap query parameters
 */
export interface HeatmapQuery {
    tenantId: string;
    cameraId: string;
    
    from: number;
    to: number;

    metric?: HeatmapMetric;
    objectTypes?: TrackedObjectType[];
}

/**
 * Aggregated heatmap result
 */
export interface AggregatedHeatmap {
    cameraId: string;
    metric: HeatmapMetric;

    from: number;
    to: number;

    width: number;
    height: number;

    grid: Float32Array;

    statistics: {
        samples: number;
        tracks: number;
        min: number;
        max: number;
        mean: number;
        buckets: number;
    };
}

/**
 * Pre-computed Gaussian kernel for efficient accumulation
 */
export interface GaussianKernel {
    radius: number;
    size: number;
    weights: Float32Array;
}

/**
 * Heatmap render request
 */
export interface HeatmapRenderRequest {
    grid: Float32Array;
    width: number;
    height: number;

    outputWidth: number;
    outputHeight: number;

    normalization?: HeatmapNormalization;
    percentile?: number;

    background?: Buffer;
    opacity?: number;

    colormap?: 'jet' | 'viridis' | 'hot' | 'cool';
}

/**
 * Stored heatmap bucket for persistence
 */
export interface StoredHeatmapBucket {
    tenantId: string;
    cameraId: string;
    
    metric: HeatmapMetric;

    bucketStart: Date;
    bucketEnd: Date;

    width: number;
    height: number;

    encoding: 'float32-gzip';
    data: Buffer;

    sampleCount: number;
    trackCount: number;

    min: number;
    max: number;
    sum: number;

    createdAt: Date;
}
