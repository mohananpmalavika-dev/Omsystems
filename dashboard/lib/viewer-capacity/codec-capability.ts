/**
 * Codec Capability & Browser Decode Probe
 * 
 * Uses navigator.mediaCapabilities.decodingInfo to detect hardware support,
 * smoothness, and power efficiency for H.264, H.265 (HEVC), and AV1.
 */

import type { CodecType, StreamProfile, StreamState } from "./types";

export interface CodecDecodingCapability {
  codec: CodecType;
  supported: boolean;
  smooth: boolean;
  powerEfficient: boolean;
}

const CODEC_MIME_STRINGS: Record<CodecType, string> = {
  H264: 'video/mp4; codecs="avc1.42E01E"',
  H265: 'video/mp4; codecs="hvc1.1.6.L93.B0"',
  AV1: 'video/mp4; codecs="av01.0.05M.08"',
};

/**
 * Detects browser codec support using the Web Media Capabilities API.
 */
export async function detectCodecCapabilities(): Promise<CodecDecodingCapability[]> {
  const results: CodecDecodingCapability[] = [];

  const checkCodec = async (codec: CodecType): Promise<CodecDecodingCapability> => {
    if (
      typeof navigator !== "undefined" &&
      navigator.mediaCapabilities &&
      typeof navigator.mediaCapabilities.decodingInfo === "function"
    ) {
      try {
        const info = await navigator.mediaCapabilities.decodingInfo({
          type: "media-source",
          video: {
            contentType: CODEC_MIME_STRINGS[codec],
            width: 640,
            height: 360,
            bitrate: 500_000,
            framerate: 15,
          },
        });
        return {
          codec,
          supported: info.supported ?? true,
          smooth: info.smooth ?? true,
          powerEfficient: info.powerEfficient ?? true,
        };
      } catch {
        // Fallback on probe exception
      }
    }

    // Default safe baseline for environments without mediaCapabilities
    return {
      codec,
      supported: codec === "H264",
      smooth: codec === "H264",
      powerEfficient: codec === "H264",
    };
  };

  results.push(await checkCodec("H264"));
  results.push(await checkCodec("H265"));
  results.push(await checkCodec("AV1"));

  return results;
}

/**
 * Selects the optimal codec from supported codecs list.
 */
export function selectPreferredCodec(capabilities: CodecDecodingCapability[]): CodecType {
  const h265 = capabilities.find((c) => c.codec === "H265" && c.supported && c.powerEfficient);
  if (h265) return "H265";

  const av1 = capabilities.find((c) => c.codec === "AV1" && c.supported && c.smooth);
  if (av1) return "AV1";

  return "H264";
}

/**
 * Maps stream profile through the degradation ladder before complete eviction.
 * MAIN_LIVE -> SUB_LIVE -> LOW_FPS -> THUMBNAIL -> ROTATING -> SUSPENDED
 */
export function getNextDegradedProfile(
  current: StreamProfile,
  currentState: StreamState
): { nextState: StreamState; profile: StreamProfile } | null {
  switch (currentState) {
    case "MAIN_LIVE":
      return {
        nextState: "SUB_LIVE",
        profile: {
          ...current,
          width: 640,
          height: 360,
          fps: 10,
          bitrateMbps: 0.45,
          streamType: "SUB",
        },
      };

    case "SUB_LIVE":
      return {
        nextState: "LOW_FPS",
        profile: {
          ...current,
          width: 480,
          height: 270,
          fps: 4,
          bitrateMbps: 0.20,
          streamType: "SUB",
        },
      };

    case "LOW_FPS":
      return {
        nextState: "THUMBNAIL",
        profile: {
          ...current,
          width: 320,
          height: 180,
          fps: 1,
          bitrateMbps: 0.08,
          streamType: "THUMBNAIL",
        },
      };

    case "THUMBNAIL":
      return {
        nextState: "ROTATING",
        profile: {
          ...current,
          width: 320,
          height: 180,
          fps: 0.2, // 1 frame every 5s
          bitrateMbps: 0.02,
          streamType: "THUMBNAIL",
        },
      };

    case "ROTATING":
      return {
        nextState: "SUSPENDED",
        profile: {
          ...current,
          fps: 0,
          bitrateMbps: 0,
          streamType: "THUMBNAIL",
        },
      };

    default:
      return null;
  }
}
