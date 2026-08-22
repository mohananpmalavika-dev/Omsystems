import { describe, expect, it, vi } from "vitest";
import { Tensor } from "onnxruntime-node";
import { YoloPersonInference } from "../src/inference/yolo-person-inference.js";
import { YoloCocoInference } from "../src/inference/yolo-coco-inference.js";
import { FfmpegFrameExtractor } from "../src/frame-extractor.js";
import { YoloDetectionInference } from "../src/inference/yolo-detection-inference.js";
import { CtcTextInference } from "../src/inference/vision-specialty-inference.js";

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
    const run = vi.fn(async (_feeds: Record<string, Tensor>) => ({ output0: output }));
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

  it("resizes RGB frames and normalizes task-specific YOLO detections", async () => {
    const output = new Tensor("float32", new Float32Array([
      32, 48, 32, 16, 16, 12, 16, 12, 0.91, 0.05, 0.03, 0.88,
    ]), [1, 6, 2]);
    const run = vi.fn(async (_feeds: Record<string, Tensor>) => ({ output0: output }));
    const inference = new YoloDetectionInference({
      inputNames: ["images"], outputNames: ["output0"], run,
    } as never, {
      labels: ["fire", "smoke"], inputWidth: 64, inputHeight: 32,
    });
    const detections = await inference.run({
      cameraId: "camera-1", tenantId: "tenant-1", timestamp: new Date(),
      imageData: Buffer.alloc(32 * 16 * 3, 127), width: 32, height: 16,
    });

    const feed = run.mock.calls[0]![0] as Record<string, Tensor>;
    expect(feed.images?.dims).toEqual([1, 3, 32, 64]);
    expect(detections.map((item) => item.label)).toEqual(["fire", "smoke"]);
    expect(detections.every((item) => Object.values(item.boundingBox).every((value) => value >= 0 && value <= 1))).toBe(true);
  });

  it("decodes a local CTC plate-recognition tensor", async () => {
    const alphabet = ["", "D", "L", "1"];
    const steps = [1, 1, 0, 2, 3];
    const logits = new Float32Array(steps.length * alphabet.length).fill(-5);
    steps.forEach((selected, step) => { logits[(step * alphabet.length) + selected] = 5; });
    const run = vi.fn(async () => ({ output: new Tensor("float32", logits, [1, steps.length, alphabet.length]) }));
    const inference = new CtcTextInference({ inputNames: ["images"], outputNames: ["output"], run } as never, alphabet, 0, 32, 16);
    const result = await inference.run({
      cameraId: "camera-1", tenantId: "tenant-1", timestamp: new Date(),
      imageData: Buffer.alloc(64 * 32 * 3, 200), width: 64, height: 32,
    }, { x: 0.1, y: 0.2, width: 0.8, height: 0.5 });

    expect(result.text).toBe("DL1");
    expect(result.confidence).toBeGreaterThan(0.99);
  });
});
