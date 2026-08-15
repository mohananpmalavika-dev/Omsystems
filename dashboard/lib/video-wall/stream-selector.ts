/**
 * Dynamic Stream Profile & Resolution Selector
 * 
 * Adapts stream profile, resolution, and FPS to match physical tile dimensions,
 * operator purpose, and presentation mode.
 */

import type { CameraSchedulingContext } from "./types";

export interface TargetStreamConfig {
  profile: "MAIN" | "SUB" | "THUMBNAIL";
  width: number;
  height: number;
  fps: number;
  estimatedBitrateKbps: number;
}

export function selectTargetStreamConfig(
  ctx: CameraSchedulingContext,
  tileWidth = 320,
  tileHeight = 180
): TargetStreamConfig {
  // 1. Investigation, Fullscreen, or Operator-Selected enlarged tile -> Main Stream
  if (ctx.isFullscreen || (ctx.isSelected && tileWidth >= 640) || ctx.purpose === "INVESTIGATION") {
    return {
      profile: "MAIN",
      width: 1920,
      height: 1080,
      fps: 25,
      estimatedBitrateKbps: 4000,
    };
  }

  // 2. High resolution sub-layout (e.g. 1x1, 2x2 with large screens)
  if (tileWidth >= 800) {
    return {
      profile: "MAIN",
      width: 1280,
      height: 720,
      fps: 20,
      estimatedBitrateKbps: 2000,
    };
  }

  // 3. Medium tile sizes (e.g. 3x3, 4x4)
  if (tileWidth >= 360) {
    return {
      profile: "SUB",
      width: 640,
      height: 360,
      fps: 15,
      estimatedBitrateKbps: 600,
    };
  }

  // 4. Dense grid positions (e.g. 6x6, 8x8, 12x12)
  if (tileWidth >= 160) {
    return {
      profile: "SUB",
      width: 480,
      height: 270,
      fps: 10,
      estimatedBitrateKbps: 300,
    };
  }

  // 5. Ultra compact thumbnail positions
  return {
    profile: "THUMBNAIL",
    width: 320,
    height: 180,
    fps: 5,
    estimatedBitrateKbps: 150,
  };
}
