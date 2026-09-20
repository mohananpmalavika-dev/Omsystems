export type FisheyeProjection = "equidistant" | "equisolid" | "stereographic" | "orthographic";

export interface FisheyeCalibration {
  projection: FisheyeProjection;
  horizontalFovDegrees: number;
  verticalFovDegrees: number;
  yawDegrees?: number;
  pitchDegrees?: number;
  rollDegrees?: number;
}

export interface DewarpExecutionInput {
  inputPath: string;
  outputPath: string;
  calibration: FisheyeCalibration;
  outputWidth: number;
  outputHeight: number;
}

export interface MediaProcessRunner {
  run(executable: string, args: string[]): Promise<{ exitCode: number; stderr?: string }>;
}

/**
 * Runs FFmpeg's v360 filter with a per-camera calibration. Raw fisheye frames
 * are never replaced: the caller must keep the original and store the derived
 * output as a separately hashed artifact.
 */
export class FisheyeDewarpService {
  constructor(private readonly runner: MediaProcessRunner, private readonly ffmpegPath = "ffmpeg") {}

  buildFilter(calibration: FisheyeCalibration, width: number, height: number): string {
    this.assertCalibration(calibration, width, height);
    const params = [
      "input=fisheye",
      "output=rectilinear",
      `in_stereo=mono`,
      `ih_fov=${calibration.horizontalFovDegrees}`,
      `iv_fov=${calibration.verticalFovDegrees}`,
      `yaw=${calibration.yawDegrees ?? 0}`,
      `pitch=${calibration.pitchDegrees ?? 0}`,
      `roll=${calibration.rollDegrees ?? 0}`,
      `w=${width}`,
      `h=${height}`,
    ];
    return `v360=${params.join(":")}`;
  }

  async dewarp(input: DewarpExecutionInput): Promise<void> {
    if (input.inputPath === input.outputPath) {
      throw new Error("Fisheye dewarping must write a separate derived artifact; source overwrite is forbidden");
    }
    const filter = this.buildFilter(input.calibration, input.outputWidth, input.outputHeight);
    const result = await this.runner.run(this.ffmpegPath, [
      "-hide_banner", "-nostdin", "-y", "-i", input.inputPath,
      "-vf", filter, "-map", "0:v:0", "-map", "0:a?", "-c:v", "libx264", "-c:a", "copy", input.outputPath,
    ]);
    if (result.exitCode !== 0) {
      throw new Error(`Fisheye dewarp failed${result.stderr ? `: ${result.stderr.slice(0, 500)}` : ""}`);
    }
  }

  private assertCalibration(calibration: FisheyeCalibration, width: number, height: number): void {
    if (calibration.projection !== "equidistant") {
      throw new Error(`Fisheye projection ${calibration.projection} requires a calibrated transform implementation; it must not be approximated as equidistant`);
    }
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 64 || height < 64 || width > 8192 || height > 8192) {
      throw new Error("Dewarp output dimensions must be between 64 and 8192 pixels");
    }
    for (const value of [calibration.horizontalFovDegrees, calibration.verticalFovDegrees]) {
      if (!Number.isFinite(value) || value <= 0 || value > 360) {
        throw new Error("Fisheye field of view must be greater than 0 and at most 360 degrees");
      }
    }
    for (const value of [calibration.yawDegrees, calibration.pitchDegrees, calibration.rollDegrees]) {
      if (value !== undefined && (!Number.isFinite(value) || value < -360 || value > 360)) {
        throw new Error("Fisheye orientation must be between -360 and 360 degrees");
      }
    }
  }
}
