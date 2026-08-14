import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { ConsumedLiveSession } from "../registration/gateway-client.js";
import { openTalkback, TalkbackTransportError, type TalkbackConnection } from "./rtsp-backchannel.js";

export interface TalkSessionCompletion {
  sessionId: string;
  cameraId: string;
  userId: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  outcome: "success" | "failure";
  adapter: string;
  codec?: string;
  bytesSent?: number;
  error?: string;
}

interface ActiveTalkSession {
  id: string;
  cameraId: string;
  userId: string;
  token: string;
  startedAt: number;
  expiresAt: number;
  bytesSent: number;
  connection: TalkbackConnection;
  timer: NodeJS.Timeout;
}

export class TalkSessionRegistry {
  private readonly sessions = new Map<string, ActiveTalkSession>();
  private readonly cameraLeases = new Map<string, string>();

  constructor(
    private readonly ttlMs: number,
    private readonly onComplete: (completion: TalkSessionCompletion) => Promise<void> = async () => undefined,
    private readonly opener: typeof openTalkback = openTalkback,
  ) {}

  async start(consumed: ConsumedLiveSession, sourceUri: string) {
    if (consumed.purpose !== "talk") throw new TalkbackTransportError("invalid_talk_session", 403);
    if (this.cameraLeases.has(consumed.cameraId)) throw new TalkbackTransportError("talkback_busy", 409);
    this.cameraLeases.set(consumed.cameraId, "starting");
    let connection: TalkbackConnection;
    try {
      connection = await this.opener({
        sourceUri,
        ...(consumed.vendor ? { vendor: consumed.vendor } : {}),
        ...(consumed.model ? { model: consumed.model } : {}),
        ...(consumed.channel !== undefined ? { channel: consumed.channel } : {}),
        ...(consumed.recorderChannel !== undefined ? { recorderChannel: consumed.recorderChannel } : {}),
      });
    } catch (error) {
      this.cameraLeases.delete(consumed.cameraId);
      await this.onComplete({
        sessionId: consumed.id, cameraId: consumed.cameraId, userId: consumed.userId,
        startedAt: new Date().toISOString(), endedAt: new Date().toISOString(), durationMs: 0,
        outcome: "failure", adapter: "capability-negotiation",
        error: error instanceof Error ? error.message.slice(0, 300) : "talkback_start_failed",
      }).catch(() => undefined);
      throw error;
    }
    const now = Date.now();
    const session: ActiveTalkSession = {
      id: consumed.id, cameraId: consumed.cameraId, userId: consumed.userId,
      token: randomBytes(32).toString("base64url"), startedAt: now,
      expiresAt: now + this.ttlMs, bytesSent: 0, connection,
      timer: setTimeout(() => void this.stop(consumed.id, "success"), this.ttlMs),
    };
    session.timer.unref();
    this.sessions.set(session.id, session);
    this.cameraLeases.set(session.cameraId, session.id);
    return {
      id: session.id, cameraId: session.cameraId, token: session.token,
      expiresAt: new Date(session.expiresAt).toISOString(), adapter: connection.adapter,
      codec: connection.codec, sampleRate: connection.sampleRate,
    };
  }

  async append(id: string, token: string, pcm16le: Uint8Array) {
    const session = this.authorize(id, token);
    if (pcm16le.byteLength === 0 || pcm16le.byteLength > 32_000 || pcm16le.byteLength % 2 !== 0) {
      throw new TalkbackTransportError("invalid_audio_chunk", 400);
    }
    await session.connection.writePcm(pcm16le);
    session.bytesSent += pcm16le.byteLength;
  }

  async stop(id: string, outcome: "success" | "failure" = "success", error?: string) {
    const session = this.sessions.get(id);
    if (!session) return false;
    this.sessions.delete(id); this.cameraLeases.delete(session.cameraId); clearTimeout(session.timer);
    await session.connection.close().catch(() => undefined);
    const endedAt = Date.now();
    await this.onComplete({
      sessionId: session.id, cameraId: session.cameraId, userId: session.userId,
      startedAt: new Date(session.startedAt).toISOString(), endedAt: new Date(endedAt).toISOString(),
      durationMs: endedAt - session.startedAt, outcome, adapter: session.connection.adapter,
      codec: session.connection.codec, bytesSent: session.bytesSent,
      ...(error ? { error: error.slice(0, 300) } : {}),
    }).catch(() => undefined);
    return true;
  }

  authorize(id: string, token: string) {
    const session = this.sessions.get(id);
    if (!session || session.expiresAt <= Date.now() || !secureEqual(session.token, token)) {
      throw new TalkbackTransportError("invalid_talk_access", 401);
    }
    return session;
  }

  async close() { await Promise.all([...this.sessions.keys()].map((id) => this.stop(id, "failure", "edge_gateway_stopped"))); }
}

function secureEqual(left: string, right: string) {
  const supplied = Buffer.from(left); const expected = Buffer.from(right);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
