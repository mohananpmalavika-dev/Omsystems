import { afterEach, describe, expect, it, vi } from "vitest";
import { sendTalkAudio, startTalkFromBrowser, stopTalk } from "../lib/talk-client";

afterEach(() => vi.unstubAllGlobals());

describe("browser hold-to-talk transport", () => {
  it("exchanges the one-time control token at the branch edge and sends only bearer-authorized audio", async () => {
    const session = {
      sessionId: "talk-1", cameraId: "camera-1", expiresAt: new Date(Date.now() + 30_000).toISOString(),
      adapter: "onvif-rtsp-backchannel",
      audio: {
        url: "http://192.168.1.20:8090/v1/talk/talk-1/audio",
        endUrl: "http://192.168.1.20:8090/v1/talk/talk-1",
        bearerToken: "edge-talk-token", contentType: "audio/L16;rate=8000;channels=1",
        codec: "PCMA", sampleRate: 8_000,
      },
    } as const;
    const requests: Array<{ input: string; init?: RequestInit }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ input: String(input), ...(init ? { init } : {}) });
      if (requests.length === 1) return Response.json({
        cameraId: "camera-1",
        direct: { url: "http://192.168.1.20:8090/v1/talk/start", controlPlaneToken: "control-token" },
      }, { status: 201 });
      if (requests.length === 2) return Response.json(session, { status: 201 });
      return new Response(null, { status: init?.method === "DELETE" ? 204 : 202 });
    }));

    const started = await startTalkFromBrowser("camera-1");
    await sendTalkAudio(started, new Uint8Array([0, 0, 1, 0]).buffer);
    await stopTalk(started);

    expect(requests[0]).toMatchObject({ input: "/api/talk", init: { method: "POST", credentials: "include" } });
    expect(JSON.parse(String(requests[1]?.init?.body))).toEqual({ controlPlaneToken: "control-token" });
    const audioHeaders = new Headers(requests[2]?.init?.headers);
    expect(audioHeaders.get("authorization")).toBe("Bearer edge-talk-token");
    expect(requests[3]?.init?.method).toBe("DELETE");
  });

  it("surfaces a safe capability error from the authorization endpoint", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(
      { error: "talkback_not_supported" }, { status: 422 },
    )));
    await expect(startTalkFromBrowser("camera-1")).rejects.toThrow("talkback_not_supported");
  });
});
