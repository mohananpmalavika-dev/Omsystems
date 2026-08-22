/**
 * SLO REST API Integration Tests
 *
 * Tests:
 *  1. GET /api/v1/slo — full report structure
 *  2. GET /api/v1/slo/definitions — catalogue has all 11 SLOs
 *  3. GET /api/v1/slo/violations — empty when no budget exhausted
 *  4. GET /api/v1/slo/:sloId — single SLO window
 *  5. POST /api/v1/slo/record → GET /api/v1/slo/:sloId round-trip
 *  6. GET /api/v1/slo/:sloId — 404 for unknown ID
 *  7. POST /api/v1/slo/record — 400 for unknown SLO
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify from "fastify";
import { registerSloRoutes } from "../../src/routes/slo.routes.js";
import { sloEngine } from "../../src/slo/slo-measurement-engine.js";

async function buildApp() {
  const app = Fastify({ logger: false });
  await registerSloRoutes(app);
  return app;
}

describe("SLO REST API Suite", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    sloEngine.clearAll();
    app = await buildApp();
  });

  afterAll(async () => {
    sloEngine.clearAll();
    await app.close();
  });

  // ── 1. Full Report ───────────────────────────────────────────────────────

  it("GET /api/v1/slo — returns a well-formed SLO report", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/slo" });
    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(body).toHaveProperty("generatedAt");
    expect(body).toHaveProperty("overall");
    expect(["ALL_GREEN", "WARNING", "BREACH"]).toContain(body.overall);
    expect(Array.isArray(body.slos)).toBe(true);
    expect(Array.isArray(body.violations)).toBe(true);
    expect(Array.isArray(body.errorBudgetSummary)).toBe(true);
    // 11 SLOs should be present in every report
    expect(body.slos).toHaveLength(11);
  });

  // ── 2. Definition Catalogue ───────────────────────────────────────────────

  it("GET /api/v1/slo/definitions — returns catalogue with 11 SLOs", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/slo/definitions" });
    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(body.total).toBe(11);
    expect(Array.isArray(body.definitions)).toBe(true);
    expect(body.definitions).toHaveLength(11);

    // Each entry should have the expected fields
    for (const def of body.definitions) {
      expect(def).toHaveProperty("id");
      expect(def).toHaveProperty("name");
      expect(def).toHaveProperty("kind");
      expect(def).toHaveProperty("target");
      expect(def).toHaveProperty("window");
      expect(def).toHaveProperty("errorBudget");
      expect(def).toHaveProperty("description");
    }

    // Verify contractual targets appear in the formatted catalogue
    const reconnect = body.definitions.find((d: { id: string }) => d.id === "CAMERA_RECONNECT_P50");
    expect(reconnect).toBeDefined();
    expect(reconnect.target).toContain("10.0");

    const auditLoss = body.definitions.find((d: { id: string }) => d.id === "CRITICAL_AUDIT_LOSS");
    expect(auditLoss.errorBudget).toContain("zero");
  });

  // ── 3. Violations (empty) ─────────────────────────────────────────────────

  it("GET /api/v1/slo/violations — returns empty list when no budgets exhausted", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/slo/violations" });
    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(body.violations).toHaveLength(0);
    expect(body.count).toBe(0);
  });

  // ── 4. Single SLO Window ──────────────────────────────────────────────────

  it("GET /api/v1/slo/TIMELINE_QUERY — returns window for a specific SLO", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/slo/TIMELINE_QUERY" });
    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(body.definition.id).toBe("TIMELINE_QUERY");
    expect(body.definition.targetMs).toBe(1_000);
    expect(body.definition.kind).toBe("LATENCY_P50_MS");
    expect(body.window).toHaveProperty("status");
    expect(body.window).toHaveProperty("totalSamples");
    expect(body.window).toHaveProperty("errorBudgetRemainingPct");
  });

  // ── 5. Record → Query Round-Trip ─────────────────────────────────────────

  it("POST /api/v1/slo/record → GET updates the SLO window", async () => {
    // Record 10 good PLAYBACK_STARTUP samples via API
    for (let i = 0; i < 10; i++) {
      const rec = await app.inject({
        method: "POST",
        url: "/api/v1/slo/record",
        payload: {
          sloId: "PLAYBACK_STARTUP",
          valueMs: 900,
          success: true,
        },
      });
      expect(rec.statusCode).toBe(201);
    }

    // Now query the SLO
    const res = await app.inject({ method: "GET", url: "/api/v1/slo/PLAYBACK_STARTUP" });
    const body = res.json();
    expect(body.window.totalSamples).toBeGreaterThanOrEqual(10);
    expect(body.window.goodSamples).toBeGreaterThanOrEqual(10);
    expect(body.window.badSamples).toBe(0);
    expect(body.window.status).toBe("OK");
  });

  it("POST /api/v1/slo/record with bad sample updates violation status", async () => {
    sloEngine.clearSlo("CRITICAL_AUDIT_LOSS");

    // Record 9 good samples
    for (let i = 0; i < 9; i++) {
      await app.inject({
        method: "POST",
        url: "/api/v1/slo/record",
        payload: { sloId: "CRITICAL_AUDIT_LOSS", success: true },
      });
    }

    // Record 1 bad sample
    const badRec = await app.inject({
      method: "POST",
      url: "/api/v1/slo/record",
      payload: { sloId: "CRITICAL_AUDIT_LOSS", success: false },
    });
    expect(badRec.statusCode).toBe(201);
    const recBody = badRec.json();
    expect(recBody.window.status).toBe("BREACH");

    // Violations endpoint now returns this SLO
    const vRes = await app.inject({ method: "GET", url: "/api/v1/slo/violations" });
    const vBody = vRes.json();
    expect(vBody.count).toBeGreaterThanOrEqual(1);
    expect(vBody.violations.some((v: { sloId: string }) => v.sloId === "CRITICAL_AUDIT_LOSS")).toBe(true);
  });

  // ── 6. 404 for Unknown SLO ────────────────────────────────────────────────

  it("GET /api/v1/slo/DOES_NOT_EXIST — returns 404", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/slo/DOES_NOT_EXIST" });
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.error).toBe("SLO_NOT_FOUND");
    expect(Array.isArray(body.validIds)).toBe(true);
  });

  // ── 7. 400 for Unknown SLO in Record ─────────────────────────────────────

  it("POST /api/v1/slo/record with unknown sloId — returns 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/slo/record",
      payload: { sloId: "NOT_A_REAL_SLO", valueMs: 500, success: true },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toBe("UNKNOWN_SLO_ID");
  });
});
