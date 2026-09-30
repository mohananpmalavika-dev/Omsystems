import { afterAll, describe, expect, it } from "vitest";
import Fastify from "fastify";
import type { Pool } from "pg";
import sharp from "sharp";
import { MemoryStore } from "../src/store.js";
import { createMISUnifiedRoutes } from "../src/routes/reports/mis-unified.routes.js";

describe("MIS report branch permissions", () => {
  const store = new MemoryStore();
  const app = Fastify();
  const pool = { query: async () => ({ rows: [] }) } as unknown as Pool;

  app.addHook("preHandler", async (request) => {
    request.currentUser = (await store.getUser("user-branch-manager"))!;
  });
  createMISUnifiedRoutes(app, pool, store);
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
    expect(response.json().rows[0].zoneName).toBeTruthy();
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
});
