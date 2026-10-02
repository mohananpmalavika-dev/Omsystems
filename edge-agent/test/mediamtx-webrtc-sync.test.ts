import { afterEach, describe, expect, it, vi } from "vitest";
import { synchronizeMediaMtxWebRtc } from "../src/streaming/edge-live-gateway.js";
afterEach(() => vi.unstubAllGlobals());
describe("reused MediaMTX WebRTC configuration", () => {
  it("enables WebRTC left disabled by the previous relay-mode agent", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({ webrtc: false })).mockResolvedValueOnce(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    await synchronizeMediaMtxWebRtc("http://127.0.0.1:9997", true);
    expect(String(fetch.mock.calls[1]![0])).toBe("http://127.0.0.1:9997/v3/config/global/patch");
    expect(JSON.parse(fetch.mock.calls[1]![1].body)).toEqual({ webrtc: true });
  });
  it("does not restart media listeners when the setting already matches", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ webrtc: true })); vi.stubGlobal("fetch", fetch);
    await synchronizeMediaMtxWebRtc("http://127.0.0.1:9997", true);
    expect(fetch).toHaveBeenCalledOnce();
  });
  it("reports a rejected configuration change", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({ webrtc: false })).mockResolvedValueOnce(new Response(null, { status: 400 }));
    vi.stubGlobal("fetch", fetch);
    await expect(synchronizeMediaMtxWebRtc("http://127.0.0.1:9997", true)).rejects.toThrow("rejected");
  });
});
