import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { MemoryStore } from "../src/store.js";
import { ProviderOperationalReportEmailSender, type OperationalReportEmailSender } from "../src/reporting/worker.js";
import type { EmailProvider } from "../src/alerts/email.js";
import type { Camera, ResourceNode } from "../src/domain/models.js";

const admin={"x-user-id":"user-global-admin"};
const workerKey="phase4-report-worker-key";

describe("Phase 4 persistent daily reports",()=>{
  let app:FastifyInstance;let store:MemoryStore;let root:string;const deliveries:string[]=[];
  beforeEach(async()=>{root=await mkdtemp(join(tmpdir(),"sentinel-report-test-"));store=new MemoryStore();deliveries.length=0;const sender:OperationalReportEmailSender={async send(delivery){deliveries.push(delivery.recipient);return{providerId:`mail-${delivery.id}`};}};app=await buildApp({store,reportExportRoot:root,reportDownloadSecret:"phase4-download-secret",reportWorkerKey:workerKey,reportEmailSender:sender});});
  afterEach(async()=>{await app.close();await rm(root,{recursive:true,force:true});});

  it("persists schedules with timezone, recipients, filters and next-run state",async()=>{
    const created=await app.inject({method:"POST",url:"/v1/reports/operational/schedules",headers:admin,payload:{name:"Daily South operations",timezone:"Asia/Kolkata",dailyAt:"06:30",template:"branch_health_summary",formats:["pdf","xlsx","csv"],recipients:["soc@example.com"],filters:{region:"South Region",severity:"P1"},enabled:true}});
    expect(created.statusCode).toBe(201);expect(created.json()).toMatchObject({name:"Daily South operations",timezone:"Asia/Kolkata",dailyAt:"06:30",template:"branch_health_summary",lastRunAt:null});expect(Date.parse(created.json().nextRunAt)).toBeGreaterThan(Date.now());
    const listed=await app.inject({method:"GET",url:"/v1/reports/operational/schedules",headers:admin});expect(listed.json().data).toHaveLength(1);expect(listed.json().data[0].recipients).toEqual(["soc@example.com"]);
    const delivery=await app.inject({method:"GET",url:"/v1/reports/operational/delivery-configuration",headers:admin});
    expect(delivery.json().data).toEqual({configured:true,provider:"custom"});
  });

  it("delivers signed report links through a direct SMTP, SendGrid, or SES-style provider",async()=>{
    const messages:Array<{to:string;subject:string;text?:string}>=[];
    const provider:EmailProvider={name:"smtp",async send(message){messages.push(message);return{id:"smtp-message-1"};}};
    const sender=new ProviderOperationalReportEmailSender(provider,"https://reports.example.test","phase4-download-secret");
    const result=await sender.send(
      {id:"delivery-1",tenantId:"omsystems",runId:"run-1",recipient:"soc@example.com"} as any,
      {id:"run-1",template:"hdd_health"} as any,
      [{id:"artifact-1",tenantId:"omsystems",format:"pdf",filename:"hdd.pdf",expiresAt:"2030-01-01T00:00:00.000Z"}] as any,
    );
    expect(result.providerId).toBe("smtp-message-1");
    expect(messages[0]).toMatchObject({to:"soc@example.com",subject:"Daily Hdd Health surveillance report"});
    expect(messages[0]?.text).toContain("https://reports.example.test/api/control/v1/reports/operational/artifacts/artifact-1/download?");
    expect(sender.configuration()).toEqual({configured:true,provider:"smtp"});
  });

  it("publishes and generates every requested operational report template",async()=>{
    const catalog=await app.inject({method:"GET",url:"/v1/reports/operational/templates",headers:admin});
    expect(catalog.statusCode).toBe(200);expect(catalog.json().data).toHaveLength(7);
    const templates=["branch_health_summary","camera_availability","alert_summary","recorder_status","hdd_health","retention_compliance"];
    for(const template of templates){
      const response=await app.inject({method:"POST",url:"/v1/reports/operational/runs",headers:admin,payload:{template,formats:["csv"],filters:{branchId:"branch-blr-001"}}});
      expect(response.statusCode).toBe(202);const id=response.json().id;
      await waitFor(async()=> (await store.getOperationalReportRun(id,"omsystems"))?.status==="completed",10_000);
      const run=await store.getOperationalReportRun(id,"omsystems");const artifacts=await store.listOperationalReportArtifacts("omsystems",id);
      expect(run).toMatchObject({template,status:"completed",summary:{template}});
      expect(artifacts[0]?.filename).toMatch(new RegExp(`^${template}-\\d{4}-\\d{2}-\\d{2}\\.csv$`));
      expect(Date.parse(artifacts[0]!.expiresAt)).toBeGreaterThan(Date.now()+300*86_400_000);
    }
  },30_000);

  it("claims a due daily schedule, archives the report and emails configured recipients",async()=>{
    const created=await app.inject({method:"POST",url:"/v1/reports/operational/schedules",headers:admin,payload:{
      name:"Daily HDD operations",timezone:"Asia/Kolkata",dailyAt:"06:30",template:"hdd_health",
      formats:["pdf"],recipients:["storage@example.com"],filters:{branchId:"branch-blr-001"},enabled:true}});
    const schedule=created.json();
    await store.updateOperationalReportSchedule(schedule.id,"omsystems",{nextRunAt:new Date(Date.now()-1_000).toISOString()});
    const drained=await app.inject({method:"POST",url:"/internal/reports/operational/drain",headers:{"x-report-worker-key":workerKey}});
    expect(drained.statusCode).toBe(200);
    await waitFor(async()=>store.operationalReportRuns.some((run)=>run.scheduleId===schedule.id&&run.status==="completed"),5_000);
    const run=store.operationalReportRuns.find((item)=>item.scheduleId===schedule.id)!;
    const updated=(await store.listOperationalReportSchedules("omsystems")).find((item)=>item.id===schedule.id)!;
    expect(run.template).toBe("hdd_health");expect(updated.lastRunAt).toBeTruthy();expect(Date.parse(updated.nextRunAt)).toBeGreaterThan(Date.now());
    expect(store.operationalReportDeliveries.find((item)=>item.runId===run.id)).toMatchObject({recipient:"storage@example.com",status:"delivered"});
    expect(deliveries).toContain("storage@example.com");
  });

  it("generates reconciled CSV, XLSX and PDF artifacts with signed downloads and delivery history",async()=>{
    const health=await app.inject({method:"GET",url:"/v1/operations/health/summary",headers:admin});
    const requested=await app.inject({method:"POST",url:"/v1/reports/operational/runs",headers:admin,payload:{formats:["csv","xlsx","pdf"],filters:{branchId:"branch-blr-001"},recipients:["manager@example.com"]}});expect(requested.statusCode).toBe(202);const runId=requested.json().id;
    await waitFor(async()=> (await store.getOperationalReportRun(runId,"omsystems"))?.status==="completed",10_000);
    await app.inject({method:"POST",url:"/internal/reports/operational/drain",headers:{"x-report-worker-key":workerKey}});
    await waitFor(async()=>store.operationalReportDeliveries[0]?.status==="delivered",2_000);
    const detail=await app.inject({method:"GET",url:`/v1/reports/operational/runs/${runId}`,headers:admin});expect(detail.statusCode).toBe(200);expect(detail.json().summary.totalBranches).toBe(health.json().data.totalBranches);expect(detail.json().summary.totalCameras).toBe(health.json().data.totalCameras);expect(detail.json().artifacts).toHaveLength(3);expect(detail.json().deliveries[0]).toMatchObject({recipient:"manager@example.com",status:"delivered",attempts:1});expect(deliveries).toEqual(["manager@example.com"]);
    for(const artifact of detail.json().artifacts){const url=artifact.downloadUrl.replace("/api/control","");const download=await app.inject({method:"GET",url,headers:admin});expect(download.statusCode).toBe(200);if(artifact.format==="pdf")expect(download.rawPayload.subarray(0,4).toString()).toBe("%PDF");if(artifact.format==="xlsx")expect(download.rawPayload.subarray(0,2).toString()).toBe("PK");if(artifact.format==="csv")expect(download.body).toContain("recordType");expect((await readFile(artifact.storagePath)).length).toBe(artifact.sizeBytes);}
  });

  it("handles a 5,000-camera CSV run asynchronously without a fixed application limit",async()=>{
    const template=store.cameras.get("cam-001")!;for(let index=3;index<=5000;index++){const id=`scale-camera-${index}`;const nodeId=`scale-node-${index}`;const node:ResourceNode={id:nodeId,parentId:"group-public-blr-001",tenantId:"omsystems",type:"camera",name:`Scale Camera ${index}`,path:["company-1","division-retail","region-south","branch-blr-001","group-public-blr-001",nodeId]};const camera:Camera={...structuredClone(template),id,nodeId,name:`Scale Camera ${index}`,channel:index,status:index%10===0?"offline":"online"};store.nodes.set(nodeId,node);store.cameras.set(id,camera);}
    const response=await app.inject({method:"POST",url:"/v1/reports/operational/runs",headers:admin,payload:{formats:["csv"],filters:{branchId:"branch-blr-001"}}});const id=response.json().id;await waitFor(async()=> (await store.getOperationalReportRun(id,"omsystems"))?.status==="completed",20_000);const run=await store.getOperationalReportRun(id,"omsystems");expect(run?.summary?.totalCameras).toBe(5000);expect(run?.rowCount).toBeGreaterThanOrEqual(5001);expect((await store.listOperationalReportArtifacts("omsystems",id))[0]?.sizeBytes).toBeGreaterThan(100_000);
  },30_000);
});

async function waitFor(predicate:()=>boolean|Promise<boolean>,timeout:number){const deadline=Date.now()+timeout;while(!await predicate()&&Date.now()<deadline)await new Promise((resolve)=>setTimeout(resolve,10));expect(await predicate()).toBe(true);}
