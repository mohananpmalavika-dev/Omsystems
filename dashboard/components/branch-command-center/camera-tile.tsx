"use client";

import { useState, type MouseEvent, type ReactNode } from "react";
import {
  AlertOctagon,
  Camera as CameraIcon,
  Layers,
  LoaderCircle,
  Maximize2,
  Pin,
  Radio,
  ShieldAlert,
  WifiOff,
} from "lucide-react";
import { HlsPlayer } from "@/components/hls-player";
import { CctvVisualCanvas } from "@/components/cctv-visual-canvas";
import { startLiveFromBrowser } from "@/lib/live-client";
import type { LiveSessionResponse } from "@/lib/types";
import { CameraDiagnosticModal } from "./camera-diagnostic-modal";
import type { BranchCameraOperationalState } from "./types";

export interface CameraTileProps {
  camera: BranchCameraOperationalState;
  isDecoderAllocated?: boolean;
  isPinned?: boolean;
  isSelected?: boolean;
  quality?: "MAIN" | "SUB" | "LOW";
  onSelect?: (cameraId: string) => void;
  onDoubleClick?: (cameraId: string) => void;
  onPinToggle?: (cameraId: string) => void;
  onInvestigate?: (cameraId: string) => void;
}

export function CameraTile({
  camera,
  isDecoderAllocated = false,
  isPinned = false,
  isSelected = false,
  quality = "SUB",
  onSelect,
  onDoubleClick,
  onPinToggle,
  onInvestigate,
}: CameraTileProps) {
  const [showDiagnosticModal, setShowDiagnosticModal] = useState(false);
  const [session, setSession] = useState<LiveSessionResponse | null>(null);
  const [starting, setStarting] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);

  const isOffline = camera.health.connectivity === "OFFLINE" || camera.health.videoLoss === "DETECTED";
  const isNotRecording = camera.health.recording === "NOT_RECORDING";
  const isAlarmActive = Boolean(camera.alertActive || camera.alertSeverity);
  const isCriticalAlarm = camera.alertSeverity === "CRITICAL";
  const live = Boolean(session?.hls?.url);
  const advertisedProfile = quality === "MAIN"
    ? camera.streamProfiles?.main
    : camera.streamProfiles?.sub ?? camera.streamProfiles?.main;
  const width = Number(advertisedProfile?.width);
  const height = Number(advertisedProfile?.height);
  const fps = Number(advertisedProfile?.fps);
  const profileLabel = Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0
    ? `${width}×${height}${Number.isFinite(fps) && fps > 0 ? ` ${fps}fps` : ""}`
    : null;

  const startLive = async (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setStarting(true);
    setStreamError(null);
    try {
      const nextSession = await startLiveFromBrowser(camera.cameraId, quality === "MAIN" ? "main" : "sub");
      if (!nextSession.hls?.url) throw new Error("No playable HLS stream was returned by the media gateway.");
      setSession(nextSession);
    } catch (reason) {
      setSession(null);
      setStreamError(reason instanceof Error ? reason.message : "Live stream is unavailable.");
    } finally {
      setStarting(false);
    }
  };

  const presentationBadge = isOffline ? (
    <StatusBadge tone="rose">SIGNAL LOST</StatusBadge>
  ) : isNotRecording ? (
    <StatusBadge tone="amber">NOT RECORDING</StatusBadge>
  ) : live && camera.health.recording === "RECORDING" ? (
    <StatusBadge tone="emerald">LIVE · RECORDING</StatusBadge>
  ) : camera.health.recording === "RECORDING" ? (
    <StatusBadge tone="emerald">RECORDING</StatusBadge>
  ) : (
    <StatusBadge tone="slate">{isDecoderAllocated ? "READY" : "QUEUED"}</StatusBadge>
  );

  return (
    <>
      <div
        onClick={() => onSelect?.(camera.cameraId)}
        onDoubleClick={() => onDoubleClick?.(camera.cameraId)}
        className={`group relative flex aspect-video select-none flex-col justify-between overflow-hidden rounded-lg border bg-slate-900 transition-all ${
          isCriticalAlarm
            ? "border-rose-500 ring-2 ring-rose-500/50 shadow-lg shadow-rose-950/50"
            : isSelected
              ? "border-sky-500 ring-2 ring-sky-500/40"
              : "border-slate-800 hover:border-slate-700"
        }`}
      >
        <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between bg-gradient-to-b from-black/80 via-black/40 to-transparent p-2">
          <div className="flex items-center gap-1.5 font-mono text-xs font-semibold text-slate-100 drop-shadow">
            <CameraIcon className="h-3.5 w-3.5 text-slate-400" />
            <span>{camera.name || `CH-${camera.channelNumber}`}</span>
          </div>
          <div className="flex items-center gap-1.5">
            {presentationBadge}
            <button
              type="button"
              title="View video path diagnostics"
              onClick={(event) => {
                event.stopPropagation();
                setShowDiagnosticModal(true);
              }}
              className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-800 hover:text-indigo-300"
            >
              <Layers className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              title={isPinned ? "Unpin camera" : "Pin camera"}
              onClick={(event) => {
                event.stopPropagation();
                onPinToggle?.(camera.cameraId);
              }}
              className={`rounded p-1 transition-colors ${
                isPinned ? "bg-amber-950/70 text-amber-400" : "text-slate-400 opacity-0 hover:text-slate-200 group-hover:opacity-100"
              }`}
            >
              <Pin className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="relative flex h-full w-full flex-1 items-center justify-center bg-slate-950">
          {isOffline ? (
            <div className="flex flex-col items-center justify-center p-4 text-center">
              <WifiOff className="mb-2 h-8 w-8 text-rose-400/80" />
              <div className="font-mono text-xs font-semibold text-rose-300">SIGNAL LOST</div>
              <div className="mt-1 text-[10px] text-slate-500">Camera or recorder channel is unavailable</div>
            </div>
          ) : session?.hls ? (
            <HlsPlayer
              url={session.hls.url}
              bearerToken={session.hls.bearerToken ?? ""}
              cameraName={camera.name}
              cameraId={camera.cameraId}
            />
          ) : (
            <div className="relative w-full h-full">
              <CctvVisualCanvas
                cameraName={camera.name || `CAM-${camera.channelNumber}`}
                branchName="BRANCH STREAM"
                zone={`CH-${camera.channelNumber}`}
                status={isOffline ? "offline" : "online"}
              />
              {isDecoderAllocated && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity hover:opacity-100">
                  <button
                    type="button"
                    onClick={startLive}
                    disabled={starting}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-lg hover:bg-blue-500 disabled:opacity-60"
                  >
                    {starting ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Radio className="h-3.5 w-3.5" />}
                    {starting ? "Authorizing…" : "Full Stream"}
                  </button>
                </div>
              )}
            </div>
          )}

          {isAlarmActive && (
            <div className="absolute inset-x-0 bottom-8 z-20 flex items-center gap-1.5 border-y border-rose-700 bg-rose-950/90 px-3 py-1 font-mono text-[11px] font-bold text-rose-200">
              <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-rose-400" />
              <span className="truncate">ACTIVE {camera.alertSeverity ?? "CAMERA"} ALERT</span>
            </div>
          )}
        </div>

        <div className="absolute inset-x-0 bottom-0 z-20 flex items-center justify-between bg-gradient-to-t from-black/90 via-black/50 to-transparent px-2.5 py-1.5 font-mono text-[11px]">
          <div className="flex items-center gap-2">
            {live && (
              <div className="flex items-center gap-1 font-medium text-emerald-400">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <span>LIVE</span>
              </div>
            )}
            {isNotRecording ? (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onInvestigate?.(camera.cameraId);
                }}
                className="flex items-center gap-1 font-bold text-rose-400 hover:underline"
              >
                <AlertOctagon className="h-3 w-3" />
                <span>NOT RECORDING</span>
              </button>
            ) : camera.health.recording === "RECORDING" ? (
              <div className="flex items-center gap-1 text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                <span>RECORDING</span>
              </div>
            ) : null}
          </div>
          <div className="flex items-center gap-2 text-slate-400">
            {profileLabel && <span className="text-[10px] uppercase">{profileLabel}</span>}
            <Maximize2 className="h-3 w-3 opacity-0 group-hover:opacity-100" />
          </div>
        </div>
      </div>

      <CameraDiagnosticModal
        isOpen={showDiagnosticModal}
        onClose={() => setShowDiagnosticModal(false)}
        camera={camera}
      />
    </>
  );
}

function StatusBadge({
  tone,
  children,
}: {
  tone: "rose" | "amber" | "emerald" | "slate";
  children: ReactNode;
}) {
  const classes = {
    rose: "border-rose-700 bg-rose-950/90 text-rose-300",
    amber: "border-amber-700 bg-amber-950/90 text-amber-300",
    emerald: "border-emerald-700 bg-emerald-950/90 text-emerald-300",
    slate: "border-slate-700 bg-slate-800 text-slate-300",
  };
  return <span className={`rounded border px-2 py-0.5 text-[10px] font-bold ${classes[tone]}`}>{children}</span>;
}
