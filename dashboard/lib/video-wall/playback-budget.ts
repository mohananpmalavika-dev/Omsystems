/**
 * Playback Resource Budgeting & Unit Cost Calculator
 * 
 * Computes normalized decoder units, pixel processing throughput, and aggregate bandwidth.
 */

import type { VideoWallCapacity } from "./types";

export interface StreamCostMetrics {
  decoderUnits: number;
  bitrateMbps: number;
  pixelsPerSecond: number;
}

export function calculateStreamCost(
  width: number,
  height: number,
  fps: number,
  bitrateKbps: number
): StreamCostMetrics {
  const pixelsPerSecond = width * height * fps;
  const bitrateMbps = bitrateKbps / 1000;

  // Normalized decoder units (1.0 = 1080p @ 25 FPS)
  const base1080pPixelsPerSec = 1920 * 1080 * 25; // 51.84M px/s
  const decoderUnits = Math.max(0.1, Number((pixelsPerSecond / base1080pPixelsPerSec).toFixed(2)));

  return {
    decoderUnits,
    bitrateMbps,
    pixelsPerSecond,
  };
}

export class PlaybackBudgetManager {
  private currentBitrateMbps = 0;
  private currentPixelsPerSecond = 0;
  private currentDecoderUnits = 0;

  constructor(public readonly capacity: VideoWallCapacity) {}

  reset(): void {
    this.currentBitrateMbps = 0;
    this.currentPixelsPerSecond = 0;
    this.currentDecoderUnits = 0;
  }

  canAdmit(cost: StreamCostMetrics, isProtected = false): boolean {
    if (isProtected) {
      return true; // Emergency / operator selected streams override soft caps
    }

    const projectedBitrate = this.currentBitrateMbps + cost.bitrateMbps;
    const projectedPixels = this.currentPixelsPerSecond + cost.pixelsPerSecond;

    return (
      projectedBitrate <= this.capacity.maxAggregateBitrateMbps &&
      projectedPixels <= this.capacity.maxPixelsPerSecond
    );
  }

  recordAdmission(cost: StreamCostMetrics): void {
    this.currentBitrateMbps += cost.bitrateMbps;
    this.currentPixelsPerSecond += cost.pixelsPerSecond;
    this.currentDecoderUnits += cost.decoderUnits;
  }

  getTotals() {
    return {
      bitrateMbps: this.currentBitrateMbps,
      pixelsPerSecond: this.currentPixelsPerSecond,
      decoderUnits: this.currentDecoderUnits,
    };
  }
}
