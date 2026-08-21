/**
 * Reference-counted browser live-view grants.
 *
 * Every session comes from the authenticated `/api/live` gateway flow. The
 * manager never manufactures an ID, URL, expiry, or successful renewal.
 */

import { startLiveFromBrowser } from "../live-client";
import type { LiveSessionResponse } from "../types";

export interface LiveSession {
  cameraId: string;
  sessionId: string;
  playbackUrl: string;
  quality: "SUB" | "MAIN";
  transport: "WEBRTC" | "HLS" | "MSE";
  startedAt: number;
  expiresAt: number;
  state: "STARTING" | "ACTIVE" | "RENEWING" | "FAILED" | "TERMINATED";
  error?: string;
}

export type LiveSessionStarter = (
  cameraId: string,
  profile: "main" | "sub",
) => Promise<LiveSessionResponse>;

export class LiveSessionManager {
  private sessions = new Map<string, LiveSession>();
  private consumers = new Map<string, Set<string>>();
  private expiryTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(private readonly startSession: LiveSessionStarter = startLiveFromBrowser) {}

  async acquire(
    cameraId: string,
    consumerId = "default-consumer",
    quality: "SUB" | "MAIN" = "SUB",
    preferredTransport: "WEBRTC" | "HLS" = "WEBRTC",
  ): Promise<LiveSession> {
    const existing = this.sessions.get(cameraId);
    if (existing?.state === "ACTIVE" && existing.quality === quality) {
      this.addConsumer(cameraId, consumerId);
      return existing;
    }

    const response = await this.startSession(cameraId, quality === "MAIN" ? "main" : "sub");
    const session = toLiveSession(cameraId, quality, preferredTransport, response);

    this.sessions.set(cameraId, session);
    this.addConsumer(cameraId, consumerId);
    this.scheduleExpiry(cameraId, session.expiresAt);
    return session;
  }

  /**
   * `/api/live` authorizes a short-lived grant; it has no fake renewal path.
   * Callers must reacquire after a false return or an expired session.
   */
  async renew(cameraId: string): Promise<boolean> {
    const session = this.sessions.get(cameraId);
    if (!session || session.state !== "ACTIVE" || session.expiresAt <= Date.now()) {
      this.markExpired(cameraId);
      return false;
    }
    return false;
  }

  /**
   * Releases a local viewer reference. Playback closes when its video element
   * is detached; no non-existent backend teardown endpoint is called.
   */
  async release(cameraId: string, consumerId = "default-consumer"): Promise<boolean> {
    const consumerSet = this.consumers.get(cameraId);
    if (consumerSet) {
      consumerSet.delete(consumerId);
      if (consumerSet.size > 0) return false;
      this.consumers.delete(cameraId);
    }

    this.clearSession(cameraId, "TERMINATED");
    return true;
  }

  async switchProfile(cameraId: string, quality: "SUB" | "MAIN", consumerId = "default-consumer"): Promise<LiveSession> {
    await this.release(cameraId, consumerId);
    return this.acquire(cameraId, consumerId, quality);
  }

  getSession(cameraId: string): LiveSession | undefined {
    const session = this.sessions.get(cameraId);
    if (session && session.expiresAt <= Date.now()) {
      this.markExpired(cameraId);
      return undefined;
    }
    return session;
  }

  getConsumerCount(cameraId: string): number {
    return this.consumers.get(cameraId)?.size ?? 0;
  }

  releaseAll(): void {
    for (const cameraId of this.sessions.keys()) this.clearSession(cameraId, "TERMINATED");
    this.consumers.clear();
  }

  private addConsumer(cameraId: string, consumerId: string): void {
    const consumers = this.consumers.get(cameraId) ?? new Set<string>();
    consumers.add(consumerId);
    this.consumers.set(cameraId, consumers);
  }

  private scheduleExpiry(cameraId: string, expiresAt: number): void {
    const previous = this.expiryTimers.get(cameraId);
    if (previous) clearTimeout(previous);
    this.expiryTimers.set(cameraId, setTimeout(() => this.markExpired(cameraId), Math.max(0, expiresAt - Date.now())));
  }

  private markExpired(cameraId: string): void {
    const session = this.sessions.get(cameraId);
    if (!session) return;
    session.state = "FAILED";
    session.error = "live_session_expired";
    this.expiryTimers.delete(cameraId);
  }

  private clearSession(cameraId: string, state: LiveSession["state"]): void {
    const timer = this.expiryTimers.get(cameraId);
    if (timer) clearTimeout(timer);
    this.expiryTimers.delete(cameraId);
    const session = this.sessions.get(cameraId);
    if (session) session.state = state;
    this.sessions.delete(cameraId);
  }
}

function toLiveSession(
  cameraId: string,
  quality: "SUB" | "MAIN",
  preferredTransport: "WEBRTC" | "HLS",
  response: LiveSessionResponse,
): LiveSession {
  if (response.cameraId !== cameraId || !response.sessionId || !response.expiresAt) {
    throw new Error("invalid_live_session_response");
  }
  const expiresAt = Date.parse(response.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) throw new Error("invalid_live_session_response");

  const hls = response.hls;
  const webRtc = response.webRtc;
  const useHls = preferredTransport === "HLS" ? Boolean(hls) : !webRtc && Boolean(hls);
  const playbackUrl = useHls ? hls?.url : webRtc?.whepUrl;
  if (!playbackUrl) throw new Error("live_stream_url_unavailable");

  return {
    cameraId,
    sessionId: response.sessionId,
    playbackUrl,
    quality,
    transport: useHls ? "HLS" : "WEBRTC",
    startedAt: Date.now(),
    expiresAt,
    state: "ACTIVE",
  };
}

export const liveSessionManager = new LiveSessionManager();
