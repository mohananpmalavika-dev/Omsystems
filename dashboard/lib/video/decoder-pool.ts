/**
 * Decoder Pool
 * 
 * Manages the lifecycle of video decoders, handling acquisition,
 * release, upgrade, and downgrade operations.
 */

import type {
  DecoderHandle,
  StreamProfile,
  PlaybackMetrics,
  CameraPlaybackMode,
} from "./types";

// ============================================================================
// DECODER POOL
// ============================================================================

export interface DecoderPoolCallbacks {
  onDecoderAcquired?: (handle: DecoderHandle) => void;
  onDecoderReleased?: (cameraId: string) => void;
  onDecoderUpgraded?: (cameraId: string, profile: StreamProfile) => void;
  onDecoderDowngraded?: (cameraId: string, profile: StreamProfile) => void;
  onDecoderError?: (cameraId: string, error: Error) => void;
}

export class DecoderPool {
  private handles: Map<string, DecoderHandle> = new Map();
  private callbacks: DecoderPoolCallbacks;
  private nextHandleId = 0;

  constructor(callbacks: DecoderPoolCallbacks = {}) {
    this.callbacks = callbacks;
  }

  /**
   * Acquire a decoder for a camera
   */
  async acquire(
    cameraId: string,
    profile: StreamProfile
  ): Promise<DecoderHandle> {
    // Check if already acquired
    const existing = this.handles.get(cameraId);
    if (existing) {
      // If same profile, return existing
      if (this.isSameProfile(existing.streamProfile, profile)) {
        return existing;
      }
      
      // Different profile - upgrade/downgrade
      await this.release(cameraId);
    }

    // Create new handle
    const handle: DecoderHandle = {
      id: `decoder-${this.nextHandleId++}`,
      cameraId,
      streamProfile: profile,
      activatedAt: Date.now(),
    };

    this.handles.set(cameraId, handle);

    console.log(`[DecoderPool] Acquired decoder for ${cameraId}:`, {
      handleId: handle.id,
      streamType: profile.streamType,
      resolution: `${profile.width}x${profile.height}`,
    });

    this.callbacks.onDecoderAcquired?.(handle);

    return handle;
  }

  /**
   * Release a decoder
   */
  async release(cameraId: string): Promise<void> {
    const handle = this.handles.get(cameraId);
    if (!handle) {
      return;
    }

    console.log(`[DecoderPool] Releasing decoder for ${cameraId}`, {
      handleId: handle.id,
      durationMs: Date.now() - handle.activatedAt,
    });

    // Cleanup video element if attached
    if (handle.videoElement) {
      this.cleanupVideoElement(handle.videoElement);
      handle.videoElement = undefined;
    }

    this.handles.delete(cameraId);
    this.callbacks.onDecoderReleased?.(cameraId);
  }

  /**
   * Upgrade stream to higher quality
   */
  async upgrade(
    cameraId: string,
    profile: StreamProfile
  ): Promise<void> {
    const existing = this.handles.get(cameraId);
    if (!existing) {
      // Not currently allocated - just acquire
      await this.acquire(cameraId, profile);
      return;
    }

    console.log(`[DecoderPool] Upgrading ${cameraId}:`, {
      from: `${existing.streamProfile.streamType} ${existing.streamProfile.width}x${existing.streamProfile.height}`,
      to: `${profile.streamType} ${profile.width}x${profile.height}`,
    });

    // Update handle
    existing.streamProfile = profile;
    existing.activatedAt = Date.now();

    this.callbacks.onDecoderUpgraded?.(cameraId, profile);
  }

  /**
   * Downgrade stream to lower quality
   */
  async downgrade(
    cameraId: string,
    profile: StreamProfile
  ): Promise<void> {
    const existing = this.handles.get(cameraId);
    if (!existing) {
      // Not currently allocated - just acquire
      await this.acquire(cameraId, profile);
      return;
    }

    console.log(`[DecoderPool] Downgrading ${cameraId}:`, {
      from: `${existing.streamProfile.streamType} ${existing.streamProfile.width}x${existing.streamProfile.height}`,
      to: `${profile.streamType} ${profile.width}x${profile.height}`,
    });

    // Update handle
    existing.streamProfile = profile;
    existing.activatedAt = Date.now();

    this.callbacks.onDecoderDowngraded?.(cameraId, profile);
  }

  /**
   * Attach a video element to a decoder handle
   */
  attachVideoElement(
    cameraId: string,
    videoElement: HTMLVideoElement
  ): void {
    const handle = this.handles.get(cameraId);
    if (!handle) {
      console.warn(`[DecoderPool] Cannot attach video - no handle for ${cameraId}`);
      return;
    }

    handle.videoElement = videoElement;
  }

  /**
   * Get decoder handle for a camera
   */
  getHandle(cameraId: string): DecoderHandle | undefined {
    return this.handles.get(cameraId);
  }

  /**
   * Get all active decoder handles
   */
  getAllHandles(): DecoderHandle[] {
    return Array.from(this.handles.values());
  }

  /**
   * Get active decoder count
   */
  getActiveCount(): number {
    return this.handles.size;
  }

  /**
   * Check if camera has active decoder
   */
  hasDecoder(cameraId: string): boolean {
    return this.handles.has(cameraId);
  }

  /**
   * Get playback metrics for a camera
   */
  getMetrics(cameraId: string): PlaybackMetrics | null {
    const handle = this.handles.get(cameraId);
    if (!handle?.videoElement) {
      return null;
    }

    return this.collectVideoMetrics(handle.videoElement);
  }

  /**
   * Get metrics for all active decoders
   */
  getAllMetrics(): Map<string, PlaybackMetrics> {
    const metrics = new Map<string, PlaybackMetrics>();

    for (const [cameraId, handle] of this.handles.entries()) {
      if (handle.videoElement) {
        const metric = this.collectVideoMetrics(handle.videoElement);
        if (metric) {
          metrics.set(cameraId, metric);
        }
      }
    }

    return metrics;
  }

  /**
   * Update last frame timestamp
   */
  updateLastFrame(cameraId: string): void {
    const handle = this.handles.get(cameraId);
    if (handle) {
      handle.lastFrameAt = Date.now();
    }
  }

  /**
   * Release all decoders
   */
  async releaseAll(): Promise<void> {
    console.log(`[DecoderPool] Releasing all ${this.handles.size} decoders`);
    
    const cameraIds = Array.from(this.handles.keys());
    for (const cameraId of cameraIds) {
      await this.release(cameraId);
    }
  }

  /**
   * Get total resource usage
   */
  getTotalUsage(): {
    decoderCount: number;
    totalBitrateMbps: number;
    totalPixelsPerSecond: number;
  } {
    let totalBitrateMbps = 0;
    let totalPixelsPerSecond = 0;

    for (const handle of this.handles.values()) {
      const profile = handle.streamProfile;
      totalBitrateMbps += profile.estimatedBitrateKbps / 1000;
      totalPixelsPerSecond += profile.width * profile.height * profile.fps;
    }

    return {
      decoderCount: this.handles.size,
      totalBitrateMbps,
      totalPixelsPerSecond,
    };
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  /**
   * Check if two profiles are the same
   */
  private isSameProfile(a: StreamProfile, b: StreamProfile): boolean {
    return (
      a.streamType === b.streamType &&
      a.codec === b.codec &&
      a.width === b.width &&
      a.height === b.height &&
      a.fps === b.fps
    );
  }

  /**
   * Collect metrics from video element
   */
  private collectVideoMetrics(
    videoElement: HTMLVideoElement
  ): PlaybackMetrics | null {
    try {
      // Use getVideoPlaybackQuality if available
      if ('getVideoPlaybackQuality' in videoElement) {
        const quality = videoElement.getVideoPlaybackQuality();
        
        const totalFrames = quality.totalVideoFrames || 0;
        const droppedFrames = quality.droppedVideoFrames || 0;

        return {
          totalFrames,
          droppedFrames,
          droppedFrameRatio: totalFrames > 0 ? droppedFrames / totalFrames : 0,
          bufferHealthMs: this.estimateBufferHealth(videoElement),
          stallCount: 0, // Would need to track separately
        };
      }

      // Fallback for browsers without getVideoPlaybackQuality
      return {
        totalFrames: 0,
        droppedFrames: 0,
        droppedFrameRatio: 0,
        bufferHealthMs: this.estimateBufferHealth(videoElement),
        stallCount: 0,
      };
    } catch (error) {
      console.error('[DecoderPool] Error collecting metrics:', error);
      return null;
    }
  }

  /**
   * Estimate buffer health from video element
   */
  private estimateBufferHealth(videoElement: HTMLVideoElement): number {
    try {
      if (videoElement.buffered.length > 0) {
        const currentTime = videoElement.currentTime;
        const bufferedEnd = videoElement.buffered.end(videoElement.buffered.length - 1);
        return (bufferedEnd - currentTime) * 1000; // Convert to ms
      }
    } catch (error) {
      // Ignore errors accessing buffered
    }
    return 0;
  }

  /**
   * Cleanup video element resources
   */
  private cleanupVideoElement(videoElement: HTMLVideoElement): void {
    try {
      // Pause and clear source
      videoElement.pause();
      videoElement.src = '';
      videoElement.load();

      // Remove srcObject if present
      if (videoElement.srcObject) {
        if (videoElement.srcObject instanceof MediaStream) {
          videoElement.srcObject.getTracks().forEach(track => track.stop());
        }
        videoElement.srcObject = null;
      }
    } catch (error) {
      console.warn('[DecoderPool] Error cleaning up video element:', error);
    }
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let poolInstance: DecoderPool | null = null;

export function getDecoderPool(callbacks?: DecoderPoolCallbacks): DecoderPool {
  if (!poolInstance) {
    poolInstance = new DecoderPool(callbacks);
  }
  return poolInstance;
}

export function resetDecoderPool(): void {
  if (poolInstance) {
    poolInstance.releaseAll();
    poolInstance = null;
  }
}
