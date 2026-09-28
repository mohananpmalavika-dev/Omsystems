import { describe, expect, it } from "vitest";
import Fastify from "fastify";
import { RuntimeGuard } from "../../src/platform/runtime-guard.js";

describe("RuntimeGuard Concurrency & Backpressure Controller", () => {
  it("enforces backpressure when inFlight reaches maxInFlight limit", async () => {
    const guard = new RuntimeGuard(2);
    const app = Fastify();
    guard.register(app);

    let releaseFirst: () => void = () => {};
    let releaseSecond: () => void = () => {};

    const firstPromise = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const secondPromise = new Promise<void>((resolve) => { releaseSecond = resolve; });

    app.get("/slow-1", async () => {
      await firstPromise;
      return { ok: 1 };
    });
    app.get("/slow-2", async () => {
      await secondPromise;
      return { ok: 2 };
    });
    app.get("/test", async () => {
      return { ok: true };
    });

    await app.ready();

    // Start 2 slow requests to saturate concurrency (maxInFlight = 2)
    const req1 = app.inject({ method: "GET", url: "/slow-1" });
    const req2 = app.inject({ method: "GET", url: "/slow-2" });

    // Allow requests to reach onRequest hook
    await new Promise((r) => setTimeout(r, 10));

    expect(guard.snapshot().inFlight).toBe(2);

    // 3rd request should be rejected immediately under backpressure
    const rejectedReq = await app.inject({ method: "GET", url: "/test" });
    expect(rejectedReq.statusCode).toBe(503);
    const body = rejectedReq.json();
    expect(body.error).toBe("control_plane_backpressure");
    expect(body.retryAfterSeconds).toBe(1);
    expect(rejectedReq.headers["retry-after"]).toBe("1");
    expect(guard.snapshot().rejectedRequests).toBe(1);

    // Release slow requests
    releaseFirst();
    releaseSecond();
    await Promise.all([req1, req2]);

    expect(guard.snapshot().inFlight).toBe(0);

    // After release, new requests succeed
    const subsequentReq = await app.inject({ method: "GET", url: "/test" });
    expect(subsequentReq.statusCode).toBe(200);
    expect(subsequentReq.json()).toEqual({ ok: true });

    await app.close();
  });

  it("bypasses health, readiness, and metrics endpoints under backpressure", async () => {
    const guard = new RuntimeGuard(1);
    const app = Fastify();
    guard.register(app);

    let release: () => void = () => {};
    const hold = new Promise<void>((resolve) => { release = resolve; });

    app.get("/busy", async () => {
      await hold;
      return { ok: true };
    });
    app.get("/health", async () => ({ status: "ok" }));
    app.get("/ready", async () => ({ status: "ready" }));
    app.get("/metrics", async () => "metrics_ok");

    await app.ready();

    // Saturate with 1 busy request
    const busyReq = app.inject({ method: "GET", url: "/busy" });
    await new Promise((r) => setTimeout(r, 10));

    expect(guard.snapshot().inFlight).toBe(1);

    // Probes must NOT be rejected by backpressure
    const health = await app.inject({ method: "GET", url: "/health" });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toEqual({ status: "ok" });

    const ready = await app.inject({ method: "GET", url: "/ready" });
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toEqual({ status: "ready" });

    const metrics = await app.inject({ method: "GET", url: "/metrics" });
    expect(metrics.statusCode).toBe(200);

    release();
    await busyReq;
    await app.close();
  });

  it("does not count long-lived SSE / streaming connections against inFlight concurrency", async () => {
    const guard = new RuntimeGuard(1);
    const app = Fastify();
    guard.register(app);

    let closeStream: () => void = () => {};
    const holdStream = new Promise<void>((resolve) => { closeStream = resolve; });

    app.get("/v1/operations/events", async (request, reply) => {
      reply.raw.setHeader("content-type", "text/event-stream");
      await holdStream;
      return "event: close\n\n";
    });

    app.get("/api/normal", async () => ({ data: "value" }));

    await app.ready();

    // Start streaming connection
    const streamReq = app.inject({
      method: "GET",
      url: "/v1/operations/events",
      headers: { accept: "text/event-stream" },
    });
    await new Promise((r) => setTimeout(r, 10));

    // Streaming connection should NOT consume the 1 available inFlight slot
    expect(guard.snapshot().inFlight).toBe(0);

    // Normal API request can proceed smoothly
    const normalReq = await app.inject({ method: "GET", url: "/api/normal" });
    expect(normalReq.statusCode).toBe(200);
    expect(normalReq.json()).toEqual({ data: "value" });

    closeStream();
    await streamReq;
    await app.close();
  });
});
