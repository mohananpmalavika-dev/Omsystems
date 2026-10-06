import { spawn, type ChildProcess } from "node:child_process";

export interface CapturedRgbFrame {
  rgb: Buffer;
  capturedAt: string;
}

export interface RgbFrameStream {
  start(): void;
  stop(): void;
  latestFrame(maxAgeMs?: number): CapturedRgbFrame | null;
}

/** One decoder per camera, with bounded memory and no queue of old frames. */
export class RtspRgbStream implements RgbFrameStream {
  private child: ChildProcess | undefined;
  private watchdog: NodeJS.Timeout | undefined;
  private retry: NodeJS.Timeout | undefined;
  private running = false;
  private latest: CapturedRgbFrame | null = null;
  private frameBuffer: Buffer;
  private offset = 0;
  private lastFrameAt = 0;
  private failures = 0;
  private readonly frameBytes: number;

  constructor(
    private readonly uri: string,
    private readonly ffmpegPath = "ffmpeg",
    private readonly width = 640,
    private readonly height = 360,
    private readonly onUnavailable: (reason: string) => void = () => {},
  ) {
    this.frameBytes = width * height * 3;
    this.frameBuffer = Buffer.alloc(this.frameBytes);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.connect();
  }

  stop(): void {
    this.running = false;
    clearTimeout(this.retry);
    clearInterval(this.watchdog);
    this.retry = undefined;
    this.watchdog = undefined;
    const child = this.child;
    this.child = undefined;
    this.latest = null;
    this.offset = 0;
    if (child) this.terminate(child);
  }

  latestFrame(maxAgeMs = 3_000): CapturedRgbFrame | null {
    if (!this.latest) return null;
    const age = Date.now() - Date.parse(this.latest.capturedAt);
    return age >= 0 && age <= maxAgeMs ? this.latest : null;
  }

  private connect(): void {
    if (!this.running) return;
    this.latest = null;
    this.offset = 0;
    this.lastFrameAt = Date.now();
    const child = spawn(this.ffmpegPath, [
      "-v", "error", "-nostdin",
      "-rtsp_transport", "tcp",
      "-fflags", "nobuffer", "-flags", "low_delay",
      "-analyzeduration", "500000", "-probesize", "500000",
      "-threads", "1", "-i", this.uri,
      "-map", "0:v:0", "-an", "-sn", "-dn",
      "-vf", `fps=1,scale=${this.width}:${this.height}`,
      "-threads", "1", "-filter_threads", "1",
      "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1",
    ], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    this.child = child;
    // Drain stderr without retaining recorder credentials or unbounded logs.
    child.stderr?.resume();
    child.stdout?.on("data", (chunk: Buffer) => {
      if (this.child !== child || !this.running) return;
      let position = 0;
      while (position < chunk.length) {
        const bytes = Math.min(this.frameBytes - this.offset, chunk.length - position);
        chunk.copy(this.frameBuffer, this.offset, position, position + bytes);
        position += bytes;
        this.offset += bytes;
        if (this.offset === this.frameBytes) {
          this.lastFrameAt = Date.now();
          this.latest = { rgb: this.frameBuffer, capturedAt: new Date(this.lastFrameAt).toISOString() };
          this.frameBuffer = Buffer.allocUnsafe(this.frameBytes);
          this.offset = 0;
          this.failures = 0;
        }
      }
    });
    child.once("error", () => this.reconnect(child, "decoder unavailable"));
    child.once("close", () => this.reconnect(child, "stream closed"));
    this.watchdog = setInterval(() => {
      if (Date.now() - this.lastFrameAt >= 10_000) this.reconnect(child, "no fresh decoded frame");
    }, 1_000);
    this.watchdog.unref();
  }

  private reconnect(child: ChildProcess, reason: string): void {
    if (this.child !== child || !this.running) return;
    this.child = undefined;
    this.latest = null;
    this.offset = 0;
    clearInterval(this.watchdog);
    this.watchdog = undefined;
    this.terminate(child);
    this.onUnavailable(reason);
    const delayMs = Math.min(30_000, 2_000 * 2 ** Math.min(this.failures++, 4));
    this.retry = setTimeout(() => {
      this.retry = undefined;
      this.connect();
    }, delayMs);
    this.retry.unref();
  }

  private terminate(child: ChildProcess): void {
    if (child.exitCode !== null || child.signalCode !== null) return;
    child.kill();
    const forceKill = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    }, 1_000);
    forceKill.unref();
    child.once("close", () => clearTimeout(forceKill));
  }
}

export function createRtspRgbStream(
  uri: string, ffmpegPath: string, width: number, height: number, onUnavailable: (reason: string) => void,
): RgbFrameStream {
  return new RtspRgbStream(uri, ffmpegPath, width, height, onUnavailable);
}
