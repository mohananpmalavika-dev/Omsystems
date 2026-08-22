"use client";

import { Camera, Clock, HardDrive, Radio, Server } from "lucide-react";
import type { BranchOperationalState } from "./types";

export interface RecorderHealthPanelProps {
  state: BranchOperationalState;
}

function formatBytes(value?: number): string {
  if (!Number.isFinite(value) || value === undefined || value < 0) return "Not reported";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let amount = value;
  let unit = 0;
  while (amount >= 1024 && unit < units.length - 1) {
    amount /= 1024;
    unit += 1;
  }
  return `${amount.toFixed(unit >= 3 ? 1 : 0)} ${units[unit]}`;
}

function formatTimestamp(value?: string): string {
  if (!value) return "Not reported";
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString() : "Not reported";
}

export function RecorderHealthPanel({ state }: RecorderHealthPanelProps) {
  const usedBytes = state.storage.totalBytes !== undefined && state.storage.freeBytes !== undefined
    ? Math.max(0, state.storage.totalBytes - state.storage.freeBytes)
    : undefined;

  return (
    <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-950 p-5 font-mono shadow-lg">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-sans text-sm font-bold text-slate-100">
          <Server className="h-4 w-4 text-sky-400" />
          <span>RECORDER & INFRASTRUCTURE HEALTH</span>
        </div>
        <span className="rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-xs font-semibold text-slate-300">
          {state.recorder.status}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 pt-2 md:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-2 rounded-lg border border-slate-800/80 bg-slate-900/60 p-3">
          <div className="flex items-center gap-1.5 font-sans text-[11px] uppercase tracking-wider text-slate-400">
            <Server className="h-3.5 w-3.5" /> Recorders
          </div>
          <div className="text-sm font-bold text-slate-200">
            {state.recorder.online} online / {state.recorder.total} registered
          </div>
          <div className="text-xs text-slate-400">{state.recorder.offline} offline</div>
        </div>

        <div className="space-y-2 rounded-lg border border-slate-800/80 bg-slate-900/60 p-3">
          <div className="flex items-center gap-1.5 font-sans text-[11px] uppercase tracking-wider text-slate-400">
            <Camera className="h-3.5 w-3.5" /> Camera recording
          </div>
          <div className="text-sm font-bold text-slate-200">
            {state.cameras.recording} recording / {state.cameras.total} registered
          </div>
          <div className="text-xs text-slate-400">{state.cameras.notRecording} not recording · {state.cameras.unknown} unknown</div>
        </div>

        <div className="space-y-2 rounded-lg border border-slate-800/80 bg-slate-900/60 p-3">
          <div className="flex items-center gap-1.5 font-sans text-[11px] uppercase tracking-wider text-slate-400">
            <HardDrive className="h-3.5 w-3.5" /> Storage telemetry
          </div>
          <div className="text-sm font-bold text-slate-200">
            {usedBytes === undefined ? "Capacity not reported" : `${formatBytes(usedBytes)} used`}
          </div>
          <div className="text-xs text-slate-400">
            {state.storage.disksHealthy} healthy · {state.storage.disksWarning} warning · {state.storage.disksFailed} failed
          </div>
          {state.storage.freeBytes !== undefined && (
            <div className="text-[10px] text-slate-500">{formatBytes(state.storage.freeBytes)} free</div>
          )}
        </div>

        <div className="space-y-2 rounded-lg border border-slate-800/80 bg-slate-900/60 p-3">
          <div className="flex items-center gap-1.5 font-sans text-[11px] uppercase tracking-wider text-slate-400">
            <Radio className="h-3.5 w-3.5" /> Gateway telemetry
          </div>
          <div className="text-sm font-bold text-slate-200">{state.gateway.status}</div>
          <div className="text-xs text-slate-400">Heartbeat: {formatTimestamp(state.gateway.lastHeartbeatAt)}</div>
          {state.gateway.version && <div className="text-[10px] text-slate-500">Version: {state.gateway.version}</div>}
        </div>
      </div>

      <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
        <Clock className="h-3 w-3" />
        Last health poll: {formatTimestamp(state.lastHealthPollAt)}
      </div>
    </div>
  );
}
