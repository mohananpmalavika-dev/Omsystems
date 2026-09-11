"use client";

import { useEffect, useRef, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, Cpu, Layers, RefreshCw, Video } from "lucide-react";
import { type ClientMeasuredProfile, runClientHardwareBenchmark } from "@/lib/viewer-capacity/client-media-benchmark";

type StreamDecision = { streamTier: string; targetResolution: { width: number; height: number }; targetFps: number; targetBitrateKbps: number; playbackMode: "LIVE_DECODE" | "LOW_FPS_KEYFRAME" | "PAUSED"; reason: string };
type Schedule = { schedules: Record<string, StreamDecision>; activeLiveDecodes: number; activeKeyframeStreams: number; pausedStreams: number; hardwareDecodersUsed: number; hardwareDecodersLimit: number; totalAllocatedBandwidthKbps: number; measuredDownlinkBandwidthKbps: number; bandwidthHeadroomPct: number; totalBandwidthSavedPct: number; systemHealthStatus: "OPTIMAL" | "THROTTLED" | "CONGESTED" | "CRITICAL_OVERLOAD"; diagnostics: { limitingFactor: string; adaptationActionApplied?: string } };
const GRID_OPTIONS = [4, 9, 16, 36, 64];
const gridDimensions = (count: number) => { const columns = Math.ceil(Math.sqrt(count)); return { rows: Math.ceil(count / columns), columns }; };
function decisionAppearance(decision?: StreamDecision) { if (!decision || decision.playbackMode === "PAUSED") return "bg-slate-900 border-slate-700 text-slate-500"; if (decision.playbackMode === "LOW_FPS_KEYFRAME") return "bg-amber-950/40 border-amber-500/40 text-amber-200"; if (decision.streamTier === "MAINSTREAM_1080P") return "bg-emerald-950/60 border-emerald-500/50 text-emerald-200"; return "bg-cyan-950/40 border-cyan-500/40 text-cyan-200"; }

export function MediaPipelineSchedulerView() {
  const [profile, setProfile] = useState<ClientMeasuredProfile | null>(null);
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [gridSize, setGridSize] = useState(16);
  const [renderFps, setRenderFps] = useState<number | null>(null);
  const [eventLoopLag, setEventLoopLag] = useState<number | null>(null);
  const [state, setState] = useState<"measuring" | "scheduling" | "ready" | "error">("measuring");
  const [error, setError] = useState<string | null>(null);
  const runId = useRef(0);
  const schedulerSessionId = useRef<string | null>(null);
  const [cameras, setCameras] = useState<Array<{ id: string; name?: string; isOnline?: boolean }>>([]);

  const refresh = async () => {
    const currentRun = ++runId.current;
    setState("measuring"); setError(null);
    try {
      const [cameraResponse, viewerResponse] = await Promise.all([
        fetch("/api/control/v1/cameras?action=live%3Aview&limit=256", { credentials: "include" }),
        fetch("/api/control/v1/media/viewer/session", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deviceType: "workstation", activeLayout: `${gridSize}` }) }),
      ]);
      if (!cameraResponse.ok || !viewerResponse.ok) throw new Error("Unable to load authorized cameras or viewer session");
      const cameraBody = await cameraResponse.json() as { data?: Array<{ id: string; name?: string; status?: string }> };
      const viewerBody = await viewerResponse.json() as { session?: { sessionId?: string } };
      const available = (cameraBody.data ?? []).filter((camera) => camera.status === "online").slice(0, gridSize)
        .map((camera) => ({ id: camera.id, name: camera.name, isOnline: true }));
      if (available.length === 0 || !viewerBody.session?.sessionId) throw new Error("No authorized online cameras are available");
      const currentSessionId = viewerBody.session.sessionId;
      schedulerSessionId.current = currentSessionId;
      setCameras(available);
      const measured = await runClientHardwareBenchmark();
      if (currentRun !== runId.current) return;
      setProfile(measured); setState("scheduling");
      const { rows, columns } = gridDimensions(gridSize);
      const tileWidth = Math.max(1, Math.floor(1920 / columns)); const tileHeight = Math.max(1, Math.floor(1080 / rows));
      const response = await fetch("/api/control/v1/media/scheduler/calculate", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        fingerprint: measured.fingerprint, sessionId: currentSessionId, gridRows: rows, gridCols: columns, totalTiles: available.length, cameras: available,
        tiles: available.map((camera, tileIndex) => ({ cameraId: camera.id, widthPx: tileWidth, heightPx: tileHeight, tileIndex, isIntersecting: true })),
        visibleCameraIds: available.map((camera) => camera.id), focusedCameraId: available[0]?.id,
        liveTelemetry: { sessionId: currentSessionId, eventLoopLagMs: eventLoopLag ?? 0, totalRenderedFps: renderFps ?? 0, activeDecodedStreams: schedule?.activeLiveDecodes ?? 0, currentDownlinkMbps: measured.measuredDownlinkMbps, currentRttMs: measured.measuredRttMs, currentPacketLossPct: measured.measuredPacketLossPct },
      }) });
      if (!response.ok) throw new Error(`Scheduler request failed (${response.status})`);
      const body = await response.json() as { schedule?: Schedule };
      if (!body.schedule) throw new Error("Scheduler did not return a plan");
      if (currentRun !== runId.current) return;
      setSchedule(body.schedule); setState("ready");
    } catch (cause) { if (currentRun !== runId.current) return; setState("error"); setError(cause instanceof Error ? cause.message : "Unable to measure this workstation"); }
  };

  useEffect(() => { void refresh(); }, [gridSize]);
  useEffect(() => {
    let frameCount = 0; let lastFrame = performance.now(); let animationFrame = 0;
    const measureFrameRate = () => { frameCount += 1; const now = performance.now(); if (now - lastFrame >= 1000) { setRenderFps(Number(((frameCount * 1000) / (now - lastFrame)).toFixed(1))); frameCount = 0; lastFrame = now; } animationFrame = requestAnimationFrame(measureFrameRate); };
    animationFrame = requestAnimationFrame(measureFrameRate);
    let expected = performance.now() + 3000;
    const timer = window.setInterval(() => { const now = performance.now(); setEventLoopLag(Number(Math.max(0, now - expected).toFixed(1))); expected = now + 3000; }, 3000);
    return () => { cancelAnimationFrame(animationFrame); window.clearInterval(timer); };
  }, []);
  const statusText = state === "ready" ? "Authoritative plan ready" : state === "error" ? "Scheduler unavailable" : state === "measuring" ? "Measuring workstation" : "Calculating plan";
  const statusClass = state === "ready" ? "text-emerald-300" : state === "error" ? "text-rose-300" : "text-amber-300";

  return <div className="space-y-6 text-slate-100">
    <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950/40 border border-slate-800 shadow-xl"><div className="flex flex-col md:flex-row md:items-center justify-between gap-4"><div><div className="flex items-center gap-2 text-indigo-300 text-xs font-mono font-bold uppercase tracking-widest"><Layers className="w-4 h-4 text-cyan-400" /> Media pipeline scheduler</div><h1 className="text-2xl font-bold text-white tracking-tight mt-1">Workstation capacity plan</h1><p className="text-xs text-slate-400 mt-1">Measured browser capability and an API-calculated stream plan for the selected wall size.</p></div><div className="flex items-center gap-3"><span className={`px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 font-bold font-mono text-xs flex items-center gap-1.5 ${statusClass}`}>{state === "ready" ? <CheckCircle2 className="w-3.5 h-3.5" /> : state === "error" ? <AlertTriangle className="w-3.5 h-3.5" /> : <Activity className="w-3.5 h-3.5 animate-pulse" />}{statusText}</span><button onClick={() => void refresh()} className="p-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-300 hover:text-white" aria-label="Re-measure and recalculate"><RefreshCw className="w-4 h-4" /></button></div></div></div>
    {error && <div className="p-3 rounded-xl border border-rose-800/70 bg-rose-950/30 text-sm text-rose-200">{error}. The existing plan is retained until a new calculation succeeds.</div>}
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 font-mono text-xs text-center"><Metric label="Render framerate" value={renderFps === null ? "Measuring" : `${renderFps} FPS`} detail="Browser render loop" /><Metric label="Event loop lag" value={eventLoopLag === null ? "Measuring" : `${eventLoopLag} ms`} detail="Browser responsiveness" /><Metric label="Decoder budget" value={schedule ? `${schedule.hardwareDecodersUsed} / ${schedule.hardwareDecodersLimit}` : "—"} detail="Allocated decode sessions" /><Metric label="Measured downlink" value={profile ? `${profile.measuredDownlinkMbps} Mbps` : "—"} detail={profile ? `RTT ${profile.measuredRttMs} ms` : "Waiting for probe"} /><Metric label="Bandwidth saved" value={schedule ? `${schedule.totalBandwidthSavedPct}%` : "—"} detail="Against 1080p baseline" /><Metric label="Plan health" value={schedule?.systemHealthStatus ?? "—"} detail={schedule?.diagnostics.limitingFactor === "NONE" ? "No constraint detected" : schedule?.diagnostics.limitingFactor ?? "Waiting for plan"} /></div>
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6"><div className="lg:col-span-7"><div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-4 shadow-xl"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-300 font-mono"><Video className="w-4 h-4 text-indigo-400" /> Capacity-planning preview</div><div className="flex flex-wrap items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs font-mono">{GRID_OPTIONS.map((count) => <button key={count} onClick={() => setGridSize(count)} className={`px-2.5 py-1 rounded ${gridSize === count ? "bg-indigo-600 text-white font-bold" : "text-slate-400 hover:text-slate-200"}`}>{Math.sqrt(count) % 1 === 0 ? `${Math.sqrt(count)}×${Math.sqrt(count)}` : `${count} tiles`}</button>)}</div></div><p className="text-xs text-slate-400">This preview uses placeholder camera slots only. Live-wall camera priority, alarms, and visibility are supplied by the live wall when it requests a plan.</p><div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3 font-mono"><div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-slate-400"><span>{schedule?.activeLiveDecodes ?? 0} live decodes</span><span>{schedule?.activeKeyframeStreams ?? 0} keyframe streams</span><span>{schedule?.pausedStreams ?? 0} paused</span><span>{schedule ? `${(schedule.totalAllocatedBandwidthKbps / 1000).toFixed(1)} Mbps allocated` : "Awaiting plan"}</span></div><div className="grid gap-1.5 p-2 rounded-lg bg-slate-900/50 border border-slate-800/80 max-h-72 overflow-y-auto" style={{ gridTemplateColumns: `repeat(${gridDimensions(gridSize).columns}, minmax(0, 1fr))` }}>{cameras.map((camera, index) => { const decision = schedule?.schedules[camera.id]; return <div key={camera.id} className={`p-2 rounded border text-center text-[9px] font-bold ${decisionAppearance(decision)}`}><div className="truncate">Slot {index + 1}</div><div className="text-[8px] opacity-80 mt-0.5">{decision ? `${decision.targetResolution.width}p · ${decision.targetFps} fps` : "Calculating"}</div></div>; })}</div></div></div></div>
      <div className="lg:col-span-5"><div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-4 shadow-xl"><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-300 font-mono"><Cpu className="w-4 h-4 text-emerald-400" /> Measured client profile</div><div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2 font-mono text-xs"><div className="text-slate-400">GPU: <span className="text-white font-bold">{profile?.gpuModel ?? "Measuring"}</span></div><div className="text-slate-400">Decoder: <span className="text-emerald-400 font-semibold">{profile?.hardwareDecoder ?? "—"}</span></div><div className="text-slate-400">CPU: <span className="text-cyan-300">{profile?.cpuCores ?? "—"} cores</span> · Memory: <span className="text-cyan-300">{profile?.memoryGb ?? "—"} GB</span></div></div><div className="space-y-2 font-mono text-xs"><span className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">Detected codec support</span>{profile?.supportedCodecs.map((codec) => <div key={codec.codec} className="p-2.5 rounded-lg bg-slate-950 border border-slate-800/80 flex items-center justify-between"><div><div className="font-bold text-slate-200">{codec.codec}</div><div className="text-[10px] text-slate-500">{codec.maxSupportedResolution.width}×{codec.maxSupportedResolution.height} @ {codec.maxFps} fps</div></div><span className={`px-2 py-0.5 rounded text-[9px] font-bold ${codec.isHardwareAccelerated ? "bg-emerald-950 text-emerald-300 border border-emerald-600/40" : "bg-slate-800 text-slate-400"}`}>{codec.isHardwareAccelerated ? "HARDWARE" : "SOFTWARE"}</span></div>)}</div>{schedule?.diagnostics.adaptationActionApplied && <div className="p-3 rounded-xl border border-amber-700/50 bg-amber-950/20 text-xs text-amber-100">{schedule.diagnostics.adaptationActionApplied}</div>}</div></div></div>
  </div>;
}
function Metric({ label, value, detail }: { label: string; value: string; detail: string }) { return <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1"><div className="text-slate-400 text-[10px]">{label}</div><div className="text-lg font-bold text-white truncate">{value}</div><div className="text-[9px] text-slate-500 truncate">{detail}</div></div>; }
