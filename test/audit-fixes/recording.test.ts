import { afterEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DurableRetryQueue } from "../../recording-engine/src/failover/durable-retry-queue.js";
import { RangeExporter } from "../../recording-engine/src/evidence/range-exporter.js";
import { FfmpegStreamIngest } from "../../recording-engine/src/ingest/ffmpeg-ingest.js";
import { RecordingSession } from "../../recording-engine/src/engine/recording-session.js";

const mocks = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock("node:child_process", () => ({ spawn: mocks.spawn }));
const dirs: string[] = [];
afterEach(async () => { vi.useRealTimers(); vi.restoreAllMocks(); mocks.spawn.mockReset(); await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))); });
async function temp() { const dir = await mkdtemp(join(tmpdir(), "recording-audit-")); dirs.push(dir); return dir; }
function child() {
  const process = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), exitCode: null as number | null,
    signalCode: null as string | null, killed: false, kill: vi.fn((_signal?: string) => { process.killed = true; return true; }) });
  return process;
}
function ingest() { return new FfmpegStreamIngest({ cameraId: "camera", sourceUri: "rtsp://camera", segmentDurationSeconds: 15, outputPattern: "run-%06d.mkv.partial" }); }

describe("recording audit regressions", () => {
  it("preserves corrupt queue files and refuses enqueue instead of discarding jobs", async () => {
    const dir = await temp(); const file = join(dir, "storage-retry-queue.json");
    await writeFile(file, "{broken");
    const queue = new DurableRetryQueue(dir);
    await expect(queue.getDepth()).rejects.toThrow();
    await expect(queue.enqueue({} as any)).rejects.toThrow();
    expect(await readFile(file, "utf8")).toBe("{broken");
  });

  it("initializes a missing queue and restores running jobs after restart", async () => {
    const dir = await temp(); const queue = new DurableRetryQueue(dir);
    expect((await queue.getDepth()).total).toBe(0);
    await queue.enqueue({ segmentId: "seg", recordingId: "rec", cameraId: "cam", tenantId: "tenant", branchId: "branch", sourcePath: "source",
      targetNodeId: "node", targetTier: "local", expectedSha256: "hash", expectedSizeBytes: 5, maxAttempts: 3 });
    await queue.getNextPending();
    expect((await new DurableRetryQueue(dir).getDepth()).pending).toBe(1);
  });

  it("rejects failed FFmpeg spawn without an unhandled error event", async () => {
    const process = child(); mocks.spawn.mockImplementation(() => {
      queueMicrotask(() => { process.emit("error", Object.assign(new Error("spawn ffmpeg ENOENT"), { code: "ENOENT" })); process.emit("close", -2, null); });
      return process;
    });
    const source = ingest();
    await expect(source.start()).rejects.toThrow("ENOENT");
    expect(source.isRunning()).toBe(false);
    await source.stop();
  });

  it("sends SIGKILL to a SIGTERM-resistant process and waits for closed stdio", async () => {
    vi.useFakeTimers(); const process = child();
    mocks.spawn.mockReturnValue(process);
    const source = ingest(); const startup = source.start(); process.emit("spawn"); await startup;
    let stopped = false; const stopping = source.stop().then(() => { stopped = true; });
    expect(process.kill).toHaveBeenCalledWith("SIGTERM");
    await vi.advanceTimersByTimeAsync(5000);
    expect(process.kill).toHaveBeenCalledWith("SIGKILL");
    expect(stopped).toBe(false);
    process.signalCode = "SIGKILL"; process.emit("close", null, "SIGKILL");
    await stopping; expect(stopped).toBe(true);
  });

  it.each([1, 3])("awaits %i buffered CSV completions and finalizes each actual file exactly once on shutdown", async (count) => {
    const dir = await temp(); const process = child(); let output = "";
    mocks.spawn.mockImplementation((_command, args: string[]) => { output = args[args.length - 1]!; queueMicrotask(() => process.emit("spawn")); return process; });
    const finalizations: string[] = [];
    const finalize = vi.fn(async (segment: any) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      expect(await readFile(segment.stagingPartialPath, "utf8")).toBe("media");
      finalizations.push(segment.stagingPartialPath);
      return { success: false };
    });
    const session = new RecordingSession({ tenantId: "t", branchId: "b", cameraId: "cam", jobId: "j", sourceUri: "rtsp://cam", stagingRoot: dir, storageRoot: dir },
      { journal: { append: vi.fn() } as any, gapTracker: { startGap: vi.fn(), resolveGap: vi.fn() } as any,
        storageManager: { selectActiveNode: () => ({ nodeId: "node", isWritable: true }), protectSegment: vi.fn(), unprotectSegment: vi.fn() } as any,
        finalizer: { finalize } as any });
    await session.start();
    const actualPaths = Array.from({ length: count }, (_, index) => output.replace("%06d", String(index).padStart(6, "0")));
    await Promise.all(actualPaths.map((path) => writeFile(path, "media")));
    process.kill.mockImplementation(() => {
      process.stdout.write(actualPaths.map((path, index) => `${path},${index * 5},${(index + 1) * 5}\n`).join(""));
      process.exitCode = 0; process.emit("close", 0, null); return true;
    });
    await session.stop();
    expect(finalizations).toEqual(actualPaths);
    expect(finalize).toHaveBeenCalledTimes(count);
  });

  it("finalizes the tracked last partial even if a killed FFmpeg never emits its CSV completion", async () => {
    const dir = await temp(); const process = child(); let output = "";
    mocks.spawn.mockImplementation((_command, args: string[]) => { output = args[args.length - 1]!; queueMicrotask(() => process.emit("spawn")); return process; });
    const finalize = vi.fn(async () => ({ success: false }));
    const session = new RecordingSession({ tenantId: "t", branchId: "b", cameraId: "cam", jobId: "j", sourceUri: "rtsp://cam", stagingRoot: dir, storageRoot: dir },
      { journal: {} as any, gapTracker: { startGap: vi.fn() } as any,
        storageManager: { selectActiveNode: () => ({ nodeId: "node", isWritable: true }), protectSegment: vi.fn(), unprotectSegment: vi.fn() } as any, finalizer: { finalize } as any });
    await session.start(); const actual = output.replace("%06d", "000000"); await writeFile(actual, "media");
    process.kill.mockImplementation(() => { process.exitCode = 0; process.emit("close", 0, null); return true; });
    await session.stop();
    expect(finalize).toHaveBeenCalledWith(expect.objectContaining({ stagingPartialPath: actual }), expect.anything(), expect.any(Date));
  });

  it("trims a multi-segment export and returns measured duration", async () => {
    const dir = await temp(); const outputPath = join(dir, "export.mp4");
    mocks.spawn.mockImplementation((command: string) => {
      const process = child();
      queueMicrotask(() => { if (command === "ffprobe") process.stdout.write('{"format":{"duration":"9.96"}}'); process.emit("close", 0, null); });
      return process;
    });
    await writeFile(outputPath, "export");
    const segments = [0, 15].map((seconds) => ({ id: String(seconds), storagePath: join(dir, `segment-${seconds}.mkv`), startedAt: new Date(seconds * 1000), endedAt: new Date((seconds + 15) * 1000), sizeBytes: 20 }));
    const result = await RangeExporter.exportRange({ cameraId: "cam", fromTime: new Date(10_000), toTime: new Date(20_000), outputPath }, segments);
    expect(result.success).toBe(true); expect(result.durationSeconds).toBe(9.96);
    const args = mocks.spawn.mock.calls[0]![1] as string[];
    expect(args.slice(args.indexOf("-ss"), args.indexOf("-ss") + 4)).toEqual(["-ss", "10", "-t", "10"]);
    expect(args).not.toContain("copy");
  });

  it("does not fall back to an untrimmed file after a failed single-segment trim", async () => {
    const dir = await temp(); mocks.spawn.mockImplementation(() => { const process = child(); queueMicrotask(() => process.emit("close", 1, null)); return process; });
    const result = await RangeExporter.exportRange({ cameraId: "cam", fromTime: new Date(1000), toTime: new Date(2000), outputPath: join(dir, "export.mp4") },
      [{ id: "s", storagePath: "source.mkv", startedAt: new Date(0), endedAt: new Date(15_000), sizeBytes: 20 }]);
    expect(result.success).toBe(false); expect(result.error).toBe("ffmpeg_trim_failed"); expect(mocks.spawn).toHaveBeenCalledOnce();
  });
});
