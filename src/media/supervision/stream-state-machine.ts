/**
 * Stream State Machine & Connection Milestones
 * Strictly manages valid stream lifecycle transitions and connection establishment milestones.
 */

export enum StreamState {
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  AUTHENTICATING = 'AUTHENTICATING',
  STREAMING = 'STREAMING',
  DEGRADED = 'DEGRADED',
  RECONNECTING = 'RECONNECTING',
  FAILED = 'FAILED',
}

export enum ConnectionMilestone {
  TCP_CONNECTED = 'TCP_CONNECTED',
  RTSP_OPTIONS_OK = 'RTSP_OPTIONS_OK',
  AUTH_CHALLENGE_ACCEPTED = 'AUTH_CHALLENGE_ACCEPTED',
  DESCRIBE_OK = 'DESCRIBE_OK',
  SDP_VALIDATED = 'SDP_VALIDATED',
  SETUP_OK = 'SETUP_OK',
  PLAY_OK = 'PLAY_OK',
  RTP_PACKETS_RECEIVED = 'RTP_PACKETS_RECEIVED',
  FRAME_DECODED = 'FRAME_DECODED',
  KEYFRAME_RECEIVED = 'KEYFRAME_RECEIVED',
  TIMESTAMP_ADVANCING = 'TIMESTAMP_ADVANCING',
  STREAMING_ESTABLISHED = 'STREAMING_ESTABLISHED',
}

export const ALLOWED_STREAM_TRANSITIONS: Readonly<Record<StreamState, readonly StreamState[]>> = {
  [StreamState.DISCONNECTED]: [StreamState.CONNECTING],
  [StreamState.CONNECTING]: [
    StreamState.AUTHENTICATING,
    StreamState.STREAMING,
    StreamState.RECONNECTING,
    StreamState.FAILED,
    StreamState.DISCONNECTED,
  ],
  [StreamState.AUTHENTICATING]: [
    StreamState.STREAMING,
    StreamState.RECONNECTING,
    StreamState.FAILED,
    StreamState.DISCONNECTED,
  ],
  [StreamState.STREAMING]: [
    StreamState.DEGRADED,
    StreamState.RECONNECTING,
    StreamState.FAILED,
    StreamState.DISCONNECTED,
  ],
  [StreamState.DEGRADED]: [
    StreamState.STREAMING,
    StreamState.RECONNECTING,
    StreamState.FAILED,
    StreamState.DISCONNECTED,
  ],
  [StreamState.RECONNECTING]: [
    StreamState.CONNECTING,
    StreamState.FAILED,
    StreamState.DISCONNECTED,
  ],
  [StreamState.FAILED]: [
    StreamState.CONNECTING,
    StreamState.DISCONNECTED,
  ],
};

export class StreamStateMachine {
  private currentState: StreamState;
  private stateSince: Date;
  private completedMilestones: Set<ConnectionMilestone> = new Set();
  private transitionHistory: Array<{
    from: StreamState;
    to: StreamState;
    reason: string;
    timestamp: Date;
  }> = [];

  constructor(initialState: StreamState = StreamState.DISCONNECTED) {
    this.currentState = initialState;
    this.stateSince = new Date();
  }

  getState(): StreamState {
    return this.currentState;
  }

  getStateSince(): Date {
    return this.stateSince;
  }

  getCompletedMilestones(): ConnectionMilestone[] {
    return Array.from(this.completedMilestones);
  }

  hasMilestone(milestone: ConnectionMilestone): boolean {
    return this.completedMilestones.has(milestone);
  }

  recordMilestone(milestone: ConnectionMilestone): void {
    this.completedMilestones.add(milestone);
    if (
      milestone === ConnectionMilestone.AUTH_CHALLENGE_ACCEPTED &&
      this.currentState === StreamState.CONNECTING
    ) {
      this.transition(StreamState.AUTHENTICATING, 'Credentials accepted by RTSP server');
    } else if (
      milestone === ConnectionMilestone.STREAMING_ESTABLISHED &&
      (this.currentState === StreamState.AUTHENTICATING || this.currentState === StreamState.CONNECTING)
    ) {
      this.transition(StreamState.STREAMING, 'Full video pipeline verified with active keyframes');
    }
  }

  clearMilestones(): void {
    this.completedMilestones.clear();
  }

  canTransitionTo(target: StreamState): boolean {
    const allowed = ALLOWED_STREAM_TRANSITIONS[this.currentState] || [];
    return allowed.includes(target);
  }

  transition(target: StreamState, reason: string): void {
    if (this.currentState === target) return;

    if (!this.canTransitionTo(target)) {
      throw new Error(
        `Illegal stream state transition: Cannot transition from ${this.currentState} to ${target}. Reason: ${reason}`
      );
    }

    const previous = this.currentState;
    this.currentState = target;
    const now = new Date();
    this.stateSince = now;

    this.transitionHistory.push({
      from: previous,
      to: target,
      reason,
      timestamp: now,
    });

    if (this.transitionHistory.length > 50) {
      this.transitionHistory.shift();
    }

    if (target === StreamState.DISCONNECTED || target === StreamState.RECONNECTING) {
      this.clearMilestones();
    }
  }

  getHistory(): Array<{ from: StreamState; to: StreamState; reason: string; timestamp: Date }> {
    return [...this.transitionHistory];
  }
}
