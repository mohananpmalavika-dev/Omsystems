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
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { LiveSessionResponse } from "@/lib/types";
import type { CameraHealth } from "@/lib/types/operational-health";
import { HlsPlayer } from "@/components/hls-player";
import { PtzControl } from "@/components/ptz-control";
import {
  CAMERA_WALL_LAYOUTS,
  cameraPlaybackHref,
  cameraStatusTone,
  canStartCamera,
  type CameraWallColumns,
} from "./branch-camera-wall-model";

const RENEWAL_LEAD_MS = 60_000;

export function BranchCameraWall({ branchId, cameras }: { branchId: string; cameras: CameraHealth[] }) {
  const [columns, setColumns] = useState<CameraWallColumns>(3);
  const [sessions, setSessions] = useState<Record<string, LiveSessionResponse>>({});
  const [loading, setLoading] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [ptzCameraId, setPtzCameraId] = useState<string | null>(null);

  const startCamera = useCallback(async (cameraId: string) => {
    setLoading((current) => new Set(current).add(cameraId));
    setErrors((current) => { const next = { ...current }; delete next[cameraId]; return next; });
    try {
      const response = await fetch("/api/live", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cameraId, profile: "sub" }),
      });
      const body = await response.json() as LiveSessionResponse & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "live_session_unavailable");
      setSessions((current) => ({ ...current, [cameraId]: body }));
    } catch {
      setErrors((current) => ({ ...current, [cameraId]: "Live feed unavailable" }));
    } finally {
      setLoading((current) => { const next = new Set(current); next.delete(cameraId); return next; });
    }
  }, []);

  const startAll = useCallback(async () => {
    const pending = cameras.filter((camera) => canStartCamera(camera) && !sessions[camera.id]);
    for (let index = 0; index < pending.length; index += 4) {
      await Promise.all(pending.slice(index, index + 4).map((camera) => startCamera(camera.id)));
    }
  }, [cameras, sessions, startCamera]);

  useEffect(() => {
    const cameraIds = new Set(cameras.map((camera) => camera.id));
    setSessions((current) => Object.fromEntries(Object.entries(current).filter(([id]) => cameraIds.has(id))));
  }, [cameras]);

  useEffect(() => {
    const timers = Object.entries(sessions).flatMap(([cameraId, session]) => {
      if (!session.expiresAt) return [];
      const expiry = Date.parse(session.expiresAt);
      if (!Number.isFinite(expiry)) return [];
      return [window.setTimeout(() => void startCamera(cameraId), Math.max(1_000, expiry - Date.now() - RENEWAL_LEAD_MS))];
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
      <div className="flex items-center gap-2">
        <div className="inline-flex rounded-lg border bg-white p-1" role="group" aria-label="Camera wall columns">
          {CAMERA_WALL_LAYOUTS.map((count) => <button key={count} type="button" aria-pressed={columns === count} onClick={() => setColumns(count)} className={`rounded-md px-2.5 py-1.5 text-xs font-semibold ${columns === count ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-100"}`}><Grid2X2 size={13} className="mr-1 inline"/>{count}</button>)}
        </div>
        <button type="button" className="btn-primary flex items-center gap-2" onClick={() => void startAll()} disabled={loading.size > 0 || online === 0}><Radio size={15}/>{loading.size > 0 ? `Starting ${loading.size}…` : "Start all live"}</button>
      </div>
    </div>
    {cameras.length === 0 ? <div className="card py-10 text-center text-gray-500">No authorized cameras are registered at this branch.</div> : <div className={`grid gap-4 ${columns === 2 ? "md:grid-cols-2" : columns === 3 ? "md:grid-cols-2 xl:grid-cols-3" : "md:grid-cols-2 xl:grid-cols-4"}`}>
      {cameras.map((camera) => <BranchCameraTile
        key={camera.id}
        camera={camera}
        branchId={branchId}
        session={sessions[camera.id]}
        loading={loading.has(camera.id)}
        error={errors[camera.id]}
        ptzOpen={ptzCameraId === camera.id}
        onStart={() => void startCamera(camera.id)}
        onTogglePtz={() => setPtzCameraId((current) => current === camera.id ? null : camera.id)}
      />)}
    </div>}
  </section>;
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
