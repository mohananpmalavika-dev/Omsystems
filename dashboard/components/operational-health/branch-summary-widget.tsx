"use client";

import { Activity, AlertTriangle, Building2, CircleOff, Wifi } from "lucide-react";
import type { HealthSummary } from "@/lib/types/operational-health";
import {
  getBranchSummaryItems,
  getHealthScoreTone,
  type BranchSummaryFilter,
  type BranchSummaryTone,
} from "./branch-summary-model";

const toneClasses: Record<BranchSummaryTone, string> = {
  blue: "border-blue-200 bg-blue-50 text-blue-700 hover:border-blue-400",
  green: "border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-400",
  red: "border-red-200 bg-red-50 text-red-700 hover:border-red-400",
  amber: "border-amber-200 bg-amber-50 text-amber-700 hover:border-amber-400",
  gray: "border-gray-200 bg-gray-50 text-gray-700 hover:border-gray-400",
};

const icons = {
  total: Building2,
  online: Wifi,
  offline: CircleOff,
  warning: AlertTriangle,
  critical: AlertTriangle,
  unknown: CircleOff,
};

export function BranchSummaryWidget({
  summary,
  onSelect,
}: {
  summary: HealthSummary;
  onSelect: (filter: BranchSummaryFilter) => void;
}) {
  const scoreTone = getHealthScoreTone(summary.overallHealthScore);
  const scoreClasses = toneClasses[scoreTone];

  return (
    <section className="card mb-6" aria-labelledby="branch-summary-heading">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 id="branch-summary-heading" className="text-lg font-semibold">Branch operational summary</h3>
          <p className="text-xs text-gray-500">Select a status to filter the enterprise branch overview.</p>
        </div>
        <span className="text-xs text-gray-400">Live fleet snapshot</span>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-7">
        {getBranchSummaryItems(summary).map((item) => {
          const Icon = icons[item.id];
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.filter)}
              aria-label={`Show ${item.label.toLowerCase()}`}
              className={`rounded-xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${toneClasses[item.tone]}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide opacity-80">{item.label}</span>
                <Icon size={18} aria-hidden="true" />
              </div>
              <div className="mt-3 text-3xl font-bold tabular-nums">{item.value}</div>
              <div className="mt-1 text-xs opacity-75">View filtered branches →</div>
            </button>
          );
        })}
        <div className={`col-span-2 rounded-xl border p-4 lg:col-span-1 ${scoreClasses}`} aria-label={`Overall system health score ${summary.overallHealthScore} percent`}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide opacity-80">System health</span>
            <Activity size={18} aria-hidden="true" />
          </div>
          <div className="mt-3 flex items-baseline gap-1">
            <span className="text-3xl font-bold tabular-nums">{summary.overallHealthScore.toFixed(1)}</span>
            <span className="text-sm font-semibold">%</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/70">
            <div className="h-full rounded-full bg-current" style={{ width: `${Math.min(100, Math.max(0, summary.overallHealthScore))}%` }} />
          </div>
        </div>
      </div>
    </section>
  );
}
