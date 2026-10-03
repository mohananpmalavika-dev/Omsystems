import { describe, expect, it, vi } from "vitest";
import { HelmetDetector } from "../src/detectors/helmet-detector.js";
import type { DetectionFrame, InferenceObject } from "../src/detectors/base-detector.js";

const personBox = { x: 0.1, y: 0.1, width: 0.4, height: 0.8 };
const person = (confidence: number): InferenceObject => ({ label: "person", confidence, boundingBox: personBox });
const frame = (seconds: number, detections: InferenceObject[]): DetectionFrame => ({
  cameraId: "hajipur", tenantId: "test", timestamp: new Date(seconds * 1000),
  imageData: Buffer.alloc(100 * 100 * 3), width: 100, height: 100,
  metadata: { inferenceMode: "local-onnx", detections },
});
const positiveClassifier = () => ({ run: vi.fn(async () => ({
  wearingHelmet: true, confidence: 0.99999,
  wearingHelmetConfidence: 0.99999, unwearingHelmetConfidence: 0.00001,
})) });

describe("helmet false-alarm evidence", () => {
  it.each([0.6717, 0.8304])("rejects classifier-only alarms with person confidence %f even at near-certain helmet confidence", async (confidence) => {
    const classifier = positiveClassifier();
    const detector = new HelmetDetector(null, 0.88, classifier);
    await detector.initialize();
    for (const seconds of [0, 2, 4]) {
      expect(await detector.detect(frame(seconds, [person(confidence)]))).toEqual([]);
    }
    expect(classifier.run).not.toHaveBeenCalled();
  });

  it("preserves the independent person score on confirmed helmet events", async () => {
    const detector = new HelmetDetector(null, 0.88, positiveClassifier());
    await detector.initialize();
    expect(await detector.detect(frame(0, [person(0.95)]))).toEqual([]);
    const results = await detector.detect(frame(2, [person(0.95)]));
    expect(results).toHaveLength(1);
    expect(results[0]?.objects.find(o => o.label === "person")?.confidence).toBe(0.95);
    expect(results[0]?.objects.find(o => o.label === "helmet")?.confidence).toBe(0.99999);
  });

  it.each([[], [person(0.83)]])("breaks confirmation when the person is absent or weak", async (intervening) => {
    const detector = new HelmetDetector(null, 0.88, positiveClassifier());
    await detector.initialize();
    expect(await detector.detect(frame(0, [person(0.95)]))).toEqual([]);
    expect(await detector.detect(frame(2, intervening))).toEqual([]);
    expect(await detector.detect(frame(4, [person(0.95)]))).toEqual([]);
    expect(await detector.detect(frame(6, [person(0.95)]))).toHaveLength(1);
  });

  it("continues accepting a localized helmet on a person below the classifier-only floor", async () => {
    const detector = new HelmetDetector(null, 0.88, positiveClassifier());
    await detector.initialize();
    expect(await detector.detect(frame(0, [person(0.83), {
      label: "helmet", confidence: 0.98,
      boundingBox: { x: 0.18, y: 0.11, width: 0.24, height: 0.12 },
    }]))).toHaveLength(1);
  });

  it("does not use duplicate timestamps as a second confirmation", async () => {
    const detector = new HelmetDetector(null, 0.88, positiveClassifier());
    await detector.initialize();
    expect(await detector.detect(frame(0, [person(0.95)]))).toEqual([]);
    expect(await detector.detect(frame(0, [person(0.95)]))).toEqual([]);
  });
});
