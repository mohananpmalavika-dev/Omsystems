/**
 * Hardware Compatibility Lab — Domain Types
 *
 * Sentinel Grid's structured compatibility matrix.
 * Analogous to Milestone, Genetec, and Nx device support lists,
 * but purpose-built around real customer hardware.
 *
 * Every row is: Vendor × Model × FirmwareVersion × TestRunDate
 * Every cell is one of the 8 canonical feature columns.
 */

// ─── Vendor ──────────────────────────────────────────────────────────────────

export type CompatibilityVendor =
  | "CP_PLUS"
  | "DAHUA"
  | "HIKVISION"
  | "AXIS"
  | "ONVIF_GENERIC";

// ─── Device Class ─────────────────────────────────────────────────────────────

export type DeviceClass =
  | "IP_CAMERA"
  | "NVR"
  | "DVR"
  | "HYBRID_NVR"
  | "PTZ_CAMERA"
  | "FISHEYE_CAMERA"
  | "MULTISENSOR_CAMERA";

// ─── Authentication ───────────────────────────────────────────────────────────

export type AuthMode =
  | "BASIC"
  | "DIGEST"
  | "ONVIF_WS_SECURITY"
  | "ONVIF_WS_SECURITY_TOKEN"
  | "BEARER_TOKEN"
  | "NO_AUTH";

// ─── Codec Support ────────────────────────────────────────────────────────────

export type CodecId = "H264" | "H265" | "MJPEG" | "AV1" | "H264+" | "H265+";

export interface CodecEntry {
  codec: CodecId;
  /** Maximum resolutions observed, e.g. ["1920x1080", "3840x2160"] */
  resolutions: string[];
  /** Whether the device supports B-frames / Smart codec for this codec */
  smartCodec?: boolean;
}

// ─── ONVIF Profile Conformance ────────────────────────────────────────────────

export type OnvifProfile = "S" | "T" | "G" | "Q" | "M";

// ─── Feature Columns ─────────────────────────────────────────────────────────

/**
 * The 8 canonical feature columns in the compatibility matrix.
 *
 * LIVE         - mainstream RTSP live view (primary stream)
 * SUBSTREAM    - secondary/low-res RTSP sub stream
 * PLAYBACK     - server-side playback search + segment retrieval
 * EVENTS       - real-time event / alarm subscription
 * PTZ          - pan / tilt / zoom control (N/A for fixed cameras)
 * HDD_HEALTH   - disk health & storage status query
 * RETENTION    - recording schedule / retention policy read-back
 * REBOOT       - remote reboot command + availability recovery
 */
export type CompatibilityFeature =
  | "LIVE"
  | "SUBSTREAM"
  | "PLAYBACK"
  | "EVENTS"
  | "PTZ"
  | "HDD_HEALTH"
  | "RETENTION"
  | "REBOOT";

export const ALL_FEATURES: readonly CompatibilityFeature[] = [
  "LIVE",
  "SUBSTREAM",
  "PLAYBACK",
  "EVENTS",
  "PTZ",
  "HDD_HEALTH",
  "RETENTION",
  "REBOOT",
] as const;

// ─── Per-Feature Test Result ──────────────────────────────────────────────────

export type FeatureStatus =
  | "PASS"       // Feature works as expected
  | "FAIL"       // Feature attempted but failed
  | "PARTIAL"    // Feature partially works (degraded / non-standard)
  | "NA"         // Not applicable (e.g. PTZ on a fixed camera)
  | "NOT_TESTED"; // Not yet exercised in this lab run

export interface CompatibilityTestResult {
  feature: CompatibilityFeature;
  status: FeatureStatus;

  /** Sentinel Grid version that executed this specific test */
  testedByVersion: string;
  testedAt: string; // ISO-8601

  /** Optional: auth mode used for this feature test */
  authMode?: AuthMode;

  /** Optional: resolution used (for LIVE / SUBSTREAM) */
  resolution?: string;

  /** Optional: codec used (for LIVE / SUBSTREAM) */
  codec?: CodecId;

  /** Round-trip latency for the test probe, ms */
  latencyMs?: number;

  /** Human-readable note: firmware quirk, workaround, limitation */
  note?: string;

  /** Firmware-specific observation (not the version itself, just any note) */
  firmwareNotes?: string;
}

// ─── Test Target (Device Under Test) ─────────────────────────────────────────

export interface CompatibilityTestTarget {
  vendor: CompatibilityVendor;

  /** Canonical model identifier as printed on hardware or returned by API */
  modelId: string;

  /** Firmware version string as returned by the device, e.g. "V4.62.00 build 220929" */
  firmwareVersion: string;

  /** Human-readable generation label, e.g. "Gen3", "AcuSense 2.0", "ColorVu" */
  generation: string;

  deviceClass: DeviceClass;

  /** Auth modes this firmware version is known to support */
  authModes: AuthMode[];

  /** Codecs reported or confirmed by this device */
  codecSupport: CodecEntry[];

  /** ONVIF profile conformance (if applicable) */
  onvifProfiles?: OnvifProfile[];

  /** Number of camera channels (NVRs/DVRs) */
  channels?: number;

  /** Marketing/product description for display */
  description?: string;
}

// ─── Matrix Entry ─────────────────────────────────────────────────────────────

/**
 * One row of the Compatibility Matrix.
 * A unique row is: vendor × modelId × firmwareVersion.
 */
export interface CompatibilityMatrixEntry {
  id: string; // deterministic slug: vendor-modelId-firmwareVersion

  target: CompatibilityTestTarget;

  /** Results keyed by feature name */
  results: Partial<Record<CompatibilityFeature, CompatibilityTestResult>>;

  /**
   * Computed aggregate rating:
   *
   * CERTIFIED    — all 8 features are PASS or NA
   * COMPATIBLE   — ≥5 features PASS, zero FAIL on LIVE/SUBSTREAM
   * LIMITED      — 3–4 PASS, or LIVE/SUBSTREAM PARTIAL
   * INCOMPATIBLE — LIVE or SUBSTREAM FAIL, or <3 PASS overall
   * UNTESTED     — no results recorded yet
   */
  overallRating: CompatibilityRating;

  /** Sentinel Grid version used in the most recent full test run */
  sentinelVersion: string;

  /** When this entry was first certified (overallRating reached CERTIFIED) */
  certifiedAt?: string;

  /** Timestamp of the most recent test result for any feature */
  lastTestedAt: string;

  /** Free-form notes for the whole device */
  notes?: string;
}

export type CompatibilityRating =
  | "CERTIFIED"
  | "COMPATIBLE"
  | "LIMITED"
  | "INCOMPATIBLE"
  | "UNTESTED";

// ─── Lab Run ──────────────────────────────────────────────────────────────────

/** A single automated lab session against one device */
export interface LabRunRequest {
  target: CompatibilityTestTarget;

  /** If omitted, all 8 features are exercised */
  features?: CompatibilityFeature[];

  /** Live device connection details */
  connection: {
    host: string;
    httpPort: number;
    rtspPort: number;
    username: string;
    password: string;
  };

  /** Timeout per individual feature probe, ms (default 10000) */
  probeTimeoutMs?: number;

  sentinelVersion: string;
}

export interface LabRunResult {
  runId: string;
  target: CompatibilityTestTarget;
  results: CompatibilityTestResult[];
  overallRating: CompatibilityRating;
  durationMs: number;
  startedAt: string;
  completedAt: string;
  sentinelVersion: string;
}

// ─── Export Snapshot ──────────────────────────────────────────────────────────

/** Signed, versioned JSON export — the publicly publishable compatibility list */
export interface CompatibilityMatrixSnapshot {
  schemaVersion: 1;
  sentinelVersion: string;
  publishedAt: string;
  entryCount: number;
  entries: CompatibilityMatrixEntry[];
  /** SHA-256 hex digest of JSON.stringify(entries) for tamper evidence */
  checksum: string;
}

// ─── API Filters ──────────────────────────────────────────────────────────────

export interface MatrixFilter {
  vendor?: CompatibilityVendor;
  deviceClass?: DeviceClass;
  overallRating?: CompatibilityRating;
  modelId?: string;
  firmwareVersion?: string;
}
