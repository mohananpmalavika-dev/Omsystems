import { afterEach, describe, expect, it, vi } from "vitest";
import { API_ERROR_EVENT, authApi, cameraInventoryApi } from "../lib/api-client";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("dashboard authentication resilience", () => {
  it("preserves the signed-in browser session during a transient control-plane outage", async () => {
    const values = new Map<string, string>([
      ["user", JSON.stringify({ id: "employee-1" })],
      ["sentinel_login_time", "123"],
    ]);
    const localStorage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); },
      clear: () => { values.clear(); },
      key: (index: number) => [...values.keys()][index] ?? null,
      get length() { return values.size; },
    } satisfies Storage;
    const location = { pathname: "/", href: "http://sentinel.test/" };

    vi.stubGlobal("window", { location });
    vi.stubGlobal("localStorage", localStorage);
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("control plane restarting");
    }));

    await expect(authApi.getCurrentUser()).rejects.toThrow(
      "Cannot connect to server",
    );
    expect(localStorage.getItem("user")).toBe(JSON.stringify({ id: "employee-1" }));
    expect(localStorage.getItem("sentinel_login_time")).toBe("123");
    expect(location.href).toBe("http://sentinel.test/");
  });

  function browserSession() {
    const values = new Map<string, string>([
      ["sentinel_browser_session", "active"],
      ["accessToken", "old-access"],
      ["refreshToken", "old-refresh"],
      ["user", JSON.stringify({ id: "employee-1" })],
    ]);
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); },
      clear: () => { values.clear(); },
      key: (index: number) => [...values.keys()][index] ?? null,
      get length() { return values.size; },
    } satisfies Storage;
    const location = { pathname: "/operations/cameras", href: "https://sentinel.test/operations/cameras" };
    const browser = Object.assign(new EventTarget(), { location });
    vi.stubGlobal("window", browser);
    vi.stubGlobal("sessionStorage", storage);
    vi.stubGlobal("localStorage", storage);
    return { values, location, browser };
  }

  it("shows a module's 401 reason without signing out", async () => {
    const { values, location, browser } = browserSession();
    const notices: Array<{ status: number; code: string; message: string }> = [];
    browser.addEventListener(API_ERROR_EVENT, (event) => {
      notices.push((event as CustomEvent).detail);
    });
    const fetchMock = vi.fn(async () =>
      Response.json({ error: "device_credentials_rejected", message: "Camera password was rejected" }, { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(cameraInventoryApi.listGateways("branch-1"))
      .rejects.toMatchObject({ statusCode: 401, message: "Camera password was rejected" });
    expect(values.get("sentinel_browser_session")).toBe("active");
    expect(location.href).toBe("https://sentinel.test/operations/cameras");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(notices).toEqual([{ status: 401, code: "device_credentials_rejected", message: "Camera password was rejected" }]);
  });

  it("preserves the session when refresh cannot reach the server", async () => {
    const { values, location } = browserSession();
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(Response.json({ error: "unauthenticated" }, { status: 401 }))
      .mockRejectedValueOnce(new Error("network interrupted")));

    await expect(authApi.getCurrentUser()).rejects.toMatchObject({
      statusCode: 0,
      message: "Sign-in service is temporarily unreachable. Please retry.",
    });
    expect(values.get("sentinel_browser_session")).toBe("active");
    expect(location.href).toBe("https://sentinel.test/operations/cameras");
  });

  it("uses the newly refreshed access token on retry", async () => {
    const { values } = browserSession();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ error: "unauthenticated" }, { status: 401 }))
      .mockResolvedValueOnce(Response.json({ accessToken: "new-access", refreshToken: "new-refresh" }))
      .mockResolvedValueOnce(Response.json({ data: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(cameraInventoryApi.listGateways("branch-1")).resolves.toEqual({ data: [] });
    expect(new Headers(fetchMock.mock.calls[0][1].headers).get("x-sentinel-session")).toBe("old-access");
    expect(new Headers(fetchMock.mock.calls[2][1].headers).get("x-sentinel-session")).toBe("new-access");
    expect(values.get("refreshToken")).toBe("new-refresh");
  });

  it("does not sign out when an installer download is forbidden", async () => {
    const { values, location } = browserSession();
    vi.stubGlobal("fetch", vi.fn(async () =>
      Response.json({ error: "branch_access_denied", message: "You cannot configure this branch" }, { status: 403 })));

    await expect(cameraInventoryApi.downloadInstallerFromActivation("branch-1", {
      activationId: "activation-1", activationCode: "sgact_example", agentName: "Scanner",
    })).rejects.toMatchObject({ statusCode: 403, message: "You cannot configure this branch" });
    expect(values.get("sentinel_browser_session")).toBe("active");
    expect(location.href).toBe("https://sentinel.test/operations/cameras");
  });
});
