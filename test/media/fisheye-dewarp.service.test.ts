import { describe, expect, it, vi } from "vitest";
import { FisheyeDewarpService } from "../../src/media/services/fisheye-dewarp.service.js";

describe("FisheyeDewarpService", () => {
  it("uses a calibrated v360 transform and preserves the original artifact", async () => {
    const run = vi.fn().mockResolvedValue({ exitCode: 0 });
    const service = new FisheyeDewarpService({ run }, "ffmpeg");
    await service.dewarp({
      inputPath: "original.mp4", outputPath: "derived-dewarped.mp4", outputWidth: 1920, outputHeight: 1080,
      calibration: { projection: "equidistant", horizontalFovDegrees: 180, verticalFovDegrees: 180, yawDegrees: 10 },
    });
    expect(run).toHaveBeenCalledWith("ffmpeg", expect.arrayContaining(["-i", "original.mp4", "derived-dewarped.mp4"]));
    expect(run.mock.calls[0]?.[1]).toContain("v360=input=fisheye:output=rectilinear:in_stereo=mono:ih_fov=180:iv_fov=180:yaw=10:pitch=0:roll=0:w=1920:h=1080");
  });

  it("refuses an uncalibrated/same-path transform", async () => {
    const service = new FisheyeDewarpService({ run: vi.fn() });
    await expect(service.dewarp({
      inputPath: "same.mp4", outputPath: "same.mp4", outputWidth: 1920, outputHeight: 1080,
      calibration: { projection: "equidistant", horizontalFovDegrees: 180, verticalFovDegrees: 180 },
    })).rejects.toThrow("source overwrite is forbidden");
  });
});
