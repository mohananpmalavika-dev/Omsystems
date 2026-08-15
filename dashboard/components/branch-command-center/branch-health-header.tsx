"use client";

import React from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  HardDrive,
  Radio,
  Server,
  ShieldAlert,
  Wifi,
  Clock,
  ChevronRight,
} from "lucide-react";
import type { BranchOperationalState } from "./types";

export interface BranchHealthHeaderProps {
  state: BranchOperationalState;
  onRefresh?: () => void;
}

export function BranchHealthHeader({ state, onRefresh }: BranchHealthHeaderProps) {
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "CRITICAL":
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-md bg-rose-950/80 text-rose-300 border border-rose-700 shadow-sm animate-pulse">
            <ShieldAlert className="w-3.5 h-3.5" />
            CRITICAL
          </span>
        );
      case "WARNING":
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-md bg-amber-950/80 text-amber-300 border border-amber-700 shadow-sm">
            <AlertTriangle className="w-3.5 h-3.5" />
            WARNING
          </span>
        );
      case "HEALTHY":
      case "ONLINE":
      case "COMPLIANT":
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-md bg-emerald-950/80 text-emerald-300 border border-emerald-700 shadow-sm">
            <CheckCircle2 className="w-3.5 h-3.5" />
            HEALTHY
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-md bg-slate-900 text-slate-300 border border-slate-700 shadow-sm">
            {status}
          </span>
        );
    }
  };

  const getSubStatusColor = (status: string) => {
    if (status === "ONLINE" || status === "HEALTHY" || status === "COMPLIANT") return "text-emerald-400";
    if (status === "WARNING" || status === "DEGRADED") return "text-amber-400";
    return "text-rose-400";
  };

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
      {/* Top row: Branch Identity & Overall Severity */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium text-slate-400">
            <span>HO Surveillance</span>
            <ChevronRight className="w-3.5 h-3.5" />
            <span>Branch Overview</span>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-slate-200">Branch {state.branchCode}</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-100 mt-1">
            BRANCH {state.branchCode} — {state.branchName.toUpperCase()}
          </h1>
        </div>

        <div className="flex items-center gap-3">
          {getStatusBadge(state.overallStatus)}
        </div>
      </div>

      {/* Grid of Telemetry Indicators */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 pt-2 border-t border-slate-800/80">
        {/* Internet */}
        <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800/70">
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-slate-400 font-medium">
            <Wifi className="w-3.5 h-3.5" />
            Internet
          </div>
          <div className={`text-sm font-semibold mt-1 ${getSubStatusColor(state.internet.status)}`}>
            {state.internet.status}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            {state.internet.latencyMs ? `${state.internet.latencyMs}ms latency` : "Active WAN"}
          </div>
        </div>

        {/* Gateway */}
        <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800/70">
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-slate-400 font-medium">
            <Radio className="w-3.5 h-3.5" />
            Gateway
          </div>
          <div className={`text-sm font-semibold mt-1 ${getSubStatusColor(state.gateway.status)}`}>
            {state.gateway.status}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            v{state.gateway.version ?? "1.4.2"}
          </div>
        </div>

        {/* DVR / NVR */}
        <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800/70">
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-slate-400 font-medium">
            <Server className="w-3.5 h-3.5" />
            DVR / NVR
          </div>
          <div className={`text-sm font-semibold mt-1 ${getSubStatusColor(state.recorder.status)}`}>
            {state.recorder.status}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            {state.recorder.online}/{state.recorder.total} online
          </div>
        </div>

        {/* Storage / HDD */}
        <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800/70">
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-slate-400 font-medium">
            <HardDrive className="w-3.5 h-3.5" />
            Storage / HDD
          </div>
          <div className={`text-sm font-semibold mt-1 ${getSubStatusColor(state.storage.status)}`}>
            {state.storage.status}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            {state.storage.disksWarning > 0 ? `${state.storage.disksWarning} disk warning` : "All disks normal"}
          </div>
        </div>

        {/* Recording */}
        <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800/70">
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-slate-400 font-medium">
            <Activity className="w-3.5 h-3.5" />
            Recording
          </div>
          <div className={`text-sm font-semibold mt-1 ${state.cameras.notRecording > 0 ? "text-amber-400" : "text-emerald-400"}`}>
            {state.cameras.recording} / {state.cameras.total}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            {state.cameras.notRecording > 0 ? `${state.cameras.notRecording} not recording` : "All channels recording"}
          </div>
        </div>

        {/* Retention */}
        <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800/70">
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-slate-400 font-medium">
            <Clock className="w-3.5 h-3.5" />
            Retention
          </div>
          <div className={`text-sm font-semibold mt-1 ${state.retention.status === "VIOLATION" ? "text-rose-400" : "text-emerald-400"}`}>
            {state.retention.actualDays ?? 61} / {state.retention.requiredDays} DAYS
          </div>
          <div className="text-[10px] font-medium text-slate-500 mt-0.5">
            {state.retention.status === "VIOLATION" ? "VIOLATION" : "COMPLIANT"}
          </div>
        </div>
      </div>
    </div>
  );
}
