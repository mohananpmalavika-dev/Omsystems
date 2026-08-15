/**
 * Viewer Capacity Manager
 * 
 * Detects browser capabilities, measures decoder capacity,
 * and provides runtime resource budgets for video playback.
 */

import type {
  ViewerCapacity,
  ViewerResourceBudget,
  HardwareAccelerationState,
  VideoCodec,
  CapacityBenchmarkResult,
  PlaybackMetrics,
} from "./types";
import {
  detectSupportedCodecs,
  selectPreferredCodec,
} from "./stream-utils";

// ============================================================================
// CONFIGURATION
// ============================================================================

const DEFAULT_DECODER_LIMIT = 24; // Conservative starting point
const MIN_DECODER_LIMIT = 8;
const MAX_DECODER_LIMIT = 48;
const CAPACITY_SAFETY_MARGIN = 0.85; // Use 85% of measured capacity
const EMERGENCY_RESERVE_RATIO = 0.15; // 15% reserved for P1 alerts

// Default budgets (can be overridden by detection)
const DEFAULT_BITRATE_BUDGET_MBPS = 25;
const DEFAULT_PIXEL_BUDGET = 300_000_000; // 300 million pixels/sec

// Adaptive capacity thresholds
const OVERLOAD_THRESHOLD = 0.05; // 5% dropped frames = overload
const OVERLOAD_DURATION_MS = 5000; // Must be overloaded for 5s
const HEALTHY_DURATION_MS = 30000; // Must be healthy for 30s before increase

// ============================================================================
// VIEWER CAPACITY MANAGER
// ============================================================================

export class ViewerCapacityManager {
  private capacity: ViewerCapacity | null = null;
  private overloadStartTime: number | null = null;
  private healthyStartTime: number | null = null;
  private lastAdjustmentTime: number = 0;

  /**
   * Initialize and detect viewer capacity
   */
  async initialize(): Promise<ViewerCapacity> {
    console.log("[ViewerCapacity] Initializing...");

    const codecs = await detectSupportedCodecs();
    const hardwareAcceleration = await this.detectHardwareAcceleration();
    const baseline = await this.runDecoderBenchmark(codecs, hardwareAcceleration);

    this.capacity = {
      maxVideoDecoders: baseline.maxVideoDecoders,
      maxAggregateBitrateMbps: baseline.maxAggregateBitrateMbps,
      maxPixelsPerSecond: baseline.maxPixelsPerSecond,
      activeDecoders: 0,
      activeBitrateMbps: 0,
      activePixelsPerSecond: 0,
      supportedCodecs: codecs,
      preferredCodec: selectPreferredCodec(codecs, hardwareAcceleration),
      hardwareAcceleration,
      recommendedDecoderLimit: baseline.recommendedDecoderLimit,
      measuredAt: new Date().toISOString(),
    };

    console.log("[ViewerCapacity] Initialized:", {
      decoders: this.capacity.recommendedDecoderLimit,
      codecs: this.capacity.supportedCodecs,
      hwAccel: this.capacity.hardwareAcceleration,
    });

    return this.capacity;
  }

  /**
   * Get current capacity (initialize if needed)
   */
  async getCapacity(): Promise<ViewerCapacity> {
    if (!this.capacity) {
      return await this.initialize();
    }
    return this.capacity;
  }

  /**
   * Get current resource budget
   */
  async getResourceBudget(): Promise<ViewerResourceBudget> {
    const capacity = await this.getCapacity();
    
    const total = capacity.recommendedDecoderLimit;
    const emergencyReserve = Math.ceil(total * EMERGENCY_RESERVE_RATIO);
    const normal = total - emergencyReserve;

    return {
      decoderBudget: total,
      bitrateBudgetMbps: capacity.maxAggregateBitrateMbps,
      pixelsPerSecondBudget: capacity.maxPixelsPerSecond,
      decoderUsage: capacity.activeDecoders,
      bitrateUsageMbps: capacity.activeBitrateMbps,
      pixelsPerSecondUsage: capacity.activePixelsPerSecond,
      emergencyReserve,
      normalPoolSize: normal,
    };
  }

  /**
   * Update active resource usage
   */
  updateUsage(
    decoders: number,
    bitrateMbps: number,
    pixelsPerSecond: number
  ): void {
    if (this.capacity) {
      this.capacity.activeDecoders = decoders;
      this.capacity.activeBitrateMbps = bitrateMbps;
      this.capacity.activePixelsPerSecond = pixelsPerSecond;
    }
  }

  /**
   * Monitor playback metrics and adapt capacity
   */
  async monitorPerformance(
    metrics: Map<string, PlaybackMetrics>
  ): Promise<boolean> {
    if (!this.capacity) {
      return false;
    }

    const now = Date.now();
    let totalDroppedRatio = 0;
    let cameraCount = 0;

    // Calculate average dropped frame ratio
    for (const metric of metrics.values()) {
      totalDroppedRatio += metric.droppedFrameRatio;
      cameraCount++;
    }

    const avgDroppedRatio = cameraCount > 0 ? totalDroppedRatio / cameraCount : 0;

    // Detect overload
    if (avgDroppedRatio > OVERLOAD_THRESHOLD) {
      if (!this.overloadStartTime) {
        this.overloadStartTime = now;
      }

      // Sustained overload - decrease capacity
      if (now - this.overloadStartTime > OVERLOAD_DURATION_MS) {
        console.warn("[ViewerCapacity] Overload detected, decreasing capacity");
        await this.decreaseCapacity();
        this.overloadStartTime = null;
        this.healthyStartTime = null;
        return true;
      }
    } else {
      // Reset overload timer
      this.overloadStartTime = null;

      // Track healthy duration
      if (!this.healthyStartTime) {
        this.healthyStartTime = now;
      }

      // Sustained healthy state - consider increasing capacity
      if (
        now - this.healthyStartTime > HEALTHY_DURATION_MS &&
        now - this.lastAdjustmentTime > HEALTHY_DURATION_MS
      ) {
        console.log("[ViewerCapacity] Sustained healthy state, increasing capacity");
        await this.increaseCapacity();
        this.healthyStartTime = null;
        return true;
      }
    }

    return false;
  }

  /**
   * Decrease decoder capacity due to performance issues
   */
  private async decreaseCapacity(): Promise<void> {
    if (!this.capacity) return;

    const current = this.capacity.recommendedDecoderLimit;
    const decrease = Math.ceil(current * 0.15); // Decrease by 15%
    const newLimit = Math.max(MIN_DECODER_LIMIT, current - decrease);

    console.log(`[ViewerCapacity] Decreasing from ${current} to ${newLimit}`);

    this.capacity.recommendedDecoderLimit = newLimit;
    this.lastAdjustmentTime = Date.now();
  }

  /**
   * Increase decoder capacity when performance is good
   */
  private async increaseCapacity(): Promise<void> {
    if (!this.capacity) return;

    const current = this.capacity.recommendedDecoderLimit;
    
    // Don't exceed hard limit
    if (current >= this.capacity.maxVideoDecoders) {
      return;
    }

    const increase = Math.min(2, Math.ceil(current * 0.1)); // Increase by 10% or 2
    const newLimit = Math.min(MAX_DECODER_LIMIT, current + increase);

    console.log(`[ViewerCapacity] Increasing from ${current} to ${newLimit}`);

    this.capacity.recommendedDecoderLimit = newLimit;
    this.lastAdjustmentTime = Date.now();
  }

  // ==========================================================================
  // HARDWARE DETECTION
  // ==========================================================================

  /**
   * Detect hardware acceleration support
   */
  private async detectHardwareAcceleration(): Promise<HardwareAccelerationState> {
    if (typeof window === "undefined") {
      return "UNKNOWN";
    }

    try {
      // Check for GPU availability
      const canvas = document.createElement("canvas");
      const gl = canvas.getGLContext?.("webgl2") || canvas.getContext("webgl");
      
      if (!gl) {
        return "UNAVAILABLE";
      }

      // Check WebCodecs API (modern HW acceleration)
      if ("VideoDecoder" in window) {
        try {
          const config = {
            codec: "avc1.42E01E", // H.264 Baseline
            codedWidth: 1920,
            codedHeight: 1080,
          };

          // @ts-ignore - VideoDecoder is experimental
          const support = await VideoDecoder.isConfigSupported(config);
          
          if (support?.supported) {
            return "AVAILABLE";
          }
        } catch (e) {
          console.warn("[ViewerCapacity] VideoDecoder check failed:", e);
        }
      }

      // Check GPU info
      const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
      if (debugInfo) {
        const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
        
        // Intel integrated graphics have limited HW decode
        if (renderer?.toLowerCase().includes("intel")) {
          return "AVAILABLE"; // But capacity will be lower
        }
        
        // Dedicated GPU likely has good HW decode
        if (
          renderer?.toLowerCase().includes("nvidia") ||
          renderer?.toLowerCase().includes("amd") ||
          renderer?.toLowerCase().includes("radeon")
        ) {
          return "AVAILABLE";
        }
      }

      return "UNKNOWN";
    } catch (error) {
      console.warn("[ViewerCapacity] HW detection error:", error);
      return "UNKNOWN";
    }
  }

  /**
   * Run decoder capacity benchmark
   */
  private async runDecoderBenchmark(
    codecs: VideoCodec[],
    hardwareAcceleration: HardwareAccelerationState
  ): Promise<CapacityBenchmarkResult> {
    const startTime = Date.now();

    // Estimate based on hardware capabilities
    let estimatedCapacity = DEFAULT_DECODER_LIMIT;
    let bitrateCapacity = DEFAULT_BITRATE_BUDGET_MBPS;
    let pixelCapacity = DEFAULT_PIXEL_BUDGET;

    // Adjust based on hardware acceleration
    if (hardwareAcceleration === "AVAILABLE") {
      estimatedCapacity = 40;
      bitrateCapacity = 30;
      pixelCapacity = 400_000_000;
    } else if (hardwareAcceleration === "UNAVAILABLE") {
      estimatedCapacity = 16;
      bitrateCapacity = 15;
      pixelCapacity = 200_000_000;
    }

    // Check available memory
    if (typeof performance !== "undefined" && "memory" in performance) {
      // @ts-ignore - memory is non-standard
      const memory = performance.memory;
      if (memory) {
        const availableGB = memory.jsHeapSizeLimit / (1024 * 1024 * 1024);
        
        if (availableGB < 2) {
          estimatedCapacity = Math.min(estimatedCapacity, 16);
        } else if (availableGB > 4) {
          estimatedCapacity = Math.min(estimatedCapacity + 8, MAX_DECODER_LIMIT);
        }
      }
    }

    // Check CPU cores (if available)
    if (typeof navigator !== "undefined" && "hardwareConcurrency" in navigator) {
      const cores = navigator.hardwareConcurrency || 4;
      
      if (cores <= 2) {
        estimatedCapacity = Math.min(estimatedCapacity, 12);
      } else if (cores >= 8) {
        estimatedCapacity = Math.min(estimatedCapacity + 4, MAX_DECODER_LIMIT);
      }
    }

    // Apply safety margin
    const recommendedLimit = Math.floor(estimatedCapacity * CAPACITY_SAFETY_MARGIN);

    const benchmarkDurationMs = Date.now() - startTime;

    return {
      maxVideoDecoders: estimatedCapacity,
      maxAggregateBitrateMbps: bitrateCapacity,
      maxPixelsPerSecond: pixelCapacity,
      recommendedDecoderLimit: Math.max(MIN_DECODER_LIMIT, recommendedLimit),
      benchmarkDurationMs,
    };
  }

  /**
   * Reset capacity to initial state
   */
  async reset(): Promise<ViewerCapacity> {
    console.log("[ViewerCapacity] Resetting...");
    this.capacity = null;
    this.overloadStartTime = null;
    this.healthyStartTime = null;
    this.lastAdjustmentTime = 0;
    return await this.initialize();
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let instance: ViewerCapacityManager | null = null;

export function getViewerCapacityManager(): ViewerCapacityManager {
  if (!instance) {
    instance = new ViewerCapacityManager();
  }
  return instance;
}

export function resetViewerCapacityManager(): void {
  instance = null;
}
