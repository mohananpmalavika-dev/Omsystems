export type StreamState =
  | "STOPPED"
  | "STARTING"
  | "RECORDING"
  | "DEGRADED"
  | "RECONNECTING"
  | "RECOVERING"
  | "FAILED";

export interface StateTransitionEvent {
  from: StreamState;
  to: StreamState;
  reason: string;
  timestamp: Date;
}

export class StreamStateMachine {
  private currentState: StreamState;
  private stateSince: Date;
  private readonly history: StateTransitionEvent[] = [];

  constructor(initialState: StreamState = "STOPPED") {
    this.currentState = initialState;
    this.stateSince = new Date();
  }

  getState(): StreamState {
    return this.currentState;
  }

  getStateDurationMs(): number {
    return Date.now() - this.stateSince.getTime();
  }

  transition(to: StreamState, reason: string): boolean {
    if (this.currentState === to) return false;

    const event: StateTransitionEvent = {
      from: this.currentState,
      to,
      reason,
      timestamp: new Date(),
    };

    this.currentState = to;
    this.stateSince = event.timestamp;
    this.history.push(event);

    if (this.history.length > 50) {
      this.history.shift();
    }

    return true;
  }

  getHistory(): StateTransitionEvent[] {
    return [...this.history];
  }
}
