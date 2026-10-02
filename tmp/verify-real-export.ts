import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import assert from "node:assert/strict";
import { RangeExporter } from "../recording-engine/src/evidence/range-exporter.js";
const run = promisify(execFile);
const bin = resolve("edge-agent/runtime/ffmpeg-n8.1.2-34-g9b6c8969e0-win64-lgpl-shared-8.1/bin");
process.env.PATH = `${bin};${process.env.PATH}`;
const dir = resolve("tmp/real-export-verification"); await mkdir(dir, { recursive: true });
for (const [index, color] of ["red", "blue"].entries()) {
  await run(join(bin, "ffmpeg.exe"), ["-v", "error", "-y", "-f", "lavfi", "-i", `color=c=${color}:s=160x120:r=10:d=15`, "-c:v", "mpeg4", join(dir, `${index}.mkv`)]);
}
const segments = [0, 1].map(index => ({ id: String(index), storagePath: join(dir, `${index}.mkv`), startedAt: new Date(index * 15000), endedAt: new Date((index + 1) * 15000), sizeBytes: 1000 }));
const result = await RangeExporter.exportRange({ cameraId: "camera", fromTime: new Date(10000), toTime: new Date(20000), outputPath: join(dir, "export.mp4") }, segments);
assert.equal(result.success, true, JSON.stringify(result));
assert.ok(Math.abs(result.durationSeconds - 10) < 0.15, JSON.stringify(result));
const pixel = async (time: string) => {
  const { stdout } = await run(join(bin, "ffmpeg.exe"), ["-v", "error", "-ss", time, "-i", result.outputPath, "-frames:v", "1", "-vf", "scale=1:1", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"], { encoding: "buffer" });
  return [...stdout];
};
const first = await pixel("0"); const second = await pixel("5.2");
assert.ok(first[0]! > first[2]!, JSON.stringify(first)); assert.ok(second[2]! > second[0]!, JSON.stringify(second));
console.log(JSON.stringify({ success: result.success, durationSeconds: result.durationSeconds, segmentsUsed: result.segmentsUsed, firstPixel: first, secondPixel: second }));
