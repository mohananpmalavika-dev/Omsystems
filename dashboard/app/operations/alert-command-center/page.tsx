"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BellRing, Check, Clock3, ExternalLink, Radio, Siren, UserCheck, Volume2, VolumeX, X } from "lucide-react";
import type { AnalyticsAlert, LiveSessionResponse } from "@/lib/types";
import { HlsPlayer } from "@/components/hls-player";

type Delivery = {
  id: string; channel: "dashboard" | "sms" | "email" | "voice" | "log";
  recipient: string; status: string; attempts: number; providerId?: string; lastError?: string;
};
type CommandAlert = AnalyticsAlert & {
  branchId: string; branchName: string; cameraName: string; cameraStatus: string;
  detectionType: string; notificationChannels: string[]; deliveries: Delivery[];
};

export default function AlertCommandCenterPage() {
  const [alerts, setAlerts] = useState<CommandAlert[]>([]);
  const [severity, setSeverity] = useState("");
  const [selected, setSelected] = useState<CommandAlert>();
  const [popup, setPopup] = useState<CommandAlert>();
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [connected, setConnected] = useState(false);
  const [session, setSession] = useState<LiveSessionResponse>();
  const [busy, setBusy] = useState(false);
  const seen = useRef(new Set<string>());
  const [, tick] = useState(0);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ limit: "200" });
    if (severity) params.set("severity", severity);
    const response = await fetch(`/api/control/v1/alerts/command-center?${params}`, { cache: "no-store" });
    if (!response.ok) return;
    const body = await response.json();
    const next = (body.data ?? []) as CommandAlert[];
    setAlerts(next);
    const urgent = next.find((alert) => alert.status === "new" && ["P1", "P2"].includes(alert.severity) && !seen.current.has(alert.id));
    if (urgent) {
      seen.current.add(urgent.id); setPopup(urgent); setSelected(urgent);
      if (soundEnabled) sound(urgent.severity);
    }
  }, [severity, soundEnabled]);

  useEffect(() => { void load(); const timer = setInterval(load, 30_000); return () => clearInterval(timer); }, [load]);
  useEffect(() => { const timer = setInterval(() => tick((value) => value + 1), 1_000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    if (!popup || popup.severity !== "P1" || !soundEnabled) return;
    const timer = setInterval(() => sound("P1"), 10_000);
    return () => clearInterval(timer);
  }, [popup, soundEnabled]);
  useEffect(() => {
    const events = new EventSource("/api/control/v1/alerts/events");
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
      const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      if (response.status === 409) { await load(); return; }
      if (!response.ok) throw new Error("alert_action_failed");
      setPopup(undefined); await load();
    } finally { setBusy(false); }
  };

  const startLive = async (alert: CommandAlert) => {
    setBusy(true);
    try {
      const response = await fetch("/api/live", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cameraId: alert.cameraId, profile: "sub" }) });
      if (response.ok) setSession(await response.json());
    } finally { setBusy(false); }
  };

  return <main className="p-6 space-y-5">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-xs font-semibold tracking-widest text-red-700">HO SURVEILLANCE ROOM</p><h1 className="text-2xl font-bold">Real-time alert command center</h1><p className="text-sm text-gray-500">{connected ? "Live event stream connected" : "Polling fallback active"}</p></div>
      <button className="btn-secondary flex items-center gap-2" onClick={() => { setSoundEnabled((value) => !value); if (!soundEnabled) sound("P3"); }}>
        {soundEnabled ? <Volume2 size={16}/> : <VolumeX size={16}/>} {soundEnabled ? "Sound enabled" : "Enable alert sound"}
      </button>
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
    {popup && <div className="fixed inset-0 z-50 bg-black/60 grid place-items-center p-4" role="alertdialog" aria-modal="true">
      <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full border-t-8 border-red-600 p-5">
        <div className="flex justify-between"><div className="flex gap-2 items-center"><BellRing className="text-red-600"/><Priority value={popup.severity}/><strong>New priority alert</strong></div><button onClick={() => setPopup(undefined)}><X/></button></div>
        <AlertDetail alert={popup} session={session} busy={busy} startLive={startLive} act={act}/>
      </div>
    </div>}
  </main>;
}

function AlertDetail({ alert, session, busy, startLive, act }: { alert?: CommandAlert; session?: LiveSessionResponse; busy: boolean; startLive: (alert: CommandAlert) => void; act: (alert: CommandAlert, action: "acknowledge" | "escalate" | "assign") => void }) {
  if (!alert) return <aside className="card grid place-items-center text-gray-500 min-h-72">Select an alert to inspect it.</aside>;
  return <aside className="card space-y-4">
    <div className="flex justify-between"><div><Priority value={alert.severity}/><h2 className="text-xl font-bold mt-2">{alert.title}</h2><p>{alert.branchName} / {alert.cameraName}</p></div><Sla alert={alert}/></div>
    <p className="text-sm text-gray-600">{alert.description}</p>
    <div className="aspect-video bg-gray-950 rounded-lg grid place-items-center overflow-hidden">
      {session?.hls ? <HlsPlayer url={session.hls.url} bearerToken={session.hls.bearerToken} cameraName={alert.cameraName}/>
        : alert.snapshotReference ? <img src={alert.snapshotReference} alt="Alert snapshot" className="w-full h-full object-contain"/>
        : <button className="text-white flex gap-2" disabled={busy} onClick={() => void startLive(alert)}><Radio/>Open live video</button>}
    </div>
    <div className="flex flex-wrap gap-2">
      {!terminal(alert.status) && <><button disabled={busy} className="btn-primary flex gap-1" onClick={() => void act(alert, "acknowledge")}><Check size={15}/>Acknowledge</button><button disabled={busy} className="btn-secondary flex gap-1" onClick={() => void act(alert, "assign")}><UserCheck size={15}/>Assign to me</button><button disabled={busy} className="btn-secondary flex gap-1" onClick={() => void act(alert, "escalate")}><Siren size={15}/>Escalate</button></>}
      {!session && <button className="btn-secondary flex gap-1" onClick={() => void startLive(alert)}><Radio size={15}/>Live</button>}
      {alert.snapshotReference && <a className="btn-secondary flex gap-1" href={alert.snapshotReference} target="_blank" rel="noreferrer"><ExternalLink size={15}/>Snapshot</a>}
      {alert.clipReference && <a className="btn-secondary flex gap-1" href={alert.clipReference} target="_blank" rel="noreferrer"><ExternalLink size={15}/>Video clip</a>}
    </div>
    <div><h3 className="font-semibold text-sm mb-2">Notification audit</h3><div className="flex flex-wrap gap-2">{alert.deliveries.map((delivery) => <span key={delivery.id} title={delivery.lastError} className="text-xs px-2 py-1 rounded bg-gray-100">{delivery.channel}: {delivery.status} ({delivery.attempts})</span>)}</div></div>
  </aside>;
}

function Priority({ value }: { value: string }) { return <span className={`inline-flex rounded px-2 py-1 text-xs font-bold ${value === "P1" ? "bg-red-100 text-red-800" : value === "P2" ? "bg-orange-100 text-orange-800" : value === "P3" ? "bg-blue-100 text-blue-800" : "bg-gray-100 text-gray-700"}`}>{value}</span>; }
function Sla({ alert }: { alert: CommandAlert }) { if (!alert.slaDueAt || terminal(alert.status)) return <span className="text-xs text-gray-500">No active SLA</span>; const seconds = Math.floor((Date.parse(alert.slaDueAt) - Date.now()) / 1000); return <span className={`text-xs font-semibold flex gap-1 ${seconds < 0 ? "text-red-700" : "text-gray-700"}`}><Clock3 size={13}/>{seconds < 0 ? `Overdue ${format(-seconds)}` : format(seconds)}</span>; }
function format(seconds: number) { const minutes = Math.floor(seconds / 60); return `${minutes}m ${seconds % 60}s`; }
function terminal(status: string) { return ["resolved", "false_alarm", "suppressed"].includes(status); }
function sound(priority: string) { const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext; const context = new AudioContextClass(); const oscillator = context.createOscillator(); const gain = context.createGain(); oscillator.frequency.value = priority === "P1" ? 880 : priority === "P2" ? 660 : 440; gain.gain.value = 0.08; oscillator.connect(gain); gain.connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + (priority === "P1" ? 0.8 : 0.35)); oscillator.onended = () => void context.close(); }
