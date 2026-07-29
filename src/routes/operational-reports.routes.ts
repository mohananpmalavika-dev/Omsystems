import { timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ControlPlaneStore } from "../control-plane-store.js";
import { signedReportDownloadPath, verifyReportDownloadToken } from "../reporting/download-token.js";
import { nextDailyRun, type OperationalReportWorker } from "../reporting/worker.js";

const formats=z.array(z.enum(["csv","xlsx","pdf"])).min(1).max(3).refine((items)=>new Set(items).size===items.length);
const template=z.enum(["comprehensive","branch_health_summary","camera_availability","alert_summary","recorder_status","hdd_health","retention_compliance"]);
const filters=z.object({region:z.string().trim().min(1).max(120).optional(),branchId:z.string().min(1).optional(),deviceStatus:z.enum(["healthy","warning","critical","unknown"]).optional(),alertType:z.string().trim().min(1).max(120).optional(),severity:z.enum(["P1","P2","P3","P4","P5"]).optional(),alertState:z.string().trim().min(1).max(50).optional(),from:z.string().datetime().optional(),to:z.string().datetime().optional()}).default({});
const scheduleBody=z.object({name:z.string().trim().min(2).max(160),timezone:z.string().trim().min(1).max(100).refine(validTimezone),dailyAt:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),template:template.default("comprehensive"),formats,recipients:z.array(z.string().email()).max(100).default([]),filters,enabled:z.boolean().default(true)});
const idParams=z.object({id:z.string().uuid()});

export async function registerOperationalReportRoutes(app:FastifyInstance,store:ControlPlaneStore,worker:OperationalReportWorker,options:{downloadSecret:string;exportRoot:string;workerKey?:string}){
  app.get("/v1/reports/operational/templates",async(request,reply)=>{if(!await canExport(store,request.currentUser))return reply.code(403).send({error:"forbidden"});return{data:[
    {id:"comprehensive",name:"Comprehensive daily surveillance"},{id:"branch_health_summary",name:"Daily branch health summary"},
    {id:"camera_availability",name:"Camera availability"},{id:"alert_summary",name:"Alert summary"},
    {id:"recorder_status",name:"DVR/NVR status"},{id:"hdd_health",name:"HDD health"},
    {id:"retention_compliance",name:"Retention compliance"},
  ]};});
  app.get("/v1/reports/operational/delivery-configuration",async(request,reply)=>{
    if(!await canExport(store,request.currentUser))return reply.code(403).send({error:"forbidden"});
    return { data: worker.deliveryConfiguration() };
  });
  app.get("/v1/reports/operational/schedules",async(request,reply)=>{if(!await canExport(store,request.currentUser))return reply.code(403).send({error:"forbidden"});return{data:await store.listOperationalReportSchedules(request.currentUser.tenantId)};});
  app.post("/v1/reports/operational/schedules",async(request,reply)=>{if(!await canExport(store,request.currentUser))return reply.code(403).send({error:"forbidden"});const body=scheduleBody.parse(request.body);if(!await validBranchFilter(store,request.currentUser,body.filters.branchId))return reply.code(403).send({error:"branch_forbidden"});const schedule=await store.createOperationalReportSchedule({tenantId:request.currentUser.tenantId,name:body.name,timezone:body.timezone,dailyAt:body.dailyAt,template:body.template,formats:body.formats,recipients:body.recipients,filters:body.filters,enabled:body.enabled,nextRunAt:nextDailyRun(body.dailyAt,body.timezone),createdBy:request.currentUser.id});await audit(store,request.currentUser,"report.schedule_created",schedule.id);return reply.code(201).send(schedule);});
  app.patch("/v1/reports/operational/schedules/:id",async(request,reply)=>{if(!await canExport(store,request.currentUser))return reply.code(403).send({error:"forbidden"});const{id}=idParams.parse(request.params);const body=scheduleBody.partial().parse(request.body);if(!await validBranchFilter(store,request.currentUser,body.filters?.branchId))return reply.code(403).send({error:"branch_forbidden"});const current=(await store.listOperationalReportSchedules(request.currentUser.tenantId)).find((item)=>item.id===id);if(!current)return reply.code(404).send({error:"report_schedule_not_found"});const dailyAt=body.dailyAt??current.dailyAt;const timezone=body.timezone??current.timezone;const updated=await store.updateOperationalReportSchedule(id,request.currentUser.tenantId,{...body,...(body.dailyAt||body.timezone?{nextRunAt:nextDailyRun(dailyAt,timezone)}:{})});return updated;});
  app.delete("/v1/reports/operational/schedules/:id",async(request,reply)=>{if(!await canExport(store,request.currentUser))return reply.code(403).send({error:"forbidden"});const{id}=idParams.parse(request.params);return store.deleteOperationalReportSchedule(id,request.currentUser.tenantId)?reply.code(204).send():reply.code(404).send({error:"report_schedule_not_found"});});
  app.post("/v1/reports/operational/runs",async(request,reply)=>{if(!await canExport(store,request.currentUser))return reply.code(403).send({error:"forbidden"});const body=z.object({template:template.default("comprehensive"),formats,filters,recipients:z.array(z.string().email()).max(100).default([])}).parse(request.body);if(!await validBranchFilter(store,request.currentUser,body.filters.branchId))return reply.code(403).send({error:"branch_forbidden"});const run=await store.createOperationalReportRun({tenantId:request.currentUser.tenantId,scheduleId:null,requestedBy:request.currentUser.id,template:body.template,formats:body.formats,filters:body.filters,recipients:body.recipients,maxAttempts:3});void worker.tick().catch((error)=>app.log.error({error},"Operational report worker failed"));await audit(store,request.currentUser,"report.run_requested",run.id);return reply.code(202).send(run);});
  app.get("/v1/reports/operational/runs",async(request,reply)=>{
    if(!await canExport(store,request.currentUser))return reply.code(403).send({error:"forbidden"});
    const query=z.object({limit:z.coerce.number().int().min(1).max(1000).default(50),template:template.optional(),
      status:z.enum(["queued","running","completed","failed","dead"]).optional(),from:z.string().datetime().optional(),to:z.string().datetime().optional()}).parse(request.query);
    const candidates=await store.listOperationalReportRuns(request.currentUser.tenantId,1000);
    const runs=candidates.filter((run)=>!query.template||run.template===query.template).filter((run)=>!query.status||run.status===query.status)
      .filter((run)=>!query.from||run.createdAt>=query.from).filter((run)=>!query.to||run.createdAt<=query.to).slice(0,query.limit);
    return{data:await Promise.all(runs.map(async(run)=>({
      ...run,
      artifacts:(await store.listOperationalReportArtifacts(request.currentUser.tenantId,run.id)).map((artifact)=>({...artifact,downloadUrl:signedReportDownloadPath(artifact,options.downloadSecret)})),
      deliveries:await store.listOperationalReportDeliveries(request.currentUser.tenantId,run.id),
    })))};
  });
  app.get("/v1/reports/operational/runs/:id",async(request,reply)=>{if(!await canExport(store,request.currentUser))return reply.code(403).send({error:"forbidden"});const{id}=idParams.parse(request.params);const run=await store.getOperationalReportRun(id,request.currentUser.tenantId);if(!run)return reply.code(404).send({error:"report_run_not_found"});return{...run,artifacts:(await store.listOperationalReportArtifacts(request.currentUser.tenantId,id)).map((artifact)=>({...artifact,downloadUrl:signedReportDownloadPath(artifact,options.downloadSecret)})),deliveries:await store.listOperationalReportDeliveries(request.currentUser.tenantId,id)};});
  app.get("/v1/reports/operational/artifacts/:id/download",async(request,reply)=>{const{id}=idParams.parse(request.params);const query=z.object({expires:z.coerce.number().int(),token:z.string().min(32)}).parse(request.query);const artifact=await store.getOperationalReportArtifact(id,request.currentUser.tenantId);if(!artifact)return reply.code(404).send({error:"report_artifact_not_found"});if(query.expires*1000<Date.now()||artifact.expiresAt<new Date().toISOString()||!verifyReportDownloadToken(artifact.id,artifact.tenantId,query.expires,query.token,options.downloadSecret))return reply.code(403).send({error:"report_download_expired_or_invalid"});const root=resolve(options.exportRoot);const path=resolve(artifact.storagePath);if(path!==root&&!path.startsWith(`${root}\\`)&&!path.startsWith(`${root}/`))return reply.code(403).send({error:"invalid_report_storage_path"});const data=await readFile(path);await audit(store,request.currentUser,"report.artifact_downloaded",artifact.id);return reply.header("content-type",artifact.contentType).header("content-disposition",`attachment; filename="${artifact.filename.replaceAll('"','')}"`).send(data);});
  app.post("/internal/reports/operational/drain",async(request,reply)=>{if(!options.workerKey||!secureEqual(request.headers["x-report-worker-key"],options.workerKey))return reply.code(401).send({error:"invalid_report_worker_identity"});return{processed:await worker.tick()};});
}

function secureEqual(value:string|string[]|undefined,expected:string){if(typeof value!=="string")return false;const left=Buffer.from(value);const right=Buffer.from(expected);return left.length===right.length&&timingSafeEqual(left,right);}
function validTimezone(value:string){try{new Intl.DateTimeFormat("en",{timeZone:value}).format();return true;}catch{return false;}}
async function canExport(store:ControlPlaneStore,user:any){return(await store.listAccessibleNodes(user,"analytics:export")).length>0;}
async function validBranchFilter(store:ControlPlaneStore,user:any,branchId?:string){if(!branchId)return true;const node=await store.getNode(branchId);if(!node||node.type!=="branch")return false;return Boolean((await store.checkAccess(user,"live:view",node.id))?.allowed);}
async function audit(store:ControlPlaneStore,user:any,action:string,id:string){await store.writeAudit({tenantId:user.tenantId,actorUserId:user.id,action,resourceNodeId:null,outcome:"success",details:{id}});}
