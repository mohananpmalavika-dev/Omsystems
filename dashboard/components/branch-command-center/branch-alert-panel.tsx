"use client";

import React from "react";
import { ShieldAlert, AlertTriangle, CheckCircle, ArrowRight, Eye } from "lucide-react";
import type { BranchAlert } from "./types";

export interface BranchAlertPanelProps {
  alerts: BranchAlert[];
  onAcknowledge?: (alertId: string) => void;
  onInvestigateCamera?: (cameraId: string) => void;
}

export function BranchAlertPanel({
  alerts,
  onAcknowledge,
  onInvestigateCamera,
}: BranchAlertPanelProps) {
  if (alerts.length === 0) {
    return (
      <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 text-center text-xs text-slate-400 font-mono">
        <CheckCircle className="w-5 h-5 text-emerald-400 mx-auto mb-1" />
        No active operational or security alerts for this branch.
      </div>
    );
  }

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 shadow-lg space-y-3 font-mono">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-100 font-sans">
          <ShieldAlert className="w-4 h-4 text-rose-400" />
          <span>ACTIVE OPERATIONAL & AI ALERTS</span>
        </div>
        <span className="px-2 py-0.5 text-xs font-bold rounded bg-rose-950 text-rose-300 border border-rose-800">
          {alerts.length} UNRESOLVED
        </span>
      </div>

      <div className="divide-y divide-slate-800/80">
        {alerts.map((alert) => {
          const isP1 = alert.severity === "P1" || alert.severity === "CRITICAL";
          return (
            <div key={alert.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span
                  className={`px-2 py-0.5 text-[10px] font-bold rounded ${
                    isP1
                      ? "bg-rose-950 text-rose-300 border border-rose-700 animate-pulse"
                      : "bg-amber-950 text-amber-300 border border-amber-700"
                  }`}
                >
                  {alert.severity}
                </span>

                <div>
                  <div className="text-xs font-bold text-slate-200">{alert.title}</div>
                  <div className="text-[11px] text-slate-400 font-sans">{alert.message}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    Camera: <strong className="text-slate-300">{alert.cameraName || alert.cameraId}</strong> •{" "}
                    {alert.detectedAt}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {alert.cameraId && (
                  <button
                    onClick={() => onInvestigateCamera?.(alert.cameraId!)}
                    className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs font-sans transition-colors"
                  >
                    <Eye className="w-3.5 h-3.5 text-sky-400" />
                    <span>Focus Feed</span>
                  </button>
                )}

                <button
                  onClick={() => onAcknowledge?.(alert.id)}
                  className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 rounded text-xs font-sans transition-colors"
                >
                  Acknowledge
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
