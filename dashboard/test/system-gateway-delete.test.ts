import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { DELETE } from "../app/api/admin/system/gateways/[id]/route";
import { GET as listGateways } from "../app/api/admin/system/gateways/route";

const originalControlUrl = process.env.CONTROL_PLANE_INTERNAL_URL;
const originalBridgeKey = process.env.EDGE_BRIDGE_SHARED_KEY;
const originalDevUser = process.env.DASHBOARD_DEV_USER_ID;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  restore("CONTROL_PLANE_INTERNAL_URL", originalControlUrl);
  restore("EDGE_BRIDGE_SHARED_KEY", originalBridgeKey);
  restore("DASHBOARD_DEV_USER_ID", originalDevUser);
});

describe("system gateway deletion", () => {
  it("calls the control plane directly and forwards cookie authentication", async () => {
    process.env.CONTROL_PLANE_INTERNAL_URL = "sentinel-control.internal:8080";
    process.env.EDGE_BRIDGE_SHARED_KEY = "bridge-secret";
    const upstream = vi.fn(async (
      _input: RequestInfo | URL,
      _init?: RequestInit,
    ) => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", upstream);

    const response = await DELETE(
      new NextRequest("https://sentinel.example/api/admin/system/gateways/gateway-1", {
        method: "DELETE",
        headers: { cookie: "sentinel_access=employee-token" },
      }),
      { params: Promise.resolve({ id: "gateway-1" }) },
    );

    expect(response.status).toBe(204);
    expect(String(upstream.mock.calls[0]?.[0])).toBe(
      "http://sentinel-control.internal:8080/v1/edge-agents/gateway-1",
    );
    const headers = new Headers(upstream.mock.calls[0]?.[1]?.headers);
    expect(headers.get("authorization")).toBe("Bearer employee-token");
    expect(headers.get("x-edge-bridge-key")).toBe("bridge-secret");
    expect(headers.has("cookie")).toBe(false);
  });

  it("preserves the upstream status and structured error", async () => {
    process.env.CONTROL_PLANE_INTERNAL_URL = "http://control.internal:8080";
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(
      { error: "gateway_delete_failed", message: "Database unavailable" },
      { status: 503 },
    )));

    const response = await DELETE(
      new NextRequest("https://sentinel.example/api/admin/system/gateways/gateway-1", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: "gateway-1" }) },
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "gateway_delete_failed",
      message: "Database unavailable",
    });
  });

  it("does not return revoked gateways to the management table", async () => {
    process.env.CONTROL_PLANE_INTERNAL_URL = "http://control.internal:8080";
    const upstream = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/v1/organization/nodes")) {
        return Response.json({ data: [{ id: "branch-1", name: "Branch One" }] });
      }
      return Response.json({
        data: [
          { id: "active-1", name: "Active", status: "online", credentialStatus: "active" },
          { id: "revoked-1", name: "Removed", status: "offline", credentialStatus: "revoked" },
        ],
      });
    });
    vi.stubGlobal("fetch", upstream);

    const response = await listGateways(
      new NextRequest("https://sentinel.example/api/admin/system/gateways"),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      expect.objectContaining({ id: "active-1", name: "Active" }),
    ]);
  });
});

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
