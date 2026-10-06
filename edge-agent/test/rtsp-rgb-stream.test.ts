import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RtspRgbStream } from "../src/streaming/rtsp-rgb-stream.js";

const { spawn } = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock("node:child_process", () => ({ spawn }));

const children: Array<ReturnType<typeof decoder>> = [];
const streams: RtspRgbStream[] = [];
const runtime = resolve("edge-agent/runtime");
const ffmpeg = existsSync(runtime) ? readdirSync(runtime).map(name => resolve(runtime, name, "bin/ffmpeg.exe"))
  .find(path => existsSync(path)) : undefined;
function decoder() {
  const child = Object.assign(new EventEmitter(), {
    stdout: new PassThrough(), stderr: new PassThrough(), exitCode: null as number | null,
    signalCode: null as string | null, kill: vi.fn(),
  });
  child.kill.mockImplementation(() => { child.signalCode = "SIGTERM"; child.emit("close", null); return true; });
  return child;
}
function stream() {
  const value = new RtspRgbStream("rtsp://camera/main", "ffmpeg", 2, 1);
  streams.push(value);
  value.start();
  return value;
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000);
  children.length = 0;
  spawn.mockReset().mockImplementation(() => { const child = decoder(); children.push(child); return child; });
});
afterEach(() => {
  for (const value of streams.splice(0)) value.stop();
  vi.useRealTimers();
});

describe("continuous RTSP analytics capture", () => {
  it.skipIf(!ffmpeg)("reads consecutive full-sized frames from a real FFmpeg process", async () => {
    vi.useRealTimers();
    const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process");
    spawn.mockImplementation((_command, args: string[], options) => actual.spawn(ffmpeg!, [
      "-v", "error", "-nostdin", "-re", "-f", "lavfi", "-i", "testsrc2=size=64x36:rate=10",
      ...args.slice(args.indexOf("-map")),
    ], options));
    const capture = new RtspRgbStream("rtsp://isolated-fixture", "fixture-ffmpeg");
    streams.push(capture);
    capture.start();
    await vi.waitFor(() => expect(capture.latestFrame()?.rgb.length).toBe(640 * 360 * 3), {timeout:10_000});
    const first = capture.latestFrame()!;
    await vi.waitFor(() => expect(capture.latestFrame()?.capturedAt).not.toBe(first.capturedAt), {timeout:5_000});
    expect(capture.latestFrame()?.rgb.length).toBe(640 * 360 * 3);
    expect(spawn).toHaveBeenCalledOnce();
    capture.stop();
    expect(capture.latestFrame()).toBeNull();
  });

  it("assembles fragmented RGB frames, retains only the latest, and preserves earlier buffers", () => {
    const capture = stream(), child = children[0]!;
    child.stdout.write(Buffer.from([1, 2, 3]));
    expect(capture.latestFrame()).toBeNull();
    child.stdout.write(Buffer.from([4, 5, 6, 7, 8]));
    const first = capture.latestFrame()!;
    expect([...first.rgb]).toEqual([1, 2, 3, 4, 5, 6]);
    vi.setSystemTime(2_000);
    child.stdout.write(Buffer.from([9, 10, 11, 12, 13, 14, 15, 16, 17, 18]));
    expect([...capture.latestFrame()!.rgb]).toEqual([13, 14, 15, 16, 17, 18]);
    expect([...first.rgb]).toEqual([1, 2, 3, 4, 5, 6]);
    expect(capture.latestFrame()!.capturedAt).toBe(new Date(2_000).toISOString());
    capture.start();
    expect(spawn).toHaveBeenCalledOnce();
  });

  it("expires a stale frame without refreshing its timestamp on repeated reads", () => {
    const capture = stream();
    children[0]!.stdout.write(Buffer.alloc(6));
    vi.setSystemTime(3_000);
    expect(capture.latestFrame()!.capturedAt).toBe(new Date(1_000).toISOString());
    vi.setSystemTime(4_001);
    expect(capture.latestFrame()).toBeNull();
  });

  it("reconnects stalled decoders and discards partial bytes and late output from the old process", async () => {
    const capture = stream(), old = children[0]!;
    old.stdout.write(Buffer.alloc(6, 1));
    old.stdout.write(Buffer.from([2, 2]));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(old.kill).toHaveBeenCalledOnce();
    expect(capture.latestFrame()).toBeNull();
    await vi.advanceTimersByTimeAsync(2_000);
    const fresh = children[1]!;
    old.stdout.write(Buffer.alloc(6, 9));
    fresh.stdout.write(Buffer.alloc(6, 3));
    expect([...capture.latestFrame()!.rgb]).toEqual([3, 3, 3, 3, 3, 3]);
  });

  it("handles missing FFmpeg and retries independently with bounded backoff", async () => {
    stream();
    for (const [index, delayMs] of [2_000, 4_000, 8_000, 16_000, 30_000, 30_000].entries()) {
      children[index]!.emit("error", new Error("ENOENT rtsp://secret@camera"));
      await vi.advanceTimersByTimeAsync(delayMs - 1);
      expect(spawn).toHaveBeenCalledTimes(index + 1);
      await vi.advanceTimersByTimeAsync(1);
      expect(spawn).toHaveBeenCalledTimes(index + 2);
    }
  });

  it("stops capture and prevents a pending reconnect from resurrecting it", async () => {
    const capture = stream();
    children[0]!.emit("close", 1);
    capture.stop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(spawn).toHaveBeenCalledOnce();
    expect(capture.latestFrame()).toBeNull();
  });
});
