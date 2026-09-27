"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CalendarClock, CheckCircle2, Download, LoaderCircle, Play, RefreshCw, Trash2, FileText, BarChart3, ArrowRight } from "lucide-react";
import { AppLayout } from "@/components/app-layout";
import { WorkflowNav } from "@/components/workflow-nav";

type Format="csv"|"xlsx"|"pdf";
type Template="daily_surveillance_health"|"comprehensive"|"branch_health_summary"|"camera_availability"|"alert_summary"|"recorder_status"|"hdd_health"|"retention_compliance";
type Filters={region?:string;branchId?:string;deviceStatus?:string;alertType?:string;severity?:string;alertState?:string;from?:string;to?:string};
type Schedule={id:string;name:string;timezone:string;dailyAt:string;template:Template;formats:Format[];recipients:string[];filters:Filters;enabled:boolean;lastRunAt:string|null;nextRunAt:string};
type Artifact={id:string;format:Format;filename:string;sizeBytes:number;expiresAt:string;downloadUrl:string};
type Delivery={id:string;recipient:string;status:string;attempts:number;error?:string};
type Run={id:string;status:string;template:Template;formats:Format[];filters:Filters;progress:number;attempts:number;rowCount:number|null;summary?:Record<string,number>;error?:string;createdAt:string;artifacts:Artifact[];deliveries:Delivery[]};
type DeliveryConfiguration={configured:boolean;provider:"smtp"|"sendgrid"|"ses"|"webhook"|"custom"};

const REPORT_TEMPLATES: Array<{id: Template; name: string; description: string}> = [
  {id: "daily_surveillance_health", name: "Daily Surveillance Health Report", description: "Executive summary, 10-dimension health, exceptions requiring action, audit integrity"},
  {id: "comprehensive", name: "Comprehensive Daily Surveillance", description: "All metrics: branches, cameras, alerts, DVRs, storage, retention"},
  {id: "branch_health_summary", name: "Branch Health Summary", description: "Per-branch health scores, component status, critical alerts"},
  {id: "camera_availability", name: "Camera Availability", description: "Camera online/offline status, quality metrics, uptime"},
  {id: "alert_summary", name: "Alert Summary", description: "Alert counts by severity, acknowledgment times, SLA compliance"},
  {id: "recorder_status", name: "DVR/NVR Status", description: "Recording state, channel status, storage capacity"},
  {id: "hdd_health", name: "HDD Health", description: "SMART status, disk failures, temperature, write errors"},
  {id: "retention_compliance", name: "Retention Compliance", description: "Retention days vs policy, violations, storage projections"},
];

export default function ReportsPage(){
  const[workspace,setWorkspace]=useState("compose");
  const[step,setStep]=useState(0);
  const[deliveryMode,setDeliveryMode]=useState("once");
  const[schedules,setSchedules]=useState<Schedule[]>([]);
  const[runs,setRuns]=useState<Run[]>([]);
  const[loading,setLoading]=useState(true);
  const[message,setMessage]=useState("");
  const[error,setError]=useState("");
  const[submitting,setSubmitting]=useState<"run"|"schedule"|"delete"|null>(null);
  const[name,setName]=useState("Daily enterprise surveillance");
  const[timezone,setTimezone]=useState("Asia/Kolkata");
  const[dailyAt,setDailyAt]=useState("06:30");
  const[recipients,setRecipients]=useState("");
  const[template,setTemplate]=useState<Template>("comprehensive");
  const[templates,setTemplates]=useState(REPORT_TEMPLATES);
  const[formats,setFormats]=useState<Format[]>(["pdf","xlsx","csv"]);
  const[filters,setFilters]=useState<Filters>({});
  const[deliveryConfiguration,setDeliveryConfiguration]=useState<DeliveryConfiguration|null>(null);
  
  function getReportAuthHeaders(): Record<string, string> {
    const token = typeof window !== "undefined"
      ? (localStorage.getItem("accessToken") || sessionStorage.getItem("accessToken"))
      : null;
    const headers: Record<string, string> = {};
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
      headers["x-sentinel-session"] = token;
    }
    return headers;
  }

  const load=useCallback(async()=>{
    try{
    const authHeaders = getReportAuthHeaders();
    const[scheduleResponse,runResponse,templateResponse,deliveryResponse]=await Promise.all([
      fetch("/api/control/v1/reports/operational/schedules",{headers: authHeaders, credentials: "include", cache:"no-store"}),
      fetch("/api/control/v1/reports/operational/runs?limit=100",{headers: authHeaders, credentials: "include", cache:"no-store"}),
      fetch("/api/control/v1/reports/operational/templates",{headers: authHeaders, credentials: "include", cache:"no-store"}),
      fetch("/api/control/v1/reports/operational/delivery-configuration",{headers: authHeaders, credentials: "include", cache:"no-store"}),
    ]);
    if(!scheduleResponse.ok||!runResponse.ok||!templateResponse.ok||!deliveryResponse.ok)throw new Error("Unable to refresh report data. Check your reporting access and try again.");
    setSchedules((await scheduleResponse.json()).data??[]);
    setRuns((await runResponse.json()).data??[]);
    if(templateResponse.ok){
      const catalog=((await templateResponse.json()).data??[]) as Array<{id:Template;name:string}>;
      const available=catalog.map((item)=>({
        ...item,
        description:REPORT_TEMPLATES.find((template)=>template.id===item.id)?.description??"Operational report export",
      }));
      if(available.length){setTemplates(available);setTemplate((current)=>available.some((item)=>item.id===current)?current:available[0]!.id);}
    }
    setDeliveryConfiguration((await deliveryResponse.json()).data);
    setError("");
    }catch(cause){setError(cause instanceof Error?cause.message:"Unable to refresh report data.");}
    finally{setLoading(false);}
  },[]);
  
  useEffect(()=>{void load();const timer=setInterval(()=>void load(),15_000);return()=>clearInterval(timer);},[load]);
  
  const payload=()=>({template,formats,filters:clean(filters),recipients:recipients.split(",").map((item)=>item.trim()).filter(Boolean)});
  
  const createSchedule=async()=>{
    if(!validateRequest(true))return;
    setMessage("");setError("");setSubmitting("schedule");
    try{const response=await fetch("/api/control/v1/reports/operational/schedules",{
      method:"POST",
      headers:{"content-type":"application/json", ...getReportAuthHeaders()},
      credentials: "include",
      body:JSON.stringify({name,timezone,dailyAt,...payload(),enabled:true})
    });
    if(!response.ok)throw new Error(await responseError(response,"Could not save schedule."));
    setMessage("Daily schedule saved.");setWorkspace("schedules");
    if(response.ok)await load();
    }catch(cause){setError(cause instanceof Error?cause.message:"Could not save schedule.");}finally{setSubmitting(null);}
  };
  
  const runNow=async()=>{
    if(!validateRequest(false))return;
    setMessage("");setError("");setSubmitting("run");
    try{const response=await fetch("/api/control/v1/reports/operational/runs",{
      method:"POST",
      headers:{"content-type":"application/json", ...getReportAuthHeaders()},
      credentials: "include",
      body:JSON.stringify(payload())
    });
    if(!response.ok)throw new Error(await responseError(response,"Could not queue report."));
    setMessage("Report queued for generation.");setWorkspace("history");
    if(response.ok)await load();
    }catch(cause){setError(cause instanceof Error?cause.message:"Could not queue report.");}finally{setSubmitting(null);}
  };
  
  const remove=async(id:string)=>{
    if(!window.confirm("Delete this daily schedule? Existing report history will be retained."))return;
    setError("");setMessage("");setSubmitting("delete");
    try{const response=await fetch(`/api/control/v1/reports/operational/schedules/${encodeURIComponent(id)}`,{
      method:"DELETE",
      headers: getReportAuthHeaders(),
      credentials: "include",
    });if(!response.ok)throw new Error(await responseError(response,"Could not delete schedule."));setMessage("Schedule deleted.");await load();}catch(cause){setError(cause instanceof Error?cause.message:"Could not delete schedule.");}finally{setSubmitting(null);}
  };
  const validateRequest=(requireScheduleName:boolean)=>{if(filters.from&&filters.to&&new Date(filters.from)>new Date(filters.to)){setError("The end of the reporting period must follow its start.");setStep(1);return false;}if(!formats.length){setError("Select at least one export format.");return false;}if(requireScheduleName&&!name.trim()){setError("Provide a schedule name.");return false;}const invalid=recipients.split(",").map((item)=>item.trim()).filter(Boolean).find((item)=>!/^\S+@\S+\.\S+$/.test(item));if(invalid){setError(`Invalid recipient email: ${invalid}`);return false;}return true;};
  
  const selectedTemplateInfo = templates.find(t => t.id === template);
  
  return <AppLayout><main className="content reports-page p-6 space-y-6 max-w-[1500px] mx-auto">
    <header className="workflow-heading report-studio-heading">
      <div><p className="workflow-kicker">REPORT STUDIO / ASSURANCE</p><h1>Make insight.<br/><em>Deliver clarity.</em></h1><p>Choose a story, set its scope, then build your report.</p></div>
      <div className="workflow-heading-actions"><Link href="/reports/mis" className="btn-secondary"><BarChart3 size={16}/>Explore MIS analytics<ArrowRight size={14}/></Link><button className="workflow-icon-button" aria-label="Refresh report data" onClick={()=>void load()}><RefreshCw size={18}/></button></div>
    </header>
    <WorkflowNav label="Report workspace" value={workspace} onChange={setWorkspace} items={[{id:"compose",label:"Compose"},{id:"schedules",label:"Schedules",count:schedules.length},{id:"history",label:"Run history",count:runs.length}]} />
    {message&&<div className="card py-3 text-sm" role="status">{message}</div>}
    {error&&<div className="card border-red-500/50 py-3 text-sm text-red-300" role="alert">{error}</div>}
    
    <section hidden={workspace!=="compose"} className="report-studio">
      <div className="report-builder">
        <nav className="report-steps" aria-label="Report creation steps">
          {["Story","Scope","Delivery","Review"].map((label,index)=><button type="button" key={label} aria-current={step===index?"step":undefined} onClick={()=>setStep(index)}><span>{String(index+1).padStart(2,"0")}</span><strong>{label}</strong></button>)}
        </nav>
        <div className="report-step-body">
          <div className="report-step-intro"><p className="workflow-kicker">STEP {step+1} OF 4</p><h2>{["What should this report explain?","Focus on what matters.","Choose how it reaches you.","Ready to build your report?"][step]}</h2><p>{["Pick the question you want your data to answer.","Leave filters empty to include the full estate.","Generate once or establish a daily reporting rhythm.","Review the configuration below before submitting."][step]}</p></div>
          <div hidden={step!==0}>        <div>
          <label className="text-sm font-medium flex items-center gap-2 mb-2">
            <FileText size={16}/>
            Report Template
          </label>
          <div role="radiogroup" aria-label="Report template" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {templates.map((tmpl)=>(
              <button key={tmpl.id} type="button" role="radio" aria-checked={template===tmpl.id} onClick={()=>setTemplate(tmpl.id)} className={`rounded-xl border p-3.5 text-left transition ${template===tmpl.id?"border-blue-500 bg-blue-600/20 ring-1 ring-blue-500":"border-slate-700 bg-slate-800/60 hover:border-slate-600"}`}>
                <span className={`block text-sm font-semibold ${template===tmpl.id ? "text-blue-400" : "text-slate-100"}`}>{tmpl.name}</span>
                <span className="mt-1 block text-xs text-slate-400">{tmpl.description}</span>
              </button>
            ))}
          </div>
          {selectedTemplateInfo && (
            <p className="text-xs text-slate-400 mt-2">Selected: <strong className="text-slate-200 font-semibold">{selectedTemplateInfo.name}</strong></p>
          )}
        </div>
        
</div>
          <div hidden={step!==1}>        <div className="grid md:grid-cols-3 gap-3">
          <Filter label="Region" value={filters.region} set={(value)=>setFilters({...filters,region:value})}/>
          <Filter label="Branch ID" value={filters.branchId} set={(value)=>setFilters({...filters,branchId:value})}/>
          <label className="text-sm">
            Device status
            <select className="input w-full mt-1" value={filters.deviceStatus??""} onChange={(e)=>setFilters({...filters,deviceStatus:e.target.value})}>
              <option value="">All</option>
              <option>healthy</option>
              <option>warning</option>
              <option>critical</option>
              <option>unknown</option>
            </select>
          </label>
          <Filter label="Alert type" value={filters.alertType} set={(value)=>setFilters({...filters,alertType:value})}/>
          <label className="text-sm">
            Severity
            <select className="input w-full mt-1" value={filters.severity??""} onChange={(e)=>setFilters({...filters,severity:e.target.value})}>
              <option value="">All</option>
              {["P1","P2","P3","P4"].map((item)=><option key={item}>{item}</option>)}
            </select>
          </label>
          <Filter label="Alert state" value={filters.alertState} set={(value)=>setFilters({...filters,alertState:value})}/>
          <label className="text-sm">
            From
            <input className="input w-full mt-1" type="datetime-local" onChange={(e)=>setFilters({...filters,from:toIso(e.target.value)})}/>
          </label>
          <label className="text-sm">
            To
            <input className="input w-full mt-1" type="datetime-local" onChange={(e)=>setFilters({...filters,to:toIso(e.target.value)})}/>
          </label>
        </div>
        
</div>
          <div hidden={step!==2} className="report-delivery-step">
            <div className="workflow-choice-pair"><button type="button" aria-pressed={deliveryMode==="once"} onClick={()=>setDeliveryMode("once")}><Play size={20}/><strong>Generate once</strong><span>Build an on-demand export.</span></button><button type="button" aria-pressed={deliveryMode==="daily"} onClick={()=>setDeliveryMode("daily")}><CalendarClock size={20}/><strong>Every day</strong><span>Save a repeatable reporting rhythm.</span></button></div>
                    <div>
          <span className="text-sm">Formats</span>
          <div className="flex gap-2 mt-1">
            {(["csv","xlsx","pdf"] as Format[]).map((format)=>(
              <button type="button"
                aria-pressed={formats.includes(format)} key={format} 
                onClick={()=>setFormats((current)=>
                  current.includes(format)?current.filter((item)=>item!==format):[...current,format]
                )} 
                className={`px-3 py-2 rounded border text-sm uppercase ${formats.includes(format)?"bg-blue-700 text-white":"bg-white"}`}
              >
                {format}
              </button>
            ))}
          </div>
        </div>
        
        <div className="grid md:grid-cols-2 gap-3">
          <label hidden={deliveryMode!=="daily"} className="text-sm">
            Schedule name
            <input className="input w-full mt-1" value={name} onChange={(e)=>setName(e.target.value)}/>
          </label>
          <label className="text-sm">
            Recipients (email)
            <input 
              className="input w-full mt-1" 
              value={recipients} 
              onChange={(e)=>setRecipients(e.target.value)} 
              placeholder="soc@example.com, manager@example.com"
            />
          </label>
          <label hidden={deliveryMode!=="daily"} className="text-sm">
            Timezone
            <input className="input w-full mt-1" value={timezone} onChange={(e)=>setTimezone(e.target.value)}/>
          </label>
          <label hidden={deliveryMode!=="daily"} className="text-sm">
            Daily time
            <input className="input w-full mt-1" type="time" value={dailyAt} onChange={(e)=>setDailyAt(e.target.value)}/>
          </label>
        </div>
        

            <div className="field-delivery-state">{deliveryConfiguration===null?(loading?"Checking email delivery…":"Email delivery status unavailable."):deliveryConfiguration.configured?`Email delivery configured through ${deliveryConfiguration.provider.toUpperCase()}.`:"Email delivery is not configured. Reports remain available in Run history."}</div>
          </div>
          <div hidden={step!==3} className="report-review"><FileText size={32}/><h3>{selectedTemplateInfo?.name}</h3><p>{selectedTemplateInfo?.description}</p><dl><div><dt>Coverage</dt><dd>{Object.keys(clean(filters)).length?Object.entries(clean(filters)).map(([key,value])=>`${key}: ${value}`).join(" · "):"Full estate · all statuses"}</dd></div><div><dt>Files</dt><dd>{formats.map(f=>f.toUpperCase()).join(" + ")||"Select an export format"}</dd></div><div><dt>Recipients</dt><dd>{recipients||"In-app downloads"}</dd></div><div><dt>Timing</dt><dd>{deliveryMode==="daily"?`${name} · Daily ${dailyAt} / ${timezone}`:"Generate on demand"}</dd></div></dl></div>
        </div>
        <footer className="report-builder-footer"><button className="btn-secondary" type="button" disabled={step===0} onClick={()=>setStep(step-1)}>Back</button><span>Your choices stay while you move between steps.</span>{step<3?<button className="btn-primary" type="button" onClick={()=>setStep(step+1)}>Continue<ArrowRight size={15}/></button>:<button className="btn-primary" disabled={!formats.length||submitting!==null} onClick={()=>void(deliveryMode==="daily"?createSchedule():runNow())}>{submitting?<LoaderCircle size={15} className="animate-spin"/>:<Play size={15}/>} {deliveryMode==="daily"?"Save daily schedule":"Generate report"}</button>}</footer>
      </div>
      <aside className="report-packet" aria-label="Report configuration preview">
        <p className="workflow-kicker">YOUR REPORT / CONFIGURATION</p><div className="report-paper"><span className="report-paper-mark">KV /</span><FileText size={30}/><h3>{selectedTemplateInfo?.name}</h3><p>{selectedTemplateInfo?.description}</p><div className="report-paper-lines" aria-hidden="true"><i/><i/><i/><i/></div><strong>{formats.map(f=>f.toUpperCase()).join(" / ")||"No format selected"}</strong><small>Layout illustration · actual output is generated after submission</small></div>
        <dl><div><dt>Scope</dt><dd>{filters.branchId||filters.region||"Full estate"}</dd></div><div><dt>Filters</dt><dd>{Object.keys(clean(filters)).length} applied</dd></div><div><dt>Rhythm</dt><dd>{deliveryMode==="daily"?`Daily · ${dailyAt}`:"On demand"}</dd></div></dl>
      </aside>
    </section>
    <section hidden={workspace!=="schedules"} className="report-schedule-workspace">      <div className="card">
        <h2 className="text-lg font-semibold mb-3">Saved schedules</h2>
        {schedules.length===0?<p className="text-gray-500 text-sm">No saved schedules.</p>:(
          <div className="space-y-2">
            {schedules.map((schedule)=>(
              <div key={schedule.id} className="border rounded-lg p-3 flex justify-between gap-3">
                <div>
                  <strong>{schedule.name}</strong>
                  <p className="text-xs text-gray-500">
                    {templates.find(t => t.id === schedule.template)?.name || schedule.template} • Daily {schedule.dailyAt} / {schedule.timezone} / {schedule.formats.join(", ")}
                  </p>
                  <p className="text-xs">
                    Next: {new Date(schedule.nextRunAt).toLocaleString()} / Last: {schedule.lastRunAt?new Date(schedule.lastRunAt).toLocaleString():"Never"}
                  </p>
                  <p className="text-xs text-gray-500">{schedule.recipients.join(", ")||"In-app only"}</p>
                </div>
                <button aria-label="Delete schedule" disabled={submitting!==null} onClick={()=>void remove(schedule.id)}>
                  <Trash2 size={17} className="text-red-600"/>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
</section>
    <section hidden={workspace!=="history"} className="card overflow-auto report-history-workspace">
      <h2 className="text-lg font-semibold mb-3">Run history</h2>
      {loading?<p><LoaderCircle className="animate-spin inline"/> Loading…</p>:(
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="py-2">Requested</th>
              <th>Template</th>
              <th>Status</th>
              <th>Scope</th>
              <th>Rows</th>
              <th>Delivery</th>
              <th>Downloads</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run)=>(
              <tr key={run.id} className="border-b align-top">
                <td className="py-3">{new Date(run.createdAt).toLocaleString()}</td>
                <td className="text-xs">{templates.find(t => t.id === run.template)?.name || run.template}</td>
                <td>
                  <span className="flex gap-1 items-center">
                    {run.status==="completed"?<CheckCircle2 size={15} className="text-green-600"/>:run.status==="running"?<LoaderCircle size={15} className="animate-spin"/>:null}
                    {run.status} {run.status==="running"?`${run.progress}%`:""}
                  </span>
                  {run.error&&<small className="block text-red-700">{run.error}</small>}
                </td>
                <td>
                  {Object.entries(run.filters).map(([key,value])=>(
                    <small key={key} className="block">{key}: {value}</small>
                  ))}
                </td>
                <td>{run.rowCount??"—"}</td>
                <td>
                  {run.deliveries.length?run.deliveries.map((delivery)=>(
                    <small title={delivery.error} className="block" key={delivery.id}>
                      {delivery.recipient}: {delivery.status} ({delivery.attempts})
                    </small>
                  )):"In-app"}
                </td>
                <td>
                  <div className="flex flex-wrap gap-2">
                    {run.artifacts.map((artifact)=>(
                      <a className="btn-secondary inline-flex gap-1 text-xs" href={artifact.downloadUrl} key={artifact.id}>
                        <Download size={13}/>{artifact.format.toUpperCase()}
                      </a>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  </main></AppLayout>;
}

function Filter({label,value,set}:{label:string;value?:string;set:(value:string)=>void}){
  return (
    <label className="text-sm">
      {label}
      <input className="input w-full mt-1" value={value??""} onChange={(e)=>set(e.target.value)}/>
    </label>
  );
}

function clean(filters:Filters){
  return Object.fromEntries(Object.entries(filters).filter(([,value])=>value));
}

function toIso(value:string){
  return value?new Date(value).toISOString():undefined;
}

async function responseError(response:Response,fallback:string){const body=await response.json().catch(()=>null);return body?.error??fallback;}
