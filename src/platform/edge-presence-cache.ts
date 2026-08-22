import { createClient } from "redis";

export interface EdgePresence {
  edgeAgentId: string;
  version: string;
  publicMediaUrl?: string;
  observedAt: string;
}

export interface EdgePresenceCacheContract {
  markOnline(presence: EdgePresence): Promise<void>;
  get(edgeAgentId: string): Promise<EdgePresence | undefined>;
  ping(): Promise<void>;
  close(): Promise<void>;
}

/** Shared, expiring gateway presence for horizontally scaled API instances. */
export class RedisEdgePresenceCache implements EdgePresenceCacheContract {
  private readonly client;

  constructor(
    url: string,
    private readonly ttlSeconds = 90,
    private readonly prefix = "sentinel:edge-presence:",
  ) {
    this.client = createClient({ url });
  }

  async connect() {
    if (!this.client.isOpen) await this.client.connect();
    return this;
  }

  async markOnline(presence: EdgePresence) {
    await this.client.set(`${this.prefix}${presence.edgeAgentId}`, JSON.stringify(presence), {
      EX: this.ttlSeconds,
    });
  }

  async get(edgeAgentId: string) {
    const value = await this.client.get(`${this.prefix}${edgeAgentId}`);
    if (!value) return undefined;
    const parsed = JSON.parse(value) as Partial<EdgePresence>;
    return typeof parsed.edgeAgentId === "string" && typeof parsed.version === "string" &&
      typeof parsed.observedAt === "string" ? parsed as EdgePresence : undefined;
  }

  async ping() {
    if (await this.client.ping() !== "PONG") throw new Error("redis_ping_failed");
  }

  async close() {
    if (this.client.isOpen) await this.client.quit();
  }
}
