/**
 * Stream Metrics, Runtime Status & Structured Error Classifier
 */

import { StreamState } from './stream-state-machine.js';

export type StreamErrorCode =
  | 'TCP_CONNECT_FAILED'
  | 'RTSP_TIMEOUT'
  | 'AUTH_FAILED'
  | 'DESCRIBE_FAILED'
  | 'SETUP_FAILED'
  | 'PLAY_FAILED'
  | 'NO_RTP_PACKETS'
  | 'NO_VIDEO_PACKETS'
  | 'NO_FRAMES'
  | 'NO_KEYFRAME'
  | 'TIMESTAMP_STALLED'
  | 'TIMESTAMP_JUMP'
  | 'HIGH_PACKET_LOSS'
  | 'LOW_FPS'
  | 'BITRATE_COLLAPSE'
  | 'DECODE_FAILURE'
  | 'PROCESS_EXITED';

export enum FailureClass {
  TRANSIENT = 'TRANSIENT',
  AUTHENTICATION = 'AUTHENTICATION',
  CONFIGURATION = 'CONFIGURATION',
  DEVICE = 'DEVICE',
  MEDIA = 'MEDIA',
  NETWORK = 'NETWORK',
}

export interface StreamError {
  code: StreamErrorCode;
  message: string;
  failureClass: FailureClass;
  at: Date;
  nativeCode?: number;
  nativeMessage?: string;
}

export interface StreamRuntimeStatus {
  cameraId: string;
  streamId: string;
  profileId: 'main' | 'sub' | 'third';
  state: StreamState;
  stateSince: Date;
  lastTransitionAt: Date;

  connectionAttempts: number;
  consecutiveFailures: number;

  connectedAt?: Date;
  authenticatedAt?: Date;

  lastPacketAt?: Date;
  lastFrameAt?: Date;
  lastKeyframeAt?: Date;

  bitrateKbps?: number;
  fps?: number;
  expectedFps: number;

  packetLossPercent?: number;

  decodeErrors: number;
  rtspErrors: number;
  authenticationFailures: number;

  restartCount: number;

  cameraTimestamp?: Date;
  serverTimestamp?: Date;
  clockOffsetMs?: number;

  lastError?: StreamError;
  healthySince?: Date;
}

export class StreamErrorClassifier {
  /**
   * Classifies raw stderr strings or RTSP status codes into normalized StreamError and FailureClass.
   */
  static classify(rawError: string | Error, nativeCode?: number): StreamError {
    const message = rawError instanceof Error ? rawError.message : String(rawError);
    const at = new Date();

    if (/401|unauthorized|auth|credentials|password/i.test(message)) {
      return {
        code: 'AUTH_FAILED',
        message: 'RTSP authentication failed: invalid username or password',
        failureClass: FailureClass.AUTHENTICATION,
        at,
        nativeCode,
        nativeMessage: message,
      };
    }

    if (/404|not found|invalid stream|stream path/i.test(message)) {
      return {
        code: 'DESCRIBE_FAILED',
        message: 'RTSP stream path or profile not found on camera',
        failureClass: FailureClass.CONFIGURATION,
        at,
        nativeCode,
        nativeMessage: message,
      };
    }

    if (/timed out|timeout|operation timed out/i.test(message)) {
      return {
        code: 'RTSP_TIMEOUT',
        message: 'RTSP handshake response timed out',
        failureClass: FailureClass.NETWORK,
        at,
        nativeCode,
        nativeMessage: message,
      };
    }

    if (/connection refused|econnrefused|failed to connect/i.test(message)) {
      return {
        code: 'TCP_CONNECT_FAILED',
        message: 'TCP socket connection refused by camera host',
        failureClass: FailureClass.NETWORK,
        at,
        nativeCode,
        nativeMessage: message,
      };
    }

    if (/invalid data|decode|corrupt|nal unit|h264|h265|hevc/i.test(message)) {
      return {
        code: 'DECODE_FAILURE',
        message: 'Video codec parser encountered malformed NAL units or corrupt slice data',
        failureClass: FailureClass.MEDIA,
        at,
        nativeCode,
        nativeMessage: message,
      };
    }

    if (/exited|sigterm|sigkill|process/i.test(message)) {
      return {
        code: 'PROCESS_EXITED',
        message: 'Media worker child process terminated unexpectedly',
        failureClass: FailureClass.TRANSIENT,
        at,
        nativeCode,
        nativeMessage: message,
      };
    }

    return {
      code: 'RTSP_TIMEOUT',
      message: message.slice(0, 500),
      failureClass: FailureClass.TRANSIENT,
      at,
      nativeCode,
      nativeMessage: message,
    };
  }
}
