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
  it("accepts a walking person below 35% frame height with enough native head pixels", async () => {
    const distant = {x:.2,y:.2,width:.12,height:.25};
    const head = {x:.24,y:.2,width:.035,height:.06};
    const verifier = new LocalizedHelmetHeadVerifier(localizer("head",head),
      {run:vi.fn(async()=>score(.01))},null,null,{run:vi.fn(async()=>score(.95))});
    const detector = new HelmetDetector(null,.75,{run:vi.fn(async()=>score(.01))},true,verifier);
    await detector.initialize();
    const walking = {...frame(),width:1280,height:720,imageData:Buffer.alloc(1280*720*3),
      metadata:{inferenceMode:"local-onnx",detections:[{label:"person",confidence:.95,boundingBox:distant}]}};
    expect((await detector.detect(walking))[0]).toMatchObject({detectionType:"helmet-worn",requiresAlert:true});
    await detector.cleanup();
  });
  it("finds a distant head in a native-pixel region and maps it back to the full frame", async () => {
    const distant = {x:.2,y:.2,width:.12,height:.25};
    const objects = {run:vi.fn(async(f:DetectionFrame)=> f.width===1280 ? [] :
      [{label:"head",confidence:.8,boundingBox:{x:.3,y:.3,width:.25,height:.35}}])};
    const evidence={run:vi.fn(async()=>score(.96))};
    const verifier=new LocalizedHelmetHeadVerifier(objects,{run:vi.fn(async()=>score(.01))},null,null,evidence);
    const hd={...frame(),width:1280,height:720,imageData:Buffer.alloc(1280*720*3)};
    const result=await verifier.verify(hd,distant,.8);
    expect(result).toMatchObject({headEvidence:true});
    expect(result!.boundingBox.x).toBeCloseTo(.226,2);
    expect(result!.boundingBox.width*hd.width).toBeGreaterThan(20);
    expect(objects.run.mock.calls[1]![0].imageData.length).toBe(
      objects.run.mock.calls[1]![0].width*objects.run.mock.calls[1]![0].height*3);
    await verifier.verify(hd,distant,.8);
    expect(objects.run).toHaveBeenCalledTimes(2);
  });
  it("does not turn upscaled tiny source heads into usable evidence", async () => {
    const distant={x:.2,y:.2,width:.12,height:.25};
    const objects={run:vi.fn(async(f:DetectionFrame)=>f.width===640 ? [] :
      [{label:"head",confidence:.9,boundingBox:{x:.3,y:.3,width:.1,height:.1}}])};
    const evidence={run:vi.fn(async()=>score(.99))};
    expect(await new LocalizedHelmetHeadVerifier(objects,{run:vi.fn(async()=>score(.01))},null,null,evidence)
      .verify(frame(),distant,.8)).toBeNull();
    expect(evidence.run).not.toHaveBeenCalled();
  });
  it("does not retry contrary complete-head evidence in a distant region", async () => {
    const distant={x:.2,y:.2,width:.12,height:.25};
    const objects=localizer("head",{x:.23,y:.2,width:.05,height:.065});
    const evidence={run:vi.fn(async()=>score(.01))};
    expect(await new LocalizedHelmetHeadVerifier(objects,{run:vi.fn(async()=>score(.99))},null,null,evidence)
      .verify(frame(),distant,.8)).toBeNull();
    expect(objects.run).toHaveBeenCalledOnce();
  });
  it("applies wildcard head evidence to existing and newly added cameras", async () => {
    const evidence={run:vi.fn(async()=>score(.96))};
    const verifier=new LocalizedHelmetHeadVerifier(localizer("head"),{run:vi.fn(async()=>score(.01))},null,null,evidence,new Set(["*"]));
    for(const cameraId of ["bettaih","another-branch-camera","new-camera"]){
      expect(await verifier.verify({...frame(),cameraId},person,.8)).toMatchObject({headEvidence:true,classificationConfidence:.96});
    }
  });
  it("loads the evidence model for wildcard configuration and alerts outside Kollam", async () => {
    vi.stubEnv("HELMET_HEAD_EVIDENCE_CAMERAS","*");
    try {
      loaders.classifier.mockImplementation(async()=>({run:vi.fn(async()=>score(.95))}));
      loaders.objects.mockResolvedValue(localizer("head"));
      const detector=new HelmetDetector(null,.75,null,true);await detector.initialize();
      expect(loaders.classifier).toHaveBeenCalledWith("helmet-head-evidence");
      expect((await detector.detect({...frame(),cameraId:"new-camera"}))[0]).toMatchObject({requiresAlert:true,confidence:.95});
      await detector.cleanup();
    }finally{vi.unstubAllEnvs();}
  });
  it("uses full-head evidence on configured cameras even when a helmet is labelled head and the face is visible", async () => {
    const legacy={run:vi.fn(async()=>score(.999))};
    const evidence={run:vi.fn(async()=>score(.96))};
    const faceDetector={run:vi.fn(async()=>[{label:"face",confidence:.95,boundingBox:box}])};
    const verifier=new LocalizedHelmetHeadVerifier(localizer("head"),legacy,faceDetector,null,evidence,new Set(["bettaih"]));
    expect(await verifier.verify(frame(),person,.8)).toMatchObject({boundingBox:box,headEvidence:true,classificationConfidence:.96});
    expect(evidence.run).toHaveBeenCalledTimes(2);
    expect(legacy.run).not.toHaveBeenCalled();
    expect(await verifier.verify({...frame(),cameraId:"other"},person,.8)).toBeNull();
  });
  it("does not override contrary full-head evidence with legacy crown crops", async () => {
    const legacy={run:vi.fn(async()=>score(.999))};
    const evidence={run:vi.fn().mockResolvedValueOnce(score(.99)).mockResolvedValueOnce(score(.2))};
    expect(await new LocalizedHelmetHeadVerifier(localizer(),legacy,null,null,evidence).verify(frame(),person,.8)).toBeNull();
    expect(legacy.run).not.toHaveBeenCalled();
  });
  it("requires a real person and rejects clipped heads for adapted evidence", async () => {
    const evidence={run:vi.fn(async()=>score(.999))},legacy={run:vi.fn(async()=>score(.999))};
    const verifier=new LocalizedHelmetHeadVerifier(localizer("head",{...box,x:0}),legacy,null,null,evidence);
    expect(await verifier.verify(frame(),person,.8)).toBeNull();
    expect(await verifier.verifyDirect(frame(),.8)).toBeNull();
    expect(evidence.run).not.toHaveBeenCalled();
  });
  it("permits strong adapted evidence in fast mode without combining distant people", async () => {
    const verifier=new LocalizedHelmetHeadVerifier(localizer("head"),{run:vi.fn(async()=>score(.01))},null,null,{run:vi.fn(async()=>score(.95))});
    const detector=new HelmetDetector(null,.75,{run:vi.fn(async()=>score(.01))},true,verifier);await detector.initialize();
    expect((await detector.detect(frame()))[0]).toMatchObject({detectionType:"helmet-worn",requiresAlert:true,confidence:.95});
    const weak=frame();weak.metadata!.detections[0].confidence=.7;
    expect(await detector.detect(weak)).toEqual([]);
    await detector.cleanup();
  });
  it("still requires consecutive captures for weaker adapted head evidence", async () => {
    const verifier=new LocalizedHelmetHeadVerifier(localizer("head"),{run:vi.fn(async()=>score(.01))},null,null,{run:vi.fn(async()=>score(.85))});
    const detector=new HelmetDetector(null,.75,{run:vi.fn(async()=>score(.01))},true,verifier);await detector.initialize();
    expect(await detector.detect(frame())).toEqual([]);
    expect(await detector.detect(frame())).toEqual([]);
    expect((await detector.detect({...frame(),timestamp:new Date(2000)}))[0]).toMatchObject({requiresAlert:true});
    await detector.cleanup();
  });
  it("fails closed if an explicitly configured head evidence model is missing", async () => {
    vi.stubEnv("HELMET_HEAD_EVIDENCE_CAMERAS","bettaih");
    try {
      loaders.classifier.mockImplementation(async(id)=>{if(id==="helmet-head-evidence")throw new Error("Missing head evidence");return {run:vi.fn(async()=>score(.99))};});
      loaders.objects.mockResolvedValue({run:vi.fn(async()=>[])});
      const detector=new HelmetDetector(null,.75,null,true);await detector.initialize();
      expect(detector.getHealth().status).toBe("degraded");
      expect((await detector.detect(frame())).some(result=>result.requiresAlert)).toBe(false);
      await detector.cleanup();
    } finally {vi.unstubAllEnvs();}
  });
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
  it("rejects objects localized as 'head' rather than 'helmet'", async () => {
    const classifier={run:vi.fn(async()=>score(.99))};
    expect(await new LocalizedHelmetHeadVerifier(localizer("head"),classifier).verify(frame(),person,.9167)).toBeNull();
    expect(classifier.run).not.toHaveBeenCalled();
  });
  it("rejects Rajkot hair classified positive in tight helmet crops when wider context disagrees", async () => {
    const classifier={run:vi.fn().mockResolvedValueOnce(score(.99998))
      .mockResolvedValueOnce(score(.99999)).mockResolvedValueOnce(score(.1362))};
    expect(await new LocalizedHelmetHeadVerifier(localizer("helmet"),classifier).verify(frame(),person,.9167)).toBeNull();
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

  it.each([false, true])("confirms a walking wearer when consecutive person boxes overlap below 0.5 (fast=%s)", async fastAlert => {
    const verify = vi.fn(async (_frame, personBox) => ({
      boundingBox: {...box, x:personBox.x + .1}, classificationConfidence:.99, localizationConfidence:.8,
    }));
    const detector = new HelmetDetector(null,.88,{run:vi.fn(async()=>score(.01))},fastAlert,{verify});
    await detector.initialize();
    expect(await detector.detect(frame())).toEqual([]);
    const moved = {...frame(),timestamp:new Date(2000),metadata:{inferenceMode:"local-onnx",
      detections:[{label:"person",confidence:.95,boundingBox:{...person,x:.38}}]}};
    expect(await detector.detect(moved)).toHaveLength(1);
  });

  it("retains three distinct verifications for a moving person with a lower person score", async () => {
    const verify = vi.fn(async () => ({boundingBox:box,classificationConfidence:.99,localizationConfidence:.8}));
    const detector = new HelmetDetector(null,.88,{run:vi.fn(async()=>score(.01))},false,{verify});
    await detector.initialize();
    for (const [index,x] of [.2,.38,.56].entries()) {
      const sample = {...frame(),timestamp:new Date(index*2000),metadata:{inferenceMode:"local-onnx",
        detections:[{label:"person",confidence:.6,boundingBox:{...person,x}}]}};
      expect(await detector.detect(sample)).toHaveLength(index===2?1:0);
    }
  });

  it("does not count a moved person box at a duplicate capture timestamp", async () => {
    const verify = vi.fn(async () => ({boundingBox:box,classificationConfidence:.99,localizationConfidence:.8}));
    const detector = new HelmetDetector(null,.88,{run:vi.fn(async()=>score(.01))},false,{verify});
    await detector.initialize();
    for (const [index,x] of [.2,.38,.56].entries()) {
      const sample = {...frame(),timestamp:new Date(index===2?2000:0),metadata:{inferenceMode:"local-onnx",
        detections:[{label:"person",confidence:.95,boundingBox:{...person,x}}]}};
      expect(await detector.detect(sample)).toHaveLength(index===2?1:0);
    }
  });

  it("does not combine positives from nearby non-overlapping people", async () => {
    const verify = vi.fn(async () => ({boundingBox:box,classificationConfidence:.99,localizationConfidence:.8}));
    const detector = new HelmetDetector(null,.88,{run:vi.fn(async()=>score(.01))},false,{verify});
    await detector.initialize();
    for (const [index,x] of [.1,.35].entries()) {
      expect(await detector.detect({...frame(),timestamp:new Date(index*2000),metadata:{inferenceMode:"local-onnx",
        detections:[{label:"person",confidence:.95,boundingBox:{...person,x,width:.2}}]}})).toEqual([]);
    }
  });

  it("does not clear a wearer's confirmation when a nearby separate person has no verified helmet", async () => {
    const verify = vi.fn(async (_frame, personBox) => personBox.x===.1
      ? {boundingBox:box,classificationConfidence:.99,localizationConfidence:.8} : null);
    const detector = new HelmetDetector(null,.88,{run:vi.fn(async()=>score(.01))},false,{verify});
    await detector.initialize();
    const sample = (time:number): DetectionFrame => ({...frame(),timestamp:new Date(time),metadata:{inferenceMode:"local-onnx",
      detections:[.1,.35].map(x=>({label:"person",confidence:.95,boundingBox:{...person,x,width:.2}}))}});
    expect(await detector.detect(sample(0))).toEqual([]);
    expect(await detector.detect(sample(2000))).toHaveLength(1);
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

  it("verifyDirect rejects an empty office chair when no human pose is present", async () => {
    const classifier = { run: vi.fn(async () => score(0.99)) };
    const chairTop = { x: 0.4, y: 0.3, width: 0.15, height: 0.15 };
    const poseEstimator = { run: vi.fn(async () => []) }; // Empty chair: no human poses
    const verifier = new LocalizedHelmetHeadVerifier(localizer("helmet", chairTop), classifier, null, poseEstimator);
    const direct = await verifier.verifyDirect!(frame(), 0.9167);
    expect(direct).toBeNull();
    expect(classifier.run).not.toHaveBeenCalled();
  });

  it("verifyDirect rejects objects localized only as 'head' rather than 'helmet'", async () => {
    const classifier = { run: vi.fn(async () => score(0.99)) };
    const verifier = new LocalizedHelmetHeadVerifier(localizer("head", box), classifier);
    const direct = await verifier.verifyDirect!(frame(), 0.9167);
    expect(direct).toBeNull();
    expect(classifier.run).not.toHaveBeenCalled();
  });

  it("verifyDirect rejects empty chair when pose estimator detects no shoulders", async () => {
    const classifier = { run: vi.fn(async () => score(0.99)) };
    const chairTop = { x: 0.4, y: 0.3, width: 0.15, height: 0.15 };
    const keypoints = Array.from({ length: 17 }, () => ({ x: 0, y: 0, confidence: 0 }));
    // Random artifact keypoints with NO shoulders
    const poseEstimator = {
      run: vi.fn(async () => [{ boundingBox: chairTop, confidence: 0.5, keypoints }])
    };
    const verifier = new LocalizedHelmetHeadVerifier(localizer("helmet", chairTop), classifier, null, poseEstimator);
    const direct = await verifier.verifyDirect!(frame(), 0.9167);
    expect(direct).toBeNull();
  });

  it("verify rejects floating chair headrest when person is seen from behind with nose occluded", async () => {
    const classifier = { run: vi.fn(async () => score(0.99)) };
    const chairHeadrest = { x: 0.3, y: 0.05, width: 0.15, height: 0.08 };
    const keypoints = Array.from({ length: 17 }, () => ({ x: 0, y: 0, confidence: 0 }));
    // Nose occluded (facing computer screen from behind)
    keypoints[5] = { x: 0.25, y: 0.38, confidence: 0.9 }; // left_shoulder
    keypoints[6] = { x: 0.45, y: 0.38, confidence: 0.9 }; // right_shoulder
    const poseEstimator = {
      run: vi.fn(async () => [{ boundingBox: person, confidence: 0.9, keypoints }])
    };
    const verifier = new LocalizedHelmetHeadVerifier(localizer("head", chairHeadrest), classifier, null, poseEstimator);
    expect(await verifier.verify(frame(), person, 0.9167)).toBeNull();
  });
});

