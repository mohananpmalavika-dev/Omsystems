import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET as getBranches } from "../app/api/admin/system/branches/route";
import { GET as getCameras } from "../app/api/admin/system/cameras/route";
import { GET as getGateways } from "../app/api/admin/system/gateways/route";
import { GET as getStats } from "../app/api/admin/system/stats/route";

const originalControlUrl = process.env.CONTROL_PLANE_INTERNAL_URL;
const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  vi.unstubAllGlobals();
  restore("CONTROL_PLANE_INTERNAL_URL", originalControlUrl);
  restore("NODE_ENV", originalNodeEnv);
});

describe("admin system routes", () => {
  it("returns one tenant-scoped gateway response without a per-branch request fan-out", async () => {
    process.env.CONTROL_PLANE_INTERNAL_URL = "http://control.internal:8080";
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe("http://control.internal:8080/v1/edge-agents");
      return Response.json({ data: [{
        id: "gateway-1",
        name: "Branch edge",
        status: "online",
        branchId: "branch-1",
        branchName: "Kochi",
        lastSeenAt: "2026-08-28T08:00:00.000Z",
      }] });
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await getGateways(authenticatedRequest("/api/admin/system/gateways"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([expect.objectContaining({
      id: "gateway-1",
      branch_id: "branch-1",
      branch_name: "Kochi",
    })]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not turn an upstream branch failure into an empty successful result", async () => {
    process.env.CONTROL_PLANE_INTERNAL_URL = "http://control.internal:8080";
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) =>
      String(input).includes("organization/nodes")
        ? Response.json({ error: "internal_error" }, { status: 500 })
        : Response.json({ data: [] }),
    ));

    const response = await getBranches(authenticatedRequest("/api/admin/system/branches"));

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ error: "branches_unavailable" });
  });

  it("returns a paginated camera inventory with real network and gateway fields", async () => {
    process.env.CONTROL_PLANE_INTERNAL_URL = "http://control.internal:8080";
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/v1/cameras?")) {
        expect(url).toContain("action=device%3Aconfigure");
        expect(url).toContain("limit=100");
        expect(url).toContain("offset=200");
        expect(url).toContain("search=entrance");
        return Response.json({
          data: [{
            id: "camera-201",
            name: "Entrance",
            model: "IPC-42",
            vendor: "other",
            ipAddress: "10.20.30.40",
            status: "online",
            edgeAgentId: "gateway-1",
            branchId: "branch-1",
            branchName: "Kochi",
          }],
          total: 3000,
          limit: 100,
          offset: 200,
        });
      }
      expect(url).toBe("http://control.internal:8080/v1/edge-agents");
      return Response.json({ data: [{ id: "gateway-1", name: "Kochi gateway" }] });
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await getCameras(authenticatedRequest(
      "/api/admin/system/cameras?limit=100&offset=200&search=entrance",
    ));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: [expect.objectContaining({
        id: "camera-201",
        ip_address: "10.20.30.40",
        gateway_name: "Kochi gateway",
        branch_name: "Kochi",
      })],
      total: 3000,
      limit: 100,
      offset: 200,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("uses real counts and marks unavailable aggregate metrics as unknown", async () => {
    process.env.CONTROL_PLANE_INTERNAL_URL = "http://control.internal:8080";
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/v1/cameras?")) {
        return Response.json({ total: "3000", data: [] });
      }
      if (url.includes("organization/nodes")) {
        return Response.json({ data: [{ id: "branch-1" }, { id: "branch-2" }] });
      }
      return Response.json({ data: [{ id: "gateway-1" }] });
    }));

    const response = await getStats(authenticatedRequest("/api/admin/system/stats"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      gateways: 1,
      cameras: 3000,
      branches: 2,
      live_sessions: null,
      telemetry_records: null,
    });
  });
});

function authenticatedRequest(path: string) {
  return new NextRequest(`https://dashboard.example${path}`, {
    headers: { cookie: "sentinel_access=employee-session" },
  });
}

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
