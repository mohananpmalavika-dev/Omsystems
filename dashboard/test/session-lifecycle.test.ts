import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isAuthenticated as isAuthFromGuard, redirectToLogin } from "../lib/session-guard";
import { isAuthenticated as isAuthFromManager, getCurrentUser, logout as logoutFromManager } from "../lib/auth-manager";
import { authApi } from "../lib/api-client";

describe("session lifecycle and browser close isolation", () => {
  let mockSessionStorage: Map<string, string>;
  let mockLocalStorage: Map<string, string>;

  beforeEach(() => {
    mockSessionStorage = new Map();
    mockLocalStorage = new Map();

    const createStorage = (store: Map<string, string>): Storage => ({
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value); },
      removeItem: (key: string) => { store.delete(key); },
      clear: () => { store.clear(); },
      key: (index: number) => [...store.keys()][index] ?? null,
      get length() { return store.size; },
    });

    vi.stubGlobal("sessionStorage", createStorage(mockSessionStorage));
    vi.stubGlobal("localStorage", createStorage(mockLocalStorage));
    vi.stubGlobal("window", {
      location: { pathname: "/", href: "https://sentinel.example/" },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports unauthenticated when browser was closed (sessionStorage empty even with stale localStorage)", () => {
    // Stale credentials left in localStorage from a previous browser run
    mockLocalStorage.set("user", JSON.stringify({ id: "user-1", username: "admin" }));
    mockLocalStorage.set("accessToken", "stale-access-token");
    // But sessionStorage is empty because browser was closed
    mockSessionStorage.clear();

    expect(isAuthFromGuard()).toBe(false);
    expect(isAuthFromManager()).toBe(false);
  });

  it("reports authenticated when active browser session is present in sessionStorage", () => {
    mockSessionStorage.set("sentinel_browser_session", "active");
    mockSessionStorage.set("user", JSON.stringify({ id: "user-1", username: "admin" }));

    expect(isAuthFromGuard()).toBe(true);
    expect(isAuthFromManager()).toBe(true);
    expect(getCurrentUser()).toEqual({ id: "user-1", username: "admin" });
  });

  it("stores credentials in sessionStorage and removes them from localStorage on login", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      Response.json({
        accessToken: "fresh-access-token",
        refreshToken: "fresh-refresh-token",
        expiresIn: 3600,
        tokenType: "Bearer",
        user: { id: "user-1", username: "admin" },
      })
    ));

    await authApi.login("admin", "password123");

    // Must be in sessionStorage for browser-session scoping
    expect(mockSessionStorage.get("sentinel_browser_session")).toBe("active");
    expect(mockSessionStorage.get("accessToken")).toBe("fresh-access-token");
    expect(mockSessionStorage.get("user")).toBe(JSON.stringify({ id: "user-1", username: "admin" }));

    // Must NOT be stored in localStorage
    expect(mockLocalStorage.get("accessToken")).toBeUndefined();
    expect(mockLocalStorage.get("refreshToken")).toBeUndefined();
    expect(mockLocalStorage.get("user")).toBeUndefined();
  });

  it("clears both sessionStorage and localStorage on logout", async () => {
    mockSessionStorage.set("sentinel_browser_session", "active");
    mockSessionStorage.set("accessToken", "token");
    mockSessionStorage.set("user", JSON.stringify({ id: "user-1" }));
    mockLocalStorage.set("sentinel_login_time", "12345");

    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ success: true }), { status: 200 })
    ));

    await authApi.logout();

    expect(mockSessionStorage.size).toBe(0);
    expect(mockLocalStorage.get("accessToken")).toBeUndefined();
    expect(mockLocalStorage.get("refreshToken")).toBeUndefined();
    expect(mockLocalStorage.get("user")).toBeUndefined();
    expect(mockLocalStorage.get("sentinel_login_time")).toBeUndefined();
  });

  it("includes the client system name and session metadata when ending an activity log on logout", async () => {
    mockSessionStorage.set("sentinel_browser_session", "active");
    mockSessionStorage.set("accessToken", "token");
    mockSessionStorage.set("activitySessionId", "session-123");
    mockSessionStorage.set("activityAccessToken", "token");

    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(globalThis, "navigator", {
      value: { platform: "Win32", userAgent: "TestBrowser" },
      configurable: true,
    });

    await logoutFromManager();

    expect(fetchMock).toHaveBeenCalled();
    const [, requestInit] = fetchMock.mock.calls[0];
    const payload = JSON.parse(String(requestInit?.body || "{}"));
    expect(payload.deviceInfo).toMatchObject({ systemName: "Win32" });
  });

  it("clears storage and redirects when redirectToLogin is invoked", async () => {
    mockSessionStorage.set("sentinel_browser_session", "active");
    mockSessionStorage.set("user", JSON.stringify({ id: "user-1" }));
    mockLocalStorage.set("user", JSON.stringify({ id: "user-1" }));

    await redirectToLogin("expired");

    expect(mockSessionStorage.size).toBe(0);
    expect(mockLocalStorage.get("user")).toBeUndefined();
    expect(mockLocalStorage.get("accessToken")).toBeUndefined();
    expect(isAuthFromGuard()).toBe(false);
  });

  it("redirects cleanly to /login without error reason on browser close or fresh launch", async () => {
    mockSessionStorage.clear();
    mockLocalStorage.clear();

    await redirectToLogin("auth_required");

    expect(mockSessionStorage.size).toBe(0);
    expect(isAuthFromGuard()).toBe(false);
    expect(window.location.href).toBe("/login");
  });
});
