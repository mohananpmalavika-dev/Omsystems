"use client";

import {
  Camera as CameraIcon,
  Expand,
  LoaderCircle,
  Maximize2,
  Move3D,
  Radio,
  Volume2,
} from "lucide-react";
import { useRef } from "react";
import type { Camera, LiveSessionResponse } from "@/lib/types";
import { HlsPlayer } from "./hls-player";

export function CameraTile({
  camera,
  session,
  loading,
  onStart,
  index,
}: {
  camera: Camera;
  session?: LiveSessionResponse;
  loading: boolean;
  onStart: () => void;
  index: number;
}) {
  const tileRef = useRef<HTMLElement>(null);
  const isActive = Boolean(session);

  return (
    <article className="camera-tile" ref={tileRef}>
      <div className="feed-stage">
        {session?.hls ? (
          <HlsPlayer
            url={session.hls.url}
            bearerToken={session.hls.bearerToken}
            cameraName={camera.name}
          />
        ) : (
          <div className={`simulated-feed feed-${(index % 4) + 1}`}>
            <div className="feed-vignette" />
            <div className="feed-perspective" />
            <CameraIcon size={31} strokeWidth={1.25} />
            <span>{isActive ? "Secure demo feed" : "Ready for live view"}</span>
          </div>
        )}

        <div className="tile-topline">
          <span className={`status-pill ${camera.status}`}>
            <i />
            {camera.status === "online" ? "Live" : camera.status}
          </span>
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
          {camera.capabilities.audio && (
            <button aria-label="Audio available" title="Audio available">
              <Volume2 size={15} />
            </button>
          )}
          {camera.capabilities.ptz && (
            <button aria-label="PTZ controls" title="PTZ controls">
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
        </div>
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
      </footer>
    </article>
  );
}
