import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

export type AlertEvidenceCaptureState = "queued" | "capturing" | "ready" | "partial" | "failed";

export interface AlertEvidenceCaptureStatus {
  alertId: string;
  cameraId: string;
  state: AlertEvidenceCaptureState;
  requestedAt: string;
  startedAt?: string;
  completedAt?: string;
  snapshotAvailable: boolean;
  clipAvailable: boolean;
  error?: string;
}

export interface AlertEvidenceCaptureInput {
  alertId: string;
  cameraId: string;
  occurredAt: string;
  sourceUri: string;
  clipSeconds: number;
}

export type EvidenceAssetKind = "snapshot" | "clip";
export type EvidenceCaptureRunner = (
  input: AlertEvidenceCaptureInput,
  output: { snapshotPath: string; clipPath: string },
) => Promise<void>;

type QueuedCapture = AlertEvidenceCaptureInput & { requestedAt: string };

/**
 * Bounded, durable alert-evidence capture queue.
 *
 * Status is persisted beside the media so restarts do not turn completed
 * evidence back into "unknown". Camera source URIs are deliberately never
 * written to disk or returned in errors.
 */
export class AlertEvidenceCaptureService {
  private readonly pending: QueuedCapture[] = [];
  private readonly scheduled = new Set<string>();
  private active = 0;

  constructor(
    private readonly evidenceRoot: string,
    private readonly maxConcurrent = 4,
    private readonly runner: EvidenceCaptureRunner = runFfmpegCapture,
  ) {}

  async request(input: AlertEvidenceCaptureInput): Promise<AlertEvidenceCaptureStatus> {
    const existing = await this.getStatus(input.alertId);
    if (existing && existing.cameraId === input.cameraId &&
        (["ready", "partial"].includes(existing.state) ||
          (["queued", "capturing"].includes(existing.state) && this.scheduled.has(input.alertId)))) {
      return existing;
    }
    if (this.scheduled.has(input.alertId)) {
      return existing ?? this.statusFor(input, "queued", new Date().toISOString());
    }

    const requestedAt = new Date().toISOString();
    const queued = { ...input, requestedAt };
    this.scheduled.add(input.alertId);
    try {
      await mkdir(this.folder(input.alertId), { recursive: true });
      const status = this.statusFor(input, "queued", requestedAt);
      await this.writeStatus(status);
      this.pending.push(queued);
      this.pump();
      return status;
    } catch (error) {
      this.scheduled.delete(input.alertId);
      throw error;
    }
  }

  async getStatus(alertId: string): Promise<AlertEvidenceCaptureStatus | undefined> {
    try {
      return JSON.parse(await readFile(this.statusPath(alertId), "utf8")) as AlertEvidenceCaptureStatus;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  }

  async openAsset(alertId: string, kind: EvidenceAssetKind) {
    const path = this.assetPath(alertId, kind);
    const details = await stat(path);
    if (!details.isFile() || details.size === 0) throw new Error("alert_evidence_not_found");
    return {
      path,
      size: details.size,
      contentType: kind === "snapshot" ? "image/jpeg" : "video/mp4",
      stream: (start?: number, end?: number) => createReadStream(path, { start, end }),
    };
  }

  private pump() {
    while (this.active < Math.max(1, this.maxConcurrent) && this.pending.length > 0) {
      const capture = this.pending.shift()!;
      this.active += 1;
      void this.capture(capture)
        .catch(async (error) => {
          try {
            await this.writeStatus({
              ...this.statusFor(capture, "failed", capture.requestedAt),
              completedAt: new Date().toISOString(),
              error: safeError(error, capture.sourceUri),
            });
          } catch {
            // A storage failure can also prevent writing the failure marker.
          }
        })
        .finally(() => {
          this.active -= 1;
          this.scheduled.delete(capture.alertId);
          this.pump();
        });
    }
  }

  private async capture(input: QueuedCapture) {
    const startedAt = new Date().toISOString();
    await this.writeStatus({
      ...this.statusFor(input, "capturing", input.requestedAt),
      startedAt,
    });
    const snapshotTemporary = join(this.folder(input.alertId), "snapshot.tmp.jpg");
    const clipTemporary = join(this.folder(input.alertId), "clip.tmp.mp4");
    await Promise.all([removeIfPresent(snapshotTemporary), removeIfPresent(clipTemporary)]);

    let failure: unknown;
    try {
      await this.runner(input, {
        snapshotPath: snapshotTemporary,
        clipPath: clipTemporary,
      });
    } catch (error) {
      failure = error;
    }

    const snapshotAvailable = await moveNonEmpty(snapshotTemporary, this.assetPath(input.alertId, "snapshot"));
    const clipAvailable = await moveNonEmpty(clipTemporary, this.assetPath(input.alertId, "clip"));
    const completedAt = new Date().toISOString();
    const state: AlertEvidenceCaptureState = snapshotAvailable && clipAvailable
      ? "ready"
      : snapshotAvailable || clipAvailable
        ? "partial"
        : "failed";
    await this.writeStatus({
      alertId: input.alertId,
      cameraId: input.cameraId,
      state,
      requestedAt: input.requestedAt,
      startedAt,
      completedAt,
      snapshotAvailable,
      clipAvailable,
      ...(failure ? { error: safeError(failure, input.sourceUri) } : {}),
    });
  }

  private statusFor(
    input: Pick<AlertEvidenceCaptureInput, "alertId" | "cameraId">,
    state: AlertEvidenceCaptureState,
    requestedAt: string,
  ): AlertEvidenceCaptureStatus {
    return {
      alertId: input.alertId,
      cameraId: input.cameraId,
      state,
      requestedAt,
      snapshotAvailable: false,
      clipAvailable: false,
    };
  }

  private async writeStatus(status: AlertEvidenceCaptureStatus) {
    const path = this.statusPath(status.alertId);
    const temporary = `${path}.tmp`;
    await writeFile(temporary, JSON.stringify(status, null, 2), { encoding: "utf8", mode: 0o600 });
    await rename(temporary, path);
  }

  private folder(alertId: string) {
    const safeId = createHash("sha256").update(alertId).digest("hex");
    return join(resolve(this.evidenceRoot), safeId);
  }

  private statusPath(alertId: string) {
    return join(this.folder(alertId), "status.json");
  }

  private assetPath(alertId: string, kind: EvidenceAssetKind) {
    return join(this.folder(alertId), kind === "snapshot" ? "snapshot.jpg" : "clip.mp4");
  }
}

export async function runFfmpegCapture(
  input: AlertEvidenceCaptureInput,
  output: { snapshotPath: string; clipPath: string },
) {
  const args = [
    "-nostdin", "-hide_banner", "-loglevel", "warning", "-y",
    "-rw_timeout", "15000000", "-rtsp_transport", "tcp", "-i", input.sourceUri,
    "-map", "0:v:0", "-frames:v", "1", "-q:v", "2", "-f", "image2", output.snapshotPath,
    "-map", "0:v:0", "-an", "-t", String(input.clipSeconds),
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p",
    "-movflags", "+faststart", "-f", "mp4", output.clipPath,
  ];
  await new Promise<void>((resolveCapture, rejectCapture) => {
    const child = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => {
      stderr = `${stderr}${chunk}`.slice(-4_000);
    });
    child.once("error", rejectCapture);
    child.once("exit", (code) => {
      if (code === 0) resolveCapture();
      else rejectCapture(new Error(stderr.trim() || `ffmpeg_exit_${code ?? "unknown"}`));
    });
  });
}

async function moveNonEmpty(source: string, destination: string) {
  try {
    const details = await stat(source);
    if (!details.isFile() || details.size === 0) {
      await removeIfPresent(source);
      return false;
    }
    await rename(source, destination);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function removeIfPresent(path: string) {
  try {
    await unlink(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

function safeError(error: unknown, sourceUri: string) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replaceAll(sourceUri, "[camera-source]").slice(0, 1_000);
}
