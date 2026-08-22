import { EventEmitter } from "node:events";

export interface StreamIngestConfig {
  cameraId: string;
  sourceUri: string;
  segmentDurationSeconds: number;
  outputPattern: string;
  containerFormat?: "mkv" | "mp4";
  rtspTransport?: "tcp" | "udp";
  ioTimeoutMs?: number;
}

export interface StreamSegmentCompletedEvent {
  cameraId: string;
  rawPath: string;
  startOffset?: number;
  endOffset?: number;
  timestamp: Date;
}

export interface IStreamIngest extends EventEmitter {
  start(): Promise<void>;
  stop(): Promise<void>;
  isRunning(): boolean;
  getConfig(): StreamIngestConfig;
}
