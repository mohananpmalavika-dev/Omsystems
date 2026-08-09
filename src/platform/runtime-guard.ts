import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

type Sample = { route: string; method: string; status: number; durationMs: number };

export class RuntimeGuard {
  private inFlight = 0;
  private rejected = 0;
  private total = 0;
  private readonly started = new WeakMap<FastifyRequest, number>();
  private readonly admitted = new WeakSet<FastifyRequest>();
  private readonly samples: Sample[] = [];

  constructor(private readonly maxInFlight = 500, private readonly maxSamples = 20_000) {}

  register(app: FastifyInstance) {
    app.addHook("onRequest", async (request, reply) => {
      this.started.set(request, performance.now());
      if (this.inFlight >= this.maxInFlight) {
        this.rejected += 1;
        return reply.header("retry-after", "1").code(503).send({ error: "control_plane_backpressure", retryAfterSeconds: 1 });
      }
      this.inFlight += 1;
      this.admitted.add(request);
    });
    app.addHook("onResponse", async (request, reply) => this.complete(request, reply));
    app.addHook("onSend", async (_request, reply, payload) => {
      reply.header("x-content-type-options", "nosniff");
      reply.header("x-frame-options", "DENY");
      reply.header("referrer-policy", "no-referrer");
      reply.header("permissions-policy", "camera=(), microphone=(), geolocation=()");
      reply.header("content-security-policy", "default-src 'none'; frame-ancestors 'none'");
      return payload;
    });
  }

  snapshot() {
    const durations = this.samples.map((item) => item.durationMs).sort((a, b) => a - b);
    return { inFlight: this.inFlight, maxInFlight: this.maxInFlight, totalRequests: this.total, rejectedRequests: this.rejected,
      p50Ms: percentile(durations, 0.5), p95Ms: percentile(durations, 0.95), p99Ms: percentile(durations, 0.99) };
  }

  prometheus() {
    const snapshot = this.snapshot();
    const groups = new Map<string, number>();
    for (const item of this.samples) {
      const key = `${safe(item.method)}|${safe(item.route)}|${item.status}`;
      groups.set(key, (groups.get(key) ?? 0) + 1);
    }
    const lines = [
      "# HELP sentinel_http_requests_total Requests observed by this process.",
      "# TYPE sentinel_http_requests_total counter",
      ...[...groups].map(([key, count]) => { const [method, route, status] = key.split("|"); return `sentinel_http_requests_total{method="${method}",route="${route}",status="${status}"} ${count}`; }),
      "# HELP sentinel_http_in_flight Current requests in flight.", "# TYPE sentinel_http_in_flight gauge", `sentinel_http_in_flight ${snapshot.inFlight}`,
      "# HELP sentinel_http_backpressure_rejections_total Requests rejected by the concurrency guard.", "# TYPE sentinel_http_backpressure_rejections_total counter", `sentinel_http_backpressure_rejections_total ${snapshot.rejectedRequests}`,
      "# HELP sentinel_http_latency_milliseconds Recent process latency quantiles.", "# TYPE sentinel_http_latency_milliseconds gauge",
      `sentinel_http_latency_milliseconds{quantile="0.50"} ${snapshot.p50Ms}`,
      `sentinel_http_latency_milliseconds{quantile="0.95"} ${snapshot.p95Ms}`,
      `sentinel_http_latency_milliseconds{quantile="0.99"} ${snapshot.p99Ms}`,
    ];

    // Append global metrics from other parts of the process if available.
    try {
      // Import lazily to avoid circular imports during startup.
      // metrics.ts lives in the same folder and exports getGlobalMetricsLines().
      // Use a runtime import so TypeScript compilation to .js keeps behavior consistent.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { getGlobalMetricsLines } = require('./metrics.js');
      if (typeof getGlobalMetricsLines === 'function') {
        const extra = getGlobalMetricsLines();
        if (Array.isArray(extra) && extra.length > 0) lines.push(...extra);
      }
    } catch (err) {
      // If metrics module isn't available or fails, keep serving the core metrics only.
    }

    return `${lines.join("\n")}\n`;
  }

  private complete(request: FastifyRequest, reply: FastifyReply) {
    const started = this.started.get(request);
    if (started === undefined) return;
    if (this.admitted.has(request)) this.inFlight = Math.max(0, this.inFlight - 1);
    this.total += 1;
    this.samples.push({ route: request.routeOptions.url ?? "unmatched", method: request.method, status: reply.statusCode, durationMs: performance.now() - started });
    if (this.samples.length > this.maxSamples) this.samples.splice(0, this.samples.length - this.maxSamples);
  }
}

function percentile(values: number[], quantile: number) {
  if (!values.length) return 0;
  return Math.round(values[Math.min(values.length - 1, Math.ceil(values.length * quantile) - 1)]! * 100) / 100;
}
function safe(value: string) { return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("\n", ""); }
