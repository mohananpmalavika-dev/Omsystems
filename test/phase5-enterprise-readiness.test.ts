import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { MemoryStore } from "../src/store.js";
import { runProgressiveScale } from "../load-testing/src/phase1-control-plane.js";

describe("Phase 5 enterprise readiness controls", () => {
  let app: FastifyInstance | undefined;
  let output: string | undefined;
  afterEach(async () => { if (app) await app.close(); if (output) await rm(output, { recursive: true, force: true }); app=undefined;output=undefined; });

  it("exposes readiness, measured Prometheus metrics and hardened response headers", async () => {
    app=await buildApp({store:new MemoryStore(),maxInFlightRequests:20});
    await app.inject({method:"GET",url:"/v1/operations/health/summary",headers:{"x-user-id":"user-global-admin"}});
    const ready=await app.inject({method:"GET",url:"/ready"});expect(ready.statusCode).toBe(200);expect(ready.json()).toMatchObject({status:"ready",database:"memory"});
    const metrics=await app.inject({method:"GET",url:"/metrics"});expect(metrics.statusCode).toBe(200);expect(metrics.body).toContain("sentinel_http_requests_total");expect(metrics.body).toContain("sentinel_http_latency_milliseconds");expect(metrics.headers["x-content-type-options"]).toBe("nosniff");expect(metrics.headers["x-frame-options"]).toBe("DENY");
  });

  it("fails closed on development credentials in production", () => {
    expect(()=>loadConfig({NODE_ENV:"production",AUTH_MODE:"development"})).toThrow();
    expect(()=>loadConfig({NODE_ENV:"production",AUTH_MODE:"oidc",MEDIA_GATEWAY_SHARED_KEY:"development-media-gateway-key-change-me",REPORT_DOWNLOAD_SECRET:"01234567890123456789012345678901"})).toThrow();
  });

  it("executes the real API contracts and records measured progressive-stage evidence", async () => {
    output=await mkdtemp(join(tmpdir(),"sentinel-phase5-"));app=await buildApp({store:new MemoryStore(),reportExportRoot:output});await app.listen({host:"127.0.0.1",port:0});const address=app.server.address();if(!address||typeof address==="string")throw new Error("test_server_address_unavailable");
    const evidence=await runProgressiveScale({baseUrl:`http://127.0.0.1:${address.port}`,userId:"user-global-admin",provision:false,stages:[{branches:1,durationSeconds:1}],targetCameras:2,dashboardUsers:2,maxConcurrency:10,outputDirectory:output,runLargeExport:false});
    expect(evidence.inventory.branches).toBeGreaterThanOrEqual(1);expect(evidence.inventory.cameras).toBeGreaterThanOrEqual(2);expect(evidence.stages[0]?.requests).toBeGreaterThan(0);expect(evidence.stages[0]?.p95Ms).toBeGreaterThanOrEqual(0);expect(evidence.certification.endurance24hExecuted).toBe(false);expect(evidence.certification.productionCertified).toBe(false);
  },15_000);
});
