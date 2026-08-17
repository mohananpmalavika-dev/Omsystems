/**
 * VMS SLO Compliance Test Suite — Continuous Assertion
 *
 * Each SLO has two scenarios:
 *   1. Compliant path — realistic "good" samples → expect status OK
 *   2. Breach path    — realistic "bad" samples  → expect status BREACH + violation
 *
 * These tests are the proof that the numerical targets are real and enforced.
 * Run in CI on every commit to ensure targets have not regressed.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { SloMeasurementEngine } from "../../src/slo/slo-measurement-engine.js";
import type { SloMeasurement } from "../../src/slo/slo-types.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function latency(
  sloId: SloMeasurement["sloId"],
  ms: number,
  targetMs: number,
  secondsAgo = 0,
): SloMeasurement {
  return {
    sloId,
    observedAt: new Date(Date.now() - secondsAgo * 1000),
    valueMs: ms,
    success: ms <= targetMs,
  };
}

function tick(
  sloId: SloMeasurement["sloId"],
  success: boolean,
  secondsAgo = 0,
): SloMeasurement {
  return {
    sloId,
    observedAt: new Date(Date.now() - secondsAgo * 1000),
    success,
  };
}

/** Inject N good latency samples, then M bad samples */
function injectLatency(
  engine: SloMeasurementEngine,
  sloId: SloMeasurement["sloId"],
  good: { count: number; ms: number; targetMs: number },
  bad?: { count: number; ms: number; targetMs: number },
) {
  for (let i = 0; i < good.count; i++) {
    engine.record(latency(sloId, good.ms, good.targetMs));
  }
  if (bad) {
    for (let i = 0; i < bad.count; i++) {
      engine.record(latency(sloId, bad.ms, bad.targetMs));
    }
  }
}

/** Inject N good availability ticks, then M bad ticks */
function injectAvailability(
  engine: SloMeasurementEngine,
  sloId: SloMeasurement["sloId"],
  goodCount: number,
  badCount = 0,
) {
  for (let i = 0; i < goodCount; i++) engine.record(tick(sloId, true, i));
  for (let i = 0; i < badCount; i++) engine.record(tick(sloId, false, goodCount + i));
}

// ─────────────────────────────────────────────────────────────────────────────

describe("VMS SLO Compliance Suite", () => {
  let engine: SloMeasurementEngine;

  beforeEach(() => {
    engine = new SloMeasurementEngine();
  });

  // ── 1. Camera Reconnect < 10 s (p50) ────────────────────────────────────

  describe("1. CAMERA_RECONNECT_P50 — median < 10 s", () => {
    it("COMPLIANT: 50 reconnects at p50 = 7 s are within budget", () => {
      // Mix: 25 × 5 s + 25 × 9 s → sorted p50 = 7 s (index 25 → 9 s, actually)
      // Let's be precise: 50 samples, 25 at 5000 ms, 25 at 9000 ms
      // sorted: [5000×25, 9000×25] → p50 = index floor(50*0.5) = 25 → 9000
      // All under 10 000 target → 0 bad samples → OK
      for (let i = 0; i < 25; i++) engine.record(latency("CAMERA_RECONNECT_P50", 5000, 10_000));
      for (let i = 0; i < 25; i++) engine.record(latency("CAMERA_RECONNECT_P50", 9000, 10_000));

      const win = engine.computeWindow("CAMERA_RECONNECT_P50");
      expect(win.totalSamples).toBe(50);
      expect(win.badSamples).toBe(0);
      expect(win.p50Ms).toBeLessThanOrEqual(10_000);
      expect(win.status).toBe("OK");
      expect(engine.checkViolation("CAMERA_RECONNECT_P50")).toBeNull();
    });

    it("BREACH: reconnects consistently at 12 s exhaust the error budget", () => {
      // 50 bad samples at 12 s (> 10 s target), 50 good at 8 s
      // bad = 50, budget = 1% of 100 = 1 → 5000% used → BREACH
      injectLatency(
        engine,
        "CAMERA_RECONNECT_P50",
        { count: 50, ms: 8_000, targetMs: 10_000 },
        { count: 50, ms: 12_000, targetMs: 10_000 },
      );
      const win = engine.computeWindow("CAMERA_RECONNECT_P50");
      expect(win.status).toBe("BREACH");
      expect(win.badSamples).toBe(50);
      expect(engine.checkViolation("CAMERA_RECONNECT_P50")).not.toBeNull();
    });
  });

  // ── 2. Media-Node Failover < 20 s (p99) ─────────────────────────────────

  describe("2. MEDIA_NODE_FAILOVER_P99 — p99 < 20 s", () => {
    it("COMPLIANT: failovers at 14 s and 18 s are within target", () => {
      // 98 good samples at 10 s + 2 events at 14 s and 18 s (all ≤ 20 s)
      for (let i = 0; i < 98; i++) engine.record(latency("MEDIA_NODE_FAILOVER_P99", 10_000, 20_000));
      engine.record(latency("MEDIA_NODE_FAILOVER_P99", 14_000, 20_000));
      engine.record(latency("MEDIA_NODE_FAILOVER_P99", 18_000, 20_000));

      const win = engine.computeWindow("MEDIA_NODE_FAILOVER_P99");
      expect(win.badSamples).toBe(0);
      expect(win.p99Ms).toBeLessThanOrEqual(20_000);
      expect(win.status).toBe("OK");
    });

    it("BREACH: failover at 25 s exceeds target and exhausts budget", () => {
      for (let i = 0; i < 90; i++) engine.record(latency("MEDIA_NODE_FAILOVER_P99", 10_000, 20_000));
      // 10 bad samples at 25 s → budget = 1% of 100 = 1 → 1000% used
      for (let i = 0; i < 10; i++) engine.record(latency("MEDIA_NODE_FAILOVER_P99", 25_000, 20_000));

      const win = engine.computeWindow("MEDIA_NODE_FAILOVER_P99");
      expect(win.status).toBe("BREACH");
      expect(win.badSamples).toBe(10);
    });
  });

  // ── 3. Recording Gap < 3 s on Restart (p99) ─────────────────────────────

  describe("3. RECORDING_GAP_ON_RESTART — p99 < 3 s", () => {
    it("COMPLIANT: 100 restart gaps averaging 1.2 s are within target", () => {
      for (let i = 0; i < 100; i++) {
        const ms = 800 + Math.floor(Math.random() * 800); // 800–1600 ms
        engine.record(latency("RECORDING_GAP_ON_RESTART", ms, 3_000));
      }
      const win = engine.computeWindow("RECORDING_GAP_ON_RESTART");
      expect(win.badSamples).toBe(0);
      expect(win.p99Ms).toBeLessThanOrEqual(3_000);
      expect(win.status).toBe("OK");
    });

    it("BREACH: recording gap of 4.5 s exceeds target and exhausts budget", () => {
      for (let i = 0; i < 90; i++) engine.record(latency("RECORDING_GAP_ON_RESTART", 1_000, 3_000));
      for (let i = 0; i < 10; i++) engine.record(latency("RECORDING_GAP_ON_RESTART", 4_500, 3_000));

      const win = engine.computeWindow("RECORDING_GAP_ON_RESTART");
      expect(win.status).toBe("BREACH");
      expect(win.badSamples).toBe(10);
      expect(engine.checkViolation("RECORDING_GAP_ON_RESTART")).not.toBeNull();
    });
  });

  // ── 4. Live View Startup LAN < 2 s (p50) ────────────────────────────────

  describe("4. LIVE_VIEW_STARTUP_LAN — p50 < 2 s", () => {
    it("COMPLIANT: LAN startup samples at 1.1–1.8 s are within target", () => {
      for (let i = 0; i < 50; i++) {
        const ms = 1_100 + Math.floor(Math.random() * 700); // 1100–1800 ms
        engine.record(latency("LIVE_VIEW_STARTUP_LAN", ms, 2_000));
      }
      const win = engine.computeWindow("LIVE_VIEW_STARTUP_LAN");
      expect(win.badSamples).toBe(0);
      expect(win.p50Ms).toBeLessThanOrEqual(2_000);
      expect(win.status).toBe("OK");
    });

    it("BREACH: LAN startup at 3 s exceeds 2 s target and exhausts budget", () => {
      for (let i = 0; i < 90; i++) engine.record(latency("LIVE_VIEW_STARTUP_LAN", 1_200, 2_000));
      for (let i = 0; i < 10; i++) engine.record(latency("LIVE_VIEW_STARTUP_LAN", 3_000, 2_000));

      const win = engine.computeWindow("LIVE_VIEW_STARTUP_LAN");
      expect(win.status).toBe("BREACH");
    });
  });

  // ── 5. Live View Startup WAN < 4 s (p50) ────────────────────────────────

  describe("5. LIVE_VIEW_STARTUP_WAN — p50 < 4 s", () => {
    it("COMPLIANT: WAN startup samples at 2.5–3.5 s are within target", () => {
      for (let i = 0; i < 50; i++) {
        const ms = 2_500 + Math.floor(Math.random() * 1_000); // 2500–3500 ms
        engine.record(latency("LIVE_VIEW_STARTUP_WAN", ms, 4_000));
      }
      const win = engine.computeWindow("LIVE_VIEW_STARTUP_WAN");
      expect(win.badSamples).toBe(0);
      expect(win.status).toBe("OK");
    });

    it("BREACH: WAN startup at 5 s exceeds 4 s target", () => {
      for (let i = 0; i < 90; i++) engine.record(latency("LIVE_VIEW_STARTUP_WAN", 3_000, 4_000));
      for (let i = 0; i < 10; i++) engine.record(latency("LIVE_VIEW_STARTUP_WAN", 5_000, 4_000));

      const win = engine.computeWindow("LIVE_VIEW_STARTUP_WAN");
      expect(win.status).toBe("BREACH");
    });
  });

  // ── 6. Playback Startup < 2 s (p50) ─────────────────────────────────────

  describe("6. PLAYBACK_STARTUP — p50 < 2 s", () => {
    it("COMPLIANT: 50 playback startups at 0.8–1.8 s are within target", () => {
      for (let i = 0; i < 50; i++) {
        const ms = 800 + Math.floor(Math.random() * 1_000); // 800–1800 ms
        engine.record(latency("PLAYBACK_STARTUP", ms, 2_000));
      }
      const win = engine.computeWindow("PLAYBACK_STARTUP");
      expect(win.badSamples).toBe(0);
      expect(win.p50Ms).toBeLessThanOrEqual(2_000);
      expect(win.status).toBe("OK");
    });

    it("BREACH: playback startups at 3 s exhaust error budget", () => {
      for (let i = 0; i < 90; i++) engine.record(latency("PLAYBACK_STARTUP", 900, 2_000));
      for (let i = 0; i < 10; i++) engine.record(latency("PLAYBACK_STARTUP", 3_000, 2_000));

      expect(engine.computeWindow("PLAYBACK_STARTUP").status).toBe("BREACH");
    });
  });

  // ── 7. Timeline Query < 1 s (p50) ───────────────────────────────────────

  describe("7. TIMELINE_QUERY — p50 < 1 s", () => {
    it("COMPLIANT: 100 RecordingIndex queries at p50 = 250 ms are within target", () => {
      for (let i = 0; i < 100; i++) {
        const ms = 50 + Math.floor(Math.random() * 400); // 50–450 ms → p50 ≈ 250 ms
        engine.record(latency("TIMELINE_QUERY", ms, 1_000));
      }
      const win = engine.computeWindow("TIMELINE_QUERY");
      expect(win.badSamples).toBe(0);
      expect(win.p50Ms).toBeLessThanOrEqual(1_000);
      expect(win.status).toBe("OK");
    });

    it("BREACH: timeline query at 1.5 s exceeds 1 s target", () => {
      for (let i = 0; i < 90; i++) engine.record(latency("TIMELINE_QUERY", 300, 1_000));
      for (let i = 0; i < 10; i++) engine.record(latency("TIMELINE_QUERY", 1_500, 1_000));

      const win = engine.computeWindow("TIMELINE_QUERY");
      expect(win.status).toBe("BREACH");
      expect(engine.checkViolation("TIMELINE_QUERY")).not.toBeNull();
    });
  });

  // ── 8. Alert Propagation < 2 s (p99) ────────────────────────────────────

  describe("8. ALERT_PROPAGATION — p99 < 2 s", () => {
    it("COMPLIANT: 100 alert propagations at p99 = 1.8 s are within target", () => {
      // 99 at 800 ms + 1 at 1800 ms → p99 = 1800 ms < 2000 ms
      for (let i = 0; i < 99; i++) engine.record(latency("ALERT_PROPAGATION", 800, 2_000));
      engine.record(latency("ALERT_PROPAGATION", 1_800, 2_000));

      const win = engine.computeWindow("ALERT_PROPAGATION");
      expect(win.badSamples).toBe(0);
      expect(win.p99Ms).toBeLessThanOrEqual(2_000);
      expect(win.status).toBe("OK");
    });

    it("BREACH: alert propagation at 2.5 s exhausts error budget", () => {
      for (let i = 0; i < 90; i++) engine.record(latency("ALERT_PROPAGATION", 800, 2_000));
      for (let i = 0; i < 10; i++) engine.record(latency("ALERT_PROPAGATION", 2_500, 2_000));

      const win = engine.computeWindow("ALERT_PROPAGATION");
      expect(win.status).toBe("BREACH");
    });
  });

  // ── 9. Recording Coverage ≥ 99.99% (24 h) ───────────────────────────────

  describe("9. RECORDING_COVERAGE — ≥ 99.99% over 24 h", () => {
    it("COMPLIANT: 1440 ticks, 0 failures → 100% coverage", () => {
      injectAvailability(engine, "RECORDING_COVERAGE", 1440, 0);
      const win = engine.computeWindow("RECORDING_COVERAGE");
      expect(win.badSamples).toBe(0);
      expect(win.status).toBe("OK");
    });

    it("BREACH: 1440 ticks, 1 failure (99.931%) → below 99.99% target", () => {
      // 1 bad / (1440 * 0.01%) = 1 / 0.144 = 694% budget used → BREACH
      injectAvailability(engine, "RECORDING_COVERAGE", 1439, 1);
      const win = engine.computeWindow("RECORDING_COVERAGE");
      expect(win.status).toBe("BREACH");
      expect(win.errorBudgetUsedPct).toBeGreaterThan(100);
    });
  });

  // ── 10. Control Plane Availability ≥ 99.95% (24 h) ──────────────────────

  describe("10. CONTROL_PLANE_AVAILABILITY — ≥ 99.95% over 24 h", () => {
    it("COMPLIANT: 2880 ticks, 1 failure is within the 0.05% budget", () => {
      // budget = 0.05% of 2880 = 1.44 samples → 1 bad = 69.4% used → OK
      injectAvailability(engine, "CONTROL_PLANE_AVAILABILITY", 2879, 1);
      const win = engine.computeWindow("CONTROL_PLANE_AVAILABILITY");
      expect(win.badSamples).toBe(1);
      expect(win.errorBudgetUsedPct).toBeLessThan(100);
      expect(win.status).toBe("OK");
    });

    it("BREACH: 2880 ticks, 3 failures (99.896%) → exhausts 0.05% budget", () => {
      // 3 bad / (2880 * 0.05%) = 3 / 1.44 = 208% → BREACH
      injectAvailability(engine, "CONTROL_PLANE_AVAILABILITY", 2877, 3);
      const win = engine.computeWindow("CONTROL_PLANE_AVAILABILITY");
      expect(win.status).toBe("BREACH");
      expect(win.errorBudgetUsedPct).toBeGreaterThan(100);
    });
  });

  // ── 11. Critical Audit Loss = 0 ─────────────────────────────────────────

  describe("11. CRITICAL_AUDIT_LOSS — zero tolerance", () => {
    it("COMPLIANT: zero lost audit records → OK", () => {
      injectAvailability(engine, "CRITICAL_AUDIT_LOSS", 1440, 0);
      const win = engine.computeWindow("CRITICAL_AUDIT_LOSS");
      expect(win.badSamples).toBe(0);
      expect(win.status).toBe("OK");
    });

    it("BREACH: single lost audit record → immediate BREACH", () => {
      injectAvailability(engine, "CRITICAL_AUDIT_LOSS", 1440, 1);
      const win = engine.computeWindow("CRITICAL_AUDIT_LOSS");
      expect(win.status).toBe("BREACH");
      expect(win.badSamples).toBe(1);
      expect(engine.checkViolation("CRITICAL_AUDIT_LOSS")).not.toBeNull();
    });

    it("BREACH: violation name and budget are correct", () => {
      for (let i = 0; i < 9; i++) engine.record(tick("CRITICAL_AUDIT_LOSS", true));
      engine.record(tick("CRITICAL_AUDIT_LOSS", false));

      const v = engine.checkViolation("CRITICAL_AUDIT_LOSS");
      expect(v).not.toBeNull();
      expect(v!.sloName).toBe("Critical Audit Loss");
      expect(v!.errorBudgetUsedPct).toBe(100);
      expect(v!.badSamples).toBe(1);
    });
  });

  // ── All-SLO Clean Sweep ──────────────────────────────────────────────────

  describe("All-SLO clean sweep", () => {
    it("ALL_GREEN report when all 11 SLOs have ≥ 5 good samples and 0 bad", () => {
      const latencySlos = [
        { id: "CAMERA_RECONNECT_P50", ms: 5_000, target: 10_000 },
        { id: "MEDIA_NODE_FAILOVER_P99", ms: 10_000, target: 20_000 },
        { id: "RECORDING_GAP_ON_RESTART", ms: 1_000, target: 3_000 },
        { id: "LIVE_VIEW_STARTUP_LAN", ms: 1_200, target: 2_000 },
        { id: "LIVE_VIEW_STARTUP_WAN", ms: 2_500, target: 4_000 },
        { id: "PLAYBACK_STARTUP", ms: 900, target: 2_000 },
        { id: "TIMELINE_QUERY", ms: 250, target: 1_000 },
        { id: "ALERT_PROPAGATION", ms: 600, target: 2_000 },
      ] as const;

      for (const { id, ms, target } of latencySlos) {
        for (let i = 0; i < 10; i++) {
          engine.record(latency(id, ms, target));
        }
      }

      for (const id of [
        "RECORDING_COVERAGE",
        "CONTROL_PLANE_AVAILABILITY",
        "CRITICAL_AUDIT_LOSS",
      ] as const) {
        injectAvailability(engine, id, 10, 0);
      }

      const report = engine.buildReport();
      expect(report.overall).toBe("ALL_GREEN");
      expect(report.violations).toHaveLength(0);
      expect(report.slos.filter((s) => s.status === "OK")).toHaveLength(11);
    });
  });
});
