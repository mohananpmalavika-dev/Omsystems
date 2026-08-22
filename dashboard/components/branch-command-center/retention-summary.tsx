"use client";

import React from "react";
import { Clock, AlertTriangle, CheckCircle2, ShieldAlert, FileText, Calendar } from "lucide-react";
import type { BranchOperationalState } from "./types";

export interface RetentionSummaryProps {
  state: BranchOperationalState;
  onDrillDown?: () => void;
}

export function RetentionSummary({ state, onDrillDown }: RetentionSummaryProps) {
  const isViolation = state.retention.status === "VIOLATION";
  const observedDays = state.retention.actualDays ?? 61;
  const requiredDays = state.retention.requiredDays ?? 90;
  const progressPercent = Math.min(100, Math.round((observedDays / requiredDays) * 100));

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4 font-mono">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-100 font-sans">
          <Clock className="w-4 h-4 text-amber-400" />
          <span>STATUTORY RETENTION COMPLIANCE</span>
        </div>
        <span
          className={`px-2.5 py-0.5 text-xs font-bold rounded ${
            isViolation
              ? "bg-rose-950 text-rose-300 border border-rose-700"
              : "bg-emerald-950 text-emerald-300 border border-emerald-700"
          }`}
        >
          {isViolation ? "RETENTION VIOLATION" : "COMPLIANT"}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
        {/* Progress & Target Days */}
        <div className="p-3.5 bg-slate-900/60 border border-slate-800/80 rounded-lg space-y-2">
          <div className="text-[11px] uppercase tracking-wider text-slate-400 font-sans">Retention Target</div>
          <div className="flex items-baseline gap-2">
            <span className={`text-2xl font-bold ${isViolation ? "text-rose-400" : "text-emerald-400"}`}>
              {observedDays}
            </span>
            <span className="text-sm text-slate-400">/ {requiredDays} Days Required</span>
          </div>

          {/* Progress Bar */}
          <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${isViolation ? "bg-rose-500" : "bg-emerald-500"}`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="text-[10px] text-slate-500">Coverage: {progressPercent}% of statutory minimum</div>
        </div>

        {/* Recording Intervals */}
        <div className="p-3.5 bg-slate-900/60 border border-slate-800/80 rounded-lg space-y-2">
          <div className="text-[11px] uppercase tracking-wider text-slate-400 font-sans">Archive Boundaries</div>
          <div className="space-y-1 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Oldest Available:</span>
              <span className="text-slate-200 font-semibold">{state.retention.oldestRecordingAt || "16-Jun-2026 03:12"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Newest Archive:</span>
              <span className="text-slate-200 font-semibold">{state.retention.newestRecordingAt || "16-Aug-2026 04:22"}</span>
            </div>
            <div className="flex items-center justify-between text-amber-400 pt-1">
              <span>Missing Gaps:</span>
              <span className="font-bold">{state.retention.missingIntervals ?? 2} intervals detected</span>
            </div>
          </div>
        </div>

        {/* Audit & Compliance Action */}
        <div className="p-3.5 bg-slate-900/60 border border-slate-800/80 rounded-lg flex flex-col justify-between">
          <div className="space-y-1">
            <div className="text-[11px] uppercase tracking-wider text-slate-400 font-sans">Regulatory Status</div>
            <div className="text-xs text-rose-300 font-medium">RBI 90-Day Mandate non-compliant</div>
            <div className="text-[10px] text-slate-500">Estimated 29 days missing footage</div>
          </div>

          <button
            onClick={onDrillDown}
            className="mt-3 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md text-xs font-semibold font-sans transition-colors"
          >
            <FileText className="w-3.5 h-3.5 text-sky-400" />
            <span>Generate Retention Audit</span>
          </button>
        </div>
      </div>
    </div>
  );
}
