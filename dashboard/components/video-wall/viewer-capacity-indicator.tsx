"use client";

import React from "react";
import { Zap, Activity, Cpu, Radio, ShieldAlert, Layers } from "lucide-react";
import type { ViewerCapacity, ViewerPerformance } from "@/lib/viewer-capacity";

export interface ViewerCapacityIndicatorProps {
  capacity: ViewerCapacity;
  performance?: ViewerPerformance;
  rotatingCount?: number;
  compact?: boolean;
}

export function ViewerCapacityIndicator({
  capacity,
  performance,
  rotatingCount = 0,
  compact = false,
}: ViewerCapacityIndicatorProps) {
  const pressure = performance?.pressure ?? "NORMAL";
  const decoderUtilization = Math.round(
    (capacity.activeDecoders / Math.max(1, capacity.maxVideoDecoders)) * 100
  );
  const bitrateUtilization = Math.round(
    (capacity.activeBitrateMbps / Math.max(1, capacity.maxAggregateBitrateMbps)) * 100
  );

  const getPressureBadge = () => {
    switch (pressure) {
      case "CRITICAL":
        return <span className="px-2 py-0.5 text-xs font-semibold rounded bg-rose-950 text-rose-300 border border-rose-800 animate-pulse">CRITICAL</span>;
      case "HIGH":
        return <span className="px-2 py-0.5 text-xs font-semibold rounded bg-amber-950 text-amber-300 border border-amber-800">HIGH PRESSURE</span>;
      case "NORMAL":
        return <span className="px-2 py-0.5 text-xs font-semibold rounded bg-emerald-950 text-emerald-300 border border-emerald-800">OPTIMAL</span>;
      default:
        return <span className="px-2 py-0.5 text-xs font-semibold rounded bg-slate-900 text-slate-300 border border-slate-700">LOW</span>;
    }
  };

  if (compact) {
    return (
      <div className="flex items-center gap-3 px-3 py-1.5 bg-slate-900/90 border border-slate-800 rounded-md text-xs font-mono text-slate-300 shadow-sm">
        <div className="flex items-center gap-1.5">
          <Cpu className="w-3.5 h-3.5 text-sky-400" />
          <span>Decoders: <strong>{capacity.activeDecoders}/{capacity.maxVideoDecoders}</strong></span>
        </div>
        <div className="h-3 w-[1px] bg-slate-700" />
        <div className="flex items-center gap-1.5">
          <Radio className="w-3.5 h-3.5 text-emerald-400" />
          <span>{capacity.activeBitrateMbps.toFixed(1)} Mbps</span>
        </div>
        <div className="h-3 w-[1px] bg-slate-700" />
        {getPressureBadge()}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-2.5 bg-slate-950/80 backdrop-blur border border-slate-800 rounded-lg text-xs font-mono text-slate-300">
      <div className="flex items-center gap-6">
        {/* Active Decoders */}
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded bg-sky-950/60 border border-sky-800/60 text-sky-400">
            <Cpu className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-400 font-sans">Active Decoders</div>
            <div className="font-semibold text-slate-100">
              {capacity.activeDecoders} / {capacity.maxVideoDecoders} <span className="text-slate-500 text-[10px]">({decoderUtilization}%)</span>
            </div>
          </div>
        </div>

        {/* Network Bitrate */}
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded bg-emerald-950/60 border border-emerald-800/60 text-emerald-400">
            <Radio className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-400 font-sans">Bandwidth</div>
            <div className="font-semibold text-slate-100">
              {capacity.activeBitrateMbps.toFixed(1)} / {capacity.maxAggregateBitrateMbps} Mbps
            </div>
          </div>
        </div>

        {/* Rotating Snapshots */}
        {rotatingCount > 0 && (
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded bg-amber-950/60 border border-amber-800/60 text-amber-400">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-400 font-sans">Rotating / Snapshots</div>
              <div className="font-semibold text-amber-300">{rotatingCount} tiles</div>
            </div>
          </div>
        )}

        {/* GPU Hardware Acceleration */}
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded bg-purple-950/60 border border-purple-800/60 text-purple-400">
            <Zap className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-400 font-sans">GPU Decode</div>
            <div className="font-semibold text-slate-100">{capacity.hardwareAcceleration}</div>
          </div>
        </div>
      </div>

      {/* Pressure & Frame Drop Telemetry */}
      <div className="flex items-center gap-3">
        {performance && (
          <div className="text-[11px] text-slate-400">
            Drop Ratio: <span className={performance.droppedFrameRatio > 0.05 ? "text-rose-400 font-semibold" : "text-slate-300"}>
              {(performance.droppedFrameRatio * 100).toFixed(1)}%
            </span>
          </div>
        )}
        {getPressureBadge()}
      </div>
    </div>
  );
}
