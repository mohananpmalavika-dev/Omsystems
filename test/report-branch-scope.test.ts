import { afterAll, describe, expect, it } from "vitest";
import Fastify from "fastify";
import type { Pool } from "pg";
import sharp from "sharp";
import { MemoryStore } from "../src/store.js";
import { createMISUnifiedRoutes } from "../src/routes/reports/mis-unified.routes.js";
import { NbfcRuleRepository } from "../src/analytics/nbfc-rule-repository.js";

describe("MIS report branch permissions", () => {
  const store = new MemoryStore();
  const app = Fastify();
  const pool = { query: async () => ({ rows: [] }) } as unknown as Pool;
  const openingRepository = new NbfcRuleRepository();

  app.addHook("preHandler", async (request) => {
    request.currentUser = (await store.getUser("user-branch-manager"))!;
  });
  createMISUnifiedRoutes(app, pool, store, openingRepository);
  afterAll(async () => app.close());

  it("includes only permitted branches in data and filter choices", async () => {
    const response = await app.inject({ method: "GET", url: "/mis" });
    expect(response.statusCode).toBe(200);
    const report = response.json();
    expect(report.filterOptions.branches.map((branch: { id: string }) => branch.id)).toEqual(["A005"]);
    expect(report.allBranches).toHaveLength(1);
    expect(report.allBranches[0].name).toBe(report.filterOptions.branches[0].name);
  });

  it("rejects an explicitly requested branch outside the user's scope", async () => {
    const response = await app.inject({ method: "GET", url: "/mis?branchId=A008" });
    expect(response.statusCode).toBe(403);
  });

  it("reports only accessible failed openings, with count and a scoped photo link, for an inclusive date period", async () => {
    const rule = await store.createAnalyticsRule("omsystems", "cam-001", "user-global-admin", {
      name: "Opening dual control", detectionType: "dual-control-verification", enabled: true,
      objectClasses: [], minConfidence: 0.5, minDurationSeconds: 0,
      direction: "any", severity: "P1", cooldownSeconds: 0, recipients: [],
      recordingPolicy: "protect-window", preRollSeconds: 30, postRollSeconds: 120,
    });
    const snapshot = await sharp({ create: {
      width: 100, height: 100, channels: 3, background: "#334455",
    } }).jpeg().toBuffer();
    await store.processAnalyticsEvent({
      tenantId: "omsystems", cameraId: "cam-001", sourceEventId: "opening-report-a005",
      detectionType: "dual-control-verification", occurredAt: "2026-09-21T03:05:00.000Z",
      confidence: 0.95, durationSeconds: 0, modelVersion: "test", objects: [],
      metadata: { violation: "BRANCH_OPENING_MINIMUM_STAFF", staffCount: 1,
        snapshotBase64: snapshot.toString("base64"),
        personBoundingBox: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 } },
    });
    await store.processAnalyticsEvent({
      tenantId: "omsystems", cameraId: "cam-a008-01", sourceEventId: "opening-report-a008",
      detectionType: "dual-control-verification", occurredAt: "2026-09-21T03:06:00.000Z",
      confidence: 0.95, durationSeconds: 0, modelVersion: "test", objects: [],
      metadata: { violation: "BRANCH_OPENING_MINIMUM_STAFF", staffCount: 1 },
    });

    const response = await app.inject({ method: "GET",
      url: "/mis/branch-opening-failures?timeRange=custom&startDate=2026-09-21&endDate=2026-09-21" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ startDate: "2026-09-21", endDate: "2026-09-21", total: 1 });
    expect(response.json().rows[0]).toMatchObject({ branchId: "A005", personCount: 1,
      photoUrl: expect.stringContaining("/mis/branch-opening-failures/") });
    expect(response.json().rows[0].zoneName).toBeNull(); // A region's name cannot create a zone level.
    expect(store.analyticsAlerts.find((alert) => alert.ruleId === rule.id)).toBeTruthy();
    const photo = await app.inject({ method: "GET",
      url: `/mis/branch-opening-failures/${response.json().rows[0].eventId}/photo` });
    expect(photo.statusCode).toBe(200);
    expect(photo.headers["content-type"]).toContain("image/jpeg");
    const cropped = await sharp(photo.rawPayload).metadata();
    expect(cropped.width).toBeLessThan(100);
    expect(cropped.height).toBeLessThan(100);
    const otherBranchEvent = store.analyticsEvents.find((event) => event.sourceEventId === "opening-report-a008")!;
    const forbiddenPhoto = await app.inject({ method: "GET",
      url: `/mis/branch-opening-failures/${otherBranchEvent.id}/photo` });
    expect(forbiddenPhoto.statusCode).toBe(404);

    const excluded = await app.inject({ method: "GET",
      url: "/mis/branch-opening-failures?timeRange=custom&startDate=2026-09-22&endDate=2026-09-22" });
    expect(excluded.json().rows).toEqual([]);
    const dateParts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(new Date()).map((part) => [part.type, part.value]));
    const today = `${dateParts.year}-${dateParts.month}-${dateParts.day}`;
    await store.processAnalyticsEvent({
      tenantId: "omsystems", cameraId: "cam-001", sourceEventId: "opening-report-today",
      detectionType: "dual-control-verification", occurredAt: new Date(`${today}T09:00:00+05:30`).toISOString(),
      confidence: 0.95, durationSeconds: 0, modelVersion: "test", objects: [],
      metadata: { violation: "BRANCH_OPENING_MINIMUM_STAFF", staffCount: 1 },
    });
    const daily = await app.inject({ method: "GET", url: "/mis/branch-opening-failures" });
    expect(daily.statusCode).toBe(200);
    expect(daily.json().startDate).toBe(today);
    expect(daily.json().endDate).toBe(today);
    expect(daily.json().rows.some((row: { occurredAt: string }) =>
      row.occurredAt === new Date(`${today}T09:00:00+05:30`).toISOString())).toBe(true);
    const forbidden = await app.inject({ method: "GET", url: "/mis/branch-opening-failures?branchId=A008" });
    expect(forbidden.statusCode).toBe(403);
  });

  it("reports first opening counts of one and three with their outcome and scoped photos", async () => {
    const rule = await openingRepository.createRule({
      tenantId: "omsystems", templateId: "tmpl-27-opening-staff-count",
      branchIds: ["A005"], detectorType: "person", name: "Opening count",
    });
    const snapshot = await sharp({ create: {
      width: 100, height: 100, channels: 3, background: "#334455",
    } }).jpeg().toBuffer();
    for (const [day, count] of [["2026-09-23", 1], ["2026-09-24", 3]] as const) {
      const occurredAt = `${day}T03:10:00.000Z`;
      const result = await store.processAnalyticsEvent({
        tenantId: "omsystems", cameraId: "cam-001", sourceEventId: `opening-${day}`,
        detectionType: "person-counting", occurredAt, confidence: 0.95,
        durationSeconds: 0, modelVersion: "test", objects: [],
        metadata: { personCount: count, snapshotBase64: snapshot.toString("base64") },
      });
      await openingRepository.claimBranchOpeningCheck({
        ruleId: rule.id, branchId: "A005", localDate: day, cameraId: "cam-001",
        personCount: count, occurredAt, sourceEventId: result.event.id,
        personBoundingBox: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
      });
    }
    const report = await app.inject({ method: "GET",
      url: "/mis/branch-openings?timeRange=custom&startDate=2026-09-23&endDate=2026-09-24" });
    expect(report.statusCode).toBe(200);
    expect(report.json().rows.map((row: { personCount: number; outcome: string }) =>
      [row.personCount, row.outcome])).toEqual([[3, "SUCCESS"], [1, "FAILED"]]);
    for (const row of report.json().rows) {
      const photo = await app.inject({ method: "GET", url: row.photoUrl.replace("/api/control/v1/reports", "") });
      expect(photo.statusCode).toBe(200);
      const frame = await sharp(photo.rawPayload).metadata();
      expect(frame.width).toBe(row.personCount === 1 ? 56 : 100);
    }
    const missing = await app.inject({ method: "GET",
      url: "/mis/branch-openings?timeRange=custom&startDate=2026-09-25&endDate=2026-09-25" });
    expect(missing.json().rows[0]).toMatchObject({ branchId: "A005", personCount: null,
      outcome: "NOT_RECORDED", photoUrl: null });
    const forbidden = await app.inject({ method: "GET", url: "/mis/branch-openings?branchId=A008" });
    expect(forbidden.statusCode).toBe(403);
  });

  it("filters opening observations by hierarchy, camera and location without leaking other branches", async () => {
    const camera = store.cameras.get("cam-001")!;
    const originalLocation = camera.locationType;
    camera.locationType = "branch-entrance";
    const period = "timeRange=custom&startDate=2026-09-23&endDate=2026-09-24";
    try {
      const response = await app.inject({ method: "GET", url: `/mis/branch-openings?${period}&cameraId=cam-001&locationType=branch-entrance` });
      expect(response.statusCode).toBe(200);
      expect(response.json().rows).toHaveLength(2);
      expect(response.json().rows.every((row: any) => row.cameraId === "cam-001" && row.locationType === "branch-entrance")).toBe(true);
      expect(response.json().filterOptions.cameras.every((option: any) => option.branchId === "A005" && option.locationType === "branch-entrance")).toBe(true);
      expect(response.json().filterOptions.branches.map((branch: any) => branch.id)).toEqual(["A005"]);
      const otherCamera = await app.inject({ method: "GET", url: `/mis/branch-openings?${period}&cameraId=cam-a005-01` });
      // First observations belong to cam-001; never relabel them as missing.
      expect(otherCamera.json().rows).toEqual([]);
      const otherLocation = await app.inject({ method: "GET", url: `/mis/branch-openings?${period}&locationType=parking-area` });
      expect(otherLocation.json().rows).toEqual([]);
      const missing = await app.inject({ method: "GET", url: "/mis/branch-openings?timeRange=custom&startDate=2026-09-25&endDate=2026-09-25&cameraId=cam-001" });
      expect(missing.json().rows[0]).toMatchObject({ outcome: "NOT_RECORDED", personCount: null, cameraId: null });
      const forbidden = await app.inject({ method: "GET", url: `/mis/branch-openings?${period}&cameraId=cam-a008-01` });
      expect(forbidden.statusCode).toBe(403);
      const general = await app.inject({ method: "GET", url: "/mis" });
      const filters = general.json().filterOptions;
      for (const [key, value] of Object.entries({ zone: filters.zones[0], region: filters.regions[0], area: filters.areas[0], branchId: "A005" }).filter(([, value]) => value !== undefined)) {
        const filtered = await app.inject({ method: "GET", url: `/mis/branch-openings?${period}&${key}=${encodeURIComponent(String(value))}` });
        expect(filtered.statusCode).toBe(200);
        expect(filtered.json().rows).toHaveLength(2);
        const excluded = await app.inject({ method: "GET", url: `/mis/branch-openings?${period}&${key}=non-matching-scope` });
        if (key === "branchId") expect(excluded.statusCode).toBe(403);
        else {
          expect(excluded.json().rows).toEqual([]);
          expect(excluded.json().filterOptions.branches).toEqual([]);
          expect(excluded.json().filterOptions.cameras).toEqual([]);
        }
      }
    } finally { camera.locationType = originalLocation; }
  });
});
