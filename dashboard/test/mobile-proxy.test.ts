import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "../app/api/mobile/[...path]/route";

const context = { params: Promise.resolve({ path: ["v1", "home"] }) };
afterEach(() => { vi.unstubAllGlobals(); });
describe("mobile proxy preserves security and availability truth", () => {
  it("requires a session and rejects identity/service-key spoofing", async () => {
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);
    const response = await GET(new NextRequest("https://sentinel.test/api/mobile/v1/home", {
      headers: { "x-user-id": "admin", "x-edge-bridge-key": "injected" },
    }), context);
    expect(response.status).toBe(401);
    expect(upstream).not.toHaveBeenCalled();
  });
  it("forwards the cookie as bearer auth and strips untrusted identities and keys", async () => {
    const upstream = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => Response.json({ success: true, data: {} }));
    vi.stubGlobal("fetch", upstream);
    const response = await GET(new NextRequest("https://sentinel.test/api/mobile/v1/home", {
      headers: { cookie: "sentinel_access=employee-session", "x-user-id": "admin", "x-edge-bridge-key": "injected", "x-development-user-id": "admin" },
    }), context);
    expect(response.status).toBe(200);
    const headers = new Headers(upstream.mock.calls[0]![1]?.headers);
    expect(headers.get("authorization")).toBe("Bearer employee-session");
    for (const key of ["cookie", "x-user-id", "x-development-user-id", "x-edge-bridge-key"]) expect(headers.has(key)).toBe(false);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("rejects cross-origin cookie mutations before forwarding", async () => {
    const upstream = vi.fn(); vi.stubGlobal("fetch", upstream);
    const response = await POST(new NextRequest("https://sentinel.test/api/mobile/v1/incidents/one/acknowledge", {
      method: "POST", headers: { cookie: "sentinel_access=employee-session", origin: "https://attacker.test", "sec-fetch-site": "same-origin" },
    }), { params: Promise.resolve({ path: ["v1", "incidents", "one", "acknowledge"] }) });
    expect(response.status).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
  });
  it("accepts same-origin cookie mutations and forwards JSON", async () => {
    const upstream = vi.fn(async (_url: any, _init?: RequestInit) => Response.json({ success: true }));
    vi.stubGlobal("fetch", upstream);
    const response = await POST(new NextRequest("https://sentinel.test/api/mobile/v1/incidents/one/notes", {
      method: "POST", headers: { cookie: "sentinel_access=employee-session", origin: "https://sentinel.test", "content-type": "application/json" },
      body: JSON.stringify({ text: "Saved note" }),
    }), { params: Promise.resolve({ path: ["v1", "incidents", "one", "notes"] }) });
    expect(response.status).toBe(200);
    expect(upstream.mock.calls[0]![1]?.body).toBe(JSON.stringify({ text: "Saved note" }));
  });
  it("returns an error rather than healthy home data when the upstream is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const response = await GET(new NextRequest("https://sentinel.test/api/mobile/v1/home", { headers: { authorization: "Bearer session" } }), context);
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ success: false, error: "mobile_upstream_unavailable" });
  });
  it("rejects traversal paths", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const response = await GET(new NextRequest("https://sentinel.test/api/mobile/v1/home", { headers: { authorization: "Bearer session" } }),
      { params: Promise.resolve({ path: ["v1", "..", "secrets"] }) });
    expect(response.status).toBe(400);
  });
});
