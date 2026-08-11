/**
 * Heatmap Store
 * 
 * Persistent storage for heatmap buckets with compression.
 * Stores grid data as compressed blobs for efficiency.
 */

import { gzip, gunzip } from 'node:zlib';
import { promisify } from 'node:util';
import {
    HeatmapBucket,
    StoredHeatmapBucket,
    HeatmapMetric,
} from './heatmap-types';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

export interface HeatmapStoreConfig {
    /** Storage backend */
    backend: 'memory' | 'database' | 'file';
    
    /** Compression level (1-9, higher = better compression but slower) */
    compressionLevel?: number;

    /** Maximum stored buckets per camera */
    maxStoredBuckets?: number;

    /** Auto-persist interval (milliseconds) */
    autoPersistIntervalMs?: number;
}

/**
 * In-memory heatmap store with optional persistence
 */
export class HeatmapStore {
    private readonly config: Required<HeatmapStoreConfig>;
    
    /** In-memory cache of stored buckets */
    private readonly cache = new Map<string, StoredHeatmapBucket>();

    /** Pending buckets for batch persistence */
    private readonly pending = new Map<string, HeatmapBucket>();

    private autoPersistTimer?: NodeJS.Timeout;

    constructor(config: HeatmapStoreConfig = { backend: 'memory' }) {
        this.config = {
            backend: config.backend,
            compressionLevel: config.compressionLevel ?? 6,
            maxStoredBuckets: config.maxStoredBuckets ?? 1440, // 24 hours of 1-min buckets
            autoPersistIntervalMs: config.autoPersistIntervalMs ?? 60000, // 1 minute
        };

        // Start auto-persist if configured
        if (this.config.autoPersistIntervalMs > 0) {
            this.startAutoPersist();
        }
    }

    /**
     * Store a heatmap bucket
     */
    async store(bucket: HeatmapBucket): Promise<void> {
        const key = this.getBucketKey(
            bucket.tenantId,
            bucket.cameraId,
            bucket.metric,
            bucket.bucketStart,
        );

        // Add to pending queue for batch persistence
        this.pending.set(key, bucket);

        // Enforce cache size limit
        await this.enforceStorageLimit(bucket.tenantId, bucket.cameraId, bucket.metric);
    }

    /**
     * Store multiple buckets in batch
     */
    async storeBatch(buckets: HeatmapBucket[]): Promise<void> {
        for (const bucket of buckets) {
            const key = this.getBucketKey(
                bucket.tenantId,
                bucket.cameraId,
                bucket.metric,
                bucket.bucketStart,
            );
            this.pending.set(key, bucket);
        }

        await this.flush();
    }

    /**
     * Retrieve a specific bucket
     */
    async retrieve(
        tenantId: string,
        cameraId: string,
        metric: HeatmapMetric,
        bucketStart: number,
    ): Promise<HeatmapBucket | null> {
        const key = this.getBucketKey(tenantId, cameraId, metric, bucketStart);

        // Check pending first
        const pending = this.pending.get(key);
        if (pending) {
            return pending;
        }

        // Check cache
        const stored = this.cache.get(key);
        if (!stored) {
            return null;
        }

        // Decompress and reconstruct bucket
        return await this.decompressBucket(stored);
    }

    /**
     * Query buckets in time range
     */
    async query(
        tenantId: string,
        cameraId: string,
        metric: HeatmapMetric,
        from: number,
        to: number,
    ): Promise<HeatmapBucket[]> {
        const results: HeatmapBucket[] = [];

        // Collect matching buckets from pending
        for (const [key, bucket] of this.pending.entries()) {
            if (
                bucket.tenantId === tenantId &&
                bucket.cameraId === cameraId &&
                bucket.metric === metric &&
                bucket.bucketStart >= from &&
                bucket.bucketStart < to
            ) {
                results.push(bucket);
            }
        }

        // Collect matching buckets from cache
        for (const [key, stored] of this.cache.entries()) {
            if (
                stored.tenantId === tenantId &&
                stored.cameraId === cameraId &&
                stored.metric === metric &&
                stored.bucketStart.getTime() >= from &&
                stored.bucketStart.getTime() < to
            ) {
                const bucket = await this.decompressBucket(stored);
                results.push(bucket);
            }
        }

        // Sort by bucket start time
        return results.sort((a, b) => a.bucketStart - b.bucketStart);
    }

    /**
     * Delete old buckets before timestamp
     */
    async deleteOldBuckets(
        tenantId: string,
        cameraId: string,
        metric: HeatmapMetric,
        beforeTimestamp: number,
    ): Promise<number> {
        let deleted = 0;

        // Delete from pending
        for (const [key, bucket] of this.pending.entries()) {
            if (
                bucket.tenantId === tenantId &&
                bucket.cameraId === cameraId &&
                bucket.metric === metric &&
                bucket.bucketStart < beforeTimestamp
            ) {
                this.pending.delete(key);
                deleted++;
            }
        }

        // Delete from cache
        for (const [key, stored] of this.cache.entries()) {
            if (
                stored.tenantId === tenantId &&
                stored.cameraId === cameraId &&
                stored.metric === metric &&
                stored.bucketStart.getTime() < beforeTimestamp
            ) {
                this.cache.delete(key);
                deleted++;
            }
        }

        return deleted;
    }

    /**
     * Get storage statistics
     */
    getStats() {
        return {
            cached: this.cache.size,
            pending: this.pending.size,
            total: this.cache.size + this.pending.size,
        };
    }

    /**
     * Flush pending buckets to storage
     */
    async flush(): Promise<void> {
        if (this.pending.size === 0) {
            return;
        }

        const buckets = Array.from(this.pending.values());
        
        for (const bucket of buckets) {
            const stored = await this.compressBucket(bucket);
            const key = this.getBucketKey(
                bucket.tenantId,
                bucket.cameraId,
                bucket.metric,
                bucket.bucketStart,
            );
            
            this.cache.set(key, stored);
        }

        this.pending.clear();
    }

    /**
     * Shutdown and cleanup
     */
    async shutdown(): Promise<void> {
        if (this.autoPersistTimer) {
            clearInterval(this.autoPersistTimer);
        }

        await this.flush();
    }

    // --- Private methods ---

    /**
     * Generate bucket storage key
     */
    private getBucketKey(
        tenantId: string,
        cameraId: string,
        metric: HeatmapMetric,
        bucketStart: number,
    ): string {
        return `${tenantId}:${cameraId}:${metric}:${bucketStart}`;
    }

    /**
     * Compress bucket for storage
     */
    private async compressBucket(bucket: HeatmapBucket): Promise<StoredHeatmapBucket> {
        // Convert Float32Array to Buffer
        const floatBuffer = Buffer.from(bucket.grid.buffer);

        // Compress with gzip
        const compressed = await gzipAsync(floatBuffer, {
            level: this.config.compressionLevel,
        });

        return {
            tenantId: bucket.tenantId,
            cameraId: bucket.cameraId,
            metric: bucket.metric,
            bucketStart: new Date(bucket.bucketStart),
            bucketEnd: new Date(bucket.bucketEnd),
            width: bucket.width,
            height: bucket.height,
            encoding: 'float32-gzip',
            data: compressed,
            sampleCount: bucket.sampleCount,
            trackCount: bucket.trackCount,
            min: bucket.min,
            max: bucket.max,
            sum: bucket.sum,
            createdAt: new Date(),
        };
    }

    /**
     * Decompress bucket from storage
     */
    private async decompressBucket(stored: StoredHeatmapBucket): Promise<HeatmapBucket> {
        // Decompress
        const decompressed = await gunzipAsync(stored.data);

        // Convert back to Float32Array
        const grid = new Float32Array(
            decompressed.buffer,
            decompressed.byteOffset,
            decompressed.byteLength / Float32Array.BYTES_PER_ELEMENT,
        );

        return {
            tenantId: stored.tenantId,
            cameraId: stored.cameraId,
            metric: stored.metric,
            bucketStart: stored.bucketStart.getTime(),
            bucketEnd: stored.bucketEnd.getTime(),
            width: stored.width,
            height: stored.height,
            grid: new Float32Array(grid), // Copy to new array
            sampleCount: stored.sampleCount,
            trackCount: stored.trackCount,
            min: stored.min,
            max: stored.max,
            sum: stored.sum,
        };
    }

    /**
     * Enforce storage size limit
     */
    private async enforceStorageLimit(
        tenantId: string,
        cameraId: string,
        metric: HeatmapMetric,
    ): Promise<void> {
        const totalSize = this.cache.size + this.pending.size;
        
        if (totalSize <= this.config.maxStoredBuckets) {
            return;
        }

        // Find oldest bucket for this camera/metric
        let oldestKey: string | null = null;
        let oldestTime = Infinity;

        for (const [key, stored] of this.cache.entries()) {
            if (
                stored.tenantId === tenantId &&
                stored.cameraId === cameraId &&
                stored.metric === metric
            ) {
                const time = stored.bucketStart.getTime();
                if (time < oldestTime) {
                    oldestTime = time;
                    oldestKey = key;
                }
            }
        }

        if (oldestKey) {
            this.cache.delete(oldestKey);
        }
    }

    /**
     * Start auto-persist timer
     */
    private startAutoPersist(): void {
        this.autoPersistTimer = setInterval(async () => {
            try {
                await this.flush();
            } catch (error) {
                console.error('[HeatmapStore] Auto-persist failed:', error);
            }
        }, this.config.autoPersistIntervalMs);
    }
}
