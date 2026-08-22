"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarClock, CheckCircle2, Download, LoaderCircle, Play, RefreshCw, Trash2, FileText } from "lucide-react";
import { AppLayout } from "@/components/app-layout";
import { PageHero } from "@/components/page-hero";

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
  const[schedules,setSchedules]=useState<Schedule[]>([]);
  const[runs,setRuns]=useState<Run[]>([]);
  const[loading,setLoading]=useState(true);
  const[message,setMessage]=useState("");
  const[name,setName]=useState("Daily enterprise surveillance");
  const[timezone,setTimezone]=useState("Asia/Kolkata");
  const[dailyAt,setDailyAt]=useState("06:30");
  const[recipients,setRecipients]=useState("");
  const[template,setTemplate]=useState<Template>("comprehensive");
  const[templates,setTemplates]=useState(REPORT_TEMPLATES);
  const[formats,setFormats]=useState<Format[]>(["pdf","xlsx","csv"]);
  const[filters,setFilters]=useState<Filters>({});
  const[deliveryConfiguration,setDeliveryConfiguration]=useState<DeliveryConfiguration|null>(null);
  
  const load=useCallback(async()=>{
    const[scheduleResponse,runResponse,templateResponse,deliveryResponse]=await Promise.all([
      fetch("/api/control/v1/reports/operational/schedules",{cache:"no-store"}),
      fetch("/api/control/v1/reports/operational/runs?limit=100",{cache:"no-store"}),
      fetch("/api/control/v1/reports/operational/templates",{cache:"no-store"}),
      fetch("/api/control/v1/reports/operational/delivery-configuration",{cache:"no-store"}),
    ]);
    if(scheduleResponse.ok)setSchedules((await scheduleResponse.json()).data??[]);
    if(runResponse.ok)setRuns((await runResponse.json()).data??[]);
    if(templateResponse.ok){
      const catalog=((await templateResponse.json()).data??[]) as Array<{id:Template;name:string}>;
      const available=catalog.map((item)=>({
        ...item,
        description:REPORT_TEMPLATES.find((template)=>template.id===item.id)?.description??"Operational report export",
      }));
      if(available.length){setTemplates(available);setTemplate((current)=>available.some((item)=>item.id===current)?current:available[0]!.id);}
    }
    if(deliveryResponse.ok)setDeliveryConfiguration((await deliveryResponse.json()).data);
    setLoading(false);
  },[]);
  
  useEffect(()=>{void load();const timer=setInterval(load,5_000);return()=>clearInterval(timer);},[load]);
  
  const payload=()=>({template,formats,filters:clean(filters),recipients:recipients.split(",").map((item)=>item.trim()).filter(Boolean)});
  
  const createSchedule=async()=>{
    setMessage("");
    const response=await fetch("/api/control/v1/reports/operational/schedules",{
      method:"POST",
      headers:{"content-type":"application/json"},
      body:JSON.stringify({name,timezone,dailyAt,...payload(),enabled:true})
    });
    setMessage(response.ok?"Schedule saved.":"Could not save schedule.");
    if(response.ok)await load();
  };
  
  const runNow=async()=>{
    setMessage("");
    const response=await fetch("/api/control/v1/reports/operational/runs",{
      method:"POST",
      headers:{"content-type":"application/json"},
      body:JSON.stringify(payload())
    });
    setMessage(response.ok?"Report queued for generation.":"Could not queue report.");
    if(response.ok)await load();
  };
  
  const remove=async(id:string)=>{
    await fetch(`/api/control/v1/reports/operational/schedules/${id}`,{method:"DELETE"});
    await load();
  };
  
  const selectedTemplateInfo = templates.find(t => t.id === template);
  
  return <AppLayout><main className="content reports-page p-6 space-y-6 max-w-[1500px] mx-auto">
    <PageHero
      eyebrow="Reporting & assurance"
      title="Daily surveillance reports"
      description="Create scheduled and on-demand reports with controlled exports, delivery readiness and a complete audit history."
      icon={FileText}
      actions={<button className="btn-secondary" onClick={()=>void load()}><RefreshCw size={16}/>Refresh data</button>}
    />
    
    {message&&<div className="card py-3 text-sm">{message}</div>}
    
    <section className="grid xl:grid-cols-[1fr_1.2fr] gap-5">
      <div className="card space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Create report</h2>
          <p className="text-xs text-gray-500">Run immediately or persist as a daily schedule.</p>
        </div>

        <div className={`rounded-lg border p-3 text-xs ${deliveryConfiguration?.configured?"border-emerald-200 bg-emerald-50 text-emerald-800":"border-amber-200 bg-amber-50 text-amber-900"}`}>
          {deliveryConfiguration===null?"Checking report email delivery…":deliveryConfiguration.configured?`Email delivery is configured through ${deliveryConfiguration.provider.toUpperCase()}. Recipients receive signed report-download links.`:"Email delivery is not configured. Reports remain available in Run history; configure SMTP, SendGrid, SES, or a webhook before adding recipients."}
        </div>
        
        <div>
          <label className="text-sm font-medium flex items-center gap-2 mb-2">
            <FileText size={16}/>
            Report Template
          </label>
          <div role="radiogroup" aria-label="Report template" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {templates.map((tmpl)=>(
              <button key={tmpl.id} type="button" role="radio" aria-checked={template===tmpl.id} onClick={()=>setTemplate(tmpl.id)} className={`rounded-lg border p-3 text-left transition ${template===tmpl.id?"border-blue-600 bg-blue-50 ring-1 ring-blue-600":"border-gray-200 bg-white hover:border-blue-300"}`}>
                <span className="block text-sm font-semibold text-gray-900">{tmpl.name}</span>
                <span className="mt-1 block text-xs text-gray-600">{tmpl.description}</span>
              </button>
            ))}
          </div>
          {selectedTemplateInfo && (
            <p className="text-xs text-gray-500 mt-2">Selected: {selectedTemplateInfo.name}</p>
          )}
        </div>
        
        <div className="grid md:grid-cols-2 gap-3">
          <label className="text-sm">
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
          <label className="text-sm">
            Timezone
            <input className="input w-full mt-1" value={timezone} onChange={(e)=>setTimezone(e.target.value)}/>
          </label>
          <label className="text-sm">
            Daily time
            <input className="input w-full mt-1" type="time" value={dailyAt} onChange={(e)=>setDailyAt(e.target.value)}/>
          </label>
        </div>
        
        <div>
          <span className="text-sm">Formats</span>
          <div className="flex gap-2 mt-1">
            {(["csv","xlsx","pdf"] as Format[]).map((format)=>(
              <button 
                key={format} 
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
        
        <div className="grid md:grid-cols-3 gap-3">
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
        
        <div className="flex gap-2">
          <button disabled={!formats.length} onClick={()=>void runNow()} className="btn-primary flex gap-2">
            <Play size={15}/>Run now
          </button>
          <button disabled={!formats.length} onClick={()=>void createSchedule()} className="btn-secondary flex gap-2">
            <CalendarClock size={15}/>Save daily schedule
          </button>
        </div>
      </div>
      
      <div className="card">
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
                <button aria-label="Delete schedule" onClick={()=>void remove(schedule.id)}>
                  <Trash2 size={17} className="text-red-600"/>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
    
    <section className="card overflow-auto">
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
