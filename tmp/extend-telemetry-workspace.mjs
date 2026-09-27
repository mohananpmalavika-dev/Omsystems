import fs from 'node:fs';
const path='dashboard/components/operational-health/component-detail-page.tsx';
let source=fs.readFileSync(path,'utf8');
source=source.replace('import { FieldVisual } from "@/components/field-visual";','import { InspectionDesk } from "@/components/inspection-desk";\nimport { WorkflowNav } from "@/components/workflow-nav";');
source=source.replace(/import \{\s+RefreshCw,[\s\S]*?\} from "lucide-react";/,'import { RefreshCw, Camera, FileVideo2, HardDrive, Network, Zap, Server, Search } from "lucide-react";');
source=source.replace('useState<"all" | "critical" | "warning" | "healthy">','useState<"all" | "critical" | "warning" | "healthy" | "unknown">');
source=source.replace(/  const \[pingingBranchId[\s\S]*?\n\n  const load/,'  const load');
source=source.replace('    try {\n      const data = await fetchBranchesHealth','    setLoading(true);\n    try {\n      const data = await fetchBranchesHealth');
source=source.replace(/  \/\/ Diagnostic Ping Simulation[\s\S]*?  const filteredBranches/,'  const filteredBranches');
source=source.replace('b.components[component]','b.components?.[component]');
source=source.replace('return health?.status === statusFilter;','return (health?.status ?? "unknown") === statusFilter;');
source=source.slice(0,source.indexOf('  return (\n    <div'))+`  const orderedBranches = [...filteredBranches].sort((a, b) => {
    const priority: Record<string, number> = { critical: 0, warning: 1, unknown: 2, healthy: 3 };
    return (priority[a.components?.[component]?.status ?? "unknown"] ?? 2) - (priority[b.components?.[component]?.status ?? "unknown"] ?? 2);
  });
  return <main className="telemetry-inspection-page page-container">
    <header className="workflow-heading"><div><p className="workflow-kicker">FLEET / COMPONENT INSPECTION</p><h1>{title}</h1><p>Find the branch that needs attention. Inspect its latest component reading, then open the branch workspace.</p></div><div className="workflow-heading-actions"><Link className="btn-secondary" href="/operations/alerts">Hardware alerts</Link><button className="btn-secondary" onClick={() => void load()} disabled={loading}><RefreshCw size={15} />{loading ? "Refreshing…" : "Refresh readings"}</button></div></header>
    <nav className="telemetry-system-nav" aria-label="Telemetry systems">{TELEMETRY_TABS.map(tab => { const Icon = tab.icon; return <Link key={tab.key} href={tab.href} aria-current={tab.key === component ? "page" : undefined}><Icon size={16} />{tab.label}</Link>; })}</nav>
    <div className="inspection-toolbar"><WorkflowNav label="Component health scope" value={statusFilter} onChange={value => setStatusFilter(value as typeof statusFilter)} items={[{id:"all",label:"All branches",count:error ? undefined : counts.total},{id:"critical",label:"Critical",count:error ? undefined : counts.critical},{id:"warning",label:"Degraded",count:error ? undefined : counts.warning},{id:"healthy",label:"Healthy",count:error ? undefined : counts.healthy},{id:"unknown",label:"Unknown"}]} /><label className="task-search"><Search size={16} /><input aria-label="Search branches" placeholder="Name, code or region" value={searchQuery} onChange={event => setSearchQuery(event.target.value)} /></label></div>
    <p className="inspection-feed-state">{live ? "Live updates connected" : "Readings refresh every 30 seconds"} · Critical branches appear first.</p>
    {error && <p role="alert" className="work-order-form-error">Telemetry unavailable: {error}{branches.length > 0 ? ". Showing last loaded readings." : ""}</p>}
    <InspectionDesk label="Branch readings" emptyMessage={loading ? "Loading branch readings…" : error ? "Readings are unavailable. Refresh to try again." : "No branches match this scope."} records={orderedBranches.map(branch => {
      const health = branch.components?.[component];
      return { id: branch.id, title: branch.name, subtitle: [branch.code, branch.region].filter(Boolean).join(" · "), status: health?.status ?? "unknown", measure: health?.score == null ? "—" : health.score + "%", description: "Component readings describe the last reported state. Open the branch for device-level investigation.", fields: [{label:"Component",value:TELEMETRY_TABS.find(tab => tab.key === component)?.label},{label:"Health score",value:health?.score == null ? "Unavailable" : health.score + "%"},{label:"Cameras online",value:branch.onlineCameras + " / " + branch.totalCameras},{label:"Last reported",value:health?.lastUpdated ? new Date(health.lastUpdated).toLocaleString() : "Not reported"},{label:"Region",value:branch.region || "Not recorded"}], href:"/operations/branches/" + branch.id, actionLabel:"Investigate branch" };
    })} />
  </main>;
}
`;
fs.writeFileSync(path,source);
