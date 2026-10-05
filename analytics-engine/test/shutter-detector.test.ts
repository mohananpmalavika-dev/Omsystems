import { describe, expect, it, vi } from "vitest";
import { ShutterDetector, type ShutterRule } from "../src/detectors/shutter-detector.js";
import { AnalyticsPipeline } from "../src/analytics-pipeline.js";
import { buildAnalyticsEngine } from "../src/app.js";
import { shutterConfigSchema, shutterSignature } from "../../packages/contracts/src/shutter.js";
import { shutterCalibration, shutterFrame, shutterRule } from "./shutter-fixtures.js";

async function confirm(detector: ShutterDetector, state: "open"|"closed"|"unknown", start: number, rules: ShutterRule[] = [shutterRule()]) {
  const results = [];
  for (let i=0;i<3;i++) results.push(...await detector.detectRules(shutterFrame(state,start+i),rules));
  return results;
}

describe("calibrated shutter transitions", () => {
  it.each(["open","closed"] as const)("establishes an initial %s state silently", async state => {
    const detector=new ShutterDetector();
    expect(await confirm(detector,state,0)).toEqual([]);
    expect(await confirm(detector,state,3)).toEqual([]);
  });
  it("emits every complete opening and closing once, with previous state and camera area", async () => {
    const detector=new ShutterDetector();
    await confirm(detector,"closed",0);
    const opened=await confirm(detector,"open",3);
    expect(opened).toHaveLength(1);
    expect(opened[0]).toMatchObject({detectionType:"shutter-opened",durationSeconds:2,requiresAlert:true,
      provenance:"HEURISTIC_RULE_ENGINE",metadata:{shutterRuleId:"rule-1",previousShutterState:"closed",shutterState:"open",transitionConfirmed:true},
      objects:[{label:"shutter",boundingBox:{x:0,y:0,width:1,height:1}}]});
    expect(await confirm(detector,"open",6)).toEqual([]);
    expect((await confirm(detector,"closed",9))[0]?.detectionType).toBe("shutter-closed");
    expect((await confirm(detector,"open",12))[0]?.detectionType).toBe("shutter-opened");
  });
  it("requires distinct frames and two seconds, rejecting duplicate/out-of-order observations", async () => {
    const detector=new ShutterDetector();await confirm(detector,"closed",0);
    for(const at of [3,3,3,2,3.1,3.2]) expect(await detector.detectRules(shutterFrame("open",at),[shutterRule()])).toEqual([]);
    expect(await detector.detectRules(shutterFrame("open",5),[shutterRule()])).toHaveLength(1);
  });
  it("resets pending confirmation after covered/ambiguous frames or a brief movement", async () => {
    const detector=new ShutterDetector();await confirm(detector,"closed",0);
    expect(await detector.detectRules(shutterFrame("open",3),[shutterRule()])).toEqual([]);
    await confirm(detector,"unknown",4);
    await confirm(detector,"closed",7);
    expect(await confirm(detector,"open",10)).toHaveLength(1);
  });
  it("does not combine confirmation across an occluded frame", async () => {
    const detector=new ShutterDetector();await confirm(detector,"closed",0);
    await detector.detectRules(shutterFrame("open",3),[shutterRule()]);
    await detector.detectRules(shutterFrame("open",4),[shutterRule()]);
    await detector.detectRules(shutterFrame("unknown",5),[shutterRule()]);
    expect(await detector.detectRules(shutterFrame("open",6),[shutterRule()])).toEqual([]);
    expect(await detector.detectRules(shutterFrame("open",7),[shutterRule()])).toEqual([]);
    expect(await detector.detectRules(shutterFrame("open",8),[shutterRule()])).toHaveLength(1);
  });
  it("honours a longer configured confirmation duration", async () => {
    const detector=new ShutterDetector(),rules=[shutterRule({minDurationSeconds:5})];
    for(let t=0;t<=5;t++)await detector.detectRules(shutterFrame("closed",t),rules);
    for(let t=6;t<11;t++)expect(await detector.detectRules(shutterFrame("open",t),rules)).toEqual([]);
    expect(await detector.detectRules(shutterFrame("open",11),rules)).toHaveLength(1);
  });
  it.each(["shutter-opened","shutter-closed"])("filters %s rules while maintaining both states", async detectionType => {
    const detector=new ShutterDetector(),rules=[shutterRule({detectionType})];
    await confirm(detector,"closed",0,rules);
    const results=[...await confirm(detector,"open",3,rules),...await confirm(detector,"closed",6,rules),...await confirm(detector,"open",9,rules)];
    expect(results.map(result=>result.detectionType)).toEqual(detectionType==="shutter-opened"?[detectionType,detectionType]:[detectionType]);
  });
  it("re-establishes state silently after a frame gap or detector restart", async () => {
    const detector=new ShutterDetector();await confirm(detector,"closed",0);
    expect(await confirm(detector,"open",40)).toEqual([]);
    await detector.cleanup();
    expect(await confirm(detector,"closed",43)).toEqual([]);
  });
  it("isolates tenant/camera/rule state and clears disabled rules", async () => {
    const detector=new ShutterDetector();await confirm(detector,"closed",0);
    for(let t=3;t<6;t++)expect(await detector.detectRules(shutterFrame("open",t,{tenantId:"other"}),[shutterRule()])).toEqual([]);
    expect(await confirm(detector,"open",6)).toHaveLength(1);
    expect(await confirm(detector,"closed",9,[shutterRule({cameraId:"wrong-camera"})])).toEqual([]);
    expect(await confirm(detector,"closed",12,[shutterRule({enabled:false})])).toEqual([]);
    expect(await confirm(detector,"closed",15)).toEqual([]);
  });
  it("re-establishes the baseline after calibration changes", async () => {
    const detector=new ShutterDetector();await confirm(detector,"closed",0);
    const config=shutterCalibration();config.closedReference=config.closedReference.map(value=>value+1);
    expect(await confirm(detector,"open",3,[shutterRule({shutterConfig:config})])).toEqual([]);
  });
  it("matches an unchanged view across uniform exposure changes", async () => {
    const detector=new ShutterDetector();await confirm(detector,"closed",0);
    const results=[];
    for(let t=3;t<6;t++) {
      const frame=shutterFrame("open",t);frame.imageData=Buffer.from(frame.imageData.map(value=>value+25));
      results.push(...await detector.detectRules(frame,[shutterRule()]));
    }
    expect(results).toHaveLength(1);
  });
  it("ignores missing/invalid calibration and malformed or undersized frames", async () => {
    const detector=new ShutterDetector();
    expect(await confirm(detector,"open",0,[shutterRule({shutterConfig:undefined})])).toEqual([]);
    const config=shutterCalibration();config.region.width=.2;
    expect(await confirm(detector,"open",3,[shutterRule({shutterConfig:config})])).toEqual([]);
    expect(await detector.detectRules(shutterFrame("open",6,{imageData:Buffer.alloc(10)}),[shutterRule()])).toEqual([]);
  });
  it("rejects calibration with identical, blank, incomplete or out-of-frame references", () => {
    const config=shutterCalibration();expect(shutterConfigSchema.safeParse(config).success).toBe(true);
    for(const invalid of [
      {...config,openReference:config.closedReference},
      {...config,openReference:config.closedReference.map((value,index)=>.6*value+.4*config.openReference[index]!)},
      {...config,openReference:Array(1024).fill(120)},
      {...config,openReference:config.openReference.slice(1)},
      {...config,region:{x:.8,y:0,width:.5,height:1}},
    ])expect(shutterConfigSchema.safeParse(invalid).success).toBe(false);
  });
  it("uses identical region sampling for browser RGBA and inference RGB pixels", () => {
    const frame=shutterFrame("closed",0),rgba=Buffer.alloc(64*64*4);
    for(let i=0;i<64*64;i++){frame.imageData.copy(rgba,i*4,i*3,i*3+3);rgba[i*4+3]=255;}
    const region={x:.25,y:.25,width:.5,height:.5};
    expect(shutterSignature(rgba,64,64,region,4)).toEqual(shutterSignature(frame.imageData,64,64,region));
  });
  it("accepts calibrated frame requests and creates shutter events before motion/GPU scheduling, including a snapshot", async () => {
    const pipeline=new AnalyticsPipeline();
    const internals=pipeline as unknown as {isInitialized:boolean;healthDetector:{detect:unknown};motionDetector:{detect:unknown};scheduler:{scheduleFrame:unknown}};
    internals.isInitialized=true;
    vi.spyOn(pipeline,"initialize").mockResolvedValue();
    vi.spyOn(pipeline,"cleanup").mockResolvedValue();
    vi.spyOn(internals.healthDetector,"detect" as never).mockResolvedValue([] as never);
    vi.spyOn(internals.motionDetector,"detect" as never).mockResolvedValue([] as never);
    vi.spyOn(internals.scheduler,"scheduleFrame" as never).mockReturnValue({shouldProcess:false,modelsToRun:[]} as never);
    const submit=vi.fn(async()=>({accepted:true}));
    const sourceKey="shutter-frame-source-key-for-tests";
    const app=buildAnalyticsEngine({pipeline,submit,sourceSharedKey:sourceKey,controlPlaneSharedKey:"shutter-control-plane-key-for-tests"});
    try {
      for(let t=0;t<9;t++) {
        const frame=shutterFrame(t<3||t>=6?"closed":"open",t);
        const response=await app.inject({method:"POST",url:"/internal/frames",headers:{"x-analytics-source-key":sourceKey},
          payload:{tenantId:frame.tenantId,cameraId:frame.cameraId,capturedAt:frame.timestamp.toISOString(),width:frame.width,height:frame.height,
            imageBase64:frame.imageData.toString("base64"),rules:[shutterRule()]}});
        expect(response.statusCode).toBe(202);
        expect(response.json().eventsGenerated).toBe(t===5||t===8?1:0);
      }
      const events=submit.mock.calls.map(call=>(call as unknown as [Record<string,unknown>])[0]);
      expect(events.map(event=>event.detectionType)).toEqual(["shutter-opened","shutter-closed"]);
      expect(events[0]?.metadata).toMatchObject({shutterRuleId:"rule-1",transitionConfirmed:true,snapshotBase64:expect.any(String)});
      expect(events[0]?.cameraId).toBe("camera-1");
    }finally{await app.close();}
  });
});
