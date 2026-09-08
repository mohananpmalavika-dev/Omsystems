import { describe, expect, it } from "vitest";
import { getTelemetryFreshness } from "../dashboard/lib/telemetry-freshness.js";

describe("telemetry freshness truth state", () => {
  const now = Date.parse("2026-09-07T12:00:00.000Z");

  it("marks recent telemetry as current", () => {
    expect(getTelemetryFreshness("2026-09-07T11:59:30.000Z", now).state).toBe("fresh");
  });

  it("distinguishes delayed and stale telemetry", () => {
    expect(getTelemetryFreshness("2026-09-07T11:57:00.000Z", now).state).toBe("degraded");
    expect(getTelemetryFreshness("2026-09-07T11:45:00.000Z", now).state).toBe("stale");
  });

  it("does not manufacture a live state without a valid timestamp", () => {
    expect(getTelemetryFreshness(undefined, now).state).toBe("unavailable");
    expect(getTelemetryFreshness("not-a-timestamp", now).state).toBe("unavailable");
    expect(getTelemetryFreshness("2026-09-07T12:00:06.000Z", now).state).toBe("unavailable");
  });
});
