"use client";

import { useMemo, useState, useEffect, useId, type CSSProperties } from 'react';
import { ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { Download, Printer, RotateCcw } from 'lucide-react';
import type { AnalyticsAlert } from '@/lib/types';
import { buildAlertReport, normalizeZone, normalizeRegion, normalizeArea, normalizeBranch, normalizeAlertType, normalizeAlertDate, alertIsActive } from '@/lib/alert-report';
import { downloadReportCsv } from '@/lib/report-export';
import { ReportPagination } from '@/components/reports/report-pagination';
import styles from '@/components/reports/management-report.module.css';

export type GraphicalDimensionTab = 'all' | 'zone' | 'region' | 'area' | 'branch' | 'alert_type' | 'date' | 'timeline';
type Props = {
  alerts: AnalyticsAlert[]; selectedZone?: string; selectedRegion?: string; selectedArea?: string; selectedBranch?: string; selectedAlertType?: string; selectedDate?: string;
  onSelectZone?: (value: string) => void; onSelectRegion?: (value: string) => void; onSelectArea?: (value: string) => void;
  onSelectBranch?: (value: string) => void; onSelectAlertType?: (value: string) => void; onSelectDate?: (value: string) => void; onResetFilters?: () => void;
};
const colors = ['#ef476f', '#ffae24', '#8b5cf6', '#22b8ed', '#94a3b8'];
const tick = { fill: '#7b8ba4', fontSize: 10 };

export function AlertsGraphicalAnalytics(props: Props) {
  const { alerts } = props;
  const gradient = useId().replaceAll(':', '');
  const [dimension, setDimension] = useState<GraphicalDimensionTab>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  useEffect(() => setPage(1), [dimension]);
  const group = dimension === 'all' || dimension === 'timeline' ? 'branch' : dimension;
  const rows = useMemo(() => buildAlertReport(alerts, group), [alerts, group]);
  const daily = useMemo(() => buildAlertReport(alerts.filter(alert => normalizeAlertDate(alert)), 'date'), [alerts]);
  const severity = colors.map((color, index) => ({ name: `P${index + 1}`, value: alerts.filter(alert => alert.severity === `P${index + 1}`).length, color }));
  const stats = {
    active: alerts.filter(alertIsActive).length,
    critical: alerts.filter(alert => ['P1', 'P2'].includes(alert.severity) && alertIsActive(alert)).length,
    converted: alerts.filter(alert => alert.incidentId || alert.incidentNumber).length,
    falseAlarms: alerts.filter(alert => alert.status === 'false_alarm').length,
    breached: rows.reduce((sum, row) => sum + row.slaBreached, 0),
  };
  const missing = alerts.filter(alert => !alert.zoneName && !alert.regionName && !alert.areaName).length;
  const branchRisk = useMemo(() => buildAlertReport(alerts, 'branch').sort((a, b) => b.critical - a.critical || b.active - a.active), [alerts]);
  const select = (name: string) => {
    const actions = { branch: props.onSelectBranch, zone: props.onSelectZone, region: props.onSelectRegion, area: props.onSelectArea, alert_type: props.onSelectAlertType, date: props.onSelectDate };
    // Direct branches shown in a missing level drill into branch scope.
    const isDirectBranch = ['zone', 'region', 'area'].includes(group) && alerts.some(alert => normalizeBranch(alert) === name && !(group === 'zone' ? normalizeZone(alert) : group === 'region' ? normalizeRegion(alert) : normalizeArea(alert)));
    (isDirectBranch ? props.onSelectBranch : actions[group])?.(name);
  };
  const exportAlerts = () => downloadReportCsv(alerts.map(alert => ({
    'Alert ID': alert.id, 'Zone': normalizeZone(alert), 'Region': normalizeRegion(alert), 'Area': normalizeArea(alert), 'Branch': normalizeBranch(alert),
    'Camera': alert.cameraName || alert.cameraId, 'Alert type': normalizeAlertType(alert), 'Severity': alert.severity, 'Status': alert.status,
    'First detected': alert.firstDetectedAt, 'Last detected': alert.lastDetectedAt, 'Report date (IST)': normalizeAlertDate(alert),
    'Incident': alert.incidentNumber || alert.incidentId || '', 'Acknowledged': alert.acknowledgedAt || '', 'SLA due': alert.slaDueAt || '',
  })), 'alert-management-report.csv');

  return <section className={styles.dashboard} aria-label="Alert management analytics">
    <header className={styles.heading}>
      <div><div className={styles.eyebrow}>Management intelligence / alerts</div><h2>Risk. Response. Resolution.</h2><p>All filtered alerts · actual organization hierarchy · calendar dates in IST</p></div>
      <div className={styles.actions}><button disabled={!alerts.length} onClick={exportAlerts}><Download size={14}/>Export all alerts</button><button disabled={!rows.length} onClick={() => downloadReportCsv(rows, `alert-${group}-summary.csv`)}><Download size={14}/>Export summary</button><button onClick={() => window.print()}><Printer size={14}/>Print charts / PDF</button>{props.onResetFilters && <button onClick={props.onResetFilters}><RotateCcw size={14}/>Reset</button>}</div>
    </header>
    <div className={styles.kpis}>
      {[
        ['Total alerts', alerts.length, '#1664dc', 'Selected report scope'], ['Open alerts', stats.active, '#8b5cf6', 'Awaiting resolution'],
        ['Open P1 / P2', stats.critical, '#ef476f', 'Management attention'], ['Incident conversions', stats.converted, '#0ba687', 'Linked investigations'],
        ['False alarms', stats.falseAlarms, '#f59e0b', 'Detection quality review'], ['SLA breaches', stats.breached, '#dd4ab5', 'Acknowledgment overdue'],
      ].map(([label, value, color, note]) => <div key={String(label)} className={styles.kpi} style={{ '--accent': color } as CSSProperties}><span>{label}</span><strong>{Number(value).toLocaleString()}</strong><small>{note}</small></div>)}
    </div>
    <div className={styles.tabs} aria-label="Report dimension">
      {(['all', 'zone', 'region', 'area', 'branch', 'alert_type', 'date', 'timeline'] as const).map(value => <button key={value} aria-pressed={dimension === value} onClick={() => setDimension(value)}>{({all:'Management overview', zone:'Zone-wise', region:'Region-wise', area:'Area-wise', branch:'Branch-wise', alert_type:'Alert types', date:'Date-wise', timeline:'Daily trend'})[value]}</button>)}
    </div>
    {missing > 0 && <p className={styles.notice}>{missing} alerts belong to branches with no intermediate zone, region, or area. Those branches appear directly by their actual name.</p>}
    {!alerts.length ? <div className={styles.empty}>No alerts match this organization scope and date range.</div> : <>
      <div className={styles.grid}>
        <article className={styles.panel}><h3>Alert volume & critical risk by day</h3><p>Last detection date in IST · select a day to drill down</p><div className={styles.chart}>
          <ResponsiveContainer width="100%" height="100%"><AreaChart data={daily} margin={{left:-20,right:12,top:10}} onClick={state => { if (typeof state.activeLabel === 'string') props.onSelectDate?.(state.activeLabel); }}>
            <defs><linearGradient id={`${gradient}total`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#22b8ed" stopOpacity={.35}/><stop offset="100%" stopColor="#22b8ed" stopOpacity={0}/></linearGradient></defs>
            <CartesianGrid stroke="#9aabc8" strokeDasharray="3 4" opacity={.2}/><XAxis dataKey="name" tick={tick} tickFormatter={value => String(value).slice(5)}/><YAxis tick={tick} allowDecimals={false}/><Tooltip/><Legend/>
            <Area isAnimationActive={false} type="monotone" dataKey="total" name="Total alerts" stroke="#22b8ed" strokeWidth={3} fill={`url(#${gradient}total)`}/>
            <Area isAnimationActive={false} type="monotone" dataKey="critical" name="P1 / P2 alerts" stroke="#ef476f" strokeWidth={2} fill="#ef476f" fillOpacity={.08}/>
          </AreaChart></ResponsiveContainer>
        </div></article>
        <article className={styles.panel}><h3>Severity distribution</h3><p>Every severity is counted separately, including P5</p><div className={styles.chart}>
          <ResponsiveContainer width="100%" height="100%"><PieChart><Pie isAnimationActive={false} data={severity.filter(row => row.value)} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="80%" paddingAngle={3}>{severity.filter(row => row.value).map(row => <Cell key={row.name} fill={row.color}/>)}</Pie><Tooltip/><Legend/></PieChart></ResponsiveContainer>
        </div></article>
      </div>
      <div className={styles.grid}>
        <article className={styles.panel}><h3>{group === 'branch' ? 'Branch' : group.replace('_', ' ')} comparison</h3><p>Top 12 by alert volume · select a group to filter · full list and export below</p><div className={styles.chart}>
          <ResponsiveContainer width="100%" height="100%"><BarChart data={rows.slice(0,12)} margin={{left:-20,right:12,bottom:24}}><CartesianGrid stroke="#9aabc8" strokeDasharray="3 4" opacity={.2}/><XAxis dataKey="name" tick={tick} interval={0} angle={-16} textAnchor="end" tickFormatter={value => String(value).length > 18 ? String(value).slice(0,16)+'…' : String(value)}/><YAxis tick={tick} allowDecimals={false}/><Tooltip/><Legend/>
            <Bar isAnimationActive={false} dataKey="p1" name="P1" stackId="risk" fill={colors[0]} onClick={data => select(String((data.payload as {name: string}).name))}/><Bar isAnimationActive={false} dataKey="p2" name="P2" stackId="risk" fill={colors[1]} onClick={data => select(String((data.payload as {name: string}).name))}/><Bar isAnimationActive={false} dataKey="p3" name="P3" stackId="risk" fill={colors[2]} onClick={data => select(String((data.payload as {name: string}).name))}/><Bar isAnimationActive={false} dataKey="p4" name="P4" stackId="risk" fill={colors[3]} onClick={data => select(String((data.payload as {name: string}).name))}/><Bar isAnimationActive={false} dataKey="p5" name="P5" stackId="risk" fill={colors[4]} radius={[5,5,0,0]} onClick={data => select(String((data.payload as {name: string}).name))}/>
          </BarChart></ResponsiveContainer>
        </div></article>
        <article className={styles.panel}><h3>Priority branch watchlist</h3><p>Ranked by P1 / P2 volume, then open alerts · inspect underlying alerts</p>{branchRisk.slice(0,6).map(row => <div key={row.key} className={styles.attention}><button onClick={() => props.onSelectBranch?.(row.name)}>{row.name}</button><span><strong>{row.critical} P1/P2</strong> · {row.active} open</span></div>)}</article>
      </div>
      <article className={styles.panel}><h3>Management ledger · {group.replace('_', ' ')}</h3><p>Pagination changes only the visible rows. Export includes every filtered row.</p><div className={styles.tableWrap}><table className={styles.table}><thead><tr>{['Group','Total','Open','P1 / P2','Converted','Resolved','False alarms','SLA breaches'].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{rows.slice((Math.min(page,Math.max(1,Math.ceil(rows.length/pageSize)))-1)*pageSize,Math.min(page,Math.max(1,Math.ceil(rows.length/pageSize)))*pageSize).map(row => <tr key={row.key}><td><button onClick={() => select(row.name)}>{row.name}</button></td><td>{row.total}</td><td>{row.active}</td><td style={{color:'#ef476f'}}>{row.critical}</td><td>{row.converted}</td><td>{row.resolved}</td><td>{row.falseAlarms}</td><td>{row.slaBreached}</td></tr>)}</tbody></table></div><ReportPagination total={rows.length} page={page} pageSize={pageSize} onPage={setPage} onPageSize={setPageSize}/></article>
    </>}
  </section>;
}
