import { beforeEach, describe, expect, it } from "vitest";
import {
  getPerformanceObserver,
  trackDatabaseQuery,
} from "../../src/observability/performance-observer.js";

describe("performance observability", () => {
  const observer = getPerformanceObserver();

  beforeEach(() => observer.reset());

  it("calculates endpoint P50, P95, and P99 metrics", () => {
    for (const latency of [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]) {
      observer.recordEndpointLatency("/v1/cameras/:id", "GET", latency);
    }

    const metric = observer.getEndpointMetrics("/v1/cameras/:id", "GET")[0];
    expect(metric?.latencyPercentiles).toMatchObject({ p50: 50, p95: 100, p99: 100, count: 10 });
    expect(metric?.errorRate).toBe(0);
  });

  it("retains Core Web Vitals in the dashboard snapshot", () => {
    observer.recordWebVital({ name: "LCP", value: 1200 });
    observer.recordWebVital({ name: "LCP", value: 1800 });
    observer.recordWebVital({ name: "CLS", value: 0.04 });

    expect(observer.getSnapshot().webVitals.LCP).toMatchObject({ p50: 1200, p99: 1800, count: 2 });
    expect(observer.getSnapshot().webVitals.CLS?.count).toBe(1);
  });

  it("records successful and failed database queries", async () => {
    await trackDatabaseQuery("SELECT * FROM cameras WHERE id = $1", async () => "ok");
    await expect(trackDatabaseQuery("SELECT * FROM cameras WHERE id = $1", async () => {
      throw new Error("database unavailable");
    })).rejects.toThrow("database unavailable");

    const metric = observer.getQueryMetrics()[0];
    expect(metric?.totalExecutions).toBe(2);
    expect(metric?.errorCount).toBe(1);
    expect(metric?.latencyPercentiles.count).toBe(2);
  });
});