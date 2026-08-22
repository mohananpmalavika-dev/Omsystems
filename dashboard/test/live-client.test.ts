import { afterEach, describe, expect, it, vi } from "vitest";
import { startLiveFromBrowser } from "../lib/live-client";

afterEach(() => vi.unstubAllGlobals());

describe("browser live startup", () => {
  it("passes the supplied abort signal to the authorization request", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
      Response.json({
        cameraId: "camera-1",
        hls: { url: "https://media.example/live.m3u8", bearerToken: "stream-token" },
      }, { status: 201 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await startLiveFromBrowser("camera-1", "sub", controller.signal);

    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBe(controller.signal);
  });

  it("turns an expired authorization request into a safe timeout error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new DOMException("Live session timed out", "TimeoutError");
    }));

    await expect(startLiveFromBrowser("camera-1")).rejects.toThrow("live_session_timeout");
  });
});
