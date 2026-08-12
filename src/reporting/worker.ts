import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import type { ControlPlaneStore } from "../control-plane-store.js";
import { defaultOperationalHealthPolicy } from "../operational-health/types.js";
import { projectBranchHealth, verifyContinuousRetention } from "../operational-health/service.js";
import { loadBatchedRetentionInputs } from "../operational-health/retention-batch.js";
import { signedReportDownloadPath } from "./download-token.js";
import type { EmailProvider } from "../alerts/email.js";
import type {
  DailyOperationalReport, OperationalReportArtifact, OperationalReportDelivery,
  OperationalReportFormat, OperationalReportRun, OperationalReportTemplate,
} from "./types.js";

export interface OperationalReportEmailSender {
  send(delivery: OperationalReportDelivery, run: OperationalReportRun, artifacts: OperationalReportArtifact[]): Promise<{ providerId: string }>;
  configuration?(): ReportDeliveryConfiguration;
}

export interface ReportDeliveryConfiguration {
  configured: boolean;
  provider: "smtp" | "sendgrid" | "ses" | "webhook" | "custom";
}

export class HttpOperationalReportEmailSender implements OperationalReportEmailSender {
  constructor(private readonly endpoint?: string, private readonly token?: string, private readonly publicBaseUrl = "", private readonly downloadSecret = "") {}
  async send(delivery: OperationalReportDelivery, run: OperationalReportRun, artifacts: OperationalReportArtifact[]) {
    if (!this.endpoint) throw new Error("report_email_provider_unconfigured");
    const downloads = artifacts.map((item) => ({ format: item.format, filename: item.filename, url: `${this.publicBaseUrl}${signedReportDownloadPath(item, this.downloadSecret)}`, expiresAt: item.expiresAt }));
    const response = await fetch(this.endpoint, { method:"POST", headers:{"content-type":"application/json",...(this.token?{authorization:`Bearer ${this.token}`}:{})}, body:JSON.stringify({ recipient:delivery.recipient, subject:`Daily ${humanize(run.template)} surveillance report`, template:run.template, reportRunId:run.id, downloads }), signal:AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`report_email_provider_http_${response.status}`);
    const body = await response.json().catch(()=>({})) as {id?:string;providerId?:string};
    return {providerId:body.providerId??body.id??`email:${response.status}`};
  }
  configuration(): ReportDeliveryConfiguration { return { configured: Boolean(this.endpoint && this.publicBaseUrl), provider: "webhook" }; }
}

/** Sends report download links with the same SMTP, SendGrid, or SES providers used for alerts. */
export class ProviderOperationalReportEmailSender implements OperationalReportEmailSender {
  constructor(
    private readonly provider: EmailProvider,
    private readonly publicBaseUrl: string,
    private readonly downloadSecret: string,
  ) {}

  async send(delivery: OperationalReportDelivery, run: OperationalReportRun, artifacts: OperationalReportArtifact[]) {
    if (!this.publicBaseUrl) throw new Error("report_public_base_url_unconfigured");
    const downloads = reportDownloads(artifacts, this.publicBaseUrl, this.downloadSecret);
    const text = [
      `Your ${humanize(run.template)} surveillance report is ready.`,
      "",
      ...downloads.map((item) => `${item.format.toUpperCase()} — ${item.url} (expires ${item.expiresAt})`),
    ].join("\n");
    const result = await this.provider.send({
      to: delivery.recipient,
      subject: `Daily ${humanize(run.template)} surveillance report`,
      text,
    });
    return { providerId: result.id };
  }

  configuration(): ReportDeliveryConfiguration {
    return { configured: Boolean(this.publicBaseUrl), provider: this.provider.name === "test" ? "custom" : this.provider.name };
  }
}

function reportDownloads(artifacts: OperationalReportArtifact[], publicBaseUrl: string, downloadSecret: string) {
  return artifacts.map((item) => ({
    format: item.format,
    filename: item.filename,
    url: `${publicBaseUrl}${signedReportDownloadPath(item, downloadSecret)}`,
    expiresAt: item.expiresAt,
  }));
}

export class OperationalReportWorker {
  private running=false;
  constructor(private readonly store:ControlPlaneStore,private readonly exportRoot:string,private readonly emailSender:OperationalReportEmailSender,private readonly archiveRetentionDays=365){}
  deliveryConfiguration(): ReportDeliveryConfiguration { return this.emailSender.configuration?.() ?? { configured: true, provider: "custom" }; }
  async tick(){if(this.running)return 0;this.running=true;let processed=0;try{processed+=await this.queueDueSchedules();for(const run of await this.store.claimOperationalReportRuns(new Date().toISOString(),2)){await this.execute(run);processed+=1;}for(const delivery of await this.store.claimOperationalReportDeliveries(new Date().toISOString(),20)){await this.deliver(delivery);processed+=1;}return processed;}finally{this.running=false;}}
  private async queueDueSchedules(){let count=0;for(const schedule of await this.store.claimDueOperationalReportSchedules(new Date().toISOString(),20)){await this.store.createOperationalReportRun({tenantId:schedule.tenantId,scheduleId:schedule.id,requestedBy:schedule.createdBy,template:schedule.template,formats:schedule.formats,filters:schedule.filters,recipients:schedule.recipients,maxAttempts:3});await this.store.updateOperationalReportSchedule(schedule.id,schedule.tenantId,{lastRunAt:new Date().toISOString(),nextRunAt:nextDailyRun(schedule.dailyAt,schedule.timezone)});count+=1;}return count;}
  private async execute(run:OperationalReportRun){try{await this.store.updateOperationalReportRun(run.id,{progress:10,error:null});const user=await this.store.getUser(run.requestedBy);if(!user||user.tenantId!==run.tenantId)throw new Error("report_requester_not_found");const report=await buildDailyOperationalReport(this.store,user,run.filters);await this.store.updateOperationalReportRun(run.id,{progress:55});const directory=join(this.exportRoot,run.tenantId,run.id);await mkdir(directory,{recursive:true});for(const format of run.formats){const buffer=await renderReport(report,format,run.template);const filename=`${run.template}-${report.period.to.slice(0,10)}.${format}`;const storagePath=join(directory,filename);await writeFile(storagePath,buffer);await this.store.createOperationalReportArtifact({tenantId:run.tenantId,runId:run.id,format,filename,storagePath,contentType:contentType(format),sizeBytes:buffer.length,checksumSha256:createHash("sha256").update(buffer).digest("hex"),expiresAt:new Date(Date.now()+this.archiveRetentionDays*86_400_000).toISOString()});}if(run.recipients.length)await this.store.enqueueOperationalReportDeliveries(run.recipients.map((recipient)=>({tenantId:run.tenantId,runId:run.id,recipient})));const sections=reportSections(report,run.template);await this.store.updateOperationalReportRun(run.id,{status:"completed",progress:100,rowCount:sections.reduce((total,section)=>total+section.rows.length,0),summary:{...report.summary,template:run.template},completedAt:new Date().toISOString(),error:null});}catch(error){const dead=run.attempts>=run.maxAttempts;await this.store.updateOperationalReportRun(run.id,{status:dead?"dead":"failed",progress:0,error:error instanceof Error?error.message:"report_generation_failed",...(!dead?{nextAttemptAt:new Date(Date.now()+Math.min(300,2**run.attempts*10)*1000).toISOString()}:{completedAt:new Date().toISOString()})});}}
  private async deliver(delivery:OperationalReportDelivery){const run=await this.store.getOperationalReportRun(delivery.runId,delivery.tenantId);const artifacts=await this.store.listOperationalReportArtifacts(delivery.tenantId,delivery.runId);if(!run){await this.store.completeOperationalReportDelivery(delivery.id,{status:"dead",error:"report_run_not_found"});return;}try{const result=await this.emailSender.send(delivery,run,artifacts);await this.store.completeOperationalReportDelivery(delivery.id,{status:"delivered",providerId:result.providerId});}catch(error){const dead=delivery.attempts>=5;await this.store.completeOperationalReportDelivery(delivery.id,{status:dead?"dead":"failed",error:error instanceof Error?error.message:"report_delivery_failed",...(!dead?{nextAttemptAt:new Date(Date.now()+Math.min(300,2**delivery.attempts*10)*1000).toISOString()}:{})});}}
}

export async function buildDailyOperationalReport(store:ControlPlaneStore,user:NonNullable<Awaited<ReturnType<ControlPlaneStore["getUser"]>>>,filters:OperationalReportRun["filters"]):Promise<DailyOperationalReport>{
  const to=filters.to??new Date().toISOString();const from=filters.from??new Date(Date.parse(to)-86_400_000).toISOString();let branches=await store.listAccessibleNodes(user,"live:view","branch");
  if(filters.branchId)branches=branches.filter((item)=>item.id===filters.branchId);
  
  // Batch fetch all nodes to avoid N+1 queries
  const allNodeIds = new Set<string>();
  for (const branch of branches) {
    for (const id of branch.path) {
      allNodeIds.add(id);
    }
  }
  const allNodes = await store.listNodesByIds([...allNodeIds]);
  const nodesById = new Map(allNodes.map((node) => [node.id, node]));
  
  const regionByBranch = new Map<string, string>();
  for (const branch of branches) {
    let region = "Unassigned";
    for (const id of [...branch.path].reverse()) {
      const node = nodesById.get(id);
      if (node?.type === "region") {
        region = node.name;
        break;
      }
    }
    regionByBranch.set(branch.id, region);
  }
  if(filters.region)branches=branches.filter((item)=>regionByBranch.get(item.id)===filters.region);
  const telemetry=await store.listLatestOperationalTelemetry(user.tenantId,branches.map((item)=>item.id));const projections=[];
  const branchInputs=await Promise.all(branches.map(async(branch)=>{const cameras=await store.listCamerasByBranch(user,branch.id,"live:view");const policy=await store.getOperationalHealthPolicy(user.tenantId,branch.id)??await store.getOperationalHealthPolicy(user.tenantId)??defaultOperationalHealthPolicy;return{branch,cameras,policy};}));
  const retentionInputs=await loadBatchedRetentionInputs(store,branchInputs.flatMap(({cameras,policy})=>cameras.map((camera)=>({cameraId:camera.id,policyRetentionDays:policy.retentionDays,maxRecordingGapSeconds:policy.maxRecordingGapSeconds}))),Date.parse(to));
  for(const {branch,cameras,policy} of branchInputs){const retentions=cameras.map((camera)=>{const input=retentionInputs.get(camera.id);return verifyContinuousRetention(camera.id,input?.segments??[],{...policy,retentionDays:input?.configuredDays??policy.retentionDays},Date.parse(to));});projections.push(projectBranchHealth({branch,cameras,telemetry:telemetry.filter((item)=>item.branchId===branch.id),retentions,policy,now:Date.parse(to),region:regionByBranch.get(branch.id)}));}
  const selected=filters.deviceStatus?projections.filter((item)=>item.healthStatus===filters.deviceStatus):projections;let alerts=await store.listAnalyticsAlerts(user.tenantId,{limit:10_000,from,to});const cameraBranch=new Map<string,string>();for(const branch of selected)for(const camera of branch.cameras)cameraBranch.set(String(camera.id),String(branch.id));alerts=alerts.filter((alert)=>cameraBranch.has(alert.cameraId)).filter((alert)=>!filters.severity||alert.severity===filters.severity).filter((alert)=>!filters.alertState||alert.status===filters.alertState);if(filters.alertType)alerts=alerts.filter((alert)=>alert.title.toLowerCase().includes(filters.alertType!.toLowerCase())||alert.objectClasses.some((item)=>item.toLowerCase().includes(filters.alertType!.toLowerCase())));
  const branchRows=selected.map((branch)=>({branchId:branch.id,branchName:branch.name,region:branch.region,status:branch.healthStatus,healthScore:branch.healthScore,totalCameras:branch.totalCameras,onlineCameras:branch.onlineCameras,recordingCameras:branch.recordingCameras,retentionBreaches:branch.retentionBreaches,recorderStatus:branch.components.recording?.status??"unknown",diskStatus:branch.components.storage?.status??"unknown",internetStatus:branch.components.network?.status??"unknown",lastSeen:branch.lastHealthCheck}));
  const cameraRows=selected.flatMap((branch)=>branch.cameras.map((camera)=>({branchId:branch.id,branchName:branch.name,region:branch.region,cameraId:camera.id,cameraName:camera.name,status:camera.onlineStatus,recordingStatus:camera.recordingStatus,retentionDays:camera.retention?.actualDays??null,requiredRetentionDays:camera.retention?.configuredDays??null,lastSeen:camera.lastHeartbeat,latencyMs:camera.latencyMs,packetLossPercent:camera.packetLoss,quality:camera.quality})));
  const alertRows=alerts.map((alert)=>({alertId:alert.id,branchId:cameraBranch.get(alert.cameraId)??null,cameraId:alert.cameraId,type:alert.title,severity:alert.severity,state:alert.status,detectedAt:alert.firstDetectedAt,acknowledgedAt:alert.acknowledgedAt??null,escalated:alert.status==="escalated"?"yes":"no",slaDueAt:alert.slaDueAt??null,slaBreached:alert.slaDueAt&&(!alert.acknowledgedAt||alert.acknowledgedAt>alert.slaDueAt)?"yes":"no"}));
  const exceptions=branchRows.flatMap((row)=>[{component:"recorder",status:row.recorderStatus},{component:"disk",status:row.diskStatus},{component:"internet",status:row.internetStatus}].filter((item)=>item.status!=="healthy").map((item)=>({branchId:row.branchId,branchName:row.branchName,region:row.region,component:item.component,status:item.status,detail:"Operational health exception"}))).concat(cameraRows.filter((row)=>row.recordingStatus==="breach").map((row)=>({branchId:row.branchId,branchName:row.branchName,region:row.region,component:"retention",status:"critical",detail:`${row.cameraName}: ${row.retentionDays??"unknown"}/${row.requiredRetentionDays??"unknown"} days`})));
  const summary={totalBranches:selected.length,healthyBranches:selected.filter((b)=>b.healthStatus==="healthy").length,warningBranches:selected.filter((b)=>b.healthStatus==="warning").length,criticalBranches:selected.filter((b)=>b.healthStatus==="critical").length,unknownBranches:selected.filter((b)=>b.healthStatus==="unknown").length,totalCameras:cameraRows.length,camerasOnline:cameraRows.filter((c)=>c.status==="online").length,camerasOffline:cameraRows.filter((c)=>c.status==="offline").length,camerasDegradedOrUnknown:cameraRows.filter((c)=>!["online","offline"].includes(String(c.status))).length,retentionBreaches:cameraRows.filter((c)=>c.recordingStatus==="breach").length,recorderExceptions:branchRows.filter((b)=>b.recorderStatus!=="healthy").length,diskExceptions:branchRows.filter((b)=>b.diskStatus!=="healthy").length,internetExceptions:branchRows.filter((b)=>b.internetStatus!=="healthy").length,alertCount:alertRows.length,unacknowledgedAlerts:alerts.filter((a)=>!a.acknowledgedAt).length,escalatedAlerts:alerts.filter((a)=>a.status==="escalated").length,slaBreaches:alertRows.filter((a)=>a.slaBreached==="yes").length};
  return{generatedAt:new Date().toISOString(),period:{from,to},filters,summary,branches:branchRows,cameras:cameraRows,alerts:alertRows,exceptions};
}

async function renderReport(report:DailyOperationalReport,format:OperationalReportFormat,template:OperationalReportTemplate){if(format==="csv")return Buffer.from(csv(report,template),"utf8");if(format==="xlsx")return xlsx(report,template);return pdf(report,template);}
function csv(report:DailyOperationalReport,template:OperationalReportTemplate){const rows=reportSections(report,template).flatMap((section)=>section.rows.map((row)=>({recordType:section.recordType,...row})));const headers=[...new Set(rows.flatMap((row)=>Object.keys(row)))];return [headers.join(","),...rows.map((row)=>headers.map((key)=>{const value = (row as Record<string, unknown>)[key]; return escapeCsv(value);}).join(","))].join("\r\n");}
function escapeCsv(value:unknown){const text=value==null?"":String(value);return /[",\r\n]/.test(text)?`"${text.replaceAll('"','""')}"`:text;}
async function xlsx(report:DailyOperationalReport,template:OperationalReportTemplate){const workbook=new ExcelJS.Workbook();workbook.creator="Sentinel Grid";const summary=workbook.addWorksheet("Summary");summary.addRow(["Template",humanize(template)]);summary.addRow(["Metric","Value"]);for(const [key,value] of Object.entries(report.summary))summary.addRow([key,value]);for(const {name,rows} of reportSections(report,template)){const sheet=workbook.addWorksheet(name);const headers=[...new Set(rows.flatMap((row)=>Object.keys(row)))];sheet.addRow(headers);for(const row of rows)sheet.addRow(headers.map((key)=>row[key]));sheet.views=[{state:"frozen",ySplit:1}];sheet.autoFilter=headers.length?{from:{row:1,column:1},to:{row:Math.max(1,rows.length+1),column:headers.length}}:undefined;sheet.getRow(1).font={bold:true,color:{argb:"FFFFFFFF"}};sheet.getRow(1).fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF1E3A8A"}};}return Buffer.from(await workbook.xlsx.writeBuffer());}
async function pdf(report:DailyOperationalReport,template:OperationalReportTemplate){return new Promise<Buffer>((resolve,reject)=>{const doc=new PDFDocument({size:"A4",margin:40});const chunks:Buffer[]=[];doc.on("data",(chunk:Buffer)=>chunks.push(chunk));doc.on("end",()=>resolve(Buffer.concat(chunks)));doc.on("error",reject);doc.fontSize(20).fillColor("#1e3a8a").text(`Daily ${humanize(template)} Report`);doc.fontSize(9).fillColor("#444").text(`${report.period.from} to ${report.period.to}`);doc.moveDown();for(const [key,value] of Object.entries(report.summary)){doc.fontSize(9).fillColor("#111").text(`${humanize(key)}: ${value}`);if(doc.y>740)doc.addPage();}for(const section of reportSections(report,template)){doc.addPage();doc.fontSize(16).fillColor("#1e3a8a").text(section.name);for(const row of section.rows.slice(0,1000)){doc.fontSize(7).fillColor("#222").text(Object.entries(row).map(([key,value])=>`${humanize(key)}: ${value??""}`).join(" | "));if(doc.y>760)doc.addPage();}}doc.end();});}

export function reportSections(report:DailyOperationalReport,template:OperationalReportTemplate){
  const all=[{name:"Branches",recordType:"branch",rows:report.branches},{name:"Cameras",recordType:"camera",rows:report.cameras},{name:"Alerts",recordType:"alert",rows:report.alerts},{name:"Exceptions",recordType:"exception",rows:report.exceptions}] as const;
  if(template==="comprehensive")return all;
  if(template==="branch_health_summary")return [all[0]];
  if(template==="camera_availability")return [all[1]];
  if(template==="alert_summary")return [all[2]];
  if(template==="recorder_status")return [{name:"DVR NVR Status",recordType:"recorder",rows:report.branches.map((row)=>({branchId:row.branchId,branchName:row.branchName,region:row.region,recorderStatus:row.recorderStatus,lastSeen:row.lastSeen}))}];
  if(template==="hdd_health")return [{name:"HDD Health",recordType:"hdd",rows:report.branches.map((row)=>({branchId:row.branchId,branchName:row.branchName,region:row.region,diskStatus:row.diskStatus,lastSeen:row.lastSeen}))}];
  return [{name:"Retention Compliance",recordType:"retention",rows:report.cameras.map((row)=>({branchId:row.branchId,branchName:row.branchName,cameraId:row.cameraId,cameraName:row.cameraName,recordingStatus:row.recordingStatus,retentionDays:row.retentionDays,requiredRetentionDays:row.requiredRetentionDays,compliant:row.recordingStatus==="breach"?"no":"yes"}))}];
}
function humanize(value:string){return value.replaceAll("_"," ").replace(/([A-Z])/g," $1").replace(/\b\w/g,(c)=>c.toUpperCase());}
function contentType(format:OperationalReportFormat){return format==="csv"?"text/csv; charset=utf-8":format==="xlsx"?"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":"application/pdf";}
export function nextDailyRun(dailyAt:string,timezone:string,from=new Date()){for(let minutes=1;minutes<=2_880;minutes++){const candidate=new Date(from.getTime()+minutes*60_000);const parts=new Intl.DateTimeFormat("en-GB",{timeZone:timezone,hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(candidate);const local=`${parts.find((p)=>p.type==="hour")?.value}:${parts.find((p)=>p.type==="minute")?.value}`;if(local===dailyAt)return candidate.toISOString();}throw new Error("daily_schedule_time_unresolvable");}
