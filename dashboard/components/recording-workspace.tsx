"use client";

import { AlertTriangle, CalendarClock, CheckCircle2, Clapperboard, LoaderCircle, Play, RefreshCw, SlidersHorizontal, Video } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Branch, Camera, RecordingJob, RecordingSegment } from "@/lib/types";

type HealthEvent = {
  id: string;
  eventType: string;
  severity: "info" | "warning" | "critical";
  message: string;
  occurredAt: string;
};

export function RecordingWorkspace() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [branchId, setBranchId] = useState("");
  const [cameraId, setCameraId] = useState("");
  const [from, setFrom] = useState(toLocalInput(Date.now() - 24 * 60 * 60 * 1000));
  const [to, setTo] = useState(toLocalInput(Date.now()));
  const [job, setJob] = useState<RecordingJob>();
  const [segments, setSegments] = useState<RecordingSegment[]>([]);
  const [health, setHealth] = useState<HealthEvent[]>([]);
  const [selected, setSelected] = useState<RecordingSegment>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    void fetch("/api/branches")
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((body: { data: Branch[] }) => {
        setBranches(body.data);
        setBranchId(body.data[0]?.id ?? "");
      })
      .catch(() => setError("Branch directory is unavailable."));
  }, []);

  useEffect(() => {
    if (!branchId) return;
    void fetch(`/api/branches/${encodeURIComponent(branchId)}/cameras`)
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((body: { data: Camera[] }) => {
        setCameras(body.data);
        setCameraId(body.data[0]?.id ?? "");
        setSegments([]); setSelected(undefined); setHealth([]); setJob(undefined);
      })
      .catch(() => setError("Cameras for this branch are unavailable."));
  }, [branchId]);

  const camera = cameras.find((item) => item.id === cameraId);
  const criticalFault = health.find((event) => event.severity === "critical");
  const coverage = useMemo(() => coveragePercent(segments, from, to), [segments, from, to]);

  const loadRecording = async () => {
    if (!cameraId) return;
    setLoading(true); setError(undefined);
    try {
      const fromIso = new Date(from).toISOString();
      const toIso = new Date(to).toISOString();
      if (Date.parse(toIso) <= Date.parse(fromIso)) {
        throw new Error("End time must be after start time.");
      }
      const [policyResponse, playbackResponse, healthResponse] = await Promise.all([
        fetch(`/api/recording/${encodeURIComponent(cameraId)}`),
        fetch(`/api/control/v1/cameras/${encodeURIComponent(cameraId)}/playback?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`),
        fetch(`/api/control/v1/cameras/${encodeURIComponent(cameraId)}/recording/health?limit=20`),
      ]);
      if (!policyResponse.ok || !playbackResponse.ok || !healthResponse.ok) throw new Error();
      const policy = await policyResponse.json() as RecordingJob;
      const playback = await playbackResponse.json() as { segments: RecordingSegment[] };
      const events = await healthResponse.json() as { data: HealthEvent[] };
      setJob(policy); setSegments(playback.segments); setHealth(events.data);
      setSelected((current) => current && playback.segments.some((item) => item.id === current.id) ? current : playback.segments.find((item) => item.status === "ready"));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Recording data could not be loaded. Check recorder and access permissions."); }
    finally { setLoading(false); }
  };

  return (
    <main className="recording-workspace">
      <header className="recording-header">
        <div><span className="eyebrow">PHASE 1 RECORDING</span><h1>Recording playback</h1><p>Review indexed MP4 segments and recorder faults without opening Live View.</p></div>
        <a href="/" className="secondary-button"><Video size={15} />Live wall</a>
      </header>

      <section className="recording-filters" aria-label="Recording playback filters">
        <label>Branch<select value={branchId} onChange={(event) => setBranchId(event.target.value)}>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
        <label>Camera<select value={cameraId} onChange={(event) => setCameraId(event.target.value)}>{cameras.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>From<input type="datetime-local" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
        <label>To<input type="datetime-local" value={to} onChange={(event) => setTo(event.target.value)} /></label>
        <button className="primary-button" onClick={() => void loadRecording()} disabled={!cameraId || loading}>{loading ? <LoaderCircle className="spin" size={16} /> : <RefreshCw size={16} />}Load recording</button>
      </section>

      {error && <div className="error-banner"><AlertTriangle size={17} />{error}</div>}
      {job && <section className="recording-summary">
        <article><span>Recording state</span><strong className={`recording-state ${job.status}`}>{job.status}</strong><small>{job.mode} · {job.segmentDurationSeconds}s segments</small></article>
        <article><span>Coverage</span><strong>{coverage}%</strong><small>{segments.length} indexed segments in selected range</small></article>
        <article><span>Retention</span><strong>{job.retentionDays} days</strong><small>{job.hotRetentionDays} hot · {job.warmRetentionDays} warm · {job.coldRetentionDays} cold</small></article>
        <article><span>Recorder health</span><strong className={criticalFault ? "fault" : "healthy"}>{criticalFault ? "Fault present" : "No critical fault"}</strong><small>{criticalFault?.message ?? "Review event history below"}</small></article>
      </section>}

      <section className="recording-content">
        <article className="recording-player-card">
          <div className="recording-section-heading"><div><CalendarClock size={18} /><h2>{camera?.name ?? "Select a camera"}</h2></div>{selected && <span>{formatTime(selected.startedAt)} – {formatTime(selected.endedAt)}</span>}</div>
          {selected ? <video key={selected.id} className="recording-player" controls preload="metadata"><source src={`/api/recordings/play?segmentId=${encodeURIComponent(selected.id)}`} type="video/mp4" />Your browser cannot play this recording.</video> : <div className="recording-empty"><Clapperboard size={30} /><strong>No playable segment selected</strong><span>Load a time range containing indexed footage.</span></div>}
        </article>
        <article className="recording-segment-card">
          <div className="recording-section-heading"><div><Play size={18} /><h2>Indexed segments</h2></div><span>{segments.length}</span></div>
          <div className="segment-list">{segments.length === 0 ? <div className="recording-empty"><CheckCircle2 size={25} /><span>No indexed footage in this window.</span></div> : segments.map((segment) => <button key={segment.id} className={`segment-row ${selected?.id === segment.id ? "selected" : ""}`} onClick={() => setSelected(segment)} disabled={segment.status !== "ready"}><span className={`segment-status ${segment.status}`} /><span><strong>{formatTime(segment.startedAt)}</strong><small>{segment.codec?.toUpperCase() ?? "MP4"} · {formatBytes(segment.sizeBytes)}</small></span><span>{Math.max(1, Math.round((Date.parse(segment.endedAt) - Date.parse(segment.startedAt)) / 1000))}s</span></button>)}</div>
        </article>
      </section>

      <section className="recording-health-card"><div className="recording-section-heading"><div><AlertTriangle size={18} /><h2>Recorder events</h2></div><span>Latest 20</span></div>{health.length === 0 ? <div className="recording-empty"><CheckCircle2 size={25} /><span>No recorder events reported for this camera.</span></div> : <div className="health-list">{health.map((event) => <article key={event.id} className={`health-row ${event.severity}`}><span>{event.severity}</span><div><strong>{event.message}</strong><small>{event.eventType} · {formatTime(event.occurredAt)}</small></div></article>)}</div>}</section>
    </main>
  );
}

function toLocalInput(value: number) { const date = new Date(value - new Date().getTimezoneOffset() * 60_000); return date.toISOString().slice(0, 16); }
function formatTime(value: string) { return new Date(value).toLocaleString(); }
function formatBytes(value: number) { return value > 1_000_000 ? `${(value / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(value / 1_000))} KB`; }
function coveragePercent(segments: RecordingSegment[], from: string, to: string) { const duration = Date.parse(to) - Date.parse(from); if (duration <= 0) return 0; const recorded = segments.filter((segment) => segment.status === "ready").reduce((total, segment) => total + Math.max(0, Date.parse(segment.endedAt) - Date.parse(segment.startedAt)), 0); return Math.min(100, Number((recorded / duration * 100).toFixed(2))); }
