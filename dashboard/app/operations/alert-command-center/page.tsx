"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Clock3, ExternalLink, Radio, Siren, UserCheck } from "lucide-react";
import type { LiveSessionResponse } from "@/lib/types";
import {
  dashboardEvidenceUrl,
  evidenceAvailable,
  hasManagedEvidence,
  type AlertEvidenceCaptureStatus,
  type CommandAlert,
} from "@/lib/alert-command-center";
import { HlsPlayer } from "@/components/hls-player";
import { startLiveFromBrowser } from "@/lib/live-client";

export default function AlertCommandCenterPage() {
  const [alerts, setAlerts] = useState<CommandAlert[]>([]);
  const [severity, setSeverity] = useState("");
  const [selected, setSelected] = useState<CommandAlert>();
  const [connected, setConnected] = useState(false);
  const [session, setSession] = useState<LiveSessionResponse>();
  const [busy, setBusy] = useState(false);
  const [, tick] = useState(0);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ limit: "200" });
    if (severity) params.set("severity", severity);
    const response = await fetch(`/api/control/v1/alerts/command-center?${params}`, {
      cache: "no-store",
      credentials: "include",
    });
    if (!response.ok) return;
    const body = await response.json();
    const next = (body.data ?? []) as CommandAlert[];
    setAlerts(next);
  }, [severity]);

  useEffect(() => { void load(); const timer = setInterval(load, 30_000); return () => clearInterval(timer); }, [load]);
  useEffect(() => { const timer = setInterval(() => tick((value) => value + 1), 1_000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    const events = new EventSource("/api/control/v1/alerts/events", { withCredentials: true });
    events.addEventListener("ready", () => setConnected(true));
    for (const type of ["alert.created", "alert.updated", "notification.updated"]) events.addEventListener(type, () => void load());
    events.onerror = () => setConnected(false);
    return () => events.close();
  }, [load]);

  const counts = useMemo(() => Object.fromEntries(["P1", "P2", "P3", "P4"].map((priority) =>
    [priority, alerts.filter((alert) => alert.severity === priority && !terminal(alert.status)).length])), [alerts]);

  const act = async (alert: CommandAlert, action: "acknowledge" | "escalate" | "assign") => {
    setBusy(true);
    try {
      const endpoint = action === "assign" ? `/api/control/v1/alerts/${alert.id}/assign`
        : `/api/control/v1/analytics/alerts/${alert.id}/${action}`;
      const payload = action === "assign"
        ? { assignedTo: "self", expectedVersion: alert.version }
        : { expectedVersion: alert.version, notes: action === "acknowledge" ? "Acknowledged in HO command center" : "Escalated in HO command center" };
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
      });
      if (response.status === 409) { await load(); return; }
      if (!response.ok) throw new Error("alert_action_failed");
      await load();
    } finally { setBusy(false); }
  };

  const startLive = async (alert: CommandAlert) => {
    setBusy(true);
    try {
      setSession(await startLiveFromBrowser(alert.cameraId, "sub"));
    } finally { setBusy(false); }
  };

  return <main className="p-6 space-y-5">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-xs font-semibold tracking-widest text-red-700">HO SURVEILLANCE ROOM</p><h1 className="text-2xl font-bold">Real-time alert command center</h1><p className="text-sm text-gray-500">{connected ? "Live event stream connected" : "Polling fallback active"}</p></div>
      <span className="rounded-lg border bg-white px-3 py-2 text-xs text-gray-600">Global popup queue active</span>
    </header>
    <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {(["P1", "P2", "P3", "P4"] as const).map((priority) => <button key={priority} onClick={() => setSeverity(severity === priority ? "" : priority)} className={`card text-left border-l-4 ${priority === "P1" ? "border-l-red-600" : priority === "P2" ? "border-l-orange-500" : priority === "P3" ? "border-l-blue-500" : "border-l-gray-500"}`}><span className="text-xs text-gray-500">{priority}</span><strong className="block text-2xl">{counts[priority]}</strong><span className="text-xs">active alerts</span></button>)}
    </section>
    <section className="grid xl:grid-cols-[1.2fr_.8fr] gap-5">
      <div className="card overflow-auto">
        <table className="w-full text-sm"><thead><tr className="text-left border-b"><th>Priority</th><th>Branch / camera</th><th>Alert</th><th>SLA</th><th>Status</th></tr></thead><tbody>
          {alerts.map((alert) => <tr key={alert.id} onClick={() => { setSelected(alert); setSession(undefined); }} className={`border-b cursor-pointer hover:bg-gray-50 ${selected?.id === alert.id ? "bg-blue-50" : ""}`}><td><Priority value={alert.severity}/></td><td className="py-3"><strong>{alert.branchName}</strong><small className="block text-gray-500">{alert.cameraName}</small></td><td>{alert.title}<small className="block text-gray-500">{new Date(alert.lastDetectedAt).toLocaleString()}</small></td><td><Sla alert={alert}/></td><td>{alert.status.replaceAll("_", " ")}</td></tr>)}
        </tbody></table>{alerts.length === 0 && <p className="p-8 text-center text-gray-500">No matching alerts.</p>}
      </div>
      <AlertDetail alert={selected} session={session} busy={busy} startLive={startLive} act={act}/>
    </section>
  </main>;
}

function AlertDetail({ alert, session, busy, startLive, act }: { alert?: CommandAlert; session?: LiveSessionResponse; busy: boolean; startLive: (alert: CommandAlert) => void; act: (alert: CommandAlert, action: "acknowledge" | "escalate" | "assign") => void }) {
  const [evidenceStatus, setEvidenceStatus] = useState<AlertEvidenceCaptureStatus>();
  useEffect(() => {
    setEvidenceStatus(undefined);
    if (!alert || !hasManagedEvidence(alert)) return;
    let stopped = false;
    let timer: number | undefined;
    const refresh = async () => {
      try {
        const response = await fetch(`/api/control/v1/alerts/${alert.id}/evidence/status`, {
          cache: "no-store", credentials: "include",
        });
        if (!response.ok) throw new Error("evidence_status_unavailable");
        const status = await response.json() as AlertEvidenceCaptureStatus;
        if (stopped) return;
        setEvidenceStatus(status);
        if (status.state === "queued" || status.state === "capturing") {
          timer = window.setTimeout(refresh, 1_000);
        }
      } catch {
        if (!stopped) timer = window.setTimeout(refresh, 2_500);
      }
    };
    void refresh();
    return () => { stopped = true; if (timer) window.clearTimeout(timer); };
  }, [alert]);
  if (!alert) return <aside className="card grid place-items-center text-gray-500 min-h-72">Select an alert to inspect it.</aside>;
  const snapshotReady = evidenceAvailable(alert, "snapshot", evidenceStatus);
  const clipReady = evidenceAvailable(alert, "clip", evidenceStatus);
  const snapshotUrl = alert.snapshotReference ? dashboardEvidenceUrl(alert.snapshotReference) : undefined;
  const clipUrl = alert.clipReference ? dashboardEvidenceUrl(alert.clipReference) : undefined;
  return <aside className="card space-y-4">
    <div className="flex justify-between"><div><Priority value={alert.severity}/><h2 className="text-xl font-bold mt-2">{alert.title}</h2><p>{alert.branchName} / {alert.cameraName}</p></div><Sla alert={alert}/></div>
    <p className="text-sm text-gray-600">{alert.description}</p>
    <div className="aspect-video bg-gray-950 rounded-lg grid place-items-center overflow-hidden">
      {session?.hls ? <HlsPlayer url={session.hls.url} bearerToken={session.hls.bearerToken} cameraName={alert.cameraName}/>
        : snapshotReady && snapshotUrl ? <img src={snapshotUrl} alt="Alert snapshot" className="w-full h-full object-contain"/>
        : <button className="text-white flex gap-2" disabled={busy} onClick={() => void startLive(alert)}><Radio/>Open live video</button>}
    </div>
    <div className="flex flex-wrap gap-2">
      {!terminal(alert.status) && <><button disabled={busy} className="btn-primary flex gap-1" onClick={() => void act(alert, "acknowledge")}><Check size={15}/>Acknowledge</button><button disabled={busy} className="btn-secondary flex gap-1" onClick={() => void act(alert, "assign")}><UserCheck size={15}/>Assign to me</button><button disabled={busy} className="btn-secondary flex gap-1" onClick={() => void act(alert, "escalate")}><Siren size={15}/>Escalate</button></>}
      {!session && <button className="btn-secondary flex gap-1" onClick={() => void startLive(alert)}><Radio size={15}/>Live</button>}
      {snapshotReady && snapshotUrl && <a className="btn-secondary flex gap-1" href={snapshotUrl} target="_blank" rel="noreferrer"><ExternalLink size={15}/>Snapshot</a>}
      {clipReady && clipUrl && <a className="btn-secondary flex gap-1" href={clipUrl} target="_blank" rel="noreferrer"><ExternalLink size={15}/>Video clip</a>}
    </div>
    <div><h3 className="font-semibold text-sm mb-2">Notification audit</h3><div className="flex flex-wrap gap-2">{alert.deliveries.map((delivery) => <span key={delivery.id} title={delivery.lastError} className="text-xs px-2 py-1 rounded bg-gray-100">{delivery.channel}: {delivery.status} ({delivery.attempts})</span>)}</div></div>
  </aside>;
}

function Priority({ value }: { value: string }) { return <span className={`inline-flex rounded px-2 py-1 text-xs font-bold ${value === "P1" ? "bg-red-100 text-red-800" : value === "P2" ? "bg-orange-100 text-orange-800" : value === "P3" ? "bg-blue-100 text-blue-800" : "bg-gray-100 text-gray-700"}`}>{value}</span>; }
function Sla({ alert }: { alert: CommandAlert }) { if (!alert.slaDueAt || terminal(alert.status)) return <span className="text-xs text-gray-500">No active SLA</span>; const seconds = Math.floor((Date.parse(alert.slaDueAt) - Date.now()) / 1000); return <span className={`text-xs font-semibold flex gap-1 ${seconds < 0 ? "text-red-700" : "text-gray-700"}`}><Clock3 size={13}/>{seconds < 0 ? `Overdue ${format(-seconds)}` : format(seconds)}</span>; }
function format(seconds: number) { const minutes = Math.floor(seconds / 60); return `${minutes}m ${seconds % 60}s`; }
function terminal(status: string) { return ["resolved", "false_alarm", "suppressed"].includes(status); }
