import { describe, expect, it } from "vitest";
import { rewriteLiveMediaUrls } from "../lib/live-media-urls";

const session = {
  cameraId: "camera-1", sessionId: "session-1",
  hls: { url: "http://127.0.0.1:8090/hls/camera-1/index.m3u8?token=t", bearerToken: "t" },
  webRtc: { whepUrl: "http://127.0.0.1:8090/webrtc/camera-1/whep", bearerToken: "t" },
};

describe("browser-reachable live media URLs", () => {
  it.each(["http", "https"])("preserves the agent path for a %s relay", (scheme) => {
    const base = `${scheme}://cloud.example/v1/edge-media/agent-1`;
    const result = rewriteLiveMediaUrls(session, `${base}/v1/live/start`);
    expect(result.hls?.url).toBe(`${base}/hls/camera-1/index.m3u8?token=t`);
    expect(result.webRtc?.whepUrl).toBe(`${base}/webrtc/camera-1/whep`);
    expect(rewriteLiveMediaUrls(result, base)).toEqual(result);
  });
  it("retains direct HTTP LAN media ports", () => {
    expect(rewriteLiveMediaUrls(session, "http://192.168.1.1:8090/v1/live/start")).toEqual(session);
  });
  it("rewrites loopback sources onto the secure tunnel", () => {
    expect(rewriteLiveMediaUrls(session, "https://branch.example/v1/live/start").hls?.url)
      .toBe("https://branch.example/hls/camera-1/index.m3u8?token=t");
  });
});
