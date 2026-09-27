"use client";

import { Clock, FileText } from "lucide-react";
import type { BranchOperationalState } from "./types";

export interface RetentionSummaryProps { state: BranchOperationalState; onDrillDown?: () => void; }

export function RetentionSummary({ state, onDrillDown }: RetentionSummaryProps) {
  const retention = state.retention;
  const observed = typeof retention.actualDays === "number" && Number.isFinite(retention.actualDays) && retention.actualDays >= 0 ? retention.actualDays : undefined;
  const required = Number.isFinite(retention.requiredDays) && retention.requiredDays > 0 ? retention.requiredDays : undefined;
  const status = observed === undefined || required === undefined ? "UNKNOWN" : observed < required ? "VIOLATION" : retention.status;
  const progress = observed !== undefined && required !== undefined ? Math.min(100, Math.round(observed / required * 100)) : undefined;
  const missing = observed !== undefined && required !== undefined ? Math.max(0, required - observed) : undefined;
  const tone = status === "VIOLATION" ? "text-rose-300 border-rose-700 bg-rose-950" : status === "COMPLIANT" ? "text-emerald-300 border-emerald-700 bg-emerald-950" : status === "WARNING" ? "text-amber-300 border-amber-700 bg-amber-950" : "text-slate-300 border-slate-700 bg-slate-900";
  return <section className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-4" aria-label="Branch retention compliance">
    <header className="flex flex-wrap items-center justify-between gap-3"><h3 className="flex items-center gap-2 text-sm text-slate-100"><Clock size={16}/>Recording retention compliance</h3><span className={`rounded border px-3 py-1 text-xs ${tone}`}>{status === "UNKNOWN" ? "EVIDENCE UNAVAILABLE" : status === "VIOLATION" ? "RETENTION VIOLATION" : status}</span></header>
    <div className="grid gap-4 md:grid-cols-3">
      <div><p className="text-xs text-slate-400">Verified / required days</p><strong className="text-xl text-slate-100">{observed ?? "Unknown"} / {required ?? "Unknown"}</strong>{progress !== undefined && <p className="text-xs text-slate-400">Coverage: {progress}% of prescribed minimum</p>}</div>
      <dl className="text-xs text-slate-400 space-y-2"><div><dt>Oldest available</dt><dd>{retention.oldestRecordingAt || "Not reported"}</dd></div><div><dt>Newest available</dt><dd>{retention.newestRecordingAt || "Not reported"}</dd></div><div><dt>Missing intervals</dt><dd>{retention.missingIntervals ?? "Not reported"}</dd></div></dl>
      <div><p className="text-xs text-slate-300">{status === "UNKNOWN" ? "Recorder evidence must be verified before assessing compliance." : status === "VIOLATION" ? `${missing} days below the prescribed retention period.` : status === "WARNING" ? "Recording coverage needs review." : "Reported coverage meets the prescribed period."}</p><button type="button" disabled={!onDrillDown} onClick={onDrillDown} className="mt-3 flex items-center gap-2 rounded border border-slate-700 px-3 py-2 text-xs text-slate-200 disabled:opacity-40"><FileText size={14}/>Review retention evidence</button></div>
    </div>
  </section>;
}
