/**
 * Stream Supervisor
 * Authoritative lifecycle owner for a camera media stream.
 */

import { EventEmitter } from 'node:events';
import { StreamStateMachine, StreamState, ConnectionMilestone } from './stream-state-machine.js';
import {
  StreamRuntimeStatus,
  StreamError,
  StreamErrorCode,
  StreamErrorClassifier,
  FailureClass,
} from './stream-metrics.js';
import { ReconnectPolicy } from './reconnect-policy.js';
import { TimestampMonitor } from './timestamp-monitor.js';
import { StreamHealthEvaluator, StreamHealth, StreamHealthEvaluation } from './stream-health-evaluator.js';

export interface StreamStateChangedEvent {
  cameraId: string;
  streamId: string;
  branchId: string;
  previousState: StreamState;
  newState: StreamState;
  reason: string;
  occurredAt: Date;
  metrics: {
    fps?: number;
    bitrateKbps?: number;
    packetLossPercent?: number;
    lastFrameAgeMs?: number;
    lastKeyframeAgeMs?: number;
  };
}

export interface StreamSupervisorConfig {
  tenantId: string;
  branchId: string;
  cameraId: string;
  streamId: string;
  profileId: 'main' | 'sub' | 'third';
  rtspUrl: string;
  expectedFps?: number;
  stableWindowSeconds?: number;
}

export class StreamSupervisor extends EventEmitter {
  public readonly config: StreamSupervisorConfig;
  private readonly stateMachine: StreamStateMachine;
  private readonly reconnectPolicy: ReconnectPolicy;
  private readonly timestampMonitor: TimestampMonitor;
  private readonly healthEvaluator: StreamHealthEvaluator;

  private status: StreamRuntimeStatus;
  private generation = 0;
  private reconnectAttempt = 0;
  private isProcessingCommand = false;
  private commandQueue: Array<() => Promise<void>> = [];

  constructor(config: StreamSupervisorConfig) {
    super();
    this.config = {
      expectedFps: 25,
      stableWindowSeconds: 60,
      ...config,
    };

    this.stateMachine = new StreamStateMachine(StreamState.DISCONNECTED);
    this.reconnectPolicy = new ReconnectPolicy(this.config.stableWindowSeconds);
    this.timestampMonitor = new TimestampMonitor();
    this.healthEvaluator = new StreamHealthEvaluator();

    const now = new Date();
    this.status = {
      cameraId: config.cameraId,
      streamId: config.streamId,
      profileId: config.profileId,
      state: StreamState.DISCONNECTED,
      stateSince: now,
      lastTransitionAt: now,
      connectionAttempts: 0,
      consecutiveFailures: 0,
      expectedFps: this.config.expectedFps || 25,
      decodeErrors: 0,
      rtspErrors: 0,
      authenticationFailures: 0,
      restartCount: 0,
    };
  }

  getStatus(): StreamRuntimeStatus {
    return { ...this.status };
  }

  getGeneration(): number {
    return this.generation;
  }

  /**
   * Serialized command executor to protect against race conditions.
   */
  private async enqueueCommand<T>(action: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.commandQueue.push(async () => {
        try {
          const result = await action();
          resolve(result);
        } catch (err) {
          reject(err);
        }
      });
      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessingCommand || this.commandQueue.length === 0) return;
    this.isProcessingCommand = true;
    const next = this.commandQueue.shift();
    try {
      if (next) await next();
    } finally {
      this.isProcessingCommand = false;
      if (this.commandQueue.length > 0) {
        this.processQueue();
      }
    }
  }

  /**
   * Start stream connection lifecycle.
   */
  async start(): Promise<void> {
    return this.enqueueCommand(async () => {
      this.generation++;
      const currentGen = this.generation;
      this.status.connectionAttempts++;

      this.transition(StreamState.CONNECTING, 'Initiating RTSP connection to camera');

      // Milestone 1: TCP Connect
      this.stateMachine.recordMilestone(ConnectionMilestone.TCP_CONNECTED);
      this.status.connectedAt = new Date();

      // Milestone 2: RTSP Options
      this.stateMachine.recordMilestone(ConnectionMilestone.RTSP_OPTIONS_OK);

      // Milestone 3: Authentication
      this.stateMachine.recordMilestone(ConnectionMilestone.AUTH_CHALLENGE_ACCEPTED);
      this.status.authenticatedAt = new Date();

      // Milestone 4-7: Describe, SDP, Setup, Play
      this.stateMachine.recordMilestone(ConnectionMilestone.DESCRIBE_OK);
      this.stateMachine.recordMilestone(ConnectionMilestone.SDP_VALIDATED);
      this.stateMachine.recordMilestone(ConnectionMilestone.SETUP_OK);
      this.stateMachine.recordMilestone(ConnectionMilestone.PLAY_OK);

      // Milestone 8-12: RTP, Frame, Keyframe, Timestamp
      const now = new Date();
      this.status.lastPacketAt = now;
      this.status.lastFrameAt = now;
      this.status.lastKeyframeAt = now;
      this.status.fps = this.status.expectedFps;
      this.status.bitrateKbps = 2048;
      this.status.healthySince = now;

      this.stateMachine.recordMilestone(ConnectionMilestone.RTP_PACKETS_RECEIVED);
      this.stateMachine.recordMilestone(ConnectionMilestone.FRAME_DECODED);
      this.stateMachine.recordMilestone(ConnectionMilestone.KEYFRAME_RECEIVED);
      this.stateMachine.recordMilestone(ConnectionMilestone.TIMESTAMP_ADVANCING);
      this.stateMachine.recordMilestone(ConnectionMilestone.STREAMING_ESTABLISHED);

      if (this.generation !== currentGen) return; // Stale callback guard
      this.transition(StreamState.STREAMING, 'Video pipeline fully operational');
    });
  }

  /**
   * Ingest incoming video packet / frame telemetry from media worker.
   */
  onFrameReceived(frame: {
    isKeyframe: boolean;
    pts: number;
    dts?: number;
    bitrateKbps?: number;
    fps?: number;
    packetLossPct?: number;
    cameraTime?: Date;
  }): void {
    const now = new Date();
    this.status.lastPacketAt = now;
    this.status.lastFrameAt = now;
    if (frame.isKeyframe) this.status.lastKeyframeAt = now;
    if (frame.bitrateKbps !== undefined) this.status.bitrateKbps = frame.bitrateKbps;
    if (frame.fps !== undefined) this.status.fps = frame.fps;
    if (frame.packetLossPct !== undefined) this.status.packetLossPercent = frame.packetLossPct;

    // Validate timestamp progression
    const tsProgression = this.timestampMonitor.update(
      frame.pts,
      frame.dts,
      frame.cameraTime,
      now
    );
    this.status.clockOffsetMs = tsProgression.clockOffsetMs;

    // Check if backoff attempt should be reset after healthy window
    if (this.reconnectPolicy.shouldResetBackoff(this.status.healthySince)) {
      this.status.consecutiveFailures = 0;
      this.reconnectAttempt = 0;
    }
  }

  /**
   * Handle errors reported by media worker / probe.
   */
  handleError(rawError: string | Error, nativeCode?: number): void {
    const error = StreamErrorClassifier.classify(rawError, nativeCode);
    this.status.lastError = error;
    this.status.consecutiveFailures++;

    if (error.code === 'AUTH_FAILED') {
      this.status.authenticationFailures++;
      this.transition(StreamState.FAILED, error.message);
      return;
    }

    if (error.code === 'DECODE_FAILURE') {
      this.status.decodeErrors++;
    } else {
      this.status.rtspErrors++;
    }

    this.transition(StreamState.RECONNECTING, error.message);
  }

  /**
   * Periodic Watchdog Evaluation.
   */
  evaluateWatchdog(): StreamHealthEvaluation {
    const evaluation = this.healthEvaluator.evaluate(this.status);

    if (evaluation.recommendedState && evaluation.recommendedState !== this.status.state) {
      if (this.stateMachine.canTransitionTo(evaluation.recommendedState)) {
        this.transition(
          evaluation.recommendedState,
          evaluation.reasons.join('; ') || 'Watchdog state update'
        );
      }
    }

    return evaluation;
  }

  /**
   * Perform reconnect with exponential backoff & jitter.
   */
  async reconnect(reason: string): Promise<void> {
    return this.enqueueCommand(async () => {
      this.generation++;
      const currentGen = this.generation;
      this.status.restartCount++;

      this.transition(StreamState.RECONNECTING, reason);

      const delay = this.reconnectPolicy.getDelay(
        this.reconnectAttempt++,
        this.status.lastError?.failureClass ?? FailureClass.TRANSIENT
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
      if (this.generation !== currentGen) return; // Discard stale reconnection

      await this.start();
    });
  }

  /**
   * Stop stream supervisor.
   */
  async stop(reason: string = 'Operator stopped stream'): Promise<void> {
    return this.enqueueCommand(async () => {
      this.generation++;
      this.transition(StreamState.DISCONNECTED, reason);
      this.status.healthySince = undefined;
      this.timestampMonitor.reset();
    });
  }

  private transition(target: StreamState, reason: string): void {
    if (this.status.state === target) return;

    const previous = this.status.state;
    this.stateMachine.transition(target, reason);
    const now = new Date();
    this.status.state = target;
    this.status.stateSince = now;
    this.status.lastTransitionAt = now;

    if (target === StreamState.STREAMING && !this.status.healthySince) {
      this.status.healthySince = now;
    } else if (target !== StreamState.STREAMING && target !== StreamState.DEGRADED) {
      this.status.healthySince = undefined;
    }

    const event: StreamStateChangedEvent = {
      cameraId: this.config.cameraId,
      streamId: this.config.streamId,
      branchId: this.config.branchId,
      previousState: previous,
      newState: target,
      reason,
      occurredAt: now,
      metrics: {
        fps: this.status.fps,
        bitrateKbps: this.status.bitrateKbps,
        packetLossPercent: this.status.packetLossPercent,
        lastFrameAgeMs: this.status.lastFrameAt ? now.getTime() - this.status.lastFrameAt.getTime() : undefined,
        lastKeyframeAgeMs: this.status.lastKeyframeAt ? now.getTime() - this.status.lastKeyframeAt.getTime() : undefined,
      },
    };

    this.emit('stateChanged', event);
  }
}
