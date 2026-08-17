/**
 * VMS SLO Measurement Engine
 *
 * Core runtime component:
 *  - Accepts measurement samples via record()
 *  - Maintains a per-SLO rolling circular buffer (maxSamples per SLO)
 *  - Computes p50/p99, error-budget consumption, and SLO status on demand
 *  - Detects violations when error budget is exhausted
 *
 * Design notes:
 *  - Pure in-memory: no external dependencies, easy to embed and test.
 *  - Thread-safe via synchronous JS event loop (no async races).
 *  - Buffer cap prevents unbounded growth; oldest samples are evicted when full.
 *  - p50/p99 computed on sorted latency arrays — accurate for sample sizes
 *    up to ~10 k (sufficient for a 1-hour rolling window at sub-second sampling).
 */

import { SLO_DEFINITIONS, SLO_ORDER, getSloDefinition } from "./slo-definitions.js";
import type {
  SloId,
  SloMeasurement,
  SloReport,
  SloStatus,
  SloViolation,
  SloWindow,
} from "./slo-types.js";

// Maximum samples retained per SLO in the rolling buffer
const MAX_SAMPLES_PER_SLO = 10_000;

// Warning threshold: flag WARNING when budget is ≥ 75% consumed
const WARNING_BUDGET_THRESHOLD_PCT = 75;

// Minimum samples required before computing a meaningful status
const MIN_SAMPLES_FOR_STATUS = 5;

export class SloMeasurementEngine {
  private readonly buffers = new Map<SloId, SloMeasurement[]>();

  constructor() {
    for (const id of SLO_ORDER) {
      this.buffers.set(id, []);
    }
  }

  // ── Write ────────────────────────────────────────────────────────────────

  /**
   * Record a single measurement sample for a given SLO.
   * For latency SLOs, valueMs is required.
   * For AVAILABILITY_PCT and COUNT_ZERO, set success=true/false.
   */
  record(measurement: SloMeasurement): void {
    const buf = this.buffers.get(measurement.sloId);
    if (!buf) throw new Error(`Unknown SLO ID: ${measurement.sloId}`);

    buf.push(measurement);

    // Evict oldest samples if buffer is full
    if (buf.length > MAX_SAMPLES_PER_SLO) {
      buf.splice(0, buf.length - MAX_SAMPLES_PER_SLO);
    }
  }

  // ── Read ─────────────────────────────────────────────────────────────────

  /**
   * Compute the current SLO window for a given SLO ID.
   * Samples outside the definition's windowSeconds are ignored.
   */
  computeWindow(sloId: SloId, now: Date = new Date()): SloWindow {
    const def = getSloDefinition(sloId);
    const buf = this.buffers.get(sloId) ?? [];

    const windowStart = new Date(now.getTime() - def.windowSeconds * 1000);

    // Filter to samples within the rolling window
    const inWindow = buf.filter((m) => m.observedAt >= windowStart && m.observedAt <= now);

    const totalSamples = inWindow.length;
    const goodSamples = inWindow.filter((m) => m.success).length;
    const badSamples = totalSamples - goodSamples;

    // Compute latency percentiles for LATENCY_* SLOs
    let p50Ms: number | undefined;
    let p99Ms: number | undefined;

    if (def.kind === "LATENCY_P50_MS" || def.kind === "LATENCY_P99_MS") {
      const latencies = inWindow
        .filter((m) => m.valueMs !== undefined)
        .map((m) => m.valueMs as number)
        .sort((a, b) => a - b);

      if (latencies.length > 0) {
        p50Ms = latencies[Math.floor(latencies.length * 0.5)] ?? latencies[latencies.length - 1];
        p99Ms =
          latencies[Math.floor(latencies.length * 0.99)] ?? latencies[latencies.length - 1];
      }
    }

    // Compute error budget consumption
    let errorBudgetUsedPct = 0;

    if (totalSamples === 0) {
      return {
        sloId,
        windowStart,
        windowEnd: now,
        totalSamples: 0,
        goodSamples: 0,
        badSamples: 0,
        p50Ms,
        p99Ms,
        errorBudgetUsedPct: 0,
        errorBudgetRemainingPct: 100,
        status: "INSUFFICIENT_DATA",
      };
    }

    if (def.kind === "COUNT_ZERO") {
      // Any bad sample exhausts the budget instantly
      errorBudgetUsedPct = badSamples > 0 ? 100 : 0;
    } else if (def.kind === "AVAILABILITY_PCT") {
      // errorBudget = errorBudgetPct% of total observations
      // used = badSamples / (totalSamples * errorBudgetPct / 100)
      const budgetSamples = (totalSamples * def.errorBudgetPct) / 100;
      errorBudgetUsedPct = budgetSamples === 0 ? 100 : (badSamples / budgetSamples) * 100;
    } else {
      // LATENCY_P50_MS / LATENCY_P99_MS
      // A "bad" sample for p50 is: the measured p50 exceeds targetMs.
      // A "bad" sample for p99 is: the measured p99 exceeds targetMs.
      // For error-budget we use: bad observations / budget observations
      const budgetSamples = (totalSamples * def.errorBudgetPct) / 100;
      errorBudgetUsedPct = budgetSamples === 0 ? 100 : (badSamples / budgetSamples) * 100;
    }

    const errorBudgetRemainingPct = Math.max(0, 100 - errorBudgetUsedPct);

    // Determine status
    let status: SloStatus;
    if (totalSamples < MIN_SAMPLES_FOR_STATUS) {
      status = "INSUFFICIENT_DATA";
    } else if (errorBudgetUsedPct >= 100) {
      status = "BREACH";
    } else if (errorBudgetUsedPct >= WARNING_BUDGET_THRESHOLD_PCT) {
      status = "WARNING";
    } else {
      status = "OK";
    }

    return {
      sloId,
      windowStart,
      windowEnd: now,
      totalSamples,
      goodSamples,
      badSamples,
      p50Ms,
      p99Ms,
      errorBudgetUsedPct,
      errorBudgetRemainingPct,
      status,
    };
  }

  /**
   * Compute windows for all SLOs in canonical order.
   */
  getAllWindows(now: Date = new Date()): SloWindow[] {
    return SLO_ORDER.map((id) => this.computeWindow(id, now));
  }

  /**
   * Check a single SLO for a violation (budget exhausted).
   * Returns a SloViolation if in BREACH, null otherwise.
   */
  checkViolation(sloId: SloId, now: Date = new Date()): SloViolation | null {
    const window = this.computeWindow(sloId, now);
    const def = SLO_DEFINITIONS[sloId];

    if (window.status !== "BREACH") return null;

    return {
      sloId,
      sloName: def.name,
      detectedAt: now,
      errorBudgetUsedPct: window.errorBudgetUsedPct,
      badSamples: window.badSamples,
      totalSamples: window.totalSamples,
    };
  }

  /**
   * Return all currently active violations across all SLOs.
   */
  getAllViolations(now: Date = new Date()): SloViolation[] {
    return SLO_ORDER.map((id) => this.checkViolation(id, now)).filter(
      (v): v is SloViolation => v !== null,
    );
  }

  /**
   * Drain (clear) all samples for a given SLO.
   * Useful in tests to reset state between scenarios.
   */
  clearSlo(sloId: SloId): void {
    const buf = this.buffers.get(sloId);
    if (buf) buf.length = 0;
  }

  /**
   * Drain all buffers across all SLOs.
   */
  clearAll(): void {
    for (const id of SLO_ORDER) {
      this.clearSlo(id);
    }
  }

  // ── Report ───────────────────────────────────────────────────────────────

  buildReport(now: Date = new Date()): SloReport {
    const windows = this.getAllWindows(now);
    const violations = this.getAllViolations(now);

    const overall: SloReport["overall"] =
      violations.length > 0
        ? "BREACH"
        : windows.some((w) => w.status === "WARNING")
          ? "WARNING"
          : "ALL_GREEN";

    const errorBudgetSummary = windows.map((w) => ({
      sloId: w.sloId,
      sloName: SLO_DEFINITIONS[w.sloId].name,
      remainingPct: w.errorBudgetRemainingPct,
      status: w.status,
    }));

    return {
      generatedAt: now,
      overall,
      slos: windows,
      violations,
      errorBudgetSummary,
    };
  }
}

/** Singleton engine — shared across the process */
export const sloEngine = new SloMeasurementEngine();
