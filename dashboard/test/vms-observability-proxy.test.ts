import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET as GET_VMS } from "../app/api/vms/[...path]/route";
import { GET as GET_METRICS } from "../app/metrics/route";
import { middleware } from "../proxy";

const originalControlUrl = process.env.CONTROL_PLANE_INTERNAL_URL;
const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  vi.unstubAllGlobals();
  restore("CONTROL_PLANE_INTERNAL_URL", originalControlUrl);
  restore("NODE_ENV", originalNodeEnv);
});

describe("VMS Observability and Prometheus Metrics BFF handlers", () => {
  it("proxies /api/vms/observability/summary to upstream control plane", async () => {
    process.env.CONTROL_PLANE_INTERNAL_URL = "http://control.internal:8080";
    const mockSnapshot = {
      pipeline: { framesIngested: 100 },
      cameras: { total: 10 },
    };
    const upstream = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      Response.json({ success: true, data: mockSnapshot })
    );
    vi.stubGlobal("fetch", upstream);

    const request = new NextRequest("https://sentinel.example/api/vms/observability/summary", {
      headers: { cookie: "sentinel_access=valid-token" },
    });
    const response = await GET_VMS(request, {
      params: Promise.resolve({ path: ["observability", "summary"] }),
    });

    expect(response.status).toBe(200);
    const [url, init] = upstream.mock.calls[0]!;
    expect(String(url)).toBe("http://control.internal:8080/api/vms/observability/summary");
    const headers = new Headers(init?.headers);
    expect(headers.get("authorization")).toBe("Bearer valid-token");
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.data).toEqual(mockSnapshot);
  });

  it("falls back to /v1/observability/summary if /api/vms/observability/summary returns 404", async () => {
    process.env.CONTROL_PLANE_INTERNAL_URL = "http://control.internal:8080";
    const mockSnapshot = { ok: true };
    const upstream = vi.fn(async (input: RequestInfo | URL) => {
      const urlStr = String(input);
      if (urlStr.includes("/vms/")) {
        return new Response("Not found", { status: 404 });
      }
      return Response.json({ success: true, data: mockSnapshot });
    });
    vi.stubGlobal("fetch", upstream);

    const request = new NextRequest("https://sentinel.example/api/vms/observability/summary");
    const response = await GET_VMS(request, {
      params: Promise.resolve({ path: ["observability", "summary"] }),
    });

    expect(response.status).toBe(200);
    expect(upstream).toHaveBeenCalledTimes(3); // 1. /api/vms/..., 2. /v1/vms/..., 3. /v1/observability/...
    const data = await response.json();
    expect(data.data).toEqual(mockSnapshot);
  });

  it("proxies /metrics to upstream control plane and preserves Prometheus Content-Type", async () => {
    process.env.CONTROL_PLANE_INTERNAL_URL = "http://control.internal:8080";
    const prometheusText = "# HELP test_metric A test\n# TYPE test_metric counter\ntest_metric 42\n";
    const upstream = vi.fn(async (_input: RequestInfo | URL) =>
      new Response(prometheusText, {
        status: 200,
        headers: { "content-type": "text/plain; version=0.0.4; charset=utf-8" },
      })
    );
    vi.stubGlobal("fetch", upstream);

    const request = new NextRequest("https://sentinel.example/metrics");
    const response = await GET_METRICS(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/plain");
    expect(await response.text()).toBe(prometheusText);
  });

  it("middleware allows /metrics without redirecting to /login", () => {
    const request = new NextRequest("https://sentinel.example/metrics");
    const res = middleware(request);
    expect(res.status).toBe(200);
  });
});

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
