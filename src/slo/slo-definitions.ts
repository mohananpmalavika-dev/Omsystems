/**
 * VMS SLO Definitions — Authoritative Registry
 *
 * The single source of truth for all 11 VMS SLOs.
 * Numerical targets here are contractual — do NOT change without a formal
 * SLO review and updating the corresponding compliance tests.
 *
 * Target summary:
 *   Camera reconnect        < 10 s  (p50)
 *   Media-node failover     < 20 s  (p99)
 *   Recording gap / restart < 3 s   (p99)
 *   Live view LAN startup   < 2 s   (p50)
 *   Live view WAN startup   < 4 s   (p50)
 *   Playback startup        < 2 s   (p50)
 *   Timeline query          < 1 s   (p50)
 *   Alert propagation       < 2 s   (p99)
 *   Recording coverage      ≥ 99.99 % (24 h)
 *   Control plane avail.    ≥ 99.95 % (24 h)
 *   Critical audit loss     = 0
 */

import type { SloDefinition, SloId } from "./slo-types.js";

// 1 hour rolling window for latency SLOs
const ONE_HOUR_S = 3600;
// 24 hour rolling window for availability / count SLOs
const ONE_DAY_S = 86400;

export const SLO_DEFINITIONS: Record<SloId, SloDefinition> = {
  // ── Latency SLOs (1-hour rolling window) ──────────────────────────────────

  CAMERA_RECONNECT_P50: {
    id: "CAMERA_RECONNECT_P50",
    name: "Camera Reconnect (p50)",
    kind: "LATENCY_P50_MS",
    targetMs: 10_000, // 10 seconds
    windowSeconds: ONE_HOUR_S,
    errorBudgetPct: 1.0, // 1% of reconnect attempts may exceed 10 s
    description:
      "Median time for a camera to successfully reconnect after a stream drop must be under 10 seconds.",
  },

  MEDIA_NODE_FAILOVER_P99: {
    id: "MEDIA_NODE_FAILOVER_P99",
    name: "Media-Node Failover (p99)",
    kind: "LATENCY_P99_MS",
    targetMs: 20_000, // 20 seconds
    windowSeconds: ONE_HOUR_S,
    errorBudgetPct: 1.0, // 1% of failover events may exceed 20 s
    description:
      "99th-percentile time to complete a recording-node failover and resume writing must be under 20 seconds.",
  },

  RECORDING_GAP_ON_RESTART: {
    id: "RECORDING_GAP_ON_RESTART",
    name: "Recording Gap on Process Restart (p99)",
    kind: "LATENCY_P99_MS",
    targetMs: 3_000, // 3 seconds
    windowSeconds: ONE_HOUR_S,
    errorBudgetPct: 1.0, // 1% of restart events may exceed 3 s
    description:
      "99th-percentile video gap during an ordinary recorder process restart must be under 3 seconds.",
  },

  LIVE_VIEW_STARTUP_LAN: {
    id: "LIVE_VIEW_STARTUP_LAN",
    name: "Live View Startup — LAN (p50)",
    kind: "LATENCY_P50_MS",
    targetMs: 2_000, // 2 seconds
    windowSeconds: ONE_HOUR_S,
    errorBudgetPct: 1.0,
    description:
      "Median time from user requesting a live stream to first frame rendered on a LAN connection must be under 2 seconds.",
  },

  LIVE_VIEW_STARTUP_WAN: {
    id: "LIVE_VIEW_STARTUP_WAN",
    name: "Live View Startup — WAN (p50)",
    kind: "LATENCY_P50_MS",
    targetMs: 4_000, // 4 seconds
    windowSeconds: ONE_HOUR_S,
    errorBudgetPct: 1.0,
    description:
      "Median time from user requesting a live stream to first frame rendered on a WAN / tunnel connection must be under 4 seconds.",
  },

  PLAYBACK_STARTUP: {
    id: "PLAYBACK_STARTUP",
    name: "Playback Startup (p50)",
    kind: "LATENCY_P50_MS",
    targetMs: 2_000, // 2 seconds
    windowSeconds: ONE_HOUR_S,
    errorBudgetPct: 1.0,
    description:
      "Median time from user requesting historical playback to first frame rendered must be under 2 seconds.",
  },

  TIMELINE_QUERY: {
    id: "TIMELINE_QUERY",
    name: "Timeline Query (p50)",
    kind: "LATENCY_P50_MS",
    targetMs: 1_000, // 1 second
    windowSeconds: ONE_HOUR_S,
    errorBudgetPct: 1.0,
    description:
      "Median RecordingIndex.findRecording() query latency (segments + gaps + keyframes) must be under 1 second.",
  },

  ALERT_PROPAGATION: {
    id: "ALERT_PROPAGATION",
    name: "Alert Propagation (p99)",
    kind: "LATENCY_P99_MS",
    targetMs: 2_000, // 2 seconds
    windowSeconds: ONE_HOUR_S,
    errorBudgetPct: 1.0,
    description:
      "99th-percentile end-to-end alert propagation time from event detection to notification delivery must be under 2 seconds.",
  },

  // ── Availability SLOs (24-hour rolling window) ────────────────────────────

  RECORDING_COVERAGE: {
    id: "RECORDING_COVERAGE",
    name: "Recording Coverage",
    kind: "AVAILABILITY_PCT",
    targetPct: 99.99, // ≥ 99.99% of scheduled recording ticks must succeed
    windowSeconds: ONE_DAY_S,
    errorBudgetPct: 0.01, // budget = 0.01% of 24 h ≈ 8.64 seconds
    description:
      "At least 99.99% of scheduled recording intervals must be successfully written across the fleet over a 24-hour window.",
  },

  CONTROL_PLANE_AVAILABILITY: {
    id: "CONTROL_PLANE_AVAILABILITY",
    name: "Control Plane Availability",
    kind: "AVAILABILITY_PCT",
    targetPct: 99.95, // ≥ 99.95% of health-probe ticks must succeed
    windowSeconds: ONE_DAY_S,
    errorBudgetPct: 0.05, // budget = 0.05% of 24 h ≈ 43.2 seconds
    description:
      "The control plane API must be responsive for at least 99.95% of health-probe ticks over a 24-hour window.",
  },

  // ── Count SLOs (24-hour rolling window) ───────────────────────────────────

  CRITICAL_AUDIT_LOSS: {
    id: "CRITICAL_AUDIT_LOSS",
    name: "Critical Audit Loss",
    kind: "COUNT_ZERO",
    windowSeconds: ONE_DAY_S,
    errorBudgetPct: 0, // zero tolerance — any single loss = immediate breach
    description:
      "Zero audit log records must be lost or permanently unrecoverable in any 24-hour window. Any non-zero count is an immediate SLO breach.",
  },
} as const;

/** Ordered list of SLO IDs, used for consistent report ordering */
export const SLO_ORDER: SloId[] = [
  "CAMERA_RECONNECT_P50",
  "MEDIA_NODE_FAILOVER_P99",
  "RECORDING_GAP_ON_RESTART",
  "LIVE_VIEW_STARTUP_LAN",
  "LIVE_VIEW_STARTUP_WAN",
  "PLAYBACK_STARTUP",
  "TIMELINE_QUERY",
  "ALERT_PROPAGATION",
  "RECORDING_COVERAGE",
  "CONTROL_PLANE_AVAILABILITY",
  "CRITICAL_AUDIT_LOSS",
];

/** Convenience: get a single definition, throws if unknown */
export function getSloDefinition(id: SloId): SloDefinition {
  const def = SLO_DEFINITIONS[id];
  if (!def) throw new Error(`Unknown SLO ID: ${id}`);
  return def;
}
