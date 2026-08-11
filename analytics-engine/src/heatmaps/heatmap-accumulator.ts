/**
 * Heatmap Accumulator
 * 
 * Core heatmap accumulation with:
 * - Track-aware sampling (prevents frame-rate bias)
 * - Coordinate normalization (camera-resolution independent)
 * - Gaussian kernel application (smooth heatmaps)
 * - Time-based bucketing (historical queries)
 * - Decay support (live rolling heatmaps)
 */

import { TrackingObservation, TrackedObjectType } from '../tracking.js';
import {
    HeatmapConfig,
    HeatmapBucket,
    HeatmapMetric,
    TrackSampleState,
    GaussianKernel,
} from './heatmap-types.js';

/**
 * Heatmap accumulator for a single camera
 */
export class HeatmapAccumulator {
    private readonly config: HeatmapConfig;
    private readonly cameraId: string;
    private readonly tenantId: string;

    /** Time-bucketed heatmap grids */
    private readonly buckets = new Map<number, HeatmapBucket>();

    /** Track sampling state for rate limiting */
    private readonly trackStates = new Map<string, TrackSampleState>();

    /** Pre-computed Gaussian kernel */
    private readonly gaussianKernel: GaussianKernel;

    /** Live rolling accumulator (optional) */
    private liveGrid?: Float32Array;
    private lastDecayTime = Date.now();

    private totalSamples = 0;
    private uniqueTracks = new Set<string>();

    constructor(
        tenantId: string,
        cameraId: string,
        config: HeatmapConfig,
    ) {
        this.tenantId = tenantId;
        this.cameraId = cameraId;
        this.config = config;

        // Pre-compute Gaussian kernel for efficiency
        this.gaussianKernel = this.createGaussianKernel(config.kernelRadius);

        // Initialize live grid if decay is enabled
        if (config.decayHalfLifeMs !== undefined) {
            this.liveGrid = new Float32Array(config.width * config.height);
        }
    }

    /**
     * Ingest a tracking observation
     */
    ingest(observation: TrackingObservation): void {
        // Filter by object type
        if (!this.config.objectTypes.includes(observation.objectType)) {
            return;
        }

        // Validate camera match
        if (observation.cameraId !== this.cameraId) {
            return;
        }

        // Apply track-aware sampling
        if (!this.shouldSample(observation)) {
            return;
        }

        // Update track state
        this.updateTrackState(observation);

        // Calculate weight based on metric type
        const weight = this.calculateWeight(observation);

        // Normalize coordinates to grid space
        const { gridX, gridY } = this.normalizeCoordinates(observation);

        // Get or create time bucket
        const bucket = this.getOrCreateBucket(observation.timestamp);

        // Add to bucket with Gaussian kernel
        this.addToGrid(bucket.grid, gridX, gridY, weight);
        bucket.sampleCount++;

        // Update bucket statistics
        this.updateBucketStats(bucket);

        // Add to live grid if enabled
        if (this.liveGrid) {
            this.addToGrid(this.liveGrid, gridX, gridY, weight);
        }

        this.totalSamples++;
    }

    /**
     * Get live rolling heatmap (with decay applied)
     */
    getLiveHeatmap(): Float32Array | undefined {
        if (!this.liveGrid) {
            return undefined;
        }

        this.applyDecay();
        return new Float32Array(this.liveGrid);
    }

    /**
     * Get time bucket
     */
    getBucket(bucketStart: number): HeatmapBucket | undefined {
        return this.buckets.get(bucketStart);
    }

    /**
     * Get all buckets in time range
     */
    getBuckets(from: number, to: number): HeatmapBucket[] {
        const result: HeatmapBucket[] = [];

        for (const [bucketStart, bucket] of this.buckets.entries()) {
            if (bucketStart >= from && bucketStart < to) {
                result.push(bucket);
            }
        }

        return result.sort((a, b) => a.bucketStart - b.bucketStart);
    }

    /**
     * Get all bucket timestamps
     */
    getBucketTimestamps(): number[] {
        return Array.from(this.buckets.keys()).sort((a, b) => a - b);
    }

    /**
     * Clear old buckets to prevent memory growth
     */
    clearOldBuckets(beforeTimestamp: number): HeatmapBucket[] {
        const cleared: HeatmapBucket[] = [];

        for (const [bucketStart, bucket] of this.buckets.entries()) {
            if (bucketStart < beforeTimestamp) {
                cleared.push(bucket);
                this.buckets.delete(bucketStart);
            }
        }

        return cleared;
    }

    /**
     * Cleanup expired track states
     */
    cleanupTrackStates(ttlMs = 300000): void {
        const now = Date.now();
        const expired: string[] = [];

        for (const [trackId, state] of this.trackStates.entries()) {
            if (now - state.lastSeenAt > ttlMs) {
                expired.push(trackId);
            }
        }

        for (const trackId of expired) {
            this.trackStates.delete(trackId);
        }
    }

    /**
     * Get accumulator statistics
     */
    getStats() {
        return {
            cameraId: this.cameraId,
            totalSamples: this.totalSamples,
            uniqueTracks: this.uniqueTracks.size,
            buckets: this.buckets.size,
            trackStates: this.trackStates.size,
        };
    }

    /**
     * Reset accumulator
     */
    reset(): void {
        this.buckets.clear();
        this.trackStates.clear();
        this.uniqueTracks.clear();
        this.totalSamples = 0;
        
        if (this.liveGrid) {
            this.liveGrid.fill(0);
        }
    }

    // --- Private methods ---

    /**
     * Track-aware sampling to prevent frame-rate bias
     */
    private shouldSample(observation: TrackingObservation): boolean {
        const trackKey = `${observation.cameraId}:${observation.trackId}`;
        const state = this.trackStates.get(trackKey);

        if (!state) {
            return true; // First observation of track
        }

        const timeSinceLastSample = observation.timestamp - state.lastSampleAt;
        return timeSinceLastSample >= this.config.sampleIntervalMs;
    }

    /**
     * Update track sampling state
     */
    private updateTrackState(observation: TrackingObservation): void {
        const trackKey = `${observation.cameraId}:${observation.trackId}`;
        
        const state = this.trackStates.get(trackKey) || {
            trackId: trackKey,
            lastSampleAt: 0,
            lastSeenAt: 0,
            sampleCount: 0,
        };

        state.lastSampleAt = observation.timestamp;
        state.lastSeenAt = observation.timestamp;
        state.sampleCount++;

        this.trackStates.set(trackKey, state);
        this.uniqueTracks.add(trackKey);
    }

    /**
     * Calculate weight based on metric type
     */
    private calculateWeight(observation: TrackingObservation): number {
        switch (this.config.metric) {
            case 'traffic':
                // Simple count-based
                return 1.0;

            case 'occupancy':
            case 'dwell':
                // Weight by sampling interval (approximate dwell time)
                return this.config.sampleIntervalMs / 1000; // Convert to seconds

            case 'entry_density':
                // Weight by confidence
                return observation.confidence;

            default:
                return 1.0;
        }
    }

    /**
     * Normalize observation coordinates to grid space
     */
    private normalizeCoordinates(observation: TrackingObservation): {
        gridX: number;
        gridY: number;
    } {
        // Use anchor point (bottom-center of bbox) for ground contact
        const { anchor } = observation;

        // Assume normalized coordinates [0, 1] or convert if needed
        // For now, assume coordinates are already in image space [0, width]
        // and we need to normalize to grid
        
        // TODO: Get actual camera resolution from camera service
        // For now, assume 1920x1080 as default
        const cameraWidth = 1920;
        const cameraHeight = 1080;

        const normalizedX = anchor.x / cameraWidth;
        const normalizedY = anchor.y / cameraHeight;

        const gridX = Math.min(
            this.config.width - 1,
            Math.max(0, Math.floor(normalizedX * this.config.width)),
        );

        const gridY = Math.min(
            this.config.height - 1,
            Math.max(0, Math.floor(normalizedY * this.config.height)),
        );

        return { gridX, gridY };
    }

    /**
     * Get or create time bucket
     */
    private getOrCreateBucket(timestamp: number): HeatmapBucket {
        const bucketStart = this.getBucketStart(timestamp);
        
        let bucket = this.buckets.get(bucketStart);

        if (!bucket) {
            bucket = {
                tenantId: this.tenantId,
                cameraId: this.cameraId,
                metric: this.config.metric,
                bucketStart,
                bucketEnd: bucketStart + this.config.bucketSizeMs,
                width: this.config.width,
                height: this.config.height,
                grid: new Float32Array(this.config.width * this.config.height),
                sampleCount: 0,
                trackCount: 0,
                min: Infinity,
                max: -Infinity,
                sum: 0,
            };

            this.buckets.set(bucketStart, bucket);

            // Enforce memory limit
            this.enforceBucketLimit();
        }

        return bucket;
    }

    /**
     * Calculate bucket start time
     */
    private getBucketStart(timestamp: number): number {
        return Math.floor(timestamp / this.config.bucketSizeMs) * this.config.bucketSizeMs;
    }

    /**
     * Enforce maximum bucket limit
     */
    private enforceBucketLimit(): void {
        if (this.buckets.size <= this.config.maxMemoryBuckets) {
            return;
        }

        // Remove oldest bucket
        const timestamps = Array.from(this.buckets.keys()).sort((a, b) => a - b);
        const oldestTimestamp = timestamps[0];
        
        if (oldestTimestamp !== undefined) {
            this.buckets.delete(oldestTimestamp);
        }
    }

    /**
     * Add value to grid with Gaussian kernel
     */
    private addToGrid(
        grid: Float32Array,
        centerX: number,
        centerY: number,
        weight: number,
    ): void {
        const radius = this.gaussianKernel.radius;
        const kernelSize = this.gaussianKernel.size;
        const kernelWeights = this.gaussianKernel.weights;

        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                const x = centerX + dx;
                const y = centerY + dy;

                // Bounds check
                if (x < 0 || y < 0 || x >= this.config.width || y >= this.config.height) {
                    continue;
                }

                // Get pre-computed kernel weight
                const kernelIdx = (dy + radius) * kernelSize + (dx + radius);
                const kernelWeight = kernelWeights[kernelIdx];

                // Add weighted value to grid
                const gridIdx = y * this.config.width + x;
                grid[gridIdx] += kernelWeight * weight;
            }
        }
    }

    /**
     * Update bucket statistics
     */
    private updateBucketStats(bucket: HeatmapBucket): void {
        let min = Infinity;
        let max = -Infinity;
        let sum = 0;

        for (let i = 0; i < bucket.grid.length; i++) {
            const value = bucket.grid[i];
            if (value > 0) {
                min = Math.min(min, value);
                max = Math.max(max, value);
                sum += value;
            }
        }

        bucket.min = min === Infinity ? 0 : min;
        bucket.max = max === -Infinity ? 0 : max;
        bucket.sum = sum;
        bucket.trackCount = this.uniqueTracks.size;
    }

    /**
     * Apply exponential decay to live grid
     */
    private applyDecay(): void {
        if (!this.liveGrid || !this.config.decayHalfLifeMs) {
            return;
        }

        const now = Date.now();
        const deltaMs = now - this.lastDecayTime;

        if (deltaMs < 1000) {
            return; // Don't decay too frequently
        }

        const decayFactor = Math.exp(
            -Math.LN2 * deltaMs / this.config.decayHalfLifeMs,
        );

        for (let i = 0; i < this.liveGrid.length; i++) {
            this.liveGrid[i] *= decayFactor;
        }

        this.lastDecayTime = now;
    }

    /**
     * Create pre-computed Gaussian kernel
     */
    private createGaussianKernel(radius: number): GaussianKernel {
        const size = radius * 2 + 1;
        const weights = new Float32Array(size * size);
        const sigma = radius / 2;
        const twoSigmaSquared = 2 * sigma * sigma;

        let sum = 0;

        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                const distanceSquared = dx * dx + dy * dy;
                const weight = Math.exp(-distanceSquared / twoSigmaSquared);
                
                const idx = (dy + radius) * size + (dx + radius);
                weights[idx] = weight;
                sum += weight;
            }
        }

        // Normalize kernel to sum to 1
        for (let i = 0; i < weights.length; i++) {
            weights[i] /= sum;
        }

        return { radius, size, weights };
    }
}
