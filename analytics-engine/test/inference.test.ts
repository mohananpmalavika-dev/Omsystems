import { describe, expect, it, vi } from "vitest";
import { Tensor } from "onnxruntime-node";
import { YoloPersonInference } from "../src/inference/yolo-person-inference.js";
import { FfmpegFrameExtractor } from "../src/frame-extractor.js";

describe("local analytics foundations", () => {
  it("runs YOLO person inference and suppresses overlapping boxes", async () => {
    // [1, 5, 6]: x, y, width, height, person confidence for six candidates.
    const output = new Tensor("float32", new Float32Array([
      50, 51, 0, 0, 0, 0,
      50, 51, 0, 0, 0, 0,
      20, 20, 0, 0, 0, 0,
      20, 20, 0, 0, 0, 0,
      0.9, 0.8, 0, 0, 0, 0,
    ]), [1, 5, 6]);
    const run = vi.fn(async () => ({ output0: output }));
    const session = { inputNames: ["images"], outputNames: ["output0"], run };
    const inference = new YoloPersonInference(session as never);
    const detections = await inference.run({
      cameraId: "camera-1", tenantId: "tenant-1", timestamp: new Date(),
      imageData: Buffer.alloc(100 * 100 * 3, 127), width: 100, height: 100,
    });

    expect(run).toHaveBeenCalledOnce();
    expect(detections).toHaveLength(1);
    expect(detections[0]).toMatchObject({ label: "person", confidence: expect.closeTo(0.9) });
  });

  it("rejects unsafe stream protocols before starting FFmpeg", async () => {
    const spawnProcess = vi.fn();
    const extractor = new FfmpegFrameExtractor({ spawnProcess: spawnProcess as never });
    await expect(extractor.extract({ cameraId: "c", tenantId: "t", streamUrl: "file:///etc/passwd" }))
      .rejects.toThrow("Unsupported stream protocol");
    expect(spawnProcess).not.toHaveBeenCalled();
  });
});
