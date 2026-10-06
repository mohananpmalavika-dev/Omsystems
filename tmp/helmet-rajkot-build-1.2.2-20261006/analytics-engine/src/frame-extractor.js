import { spawn } from "node:child_process";
export class FfmpegFrameExtractor {
    binary;
    width;
    height;
    timeoutMs;
    spawnProcess;
    constructor(options = {}) {
        this.binary = options.binary ?? process.env.FFMPEG_PATH ?? "ffmpeg";
        this.width = options.width ?? Number(process.env.ANALYTICS_FRAME_WIDTH ?? 640);
        this.height = options.height ?? Number(process.env.ANALYTICS_FRAME_HEIGHT ?? 640);
        this.timeoutMs = options.timeoutMs ?? Number(process.env.ANALYTICS_FRAME_TIMEOUT_MS ?? 10_000);
        this.spawnProcess = options.spawnProcess ?? spawn;
        if (!Number.isInteger(this.width) || this.width < 32 || this.width > 4096)
            throw new Error("Invalid analytics frame width");
        if (!Number.isInteger(this.height) || this.height < 32 || this.height > 4096)
            throw new Error("Invalid analytics frame height");
    }
    async extract(source) {
        assertStreamUrl(source.streamUrl);
        const expectedBytes = this.width * this.height * 3;
        const inputOptions = /^rtsps?:/i.test(source.streamUrl)
            ? [
                "-rtsp_transport", "tcp",
                "-rtsp_flags", "prefer_tcp",
                "-fflags", "nobuffer",
                "-flags", "low_delay",
                "-stimeout", "5000000",
            ]
            : [];
        const hwaccelOptions = process.env.ENABLE_GPU_ACCELERATION === "true"
            ? ["-hwaccel", "auto"]
            : [];
        const args = [
            "-hide_banner", "-loglevel", "error",
            ...hwaccelOptions,
            ...inputOptions,
            "-i", source.streamUrl,
            "-frames:v", "1",
            "-vf", `scale=${this.width}:${this.height}:force_original_aspect_ratio=decrease,pad=${this.width}:${this.height}:(ow-iw)/2:(oh-ih)/2`,
            "-pix_fmt", "rgb24", "-f", "rawvideo", "pipe:1",
        ];
        const child = this.spawnProcess(this.binary, args, { stdio: ["ignore", "pipe", "pipe"] });
        const chunks = [];
        let received = 0;
        let diagnostic = "";
        return await new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                child.kill("SIGKILL");
                reject(new Error("Frame extraction timed out"));
            }, this.timeoutMs);
            timer.unref();
            child.stdout.on("data", (chunk) => {
                const remaining = expectedBytes - received;
                if (remaining > 0)
                    chunks.push(chunk.subarray(0, remaining));
                received += chunk.length;
                if (received > expectedBytes)
                    child.kill("SIGKILL");
            });
            child.stderr.on("data", (chunk) => {
                if (diagnostic.length < 2_000)
                    diagnostic += chunk.toString("utf8");
            });
            child.once("error", (error) => {
                clearTimeout(timer);
                reject(new Error(`FFmpeg could not start: ${error.message}`));
            });
            child.once("close", (code) => {
                clearTimeout(timer);
                const imageData = Buffer.concat(chunks);
                if (code !== 0 || imageData.length !== expectedBytes) {
                    const reason = diagnostic.trim().replace(source.streamUrl, "[stream]").slice(0, 500);
                    reject(new Error(`FFmpeg frame extraction failed${reason ? `: ${reason}` : ""}`));
                    return;
                }
                resolve({
                    cameraId: source.cameraId,
                    tenantId: source.tenantId,
                    timestamp: new Date(),
                    imageData,
                    width: this.width,
                    height: this.height,
                    metadata: { pixelFormat: "rgb24", extractor: "ffmpeg" },
                });
            });
        });
    }
}
function assertStreamUrl(value) {
    let parsed;
    try {
        parsed = new URL(value);
    }
    catch {
        throw new Error("Invalid stream URL");
    }
    if (!["rtsp:", "rtsps:", "http:", "https:"].includes(parsed.protocol)) {
        throw new Error(`Unsupported stream protocol: ${parsed.protocol}`);
    }
}
