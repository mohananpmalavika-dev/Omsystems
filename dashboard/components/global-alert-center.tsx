"use client";

import {
  BellRing,
  Check,
  ChevronRight,
  Clock3,
  ExternalLink,
  Film,
  Image as ImageIcon,
  Radio,
  Siren,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LiveSessionResponse } from "@/lib/types";
import {
  activeDashboardQueue,
  alertTonePattern,
  popupQueue,
  terminalAlertStatus,
  type CommandAlert,
} from "@/lib/alert-command-center";
import { HlsPlayer } from "@/components/hls-player";

type EvidenceMode = "live" | "snapshot" | "clip";

export function GlobalAlertCenter() {
  const pathname = usePathname();
  const enabledForRoute = pathname !== "/login";
  const [alerts, setAlerts] = useState<CommandAlert[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [manualAlertId, setManualAlertId] = useState<string>();
  const [queueOpen, setQueueOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [session, setSession] = useState<LiveSessionResponse>();
  const [evidenceMode, setEvidenceMode] = useState<EvidenceMode>("live");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const soundEnabledRef = useRef(false);

  const load = useCallback(async () => {
    if (!enabledForRoute) return;
    try {
      const response = await fetch("/api/control/v1/alerts/command-center?limit=200", { cache: "no-store" });
      if (!response.ok) return;
      const body = await response.json();
      setAlerts((body.data ?? []) as CommandAlert[]);
    } catch {
      // SSE reconnect and the polling fallback will retry without disrupting operators.
    }
  }, [enabledForRoute]);

  useEffect(() => {
    if (!enabledForRoute) return;
    void load();
    const timer = window.setInterval(load, 30_000);
    return () => window.clearInterval(timer);
  }, [enabledForRoute, load]);

  useEffect(() => {
    if (!enabledForRoute) return;
    const events = new EventSource("/api/control/v1/alerts/events");
    for (const type of ["alert.created", "alert.updated", "notification.updated"]) {
      events.addEventListener(type, () => void load());
    }
    return () => events.close();
  }, [enabledForRoute, load]);

  const dashboardQueue = useMemo(() => activeDashboardQueue(alerts), [alerts]);
  const urgentQueue = useMemo(() => popupQueue(alerts, dismissed), [alerts, dismissed]);
  const current = dashboardQueue.find((alert) => alert.id === manualAlertId) ?? urgentQueue[0];

  useEffect(() => {
    setSession(undefined);
    setError(undefined);
    setEvidenceMode("live");
  }, [current?.id]);

  const startLive = useCallback(async (alert: CommandAlert) => {
    if (alert.cameraStatus === "offline") {
      setError("Camera is offline. Review the captured evidence.");
      setEvidenceMode(alert.snapshotReference ? "snapshot" : alert.clipReference ? "clip" : "live");
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const response = await fetch("/api/live", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cameraId: alert.cameraId, profile: "sub" }),
      });
      const body = await response.json() as LiveSessionResponse & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "live_session_unavailable");
      setSession(body);
    } catch {
      setError("Live video could not start. Snapshot and clip evidence remain available.");
      if (alert.snapshotReference) setEvidenceMode("snapshot");
      else if (alert.clipReference) setEvidenceMode("clip");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (current && evidenceMode === "live" && !session && !busy && !error) void startLive(current);
  }, [busy, current, evidenceMode, error, session, startLive]);

  useEffect(() => {
    if (!current || !soundEnabledRef.current) return;
    playAlertTone(current.severity);
  }, [current?.id]);

  useEffect(() => {
    if (!current || current.severity !== "P1" || !soundEnabled) return;
    const timer = window.setInterval(() => playAlertTone("P1"), 10_000);
    return () => window.clearInterval(timer);
  }, [current, soundEnabled]);

  const toggleSound = () => {
    const next = !soundEnabled;
    soundEnabledRef.current = next;
    setSoundEnabled(next);
    if (next) playAlertTone(current?.severity ?? "P3");
  };

  const act = async (alert: CommandAlert, action: "acknowledge" | "escalate") => {
    setBusy(true);
    setError(undefined);
    try {
      const response = await fetch(`/api/control/v1/analytics/alerts/${alert.id}/${action}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expectedVersion: alert.version,
          notes: action === "acknowledge" ? "Acknowledged from global HO alert popup" : "Escalated from global HO alert popup",
        }),
      });
      if (response.status === 409) {
        setError("This alert was updated by another operator. The queue has been refreshed.");
      } else if (!response.ok) {
        throw new Error("alert_action_failed");
      }
      setManualAlertId(undefined);
      setDismissed((items) => new Set(items).add(alert.id));
      await load();
    } catch {
      setError(`Unable to ${action} this alert. Check your permission and connection.`);
    } finally {
      setBusy(false);
    }
  };

  const dismissCurrent = () => {
    if (!current) return;
    setManualAlertId(undefined);
    setDismissed((items) => new Set(items).add(current.id));
  };

  if (!enabledForRoute) return null;

  return <>
    <div className="fixed right-4 top-24 z-40 flex flex-col items-end gap-2">
      <button type="button" onClick={() => setQueueOpen((value) => !value)} aria-expanded={queueOpen} aria-label="Open active alert queue" className="relative flex h-12 w-12 items-center justify-center rounded-full bg-slate-950 text-white shadow-xl">
        <BellRing size={20}/>
        {dashboardQueue.length > 0 && <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold">{dashboardQueue.length > 99 ? "99+" : dashboardQueue.length}</span>}
      </button>
      <button type="button" onClick={toggleSound} aria-pressed={soundEnabled} className="flex h-9 w-9 items-center justify-center rounded-full border bg-white text-slate-700 shadow" title={soundEnabled ? "Mute alert sound" : "Enable alert sound"}>{soundEnabled ? <Volume2 size={16}/> : <VolumeX size={16}/>}</button>
    </div>

    {queueOpen && !current && <div className="fixed right-4 top-40 z-40 w-[min(390px,calc(100vw-2rem))] overflow-hidden rounded-xl border bg-white shadow-2xl">
      <QueueHeader count={dashboardQueue.length} close={() => setQueueOpen(false)}/>
      <QueueList alerts={dashboardQueue} choose={(alert) => { setManualAlertId(alert.id); setQueueOpen(false); }}/>
    </div>}

    {current && <div className="fixed inset-0 z-[100] grid place-items-center bg-black/70 p-3 backdrop-blur-sm" role="alertdialog" aria-modal="true" aria-labelledby="global-alert-title">
      <div className={`max-h-[96vh] w-full max-w-6xl overflow-auto rounded-2xl border-t-8 bg-white shadow-2xl ${current.severity === "P1" ? "border-red-600" : "border-orange-500"}`}>
        <header className="flex items-start justify-between gap-4 border-b p-4">
          <div className="flex items-start gap-3"><span className={`mt-1 rounded-full p-2 text-white ${current.severity === "P1" ? "bg-red-600" : "bg-orange-500"}`}><Siren size={20}/></span><div><div className="flex flex-wrap items-center gap-2"><Priority value={current.severity}/><span className="text-xs font-semibold uppercase tracking-wider text-gray-500">New real-time alert</span><span className="text-xs text-gray-400">{urgentQueue.length} awaiting popup action</span></div><h2 id="global-alert-title" className="mt-1 text-xl font-bold">{current.title}</h2><p className="text-sm text-gray-600">{current.branchName} · {current.cameraName} · {current.detectionType}</p></div></div>
          <div className="flex items-center gap-2"><button type="button" onClick={toggleSound} className="rounded-lg border p-2" title={soundEnabled ? "Mute" : "Enable sound"}>{soundEnabled ? <Volume2 size={17}/> : <VolumeX size={17}/>}</button><button type="button" onClick={dismissCurrent} className="rounded-lg border p-2" aria-label="Dismiss popup without acknowledging"><X size={17}/></button></div>
        </header>
        <div className="grid lg:grid-cols-[minmax(0,1fr)_340px]">
          <main className="space-y-4 p-4">
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Alert evidence">
              <EvidenceTab active={evidenceMode === "live"} onClick={() => setEvidenceMode("live")}><Radio size={14}/>Live video</EvidenceTab>
              {current.snapshotReference && <EvidenceTab active={evidenceMode === "snapshot"} onClick={() => setEvidenceMode("snapshot")}><ImageIcon size={14}/>Snapshot</EvidenceTab>}
              {current.clipReference && <EvidenceTab active={evidenceMode === "clip"} onClick={() => setEvidenceMode("clip")}><Film size={14}/>Video clip</EvidenceTab>}
            </div>
            <div className="aspect-video overflow-hidden rounded-xl bg-slate-950 text-white">
              {evidenceMode === "live" && (session?.hls ? <HlsPlayer url={session.hls.url} bearerToken={session.hls.bearerToken} cameraName={current.cameraName} onPlaybackError={() => void startLive(current)}/> : <div className="grid h-full place-items-center"><button type="button" disabled={busy} onClick={() => void startLive(current)} className="flex items-center gap-2 rounded-lg bg-white/10 px-4 py-3">{busy ? "Authorizing live video…" : <><Radio size={18}/>Start live video</>}</button></div>)}
              {evidenceMode === "snapshot" && current.snapshotReference && <img src={current.snapshotReference} alt={`Alert snapshot from ${current.cameraName}`} className="h-full w-full object-contain"/>}
              {evidenceMode === "clip" && current.clipReference && <video key={current.clipReference} controls autoPlay muted playsInline className="h-full w-full object-contain"><source src={current.clipReference}/>Your browser cannot play this alert clip.</video>}
            </div>
            {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
            <p className="text-sm text-gray-600">{current.description}</p>
            <div className="flex flex-wrap items-center gap-2">
              {!terminalAlertStatus(current.status) && <><button type="button" disabled={busy} onClick={() => void act(current, "acknowledge")} className="btn-primary flex items-center gap-2"><Check size={16}/>Acknowledge</button><button type="button" disabled={busy} onClick={() => void act(current, "escalate")} className="btn-secondary flex items-center gap-2 border-red-200 text-red-700"><Siren size={16}/>Escalate</button></>}
              {current.snapshotReference && <a href={current.snapshotReference} target="_blank" rel="noreferrer" className="btn-secondary flex items-center gap-2"><ExternalLink size={15}/>Open snapshot</a>}
              {current.clipReference && <a href={current.clipReference} target="_blank" rel="noreferrer" className="btn-secondary flex items-center gap-2"><ExternalLink size={15}/>Open clip</a>}
              <Sla alert={current}/>
            </div>
          </main>
          <aside className="border-t bg-gray-50 lg:border-l lg:border-t-0">
            <QueueHeader count={dashboardQueue.length}/>
            <QueueList alerts={dashboardQueue} selectedId={current.id} choose={(alert) => setManualAlertId(alert.id)}/>
          </aside>
        </div>
      </div>
    </div>}
  </>;
}

function QueueHeader({ count, close }: { count: number; close?: () => void }) {
  return <div className="flex items-center justify-between border-b p-3"><div><strong className="text-sm">Active alert queue</strong><p className="text-[11px] text-gray-500">{count} alerts ordered by severity</p></div>{close && <button type="button" onClick={close} aria-label="Close queue"><X size={17}/></button>}</div>;
}

function QueueList({ alerts, selectedId, choose }: { alerts: CommandAlert[]; selectedId?: string; choose: (alert: CommandAlert) => void }) {
  return <div className="max-h-[65vh] overflow-y-auto p-2">{alerts.length === 0 ? <p className="p-6 text-center text-sm text-gray-500">No active dashboard alerts.</p> : alerts.map((alert) => <button type="button" key={alert.id} onClick={() => choose(alert)} className={`mb-2 flex w-full items-start gap-2 rounded-lg border p-2.5 text-left ${selectedId === alert.id ? "border-blue-400 bg-blue-50" : "bg-white hover:bg-gray-50"}`}><Priority value={alert.severity}/><span className="min-w-0 flex-1"><strong className="block truncate text-xs">{alert.title}</strong><span className="block truncate text-[11px] text-gray-500">{alert.branchName} · {alert.cameraName}</span><span className="text-[10px] text-gray-400">{new Date(alert.lastDetectedAt).toLocaleTimeString()} · {alert.status.replaceAll("_", " ")}</span></span><ChevronRight size={14} className="mt-1 text-gray-400"/></button>)}</div>;
}

function EvidenceTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" role="tab" aria-selected={active} onClick={onClick} className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold ${active ? "bg-blue-600 text-white" : "border bg-white text-gray-600"}`}>{children}</button>;
}

function Priority({ value }: { value: string }) {
  return <span className={`inline-flex rounded px-2 py-1 text-xs font-bold ${value === "P1" ? "bg-red-100 text-red-800" : value === "P2" ? "bg-orange-100 text-orange-800" : value === "P3" ? "bg-blue-100 text-blue-800" : "bg-gray-100 text-gray-700"}`}>{value}</span>;
}

function Sla({ alert }: { alert: CommandAlert }) {
  if (!alert.slaDueAt || terminalAlertStatus(alert.status)) return null;
  const seconds = Math.floor((Date.parse(alert.slaDueAt) - Date.now()) / 1_000);
  return <span className={`ml-auto flex items-center gap-1 text-xs font-semibold ${seconds < 0 ? "text-red-700" : "text-gray-600"}`}><Clock3 size={13}/>{seconds < 0 ? "SLA overdue" : `${Math.ceil(seconds / 60)}m SLA`}</span>;
}

function playAlertTone(priority: string) {
  const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return;
  const context = new AudioContextClass();
  const pattern = alertTonePattern(priority);
  pattern.forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const start = context.currentTime + index * 0.22;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.09, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);
    oscillator.connect(gain); gain.connect(context.destination);
    oscillator.start(start); oscillator.stop(start + 0.18);
  });
  window.setTimeout(() => void context.close(), pattern.length * 220 + 200);
}
