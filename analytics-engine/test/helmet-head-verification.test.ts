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
const localizer = (label="head", boundingBox=box) => ({run:vi.fn(async()=>[{label,confidence:.8,boundingBox}])});
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
    expect(await new LocalizedHelmetHeadVerifier(localizer(),classifier).verify(frame(),person,.9167)).toBeNull();
    expect(classifier.run).toHaveBeenCalledTimes(2);
  });
  it("requires whole-head and surrounding context agreement", async () => {
    const classifier={run:vi.fn().mockResolvedValueOnce(score(.999)).mockResolvedValueOnce(score(.2))};
    expect(await new LocalizedHelmetHeadVerifier(localizer(),classifier).verify(frame(),person,.9167)).toBeNull();
  });
  it("retains independent localization confidence and the actual head box", async () => {
    const classifier={run:vi.fn().mockResolvedValueOnce(score(.99)).mockResolvedValueOnce(score(.97))};
    expect(await new LocalizedHelmetHeadVerifier(localizer(),classifier).verify(frame(),person,.9167))
      .toEqual({boundingBox:box,classificationConfidence:.97,localizationConfidence:.8});
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
});
