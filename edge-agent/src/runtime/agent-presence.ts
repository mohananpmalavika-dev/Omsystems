export interface AgentPresenceHeartbeatOptions {
  intervalMs: number;
  heartbeat: () => Promise<unknown>;
  onError?: (error: unknown) => void;
}

export interface AgentPresenceHeartbeat {
  beat(): Promise<void>;
  stop(): Promise<void>;
}

/**
 * Keeps edge presence independent from discovery, recorder probes, and other
 * long-running work on the main polling loop. Overlapping heartbeats are
 * suppressed so a slow control plane cannot create an unbounded request pile.
 */
export function startAgentPresenceHeartbeat(
  options: AgentPresenceHeartbeatOptions,
): AgentPresenceHeartbeat {
  let stopped = false;
  let inFlight: Promise<void> | undefined;

  const beat = () => {
    if (stopped) return Promise.resolve();
    if (inFlight) return inFlight;
    inFlight = options.heartbeat()
      .then(() => undefined)
      .catch((error) => {
        options.onError?.(error);
      })
      .finally(() => {
        inFlight = undefined;
      });
    return inFlight;
  };

  const timer = setInterval(() => {
    void beat();
  }, options.intervalMs);
  timer.unref?.();

  return {
    beat,
    async stop() {
      stopped = true;
      clearInterval(timer);
      await inFlight;
    },
  };
}
