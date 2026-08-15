"use client";

import React from "react";
import { Video, WifiOff, AlertOctagon, BellRing, Pin, Grid } from "lucide-react";
import type { BranchOperationalState, CameraFilter } from "./types";

export interface BranchHealthSummaryProps {
  state: BranchOperationalState;
  activeFilter: CameraFilter;
  alertingCount?: number;
  pinnedCount?: number;
  onFilterChange: (filter: CameraFilter) => void;
}

export function BranchHealthSummary({
  state,
  activeFilter,
  alertingCount = 1,
  pinnedCount = 0,
  onFilterChange,
}: BranchHealthSummaryProps) {
  const chips = [
    {
      id: "ALL" as CameraFilter,
      label: "ALL",
      count: state.cameras.total,
      icon: Grid,
      badgeColor: "bg-slate-800 text-slate-200 border-slate-700",
      activeColor: "bg-sky-600 text-white border-sky-500 shadow-md",
    },
    {
      id: "LIVE" as CameraFilter,
      label: "LIVE",
      count: state.cameras.online,
      icon: Video,
      badgeColor: "bg-emerald-950/70 text-emerald-300 border-emerald-800",
      activeColor: "bg-emerald-600 text-white border-emerald-500 shadow-md",
    },
    {
      id: "OFFLINE" as CameraFilter,
      label: "OFFLINE",
      count: state.cameras.offline,
      icon: WifiOff,
      badgeColor: state.cameras.offline > 0 ? "bg-rose-950/70 text-rose-300 border-rose-800 animate-pulse" : "bg-slate-900 text-slate-400 border-slate-800",
      activeColor: "bg-rose-600 text-white border-rose-500 shadow-md",
    },
    {
      id: "NO_RECORD" as CameraFilter,
      label: "NO RECORD",
      count: state.cameras.notRecording,
      icon: AlertOctagon,
      badgeColor: state.cameras.notRecording > 0 ? "bg-amber-950/70 text-amber-300 border-amber-800" : "bg-slate-900 text-slate-400 border-slate-800",
      activeColor: "bg-amber-600 text-white border-amber-500 shadow-md",
    },
    {
      id: "ALERTING" as CameraFilter,
      label: "ALERTING",
      count: alertingCount,
      icon: BellRing,
      badgeColor: alertingCount > 0 ? "bg-purple-950/70 text-purple-300 border-purple-800" : "bg-slate-900 text-slate-400 border-slate-800",
      activeColor: "bg-purple-600 text-white border-purple-500 shadow-md",
    },
    {
      id: "PINNED" as CameraFilter,
      label: "PINNED",
      count: pinnedCount,
      icon: Pin,
      badgeColor: "bg-slate-900 text-slate-400 border-slate-800",
      activeColor: "bg-blue-600 text-white border-blue-500 shadow-md",
    },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2.5 p-3 bg-slate-950/70 border border-slate-800/80 rounded-xl">
      <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 px-1 font-mono">
        Quick Filters:
      </span>
      {chips.map((chip) => {
        const Icon = chip.icon;
        const isActive = activeFilter === chip.id;
        return (
          <button
            key={chip.id}
            onClick={() => onFilterChange(chip.id)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium font-mono border transition-all ${
              isActive ? chip.activeColor : `${chip.badgeColor} hover:brightness-125`
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            <span>{chip.label}</span>
            <span className={`px-1.5 py-0.2 text-[11px] rounded font-bold ${isActive ? "bg-white/20 text-white" : "bg-black/40 text-slate-300"}`}>
              {chip.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
