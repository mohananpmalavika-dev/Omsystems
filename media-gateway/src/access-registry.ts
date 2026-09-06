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
  private readonly timers = new Map<string, NodeJS.Timeout>();
  // These queues serialize mutations of this process's MediaMTX connections.
  // They are not distributed camera ownership or viewer-budget leases.
  private readonly pathOperations = new Map<string, Promise<unknown>>();

  constructor(
    private readonly router: MediaRouter,
    private readonly ttlMs: number,
    private readonly onCleanupError: (error: unknown) => void = () => undefined,
  ) {}

  async start(path: string, sourceUri: string, action: "read" | "publish" = "read") {
    return this.withPath(path, async () => {
      await this.router.ensurePath(path, sourceUri);
      return this.issue(path, action);
    });
  }

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
    const timer = setTimeout(() => {
      void this.expire(session.id).catch(this.onCleanupError);
    }, this.ttlMs);
    timer.unref();
    this.timers.set(session.id, timer);
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
      (action === "read" || action === "publish") &&
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
    return this.withPath(session.path, async () => {
      if (!this.sessions.delete(id)) return;
      this.sessionsByToken.delete(session.token);
      clearTimeout(this.timers.get(id));
      this.timers.delete(id);
      const pathStillUsed = [...this.sessions.values()].some(
        (item) => item.path === session.path && item.expiresAt > Date.now(),
      );
      if (!pathStillUsed) await this.router.removePath(session.path);
    });
  }

  async close() {
    const results = await Promise.allSettled([...this.sessions.keys()].map((id) => this.expire(id)));
    for (const result of results) {
      if (result.status === "rejected") this.onCleanupError(result.reason);
    }
  }

  private async withPath<T>(path: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.pathOperations.get(path) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(operation);
    this.pathOperations.set(path, current);
    try {
      return await current;
    } finally {
      if (this.pathOperations.get(path) === current) this.pathOperations.delete(path);
    }
  }
}

function secureEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer);
}
