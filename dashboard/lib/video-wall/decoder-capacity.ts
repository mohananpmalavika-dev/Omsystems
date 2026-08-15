/**
 * Viewer Hardware & Decoder Capacity Detector
 * 
 * Accurately measures and bounds workstation decoding limits at runtime.
 */

import type { VideoWallCapacity, HardwareAccelerationState } from "./types";

export function detectViewerCapacity(customLimit?: number): VideoWallCapacity {
  if (typeof window === "undefined") {
    return {
      maxGridSlots: 144,
      maxActiveDecoders: customLimit ?? 32,
      maxAggregateBitrateMbps: 80,
      maxPixelsPerSecond: 180_000_000,
      maxMainStreams: 4,
      maxSubStreams: 28,
      hardwareAcceleration: "UNKNOWN",
      measuredAt: new Date().toISOString(),
    };
  }

  const cores = navigator.hardwareConcurrency || 4;
  const memoryGb = (navigator as unknown as { deviceMemory?: number }).deviceMemory || 8;
  const screenWidth = window.screen.width || 1920;
  const screenHeight = window.screen.height || 1080;

  // Check hardware acceleration presence via WebGL context capabilities
  let hwState: HardwareAccelerationState = "UNKNOWN";
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    if (gl) {
      const debugInfo = (gl as WebGLRenderingContext).getExtension("WEBGL_debug_renderer_info");
      if (debugInfo) {
        const renderer = (gl as WebGLRenderingContext).getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
        if (typeof renderer === "string" && !renderer.includes("Software") && !renderer.includes("llvmpipe")) {
          hwState = "AVAILABLE";
        } else {
          hwState = "UNAVAILABLE";
        }
      } else {
        hwState = "AVAILABLE";
      }
    }
  } catch {
    hwState = "UNKNOWN";
  }

  // Derive safe concurrent active decoders
  let baseDecoders = 16;
  if (cores >= 16 && memoryGb >= 16) {
    baseDecoders = 48;
  } else if (cores >= 8 && memoryGb >= 8) {
    baseDecoders = 36;
  } else if (cores >= 4) {
    baseDecoders = 24;
  }

  if (hwState === "UNAVAILABLE") {
    baseDecoders = Math.min(baseDecoders, 16);
  }

  const safeDecoders = customLimit ? Math.min(customLimit, 64) : baseDecoders;
  const maxMain = Math.min(4, Math.floor(safeDecoders * 0.15));
  const maxSub = safeDecoders - maxMain;

  return {
    maxGridSlots: 144,
    maxActiveDecoders: safeDecoders,
    maxAggregateBitrateMbps: Math.round(safeDecoders * 2.2),
    maxPixelsPerSecond: safeDecoders * 5_000_000,
    maxMainStreams: Math.max(1, maxMain),
    maxSubStreams: Math.max(1, maxSub),
    hardwareAcceleration: hwState,
    measuredAt: new Date().toISOString(),
  };
}
