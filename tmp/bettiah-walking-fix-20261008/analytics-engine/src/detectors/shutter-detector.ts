import {BaseDetector,type DetectionFrame,type DetectionResult} from "./base-detector.js";
import {shutterConfigSchema,shutterSignature,referenceSimilarity,contrast,type ShutterConfig} from "../../../packages/contracts/src/shutter.js";

export interface ShutterRule {id:string;cameraId:string;enabled:boolean;detectionType:string;
  minConfidence:number;minDurationSeconds:number;shutterConfig?:ShutterConfig;}
type State = "open" | "closed";
interface Track {config:string;lastAt:number;baseline?:State;pending?:State;since:number;count:number;}

export class ShutterDetector extends BaseDetector {
  private tracks=new Map<string,Track>();
  constructor(){super("shutter-state","1.0.0");}
  async initialize(){}
  async cleanup(){this.tracks.clear();}
  getHealth(){return {status:"healthy" as const,details:"Requires camera-specific open/closed calibration; alerts only on confirmed transitions"};}
  async detect(frame:DetectionFrame):Promise<DetectionResult[]> {
    const rules=Array.isArray(frame.metadata?.shutterRules)?frame.metadata.shutterRules as ShutterRule[]:[];
    return this.detectRules(frame,rules);
  }
  async detectRules(frame:DetectionFrame,rules:readonly ShutterRule[]):Promise<DetectionResult[]> {
    const prefix=JSON.stringify([frame.tenantId,frame.cameraId]);
    const active=rules.filter(rule=>rule.enabled&&rule.cameraId===frame.cameraId&&["shutter-state","shutter-opened","shutter-closed"].includes(rule.detectionType));
    const activeKeys=new Set(active.map(rule=>prefix+rule.id));
    for(const [key,track] of this.tracks)if((key.startsWith(prefix)&&!activeKeys.has(key))||frame.timestamp.getTime()-track.lastAt>300_000)this.tracks.delete(key);
    const results:DetectionResult[]=[];
    for(const rule of active) {
      const parsed=shutterConfigSchema.safeParse(rule.shutterConfig);
      if(!parsed.success)continue;
      const config=parsed.data as ShutterConfig,now=frame.timestamp.getTime(),key=prefix+rule.id;
      if(!Number.isFinite(now))continue;
      const serialized=JSON.stringify(config);
      let track=this.tracks.get(key);
      if(track&&now<=track.lastAt)continue;
      if(!track||track.config!==serialized||now-track.lastAt>30_000) {
        track={config:serialized,lastAt:now-1,since:now,count:0};this.tracks.set(key,track);
      }
      track.lastAt=now;
      let signature:number[];
      try {
        if(config.region.width*frame.width<SHUTTER_MIN_PIXELS||config.region.height*frame.height<SHUTTER_MIN_PIXELS)throw new Error("Region too small");
        signature=shutterSignature(frame.imageData,frame.width,frame.height,config.region);
      }catch {track.pending=undefined;track.count=0;continue;}
      const open=referenceSimilarity(signature,config.openReference),closed=referenceSimilarity(signature,config.closedReference);
      const similarity=Math.max(open,closed);
      // Reject covered/blank frames, partial movements and ambiguous matches.
      if(contrast(signature)<6||similarity<Math.max(.9,rule.minConfidence)||Math.abs(open-closed)<.12) {
        track.pending=undefined;track.count=0;continue;
      }
      const state:State=open>closed?"open":"closed";
      if(state===track.baseline){track.pending=undefined;track.count=0;continue;}
      if(track.pending!==state){track.pending=state;track.since=now;track.count=1;}else track.count++;
      const duration=(now-track.since)/1000;
      if(track.count<3||duration<Math.max(2,rule.minDurationSeconds))continue;
      const previous=track.baseline;
      track.baseline=state;track.pending=undefined;track.count=0;
      if(!previous)continue; // Establish initial state without an opening/closing alarm.
      if(rule.detectionType==="shutter-opened"&&state!=="open" || rule.detectionType==="shutter-closed"&&state!=="closed")continue;
      results.push({detectionType:state==="open"?"shutter-opened":"shutter-closed",status:"SUCCESS",
        provenance:"HEURISTIC_RULE_ENGINE",confidence:similarity,durationSeconds:duration,requiresAlert:true,
        objects:[{label:"shutter",confidence:similarity,boundingBox:config.region}],
        metadata:{shutterRuleId:rule.id,shutterState:state,previousShutterState:previous,
          referenceSimilarity:similarity,transitionConfirmed:true},
        executionMetadata:{status:"SUCCESS",provenance:"HEURISTIC_RULE_ENGINE",modelId:"calibrated-shutter-region",
          modelVersion:this.modelVersion,heuristicScore:similarity,simulated:false,timestamp:frame.timestamp.toISOString()}});
    }
    if(this.tracks.size>2000)this.tracks.delete(this.tracks.keys().next().value!);
    return results;
  }
}
const SHUTTER_MIN_PIXELS=32;
