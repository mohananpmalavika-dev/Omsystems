import { spawn } from "node:child_process";

export interface RtspProbeResult {
  reachable: boolean;
  codec: string | null;
  width: number | null;
  height: number | null;
  error?: string;
}

export interface RtspStreamMetrics extends RtspProbeResult {
  /** Frames per second observed by ffprobe during the sample, when available. */
  fps: number | null;
  /** Video payload bitrate measured from received packet sizes during the sample. */
  bitrateKbps: number | null;
  sampleDurationSeconds: number | null;
}

type FfprobeStream = {
  codec_name?: string;
  width?: number;
  height?: number;
  avg_frame_rate?: string;
  r_frame_rate?: string;
  nb_read_frames?: string | number;
};

type FfprobePacket = { pts_time?: string; size?: string | number };
type FfprobeOutput = { streams?: FfprobeStream[]; packets?: FfprobePacket[] };

export async function probeRtsp(
  uri: string,
  ffprobePath = "ffprobe",
  timeoutMs = 10_000,
): Promise<RtspProbeResult> {
  const result = await runProcess(ffprobePath, [
    "-v", "error",
    "-rtsp_transport", "tcp",
    "-select_streams", "v:0",
    "-show_entries", "stream=codec_name,width,height",
    "-of", "json",
    uri,
  ], timeoutMs);
  if (!result.ok) {
    return { reachable: false, codec: null, width: null, height: null, error: result.error };
  }
  try {
    const stream = (JSON.parse(result.stdout) as FfprobeOutput).streams?.[0];
    return {
      reachable: Boolean(stream),
      codec: stream?.codec_name ?? null,
      width: stream?.width ?? null,
      height: stream?.height ?? null,
      ...(stream ? {} : { error: "No video stream found" }),
    };
  } catch {
    return { reachable: false, codec: null, width: null, height: null, error: "Invalid ffprobe output" };
  }
}

/**
 * Samples a live RTSP video stream. Values are derived from the packets and
 * frames ffprobe receives; configured camera settings are never used as a
 * fallback so unavailable data remains visibly unavailable.
 */
export async function measureRtspStream(
  uri: string,
  options: {
    ffprobePath?: string;
    timeoutMs?: number;
    sampleDurationSeconds?: number;
  } = {},
): Promise<RtspStreamMetrics> {
  const sampleDurationSeconds = Math.max(1, Math.min(10, options.sampleDurationSeconds ?? 3));
  const result = await runProcess(options.ffprobePath ?? "ffprobe", [
    "-v", "error",
    "-rtsp_transport", "tcp",
    "-select_streams", "v:0",
    "-read_intervals", `%+${sampleDurationSeconds}`,
    "-count_frames",
    "-show_streams",
    "-show_packets",
    "-show_entries", "stream=codec_name,width,height,avg_frame_rate,r_frame_rate,nb_read_frames:packet=pts_time,size",
    "-of", "json",
    uri,
  ], options.timeoutMs ?? Math.max(10_000, sampleDurationSeconds * 3_000));
  if (!result.ok) {
    return {
      reachable: false, codec: null, width: null, height: null,
      fps: null, bitrateKbps: null, sampleDurationSeconds: null, error: result.error,
    };
  }
  try {
    return parseRtspStreamMetrics(JSON.parse(result.stdout) as FfprobeOutput);
  } catch {
    return {
      reachable: false, codec: null, width: null, height: null,
      fps: null, bitrateKbps: null, sampleDurationSeconds: null, error: "Invalid ffprobe output",
    };
  }
}

export function parseRtspStreamMetrics(output: FfprobeOutput): RtspStreamMetrics {
  const stream = output.streams?.[0];
  if (!stream) {
    return {
      reachable: false, codec: null, width: null, height: null,
      fps: null, bitrateKbps: null, sampleDurationSeconds: null, error: "No video stream found",
    };
  }
  const packets = output.packets ?? [];
  const timestamps = packets
    .map((packet) => Number(packet.pts_time))
    .filter((timestamp) => Number.isFinite(timestamp));
  const firstTimestamp = timestamps.length ? Math.min(...timestamps) : null;
  const lastTimestamp = timestamps.length ? Math.max(...timestamps) : null;
  const sampleDurationSeconds = firstTimestamp !== null && lastTimestamp !== null && lastTimestamp > firstTimestamp
    ? round(lastTimestamp - firstTimestamp, 3)
    : null;
  const framesRead = Number(stream.nb_read_frames);
  const advertisedFps = parseFrameRate(stream.avg_frame_rate) ?? parseFrameRate(stream.r_frame_rate);
  const fps = sampleDurationSeconds && Number.isFinite(framesRead) && framesRead > 0
    ? round(framesRead / sampleDurationSeconds, 2)
    : advertisedFps;
  const packetBytes = packets.reduce((total, packet) => {
    const size = Number(packet.size);
    return total + (Number.isFinite(size) && size >= 0 ? size : 0);
  }, 0);
  const bitrateKbps = sampleDurationSeconds && packetBytes > 0
    ? Math.round((packetBytes * 8) / (sampleDurationSeconds * 1_000))
    : null;

  return {
    reachable: true,
    codec: stream.codec_name ?? null,
    width: stream.width ?? null,
    height: stream.height ?? null,
    fps: fps === null ? null : round(fps, 2),
    bitrateKbps,
    sampleDurationSeconds,
  };
}

/** Extracts a small luminance frame for black-screen and freeze detection. */
export async function captureRtspLumaFrame(
  uri: string,
  ffmpegPath = "ffmpeg",
  timeoutMs = 10_000,
): Promise<Buffer | null> {
  const result = await runProcess(ffmpegPath, [
    "-v", "error",
    "-rtsp_transport", "tcp",
    "-i", uri,
    "-frames:v", "1",
    "-vf", "scale=64:36,format=gray",
    "-f", "rawvideo",
    "-pix_fmt", "gray",
    "pipe:1",
  ], timeoutMs);
  return result.ok && result.stdoutBuffer.length === 64 * 36 ? result.stdoutBuffer : null;
}

export function parseFrameRate(value: string | undefined): number | null {
  if (!value) return null;
  const parts = value.split("/");
  const numerator = Number(parts[0]);
  const denominator = Number(parts[1]);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0 || numerator <= 0) return null;
  return numerator / denominator;
}

function round(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

async function runProcess(command: string, args: string[], timeoutMs: number): Promise<{
  ok: boolean;
  stdout: string;
  stdoutBuffer: Buffer;
  error: string;
}> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: { ok: boolean; stdout: string; stdoutBuffer: Buffer; error: string }) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(value);
      }
    };
    const child = spawn(command, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    const output: Buffer[] = [];
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      finish({ ok: false, stdout: "", stdoutBuffer: Buffer.alloc(0), error: "RTSP probe timed out" });
    }, timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => { output.push(chunk); });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on("error", (error) => {
      finish({ ok: false, stdout: "", stdoutBuffer: Buffer.alloc(0), error: redactCredentials(error.message) });
    });
    child.on("close", (code) => {
      const stdoutBuffer = Buffer.concat(output);
      finish({
        ok: code === 0,
        stdout: stdoutBuffer.toString(),
        stdoutBuffer,
        error: redactCredentials(stderr.trim() || `RTSP probe exited with code ${code ?? "unknown"}`),
      });
    });
  });
}

function redactCredentials(value: string) {
  return value.replace(/(rtsp:\/\/)[^@\s]+@/gi, "$1[redacted]@");
}
