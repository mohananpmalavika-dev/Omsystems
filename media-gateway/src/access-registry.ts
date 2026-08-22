import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { MediaRouter } from "./contracts.js";

interface AccessSession {
  id: string;
  path: string;
  token: string;
  expiresAt: number;
}

export class AccessRegistry {
  private readonly sessions = new Map<string, AccessSession>();

  constructor(
    private readonly router: MediaRouter,
    private readonly ttlMs: number,
  ) {}

  issue(path: string) {
    const session: AccessSession = {
      id: randomUUID(),
      path,
      token: randomBytes(32).toString("base64url"),
      expiresAt: Date.now() + this.ttlMs,
    };
    this.sessions.set(session.id, session);
    const timer = setTimeout(() => void this.expire(session.id), this.ttlMs);
    timer.unref();
    return {
      id: session.id,
      token: session.token,
      expiresAt: new Date(session.expiresAt).toISOString(),
    };
  }

  authenticate(token: string, path: string, action: string) {
    if (action !== "read") return false;
    for (const session of this.sessions.values()) {
      if (
        session.path === path &&
        session.expiresAt > Date.now() &&
        secureEqual(session.token, token)
      ) return true;
    }
    return false;
  }

  private async expire(id: string) {
    const session = this.sessions.get(id);
    if (!session) return;
    this.sessions.delete(id);
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
