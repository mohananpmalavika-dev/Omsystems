from pathlib import Path
def edit(name,fn):
 p=Path(name);old=p.read_text(encoding='utf-8');new=fn(old);assert old!=new,name;p.write_text(new,encoding='utf-8',newline='\n')
def compliance(s):
 s=s.replace("import { AppLayout }", "import { ReportPagination } from '@/components/reports/report-pagination';\nimport { downloadReportCsv } from '@/lib/report-export';\nimport { AppLayout }")
 s=s.replace('  const [range,setRange]', '  const [gapPage,setGapPage]=useState(1),[gapSize,setGapSize]=useState(10);\n  const [actionPage,setActionPage]=useState(1),[actionSize,setActionSize]=useState(10);\n  const [range,setRange]')
 s=s.replace('data.gaps.map((gap, idx)', 'data.gaps.slice((Math.min(gapPage,Math.max(1,Math.ceil(data.gaps.length/gapSize)))-1)*gapSize,Math.min(gapPage,Math.max(1,Math.ceil(data.gaps.length/gapSize)))*gapSize).map((gap, idx)')
 s=s.replace('data.remediationActions.map((action, idx)', 'data.remediationActions.slice((Math.min(actionPage,Math.max(1,Math.ceil(data.remediationActions.length/actionSize)))-1)*actionSize,Math.min(actionPage,Math.max(1,Math.ceil(data.remediationActions.length/actionSize)))*actionSize).map((action, idx)')
 s=s.replace('            <div className="space-y-3">\n              {data.gaps', '            <ReportPagination total={data.gaps.length} page={gapPage} pageSize={gapSize} onPage={setGapPage} onPageSize={setGapSize}/>\n            <div className="space-y-3">\n              {data.gaps')
 s=s.replace('            <div className="space-y-4">\n              {data.remediationActions', '            <ReportPagination total={data.remediationActions.length} page={actionPage} pageSize={actionSize} onPage={setActionPage} onPageSize={setActionSize}/>\n            <div className="space-y-4">\n              {data.remediationActions')
 s=s.replace('<ReportDateControls range={range} onGenerate={setRange}/>', '''<ReportDateControls range={range} onGenerate={setRange}/>
          <div className="flex flex-wrap gap-2 print:hidden"><button className="btn-secondary" onClick={()=>downloadReportCsv(Object.entries(data.domains).flatMap(([domain,value])=>value.checks.map(check=>({Domain:domain,Requirement:check.requirement,Regulation:check.regulation,Status:check.status,Score:check.score,Findings:check.findings.join('; ')}))), 'compliance-checks.csv')}>Export all compliance checks (CSV)</button><button className="btn-secondary" onClick={()=>window.print()}>Print / PDF</button></div>''')
 return s
edit('dashboard/app/reports/compliance/page.tsx',compliance)
def financial(s):
 s=s.replace("import { AppLayout }", "import { ReportPagination } from '@/components/reports/report-pagination';\nimport { AppLayout }")
 s=s.replace('  const [range,setRange]', '  const [page,setPage]=useState(1),[pageSize,setPageSize]=useState(10);\n  const [range,setRange]')
 s=s.replace('tcoData.branches.slice(0, 10)', 'tcoData.branches.slice((Math.min(page,Math.max(1,Math.ceil(tcoData.branches.length/pageSize)))-1)*pageSize,Math.min(page,Math.max(1,Math.ceil(tcoData.branches.length/pageSize)))*pageSize)')
 s=s.replace('                <div className="space-y-2">\n                  {tcoData.branches', '                <ReportPagination total={tcoData.branches.length} page={page} pageSize={pageSize} onPage={setPage} onPageSize={setPageSize}/>\n                <div className="space-y-2">\n                  {tcoData.branches')
 s=s.replace('Math.max(...tcoData.branches.map(b => b.totalCost))','Math.max(1,...tcoData.branches.map(b => b.totalCost))')
 return s
edit('dashboard/app/reports/financial/page.tsx',financial)
