import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { StreamProfileSelector } from "../../src/media/services/stream-profile-selector.js";

describe("Admin Stream Quality Preference Enforcement Tests", () => {
  const originalPref = StreamProfileSelector.getGlobalAdminPreference();

  afterEach(() => {
    StreamProfileSelector.setGlobalAdminPreference(originalPref);
  });

  it("defaults to adaptive behavior when Admin Preference is AUTO", () => {
    StreamProfileSelector.setGlobalAdminPreference("AUTO");

    const resultGrid = StreamProfileSelector.select({
      purpose: "VIDEO_WALL",
    });
    expect(resultGrid.resolvedQuality).toBe("SUBSTREAM");

    const resultIncident = StreamProfileSelector.select({
      purpose: "INCIDENT",
    });
    expect(resultIncident.resolvedQuality).toBe("MAINSTREAM");
  });

  it("strictly ENFORCES MAINSTREAM across all video wall and live view feeds when Admin sets MAINSTREAM", () => {
    StreamProfileSelector.setGlobalAdminPreference("MAINSTREAM");

    const resultVideoWall = StreamProfileSelector.select({
      purpose: "VIDEO_WALL",
    });
    expect(resultVideoWall.resolvedQuality).toBe("MAINSTREAM");

    const resultLiveView = StreamProfileSelector.select({
      purpose: "LIVE_VIEW",
    });
    expect(resultLiveView.resolvedQuality).toBe("MAINSTREAM");

    const resultAlert = StreamProfileSelector.select({
      purpose: "ALERT",
    });
    expect(resultAlert.resolvedQuality).toBe("MAINSTREAM");
  });

  it("strictly ENFORCES SUBSTREAM across all feeds when Admin sets SUBSTREAM", () => {
    StreamProfileSelector.setGlobalAdminPreference("SUBSTREAM");

    const resultVideoWall = StreamProfileSelector.select({
      purpose: "VIDEO_WALL",
    });
    expect(resultVideoWall.resolvedQuality).toBe("SUBSTREAM");

    const resultIncident = StreamProfileSelector.select({
      purpose: "INCIDENT",
    });
    expect(resultIncident.resolvedQuality).toBe("SUBSTREAM");
  });
});
