"use client";

import {
  BellRing,
  Check,
  ChevronRight,
  Clock3,
  ExternalLink,
  Film,
  Image as ImageIcon,
  LoaderCircle,
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
  dashboardEvidenceUrl,
  evidenceAvailable,
  hasManagedEvidence,
  popupQueue,
  terminalAlertStatus,
  type AlertEvidenceCaptureStatus,
  type CommandAlert,
} from "@/lib/alert-command-center";
import { HlsPlayer } from "@/components/hls-player";

type EvidenceMode = "live" | "snapshot" | "clip";
type SoundState = "muted" | "needs-interaction" | "ready" | "blocked";
const soundPreferenceKey = "sentinel-alert-sound-enabled";

export function GlobalAlertCenter() {
  const pathname = usePathname();
  const enabledForRoute = pathname !== "/login";
  const [alerts, setAlerts] = useState<CommandAlert[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [manualAlertId, setManualAlertId] = useState<string>();
  const [queueOpen, setQueueOpen] = useState(false);
  const [soundState, setSoundState] = useState<SoundState>("muted");
  const [session, setSession] = useState<LiveSessionResponse>();
  const [evidenceMode, setEvidenceMode] = useState<EvidenceMode>("live");
  const [evidenceStatus, setEvidenceStatus] = useState<AlertEvidenceCaptureStatus>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const audioContextRef = useRef<AudioContext | undefined>(undefined);

  const load = useCallback(async () => {
    if (!enabledForRoute) return;
    try {
      const response = await fetch("/api/control/v1/alerts/command-center?limit=200", {
        cache: "no-store",
        credentials: "include",
      });
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
    const events = new EventSource("/api/control/v1/alerts/events", { withCredentials: true });
    for (const type of ["alert.created", "alert.updated", "notification.updated"]) {
      events.addEventListener(type, () => void load());
    }
    return () => events.close();
  }, [enabledForRoute, load]);

  const dashboardQueue = useMemo(() => activeDashboardQueue(alerts), [alerts]);
  const urgentQueue = useMemo(() => popupQueue(alerts, dismissed), [alerts, dismissed]);
  const current = dashboardQueue.find((alert) => alert.id === manualAlertId) ?? urgentQueue[0];

  const playTone = useCallback((priority: string) => {
    const context = audioContextRef.current;
    if (context?.state === "running") playAlertTone(context, priority);
  }, []);

  const enableSound = useCallback(async (previewPriority?: string) => {
    try {
      const AudioContextClass = window.AudioContext ||
        (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) {
        setSoundState("blocked");
        return;
      }
      const context = audioContextRef.current ?? new AudioContextClass();
      audioContextRef.current = context;
      await context.resume();
      if (context.state !== "running") throw new Error("audio_context_not_running");
      window.localStorage.setItem(soundPreferenceKey, "true");
      setSoundState("ready");
      if (previewPriority) playAlertTone(context, previewPriority);
    } catch {
      setSoundState("blocked");
    }
  }, []);

  useEffect(() => {
    if (window.localStorage.getItem(soundPreferenceKey) !== "true") return;
    setSoundState("needs-interaction");
    const arm = () => void enableSound();
    window.addEventListener("pointerdown", arm, { once: true });
    window.addEventListener("keydown", arm, { once: true });
    return () => {
      window.removeEventListener("pointerdown", arm);
      window.removeEventListener("keydown", arm);
    };
  }, [enableSound]);

  useEffect(() => () => {
    const context = audioContextRef.current;
    if (context && context.state !== "closed") void context.close();
  }, []);

  useEffect(() => {
    setSession(undefined);
    setEvidenceStatus(undefined);
    setError(undefined);
    setEvidenceMode("live");
  }, [current?.id]);

  useEffect(() => {
    if (!current || !hasManagedEvidence(current)) return;
    let stopped = false;
    let timer: number | undefined;
    const refresh = async () => {
      try {
        const response = await fetch(`/api/control/v1/alerts/${current.id}/evidence/status`, {
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
    return () => {
      stopped = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [current]);

  const startLive = useCallback(async (alert: CommandAlert) => {
    if (alert.cameraStatus === "offline") {
      setError("Camera is offline. Review the captured evidence.");
      setEvidenceMode(evidenceAvailable(alert, "snapshot", evidenceStatus)
        ? "snapshot"
        : evidenceAvailable(alert, "clip", evidenceStatus) ? "clip" : "live");
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const response = await fetch("/api/live", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cameraId: alert.cameraId, profile: "sub" }),
        credentials: "include",
      });
      const body = await response.json() as LiveSessionResponse & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "live_session_unavailable");
      setSession(body);
    } catch {
      setError("Live video could not start. Captured evidence will be shown as soon as it is ready.");
      if (evidenceAvailable(alert, "snapshot", evidenceStatus)) setEvidenceMode("snapshot");
      else if (evidenceAvailable(alert, "clip", evidenceStatus)) setEvidenceMode("clip");
    } finally {
      setBusy(false);
    }
  }, [evidenceStatus]);

  useEffect(() => {
    if (current && evidenceMode === "live" && !session && !busy && !error) void startLive(current);
  }, [busy, current, evidenceMode, error, session, startLive]);

  useEffect(() => {
    if (!current || soundState !== "ready") return;
    playTone(current.severity);
  }, [current?.id, playTone, soundState]);

  useEffect(() => {
    if (!current || current.severity !== "P1" || soundState !== "ready") return;
    const timer = window.setInterval(() => playTone("P1"), 10_000);
    return () => window.clearInterval(timer);
  }, [current, playTone, soundState]);

  useEffect(() => {
    if (!current || !error || evidenceMode !== "live") return;
    if (evidenceAvailable(current, "snapshot", evidenceStatus)) setEvidenceMode("snapshot");
    else if (evidenceAvailable(current, "clip", evidenceStatus)) setEvidenceMode("clip");
  }, [current, error, evidenceMode, evidenceStatus]);

  const toggleSound = async () => {
    if (soundState === "ready") {
      await audioContextRef.current?.suspend();
      window.localStorage.removeItem(soundPreferenceKey);
      setSoundState("muted");
      return;
    }
    await enableSound(current?.severity ?? "P3");
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

  const soundReady = soundState === "ready";
  const snapshotReady = current ? evidenceAvailable(current, "snapshot", evidenceStatus) : false;
  const clipReady = current ? evidenceAvailable(current, "clip", evidenceStatus) : false;
  const evidenceSettled = evidenceStatus
    ? ["ready", "partial", "failed"].includes(evidenceStatus.state)
    : false;
  const snapshotUrl = current?.snapshotReference
    ? dashboardEvidenceUrl(current.snapshotReference) : undefined;
  const clipUrl = current?.clipReference
    ? dashboardEvidenceUrl(current.clipReference) : undefined;

  if (!enabledForRoute) return null;

  return <>
    <div className="global-alert-tools fixed bottom-5 right-5 z-40 flex flex-col items-end gap-2">
      <button type="button" onClick={() => setQueueOpen((value) => !value)} aria-expanded={queueOpen} aria-label="Open active alert queue" className="relative flex h-12 w-12 items-center justify-center rounded-full bg-slate-950 text-white shadow-xl">
        <BellRing size={20}/>
        {dashboardQueue.length > 0 && <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold">{dashboardQueue.length > 99 ? "99+" : dashboardQueue.length}</span>}
      </button>
      <button type="button" onClick={() => void toggleSound()} aria-pressed={soundReady} className={`flex h-9 w-9 items-center justify-center rounded-full border bg-white shadow ${soundReady ? "text-emerald-700" : "text-red-700"}`} title={soundReady ? "Mute alert sound" : "Enable alert sound"}>{soundReady ? <Volume2 size={16}/> : <VolumeX size={16}/>}</button>
    </div>

    {queueOpen && !current && <div className="fixed bottom-20 right-5 z-40 w-[min(390px,calc(100vw-2rem))] overflow-hidden rounded-xl border bg-white shadow-2xl">
      <QueueHeader count={dashboardQueue.length} close={() => setQueueOpen(false)}/>
      <QueueList alerts={dashboardQueue} choose={(alert) => { setManualAlertId(alert.id); setQueueOpen(false); }}/>
    </div>}

    {current && <div className="fixed inset-0 z-[100] grid place-items-center bg-black/70 p-3 backdrop-blur-sm" role="alertdialog" aria-modal="true" aria-labelledby="global-alert-title">
      <div className={`max-h-[96vh] w-full max-w-6xl overflow-auto rounded-2xl border-t-8 bg-white shadow-2xl ${current.severity === "P1" ? "border-red-600" : "border-orange-500"}`}>
        <header className="flex items-start justify-between gap-4 border-b p-4">
          <div className="flex items-start gap-3"><span className={`mt-1 rounded-full p-2 text-white ${current.severity === "P1" ? "bg-red-600" : "bg-orange-500"}`}><Siren size={20}/></span><div><div className="flex flex-wrap items-center gap-2"><Priority value={current.severity}/><span className="text-xs font-semibold uppercase tracking-wider text-gray-500">New real-time alert</span><span className="text-xs text-gray-400">{urgentQueue.length} awaiting popup action</span></div><h2 id="global-alert-title" className="mt-1 text-xl font-bold">{current.title}</h2><p className="text-sm text-gray-600">{current.branchName} · {current.cameraName} · {current.detectionType}</p></div></div>
          <div className="flex items-center gap-2"><button type="button" onClick={() => void toggleSound()} className={`rounded-lg border p-2 ${soundReady ? "text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`} title={soundReady ? "Mute" : "Enable sound"}>{soundReady ? <Volume2 size={17}/> : <VolumeX size={17}/>}</button><button type="button" onClick={dismissCurrent} className="rounded-lg border p-2" aria-label="Dismiss popup without acknowledging"><X size={17}/></button></div>
        </header>
        <div className="grid lg:grid-cols-[minmax(0,1fr)_340px]">
          <main className="space-y-4 p-4">
            {!soundReady && <SoundReadiness state={soundState} enable={() => void enableSound(current.severity)}/>}
            {hasManagedEvidence(current) && <EvidenceCaptureNotice status={evidenceStatus}/>}
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Alert evidence">
              <EvidenceTab active={evidenceMode === "live"} onClick={() => setEvidenceMode("live")}><Radio size={14}/>Live video</EvidenceTab>
              {current.snapshotReference && <EvidenceTab active={evidenceMode === "snapshot"} disabled={!snapshotReady} onClick={() => setEvidenceMode("snapshot")}><ImageIcon size={14}/>{snapshotReady ? "Snapshot" : evidenceSettled ? "Snapshot unavailable" : "Snapshot capturing"}{!snapshotReady && !evidenceSettled && <LoaderCircle size={12} className="animate-spin"/>}</EvidenceTab>}
              {current.clipReference && <EvidenceTab active={evidenceMode === "clip"} disabled={!clipReady} onClick={() => setEvidenceMode("clip")}><Film size={14}/>{clipReady ? "Video clip" : evidenceSettled ? "Clip unavailable" : "Clip capturing"}{!clipReady && !evidenceSettled && <LoaderCircle size={12} className="animate-spin"/>}</EvidenceTab>}
            </div>
            <div className="aspect-video overflow-hidden rounded-xl bg-slate-950 text-white">
              {evidenceMode === "live" && (session?.hls ? <HlsPlayer url={session.hls.url} bearerToken={session.hls.bearerToken} cameraName={current.cameraName} onPlaybackError={() => void startLive(current)}/> : <div className="grid h-full place-items-center"><button type="button" disabled={busy} onClick={() => void startLive(current)} className="flex items-center gap-2 rounded-lg bg-white/10 px-4 py-3">{busy ? "Authorizing live video…" : <><Radio size={18}/>Start live video</>}</button></div>)}
              {evidenceMode === "snapshot" && snapshotReady && snapshotUrl && <img src={snapshotUrl} alt={`Alert snapshot from ${current.cameraName}`} className="h-full w-full object-contain"/>}
              {evidenceMode === "clip" && clipReady && clipUrl && <video key={clipUrl} controls autoPlay muted playsInline className="h-full w-full object-contain"><source src={clipUrl}/>Your browser cannot play this alert clip.</video>}
            </div>
            {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
            <p className="text-sm text-gray-600">{current.description}</p>
            <div className="flex flex-wrap items-center gap-2">
              {!terminalAlertStatus(current.status) && <><button type="button" disabled={busy} onClick={() => void act(current, "acknowledge")} className="btn-primary flex items-center gap-2"><Check size={16}/>Acknowledge</button><button type="button" disabled={busy} onClick={() => void act(current, "escalate")} className="btn-secondary flex items-center gap-2 border-red-200 text-red-700"><Siren size={16}/>Escalate</button></>}
              {snapshotReady && snapshotUrl && <a href={snapshotUrl} target="_blank" rel="noreferrer" className="btn-secondary flex items-center gap-2"><ExternalLink size={15}/>Open snapshot</a>}
              {clipReady && clipUrl && <a href={clipUrl} target="_blank" rel="noreferrer" className="btn-secondary flex items-center gap-2"><ExternalLink size={15}/>Open clip</a>}
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

function EvidenceTab({ active, disabled = false, onClick, children }: { active: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" role="tab" aria-selected={active} disabled={disabled} onClick={onClick} className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-60 ${active ? "bg-blue-600 text-white" : "border bg-white text-gray-600"}`}>{children}</button>;
}

function SoundReadiness({ state, enable }: { state: SoundState; enable: () => void }) {
  return <div role="status" className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
    <VolumeX size={18}/>
    <span className="min-w-0 flex-1"><strong>Alert sound is not armed.</strong> {state === "blocked" ? "The browser blocked audio; retry from this button." : "One operator action is required by the browser before audible alerts can play."}</span>
    <button type="button" onClick={enable} className="rounded-md bg-amber-950 px-3 py-2 text-xs font-semibold text-white">Enable and test sound</button>
  </div>;
}

function EvidenceCaptureNotice({ status }: { status?: AlertEvidenceCaptureStatus }) {
  if (!status || status.state === "queued" || status.state === "capturing") {
    return <div role="status" className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800"><LoaderCircle size={16} className="animate-spin"/>Automatically capturing snapshot and 20-second alert clip…</div>;
  }
  if (status.state === "failed") {
    return <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">Automatic evidence capture failed. Live video remains available; the recorder will retain the failure reason for support.</div>;
  }
  if (status.state === "partial") {
    return <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Evidence capture is partial. Available evidence is shown; the missing asset could not be produced.</div>;
  }
  return <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">Snapshot and alert clip captured automatically.</div>;
}

function Priority({ value }: { value: string }) {
  return <span className={`inline-flex rounded px-2 py-1 text-xs font-bold ${value === "P1" ? "bg-red-100 text-red-800" : value === "P2" ? "bg-orange-100 text-orange-800" : value === "P3" ? "bg-blue-100 text-blue-800" : "bg-gray-100 text-gray-700"}`}>{value}</span>;
}

function Sla({ alert }: { alert: CommandAlert }) {
  if (!alert.slaDueAt || terminalAlertStatus(alert.status)) return null;
  const seconds = Math.floor((Date.parse(alert.slaDueAt) - Date.now()) / 1_000);
  return <span className={`ml-auto flex items-center gap-1 text-xs font-semibold ${seconds < 0 ? "text-red-700" : "text-gray-600"}`}><Clock3 size={13}/>{seconds < 0 ? "SLA overdue" : `${Math.ceil(seconds / 60)}m SLA`}</span>;
}

function playAlertTone(context: AudioContext, priority: string) {
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
}
