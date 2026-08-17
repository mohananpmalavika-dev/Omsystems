/**
 * SLO Definitions Integrity Test
 *
 * Guards against accidental target drift.
 * Every SLO definition must have well-formed, sensible values.
 * These are compile-time + runtime guards — not load-bearing performance tests.
 */

import { describe, it, expect } from "vitest";
import { SLO_DEFINITIONS, SLO_ORDER, getSloDefinition } from "../../src/slo/slo-definitions.js";
import type { SloId } from "../../src/slo/slo-types.js";

describe("SLO Definitions Integrity", () => {
  it("exports exactly 11 SLO definitions", () => {
    expect(Object.keys(SLO_DEFINITIONS)).toHaveLength(11);
    expect(SLO_ORDER).toHaveLength(11);
  });

  it("SLO_ORDER contains every definition ID", () => {
    for (const id of SLO_ORDER) {
      expect(SLO_DEFINITIONS[id]).toBeDefined();
    }
  });

  it.each(SLO_ORDER)("%s — has a non-empty name and description", (id) => {
    const def = SLO_DEFINITIONS[id];
    expect(def.name.length).toBeGreaterThan(5);
    expect(def.description.length).toBeGreaterThan(20);
  });

  it.each(SLO_ORDER)("%s — windowSeconds is positive", (id) => {
    const def = SLO_DEFINITIONS[id];
    expect(def.windowSeconds).toBeGreaterThan(0);
  });

  it.each(SLO_ORDER)("%s — errorBudgetPct is in [0, 100)", (id) => {
    const def = SLO_DEFINITIONS[id];
    expect(def.errorBudgetPct).toBeGreaterThanOrEqual(0);
    expect(def.errorBudgetPct).toBeLessThan(100);
  });

  it("LATENCY SLOs must have targetMs defined and positive", () => {
    const latencySlos: SloId[] = [
      "CAMERA_RECONNECT_P50",
      "MEDIA_NODE_FAILOVER_P99",
      "RECORDING_GAP_ON_RESTART",
      "LIVE_VIEW_STARTUP_LAN",
      "LIVE_VIEW_STARTUP_WAN",
      "PLAYBACK_STARTUP",
      "TIMELINE_QUERY",
      "ALERT_PROPAGATION",
    ];
    for (const id of latencySlos) {
      const def = SLO_DEFINITIONS[id];
      expect(def.targetMs, `${id} must have targetMs`).toBeDefined();
      expect(def.targetMs!, `${id} targetMs must be positive`).toBeGreaterThan(0);
    }
  });

  it("AVAILABILITY_PCT SLOs must have targetPct in (99, 100]", () => {
    const availSlos: SloId[] = ["RECORDING_COVERAGE", "CONTROL_PLANE_AVAILABILITY"];
    for (const id of availSlos) {
      const def = SLO_DEFINITIONS[id];
      expect(def.targetPct, `${id} must have targetPct`).toBeDefined();
      expect(def.targetPct!, `${id} targetPct must be > 99`).toBeGreaterThan(99);
      expect(def.targetPct!, `${id} targetPct must be ≤ 100`).toBeLessThanOrEqual(100);
    }
  });

  // ── Contractual Target Assertions ─────────────────────────────────────────
  // These values are contractual. A test failure here means someone changed
  // a target without a formal SLO review.

  it("CAMERA_RECONNECT_P50 target is 10 000 ms (10 s)", () => {
    expect(SLO_DEFINITIONS.CAMERA_RECONNECT_P50.targetMs).toBe(10_000);
  });

  it("MEDIA_NODE_FAILOVER_P99 target is 20 000 ms (20 s)", () => {
    expect(SLO_DEFINITIONS.MEDIA_NODE_FAILOVER_P99.targetMs).toBe(20_000);
  });

  it("RECORDING_GAP_ON_RESTART target is 3 000 ms (3 s)", () => {
    expect(SLO_DEFINITIONS.RECORDING_GAP_ON_RESTART.targetMs).toBe(3_000);
  });

  it("LIVE_VIEW_STARTUP_LAN target is 2 000 ms (2 s)", () => {
    expect(SLO_DEFINITIONS.LIVE_VIEW_STARTUP_LAN.targetMs).toBe(2_000);
  });

  it("LIVE_VIEW_STARTUP_WAN target is 4 000 ms (4 s)", () => {
    expect(SLO_DEFINITIONS.LIVE_VIEW_STARTUP_WAN.targetMs).toBe(4_000);
  });

  it("PLAYBACK_STARTUP target is 2 000 ms (2 s)", () => {
    expect(SLO_DEFINITIONS.PLAYBACK_STARTUP.targetMs).toBe(2_000);
  });

  it("TIMELINE_QUERY target is 1 000 ms (1 s)", () => {
    expect(SLO_DEFINITIONS.TIMELINE_QUERY.targetMs).toBe(1_000);
  });

  it("ALERT_PROPAGATION target is 2 000 ms (2 s)", () => {
    expect(SLO_DEFINITIONS.ALERT_PROPAGATION.targetMs).toBe(2_000);
  });

  it("RECORDING_COVERAGE target is 99.99%", () => {
    expect(SLO_DEFINITIONS.RECORDING_COVERAGE.targetPct).toBe(99.99);
  });

  it("CONTROL_PLANE_AVAILABILITY target is 99.95%", () => {
    expect(SLO_DEFINITIONS.CONTROL_PLANE_AVAILABILITY.targetPct).toBe(99.95);
  });

  it("CRITICAL_AUDIT_LOSS has zero-tolerance error budget", () => {
    expect(SLO_DEFINITIONS.CRITICAL_AUDIT_LOSS.errorBudgetPct).toBe(0);
    expect(SLO_DEFINITIONS.CRITICAL_AUDIT_LOSS.kind).toBe("COUNT_ZERO");
  });

  it("getSloDefinition() throws for unknown IDs", () => {
    expect(() => getSloDefinition("UNKNOWN_SLO" as SloId)).toThrow("Unknown SLO ID");
  });
});
