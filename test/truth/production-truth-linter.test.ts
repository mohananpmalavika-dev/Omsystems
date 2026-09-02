import { describe, it, expect } from "vitest";
import { runProductionTruthVerification } from "../../scripts/verify-production-truth.js";

describe("Production Truth Static Linter", () => {
  it("scans production directories and verifies zero simulation/mock success violations", async () => {
    const result = await runProductionTruthVerification();
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(result.totalFilesScanned).toBeGreaterThan(100);
  }, 60000);

});
