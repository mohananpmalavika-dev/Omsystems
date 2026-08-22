/**
 * Test Suite: Compatibility Lab REST API Routes
 *
 * Covers:
 *  - GET /matrix — returns seeded entries, pagination
 *  - GET /matrix/export — returns valid JSON snapshot with checksum
 *  - GET /matrix/export/md — returns Markdown
 *  - GET /matrix/vendor/:vendor — filters by vendor
 *  - GET /matrix/:id — happy path + 404
 *  - POST /matrix — creates new entry (201), conflict (409), validation (400)
 *  - PUT /matrix/:id/result — updates feature result, 404
 *  - POST /run-test — triggers offline lab run, returns LabRunResult
 */

import { describe, it, expect, beforeEach } from "vitest";
import Fastify from "fastify";
import { registerCompatibilityLabRoutes } from "../../src/routes/compatibility-lab.routes.js";
import { _resetLabMatrixStore } from "../../src/compatibility-lab/services/lab-matrix.store.js";

// ─── Setup ────────────────────────────────────────────────────────────────────

async function buildApp() {
  const app = Fastify({ logger: false });
  await registerCompatibilityLabRoutes(app);
  await app.ready();
  return app;
}

// ─── Test Fixtures ────────────────────────────────────────────────────────────

const validTarget = {
  vendor: "HIKVISION",
  modelId: "DS-TestCam-001",
  firmwareVersion: "V9.99.00 test",
  generation: "Test Series",
  deviceClass: "IP_CAMERA",
  authModes: ["DIGEST"],
  codecSupport: [{ codec: "H264", resolutions: ["1920x1080"] }],
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Compatibility Lab Routes", () => {
  beforeEach(() => {
    _resetLabMatrixStore();
  });

  // ── GET /matrix ───────────────────────────────────────────────────────────

  it("GET /matrix returns seeded entries", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/api/v1/compatibility-lab/matrix" });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.entries).toBeInstanceOf(Array);
    expect(body.total).toBeGreaterThan(0); // seeded from KNOWN_DEVICES
    expect(body.page).toBe(1);
    expect(body.limit).toBe(50);
    await app.close();
  });

  it("GET /matrix filters by vendor=CP_PLUS", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/compatibility-lab/matrix?vendor=CP_PLUS",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.entries.every((e: { target: { vendor: string } }) => e.target.vendor === "CP_PLUS")).toBe(true);
    await app.close();
  });

  it("GET /matrix supports pagination", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/compatibility-lab/matrix?page=1&limit=2",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.entries.length).toBeLessThanOrEqual(2);
    await app.close();
  });

  // ── GET /matrix/export ────────────────────────────────────────────────────

  it("GET /matrix/export returns a valid snapshot with checksum", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/compatibility-lab/matrix/export",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.schemaVersion).toBe(1);
    expect(body.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(body.entries).toBeInstanceOf(Array);
    await app.close();
  });

  // ── GET /matrix/export/md ─────────────────────────────────────────────────

  it("GET /matrix/export/md returns Markdown text", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/compatibility-lab/matrix/export/md",
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/markdown");
    expect(res.body).toContain("# Sentinel Grid Hardware Compatibility Matrix");
    expect(res.body).toContain("CERTIFIED");
    await app.close();
  });

  // ── GET /matrix/vendor/:vendor ────────────────────────────────────────────

  it("GET /matrix/vendor/DAHUA returns only Dahua entries", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/compatibility-lab/matrix/vendor/DAHUA",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.vendor).toBe("DAHUA");
    expect(body.entries.every((e: { target: { vendor: string } }) => e.target.vendor === "DAHUA")).toBe(true);
    await app.close();
  });

  it("GET /matrix/vendor/INVALID returns 400", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/compatibility-lab/matrix/vendor/BOGUS_VENDOR",
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("invalid_vendor");
    await app.close();
  });

  // ── GET /matrix/:id ───────────────────────────────────────────────────────

  it("GET /matrix/:id returns a known seeded entry", async () => {
    const app = await buildApp();
    // Get the ID of a seeded entry
    const listRes = await app.inject({ method: "GET", url: "/api/v1/compatibility-lab/matrix?limit=1" });
    const { entries } = listRes.json();
    const id = entries[0].id;

    const res = await app.inject({ method: "GET", url: `/api/v1/compatibility-lab/matrix/${id}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().id).toBe(id);
    await app.close();
  });

  it("GET /matrix/:id returns 404 for unknown id", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/compatibility-lab/matrix/does-not-exist",
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("not_found");
    await app.close();
  });

  // ── POST /matrix ──────────────────────────────────────────────────────────

  it("POST /matrix creates a new UNTESTED entry", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/compatibility-lab/matrix",
      payload: { target: validTarget },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.target.modelId).toBe("DS-TestCam-001");
    expect(body.overallRating).toBe("UNTESTED");
    await app.close();
  });

  it("POST /matrix returns 409 on duplicate", async () => {
    const app = await buildApp();
    await app.inject({
      method: "POST",
      url: "/api/v1/compatibility-lab/matrix",
      payload: { target: validTarget },
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/compatibility-lab/matrix",
      payload: { target: validTarget },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe("conflict");
    await app.close();
  });

  it("POST /matrix returns 400 on missing required fields", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/compatibility-lab/matrix",
      payload: { target: { vendor: "HIKVISION" } }, // missing required fields
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("validation_failed");
    await app.close();
  });

  // ── PUT /matrix/:id/result ────────────────────────────────────────────────

  it("PUT /matrix/:id/result updates a feature and recomputes rating", async () => {
    const app = await buildApp();
    // Create an entry
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v1/compatibility-lab/matrix",
      payload: { target: validTarget },
    });
    const { id } = createRes.json();

    // Update LIVE feature
    const res = await app.inject({
      method: "PUT",
      url: `/api/v1/compatibility-lab/matrix/${id}/result`,
      payload: {
        feature: "LIVE",
        status: "PASS",
        authMode: "DIGEST",
        codec: "H264",
        resolution: "1920x1080",
        latencyMs: 215,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.results.LIVE.status).toBe("PASS");
    await app.close();
  });

  it("PUT /matrix/:id/result returns 404 for unknown id", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "PUT",
      url: "/api/v1/compatibility-lab/matrix/unknown-id/result",
      payload: { feature: "LIVE", status: "PASS" },
    });

    expect(res.statusCode).toBe(404);
    await app.close();
  });

  // ── POST /run-test ────────────────────────────────────────────────────────

  it("POST /run-test triggers an offline lab run and returns results", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/compatibility-lab/run-test",
      payload: {
        target: {
          vendor: "DAHUA",
          modelId: "DHI-NVR4116HS-4KS3",
          firmwareVersion: "V4.000.0000000.0 build 240601",
          generation: "4KS3-Gen4",
          deviceClass: "NVR",
          channels: 16,
          authModes: ["DIGEST"],
          codecSupport: [{ codec: "H265", resolutions: ["3840x2160"] }],
        },
        features: ["LIVE", "SUBSTREAM", "EVENTS"],
        connection: {
          host: "192.168.100.5",
          httpPort: 80,
          rtspPort: 554,
          username: "admin",
          password: "Admin123!",
        },
        offline: true,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.runId).toBeDefined();
    expect(body.results).toHaveLength(3);
    expect(body.overallRating).toBeDefined();
    expect(body.durationMs).toBeGreaterThanOrEqual(0);
    await app.close();
  });

  it("POST /run-test returns 400 on invalid payload", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/compatibility-lab/run-test",
      payload: { target: {}, connection: {} }, // invalid
    });

    expect(res.statusCode).toBe(400);
    await app.close();
  });
});
