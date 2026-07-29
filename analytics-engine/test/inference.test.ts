import { describe, expect, it, vi } from "vitest";
import { Tensor } from "onnxruntime-node";
import { YoloPersonInference } from "../src/inference/yolo-person-inference.js";
import { YoloCocoInference } from "../src/inference/yolo-coco-inference.js";
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

  it("runs one YOLOv8 COCO pass and keeps overlapping objects of different classes", async () => {
    // [1, 84, 3]: x, y, w, h + 80 class scores. Candidates 0 and 2 are
    // overlapping people; candidate 1 is a car at the same location.
    const values = new Float32Array(84 * 3);
    const set = (feature: number, candidate: number, value: number) => {
      values[(feature * 3) + candidate] = value;
    };
    for (const candidate of [0, 1, 2]) {
      set(0, candidate, 50);
      set(1, candidate, 50);
      set(2, candidate, 20);
      set(3, candidate, 20);
    }
    set(4, 0, 0.92); // person
    set(6, 1, 0.87); // car (COCO class 2)
    set(4, 2, 0.81); // overlapping person, suppressed by NMS
    const output = new Tensor("float32", values, [1, 84, 3]);
    const run = vi.fn(async () => ({ output0: output }));
    const session = { inputNames: ["images"], outputNames: ["output0"], run };
    const inference = new YoloCocoInference(session as never);
    const detections = await inference.run({
      cameraId: "camera-1", tenantId: "tenant-1", timestamp: new Date(),
      imageData: Buffer.alloc(100 * 100 * 3, 127), width: 100, height: 100,
    });

    expect(run).toHaveBeenCalledOnce();
    expect(detections).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "person", confidence: expect.closeTo(0.92) }),
      expect.objectContaining({ label: "car", confidence: expect.closeTo(0.87) }),
    ]));
    expect(detections).toHaveLength(2);
  });

  it("rejects unsafe stream protocols before starting FFmpeg", async () => {
    const spawnProcess = vi.fn();
    const extractor = new FfmpegFrameExtractor({ spawnProcess: spawnProcess as never });
    await expect(extractor.extract({ cameraId: "c", tenantId: "t", streamUrl: "file:///etc/passwd" }))
      .rejects.toThrow("Unsupported stream protocol");
    expect(spawnProcess).not.toHaveBeenCalled();
  });
});
