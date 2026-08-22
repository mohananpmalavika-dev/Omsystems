/**
 * CEO Screen Routes — REST & Integration Test Suite
 *
 * Tests:
 *  1. GET /api/v1/ceo-screen (Master Snapshot)
 *  2. GET /api/v1/ceo-screen/what-is-broken
 *  3. GET /api/v1/ceo-screen/what-will-break
 *  4. GET /api/v1/ceo-screen/why
 *  5. GET /api/v1/ceo-screen/business-impact
 *  6. GET /api/v1/ceo-screen/actions
 *  7. POST /api/v1/ceo-screen/actions/:actionId/execute (1-click execution)
 *  8. POST /api/v1/ceo-screen/reset
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify from "fastify";
import { registerCeoScreenRoutes } from "../../src/routes/ceo-screen.routes.js";
import { ceoScreenEngine } from "../../src/ceo-command-center/services/ceo-screen-engine.js";

async function buildApp() {
  const app = Fastify({ logger: false });
  await registerCeoScreenRoutes(app);
  return app;
}

describe("CEO Screen REST API Suite", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    ceoScreenEngine.seedDefaultExecutiveState();
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /api/v1/ceo-screen returns the complete master snapshot with 5 answers", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/ceo-screen" });
    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(body).toHaveProperty("whatIsBroken");
    expect(body).toHaveProperty("whatWillBreak");
    expect(body).toHaveProperty("why");
    expect(body).toHaveProperty("businessImpact");
    expect(body).toHaveProperty("whatShouldIDo");

    expect(body.whatIsBroken.summaryHeadline).toBe("27 branches degraded");
    expect(body.whatWillBreak.summaryHeadline).toBe("8 branches high risk within 72 hours");
    expect(body.businessImpact.summaryHeadline).toContain("63 cameras / 11 branches / 4 compliance risks");
  });

  it("GET /api/v1/ceo-screen/what-is-broken returns question 1 payload", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/ceo-screen/what-is-broken" });
    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(body.summaryHeadline).toBe("27 branches degraded");
    expect(body.degradedBranchesCount).toBe(27);
    expect(Array.isArray(body.degradedBranches)).toBe(true);
    expect(body.degradedBranches).toHaveLength(27);
  });

  it("GET /api/v1/ceo-screen/what-will-break returns question 2 payload", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/ceo-screen/what-will-break" });
    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(body.summaryHeadline).toBe("8 branches high risk within 72 hours");
    expect(body.highRiskBranchesCount).toBeGreaterThan(0);
    expect(Array.isArray(body.predictions)).toBe(true);
    expect(body.predictions).toHaveLength(8);
  });

  it("GET /api/v1/ceo-screen/why returns question 3 root cause attributions", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/ceo-screen/why" });
    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(body.attributions).toHaveLength(5);
    expect(body.dominantCause).toBe("HDD");
    expect(body.summaryHeadline).toContain("Primary Driver:");
  });

  it("GET /api/v1/ceo-screen/business-impact returns question 4 impact summary", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/ceo-screen/business-impact" });
    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(body.totalCamerasAffected).toBe(63);
    expect(body.criticalBranchesImpacted).toBe(11);
    expect(body.activeComplianceRisksCount).toBe(4);
    expect(Array.isArray(body.complianceRisks)).toBe(true);
  });

  it("GET /api/v1/ceo-screen/actions returns question 5 prescriptive actions", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/ceo-screen/actions" });
    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(body.summaryHeadline).toContain("Replace 4 HDDs");
    expect(body.immediateActionsCount).toBeGreaterThanOrEqual(3);
    expect(Array.isArray(body.actions)).toBe(true);
  });

  it("POST /api/v1/ceo-screen/actions/:actionId/execute executes 1-click remediation", async () => {
    const actionsRes = await app.inject({ method: "GET", url: "/api/v1/ceo-screen/actions" });
    const actionsBody = actionsRes.json();
    const targetAction = actionsBody.actions[0];

    const execRes = await app.inject({
      method: "POST",
      url: `/api/v1/ceo-screen/actions/${targetAction.actionId}/execute`,
      payload: { operatorId: "ceo-test" },
    });

    expect(execRes.statusCode).toBe(200);
    const execBody = execRes.json();
    expect(execBody.success).toBe(true);
    expect(execBody.action.status).toBe("COMPLETED");
    expect(execBody.action.executedBy).toBe("ceo-test");
  });

  it("POST /api/v1/ceo-screen/actions/invalid-id/execute returns 404", async () => {
    const execRes = await app.inject({
      method: "POST",
      url: `/api/v1/ceo-screen/actions/INVALID-ACTION-ID/execute`,
      payload: { operatorId: "ceo-test" },
    });

    expect(execRes.statusCode).toBe(404);
    const execBody = execRes.json();
    expect(execBody.success).toBe(false);
  });

  it("POST /api/v1/ceo-screen/reset restores baseline state", async () => {
    const resetRes = await app.inject({ method: "POST", url: "/api/v1/ceo-screen/reset" });
    expect(resetRes.statusCode).toBe(200);
    const resetBody = resetRes.json();
    expect(resetBody.success).toBe(true);

    const checkRes = await app.inject({ method: "GET", url: "/api/v1/ceo-screen/what-is-broken" });
    expect(checkRes.json().degradedBranchesCount).toBe(27);
  });
});
