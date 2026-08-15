import type { ViewerCapacity, VideoCodec, HardwareAccelerationState } from "../../lib/video/types";

// Conservative heuristic-based viewer capacity manager for Phase 1.
// Does not run heavy benchmarks — returns a safe recommendedDecoderLimit based on CPU cores and basic media capability hints.

async function detectSupportedCodecs(): Promise<VideoCodec[]> {
  const supported: VideoCodec[] = [];
  // Use MediaCapabilities if available
  try {
    // navigator.mediaCapabilities may be undefined in some browsers
    // Keep probes minimal and tolerant of failures
    // Note: we don't await decodingInfo for multiple heavy configs here; just probe simple baseline
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mc: any = (globalThis as any).navigator?.mediaCapabilities;
    if (mc && typeof mc.decodingInfo === "function") {
      const h264 = await mc.decodingInfo({
        type: "file",
        video: { contentType: "video/mp4; codecs=avc1.42E01E", width: 640, height: 360, bitrate: 400_000, framerate: 10 },
      });
      if (h264?.supported) supported.push("H264");

      const h265 = await mc.decodingInfo({
        type: "file",
        video: { contentType: "video/mp4; codecs=hvc1", width: 1280, height: 720, bitrate: 2_000_000, framerate: 15 },
      });
      if (h265?.supported) supported.push("H265");

      try {
        const av1 = await mc.decodingInfo({
          type: "file",
          video: { contentType: "video/mp4; codecs=av01.0.05M.08", width: 1280, height: 720, bitrate: 1_500_000, framerate: 15 },
        });
        if (av1?.supported) supported.push("AV1");
      } catch (e) {
        // Some browsers throw for unknown codecs — ignore
      }
    } else {
      // Fallback: assume H264 at minimum
      supported.push("H264");
    }
  } catch (err) {
    // Conservative fallback
    supported.push("H264");
  }

  // Deduplicate
  return Array.from(new Set(supported)) as VideoCodec[];
}

function detectHardwareAcceleration(): HardwareAccelerationState {
  try {
    // There is no standard JS API to directly detect HW accel reliably.
    // Use simple heuristics: presence of WebGL + GPU hints
    if (typeof (globalThis as any).navigator === "undefined") return "UNKNOWN";
    const nav: any = (globalThis as any).navigator;
    const hasWebGL = !!(globalThis as any).document?.createElement("canvas")?.getContext("webgl") || !!(globalThis as any).document?.createElement("canvas")?.getContext("webgl2");
    if (hasWebGL) return "AVAILABLE";
    return "UNKNOWN";
  } catch (e) {
    return "UNKNOWN";
  }
}

export class ViewerCapacityManager {
  private cached: ViewerCapacity | null = null;

  async initialize(): Promise<ViewerCapacity> {
    if (this.cached) return this.cached;

    const supportedCodecs = await detectSupportedCodecs();
    const hardwareAcceleration = detectHardwareAcceleration();

    // Basic heuristics: prefer navigator.hardwareConcurrency if available
    const cores = (navigator as any)?.hardwareConcurrency || 4;
    // Conservative mapping: assume each CPU core can sustain ~3 decoder units in typical browsers
    const theoretical = Math.max(4, Math.floor(cores * 3));
    // Apply a safety multiplier
    const recommendedDecoderLimit = Math.max(4, Math.min(theoretical, 36));

    // Bandwidth and pixel budgets are conservative defaults for Phase 1
    const capacity: ViewerCapacity = {
      maxVideoDecoders: theoretical,
      maxAggregateBitrateMbps: 25,
      maxPixelsPerSecond: 300_000_000, // 300 MP/s
      activeDecoders: 0,
      activeBitrateMbps: 0,
      activePixelsPerSecond: 0,
      preferredCodec: supportedCodecs[0] ?? "H264",
      supportedCodecs,
      hardwareAcceleration,
      recommendedDecoderLimit,
      measuredAt: new Date().toISOString(),
    };

    this.cached = capacity;
    try { localStorage.setItem("viewer_capacity_cached", JSON.stringify(capacity)); } catch (e) { /* ignore */ }
    return capacity;
  }

  getCached(): ViewerCapacity | null {
    if (this.cached) return this.cached;
    try {
      const raw = localStorage.getItem("viewer_capacity_cached");
      if (raw) {
        this.cached = JSON.parse(raw) as ViewerCapacity;
        return this.cached;
      }
    } catch (e) {
      // ignore
    }
    return null;
  }
}

// Export a singleton convenience instance for simple use in Phase 1
export const defaultViewerCapacityManager = new ViewerCapacityManager();
