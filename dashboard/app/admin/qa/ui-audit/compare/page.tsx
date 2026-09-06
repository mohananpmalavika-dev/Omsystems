"use client";

import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AppLayout } from "@/components/app-layout";
import {
  ArrowLeft,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Bug,
  Scale,
} from "lucide-react";

function QAComparisonContent() {
  const searchParams = useSearchParams();
  const baseId = searchParams ? searchParams.get("base") : null;
  const targetId = searchParams ? searchParams.get("target") : null;

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    if (!baseId || !targetId) {
      setLoading(false);
      return;
    }

    fetch(`/api/admin/qa/compare?base=${baseId}&target=${targetId}`)
      .then((res) => res.json())
      .then((d) => {
        if (d.success) setData(d.comparison);
      })
      .catch((err) => console.error("Failed to compare runs:", err))
      .finally(() => setLoading(false));
  }, [baseId, targetId]);

  if (!baseId || !targetId) {
    return (
      <AppLayout>
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-12 text-center text-slate-400">
          <Scale className="mx-auto h-12 w-12 text-slate-600 mb-3" />
          <h2 className="text-lg font-semibold text-white">Compare QA Runs</h2>
          <p className="mt-1 text-sm">Select two runs from the Run History tab in the QA Audit page to compare.</p>
          <Link
            href="/admin/qa/ui-audit"
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to QA Hub
          </Link>
        </div>
      </AppLayout>
    );
  }

  if (loading) {
    return (
      <AppLayout>
        <div className="flex h-96 items-center justify-center text-slate-400">
          Comparing {baseId} vs {targetId}...
        </div>
      </AppLayout>
    );
  }

  if (!data) {
    return (
      <AppLayout>
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-12 text-center text-slate-400">
          Failed to load comparison data.
        </div>
      </AppLayout>
    );
  }

  const scoreDiff = data.scoreDiff || 0;

  return (
    <AppLayout>
      <div className="space-y-6 pb-16">
        <Link
          href="/admin/qa/ui-audit"
          className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to QA Hub
        </Link>

        {/* Comparison Header */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6">
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-purple-400">
                Run-to-Run Regression Analysis
              </span>
              <h1 className="mt-1 text-2xl font-bold text-white flex items-center gap-3">
                <span>{baseId}</span>
                <ArrowRight className="h-5 w-5 text-slate-500" />
                <span>{targetId}</span>
              </h1>
              <p className="mt-1 text-xs text-slate-400">
                Baseline: <strong>{data.baseRun?.score ?? "—"}/100</strong> | Target:{" "}
                <strong>{data.targetRun?.score ?? "—"}/100</strong>
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div
                className={`flex items-center gap-2 rounded-xl border p-4 ${
                  scoreDiff > 0
                    ? "border-emerald-500/40 bg-emerald-950/20 text-emerald-400"
                    : scoreDiff < 0
                    ? "border-red-500/40 bg-red-950/20 text-red-400"
                    : "border-slate-700 bg-slate-800 text-slate-300"
                }`}
              >
                {scoreDiff > 0 ? (
                  <TrendingUp className="h-6 w-6" />
                ) : scoreDiff < 0 ? (
                  <TrendingDown className="h-6 w-6" />
                ) : (
                  <Scale className="h-6 w-6" />
                )}
                <div>
                  <div className="text-xs font-semibold uppercase">Score Shift</div>
                  <div className="text-xl font-bold">
                    {scoreDiff > 0 ? `+${scoreDiff}` : scoreDiff} pts
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Diff KPI Cards */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="text-xs text-slate-400">New Issues Introduced</div>
            <div className="mt-1 text-2xl font-bold text-red-400">{data.newIssues?.length || 0}</div>
            <div className="text-[11px] text-slate-500 mt-1">Potential regressions</div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="text-xs text-slate-400">Resolved Issues</div>
            <div className="mt-1 text-2xl font-bold text-emerald-400">{data.resolvedIssues?.length || 0}</div>
            <div className="text-[11px] text-slate-500 mt-1">Fixed since baseline</div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="text-xs text-slate-400">New Pages Discovered</div>
            <div className="mt-1 text-2xl font-bold text-blue-400">{data.newPages?.length || 0}</div>
            <div className="text-[11px] text-slate-500 mt-1">Expanded surface</div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="text-xs text-slate-400">Removed / Lost Pages</div>
            <div className="mt-1 text-2xl font-bold text-amber-400">{data.removedPages?.length || 0}</div>
            <div className="text-[11px] text-slate-500 mt-1">Unreachable routes</div>
          </div>
        </div>

        {/* New Issues Section */}
        <div className="space-y-3">
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <Bug className="h-4 w-4 text-red-400" />
            New Issues Introduced in {targetId}
          </h2>
          {data.newIssues?.length === 0 ? (
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6 text-center text-xs text-emerald-400">
              <CheckCircle2 className="mx-auto h-6 w-6 mb-1" />
              No new regressions introduced in this run.
            </div>
          ) : (
            <div className="space-y-2">
              {data.newIssues?.map((issue: any) => (
                <div
                  key={issue.id}
                  className="rounded-xl border border-red-500/20 bg-red-950/10 p-3.5 text-xs text-slate-300"
                >
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-red-950 px-2 py-0.5 font-bold text-red-400 text-[10px]">
                      {issue.severity}
                    </span>
                    <span className="font-semibold text-white">{issue.title}</span>
                  </div>
                  <div className="text-slate-400 text-[11px] mt-1">Page: {issue.page_url || issue.pageUrl}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Resolved Issues Section */}
        <div className="space-y-3">
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            Issues Resolved in {targetId}
          </h2>
          {data.resolvedIssues?.length === 0 ? (
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6 text-center text-xs text-slate-500">
              No previous issues were marked as resolved.
            </div>
          ) : (
            <div className="space-y-2">
              {data.resolvedIssues?.map((issue: any) => (
                <div
                  key={issue.id}
                  className="rounded-xl border border-emerald-500/20 bg-emerald-950/10 p-3.5 text-xs text-slate-300"
                >
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-emerald-950 px-2 py-0.5 font-bold text-emerald-400 text-[10px]">
                      RESOLVED
                    </span>
                    <span className="font-semibold text-white line-through text-slate-400">{issue.title}</span>
                  </div>
                  <div className="text-slate-500 text-[11px] mt-1">Page: {issue.page_url || issue.pageUrl}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

export default function QAComparisonPage() {
  return (
    <Suspense
      fallback={
        <AppLayout>
          <div className="flex h-96 items-center justify-center text-slate-400">
            Loading comparison...
          </div>
        </AppLayout>
      }
    >
      <QAComparisonContent />
    </Suspense>
  );
}

