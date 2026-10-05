from pathlib import Path
def edit(name,fn):
 p=Path(name);old=p.read_text(encoding='utf-8');new=fn(old);assert old!=new,name;p.write_text(new,encoding='utf-8',newline='\n')

def financial(s):
 s=s.replace("import { Router,", "import { reportCalendarPeriod } from '../../../packages/contracts/src/report-hierarchy.js';\nimport { Router,")
 start=s.index('      const now = new Date();');end=s.index('\n      // Capital Expenditure',start)
 s=s[:start]+'''      let bounds;
      try { bounds = reportCalendarPeriod(period, req.query.startDate, req.query.endDate); }
      catch(error) { return res.status(400).json({error:error instanceof Error ? error.message : 'Invalid report dates'}); }
      const startDate = new Date(bounds.from);
      const endDate = new Date(bounds.to);
'''+s[end:]
 return s
edit('src/routes/reports/financial-tco.routes.ts',financial)
def benchmarking(s):
 s=s.replace("import { Router,", "import { reportCalendarPeriod } from '../../../packages/contracts/src/report-hierarchy.js';\nimport { Router,")
 s=s.replace('      const { start, end } = getPeriodDates(period);','''      let bounds;
      try { bounds = reportCalendarPeriod(period, req.query.startDate, req.query.endDate); }
      catch(error) { return res.status(400).json({error:error instanceof Error ? error.message : 'Invalid report dates'}); }
      const start = new Date(bounds.from), end = new Date(bounds.to);''')
 return s
edit('src/routes/reports/branch-benchmarking.routes.ts',benchmarking)
def compliance(s):
 s=s.replace("import { Router,", "import { reportCalendarPeriod } from '../../../packages/contracts/src/report-hierarchy.js';\nimport { Router,")
 s=s.replace('      const now = new Date();\n      const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);','''      let bounds;
      try { bounds = reportCalendarPeriod('30d', req.query.startDate, req.query.endDate); }
      catch(error) { return res.status(400).json({error:error instanceof Error ? error.message : 'Invalid report dates'}); }
      const now = new Date(bounds.to), last30Days = new Date(bounds.from);''',1)
 return s
edit('src/routes/reports/compliance-scorecard.routes.ts',compliance)

for page in ['benchmarking','financial','compliance']:
 def update(s):
  s=s.replace("import { AppLayout }", "import { ReportDateControls, type ReportDateRange } from '@/components/reports/report-date-controls';\nimport { AppLayout }")
  pos=s.index('export default function');brace=s.index('{',pos)
  s=s[:brace+1]+"\n  const [range,setRange]=useState<ReportDateRange>({});"+s[brace+1:]
  s=s.replace('  const loadData = async () => {', '  const loadData = async () => {\n    const dateParams = new URLSearchParams(range).toString();')
  if page=='benchmarking': s=s.replace('period=${period}&metric=${metric}`','period=${period}&metric=${metric}&${dateParams}`').replace('[period, metric]','[period, metric, range]')
  if page=='financial': s=s.replace('tco?period=${period}`','tco?period=${period}&${dateParams}`').replace('[period]','[period, range]')
  if page=='compliance': s=s.replace("fetch('/api/control/v1/reports/compliance-scorecard',",'fetch(`/api/control/v1/reports/compliance-scorecard?${dateParams}`,').replace('  }, []);','  }, [range]);',1)
  # Insert inside the successful report content, keeping loading and errors intact.
  pos=s.index('  return (',s.index('  if (loading)'))
  # There are earlier loading/error returns; use last AppLayout wrapper in the main return.
  pos=s.rfind('    <AppLayout>')
  if pos<0:pos=s.rfind('      <AppLayout>')
  # Insert the date controls just after the main page header / title section.
  anchor=s.find('<PageHero',pos)
  if anchor!=-1:
   # Place before header, directly inside page's content container.
   s=s[:anchor]+"<ReportDateControls range={range} onGenerate={setRange}/>\n          "+s[anchor:]
  else:
   anchor=s.index('<div',pos)
   close=s.index('>',anchor)+1
   s=s[:close]+"\n          <ReportDateControls range={range} onGenerate={setRange}/>"+s[close:]
  return s
 edit(f'dashboard/app/reports/{page}/page.tsx',update)

def live(s):
 s=s.replace('import Link', 'import { ReportPagination } from "./report-pagination";\nimport { downloadReportCsv } from "@/lib/report-export";\nimport Link')
 s=s.replace('  const [report, setReport]', '  const [page,setPage]=useState(1);\n  const [pageSize,setPageSize]=useState(25);\n  useEffect(()=>setPage(1),[zoneId,regionId,branchId,groupBy]);\n  const [report, setReport]')
 # Move effect after declared filter state to avoid temporal-dead-zone dependencies.
 s=s.replace('  useEffect(()=>setPage(1),[zoneId,regionId,branchId,groupBy]);\n','')
 s=s.replace('  const [running, setRunning]', '  useEffect(()=>setPage(1),[zoneId,regionId,branchId,groupBy]);\n  const [running, setRunning]')
 s=s.replace('<div><button onClick={() => setRunning', '''<div><button disabled={!report || loading} onClick={()=>report && downloadReportCsv(report.rows.map(row=>({Name:row.name,Zone:row.zoneName??'',Region:row.regionName??'',PersonEstimate:rowExpired(row)?null:row.personCount,ReportTime:row.reportTime,Cameras:row.totalCameras,Online:expired?null:row.onlineCameras,NotWorking:expired?null:row.notWorkingCameras,Coverage:rowExpired(row)?'Stale':row.coverage})), 'live-person-count-snapshot.csv')}>Export all rows (CSV)</button><button onClick={() => setRunning''')
 s=s.replace('report?.rows.map(row =>', 'report?.rows.slice((Math.min(page,Math.max(1,Math.ceil(report.rows.length/pageSize)))-1)*pageSize,Math.min(page,Math.max(1,Math.ceil(report.rows.length/pageSize)))*pageSize).map(row =>')
 s=s.replace('      </table></div>', '      </table></div>\n      <ReportPagination total={report?.rows.length??0} page={page} pageSize={pageSize} onPage={setPage} onPageSize={setPageSize}/>')
 return s
edit('dashboard/components/reports/live-person-count-report.tsx',live)
