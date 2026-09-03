"use client";

import Link from "next/link";
import {
  BookmarkPlus,
  BrainCircuit,
  Camera as CameraIcon,
  Expand,
  LoaderCircle,
  Maximize2,
  Move3D,
  Radio,
  Siren,
  CircleStop,
  Camera as SnapshotIcon,
  ZoomIn,
  ZoomOut,
  Volume2,
  VolumeX,
  SlidersHorizontal,
  AlertTriangle,
  Trash2,
} from "lucide-react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import type {
  AnalyticsAlert,
  AnalyticsRule,
  Camera,
  LiveSessionResponse,
  RecordingJob,
  RecordingMode,
} from "@/lib/types";
import type { CameraPlaybackMode, DegradationReason } from "@/lib/video/types";
import { HlsPlayer } from "./hls-player";
import { PtzControl } from "./ptz-control";
import { HoldToTalkButton } from "./hold-to-talk-button";

function formatLiveError(reason: string) {
  const labels: Record<string, string> = {
    invalid_live_session: "Live authorization expired",
    media_gateway_failure: "The media gateway rejected the stream",
    media_gateway_unavailable: "The media gateway is unavailable",
    stream_secret_unavailable: "The camera stream source is not configured",
    forbidden: "You do not have live camera access",
    approval_required: "Live camera access requires approval",
    camera_not_found: "Camera is no longer registered",
    resource_not_found: "The camera resource was not found",
    control_plane_unavailable: "The control plane is unreachable",
    edge_agent_not_found: "The camera edge agent is unavailable",
    edge_agent_offline: "The branch edge gateway is offline",
    invalid_bridge_identity: "The media bridge identity is invalid",
    internal_error: "The control plane failed to create a live session",
    local_media_gateway_requires_https: "The camera gateway needs an HTTPS tunnel",
    local_media_gateway_unavailable: "The local camera gateway is unreachable",
    live_session_unavailable: "Live authorization is unavailable",
    live_session_timeout: "Live authorization timed out",
    "Failed to fetch": "The live gateway could not be reached",
    "TypeError: Failed to fetch": "The live gateway could not be reached",
    "HLS playback failed": "The stream could not be played",
    "Live session timed out": "Live authorization timed out",
  };
  return labels[reason] ?? "Unable to start the live feed";
}

function shouldOfferCredentialUpdate(reason?: string) {
  if (!reason) return false;
  const normalized = reason.toLowerCase();
  return normalized === "stream_secret_unavailable" ||
    normalized.includes("credential") ||
    normalized.includes("authentication failed") ||
    normalized.includes("unauthorized camera");
}

function CameraTileComponent({
  camera,
  session,
  loading,
  onStart,
  index,
  recording,
  recordingLoading,
  onToggleRecording,
  onChangeRecordingMode,
  onUpdateRecording,
  onBookmark,
  onCreateIncident,
  playbackMode,
  desiredPlaybackMode,
  degradationReason,
  snapshotUrl,
  liveError,
  onVideoElementChange,
  onPlaybackError,
  aiOverlay,
  showAiOverlay = true,
  onOpenAi,
  onDeleteCamera,
}: {
  camera: Camera;
  session?: LiveSessionResponse;
  loading: boolean;
  onStart: () => void;
  index: number;
  recording?: RecordingJob;
  recordingLoading?: boolean;
  onToggleRecording?: () => void;
  onChangeRecordingMode?: (mode: RecordingMode) => void;
  onUpdateRecording?: (cameraId: string, update: Partial<Omit<RecordingJob, "id" | "cameraId" | "status">>) => void;
  onBookmark?: () => void;
  onCreateIncident?: () => void;
  playbackMode?: CameraPlaybackMode;
  desiredPlaybackMode?: CameraPlaybackMode;
  degradationReason?: DegradationReason;
  snapshotUrl?: string;
  liveError?: string;
  onVideoElementChange?: (videoElement: HTMLVideoElement | null) => void;
  onPlaybackError?: (reason?: string) => void;
  aiOverlay?: { rules: AnalyticsRule[]; alerts: AnalyticsAlert[] };
  showAiOverlay?: boolean;
  onOpenAi?: () => void;
  onDeleteCamera?: (cameraId: string) => Promise<void> | void;
}) {
  const tileRef = useRef<HTMLElement>(null);
  const isActive = camera.status !== "offline";
  const [zoom, setZoom] = useState(1);
  const [isMuted, setIsMuted] = useState(true);
  const [hasLiveFrame, setHasLiveFrame] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showPtzControl, setShowPtzControl] = useState(false);
  const [showRecordingSettings, setShowRecordingSettings] = useState(false);
  const [settingsPreRollSeconds, setSettingsPreRollSeconds] = useState(recording?.preRollSeconds ?? 30);
  const [settingsPostRollSeconds, setSettingsPostRollSeconds] = useState(recording?.postRollSeconds ?? 120);
  const [settingsMinMotionDuration, setSettingsMinMotionDuration] = useState(recording?.minMotionDurationSeconds ?? 5);
  const [settingsMotionConfidence, setSettingsMotionConfidence] = useState(recording?.motionConfidenceThreshold != null ? String(Math.round(recording.motionConfidenceThreshold * 100)) : "40");
  const [settingsCooldownSeconds, setSettingsCooldownSeconds] = useState(recording?.cooldownSeconds ?? 30);
  const [settingsMaxEventDurationSeconds, setSettingsMaxEventDurationSeconds] = useState(recording?.maxEventDurationSeconds ?? 600);
  const [settingsTriggerEventTypes, setSettingsTriggerEventTypes] = useState((recording?.triggerEventTypes ?? ["motion", "tamper"]).join(", "));
  const [settingsScheduleDays, setSettingsScheduleDays] = useState<number[]>(recording?.schedule?.windows?.[0]?.days ?? [1, 2, 3, 4, 5]);
  const [settingsScheduleStart, setSettingsScheduleStart] = useState(recording?.schedule?.windows?.[0]?.start ?? "09:00");
  const [settingsScheduleEnd, setSettingsScheduleEnd] = useState(recording?.schedule?.windows?.[0]?.end ?? "18:00");
  const handleVideoElementChange = useCallback((videoElement: HTMLVideoElement | null) => {
    onVideoElementChange?.(videoElement);
  }, [onVideoElementChange]);
  const handlePlaybackStateChange = useCallback((playing: boolean) => {
    setHasLiveFrame(playing);
  }, []);
  useEffect(() => {
    setHasLiveFrame(false);
  }, [session?.sessionId, session?.hls?.url]);
  const deferredDescription = degradationReason
    ? degradationReason.replaceAll("_", " ").toLowerCase()
    : desiredPlaybackMode === "SNAPSHOT"
      ? "snapshot refresh"
      : desiredPlaybackMode === "ROTATING"
        ? "rotation queue"
      : null;
  const canPlayLive = isActive && hasLiveFrame;
  const showCredentialUpdate = shouldOfferCredentialUpdate(liveError);
  const activeAiRules = aiOverlay?.rules.filter((rule) => rule.enabled) ?? [];
  const activeAiAlerts = aiOverlay?.alerts.filter((alert) =>
    !["resolved", "false_alarm", "suppressed"].includes(alert.status)
  ) ?? [];
  const latestAiAlert = activeAiAlerts[0];

  const scheduleDayOptions = [
    { label: "Sun", value: 0 },
    { label: "Mon", value: 1 },
    { label: "Tue", value: 2 },
    { label: "Wed", value: 3 },
    { label: "Thu", value: 4 },
    { label: "Fri", value: 5 },
    { label: "Sat", value: 6 },
  ];

  const openRecordingSettings = () => {
    setSettingsPreRollSeconds(recording?.preRollSeconds ?? 30);
    setSettingsPostRollSeconds(recording?.postRollSeconds ?? 120);
    setSettingsMinMotionDuration(recording?.minMotionDurationSeconds ?? 5);
    setSettingsMotionConfidence(recording?.motionConfidenceThreshold != null ? String(Math.round(recording.motionConfidenceThreshold * 100)) : "40");
    setSettingsCooldownSeconds(recording?.cooldownSeconds ?? 30);
    setSettingsMaxEventDurationSeconds(recording?.maxEventDurationSeconds ?? 600);
    setSettingsTriggerEventTypes((recording?.triggerEventTypes ?? ["motion", "tamper"]).join(", "));
    setSettingsScheduleDays(recording?.schedule?.windows?.[0]?.days ?? [1, 2, 3, 4, 5]);
    setSettingsScheduleStart(recording?.schedule?.windows?.[0]?.start ?? "09:00");
    setSettingsScheduleEnd(recording?.schedule?.windows?.[0]?.end ?? "18:00");
    setShowRecordingSettings(true);
  };

  const closeRecordingSettings = () => {
    setShowRecordingSettings(false);
  };

  const toggleScheduleDay = (day: number) => {
    setSettingsScheduleDays((current) =>
      current.includes(day) ? current.filter((value) => value !== day) : [...current, day].sort((a, b) => a - b),
    );
  };

  const saveRecordingSettings = async () => {
    if (!onUpdateRecording) return;
    const update: Partial<Omit<RecordingJob, "id" | "cameraId" | "status">> = {
      mode: recording?.mode ?? "continuous",
      enabled: recording?.enabled ?? false,
      preRollSeconds: settingsPreRollSeconds,
      postRollSeconds: settingsPostRollSeconds,
    };

    if (recording?.mode === "motion") {
      update.minMotionDurationSeconds = settingsMinMotionDuration;
      update.motionConfidenceThreshold = Number(settingsMotionConfidence) / 100;
      update.cooldownSeconds = settingsCooldownSeconds;
    }

    if (recording?.mode === "scheduled") {
      update.schedule = {
        timezone: "UTC",
        windows: [{
          days: settingsScheduleDays,
          start: settingsScheduleStart,
          end: settingsScheduleEnd,
          enabled: true,
        }],
      };
    }

    if (recording?.mode === "event") {
      update.maxEventDurationSeconds = settingsMaxEventDurationSeconds;
      update.triggerEventTypes = settingsTriggerEventTypes
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
    }

    await onUpdateRecording(recording?.cameraId ?? camera.id, update);
    setShowRecordingSettings(false);
  };

  const takeSnapshot = () => {
    const video = tileRef.current?.querySelector("video");
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/jpeg", 0.92);
    link.download = `${camera.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${Date.now()}.jpg`;
    link.click();
  };

  return (
    <article className="camera-tile" ref={tileRef}>
      <div className="feed-stage" onWheel={(event) => {
        if (!event.ctrlKey && !event.metaKey) return;
        event.preventDefault();
        setZoom((value) => Math.max(1, Math.min(3, Number((value + (event.deltaY < 0 ? 0.15 : -0.15)).toFixed(2)))));
      }}>
        <div className="zoom-stage" style={{ transform: `scale(${zoom})` }}>
          {session?.hls ? (
            <HlsPlayer
              url={session.hls.url}
              bearerToken={session.hls.bearerToken ?? ""}
              cameraName={camera.name}
              cameraId={camera.id}
              muted={isMuted}
              onPlaybackError={onPlaybackError}
              onPlaybackStateChange={handlePlaybackStateChange}
              onVideoElementChange={handleVideoElementChange}
            />
          ) : snapshotUrl ? (
            <img
              src={snapshotUrl}
              alt={`Latest snapshot from ${camera.name}`}
              className="live-video"
            />
          ) : (
            <div className={`camera-feed-placeholder ${liveError ? "has-error" : ""}`}>
              <CameraIcon size={26} />
              <span>{camera.status === "offline" ? "Camera offline" : "No live video"}</span>
              <small>{camera.status === "offline" ? "Waiting for the edge camera to reconnect" : "Connect the edge stream to start viewing"}</small>
            </div>
          )}
        </div>

        <div className="tile-topline">
          <span className={`status-pill ${hasLiveFrame ? "online" : liveError ? "offline" : camera.status}`}>
            <i />
            {hasLiveFrame ? "Live HLS" : session?.hls ? "Connecting" : camera.status === "online" ? "Ready" : camera.status}
          </span>
          {onToggleRecording && (
            <button type="button" className={`recording-pill ${recording?.enabled ? "active" : ""}`} onClick={onToggleRecording} disabled={recordingLoading} title={recording?.enabled ? "Stop recording" : "Start continuous recording"}>
              {recording?.enabled ? <CircleStop size={12} /> : <Radio size={12} />}
              {recordingLoading ? "…" : recording?.enabled ? "REC" : "REC OFF"}
            </button>
          )}
        </div>

        {showAiOverlay && activeAiRules.length > 0 && (
          <button
            type="button"
            className={`camera-ai-overlay ${latestAiAlert ? `alert ${latestAiAlert.severity.toLowerCase()}` : ""}`}
            onClick={onOpenAi}
            title={latestAiAlert ? `Open ${latestAiAlert.title}` : "Open live AI details"}
          >
            <span className="camera-ai-status">
              <BrainCircuit size={12} />
              AI · {activeAiRules.length} rule{activeAiRules.length === 1 ? "" : "s"}
            </span>
            {latestAiAlert && (
              <span className="camera-ai-detection">
                <b>{latestAiAlert.severity}</b>
                <em>{latestAiAlert.title}</em>
                <strong>{Math.round(latestAiAlert.confidence * 100)}%</strong>
              </span>
            )}
          </button>
        )}

        {!session?.hls && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/30 opacity-0 transition-opacity hover:opacity-100">
            <button type="button" className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-600/90 hover:bg-indigo-500 text-xs font-semibold text-white shadow-lg backdrop-blur" onClick={onStart} disabled={loading || !isActive}>
              {loading ? (
                <LoaderCircle size={15} className="spin" />
              ) : (
                <Radio size={15} />
              )}
              {loading ? "Connecting Edge Stream…" : !isActive ? "Camera offline" : "Connect Edge HLS"}
            </button>
          </div>
        )}

        {liveError && !loading && (
          <div className="camera-live-error" role="status">
            <AlertTriangle size={13} />
            <span>{formatLiveError(liveError)}</span>
            {showCredentialUpdate && (
              <Link href={`/maintenance/device-management?cameraId=${encodeURIComponent(camera.id)}`}>
                Update credentials
              </Link>
            )}
          </div>
        )}

        {!session?.hls && !liveError && deferredDescription && (
          <span className="viewer-playback-status">{deferredDescription}</span>
        )}


        <div className="tile-actions">
          {onBookmark && (
            <button type="button" aria-label="Bookmark live video" title="Bookmark live video" onClick={onBookmark} disabled={!canPlayLive}>
              <BookmarkPlus size={15} />
            </button>
          )}
          {onCreateIncident && (
            <button type="button" aria-label="Create incident" title="Create incident and protect recording" onClick={onCreateIncident} disabled={!canPlayLive}>
              <Siren size={15} />
            </button>
          )}
          <button
            type="button"
            aria-label={isMuted ? "Unmute audio (Listen to camera)" : "Mute camera audio"}
            title={isMuted ? "Click to hear live audio from camera" : "Mute camera audio (Listening)"}
            className={!isMuted ? "audio-listening-active text-emerald-400" : ""}
            onClick={() => setIsMuted(!isMuted)}
            disabled={!canPlayLive}
          >
            {isMuted ? <VolumeX size={15} /> : <Volume2 size={15} className="text-emerald-400" />}
          </button>
          <HoldToTalkButton
            cameraId={camera.id}
            disabled={!canPlayLive}
            unsupportedReason={camera.capabilities?.talkback?.supported === false
              ? camera.capabilities.talkback.reason ?? "two-way audio is not supported"
              : undefined}
          />
          {camera.capabilities.ptz && (
            <button type="button" aria-label="PTZ controls" title="PTZ controls" onClick={() => setShowPtzControl(!showPtzControl)} disabled={!canPlayLive}>
              <Move3D size={15} />
            </button>
          )}
          {onUpdateRecording && (
            <button type="button" aria-label="Recording settings" title="Recording settings" onClick={openRecordingSettings}>
              <SlidersHorizontal size={15} />
            </button>
          )}
          <button
            type="button"
            aria-label="Open fullscreen"
            title="Open fullscreen"
            onClick={() => void tileRef.current?.requestFullscreen()}
          >
            <Maximize2 size={15} />
          </button>
          <button type="button" aria-label="Zoom out" title="Zoom out" onClick={() => setZoom((value) => Math.max(1, Number((value - 0.25).toFixed(2))))} disabled={zoom === 1}><ZoomOut size={15} /></button>
          <button type="button" aria-label="Zoom in" title="Zoom in" onClick={() => setZoom((value) => Math.min(3, Number((value + 0.25).toFixed(2))))}><ZoomIn size={15} /></button>
          <button type="button" aria-label="Take snapshot" title="Take snapshot" onClick={takeSnapshot} disabled={!hasLiveFrame}><SnapshotIcon size={15} /></button>
          {onDeleteCamera && (
            <button
              type="button"
              aria-label="Remove camera"
              title="Remove camera from monitoring"
              onClick={() => setShowDeleteModal(true)}
              style={{ color: "#f87171" }}
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
        {zoom > 1 && <button type="button" className="zoom-reset" onClick={() => setZoom(1)}>Zoom {Math.round(zoom * 100)}% · Reset</button>}
        {showPtzControl && isActive && session?.sessionId && (
          <div className="ptz-overlay">
            <PtzControl
              cameraId={camera.id}
              sessionId={session.sessionId}
              onClose={() => setShowPtzControl(false)}
            />
          </div>
        )}
      </div>
      {showRecordingSettings && (
        <div className="modal-overlay">
          <div className="modal-container recording-settings-modal">
            <div className="modal-header">
              <h2>Recording settings</h2>
              <button type="button" className="icon-button" onClick={closeRecordingSettings} aria-label="Close recording settings">×</button>
            </div>
            <div className="modal-form">
              <div className="form-group">
                <label htmlFor="preRollSeconds">Pre-roll (seconds)</label>
                <input
                  id="preRollSeconds"
                  type="number"
                  min={0}
                  max={3600}
                  value={settingsPreRollSeconds}
                  onChange={(event) => setSettingsPreRollSeconds(Number(event.target.value))}
                />
              </div>
              <div className="form-group">
                <label htmlFor="postRollSeconds">Post-roll (seconds)</label>
                <input
                  id="postRollSeconds"
                  type="number"
                  min={0}
                  max={3600}
                  value={settingsPostRollSeconds}
                  onChange={(event) => setSettingsPostRollSeconds(Number(event.target.value))}
                />
              </div>
              {recording?.mode === "motion" && (
                <>
                  <div className="form-group">
                    <label htmlFor="minMotionDuration">Minimum motion duration</label>
                    <input
                      id="minMotionDuration"
                      type="number"
                      min={0}
                      max={86400}
                      value={settingsMinMotionDuration}
                      onChange={(event) => setSettingsMinMotionDuration(Number(event.target.value))}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="motionConfidence">Motion confidence (%)</label>
                    <input
                      id="motionConfidence"
                      type="number"
                      min={0}
                      max={100}
                      value={settingsMotionConfidence}
                      onChange={(event) => setSettingsMotionConfidence(event.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="cooldownSeconds">Cooldown (seconds)</label>
                    <input
                      id="cooldownSeconds"
                      type="number"
                      min={0}
                      max={86400}
                      value={settingsCooldownSeconds}
                      onChange={(event) => setSettingsCooldownSeconds(Number(event.target.value))}
                    />
                  </div>
                </>
              )}
              {recording?.mode === "scheduled" && (
                <>
                  <div className="form-group">
                    <label>Schedule days</label>
                    <div className="checkbox-grid">
                      {scheduleDayOptions.map((option) => (
                        <label key={option.value}>
                          <input
                            type="checkbox"
                            checked={settingsScheduleDays.includes(option.value)}
                            onChange={() => toggleScheduleDay(option.value)}
                          />
                          {option.label}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="scheduleStart">Starts at</label>
                      <input
                        id="scheduleStart"
                        type="time"
                        value={settingsScheduleStart}
                        onChange={(event) => setSettingsScheduleStart(event.target.value)}
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="scheduleEnd">Ends at</label>
                      <input
                        id="scheduleEnd"
                        type="time"
                        value={settingsScheduleEnd}
                        onChange={(event) => setSettingsScheduleEnd(event.target.value)}
                      />
                    </div>
                  </div>
                </>
              )}
              {recording?.mode === "event" && (
                <>
                  <div className="form-group">
                    <label htmlFor="maxEventDurationSeconds">Max event duration (seconds)</label>
                    <input
                      id="maxEventDurationSeconds"
                      type="number"
                      min={0}
                      max={86400}
                      value={settingsMaxEventDurationSeconds}
                      onChange={(event) => setSettingsMaxEventDurationSeconds(Number(event.target.value))}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="triggerEventTypes">Trigger event types</label>
                    <input
                      id="triggerEventTypes"
                      type="text"
                      value={settingsTriggerEventTypes}
                      onChange={(event) => setSettingsTriggerEventTypes(event.target.value)}
                      placeholder="motion, tamper"
                    />
                  </div>
                </>
              )}
              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={closeRecordingSettings}>Cancel</button>
                <button type="button" className="primary-button" onClick={saveRecordingSettings}>Save settings</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {showDeleteModal && (
        <div className="modal-overlay">
          <div className="modal-container" role="dialog" aria-modal="true" aria-labelledby="tile-delete-camera-title">
            <div className="modal-header">
              <h2 id="tile-delete-camera-title" style={{ color: "#ef4444" }}>Remove Camera</h2>
              <button type="button" className="icon-button" onClick={() => setShowDeleteModal(false)} disabled={isDeleting}>×</button>
            </div>
            <div className="modal-body" style={{ padding: "16px 20px" }}>
              <div className="form-info-banner" style={{ background: "rgba(239, 68, 68, 0.1)", borderColor: "rgba(239, 68, 68, 0.3)", color: "#f87171" }}>
                <AlertTriangle size={18} />
                <div>
                  <strong>Are you sure you want to remove &quot;{camera.name}&quot;?</strong>
                  <p style={{ margin: "4px 0 0", fontSize: "0.85rem", opacity: 0.9 }}>
                    This camera stream will be removed from the video wall and active monitoring.
                  </p>
                </div>
              </div>
              <div style={{ marginTop: "12px", padding: "10px", borderRadius: "6px", background: "rgba(99, 102, 241, 0.1)", border: "1px solid rgba(99, 102, 241, 0.2)", color: "#a5b4fc", fontSize: "0.85rem" }}>
                💡 <b>Need this camera back later?</b> You can easily re-add it at any time from <b>Device Manager</b> via <b>Scan cameras</b>, <b>Direct IP Probe</b>, or <b>Add camera manually</b>.
              </div>
              <div className="modal-actions" style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "16px" }}>
                <button type="button" className="secondary-button" onClick={() => setShowDeleteModal(false)} disabled={isDeleting}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="primary-button"
                  onClick={async () => {
                    if (!onDeleteCamera) return;
                    setIsDeleting(true);
                    try {
                      await onDeleteCamera(camera.id);
                      setShowDeleteModal(false);
                    } catch (err) {
                      console.error("Failed to delete camera", err);
                    } finally {
                      setIsDeleting(false);
                    }
                  }}
                  disabled={isDeleting}
                  style={{ background: "#dc2626", borderColor: "#ef4444", color: "#ffffff" }}
                >
                  {isDeleting ? "Removing…" : "Remove Camera"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <footer className="camera-meta">
        <div>
          <strong>{camera.name}</strong>
          <span>{camera.branchName}</span>
        </div>
        <div className="camera-channel">
          <Expand size={13} />
          CH {String(camera.channel).padStart(2, "0")}
        </div>
        {onChangeRecordingMode && (
          <select className="recording-mode" aria-label={`${camera.name} recording mode`} value={recording?.mode ?? "continuous"} onChange={(event) => onChangeRecordingMode(event.target.value as RecordingMode)} disabled={recordingLoading}>
            <option value="continuous">24/7</option><option value="motion">Motion</option><option value="scheduled">Schedule</option><option value="event">Event</option><option value="manual">Manual</option>
          </select>
        )}
      </footer>
    </article>
  );
}

export const CameraTile = memo(CameraTileComponent);
