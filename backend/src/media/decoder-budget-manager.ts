/**
 * Decoder Budget Manager
 * Manages client-side decoding capacity and resource allocation
 */

import { logger } from "../utils/logger.js";
import type {
  DecoderBudget,
  ClientMediaCapabilities,
  VideoProfile,
  DecoderCost,
} from "./types.js";

export class DecoderBudgetManager {
  private budget: DecoderBudget;
  private activeStreams: Map<string, DecoderCost> = new Map();

  constructor(
    private readonly clientCapabilities: ClientMediaCapabilities,
    private readonly maxConcurrentStreams: number = 36
  ) {
    this.budget = this.calculateInitialBudget();
  }

  /**
   * Calculate initial budget based on client capabilities
   */
  private calculateInitialBudget(): DecoderBudget {
    const {
      estimatedDecodeClass,
      hardwareConcurrency,
      gpuAccelerationAvailable,
      h265Supported,
      screenResolution,
    } = this.clientCapabilities;

    // Base decoder count by capability class
    let maxDecoders: number;
    switch (estimatedDecodeClass) {
      case "VIDEO_WALL":
        maxDecoders = Math.min(144, this.maxConcurrentStreams);
        break;
      case "HIGH":
        maxDecoders = Math.min(64, this.maxConcurrentStreams);
        break;
      case "STANDARD":
        maxDecoders = Math.min(36, this.maxConcurrentStreams);
        break;
      case "LOW":
      default:
        maxDecoders = Math.min(16, this.maxConcurrentStreams);
    }

    // Adjust for hardware concurrency
    if (hardwareConcurrency < 4) {
      maxDecoders = Math.min(maxDecoders, 16);
    } else if (hardwareConcurrency >= 16) {
      maxDecoders = Math.min(maxDecoders * 1.5, this.maxConcurrentStreams);
    }

    // Adjust for GPU acceleration
    if (!gpuAccelerationAvailable && maxDecoders > 25) {
      maxDecoders = Math.floor(maxDecoders * 0.7);
    }

    // Calculate max pixel rate (total pixels per second we can decode)
    // Assume 1080p@30fps as baseline (~62M pixels/sec)
    const baselinePixelRate = 1920 * 1080 * 30;
    let maxPixelRate: number;

    if (estimatedDecodeClass === "VIDEO_WALL") {
      maxPixelRate = baselinePixelRate * 10; // Can handle 10x 1080p@30fps
    } else if (estimatedDecodeClass === "HIGH") {
      maxPixelRate = baselinePixelRate * 5;
    } else if (estimatedDecodeClass === "STANDARD") {
      maxPixelRate = baselinePixelRate * 3;
    } else {
      maxPixelRate = baselinePixelRate * 1.5;
    }

    // Estimate bandwidth (assuming ~3 Mbps per H264 substream, ~8 Mbps per mainstream)
    const estimatedBandwidthMbps = maxDecoders * 3;

    return {
      maxActiveDecoders: Math.floor(maxDecoders),
      currentActiveDecoders: 0,
      maxPixelRate,
      currentPixelRate: 0,
      estimatedBandwidthMbps,
      gpuAccelerationAvailable: gpuAccelerationAvailable ?? false,
      preferredCodec: h265Supported ? "H265" : "H264",
    };
  }

  /**
   * Calculate decoder cost for a stream profile
   */
  calculateDecoderCost(profile: VideoProfile): DecoderCost {
    const pixelsPerSecond = profile.width * profile.height * profile.fps;
    
    // H.265 is ~1.35x more compute-intensive to decode than H.264
    const codecFactor = profile.codec === "H265" ? 1.35 : 1.0;
    
    // Normalize cost relative to 360p@8fps (baseline monitoring stream)
    const baselinePixels = 640 * 360 * 8;
    const estimatedCost = (pixelsPerSecond / baselinePixels) * codecFactor;

    return {
      cameraId: "", // Will be set by caller
      profile,
      pixelsPerSecond,
      estimatedCost,
    };
  }

  /**
   * Check if we can allocate a new decoder
   */
  canAllocate(profile: VideoProfile, cameraId: string): boolean {
    const cost = this.calculateDecoderCost(profile);
    cost.cameraId = cameraId;

    // Check decoder count limit
    if (this.budget.currentActiveDecoders >= this.budget.maxActiveDecoders) {
      logger.debug("Decoder budget exhausted (count)", {
        current: this.budget.currentActiveDecoders,
        max: this.budget.maxActiveDecoders,
      });
      return false;
    }

    // Check pixel rate limit
    const newPixelRate = this.budget.currentPixelRate + cost.pixelsPerSecond;
    if (newPixelRate > this.budget.maxPixelRate) {
      logger.debug("Decoder budget exhausted (pixel rate)", {
        currentMpx: (this.budget.currentPixelRate / 1_000_000).toFixed(2),
        maxMpx: (this.budget.maxPixelRate / 1_000_000).toFixed(2),
        requestedMpx: (cost.pixelsPerSecond / 1_000_000).toFixed(2),
      });
      return false;
    }

    return true;
  }

  /**
   * Allocate decoder for stream
   */
  allocate(profile: VideoProfile, cameraId: string): boolean {
    if (!this.canAllocate(profile, cameraId)) {
      return false;
    }

    const cost = this.calculateDecoderCost(profile);
    cost.cameraId = cameraId;

    this.activeStreams.set(cameraId, cost);
    this.budget.currentActiveDecoders++;
    this.budget.currentPixelRate += cost.pixelsPerSecond;

    logger.debug("Decoder allocated", {
      cameraId,
      profile: `${profile.width}x${profile.height}@${profile.fps}fps`,
      activeDecoders: this.budget.currentActiveDecoders,
      pixelRateMpx: (this.budget.currentPixelRate / 1_000_000).toFixed(2),
    });

    return true;
  }

  /**
   * Release decoder for camera
   */
  release(cameraId: string): boolean {
    const cost = this.activeStreams.get(cameraId);
    if (!cost) {
      return false;
    }

    this.activeStreams.delete(cameraId);
    this.budget.currentActiveDecoders--;
    this.budget.currentPixelRate -= cost.pixelsPerSecond;

    logger.debug("Decoder released", {
      cameraId,
      activeDecoders: this.budget.currentActiveDecoders,
      pixelRateMpx: (this.budget.currentPixelRate / 1_000_000).toFixed(2),
    });

    return true;
  }

  /**
   * Get current budget state
   */
  getBudget(): Readonly<DecoderBudget> {
    return { ...this.budget };
  }

  /**
   * Get active stream costs
   */
  getActiveStreams(): Map<string, Readonly<DecoderCost>> {
    return new Map(this.activeStreams);
  }

  /**
   * Get available decoder capacity
   */
  getAvailableCapacity(): {
    availableDecoders: number;
    availablePixelRate: number;
    utilizationPercent: number;
  } {
    const availableDecoders = Math.max(
      0,
      this.budget.maxActiveDecoders - this.budget.currentActiveDecoders
    );

    const availablePixelRate = Math.max(
      0,
      this.budget.maxPixelRate - this.budget.currentPixelRate
    );

    const decoderUtilization =
      (this.budget.currentActiveDecoders / this.budget.maxActiveDecoders) * 100;
    const pixelUtilization =
      (this.budget.currentPixelRate / this.budget.maxPixelRate) * 100;
    const utilizationPercent = Math.max(decoderUtilization, pixelUtilization);

    return {
      availableDecoders,
      availablePixelRate,
      utilizationPercent,
    };
  }

  /**
   * Suggest profile based on current budget
   */
  suggestProfile(
    mainStream: VideoProfile,
    subStream: VideoProfile | undefined,
    priority: number
  ): VideoProfile | null {
    // High priority always tries mainstream first
    if (priority >= 800 && mainStream && this.canAllocate(mainStream, "test")) {
      return mainStream;
    }

    // Try substream
    if (subStream && this.canAllocate(subStream, "test")) {
      return subStream;
    }

    // High priority can still get mainstream even if tight
    if (priority >= 800 && mainStream) {
      return mainStream;
    }

    // No capacity
    return null;
  }

  /**
   * Force refresh budget calculation (e.g., after browser resize)
   */
  refresh(newCapabilities?: Partial<ClientMediaCapabilities>): void {
    if (newCapabilities) {
      Object.assign(this.clientCapabilities, newCapabilities);
    }
    
    const oldMax = this.budget.maxActiveDecoders;
    this.budget = this.calculateInitialBudget();
    
    // Preserve current usage
    this.budget.currentActiveDecoders = this.activeStreams.size;
    this.budget.currentPixelRate = Array.from(this.activeStreams.values())
      .reduce((sum, cost) => sum + cost.pixelsPerSecond, 0);

    logger.info("Decoder budget refreshed", {
      oldMax,
      newMax: this.budget.maxActiveDecoders,
      current: this.budget.currentActiveDecoders,
    });
  }

  /**
   * Get metrics for monitoring
   */
  getMetrics(): {
    maxDecoders: number;
    activeDecoders: number;
    utilizationPercent: number;
    pixelRateMpx: number;
    maxPixelRateMpx: number;
    estimatedBandwidthMbps: number;
    gpuAccelerated: boolean;
  } {
    const { utilizationPercent } = this.getAvailableCapacity();

    return {
      maxDecoders: this.budget.maxActiveDecoders,
      activeDecoders: this.budget.currentActiveDecoders,
      utilizationPercent,
      pixelRateMpx: this.budget.currentPixelRate / 1_000_000,
      maxPixelRateMpx: this.budget.maxPixelRate / 1_000_000,
      estimatedBandwidthMbps: this.budget.estimatedBandwidthMbps,
      gpuAccelerated: this.budget.gpuAccelerationAvailable,
    };
  }
}
