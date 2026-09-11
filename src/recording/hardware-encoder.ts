import { spawnSync } from "node:child_process";

export type HardwareAccelerationType = "CUDA" | "VAAPI" | "VIDEOTOOLBOX" | "NONE";

export interface HardwareEncoderProfile {
  encoder: string;
  accelType: HardwareAccelerationType;
  hwaccelFlags: string[];
  outputCodecFlags: string[];
  isHardwareAccelerated: boolean;
  name: string;
}

export interface BoundingBoxRedaction {
  x: number;
  y: number;
  width: number;
  height: number;
  startTimeSec?: number;
  endTimeSec?: number;
  blurRadius?: number;
  mode?: "blur" | "pixelate" | "solid";
  label?: string;
}

export interface RedactionFilterOptions {
  boundingBoxes?: BoundingBoxRedaction[];
  targets?: Array<"FACES" | "LICENSE_PLATES" | "PEOPLE" | "STATIC_ZONES" | "CUSTOM">;
  blurStrength?: number;
  mode?: "blur" | "pixelate" | "solid";
  watermarkText?: string;
  audioAction?: "PASS_THROUGH" | "MUTE" | "REMOVE_TRACK";
  videoWidth?: number;
  videoHeight?: number;
}

/**
 * HardwareEncoderDetector
 * 
 * Detects available GPU and hardware-accelerated video encoders (NVIDIA NVENC,
 * Intel/AMD VA-API, Apple VideoToolbox) with automatic fallback to optimized CPU libx264.
 */
export class HardwareEncoderDetector {
  private static cachedProfile: HardwareEncoderProfile | null = null;

  /**
   * Clears cached profile (for unit testing)
   */
  public static clearCache(): void {
    this.cachedProfile = null;
  }

  /**
   * Probes system capabilities and resolves the optimal encoder profile
   */
  public static detect(): HardwareEncoderProfile {
    if (this.cachedProfile) {
      return this.cachedProfile;
    }

    // Allow explicit override via environment variables
    const envOverride = process.env.FORCE_HARDWARE_ENCODER;
    if (envOverride) {
      this.cachedProfile = this.createProfileForEncoder(envOverride);
      return this.cachedProfile;
    }

    try {
      const probe = spawnSync("ffmpeg", ["-encoders", "-v", "quiet"], {
        encoding: "utf-8",
        timeout: 3000,
      });

      if (!probe.error && probe.stdout) {
        const stdout = probe.stdout;

        // 1. Check NVIDIA NVENC (Highest throughput for surveillance)
        if (stdout.includes("h264_nvenc")) {
          this.cachedProfile = {
            encoder: "h264_nvenc",
            accelType: "CUDA",
            hwaccelFlags: ["-hwaccel", "cuda"],
            outputCodecFlags: ["-c:v", "h264_nvenc", "-preset", "p4", "-rc", "vbr", "-cq", "23"],
            isHardwareAccelerated: true,
            name: "NVIDIA NVENC (CUDA Accelerated)",
          };
          return this.cachedProfile;
        }

        // 2. Check Intel / AMD VA-API
        if (stdout.includes("h264_vaapi")) {
          this.cachedProfile = {
            encoder: "h264_vaapi",
            accelType: "VAAPI",
            hwaccelFlags: ["-vaapi_device", "/dev/dri/renderD128", "-hwaccel", "vaapi"],
            outputCodecFlags: ["-c:v", "h264_vaapi", "-qp", "24"],
            isHardwareAccelerated: true,
            name: "Intel/AMD VA-API (Hardware Accelerated)",
          };
          return this.cachedProfile;
        }

        // 3. Check Apple VideoToolbox
        if (stdout.includes("h264_videotoolbox")) {
          this.cachedProfile = {
            encoder: "h264_videotoolbox",
            accelType: "VIDEOTOOLBOX",
            hwaccelFlags: ["-hwaccel", "videotoolbox"],
            outputCodecFlags: ["-c:v", "h264_videotoolbox", "-b:v", "4000k"],
            isHardwareAccelerated: true,
            name: "Apple VideoToolbox (Hardware Accelerated)",
          };
          return this.cachedProfile;
        }
      }
    } catch {
      // ffmpeg not installed or probe timed out, fall through to CPU fallback
    }

    // 4. Default CPU Fallback (Universally compatible libx264)
    this.cachedProfile = {
      encoder: "libx264",
      accelType: "NONE",
      hwaccelFlags: [],
      outputCodecFlags: ["-c:v", "libx264", "-preset", "veryfast", "-crf", "22"],
      isHardwareAccelerated: false,
      name: "CPU Software Transcode (libx264 veryfast)",
    };

    return this.cachedProfile;
  }

  private static createProfileForEncoder(encoderName: string): HardwareEncoderProfile {
    switch (encoderName.toLowerCase()) {
      case "h264_nvenc":
      case "nvenc":
        return {
          encoder: "h264_nvenc",
          accelType: "CUDA",
          hwaccelFlags: ["-hwaccel", "cuda"],
          outputCodecFlags: ["-c:v", "h264_nvenc", "-preset", "p4"],
          isHardwareAccelerated: true,
          name: "NVIDIA NVENC (Overridden)",
        };
      case "h264_vaapi":
      case "vaapi":
        return {
          encoder: "h264_vaapi",
          accelType: "VAAPI",
          hwaccelFlags: ["-hwaccel", "vaapi"],
          outputCodecFlags: ["-c:v", "h264_vaapi"],
          isHardwareAccelerated: true,
          name: "Intel/AMD VA-API (Overridden)",
        };
      case "h264_videotoolbox":
      case "videotoolbox":
        return {
          encoder: "h264_videotoolbox",
          accelType: "VIDEOTOOLBOX",
          hwaccelFlags: ["-hwaccel", "videotoolbox"],
          outputCodecFlags: ["-c:v", "h264_videotoolbox"],
          isHardwareAccelerated: true,
          name: "Apple VideoToolbox (Overridden)",
        };
      default:
        return {
          encoder: "libx264",
          accelType: "NONE",
          hwaccelFlags: [],
          outputCodecFlags: ["-c:v", "libx264", "-preset", "veryfast"],
          isHardwareAccelerated: false,
          name: "CPU Software Transcode (Fallback)",
        };
    }
  }
}

/**
 * RedactionFilterGraphBuilder
 * 
 * Constructs high-performance FFmpeg complex filter graphs for bounding-box
 * privacy masking (boxblur / delogo) across specified time intervals.
 */
export class RedactionFilterGraphBuilder {
  /**
   * Alias for buildFilterGraph for filter complex invocations
   */
  public static buildFilterComplex(options: RedactionFilterOptions): string {
    return RedactionFilterGraphBuilder.buildFilterGraph(options);
  }

  /**
   * Builds the filter graph string for FFmpeg `-vf` or `-filter_complex`
   */
  public static buildFilterGraph(options: RedactionFilterOptions): string {
    const boxes = options.boundingBoxes || [];
    const blurRadius = options.blurStrength || 15;
    const defaultMode = options.mode || "blur";

    const getFilterForBox = (box: BoundingBoxRedaction, w: number, h: number): string => {
      const mode = box.mode || defaultMode;
      if (mode === "solid") {
        return `drawbox=x=0:y=0:w=${w}:h=${h}:color=black:t=fill`;
      }
      const requestedRadius = box.blurRadius || blurRadius;
      const maxLuma = Math.max(2, Math.floor(Math.min(w, h) / 2) - 1);
      const maxChroma = Math.max(1, Math.floor(Math.min(w, h) / 4) - 1);
      const lumaR = Math.min(requestedRadius, maxLuma);
      const chromaR = Math.min(requestedRadius, maxChroma);

      if (mode === "pixelate") {
        return `boxblur=luma_radius=${lumaR}:luma_power=3:chroma_radius=${chromaR}`;
      }
      return `boxblur=luma_radius=${lumaR}:luma_power=2:chroma_radius=${chromaR}`;
    };

    const formatWatermarkFilter = (text: string): string => {
      const clean = text.replace(/'/g, "\\'").replace(/:/g, "\\:");
      const fontOpt = process.platform === "win32" ? "fontfile=/Windows/Fonts/arial.ttf:" : "";
      return `drawtext=${fontOpt}text='${clean}':fontcolor=white@0.85:fontsize=16:x=24:y=h-44:box=1:boxcolor=black@0.6`;
    };

    // If no specific bounding boxes are provided, construct a standard privacy region mask
    if (boxes.length === 0) {
      const baseFilter = `boxblur=luma_radius=${blurRadius}:luma_power=2`;
      if (options.watermarkText) {
        return `${baseFilter},${formatWatermarkFilter(options.watermarkText)}`;
      }
      return baseFilter;
    }

    if (boxes.length === 1) {
      const box = boxes[0]!;
      const bw = Math.round(box.width);
      const bh = Math.round(box.height);
      const bx = Math.round(box.x);
      const by = Math.round(box.y);
      const enableCondition = this.buildEnableExpression(box.startTimeSec, box.endTimeSec);
      const conditionStr = enableCondition ? `:enable='${enableCondition}'` : "";
      const boxFilter = getFilterForBox(box, bw, bh);

      const targetOut = options.watermarkText ? "pre_wm" : "outv";
      let graph =
        `[0:v]split=2[orig][crop_src];` +
        `[crop_src]crop=${bw}:${bh}:${bx}:${by},` +
        `${boxFilter}[blurred];` +
        `[orig][blurred]overlay=${bx}:${by}${conditionStr}[${targetOut}]`;

      if (options.watermarkText) {
        graph += `;[${targetOut}]${formatWatermarkFilter(options.watermarkText)}[outv]`;
      }
      return graph;
    }

    // Multi-box daisy chain
    let graph = `[0:v]split=${boxes.length + 1}[orig]`;
    for (let i = 0; i < boxes.length; i++) {
      graph += `[crop_${i}]`;
    }
    graph += ";";

    let lastOverlay = "orig";
    for (let i = 0; i < boxes.length; i++) {
      const box = boxes[i]!;
      const bw = Math.round(box.width);
      const bh = Math.round(box.height);
      const bx = Math.round(box.x);
      const by = Math.round(box.y);
      const enableCondition = this.buildEnableExpression(box.startTimeSec, box.endTimeSec);
      const conditionStr = enableCondition ? `:enable='${enableCondition}'` : "";
      const isLast = i === boxes.length - 1;
      const nextOverlay = isLast ? (options.watermarkText ? "pre_wm" : "outv") : `ov_${i}`;
      const boxFilter = getFilterForBox(box, bw, bh);

      graph +=
        `[crop_${i}]crop=${bw}:${bh}:${bx}:${by},` +
        `${boxFilter}[blur_${i}];` +
        `[${lastOverlay}][blur_${i}]overlay=${bx}:${by}${conditionStr}[${nextOverlay}];`;

      lastOverlay = nextOverlay;
    }

    if (options.watermarkText) {
      graph += `[pre_wm]${formatWatermarkFilter(options.watermarkText)}[outv];`;
    }

    // Remove trailing semicolon
    return graph.replace(/;$/, "");
  }

  private static buildEnableExpression(startTime?: number, endTime?: number): string | null {
    if (startTime !== undefined && endTime !== undefined) {
      return `between(t,${startTime.toFixed(3)},${endTime.toFixed(3)})`;
    }
    if (startTime !== undefined) {
      return `gte(t,${startTime.toFixed(3)})`;
    }
    if (endTime !== undefined) {
      return `lte(t,${endTime.toFixed(3)})`;
    }
    return null;
  }
}
