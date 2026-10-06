import { beforeEach, describe, expect, it, vi } from "vitest";
import { LocalizedHelmetHeadVerifier } from "../src/inference/helmet-head-verification.js";
import { HelmetDetector } from "../src/detectors/helmet-detector.js";
import type { DetectionFrame } from "../src/detectors/base-detector.js";
const loaders = vi.hoisted(() => ({ classifier: vi.fn(), objects: vi.fn() }));
vi.mock("../src/inference/configured-model-inference.js", () => ({
  loadHelmetClassificationInference: loaders.classifier, loadObjectInference: loaders.objects,
  modelUnavailableReason: () => "Model unavailable",
}));
const person = { x:.2,y:.2,width:.4,height:.75 };
const box = { x:.3,y:.15,width:.15,height:.2 };
const frame = (): DetectionFrame => ({cameraId:"bettaih",tenantId:"test",timestamp:new Date(0),
  width:640,height:360,imageData:Buffer.alloc(640*360*3),
  metadata:{inferenceMode:"local-onnx",detections:[{label:"person",confidence:.95,boundingBox:person}]}});
const score = (value:number) => ({wearingHelmet:value>.5,confidence:Math.max(value,1-value),
  wearingHelmetConfidence:value,unwearingHelmetConfidence:1-value});
const localizer = (label="helmet", boundingBox=box) => ({run:vi.fn(async()=>[{label,confidence:.8,boundingBox}])});
beforeEach(() => vi.clearAllMocks());

describe("independent helmet head verification", () => {
  it("rejects crop-only evidence when the head detector finds nothing", async () => {
    const classifier={run:vi.fn(async()=>score(.999))};
    const verifier=new LocalizedHelmetHeadVerifier({run:vi.fn(async()=>[])},classifier);
    expect(await verifier.verify(frame(),person,.9167)).toBeNull();
    expect(classifier.run).not.toHaveBeenCalled();
  });
  it("rejects a bare head even when an isolated crown would classify as a helmet", async () => {
    const classifier={run:vi.fn(async(_frame,crop)=>score(crop.height<box.height?.99:.02))};
    expect(await new LocalizedHelmetHeadVerifier(localizer("head"),classifier).verify(frame(),person,.9167)).toBeNull();
  });
  it("requires whole-head and surrounding context agreement", async () => {
    const classifier={run:vi.fn().mockResolvedValueOnce(score(.999)).mockResolvedValueOnce(score(.2))};
    expect(await new LocalizedHelmetHeadVerifier(localizer(),classifier).verify(frame(),person,.9167)).toBeNull();
  });
  it("retains independent localization confidence and the actual head box", async () => {
    const classifier={run:vi.fn().mockResolvedValueOnce(score(.99)).mockResolvedValueOnce(score(.97)).mockResolvedValueOnce(score(.98))};
    expect(await new LocalizedHelmetHeadVerifier(localizer(),classifier).verify(frame(),person,.9167))
      .toEqual({boundingBox:box,classificationConfidence:.97,localizationConfidence:.8});
  });
  it("accepts a head-labelled helmet only when the full head and context both classify positive", async () => {
    const classifier={run:vi.fn(async()=>score(.99))};
    expect(await new LocalizedHelmetHeadVerifier(localizer("head"),classifier).verify(frame(),person,.9167))
      .toMatchObject({boundingBox:box,classificationConfidence:.99,localizationConfidence:.8});
  });
  it.each(["head", "helmet"])("rejects Rajkot hair classified positive in tight %s crops when wider context disagrees", async label => {
    const classifier={run:vi.fn().mockResolvedValueOnce(score(.99998))
      .mockResolvedValueOnce(score(.99999)).mockResolvedValueOnce(score(.1362))};
    expect(await new LocalizedHelmetHeadVerifier(localizer(label),classifier).verify(frame(),person,.9167)).toBeNull();
    // A contradictory surrounding crop must never fall back to the crown.
    expect(classifier.run).toHaveBeenCalledTimes(3);
  });
  it("rejects the Rajkot crown fallback when the shell boundary is bare hair", async () => {
    const classifier={run:vi.fn().mockResolvedValueOnce(score(.6418))
      .mockResolvedValueOnce(score(.5651)).mockResolvedValueOnce(score(.9978))
      .mockResolvedValueOnce(score(.6578))};
    expect(await new LocalizedHelmetHeadVerifier(localizer(),classifier).verify(frame(),person,.9167)).toBeNull();
  });
  it("reports the weakest supporting context score on a verified helmet", async () => {
    const classifier={run:vi.fn().mockResolvedValueOnce(score(.999))
      .mockResolvedValueOnce(score(.99)).mockResolvedValueOnce(score(.95))};
    expect(await new LocalizedHelmetHeadVerifier(localizer(),classifier).verify(frame(),person,.9167))
      .toMatchObject({classificationConfidence:.95});
  });
  it("keeps an independently corroborated helmet crown when the exposed face also has a head box", async () => {
    const objects={run:vi.fn(async()=>[
      {label:"head",confidence:.8,boundingBox:box},
      {label:"helmet",confidence:.4,boundingBox:box},
    ])};
    const classifier={run:vi.fn(async(_frame,crop)=>score(crop.height<box.height?.99:.02))};
    expect(await new LocalizedHelmetHeadVerifier(objects,classifier).verify(frame(),person,.9167))
      .toMatchObject({classificationConfidence:.99,localizationConfidence:.4,boundingBox:{height:box.height*.65}});
  });
  it("supports an exposed face only when a helmet-labelled box corroborates the crown", async () => {
    const classifier={run:vi.fn(async(_frame,crop)=>score(crop.height<box.height?.99:.02))};
    expect(await new LocalizedHelmetHeadVerifier(localizer("helmet"),classifier).verify(frame(),person,.9167))
      .toMatchObject({classificationConfidence:.99,boundingBox:{height:box.height*.65}});
  });
  it.each([
    {x:.75,y:.2,width:.15,height:.2}, // another person
    {x:.3,y:.75,width:.15,height:.2}, // lower body/background
    {x:.3,y:.15,width:.015,height:.02}, // unusable source pixels/timestamp strip
  ])("rejects an unrelated or unusable box %j", async candidate => {
    const classifier={run:vi.fn(async()=>score(.999))};
    expect(await new LocalizedHelmetHeadVerifier(localizer("head",candidate),classifier).verify(frame(),person,.9167)).toBeNull();
    expect(classifier.run).not.toHaveBeenCalled();
  });
  it("runs localization once per frame and does not reuse it for a different camera/frame", async () => {
    const detector=localizer(),classifier={run:vi.fn(async()=>score(.99))};
    const verifier=new LocalizedHelmetHeadVerifier(detector,classifier), first=frame();
    await verifier.verify(first,person,.9167);await verifier.verify(first,person,.9167);
    await verifier.verify({...frame(),cameraId:"cash"},person,.9167);
    expect(detector.run).toHaveBeenCalledTimes(2);
  });
  it("loads verification in the default production detector", async () => {
    loaders.classifier.mockResolvedValue({run:vi.fn(async()=>score(.999))});
    loaders.objects.mockResolvedValue({run:vi.fn(async()=>[])});
    const detector=new HelmetDetector(null,.88,null,true);await detector.initialize();
    expect(loaders.objects).toHaveBeenCalledWith("helmet-head-localizer",.25);
    expect(await detector.detect(frame())).toEqual([]);
  });
  it("fails closed when verification cannot load", async () => {
    loaders.classifier.mockResolvedValue({run:vi.fn(async()=>score(.999))});
    loaders.objects.mockRejectedValue(new Error("Missing verified head model"));
    const detector=new HelmetDetector(null,.88,null,true);await detector.initialize();
    expect(detector.getHealth().status).toBe("degraded");
    expect((await detector.detect(frame())).some(result=>result.requiresAlert)).toBe(false);
  });
  it("retries failed verification initialization instead of reporting healthy without it", async () => {
    loaders.classifier.mockResolvedValue({run:vi.fn(async()=>score(.999))});
    loaders.objects.mockRejectedValueOnce(new Error("Missing head model")).mockResolvedValueOnce({run:vi.fn(async()=>[])});
    const detector=new HelmetDetector(null,.88,null,true);
    await detector.initialize();expect(detector.getHealth().status).toBe("degraded");
    await detector.initialize();expect(detector.getHealth().status).toBe("healthy");
    expect(loaders.objects).toHaveBeenCalledTimes(2);
    expect(await detector.detect(frame())).toEqual([]);
  });
  it("rejects an undersized crown rather than enlarging a thin strip into helmet evidence", async () => {
    const small={...box,height:.06};
    const classifier={run:vi.fn(async(_frame,crop)=>score(crop.height<small.height?.999:.01))};
    expect(await new LocalizedHelmetHeadVerifier(localizer("helmet",small),classifier).verify(frame(),person,.9167)).toBeNull();
    expect(classifier.run).toHaveBeenCalledTimes(2);
  });
  it("does not count unverified frames toward consecutive confirmation", async () => {
    const verify=vi.fn().mockResolvedValueOnce(null).mockResolvedValue({boundingBox:box,
      classificationConfidence:.99,localizationConfidence:.8});
    const detector=new HelmetDetector(null,.88,{run:vi.fn(async()=>score(.999))},false,{verify});
    await detector.initialize();
    expect(await detector.detect(frame())).toEqual([]);
    expect(await detector.detect({...frame(),timestamp:new Date(2000)})).toEqual([]);
    const results=await detector.detect({...frame(),timestamp:new Date(4000)});
    expect(results).toHaveLength(1);
    expect(results[0]?.metadata.evidenceSource).toBe("localized-head-classification");
    expect(results[0]?.objects.find(object=>object.label==="helmet")?.boundingBox).toEqual(box);
  });
  it.each([false, true])("confirms a verified helmet across distinct frames when body crops are negative (fast=%s)", async fastAlert => {
    const classifier = {run:vi.fn(async()=>score(.01))};
    const verifier = new LocalizedHelmetHeadVerifier(localizer(), {
      run:vi.fn(async()=>score(.99)),
    });
    const detector = new HelmetDetector(null,.88,classifier,fastAlert,verifier);
    await detector.initialize();
    expect(await detector.detect(frame())).toEqual([]);
    expect(await detector.detect(frame())).toEqual([]);
    const results = await detector.detect({...frame(),timestamp:new Date(2000)});
    expect(results).toHaveLength(1);
    expect(results[0]?.metadata.evidenceSource).toBe("localized-head-classification");
    expect(results[0]?.objects.find(object=>object.label==="helmet")?.boundingBox).toEqual(box);
    expect(results[0]?.confidence).toBe(.99);
  });
  it("clears a pending localized helmet when the next head verification is negative", async () => {
    const verified = {boundingBox:box,classificationConfidence:.99,localizationConfidence:.8};
    const verify = vi.fn().mockResolvedValueOnce(verified).mockResolvedValueOnce(null).mockResolvedValue(verified);
    const detector = new HelmetDetector(null,.88,{run:vi.fn(async()=>score(.01))},false,{verify});
    await detector.initialize();
    for (const seconds of [0,2,4]) {
      expect(await detector.detect({...frame(),timestamp:new Date(seconds*1000)})).toEqual([]);
    }
    expect(await detector.detect({...frame(),timestamp:new Date(6000)})).toHaveLength(1);
  });

  it("rejects false alarms when face detector detects a clear bare face without helmet shell", async () => {
    const classifier = { run: vi.fn(async () => score(0.99)) };
    const faceBox = { x: 0.3, y: 0.22, width: 0.15, height: 0.15 };
    const faceDetector = { run: vi.fn(async () => [{ label: "face", confidence: 0.88, boundingBox: faceBox }]) };
    // Localizer only finds "head" (e.g. hair/head), NOT "helmet"
    const verifier = new LocalizedHelmetHeadVerifier(localizer("head"), classifier, faceDetector);
    expect(await verifier.verify(frame(), person, 0.9167)).toBeNull();
  });

  it("rejects false alarms when pose estimation detects exposed bare ears", async () => {
    const classifier = { run: vi.fn(async () => score(0.99)) };
    const keypoints = Array.from({ length: 17 }, () => ({ x: 0, y: 0, confidence: 0 }));
    keypoints[0] = { x: 0.35, y: 0.25, confidence: 0.8 }; // nose
    keypoints[3] = { x: 0.28, y: 0.24, confidence: 0.85 }; // left_ear
    keypoints[4] = { x: 0.42, y: 0.24, confidence: 0.82 }; // right_ear
    keypoints[5] = { x: 0.25, y: 0.38, confidence: 0.9 }; // left_shoulder
    keypoints[6] = { x: 0.45, y: 0.38, confidence: 0.9 }; // right_shoulder
    const poseEstimator = {
      run: vi.fn(async () => [{ boundingBox: person, confidence: 0.9, keypoints }])
    };
    // Head detected, but ears are clearly visible with high confidence -> not a motorcycle helmet!
    const verifier = new LocalizedHelmetHeadVerifier(localizer("head"), classifier, null, poseEstimator);
    expect(await verifier.verify(frame(), person, 0.9167)).toBeNull();
  });

  it("rejects chair backrest false alarms when candidate sits above anatomical head", async () => {
    const classifier = { run: vi.fn(async () => score(0.99)) };
    const chairTopBox = { x: 0.3, y: 0.05, width: 0.15, height: 0.08 }; // High chair headrest
    const keypoints = Array.from({ length: 17 }, () => ({ x: 0, y: 0, confidence: 0 }));
    keypoints[0] = { x: 0.35, y: 0.28, confidence: 0.8 }; // nose
    keypoints[5] = { x: 0.25, y: 0.40, confidence: 0.9 }; // left_shoulder
    keypoints[6] = { x: 0.45, y: 0.40, confidence: 0.9 }; // right_shoulder
    const poseEstimator = {
      run: vi.fn(async () => [{ boundingBox: person, confidence: 0.9, keypoints }])
    };
    // The candidate box is the chair top at y: 0.05, far above nose at y: 0.28
    const verifier = new LocalizedHelmetHeadVerifier(localizer("head", chairTopBox), classifier, null, poseEstimator);
    expect(await verifier.verify(frame(), person, 0.9167)).toBeNull();
  });

  it("confirms a helmet when pose is aligned and crown helmet is localized", async () => {
    const classifier = { run: vi.fn(async () => score(0.99)) };
    const faceDetector = { run: vi.fn(async () => []) }; // Face occluded by helmet
    const keypoints = Array.from({ length: 17 }, () => ({ x: 0, y: 0, confidence: 0 }));
    keypoints[0] = { x: 0.35, y: 0.25, confidence: 0.5 }; // nose
    keypoints[5] = { x: 0.25, y: 0.35, confidence: 0.9 }; // left_shoulder
    keypoints[6] = { x: 0.45, y: 0.35, confidence: 0.9 }; // right_shoulder
    const poseEstimator = {
      run: vi.fn(async () => [{ boundingBox: person, confidence: 0.9, keypoints }])
    };
    const verifier = new LocalizedHelmetHeadVerifier(localizer("helmet", box), classifier, faceDetector, poseEstimator);
    const result = await verifier.verify(frame(), person, 0.9167);
    expect(result).not.toBeNull();
    expect(result?.boundingBox).toEqual(box);
  });
});
