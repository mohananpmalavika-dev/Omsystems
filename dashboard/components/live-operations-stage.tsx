"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Activity, ArrowUpRight, Building2, Camera as CameraIcon, Check, ChevronLeft, ChevronRight, Crosshair, Eye, Film, LayoutDashboard, Lock, Maximize2, Minimize2, Pin, PinOff, RefreshCw, Search, ShieldAlert, X } from "lucide-react";
import { fleetCameraPage, fleetTileOptions, operationalStageAlerts } from "./live-stage-model";
import { EnhancedCameraGrid, type GridLayout, type GridSize } from "./enhanced-camera-grid";
import { PlaybackController } from "./playback-controller";
import { CameraInterventionModal } from "./camera-intervention-modal";
import { CameraLocationEditor } from "./camera-location-editor";
import { analyticsApi } from "@/lib/api-client";
import type { AnalyticsAlert, AnalyticsRule, Camera } from "@/lib/types";
import { LIVE_TOUR_INTERVALS } from "@/lib/live-tour-intervals";

type Mode = "watch" | "investigate" | "respond" | "overview" | "fleet";
type ReplaySegment = { id: string; startTime: string; endTime: string };
const MODES = [{ id: "watch", label: "Watch", icon: Eye }, { id: "investigate", label: "Investigate", icon: Film }, { id: "respond", label: "Respond", icon: ShieldAlert }, { id: "overview", label: "Overview", icon: LayoutDashboard }, { id: "fleet", label: "Fleet wall", icon: CameraIcon }] as const;
const SCENES = [
  { id: "all", label: "Whole scene", keywords: [] },
  { id: "entrance", label: "Entrance", keywords: ["entrance", "entry", "ingress", "door", "lobby", "gate"] },
  { id: "cash", label: "Cash area", keywords: ["cash", "counter", "teller", "desk"] },
  { id: "vault", label: "Vault", keywords: ["vault", "strongroom", "locker", "safe", "gold"] },
  { id: "perimeter", label: "Perimeter", keywords: ["perimeter", "outer", "rear", "exit", "parking", "backdoor"] },
] as const;
const terminal = new Set(["resolved", "false_alarm", "suppressed"]);
function matchesScene(camera: Camera, keywords: readonly string[]) {
  const context = camera as Camera & { location?: string; zoneName?: string; zone?: string };
  const location = camera.locationType === "strong-room" ? "cash room vault strongroom" : camera.locationType;
  const text = [location || camera.name, context.location, context.zoneName, context.zone].filter(Boolean).join(" ").toLowerCase();
  return !keywords.length || keywords.some(keyword => text.includes(keyword));
}
function eventTime(alert: AnalyticsAlert) { return alert.firstDetectedAt || alert.createdAt || alert.lastDetectedAt; }
function timeLabel(value?: string) { return value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "Time unavailable"; }

export function LiveOperationsStage({ cameras, alerts, aiByCamera, showAiOverlay, focusCameraId, maxConcurrentStreams, analyticsError, analyticsLoading, onRefresh, onActiveStreamsChange, onMonitoredCamerasChange, onOpenCameraAi, onCameraLocationChange, initialMode = "watch", cameraOnly = false }: {
  cameras: Camera[]; alerts: AnalyticsAlert[]; aiByCamera: ReadonlyMap<string, { rules: AnalyticsRule[]; alerts: AnalyticsAlert[] }>;
  showAiOverlay: boolean; focusCameraId?: string; maxConcurrentStreams: number; analyticsError?: string; analyticsLoading: boolean;
  onRefresh: () => Promise<void>; onActiveStreamsChange: (count: number) => void; onMonitoredCamerasChange: (ids: string[]) => void; onOpenCameraAi: (id: string) => void;
  initialMode?: Mode;
  cameraOnly?: boolean;
  onCameraLocationChange: (cameraId: string, locationType: string) => void;
}) {
  const [mode, setMode] = useState<Mode>(cameraOnly ? "fleet" : initialMode);
  const [fleetTileCount, setFleetTileCount] = useState<number | "all">("all");
  const [fleetPage, setFleetPage] = useState(0);
  const [fleetBranch, setFleetBranch] = useState("all");
  const [fleetRotating, setFleetRotating] = useState(false);
  const [fleetTourIntervalSec, setFleetTourIntervalSec] = useState(15);
  const [sceneId, setSceneId] = useState("all");
  const [cameraId, setCameraId] = useState<string>();
  const [pinned, setPinned] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string>();
  const [contextOpen, setContextOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ error: boolean; text: string }>();
  const [interventionsOpen, setInterventionsOpen] = useState(false);
  const [segments, setSegments] = useState<ReplaySegment[]>([]);
  const [replayLoading, setReplayLoading] = useState(false);
  const [replayError, setReplayError] = useState<string>();
  const [replayAnchor, setReplayAnchor] = useState<string>();
  const [replayNonce, setReplayNonce] = useState(0);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string>();
  const [monitorFullscreen, setMonitorFullscreen] = useState(false);
  const [networkTrafficMbps, setNetworkTrafficMbps] = useState<number | null>(null);
  const [fleetMonitorHeight, setFleetMonitorHeight] = useState<number>();
  const monitorRef = useRef<HTMLDivElement>(null);
  const previousScope = useRef("");
  const externalFocus = useRef<string | undefined>(undefined);

  const scene = SCENES.find(item => item.id === sceneId) ?? SCENES[0];
  const scoped = useMemo(() => cameras.filter(camera => matchesScene(camera, scene.keywords)), [cameras, scene]);
  const active = scoped.find(camera => camera.id === cameraId) ?? scoped[0];
  const scopedIds = useMemo(() => new Set(scoped.map(camera => camera.id)), [scoped]);
  const scopedEvents = useMemo(() => operationalStageAlerts(alerts, scopedIds).sort((a, b) => (Date.parse(eventTime(b)) || 0) - (Date.parse(eventTime(a)) || 0)), [alerts, scopedIds]);
  const attention = [...scopedEvents].filter(alert => !terminal.has(alert.status)).sort((a, b) => a.severity.localeCompare(b.severity));
  const selectedEvent = scopedEvents.find(alert => alert.id === selectedEventId && alert.cameraId === active?.id);
  const draftKey = selectedEvent?.id ?? active?.id ?? "";
  const branches = useMemo(() => {
    const groups = new Map<string, Camera[]>();
    scoped.forEach(camera => { const key = camera.branchId || "unassigned"; groups.set(key, [...(groups.get(key) ?? []), camera]); });
    return Array.from(groups.entries()).map(([id, members]) => ({ id, members, name: members[0].branchName || "Unassigned branch" }));
  }, [scoped]);
  const fleetTotal = fleetBranch === "all" ? scoped.length : branches.find(branch => branch.id === fleetBranch)?.members.length ?? 0;
  const tileOptions = useMemo(() => fleetTileOptions(fleetTotal), [fleetTotal]);
  const fleetTileSelection = fleetTileCount === "all" || fleetTileCount > tileOptions.length ? "all" : fleetTileCount;
  const fleetPageSize = fleetTileSelection === "all" ? Math.max(1, tileOptions.length) : fleetTileSelection;
  const fleet = useMemo(() => fleetCameraPage(scoped, fleetBranch, fleetPageSize, fleetPage), [scoped, fleetBranch, fleetPageSize, fleetPage]);
  const fleetColumns = Math.min(12, Math.ceil(Math.sqrt(Math.max(1, fleet.cameras.length))));
  useEffect(() => {
    if (mode !== "fleet" || !fleetRotating || fleet.pageCount < 2) return;
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") setFleetPage(page => (page + 1) % fleet.pageCount); }, fleetTourIntervalSec * 1000);
    return () => window.clearInterval(timer);
  }, [mode, fleetRotating, fleet.pageCount, fleetTourIntervalSec]);
  useEffect(() => { if (fleetBranch !== "all" && !branches.some(branch => branch.id === fleetBranch)) { setFleetBranch("all"); setFleetPage(0); } }, [branches, fleetBranch]);
  const stageCameras = useMemo(() => mode === "fleet" ? fleet.cameras : mode === "overview" ? branches.slice(0, 4).map(branch => branch.members[0]) : active ? [active] : [], [mode, active, branches, fleet]);
  const layout = useMemo<GridLayout>(() => ({ name: "Operations stage", gridSize: mode === "fleet" ? `${fleetColumns}x${fleetColumns}` as GridSize : mode === "overview" && stageCameras.length > 1 ? "2x2" : "1x1", positions: stageCameras.map((camera, position) => ({ cameraId: camera.id, position, stream: mode === "overview" || mode === "fleet" ? "sub" : "main" })) }), [mode, stageCameras, fleetColumns]);
  const scopeSignature = scoped.map(camera => camera.id).join("|");
  useEffect(() => {
    if (previousScope.current !== scopeSignature && cameraId && !scopedIds.has(cameraId)) {
      setPinned(false); setSelectedEventId(undefined); setCameraId(scoped[0]?.id);
    }
    previousScope.current = scopeSignature;
  }, [scopeSignature, scopedIds, scoped, cameraId]);
  useEffect(() => {
    if (focusCameraId && externalFocus.current !== focusCameraId && cameras.some(camera => camera.id === focusCameraId)) {
      externalFocus.current = focusCameraId;
      setSceneId("all"); setCameraId(focusCameraId); setSelectedEventId(undefined); setContextOpen(true);
    }
  }, [focusCameraId, cameras]);
  useEffect(() => { if (mode === "investigate" && !selectedEvent && !replayAnchor) setReplayAnchor(new Date().toISOString()); }, [mode, selectedEvent, replayAnchor]);
  useEffect(() => {
    const syncFullscreen = () => setMonitorFullscreen(document.fullscreenElement === monitorRef.current);
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);
  useEffect(() => {
    if (mode !== "fleet") return;
    let frame = 0;
    const fitMonitor = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const top = monitorRef.current?.getBoundingClientRect().top;
        if (top === undefined) return;
        setFleetMonitorHeight(Math.max(180, Math.floor(window.innerHeight - Math.max(0, top) - (cameraOnly ? 0 : 12))));
      });
    };
    fitMonitor();
    window.addEventListener("resize", fitMonitor);
    window.visualViewport?.addEventListener("resize", fitMonitor);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", fitMonitor);
      window.visualViewport?.removeEventListener("resize", fitMonitor);
    };
  }, [mode, fleetBranch, fleetPageSize, contextOpen, cameraOnly]);

  const anchor = selectedEvent ? eventTime(selectedEvent) : replayAnchor;
  const replayWindow = useMemo(() => {
    const timestamp = anchor ? Date.parse(anchor) : NaN;
    return Number.isFinite(timestamp) ? { from: new Date(timestamp - 30_000).toISOString(), to: new Date(timestamp + 60_000).toISOString(), timestamp } : undefined;
  }, [anchor]);
  useEffect(() => {
    if (mode !== "investigate" || !active || !replayWindow) return;
    const controller = new AbortController(); setReplayLoading(true); setReplayError(undefined); setSegments([]); setSelectedSegmentId(undefined);
    const params = new URLSearchParams({ from: replayWindow.from, to: replayWindow.to });
    const token = localStorage.getItem("accessToken");
    void fetch(`/api/control/v1/cameras/${encodeURIComponent(active.id)}/playback?${params}`, { credentials: "include", headers: token ? { "x-sentinel-session": token } : {}, signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error("Recorded playback is unavailable for this camera."); return response.json(); })
      .then(body => { if (!controller.signal.aborted) { const available: ReplaySegment[] = Array.isArray(body.segments) ? body.segments.filter((segment: { status?: string; cameraId?: string }) => segment.status === "ready" && (!segment.cameraId || segment.cameraId === active.id)).map((segment: { id: string; startedAt?: string; endedAt?: string; startTime?: string; endTime?: string }) => ({ id: segment.id, startTime: segment.startedAt ?? segment.startTime ?? "", endTime: segment.endedAt ?? segment.endTime ?? "" })).filter((segment: ReplaySegment) => segment.id && Number.isFinite(Date.parse(segment.startTime)) && Number.isFinite(Date.parse(segment.endTime))) : []; setSegments(available); setSelectedSegmentId(available.find(segment => Date.parse(segment.startTime) <= replayWindow.timestamp && Date.parse(segment.endTime) >= replayWindow.timestamp)?.id ?? available[0]?.id); } })
      .catch(error => { if (!controller.signal.aborted) setReplayError(error instanceof Error ? error.message : "Replay unavailable."); })
      .finally(() => { if (!controller.signal.aborted) setReplayLoading(false); });
    return () => controller.abort();
  }, [mode, active?.id, replayWindow, replayNonce]);
  const selectedSegment = segments.find(segment => segment.id === selectedSegmentId);

  function selectCamera(id: string) { if (busy) return; if (mode === "fleet") setMode("watch"); setCameraId(id); setPinned(false); setInterventionsOpen(false); setSelectedEventId(undefined); setFeedback(undefined); setReplayAnchor(undefined); }
  function toggleMonitorFullscreen() {
    if (document.fullscreenElement === monitorRef.current) void document.exitFullscreen();
    else void monitorRef.current?.requestFullscreen();
  }
  function stepCamera(direction: -1 | 1) {
    if (!scoped.length) return;
    const currentIndex = Math.max(0, scoped.findIndex(camera => camera.id === active?.id));
    selectCamera(scoped[(currentIndex + direction + scoped.length) % scoped.length].id);
  }
  function selectEvent(alert: AnalyticsAlert) {
    if (busy) return;
    setCameraId(alert.cameraId); setPinned(false); setInterventionsOpen(false); setSelectedEventId(alert.id); setMode("investigate"); setContextOpen(true); setFeedback(undefined);
  }
  async function respond(action: "acknowledge" | "investigating" | "incident" | "resolved") {
    if (!selectedEvent || busy) return;
    setBusy(true); setFeedback(undefined);
    try {
      if (action === "acknowledge") await analyticsApi.acknowledge(selectedEvent.id, notes[draftKey]?.trim() || "Acknowledged from Live Operations Stage");
      else if (action === "incident") await analyticsApi.createIncident(selectedEvent.id, { notes: notes[draftKey]?.trim() || "Created from Live Operations Stage" });
      else await analyticsApi.updateAlert(selectedEvent.id, { status: action });
      setFeedback({ error: false, text: action === "incident" ? "Incident created." : action === "acknowledge" ? "Event acknowledged." : `Event marked ${action}.` });
      await onRefresh();
    } catch (error) { setFeedback({ error: true, text: error instanceof Error ? error.message : "The action could not be completed." }); }
    finally { setBusy(false); }
  }
  const related = scoped.filter(camera => camera.id !== active?.id).sort((a, b) => Number(b.branchId === active?.branchId) - Number(a.branchId === active?.branchId)).filter(camera => !query || `${camera.name} ${camera.branchName ?? ""}`.toLowerCase().includes(query.toLowerCase()));
  const contextVisible = contextOpen || mode === "respond";
  const fleetRows = Math.max(1, Math.ceil(stageCameras.length / fleetColumns));
  const fleetMetaHeight = Math.min(32, Math.max(12, Math.floor(((fleetMonitorHeight ?? 600) - 33) / fleetRows * 0.23)));
  const fleetMonitorStyle = mode === "fleet" ? {
    "--fleet-monitor-height": fleetMonitorHeight ? `${fleetMonitorHeight}px` : "75dvh",
    "--fleet-row-count": fleetRows,
    "--fleet-mobile-columns": Math.min(2, fleetColumns),
    "--fleet-mobile-row-count": Math.ceil(stageCameras.length / Math.min(2, fleetColumns)),
    "--fleet-meta-height": `${fleetMetaHeight}px`,
  } as CSSProperties : undefined;
  const monitor = (<div ref={monitorRef} className={`los-video-stage ${mode === "fleet" && stageCameras.length > 36 ? "fleet-dense" : ""}`} style={fleetMonitorStyle} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); const id = event.dataTransfer.getData("text/plain"); if (!cameraOnly && scopedIds.has(id)) { selectCamera(id); setMode("watch"); } }}>
          <div className="los-monitor-bar"><span><i aria-hidden="true" />{mode === "fleet" || mode === "overview" ? "MULTI-FEED MONITOR" : active?.status?.toLowerCase() === "online" ? mode === "investigate" ? "LIVE SOURCE / REPLAY BELOW" : "LIVE SOURCE" : "CAMERA MONITOR"}</span><div className="los-monitor-actions"><span className="los-network-traffic" title="Measured video traffic received by this browser; this is not an internet speed test">VIDEO DOWN {networkTrafficMbps === null ? "—" : `${networkTrafficMbps.toFixed(2)} Mbps`}</span><span>{mode === "fleet" ? `PAGE ${fleet.currentPage + 1} / ${fleet.pageCount}` : mode === "overview" ? `${stageCameras.length} BRANCH FEEDS` : active?.branchName || "NO BRANCH SELECTED"}</span>{cameraOnly && fleet.pageCount > 1 && <><button type="button" aria-label="Previous feeds" disabled={fleet.currentPage === 0} onClick={() => setFleetPage(fleet.currentPage - 1)}><ChevronLeft size={14} /></button><button type="button" aria-label="Next feeds" disabled={fleet.currentPage + 1 === fleet.pageCount} onClick={() => setFleetPage(fleet.currentPage + 1)}><ChevronRight size={14} /></button></>}<button type="button" onClick={toggleMonitorFullscreen} aria-label={monitorFullscreen ? "Exit fullscreen monitor" : "Open fullscreen monitor"} aria-pressed={monitorFullscreen} title={monitorFullscreen ? "Exit fullscreen monitor (Esc)" : "Open fullscreen monitor"}>{monitorFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}{monitorFullscreen ? "Exit fullscreen" : "Fullscreen"}</button></div></div>
          {stageCameras.length ? <EnhancedCameraGrid key={mode === "fleet" ? `fleet:${fleetBranch}:${fleetPageSize}:${fleet.currentPage}` : mode === "overview" ? "overview" : active?.id} cameras={stageCameras} initialLayout={layout} compactStage tileCount={mode === "fleet" ? stageCameras.length : undefined} maxConcurrentStreams={mode === "fleet" ? Math.max(144, stageCameras.length, maxConcurrentStreams) : mode === "overview" ? Math.max(4, Math.min(16, maxConcurrentStreams)) : Math.max(16, maxConcurrentStreams)} enableVirtualScrolling={false} aiByCamera={aiByCamera} showAiOverlay={showAiOverlay} onOpenCameraAi={cameraOnly ? undefined : onOpenCameraAi} onActiveStreamsChange={onActiveStreamsChange} onNetworkTrafficChange={setNetworkTrafficMbps} onMonitoredCamerasChange={onMonitoredCamerasChange} /> : <div className="los-empty"><CameraIcon size={36} /><strong>No cameras in this scene.</strong><p>Choose another area or adjust the wall scope.</p></div>}
        </div>);
  if (cameraOnly) return <div className="live-operations-stage mode-fleet camera-only-wall">{monitor}</div>;
  return <div className={`live-operations-stage mode-${mode}`}>
    <header className="los-mode-bar"><div className="los-mode-intro"><span className="los-eyebrow">OPERATING LENS / {String(MODES.findIndex(item => item.id === mode) + 1).padStart(2, "0")}</span><h2>Choose your lens<span>.</span></h2></div><nav aria-label="Operations modes">{MODES.map(item => <button key={item.id} type="button" aria-pressed={mode === item.id} disabled={busy} onClick={() => setMode(item.id)}><item.icon size={16} />{item.label}</button>)}</nav><button type="button" className="los-context-toggle" aria-expanded={contextVisible} onClick={() => { if (mode === "respond") setMode("watch"); setContextOpen(!contextVisible); }}><Activity size={16} />Context{attention.length > 0 && <span className="los-context-count">{attention.length}</span>}</button></header>
    <div className="los-workspace">
      <nav className="los-scene-nav" aria-label="Scene navigator">
        <div className="los-scene-heading"><span className="los-scene-radar" aria-hidden="true"><Crosshair size={17} /></span><div><span className="los-eyebrow">SECTOR INDEX / LIVE COVERAGE</span><p>Jump to an area</p></div><span className="los-scene-total">{scoped.length} feeds · {branches.length} branches</span></div>
        <div className="los-scene-track">{SCENES.map((item, index) => {
          const members = cameras.filter(camera => matchesScene(camera, item.keywords));
          const online = members.filter(camera => camera.status?.toLowerCase() === "online").length;
          return <button key={item.id} type="button" disabled={busy || members.length === 0} aria-pressed={sceneId === item.id} onClick={() => { setSceneId(item.id); setSelectedEventId(undefined); setPinned(false); }}><span className="los-sector-code">S{String(index + 1).padStart(2, "0")}<i aria-hidden="true" /></span><strong>{item.label}</strong><small>{online}/{members.length} online</small></button>;
        })}</div>
      </nav>
      <div className="los-main">
        <div className="los-stage-heading"><div><span className="los-eyebrow">{mode === "fleet" ? "FLEET / MULTI-CAMERA VIEW" : mode === "overview" ? "BRANCH SCENES / UP TO 4 LIVE FEEDS" : pinned ? "PINNED FOCUS / OPERATOR CONTROL" : "FOCUS / LIVE VIEW"}</span><h3>{mode === "fleet" ? "Your fleet, in view." : mode === "overview" ? "Across your scope" : active?.name ?? "No camera in this scene"}</h3><p>{mode === "fleet" ? `${fleet.total} cameras in scope · ${stageCameras.length} tiles on this page · up to ${Math.min(Math.max(144, stageCameras.length), stageCameras.length)} simultaneous streams` : mode === "overview" ? "Expand a branch scene to take focus." : active?.branchName || "Branch not recorded"}</p></div><div>{active && mode !== "overview" && mode !== "fleet" && <div className="los-focus-stepper"><button type="button" aria-label="Previous camera" disabled={busy || scoped.length < 2} onClick={() => stepCamera(-1)}><ChevronLeft size={17} /></button><span className="los-focus-index" aria-label={`Camera ${scoped.findIndex(camera => camera.id === active.id) + 1} of ${scoped.length}`}>{String(scoped.findIndex(camera => camera.id === active.id) + 1).padStart(2, "0")}<b>/</b>{String(scoped.length).padStart(2, "0")}</span><button type="button" aria-label="Next camera" disabled={busy || scoped.length < 2} onClick={() => stepCamera(1)}><ChevronRight size={17} /></button></div>}{active && mode !== "overview" && mode !== "fleet" && <button type="button" aria-pressed={pinned} aria-label={pinned ? "Unpin focus camera" : "Pin focus camera"} onClick={() => { if (active) setCameraId(active.id); setPinned(!pinned); }}>{pinned ? <PinOff size={16} /> : <Pin size={16} />}{pinned ? "Pinned" : "Pin"}</button>}</div></div>
        {active && mode !== "overview" && mode !== "fleet" && <CameraLocationEditor key={active.id} camera={active} onSaved={onCameraLocationChange} />}
        {mode === "fleet" && <div className="los-fleet-toolbar">
          <label>Branch<select aria-label="Fleet branch" value={fleetBranch} onChange={event => { setFleetBranch(event.target.value); setFleetTileCount("all"); setFleetPage(0); }}>{[{ id: "all", name: "All branches" }, ...branches].map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
          <label>Tiles<select aria-label="Fleet tile layout" value={fleetTileSelection} onChange={event => { setFleetTileCount(event.target.value === "all" ? "all" : Number(event.target.value)); setFleetPage(0); }}><option value="all">{fleetTotal > 144 ? `144 per page (${fleetTotal} total)` : `All cameras (${fleetTotal})`}</option>{tileOptions.map(count => <option key={count} value={count}>{count} {count === 1 ? "tile" : "tiles"}</option>)}</select></label>
          <button type="button" disabled={busy || fleet.currentPage === 0} onClick={() => setFleetPage(fleet.currentPage - 1)}>Previous feeds</button>
          <span role="status">Page {fleet.currentPage + 1} / {fleet.pageCount}</span>
          <button type="button" disabled={busy || fleet.currentPage + 1 === fleet.pageCount} onClick={() => setFleetPage(fleet.currentPage + 1)}>Next feeds</button>
          <label>Tour interval<select aria-label="Live tour interval" value={fleetTourIntervalSec} onChange={event => setFleetTourIntervalSec(Number(event.target.value))}>{LIVE_TOUR_INTERVALS.map(interval => <option key={interval.seconds} value={interval.seconds}>{interval.label}</option>)}</select></label>
          <button type="button" aria-pressed={fleetRotating} onClick={() => setFleetRotating(!fleetRotating)}>{fleetRotating ? "Pause tour" : "Start tour"}</button>
          <small>Substreams use the configured viewer capacity. Select a camera in the dock to investigate it.</small>
        </div>}
        {monitor}
        {mode === "investigate" && <section className="los-replay" aria-label="Recorded replay"><header><div><span className="los-eyebrow">RECORDED / {selectedEvent ? "EVENT WINDOW" : "RECENT WINDOW"}</span><h3>Review what led here.</h3><p>{replayWindow ? `${timeLabel(replayWindow.from)} → ${timeLabel(replayWindow.to)}` : "Select an event to set the replay window."}</p></div><button type="button" onClick={() => { if (!selectedEvent) setReplayAnchor(new Date().toISOString()); setReplayNonce(value => value + 1); }} disabled={replayLoading}><RefreshCw size={15} />Refresh replay</button></header>{replayLoading ? <div className="los-empty">Looking for recorded coverage…</div> : replayError ? <p role="alert">{replayError}</p> : selectedSegment && active ? <><PlaybackController key={`${active.id}:${selectedSegment.id}:${anchor}`} segmentId={selectedSegment.id} cameraId={active.id} cameraName={active.name} startTime={selectedSegment.startTime} endTime={selectedSegment.endTime} initialOffsetSeconds={Math.max(0, ((replayWindow?.timestamp ?? Date.parse(selectedSegment.startTime)) - Date.parse(selectedSegment.startTime)) / 1000)} /><label>Recorded segment<select value={selectedSegment.id} onChange={event => setSelectedSegmentId(event.target.value)}>{segments.map(segment => <option key={segment.id} value={segment.id}>{timeLabel(segment.startTime)} → {timeLabel(segment.endTime)}</option>)}</select></label></> : <div className="los-empty"><Film size={26} /><strong>No playable recording in this window.</strong><p>Live video remains available above. Recorder archives can be reviewed in the recording workspace.</p></div>}{active && <Link href={`/recordings?cameraId=${encodeURIComponent(active.id)}`}>Open recording workspace <ArrowUpRight size={14} /></Link>}</section>}
        {mode === "overview" ? <div className="los-branch-scenes">{branches.map(branch => <button key={branch.id} type="button" onClick={() => { selectCamera(branch.members[0].id); setMode("watch"); }}><Building2 size={22} /><div><strong>{branch.name}</strong><small>{branch.members.length} cameras in scope · {attention.filter(alert => branch.members.some(camera => camera.id === alert.cameraId)).length} open events</small></div><ArrowUpRight size={18} /></button>)}</div> : <section className="los-feed-dock" aria-label="Related camera dock"><header><div><span className="los-eyebrow">RELATED FEEDS / SELECT OR DRAG TO FOCUS</span><h3>Keep the context close.</h3></div><label><Search size={14} /><input aria-label="Search related cameras" placeholder="Find another feed" value={query} onChange={event => setQuery(event.target.value)} /></label></header><div className="los-dock-items">{related.map(camera => <button key={camera.id} type="button" disabled={busy} draggable onDragStart={event => event.dataTransfer.setData("text/plain", camera.id)} onClick={() => selectCamera(camera.id)}><span className="los-feed-symbol"><CameraIcon size={23} /><i data-status={camera.status} /></span><strong>{camera.name}</strong><small>{camera.branchName || "Unassigned branch"} · {camera.status}</small><span>{camera.branchId === active?.branchId ? "Same branch" : "Across scope"}<ChevronRight size={12} /></span></button>)}{!related.length && <p className="los-empty">No other cameras match this scope or search.</p>}</div></section>}
      </div>
      {contextVisible && <aside className="los-context" aria-label="Situation context"><header><span className="los-eyebrow">SITUATION BRIEF</span><button type="button" aria-label="Close situation context" disabled={busy} onClick={() => { setContextOpen(false); if (mode === "respond") setMode("watch"); }}><X size={17} /></button></header>{selectedEvent ? <><span className="los-severity" data-severity={selectedEvent.severity}>{selectedEvent.severity} / {selectedEvent.status.replaceAll("_", " ")}</span><h3>{selectedEvent.title}</h3><p>{selectedEvent.description || "Review the feed and recording before responding."}</p><dl><div><dt>Detected</dt><dd>{timeLabel(eventTime(selectedEvent))}</dd></div><div><dt>Confidence</dt><dd>{Math.round(selectedEvent.confidence * 100)}%</dd></div><div><dt>Camera</dt><dd>{active?.name}</dd></div><div><dt>Occurrences</dt><dd>{selectedEvent.occurrenceCount ?? "Not reported"}</dd></div></dl><button className="los-primary" type="button" disabled={busy} onClick={() => setMode(mode === "respond" ? "investigate" : "respond")}>{mode === "respond" ? "Review the recording" : "Prepare response"}<ArrowUpRight size={15} /></button></> : <><Crosshair size={32} /><h3>{active?.name ?? "Choose a camera."}</h3><p>Select a timestamped event to bring its evidence and response context here.</p>{active && <dl><div><dt>Branch</dt><dd>{active.branchName || "Not recorded"}</dd></div><div><dt>Inventory status</dt><dd>{active.status}</dd></div><div><dt>Open events</dt><dd>{attention.filter(alert => alert.cameraId === active.id).length}</dd></div></dl>}</>}
        {mode === "respond" && <div className="los-response"><label>Response notes<textarea rows={4} value={notes[draftKey] ?? ""} maxLength={4000} onChange={event => setNotes(current => ({ ...current, [draftKey]: event.target.value }))} placeholder="Observations and intended next action" /></label><small>Draft stays in this page. Notes are sent when acknowledging or creating an incident.</small>{selectedEvent && !terminal.has(selectedEvent.status) && <div className="los-response-actions">{selectedEvent.status === "new" && <button type="button" disabled={busy} onClick={() => void respond("acknowledge")}><Check size={14} />Acknowledge</button>}<button type="button" disabled={busy} onClick={() => void respond("investigating")}>Mark investigating</button>{!selectedEvent.incidentId && <button type="button" disabled={busy} onClick={() => void respond("incident")}>Create incident</button>}<button type="button" disabled={busy} onClick={() => void respond("resolved")}>Resolve event</button></div>}{selectedEvent?.incidentId && <Link href={`/incidents/${encodeURIComponent(selectedEvent.incidentId)}`}>Open linked incident <ArrowUpRight size={14} /></Link>}{!selectedEvent && active && <Link href={`/incidents/create?branchId=${encodeURIComponent(active.branchId)}&title=${encodeURIComponent("Review " + active.name)}`}>Create manual incident <ArrowUpRight size={14} /></Link>}{active && <button type="button" disabled={busy} onClick={() => setInterventionsOpen(true)}><Lock size={14} />Camera interventions</button>}</div>}
        {feedback && <p role={feedback.error ? "alert" : "status"} className={feedback.error ? "los-feedback error" : "los-feedback"}>{feedback.text}</p>}
        <section className="los-attention"><span className="los-eyebrow">ATTENTION QUEUE / PRIORITY FIRST</span>{analyticsError ? <p role="alert">{analyticsError}</p> : !attention.length ? <p>{analyticsLoading ? "Loading events…" : "No open events reported in this scope."}</p> : attention.slice(0, 12).map(alert => <button key={alert.id} type="button" disabled={busy} aria-pressed={selectedEvent?.id === alert.id} onClick={() => selectEvent(alert)}><span data-severity={alert.severity}>{alert.severity}</span><div><strong>{alert.title}</strong><small>{cameras.find(camera => camera.id === alert.cameraId)?.name}</small></div><ChevronRight size={14} /></button>)}</section>
      </aside>}
    </div>
    <section className="los-event-ribbon" aria-label="Live event timeline"><header><Activity size={17} /><div><strong>Event ribbon</strong><small>{analyticsError ? "Event feed unavailable" : analyticsLoading ? "Refreshing events" : `${scopedEvents.length} reported events in this scope`}</small></div><button type="button" onClick={() => setContextOpen(true)}>Attention queue <ChevronRight size={14} /></button></header><div className="los-event-track">{scopedEvents.slice(0, 40).map(alert => <button key={alert.id} type="button" disabled={busy} aria-pressed={selectedEvent?.id === alert.id} onClick={() => selectEvent(alert)}><time>{timeLabel(eventTime(alert))}</time><i data-severity={alert.severity} /><strong>{alert.title}</strong><small>{cameras.find(camera => camera.id === alert.cameraId)?.name} · {alert.severity}</small></button>)}{!scopedEvents.length && <p>{analyticsError ? "The analytics service is unavailable. Live camera viewing is independent of this event feed." : "Events will appear here as the analytics service reports them."}</p>}</div></section>
    {interventionsOpen && active && <CameraInterventionModal key={active.id} cameraId={active.id} cameraName={active.name} isOpen onClose={() => setInterventionsOpen(false)} />}
  </div>;
}
