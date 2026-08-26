import { describe, expect, it, vi } from "vitest";
import { Tensor } from "onnxruntime-node";
import { YoloPersonInference } from "../src/inference/yolo-person-inference.js";
import { YoloCocoInference } from "../src/inference/yolo-coco-inference.js";
import { FfmpegFrameExtractor } from "../src/frame-extractor.js";
import { YoloDetectionInference } from "../src/inference/yolo-detection-inference.js";
import { CtcTextInference, HelmetClassificationInference } from "../src/inference/vision-specialty-inference.js";
import { LpdYuNetInference, YuNetFaceInference } from "../src/inference/opencv-specialty-inference.js";

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

  it("runs the official YOLOX layout with BGR letterbox preprocessing", async () => {
    const values = new Float32Array(3549 * 85);
    const candidate = (10 * 52) + 10; // stride-8 grid cell x=10, y=10
    const set = (feature: number, value: number) => { values[(candidate * 85) + feature] = value; };
    set(0, 0.5);
    set(1, 0.5);
    set(2, Math.log(5));
    set(3, Math.log(10));
    set(4, 0.9); // objectness
    set(5, 0.9); // COCO person class
    const output = new Tensor("float32", values, [1, 3549, 85]);
    const run = vi.fn(async () => ({ output }));
    const session = { inputNames: ["images"], outputNames: ["output"], run };
    const inference = new YoloCocoInference(session as never, 0.5, 0.45, {
      decoder: "yolox",
      preprocessor: "yolox-letterbox-bgr",
      inputWidth: 416,
      inputHeight: 416,
    });
    const rgb = Buffer.alloc(416 * 208 * 3);
    for (let offset = 0; offset < rgb.length; offset += 3) {
      rgb[offset] = 10;
      rgb[offset + 1] = 20;
      rgb[offset + 2] = 30;
    }
    const detections = await inference.run({
      cameraId: "camera-yolox", tenantId: "tenant-1", timestamp: new Date(),
      imageData: rgb, width: 416, height: 208,
    });

    const feed = run.mock.calls[0]![0] as Record<string, Tensor>;
    const tensor = feed.images?.data as Float32Array;
    const plane = 416 * 416;
    expect(feed.images?.dims).toEqual([1, 3, 416, 416]);
    expect([tensor[0], tensor[plane], tensor[2 * plane]]).toEqual([30, 20, 10]);
    expect(tensor[(300 * 416) + 10]).toBe(114); // bottom letterbox padding
    expect(detections).toHaveLength(1);
    expect(detections[0]).toMatchObject({ label: "person", confidence: expect.closeTo(0.81) });
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

  it("decodes native YuNet face landmarks and uses BGR model input", async () => {
    const outputs: Record<string, Tensor> = {};
    for (const stride of [8, 16, 32]) {
      const count = (640 / stride) * (640 / stride);
      outputs[`cls_${stride}`] = new Tensor("float32", new Float32Array(count), [count, 1]);
      outputs[`obj_${stride}`] = new Tensor("float32", new Float32Array(count), [count, 1]);
      outputs[`bbox_${stride}`] = new Tensor("float32", new Float32Array(count * 4), [count, 4]);
      outputs[`kps_${stride}`] = new Tensor("float32", new Float32Array(count * 10), [count, 10]);
    }
    (outputs.cls_8!.data as Float32Array)[0] = 0.9;
    (outputs.obj_8!.data as Float32Array)[0] = 0.9;
    const faceBox = outputs.bbox_8!.data as Float32Array;
    faceBox.set([0.5, 0.5, Math.log(2), Math.log(2)]);
    const faceLandmarks = outputs.kps_8!.data as Float32Array;
    faceLandmarks.set([0.1, 0.2, 0.8, 0.2, 0.45, 0.5, 0.2, 0.8, 0.7, 0.8]);
    const run = vi.fn(async () => outputs);
    const inference = new YuNetFaceInference({ inputNames: ["input"], run } as never, 0.8);
    const detections = await inference.run({
      cameraId: "camera-face", tenantId: "tenant-1", timestamp: new Date(),
      imageData: Buffer.from([10, 20, 30]), width: 1, height: 1,
    });

    const feed = run.mock.calls[0]![0] as Record<string, Tensor>;
    const input = feed.input!.data as Float32Array;
    const plane = 640 * 640;
    expect([input[0], input[plane], input[2 * plane]]).toEqual([30, 20, 10]);
    expect(detections).toHaveLength(1);
    expect(detections[0]).toMatchObject({ label: "face", confidence: expect.closeTo(0.9) });
    expect((detections[0]!.attributes?.landmarks as Array<unknown>)).toHaveLength(5);
  });

  it("decodes native LPD-YuNet plate corners", async () => {
    const candidateCount = 4385; // Official 320x240 LPD-YuNet prior count.
    const locations = new Float32Array(candidateCount * 14);
    // Corner order is bottom-left, top-left, top-right, bottom-right.
    locations.set([0, 0, 0, 0, -3, 3, -3, -3, 0, 0, 3, -3, 3, 3]);
    const confidence = new Float32Array(candidateCount * 2);
    confidence[1] = 0.9;
    const iou = new Float32Array(candidateCount);
    iou[0] = 0.9;
    const run = vi.fn(async () => ({
      loc: new Tensor("float32", locations, [candidateCount, 14]),
      conf: new Tensor("float32", confidence, [candidateCount, 2]),
      iou: new Tensor("float32", iou, [candidateCount, 1]),
    }));
    const inference = new LpdYuNetInference({ inputNames: ["input"], run } as never, 0.8);
    const detections = await inference.run({
      cameraId: "camera-plate", tenantId: "tenant-1", timestamp: new Date(),
      imageData: Buffer.alloc(2 * 2 * 3, 127), width: 2, height: 2,
    });

    expect(detections).toHaveLength(1);
    expect(detections[0]).toMatchObject({ label: "license-plate", confidence: expect.closeTo(0.9) });
    expect((detections[0]!.attributes?.corners as Array<unknown>)).toHaveLength(4);
    expect(detections[0]!.boundingBox.width).toBeGreaterThan(0);
  });

  it("runs the local two-class safety-helmet classifier on an upper-body crop", async () => {
    const run = vi.fn(async () => ({
      output: new Tensor("float32", new Float32Array([0.08, 0.92]), [1, 2]),
    }));
    const inference = new HelmetClassificationInference({ inputNames: ["input"], outputNames: ["output"], run } as never);
    const result = await inference.run({
      cameraId: "camera-helmet", tenantId: "tenant-1", timestamp: new Date(),
      imageData: Buffer.alloc(16 * 16 * 3, 127), width: 16, height: 16,
    }, { x: 0, y: 0, width: 1, height: 0.5 });

    const feed = run.mock.calls[0]![0] as Record<string, Tensor>;
    expect(feed.input?.dims).toEqual([1, 3, 224, 224]);
    expect(result).toMatchObject({ wearingHelmet: false, confidence: expect.closeTo(0.92) });
  });
});
