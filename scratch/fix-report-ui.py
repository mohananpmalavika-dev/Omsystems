from pathlib import Path
def edit(name,fn):
    p=Path(name);old=p.read_text(encoding='utf-8');new=fn(old);assert old!=new,name;p.write_text(new,encoding='utf-8',newline='\n')

def alerts(s):
    s=s.replace('useMemo, useCallback','useMemo, useCallback, useRef')
    s='''import { ReportPagination } from "@/components/reports/report-pagination";
import { downloadReportCsv } from "@/lib/report-export";
import { reportDayBounds, reportLocalDate } from "../../../..//packages/contracts/src/report-hierarchy";
'''.replace('../../../..//','../../../../')+s
    # Keep the directive first.
    s=s.replace('"use client";\n','');s='"use client";\n'+s
    s=s.replace('  const [alerts, setAlerts]', '''  const [startDay, setStartDay] = useState("");
  const [endDay, setEndDay] = useState("");
  const [period, setPeriod] = useState<{from?:string;to?:string}>({});
  const alertRequest = useRef(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [alerts, setAlerts]''')
    start=s.index('      let res = await fetch("/v1/analytics/alerts?limit=200",')
    end=s.index('\n    } catch (err: any)',start)
    s=s[:start]+'''      const requestId = ++alertRequest.current;
      const cutoff = period.to || new Date().toISOString();
      const all: AnalyticsAlert[] = [];
      for (let offset = 0; ; offset += 200) {
        const params = new URLSearchParams({ limit: '200', offset: String(offset), to: cutoff });
        if (period.from) params.set('from', period.from);
        let res = await fetch(`/v1/analytics/alerts?${params}`, { headers, cache: 'no-store', credentials: 'include' });
        if (!res.ok && (res.status === 401 || res.status === 404)) res = await fetch(`/api/control/v1/analytics/alerts?${params}`, { headers, cache: 'no-store', credentials: 'include' });
        if (!res.ok) throw new Error(`Failed to load alerts: HTTP ${res.status}`);
        const body = await res.json();
        if (requestId !== alertRequest.current) return;
        const batch = (body.data ?? []) as AnalyticsAlert[];
        all.push(...batch);
        if (batch.length < 200) break;
      }
      setAlerts([...new Map(all.map(alert => [alert.id, alert])).values()]);
      setSummary(null);
''' +s[end:]
    s=s.replace('  }, []);\n\n  useEffect(() => {\n    loadAlerts();','  }, [period]);\n\n  useEffect(() => {\n    loadAlerts();',1)
    s=s.replace('setInterval(loadAlerts, 12000)','setInterval(loadAlerts, 60000)')
    for field,fun in [('branchName','normalizeBranch'),('zoneName','normalizeZone'),('regionName','normalizeRegion'),('areaName','normalizeArea')]:
        s=s.replace(f'      if (a.{field}) set.add(a.{field});\n      set.add({fun}(a));',f'      const label = {fun}(a);\n      if (label) set.add(label);')
    s=s.replace('      if (dateFilter !== "all"', '''      if (period.from && new Date(alert.lastDetectedAt || alert.createdAt).getTime() < Date.parse(period.from)) return false;
      if (period.to && new Date(alert.lastDetectedAt || alert.createdAt).getTime() > Date.parse(period.to)) return false;
      if (dateFilter !== "all"''')
    # Add period dependency to filtering.
    pos=s.index('  const filteredAlerts = useMemo(');end=s.index('  const stats = useMemo(',pos)
    block=s[pos:end].replace('[alerts,','[period, alerts,')
    s=s[:pos]+block+s[end:]
    s=s.replace('    if (!isFiltered && summary) {\n      return summary;\n    }','')
    s=s.replace('const total = isFiltered ? target.length : (summary?.total ?? target.length);','const total = target.length;')
    s=s.replace('    const target = isFiltered ? filteredAlerts : alerts;','    const target = filteredAlerts;')
    # Add date range and export toolbar ahead of page header.
    s=s.replace('        <PageHero', '''        <section className="card flex flex-wrap items-end gap-3" aria-label="Report date range">
          <label className="text-xs">From date (IST)<input aria-label="Report start date" type="date" className="input block mt-1" value={startDay} onChange={event => setStartDay(event.target.value)}/></label>
          <label className="text-xs">To date (IST)<input aria-label="Report end date" type="date" className="input block mt-1" value={endDay} min={startDay} onChange={event => setEndDay(event.target.value)}/></label>
          <button className="btn-primary" onClick={() => { try { setPeriod(reportDayBounds(startDay,endDay)); setDateFilter('all'); setPage(1); } catch(cause) { setError(cause instanceof Error ? cause.message : 'Select valid dates'); } }}>Generate report</button>
          <button className="btn-secondary" onClick={() => { const today = reportLocalDate(new Date()); setStartDay(today); setEndDay(today); setPeriod(reportDayBounds(today,today)); setDateFilter('all'); }}>Today</button>
          <button className="btn-secondary" onClick={() => {setPeriod({});setStartDay('');setEndDay('');setDateFilter('all');}}>All dates</button>
          <button className="btn-secondary" disabled={loading || !filteredAlerts.length} onClick={() => downloadReportCsv(filteredAlerts.map(alert => ({Zone:normalizeZone(alert),Region:normalizeRegion(alert),Area:normalizeArea(alert),Branch:normalizeBranch(alert),Camera:alert.cameraName || alert.cameraId,Alert:alert.title,Severity:alert.severity,Status:alert.status,DateIST:normalizeAlertDate(alert),FirstDetected:alert.firstDetectedAt,LastDetected:alert.lastDetectedAt,Incident:alert.incidentNumber || alert.incidentId || ''})), 'alerts-report.csv')}>Export all filtered rows</button>
          <span className="text-xs text-slate-500">{period.from ? `${startDay} to ${endDay} · IST` : 'All recorded dates · IST'}</span>
        </section>
        <PageHero''',1)
    s=s.replace('                    filteredAlerts.map((alert) => {','                    filteredAlerts.slice((Math.min(page,Math.max(1,Math.ceil(filteredAlerts.length/pageSize)))-1)*pageSize,Math.min(page,Math.max(1,Math.ceil(filteredAlerts.length/pageSize)))*pageSize).map((alert) => {')
    pos=s.index('                Showing {filteredAlerts.length}')
    start=s.rfind('            <div',0,pos);end=s.index('</div>',pos)+len('</div>')
    s=s[:start]+'''            <ReportPagination total={filteredAlerts.length} page={page} pageSize={pageSize} onPage={setPage} onPageSize={setPageSize}/>'''+s[end:]
    # Reset page only on filter changes, not polling refresh.
    s=s.replace('  // Summary counts -', '''  useEffect(() => setPage(1), [branchFilter, zoneFilter, regionFilter, areaFilter, alertTypeFilter, dateFilter, severityFilter, statusFilter, conversionFilter, quickFilter, searchQuery, period]);
  // Summary counts -''')
    return s
edit('dashboard/app/analytics/alerts/page.tsx',alerts)

def mis(s):
    s=s.replace('import { FieldVisual }', '''import { ReportPagination } from "@/components/reports/report-pagination";
import { ExecutiveManagementReport } from "@/components/reports/executive-management-report";
import { downloadReportCsv } from "@/lib/report-export";
import { FieldVisual }''')
    s=s.replace('type TimeRange = "today" | "7d" | "30d" | "90d";', 'type TimeRange = "today" | "7d" | "30d" | "90d" | "custom";')
    s=s.replace('  const [groupBy, setGroupBy]', '''  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [openingPage, setOpeningPage] = useState(1);
  const [openingPageSize, setOpeningPageSize] = useState(25);
  const misRequest = useRef(0);
  const [groupBy, setGroupBy]''')
    s=s.replace('    try {\n      setLoading(true);\n      const params = new URLSearchParams({ timeRange, groupBy });', '''    const requestId = ++misRequest.current;
    if (timeRange === 'custom' && (!startDate || !endDate || startDate > endDate)) { setError('Select valid start and end dates.'); setData(null); setLoading(false); return; }
    try {
      setLoading(true);
      const params = new URLSearchParams({ timeRange, groupBy });
      if (timeRange === 'custom') { params.set('startDate',startDate); params.set('endDate',endDate); }''')
    s=s.replace('      setData(json);','      if (requestId !== misRequest.current) return;\n      setData(json);')
    s=s.replace('      setData(null);\n      setError(err instanceof Error', '      if (requestId !== misRequest.current) return;\n      setData(null);\n      setError(err instanceof Error')
    s=s.replace('      setLoading(false);\n    }\n  }, [timeRange,', '      if (requestId === misRequest.current) setLoading(false);\n    }\n  }, [startDate, endDate, timeRange,')
    s=s.replace('  useEffect(() => {\n    fetchMisData();', '''  useEffect(() => { setPage(1); setOpeningPage(1); }, [timeRange,startDate,endDate,groupBy,selectedOrg,selectedZone,selectedRegion,selectedArea,selectedBranch,openingRange,openingStartDate,openingEndDate]);
  useEffect(() => {
    fetchMisData();''')
    start=s.index('    const csvContent = "data:text/csv;');end=s.index('\n  };',start)
    s=s[:start]+'''    downloadReportCsv(data.matrix.map((row: any, index: number) => Object.fromEntries(headers.map((header: string, col: number) => [header, rows[index][col]]))), `MIS_${groupBy}_${timeRange}.csv`, headers);'''+s[end:]
    s=s.replace('(["today", "7d", "30d", "90d"] as TimeRange[])','(["today", "7d", "30d", "90d", "custom"] as TimeRange[])')
    s=s.replace('tr === "30d" ? "30 Days" : "90 Days"','tr === "30d" ? "30 Days" : tr === "90d" ? "90 Days" : "Date / range"')
    s=s.replace('            {/* Refresh */}', '''            {activeTab !== 'branch-opening' && timeRange === 'custom' && <div className="flex flex-wrap gap-2">
              <label className="text-xs">From (IST)<input aria-label="MIS start date" type="date" className="input block" value={startDate} onChange={event=>setStartDate(event.target.value)}/></label>
              <label className="text-xs">To (IST)<input aria-label="MIS end date" type="date" className="input block" value={endDate} min={startDate} onChange={event=>setEndDate(event.target.value)}/></label>
              <button className="btn-primary" onClick={()=>void fetchMisData()}>Generate report</button>
            </div>}
            {/* Refresh */}''')
    s=s.replace('        {/* Executive Summary Scorecards */}', '''        {activeTab === 'all-in-one' && data && !loading && <ExecutiveManagementReport branches={data.branchMatrix || []} trend={data.dateWiseBreakdown || []} period={`${data.metadata?.startDate ? new Date(data.metadata.startDate).toLocaleDateString('en-IN',{timeZone:'Asia/Kolkata'}) : ''} – ${data.metadata?.endDate ? new Date(data.metadata.endDate).toLocaleDateString('en-IN',{timeZone:'Asia/Kolkata'}) : ''}`} onBranch={id=>{setSelectedBranch(id);setGroupBy('branch');}}/>}
        {/* Executive Summary Scorecards */}''')
    s=s.replace('data.matrix.map((row: any, idx: number)', 'data.matrix.slice((Math.min(page,Math.max(1,Math.ceil(data.matrix.length/pageSize)))-1)*pageSize,Math.min(page,Math.max(1,Math.ceil(data.matrix.length/pageSize)))*pageSize).map((row: any, idx: number)')
    pos=s.index('data.matrix.slice(');end=s.index('</table>',pos)+len('</table>')
    s=s[:end]+'''\n                <ReportPagination total={data?.matrix?.length || 0} page={page} pageSize={pageSize} onPage={setPage} onPageSize={setPageSize}/>'''+s[end:]
    s=s.replace('openingReport.rows.map((row)', 'openingReport.rows.slice((Math.min(openingPage,Math.max(1,Math.ceil(openingReport.rows.length/openingPageSize)))-1)*openingPageSize,Math.min(openingPage,Math.max(1,Math.ceil(openingReport.rows.length/openingPageSize)))*openingPageSize).map((row)')
    pos=s.index('openingReport.rows.slice(');end=s.index('</table>',pos)+len('</table>')
    s=s[:end]+'''\n              <ReportPagination total={openingReport.rows.length} page={openingPage} pageSize={openingPageSize} onPage={setOpeningPage} onPageSize={setOpeningPageSize}/>'''+s[end:]
    # Skip nonexistent levels in branch ancestry cells.
    s=s.replace('{row.area ?? "-"} / {row.region ?? "-"}', '{[row.zone,row.region,row.area].filter(Boolean).join(" / ") || "Direct branch"}')
    s=s.replace('Total Alerts','Incident cases').replace('total alerts','incident cases').replace('Average Uptime','Camera availability now').replace('Retention (Days)','Configured retention (Days)')
    return s
edit('dashboard/app/reports/mis/page.tsx',mis)
