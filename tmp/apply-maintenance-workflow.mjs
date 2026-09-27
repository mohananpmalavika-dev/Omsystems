import fs from 'node:fs';
const path='dashboard/app/maintenance/page.tsx';
let s=fs.readFileSync(path,'utf8').replaceAll('\r\n','\n');
s=s.replace('import { PageHero } from "@/components/page-hero";', 'import { WorkflowNav } from "@/components/workflow-nav";\nimport { MaintenanceTaskDesk, type MaintenanceTask } from "@/components/maintenance/task-desk";');
s=s.replace('  const [status, setStatus]', '  const [workspace, setWorkspace] = useState("attention");\n  const [status, setStatus]').replace('useState(false);\n  const [error', 'useState(true);\n  const [error');
s=s.replace('void Promise.all([', 'void Promise.allSettled([');
const thenStart=s.indexOf('      .then(([statusData');
const thenEnd=s.indexOf('      .catch((err)',thenStart);
s=s.slice(0,thenStart)+`      .then((results) => {
        const setters = [
          (data:any)=>setStatus(data), (data:any)=>setHealth(data),
          (data:any)=>setFirmwareUpdates(data.data??[]), (data:any)=>setFirmwareCatalog(data.data??[]),
          (data:any)=>setLowStockParts(data.data??[]), (data:any)=>setHighRiskAssets(data.data??[]),
          (data:any)=>setCompliance(data??null),
          (data:any)=>setPendingRotations((data.data??[]).filter((item:any)=>item.status!=="completed").length),
          (data:any)=>setIpConflictCount((data.data??[]).length),
        ];
        results.forEach((result,index)=>{if(result.status==="fulfilled")setters[index]!(result.value);});
        const missing=results.filter(result=>result.status==="rejected").length;
        if(missing)setError(\`\${missing} maintenance feeds are unavailable. Available tasks are still shown.\`);
      })
`+s.slice(thenEnd);
const alertStart=s.indexOf('  const alertItems =');
const alertEnd=s.indexOf('  const handleCreateUpgradePlan',alertStart);
s=s.slice(0,alertStart)+`  const tasks:MaintenanceTask[] = [
    ...(status?.predictiveAlerts??[]).filter((item:any)=>item.status==="open").map((item:any)=>({id:\`alert-\${item.id}\`,kind:"Alert" as const,title:item.alertType||item.type||"Predictive alert",description:item.details?.summary||item.details?.message||\`Risk score \${item.score??"unavailable"}\`,priority:item.score>0.8?"critical":item.score>0.5?"high":"medium",reference:item.id,assetId:item.assetId,status:item.status,href:"/maintenance/predictive",actionLabel:"Inspect predictive alert"})),
    ...highRiskAssets.map((item:any)=>({id:\`risk-\${item.id}\`,kind:"Asset risk" as const,title:item.deviceType||item.assetId||"Asset risk",description:item.details?.summary||item.details?.message||\`Risk score \${item.score??"unavailable"}\`,priority:item.score>0.8?"critical":"high",reference:item.id,assetId:item.assetId,href:item.assetId?\`/maintenance/assets/\${encodeURIComponent(item.assetId)}\`:"/maintenance/predictive",actionLabel:"Inspect affected asset"})),
    ...(status?.workOrders??[]).filter((item:any)=>!["resolved","closed","cancelled"].includes(item.status)).map((item:any)=>({id:\`work-\${item.id}\`,kind:"Work order" as const,title:item.problem||item.title||"Service task",description:item.actionTaken||item.rootCause||"Review this order and coordinate the next service action.",priority:item.severity||"medium",reference:item.workOrderNumber||item.id,assetId:item.assetId,status:item.status,owner:item.technician||item.assignedTo,dueAt:item.slaDueAt,href:\`/maintenance/workorders/\${encodeURIComponent(item.id)}\`,actionLabel:"Open service order"})),
  ].sort((a,b)=>["critical","high","medium","low"].indexOf(a.priority)-["critical","high","medium","low"].indexOf(b.priority));

`+s.slice(alertEnd);
const planHeading=s.indexOf('        <h2 style={{ marginBottom: 16 }}>Firmware upgrade planner</h2>');
const planStart=s.lastIndexOf('      <section',planHeading);
const planEnd=s.indexOf('      </section>',planHeading)+'      </section>'.length;
const plan=s.slice(planStart,planEnd);
const returnStart=s.indexOf('  return (');
s=s.slice(0,returnStart)+`  return (
    <main className="content maintenance-dashboard-page maintenance-action-workspace">
      <div className="maintenance-page-inner">
        <header className="workflow-heading maintenance-desk-heading"><div><p className="workflow-kicker">SERVICE DESK / FLEET READINESS</p><h1>Keep the fleet<br/><em>moving forward.</em></h1><p>Pick the next issue. Understand it. Take action.</p></div><div className="workflow-heading-actions"><Link href="/maintenance/health" className="btn-secondary"><Activity size={16}/>Run health checks</Link><Link href="/maintenance/workorders/new" className="btn-primary"><ClipboardCheck size={16}/>New work order</Link></div></header>
        <WorkflowNav label="Maintenance workspace" value={workspace} onChange={setWorkspace} items={[{id:"attention",label:"Attention queue"},{id:"health",label:"Fleet pulse"},{id:"firmware",label:"Firmware lab"},{id:"inventory",label:"Parts & coverage"}]} />
        {error&&<div className="module-alert" role="alert">{error}</div>}
        <section hidden={workspace!=="attention"}><MaintenanceTaskDesk tasks={tasks} loading={loading} unavailable={Boolean(error)}/></section>
        <section hidden={workspace!=="health"} className="fleet-pulse-workspace">
          <div className="fleet-pulse-feature"><p className="workflow-kicker">CURRENT HEALTH</p><strong>{loading?"…":health?.healthPercentage!=null?\`\${health.healthPercentage}%\`:"—"}</strong><h2>Fleet health score</h2><p>{health?"From the latest maintenance health feed.":"Waiting for an available health feed."}</p><Link className="btn-secondary" href="/maintenance/health">Open diagnostics</Link></div>
          <div className="fleet-pulse-measures">{[["Tracked assets",status?.totalAssets],["Open work orders",status?.workOrdersOpen],["Overdue visits",health?.overdueVisits],["Active AMC contracts",status?.amcContractsActive],["Maintenance visits pending",status?.visitsPending],["AMCs expiring soon",status?.amcContractsExpiring]].map(([label,value])=><div key={String(label)}><span>{label}</span><strong>{loading?"…":value??"—"}</strong></div>)}</div>
          <div className="fleet-device-actions"><h2>Device operations</h2><p>Handle rotation, configuration and address assignments.</p><Link href="/maintenance/device-management" className="btn-primary">Open device management</Link><Link href="/maintenance/camera-map" className="btn-secondary">Explore camera locations</Link></div>
        </section>
        <section hidden={workspace!=="firmware"} className="firmware-lab-workspace">
          <div className="firmware-lab-context"><p className="workflow-kicker">ROLLOUT / PLAN BEFORE DEPLOYMENT</p><h2>Firmware lab</h2><p>Inspect the update requirement, then prepare a rollout with the safety checks below.</p><div className="firmware-readiness-list"><h3>Devices requiring updates</h3>{firmwareUpdates.map(item=><div key={item.id}><strong>{item.deviceType||item.id}</strong><span>{item.currentVersion} → {item.latestVersion??"Unknown"}</span></div>)}{!firmwareUpdates.length&&<p>{loading?"Loading…":error?"Update feed unavailable or empty.":"No devices currently require updates."}</p>}</div><div className="firmware-readiness-list"><h3>Registered packages</h3>{firmwareCatalog.map(item=><button key={item.id} type="button" aria-pressed={upgradePayload.firmwareVersionId===item.id} onClick={()=>setUpgradePayload(previous=>({...previous,firmwareVersionId:item.id}))}><strong>{item.vendor} {item.model}</strong><span>{item.version} / {item.status}</span></button>)}{!firmwareCatalog.length&&<p>{loading?"Loading…":"No registered packages available in the current feed."}</p>}</div></div>
          <div className="firmware-plan-surface">${plan}</div>
        </section>
        <section hidden={workspace!=="inventory"} className="parts-coverage-workspace"><div><p className="workflow-kicker">PARTS / REPLENISHMENT</p><h2>Stock watch</h2><p>Parts below the reorder threshold.</p>{lowStockParts.map(part=><article key={part.id}><strong>{part.partName}</strong><span>Quantity {part.quantity} / Reorder {part.reorderLevel}</span></article>)}{!lowStockParts.length&&<p>{loading?"Loading parts…":error?"Stock feed unavailable or empty.":"No parts are below the reorder threshold."}</p>}<Link href="/maintenance/assets" className="btn-secondary">Browse hardware assets</Link></div><aside><p className="workflow-kicker">SERVICE NETWORK</p><h2>Coverage & partners</h2><Link href="/maintenance/amc">AMC contracts<span>{status?.amcContractsActive??"—"}</span></Link><Link href="/maintenance/vendors">Vendor directory<Wrench size={16}/></Link><Link href="/maintenance/workorders">Service work orders<ClipboardCheck size={16}/></Link><Link href="/maintenance/privacy">Privacy & data<Activity size={16}/></Link></aside></section>
      </div>
    </main>
  );
}
`;
// Remove dashboard-only component imports after switching to the action desk.
s=s.replace(/import \{\n  AlertList,[\s\S]*?from "@\/components\/maintenance\/dashboard-components";\n/, '');
fs.writeFileSync(path,s);
