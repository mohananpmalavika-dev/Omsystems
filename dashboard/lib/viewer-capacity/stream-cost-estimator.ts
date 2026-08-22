/**
 * Stream Cost Estimator & Quality Policy
 * 
 * Computes multi-dimensional hardware cost (pixels/second, aggregate bitrate,
 * and normalized decoder units) for video streams.
 */

import type { RequestedQuality, StreamProfile, StreamType } from "./types";

export const QUALITY_POLICY = {
  THUMBNAIL: {
    preferredWidth: 320,
    preferredHeight: 180,
    preferredFps: 1,
    defaultBitrateMbps: 0.08,
    streamType: "THUMBNAIL" as StreamType,
  },
  GRID: {
    preferredWidth: 640,
    preferredHeight: 360,
    preferredFps: 8,
    defaultBitrateMbps: 0.45,
    streamType: "SUB" as StreamType,
  },
  FOCUSED: {
    preferredWidth: 1920,
    preferredHeight: 1080,
    preferredFps: 25,
    defaultBitrateMbps: 3.5,
    streamType: "MAIN" as StreamType,
  },
} as const;

/**
 * Calculates raw pixel throughput consumed per second by a stream.
 * e.g. 640 x 360 x 10 fps = 2.3M pixels/sec
 * e.g. 1920 x 1080 x 25 fps = 51.8M pixels/sec
 */
export function pixelsPerSecond(stream: Pick<StreamProfile, "width" | "height" | "fps">): number {
  return (stream.width || 640) * (stream.height || 360) * (stream.fps || 10);
}

export interface StreamCost {
  pixelsPerSec: number;
  bitrateMbps: number;
  decoderUnits: number;
}

/**
 * Derives normalized decoder units where 1.0 represents a full 1080p25 H.264 stream.
 */
export function calculateStreamCost(stream: StreamProfile): StreamCost {
  const pps = pixelsPerSecond(stream);
  const baseline1080p25 = 1920 * 1080 * 25; // 51,840,000 px/s

  let normalizedDecoderUnits = pps / baseline1080p25;
  if (stream.streamType === "THUMBNAIL") {
    normalizedDecoderUnits = 0.02;
  } else if (stream.streamType === "SUB") {
    normalizedDecoderUnits = Math.min(0.20, Math.max(0.08, normalizedDecoderUnits));
  }

  return {
    pixelsPerSec: pps,
    bitrateMbps: stream.bitrateMbps || 0.45,
    decoderUnits: Math.max(0.02, normalizedDecoderUnits),
  };
}

/**
 * Generates an optimized StreamProfile matching the requested quality class.
 */
export function generateStreamProfile(
  cameraId: string,
  quality: RequestedQuality,
  overrides?: Partial<StreamProfile>
): StreamProfile {
  const policy = QUALITY_POLICY[quality];
  return {
    cameraId,
    codec: overrides?.codec ?? "H264",
    width: overrides?.width ?? policy.preferredWidth,
    height: overrides?.height ?? policy.preferredHeight,
    fps: overrides?.fps ?? policy.preferredFps,
    bitrateMbps: overrides?.bitrateMbps ?? policy.defaultBitrateMbps,
    streamType: policy.streamType,
    transport: overrides?.transport ?? "WEBRTC",
  };
}
