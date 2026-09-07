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
}

export interface RedactionFilterOptions {
  boundingBoxes?: BoundingBoxRedaction[];
  targets?: Array<"FACES" | "LICENSE_PLATES" | "PEOPLE" | "CUSTOM">;
  blurStrength?: number;
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
   * Builds the filter graph string for FFmpeg `-vf` or `-filter_complex`
   */
  public static buildFilterGraph(options: RedactionFilterOptions): string {
    const boxes = options.boundingBoxes || [];
    const blurRadius = options.blurStrength || 15;

    // If no specific bounding boxes are provided, construct a standard privacy region mask
    if (boxes.length === 0) {
      // Default privacy mask: 4-corner margin blur / top-third face zone blur
      return `boxblur=luma_radius=${blurRadius}:luma_power=2`;
    }

    if (boxes.length === 1) {
      const box = boxes[0]!;
      const enableCondition = this.buildEnableExpression(box.startTimeSec, box.endTimeSec);
      const conditionStr = enableCondition ? `:enable='${enableCondition}'` : "";

      // Single box: crop area, blur it, and overlay it back on top of original stream
      return (
        `[0:v]split=2[orig][crop_src];` +
        `[crop_src]crop=${Math.round(box.width)}:${Math.round(box.height)}:${Math.round(box.x)}:${Math.round(box.y)},` +
        `boxblur=luma_radius=${blurRadius}:luma_power=2[blurred];` +
        `[orig][blurred]overlay=${Math.round(box.x)}:${Math.round(box.y)}${conditionStr}[outv]`
      );
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
      const enableCondition = this.buildEnableExpression(box.startTimeSec, box.endTimeSec);
      const conditionStr = enableCondition ? `:enable='${enableCondition}'` : "";
      const isLast = i === boxes.length - 1;
      const nextOverlay = isLast ? "outv" : `ov_${i}`;

      graph +=
        `[crop_${i}]crop=${Math.round(box.width)}:${Math.round(box.height)}:${Math.round(box.x)}:${Math.round(box.y)},` +
        `boxblur=luma_radius=${blurRadius}:luma_power=2[blur_${i}];` +
        `[${lastOverlay}][blur_${i}]overlay=${Math.round(box.x)}:${Math.round(box.y)}${conditionStr}[${nextOverlay}];`;

      lastOverlay = nextOverlay;
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
