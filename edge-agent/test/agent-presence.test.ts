import { afterEach, describe, expect, it, vi } from "vitest";
import { startAgentPresenceHeartbeat } from "../src/runtime/agent-presence.js";

describe("edge-agent presence heartbeat", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("continues heartbeats while the main worker is occupied", async () => {
    vi.useFakeTimers();
    const heartbeat = vi.fn().mockResolvedValue(undefined);
    const loop = startAgentPresenceHeartbeat({ intervalMs: 15_000, heartbeat });

    await loop.beat();
    await vi.advanceTimersByTimeAsync(45_000);

    expect(heartbeat).toHaveBeenCalledTimes(4);
    await loop.stop();
  });

  it("does not overlap slow heartbeat requests", async () => {
    vi.useFakeTimers();
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    const heartbeat = vi.fn().mockReturnValue(pending);
    const loop = startAgentPresenceHeartbeat({ intervalMs: 5_000, heartbeat });

    const first = loop.beat();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(heartbeat).toHaveBeenCalledTimes(1);

    release();
    await first;
    await loop.stop();
  });
});
