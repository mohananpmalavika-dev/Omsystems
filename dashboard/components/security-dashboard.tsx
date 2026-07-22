"use client";

import {
  Activity,
  AlertTriangle,
  Bell,
  Building2,
  Camera,
  ChevronDown,
  ChevronRight,
  CircleUserRound,
  Command,
  Download,
  FileVideo2,
  Grid2X2,
  LayoutDashboard,
  Menu,
  MonitorPlay,
  Pause,
  Play,
  Plus,
  MoreHorizontal,
  Search,
  Settings,
  ShieldCheck,
  Siren,
  SlidersHorizontal,
  Wifi,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Branch, Camera as CameraType, LiveIncident, LiveSessionResponse, RecordingJob } from "@/lib/types";
import { liveOperationsApi } from "@/lib/api-client";
import { CameraTile } from "./camera-tile";
import { LiveEventForm } from "./live-event-form";

const layoutOptions = [1, 4, 9, 16, 25, 36] as const;
const liveSessionRenewalLeadMs = 60_000;

function defaultRecording(cameraId: string, mode: RecordingJob["mode"] = "continuous"): RecordingJob {
  return {
    cameraId, mode, enabled: false, status: "disabled", retentionDays: 180,
    postRollSeconds: 30, segmentDurationSeconds: 60, hotRetentionDays: 30,
    warmRetentionDays: 60, coldRetentionDays: 90, critical: false,
    backupRequired: false, automaticDeletionEnabled: true,
    evidenceProtection: true, recordMainStream: true,
  };
}

export function SecurityDashboard() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>("");
  const [cameras, setCameras] = useState<CameraType[]>([]);
  const [gridSize, setGridSize] = useState<(typeof layoutOptions)[number]>(4);
  const [sessions, setSessions] = useState<Record<string, LiveSessionResponse>>({});
  const [recordings, setRecordings] = useState<Record<string, RecordingJob>>({});
  const [recordingLoading, setRecordingLoading] = useState<string | null>(null);
  const [sequencing, setSequencing] = useState(false);
  const [sequenceOffset, setSequenceOffset] = useState(0);
  const [loadingCamera, setLoadingCamera] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [incidents, setIncidents] = useState<LiveIncident[]>([]);
  const [liveAction, setLiveAction] = useState<{
    action: "bookmark" | "incident";
    camera: CameraType;
  }>();
  const [liveActionSaving, setLiveActionSaving] = useState(false);

  useEffect(() => {
    void fetch("/api/branches")
      .then((response) => {
        if (!response.ok) throw new Error("Unable to load branches");
        return response.json() as Promise<{ data: Branch[] }>;
      })
      .then(({ data }) => {
        setBranches(data);
        setSelectedBranch(data[0]?.id ?? "");
      })
      .catch(() => setError("The branch directory is temporarily unavailable."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedBranch) return;
    setLoading(true);
    setError(null);
    void fetch(`/api/branches/${encodeURIComponent(selectedBranch)}/cameras`)
      .then((response) => {
        if (!response.ok) throw new Error("Unable to load cameras");
        return response.json() as Promise<{ data: CameraType[] }>;
      })
      .then(async ({ data }) => {
        setCameras(data);
        const states = await Promise.all(data.map(async (camera) => {
          const response = await fetch(`/api/recording/${encodeURIComponent(camera.id)}`);
          return response.ok ? await response.json() as RecordingJob : undefined;
        }));
        setRecordings(Object.fromEntries(states.filter((job): job is RecordingJob => Boolean(job)).map((job) => [job.cameraId, job])));
        const incidentLists = await Promise.all(data.map(async (camera) => {
          try {
            return (await liveOperationsApi.listIncidents(camera.id, 50)).data as LiveIncident[];
          } catch {
            return [];
          }
        }));
        setIncidents(incidentLists.flat());
      })
      .catch(() => setError("Camera inventory could not be loaded."))
      .finally(() => setLoading(false));
  }, [selectedBranch]);

  useEffect(() => {
    if (!sequencing || cameras.length <= gridSize) return;
    const timer = window.setInterval(() => setSequenceOffset((value) => (value + gridSize) % cameras.length), 10_000);
    return () => window.clearInterval(timer);
  }, [sequencing, cameras.length, gridSize]);

  const activeBranch = branches.find((branch) => branch.id === selectedBranch);
  const visibleCameras = Array.from({ length: Math.min(gridSize, cameras.length) }, (_, index) => cameras[(sequenceOffset + index) % cameras.length]!);
  const online = cameras.filter((camera) => camera.status === "online").length;
  const offline = cameras.filter((camera) => camera.status === "offline").length;
  const degraded = cameras.filter((camera) => camera.status === "degraded").length;
  const attention = offline + degraded;

  const startCamera = useCallback(async (cameraId: string) => {
    setLoadingCamera(cameraId);
    setError(null);
    try {
      const response = await fetch("/api/live", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cameraId }),
      });
      if (!response.ok) throw new Error("Live session failed");
      const session = await response.json() as LiveSessionResponse;
      setSessions((current) => ({ ...current, [cameraId]: session }));
    } catch {
      setError("Live view could not start. Check camera and media-gateway health.");
    } finally {
      setLoadingCamera(null);
    }
  }, []);

  useEffect(() => {
    const timers = Object.entries(sessions).flatMap(([cameraId, session]) => {
      if (!session.expiresAt) return [];
      const expiresAt = Date.parse(session.expiresAt);
      if (!Number.isFinite(expiresAt)) return [];
      const delay = Math.max(
        1_000,
        expiresAt - Date.now() - liveSessionRenewalLeadMs,
      );
      return [window.setTimeout(() => void startCamera(cameraId), delay)];
    });
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [sessions, startCamera]);

  const toggleRecording = useCallback(async (cameraId: string) => {
    const current = recordings[cameraId] ?? defaultRecording(cameraId);
    setRecordingLoading(cameraId);
    try {
      const response = await fetch(`/api/recording/${encodeURIComponent(cameraId)}`, {
        method: "PUT", headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...current, enabled: !current.enabled }),
      });
      if (!response.ok) throw new Error("Recording update failed");
      const updated = await response.json() as RecordingJob;
      setRecordings((items) => ({ ...items, [cameraId]: updated }));
    } catch { setError("Recording settings could not be updated."); }
    finally { setRecordingLoading(null); }
  }, [recordings]);

  const changeRecordingMode = useCallback(async (cameraId: string, mode: RecordingJob["mode"]) => {
    const current = recordings[cameraId] ?? defaultRecording(cameraId, mode);
    setRecordingLoading(cameraId);
    try {
      const response = await fetch(`/api/recording/${encodeURIComponent(cameraId)}`, {
        method: "PUT", headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...current, mode,
          ...(mode === "scheduled" ? { schedule: { days: [1, 2, 3, 4, 5], start: "09:00", end: "18:00" } } : {}) }),
      });
      if (!response.ok) throw new Error("Recording mode update failed");
      const updated = await response.json() as RecordingJob;
      setRecordings((items) => ({ ...items, [cameraId]: updated }));
    } catch { setError("Recording mode could not be updated."); }
    finally { setRecordingLoading(null); }
  }, [recordings]);

  const healthPercent = useMemo(
    () => cameras.length ? Math.round((online / cameras.length) * 100) : 0,
    [cameras.length, online],
  );
  const openIncidents = incidents.filter(
    (incident) => incident.status !== "resolved" && incident.status !== "false-alarm",
  );
  const highPriorityIncidents = openIncidents.filter(
    (incident) => incident.priority === "P1" || incident.priority === "P2",
  ).length;

  const submitLiveAction = useCallback(async (payload: Record<string, unknown>) => {
    if (!liveAction) return;
    setLiveActionSaving(true);
    setError(null);
    setNotice(null);
    try {
      if (liveAction.action === "bookmark") {
        await liveOperationsApi.createBookmark(liveAction.camera.id, payload);
        setNotice(`Bookmark saved for ${liveAction.camera.name}.`);
      } else {
        const incident = await liveOperationsApi.createIncident(
          liveAction.camera.id,
          payload,
        ) as LiveIncident;
        setIncidents((current) => [incident, ...current]);
        setNotice(`Incident created and its recording window is protected.`);
      }
      setLiveAction(undefined);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Live operation failed.");
    } finally {
      setLiveActionSaving(false);
    }
  }, [liveAction]);

  const changeIncidentStatus = useCallback(async (
    incident: LiveIncident,
    status: LiveIncident["status"],
  ) => {
    setError(null);
    try {
      const updated = await liveOperationsApi.updateIncidentStatus(
        incident.cameraId,
        incident.id,
        status,
      ) as LiveIncident;
      setIncidents((current) => current.map((item) =>
        item.id === updated.id ? updated : item
      ));
      setNotice(`Incident status changed to ${status.replace("-", " ")}.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Incident update failed.");
    }
  }, []);

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="brand">
          <div className="brand-mark"><ShieldCheck size={23} /></div>
          <div><strong>Sentinel</strong><span>GRID</span></div>
          <button className="mobile-close" onClick={() => setSidebarOpen(false)}>
            <X size={19} />
          </button>
        </div>

        <div className="command-search">
          <Search size={15} />
          <span>Search anything</span>
          <kbd><Command size={11} /> K</kbd>
        </div>

        <nav className="main-nav" aria-label="Main navigation">
          <p>OPERATIONS</p>
          <a href="#" className="active"><LayoutDashboard size={18} />Overview</a>
          <a href="#live-wall"><MonitorPlay size={18} />Live wall<span className="nav-count">8</span></a>
          <a href="#incidents"><Siren size={18} />Incidents<span className="alert-count">{openIncidents.length}</span></a>
          <a href="/analytics"><Activity size={18} />Video analytics</a>
          <a href="#"><Activity size={18} />Health</a>
          <p>MANAGEMENT</p>
          <a href="/admin"><Building2 size={18} />Organization</a>
          <a href="/admin?tab=users"><Camera size={18} />Access control</a>
          <a href="/compliance"><ShieldCheck size={18} />Compliance</a>
          <a href="/maintenance/privacy"><ShieldCheck size={18} />Privacy</a>
          <a href="/maintenance"><SlidersHorizontal size={18} />Maintenance</a>
          <a href="/recordings"><FileVideo2 size={18} />Recordings</a>
          <a href="#"><Download size={18} />Exports</a>
        </nav>

        <div className="sidebar-status">
          <div className="pulse-icon"><Wifi size={17} /></div>
          <div><strong>Platform healthy</strong><span>All services operational</span></div>
          <ChevronRight size={16} />
        </div>
        <div className="sidebar-user">
          <div className="avatar">AR</div>
          <div><strong>Arun Rao</strong><span>Regional operator</span></div>
          <MoreHorizontal size={18} />
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <button className="menu-button" onClick={() => setSidebarOpen(true)}>
            <Menu size={20} />
          </button>
          <div>
            <div className="breadcrumbs">
              Retail Division <ChevronRight size={13} /> South Region
            </div>
            <h1>Security operations</h1>
          </div>
          <div className="topbar-actions">
            <div className="timezone">IST <span>•</span> Live</div>
            <button aria-label="Notifications" className="notification">
              <Bell size={19} /><i />
            </button>
            <button aria-label="Settings"><Settings size={19} /></button>
            <div className="top-avatar"><CircleUserRound size={21} /></div>
          </div>
        </header>

        <div className="content">
          {error && (
            <div className="error-banner">
              <AlertTriangle size={17} />{error}
              <button onClick={() => setError(null)}><X size={15} /></button>
            </div>
          )}
          {notice && (
            <div className="success-banner">
              <ShieldCheck size={17} />{notice}
              <button onClick={() => setNotice(null)}><X size={15} /></button>
            </div>
          )}

          <section className="summary-grid" aria-label="Operations summary">
            <SummaryCard label="Monitored branches" value={String(branches.length)} detail={branches.length ? `${branches.length} ${branches.length === 1 ? "branch" : "branches"}` : "No branches"} icon={<Building2 />} tone="blue" />
            <SummaryCard label="Cameras in view" value={String(cameras.length)} detail={`${healthPercent}% healthy`} icon={<Camera />} tone="green" progress={healthPercent} />
            <SummaryCard label="Needs attention" value={String(attention)} detail={`${offline} offline · ${degraded} degraded`} icon={<AlertTriangle />} tone={attention > 0 ? "amber" : "blue"} />
            <SummaryCard label="Open incidents" value={String(openIncidents.length)} detail={`${highPriorityIncidents} high priority`} icon={<Siren />} tone="red" />
          </section>

          <section className="branch-panel">
            <div className="section-heading">
              <div>
                <span className="eyebrow">LOCATION SCOPE</span>
                <h2>South Region branches</h2>
              </div>
              <button className="secondary-button">
                <SlidersHorizontal size={15} /> Filter
              </button>
            </div>
            <div className="branch-tabs">
              {branches.map((branch) => (
                <button
                  key={branch.id}
                  className={branch.id === selectedBranch ? "selected" : ""}
                  onClick={() => setSelectedBranch(branch.id)}
                >
                  <span className="branch-icon"><Building2 size={17} /></span>
                  <span>
                    <strong>{branch.name}</strong>
                    <small>{branch.onlineCount ?? "—"} of {branch.cameraCount ?? "—"} online</small>
                  </span>
                  <i className={(branch.onlineCount ?? 0) < (branch.cameraCount ?? 0) ? "warning" : ""} />
                </button>
              ))}
            </div>
          </section>

          <section className="live-section" id="live-wall">
            <div className="section-heading live-heading">
              <div>
                <span className="eyebrow">LIVE MONITORING</span>
                <h2>{activeBranch?.name ?? "Select a branch"}</h2>
                <p>
                  <span className="green-dot" /> {online} online
                  {attention > 0 && <><span className="separator">•</span>{attention} need attention</>}
                  <span className="separator">•</span>{healthPercent}% healthy
                </p>
              </div>
              <div className="layout-picker">
                <a className="add-camera-link" href="/admin?tab=devices">
                  <Plus size={15} /> Add camera
                </a>
                <button className={sequencing ? "active" : ""} onClick={() => setSequencing((value) => !value)} aria-label={sequencing ? "Pause camera sequence" : "Start camera sequence"} title={sequencing ? "Pause 10 second camera sequence" : "Start 10 second camera sequence"}>
                  {sequencing ? <Pause size={16} /> : <Play size={16} />}
                </button>
                <span>Layout</span>
                {layoutOptions.map((size) => (
                  <button
                    key={size}
                    className={gridSize === size ? "active" : ""}
                    onClick={() => setGridSize(size)}
                    aria-label={`${size} camera layout`}
                  >
                    {size === 1 ? <MonitorPlay size={16} /> : <Grid2X2 size={16} />}
                    {size}
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <div className="loading-grid">
                {Array.from({ length: Math.min(gridSize, 4) }).map((_, index) => <div key={index} />)}
              </div>
            ) : (
              <div className={`camera-grid grid-${gridSize}`}>
                {visibleCameras.map((camera, index) => (
                  <CameraTile
                    key={camera.id}
                    camera={camera}
                    index={index}
                    session={sessions[camera.id]}
                    loading={loadingCamera === camera.id}
                    onStart={() => void startCamera(camera.id)}
                    recording={recordings[camera.id]}
                    recordingLoading={recordingLoading === camera.id}
                    onToggleRecording={() => void toggleRecording(camera.id)}
                    onChangeRecordingMode={(mode) => void changeRecordingMode(camera.id, mode)}
                    onBookmark={() => setLiveAction({ action: "bookmark", camera })}
                    onCreateIncident={() => setLiveAction({ action: "incident", camera })}
                  />
                ))}
              </div>
            )}
          </section>

          <section className="incident-panel" id="incidents">
            <div className="section-heading">
              <div>
                <span className="eyebrow">OPERATOR WORKFLOW</span>
                <h2>Active incidents</h2>
                <p>Recording windows created here remain protected by legal hold.</p>
              </div>
              <span className="incident-total">{openIncidents.length} open</span>
            </div>
            {openIncidents.length === 0 ? (
              <div className="incident-empty">
                <ShieldCheck size={22} />
                <strong>No active incidents</strong>
                <span>Create one from an active camera tile when operator attention is required.</span>
              </div>
            ) : (
              <div className="incident-list">
                {openIncidents.map((incident) => {
                  const incidentCamera = cameras.find(
                    (item) => item.id === incident.cameraId,
                  );
                  return (
                    <article className="incident-row" key={incident.id}>
                      <span className={`incident-priority ${incident.priority.toLowerCase()}`}>
                        {incident.priority}
                      </span>
                      <div className="incident-copy">
                        <strong>{incident.title}</strong>
                        <span>{incidentCamera?.name ?? "Camera"} · {new Date(incident.occurredAt).toLocaleString()}</span>
                      </div>
                      <span className="evidence-hold"><ShieldCheck size={13} />Evidence protected</span>
                      <select
                        aria-label={`Status for ${incident.title}`}
                        value={incident.status}
                        onChange={(event) => void changeIncidentStatus(
                          incident,
                          event.target.value as LiveIncident["status"],
                        )}
                      >
                        <option value="new">New</option>
                        <option value="acknowledged">Acknowledged</option>
                        <option value="investigating">Investigating</option>
                        <option value="escalated">Escalated</option>
                        <option value="resolved">Resolved</option>
                        <option value="false-alarm">False alarm</option>
                      </select>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </main>
      {liveAction && (
        <LiveEventForm
          action={liveAction.action}
          camera={liveAction.camera}
          saving={liveActionSaving}
          onCancel={() => setLiveAction(undefined)}
          onSubmit={submitLiveAction}
        />
      )}
    </div>
  );
}

function SummaryCard({
  label, value, detail, icon, tone, progress,
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
  tone: "blue" | "green" | "amber" | "red";
  progress?: number;
}) {
  return (
    <article className="summary-card">
      <div className={`summary-icon ${tone}`}>{icon}</div>
      <div className="summary-copy">
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
      {progress && <div className="mini-progress"><i style={{ width: `${progress}%` }} /></div>}
    </article>
  );
}
