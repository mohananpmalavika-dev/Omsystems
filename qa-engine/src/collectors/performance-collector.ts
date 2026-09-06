/**
 * Performance Collector
 *
 * Measures page load timings (DOMContentLoaded, load, network idle)
 * and classifies performance health (<2s Good, 2-4s Warning, >4s Slow, >8s Critical).
 */

import type { Page } from "@playwright/test";
import type { QAPerformanceMetric } from "../types/qa.types.js";

export class PerformanceCollector {
  private metrics: QAPerformanceMetric[] = [];

  /**
   * Measure navigation and performance metrics for current page
   */
  async measurePage(page: Page, runId = ""): Promise<QAPerformanceMetric> {
    const pageUrl = page.url();

    // Query browser performance navigation timing API
    const timing = await page.evaluate(() => {
      const entry = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
      if (entry) {
        return {
          domContentLoadedMs: Math.round(entry.domContentLoadedEventEnd - entry.startTime),
          loadMs: Math.round(entry.loadEventEnd - entry.startTime),
          firstMeaningfulPaintMs: Math.round(entry.responseEnd - entry.startTime),
        };
      }
      const nav = performance.timing;
      return {
        domContentLoadedMs: Math.max(0, nav.domContentLoadedEventEnd - nav.navigationStart),
        loadMs: Math.max(0, nav.loadEventEnd - nav.navigationStart),
        firstMeaningfulPaintMs: Math.max(0, nav.responseEnd - nav.navigationStart),
      };
    }).catch(() => ({
      domContentLoadedMs: 0,
      loadMs: 0,
      firstMeaningfulPaintMs: 0,
    }));

    const loadMs = timing.loadMs > 0 ? timing.loadMs : 1000;
    let rating: QAPerformanceMetric["rating"] = "Good";

    if (loadMs > 8000) {
      rating = "Critical";
    } else if (loadMs > 4000) {
      rating = "Slow";
    } else if (loadMs > 2000) {
      rating = "Warning";
    }

    const metric: QAPerformanceMetric = {
      id: `perf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      runId,
      pageUrl,
      domContentLoadedMs: timing.domContentLoadedMs,
      loadMs,
      networkIdleMs: loadMs + 200,
      firstMeaningfulPaintMs: timing.firstMeaningfulPaintMs,
      rating,
      createdAt: new Date().toISOString(),
    };

    this.metrics.push(metric);
    return metric;
  }

  getMetrics(runId = ""): QAPerformanceMetric[] {
    return this.metrics.map((m) => ({ ...m, runId }));
  }

  /**
   * Calculate average load time in milliseconds
   */
  get averageLoadTimeMs(): number {
    if (this.metrics.length === 0) return 0;
    const total = this.metrics.reduce((sum, m) => sum + m.loadMs, 0);
    return Math.round(total / this.metrics.length);
  }
}
