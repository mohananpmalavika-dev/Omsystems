"use client";

import { useMemo, useId, useState, type CSSProperties, type ReactNode } from 'react';
import { ResponsiveContainer, BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell, ReferenceLine } from 'recharts';
import { Download, Printer, ShieldAlert, Camera, Clock, HardDrive, ArrowUpRight, Search } from 'lucide-react';
import { downloadReportCsv } from '@/lib/report-export';
import { buildManagementWatchlist, managementExportRows, DEFAULT_REVIEW_TARGETS, type ExecutiveBranchRow, type WatchItem } from '@/lib/management-watchlist';
import styles from './management-report.module.css';

export type { ExecutiveBranchRow } from '@/lib/management-watchlist';
type Props = { branches: ExecutiveBranchRow[]; trend: Array<{dimension:string;alerts:number;p1Threats:number}>; period: string; generatedAt?: string; onBranch: (id: string) => void };
type Report = 'briefing' | 'coverage' | 'sla' | 'retention';
const tick = { fill: '#7b8ba4', fontSize: 11 };
const colors = { Critical: '#e44f67', Review: '#db961a', 'Data check': '#6475c6', Clear: '#0ba687' };
const fmt = (value: number | null, unit = '') => value === null ? 'Unavailable' : `${Number(value.toFixed(1))}${unit}`;
const shortName = (value: unknown) => String(value).length > 18 ? `${String(value).slice(0,16)}…` : String(value);

function Panel({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return <article className={styles.panel}><h3>{title}</h3><p>{note}</p>{children}</article>;
}
function Distribution({ data }: { data: Array<{ name: string; value: number; color: string }> }) {
  const present = data.filter(row => row.value > 0);
  return present.length ? <div className={styles.chart}><ResponsiveContainer width="100%" height="100%"><PieChart><Pie isAnimationActive={false} data={present} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="80%" paddingAngle={3}>{present.map(row => <Cell key={row.name} fill={row.color}/>)}</Pie><Tooltip/><Legend/></PieChart></ResponsiveContainer></div> : <div className={styles.empty}>No data in this scope.</div>;
}
function BranchChart({ rows, metric, name, color, target, unit = '' }: { rows: WatchItem[]; metric: 'availability' | 'slaPercent' | 'retentionDays'; name: string; color: string; target?: number; unit?: string }) {
  return rows.length ? <div className={styles.chart}><ResponsiveContainer width="100%" height="100%"><BarChart data={rows} layout="vertical" margin={{left:0,right:26,top:10,bottom:5}}><CartesianGrid stroke="#9aabc8" strokeDasharray="3 4" opacity={.2}/><XAxis type="number" tick={tick} domain={metric === 'retentionDays' ? [0,'auto'] : [0,100]} unit={unit}/><YAxis type="category" dataKey="dimension" width={115} tick={tick} tickFormatter={shortName}/><Tooltip/><Bar isAnimationActive={false} dataKey={metric} name={name} fill={color} radius={[0,4,4,0]}/>{target !== undefined && <ReferenceLine ifOverflow="extendDomain" x={target} stroke="#db961a" strokeDasharray="5 4" label={{value:`Target ${target}${unit}`,position:'insideTopRight',fill:'#b4770f',fontSize:10}}/>}</BarChart></ResponsiveContainer></div> : <div className={styles.empty}>No available measurements for this report.</div>;
}

export function ExecutiveManagementReport({ branches, trend, period, generatedAt, onBranch }: Props) {
  const gradient = useId().replaceAll(':','');
  const [report, setReport] = useState<Report>('briefing');
  const [targets, setTargets] = useState(DEFAULT_REVIEW_TARGETS);
  const [query, setQuery] = useState('');
  const [priority, setPriority] = useState('all');
  const [page, setPage] = useState(1);
  const items = useMemo(() => buildManagementWatchlist(branches, targets), [branches, targets]);
  const total = branches.reduce((sum,row) => sum + row.totalCameras,0);
  const online = branches.reduce((sum,row) => sum + row.onlineCameras,0);
  const p1 = branches.reduce((sum,row) => sum + row.p1Threats,0);
  const incidents = branches.reduce((sum,row) => sum + row.totalAlerts,0);
  const gaps = Math.max(0,total-online);
  const count = (status: WatchItem['priority']) => items.filter(row=>row.priority === status).length;
  const availableSla = items.filter(row=>row.slaPercent !== null);
  const availableRetention = items.filter(row=>row.retentionDays !== null);
  const slaBelow = availableSla.filter(row=>row.slaPercent! < targets.sla).length;
  const retentionBelow = availableRetention.filter(row=>row.retentionDays! < targets.retention).length;
  const filtered = items.filter(row => (priority === 'all' || row.priority === priority) && [row.dimension,row.organization,row.zone,row.region,row.area].some(value => value?.toLowerCase().includes(query.toLowerCase())));
  const pages = Math.max(1,Math.ceil(filtered.length / 10));
  const currentPage = Math.min(page,pages);
  const visible = filtered.slice((currentPage-1)*10,currentPage*10);
  const reports = [
    { id:'briefing', title:'Daily briefing', note:'Incidents & must-watch branches', icon:ShieldAlert },
    { id:'coverage', title:'Camera coverage', note:'Availability & blind spots', icon:Camera },
    { id:'sla', title:'Incident response', note:'P1 service performance', icon:Clock },
    { id:'retention', title:'Retention review', note:'Configuration & data gaps', icon:HardDrive },
  ] as const;

  return <section className={styles.dashboard} aria-label="Executive management overview">
    <header className={styles.heading}>
      <div><div className={styles.eyebrow}>Management intelligence / priority reports</div><h2>See the risk. Decide the next move.</h2><p>{period} · IST · {branches.length} branches in scope</p>{generatedAt && <p>Updated {new Date(generatedAt).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})} IST</p>}</div>
      <div className={styles.actions}><button disabled={!items.length} onClick={() => downloadReportCsv(managementExportRows(items,period,targets,generatedAt), 'management-branch-scorecards.csv')}><Download size={14}/>Export scorecards</button><button onClick={()=>window.print()}><Printer size={14}/>Print page</button></div>
    </header>

    <div className={styles.kpis}>{[
      ['Camera availability',total ? fmt(online/total*100,'%') : '—','#0ba687',`${online} online / ${total} cameras now`],
      ['Coverage gaps',gaps,'#e44f67','Cameras currently not online'],
      ['Incident cases',incidents,'#6875df','Detected in the selected period'],
      ['Open P1 cases',p1,'#e44f67','Unresolved cases detected in period'],
      ['Action required',count('Critical') + count('Review'),'#db961a','Branches with measured exceptions'],
      ['Data checks',count('Data check'),'#6475c6','Branches with data gaps only'],
    ].map(([label,value,color,note]) => <div key={String(label)} className={styles.kpi} style={{'--accent':color} as CSSProperties}><span>{label}</span><strong>{value}</strong><small>{note}</small></div>)}</div>

    <nav className={styles.reportCards} aria-label="Management reports">{reports.map(({id,title,note,icon:Icon})=><button key={id} aria-pressed={report===id} onClick={()=>setReport(id)}><Icon size={20}/><span><strong>{title}</strong><small>{note}</small></span><ArrowUpRight size={16}/></button>)}</nav>

    <p className={styles.notice}>Incidents use the selected period; camera availability and average configured retention are current snapshots. Open P1 counts exclude cases detected before this period. Review targets below are management benchmarks. Configured retention does not verify playable recordings or policy compliance.</p>
    <div className={styles.benchmarks}><span>Review benchmarks</span><label>P1 SLA<select aria-label="P1 SLA review target" value={targets.sla} onChange={event=>{setTargets({...targets,sla:Number(event.target.value)});setPage(1);}}>{[90,95,98,100].map(value=><option key={value} value={value}>{value}%</option>)}</select></label><label>Configured retention<select aria-label="Configured retention review target" value={targets.retention} onChange={event=>{setTargets({...targets,retention:Number(event.target.value)});setPage(1);}}>{[30,60,90,180,365].map(value=><option key={value} value={value}>{value} days</option>)}</select></label><small>Applies to this view and its CSV exports.</small></div>

    {report === 'briefing' && <div className={styles.grid}>
      <Panel title="Incident trend & critical case load" note="Daily detections in IST · includes resolved P1 cases">
        {trend.length ? <div className={styles.chart}><ResponsiveContainer width="100%" height="100%"><AreaChart data={trend} margin={{left:-20,right:15,top:10}}><defs><linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6875df" stopOpacity={.3}/><stop offset="100%" stopColor="#6875df" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="#9aabc8" strokeDasharray="3 4" opacity={.2}/><XAxis dataKey="dimension" tick={tick} tickFormatter={value=>String(value).slice(5)}/><YAxis tick={tick} allowDecimals={false}/><Tooltip/><Legend/><Area isAnimationActive={false} type="monotone" dataKey="alerts" name="Incident cases" stroke="#6875df" strokeWidth={3} fill={`url(#${gradient})`}/><Area isAnimationActive={false} type="monotone" dataKey="p1Threats" name="P1 detections" stroke="#e44f67" strokeWidth={2} fill="#e44f67" fillOpacity={.06}/></AreaChart></ResponsiveContainer></div> : <div className={styles.empty}>No recorded incident detections for this period.</div>}
      </Panel>
      <Panel title="Where management attention is needed" note="Each branch appears once, at its highest priority">
        <Distribution data={(Object.keys(colors) as WatchItem['priority'][]).map(name=>({name,value:count(name),color:colors[name]}))}/>
      </Panel>
    </div>}

    {report === 'coverage' && <div className={styles.grid}>
      <Panel title="Lowest camera availability" note="Up to 10 branches with camera inventory · current online percentage"><BranchChart rows={items.filter(row=>row.availability!==null).sort((a,b)=>a.availability!-b.availability!).slice(0,10)} metric="availability" name="Online cameras (%)" unit="%" color="#0ba687"/></Panel>
      <Panel title="Camera coverage across the estate" note={`${items.filter(row=>!row.totalCameras).length} branches have no camera inventory`}><Distribution data={[{name:'Online cameras',value:online,color:'#0ba687'},{name:'Other camera states',value:gaps,color:'#e44f67'}]}/></Panel>
    </div>}

    {report === 'sla' && <div className={styles.grid}>
      <Panel title="P1 response performance by branch" note="Up to 10 lowest reported SLA values · uses the selected incident period"><BranchChart rows={[...availableSla].sort((a,b)=>a.slaPercent!-b.slaPercent!).slice(0,10)} metric="slaPercent" name="Reported P1 SLA (%)" target={targets.sla} unit="%" color="#6875df"/></Panel>
      <Panel title="P1 SLA review coverage" note={`${availableSla.length} of ${items.length} branches have an available SLA value`}><Distribution data={[{name:'At / above benchmark',value:availableSla.length-slaBelow,color:'#0ba687'},{name:'Below benchmark',value:slaBelow,color:'#e44f67'},{name:'Unavailable / no eligible cases',value:items.length-availableSla.length,color:'#94a3b8'}]}/><p>Reported SLA counts P1 cases acknowledged within 5 minutes or marked resolved / closed. It does not prove every resolved case met the acknowledgment deadline.</p></Panel>
    </div>}

    {report === 'retention' && <div className={styles.grid}>
      <Panel title="Lowest configured retention by branch" note="Up to 10 lowest branch averages · days configured on cameras"><BranchChart rows={[...availableRetention].sort((a,b)=>a.retentionDays!-b.retentionDays!).slice(0,10)} metric="retentionDays" name="Average configured retention (days)" target={targets.retention} unit="d" color="#168db8"/></Panel>
      <Panel title="Retention configuration review" note={`${availableRetention.length} of ${items.length} branches have an available configuration`}><Distribution data={[{name:'At / above benchmark',value:availableRetention.length-retentionBelow,color:'#0ba687'},{name:'Below benchmark',value:retentionBelow,color:'#db961a'},{name:'Configuration unavailable',value:items.length-availableRetention.length,color:'#94a3b8'}]}/><p>A branch average can hide individual camera shortfalls. Verify per-camera policy and actual recording history before an audit.</p></Panel>
    </div>}

    <article className={styles.panel}>
      <div className={styles.watchHeading}><div><div className={styles.eyebrow}>Must-watch / management action register</div><h3>Every exception, with a next step.</h3><p>Critical: open P1 or all cameras not online. Review: camera gaps or a measured benchmark shortfall. Data check: missing inventory or measurements only.</p></div><div className={styles.actions}><button disabled={!filtered.length} onClick={()=>downloadReportCsv(managementExportRows(filtered,period,targets,generatedAt),'management-action-register.csv')}><Download size={14}/>Export {filtered.length} rows</button></div></div>
      <div className={styles.watchFilters}><label><Search size={15}/><input aria-label="Search management branches" placeholder="Search branch or hierarchy…" value={query} onChange={event=>{setQuery(event.target.value);setPage(1);}}/></label><select aria-label="Filter management priority" value={priority} onChange={event=>{setPriority(event.target.value);setPage(1);}}><option value="all">All priorities ({items.length})</option>{(Object.keys(colors) as WatchItem['priority'][]).map(value=><option key={value} value={value}>{value} ({count(value)})</option>)}</select></div>
      <div className={styles.tableWrap}><table className={styles.table}><caption className={styles.srOnly}>Branch action register, ranked by priority, open P1 cases and camera gaps</caption><thead><tr><th>Branch / hierarchy</th><th>Priority</th><th>Coverage now</th><th>P1 / incidents</th><th>P1 SLA</th><th>Retention config.</th><th>Findings & next step</th></tr></thead><tbody>{visible.map(row=><tr key={row.branchId || row.dimension}><td>{row.branchId ? <button onClick={()=>onBranch(row.branchId!)}>{row.dimension} <ArrowUpRight size={12}/></button> : row.dimension}<small>{[row.organization,row.zone,row.region,row.area].filter(Boolean).join(' / ') || 'Direct branch'}</small></td><td><span className={styles.priority} style={{'--accent':colors[row.priority]} as CSSProperties}>{row.priority}</span></td><td>{row.onlineCameras} / {row.totalCameras}<small>{fmt(row.availability,'%')}</small></td><td>{row.p1Threats} / {row.totalAlerts}<small>Open P1 / all cases</small></td><td>{fmt(row.slaPercent,'%')}</td><td>{fmt(row.retentionDays,'d')}<small>Branch average</small></td><td className={styles.findings}>{row.reasons.length ? <span>{row.reasons.join(' · ')}</span> : <span>No exceptions against review benchmarks</span>}<small>{row.action}</small></td></tr>)}{!visible.length && <tr><td colSpan={7}><div className={styles.empty}>{items.length ? 'No branches match these filters.' : 'No branches in the selected scope.'}</div></td></tr>}</tbody></table></div>
      <div className={styles.pagination}><span>{filtered.length ? `${(currentPage-1)*10+1}–${Math.min(currentPage*10,filtered.length)}` : '0'} of {filtered.length} branches</span><div><button aria-label="Previous management page" disabled={currentPage===1} onClick={()=>setPage(currentPage-1)}>Previous</button><span>{currentPage} / {pages}</span><button aria-label="Next management page" disabled={currentPage===pages} onClick={()=>setPage(currentPage+1)}>Next</button></div></div>
    </article>
  </section>;
}
