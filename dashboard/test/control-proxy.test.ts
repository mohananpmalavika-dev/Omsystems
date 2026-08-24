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

  it("does not forward dashboard Basic Auth as control-plane authentication", async () => {
    process.env.DASHBOARD_DEV_USER_ID = "user-global-admin";
    const upstream = vi.fn(async (
      _input: RequestInfo | URL,
      _init?: RequestInit,
    ) => Response.json({ data: [] }));
    vi.stubGlobal("fetch", upstream);

    await GET(
      new NextRequest("https://sentinel.example/api/control/v1/integrations", {
        headers: { authorization: "Basic dashboard-credentials" },
      }),
      { params: Promise.resolve({ path: ["v1", "integrations"] }) },
    );

    const headers = new Headers(upstream.mock.calls[0]?.[1]?.headers);
    expect(headers.has("authorization")).toBe(false);
    expect(headers.get("x-user-id")).toBe("user-global-admin");
  });

  it("forwards gateway credentials without injecting an employee identity", async () => {
    process.env.CONTROL_PLANE_INTERNAL_URL = "http://control.internal:8080";
    process.env.EDGE_BRIDGE_SHARED_KEY = "bridge-secret";
    process.env.DASHBOARD_DEV_USER_ID = "user-global-admin";
    const upstream = vi.fn(async (
      _input: RequestInfo | URL,
      _init?: RequestInit,
    ) => Response.json({ controlPlaneUrl: "https://sentinel.example/api/control" }));
    vi.stubGlobal("fetch", upstream);

    const response = await GET(
      new NextRequest(
        "https://sentinel.example/api/control/v1/edge-agents/agent-1/bootstrap",
        {
          headers: {
            authorization: "Bearer stale-employee-token",
            "x-edge-agent-token": "sggw_gateway-credential",
            "x-user-id": "stale-development-user",
          },
        },
      ),
      { params: Promise.resolve({ path: ["v1", "edge-agents", "agent-1", "bootstrap"] }) },
    );

    expect(response.status).toBe(200);
    const headers = new Headers(upstream.mock.calls[0]?.[1]?.headers);
    expect(headers.get("x-edge-agent-token")).toBe("sggw_gateway-credential");
    expect(headers.get("x-edge-bridge-key")).toBe("bridge-secret");
    expect(headers.has("authorization")).toBe(false);
    expect(headers.has("x-user-id")).toBe(false);
  });

  it("forwards one-time edge enrollment without synthetic authentication", async () => {
    process.env.CONTROL_PLANE_INTERNAL_URL = "http://control.internal:8080";
    process.env.DASHBOARD_DEV_USER_ID = "user-global-admin";
    const upstream = vi.fn(async (
      _input: RequestInfo | URL,
      _init?: RequestInit,
    ) => Response.json({ agentId: "agent-1", credential: "sggw_credential" }, { status: 201 }));
    vi.stubGlobal("fetch", upstream);

    const response = await POST(
      new NextRequest(
        "https://sentinel.example/api/control/v1/edge-enrollment/activate",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-user-id": "stale-development-user",
          },
          body: JSON.stringify({
            activationCode: `sgact_${"a".repeat(48)}`,
            deviceUuid: "11111111-1111-4111-8111-111111111111",
            version: "1.0.0",
          }),
        },
      ),
      { params: Promise.resolve({ path: ["v1", "edge-enrollment", "activate"] }) },
    );

    expect(response.status).toBe(201);
    const headers = new Headers(upstream.mock.calls[0]?.[1]?.headers);
    expect(headers.has("authorization")).toBe(false);
    expect(headers.has("x-user-id")).toBe(false);
  });

  it("accepts Render private host:port service references", async () => {
    process.env.CONTROL_PLANE_INTERNAL_URL = "sentinel-control.internal:8080";
    const upstream = vi.fn(async (
      _input: RequestInfo | URL,
      _init?: RequestInit,
    ) => Response.json({ data: [] }));
    vi.stubGlobal("fetch", upstream);

    await GET(
      new NextRequest("https://sentinel.example/api/control/v1/branches"),
      { params: Promise.resolve({ path: ["v1", "branches"] }) },
    );

    expect(String(upstream.mock.calls[0]![0])).toBe("http://sentinel-control.internal:8080/v1/branches");
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

  it("streams installer form submissions with the cookie-backed employee session", async () => {
    process.env.CONTROL_PLANE_INTERNAL_URL = "http://control.internal:8080";
    const upstream = vi.fn(async (
      _input: RequestInfo | URL,
      _init?: RequestInit,
    ) => new Response(Buffer.from("MZfixture"), {
      status: 200,
      headers: {
        "content-type": "application/vnd.microsoft.portable-executable",
        "content-disposition": 'attachment; filename="branch-scanner-setup.exe"',
        "content-length": "9",
      },
    }));
    vi.stubGlobal("fetch", upstream);

    const request = new NextRequest(
      "https://sentinel.example/api/control/v1/branches/branch-1/edge-agent-installer",
      {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          cookie: "sentinel_access=employee-token",
        },
        body: new URLSearchParams({
          activationId: "activation-1",
          activationCode: "one-time-code",
          agentName: "Branch Scanner",
        }).toString(),
      },
    );
    const response = await POST(request, {
      params: Promise.resolve({ path: ["v1", "branches", "branch-1", "edge-agent-installer"] }),
    });

    const [, init] = upstream.mock.calls[0]!;
    const headers = new Headers(init?.headers);
    expect(headers.get("authorization")).toBe("Bearer employee-token");
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("x-sentinel-public-api-base")).toBe("https://sentinel.example/api/control");
    expect(init?.body).toBe(JSON.stringify({
      activationId: "activation-1",
      activationCode: "one-time-code",
      agentName: "Branch Scanner",
    }));
    expect(response.headers.get("content-disposition")).toContain("branch-scanner-setup.exe");
    expect(response.headers.get("content-length")).toBe("9");
    expect(Buffer.from(await response.arrayBuffer()).subarray(0, 2).toString()).toBe("MZ");
  });

  it("embeds the public Render origin instead of the internal bind address", async () => {
    process.env.CONTROL_PLANE_INTERNAL_URL = "http://control.internal:8080";
    const upstream = vi.fn(async (
      _input: RequestInfo | URL,
      _init?: RequestInit,
    ) => new Response(Buffer.from("MZfixture"), {
      status: 200,
      headers: { "content-type": "application/vnd.microsoft.portable-executable" },
    }));
    vi.stubGlobal("fetch", upstream);

    await POST(
      new NextRequest(
        "https://0.0.0.0:10000/api/control/v1/branches/branch-1/edge-agent-installer",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-forwarded-host": "sentinel-grid-monitoring-s38w.onrender.com",
            "x-forwarded-proto": "https",
          },
          body: JSON.stringify({
            activationId: "activation-1",
            activationCode: "one-time-code",
            agentName: "Branch Scanner",
          }),
        },
      ),
      { params: Promise.resolve({ path: ["v1", "branches", "branch-1", "edge-agent-installer"] }) },
    );

    const headers = new Headers(upstream.mock.calls[0]?.[1]?.headers);
    expect(headers.get("x-sentinel-public-api-base")).toBe(
       "https://sentinel-grid-monitoring-s38w.onrender.com/api/control",
    );
  });

  it("drops upstream content-encoding for decoded JSON responses", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: [] }), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "content-encoding": "gzip",
        "content-length": "123",
      },
    })));

    const response = await GET(
      new NextRequest("https://sentinel.example/api/control/v1/operations/health/summary"),
      { params: Promise.resolve({ path: ["v1", "operations", "health", "summary"] }) },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-encoding")).toBeNull();
    expect(response.headers.get("content-length")).toBeNull();
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(await response.json()).toEqual({ data: [] });
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
