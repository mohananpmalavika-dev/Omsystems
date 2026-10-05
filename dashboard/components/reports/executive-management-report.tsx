"use client";

import { useMemo, useId, type CSSProperties } from 'react';
import { ResponsiveContainer, BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell } from 'recharts';
import { Download } from 'lucide-react';
import { downloadReportCsv } from '@/lib/report-export';
import styles from './management-report.module.css';

export type ExecutiveBranchRow = { branchId?: string; dimension: string; zone?: string; region?: string; area?: string; organization?: string; totalCameras: number; onlineCameras: number; p1Threats: number; totalAlerts: number; slaPercent: number | null; retentionDays: number | null; footfall?: number | null };
type Props = { branches: ExecutiveBranchRow[]; trend: Array<{dimension:string;alerts:number;p1Threats:number}>; period: string; onBranch: (id: string) => void };
const tick = { fill: '#7b8ba4', fontSize: 10 };

export function ExecutiveManagementReport({ branches, trend, period, onBranch }: Props) {
  const gradient = useId().replaceAll(':','');
  const total = branches.reduce((sum,row) => sum + row.totalCameras,0);
  const online = branches.reduce((sum,row) => sum + row.onlineCameras,0);
  const p1 = branches.reduce((sum,row) => sum + row.p1Threats,0);
  const incidents = branches.reduce((sum,row) => sum + row.totalAlerts,0);
  const gaps = Math.max(0,total-online);
  const needsAttention = branches.filter(row => row.p1Threats > 0 || row.onlineCameras < row.totalCameras || !row.totalCameras);
  const risk = useMemo(() => [...branches].sort((a,b) => b.p1Threats-a.p1Threats || (b.totalCameras-b.onlineCameras)-(a.totalCameras-a.onlineCameras)).slice(0,10),[branches]);
  const coverage = [{name:'Online cameras',value:online,color:'#10b981'},{name:'Other camera states',value:gaps,color:'#ef476f'}];
  return <section className={styles.dashboard} aria-label="Executive management overview">
    <header className={styles.heading}><div><div className={styles.eyebrow}>Executive overview / organization intelligence</div><h2>Your estate, at a glance.</h2><p>{period} · IST · {branches.length} branches in scope</p></div><div className={styles.actions}><button disabled={!branches.length} onClick={() => downloadReportCsv(branches, 'management-branch-scorecard.csv')}><Download size={14}/>Export all branch scorecards</button></div></header>
    <div className={styles.kpis}>{[
      ['Branches',branches.length,'#1664dc','Selected organization scope'], ['Camera availability',total ? `${Math.round(online/total*100)}%` : '—','#0ba687',`${online} online / ${total} cameras now`],
      ['Coverage gaps',gaps,'#ef476f','Camera states other than online'], ['Incident cases',incidents,'#8b5cf6','Detected in the report period'],
      ['Open P1 cases',p1,'#f59e0b','Unresolved critical incidents'], ['Attention required',needsAttention.length,'#dd4ab5','Branches needing review'],
    ].map(([label,value,color,note]) => <div key={String(label)} className={styles.kpi} style={{'--accent':color} as CSSProperties}><span>{label}</span><strong>{value}</strong><small>{note}</small></div>)}</div>
    <p className={styles.notice}>Incident and activity charts use the selected date range. Camera availability and configured retention show the current snapshot. Missing hierarchy levels are skipped; missing measurements remain unavailable.</p>
    <div className={styles.grid}>
      <article className={styles.panel}><h3>Incident trend & critical case load</h3><p>Date-wise incident detections in IST</p>{trend.length ? <div className={styles.chart}><ResponsiveContainer width="100%" height="100%"><AreaChart data={trend} margin={{left:-20,right:15,top:10}}><defs><linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#8b5cf6" stopOpacity={.35}/><stop offset="100%" stopColor="#8b5cf6" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="#9aabc8" strokeDasharray="3 4" opacity={.2}/><XAxis dataKey="dimension" tick={tick} tickFormatter={value=>String(value).slice(5)}/><YAxis tick={tick} allowDecimals={false}/><Tooltip/><Legend/><Area isAnimationActive={false} type="monotone" dataKey="alerts" name="Incident cases" stroke="#8b5cf6" strokeWidth={3} fill={`url(#${gradient})`}/><Area isAnimationActive={false} type="monotone" dataKey="p1Threats" name="P1 cases" stroke="#ef476f" strokeWidth={2} fill="#ef476f" fillOpacity={.08}/></AreaChart></ResponsiveContainer></div> : <div className={styles.empty}>No recorded incident detections for this period.</div>}</article>
      <article className={styles.panel}><h3>Camera coverage</h3><p>Current availability across all selected branches</p>{total ? <div className={styles.chart}><ResponsiveContainer width="100%" height="100%"><PieChart><Pie isAnimationActive={false} data={coverage.filter(row=>row.value)} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="80%" paddingAngle={4}>{coverage.filter(row=>row.value).map(row=><Cell key={row.name} fill={row.color}/>)}</Pie><Tooltip/><Legend/></PieChart></ResponsiveContainer></div> : <div className={styles.empty}>No camera inventory in this scope.</div>}</article>
    </div>
    <div className={styles.grid}>
      <article className={styles.panel}><h3>Priority branch comparison</h3><p>Top 10 by open P1 cases and camera gaps · click a branch to drill down</p>{risk.length ? <div className={styles.chart}><ResponsiveContainer width="100%" height="100%"><BarChart data={risk.map(row=>({...row,gaps:Math.max(0,row.totalCameras-row.onlineCameras)}))} margin={{left:-20,right:12,bottom:22}}><CartesianGrid stroke="#9aabc8" strokeDasharray="3 4" opacity={.2}/><XAxis dataKey="dimension" tick={tick} angle={-16} textAnchor="end" interval={0} tickFormatter={value=>String(value).length>17?String(value).slice(0,15)+'…':String(value)}/><YAxis tick={tick} allowDecimals={false}/><Tooltip/><Legend/><Bar isAnimationActive={false} dataKey="p1Threats" name="Open P1 cases" fill="#ef476f" radius={[5,5,0,0]} onClick={row=>{ const item = row.payload as ExecutiveBranchRow; if(item.branchId) onBranch(item.branchId); }}/><Bar isAnimationActive={false} dataKey="gaps" name="Camera coverage gaps" fill="#ffae24" radius={[5,5,0,0]} onClick={row=>{ const item = row.payload as ExecutiveBranchRow; if(item.branchId) onBranch(item.branchId); }}/></BarChart></ResponsiveContainer></div> : <div className={styles.empty}>No branches match this scope.</div>}</article>
      <article className={styles.panel}><h3>Management action list</h3><p>Review critical incidents and incomplete camera coverage</p>{needsAttention.length ? risk.filter(row=>needsAttention.includes(row)).slice(0,6).map(row=><div className={styles.attention} key={row.branchId || row.dimension}><div><button onClick={()=>row.branchId&&onBranch(row.branchId)}>{row.dimension}</button><p style={{margin:'4px 0 0'}}>{[row.organization,row.zone,row.region,row.area].filter(Boolean).join(' / ') || 'Direct branch'}</p></div><strong>{row.p1Threats>0?`${row.p1Threats} open P1`:!row.totalCameras?'No cameras':`${row.totalCameras-row.onlineCameras} camera gaps`}</strong></div>) : <div className={styles.empty}>No open P1 cases or camera coverage gaps in this scope.</div>}</article>
    </div>
  </section>;
}
