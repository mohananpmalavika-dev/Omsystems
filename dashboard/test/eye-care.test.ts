import { describe, expect, it } from "vitest";
import {
  computeEyeCareFilter,
  getCircadianPhase,
  calculateFatigueCompensation,
  formatMonitoringDuration,
  DEFAULT_EYE_CARE_SETTINGS,
  type EyeCareSettings,
} from "../lib/eye-care.js";

describe("Auto Eye-Care Engine", () => {
  it("resolves circadian phase correctly across 24-hour cycle", () => {
    // Noon
    const noon = getCircadianPhase(12);
    expect(noon.phase).toBe("DAY");
    expect(noon.recommendedWarmth).toBe(15);

    // Evening
    const evening = getCircadianPhase(18);
    expect(evening.phase).toBe("DUSK");
    expect(evening.recommendedWarmth).toBe(42);

    // Night Watch
    const midnight = getCircadianPhase(23);
    expect(midnight.phase).toBe("NIGHT_SHIFT");
    expect(midnight.recommendedWarmth).toBe(68);

    // Dawn
    const dawn = getCircadianPhase(6);
    expect(dawn.phase).toBe("DAWN");
    expect(dawn.recommendedWarmth).toBe(35);
  });

  it("calculates fatigue compensation for continuous monitoring", () => {
    // Under 15 mins: no fatigue compensation yet
    expect(calculateFatigueCompensation(10)).toEqual({
      warmthBoost: 0,
      brightnessReduction: 0,
      contrastReduction: 0,
    });

    // 40 mins continuous monitoring: 1 interval
    const comp40 = calculateFatigueCompensation(40);
    expect(comp40.warmthBoost).toBe(4);
    expect(comp40.brightnessReduction).toBe(2);

    // 80 mins continuous monitoring: multiple intervals
    const comp80 = calculateFatigueCompensation(80);
    expect(comp80.warmthBoost).toBeGreaterThanOrEqual(12);
  });

  it("produces valid CSS filters for auto circadian mode", () => {
    const settings: EyeCareSettings = {
      ...DEFAULT_EYE_CARE_SETTINGS,
      mode: "auto",
      enabled: true,
    };

    // Night shift (hour 22)
    const nightComputed = computeEyeCareFilter(settings, 22, 0);
    expect(nightComputed.filter).toContain("sepia");
    expect(nightComputed.filter).toContain("hue-rotate");
    expect(nightComputed.filter).toContain("brightness");
    expect(nightComputed.phaseLabel).toContain("Night Watch");
    expect(nightComputed.effectiveWarmth).toBe(68);

    // Day shift (hour 11)
    const dayComputed = computeEyeCareFilter(settings, 11, 0);
    expect(dayComputed.phaseLabel).toContain("Daylight");
    expect(dayComputed.effectiveWarmth).toBe(15);
  });

  it("handles monochrome mode for high acuity and zero chromatic fatigue", () => {
    const settings: EyeCareSettings = {
      ...DEFAULT_EYE_CARE_SETTINGS,
      mode: "monochrome",
      enabled: true,
    };

    const computed = computeEyeCareFilter(settings, 12, 0);
    expect(computed.filter).toContain("grayscale(100%)");
    expect(computed.phaseLabel).toBe("High-Acuity Monochrome");
  });

  it("turns off filter cleanly when disabled or mode is off", () => {
    const disabledSettings: EyeCareSettings = {
      ...DEFAULT_EYE_CARE_SETTINGS,
      enabled: false,
    };
    expect(computeEyeCareFilter(disabledSettings).filter).toBe("none");

    const offSettings: EyeCareSettings = {
      ...DEFAULT_EYE_CARE_SETTINGS,
      enabled: true,
      mode: "off",
    };
    expect(computeEyeCareFilter(offSettings).filter).toBe("none");
  });

  it("formats monitoring duration cleanly", () => {
    expect(formatMonitoringDuration(0)).toBe("< 1 min");
    expect(formatMonitoringDuration(18)).toBe("18m");
    expect(formatMonitoringDuration(75)).toBe("1h 15m");
  });
});
