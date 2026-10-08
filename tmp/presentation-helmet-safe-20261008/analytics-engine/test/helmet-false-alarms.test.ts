import { describe, expect, it, vi } from "vitest";
import { HelmetDetector } from "../src/detectors/helmet-detector.js";
import type { DetectionFrame, InferenceObject } from "../src/detectors/base-detector.js";

const personBox = { x: 0.1, y: 0.1, width: 0.4, height: 0.8 };
const person = (confidence: number): InferenceObject => ({ label: "person", confidence, boundingBox: personBox });
const frame = (seconds: number, detections: InferenceObject[]): DetectionFrame => ({
  cameraId: "hajipur", tenantId: "test", timestamp: new Date(seconds * 1000),
  imageData: Buffer.alloc(400 * 400 * 3), width: 400, height: 400,
  metadata: { inferenceMode: "local-onnx", detections },
});
const positiveClassifier = () => ({ run: vi.fn(async () => ({
  wearingHelmet: true, confidence: 0.99999,
  wearingHelmetConfidence: 0.99999, unwearingHelmetConfidence: 0.00001,
})) });

describe("helmet false-alarm evidence", () => {
  it.each([false, true])("rejects the October 5 17:30 Bettaih chair/bare-head standard crops (fast=%s)", async fastAlert => {
    const boundingBox = { x:0.14346183202889223, y:0.15596347803342586, width:0.32425506419257233, height:0.7520191728435717 };
    let centeredScore = 0.6186870484580556;
    const classifier = { run:vi.fn(async (_frame, box) => {
      const score = box.width === boundingBox.width * 0.4 ? centeredScore : 0.9893;
      return { wearingHelmet:score > 0.5, confidence:Math.max(score,1-score), wearingHelmetConfidence:score, unwearingHelmetConfidence:1-score };
    }) };
    const detector = new HelmetDetector(null,0.88,classifier,fastAlert);
    await detector.initialize();
    const candidate = {label:"person",confidence:0.87,boundingBox};
    for(const seconds of [0,2,4]) expect(await detector.detect(frame(seconds,[candidate]))).toEqual([]);
    expect(classifier.run).toHaveBeenCalledTimes(9);
    centeredScore = 0.97;
    expect((await detector.detect(frame(6,[candidate]))).length).toBe(fastAlert ? 1 : 0);
    if (!fastAlert) {
      centeredScore = 0.6186870484580556;
      expect(await detector.detect(frame(8,[candidate]))).toEqual([]);
      centeredScore = 0.97;
      expect(await detector.detect(frame(10,[candidate]))).toEqual([]);
      expect(await detector.detect(frame(12,[candidate]))).toEqual([]);
      const results = await detector.detect(frame(14,[candidate]));
      expect(results).toHaveLength(1);
      expect(results[0]?.confidence).toBe(0.97);
    }
  });

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
      const positive = box.height <= personBox.height * 0.15 || box.y < personBox.y;
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

  it.each([false, true])("rejects Bettaih background positives when the anchored bare head disagrees (fast=%s)", async fastAlert => {
    const boundingBox = { x: 0.347241825, y: 0.1752373044, width: 0.2001030964, height: 0.7117586395 };
    let anchoredScore = 0.294035;
    const classifier = { run: vi.fn(async (_frame, box) => {
      const score = box.y < boundingBox.y ? 0.99741 : anchoredScore;
      return { wearingHelmet: score > 0.5, confidence: Math.max(score, 1 - score),
        wearingHelmetConfidence: score, unwearingHelmetConfidence: 1 - score };
    }) };
    const detector = new HelmetDetector(null, 0.88, classifier, fastAlert);
    await detector.initialize();
    const candidate = { label: "person", confidence: 0.89166227, boundingBox };
    for (const seconds of [0, 2, 4]) expect(await detector.detect(frame(seconds, [candidate]))).toEqual([]);
    anchoredScore = 0.99;
    expect((await detector.detect(frame(6, [candidate]))).length).toBe(fastAlert ? 1 : 0);
    if (!fastAlert) {
      anchoredScore = 0.294035;
      expect(await detector.detect(frame(8, [candidate]))).toEqual([]);
      anchoredScore = 0.99;
      expect(await detector.detect(frame(10, [candidate]))).toEqual([]);
      expect(await detector.detect(frame(12, [candidate]))).toEqual([]);
      const results = await detector.detect(frame(14, [candidate]));
      expect(results).toHaveLength(1);
      expect(results[0]?.confidence).toBe(0.99);
    }
  });

  it("retains the raised evidence floor in fast mode when the anchored head is only 0.9683", async () => {
    const classifier = { run: vi.fn(async (_frame, box) => {
      const score = box.y < personBox.y ? 0.99998 : 0.968346;
      return { wearingHelmet:true, confidence:score, wearingHelmetConfidence:score, unwearingHelmetConfidence:1-score };
    }) };
    const detector = new HelmetDetector(null, 0.88, classifier, true);
    await detector.initialize();
    for (const seconds of [0,2,4]) expect(await detector.detect(frame(seconds,[person(0.80925)]))).toEqual([]);
  });

  it.each(["crown", "centered context"])("rejects compact positives when the %s contradicts helmet evidence", async rejectedCrop => {
    const classifier = { run: vi.fn(async (_frame, box) => {
      const compact = box.height <= personBox.height * 0.15;
      const raised = box.y < personBox.y;
      const contradiction = rejectedCrop === "crown"
        ? raised && box.height === personBox.height * 0.15
        : raised && box.width === personBox.width * 0.6;
      const score = contradiction ? (rejectedCrop === "crown" ? 0.8558 : 0.6805) : compact || raised ? 0.9999 : 0.01;
      return { wearingHelmet:score > 0.5, confidence:Math.max(score,1-score), wearingHelmetConfidence:score, unwearingHelmetConfidence:1-score };
    }) };
    for (const fastAlert of [false,true]) {
      const detector = new HelmetDetector(null,0.88,classifier,fastAlert);
      await detector.initialize();
      for (const seconds of [0,2,4]) expect(await detector.detect(frame(seconds,[person(0.95)]))).toEqual([]);
    }
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

  it.each([
    [0.9034892092718678, { x: 0.3789148269597444, y: 0.09051363099414342, width: 0.1716856161669464, height: 0.27892995047613534 }],
    [0.9003163773819054, { x: 0.11666304935568958, y: 0.11102304201441744, width: 0.16910959374567322, height: 0.3479518909211893 }],
  ])("rejects undersized compact crops from the October 5 incidents (%f), including fast alerts", async (confidence, boundingBox) => {
    const classifier = { run: vi.fn(async (_frame, box) => {
      const positive = box.height <= boundingBox.height * 0.15 || box.height === boundingBox.height * 0.25;
      return { wearingHelmet: positive, confidence: 0.99999,
        wearingHelmetConfidence: positive ? 0.99999 : 0.00001,
        unwearingHelmetConfidence: positive ? 0.00001 : 0.99999 };
    }) };
    for (const fastAlert of [false, true]) {
      const detector = new HelmetDetector(null, 0.88, classifier, fastAlert);
      await detector.initialize();
      for (const seconds of [0, 2, 4]) expect(await detector.detect({
        ...frame(seconds, [{ label: "person", confidence, boundingBox }]),
        imageData: Buffer.alloc(640 * 360 * 3), width: 640, height: 360,
      })).toEqual([]);
    }
  });

  it("rejects compact head agreement when raised head context contradicts it, including fast alerts", async () => {
    const classifier = { run: vi.fn(async (_frame, box) => {
      const positive = box.height <= personBox.height * 0.15;
      return { wearingHelmet: positive, confidence: 0.99,
        wearingHelmetConfidence: positive ? 0.99 : 0.01,
        unwearingHelmetConfidence: positive ? 0.01 : 0.99 };
    }) };
    for (const fastAlert of [false, true]) {
      const detector = new HelmetDetector(null, 0.88, classifier, fastAlert);
      await detector.initialize();
      for (const seconds of [0, 2, 4]) expect(await detector.detect(frame(seconds, [person(0.95)]))).toEqual([]);
    }
  });
});
