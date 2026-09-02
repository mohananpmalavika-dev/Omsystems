import { afterEach, describe, expect, it, vi } from "vitest";
import { authApi } from "../lib/api-client";

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
});
