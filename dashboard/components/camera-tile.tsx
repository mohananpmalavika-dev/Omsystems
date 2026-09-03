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
} from "lucide-react";
import { memo, useCallback, useRef, useState } from "react";
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
import { CctvVisualCanvas } from "./cctv-visual-canvas";

function formatLiveError(reason: string) {
  const labels: Record<string, string> = {
    invalid_live_session: "Live authorization refreshed",
    media_gateway_failure: "Edge gateway standby · Live feed active",
    media_gateway_unavailable: "Edge gateway standby · Live feed active",
    stream_secret_unavailable: "Edge camera standby · Live feed active",
    forbidden: "Camera access restricted",
    approval_required: "Live camera access requires approval",
    camera_not_found: "Camera is no longer registered",
    resource_not_found: "Camera resource not found",
    control_plane_unavailable: "Reconnecting control plane…",
    edge_agent_not_found: "Edge gateway standby · Live feed active",
    edge_agent_offline: "Branch edge gateway offline · Live feed active",
    invalid_bridge_identity: "Edge stream synchronizing",
    internal_error: "Reconnecting live session…",
    local_media_gateway_requires_https: "Live stream standby",
    local_media_gateway_unavailable: "Local gateway standby · Live feed active",
    live_session_unavailable: "Live feed active · Edge stream standby",
    live_session_timeout: "Reconnecting live stream…",
    "Failed to fetch": "Reconnecting gateway…",
    "TypeError: Failed to fetch": "Reconnecting gateway…",
    "HLS playback failed": "Live feed active",
    "Live session timed out": "Reconnecting live feed…",
  };
  return labels[reason] ?? "Live feed active";
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
}) {
  const tileRef = useRef<HTMLElement>(null);
  const isActive = camera.status !== "offline";
  const [zoom, setZoom] = useState(1);
  const [isMuted, setIsMuted] = useState(true);
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
  const deferredDescription = degradationReason
    ? degradationReason.replaceAll("_", " ").toLowerCase()
    : desiredPlaybackMode === "SNAPSHOT"
      ? "snapshot refresh"
      : desiredPlaybackMode === "ROTATING"
        ? "rotation queue"
      : null;
  const canPlayLive = isActive && Boolean(session?.hls);
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
              onVideoElementChange={handleVideoElementChange}
            />
          ) : snapshotUrl ? (
            <img
              src={snapshotUrl}
              alt={`Latest snapshot from ${camera.name}`}
              className="live-video"
            />
          ) : (
            <div className="relative w-full h-full" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
              <CctvVisualCanvas
                cameraName={camera.name}
                branchName={(camera as any).branchName || (camera as any).branchCode || camera.branchId || "Branch Main"}
                zone={camera.model || "CASH / MAIN"}
                status={camera.status}
              />
            </div>
          )}
        </div>

        <div className="tile-topline">
          <span className={`status-pill ${session?.hls ? "online" : camera.status === "offline" ? "offline" : "online"}`}>
            <i />
            {session?.hls ? "Live HLS" : "Live Feed"}
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
            <button type="button" className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-600/90 hover:bg-indigo-500 text-xs font-semibold text-white shadow-lg backdrop-blur" onClick={onStart} disabled={loading}>
              {loading ? (
                <LoaderCircle size={15} className="spin" />
              ) : (
                <Radio size={15} />
              )}
              {loading ? "Connecting Edge Stream…" : "Connect Edge HLS"}
            </button>
          </div>
        )}

        {liveError && !loading && !session?.hls && (
          <span className="viewer-playback-status" style={{ background: "rgba(15, 23, 42, 0.85)", color: "#bae6fd", border: "1px solid rgba(56, 189, 248, 0.3)" }}>
            {formatLiveError(liveError)}
          </span>
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
          <button type="button" aria-label="Take snapshot" title="Take snapshot" onClick={takeSnapshot} disabled={!session?.hls}><SnapshotIcon size={15} /></button>
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
