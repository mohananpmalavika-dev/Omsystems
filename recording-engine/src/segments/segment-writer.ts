import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { SegmentState } from "../manifest/segment-manifest.js";

export interface SegmentWriterConfig {
  stagingDirectory: string;
  targetDirectory: string;
  cameraId: string;
  segmentDurationSeconds?: number;
  containerFormat?: "mkv" | "mp4";
}

export interface ActiveSegment {
  segmentId: string;
  stagingPartialPath: string;
  targetFinalPath: string;
  manifestPath: string;
  startTime: Date;
  expectedEndTime: Date;
  containerFormat: "mkv" | "mp4";
  state: SegmentState;
}

export class SegmentWriter {
  public readonly config: Required<SegmentWriterConfig>;
  private currentSegment?: ActiveSegment;

  constructor(config: SegmentWriterConfig) {
    this.config = {
      segmentDurationSeconds: 15,
      containerFormat: "mkv",
      ...config,
    };
  }

  /**
   * Generates a new segment and sets up its staging .partial file path.
   */
  async createNewSegment(startTime: Date = new Date()): Promise<ActiveSegment> {
    const segmentId = randomUUID();
    const durationMs = this.config.segmentDurationSeconds * 1000;
    const expectedEndTime = new Date(startTime.getTime() + durationMs);

    await mkdir(this.config.stagingDirectory, { recursive: true });
    await mkdir(this.config.targetDirectory, { recursive: true });

    const ext = this.config.containerFormat;
    const fileNamePartial = `${segmentId}.${ext}.partial`;
    const fileNameFinal = `${segmentId}.${ext}`;
    const manifestFileName = `${segmentId}.json`;

    const stagingPartialPath = join(this.config.stagingDirectory, fileNamePartial);
    const targetFinalPath = join(this.config.targetDirectory, fileNameFinal);
    const manifestPath = join(this.config.targetDirectory, manifestFileName);

    const segment: ActiveSegment = {
      segmentId,
      stagingPartialPath,
      targetFinalPath,
      manifestPath,
      startTime,
      expectedEndTime,
      containerFormat: this.config.containerFormat,
      state: "WRITING",
    };

    this.currentSegment = segment;
    return segment;
  }

  getCurrentSegment(): ActiveSegment | undefined {
    return this.currentSegment;
  }

  clearCurrentSegment() {
    this.currentSegment = undefined;
  }
}
