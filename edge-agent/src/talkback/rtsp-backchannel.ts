import { createHash, randomBytes, randomInt } from "node:crypto";
import { connect as connectTcp, type Socket } from "node:net";
import { connect as connectTls, type TLSSocket } from "node:tls";
import { encodeG711, type G711Codec } from "./g711.js";

export interface TalkbackDeviceContext {
  sourceUri: string;
  vendor?: "hikvision" | "cp-plus" | "other";
  model?: string;
  channel?: number;
  recorderChannel?: number;
}

export interface TalkbackConnection {
  adapter: string;
  codec: G711Codec;
  sampleRate: 8000;
  writePcm(pcm16le: Uint8Array): Promise<void>;
  close(): Promise<void>;
}

export class TalkbackTransportError extends Error {
  constructor(readonly code: string, readonly status = 502, message = code) { super(message); }
}

type PacketMode = "rtp" | "dhav";
type Candidate = { uri: string; adapter: string; requireOnvif: boolean; transport: "RTP/AVP/TCP" | "DH/AVP/TCP"; packetMode: PacketMode };

export async function openTalkback(context: TalkbackDeviceContext): Promise<TalkbackConnection> {
  const candidates = talkbackCandidates(context);
  const failures: string[] = [];
  for (const candidate of candidates) {
    try { return await RtspTalkbackConnection.open(candidate); }
    catch (error) {
      failures.push(error instanceof TalkbackTransportError ? error.code : "talkback_transport_failed");
    }
  }
  const code = failures.includes("device_credentials_rejected")
    ? "device_credentials_rejected"
    : failures.includes("talkback_busy") ? "talkback_busy" : "talkback_not_supported";
  throw new TalkbackTransportError(code, code === "talkback_busy" ? 409 : code === "device_credentials_rejected" ? 401 : 422, failures.join(","));
}

export function talkbackCandidates(context: TalkbackDeviceContext): Candidate[] {
  const source = new URL(context.sourceUri);
  const base: Candidate = {
    uri: context.sourceUri,
    adapter: "onvif-rtsp-backchannel",
    requireOnvif: true,
    transport: "RTP/AVP/TCP",
    packetMode: "rtp",
  };
  if (context.vendor !== "cp-plus" && !/cam\/realmonitor|live\/talk\.xav/i.test(source.pathname)) return [base];
  const channel = context.recorderChannel ?? context.channel ?? (Number(source.searchParams.get("channel")) || 1);
  const privateUri = new URL(context.sourceUri);
  privateUri.pathname = "/live/talk.xav";
  privateUri.search = new URLSearchParams({
    channel: String(Math.max(1, channel)), subtype: "5", proto: "Private3", level: "1",
  }).toString();
  return [base, {
    uri: privateUri.toString(),
    adapter: "dahua-private3-talkback",
    requireOnvif: false,
    transport: "DH/AVP/TCP",
    packetMode: "dhav",
  }];
}

class RtspTalkbackConnection implements TalkbackConnection {
  readonly sampleRate = 8000 as const;
  private sequence = randomInt(0, 0xffff);
  private timestamp = randomInt(0, 0xffffffff);
  private readonly ssrc = randomInt(0, 0xffffffff);
  private dhavSequence = 0xf5;
  private dhavElapsedMs = 0;
  private lastDhavAt = Date.now();
  private closed = false;

  private constructor(
    readonly adapter: string,
    readonly codec: G711Codec,
    private readonly payloadType: number,
    private readonly interleavedChannel: number,
    private readonly sessionId: string,
    private readonly aggregateUri: string,
    private readonly packetMode: PacketMode,
    private readonly control: RtspControlConnection,
  ) {}

  static async open(candidate: Candidate) {
    const endpoint = parsedEndpoint(candidate.uri);
    const control = await RtspControlConnection.open(endpoint);
    try {
      const describeHeaders: Record<string, string> = { Accept: "application/sdp" };
      if (candidate.requireOnvif) describeHeaders.Require = "www.onvif.org/ver20/backchannel";
      const describe = await control.request("DESCRIBE", endpoint.requestUri, describeHeaders);
      if (describe.status === 453 || /busy/i.test(describe.body)) throw new TalkbackTransportError("talkback_busy", 409);
      if (describe.status < 200 || describe.status >= 300) throw new TalkbackTransportError("talkback_not_supported", 422, `DESCRIBE ${describe.status}`);
      const track = selectBackchannelTrack(describe.body, endpoint.requestUri, describe.headers.get("content-base"), candidate.packetMode);
      const setup = await control.request("SETUP", track.controlUri, {
        Transport: `${candidate.transport};unicast;interleaved=0-1;mode=record`,
      });
      if (setup.status === 453 || /busy/i.test(setup.body)) throw new TalkbackTransportError("talkback_busy", 409);
      if (setup.status < 200 || setup.status >= 300) throw new TalkbackTransportError("talkback_not_supported", 422, `SETUP ${setup.status}`);
      const sessionId = (setup.headers.get("session") ?? "").split(";")[0]?.trim() ?? "";
      if (!sessionId) throw new TalkbackTransportError("talkback_protocol_error", 502, "SETUP did not return a session");
      const transport = setup.headers.get("transport") ?? "";
      const channel = Number(transport.match(/interleaved=(\d+)-/i)?.[1] ?? 0);
      const play = await control.request("PLAY", endpoint.requestUri, { Session: sessionId });
      if (play.status < 200 || play.status >= 300) throw new TalkbackTransportError("talkback_not_supported", 422, `PLAY ${play.status}`);
      return new RtspTalkbackConnection(
        candidate.adapter, track.codec, track.payloadType, channel, sessionId,
        endpoint.requestUri, candidate.packetMode, control,
      );
    } catch (error) {
      await control.close();
      throw error;
    }
  }

  async writePcm(pcm16le: Uint8Array) {
    if (this.closed) throw new TalkbackTransportError("talkback_session_closed", 410);
    const encoded = encodeG711(pcm16le, this.codec);
    const packet = this.packetMode === "dhav" ? this.packetizeDhav(encoded) : this.packetizeRtp(encoded);
    await this.control.write(packet);
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    await this.control.request("TEARDOWN", this.aggregateUri, { Session: this.sessionId }).catch(() => undefined);
    await this.control.close();
  }

  private packetizeRtp(payload: Uint8Array) {
    const rtp = Buffer.allocUnsafe(12 + payload.byteLength);
    rtp[0] = 0x80;
    rtp[1] = this.payloadType & 0x7f;
    rtp.writeUInt16BE(this.sequence++ & 0xffff, 2);
    rtp.writeUInt32BE(this.timestamp >>> 0, 4);
    rtp.writeUInt32BE(this.ssrc >>> 0, 8);
    Buffer.from(payload).copy(rtp, 12);
    this.timestamp = (this.timestamp + payload.byteLength) >>> 0;
    return interleaved(this.interleavedChannel, rtp);
  }

  private packetizeDhav(payload: Uint8Array) {
    const length = 40 + payload.byteLength + 8;
    const packet = Buffer.alloc(6 + length);
    packet[0] = 0x24; packet[1] = this.interleavedChannel;
    packet.writeUInt32BE(length, 2);
    packet.write("DHAV", 6, "ascii");
    packet.set([0xf0, 0, 1, 0], 10);
    this.dhavSequence = this.dhavSequence > 0xffff ? 0xf0 : this.dhavSequence;
    packet.writeUInt32LE(this.dhavSequence++, 14);
    packet.writeUInt32LE(length, 18);
    const now = new Date();
    const packedTime = ((now.getFullYear() - 2000) << 26) + ((now.getMonth() + 1) << 22) +
      (now.getDate() << 17) + (now.getHours() << 12) + (now.getMinutes() << 6) + now.getSeconds();
    packet.writeUInt32LE(packedTime >>> 0, 22);
    const current = Date.now();
    this.dhavElapsedMs = (this.dhavElapsedMs + current - this.lastDhavAt) & 0xffff;
    this.lastDhavAt = current;
    packet.writeUInt16LE(this.dhavElapsedMs, 26);
    packet[28] = 16;
    packet[29] = checksum(packet.subarray(6, 29));
    packet.set([131, 1, this.codec === "PCMA" ? 14 : 10, 2, 150, 1, 0, 0, 136], 30);
    packet.writeUInt32LE(checksum(payload), 39);
    Buffer.from(payload).copy(packet, 46);
    const trailer = 46 + payload.byteLength;
    packet.write("dhav", trailer, "ascii");
    packet.writeUInt32LE(length, trailer + 4);
    return packet;
  }
}

class RtspControlConnection {
  private buffer = Buffer.alloc(0);
  private waiters: Array<() => void> = [];
  private cseq = 0;
  private auth?: AuthChallenge;
  private nonceCount = 0;
  private closed = false;

  private constructor(private readonly socket: Socket | TLSSocket, private readonly endpoint: Endpoint) {
    socket.on("data", (chunk) => { this.buffer = Buffer.concat([this.buffer, chunk]); this.flushWaiters(); });
    socket.on("close", () => { this.closed = true; this.flushWaiters(); });
  }

  static async open(endpoint: Endpoint) {
    const socket = await new Promise<Socket | TLSSocket>((resolve, reject) => {
      const connected = () => { client.off("error", reject); resolve(client); };
      const client = endpoint.secure
        ? connectTls({
            host: endpoint.host,
            port: endpoint.port,
            servername: endpoint.host,
            rejectUnauthorized: process.env.NODE_ENV === "production" ? true : false,
            minVersion: "TLSv1.2",
          }, connected)
        : connectTcp({ host: endpoint.host, port: endpoint.port }, connected);
      client.setTimeout(8_000, () => client.destroy(new Error("rtsp_timeout")));
      client.once("error", reject);
    });
    return new RtspControlConnection(socket, endpoint);
  }


  async request(method: string, uri: string, headers: Record<string, string> = {}, body = ""): Promise<RtspResponse> {
    let response = await this.send(method, uri, headers, body);
    if (response.status !== 401) return response;
    const challenge = response.headers.get("www-authenticate");
    if (!challenge || !this.endpoint.username) throw new TalkbackTransportError("device_credentials_rejected", 401);
    this.auth = parseAuthChallenge(challenge);
    response = await this.send(method, uri, headers, body);
    if (response.status === 401 || response.status === 403) throw new TalkbackTransportError("device_credentials_rejected", 401);
    return response;
  }

  async write(data: Uint8Array) {
    if (this.closed) throw new TalkbackTransportError("talkback_transport_closed", 502);
    await new Promise<void>((resolve, reject) => this.socket.write(data, (error) => error ? reject(error) : resolve()));
  }

  async close() { if (!this.closed) this.socket.end(); }

  private async send(method: string, uri: string, headers: Record<string, string>, body: string) {
    const cseq = ++this.cseq;
    const authorization = this.auth ? buildAuthorization(
      this.auth, method, uri, this.endpoint.username, this.endpoint.password, ++this.nonceCount,
    ) : undefined;
    const lines = [`${method} ${uri} RTSP/1.0`, `CSeq: ${cseq}`, "User-Agent: Sentinel-Grid-Edge/0.1.8"];
    if (authorization) lines.push(`Authorization: ${authorization}`);
    for (const [name, value] of Object.entries(headers)) lines.push(`${name}: ${value}`);
    if (body) lines.push(`Content-Length: ${Buffer.byteLength(body)}`);
    await this.write(Buffer.from(`${lines.join("\r\n")}\r\n\r\n${body}`, "utf8"));
    return this.readResponse(cseq);
  }

  private async readResponse(cseq: number) {
    const deadline = Date.now() + 8_000;
    while (Date.now() < deadline) {
      while (this.buffer[0] === 0x24 && this.buffer.length >= 4) {
        const size = this.buffer.readUInt16BE(2);
        if (this.buffer.length < 4 + size) break;
        this.buffer = this.buffer.subarray(4 + size);
      }
      const headerEnd = this.buffer.indexOf("\r\n\r\n");
      if (headerEnd >= 0) {
        const headerText = this.buffer.subarray(0, headerEnd).toString("utf8");
        const contentLength = Number(headerText.match(/\r\nContent-Length:\s*(\d+)/i)?.[1] ?? 0);
        const total = headerEnd + 4 + contentLength;
        if (this.buffer.length >= total) {
          const raw = this.buffer.subarray(0, total);
          this.buffer = this.buffer.subarray(total);
          const response = parseRtspResponse(raw);
          if (Number(response.headers.get("cseq")) === cseq) return response;
        }
      }
      if (this.closed) throw new TalkbackTransportError("talkback_transport_closed", 502);
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, Math.min(250, Math.max(1, deadline - Date.now())));
        this.waiters.push(() => { clearTimeout(timer); resolve(); });
      });
    }
    throw new TalkbackTransportError("talkback_transport_timeout", 504);
  }

  private flushWaiters() { for (const waiter of this.waiters.splice(0)) waiter(); }
}

interface Endpoint { secure: boolean; host: string; port: number; username: string; password: string; requestUri: string }
interface RtspResponse { status: number; headers: Map<string, string>; body: string }
type AuthChallenge = { scheme: "basic" } | { scheme: "digest"; realm: string; nonce: string; qop?: string; opaque?: string; algorithm?: string };

function parsedEndpoint(uri: string): Endpoint {
  const url = new URL(uri);
  if (url.protocol !== "rtsp:" && url.protocol !== "rtsps:") throw new TalkbackTransportError("talkback_invalid_source_uri", 422);
  const username = decodeURIComponent(url.username);
  const password = decodeURIComponent(url.password);
  url.username = ""; url.password = "";
  return { secure: url.protocol === "rtsps:", host: url.hostname, port: Number(url.port || (url.protocol === "rtsps:" ? 322 : 554)), username, password, requestUri: url.toString() };
}

function parseRtspResponse(raw: Buffer): RtspResponse {
  const split = raw.indexOf("\r\n\r\n");
  const headerText = raw.subarray(0, split).toString("utf8");
  const lines = headerText.split("\r\n");
  const status = Number(lines[0]?.match(/^RTSP\/\d\.\d\s+(\d+)/)?.[1] ?? 0);
  const headers = new Map<string, string>();
  for (const line of lines.slice(1)) {
    const colon = line.indexOf(":");
    if (colon > 0) headers.set(line.slice(0, colon).trim().toLowerCase(), line.slice(colon + 1).trim());
  }
  return { status, headers, body: raw.subarray(split + 4).toString("utf8") };
}

function selectBackchannelTrack(sdp: string, aggregateUri: string, contentBase: string | undefined, packetMode: PacketMode) {
  const normalized = sdp.replace(/\r\n/g, "\n");
  const sessionControl = normalized.split("\nm=")[0]?.match(/(?:^|\n)a=control:([^\n]+)/)?.[1]?.trim();
  const media = normalized.split(/\nm=/).slice(1).map((part) => `m=${part}`);
  const candidates = media.filter((section) => /^m=audio\s/im.test(section) && /(?:^|\n)a=sendonly\s*(?:\n|$)/im.test(section));
  const selected = candidates.find((section) => /a=rtpmap:\d+\s+PCMA\/8000/i.test(section)) ??
    candidates.find((section) => /a=rtpmap:\d+\s+PCMU\/8000/i.test(section)) ??
    (packetMode === "dhav" ? media.find((section) => /^m=audio\s/im.test(section)) : undefined);
  if (!selected) throw new TalkbackTransportError("talkback_not_supported", 422, "No G.711 send-only backchannel was advertised");
  const mapping = selected.match(/a=rtpmap:(\d+)\s+(PCMA|PCMU)\/8000/i);
  const codec = (mapping?.[2]?.toUpperCase() === "PCMU" ? "PCMU" : "PCMA") as G711Codec;
  const payloadType = Number(mapping?.[1] ?? (codec === "PCMA" ? 8 : 0));
  const control = selected.match(/(?:^|\n)a=control:([^\n]+)/)?.[1]?.trim() ?? sessionControl;
  if (!control) throw new TalkbackTransportError("talkback_protocol_error", 502, "Backchannel track has no control URI");
  return { codec, payloadType, controlUri: resolveControlUri(control, contentBase ?? aggregateUri) };
}

function resolveControlUri(control: string, base: string) {
  if (/^rtsp[s]?:\/\//i.test(control)) return control;
  if (control === "*") return base;
  const normalized = base.endsWith("/") ? base : `${base}/`;
  return new URL(control, normalized).toString();
}

function parseAuthChallenge(value: string): AuthChallenge {
  if (/^basic\b/i.test(value)) return { scheme: "basic" };
  if (!/^digest\b/i.test(value)) throw new TalkbackTransportError("device_authentication_unsupported", 422);
  const fields = new Map<string, string>();
  for (const match of value.slice(6).matchAll(/([a-z][a-z0-9_-]*)\s*=\s*(?:"([^"]*)"|([^,\s]+))/gi)) {
    fields.set(match[1]!.toLowerCase(), match[2] ?? match[3] ?? "");
  }
  const realm = fields.get("realm"); const nonce = fields.get("nonce");
  if (!realm || !nonce) throw new TalkbackTransportError("device_authentication_unsupported", 422);
  const qop = fields.get("qop"); const opaque = fields.get("opaque"); const algorithm = fields.get("algorithm");
  return {
    scheme: "digest", realm, nonce,
    ...(qop ? { qop } : {}), ...(opaque ? { opaque } : {}), ...(algorithm ? { algorithm } : {}),
  };
}

function buildAuthorization(challenge: AuthChallenge, method: string, uri: string, username: string, password: string, count: number) {
  if (challenge.scheme === "basic") return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
  const algorithm = challenge.algorithm?.toUpperCase() ?? "MD5";
  if (algorithm !== "MD5" && algorithm !== "MD5-SESS") throw new TalkbackTransportError("device_authentication_unsupported", 422);
  const cnonce = randomBytes(8).toString("hex");
  const nc = count.toString(16).padStart(8, "0");
  const baseHa1 = md5(`${username}:${challenge.realm}:${password}`);
  const ha1 = algorithm === "MD5-SESS" ? md5(`${baseHa1}:${challenge.nonce}:${cnonce}`) : baseHa1;
  const ha2 = md5(`${method}:${uri}`);
  const supportsAuth = challenge.qop?.split(",").map((item) => item.trim()).includes("auth") ?? false;
  const response = supportsAuth ? md5(`${ha1}:${challenge.nonce}:${nc}:${cnonce}:auth:${ha2}`) : md5(`${ha1}:${challenge.nonce}:${ha2}`);
  const parts = [`username="${escapeQuoted(username)}"`, `realm="${escapeQuoted(challenge.realm)}"`, `nonce="${escapeQuoted(challenge.nonce)}"`, `uri="${escapeQuoted(uri)}"`, `response="${response}"`, `algorithm=${algorithm}`];
  if (supportsAuth) parts.push("qop=auth", `nc=${nc}`, `cnonce="${cnonce}"`);
  if (challenge.opaque) parts.push(`opaque="${escapeQuoted(challenge.opaque)}"`);
  return `Digest ${parts.join(", ")}`;
}

function md5(value: string) { return createHash("md5").update(value).digest("hex"); }
function escapeQuoted(value: string) { return value.replace(/["\\]/g, "\\$&"); }
function interleaved(channel: number, rtp: Buffer) { const frame = Buffer.allocUnsafe(4 + rtp.length); frame[0] = 0x24; frame[1] = channel; frame.writeUInt16BE(rtp.length, 2); rtp.copy(frame, 4); return frame; }
function checksum(value: Uint8Array) { let sum = 0; for (const byte of value) sum = (sum + byte) >>> 0; return sum; }
