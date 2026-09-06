"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { AppLayout } from "@/components/app-layout";
import {
  ArrowLeft,
  Sparkles,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  Download,
  Video,
  FileCode,
  Layers,
  Terminal,
  Activity,
  BarChart3,
  Network,
  Eye,
  ExternalLink,
  Clock,
  Bug,
  ShieldCheck,
} from "lucide-react";

export default function QARunReportPage(props: { params: Promise<{ runId: string }> }) {
  const { runId } = use(props.params);

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<"graph" | "issues" | "pages" | "console" | "network" | "accessibility" | "artifacts">("issues");
  const [severityFilter, setSeverityFilter] = useState<string>("ALL");

  useEffect(() => {
    fetch(`/api/admin/qa/runs/${runId}`)
      .then((res) => res.json())
      .then((d) => {
        if (d.success) setData(d);
      })
      .catch((err) => console.error("Failed to load run:", err))
      .finally(() => setLoading(false));
  }, [runId]);

  if (loading) {
    return (
      <AppLayout>
        <div className="flex h-96 items-center justify-center text-slate-400">
          <Clock className="h-6 w-6 animate-spin mr-2" />
          Loading audit findings for {runId}...
        </div>
      </AppLayout>
    );
  }

  if (!data || !data.run) {
    return (
      <AppLayout>
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-12 text-center">
          <AlertTriangle className="mx-auto h-12 w-12 text-amber-500 mb-3" />
          <h2 className="text-lg font-semibold text-white">Audit Report Not Found</h2>
          <p className="mt-1 text-sm text-slate-400">The requested run ID "{runId}" does not exist.</p>
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

  const { run, pages = [], edges = [], issues = [], consoleEvents = [], networkEvents = [], artifacts = [] } = data;
  const score = run.overall_score ?? 0;
  const breakdown = run.score_breakdown || {};
  const stats = run.summary_stats || {};

  const scoreColor = score >= 80 ? "text-emerald-400" : score >= 60 ? "text-amber-400" : "text-red-400";
  const scoreBorder = score >= 80 ? "border-emerald-500" : score >= 60 ? "border-amber-500" : "border-red-500";

  const filteredIssues = issues.filter((i: any) => {
    if (severityFilter === "ALL") return true;
    return i.severity === severityFilter;
  });

  return (
    <AppLayout>
      <div className="space-y-6 pb-16">
        {/* Breadcrumb & Navigation */}
        <div className="flex items-center justify-between">
          <Link
            href="/admin/qa/ui-audit"
            className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Automated UI Audit
          </Link>

          <div className="flex items-center gap-2">
            <a
              href={`/api/admin/qa/runs/${runId}/artifacts/report.html`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-800"
            >
              <FileCode className="h-3.5 w-3.5 text-blue-400" />
              HTML Report
            </a>
            <a
              href={`/api/admin/qa/runs/${runId}/artifacts/report.json`}
              download
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-800"
            >
              <Download className="h-3.5 w-3.5 text-purple-400" />
              JSON Report
            </a>
          </div>
        </div>

        {/* Executive Header Banner */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6">
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-2.5">
                <span className="text-xs font-bold uppercase tracking-wider text-blue-400">QA Run Report</span>
                <span className="font-mono text-xs text-slate-400">#{run.id}</span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                    run.status === "COMPLETED"
                      ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                      : "bg-red-950 text-red-400 border border-red-800"
                  }`}
                >
                  {run.status}
                </span>
              </div>
              <h1 className="mt-2 text-2xl font-bold text-white flex items-center gap-2">
                {run.target_url}
              </h1>
              <p className="mt-1 text-xs text-slate-400">
                Role: <strong className="text-slate-200">{run.user_role}</strong> | Browser:{" "}
                <strong className="text-slate-200">{run.browser}</strong> | Profile:{" "}
                <strong className="text-slate-200">{run.device_profile}</strong> | Started:{" "}
                <strong className="text-slate-200">{new Date(run.created_at).toLocaleString()}</strong>
              </p>
            </div>

            {/* Score Ring */}
            <div className="flex items-center gap-5">
              <div className={`flex h-24 w-24 flex-col items-center justify-center rounded-full border-4 ${scoreBorder} bg-slate-950/60`}>
                <span className={`text-3xl font-extrabold ${scoreColor}`}>{score}</span>
                <span className="text-[11px] text-slate-500 font-medium">/ 100</span>
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Overall Health</div>
                <div className={`text-base font-bold ${scoreColor}`}>
                  {score >= 80 ? "Production Ready" : score >= 60 ? "Requires Attention" : "Severe Defects"}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">8 Weighted Operational Pillars</div>
              </div>
            </div>
          </div>

          {/* Score Pillar Bars */}
          <div className="mt-6 pt-5 border-t border-slate-800/80 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8 text-center text-xs">
            <div className="rounded-lg bg-slate-950/40 p-2 border border-slate-800/60">
              <div className="text-slate-400 text-[11px]">Availability (25%)</div>
              <div className="mt-1 font-bold text-white">{breakdown.availabilityNavigation ?? 100}%</div>
            </div>
            <div className="rounded-lg bg-slate-950/40 p-2 border border-slate-800/60">
              <div className="text-slate-400 text-[11px]">Functional (20%)</div>
              <div className="mt-1 font-bold text-white">{breakdown.functionalUi ?? 100}%</div>
            </div>
            <div className="rounded-lg bg-slate-950/40 p-2 border border-slate-800/60">
              <div className="text-slate-400 text-[11px]">API Reliability (20%)</div>
              <div className="mt-1 font-bold text-white">{breakdown.apiReliability ?? 100}%</div>
            </div>
            <div className="rounded-lg bg-slate-950/40 p-2 border border-slate-800/60">
              <div className="text-slate-400 text-[11px]">Console (10%)</div>
              <div className="mt-1 font-bold text-white">{breakdown.consoleStability ?? 100}%</div>
            </div>
            <div className="rounded-lg bg-slate-950/40 p-2 border border-slate-800/60">
              <div className="text-slate-400 text-[11px]">Performance (10%)</div>
              <div className="mt-1 font-bold text-white">{breakdown.performance ?? 100}%</div>
            </div>
            <div className="rounded-lg bg-slate-950/40 p-2 border border-slate-800/60">
              <div className="text-slate-400 text-[11px]">Accessibility (5%)</div>
              <div className="mt-1 font-bold text-white">{breakdown.accessibility ?? 100}%</div>
            </div>
            <div className="rounded-lg bg-slate-950/40 p-2 border border-slate-800/60">
              <div className="text-slate-400 text-[11px]">Responsive (5%)</div>
              <div className="mt-1 font-bold text-white">{breakdown.responsiveUi ?? 100}%</div>
            </div>
            <div className="rounded-lg bg-slate-950/40 p-2 border border-slate-800/60">
              <div className="text-slate-400 text-[11px]">Coverage (5%)</div>
              <div className="mt-1 font-bold text-white">{breakdown.coverage ?? 100}%</div>
            </div>
          </div>
        </div>

        {/* Metric KPI Cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3.5">
            <div className="text-xs text-slate-400">Pages Tested</div>
            <div className="mt-1 text-xl font-bold text-white">
              {stats.pagesTested ?? pages.length}{" "}
              <span className="text-xs font-normal text-slate-500">/ {stats.pagesDiscovered ?? pages.length}</span>
            </div>
            <div className="text-[11px] text-blue-400 mt-1">{stats.pageCoveragePct ?? 100}% coverage</div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3.5">
            <div className="text-xs text-slate-400">Interactive Tested</div>
            <div className="mt-1 text-xl font-bold text-white">{stats.interactiveTested ?? 0}</div>
            <div className="text-[11px] text-slate-500 mt-1">of {stats.interactiveDiscovered ?? 0} discovered</div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3.5">
            <div className="text-xs text-slate-400">Critical Issues</div>
            <div className="mt-1 text-xl font-bold text-red-400">{stats.criticalIssues ?? 0}</div>
            <div className="text-[11px] text-slate-500 mt-1">Blockers / Crashes</div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3.5">
            <div className="text-xs text-slate-400">Major Defects</div>
            <div className="mt-1 text-xl font-bold text-amber-400">{stats.majorIssues ?? 0}</div>
            <div className="text-[11px] text-slate-500 mt-1">API / Broken Flows</div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3.5">
            <div className="text-xs text-slate-400">Console Errors</div>
            <div className="mt-1 text-xl font-bold text-white">{stats.consoleErrors ?? consoleEvents.length}</div>
            <div className="text-[11px] text-slate-500 mt-1">Uncaught exceptions</div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3.5">
            <div className="text-xs text-slate-400">API Failures</div>
            <div className="mt-1 text-xl font-bold text-white">{stats.apiFailures ?? networkEvents.length}</div>
            <div className="text-[11px] text-slate-500 mt-1">4xx & 5xx responses</div>
          </div>
        </div>

        {/* Interactive Tabs Header */}
        <div className="flex border-b border-slate-800 text-xs font-semibold">
          {[
            { id: "issues", label: `Issues & Findings (${issues.length})`, icon: Bug },
            { id: "graph", label: `User Flow Map (${pages.length} nodes)`, icon: Network },
            { id: "pages", label: `Pages Tested (${pages.length})`, icon: Layers },
            { id: "console", label: `Console (${consoleEvents.length})`, icon: Terminal },
            { id: "network", label: `Network / API (${networkEvents.length})`, icon: Activity },
            { id: "artifacts", label: `Artifacts (${artifacts.length})`, icon: Download },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 border-b-2 px-4 py-2.5 transition ${
                  isActive
                    ? "border-blue-500 text-blue-400 bg-slate-900/40"
                    : "border-transparent text-slate-400 hover:border-slate-700 hover:text-slate-200"
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* TAB: ISSUES & FINDINGS */}
        {activeTab === "issues" && (
          <div className="space-y-4">
            {/* Filter Pills */}
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-400">Filter by Severity:</span>
              {["ALL", "CRITICAL", "MAJOR", "MINOR"].map((sev) => (
                <button
                  key={sev}
                  onClick={() => setSeverityFilter(sev)}
                  className={`rounded-md px-2.5 py-1 font-medium transition ${
                    severityFilter === sev
                      ? "bg-slate-700 text-white"
                      : "bg-slate-900 text-slate-400 hover:bg-slate-800"
                  }`}
                >
                  {sev}
                </button>
              ))}
            </div>

            {filteredIssues.length === 0 ? (
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-8 text-center text-slate-400">
                <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-400 mb-2" />
                No {severityFilter !== "ALL" ? severityFilter.toLowerCase() : ""} issues identified in this audit run!
              </div>
            ) : (
              <div className="space-y-3">
                {filteredIssues.map((issue: any) => {
                  const isCrit = issue.severity === "CRITICAL";
                  const isMaj = issue.severity === "MAJOR";
                  return (
                    <div
                      key={issue.id}
                      className={`rounded-xl border p-4 transition ${
                        isCrit
                          ? "border-red-500/30 bg-red-950/20"
                          : isMaj
                          ? "border-amber-500/30 bg-amber-950/20"
                          : "border-slate-800 bg-slate-900/60"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <span
                              className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                                isCrit
                                  ? "bg-red-950 text-red-400 border border-red-800"
                                  : isMaj
                                  ? "bg-amber-950 text-amber-400 border border-amber-800"
                                  : "bg-blue-950 text-blue-400 border border-blue-800"
                              }`}
                            >
                              {issue.severity}
                            </span>
                            <span className="font-mono text-xs text-slate-400">{issue.id}</span>
                            <span className="text-xs text-slate-400">• {issue.category}</span>
                            {issue.occurrences > 1 && (
                              <span className="rounded-full bg-slate-800 px-2 py-0.2 text-[10px] text-slate-300">
                                {issue.occurrences} occurrences
                              </span>
                            )}
                          </div>
                          <h3 className="mt-1.5 text-base font-semibold text-white">{issue.title}</h3>
                          <p className="mt-1 text-xs text-slate-400">
                            Page: <span className="font-mono text-blue-400">{issue.page_url}</span>
                          </p>
                        </div>
                      </div>

                      {/* Details Box */}
                      <div className="mt-3 grid grid-cols-1 gap-2 rounded-lg bg-slate-950/70 p-3 text-xs sm:grid-cols-2 border border-slate-800/80">
                        <div>
                          <span className="text-slate-500 block">Expected:</span>
                          <span className="text-slate-300">{issue.expected || "Normal functional behavior"}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block">Actual:</span>
                          <span className="text-red-300">{issue.actual || "Defect detected"}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB: USER FLOW GRAPH */}
        {activeTab === "graph" && (
          <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/60 p-5">
            <div>
              <h3 className="text-base font-semibold text-white">Discovered User Flow Topology</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Dynamic visual graph of interactive paths, navigation transitions, and modal dialogs discovered by the crawler.
              </p>
            </div>

            {/* Tree Flow Representation */}
            <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-6 font-mono text-xs overflow-x-auto">
              <div className="flex items-center gap-2 text-blue-400 font-bold mb-4">
                <span className="h-3 w-3 rounded-full bg-blue-500" />
                Root: {run.starting_path || "/"}
              </div>

              <div className="pl-4 border-l-2 border-slate-800 space-y-4">
                {pages.map((p: any) => (
                  <div key={p.id} className="relative pl-4">
                    <span className="absolute -left-[18px] top-2.5 h-0.5 w-3 bg-slate-700" />
                    <div className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-900/90 p-2.5 hover:border-slate-700 transition">
                      <span
                        className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                          p.status === "FAILED" ? "bg-red-400" : "bg-emerald-400"
                        }`}
                      />
                      <div>
                        <div className="font-bold text-white text-sm">{p.title || "Untitled Page"}</div>
                        <div className="text-slate-400 text-xs">{p.path}</div>
                      </div>
                      <div className="ml-auto flex items-center gap-3 text-xs">
                        <span className="text-slate-500">{p.load_time_ms || p.loadTimeMs}ms</span>
                        <span className="rounded bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300">
                          {p.tested_interactive_count ?? p.testedInteractiveCount ?? 0} tested controls
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB: PAGES TESTED */}
        {activeTab === "pages" && (
          <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/80 text-slate-400 uppercase text-[11px] border-b border-slate-800">
                <tr>
                  <th className="p-3.5">Page Title</th>
                  <th className="p-3.5">Path</th>
                  <th className="p-3.5">Load Timing</th>
                  <th className="p-3.5">Rating</th>
                  <th className="p-3.5">Controls Tested</th>
                  <th className="p-3.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {pages.map((p: any) => {
                  const loadMs = p.load_time_ms || p.loadTimeMs || 0;
                  const rating = loadMs > 4000 ? "Slow" : loadMs > 2000 ? "Warning" : "Good";
                  const ratingColor =
                    rating === "Good" ? "text-emerald-400" : rating === "Warning" ? "text-amber-400" : "text-red-400";

                  return (
                    <tr key={p.id} className="hover:bg-slate-800/30">
                      <td className="p-3.5 font-bold text-white">{p.title || "Untitled"}</td>
                      <td className="p-3.5 font-mono text-blue-400">{p.path}</td>
                      <td className="p-3.5">{loadMs} ms</td>
                      <td className="p-3.5">
                        <span className={`font-semibold ${ratingColor}`}>{rating}</span>
                      </td>
                      <td className="p-3.5">
                        {p.tested_interactive_count ?? p.testedInteractiveCount ?? 0} /{" "}
                        {p.interactive_count ?? p.interactiveCount ?? 0}
                      </td>
                      <td className="p-3.5">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            p.status === "FAILED"
                              ? "bg-red-950 text-red-400 border border-red-800"
                              : "bg-emerald-950 text-emerald-400 border border-emerald-800"
                          }`}
                        >
                          {p.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* TAB: CONSOLE EVENTS */}
        {activeTab === "console" && (
          <div className="space-y-3">
            {consoleEvents.length === 0 ? (
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-8 text-center text-slate-400">
                <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-400 mb-2" />
                Zero console errors captured across all visited pages.
              </div>
            ) : (
              consoleEvents.map((ev: any) => (
                <div key={ev.id} className="rounded-xl border border-red-950/80 bg-slate-900/80 p-4 font-mono text-xs">
                  <div className="flex items-center justify-between text-red-400 mb-1">
                    <span className="font-bold uppercase tracking-wider">{ev.severity}</span>
                    <span className="text-slate-500 text-[11px]">{ev.occurrences}x</span>
                  </div>
                  <div className="text-white font-medium">{ev.message}</div>
                  <div className="text-slate-400 text-[11px] mt-1">Page: {ev.page_url || ev.pageUrl}</div>
                  {ev.stack && (
                    <pre className="mt-2 rounded bg-black/60 p-2 text-slate-400 text-[10px] overflow-x-auto">
                      {ev.stack}
                    </pre>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* TAB: NETWORK / API */}
        {activeTab === "network" && (
          <div className="space-y-3">
            {networkEvents.length === 0 ? (
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-8 text-center text-slate-400">
                <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-400 mb-2" />
                All background network and API requests completed successfully without 4xx/5xx failures.
              </div>
            ) : (
              networkEvents.map((net: any) => (
                <div key={net.id} className="rounded-xl border border-amber-950/80 bg-slate-900/80 p-4 text-xs font-mono">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-red-950 px-2 py-0.5 text-red-400 font-bold">
                        {net.status ? `HTTP ${net.status}` : "FAILED"}
                      </span>
                      <span className="font-bold text-white">{net.method}</span>
                      <span className="text-blue-300 max-w-[400px] truncate">{net.url}</span>
                    </div>
                    <span className="text-slate-500 text-[11px]">{net.duration_ms || net.durationMs || 0}ms</span>
                  </div>
                  <div className="text-slate-400 text-[11px] mt-2">
                    Page: {net.page_url || net.pageUrl} | Reason: {net.failure_reason || net.failureReason}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* TAB: ARTIFACTS & DOWNLOADS */}
        {activeTab === "artifacts" && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
              <Video className="h-6 w-6 text-blue-400 mb-2" />
              <h4 className="text-sm font-bold text-white">Full Session Video</h4>
              <p className="text-xs text-slate-400 mt-1">Complete Playwright browser session recording (.webm).</p>
              <a
                href={`/api/admin/qa/runs/${runId}/artifacts/video/full-session.webm`}
                download
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500"
              >
                <Download className="h-3.5 w-3.5" />
                Download Video
              </a>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
              <Layers className="h-6 w-6 text-purple-400 mb-2" />
              <h4 className="text-sm font-bold text-white">Playwright Trace Archive</h4>
              <p className="text-xs text-slate-400 mt-1">DOM snapshots, network timelines, and actions in trace.zip.</p>
              <a
                href={`/api/admin/qa/runs/${runId}/artifacts/trace.zip`}
                download
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-purple-500"
              >
                <Download className="h-3.5 w-3.5" />
                Download Trace.zip
              </a>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
              <FileCode className="h-6 w-6 text-emerald-400 mb-2" />
              <h4 className="text-sm font-bold text-white">Standalone HTML Report</h4>
              <p className="text-xs text-slate-400 mt-1">Complete offline executive summary and issue tables.</p>
              <a
                href={`/api/admin/qa/runs/${runId}/artifacts/report.html`}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Open HTML Report
              </a>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
