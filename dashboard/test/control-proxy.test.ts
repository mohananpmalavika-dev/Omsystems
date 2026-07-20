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
});

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
