import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "../app/api/digital-twin/topology/route";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("digital twin topology route", () => {
  it("combines accessible branch graphs through the authenticated dashboard BFF", async () => {
    const upstream = vi.fn()
      .mockResolvedValueOnce(Response.json({ data: [{ id: "branch-1" }] }))
      .mockResolvedValueOnce(Response.json({
        success: true,
        data: {
          branchId: "branch-1",
          nodes: [
            { deviceId: "cam-1", deviceType: "camera", deviceName: "Front door", healthScore: 96, status: "healthy", evidenceQuality: "verified" },
            { deviceId: "switch-1", deviceType: "switch", deviceName: "PoE switch", healthScore: 74, status: "warning", evidenceQuality: "verified" },
          ],
          edges: [{ sourceId: "cam-1", targetId: "switch-1", relation: "connected_to" }],
        },
      }));
    vi.stubGlobal("fetch", upstream);

    const response = await GET(new NextRequest(
      "https://dashboard.example/api/digital-twin/topology",
      { headers: { cookie: "sentinel_access=employee-token" } },
    ));

    expect(String(upstream.mock.calls[0]?.[0])).toBe("https://dashboard.example/api/control/v1/branches");
    expect(String(upstream.mock.calls[1]?.[0])).toBe("https://dashboard.example/api/control/v1/infrastructure/graph/branch-1");
    const firstHeaders = new Headers(upstream.mock.calls[0]?.[1]?.headers);
    expect(firstHeaders.get("cookie")).toBe("sentinel_access=employee-token");

    expect(await response.json()).toMatchObject({
      totalAssets: 2,
      healthySummary: { healthy: 1, warning: 1, critical: 0, offline: 0, unknown: 0 },
      nodes: [
        { id: "branch-1:cam-1", type: "camera", status: "healthy" },
        { id: "branch-1:switch-1", type: "switch", status: "warning" },
      ],
      edges: [{ source: "branch-1:cam-1", target: "branch-1:switch-1", criticality: "medium" }],
    });
  });

  it("preserves an authorization error from the branch listing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(
      { error: "forbidden", message: "Infrastructure access is required" },
      { status: 403 },
    )));

    const response = await GET(new NextRequest("https://dashboard.example/api/digital-twin/topology"));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "forbidden",
      message: "Infrastructure access is required",
    });
  });
});
