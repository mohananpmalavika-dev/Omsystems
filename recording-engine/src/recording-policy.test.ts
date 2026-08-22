import { describe, expect, it } from "vitest";
import { permitsSentinelTimelineWorker } from "./recording-policy.js";

describe("recording transfer policy", () => {
  it("never starts a Sentinel timeline worker for recorder-local cameras", () => {
    expect(permitsSentinelTimelineWorker({
      enabled: true,
      primaryRecordingStorage: "recorder-local",
    })).toBe(false);
    expect(permitsSentinelTimelineWorker({ enabled: true })).toBe(false);
  });

  it("allows branch-local Sentinel recording for standalone cameras", () => {
    expect(permitsSentinelTimelineWorker({
      enabled: true,
      primaryRecordingStorage: "sentinel-local",
    })).toBe(true);
  });
});
