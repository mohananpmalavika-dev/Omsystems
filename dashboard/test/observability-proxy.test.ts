import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "../app/api/observability/[...path]/route";

const originalControlPlaneUrl = process.env.CONTROL_PLANE_INTERNAL_URL;

afterEach(() => {
  vi.restoreAllMocks();
  if (originalControlPlaneUrl === undefined) delete process.env.CONTROL_PLANE_INTERNAL_URL;
  else process.env.CONTROL_PLANE_INTERNAL_URL = originalControlPlaneUrl;
});

describe("observability performance dashboard proxy", () => {
  it("forwards performance requests to the control plane with the session token", async () => {
    process.env.CONTROL_PLANE_INTERNAL_URL = "http://control.internal:8080";
    const upstream = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { status: "healthy" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const request = new NextRequest("http://dashboard.test/api/observability/performance/health?tenant=one", {
      headers: { cookie: "sentinel_access=access-token" },
    });

    const response = await GET(request, { params: Promise.resolve({ path: ["performance", "health"] }) });

    expect(response.status).toBe(200);
    expect(upstream).toHaveBeenCalledWith(
      "http://control.internal:8080/api/observability/performance/health?tenant=one",
      expect.objectContaining({
        method: "GET",
        headers: expect.any(Headers),
        cache: "no-store",
      }),
    );
    const headers = upstream.mock.calls[0]?.[1]?.headers as Headers;
    expect(headers.get("authorization")).toBe("Bearer access-token");
  });

  it("does not proxy unknown observability paths", async () => {
    const upstream = vi.spyOn(globalThis, "fetch");
    const request = new NextRequest("http://dashboard.test/api/observability/admin/secrets");

    const response = await GET(request, { params: Promise.resolve({ path: ["admin", "secrets"] }) });

    expect(response.status).toBe(404);
    expect(upstream).not.toHaveBeenCalled();
  });
});
