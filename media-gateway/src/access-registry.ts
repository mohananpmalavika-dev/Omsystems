import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { MediaRouter } from "./contracts.js";

interface AccessSession {
  id: string;
  path: string;
  token: string;
  action: "read" | "publish" | "both";
  expiresAt: number;
}

export class AccessRegistry {
  private readonly sessions = new Map<string, AccessSession>();
  private readonly sessionsByToken = new Map<string, string>();

  constructor(
    private readonly router: MediaRouter,
    private readonly ttlMs: number,
  ) {}

  issue(path: string, action: "read" | "publish" | "both" = "read") {
    const session: AccessSession = {
      id: randomUUID(),
      path,
      token: randomBytes(32).toString("base64url"),
      action,
      expiresAt: Date.now() + this.ttlMs,
    };
    this.sessions.set(session.id, session);
    this.sessionsByToken.set(session.token, session.id);
    const timer = setTimeout(() => void this.expire(session.id), this.ttlMs);
    timer.unref();
    return {
      id: session.id,
      token: session.token,
      action: session.action,
      expiresAt: new Date(session.expiresAt).toISOString(),
    };
  }

  authenticate(token: string, path: string, action: string) {
    const sessionId = this.sessionsByToken.get(token);
    const session = sessionId ? this.sessions.get(sessionId) : undefined;
    return Boolean(session && session.path === path && session.expiresAt > Date.now() &&
      (session.action === "both" || session.action === action) && secureEqual(session.token, token));
  }

  async release(id: string, token: string): Promise<boolean> {
    const session = this.sessions.get(id);
    if (!session || !secureEqual(session.token, token)) return false;
    await this.expire(id);
    return true;
  }

  private async expire(id: string) {
    const session = this.sessions.get(id);
    if (!session) return;
    this.sessions.delete(id);
    this.sessionsByToken.delete(session.token);
    const pathStillUsed = [...this.sessions.values()].some(
      (item) => item.path === session.path && item.expiresAt > Date.now(),
    );
    if (!pathStillUsed) await this.router.removePath(session.path);
  }
}

function secureEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer);
}
