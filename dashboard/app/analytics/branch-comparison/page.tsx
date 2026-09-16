"use client";

import { useEffect, useState, useCallback } from "react";
import {
  TrendingUp,
  TrendingDown,
  Building2,
  Camera,
  AlertTriangle,
  CheckCircle2,
  Activity,
  Shield,
  RefreshCw,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import Link from "next/link";
import { cameraInventoryApi } from "@/lib/api-client";
import type { Branch } from "@/lib/types";

interface BranchMetrics {
  branchId: string;
  branchName: string;
  branchCode?: string;
  cameras: {
    total: number;
    online: number;
    healthy: number;
    healthScore: number;
  };
  compliance: {
    overallScore: number;
    recordingCompliance: number;
    storageHealth: number;
    maintenanceScore: number;
  };
  security: {
    activeRules: number;
    todayAlerts: number;
    criticalAlerts: number;
    violationRate: number;
  };
  banking: {
    cashVanSessions: number;
    compliantSessions: number;
    violations: number;
    complianceRate: number;
  };
  performance: {
    avgResponseTimeMs: number;
    uptime: number;
    lastIncidentDays: number;
  };
  rank: number;
  trend: "up" | "down" | "stable";
}

interface ComparisonSummary {
  totalBranches: number;
  avgComplianceScore: number;
  topPerformer: string;
  needsAttention: number;
  totalAlerts24h: number;
  avgCameraHealth: number;
}

const emptySummary: ComparisonSummary = {
  totalBranches: 0,
  avgComplianceScore: 0,
  topPerformer: "—",
  needsAttention: 0,
  totalAlerts24h: 0,
  avgCameraHealth: 0,
};

export default function BranchComparisonPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [metrics, setMetrics] = useState<BranchMetrics[]>([]);
  const [summary, setSummary] = useState<ComparisonSummary>(emptySummary);
  const [sortBy, setSortBy] = useState<"rank" | "compliance" | "health" | "alerts">("rank");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string }>();

  const refresh = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      // TODO: Replace with real API endpoint
      // const response = await fetch('/v1/analytics/branch-comparison');
      // const data = await response.json();

      // Mock data for demonstration - replace with real API
      const mockMetrics: BranchMetrics[] = branches.slice(0, 5).map((branch, idx) => ({
        branchId: branch.id,
        branchName: branch.name,
        branchCode: branch.code,
        cameras: {
          total: 12 + idx,
          online: 11 + idx - (idx === 4 ? 3 : 0),
          healthy: 10 + idx - (idx === 4 ? 4 : 0),
          healthScore: idx === 4 ? 65 : 90 + idx,
        },
        compliance: {
          overallScore: idx === 4 ? 72 : 88 + idx,
          recordingCompliance: idx === 4 ? 75 : 90 + idx,
          storageHealth: idx === 4 ? 68 : 85 + idx,
          maintenanceScore: idx === 4 ? 70 : 92 + idx,
        },
        security: {
          activeRules: 37,
          todayAlerts: idx === 4 ? 15 : 3 + idx,
          criticalAlerts: idx === 4 ? 3 : idx === 0 ? 0 : 1,
          violationRate: idx === 4 ? 12.5 : 2.5 + idx * 0.5,
        },
        banking: {
          cashVanSessions: 4 + idx,
          compliantSessions: idx === 4 ? 2 : 4 + idx,
          violations: idx === 4 ? 2 : 0,
          complianceRate: idx === 4 ? 50 : 100,
        },
        performance: {
          avgResponseTimeMs: idx === 4 ? 850 : 150 + idx * 50,
          uptime: idx === 4 ? 95.2 : 99.5 + idx * 0.1,
          lastIncidentDays: idx === 4 ? 2 : 15 + idx * 5,
        },
        rank: idx + 1,
        trend: idx === 0 ? "up" : idx === 4 ? "down" : "stable",
      }));

      const mockSummary: ComparisonSummary = {
        totalBranches: mockMetrics.length,
        avgComplianceScore: mockMetrics.reduce((sum, m) => sum + m.compliance.overallScore, 0) / mockMetrics.length,
        topPerformer: mockMetrics[0]?.branchName || "—",
        needsAttention: mockMetrics.filter(m => m.compliance.overallScore < 80).length,
        totalAlerts24h: mockMetrics.reduce((sum, m) => sum + m.security.todayAlerts, 0),
        avgCameraHealth: mockMetrics.reduce((sum, m) => sum + m.cameras.healthScore, 0) / mockMetrics.length,
      };

      setMetrics(mockMetrics);
      setSummary(mockSummary);
      setMessage(undefined);
    } catch (error) {
      if (!quiet) setMessage({ kind: "error", text: error instanceof Error ? error.message : "Failed to load comparison data" });
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [branches]);

  useEffect(() => {
    void cameraInventoryApi.listBranches("analytics:view")
      .then(({ data }) => {
        const next = data as Branch[];
        setBranches(next);
      })
      .catch((error) => setMessage({ kind: "error", text: error instanceof Error ? error.message : "Failed to load branches" }))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (branches.length === 0) return;
    void refresh();
    const timer = window.setInterval(() => void refresh(true), 60_000);
    return () => window.clearInterval(timer);
  }, [branches, refresh]);

  const sortedMetrics = [...metrics].sort((a, b) => {
    if (sortBy === "rank") return a.rank - b.rank;
    if (sortBy === "compliance") return b.compliance.overallScore - a.compliance.overallScore;
    if (sortBy === "health") return b.cameras.healthScore - a.cameras.healthScore;
    if (sortBy === "alerts") return a.security.todayAlerts - b.security.todayAlerts;
    return 0;
  });

  return (
    <main className="min-h-[calc(100vh-5rem)] bg-slate-950 p-4 text-slate-100 xl:p-6">
      <header className="relative mb-5 overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/90 p-6">
        <div className="absolute -right-16 -top-24 h-64 w-64 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-5">
          <div className="flex items-start gap-4">
            <span className="grid h-12 w-12 place-items-center rounded-2xl border border-cyan-500/25 bg-cyan-500/10 text-cyan-300">
              <BarChart3 size={24} />
            </span>
            <div>
              <p className="text-[11px] font-bold tracking-[.22em] text-cyan-300">MULTI-BRANCH ANALYTICS</p>
              <h1 className="mt-2 text-3xl font-bold">Branch Comparison</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
                Side-by-side performance comparison across all branches with compliance scoring, health metrics, and security analytics.
              </p>
            </div>
          </div>
          <button
            onClick={() => void refresh()}
            disabled={loading}
            className="grid h-10 w-10 place-items-center rounded-xl border border-slate-700 bg-slate-800 hover:border-cyan-500 disabled:opacity-40"
            aria-label="Refresh comparison"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </header>

      {message && (
        <div
          className={`mb-4 flex items-center gap-2 rounded-xl border p-3 text-sm ${
            message.kind === "error"
              ? "border-red-500/30 bg-red-500/10 text-red-200"
              : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
          }`}
        >
          {message.kind === "error" ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
          {message.text}
        </div>
      )}

      <section className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Total branches" value={summary.totalBranches} icon={<Building2 />} tone="cyan" />
        <MetricCard label="Avg compliance" value={`${summary.avgComplianceScore.toFixed(1)}%`} icon={<Shield />} tone="emerald" />
        <MetricCard label="Top performer" value={summary.topPerformer} icon={<TrendingUp />} tone="blue" isText />
        <MetricCard label="Needs attention" value={summary.needsAttention} icon={<AlertTriangle />} tone="amber" />
      </section>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
        <div>
          <p className="text-xs font-semibold text-slate-400">Sort by</p>
        </div>
        <div className="flex gap-2">
          {(["rank", "compliance", "health", "alerts"] as const).map((sort) => (
            <button
              key={sort}
              onClick={() => setSortBy(sort)}
              className={`rounded-xl px-4 py-2 text-xs font-bold capitalize ${
                sortBy === sort ? "bg-cyan-600 text-white" : "bg-slate-800 text-slate-400 hover:bg-slate-700"
              }`}
            >
              {sort}
            </button>
          ))}
        </div>
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/80">
        <header className="border-b border-slate-800 p-4">
          <p className="text-[10px] font-bold tracking-[.18em] text-cyan-300">COMPARISON TABLE</p>
          <h2 className="mt-1 font-semibold">Branch performance metrics</h2>
        </header>
        {loading && metrics.length === 0 ? (
          <Empty icon={<RefreshCw className="animate-spin" />} text="Loading comparison data…" />
        ) : metrics.length === 0 ? (
          <Empty icon={<Building2 />} text="No branch data available." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-800 bg-slate-950/50">
                <tr>
                  <th className="p-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">Rank</th>
                  <th className="p-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">Branch</th>
                  <th className="p-3 text-center text-[10px] font-bold uppercase tracking-wider text-slate-500">Compliance</th>
                  <th className="p-3 text-center text-[10px] font-bold uppercase tracking-wider text-slate-500">Camera Health</th>
                  <th className="p-3 text-center text-[10px] font-bold uppercase tracking-wider text-slate-500">Alerts (24h)</th>
                  <th className="p-3 text-center text-[10px] font-bold uppercase tracking-wider text-slate-500">Banking</th>
                  <th className="p-3 text-center text-[10px] font-bold uppercase tracking-wider text-slate-500">Trend</th>
                  <th className="p-3 text-center text-[10px] font-bold uppercase tracking-wider text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {sortedMetrics.map((metric) => (
                  <tr key={metric.branchId} className="hover:bg-slate-800/40">
                    <td className="p-3">
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-500/10 text-xs font-bold text-cyan-300">
                        {metric.rank}
                      </span>
                    </td>
                    <td className="p-3">
                      <strong className="block text-sm font-semibold text-slate-200">{metric.branchName}</strong>
                      <span className="text-[10px] text-slate-600">{metric.branchCode || metric.branchId.slice(0, 8)}</span>
                    </td>
                    <td className="p-3 text-center">
                      <ScoreCell score={metric.compliance.overallScore} />
                    </td>
                    <td className="p-3 text-center">
                      <ScoreCell score={metric.cameras.healthScore} />
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <span className="text-sm font-bold text-slate-200">{metric.security.todayAlerts}</span>
                        {metric.security.criticalAlerts > 0 && (
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500/20 text-[9px] font-bold text-red-300">
                            {metric.security.criticalAlerts}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-3 text-center">
                      <span className={`text-sm font-bold ${metric.banking.complianceRate === 100 ? "text-emerald-400" : metric.banking.complianceRate >= 80 ? "text-amber-400" : "text-red-400"}`}>
                        {metric.banking.complianceRate}%
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <TrendBadge trend={metric.trend} />
                    </td>
                    <td className="p-3 text-center">
                      <Link
                        href={`/operations/branches/${metric.branchId}`}
                        className="inline-flex items-center gap-1 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-300 hover:bg-slate-700"
                      >
                        View
                        <ArrowUpRight size={12} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {sortedMetrics.slice(0, 3).map((metric) => (
          <BranchCard key={metric.branchId} metric={metric} />
        ))}
      </section>
    </main>
  );
}

function BranchCard({ metric }: { metric: BranchMetrics }) {
  return (
    <article className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60">
      <header className="border-b border-slate-800 p-4">
        <div className="flex items-center justify-between">
          <div>
            <strong className="block font-semibold text-slate-100">{metric.branchName}</strong>
            <span className="text-[10px] text-slate-600">Rank #{metric.rank}</span>
          </div>
          <TrendBadge trend={metric.trend} />
        </div>
      </header>
      <div className="space-y-4 p-4">
        <div className="grid grid-cols-2 gap-3">
          <MiniMetric label="Compliance" value={`${metric.compliance.overallScore}%`} tone={metric.compliance.overallScore >= 90 ? "emerald" : metric.compliance.overallScore >= 80 ? "amber" : "red"} />
          <MiniMetric label="Camera health" value={`${metric.cameras.healthScore}%`} tone={metric.cameras.healthScore >= 90 ? "emerald" : metric.cameras.healthScore >= 80 ? "amber" : "red"} />
          <MiniMetric label="Alerts" value={String(metric.security.todayAlerts)} tone="amber" />
          <MiniMetric label="Banking" value={`${metric.banking.complianceRate}%`} tone={metric.banking.complianceRate === 100 ? "emerald" : "amber"} />
        </div>
        <Link
          href={`/operations/branches/${metric.branchId}`}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-700 px-4 py-2 text-xs font-bold text-slate-300 hover:bg-slate-800"
        >
          View details
          <ArrowUpRight size={13} />
        </Link>
      </div>
    </article>
  );
}

function ScoreCell({ score }: { score: number }) {
  const color = score >= 90 ? "text-emerald-400" : score >= 80 ? "text-amber-400" : score >= 70 ? "text-orange-400" : "text-red-400";
  return <span className={`text-sm font-bold ${color}`}>{score.toFixed(1)}%</span>;
}

function TrendBadge({ trend }: { trend: "up" | "down" | "stable" }) {
  if (trend === "up") return <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-300"><TrendingUp size={14} /></span>;
  if (trend === "down") return <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-red-500/20 text-red-300"><TrendingDown size={14} /></span>;
  return <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-slate-800 text-slate-500"><Activity size={14} /></span>;
}

function MetricCard({ label, value, icon, tone, isText = false }: { label: string; value: number | string; icon: React.ReactNode; tone: "cyan" | "emerald" | "blue" | "amber"; isText?: boolean }) {
  const colors = {
    cyan: "bg-cyan-500/10 text-cyan-300",
    emerald: "bg-emerald-500/10 text-emerald-300",
    blue: "bg-blue-500/10 text-blue-300",
    amber: "bg-amber-500/10 text-amber-300",
  };
  return (
    <article className="flex items-center gap-4 rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
      <span className={`grid h-10 w-10 place-items-center rounded-xl ${colors[tone]}`}>{icon}</span>
      <div>
        <p className={`${isText ? "text-lg" : "text-2xl"} font-bold ${isText ? "truncate max-w-[200px]" : ""}`}>{value}</p>
        <strong className="block text-xs text-slate-300">{label}</strong>
      </div>
    </article>
  );
}

function MiniMetric({ label, value, tone }: { label: string; value: string; tone: "emerald" | "amber" | "red" }) {
  const colors = {
    emerald: "bg-emerald-500/10 text-emerald-300",
    amber: "bg-amber-500/10 text-amber-300",
    red: "bg-red-500/10 text-red-300",
  };
  return (
    <div className={`rounded-xl border border-slate-800 p-3 ${colors[tone]}`}>
      <p className="text-xs font-semibold uppercase tracking-wider opacity-70">{label}</p>
      <p className="mt-1 text-lg font-bold">{value}</p>
    </div>
  );
}

function Empty({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="grid min-h-56 place-items-center p-8 text-center text-slate-600">
      <div>
        <span className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-xl bg-slate-800">{icon}</span>
        <p className="text-sm">{text}</p>
      </div>
    </div>
  );
}
