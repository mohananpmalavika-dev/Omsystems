"use client";

import {
  BookmarkPlus,
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
  SlidersHorizontal,
} from "lucide-react";
import { useRef, useState } from "react";
import type { Camera, LiveSessionResponse, RecordingJob, RecordingMode } from "@/lib/types";
import { HlsPlayer } from "./hls-player";
import { PtzControl } from "./ptz-control";

export function CameraTile({
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
}: {
  camera: Camera;
  session?: LiveSessionResponse;
  loading: boolean;
  onStart: () => void;
  index: number;
  recording?: RecordingJob;
  recordingLoading?: boolean;
  onToggleRecording: () => void;
  onChangeRecordingMode: (mode: RecordingMode) => void;
  onUpdateRecording?: (cameraId: string, update: Partial<Omit<RecordingJob, "id" | "cameraId" | "status">>) => void;
  onBookmark: () => void;
  onCreateIncident: () => void;
}) {
  const tileRef = useRef<HTMLElement>(null);
  const isActive = Boolean(session);
  const [zoom, setZoom] = useState(1);
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
              bearerToken={session.hls.bearerToken}
              cameraName={camera.name}
              onPlaybackError={onStart}
            />
          ) : (
          <div className={`simulated-feed feed-${(index % 4) + 1}`}>
            <div className="feed-vignette" />
            <div className="feed-perspective" />
            <CameraIcon size={31} strokeWidth={1.25} />
            <span>{isActive ? "Secure demo feed" : "Ready for live view"}</span>
          </div>
          )}
        </div>

        <div className="tile-topline">
          <span className={`status-pill ${camera.status}`}>
            <i />
            {camera.status === "online" ? "Live" : camera.status}
          </span>
          <button className={`recording-pill ${recording?.enabled ? "active" : ""}`} onClick={onToggleRecording} disabled={recordingLoading} title={recording?.enabled ? "Stop recording" : "Start continuous recording"}>
            {recording?.enabled ? <CircleStop size={12} /> : <Radio size={12} />}
            {recordingLoading ? "…" : recording?.enabled ? "REC" : "REC OFF"}
          </button>
          <span className="tile-time">
            {new Date().toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </span>
        </div>

        {!isActive && camera.status !== "offline" && (
          <button className="watch-button" onClick={onStart} disabled={loading}>
            {loading ? (
              <LoaderCircle size={17} className="spin" />
            ) : (
              <Radio size={17} />
            )}
            {loading ? "Authorizing…" : "Watch live"}
          </button>
        )}

        <div className="tile-actions">
          <button aria-label="Bookmark live video" title="Bookmark live video" onClick={onBookmark} disabled={!isActive}>
            <BookmarkPlus size={15} />
          </button>
          <button aria-label="Create incident" title="Create incident and protect recording" onClick={onCreateIncident} disabled={!isActive}>
            <Siren size={15} />
          </button>
          {camera.capabilities.audio && (
            <button aria-label="Audio available" title="Audio available">
              <Volume2 size={15} />
            </button>
          )}
          {camera.capabilities.ptz && (
            <button aria-label="PTZ controls" title="PTZ controls" onClick={() => setShowPtzControl(!showPtzControl)} disabled={!isActive}>
              <Move3D size={15} />
            </button>
          )}
          <button aria-label="Recording settings" title="Recording settings" onClick={openRecordingSettings}>
            <SlidersHorizontal size={15} />
          </button>
          <button
            aria-label="Open fullscreen"
            title="Open fullscreen"
            onClick={() => void tileRef.current?.requestFullscreen()}
          >
            <Maximize2 size={15} />
          </button>
          <button aria-label="Zoom out" title="Zoom out" onClick={() => setZoom((value) => Math.max(1, Number((value - 0.25).toFixed(2))))} disabled={zoom === 1}><ZoomOut size={15} /></button>
          <button aria-label="Zoom in" title="Zoom in" onClick={() => setZoom((value) => Math.min(3, Number((value + 0.25).toFixed(2))))}><ZoomIn size={15} /></button>
          <button aria-label="Take snapshot" title="Take snapshot" onClick={takeSnapshot} disabled={!session?.hls}><SnapshotIcon size={15} /></button>
        </div>
        {zoom > 1 && <button className="zoom-reset" onClick={() => setZoom(1)}>Zoom {Math.round(zoom * 100)}% · Reset</button>}
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
              <button className="icon-button" onClick={closeRecordingSettings} aria-label="Close recording settings">×</button>
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
        <select className="recording-mode" aria-label={`${camera.name} recording mode`} value={recording?.mode ?? "continuous"} onChange={(event) => onChangeRecordingMode(event.target.value as RecordingMode)} disabled={recordingLoading}>
          <option value="continuous">24/7</option><option value="motion">Motion</option><option value="scheduled">Schedule</option><option value="event">Event</option><option value="manual">Manual</option>
        </select>
      </footer>
    </article>
  );
}
