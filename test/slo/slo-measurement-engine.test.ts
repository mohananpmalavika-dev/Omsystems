/**
 * SLO Measurement Engine Unit Tests
 *
 * Tests the circular buffer, p50/p99 math, error-budget computation,
 * availability accounting, COUNT_ZERO logic, and status transitions.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { SloMeasurementEngine } from "../../src/slo/slo-measurement-engine.js";
import type { SloMeasurement } from "../../src/slo/slo-types.js";

// Helper: create a measurement sample N seconds ago
function sample(
  sloId: SloMeasurement["sloId"],
  valueMs: number,
  success: boolean,
  secondsAgo = 0,
): SloMeasurement {
  return {
    sloId,
    observedAt: new Date(Date.now() - secondsAgo * 1000),
    valueMs,
    success,
  };
}

function availSample(
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

describe("SLO Measurement Engine — Unit Tests", () => {
  let engine: SloMeasurementEngine;

  beforeEach(() => {
    engine = new SloMeasurementEngine();
  });

  // ── Insufficient Data ────────────────────────────────────────────────────

  it("returns INSUFFICIENT_DATA when no samples exist", () => {
    const win = engine.computeWindow("TIMELINE_QUERY");
    expect(win.status).toBe("INSUFFICIENT_DATA");
    expect(win.totalSamples).toBe(0);
  });

  it("returns INSUFFICIENT_DATA when fewer than 5 samples exist", () => {
    engine.record(sample("TIMELINE_QUERY", 200, true));
    engine.record(sample("TIMELINE_QUERY", 300, true));
    const win = engine.computeWindow("TIMELINE_QUERY");
    expect(win.status).toBe("INSUFFICIENT_DATA");
  });

  // ── p50 / p99 Computation ────────────────────────────────────────────────

  it("computes correct p50 for an odd-sized sample set", () => {
    const latencies = [100, 200, 300, 400, 500, 600, 700, 800, 900];
    for (const ms of latencies) {
      engine.record(sample("TIMELINE_QUERY", ms, ms <= 1000));
    }
    const win = engine.computeWindow("TIMELINE_QUERY");
    // Sort: [100,200,300,400,500,600,700,800,900] → index floor(9*0.5)=4 → 500
    expect(win.p50Ms).toBe(500);
    // p99 → index floor(9*0.99)=8 → 900
    expect(win.p99Ms).toBe(900);
  });

  it("computes p99 correctly for a larger latency set", () => {
    // 100 samples: 99 at 500 ms, 1 at 5000 ms
    for (let i = 0; i < 99; i++) {
      engine.record(sample("ALERT_PROPAGATION", 500, true));
    }
    engine.record(sample("ALERT_PROPAGATION", 5000, false));

    const win = engine.computeWindow("ALERT_PROPAGATION");
    // Sorted [500 × 99, 5000], p99 = index floor(100*0.99)=99 → 5000
    expect(win.p99Ms).toBe(5000);
  });

  // ── Error Budget Computation — Latency ───────────────────────────────────

  it("reports OK when all samples are within latency target", () => {
    for (let i = 0; i < 20; i++) {
      engine.record(sample("TIMELINE_QUERY", 400, true)); // 400 ms < 1000 ms target
    }
    const win = engine.computeWindow("TIMELINE_QUERY");
    expect(win.status).toBe("OK");
    expect(win.badSamples).toBe(0);
    expect(win.errorBudgetUsedPct).toBe(0);
  });

  it("reports BREACH when error budget is exhausted for a latency SLO", () => {
    // 1% budget on 100 samples = budget for 1 bad sample
    // inject 10 bad samples → 1000% budget used → BREACH
    for (let i = 0; i < 90; i++) {
      engine.record(sample("TIMELINE_QUERY", 400, true));
    }
    for (let i = 0; i < 10; i++) {
      engine.record(sample("TIMELINE_QUERY", 2000, false)); // exceeds 1000 ms
    }
    const win = engine.computeWindow("TIMELINE_QUERY");
    expect(win.status).toBe("BREACH");
    expect(win.badSamples).toBe(10);
    expect(win.errorBudgetUsedPct).toBeGreaterThan(100);
  });

  it("reports WARNING when budget is 75-99% consumed for a latency SLO", () => {
    // Budget = 1% of 100 samples = 1 bad sample allowed
    // At exactly 1 bad sample: 100% used → BREACH
    // Use fewer total so 1 bad = ~80% budget used
    // 1 bad / (N * 0.01) = 0.80 → N = 1 / 0.008 = 125 → budget = 1.25 samples
    // With 50 total: budget = 0.5 bad allowed → 1 bad = 200% → BREACH
    // Adjust: 200 total → budget = 2.0 → 1 bad = 50% → OK
    // 200 total, 1.6 bad allowed → 2 bad = 125% → BREACH
    // Use 200 total, 1 bad = 50% OK, 2 bad = 100% BREACH - there's no WARNING band here
    // Use 300 total: budget = 3.0 → 2 bad = 67% (OK), 3 bad = 100% BREACH
    // Use 400 total: budget = 4.0 → 3 bad = 75% (WARNING threshold)
    for (let i = 0; i < 397; i++) {
      engine.record(sample("TIMELINE_QUERY", 400, true));
    }
    for (let i = 0; i < 3; i++) {
      engine.record(sample("TIMELINE_QUERY", 2000, false));
    }
    const win = engine.computeWindow("TIMELINE_QUERY");
    // 3 bad / (400 * 0.01) = 3 / 4 = 75% — exactly at WARNING threshold
    expect(win.status).toBe("WARNING");
  });

  // ── Availability SLO ─────────────────────────────────────────────────────

  it("reports OK for RECORDING_COVERAGE when all ticks succeed", () => {
    // Simulate 1440 one-minute ticks, all succeeding (24h coverage)
    for (let i = 0; i < 1440; i++) {
      engine.record(availSample("RECORDING_COVERAGE", true, i * 60));
    }
    const win = engine.computeWindow("RECORDING_COVERAGE");
    expect(win.goodSamples).toBe(1440);
    expect(win.badSamples).toBe(0);
    expect(win.status).toBe("OK");
  });

  it("reports BREACH for RECORDING_COVERAGE when >0.01% ticks fail", () => {
    // 1440 ticks total, budget = 0.01% = 0.144 → even 1 failure = 694% budget used
    for (let i = 0; i < 1439; i++) {
      engine.record(availSample("RECORDING_COVERAGE", true, i * 60));
    }
    engine.record(availSample("RECORDING_COVERAGE", false, 1439 * 60));

    const win = engine.computeWindow("RECORDING_COVERAGE");
    expect(win.status).toBe("BREACH");
    expect(win.badSamples).toBe(1);
    expect(win.errorBudgetUsedPct).toBeGreaterThan(100);
  });

  // ── COUNT_ZERO SLO ────────────────────────────────────────────────────────

  it("reports OK for CRITICAL_AUDIT_LOSS when all entries are intact", () => {
    for (let i = 0; i < 10; i++) {
      engine.record(availSample("CRITICAL_AUDIT_LOSS", true));
    }
    const win = engine.computeWindow("CRITICAL_AUDIT_LOSS");
    expect(win.status).toBe("OK");
    expect(win.badSamples).toBe(0);
  });

  it("reports immediate BREACH for CRITICAL_AUDIT_LOSS on any single loss", () => {
    for (let i = 0; i < 9; i++) {
      engine.record(availSample("CRITICAL_AUDIT_LOSS", true));
    }
    // One lost audit record
    engine.record(availSample("CRITICAL_AUDIT_LOSS", false));

    const win = engine.computeWindow("CRITICAL_AUDIT_LOSS");
    expect(win.status).toBe("BREACH");
    expect(win.badSamples).toBe(1);
    expect(win.errorBudgetUsedPct).toBe(100);
  });

  // ── Violation Detection ───────────────────────────────────────────────────

  it("checkViolation returns null when SLO is OK", () => {
    for (let i = 0; i < 20; i++) {
      engine.record(sample("PLAYBACK_STARTUP", 800, true));
    }
    expect(engine.checkViolation("PLAYBACK_STARTUP")).toBeNull();
  });

  it("checkViolation returns a SloViolation when budget is exhausted", () => {
    for (let i = 0; i < 90; i++) {
      engine.record(sample("PLAYBACK_STARTUP", 800, true));
    }
    for (let i = 0; i < 10; i++) {
      engine.record(sample("PLAYBACK_STARTUP", 5000, false)); // > 2000 ms target
    }
    const violation = engine.checkViolation("PLAYBACK_STARTUP");
    expect(violation).not.toBeNull();
    expect(violation!.sloId).toBe("PLAYBACK_STARTUP");
    expect(violation!.errorBudgetUsedPct).toBeGreaterThan(100);
  });

  it("getAllViolations returns only breaching SLOs", () => {
    // Breach CRITICAL_AUDIT_LOSS
    for (let i = 0; i < 9; i++) engine.record(availSample("CRITICAL_AUDIT_LOSS", true));
    engine.record(availSample("CRITICAL_AUDIT_LOSS", false));

    const violations = engine.getAllViolations();
    expect(violations.length).toBe(1);
    expect(violations[0]!.sloId).toBe("CRITICAL_AUDIT_LOSS");
  });

  // ── Rolling Window ────────────────────────────────────────────────────────

  it("ignores samples outside the rolling window", () => {
    // TIMELINE_QUERY window = 1 hour = 3600 s
    // Record 10 old samples (2 hours ago) — outside window
    for (let i = 0; i < 10; i++) {
      engine.record(sample("TIMELINE_QUERY", 2000, false, 7200)); // 2h ago = outside 1h window
    }
    const win = engine.computeWindow("TIMELINE_QUERY");
    expect(win.totalSamples).toBe(0); // all excluded
    expect(win.status).toBe("INSUFFICIENT_DATA");
  });

  it("includes samples within the rolling window", () => {
    for (let i = 0; i < 10; i++) {
      engine.record(sample("TIMELINE_QUERY", 300, true, 1800)); // 30 min ago = inside 1h window
    }
    const win = engine.computeWindow("TIMELINE_QUERY");
    expect(win.totalSamples).toBe(10);
    expect(win.status).toBe("OK");
  });

  // ── clearAll / clearSlo ───────────────────────────────────────────────────

  it("clearSlo resets a specific SLO without affecting others", () => {
    for (let i = 0; i < 10; i++) {
      engine.record(sample("TIMELINE_QUERY", 300, true));
      engine.record(sample("PLAYBACK_STARTUP", 800, true));
    }
    engine.clearSlo("TIMELINE_QUERY");
    expect(engine.computeWindow("TIMELINE_QUERY").totalSamples).toBe(0);
    expect(engine.computeWindow("PLAYBACK_STARTUP").totalSamples).toBe(10);
  });

  it("clearAll resets all SLO buffers", () => {
    for (let i = 0; i < 10; i++) {
      engine.record(sample("TIMELINE_QUERY", 300, true));
      engine.record(sample("PLAYBACK_STARTUP", 800, true));
    }
    engine.clearAll();
    expect(engine.computeWindow("TIMELINE_QUERY").totalSamples).toBe(0);
    expect(engine.computeWindow("PLAYBACK_STARTUP").totalSamples).toBe(0);
  });

  // ── buildReport ───────────────────────────────────────────────────────────

  it("buildReport returns ALL_GREEN when all SLOs have no bad samples", () => {
    // Inject enough good samples to get out of INSUFFICIENT_DATA for each SLO
    const latencySlos = [
      "CAMERA_RECONNECT_P50",
      "MEDIA_NODE_FAILOVER_P99",
      "RECORDING_GAP_ON_RESTART",
      "LIVE_VIEW_STARTUP_LAN",
      "LIVE_VIEW_STARTUP_WAN",
      "PLAYBACK_STARTUP",
      "TIMELINE_QUERY",
      "ALERT_PROPAGATION",
    ] as const;

    for (const id of latencySlos) {
      for (let i = 0; i < 10; i++) {
        engine.record(sample(id, 100, true));
      }
    }
    for (let i = 0; i < 10; i++) {
      engine.record(availSample("RECORDING_COVERAGE", true));
      engine.record(availSample("CONTROL_PLANE_AVAILABILITY", true));
      engine.record(availSample("CRITICAL_AUDIT_LOSS", true));
    }

    const report = engine.buildReport();
    expect(report.overall).toBe("ALL_GREEN");
    expect(report.violations).toHaveLength(0);
  });

  it("buildReport returns BREACH when any SLO is breaching", () => {
    // Breach CRITICAL_AUDIT_LOSS
    for (let i = 0; i < 9; i++) engine.record(availSample("CRITICAL_AUDIT_LOSS", true));
    engine.record(availSample("CRITICAL_AUDIT_LOSS", false));

    const report = engine.buildReport();
    expect(report.overall).toBe("BREACH");
    expect(report.violations.some((v) => v.sloId === "CRITICAL_AUDIT_LOSS")).toBe(true);
  });
});
