"use client";

import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  Building2,
  Camera,
  CheckCircle2,
  HardDrive,
  HelpCircle,
  Radio,
  Server,
  ShieldAlert,
  Wifi,
  WifiOff,
  XCircle,
} from "lucide-react";
import type { HealthSummary } from "@/lib/types/operational-health";
import {
  getBranchStatusCards,
  getOperationalTelemetryCards,
  getHealthScoreTone,
  type BranchSummaryFilter,
  type BranchSummaryTone,
} from "./branch-summary-model";

const toneClasses: Record<BranchSummaryTone, { card: string; active: string; text: string }> = {
  blue: {
    card: "border-blue-200 bg-blue-50/70 text-blue-900 hover:border-blue-400 hover:bg-blue-50",
    active: "ring-2 ring-blue-600 bg-blue-100 border-blue-500 text-blue-950 font-semibold",
    text: "text-blue-700",
  },
  green: {
    card: "border-emerald-200 bg-emerald-50/70 text-emerald-900 hover:border-emerald-400 hover:bg-emerald-50",
    active: "ring-2 ring-emerald-600 bg-emerald-100 border-emerald-500 text-emerald-950 font-semibold",
    text: "text-emerald-700",
  },
  red: {
    card: "border-rose-200 bg-rose-50/70 text-rose-900 hover:border-rose-400 hover:bg-rose-50",
    active: "ring-2 ring-rose-600 bg-rose-100 border-rose-500 text-rose-950 font-semibold",
    text: "text-rose-700",
  },
  amber: {
    card: "border-amber-200 bg-amber-50/70 text-amber-900 hover:border-amber-400 hover:bg-amber-50",
    active: "ring-2 ring-amber-600 bg-amber-100 border-amber-500 text-amber-950 font-semibold",
    text: "text-amber-700",
  },
  gray: {
    card: "border-slate-200 bg-slate-50/70 text-slate-900 hover:border-slate-400 hover:bg-slate-50",
    active: "ring-2 ring-slate-600 bg-slate-100 border-slate-500 text-slate-950 font-semibold",
    text: "text-slate-700",
  },
};

const statusIcons = {
  total: Building2,
  healthy: CheckCircle2,
  warning: AlertTriangle,
  critical: XCircle,
  unknown: HelpCircle,
};

const telemetryIcons = {
  cameras: Camera,
  recorders: Server,
  recording: Radio,
  hddCritical: HardDrive,
  retentionViolations: AlertOctagon,
  internetOffline: WifiOff,
  p1Alerts: ShieldAlert,
};

export function BranchSummaryWidget({
  summary,
  activeFilter,
  onSelect,
}: {
  summary: HealthSummary;
  activeFilter?: BranchSummaryFilter;
  onSelect: (filter: BranchSummaryFilter) => void;
}) {
  const statusCards = getBranchStatusCards(summary);
  const telemetryCards = getOperationalTelemetryCards(summary);
  const scoreTone = getHealthScoreTone(summary.overallHealthScore);

  const isFilterActive = (filter: BranchSummaryFilter) => {
    if (!activeFilter) return filter.kind === "all";
    if (filter.kind === "all" && activeFilter.kind === "all") return true;
    if (filter.kind === "health" && activeFilter.kind === "health") {
      return filter.value === activeFilter.value;
    }
    if (filter.kind === "connectivity" && activeFilter.kind === "connectivity") {
      return filter.value === activeFilter.value;
    }
    return filter.kind === activeFilter.kind;
  };

  return (
    <section className="card mb-6 space-y-4 shadow-sm" aria-labelledby="branch-summary-heading">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <h3 id="branch-summary-heading" className="text-base font-bold uppercase tracking-wider text-gray-900">
              Surveillance Operations — {summary.totalBranches} Branches
            </h3>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            Real-time Head Office operational command ribbon. Click any KPI metric to filter the mosaic below.
          </p>
        </div>

        {activeFilter && activeFilter.kind !== "all" && (
          <div className="flex items-center gap-2 rounded-lg bg-blue-50 border border-blue-200 px-2.5 py-1 text-xs text-blue-800">
            <span>
              Filtered by: <strong>{activeFilter.kind.replace("-", " ").toUpperCase()}</strong>
            </span>
            <button
              type="button"
              onClick={() => onSelect({ kind: "all" })}
              className="ml-1 text-blue-600 hover:text-blue-900 underline font-semibold text-[11px]"
            >
              Reset
            </button>
          </div>
        )}
      </div>

      {/* Row 1: Primary Branch Fleet Health */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        {statusCards.map((item) => {
          const Icon = statusIcons[item.id as keyof typeof statusIcons] || Building2;
          const active = isFilterActive(item.filter);
          const tone = toneClasses[item.tone];

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.filter)}
              aria-label={`Filter by ${item.label}`}
              className={`flex flex-col justify-between rounded-xl border p-3.5 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                active ? tone.active : tone.card
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-[11px] font-bold uppercase tracking-wider opacity-85">{item.label}</span>
                <Icon size={16} className={tone.text} aria-hidden="true" />
              </div>
              <div className="mt-2 text-2xl font-extrabold tabular-nums tracking-tight">{item.value}</div>
              <div className="mt-1 text-[10px] opacity-75 font-medium">{item.subLabel}</div>
            </button>
          );
        })}

        {/* System Health Score */}
        <div
          className={`flex flex-col justify-between rounded-xl border p-3.5 ${
            scoreTone === "green"
              ? "border-emerald-200 bg-emerald-50/70 text-emerald-900"
              : scoreTone === "amber"
              ? "border-amber-200 bg-amber-50/70 text-amber-900"
              : "border-rose-200 bg-rose-50/70 text-rose-900"
          }`}
          aria-label={`Overall system health score ${summary.overallHealthScore} percent`}
        >
          <div className="flex items-center justify-between gap-1">
            <span className="text-[11px] font-bold uppercase tracking-wider opacity-85">System Health</span>
            <Activity size={16} className="opacity-80" aria-hidden="true" />
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-2xl font-extrabold tabular-nums">{summary.overallHealthScore.toFixed(1)}</span>
            <span className="text-xs font-bold">%</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-black/10">
            <div
              className="h-full rounded-full bg-current transition-all duration-500"
              style={{ width: `${Math.min(100, Math.max(0, summary.overallHealthScore))}%` }}
            />
          </div>
        </div>
      </div>

      {/* Row 2: Operational Telemetry Ribbon */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        {telemetryCards.map((item) => {
          const Icon = telemetryIcons[item.id as keyof typeof telemetryIcons] || Radio;
          const active = isFilterActive(item.filter);
          const tone = toneClasses[item.tone];

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.filter)}
              aria-label={`Filter by ${item.label}`}
              className={`flex flex-col justify-between rounded-lg border p-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                active ? tone.active : tone.card
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-[10px] font-bold uppercase tracking-wider opacity-85">{item.label}</span>
                <Icon size={14} className={tone.text} aria-hidden="true" />
              </div>
              <div className="mt-1.5 text-base font-bold tabular-nums tracking-tight truncate">{item.value}</div>
              <div className="mt-0.5 text-[10px] opacity-75 font-medium truncate">{item.subLabel}</div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
