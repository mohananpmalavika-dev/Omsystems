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
    ["hajipur-chair-1791040935773", 0.7764534364526412, 0.30772437911211614],
    ["peravurani-1791040925724", 0.6170429731131826, 0.30929395129292747],
    ["peravurani-1791040917135", 0.7407697167708704, 0.5352477472874497],
    ["peravurani-1791040909261", 0.6897230482999106, 0.5502461755124228],
    ["hajipur-bare-head-1791006290219", 0.8262904324814997, 0.6392760098346844],
  ] as const)("suppresses classifier-only evidence from %s", async (cameraId, confidence, height) => {
    const classifier = positiveClassifier();
    const detector = new HelmetDetector(null, 0.88, classifier);
    await detector.initialize();
    for (const seconds of [0, 2, 4]) {
      expect(await detector.detect({ ...frame(seconds, [{...person(confidence),boundingBox:{...personBox,height}}]), cameraId })).toEqual([]);
    }
    expect(classifier.run).not.toHaveBeenCalled();
  });

  it.each([0.6717, 0.8304])("rejects small person boxes with confidence %f even at near-certain helmet confidence", async (confidence) => {
    const classifier = positiveClassifier();
    const detector = new HelmetDetector(null, 0.88, classifier);
    await detector.initialize();
    for (const seconds of [0, 2, 4]) {
      expect(await detector.detect(frame(seconds, [{...person(confidence),boundingBox:{...personBox,height:0.6}}]))).toEqual([]);
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

  it("requires three distinct positive frames for a well-framed full person below 0.90", async () => {
    const detector = new HelmetDetector(null, 0.88, positiveClassifier());
    await detector.initialize();
    for (const seconds of [0, 0, 2]) expect(await detector.detect(frame(seconds, [person(0.86)]))).toEqual([]);
    expect(await detector.detect(frame(4, [person(0.86)]))).toHaveLength(1);
  });

  it("does not use standard crop positives to relax evidence for partial bodies or lower scores", async () => {
    const classifier = {run:vi.fn(async (_frame, box) => {
      const positive=box.y >= personBox.y;
      return {wearingHelmet:positive,confidence:0.99999,wearingHelmetConfidence:positive?0.99999:0.00001,unwearingHelmetConfidence:positive?0.00001:0.99999};
    })};
    const detector = new HelmetDetector(null, 0.88, classifier);
    await detector.initialize();
    for (const seconds of [0, 2, 4, 6]) {
      expect(await detector.detect(frame(seconds, [person(0.84)]))).toEqual([]);
      expect(await detector.detect({...frame(seconds, [{...person(0.86), boundingBox:{...personBox,height:0.7}}]),cameraId:'partial'})).toEqual([]);
    }
    expect(classifier.run).toHaveBeenCalled();
  });

  it("confirms a large seated wearer from raised crops at three distinct timestamps", async () => {
    const detector=new HelmetDetector(null,0.88,positiveClassifier());await detector.initialize();
    const candidate={...person(0.83),boundingBox:{x:0.47,y:0.19,width:0.27,height:0.737}};
    for(const seconds of [0,0,2])expect(await detector.detect(frame(seconds,[candidate]))).toEqual([]);
    const results=await detector.detect(frame(4,[candidate]));expect(results).toHaveLength(1);
    expect(results[0]?.objects.find(o=>o.label==='person')?.confidence).toBe(0.83);
    expect(results[0]?.objects.find(o=>o.label==='helmet')?.boundingBox.y).toBeCloseTo(0.07945);
  });

  it.each([0.97,0.97999])("requires the stricter raised crop confidence on both crops (%f)",async score=>{
    const classifier={run:vi.fn(async (_frame,box)=>{const p=box.width===personBox.width?0.99999:score;return {wearingHelmet:true,confidence:p,wearingHelmetConfidence:p,unwearingHelmetConfidence:1-p};})};
    const detector=new HelmetDetector(null,0.88,classifier);await detector.initialize();
    for(const seconds of [0,2,4])expect(await detector.detect(frame(seconds,[person(0.83)]))).toEqual([]);
  });

  it("does not classify weak or small raised head candidates",async()=>{
    const classifier=positiveClassifier();const detector=new HelmetDetector(null,0.88,classifier);await detector.initialize();
    for(const seconds of [0,2,4]){
      expect(await detector.detect(frame(seconds,[person(0.79)]))).toEqual([]);
      expect(await detector.detect(frame(seconds,[{...person(0.83),boundingBox:{...personBox,height:0.69}}]))).toEqual([]);
    }expect(classifier.run).not.toHaveBeenCalled();
  });

  it("confirms a seated wearer immediately on the first frame when fastAlert is enabled", async () => {
    const detector = new HelmetDetector(null, 0.88, positiveClassifier(), true);
    await detector.initialize();
    const candidate = { ...person(0.83), boundingBox: { x: 0.47, y: 0.19, width: 0.27, height: 0.737 } };
    const results = await detector.detect(frame(0, [candidate]));
    expect(results).toHaveLength(1);
    expect(results[0]?.objects.find(o => o.label === "person")?.confidence).toBe(0.83);
    expect(results[0]?.objects.find(o => o.label === "helmet")?.confidence).toBeGreaterThanOrEqual(0.95);
  });
});
