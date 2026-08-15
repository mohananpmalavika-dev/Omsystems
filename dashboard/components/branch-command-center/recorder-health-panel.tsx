"use client";

import React from "react";
import { Server, HardDrive, Cpu, Clock, CheckCircle2, AlertTriangle, ShieldCheck } from "lucide-react";
import type { BranchOperationalState } from "./types";

export interface RecorderHealthPanelProps {
  state: BranchOperationalState;
}

export function RecorderHealthPanel({ state }: RecorderHealthPanelProps) {
  return (
    <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4 font-mono">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-100 font-sans">
          <Server className="w-4 h-4 text-sky-400" />
          <span>RECORDER & INFRASTRUCTURE HEALTH</span>
        </div>
        <span className="px-2 py-0.5 text-xs font-semibold rounded bg-emerald-950 text-emerald-300 border border-emerald-700">
          CP PLUS / ONVIF COMPLIANT
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
        {/* Device Model & Channels */}
        <div className="p-3 bg-slate-900/60 border border-slate-800/80 rounded-lg space-y-2">
          <div className="text-[11px] uppercase tracking-wider text-slate-400 font-sans">Device Profile</div>
          <div className="text-sm font-bold text-slate-200">DVR-01 (CP PLUS)</div>
          <div className="text-xs text-slate-400">
            Channels: <strong className="text-slate-200">{state.cameras.total} total</strong> ({state.cameras.recording} recording)
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-emerald-400">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Dahua CGI & ONVIF confirmed</span>
          </div>
        </div>

        {/* Storage Capacity & SMART Status */}
        <div className="p-3 bg-slate-900/60 border border-slate-800/80 rounded-lg space-y-2">
          <div className="text-[11px] uppercase tracking-wider text-slate-400 font-sans">Storage & SMART Health</div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-slate-200">3.6 / 4.0 TB</span>
            <span className="px-1.5 py-0.5 text-[10px] rounded bg-amber-950 text-amber-300 border border-amber-800">
              WARNING
            </span>
          </div>
          <div className="text-xs text-slate-400">
            Disks: <strong className="text-emerald-400">{state.storage.disksHealthy} healthy</strong>,{" "}
            <strong className="text-amber-400">{state.storage.disksWarning} warning</strong>
          </div>
          <div className="text-[10px] text-slate-500">Reallocated sectors detected on Disk 2</div>
        </div>

        {/* Clock Synchronization & Drift */}
        <div className="p-3 bg-slate-900/60 border border-slate-800/80 rounded-lg space-y-2">
          <div className="text-[11px] uppercase tracking-wider text-slate-400 font-sans">Time Synchronization</div>
          <div className="flex items-center gap-1.5 text-sm font-bold text-slate-200">
            <Clock className="w-4 h-4 text-emerald-400" />
            <span>+4 sec drift</span>
          </div>
          <div className="text-xs text-slate-400">NTP sync: Active</div>
          <div className="text-[10px] text-slate-500">Uptime: 37 days continuous</div>
        </div>

        {/* Gateway & Telemetry Polling */}
        <div className="p-3 bg-slate-900/60 border border-slate-800/80 rounded-lg space-y-2">
          <div className="text-[11px] uppercase tracking-wider text-slate-400 font-sans">Gateway Telemetry</div>
          <div className="flex items-center gap-1.5 text-sm font-bold text-emerald-400">
            <CheckCircle2 className="w-4 h-4" />
            <span>ONLINE</span>
          </div>
          <div className="text-xs text-slate-400">Heartbeat: 8 sec ago</div>
          <div className="text-[10px] text-slate-500">Telemetry Engine: v1.4.2</div>
        </div>
      </div>
    </div>
  );
}
