import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  HardwareEncoderDetector,
  RedactionFilterGraphBuilder,
} from "../../src/recording/hardware-encoder.js";

describe("Hardware Redaction Acceleration Engine", () => {
  const originalEnv = process.env.FORCE_HARDWARE_ENCODER;

  beforeEach(() => {
    HardwareEncoderDetector.clearCache();
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.FORCE_HARDWARE_ENCODER = originalEnv;
    } else {
      delete process.env.FORCE_HARDWARE_ENCODER;
    }
    HardwareEncoderDetector.clearCache();
  });

  it("detects system encoder capabilities with safe fallback to CPU libx264", () => {
    delete process.env.FORCE_HARDWARE_ENCODER;
    const profile = HardwareEncoderDetector.detect();

    expect(profile).toBeDefined();
    expect(profile.encoder).toBeDefined();
    expect(["h264_nvenc", "h264_vaapi", "h264_videotoolbox", "libx264"]).toContain(profile.encoder);
    expect(profile.outputCodecFlags.length).toBeGreaterThan(0);
  });

  it("respects NVIDIA NVENC override and sets CUDA acceleration flags", () => {
    process.env.FORCE_HARDWARE_ENCODER = "h264_nvenc";
    const profile = HardwareEncoderDetector.detect();

    expect(profile.encoder).toBe("h264_nvenc");
    expect(profile.accelType).toBe("CUDA");
    expect(profile.isHardwareAccelerated).toBe(true);
    expect(profile.hwaccelFlags).toEqual(["-hwaccel", "cuda"]);
    expect(profile.outputCodecFlags).toContain("-c:v");
    expect(profile.outputCodecFlags).toContain("h264_nvenc");
  });

  it("respects Intel/AMD VA-API override with hardware device flags", () => {
    process.env.FORCE_HARDWARE_ENCODER = "h264_vaapi";
    const profile = HardwareEncoderDetector.detect();

    expect(profile.encoder).toBe("h264_vaapi");
    expect(profile.accelType).toBe("VAAPI");
    expect(profile.isHardwareAccelerated).toBe(true);
    expect(profile.outputCodecFlags).toContain("-c:v");
    expect(profile.outputCodecFlags).toContain("h264_vaapi");
  });

  it("constructs optimized boxblur filter graph for default privacy masking", () => {
    const filter = RedactionFilterGraphBuilder.buildFilterGraph({
      blurStrength: 20,
    });

    expect(filter).toContain("boxblur=luma_radius=20:luma_power=2");
  });

  it("constructs crop-and-overlay filter graph for a single bounding box with time constraints", () => {
    const filter = RedactionFilterGraphBuilder.buildFilterGraph({
      boundingBoxes: [
        {
          x: 100,
          y: 150,
          width: 80,
          height: 120,
          startTimeSec: 2.5,
          endTimeSec: 8.0,
          blurRadius: 15,
        },
      ],
      blurStrength: 15,
    });

    expect(filter).toContain("split=2[orig][crop_src]");
    expect(filter).toContain("crop=80:120:100:150");
    expect(filter).toContain("boxblur=luma_radius=15:luma_power=2");
    expect(filter).toContain("overlay=100:150:enable='between(t,2.500,8.000)'[outv]");
  });

  it("constructs multi-stage daisy-chained filter graph for multiple redaction zones", () => {
    const filter = RedactionFilterGraphBuilder.buildFilterGraph({
      boundingBoxes: [
        { x: 50, y: 50, width: 60, height: 60, startTimeSec: 0, endTimeSec: 10 },
        { x: 300, y: 400, width: 120, height: 160 },
      ],
      blurStrength: 25,
    });

    expect(filter).toContain("split=3[orig][crop_0][crop_1]");
    expect(filter).toContain("crop=60:60:50:50");
    expect(filter).toContain("crop=120:160:300:400");
    expect(filter).toContain("[orig][blur_0]overlay=50:50:enable='between(t,0.000,10.000)'[ov_0]");
    expect(filter).toContain("[ov_0][blur_1]overlay=300:400[outv]");
  });
});
