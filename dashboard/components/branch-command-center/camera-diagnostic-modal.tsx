"use client";

import React from "react";
import {
  Activity,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  HardDrive,
  Video,
  Radio,
  Clock,
  Layers,
  X,
} from "lucide-react";
import type { BranchCameraOperationalState } from "./types";

export interface CameraDiagnosticModalProps {
  isOpen: boolean;
  onClose: () => void;
  camera: BranchCameraOperationalState & {
    diagnostic?: {
      network?: { state: string; source: string; latencyMs?: number; errorCode?: string };
      stream?: { state: string; source: string; latencyMs?: number; errorCode?: string };
      decoding?: { state: string; source: string; latencyMs?: number; errorCode?: string };
      freeze?: { state: string; source: string; errorCode?: string };
      signal?: { state: string; source: string; errorCode?: string };
      recorderConnection?: { state: string; source: string };
      recording?: { state: string; source: string; errorCode?: string };
      lastFrameAt?: string;
      lastRecordingAt?: string;
      reasonCodes?: string[];
      state?: string;
    };
  };
}

export function CameraDiagnosticModal({
  isOpen,
  onClose,
  camera,
}: CameraDiagnosticModalProps) {
  if (!isOpen) return null;

  const channelNum = camera.channelNumber;
  const isLoss = camera.health.videoLoss === "DETECTED" || camera.health.connectivity === "OFFLINE";
  const isStoppedRecording = camera.health.recording === "NOT_RECORDING";
  const diag = camera.diagnostic;

  const layers = [
    {
      id: "L1",
      name: "Network Reachable",
      desc: "TCP Port 554 / 80 Socket Handshake",
      state: diag?.network?.state ?? "UNKNOWN",
      source: diag?.network?.source ?? "NOT_REPORTED",
      latency: diag?.network?.latencyMs !== undefined ? `${diag.network.latencyMs}ms` : undefined,
      icon: Radio,
    },
    {
      id: "L2",
      name: "RTSP Stream Available",
      desc: "RTSP DESCRIBE / SDP H.264 Video Track",
      state: diag?.stream?.state ?? "UNKNOWN",
      source: diag?.stream?.source ?? "NOT_REPORTED",
      latency: diag?.stream?.latencyMs !== undefined ? `${diag.stream.latencyMs}ms` : undefined,
      icon: Video,
    },
    {
      id: "L3",
      name: "Video Decodable",
      desc: "Valid NAL Units Decoded (>= 3 Frames)",
      state: diag?.decoding?.state ?? "UNKNOWN",
      source: diag?.decoding?.source ?? "NOT_REPORTED",
      latency: diag?.decoding?.latencyMs !== undefined ? `${diag.decoding.latencyMs}ms` : undefined,
      icon: Layers,
    },
    {
      id: "L4",
      name: "Frozen Video Detection",
      desc: "PTS Clock Progression & Hash Variance",
      state: diag?.freeze?.state ?? "UNKNOWN",
      source: diag?.freeze?.source ?? "NOT_REPORTED",
      icon: Activity,
    },
    {
      id: "L5",
      name: "Video Signal Present",
      desc: "DVR/NVR Video Loss Flag",
      state: diag?.signal?.state ?? "UNKNOWN",
      source: diag?.signal?.source ?? "NOT_REPORTED",
      icon: Video,
    },
    {
      id: "L6",
      name: "Recorder Channel Link",
      desc: "DVR/NVR Channel Configuration & Binding",
      state: diag?.recorderConnection?.state ?? "UNKNOWN",
      source: diag?.recorderConnection?.source ?? "NOT_REPORTED",
      icon: HardDrive,
    },
    {
      id: "L7",
      name: "Recording Active",
      desc: "Recent Archive Segments Verified on Storage",
      state: diag?.recording?.state ?? "UNKNOWN",
      source: diag?.recording?.source ?? "NOT_REPORTED",
      icon: HardDrive,
    },
  ];

  const overallState = diag?.state ?? (isLoss ? "CRITICAL" : isStoppedRecording ? "DEGRADED" : "UNKNOWN");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-2xl rounded-xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-100 flex items-center gap-2">
                {camera.name || `CAM${String(channelNum).padStart(2, "0")}`} — 7-Layer Video Path Diagnostics
              </h3>
              <p className="text-xs text-slate-400">
                Camera ID: <span className="font-mono text-slate-300">{camera.cameraId}</span> • Channel: {channelNum}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* Overall Health Summary Banner */}
          <div
            className={`p-4 rounded-lg border flex items-center justify-between ${
              overallState === "HEALTHY"
                ? "bg-emerald-950/30 border-emerald-500/30 text-emerald-300"
                : overallState === "DEGRADED"
                ? "bg-amber-950/30 border-amber-500/30 text-amber-300"
                : overallState === "CRITICAL"
                ? "bg-rose-950/30 border-rose-500/30 text-rose-300"
                : "bg-slate-950/50 border-slate-700 text-slate-300"
            }`}
          >
            <div className="flex items-center gap-3">
              {overallState === "HEALTHY" ? (
                <CheckCircle2 className="h-6 w-6 text-emerald-400" />
              ) : overallState === "DEGRADED" ? (
                <AlertTriangle className="h-6 w-6 text-amber-400" />
              ) : overallState === "CRITICAL" ? (
                <XCircle className="h-6 w-6 text-rose-400" />
              ) : (
                <AlertTriangle className="h-6 w-6 text-slate-400" />
              )}
              <div>
                <div className="text-sm font-semibold uppercase tracking-wider">
                  Overall State: {overallState}
                </div>
                <div className="text-xs text-slate-300">
                  {overallState === "HEALTHY"
                    ? "Live video streaming and archive recording are both verified operational."
                    : overallState === "DEGRADED"
                    ? "Live stream is decodable, but recording has halted (Compliance Warning)."
                    : overallState === "CRITICAL"
                    ? "Video stream or signal is offline/undecodable (Critical Surveillance Fault)."
                    : "No layer-by-layer diagnostic evidence has been reported for this camera."}
                </div>
              </div>
            </div>
            {diag?.reasonCodes && diag.reasonCodes.length > 0 && (
              <div className="text-right">
                <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-slate-900 border border-slate-700 text-slate-300">
                  {diag.reasonCodes.join(", ")}
                </span>
              </div>
            )}
          </div>

          {/* 7-Layer Diagnostic Matrix */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Evidence-Bearing Layer Verification
            </h4>
            <div className="divide-y divide-slate-800/80 rounded-lg border border-slate-800 bg-slate-950/40">
              {layers.map((layer) => {
                const Icon = layer.icon;
                const isPass = layer.state === "PASS";
                const isFail = layer.state === "FAIL";
                return (
                  <div key={layer.id} className="flex items-center justify-between p-3">
                    <div className="flex items-center gap-3">
                      <div className="w-6 text-[11px] font-mono font-bold text-slate-500">{layer.id}</div>
                      <Icon className="h-4 w-4 text-slate-400" />
                      <div>
                        <div className="text-xs font-medium text-slate-200">{layer.name}</div>
                        <div className="text-[11px] text-slate-400">{layer.desc}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="text-[11px] font-mono text-slate-400">Source: {layer.source}</div>
                        {layer.latency && (
                          <div className="text-[10px] text-slate-500 font-mono">RTT: {layer.latency}</div>
                        )}
                      </div>
                      <span
                        className={`px-2.5 py-1 rounded text-xs font-bold tracking-wider ${
                          isPass
                            ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400"
                            : isFail
                            ? "bg-rose-500/10 border border-rose-500/30 text-rose-400"
                            : "bg-slate-800 border border-slate-700 text-slate-400"
                        }`}
                      >
                        {layer.state}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Timing & Metadata Breakdown */}
          <div className="grid grid-cols-2 gap-3 text-xs bg-slate-950/40 border border-slate-800 rounded-lg p-3">
            <div className="space-y-1">
              <span className="text-slate-400 flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-slate-500" /> Last Decoded Frame
              </span>
              <div className="font-mono text-slate-200">{diag?.lastFrameAt || "Not reported"}</div>
            </div>
            <div className="space-y-1">
              <span className="text-slate-400 flex items-center gap-1.5">
                <HardDrive className="h-3.5 w-3.5 text-slate-500" /> Last Verified Recording
              </span>
              <div className="font-mono text-slate-200">{diag?.lastRecordingAt || "Not reported"}</div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end border-t border-slate-800 px-6 py-3 bg-slate-950/60">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
          >
            Close Diagnostics
          </button>
        </div>
      </div>
    </div>
  );
}
