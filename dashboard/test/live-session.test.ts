import { afterEach, describe, expect, it, vi } from "vitest";
import { startLive } from "../lib/backend";

const originalDemoMode = process.env.DASHBOARD_DEMO_MODE;
const originalControlUrl = process.env.CONTROL_PLANE_INTERNAL_URL;
const originalMediaUrl = process.env.MEDIA_GATEWAY_INTERNAL_URL;
const originalDevUser = process.env.DASHBOARD_DEV_USER_ID;

afterEach(() => {
  vi.unstubAllGlobals();
  restore("DASHBOARD_DEMO_MODE", originalDemoMode);
  restore("CONTROL_PLANE_INTERNAL_URL", originalControlUrl);
  restore("MEDIA_GATEWAY_INTERNAL_URL", originalMediaUrl);
  restore("DASHBOARD_DEV_USER_ID", originalDevUser);
});

describe("dashboard live session startup", () => {
  it("uses the configured dashboard identity and returns the gateway session", async () => {
    process.env.DASHBOARD_DEMO_MODE = "false";
    process.env.CONTROL_PLANE_INTERNAL_URL = "http://control.internal:8080";
    process.env.MEDIA_GATEWAY_INTERNAL_URL = "http://media.internal:8090";
    process.env.DASHBOARD_DEV_USER_ID = "user-global-admin";
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("control.internal")) {
        return Response.json({ token: "t".repeat(43) }, { status: 201 });
      }
      return Response.json({
        cameraId: "camera-1",
        hls: { url: "https://media.example/hls/camera-1/index.m3u8", bearerToken: "stream-token" },
      }, { status: 201 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(startLive("camera-1")).resolves.toMatchObject({
      cameraId: "camera-1",
      hls: { url: "https://media.example/hls/camera-1/index.m3u8" },
    });

    const controlHeaders = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(controlHeaders.get("x-user-id")).toBe("user-global-admin");
    expect(controlHeaders.has("authorization")).toBe(false);
  });

  it("does not manufacture a demo stream when the media gateway rejects a session", async () => {
    process.env.DASHBOARD_DEMO_MODE = "false";
    process.env.CONTROL_PLANE_INTERNAL_URL = "http://control.internal:8080";
    process.env.MEDIA_GATEWAY_INTERNAL_URL = "http://media.internal:8090";
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("control.internal")) {
        return Response.json({ token: "t".repeat(43) }, { status: 201 });
      }
      return Response.json({ error: "stream_secret_unavailable" }, { status: 503 });
    }));

    await expect(startLive("camera-1")).rejects.toThrow("stream_secret_unavailable");
  });
});

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
