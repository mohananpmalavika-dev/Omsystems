import {afterEach,describe,expect,it} from "vitest";
import {mkdtemp,writeFile,rm} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {spawnSync} from "node:child_process";
import sharp from "sharp";
import {loadRgbFrame,loadReplayCases,evaluateReplayCase,helmetReplayConfiguration} from "../scripts/helmet-replay.mjs";

const folders:string[]=[];
async function fixture(){
  const folder=await mkdtemp(path.join(os.tmpdir(),"helmet-replay-test-"));folders.push(folder);
  await writeFile(path.join(folder,"one.rgb"),Buffer.alloc(12));
  await writeFile(path.join(folder,"two.rgb"),Buffer.alloc(12,1));
  const manifest=path.join(folder,"cases.json");
  const cases=[{name:"helmet",expectedHelmetWearers:1,frames:[{file:"one.rgb",capturedAt:"2026-10-07T11:00:00Z",width:2,height:2}]},
    {name:"bare-head",expectedHelmetWearers:0,frames:[{file:"two.rgb",capturedAt:"2026-10-07T11:00:01Z",width:2,height:2}]}];
  return {folder,manifest,cases,save:()=>writeFile(manifest,JSON.stringify({cases}))};
}
afterEach(async()=>{
  for(const folder of folders.splice(0)){
    if(path.dirname(folder)!==path.resolve(os.tmpdir())||!path.basename(folder).startsWith("helmet-replay-test-"))
      throw new Error("Invalid test cleanup path");
    await rm(folder,{recursive:true,force:true});
  }
});

describe("offline helmet sequence validation",()=>{
  it("converts RGBA images into exact RGB24 without an extra canvas dependency",async()=>{
    const {folder}=await fixture();const file=path.join(folder,"alpha.png");
    await sharp(Buffer.from([20,40,60,255,80,100,120,255]),{raw:{width:2,height:1,channels:4}}).png().toFile(file);
    const result=await loadRgbFrame({file,capturedAt:"2026-10-07T11:00:00Z"},"camera");
    expect(result.imageData).toEqual(Buffer.from([20,40,60,80,100,120]));
    expect(result).toMatchObject({width:2,height:1,cameraId:"camera"});
  });
  it("rejects raw captures with wrong dimensions/byte count",async()=>{
    const {folder}=await fixture();
    await expect(loadRgbFrame({file:path.join(folder,"one.rgb"),width:3,height:2,
      capturedAt:"2026-10-07T11:00:00Z"},"camera")).rejects.toThrow("RGB24");
  });
  it("resolves frame paths relative to the manifest and preserves capture times",async()=>{
    const data=await fixture();await data.save();const cases=await loadReplayCases(data.manifest);
    expect(cases[0].frames[0].file).toBe(path.join(data.folder,"one.rgb"));
    expect(cases[0].frames[0].capturedAt).toBe("2026-10-07T11:00:00Z");
  });
  it("fails when an image is missing instead of reporting a skipped success",async()=>{
    const data=await fixture();data.cases[0]!.frames[0]!.file="missing.jpg";await data.save();
    await expect(loadReplayCases(data.manifest)).rejects.toThrow();
  });
  it("rejects a still image replayed under invented fresh timestamps",async()=>{
    const data=await fixture();data.cases[0]!.frames.push({...data.cases[0]!.frames[0]!,capturedAt:"2026-10-07T11:00:02Z"});
    await data.save();await expect(loadReplayCases(data.manifest)).rejects.toThrow("one file");
  });
  it("rejects identical or backwards capture timestamps",async()=>{
    const data=await fixture();data.cases[0]!.frames.push({...data.cases[0]!.frames[0]!,file:"two.rgb"});
    await data.save();await expect(loadReplayCases(data.manifest)).rejects.toThrow("strictly increasing");
  });
  it("requires labelled positives and negatives",async()=>{
    const data=await fixture();data.cases[0]!.expectedHelmetWearers=0;await data.save();
    await expect(loadReplayCases(data.manifest)).rejects.toThrow("positive and negative");
  });
  it("counts wearers in an aggregated result rather than counting result records",()=>{
    const results=[{detectionType:"helmet-worn",requiresAlert:true,confidence:.95,metadata:{compliantCount:2}}];
    expect(evaluateReplayCase({name:"two wearers",expectedHelmetWearers:2,minConfidence:.9},[{results}]))
      .toMatchObject({passed:true,maxHelmetWearers:2});
    expect(evaluateReplayCase({name:"mixed",expectedHelmetWearers:1},[{results}]).passed).toBe(false);
  });
  it("does not count bare-headed people as helmet-worn and fails any negative alert",()=>{
    const bare={name:"bare",expectedHelmetWearers:0};
    expect(evaluateReplayCase(bare,[{results:[{detectionType:"person",requiresAlert:true}]}]).passed).toBe(true);
    expect(evaluateReplayCase(bare,[{results:[{detectionType:"helmet-worn",requiresAlert:true,confidence:.99,
      metadata:{compliantCount:1}}]}]).passed).toBe(false);
    expect(evaluateReplayCase({name:"missed helmet",expectedHelmetWearers:1},[{results:[]}]).passed).toBe(false);
  });
  it("reports the same default configuration as the analytics pipeline",()=>{
    expect(helmetReplayConfiguration({})).toEqual({confidenceThreshold:.75,objectThreshold:.35,fastAlert:true,evidenceCameras:[]});
    expect(helmetReplayConfiguration({HELMET_CONFIDENCE_THRESHOLD:".88",HELMET_FAST_ALERT:"false",HELMET_HEAD_EVIDENCE_CAMERAS:" * "}))
      .toMatchObject({confidenceThreshold:.88,fastAlert:false,evidenceCameras:["*"]});
  });
  it("exits nonzero without a dataset instead of claiming success with no tests",()=>{
    const script=path.resolve("analytics-engine/test-helmet-walking.mjs");
    const result=spawnSync(process.execPath,[script],{encoding:"utf8",timeout:15_000});
    expect(result.status).toBe(1);expect(result.stderr).toContain("--manifest is required");
  });
});
