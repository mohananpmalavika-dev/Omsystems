import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { convertToCSV } from "../src/routes/reports.routes.js";
import { MemoryStore } from "../src/store.js";

describe("reports routes", () => {
  let app: FastifyInstance;
  let store: MemoryStore;
  const south = { "x-user-id": "user-south-operator" };
  const admin = { "x-user-id": "user-global-admin" };
  const now = "2026-08-30T08:00:00.000Z";

  beforeAll(async () => {
    store = new MemoryStore();
    await store.createIncident({
      tenantId: "omsystems",
      branchId: "A005",
      title: "Privacy disclosure detected",
      incidentType: "unauthorized-access",
      severity: "P1",
      detectionSource: "manual-operator",
      occurredAt: now,
      reportedBy: "user-global-admin",
    });
    await store.createIncident({
      tenantId: "omsystems",
      branchId: "A006",
      title: "West branch incident",
      incidentType: "network-outage",
      severity: "P2",
      detectionSource: "manual-operator",
      occurredAt: now,
      reportedBy: "user-global-admin",
    });
    await store.createIncident({
      tenantId: "omsystems",
      branchId: "A005",
      title: "Historical south incident",
      incidentType: "other",
      severity: "P4",
      detectionSource: "manual-operator",
      occurredAt: "2020-01-01T00:00:00.000Z",
      reportedBy: "user-global-admin",
    });
    app = await buildApp({ store });
  });

  afterAll(async () => app.close());

  it("keeps incident and activity data inside the caller's branch scope", async () => {
    const summary = await app.inject({
      method: "GET",
      url: "/v1/reports/summary/incidents",
      headers: south,
    });
    expect(summary.statusCode).toBe(200);
    expect(summary.json()).toMatchObject({
      incidentCount: 2,
      criticalIncidentCount: 1,
      truncated: false,
    });
    expect(summary.json().recentIncidents.every(
      (incident: { branchId: string }) => incident.branchId !== "A006",
    )).toBe(true);

    const activity = await app.inject({
      method: "GET",
      url: "/v1/reports/activity/summary?startDate=2026-08-30T00%3A00%3A00.000Z&endDate=2026-08-31T00%3A00%3A00.000Z",
      headers: south,
    });
    expect(activity.statusCode).toBe(200);
    expect(activity.json()).toMatchObject({ totalActivities: 1, peakHour: 8 });
    expect(activity.json().recentActivity).toHaveLength(1);
  });

  it("accepts real branch IDs and rejects inaccessible branch filters", async () => {
    const allowed = await app.inject({
      method: "GET",
      url: "/v1/reports/analytics/summary?branchId=A005",
      headers: south,
    });
    expect(allowed.statusCode).toBe(200);
    expect(allowed.json()).toMatchObject({ branchCount: 1, provenance: "REAL" });

    const denied = await app.inject({
      method: "GET",
      url: "/v1/reports/analytics/summary?branchId=A006",
      headers: south,
    });
    expect(denied.statusCode).toBe(404);
  });

  it("serves every advertised export type without placeholder 501 responses", async () => {
    const reportTypes = [
      "operations",
      "privacy",
      "incidents",
      "system-health",
      "analytics",
      "compliance",
      "maintenance",
      "activity",
    ];
    for (const reportType of reportTypes) {
      const response = await app.inject({
        method: "POST",
        url: "/v1/reports/export",
        headers: admin,
        payload: { reportType, format: "json" },
      });
      expect(response.statusCode, reportType).toBe(200);
      expect(response.json()).toMatchObject({ reportType });
    }

    const unsupported = await app.inject({
      method: "POST",
      url: "/v1/reports/export",
      headers: admin,
      payload: { reportType: "operations", format: "pdf" },
    });
    expect(unsupported.statusCode).toBe(400);
  });

  it("reports observed compliance and maintenance facts", async () => {
    const compliance = await app.inject({
      method: "GET",
      url: "/v1/reports/compliance/summary",
      headers: admin,
    });
    expect(compliance.statusCode).toBe(200);
    expect(compliance.json().dataProtection).toMatchObject({
      privacyIncidents: 1,
      criticalPrivacyIncidents: 1,
      lastAuditObservedAt: null,
    });

    const cameras = await Promise.all(
      (await store.listAccessibleNodes(await store.getUser("user-global-admin") as any, "device:configure", "branch"))
        .map(async (branch) => store.listCamerasByBranch(
          await store.getUser("user-global-admin") as any,
          branch.id,
          "device:configure",
        )),
    );
    const expectedOffline = cameras.flat().filter((camera) => camera.status === "offline").length;
    const maintenance = await app.inject({
      method: "GET",
      url: "/v1/reports/maintenance/summary",
      headers: admin,
    });
    expect(maintenance.statusCode).toBe(200);
    expect(maintenance.json()).toMatchObject({ provenance: "REAL" });
    expect(maintenance.json().maintenanceIssues.cameras.offline).toBe(expectedOffline);
  });
});

describe("report CSV serialization", () => {
  it("quotes cells, preserves nested data, and neutralizes spreadsheet formulas", () => {
    const csv = convertToCSV([{
      name: "=2+2",
      note: "value, with comma",
      nested: { status: "ok" },
    }]);
    expect(csv).toContain('"\'=2+2"');
    expect(csv).toContain('"value, with comma"');
    expect(csv).toContain('"nested.status"');
  });
});
