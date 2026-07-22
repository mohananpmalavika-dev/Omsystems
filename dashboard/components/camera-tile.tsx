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
  onBookmark: () => void;
  onCreateIncident: () => void;
}) {
  const tileRef = useRef<HTMLElement>(null);
  const isActive = Boolean(session);
  const [zoom, setZoom] = useState(1);
  const [showPtzControl, setShowPtzControl] = useState(false);

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
