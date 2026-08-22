import { describe, expect, it } from "vitest";
import { hasFreshEdgeHeartbeat, isFreshEdgeAgent } from "../src/edge-agent/presence.js";

describe("edge-agent presence", () => {
  const now = Date.parse("2026-08-21T11:00:00.000Z");

  it("accepts a heartbeat inside the 90-second window", () => {
    expect(hasFreshEdgeHeartbeat("2026-08-21T10:58:31.000Z", now)).toBe(true);
    expect(isFreshEdgeAgent({ status: "online", lastSeenAt: new Date().toISOString() })).toBe(true);
  });

  it("rejects stale, missing, and malformed heartbeats", () => {
    expect(hasFreshEdgeHeartbeat("2026-08-21T10:58:29.999Z", now)).toBe(false);
    expect(hasFreshEdgeHeartbeat(null, now)).toBe(false);
    expect(hasFreshEdgeHeartbeat("not-a-date", now)).toBe(false);
    expect(isFreshEdgeAgent({ status: "offline", lastSeenAt: "2026-08-21T10:59:59.000Z" })).toBe(false);
  });
});
