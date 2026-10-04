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
  // Highest person score from each supplied annotated incident snapshot.
  // Even an overconfident crop classifier must not promote these to alarms.
  it.each([
    ["hajipur-chair-1791040935773", 0.7764534364526412],
    ["peravurani-1791040925724", 0.6170429731131826],
    ["peravurani-1791040917135", 0.7407697167708704],
    ["peravurani-1791040909261", 0.6897230482999106],
    ["hajipur-bare-head-1791006290219", 0.8262904324814997],
  ] as const)("suppresses classifier-only evidence from %s", async (cameraId, confidence) => {
    const classifier = positiveClassifier();
    const detector = new HelmetDetector(null, 0.88, classifier);
    await detector.initialize();
    for (const seconds of [0, 2, 4]) {
      expect(await detector.detect({ ...frame(seconds, [person(confidence)]), cameraId })).toEqual([]);
    }
    expect(classifier.run).not.toHaveBeenCalled();
  });

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

  it("confirms a seated wearer when both compact head crops pass and torso crops fail", async () => {
    const classifier = { run: vi.fn(async (_frame, box) => {
      const positive = box.height <= personBox.height * 0.15;
      return { wearingHelmet: positive, confidence: 0.99,
        wearingHelmetConfidence: positive ? 0.99 : 0.01,
        unwearingHelmetConfidence: positive ? 0.01 : 0.99 };
    }) };
    const detector = new HelmetDetector(null, 0.88, classifier);
    await detector.initialize();
    expect(await detector.detect(frame(0, [person(0.95)]))).toEqual([]);
    expect(await detector.detect(frame(0, [person(0.95)]))).toEqual([]);
    const result = await detector.detect(frame(2, [person(0.95)]));
    expect(result).toHaveLength(1);
    expect(result[0]?.objects.find(o => o.label === "helmet")?.boundingBox.height).toBe(personBox.height * 0.15);
    expect(result[0]?.objects.find(o => o.label === "person")?.confidence).toBe(0.95);
  });

  it("rejects a compact crop positive when its wider head context disagrees", async () => {
    const classifier = { run: vi.fn(async (_frame, box) => {
      const positive = box.height <= personBox.height * 0.15 && box.width < personBox.width;
      return { wearingHelmet: positive, confidence: 0.99,
        wearingHelmetConfidence: positive ? 0.99 : 0.01,
        unwearingHelmetConfidence: positive ? 0.01 : 0.99 };
    }) };
    const detector = new HelmetDetector(null, 0.88, classifier);
    await detector.initialize();
    for (const seconds of [0, 2, 4]) expect(await detector.detect(frame(seconds, [person(0.95)]))).toEqual([]);
  });

  it.each([0.8988568926467266, 0.95])("rejects positive torso crops when compact head evidence disagrees, person %f", async (confidence) => {
    const classifier = { run: vi.fn(async (_frame, box) => {
      // Supplied CH2 bare-head snapshot: broad crops ~0.97, wider compact
      // head 0.234, centered compact head 0.938. A stronger person score
      // must not bypass the contradictory head evidence either.
      const p = box.height > personBox.height * 0.15 ? 0.9734
        : box.width < personBox.width ? 0.937654 : 0.233697;
      return { wearingHelmet: p >= 0.5, confidence: Math.max(p, 1-p),
        wearingHelmetConfidence: p, unwearingHelmetConfidence: 1-p };
    }) };
    const detector = new HelmetDetector(null, 0.88, classifier);
    await detector.initialize();
    for (const seconds of [0, 2, 4, 6]) expect(await detector.detect(frame(seconds, [person(confidence)]))).toEqual([]);
    expect(classifier.run).toHaveBeenCalled();
  });

  it("requires three distinct positive frames for a well-framed full person below 0.90", async () => {
    const detector = new HelmetDetector(null, 0.88, positiveClassifier());
    await detector.initialize();
    for (const seconds of [0, 0, 2]) expect(await detector.detect(frame(seconds, [person(0.86)]))).toEqual([]);
    expect(await detector.detect(frame(4, [person(0.86)]))).toHaveLength(1);
  });

  it("does not relax person evidence for partial bodies or scores below 0.85", async () => {
    const classifier = positiveClassifier();
    const detector = new HelmetDetector(null, 0.88, classifier);
    await detector.initialize();
    for (const seconds of [0, 2, 4, 6]) {
      expect(await detector.detect(frame(seconds, [person(0.84)]))).toEqual([]);
      expect(await detector.detect({...frame(seconds, [{...person(0.86), boundingBox:{...personBox,height:0.7}}]),cameraId:'partial'})).toEqual([]);
    }
    expect(classifier.run).not.toHaveBeenCalled();
  });
});
