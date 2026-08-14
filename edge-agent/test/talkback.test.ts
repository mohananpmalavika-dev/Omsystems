import { createServer, type Socket } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { encodeG711 } from "../src/talkback/g711.js";
import { openTalkback, talkbackCandidates } from "../src/talkback/rtsp-backchannel.js";
import { TalkSessionRegistry } from "../src/talkback/talk-session-registry.js";

describe("multi-vendor talkback", () => {
  const servers: Array<ReturnType<typeof createServer>> = [];
  afterEach(async () => Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve())))));

  it("encodes signed PCM as the negotiated G.711 variant", () => {
    const pcm = new Uint8Array(new Int16Array([0, 1000, -1000]).buffer);
    expect([...encodeG711(pcm, "PCMA")]).toEqual([0xd5, 0xfa, 0x7a]);
    expect([...encodeG711(pcm, "PCMU")]).toEqual([0xff, 0xce, 0x4e]);
  });

  it("keeps standards first and adds a CP PLUS/Dahua private fallback", () => {
    const candidates = talkbackCandidates({
      sourceUri: "rtsp://user:pass@192.168.1.20/cam/realmonitor?channel=3&subtype=0",
      vendor: "cp-plus", recorderChannel: 3,
    });
    expect(candidates.map((item) => item.adapter)).toEqual([
      "onvif-rtsp-backchannel", "dahua-private3-talkback",
    ]);
    expect(candidates[1]?.uri).toContain("/live/talk.xav");
    expect(candidates[1]?.uri).toContain("channel=3");
  });

  it("negotiates an ONVIF send-only track and sends interleaved G.711 RTP", async () => {
    const requests: string[] = []; const media: Buffer[] = [];
    const server = createServer((socket) => serveRtsp(socket, requests, media)); servers.push(server);
    const port = await new Promise<number>((resolve) => server.listen(0, "127.0.0.1", () => resolve((server.address() as any).port)));
    const connection = await openTalkback({ sourceUri: `rtsp://operator:secret@127.0.0.1:${port}/stream` });
    await connection.writePcm(new Uint8Array(new Int16Array([0, 1000, -1000]).buffer));
    await new Promise((resolve) => setTimeout(resolve, 10));
    await connection.close();
    expect(requests.some((request) => request.includes("Require: www.onvif.org/ver20/backchannel"))).toBe(true);
    expect(requests.some((request) => request.includes("Authorization: Basic"))).toBe(true);
    expect(media[0]?.[0]).toBe(0x24);
    expect(media[0]?.[4]).toBe(0x80);
    expect(media[0]?.subarray(-3)).toEqual(Buffer.from([0xd5, 0xfa, 0x7a]));
  });

  it("holds one exclusive camera lease and records completion", async () => {
    const completions: any[] = [];
    const close = vi.fn(async () => undefined); const writePcm = vi.fn(async () => undefined);
    const registry = new TalkSessionRegistry(30_000, async (item) => { completions.push(item); }, async () => ({
      adapter: "test-adapter", codec: "PCMA", sampleRate: 8000, writePcm, close,
    }));
    const consumed = {
      id: "talk-1", cameraId: "camera-1", cameraNodeId: "node-1", userId: "user-1",
      tenantId: "tenant-1", connectionSecretRef: "edge://secret", profiles: [], purpose: "talk" as const,
    };
    const first = await registry.start(consumed, "rtsp://user:pass@camera/stream");
    await expect(registry.start({ ...consumed, id: "talk-2" }, "rtsp://user:pass@camera/stream"))
      .rejects.toMatchObject({ code: "talkback_busy" });
    await registry.append(first.id, first.token, new Uint8Array([0, 0, 1, 0]));
    await registry.stop(first.id);
    expect(writePcm).toHaveBeenCalledOnce(); expect(close).toHaveBeenCalledOnce();
    expect(completions[0]).toMatchObject({ cameraId: "camera-1", userId: "user-1", outcome: "success", bytesSent: 4 });
  });
});

function serveRtsp(socket: Socket, requests: string[], media: Buffer[]) {
  let buffer = Buffer.alloc(0); let authenticated = false;
  socket.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length) {
      if (buffer[0] === 0x24) {
        if (buffer.length < 4) return;
        const size = buffer.readUInt16BE(2); if (buffer.length < size + 4) return;
        media.push(buffer.subarray(0, size + 4)); buffer = buffer.subarray(size + 4); continue;
      }
      const end = buffer.indexOf("\r\n\r\n"); if (end < 0) return;
      const request = buffer.subarray(0, end + 4).toString("utf8"); buffer = buffer.subarray(end + 4);
      requests.push(request); const cseq = request.match(/CSeq:\s*(\d+)/i)?.[1] ?? "1";
      if (request.startsWith("DESCRIBE") && !authenticated) {
        authenticated = true; socket.write(`RTSP/1.0 401 Unauthorized\r\nCSeq: ${cseq}\r\nWWW-Authenticate: Basic realm="camera"\r\nContent-Length: 0\r\n\r\n`); continue;
      }
      if (request.startsWith("DESCRIBE")) {
        const sdp = "v=0\r\na=control:*\r\nm=audio 0 RTP/AVP 8\r\na=rtpmap:8 PCMA/8000\r\na=sendonly\r\na=control:trackID=1\r\n";
        socket.write(`RTSP/1.0 200 OK\r\nCSeq: ${cseq}\r\nContent-Base: rtsp://127.0.0.1/stream/\r\nContent-Length: ${Buffer.byteLength(sdp)}\r\n\r\n${sdp}`); continue;
      }
      if (request.startsWith("SETUP")) {
        socket.write(`RTSP/1.0 200 OK\r\nCSeq: ${cseq}\r\nSession: session-1;timeout=60\r\nTransport: RTP/AVP/TCP;unicast;interleaved=2-3\r\nContent-Length: 0\r\n\r\n`); continue;
      }
      socket.write(`RTSP/1.0 200 OK\r\nCSeq: ${cseq}\r\nSession: session-1\r\nContent-Length: 0\r\n\r\n`);
    }
  });
}
