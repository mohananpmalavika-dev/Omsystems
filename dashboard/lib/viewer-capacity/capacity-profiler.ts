/**
 * Capacity Profiler & Workstation Profile Store
 * 
 * Determines conservative initial capacity, executes calibration probing,
 * and persists learned workstation profiles across browser restarts.
 */

import type { ViewerCapacity, WorkstationProfile } from "./types";

const DEFAULT_CONSERVATIVE_CAPACITY: ViewerCapacity = {
  maxVideoDecoders: 16,
  maxAggregateBitrateMbps: 25,
  maxPixelsPerSecond: 300_000_000,
  activeDecoders: 0,
  activeBitrateMbps: 0,
  activePixelsPerSecond: 0,
  supportedCodecs: ["H264", "H265"],
  preferredCodec: "H264",
  hardwareAcceleration: "UNKNOWN",
  confidence: 0.4,
};

const STORAGE_KEY = "sentinel_workstation_capacity_v1";

/**
 * Computes deterministic hash of browser environment to key stored calibration.
 */
export function generateWorkstationFingerprint(): string {
  if (typeof navigator === "undefined") return "server-workstation-id";
  const str = `${navigator.userAgent}_${navigator.hardwareConcurrency || 4}_${(navigator as any).deviceMemory || 8}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return `ws_${Math.abs(hash).toString(16)}`;
}

/**
 * Detects WebGL hardware acceleration availability.
 */
export function detectWebGLAcceleration(): "AVAILABLE" | "UNAVAILABLE" | "UNKNOWN" {
  if (typeof document === "undefined") return "AVAILABLE"; // Default for tests
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    if (!gl) return "UNAVAILABLE";

    const dbgRenderInfo = (gl as any).getExtension("WEBGL_debug_renderer_info");
    if (dbgRenderInfo) {
      const renderer = (gl as any).getParameter(dbgRenderInfo.UNMASKED_RENDERER_WEBGL);
      if (typeof renderer === "string" && (renderer.includes("SwiftShader") || renderer.includes("Software"))) {
        return "UNAVAILABLE";
      }
    }
    return "AVAILABLE";
  } catch {
    return "UNKNOWN";
  }
}

/**
 * Profiles the current workstation to derive realistic decoding bounds.
 */
export function profileWorkstation(customLimit?: number): ViewerCapacity {
  const hardwareAccel = detectWebGLAcceleration();
  const cores = typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 4 : 8;
  const memoryGb = typeof navigator !== "undefined" ? (navigator as any).deviceMemory || 8 : 16;

  // Derive safe concurrent stream count based on cores & GPU
  let safeDecoders = 24;
  if (hardwareAccel === "AVAILABLE") {
    if (cores >= 12 && memoryGb >= 16) safeDecoders = 48;
    else if (cores >= 8) safeDecoders = 36;
    else if (cores >= 4) safeDecoders = 24;
    else safeDecoders = 16;
  } else {
    safeDecoders = Math.min(16, cores * 2);
  }

  if (customLimit && customLimit > 0) {
    safeDecoders = Math.min(customLimit, 144);
  }

  // Derive aggregate bandwidth & pixel budgets
  const aggregateBitrate = Math.round(safeDecoders * 0.75 + 10); // Mbps
  const pixelsPerSec = safeDecoders * (640 * 360 * 10) + (1920 * 1080 * 25 * 2); // Substreams + 2 Main

  return {
    ...DEFAULT_CONSERVATIVE_CAPACITY,
    maxVideoDecoders: safeDecoders,
    maxAggregateBitrateMbps: aggregateBitrate,
    maxPixelsPerSecond: pixelsPerSec,
    hardwareAcceleration: hardwareAccel,
    confidence: 0.75,
  };
}

export class WorkstationProfileStore {
  /**
   * Loads persisted profile if matching workstation fingerprint exists.
   */
  static loadProfile(): WorkstationProfile | null {
    if (typeof localStorage === "undefined") return null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed: WorkstationProfile = JSON.parse(raw);
      if (parsed.userAgentHash === generateWorkstationFingerprint()) {
        return parsed;
      }
    } catch {
      // Ignore parsing errors
    }
    return null;
  }

  /**
   * Persists calibrated workstation profile to local storage.
   */
  static saveProfile(capacity: ViewerCapacity, stabilityScore = 0.95): void {
    if (typeof localStorage === "undefined") return;
    try {
      const profile: WorkstationProfile = {
        id: generateWorkstationFingerprint(),
        userAgentHash: generateWorkstationFingerprint(),
        measuredCapacity: capacity,
        lastCalibrationAt: new Date().toISOString(),
        stabilityScore,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    } catch {
      // Ignore quota errors
    }
  }
}
