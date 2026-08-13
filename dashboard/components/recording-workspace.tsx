"use client";

import { AlertTriangle, CalendarClock, CheckCircle2, Clapperboard, LoaderCircle, Play, RefreshCw, Video } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Branch, Camera, RecordingJob, RecordingSegment } from "@/lib/types";

type HealthEvent = {
  id: string;
  eventType: string;
  severity: "info" | "warning" | "critical";
  message: string;
  occurredAt: string;
};

type Availability<T> =
  | { state: "AVAILABLE"; value: T; observedAt: string; freshness: "FRESH" | "STALE"; confidence: number }
  | { state: "UNAVAILABLE"; reason: string; message: string; observedAt: string; retryable: boolean }
  | { state: "UNSUPPORTED"; reason: string };

type VmsView = {
  source: "RECORDER" | "PLATFORM";
  recorderId: string | null;
  capabilities: Record<string, { support: "SUPPORTED" | "PARTIAL" | "UNSUPPORTED"; reason?: string }>;
  recordingStatus: Availability<{ configured: boolean | null; active: boolean | null; latestSegmentAt: string | null }>;
  recordingSearch: Availability<{ summary?: { oldestContinuousAt: string | null; newestPlayableAt: string | null; gapCount: number; largestGapSeconds: number; playbackVerified: boolean | null; reasonCodes: string[] } }>;
  timeline: Availability<{ coverageComplete: boolean; intervals: Array<{ start: string; end: string; state: "RECORDED" | "MISSING" | "UNKNOWN"; segmentId?: string; reason?: string }> }>;
};

export function RecordingWorkspace() {
  const searchParams = useSearchParams();
  const requestedBranchId = searchParams?.get("branchId") ?? "";
  const requestedCameraId = searchParams?.get("cameraId") ?? "";
  const [branches, setBranches] = useState<Branch[]>([]);
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [branchId, setBranchId] = useState("");
  const [cameraId, setCameraId] = useState("");
  const [from, setFrom] = useState(toLocalInput(Date.now() - 24 * 60 * 60 * 1000));
  const [to, setTo] = useState(toLocalInput(Date.now()));
  const [job, setJob] = useState<RecordingJob>();
  const [segments, setSegments] = useState<RecordingSegment[]>([]);
  const [health, setHealth] = useState<HealthEvent[]>([]);
  const [vms, setVms] = useState<VmsView>();
  const [selected, setSelected] = useState<RecordingSegment>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    void fetch("/api/branches", { credentials: "include" })
      .then((response) => {
        if (response.status === 401) {
          window.location.href = "/login";
          return Promise.reject("unauthenticated");
        }
        return response.ok ? response.json() : Promise.reject();
      })
      .then((body: { data: Branch[] }) => {
        setBranches(body.data);
        setBranchId(body.data.some((branch) => branch.id === requestedBranchId) ? requestedBranchId : body.data[0]?.id ?? "");
      })
      .catch(() => setError("Branch directory is unavailable."));
  }, [requestedBranchId]);

  useEffect(() => {
    if (!branchId) return;
    void fetch(`/api/branches/${encodeURIComponent(branchId)}/cameras`, { credentials: "include" })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((body: { data: Camera[] }) => {
        setCameras(body.data);
        setCameraId(body.data.some((camera) => camera.id === requestedCameraId) ? requestedCameraId : body.data[0]?.id ?? "");
        setSegments([]); setSelected(undefined); setHealth([]); setJob(undefined); setVms(undefined);
      })
      .catch(() => setError("Cameras for this branch are unavailable."));
  }, [branchId, requestedCameraId]);

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
      const playback = await playbackResponse.json() as { segments: RecordingSegment[]; vms: VmsView };
      const events = await healthResponse.json() as { data: HealthEvent[] };
      setJob(policy); setSegments(playback.segments); setHealth(events.data); setVms(playback.vms);
      setSelected((current) => current && playback.segments.some((item) => item.id === current.id) ? current : playback.segments.find((item) => item.status === "ready"));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Recording data could not be loaded. Check recorder and access permissions."); }
    finally { setLoading(false); }
  };

  const recordingState = vms?.recordingStatus.state === "AVAILABLE"
    ? vms.recordingStatus.value.active === true ? "Recording" : vms.recordingStatus.value.active === false ? "Stopped" : "Unknown"
    : "Unverified";
  const archiveSummary = vms?.recordingSearch.state === "AVAILABLE" ? vms.recordingSearch.value.summary : undefined;
  const timelineIntervals = vms?.timeline.state === "AVAILABLE" ? vms.timeline.value.intervals : [];
  const playbackCapability = vms?.capabilities.playback;

  return (
    <main className="recording-workspace">
      <header className="recording-header">
        <div><span className="eyebrow">RECORDING OPERATIONS</span><h1>Recording playback</h1><p>Review branch-recorder footage on demand and retain only important incident evidence off-site.</p></div>
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
        <article><span>Primary recorder</span><strong>{job.primaryRecordingStorage === "recorder-local" ? "Branch DVR/NVR" : "Sentinel"}</strong><small>{job.mode} recording at source</small></article>
        <article><span>{job.primaryRecordingStorage === "recorder-local" ? "Recorder evidence" : "Coverage"}</span><strong>{job.primaryRecordingStorage === "recorder-local" ? recordingState : `${coverage}%`}</strong><small>{job.primaryRecordingStorage === "recorder-local" ? (archiveSummary?.newestPlayableAt ? `Latest archive ${formatTime(archiveSummary.newestPlayableAt)}` : availabilityMessage(vms?.recordingSearch)) : `${segments.length} indexed segments in selected range`}</small></article>
        <article><span>Off-site archive</span><strong>{job.cloudArchivePolicy === "incident-evidence-only" ? "Incidents only" : "Disabled"}</strong><small>Snapshots and selected clips only</small></article>
        <article><span>Playback capability</span><strong className={playbackCapability?.support === "UNSUPPORTED" ? "fault" : "healthy"}>{playbackCapability?.support ?? "Unverified"}</strong><small>{playbackCapability?.reason ?? "Browser delivery is normalized by Sentinel"}</small></article>
      </section>}

      {vms && <section className="vms-truth-panel" aria-label="Recorder evidence state">
        <div><strong>{vms.source === "RECORDER" ? `Recorder ${vms.recorderId ?? "unmapped"}` : "Sentinel recording index"}</strong><span>{availabilityMessage(vms.recordingStatus)}</span></div>
        <div className="vms-timeline" aria-label="Recording availability timeline">
          {timelineIntervals.map((interval, index) => <span key={`${interval.start}-${index}`} className={`vms-interval ${interval.state.toLowerCase()}`} style={timelineStyle(interval.start, interval.end, from, to)} title={`${interval.state}: ${formatTime(interval.start)} – ${formatTime(interval.end)}${interval.reason ? ` · ${interval.reason}` : ""}`} />)}
        </div>
        <div className="vms-legend"><span><i className="recorded" />Recorded</span><span><i className="missing" />Missing</span><span><i className="unknown" />Unknown / not observed</span>{vms.timeline.state === "AVAILABLE" && !vms.timeline.value.coverageComplete ? <em>Recorder summary only; gaps are not fabricated.</em> : null}</div>
      </section>}

      <section className="recording-content">
        <article className="recording-player-card">
          <div className="recording-section-heading"><div><CalendarClock size={18} /><h2>{camera?.name ?? "Select a camera"}</h2></div>{selected && <span>{formatTime(selected.startedAt)} – {formatTime(selected.endedAt)}</span>}</div>
          {selected ? <video key={selected.id} className="recording-player" controls preload="metadata"><source src={`/api/recordings/play?segmentId=${encodeURIComponent(selected.id)}`} type="video/mp4" />Your browser cannot play this recording.</video> : <div className="recording-empty"><Clapperboard size={30} /><strong>{vms?.source === "RECORDER" ? "Recorder playback is not available in this browser session" : "No playable segment selected"}</strong><span>{vms?.source === "RECORDER" ? availabilityMessage(vms.recordingSearch) : "Load a time range containing indexed footage."}</span></div>}
        </article>
        <article className="recording-segment-card">
          <div className="recording-section-heading"><div><Play size={18} /><h2>{vms?.source === "RECORDER" ? "Playable recorder clips" : "Indexed segments"}</h2></div><span>{segments.length}</span></div>
          <div className="segment-list">{segments.length === 0 ? <div className="recording-empty"><CheckCircle2 size={25} /><span>{vms?.source === "RECORDER" ? "No browser-deliverable recorder clips were returned. This does not mean footage is absent." : "No indexed footage in this window."}</span></div> : segments.map((segment) => <button key={segment.id} className={`segment-row ${selected?.id === segment.id ? "selected" : ""}`} onClick={() => setSelected(segment)} disabled={segment.status !== "ready"}><span className={`segment-status ${segment.status}`} /><span><strong>{formatTime(segment.startedAt)}</strong><small>{segment.codec?.toUpperCase() ?? "MP4"} · {formatBytes(segment.sizeBytes)}</small></span><span>{Math.max(1, Math.round((Date.parse(segment.endedAt) - Date.parse(segment.startedAt)) / 1000))}s</span></button>)}</div>
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
function availabilityMessage(value: Availability<unknown> | undefined) {
  if (!value) return "Not observed yet";
  if (value.state === "UNAVAILABLE") return value.message;
  if (value.state === "UNSUPPORTED") return value.reason;
  return `${value.freshness === "STALE" ? "Stale" : "Observed"} ${formatTime(value.observedAt)}`;
}
function timelineStyle(start: string, end: string, from: string, to: string) {
  const range = Date.parse(to) - Date.parse(from);
  if (range <= 0) return { left: "0%", width: "0%" };
  const left = Math.max(0, (Date.parse(start) - Date.parse(from)) / range * 100);
  const right = Math.min(100, (Date.parse(end) - Date.parse(from)) / range * 100);
  return { left: `${left}%`, width: `${Math.max(0, right - left)}%` };
}
