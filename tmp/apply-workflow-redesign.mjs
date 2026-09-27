import fs from 'node:fs';
const path = 'dashboard/app/reports/page.tsx';
let s = fs.readFileSync(path, 'utf8').replaceAll('\r\n', '\n');
s = s.replace('import { PageHero } from "@/components/page-hero";', 'import { WorkflowNav } from "@/components/workflow-nav";');
s = s.replace('const[schedules,setSchedules]', 'const[workspace,setWorkspace]=useState("compose");\n  const[step,setStep]=useState(0);\n  const[deliveryMode,setDeliveryMode]=useState("once");\n  const[schedules,setSchedules]');
s = s.replace('setMessage("Daily schedule saved.");', 'setMessage("Daily schedule saved.");setWorkspace("schedules");');
s = s.replace('setMessage("Report queued for generation.");', 'setMessage("Report queued for generation.");setWorkspace("history");');
const heroStart = s.indexOf('    <PageHero');
const heroEnd = s.indexOf('    {message&&', heroStart);
s = s.slice(0,heroStart) + `    <header className="workflow-heading report-studio-heading">
      <div><p className="workflow-kicker">REPORT STUDIO / ASSURANCE</p><h1>Make insight.<br/><em>Deliver clarity.</em></h1><p>Choose a story, set its scope, then build your report.</p></div>
      <div className="workflow-heading-actions"><Link href="/reports/mis" className="btn-secondary"><BarChart3 size={16}/>Explore MIS analytics<ArrowRight size={14}/></Link><button className="workflow-icon-button" aria-label="Refresh report data" onClick={()=>void load()}><RefreshCw size={18}/></button></div>
    </header>
    <WorkflowNav label="Report workspace" value={workspace} onChange={setWorkspace} items={[{id:"compose",label:"Compose"},{id:"schedules",label:"Schedules",count:schedules.length},{id:"history",label:"Run history",count:runs.length}]} />
` + s.slice(heroEnd);
const start = s.indexOf('    <section className="grid xl:grid-cols-[1fr_1.2fr] gap-5">');
const end = s.indexOf('    <section className="card overflow-auto">',start);
const old = s.slice(start,end);
const templateStart = old.indexOf('        <div>\n          <label className="text-sm font-medium');
const scheduleStart = old.indexOf('        <div className="grid md:grid-cols-2 gap-3">',templateStart);
const formatStart = old.indexOf('        <div>\n          <span className="text-sm">Formats</span>',scheduleStart);
const filterStart = old.indexOf('        <div className="grid md:grid-cols-3 gap-3">',formatStart);
const actionStart = old.indexOf('        <div className="flex gap-2">',filterStart);
const savedStart = old.indexOf('      <div className="card">\n        <h2',actionStart);
if ([templateStart,scheduleStart,formatStart,filterStart,actionStart,savedStart].some(i=>i<0)) throw Error('Report section boundaries missing');
const template = old.slice(templateStart,scheduleStart);
let schedule = old.slice(scheduleStart,formatStart);
schedule = schedule.replace('          <label className="text-sm">\n            Schedule name','          <label hidden={deliveryMode!=="daily"} className="text-sm">\n            Schedule name').replace('          <label className="text-sm">\n            Timezone','          <label hidden={deliveryMode!=="daily"} className="text-sm">\n            Timezone').replace('          <label className="text-sm">\n            Daily time','          <label hidden={deliveryMode!=="daily"} className="text-sm">\n            Daily time');
const formats = old.slice(formatStart,filterStart).replace('key={format}', 'aria-pressed={formats.includes(format)} key={format}');
const filters = old.slice(filterStart,actionStart);
const saved = old.slice(savedStart,old.lastIndexOf('    </section>'));
const replacement = `    <section hidden={workspace!=="compose"} className="report-studio">
      <div className="report-builder">
        <nav className="report-steps" aria-label="Report creation steps">
          {["Story","Scope","Delivery","Review"].map((label,index)=><button type="button" key={label} aria-current={step===index?"step":undefined} onClick={()=>setStep(index)}><span>{String(index+1).padStart(2,"0")}</span><strong>{label}</strong></button>)}
        </nav>
        <div className="report-step-body">
          <div className="report-step-intro"><p className="workflow-kicker">STEP {step+1} OF 4</p><h2>{["What should this report explain?","Focus on what matters.","Choose how it reaches you.","Ready to build your report?"][step]}</h2><p>{["Pick the question you want your data to answer.","Leave filters empty to include the full estate.","Generate once or establish a daily reporting rhythm.","Review the configuration below before submitting."][step]}</p></div>
          <div hidden={step!==0}>${template}</div>
          <div hidden={step!==1}>${filters}</div>
          <div hidden={step!==2} className="report-delivery-step">
            <div className="workflow-choice-pair"><button type="button" aria-pressed={deliveryMode==="once"} onClick={()=>setDeliveryMode("once")}><Play size={20}/><strong>Generate once</strong><span>Build an on-demand export.</span></button><button type="button" aria-pressed={deliveryMode==="daily"} onClick={()=>setDeliveryMode("daily")}><CalendarClock size={20}/><strong>Every day</strong><span>Save a repeatable reporting rhythm.</span></button></div>
            ${formats}${schedule}
            <div className="field-delivery-state">{deliveryConfiguration===null?(loading?"Checking email delivery…":"Email delivery status unavailable."):deliveryConfiguration.configured?\`Email delivery configured through \${deliveryConfiguration.provider.toUpperCase()}.\`:"Email delivery is not configured. Reports remain available in Run history."}</div>
          </div>
          <div hidden={step!==3} className="report-review"><FileText size={32}/><h3>{selectedTemplateInfo?.name}</h3><p>{selectedTemplateInfo?.description}</p><dl><div><dt>Coverage</dt><dd>{Object.keys(clean(filters)).length?Object.entries(clean(filters)).map(([key,value])=>\`\${key}: \${value}\`).join(" · "):"Full estate · all statuses"}</dd></div><div><dt>Files</dt><dd>{formats.map(f=>f.toUpperCase()).join(" + ")||"Select an export format"}</dd></div><div><dt>Recipients</dt><dd>{recipients||"In-app downloads"}</dd></div><div><dt>Timing</dt><dd>{deliveryMode==="daily"?\`\${name} · Daily \${dailyAt} / \${timezone}\`:"Generate on demand"}</dd></div></dl></div>
        </div>
        <footer className="report-builder-footer"><button className="btn-secondary" type="button" disabled={step===0} onClick={()=>setStep(step-1)}>Back</button><span>Your choices stay while you move between steps.</span>{step<3?<button className="btn-primary" type="button" onClick={()=>setStep(step+1)}>Continue<ArrowRight size={15}/></button>:<button className="btn-primary" disabled={!formats.length||submitting!==null} onClick={()=>void(deliveryMode==="daily"?createSchedule():runNow())}>{submitting?<LoaderCircle size={15} className="animate-spin"/>:<Play size={15}/>} {deliveryMode==="daily"?"Save daily schedule":"Generate report"}</button>}</footer>
      </div>
      <aside className="report-packet" aria-label="Report configuration preview">
        <p className="workflow-kicker">YOUR REPORT / CONFIGURATION</p><div className="report-paper"><span className="report-paper-mark">KV /</span><FileText size={30}/><h3>{selectedTemplateInfo?.name}</h3><p>{selectedTemplateInfo?.description}</p><div className="report-paper-lines" aria-hidden="true"><i/><i/><i/><i/></div><strong>{formats.map(f=>f.toUpperCase()).join(" / ")||"No format selected"}</strong><small>Layout illustration · actual output is generated after submission</small></div>
        <dl><div><dt>Scope</dt><dd>{filters.branchId||filters.region||"Full estate"}</dd></div><div><dt>Filters</dt><dd>{Object.keys(clean(filters)).length} applied</dd></div><div><dt>Rhythm</dt><dd>{deliveryMode==="daily"?\`Daily · \${dailyAt}\`:"On demand"}</dd></div></dl>
      </aside>
    </section>
    <section hidden={workspace!=="schedules"} className="report-schedule-workspace">${saved}</section>
`;
s = s.slice(0,start)+replacement+s.slice(end);
s = s.replace('<section className="card overflow-auto">', '<section hidden={workspace!=="history"} className="card overflow-auto report-history-workspace">');
s = s.replace('const validateRequest=(requireScheduleName:boolean)=>{', 'const validateRequest=(requireScheduleName:boolean)=>{if(filters.from&&filters.to&&new Date(filters.from)>new Date(filters.to)){setError("The end of the reporting period must follow its start.");setStep(1);return false;}');
fs.writeFileSync(path,s);
