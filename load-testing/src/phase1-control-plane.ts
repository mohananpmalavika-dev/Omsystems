#!/usr/bin/env node
/** Contract-accurate Phase 5 scale runner. Every SLO value comes from an observed request. */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export type ScaleStage = { branches: number; durationSeconds: number };
export type ScaleConfig = {
  baseUrl: string; userId: string; parentNodeId?: string; provision: boolean;
  stages: ScaleStage[]; targetCameras: number; dashboardUsers: number; maxConcurrency: number;
  outputDirectory: string; runLargeExport: boolean; analyticsEngineKey?: string;
};
type Target = { id: string; cameras: Array<{ id: string }>; edgeAgentId?: string };
type Observation = { name: string; status: number; durationMs: number; ok: boolean; observedAt: string };
export type ScaleEvidence = {
  startedAt: string; completedAt: string; target: { branches: number; cameras: number; dashboardUsers: number };
  inventory: { branches: number; cameras: number; edgeAgents: number };
  stages: Array<{ branches: number; requests: number; errors: number; p50Ms: number; p95Ms: number; p99Ms: number; passed: boolean }>;
  resilience: { offlineAcceptedPercent: number; replayAcceptedPercent: number };
  exportRun?: { id: string; status: string; durationMs: number };
  certification: { apiSloPassed: boolean; reconnectSloPassed: boolean; endurance24hExecuted: boolean; productionCertified: boolean };
};

export async function runProgressiveScale(config: ScaleConfig): Promise<ScaleEvidence> {
  const startedAt = new Date().toISOString();
  const client = new ContractClient(config.baseUrl, config.userId, config.maxConcurrency);
  let targets = await discover(client);
  const requiredBranches = Math.max(...config.stages.map((item) => item.branches));
  if (config.provision) targets = await provision(client, config, targets, requiredBranches);
  if (targets.length < requiredBranches) throw new Error(`scale_fixture_shortfall: required ${requiredBranches} branches, found ${targets.length}`);
  const cameraCount = targets.reduce((sum, item) => sum + item.cameras.length, 0);
  if (cameraCount < config.targetCameras) throw new Error(`scale_fixture_shortfall: required ${config.targetCameras} cameras, found ${cameraCount}`);

  const stages=[] as ScaleEvidence["stages"];
  for (const stage of config.stages) {
    client.reset();
    const selected=targets.slice(0,stage.branches);const deadline=Date.now()+stage.durationSeconds*1000;
    await Promise.all(Array.from({length:config.dashboardUsers},(_,worker)=>dashboardLoop(client,selected,deadline,worker)));
    stages.push(summarizeStage(stage.branches,client.observations));
  }
  const resilience=await exerciseReconnect(client,targets.slice(0,Math.min(100,targets.length)));
  const exportRun=config.runLargeExport?await exerciseExport(client):undefined;
  const evidence:ScaleEvidence={startedAt,completedAt:new Date().toISOString(),target:{branches:requiredBranches,cameras:config.targetCameras,dashboardUsers:config.dashboardUsers},inventory:{branches:targets.length,cameras:cameraCount,edgeAgents:targets.filter((item)=>item.edgeAgentId).length},stages,resilience,...(exportRun?{exportRun}:{}),certification:{apiSloPassed:stages.every((item)=>item.p95Ms<500&&item.p99Ms<1000&&item.errors===0),reconnectSloPassed:resilience.replayAcceptedPercent>=99,endurance24hExecuted:config.stages.some((item)=>item.durationSeconds>=86_400),productionCertified:false}};
  evidence.certification.productionCertified=evidence.certification.apiSloPassed&&evidence.certification.reconnectSloPassed&&evidence.certification.endurance24hExecuted&&requiredBranches>=400&&cameraCount>=5000&&config.dashboardUsers>=100;
  await mkdir(resolve(config.outputDirectory),{recursive:true});
  await writeFile(resolve(config.outputDirectory,`phase5-scale-${Date.now()}.json`),JSON.stringify(evidence,null,2),"utf8");
  return evidence;
}

class ContractClient {
  readonly observations:Observation[]=[];private active=0;private waiters:Array<()=>void>=[];
  constructor(private readonly baseUrl:string,private readonly userId:string,private readonly concurrency:number){}
  reset(){this.observations.length=0;}
  async request<T=any>(name:string,path:string,init:RequestInit={}):Promise<T>{await this.acquire();const started=performance.now();let recorded=false;try{const response=await fetch(new URL(path,this.baseUrl),{...init,headers:{"content-type":"application/json","x-user-id":this.userId,...init.headers}});const durationMs=performance.now()-started;this.observations.push({name,status:response.status,durationMs,ok:response.ok,observedAt:new Date().toISOString()});recorded=true;const body=await response.text();if(!response.ok)throw new Error(`${name}:${response.status}:${body.slice(0,300)}`);return (body?JSON.parse(body):undefined) as T;}catch(error){if(!recorded)this.observations.push({name,status:0,durationMs:performance.now()-started,ok:false,observedAt:new Date().toISOString()});throw error;}finally{this.release();}}
  private async acquire(){if(this.active<this.concurrency){this.active+=1;return;}await new Promise<void>((resolvePromise)=>this.waiters.push(resolvePromise));this.active+=1;}
  private release(){this.active-=1;this.waiters.shift()?.();}
}

async function discover(client:ContractClient):Promise<Target[]>{const response=await client.request<{data:Array<{id:string}>}>("branches","/v1/branches?action=live:view");const branches=response.data;return Promise.all(branches.map(async(branch)=>{const[cameras,agents]=await Promise.all([client.request<{data:Array<{id:string}>}>("branch-cameras",`/v1/branches/${branch.id}/cameras?action=live:view`),client.request<{data:Array<{id:string}>}>("edge-agents",`/v1/branches/${branch.id}/edge-agents`).catch(()=>({data:[]}))]);return{id:branch.id,cameras:cameras.data,edgeAgentId:agents.data[0]?.id};}));}

async function provision(client:ContractClient,config:ScaleConfig,current:Target[],requiredBranches:number){if(!config.parentNodeId&&current.length<requiredBranches)throw new Error("PHASE5_PARENT_NODE_ID is required to provision branches");for(let index=current.length;index<requiredBranches;index++){const branch=await client.request<{id:string}>("create-branch","/v1/branches",{method:"POST",body:JSON.stringify({parentNodeId:config.parentNodeId,name:`Scale Branch ${String(index+1).padStart(4,"0")}`})});const agent=await client.request<{id:string}>("register-edge",`/v1/branches/${branch.id}/edge-agents/register`,{method:"POST",body:JSON.stringify({name:`Scale Edge ${index+1}`,version:"phase5"})});current.push({id:branch.id,cameras:[],edgeAgentId:agent.id});}
  let missing=Math.max(0,config.targetCameras-current.reduce((sum,item)=>sum+item.cameras.length,0));let sequence=0;
  while(missing>0){const target=current[sequence%current.length]!;const camera=await client.request<{id:string}>("create-camera",`/v1/branches/${target.id}/cameras`,{method:"POST",body:JSON.stringify({name:`Scale Camera ${sequence+1}`,channel:target.cameras.length+1,protocol:"rtsp",connectionSecretRef:`vault://phase5/camera-${sequence+1}`})});target.cameras.push(camera);missing-=1;sequence+=1;}
  return current;
}

async function dashboardLoop(client:ContractClient,targets:Target[],deadline:number,worker:number){let cursor=worker;while(Date.now()<deadline){const target=targets[cursor%targets.length]!;const choice=cursor%4;if(choice===0)await client.request("health-summary","/v1/operations/health/summary").catch(()=>undefined);else if(choice===1)await client.request("branch-list",`/v1/operations/health/branches?limit=200&offset=${(cursor%2)*200}`).catch(()=>undefined);else if(choice===2)await client.request("branch-detail",`/v1/operations/health/branches/${target.id}`).catch(()=>undefined);else await client.request("camera-list",`/v1/cameras?limit=500&offset=${(cursor%10)*500}`).catch(()=>undefined);cursor+=1;}}

async function exerciseReconnect(client:ContractClient,targets:Target[]){const available=targets.filter((item)=>item.edgeAgentId);if(!available.length)return{offlineAcceptedPercent:0,replayAcceptedPercent:0};const offline=await Promise.all(available.map((item,index)=>telemetry(client,item,"offline",`outage-${index}-${Date.now()}`)));const replay=await Promise.all(available.map((item,index)=>telemetry(client,item,"online",`replay-${index}-${Date.now()}`)));return{offlineAcceptedPercent:percentAccepted(offline),replayAcceptedPercent:percentAccepted(replay)};}
async function telemetry(client:ContractClient,target:Target,status:"online"|"offline",key:string){return client.request("telemetry",`/v1/edge-agents/${target.edgeAgentId}/telemetry`,{method:"POST",body:JSON.stringify({branchId:target.id,edgeAgentId:target.edgeAgentId,deviceType:"network",deviceId:`network-${target.id}`,observedAt:new Date().toISOString(),source:"system",quality:"verified",idempotencyKey:key,metrics:{status,gatewayReachable:status==="online"},reasonCodes:status==="offline"?["WAN_UNREACHABLE"]:[]})}).then(()=>true).catch(()=>false);}
function percentAccepted(items:boolean[]){return items.length?Math.round(items.filter(Boolean).length/items.length*10_000)/100:0;}

async function exerciseExport(client:ContractClient){const started=performance.now();const run=await client.request<{id:string}>("report-export","/v1/reports/operational/runs",{method:"POST",body:JSON.stringify({formats:["csv"],filters:{}})});let status="queued";for(let attempts=0;attempts<120&&!['completed','dead'].includes(status);attempts++){await new Promise((resolvePromise)=>setTimeout(resolvePromise,1000));const detail=await client.request<{status:string}>("report-poll",`/v1/reports/operational/runs/${run.id}`);status=detail.status;}return{id:run.id,status,durationMs:Math.round(performance.now()-started)};}

function summarizeStage(branches:number,observations:Observation[]){const durations=observations.map((item)=>item.durationMs).sort((a,b)=>a-b);const errors=observations.filter((item)=>!item.ok).length;const p50=percentile(durations,.5),p95=percentile(durations,.95),p99=percentile(durations,.99);return{branches,requests:observations.length,errors,p50Ms:p50,p95Ms:p95,p99Ms:p99,passed:observations.length>0&&errors===0&&p95<500&&p99<1000};}
function percentile(values:number[],q:number){return values.length?Math.round(values[Math.min(values.length-1,Math.ceil(values.length*q)-1)]!*100)/100:0;}

export function configFromEnvironment(environment=process.env):ScaleConfig{return{baseUrl:environment.PHASE5_BASE_URL??"http://127.0.0.1:8080",userId:environment.PHASE5_USER_ID??"user-global-admin",parentNodeId:environment.PHASE5_PARENT_NODE_ID,provision:environment.PHASE5_PROVISION==="true",stages:(environment.PHASE5_STAGES??"10:120,50:300,100:600,400:3600").split(",").map((value)=>{const[branches,durationSeconds]=value.split(":").map(Number);if(!branches||!durationSeconds)throw new Error(`Invalid PHASE5_STAGES item: ${value}`);return{branches,durationSeconds};}),targetCameras:Number(environment.PHASE5_CAMERAS??5000),dashboardUsers:Number(environment.PHASE5_DASHBOARD_USERS??100),maxConcurrency:Number(environment.PHASE5_MAX_CONCURRENCY??200),outputDirectory:environment.PHASE5_OUTPUT_DIR??"./load-testing/reports",runLargeExport:environment.PHASE5_LARGE_EXPORT!=="false",analyticsEngineKey:environment.ANALYTICS_ENGINE_SHARED_KEY};}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){runProgressiveScale(configFromEnvironment()).then((evidence)=>{console.log(JSON.stringify(evidence,null,2));if(!evidence.certification.productionCertified)process.exitCode=2;}).catch((error)=>{console.error(error);process.exitCode=1;});}
