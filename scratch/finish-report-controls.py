from pathlib import Path
def edit(name,fn):
 p=Path(name);old=p.read_text(encoding='utf-8');new=fn(old);assert old!=new,name;p.write_text(new,encoding='utf-8',newline='\n')

edit('dashboard/components/reports/executive-management-report.tsx', lambda s:s.replace('row=>row.branchId&&onBranch(String(row.branchId))','row=>{ const item = row.payload as ExecutiveBranchRow; if(item.branchId) onBranch(item.branchId); }'))
edit('dashboard/components/alerts/management-alert-analytics.tsx',lambda s:s.replace('[dimension, alerts]','[dimension]').replace('select(String(data.name))','select(String((data.payload as {name: string}).name))').replace('Print / PDF','Print charts / PDF'))

def mis(s):
 s=s.replace('startDate.toISOString().slice(0, 10), endDate.toISOString().slice(0, 10)','reportLocalDate(startDate), reportLocalDate(endDate)')
 s=s.replace('DATE(i.detected_at)',"DATE(i.detected_at AT TIME ZONE 'Asia/Kolkata')").replace('EXTRACT(HOUR FROM i.detected_at)',"EXTRACT(HOUR FROM i.detected_at AT TIME ZONE 'Asia/Kolkata')")
 # A clock-hour filter applies consistently to incident totals, daily and hourly views.
 s=s.replace('function metricNumber', '''function shiftCondition(shift: string, column: string): string {
  const hour = `EXTRACT(HOUR FROM ${column} AT TIME ZONE 'Asia/Kolkata')`;
  return shift === 'morning' ? `${hour} >= 6 AND ${hour} < 14` : shift === 'evening' ? `${hour} >= 14 AND ${hour} < 22` : shift === 'night' ? `(${hour} < 6 OR ${hour} >= 22)` : 'TRUE';
}

function metricNumber''')
 s=s.replace('getDateWiseBreakdown(pool, tenantId, branchIds, startDate, endDate)','getDateWiseBreakdown(pool, tenantId, branchIds, startDate, endDate, query.shift)').replace('getTimeWiseBreakdown(pool, tenantId, branchIds, startDate, endDate)','getTimeWiseBreakdown(pool, tenantId, branchIds, startDate, endDate, query.shift)')
 start=s.index('async function getDateWiseBreakdown(')
 s=s[:start]+s[start:].replace('  endDate: Date\n','  endDate: Date,\n  shift = \'all\'\n')
 start=s.index('async function generateMISReport(');end=s.index('// FILTER OPTIONS PROVIDER',start)
 block=s[start:end]
 # Separate argument names between main query and breakdown helpers.
 pos=block.index('async function getDateWiseBreakdown(')
 block=block[:pos].replace('AND i.detected_at BETWEEN $3 AND $4','AND i.detected_at BETWEEN $3 AND $4\n         AND ${shiftCondition(query.shift, \'i.detected_at\')}')+block[pos:].replace('AND i.detected_at BETWEEN $3 AND $4','AND i.detected_at BETWEEN $3 AND $4\n       AND ${shiftCondition(shift, \'i.detected_at\')}')
 s=s[:start]+block+s[end:]
 s=s.replace("    let complianceStatus = 'Optimal';\n    if (avgRetentionDays !== null && avgRetentionDays < 90) {\n      complianceStatus = 'Warning';\n    } else if (uptimePercent < 95) {", "    let complianceStatus = totalCameras > 0 ? 'Available' : 'Not measured';\n    if (totalCameras > 0 && uptimePercent < 95) {")
 s=s.replace('  const nodesById = new Map<string, { id: string; parent_id: string | null; node_type: string; name: string }>();\n  for (const n of rawNodes) {\n    nodesById.set(n.id, n);\n  }','  const hierarchyNodes = new Map(rawNodes.map(n => [n.id, {id:n.id, parentId:n.parent_id, type:n.node_type, name:n.name}]));')
 s=s.replace('resolveReportHierarchy(node.id, new Map(rawNodes.map(n => [n.id, {\n      id: n.id, parentId: n.parent_id, type: n.node_type, name: n.name,\n    }])))','resolveReportHierarchy(node.id, hierarchyNodes)')
 s=s.replace("  instance.get('/mis/branch-openings/:ruleId", '''  instance.get('/mis/hierarchy', async (request) => {
    const query = z.object({organization:reportFilter,zone:reportFilter,region:reportFilter,area:reportFilter}).parse(request.query);
    const allowed = new Set((await store.listAccessibleNodes(request.currentUser, 'live:view', 'branch')).map(node=>node.id));
    const branches = (await resolveBranchHierarchy(pool, request.currentUser.tenantId, store)).filter(branch=>allowed.has(branch.branch_id));
    const byOrg = branches.filter(b=>!query.organization || b.org_name===query.organization);
    const byZone = byOrg.filter(b=>!query.zone || b.zone_name===query.zone);
    const byRegion = byZone.filter(b=>!query.region || b.region_name===query.region);
    const byArea = byRegion.filter(b=>!query.area || b.area_name===query.area);
    return {organizations:buildFilterOptions(branches).organizations,zones:buildFilterOptions(byOrg).zones,regions:buildFilterOptions(byZone).regions,areas:buildFilterOptions(byRegion).areas,branches:buildFilterOptions(byArea).branches};
  });
  instance.get('/mis/branch-openings/:ruleId''',1)
 return s
edit('src/routes/reports/mis-unified.routes.ts',mis)
edit('dashboard/app/reports/mis/page.tsx',lambda s:s.replace('`"${r.dimension}"`','r.dimension').replace('r.footfall ?? 0','r.footfall ?? ""').replace('{row.area} · <span className="text-sky-400">{row.region}</span>','{[row.zone,row.region,row.area].filter(Boolean).join(" / ") || "Direct branch"}').replace('row.complianceStatus === "Compliant" || row.status === "Optimal"','row.complianceStatus === "Available" || row.status === "Optimal"').replace('Macro Zones, Geographical Regions, City Areas','Zones, Regions, Areas'))
edit('src/reporting/renderers/daily-surveillance-xlsx.renderer.ts',lambda s:s.replace('    { header: "Region", key: "region", width: 18 },','    { header: "Zone", key: "zone", width: 18 },\n    { header: "Region", key: "region", width: 18 },\n    { header: "Area", key: "area", width: 18 },'))
edit('src/reporting/renderers/daily-surveillance-csv.renderer.ts',lambda s:s.replace('Branch Code,Branch Name,Region,','Branch Code,Branch Name,Zone,Region,Area,').replace('          escapeCsv(b.region || "Unassigned"),','          escapeCsv(b.zone || ""),\n          escapeCsv(b.region || ""),\n          escapeCsv(b.area || ""),'))

def studio(s):
 s=s.replace('import { AppLayout }', 'import { ReportPagination } from "@/components/reports/report-pagination";\nimport { AppLayout }')
 s=s.replace('type Filters={region?', 'type Filters={zone?:string;area?:string;region?')
 pos=s.index('export default function');sub=s[pos:]
 sub=sub.replace('  const[filters,setFilters]=useState<Filters>({});','''  const[filters,setFilters]=useState<Filters>({});
  const[scope,setScope]=useState<{zones:string[];regions:string[];areas:string[];branches:Array<{id:string;name:string}>}>({zones:[],regions:[],areas:[],branches:[]});
  const[historyPage,setHistoryPage]=useState(1);
  const[historyPageSize,setHistoryPageSize]=useState(25);
  const[schedulePage,setSchedulePage]=useState(1);
  const[schedulePageSize,setSchedulePageSize]=useState(10);
  useEffect(()=>{
    let active=true;
    const params=new URLSearchParams();
    for(const [key,value] of Object.entries({zone:filters.zone,region:filters.region,area:filters.area})) if(value) params.set(key,value);
    fetch(`/api/control/v1/reports/mis/hierarchy?${params}`,{headers:getReportAuthHeaders(),credentials:'include',cache:'no-store'}).then(async response=>{if(!response.ok)throw new Error('Unable to load organization scope');return response.json();}).then(data=>{if(active)setScope(data);}).catch(cause=>{if(active)setError(cause.message);});
    return()=>{active=false;};
  },[filters.zone,filters.region,filters.area]);''')
 s=s[:pos]+sub
 s=s.replace('          <Filter label="Region" value={filters.region} set={(value)=>setFilters({...filters,region:value})}/>\n          <Filter label="Branch ID" value={filters.branchId} set={(value)=>setFilters({...filters,branchId:value})}/>', '''          {(['zone','region','area'] as const).map(key=><label className="text-sm" key={key}>{key.charAt(0).toUpperCase()+key.slice(1)}<select aria-label={`Report ${key}`} className="input w-full mt-1" value={filters[key]??''} onChange={event=>setFilters({...filters,[key]:event.target.value,branchId:undefined,...(key==='zone'?{region:undefined,area:undefined}:key==='region'?{area:undefined}:{})})}><option value="">All</option>{scope[`${key}s`].map(value=><option key={value}>{value}</option>)}</select></label>)}
          <label className="text-sm">Branch<select aria-label="Report branch" className="input w-full mt-1" value={filters.branchId??''} onChange={event=>setFilters({...filters,branchId:event.target.value})}><option value="">All branches</option>{scope.branches.map(branch=><option value={branch.id} key={branch.id}>{branch.name}</option>)}</select></label>''')
 s=s.replace('scope[`${key}s`]','scope[key === "zone" ? "zones" : key === "region" ? "regions" : "areas"]')
 s=s.replace('schedules.map((schedule)', 'schedules.slice((schedulePage-1)*schedulePageSize,schedulePage*schedulePageSize).map((schedule)')
 s=s.replace('runs.map((run)', 'runs.slice((historyPage-1)*historyPageSize,historyPage*historyPageSize).map((run)')
 s=s.replace('        <h2 className="text-lg font-semibold mb-3">Saved schedules</h2>', '        <h2 className="text-lg font-semibold mb-3">Saved schedules</h2>\n        <ReportPagination total={schedules.length} page={schedulePage} pageSize={schedulePageSize} onPage={setSchedulePage} onPageSize={setSchedulePageSize}/>')
 s=s.replace('      <h2 className="text-lg font-semibold mb-3">Run history</h2>', '      <h2 className="text-lg font-semibold mb-3">Run history</h2>\n      <ReportPagination total={runs.length} page={historyPage} pageSize={historyPageSize} onPage={setHistoryPage} onPageSize={setHistoryPageSize}/>')
 return s
edit('dashboard/app/reports/page.tsx',studio)

def benchmarking(s):
 s=s.replace("import { AppLayout }", "import { ReportPagination } from '@/components/reports/report-pagination';\nimport { downloadReportCsv } from '@/lib/report-export';\nimport { AppLayout }")
 s=s.replace('export default function BranchBenchmarkingPage() {','export default function BranchBenchmarkingPage() {\n  const [page,setPage]=useState(1);\n  const [pageSize,setPageSize]=useState(25);')
 s=s.replace('data.branches.map((branch) => (','data.branches.slice((page-1)*pageSize,page*pageSize).map((branch) => (')
 s=s.replace('            </table>', '''            </table>
            <ReportPagination total={data.branches.length} page={page} pageSize={pageSize} onPage={setPage} onPageSize={setPageSize}/>
            <button className="btn-secondary m-4" onClick={()=>downloadReportCsv(data.branches.map(branch=>({Branch:branch.branch,Rank:branch.rank,...branch.scores,...branch.metrics,Status:branch.status})), 'branch-benchmarking.csv')}>Export all branches (CSV)</button>''')
 return s
edit('dashboard/app/reports/benchmarking/page.tsx',benchmarking)
def financial(s):
 s=s.replace("import { AppLayout }", "import { downloadReportCsv } from '@/lib/report-export';\nimport { AppLayout }")
 s=s.replace('    alert(`Export to ${format.toUpperCase()} will be available soon`);','''    if(format === 'pdf') { window.print(); return; }
    if(tcoData) downloadReportCsv(tcoData.branches, 'financial-branch-costs.csv');''')
 s=s.replace('<Download size={16} /> Export PDF','<Download size={16} /> Print / PDF')
 # Explicit full branch CSV in the toolbar; retain top-10 visualization.
 s=s.replace('              <button onClick={() => exportReport(\'pdf\')}', '              <button className="btn-secondary" onClick={()=>void exportReport(\'excel\')}>Export branch costs (CSV)</button>\n              <button onClick={() => exportReport(\'pdf\')}')
 return s
edit('dashboard/app/reports/financial/page.tsx',financial)
