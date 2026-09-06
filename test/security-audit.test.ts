import { describe, expect, it } from "vitest";
import { evaluateAudit } from "../scripts/security-audit.mjs";

const report = (vulnerabilities = {}) => ({
  auditReportVersion: 2, vulnerabilities,
  metadata: { vulnerabilities: { high: 0, critical: 0, moderate: 0, total: 0 } },
});

describe("dependency release gate", () => {
  it("rejects registry errors and incomplete output instead of declaring it clean", () => {
    for (const input of [null, {}, { error: { code: "ENOTFOUND" } }, { vulnerabilities: {} }]) {
      expect(() => evaluateAudit(input)).toThrow();
    }
  });

  it("blocks newly discovered critical/high issues even in previously exempt packages", () => {
    const result = evaluateAudit(report({
      next: { name: "next", severity: "critical", via: [{ url: "https://example.org/advisory" }] },
      sharp: { name: "sharp", severity: "high", via: [] },
    }));
    expect(result.blocking.map((item: { name: string }) => item.name)).toEqual(["next", "sharp"]);
  });

  it("accepts a valid clean report and retains lower severity totals for review", () => {
    expect(evaluateAudit(report()).blocking).toEqual([]);
    expect(evaluateAudit(report({ dep: { name: "dep", severity: "moderate" } })).blocking).toEqual([]);
  });
});
