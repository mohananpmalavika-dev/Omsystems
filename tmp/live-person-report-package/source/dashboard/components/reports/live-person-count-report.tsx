"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Building2, Camera, CameraOff, Clock3, Pause, Play, RefreshCw, Users } from "lucide-react";
import { AppLayout } from "@/components/app-layout";
import { reportsApi } from "@/lib/api-client";
import type { LivePersonCountReport } from "../../../packages/contracts/src/live-person-count";
import styles from "./live-person-count-report.module.css";

const formatTime = (value: string | null) => value ? new Date(value).toLocaleString("en-IN", {
  timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true,
}) + " IST" : "—";

export function LivePersonCountReportView() {
  const [report, setReport] = useState<LivePersonCountReport | null>(null);
  const [catalog, setCatalog] = useState<LivePersonCountReport["filters"] | null>(null);
  const [zoneId, setZoneId] = useState(""), [regionId, setRegionId] = useState(""), [branchId, setBranchId] = useState("");
  const [groupBy, setGroupBy] = useState<"branch" | "region" | "zone">("branch");
  const [running, setRunning] = useState(true), [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    let active = true, busy = false;
    setReport(null); setLoading(true);
    async function load() {
      if (busy || document.hidden) return;
      busy = true;
      try {
        const next = await reportsApi.getLivePersonCount({zoneId,regionId,branchId,groupBy});
        if (active) { setReport(next); setCatalog(next.filters); setError(""); setNow(Date.now()); }
      } catch (cause) {
        if (active) { setReport(null); setError(cause instanceof Error ? cause.message : "Live counts are unavailable. Please retry."); }
      } finally { busy = false; if (active) setLoading(false); }
    }
    void load();
    const onVisible = () => { if (running && !document.hidden) void load(); };
    document.addEventListener("visibilitychange", onVisible);
    const timer = running ? setInterval(() => void load(), 60_000) : undefined;
    return () => { active = false; clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [zoneId,regionId,branchId,groupBy,running,refresh]);
  const expired = Boolean(report && now - Date.parse(report.reportTime) > report.freshnessSeconds * 1000);
  const rowExpired = (row: LivePersonCountReport["rows"][number]) => expired || Boolean(row.oldestObservationAt && now - Date.parse(row.oldestObservationAt) > 90_000);
  const liveRows = report?.rows.filter(row => !rowExpired(row) && row.personCount !== null) ?? [];
  const personCount = liveRows.length ? liveRows.reduce((sum,row) => sum + row.personCount!,0) : null;
  const regions = catalog?.regions.filter(region => !zoneId || region.zoneId === zoneId) ?? [];
  const branches = catalog?.branches.filter(branch => (!zoneId || branch.zoneId === zoneId) && (!regionId || branch.regionId === regionId)) ?? [];
  return <AppLayout><main className={styles.page}>
    <header className={styles.heading}>
      <div><p className={styles.eyebrow}>LIVE REPORT / PEOPLE</p><h1>Live person count</h1><p>See how many people cameras observe in each branch right now.</p></div>
      <Link href="/control-room" className={styles.link}>Open Live Wall ↗</Link>
    </header>
    <section className={styles.toolbar} aria-label="Report controls">
      <span className={styles.state}><i className={running && !error && !expired ? styles.liveDot : styles.pausedDot} />{error ? "Connection unavailable" : expired ? "Report needs refresh" : running ? "Refreshing every minute" : "Refresh paused"}</span>
      <div><button onClick={() => setRunning(!running)}>{running ? <Pause size={15}/> : <Play size={15}/>} {running ? "Pause" : "Resume"}</button><button onClick={() => setRefresh(refresh + 1)} disabled={loading}><RefreshCw size={15}/> Refresh now</button></div>
    </section>
    <section className={styles.metrics} aria-label="Live report summary">
      <Metric icon={<Users size={19}/>} label="Total person count *" value={personCount ?? "—"} detail={report && liveRows.reduce((sum,row) => sum + row.reportingCameras,0) < report.summary.totalCameras ? "Partial camera coverage" : "Camera estimate"}/>
      <Metric icon={<Building2 size={19}/>} label="Branches" value={report?.summary.branches ?? "—"} detail="In selected scope"/>
      <Metric icon={<Camera size={19}/>} label="Total cameras" value={report?.summary.totalCameras ?? "—"} detail={report ? `${liveRows.reduce((sum,row) => sum + row.reportingCameras,0)} reporting now` : "Waiting for data"}/>
      <Metric icon={<Camera size={19}/>} label="Cameras online" value={expired ? "—" : report?.summary.onlineCameras ?? "—"} detail={expired ? "Refresh to update status" : "Includes degraded connections"}/>
      <Metric icon={<CameraOff size={19}/>} label="Cameras not working" value={expired ? "—" : report?.summary.notWorkingCameras ?? "—"} detail={expired ? "Refresh to update status" : "Offline or unknown status"}/>
      <Metric icon={<Clock3 size={19}/>} label="Report time" value={formatTime(report?.reportTime ?? null)} detail="Asia/Kolkata"/>
    </section>
    <section className={styles.filters} aria-label="Person count filters">
      <Select label="Zone" value={zoneId} options={catalog?.zones ?? []} onChange={value => {setZoneId(value);setRegionId("");setBranchId("");}}/>
      <Select label="Region" value={regionId} options={regions} onChange={value => {setRegionId(value);setBranchId("");}}/>
      <Select label="Branch" value={branchId} options={branches} onChange={setBranchId}/>
      <label>Group by<select aria-label="Group by" value={groupBy} onChange={event => setGroupBy(event.target.value as typeof groupBy)}><option value="branch">Branch</option><option value="region">Region</option><option value="zone">Zone</option></select></label>
      <button onClick={() => {setZoneId("");setRegionId("");setBranchId("");setGroupBy("branch");}}>Clear filters</button>
    </section>
    {error && <div className={styles.error} role="alert">{error}</div>}
    <section className={styles.tableSection} aria-label="Live person counts">
      <div className={styles.tableHeading}><h2>{groupBy === "branch" ? "Branch-wise" : groupBy === "region" ? "Region-wise" : "Zone-wise"} person count</h2><span>Report only · no counting alerts</span></div>
      <div className={styles.scroll}><table>
        <thead><tr><th>{groupBy === "branch" ? "Branch name" : groupBy === "region" ? "Region name" : "Zone name"}</th>{groupBy === "branch" && <th>Region</th>}{groupBy !== "zone" && <th>Zone</th>}<th>Total person count *</th><th>Report time</th><th>Total cameras</th><th>Cameras online</th><th>Cameras not working</th><th>Live coverage</th></tr></thead>
        <tbody>{report?.rows.map(row => <tr key={row.id}>
          <td><strong>{row.name}</strong></td>{groupBy === "branch" && <td>{row.regionName ?? "Unassigned"}</td>}{groupBy !== "zone" && <td>{row.zoneName ?? "Unassigned"}</td>}
          <td><strong className={styles.count}>{rowExpired(row) ? "—" : row.personCount ?? "—"}</strong>{!rowExpired(row) && row.coverage === "partial" && <small>Partial</small>}</td>
          <td>{formatTime(row.reportTime)}<small>Last observation: {formatTime(row.latestObservationAt)}</small></td>
          <td>{row.totalCameras}</td><td>{expired ? "—" : row.onlineCameras}</td><td>{expired ? "—" : row.notWorkingCameras}</td><td><span className={row.coverage === "complete" && !rowExpired(row) ? styles.complete : styles.incomplete}>{rowExpired(row) ? "Stale" : row.coverage === "unavailable" ? "Unavailable" : row.coverage === "partial" ? "Partial" : "Live"}</span><small>{rowExpired(row) ? 0 : row.reportingCameras} / {row.totalCameras} cameras</small></td>
        </tr>)}</tbody>
      </table></div>
      {loading && !report && <p className={styles.empty} role="status">Loading live counts…</p>}
      {!loading && !error && report?.rows.length === 0 && <p className={styles.empty}>No branches match these filters.</p>}
      {!loading && error && <p className={styles.empty}>Counts will appear when the live connection is available.</p>}
    </section>
    <p className={styles.note}><strong>* Branch totals will be estimates from camera views; overlapping views can count the same person more than once.</strong></p>
    <p className={styles.note}>Report refreshes every minute. Counts use each camera’s latest observation within 90 seconds, including zero people. “—” means no current count. New branch cameras appear automatically.</p>
    <p className={styles.note}>Camera status is checked at the report time. Online includes degraded connections. Not working includes cameras with offline or unknown status. Live coverage shows cameras supplying current person counts.</p>
  </main></AppLayout>;
}
function Metric({icon,label,value,detail}: {icon: React.ReactNode; label: string; value: string | number; detail: string}) {
  return <div className={styles.metric}><span>{icon}{label}</span><strong>{value}</strong><small>{detail}</small></div>;
}
function Select({label,value,options,onChange}: {label: string; value: string; options: Array<{id:string;name:string}>; onChange:(value:string)=>void}) {
  return <label>{label}<select aria-label={label} value={value} onChange={event => onChange(event.target.value)}><option value="">All {label.toLowerCase()}s</option>{options.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>;
}
