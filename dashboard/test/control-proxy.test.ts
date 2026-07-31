import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "../app/api/control/[...path]/route";

const originalControlUrl = process.env.CONTROL_PLANE_INTERNAL_URL;
const originalBridgeKey = process.env.EDGE_BRIDGE_SHARED_KEY;
const originalDevUser = process.env.DASHBOARD_DEV_USER_ID;

afterEach(() => {
  vi.unstubAllGlobals();
  restore("CONTROL_PLANE_INTERNAL_URL", originalControlUrl);
  restore("EDGE_BRIDGE_SHARED_KEY", originalBridgeKey);
  restore("DASHBOARD_DEV_USER_ID", originalDevUser);
});

describe("dashboard control-plane BFF", () => {
  it("converts the employee session header to an upstream bearer token", async () => {
    process.env.CONTROL_PLANE_INTERNAL_URL = "http://control.internal:8080";
    process.env.EDGE_BRIDGE_SHARED_KEY = "bridge-secret";
    const upstream = vi.fn(async (
      _input: RequestInfo | URL,
      _init?: RequestInit,
    ) =>
      Response.json({ data: [{ id: "company-1" }] })
    );
    vi.stubGlobal("fetch", upstream);

    const request = new NextRequest(
      "https://sentinel.example/api/control/v1/organization/tree?active=true",
      { headers: { "x-sentinel-session": "employee-token" } },
    );
    const response = await GET(request, {
      params: Promise.resolve({ path: ["v1", "organization", "tree"] }),
    });

    expect(response.status).toBe(200);
    const [url, init] = upstream.mock.calls[0]!;
    expect(String(url)).toBe(
      "http://control.internal:8080/v1/organization/tree?active=true",
    );
    const headers = new Headers(init?.headers);
    expect(headers.get("authorization")).toBe("Bearer employee-token");
    expect(headers.get("x-edge-bridge-key")).toBe("bridge-secret");
    expect(headers.has("x-user-id")).toBe(false);
  });

  it("uses the configured development identity when no session is present", async () => {
    process.env.DASHBOARD_DEV_USER_ID = "user-global-admin";
    const upstream = vi.fn(async (
      _input: RequestInfo | URL,
      _init?: RequestInit,
    ) => Response.json({ data: [] }));
    vi.stubGlobal("fetch", upstream);

    await GET(
      new NextRequest("https://sentinel.example/api/control/v1/users"),
      { params: Promise.resolve({ path: ["v1", "users"] }) },
    );

    const [, init] = upstream.mock.calls[0]!;
    expect(new Headers(init?.headers).get("x-user-id")).toBe(
      "user-global-admin",
    );
  });

  it("preserves the filename for the single Windows installer executable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(Buffer.from("MZfixture"), {
      status: 200,
      headers: {
        "content-type": "application/vnd.microsoft.portable-executable",
        "content-disposition": 'attachment; filename="Branch-edge-agent-setup.exe"',
      },
    })));

    const response = await GET(
      new NextRequest("https://sentinel.example/api/control/v1/branches/branch-1/edge-agents/agent-1/package?platform=windows"),
      { params: Promise.resolve({ path: ["v1", "branches", "branch-1", "edge-agents", "agent-1", "package"] }) },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain("edge-agent-setup.exe");
    expect(Buffer.from(await response.arrayBuffer()).subarray(0, 2).toString()).toBe("MZ");
  });

  it("returns an empty digital twin branch list when the upstream route is missing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(null, {
        status: 404,
        headers: { "content-type": "application/json" },
      }),
    ));

    const response = await GET(
      new NextRequest("https://sentinel.example/api/control/v1/digital-twin/branches"),
      { params: Promise.resolve({ path: ["v1", "digital-twin", "branches"] }) },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });

  it("keeps login tokens in HttpOnly cookies and removes them from JSON", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      Response.json({
        accessToken: "access-secret",
        refreshToken: "refresh-secret",
        expiresIn: 3600,
        tokenType: "Bearer",
        user: { id: "employee-1", displayName: "Employee One" },
      })
    ));

    const response = await POST(
      new NextRequest(
        "https://sentinel.example/api/control/v1/auth/login",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ username: "employee", password: "secret" }),
        },
      ),
      { params: Promise.resolve({ path: ["v1", "auth", "login"] }) },
    );

    const body = await response.json();
    expect(body.accessToken).toBeUndefined();
    expect(body.refreshToken).toBeUndefined();
    expect(body.user.id).toBe("employee-1");
    const cookies = response.headers.get("set-cookie") ?? "";
    expect(cookies).toContain("sentinel_access=access-secret");
    expect(cookies).toContain("HttpOnly");
    expect(cookies).toContain("SameSite=strict");
  });

  it("logs upstream fetch failures with route details and returns 502", async () => {
    process.env.CONTROL_PLANE_INTERNAL_URL = "http://control.internal:8080";
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchError = new Error("Network failure");
    vi.stubGlobal("fetch", vi.fn(async () => { throw fetchError; }));

    const response = await POST(
      new NextRequest(
        "https://sentinel.example/api/control/v1/auth/login",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ username: "employee", password: "secret" }),
        },
      ),
      { params: Promise.resolve({ path: ["v1", "auth", "login"] }) },
    );

    expect(response.status).toBe(502);
    expect(consoleError).toHaveBeenCalledWith("Control-plane proxy request failed", expect.objectContaining({
      method: "POST",
      routePath: "/v1/auth/login",
      upstream: "http://control.internal:8080/v1/auth/login",
      message: "Network failure",
    }));
    consoleError.mockRestore();
  });
});

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
