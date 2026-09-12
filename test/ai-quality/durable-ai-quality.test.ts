import { describe, expect, it } from "vitest";
import { PostgresDetectorRegistryRepository } from "../../src/ai-quality/repositories/postgres-detector-registry.repository.js";

describe("AI Quality & Camera Commissioning Assessment (P0 Phase 8 & 9)", () => {
  it("marks low-resolution camera as NOT_SUITABLE for ANPR", () => {
    const repo = new PostgresDetectorRegistryRepository();

    const assessment = repo.evaluateCameraSuitability(
      {
        cameraId: "cam-gate-01",
        resolutionWidth: 1280,
        resolutionHeight: 720, // ~0.9 MP < 2.0 MP
        fps: 25,
      },
      "ANPR",
    );

    expect(assessment.suitability).toBe("NOT_SUITABLE");
    expect(assessment.reasons.some((r) => r.includes("below the minimum 2.0MP"))).toBe(true);
    expect(assessment.recommendations.length).toBeGreaterThan(0);
  });

  it("marks high-resolution 1080p camera as SUITABLE for ANPR", () => {
    const repo = new PostgresDetectorRegistryRepository();

    const assessment = repo.evaluateCameraSuitability(
      {
        cameraId: "cam-gate-02",
        resolutionWidth: 1920,
        resolutionHeight: 1080, // ~2.1 MP >= 2.0 MP
        fps: 25,
      },
      "ANPR",
    );

    expect(assessment.suitability).toBe("SUITABLE");
    expect(assessment.reasons).toHaveLength(0);
  });

  it("marks camera without night vision as SUITABLE_WITH_WARNING for after-hours intrusion", () => {
    const repo = new PostgresDetectorRegistryRepository();

    const assessment = repo.evaluateCameraSuitability(
      {
        cameraId: "cam-vault-indoor",
        resolutionWidth: 1920,
        resolutionHeight: 1080,
        fps: 25,
        hasNightVision: false,
      },
      "INTRUSION",
    );

    expect(assessment.suitability).toBe("SUITABLE_WITH_WARNING");
    expect(assessment.reasons.some((r) => r.includes("night-vision"))).toBe(true);
  });
});
