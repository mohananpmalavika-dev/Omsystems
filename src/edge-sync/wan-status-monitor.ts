import { EventEmitter } from "node:events";

export type WANConnectivityState = "ONLINE" | "DEGRADED" | "ISOLATED_OFFLINE";

export interface WANProbeConfig {
  heartbeatIntervalMs?: number;
  failureThreshold?: number;
  recoveryThreshold?: number;
  probeFn?: () => Promise<boolean>;
}

/**
 * WANStatusMonitor
 * 
 * Actively monitors WAN connectivity between the edge gateway and central control plane.
 * Coordinates smooth transitions into offline autonomous mode and initiates backfill upon recovery.
 */
export class WANStatusMonitor extends EventEmitter {
  private currentState: WANConnectivityState = "ONLINE";
  private consecutiveFailures = 0;
  private consecutiveSuccesses = 0;
  private timer?: NodeJS.Timeout;

  private readonly heartbeatIntervalMs: number;
  private readonly failureThreshold: number;
  private readonly recoveryThreshold: number;
  private readonly probeFn: () => Promise<boolean>;

  constructor(config: WANProbeConfig = {}) {
    super();
    this.heartbeatIntervalMs = config.heartbeatIntervalMs ?? 5000;
    this.failureThreshold = config.failureThreshold ?? 3;
    this.recoveryThreshold = config.recoveryThreshold ?? 2;
    this.probeFn = config.probeFn ?? (async () => true);
  }

  public getState(): WANConnectivityState {
    return this.currentState;
  }

  public isOnline(): boolean {
    return this.currentState === "ONLINE";
  }

  public isIsolated(): boolean {
    return this.currentState === "ISOLATED_OFFLINE";
  }

  public start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.probe();
    }, this.heartbeatIntervalMs);
    if (this.timer.unref) {
      this.timer.unref();
    }
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  /**
   * Explicitly sets connectivity state (useful for simulated tests or forced modes)
   */
  public setState(newState: WANConnectivityState, reason?: string): void {
    if (this.currentState === newState) return;
    const oldState = this.currentState;
    this.currentState = newState;

    if (newState === "ISOLATED_OFFLINE") {
      this.emit("wan_disconnected", { from: oldState, to: newState, reason });
    } else if (newState === "ONLINE") {
      this.emit("wan_recovered", { from: oldState, to: newState, reason });
    }

    this.emit("state_changed", { from: oldState, to: newState, reason });
  }

  /**
   * Executes a single connectivity probe check
   */
  public async probe(): Promise<WANConnectivityState> {
    try {
      const isSuccess = await this.probeFn();
      if (isSuccess) {
        this.consecutiveSuccesses++;
        this.consecutiveFailures = 0;

        if (this.currentState !== "ONLINE" && this.consecutiveSuccesses >= this.recoveryThreshold) {
          this.setState("ONLINE", "WAN probe succeeded consecutive threshold times");
        }
      } else {
        this.handleFailure();
      }
    } catch {
      this.handleFailure();
    }

    return this.currentState;
  }

  private handleFailure(): void {
    this.consecutiveFailures++;
    this.consecutiveSuccesses = 0;

    if (this.currentState === "ONLINE" && this.consecutiveFailures >= 1 && this.consecutiveFailures < this.failureThreshold) {
      this.setState("DEGRADED", "WAN heartbeat missed");
    } else if (this.consecutiveFailures >= this.failureThreshold && this.currentState !== "ISOLATED_OFFLINE") {
      this.setState("ISOLATED_OFFLINE", `WAN unreachable for ${this.consecutiveFailures} consecutive checks`);
    }
  }
}
