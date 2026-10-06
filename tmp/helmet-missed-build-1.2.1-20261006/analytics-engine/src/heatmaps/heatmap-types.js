/**
 * Heatmap type definitions
 */
/**
 * Default heatmap configuration
 */
export const DEFAULT_HEATMAP_CONFIG = {
    width: 160,
    height: 90,
    objectTypes: ['person', 'vehicle'],
    sampleIntervalMs: 500,
    kernelRadius: 3,
    decayHalfLifeMs: 60000, // 1 minute
    bucketSizeMs: 60000, // 1 minute buckets
    maxMemoryBuckets: 60, // Keep 1 hour in memory
    metric: 'traffic',
};
