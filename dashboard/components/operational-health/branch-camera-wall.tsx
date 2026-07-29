"use client";

import Link from "next/link";
import {
  Camera as CameraIcon,
  CircleStop,
  Grid2X2,
  LoaderCircle,
  Maximize2,
  Move3D,
  Play,
  Radio,
  Server,
  Volume2,
  RotateCw,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LiveSessionResponse } from "@/lib/types";
import type { CameraHealth } from "@/lib/types/operational-health";
import { HlsPlayer } from "@/components/hls-player";
import { PtzControl } from "@/components/ptz-control";
import {
  CAMERA_WALL_LAYOUTS,
  CAMERA_WALL_RENDER_BATCH_SIZE,
  cameraPlaybackHref,
  cameraRenderWindow,
  cameraStatusTone,
  cameraSequenceWindow,
  canStartCamera,
  nextCameraRenderCount,
  type CameraWallColumns,
} from "./branch-camera-wall-model";

const RENEWAL_LEAD_MS = 60_000;

export function BranchCameraWall({ branchId, cameras }: { branchId: string; cameras: CameraHealth[] }) {
  const [columns, setColumns] = useState<CameraWallColumns>(4);
  const [renderedCameraCount, setRenderedCameraCount] = useState(CAMERA_WALL_RENDER_BATCH_SIZE);
  const [decoderBudget, setDecoderBudget] = useState(16);
  const [sequencing, setSequencing] = useState(true);
  const [sequenceOffset, setSequenceOffset] = useState(0);
  const [wallRunning, setWallRunning] = useState(false);
  const [sessions, setSessions] = useState<Record<string, LiveSessionResponse>>({});
  const [loading, setLoading] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [ptzCameraId, setPtzCameraId] = useState<string | null>(null);
  const inFlight = useRef(new Set<string>());

  const startCamera = useCallback(async (cameraId: string, managed = false, replace = false) => {
    if (inFlight.current.has(cameraId) || loading.has(cameraId) || (sessions[cameraId] && !replace)) return;
    if (!managed && !replace && Object.keys(sessions).length + loading.size >= decoderBudget) {
      setErrors((current) => ({ ...current, [cameraId]: `Decoder budget reached (${decoderBudget})` }));
      return;
    }
    inFlight.current.add(cameraId);
    setLoading((current) => new Set(current).add(cameraId));
    setErrors((current) => { const next = { ...current }; delete next[cameraId]; return next; });
    try {
      const response = await fetch("/api/live", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cameraId, profile: columns >= 4 || cameras.length > 16 ? "sub" : "main" }),
      });
      const body = await response.json() as LiveSessionResponse & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "live_session_unavailable");
      setSessions((current) => ({ ...current, [cameraId]: body }));
    } catch {
      setErrors((current) => ({ ...current, [cameraId]: "Live feed unavailable" }));
    } finally {
      inFlight.current.delete(cameraId);
      setLoading((current) => { const next = new Set(current); next.delete(cameraId); return next; });
    }
  }, [cameras.length, columns, decoderBudget, loading, sessions]);

  const activeWindow = useMemo(() => cameraSequenceWindow(cameras, decoderBudget, sequenceOffset), [cameras, decoderBudget, sequenceOffset]);
  const renderedCameras = useMemo(() => cameraRenderWindow(cameras, renderedCameraCount), [cameras, renderedCameraCount]);
  const hasMoreCameras = renderedCameras.length < cameras.length;

  const startAll = useCallback(async () => {
    setWallRunning(true);
    const pending = activeWindow.filter((camera) => !sessions[camera.id]);
    for (let index = 0; index < pending.length; index += 4) {
      await Promise.all(pending.slice(index, index + 4).map((camera) => startCamera(camera.id, true)));
    }
  }, [activeWindow, sessions, startCamera]);

  useEffect(() => {
    const saved = Number(window.localStorage.getItem("sentinel.branchDecoderBudget"));
    if ([8, 16, 25, 36, 64].includes(saved)) setDecoderBudget(saved);
  }, []);

  useEffect(() => {
    if (!wallRunning || !sequencing || cameras.filter(canStartCamera).length <= decoderBudget) return;
    const timer = window.setInterval(() => setSequenceOffset((current) => current + decoderBudget), 15_000);
    return () => window.clearInterval(timer);
  }, [cameras, decoderBudget, sequencing, wallRunning]);

  useEffect(() => {
    if (!wallRunning) return;
    const target = new Set(activeWindow.map((camera) => camera.id));
    setSessions((current) => {
      const retained = Object.entries(current).filter(([id]) => target.has(id));
      return retained.length === Object.keys(current).length ? current : Object.fromEntries(retained);
    });
    const pending = activeWindow.filter((camera) => !sessions[camera.id] && !loading.has(camera.id));
    void (async () => {
      for (let index = 0; index < pending.length; index += 4) {
        await Promise.all(pending.slice(index, index + 4).map((camera) => startCamera(camera.id, true)));
      }
    })();
  }, [activeWindow, loading, sessions, startCamera, wallRunning]);

  useEffect(() => {
    const cameraIds = new Set(cameras.map((camera) => camera.id));
    setSessions((current) => Object.fromEntries(Object.entries(current).filter(([id]) => cameraIds.has(id))));
  }, [cameras]);

  useEffect(() => {
    setRenderedCameraCount((current) => Math.min(cameras.length, Math.max(Math.min(CAMERA_WALL_RENDER_BATCH_SIZE, cameras.length), current)));
  }, [cameras.length]);

  useEffect(() => {
    const timers = Object.entries(sessions).flatMap(([cameraId, session]) => {
      if (!session.expiresAt) return [];
      const expiry = Date.parse(session.expiresAt);
      if (!Number.isFinite(expiry)) return [];
      return [window.setTimeout(() => void startCamera(cameraId, true, true), Math.max(1_000, expiry - Date.now() - RENEWAL_LEAD_MS))];
    });
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [sessions, startCamera]);

  const online = cameras.filter((camera) => camera.onlineStatus === "online").length;
  const recording = cameras.filter((camera) => camera.recordingStatus === "compliant" || camera.recordingStatus === "healthy").length;

  return <section aria-label="Branch camera wall">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h3 className="flex items-center gap-2 text-lg font-semibold"><CameraIcon size={20}/>All branch cameras ({cameras.length})</h3>
        <p className="mt-1 text-xs text-gray-500">{online} online · {cameras.length - online} attention · {recording} recording compliant</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border bg-white p-1" role="group" aria-label="Camera wall columns">
          {CAMERA_WALL_LAYOUTS.map((count) => <button key={count} type="button" aria-pressed={columns === count} onClick={() => setColumns(count)} className={`rounded-md px-2.5 py-1.5 text-xs font-semibold ${columns === count ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-100"}`}><Grid2X2 size={13} className="mr-1 inline"/>{count}</button>)}
        </div>
        <label className="flex items-center gap-2 text-xs font-semibold text-gray-600">Decoder budget<select className="input py-1.5 text-xs" value={decoderBudget} onChange={(event) => { const value = Number(event.target.value); setDecoderBudget(value); window.localStorage.setItem("sentinel.branchDecoderBudget", String(value)); }}><option value={8}>8</option><option value={16}>16</option><option value={25}>25</option><option value={36}>36</option><option value={64}>64 certified</option></select></label>
        <button type="button" aria-pressed={sequencing} className={`btn-secondary flex items-center gap-2 text-xs ${sequencing ? "border-blue-500 bg-blue-50 text-blue-700" : ""}`} onClick={() => setSequencing((current) => !current)}><RotateCw size={14}/>Sequence {sequencing ? "on" : "off"}</button>
        <span className="rounded-full bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-600">{Object.keys(sessions).length}/{decoderBudget} live</span>
        <button type="button" className="btn-primary flex items-center gap-2" onClick={() => void startAll()} disabled={loading.size > 0 || online === 0}><Radio size={15}/>{loading.size > 0 ? `Starting ${loading.size}…` : "Start all live"}</button>
      </div>
    </div>
    {cameras.length === 0 ? <div className="card py-10 text-center text-gray-500">No authorized cameras are registered at this branch.</div> : <div className={`grid gap-4 ${columnClass(columns)}`}>
      {renderedCameras.map((camera) => <BranchCameraTile
        key={camera.id}
        camera={camera}
        branchId={branchId}
        session={sessions[camera.id]}
        loading={loading.has(camera.id)}
        error={errors[camera.id]}
        ptzOpen={ptzCameraId === camera.id}
        onStart={() => void startCamera(camera.id, false, Boolean(sessions[camera.id]))}
        onTogglePtz={() => setPtzCameraId((current) => current === camera.id ? null : camera.id)}
      />)}
    </div>}
    {cameras.length > CAMERA_WALL_RENDER_BATCH_SIZE && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
      <p className="text-sm text-gray-600" aria-live="polite">Showing {renderedCameras.length} of {cameras.length} cameras. Live decoding remains capped by the selected budget.</p>
      {hasMoreCameras && <button type="button" className="btn-secondary text-sm" onClick={() => setRenderedCameraCount((current) => nextCameraRenderCount(current, cameras.length))}>Show next {Math.min(CAMERA_WALL_RENDER_BATCH_SIZE, cameras.length - renderedCameras.length)} cameras</button>}
    </div>}
  </section>;
}

function columnClass(columns: CameraWallColumns) {
  return columns === 1 ? "grid-cols-1" : columns === 2 ? "md:grid-cols-2" : columns === 3 ? "md:grid-cols-2 xl:grid-cols-3" : columns === 4 ? "md:grid-cols-2 xl:grid-cols-4" : columns === 5 ? "md:grid-cols-2 xl:grid-cols-5" : columns === 6 ? "md:grid-cols-3 xl:grid-cols-6" : columns === 7 ? "md:grid-cols-3 xl:grid-cols-7" : "md:grid-cols-4 xl:grid-cols-8";
}

function BranchCameraTile({ camera, branchId, session, loading, error, ptzOpen, onStart, onTogglePtz }: {
  camera: CameraHealth;
  branchId: string;
  session?: LiveSessionResponse;
  loading: boolean;
  error?: string;
  ptzOpen: boolean;
  onStart: () => void;
  onTogglePtz: () => void;
}) {
  const tile = useRef<HTMLElement>(null);
  const tone = cameraStatusTone(camera);
  const canStart = canStartCamera(camera);
  const recordingOk = camera.recordingStatus === "compliant" || camera.recordingStatus === "healthy";
  return <article ref={tile} className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm" aria-label={`${camera.name} camera`}>
    <div className="relative aspect-video overflow-hidden bg-slate-950">
      {session?.hls ? <HlsPlayer url={session.hls.url} bearerToken={session.hls.bearerToken} cameraName={camera.name} onPlaybackError={onStart}/> : <div className="flex h-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-slate-900 to-slate-800 text-slate-300"><CameraIcon size={30}/><span className="text-xs">{error ?? (canStart ? "Ready for protected live view" : "Camera unavailable")}</span>{canStart && <button type="button" onClick={onStart} disabled={loading} className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white backdrop-blur hover:bg-white/20">{loading ? <LoaderCircle className="animate-spin" size={14}/> : <Play size={14}/>} {loading ? "Authorizing…" : "Watch live"}</button>}</div>}
      <div className="absolute left-2 top-2 flex gap-2 text-[10px] font-semibold uppercase">
        <span className={`rounded-full px-2 py-1 text-white ${tone === "healthy" ? "bg-green-600" : tone === "warning" ? "bg-amber-600" : "bg-red-600"}`}>{camera.onlineStatus}</span>
        <span className={`flex items-center gap-1 rounded-full px-2 py-1 text-white ${recordingOk ? "bg-red-600" : "bg-gray-600"}`}>{recordingOk ? <Radio size={10}/> : <CircleStop size={10}/>} {camera.recordingStatus}</span>
      </div>
      <div className="absolute bottom-2 right-2 flex gap-1">
        {camera.capabilities?.audio && <span title="Audio capable" className="rounded bg-black/60 p-2 text-white"><Volume2 size={14}/></span>}
        {camera.capabilities?.ptz && <button type="button" title="PTZ controls" aria-label={`PTZ controls for ${camera.name}`} onClick={onTogglePtz} disabled={!session?.sessionId} className="rounded bg-black/60 p-2 text-white disabled:opacity-40"><Move3D size={14}/></button>}
        <button type="button" title="Fullscreen" aria-label={`Fullscreen ${camera.name}`} onClick={() => void tile.current?.requestFullscreen()} className="rounded bg-black/60 p-2 text-white"><Maximize2 size={14}/></button>
      </div>
      {ptzOpen && camera.capabilities?.ptz && session?.sessionId && <div className="absolute inset-0 z-20 overflow-auto bg-white/95 p-2"><PtzControl cameraId={camera.id} sessionId={session.sessionId} onClose={onTogglePtz}/></div>}
    </div>
    <div className="p-3">
      <div className="flex items-start justify-between gap-2"><div className="min-w-0"><h4 className="truncate text-sm font-semibold text-gray-900">{camera.name}</h4><p className="truncate text-[11px] text-gray-500">{camera.vendor ?? "Unknown make"} · {camera.model ?? "Model unavailable"}</p></div><span className="rounded bg-gray-100 px-2 py-1 text-[10px] font-semibold text-gray-600">CH {camera.channel ?? "--"}</span></div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-gray-600"><span><strong className="block text-gray-400">IP address</strong>{camera.ipAddress ?? "Not reported"}</span><span><strong className="block text-gray-400">Last signal</strong>{camera.lastHeartbeat ? new Date(camera.lastHeartbeat).toLocaleTimeString() : "No telemetry"}</span></div>
      <div className="mt-3 flex gap-2 border-t pt-3"><Link href={cameraPlaybackHref(branchId, camera.id)} className="btn-secondary flex flex-1 items-center justify-center gap-2 text-xs"><Play size={13}/>Playback</Link><Link href={`/operations/cameras?cameraId=${encodeURIComponent(camera.id)}`} className="btn-secondary flex flex-1 items-center justify-center gap-2 text-xs"><Server size={13}/>Camera info</Link></div>
    </div>
  </article>;
}
