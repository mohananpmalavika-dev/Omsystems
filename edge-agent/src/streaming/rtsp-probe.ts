import { spawn } from "node:child_process";

export interface RtspProbeResult {
  reachable: boolean;
  codec: string | null;
  width: number | null;
  height: number | null;
  error?: string;
}

export async function probeRtsp(
  uri: string,
  ffprobePath = "ffprobe",
  timeoutMs = 10_000,
): Promise<RtspProbeResult> {
  return new Promise((resolve) => {
    const child = spawn(ffprobePath, [
      "-v", "error",
      "-rtsp_transport", "tcp",
      "-select_streams", "v:0",
      "-show_entries", "stream=codec_name,width,height",
      "-of", "json",
      uri,
    ], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill(), timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ reachable: false, codec: null, width: null, height: null, error: error.message });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        resolve({
          reachable: false, codec: null, width: null, height: null,
          error: redactCredentials(stderr.trim() || `ffprobe exited with code ${code}`),
        });
        return;
      }
      try {
        const parsed = JSON.parse(stdout) as {
          streams?: Array<{ codec_name?: string; width?: number; height?: number }>;
        };
        const stream = parsed.streams?.[0];
        resolve({
          reachable: Boolean(stream),
          codec: stream?.codec_name ?? null,
          width: stream?.width ?? null,
          height: stream?.height ?? null,
        });
      } catch {
        resolve({ reachable: false, codec: null, width: null, height: null, error: "Invalid ffprobe output" });
      }
    });
  });
}

function redactCredentials(value: string) {
  return value.replace(/(rtsp:\/\/)[^@\s]+@/gi, "$1[redacted]@");
}
