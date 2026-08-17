import { EventEmitter } from "node:events";
import { spawn, type ChildProcess } from "node:child_process";
import type { IStreamIngest, StreamIngestConfig, StreamSegmentCompletedEvent } from "./stream-ingest.js";

export class FfmpegStreamIngest extends EventEmitter implements IStreamIngest {
  public readonly config: Required<StreamIngestConfig>;
  private process?: ChildProcess;
  private stdoutBuffer = "";
  private stderrLines: string[] = [];
  private intentionallyStopping = false;

  constructor(config: StreamIngestConfig) {
    super();
    this.config = {
      containerFormat: "mkv",
      rtspTransport: "tcp",
      ioTimeoutMs: 15000,
      ...config,
    };
  }

  getConfig(): StreamIngestConfig {
    return { ...this.config };
  }

  isRunning(): boolean {
    return this.process !== undefined && !this.process.killed;
  }

  async start(): Promise<void> {
    if (this.isRunning()) return;

    this.intentionallyStopping = false;
    this.stdoutBuffer = "";
    this.stderrLines = [];

    const args = [
      "-nostdin",
      "-hide_banner",
      "-loglevel", "warning",
      "-y",
      "-rw_timeout", String(this.config.ioTimeoutMs * 1000),
      "-rtsp_transport", this.config.rtspTransport,
      "-i", this.config.sourceUri,
      "-map", "0:v:0",
      "-map", "0:a?",
      "-c", "copy",
      "-f", "segment",
      "-segment_time", String(this.config.segmentDurationSeconds),
      "-segment_atclocktime", "1",
      "-reset_timestamps", "1",
      "-strftime", "1",
      "-segment_list", "pipe:1",
      "-segment_list_type", "csv",
      this.config.outputPattern,
    ];

    const child = spawn("ffmpeg", args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    this.process = child;

    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      this.handleStdout(chunk);
    });

    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => {
      this.handleStderr(chunk);
    });

    child.once("spawn", () => {
      this.emit("started");
    });

    child.once("error", (err) => {
      this.emit("error", err);
    });

    child.once("exit", (code, signal) => {
      this.process = undefined;
      if (!this.intentionallyStopping) {
        this.emit("unexpected_exit", {
          code,
          signal,
          stderr: this.stderrLines.slice(-5),
        });
      } else {
        this.emit("stopped");
      }
    });
  }

  async stop(): Promise<void> {
    if (!this.process) return;

    this.intentionallyStopping = true;
    const proc = this.process;

    return new Promise((resolve) => {
      const forceKillTimer = setTimeout(() => {
        if (!proc.killed) proc.kill("SIGKILL");
        resolve();
      }, 5000);
      forceKillTimer.unref();

      proc.once("exit", () => {
        clearTimeout(forceKillTimer);
        this.process = undefined;
        resolve();
      });

      proc.kill("SIGTERM");
    });
  }

  private handleStdout(chunk: string): void {
    this.stdoutBuffer += chunk;
    const lines = this.stdoutBuffer.split(/\r?\n/);
    this.stdoutBuffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      // CSV format: filename,start_time,end_time
      const parts = line.split(",").map((s) => s.replace(/^"|"$/g, ""));
      const rawPath = parts[0];
      if (rawPath) {
        const startOffset = parts[1] ? Number(parts[1]) : undefined;
        const endOffset = parts[2] ? Number(parts[2]) : undefined;

        const event: StreamSegmentCompletedEvent = {
          cameraId: this.config.cameraId,
          rawPath,
          startOffset,
          endOffset,
          timestamp: new Date(),
        };

        this.emit("segment_completed", event);
      }
    }
  }

  private handleStderr(chunk: string): void {
    const lines = chunk.split(/\r?\n/).filter(Boolean);
    this.stderrLines.push(...lines);
    if (this.stderrLines.length > 50) {
      this.stderrLines.splice(0, this.stderrLines.length - 50);
    }

    // Check for packet / frame progression
    this.emit("activity");
  }
}
