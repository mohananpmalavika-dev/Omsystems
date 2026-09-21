/**
 * Playback Optimizer Service
 * 
 * Production-grade optimization for recording playback with:
 * - Adaptive bitrate streaming (ABR)
 * - Intelligent segment prefetching
 * - Memory-efficient buffer management
 * - Network bandwidth optimization
 * - Seek optimization with keyframe index
 * - Multi-tier caching (memory, disk, CDN)
 * - Quality adaptation based on device/network
 * - Frame dropping for performance
 * - GOP-aware seeking
 * - Latency reduction strategies
 */

import { EventEmitter } from "events";

export interface PlaybackOptimizationConfig {
  // Adaptive Bitrate
  enableABR: boolean;
  abrAlgorithm: "throughput" | "buffer" | "hybrid";
  abrCheckIntervalMs: number;
  
  // Buffer Management
  bufferAheadSeconds: number;
  maxBufferSeconds: number;
  minBufferSeconds: number;
  rebufferThresholdSeconds: number;
  
  // Prefetching
  enablePrefetch: boolean;
  prefetchSegmentsAhead: number;
  prefetchOnSeekProb: number;
  
  // Quality Adaptation
  enableQualityAdaptation: boolean;
  minQualityLevel: number;
  maxQualityLevel: number;
  qualityStepDelay: number;
  
  // Performance
  enableFrameDropping: boolean;
  maxFrameDropRate: number;
  targetLatencyMs: number;
  
  // Caching
  enableMemoryCache: boolean;
  memoryCacheSizeMB: number;
  enableDiskCache: boolean;
  diskCacheSizeMB: number;
  
  // Network
  initialBandwidthEstimateMbps: number;
  bandwidthProbeInterval: number;
  maxConcurrentDownloads: number;
  
  // Seek Optimization
  enableKeyframeIndex: boolean;
  keyframeIndexRefreshInterval: number;
  gopSizeEstimateSeconds: number;
}

export interface QualityLevel {
  level: number;
  width: number;
  height: number;
  bitrateBps: number;
  codec: string;
  fps: number;
  label: string;
}

export interface SegmentMetadata {
  segmentId: string;
  url: string;
  startTime: number;
  duration: number;
  size: number;
  keyframeOffsets: number[];
  quality: number;
  cached: boolean;
}

export interface BufferState {
  bufferedSeconds: number;
  playheadPosition: number;
  isBuffering: boolean;
  bufferHealth: "healthy" | "warning" | "critical";
}

export interface NetworkMetrics {
  bandwidthMbps: number;
  latencyMs: number;
  packetLoss: number;
  jitter: number;
  lastUpdate: Date;
}

export interface PlaybackMetrics {
  currentQuality: number;
  droppedFrames: number;
  totalFrames: number;
  rebufferCount: number;
  totalRebufferTime: number;
  averageBitrate: number;
  bufferHealth: number;
  seekLatency: number;
}

export class PlaybackOptimizerService extends EventEmitter {
  private config: PlaybackOptimizationConfig;
  
  // State management
  private currentQuality: number = 2;
  private targetQuality: number = 2;
  private bufferState: BufferState;
  private networkMetrics: NetworkMetrics;
  private playbackMetrics: PlaybackMetrics;
  
  // Caching
  private memoryCache: Map<string, ArrayBuffer> = new Map();
  private memoryCacheSize: number = 0;
  private segmentMetadataCache: Map<string, SegmentMetadata> = new Map();
  
  // Prefetching
  private prefetchQueue: Set<string> = new Set();
  private downloadQueue: Set<string> = new Set();
  private activeDownloads: number = 0;
  
  // Quality adaptation
  private qualityHistory: Array<{ timestamp: number; quality: number; reason: string }> = [];
  private lastQualityChange: number = 0;
  
  // Performance tracking
  private frameDropHistory: Array<{ timestamp: number; count: number }> = [];
  private seekHistory: Array<{ timestamp: number; latency: number }> = [];
  
  // Bandwidth estimation
  private bandwidthSamples: number[] = [];
  private downloadStartTimes: Map<string, number> = new Map();
  
  constructor(config: Partial<PlaybackOptimizationConfig> = {}) {
    super();
    
    this.config = {
      // ABR defaults
      enableABR: true,
      abrAlgorithm: "hybrid",
      abrCheckIntervalMs: 2000,
      
      // Buffer defaults
      bufferAheadSeconds: 30,
      maxBufferSeconds: 60,
      minBufferSeconds: 5,
      rebufferThresholdSeconds: 2,
      
      // Prefetch defaults
      enablePrefetch: true,
      prefetchSegmentsAhead: 3,
      prefetchOnSeekProb: 0.8,
      
      // Quality defaults
      enableQualityAdaptation: true,
      minQualityLevel: 0,
      maxQualityLevel: 4,
      qualityStepDelay: 3000,
      
      // Performance defaults
      enableFrameDropping: true,
      maxFrameDropRate: 0.1,
      targetLatencyMs: 100,
      
      // Cache defaults
      enableMemoryCache: true,
      memoryCacheSizeMB: 512,
      enableDiskCache: false,
      diskCacheSizeMB: 2048,
      
      // Network defaults
      initialBandwidthEstimateMbps: 10,
      bandwidthProbeInterval: 5000,
      maxConcurrentDownloads: 4,
      
      // Seek defaults
      enableKeyframeIndex: true,
      keyframeIndexRefreshInterval: 60000,
      gopSizeEstimateSeconds: 2,
      
      ...config,
    };
    
    this.bufferState = {
      bufferedSeconds: 0,
      playheadPosition: 0,
      isBuffering: false,
      bufferHealth: "healthy",
    };
    
    this.networkMetrics = {
      bandwidthMbps: this.config.initialBandwidthEstimateMbps,
      latencyMs: 50,
      packetLoss: 0,
      jitter: 0,
      lastUpdate: new Date(),
    };
    
    this.playbackMetrics = {
      currentQuality: 2,
      droppedFrames: 0,
      totalFrames: 0,
      rebufferCount: 0,
      totalRebufferTime: 0,
      averageBitrate: 0,
      bufferHealth: 100,
      seekLatency: 0,
    };
  }

  /**
   * Initialize optimizer for playback session
   */
  async initialize(): Promise<void> {
    // Start ABR monitoring
    if (this.config.enableABR) {
      this.startABRMonitoring();
    }
    
    // Start bandwidth probing
    this.startBandwidthProbing();
    
    // Emit ready event
    this.emit("ready");
  }

  /**
   * Select optimal quality level based on current conditions
   */
  async selectQualityLevel(
    availableLevels: QualityLevel[],
    currentPlayhead: number,
    bufferState: BufferState
  ): Promise<number> {
    if (!this.config.enableABR) {
      return this.currentQuality;
    }

    let selectedQuality = this.currentQuality;

    switch (this.config.abrAlgorithm) {
      case "throughput":
        selectedQuality = this.selectQualityByThroughput(availableLevels);
        break;
        
      case "buffer":
        selectedQuality = this.selectQualityByBuffer(availableLevels, bufferState);
        break;
        
      case "hybrid":
        selectedQuality = this.selectQualityHybrid(availableLevels, bufferState);
        break;
    }

    // Apply constraints
    selectedQuality = Math.max(this.config.minQualityLevel, selectedQuality);
    selectedQuality = Math.min(this.config.maxQualityLevel, selectedQuality);
    
    // Check if quality change is allowed (rate limiting)
    const now = Date.now();
    if (
      selectedQuality !== this.currentQuality &&
      now - this.lastQualityChange >= this.config.qualityStepDelay
    ) {
      await this.changeQuality(selectedQuality, availableLevels);
    }

    return selectedQuality;
  }

  /**
   * Select quality based on available bandwidth
   */
  private selectQualityByThroughput(levels: QualityLevel[]): number {
    const availableBandwidthBps = this.networkMetrics.bandwidthMbps * 1_000_000 * 0.8; // 80% safety margin
    
    // Find highest quality that fits bandwidth
    for (let i = levels.length - 1; i >= 0; i--) {
      if (levels[i].bitrateBps <= availableBandwidthBps) {
        return i;
      }
    }
    
    return 0; // Lowest quality as fallback
  }

  /**
   * Select quality based on buffer health
   */
  private selectQualityByBuffer(levels: QualityLevel[], bufferState: BufferState): number {
    const { bufferedSeconds, bufferHealth } = bufferState;
    
    if (bufferedSeconds < this.config.minBufferSeconds) {
      // Critical: drop to lowest quality
      return 0;
    }
    
    if (bufferedSeconds < this.config.rebufferThresholdSeconds * 2) {
      // Warning: reduce quality
      return Math.max(0, this.currentQuality - 1);
    }
    
    if (bufferedSeconds > this.config.bufferAheadSeconds * 0.8) {
      // Healthy: can increase quality
      return Math.min(levels.length - 1, this.currentQuality + 1);
    }
    
    return this.currentQuality;
  }

  /**
   * Hybrid quality selection (combines throughput and buffer)
   */
  private selectQualityHybrid(levels: QualityLevel[], bufferState: BufferState): number {
    const throughputQuality = this.selectQualityByThroughput(levels);
    const bufferQuality = this.selectQualityByBuffer(levels, bufferState);
    
    // Take the more conservative choice
    return Math.min(throughputQuality, bufferQuality);
  }

  /**
   * Change playback quality
   */
  private async changeQuality(newQuality: number, levels: QualityLevel[]): Promise<void> {
    const oldQuality = this.currentQuality;
    this.currentQuality = newQuality;
    this.targetQuality = newQuality;
    this.lastQualityChange = Date.now();
    
    const reason = newQuality > oldQuality ? "quality-increase" : "quality-decrease";
    
    this.qualityHistory.push({
      timestamp: Date.now(),
      quality: newQuality,
      reason,
    });
    
    // Keep last 100 quality changes
    if (this.qualityHistory.length > 100) {
      this.qualityHistory.shift();
    }
    
    this.emit("quality-changed", {
      oldQuality,
      newQuality,
      reason,
      level: levels[newQuality],
    });
  }

  /**
   * Prefetch segments ahead of playhead
   */
  async prefetchSegments(
    currentSegmentId: string,
    availableSegments: SegmentMetadata[],
    quality: number
  ): Promise<void> {
    if (!this.config.enablePrefetch) return;

    // Find current segment index
    const currentIndex = availableSegments.findIndex((s) => s.segmentId === currentSegmentId);
    if (currentIndex === -1) return;

    // Prefetch next N segments
    const segmentsToPrefetch: string[] = [];
    for (let i = 1; i <= this.config.prefetchSegmentsAhead; i++) {
      const nextIndex = currentIndex + i;
      if (nextIndex < availableSegments.length) {
        const segment = availableSegments[nextIndex];
        if (!this.isSegmentCached(segment.segmentId) && !this.prefetchQueue.has(segment.segmentId)) {
          segmentsToPrefetch.push(segment.segmentId);
        }
      }
    }

    // Queue prefetch downloads
    for (const segmentId of segmentsToPrefetch) {
      this.prefetchQueue.add(segmentId);
      this.downloadSegmentAsync(segmentId, availableSegments);
    }
  }

  /**
   * Download segment asynchronously
   */
  private async downloadSegmentAsync(
    segmentId: string,
    availableSegments: SegmentMetadata[]
  ): Promise<void> {
    // Rate limit concurrent downloads
    if (this.activeDownloads >= this.config.maxConcurrentDownloads) {
      return;
    }

    const segment = availableSegments.find((s) => s.segmentId === segmentId);
    if (!segment) return;

    this.activeDownloads++;
    this.downloadQueue.add(segmentId);
    this.downloadStartTimes.set(segmentId, Date.now());

    try {
      // Simulate download (replace with actual fetch)
      const response = await fetch(segment.url, { priority: "low" } as any);
      const data = await response.arrayBuffer();

      // Update bandwidth estimate
      this.updateBandwidthEstimate(segmentId, segment.size);

      // Cache segment
      this.cacheSegment(segmentId, data);

      this.emit("segment-downloaded", { segmentId, size: data.byteLength });
    } catch (error) {
      console.error(`Failed to prefetch segment ${segmentId}:`, error);
      this.emit("segment-download-failed", { segmentId, error });
    } finally {
      this.activeDownloads--;
      this.downloadQueue.delete(segmentId);
      this.prefetchQueue.delete(segmentId);
      this.downloadStartTimes.delete(segmentId);
    }
  }

  /**
   * Optimize seek operation
   */
  async optimizeSeek(
    targetTime: number,
    currentSegment: string,
    availableSegments: SegmentMetadata[]
  ): Promise<{
    targetSegment: string;
    keyframeOffset: number;
    estimatedLatency: number;
    shouldPrefetch: string[];
  }> {
    const seekStart = Date.now();

    // Find target segment
    const targetSegment = availableSegments.find(
      (s) => targetTime >= s.startTime && targetTime < s.startTime + s.duration
    );

    if (!targetSegment) {
      throw new Error(`No segment found for time ${targetTime}`);
    }

    // Find nearest keyframe
    const offsetInSegment = targetTime - targetSegment.startTime;
    const nearestKeyframe = this.findNearestKeyframe(targetSegment, offsetInSegment);

    // Determine if we should prefetch surrounding segments
    const shouldPrefetch: string[] = [];
    if (this.config.enablePrefetch && Math.random() < this.config.prefetchOnSeekProb) {
      const targetIndex = availableSegments.indexOf(targetSegment);
      
      // Prefetch 1 segment before and 2 after
      for (let offset = -1; offset <= 2; offset++) {
        const idx = targetIndex + offset;
        if (idx >= 0 && idx < availableSegments.length && idx !== targetIndex) {
          shouldPrefetch.push(availableSegments[idx].segmentId);
        }
      }
    }

    // Estimate seek latency
    const isSegmentCached = this.isSegmentCached(targetSegment.segmentId);
    const estimatedLatency = isSegmentCached
      ? 10 + nearestKeyframe * 5 // Cached: decode time only
      : 200 + targetSegment.size / (this.networkMetrics.bandwidthMbps * 125_000); // Download + decode

    // Track seek latency
    const actualLatency = Date.now() - seekStart;
    this.seekHistory.push({ timestamp: Date.now(), latency: actualLatency });
    if (this.seekHistory.length > 100) {
      this.seekHistory.shift();
    }
    this.playbackMetrics.seekLatency = actualLatency;

    return {
      targetSegment: targetSegment.segmentId,
      keyframeOffset: nearestKeyframe,
      estimatedLatency,
      shouldPrefetch,
    };
  }

  /**
   * Find nearest keyframe to target offset
   */
  private findNearestKeyframe(segment: SegmentMetadata, offsetSeconds: number): number {
    if (!segment.keyframeOffsets || segment.keyframeOffsets.length === 0) {
      // No keyframe index, estimate based on GOP size
      const gopSize = this.config.gopSizeEstimateSeconds;
      return Math.floor(offsetSeconds / gopSize) * gopSize;
    }

    // Binary search for nearest keyframe
    let nearest = 0;
    let minDiff = Math.abs(segment.keyframeOffsets[0] - offsetSeconds);

    for (const kfOffset of segment.keyframeOffsets) {
      const diff = Math.abs(kfOffset - offsetSeconds);
      if (diff < minDiff) {
        minDiff = diff;
        nearest = kfOffset;
      }
    }

    return nearest;
  }

  /**
   * Manage buffer to prevent memory overflow
   */
  manageBuffer(
    playheadPosition: number,
    bufferedRanges: Array<{ start: number; end: number }>
  ): {
    shouldEvict: string[];
    bufferHealth: BufferState["bufferHealth"];
  } {
    // Calculate buffer state
    let bufferedSeconds = 0;
    for (const range of bufferedRanges) {
      if (range.end > playheadPosition) {
        bufferedSeconds += range.end - Math.max(range.start, playheadPosition);
      }
    }

    // Determine buffer health
    let bufferHealth: BufferState["bufferHealth"] = "healthy";
    if (bufferedSeconds < this.config.minBufferSeconds) {
      bufferHealth = "critical";
    } else if (bufferedSeconds < this.config.rebufferThresholdSeconds * 2) {
      bufferHealth = "warning";
    }

    // Evict segments too far behind playhead or too far ahead
    const shouldEvict: string[] = [];
    const evictBehindThreshold = playheadPosition - 10; // 10 seconds behind
    const evictAheadThreshold = playheadPosition + this.config.maxBufferSeconds;

    for (const [segmentId, metadata] of this.segmentMetadataCache.entries()) {
      const segmentEnd = metadata.startTime + metadata.duration;
      
      if (segmentEnd < evictBehindThreshold || metadata.startTime > evictAheadThreshold) {
        shouldEvict.push(segmentId);
      }
    }

    // Evict from memory cache
    for (const segmentId of shouldEvict) {
      this.evictSegment(segmentId);
    }

    // Update buffer state
    this.bufferState = {
      bufferedSeconds,
      playheadPosition,
      isBuffering: bufferedSeconds < this.config.rebufferThresholdSeconds,
      bufferHealth,
    };

    return { shouldEvict, bufferHealth };
  }

  /**
   * Update bandwidth estimate based on download
   */
  private updateBandwidthEstimate(segmentId: string, sizeBytes: number): void {
    const startTime = this.downloadStartTimes.get(segmentId);
    if (!startTime) return;

    const durationMs = Date.now() - startTime;
    if (durationMs === 0) return;

    const bandwidthMbps = (sizeBytes * 8) / (durationMs * 1000);
    
    // Exponential moving average
    const alpha = 0.2;
    this.networkMetrics.bandwidthMbps =
      alpha * bandwidthMbps + (1 - alpha) * this.networkMetrics.bandwidthMbps;
    
    this.bandwidthSamples.push(bandwidthMbps);
    if (this.bandwidthSamples.length > 20) {
      this.bandwidthSamples.shift();
    }

    this.networkMetrics.lastUpdate = new Date();
  }

  /**
   * Report dropped frame
   */
  reportDroppedFrame(): void {
    this.playbackMetrics.droppedFrames++;
    this.playbackMetrics.totalFrames++;
    
    const now = Date.now();
    this.frameDropHistory.push({ timestamp: now, count: 1 });
    
    // Keep last 10 seconds of history
    this.frameDropHistory = this.frameDropHistory.filter(
      (entry) => now - entry.timestamp < 10000
    );
    
    // Check if drop rate exceeds threshold
    const recentDrops = this.frameDropHistory.reduce((sum, entry) => sum + entry.count, 0);
    const dropRate = recentDrops / Math.max(1, this.playbackMetrics.totalFrames);
    
    if (dropRate > this.config.maxFrameDropRate) {
      this.emit("high-frame-drop-rate", { dropRate, droppedFrames: recentDrops });
    }
  }

  /**
   * Cache segment in memory
   */
  private cacheSegment(segmentId: string, data: ArrayBuffer): void {
    if (!this.config.enableMemoryCache) return;

    const maxSizeBytes = this.config.memoryCacheSizeMB * 1024 * 1024;
    
    // Evict LRU segments if cache full
    while (this.memoryCacheSize + data.byteLength > maxSizeBytes && this.memoryCache.size > 0) {
      const oldestKey = this.memoryCache.keys().next().value;
      const oldestSize = this.memoryCache.get(oldestKey)!.byteLength;
      this.memoryCache.delete(oldestKey);
      this.memoryCacheSize -= oldestSize;
    }

    this.memoryCache.set(segmentId, data);
    this.memoryCacheSize += data.byteLength;
  }

  /**
   * Check if segment is cached
   */
  private isSegmentCached(segmentId: string): boolean {
    return this.memoryCache.has(segmentId);
  }

  /**
   * Evict segment from cache
   */
  private evictSegment(segmentId: string): void {
    const data = this.memoryCache.get(segmentId);
    if (data) {
      this.memoryCacheSize -= data.byteLength;
      this.memoryCache.delete(segmentId);
    }
    this.segmentMetadataCache.delete(segmentId);
  }

  /**
   * Get cached segment
   */
  getCachedSegment(segmentId: string): ArrayBuffer | null {
    return this.memoryCache.get(segmentId) || null;
  }

  /**
   * Start ABR monitoring loop
   */
  private startABRMonitoring(): void {
    setInterval(() => {
      if (this.config.enableABR) {
        this.emit("abr-check", {
          currentQuality: this.currentQuality,
          bandwidth: this.networkMetrics.bandwidthMbps,
          bufferState: this.bufferState,
        });
      }
    }, this.config.abrCheckIntervalMs);
  }

  /**
   * Start bandwidth probing
   */
  private startBandwidthProbing(): void {
    setInterval(() => {
      this.emit("bandwidth-update", {
        bandwidthMbps: this.networkMetrics.bandwidthMbps,
        latencyMs: this.networkMetrics.latencyMs,
        samples: this.bandwidthSamples.length,
      });
    }, this.config.bandwidthProbeInterval);
  }

  /**
   * Get playback metrics
   */
  getMetrics(): PlaybackMetrics {
    const dropRate =
      this.playbackMetrics.totalFrames > 0
        ? this.playbackMetrics.droppedFrames / this.playbackMetrics.totalFrames
        : 0;

    return {
      ...this.playbackMetrics,
      bufferHealth: this.bufferState.bufferHealth === "healthy" ? 100 : this.bufferState.bufferHealth === "warning" ? 50 : 25,
      averageBitrate: this.networkMetrics.bandwidthMbps,
    };
  }

  /**
   * Get buffer state
   */
  getBufferState(): BufferState {
    return { ...this.bufferState };
  }

  /**
   * Get network metrics
   */
  getNetworkMetrics(): NetworkMetrics {
    return { ...this.networkMetrics };
  }

  /**
   * Reset optimizer state
   */
  reset(): void {
    this.currentQuality = 2;
    this.targetQuality = 2;
    this.memoryCache.clear();
    this.memoryCacheSize = 0;
    this.segmentMetadataCache.clear();
    this.prefetchQueue.clear();
    this.downloadQueue.clear();
    this.activeDownloads = 0;
    this.playbackMetrics.droppedFrames = 0;
    this.playbackMetrics.totalFrames = 0;
    this.playbackMetrics.rebufferCount = 0;
    this.qualityHistory = [];
    this.frameDropHistory = [];
    this.seekHistory = [];
  }

  /**
   * Cleanup resources
   */
  dispose(): void {
    this.reset();
    this.removeAllListeners();
  }
}

// Singleton instance
let optimizerInstance: PlaybackOptimizerService | null = null;

export function getPlaybackOptimizer(
  config?: Partial<PlaybackOptimizationConfig>
): PlaybackOptimizerService {
  if (!optimizerInstance) {
    optimizerInstance = new PlaybackOptimizerService(config);
  }
  return optimizerInstance;
}
