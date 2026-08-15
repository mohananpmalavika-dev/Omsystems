"use client";

import React from "react";
import {
  Video,
  WifiOff,
  AlertOctagon,
  Pin,
  Maximize2,
  MoreVertical,
  ShieldAlert,
  Play,
  Camera as CameraIcon,
} from "lucide-react";
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
  isDecoderAllocated = true,
  isPinned = false,
  isSelected = false,
  quality = "SUB",
  onSelect,
  onDoubleClick,
  onPinToggle,
  onInvestigate,
}: CameraTileProps) {
  const isOffline = camera.health.connectivity === "OFFLINE";
  const isNotRecording = camera.health.recording === "NOT_RECORDING";
  const isAlarmActive = Boolean(camera.alertActive || camera.alertSeverity);
  const isCriticalAlarm = camera.alertSeverity === "CRITICAL";

  // Determine operational presentation
  let presentationBadge = (
    <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-emerald-950/90 text-emerald-300 border border-emerald-700">
      LIVE
    </span>
  );

  if (isOffline) {
    presentationBadge = (
      <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-rose-950/90 text-rose-300 border border-rose-700">
        OFFLINE
      </span>
    );
  } else if (isNotRecording) {
    presentationBadge = (
      <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-amber-950/90 text-amber-300 border border-amber-700">
        NO RECORD
      </span>
    );
  } else if (!isDecoderAllocated) {
    presentationBadge = (
      <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-slate-800 text-slate-300 border border-slate-700">
        SNAPSHOT
      </span>
    );
  }

  return (
    <div
      onClick={() => onSelect?.(camera.cameraId)}
      onDoubleClick={() => onDoubleClick?.(camera.cameraId)}
      className={`group relative flex flex-col justify-between aspect-video rounded-lg overflow-hidden bg-slate-900 border transition-all cursor-pointer select-none ${
        isCriticalAlarm
          ? "border-rose-500 ring-2 ring-rose-500/50 shadow-rose-950/50 shadow-lg"
          : isSelected
          ? "border-sky-500 ring-2 ring-sky-500/40"
          : "border-slate-800 hover:border-slate-700"
      }`}
    >
      {/* Top Overlay Bar */}
      <div className="absolute top-0 inset-x-0 z-20 flex items-center justify-between p-2 bg-gradient-to-b from-black/80 via-black/40 to-transparent">
        <div className="flex items-center gap-1.5 font-mono text-xs font-semibold text-slate-100 drop-shadow">
          <CameraIcon className="w-3.5 h-3.5 text-slate-400" />
          <span>{camera.name || `CH-${camera.channelNumber}`}</span>
        </div>

        <div className="flex items-center gap-1.5">
          {presentationBadge}

          <button
            onClick={(e) => {
              e.stopPropagation();
              onPinToggle?.(camera.cameraId);
            }}
            className={`p-1 rounded transition-colors ${
              isPinned ? "text-amber-400 bg-amber-950/70" : "text-slate-400 opacity-0 group-hover:opacity-100 hover:text-slate-200"
            }`}
          >
            <Pin className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Tile Body */}
      <div className="relative flex-1 w-full h-full flex items-center justify-center bg-slate-950">
        {isOffline ? (
          // Offline Screen
          <div className="flex flex-col items-center justify-center p-4 text-center">
            <WifiOff className="w-8 h-8 text-rose-400/80 mb-2" />
            <div className="text-xs font-semibold text-rose-300 font-mono">NO SIGNAL</div>
            <div className="text-[10px] text-slate-500 mt-1">Last seen: 43 sec ago</div>
          </div>
        ) : (
          // Video / Snapshot Emulation Display
          <div className="relative w-full h-full flex items-center justify-center bg-slate-900 overflow-hidden">
            {/* Simulated Live Frame Background */}
            <div className="absolute inset-0 bg-gradient-to-tr from-slate-950 via-slate-900 to-slate-800 flex items-center justify-center">
              <span className="text-slate-700 font-mono text-xs font-bold tracking-widest uppercase">
                {isDecoderAllocated ? `${quality} STREAM` : "STATIC SNAPSHOT"}
              </span>
            </div>

            {/* Critical Alert Overlay */}
            {isAlarmActive && (
              <div className="absolute inset-x-0 bottom-8 z-20 flex items-center gap-1.5 px-3 py-1 bg-rose-950/90 border-y border-rose-700 text-rose-200 text-[11px] font-mono font-bold animate-pulse">
                <ShieldAlert className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                <span className="truncate">ALARM: Intrusion detected</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom Status Footer */}
      <div className="absolute bottom-0 inset-x-0 z-20 flex items-center justify-between px-2.5 py-1.5 bg-gradient-to-t from-black/90 via-black/50 to-transparent text-[11px] font-mono">
        {/* Left: Stream / Recording Status */}
        <div className="flex items-center gap-2">
          {!isOffline && (
            <>
              <div className="flex items-center gap-1 text-emerald-400 font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                <span>LIVE</span>
              </div>

              {isNotRecording ? (
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    onInvestigate?.(camera.cameraId);
                  }}
                  className="flex items-center gap-1 text-rose-400 font-bold hover:underline cursor-pointer"
                >
                  <AlertOctagon className="w-3 h-3" />
                  <span>REC ✕</span>
                </div>
              ) : (
                <div className="flex items-center gap-1 text-emerald-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span>REC ●</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Right: Resolution Profile & Expand Icon */}
        <div className="flex items-center gap-2 text-slate-400">
          {!isOffline && (
            <span className="text-[10px] uppercase">{quality === "MAIN" ? "1080p" : "360p"}</span>
          )}
          <Maximize2 className="w-3 h-3 opacity-0 group-hover:opacity-100 hover:text-slate-200" />
        </div>
      </div>
    </div>
  );
}
