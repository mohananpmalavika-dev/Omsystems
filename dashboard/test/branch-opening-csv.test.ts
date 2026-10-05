import { describe, expect, it } from "vitest";
import { branchOpeningCsv } from "../lib/branch-opening-csv.js";

describe("branch opening CSV export", () => {
  it("exports the filtered observation with IST time, location and evidence URL", () => {
    const timestamp = "2026-10-05T23:00:00.000Z";
    const csv = branchOpeningCsv([{
      localDate: "2026-10-06", occurredAt: timestamp, zoneName: "North", branchName: 'Branch, "One"',
      personCount: 1, outcome: "FAILED", cameraName: "Entrance", locationType: "branch-entrance",
      photoUrl: "/api/control/v1/reports/mis/branch-openings/photo",
    }], "https://example.test");
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv.split("\r\n")).toHaveLength(2);
    expect(csv).toContain(new Date(timestamp).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }));
    expect(csv).toContain('"Branch, ""One"""');
    expect(csv).toContain('"1","FAILED","Entrance","branch entrance"');
    expect(csv).toContain('"https://example.test/api/control/v1/reports/mis/branch-openings/photo"');
  });

  it("preserves missing observations and neutralizes spreadsheet formulas", () => {
    const csv = branchOpeningCsv([{
      localDate: "2026-10-06", occurredAt: null, zoneName: null, branchName: '=HYPERLINK("unsafe")',
      personCount: null, outcome: "NOT_RECORDED", cameraName: null, photoUrl: null,
    }], "https://example.test");
    expect(csv).toContain('"\'=HYPERLINK(""unsafe"")"');
    expect(csv).toContain('"","NOT_RECORDED","","Unassigned","Unavailable"');
    expect(csv).not.toContain('"0","NOT_RECORDED"');
  });
});
