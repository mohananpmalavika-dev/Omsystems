/**
 * Viewport State & Offscreen Grace Tracker
 * 
 * Tracks visible camera range with hysteresis and off-screen grace periods to prevent
 * stream thrashing during grid scrolling.
 */

export interface ViewportRange {
  startIndex: number;
  endIndex: number;
}

export class ViewportTracker {
  private offscreenTimestamps = new Map<string, number>();

  constructor(private readonly offscreenGraceMs = 3000) {}

  /**
   * Determine if a camera should be considered active in the viewport,
   * accounting for the offscreen grace period.
   */
  isCameraEffectivelyVisible(
    cameraId: string,
    index: number,
    range?: ViewportRange,
    now = Date.now()
  ): { isVisible: boolean; inGracePeriod: boolean } {
    if (!range) {
      return { isVisible: true, inGracePeriod: false };
    }

    const currentlyInView = index >= range.startIndex && index <= range.endIndex;

    if (currentlyInView) {
      this.offscreenTimestamps.delete(cameraId);
      return { isVisible: true, inGracePeriod: false };
    }

    // Check if within grace period
    const offscreenSince = this.offscreenTimestamps.get(cameraId);
    if (!offscreenSince) {
      this.offscreenTimestamps.set(cameraId, now);
      return { isVisible: true, inGracePeriod: true };
    }

    const elapsed = now - offscreenSince;
    if (elapsed <= this.offscreenGraceMs) {
      return { isVisible: true, inGracePeriod: true };
    }

    return { isVisible: false, inGracePeriod: false };
  }

  clear(): void {
    this.offscreenTimestamps.clear();
  }
}
