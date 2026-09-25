"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  ShieldAlert,
  Building2,
  Camera,
  Server,
  Database,
  Wifi,
  AlertTriangle,
  Siren,
  ArrowUpRight,
  RefreshCw,
  Clock,
  CheckCircle2,
  XCircle,
  Wrench,
  HelpCircle,
  FileCheck2,
  Search,
  Activity,
  ChevronRight,
  Radio,
  Flame,
  ShieldCheck,
  TrendingUp,
  TrendingDown,
  Layers,
  FileSearch,
  Play,
  Cpu,
  Thermometer,
  HardDrive,
  PlusCircle,
  Sparkles,
  X,
} from "lucide-react";
import { StatusBadge } from "../ui/status-badge";
import { FleetFilterBar } from "../ui/fleet-filter-bar";
import { ErrorBoundary } from "../ui/error-boundary";
import { useDialogFocus } from "@/hooks/use-dialog-focus";
import { getTelemetryFreshness } from "@/lib/telemetry-freshness";

export function CommandCenterView() {
  const [summary, setSummary] = useState<any | null>(null);
  const [branches, setBranches] = useState<any[]>([]);
  const [hasBranchData, setHasBranchData] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("ALL");
  const [selectedRegion, setSelectedRegion] = useState("ALL");
  const [selectedBranchWorkspace, setSelectedBranchWorkspace] = useState<any | null>(null);
  const pendingLoad = useRef<AbortController | null>(null);
  const branchDialogRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  useDialogFocus(branchDialogRef, selectedBranchWorkspace !== null);

  useEffect(() => {
    if (!selectedBranchWorkspace) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedBranchWorkspace(null);
    };
    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, [selectedBranchWorkspace]);

  const handleQuickAction = (action: string, branchId: string) => {
    if (action === "DISPATCH_TECH") {
      router.push(`/maintenance/workorders?branchId=${encodeURIComponent(branchId)}&source=command-center`);
    }
  };

  const navigateTo = (href: string) => (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    try {
      router.push(href);
    } catch {
      window.location.assign(href);
      return;
    }
    setTimeout(() => {
      const expectedPath = href.split("?", 1)[0];
      if (typeof window !== "undefined" && window.location.pathname !== expectedPath) {
        window.location.assign(href);
      }
    }, 120);
  };

  const loadData = async () => {
    if (pendingLoad.current) return;
    const controller = new AbortController();
    pendingLoad.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    setLoading(true);
    setLoadError(null);
    try {
      const [sumRes, branchRes] = await Promise.all([
        fetch("/api/control/v1/operations/command-center", { credentials: "include", signal: controller.signal }).catch(() => null),
        fetch("/api/control/v1/operations/branches", { credentials: "include", signal: controller.signal }).catch(() => null),
      ]);
      if (controller.signal.aborted) return;
      const sumData = sumRes ? await sumRes.json().catch(() => ({})) : {};
      const branchData = branchRes ? await branchRes.json().catch(() => ({})) : {};
      if (controller.signal.aborted) return;
      const unavailable: string[] = [];

      if (sumRes?.ok && sumData?.success && sumData?.data) {
        setSummary(sumData.data);
      } else {
        unavailable.push("Command Center summary");
      }

      if (branchRes?.ok && branchData?.success && Array.isArray(branchData?.data)) {
        setBranches(branchData.data);
        setHasBranchData(true);
      } else {
        unavailable.push("branch telemetry");
      }

      if (unavailable.length) setLoadError(`${unavailable.join(" and ")} unavailable`);
    } catch (err) {
      if (controller.signal.aborted) return;
      console.error("Failed to load command center data:", err);
      setLoadError(err instanceof Error ? err.message : "Unable to load live fleet telemetry");
    } finally {
      window.clearTimeout(timeout);
      if (pendingLoad.current === controller) pendingLoad.current = null;
      if (pendingLoad.current === null) setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 15000); // 15s auto-refresh
    return () => {
      clearInterval(interval);
      pendingLoad.current?.abort();
      pendingLoad.current = null;
    };
  }, []);

  const hasSummaryData = summary !== null;
  const hasAnyConfirmedData = hasSummaryData || hasBranchData;
  const hasBranchCountData = hasBranchData || summary?.branches?.total != null;
  const hasHealthyBranchData = hasBranchData || summary?.branches?.healthy != null;
  const hasCameraCountData = hasBranchData || summary?.cameras?.total != null;
  const hasRiskData = hasBranchData || summary?.atRiskBranchesCount != null;

  const cameraTotals = useMemo(() => {
    if (!hasBranchData) {
      const total = Number(summary?.cameras?.total ?? 0);
      const working = Number(summary?.cameras?.working ?? summary?.cameras?.healthy ?? 0);
      const offline = Number(summary?.cameras?.offline ?? 0);
      const degraded = Number(summary?.cameras?.degraded ?? 0);
      const unknown = Number(summary?.cameras?.unknown ?? Math.max(0, total - working - offline - degraded));
      return {
        total,
        working: Math.min(Math.max(working, 0), total),
        notWorking: Math.max(0, total - working),
        offline,
        degraded,
        unknown,
      };
    }

    return branches.reduce(
      (totals, branch) => {
        const total = Math.max(0, Number(branch.cameras?.total ?? 0));
        const working = Math.min(Math.max(0, Number(branch.cameras?.working ?? branch.cameras?.healthy ?? 0)), total);
        const offline = Math.min(Math.max(0, Number(branch.cameras?.offline ?? 0)), total);
        const degraded = Math.min(Math.max(0, Number(branch.cameras?.degraded ?? 0)), total);
        const unknown = Math.min(
          Math.max(0, Number(branch.cameras?.unknown ?? Math.max(0, total - working - offline - degraded))),
          total,
        );
        totals.total += total;
        totals.working += working;
        totals.notWorking += Math.max(0, total - working);
        totals.offline += offline;
        totals.degraded += degraded;
        totals.unknown += unknown;
        return totals;
      },
      { total: 0, working: 0, notWorking: 0, offline: 0, degraded: 0, unknown: 0 },
    );
  }, [branches, hasBranchData, summary]);

  const totalBranchesCount = hasBranchData ? branches.length : Number(summary?.branches?.total ?? 0);
  const healthyBranchesCount = hasBranchData
    ? branches.filter((branch) => branch.operationalState === "HEALTHY").length
    : Number(summary?.branches?.healthy ?? 0);
  const atRiskBranchesCount = hasBranchData
    ? branches.filter((branch) => ["HIGH", "MEDIUM"].includes(branch.risk?.level)).length
    : Number(summary?.atRiskBranchesCount ?? 0);
  const totalCamerasCount = cameraTotals.total;
  const workingCamerasCount = cameraTotals.working;
  const cameraTelemetryUnavailable = totalCamerasCount > 0 && cameraTotals.unknown >= totalCamerasCount;
  const knownCameraFailures = hasBranchData
    ? branches.reduce((count, branch) => count + Math.max(0, Number(
        branch.cameras?.notWorking ?? (Number(branch.cameras?.offline ?? 0) + Number(branch.cameras?.degraded ?? 0)),
      )), 0)
    : Math.max(0, Number(summary?.cameras?.notWorking ?? (cameraTotals.offline + cameraTotals.degraded)));
  const freshness = getTelemetryFreshness(summary?.lastTelemetryTimestamp);

  const regionOptions = useMemo(() => {
    const regions = Array.from(new Set(branches.map((branch) => branch.region).filter(Boolean)))
      .filter((region) => region && region !== "Unassigned")
      .sort((left, right) => left.localeCompare(right))
      .map((region) => ({ label: region, value: region }));

    return [{ label: "All Regions", value: "ALL" }, ...regions];
  }, [branches]);

  const filteredBranches = useMemo(() => {
    return branches.filter((b) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!b.name?.toLowerCase().includes(q) && !b.branchCode?.toLowerCase().includes(q)) return false;
      }
      if (selectedStatus !== "ALL" && b.operationalState !== selectedStatus) return false;
      if (selectedRegion !== "ALL" && b.region !== selectedRegion) return false;
      return true;
    });
  }, [branches, searchQuery, selectedStatus, selectedRegion]);

  const exportHealthCsv = () => {
    if (branches.length === 0) return;
    const headers = [
      "Branch Code",
      "Branch Name",
      "Region",
      "Health Score",
      "Operational Status",
      "Cameras Working",
      "Cameras Not Working",
      "Cameras Total",
      "Recording Status",
      "Network Latency",
      "Storage Health",
      "Retention Policy",
      "Risk Score",
      "Last Telemetry",
    ];

    const rows = branches.map((b) => [
      `"${b.branchCode || ""}"`,
      `"${b.name || ""}"`,
      `"${b.region || ""}"`,
      b.healthScore ?? 0,
      b.operationalState || "UNKNOWN",
      b.cameras?.working ?? b.cameras?.healthy ?? 0,
      b.cameras?.notWorking ?? Math.max(0, (b.cameras?.total ?? 0) - (b.cameras?.healthy ?? 0)),
      b.cameras?.total ?? 0,
      `${b.recording?.recordingChannels ?? 0}/${b.recording?.totalChannels ?? 0}`,
      `${b.internet?.latencyMs ?? 0}ms`,
      b.storage?.state ?? "UNKNOWN",
      b.retention?.displayTag ?? (b.retention?.observedDays != null ? `${b.retention.observedDays}d` : "UNKNOWN"),
      `${b.risk?.level ?? "UNKNOWN"} (${b.risk?.probabilityPct ?? 0}%)`,
      b.telemetry?.secondsAgo != null ? `${b.telemetry.secondsAgo}s ago` : "NO TELEMETRY",
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `KryptonVision_Executive_Fleet_Health_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const predicted = summary?.predictedFailuresSummary?.nextLikelyFailure;
  const workflowContext = selectedBranchWorkspace?.branchId
    ? `?branchId=${encodeURIComponent(selectedBranchWorkspace.branchId)}&source=command-center`
    : "?source=command-center";
  const liveIncidentCount = Array.isArray(summary?.liveIncidents) ? summary.liveIncidents.length : 0;
  const focusItems = [
    ...(liveIncidentCount > 0 ? [{
      title: "Verify active incidents",
      detail: `${liveIncidentCount} live ${liveIncidentCount === 1 ? "incident needs" : "incidents need"} an operator decision.`,
      action: "Open incident response",
      href: "/incidents",
      icon: Siren,
      tone: "critical",
    }] : []),
    ...(hasCameraCountData && !cameraTelemetryUnavailable && knownCameraFailures > 0 ? [{
      title: "Restore camera coverage",
      detail: `${knownCameraFailures} of ${totalCamerasCount} cameras are not working.`,
      action: "Inspect affected cameras",
      href: "/operations/cameras",
      icon: Camera,
      tone: "warning",
    }] : []),
    ...(hasRiskData && atRiskBranchesCount > 0 ? [{
      title: "Review branches at risk",
      detail: `${atRiskBranchesCount} ${atRiskBranchesCount === 1 ? "branch has" : "branches have"} an elevated risk level.`,
      action: "Open branch operations",
      href: "/operations/branches",
      icon: Building2,
      tone: "warning",
    }] : []),
    ...(hasSummaryData && Number(summary?.predictedFailuresSummary?.total ?? 0) > 0 ? [{
      title: "Prevent a likely failure",
      detail: `${summary.predictedFailuresSummary.total} predicted ${summary.predictedFailuresSummary.total === 1 ? "failure" : "failures"} in the next 72 hours.`,
      action: "Review work orders",
      href: "/maintenance/workorders",
      icon: Wrench,
      tone: "watch",
    }] : []),
  ];
  const readyItems = hasAnyConfirmedData && totalBranchesCount > 0 ? [
    { title: "Watch live coverage", detail: "Open the live wall to verify the branches on shift.", action: "Open live wall", href: "/control-room", icon: Play, tone: "ready" },
    { title: "Investigate an event", detail: "Find the video and build the incident timeline.", action: "Search video", href: "/video-search", icon: Search, tone: "ready" },
    { title: "Preserve the record", detail: "Review evidence and its custody history.", action: "Open evidence", href: "/evidence", icon: FileCheck2, tone: "ready" },
  ] : [{
    title: hasAnyConfirmedData ? "Start branch coverage" : "Check branch operations",
    detail: hasAnyConfirmedData ? "Add a branch to begin live monitoring." : "Priorities will appear when branch telemetry is available.",
    action: hasAnyConfirmedData ? "Onboard a branch" : "Open branch operations",
    href: hasAnyConfirmedData ? "/admin/branch-onboarding" : "/operations/branches",
    icon: hasAnyConfirmedData ? Building2 : RefreshCw,
    tone: "ready",
  }];
  const visibleFocusItems = focusItems.length > 0 ? focusItems : readyItems;
  const attentionBranches = branches.map((branch) => {
    const cameras = branch.cameras;
    const notWorking = cameras?.notWorking != null
      ? Math.max(0, Number(cameras.notWorking))
      : Math.max(0, Number(cameras?.offline ?? 0) + Number(cameras?.degraded ?? 0));
    const risk = branch.risk?.level;
    const recordingIssue = branch.recording?.status && !["HEALTHY", "UNKNOWN"].includes(branch.recording.status);
    const signals = [
      ...(risk === "HIGH" ? ["High risk"] : risk === "MEDIUM" ? ["Elevated risk"] : []),
      ...(notWorking > 0 ? [`${notWorking} ${notWorking === 1 ? "camera" : "cameras"} down`] : []),
      ...(recordingIssue ? ["Recording needs review"] : []),
    ];
    return { branch, signals, priority: (risk === "HIGH" ? 4 : risk === "MEDIUM" ? 2 : 0) + (notWorking > 0 ? 3 : 0) + (recordingIssue ? 1 : 0) };
  }).filter((item) => item.signals.length > 0)
    .sort((left, right) => right.priority - left.priority || String(left.branch.name ?? "").localeCompare(String(right.branch.name ?? "")))
    .slice(0, 3);

  return (
    <ErrorBoundary fallback={<div className="p-6 rounded-xl bg-slate-900 border border-slate-800 text-rose-300 text-sm">Failed to render Surveillance Command Center. Please refresh or check connection.</div>}>
      <div className="command-center-page space-y-4 pb-12 text-slate-100 font-sans">
      {/* Top Banner & Header */}
      <div className="command-center-hero flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-5 bg-gradient-to-r from-slate-900 via-slate-900 to-slate-950 border border-slate-800 rounded-xl shadow-lg">
        <div>
          <p className="command-center-kicker"><Sparkles size={13} /> Security operations</p>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-extrabold tracking-tight text-white flex items-center gap-2">
              <ShieldCheck className="w-6 h-6 text-blue-400" />
              Branch protection overview
            </h1>
            <span className={`telemetry-truth-badge ${freshness.state}`} aria-label={`${freshness.label}. ${freshness.detail}`}>
              <span className="telemetry-truth-dot" />
              {freshness.label}
            </span>
            {totalBranchesCount > 0 && (
              <span className="text-xs text-slate-400 border-l border-slate-800 pl-3 hidden sm:inline">
                Agent heartbeat: <strong className="text-slate-200">{summary?.agentHeartbeatSecondsAgo != null ? `${summary.agentHeartbeatSecondsAgo}s ago` : "Unknown"}</strong>
              </span>
            )}
          </div>
          <p className="telemetry-truth-detail">Monitor branch coverage, recording health, and risk from one place. {freshness.detail}.</p>
          <p className="text-xs text-slate-400 mt-1">
            {totalBranchesCount} {totalBranchesCount === 1 ? "branch" : "branches"} · {totalCamerasCount.toLocaleString()} {totalCamerasCount === 1 ? "camera" : "cameras"} · Live telemetry
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/admin/branch-onboarding"
            onClick={navigateTo("/admin/branch-onboarding")}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-md shadow-blue-900/30 transition-all cursor-pointer"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>Onboard Branch</span>
          </Link>

          <Link
            href="/control-room"
            onClick={navigateTo("/control-room")}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-all cursor-pointer"
          >
            <Play className="w-3.5 h-3.5" />
            <span>Live Wall</span>
          </Link>

          <button
            onClick={exportHealthCsv}
            disabled={branches.length === 0}
            className="flex items-center gap-1 px-3 py-2 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 disabled:opacity-50 text-slate-300 border border-slate-700 text-xs font-medium transition-colors"
            title="Download CSV Device Health Report"
          >
            <span>Export health</span>
          </button>

          <button
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-slate-300 text-xs font-medium transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>{loading ? "Refreshing..." : "Refresh"}</span>
          </button>
        </div>
      </div>

      <section className="command-center-focus" aria-labelledby="command-center-focus-title">
        <div className="command-center-focus-heading">
          <div>
            <p className="command-center-focus-eyebrow"><span /> OPERATIONS PULSE</p>
            <h2 id="command-center-focus-title">Focus now</h2>
            <p>{focusItems.length > 0 ? "Operational signals are sorted into the next actions for your team." : "Choose the next step in your security workflow."}</p>
          </div>
          <span className="command-center-focus-count">{focusItems.length > 0 ? `${focusItems.length} ${focusItems.length === 1 ? "priority" : "priorities"}` : hasAnyConfirmedData ? "Ready for action" : "Awaiting data"}</span>
        </div>
        <div className="command-center-focus-grid">
          {visibleFocusItems.map(({ title, detail, action, href, icon: Icon, tone }, index) => (
            <Link href={href} onClick={navigateTo(href)} className={`command-center-focus-card is-${tone}`} key={title}>
              <div className="command-center-focus-card-top">
                <span className="command-center-focus-icon"><Icon size={20} /></span>
                <span className="command-center-focus-order">{String(index + 1).padStart(2, "0")}</span>
              </div>
              <div><h3>{title}</h3><p>{detail}</p></div>
              <span className="command-center-focus-action">{action} <ArrowUpRight size={16} /></span>
            </Link>
          ))}
        </div>
        {attentionBranches.length > 0 && <div className="command-center-attention">
          <div className="command-center-attention-heading">
            <strong>Branches to review</strong>
            <span>Open a branch without leaving this screen</span>
          </div>
          <div className="command-center-attention-list">
            {attentionBranches.map(({ branch, signals }) => <button
              type="button"
              key={branch.branchId}
              onClick={() => setSelectedBranchWorkspace(branch)}
              className="command-center-attention-item"
              aria-label={`Review ${branch.name}: ${signals.join(", ")}`}
            >
              <span className="command-center-attention-branch"><strong>{branch.name}</strong><small>{branch.branchCode} · {branch.region}</small></span>
              <span className="command-center-attention-signals">{signals.map((signal) => <span key={signal}>{signal}</span>)}</span>
              <ChevronRight size={18} aria-hidden="true" />
            </button>)}
          </div>
        </div>}
      </section>

      <nav className="command-center-workflow" aria-label="Security operations workflow">
        <div className="command-center-workflow-intro">
          <span>WORKFLOW</span>
          <strong>From coverage to evidence</strong>
        </div>
        <div className="command-center-workflow-steps">
          <Link href="/control-room" onClick={navigateTo("/control-room")} className="active">
            <span className="workflow-step-index">01</span>
            <span><strong>Protect 24×7</strong><small>See branch coverage and risk</small></span>
            <Play className="workflow-step-icon" />
          </Link>
          <Link href={`/video-search${workflowContext}`} onClick={navigateTo(`/video-search${workflowContext}`)}>
            <span className="workflow-step-index">02</span>
            <span><strong>Investigate fast</strong><small>Find the supporting video</small></span>
            <Search className="workflow-step-icon" />
          </Link>
          <Link href={`/incidents${workflowContext}`} onClick={navigateTo(`/incidents${workflowContext}`)}>
            <span className="workflow-step-index">03</span>
            <span><strong>Resolve risk</strong><small>Assign, control, and close</small></span>
            <Siren className="workflow-step-icon" />
          </Link>
          <Link href={`/maintenance/workorders${workflowContext}`} onClick={navigateTo(`/maintenance/workorders${workflowContext}`)}>
            <span className="workflow-step-index">04</span>
            <span><strong>Protect coverage</strong><small>Prevent repeat failures</small></span>
            <Wrench className="workflow-step-icon" />
          </Link>
          <Link href={`/evidence${workflowContext}`} onClick={navigateTo(`/evidence${workflowContext}`)}>
            <span className="workflow-step-index">05</span>
            <span><strong>Preserve proof</strong><small>Keep an auditable custody trail</small></span>
            <FileCheck2 className="workflow-step-icon" />
          </Link>
        </div>
      </nav>

      {loadError && (
        <div className="p-3 rounded-xl border border-rose-800/60 bg-rose-950/30 text-sm text-rose-200" role="alert">
          Live fleet data could not be refreshed: {typeof loadError === "string" ? loadError : JSON.stringify(loadError)}. {summary || hasBranchData ? "Showing the last confirmed values." : "Retry when the connection is restored."}
        </div>
      )}

      {/* Row 1 & 2: Operational Intelligence Cards Grid */}
      <details className="command-center-diagnostics">
        <summary><span><Activity size={18} /> Fleet telemetry</span><span>View detailed health metrics <ChevronRight size={18} /></span></summary>
      <div className="command-center-metrics grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {/* 1. Fleet Health Score */}
        <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition-all space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-semibold tracking-wider uppercase">Fleet Health</span>
            <Activity className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-white">
            {totalBranchesCount === 0 ? "—" : (summary?.fleetHealth?.score ?? 100)}
          </div>
          <div className="flex items-center gap-1 text-[11px] text-slate-400 font-medium">
            <span>{totalBranchesCount === 0 ? "Awaiting Telemetry" : "Fleet Score"}</span>
          </div>
        </div>

        {/* 2. Recording Health */}
        <Link href="/recordings" aria-label="Open recording playback and device storage footage" className="block p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 transition-all space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-semibold tracking-wider uppercase">Recording</span>
            <Activity className="w-3.5 h-3.5 text-blue-400" />
          </div>
          <div className="text-2xl font-black text-white">
            {totalCamerasCount === 0 ? "—" : `${summary?.recording?.healthyPct ?? 0}%`}
          </div>
          <div className="text-[11px] text-slate-400 font-medium">
            {totalCamerasCount === 0 ? "0 Streams" : `${summary?.recording?.totalRecording ?? 0} Active Rec`}
          </div>
        </Link>

        {/* 3. At Risk Branches */}
        <div className="p-3.5 rounded-xl bg-amber-950/20 border border-amber-800/40 hover:border-amber-700/60 transition-all space-y-1">
          <div className="flex items-center justify-between text-amber-300">
            <span className="text-[11px] font-semibold tracking-wider uppercase">At Risk</span>
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-2xl font-black text-amber-200">
            {atRiskBranchesCount}
          </div>
          <div className="text-[11px] text-slate-400 font-medium">
            {atRiskBranchesCount ? `${atRiskBranchesCount} Warning` : "Zero Risk"}
          </div>
        </div>

        {/* 4. Predicted Failures */}
        <div className="p-3.5 rounded-xl bg-rose-950/25 border border-rose-800/50 hover:border-rose-700/70 transition-all space-y-1">
          <div className="flex items-center justify-between text-rose-300">
            <span className="text-[11px] font-bold tracking-wider uppercase flex items-center gap-1">
              <Flame className="w-3 h-3 text-rose-400" />
              Predicted
            </span>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-rose-900/60 text-rose-300 font-mono">&lt;72h</span>
          </div>
          <div className="text-2xl font-black text-rose-200">
            {summary?.predictedFailuresSummary?.total || 0}
          </div>
          <div className="text-[11px] text-slate-400 font-medium">
            {summary?.predictedFailuresSummary?.total === 0 ? "No Failures <72h" : `${summary?.predictedFailuresSummary?.highRiskCount || 0} High`}
          </div>
        </div>

        {/* 5. Branches */}
        <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition-all space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-semibold tracking-wider uppercase">Branches</span>
            <Building2 className="w-3.5 h-3.5 text-slate-400" />
          </div>
          <div className="text-2xl font-black text-white">
            {healthyBranchesCount} <span className="text-xs text-slate-500 font-normal">/ {totalBranchesCount}</span>
          </div>
          <div className="text-[11px] text-slate-400 font-medium">
            {totalBranchesCount === 0 ? "No Branches" : `${healthyBranchesCount} Healthy`}
          </div>
        </div>

        {/* 6. Cameras */}
        <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition-all space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-semibold tracking-wider uppercase">Cameras</span>
            <Camera className="w-3.5 h-3.5 text-slate-400" />
          </div>
          <div className="text-2xl font-black text-white">
            {cameraTelemetryUnavailable ? totalCamerasCount.toLocaleString() : workingCamerasCount.toLocaleString()}
            {!cameraTelemetryUnavailable && <span className="text-xs text-slate-500 font-normal">/ {totalCamerasCount}</span>}
          </div>
          <div className="text-[11px] text-slate-400 font-medium">
            {totalCamerasCount === 0
              ? "No Cameras"
              : cameraTelemetryUnavailable
                ? `${totalCamerasCount} Cameras - Telemetry unavailable`
                : `${workingCamerasCount} Working - ${cameraTotals.notWorking} Not working`}
          </div>
        </div>

        {/* 7. Storage Health */}
        <Link href="/operations/storage" aria-label="Open camera SD card and recorder HDD storage details" className="block p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 transition-all space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-semibold tracking-wider uppercase">Storage Health</span>
            <Database className="w-3.5 h-3.5 text-slate-400" />
          </div>
          <div className="text-2xl font-black text-white">
            {Number(summary?.storage?.totalDisks ?? 0) === 0 ? "—" : `${summary?.storage?.healthyPct ?? 0}%`}
          </div>
          <div className="text-[11px] text-slate-400 font-medium">
            {Number(summary?.storage?.totalDisks ?? 0) === 0 ? "No disk telemetry" : `${summary?.storage?.healthy ?? 0} Healthy`}
          </div>
        </Link>

        {/* 8. Retention Compliance */}
        <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition-all space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-semibold tracking-wider uppercase">Retention</span>
            <FileCheck2 className="w-3.5 h-3.5 text-cyan-400" />
          </div>
          <div className="text-2xl font-black text-white">
            {totalBranchesCount === 0 ? "—" : `${summary?.retention?.compliancePct ?? 0}%`}
          </div>
          <div className="text-[11px] text-slate-400 font-medium">
            {summary?.retention?.policyTag ?? "Policy unknown"} Policy
          </div>
        </div>
      </div>
      </details>

      {/* Signature Predicted Failures Card if Failures Predicted */}
      {predicted && (
        <div className="command-center-prediction p-5 rounded-2xl bg-gradient-to-r from-slate-900 via-rose-950/20 to-slate-900 border border-rose-900/50 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-rose-600/30 text-rose-300">
                <Flame className="w-5 h-5 text-rose-400 animate-pulse" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <span>⚠ Predicted Failures</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-rose-900/80 text-rose-200 border border-rose-700/50">
                    {summary?.predictedFailuresSummary?.total || 1} Branch at Risk
                  </span>
                </h2>
                <p className="text-xs text-slate-400">
                  AI predictive engine forecast: early warning before video interruption occurs
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-1 p-4 rounded-xl bg-slate-950/80 border border-rose-800/40 space-y-2.5">
              <div className="text-[11px] font-bold text-rose-400 tracking-wider uppercase flex items-center justify-between">
                <span>NEXT LIKELY FAILURE</span>
                <span className="font-mono text-xs">{predicted.expectedWindow}</span>
              </div>
              <div className="text-lg font-bold text-white">
                {predicted.branchName}
              </div>
              <div className="text-sm font-semibold text-rose-300">
                Recording failure probability: <span className="text-rose-400 text-base font-black">{predicted.failureProbability}%</span>
              </div>
              <p className="text-xs text-slate-300">
                Likely cause: <strong className="text-white">{predicted.likelyCause}</strong>
              </p>
            </div>

            <div className="lg:col-span-2 p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-3">
              <div className="font-bold text-indigo-400 text-xs flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                AI RCA ATTRIBUTION & RECOMMENDED ACTION
              </div>
              <div className="grid grid-cols-2 gap-2">
                {predicted.contributingFactors?.map((cf: any) => (
                  <div key={cf.factor} className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-xs">
                    <div className="text-slate-400 text-[11px] truncate">{cf.factor}</div>
                    <div className="text-base font-bold text-rose-300 mt-1">{cf.percentage}%</div>
                  </div>
                ))}
              </div>
              <div className="pt-2 border-t border-slate-800 text-xs flex items-center justify-between">
                <div>
                  <span className="text-slate-400">Recommendation: </span>
                  <strong className="text-emerald-400">{predicted.recommendedAction}</strong>
                </div>
                <button
                  onClick={() => handleQuickAction("DISPATCH_TECH", predicted.branchId)}
                  className="px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow"
                >
                  Open Work Order
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Dynamic AI Operations Briefing */}
      <div className="command-center-briefing p-4 rounded-xl bg-slate-900/90 border border-slate-800 shadow-md space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">AI Operations Briefing</h2>
          </div>
          <span className="text-xs text-slate-400 font-mono">
            {summary?.aiBriefing?.criticalItemsCount ?? 0} Active Triages
          </span>
        </div>

        <div className="p-3.5 rounded-lg bg-slate-950/80 border border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className={`text-sm font-bold ${summary?.aiBriefing?.criticalItemsCount > 0 ? "text-rose-300" : "text-emerald-300"} flex items-center gap-2`}>
              <span className={`w-2 h-2 rounded-full ${summary?.aiBriefing?.criticalItemsCount > 0 ? "bg-rose-400 animate-pulse" : "bg-emerald-400"}`} />
              {summary?.aiBriefing?.headline || "System standby — awaiting camera feeds"}
            </div>
            <div className="text-xs text-slate-300">
              {summary?.aiBriefing?.summaryText || "No active hardware anomalies detected."}
            </div>
            <div className="text-xs text-slate-400">
              Action: <strong className="text-emerald-400">{summary?.aiBriefing?.recommendedAction || "Ready for camera connection."}</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Live Incidents Strip */}
      <div className="command-center-live-strip p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center gap-3 overflow-x-auto text-xs">
        <span className="text-[11px] font-bold text-rose-400 uppercase tracking-wider shrink-0 flex items-center gap-1">
          <Radio className="w-3 h-3 animate-pulse" />
          LIVE INCIDENTS:
        </span>
        <div className="flex items-center gap-2.5">
          {(!summary?.liveIncidents || summary.liveIncidents.length === 0) ? (
            <span className="text-slate-500 italic">No active incidents pending. Fleet in normal state.</span>
          ) : (
            summary.liveIncidents.map((inc: any) => (
              <span
                key={inc.id}
                className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700/80 text-slate-200 flex items-center gap-1.5 shrink-0"
              >
                <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse" />
                <strong>{inc.branchCode}</strong>
                <span className="text-slate-400 truncate max-w-[200px]">{inc.headline}</span>
              </span>
            ))
          )}
        </div>
      </div>

      {/* Fleet Branch Operational Board */}
      <details className="command-center-fleet space-y-3">
        <summary className="command-center-fleet-summary">
          <span><Building2 size={19} /> Fleet Operational Board</span>
          <span>{hasBranchData ? `${branches.length} branches` : "Branch inventory"} <ChevronRight size={18} /></span>
        </summary>
        <div className="flex justify-end">
          <Link
            href="/operations/branches"
            className="text-xs text-blue-400 hover:text-blue-300 font-medium transition-colors"
          >
            View All Fleet Branches →
          </Link>
        </div>

        <FleetFilterBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          selectedStatus={selectedStatus}
          onStatusChange={setSelectedStatus}
          selectedRegion={selectedRegion}
          onRegionChange={setSelectedRegion}
          regionOptions={regionOptions}
          onRefresh={loadData}
        />

        <div className="rounded-xl border border-slate-800 bg-slate-900/70 overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                  <tr>
                    <th className="px-3.5 py-3">Branch</th>
                    <th className="px-3 py-3">Health</th>
                    <th className="px-3 py-3">Cameras</th>
                    <th className="px-3 py-3">Recording</th>
                    <th className="px-3 py-3">Network</th>
                    <th className="px-3 py-3">Storage</th>
                    <th className="px-3 py-3">Retention</th>
                    <th className="px-3 py-3">Risk</th>
                    <th className="px-3 py-3">Last Telemetry</th>
                    <th className="px-3.5 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-sans">
                  {filteredBranches.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-12 text-center text-slate-400">
                        <div className="max-w-md mx-auto space-y-3">
                          <Building2 className="w-8 h-8 text-slate-600 mx-auto" />
                          <div className="font-semibold text-slate-300">{loading ? "Loading branch telemetry…" : !hasBranchData ? "Branch telemetry unavailable" : branches.length > 0 ? "No branches match your filters" : "No branches enrolled yet"}</div>
                          <p className="text-xs text-slate-500">
                            {!hasBranchData ? "Refresh to try loading your accessible branches again." : branches.length > 0 ? "Clear the search and filters to see all accessible branches." : "Onboard a branch to start monitoring cameras and edge devices."}
                          </p>
                          {hasBranchData && branches.length === 0 && <Link
                            href="/admin/branch-onboarding"
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow transition-colors"
                          >
                            <PlusCircle className="w-3.5 h-3.5" />
                            <span>Onboard First Branch</span>
                          </Link>}
                          {hasBranchData && branches.length > 0 && <button type="button" className="text-sm font-semibold text-blue-400 underline" onClick={() => { setSearchQuery(""); setSelectedStatus("ALL"); setSelectedRegion("ALL"); }}>Clear filters</button>}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredBranches.map((b) => (
                      <tr
                        key={b.branchId}
                        className="hover:bg-slate-800/40 transition-colors cursor-pointer"
                        onClick={() => setSelectedBranchWorkspace(b)}
                      >
                        <td className="px-3.5 py-3">
                          <div className="font-bold text-slate-100 hover:text-blue-400 transition-colors">
                            {b.name}
                          </div>
                          <div className="text-slate-500 font-mono text-[11px]">{b.branchCode} • {b.region}</div>
                        </td>

                        <td className="px-3 py-3">
                          {b.cameras?.total === 0 ? (
                            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-800 text-slate-400 border border-slate-700">
                              ⚪ Not Provisioned
                            </span>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <StatusBadge status={b.operationalState} size="sm" />
                              <span className="font-mono text-xs text-slate-300 font-bold">{b.healthScore ?? 100}/100</span>
                            </div>
                          )}
                        </td>

                        <td className="px-3 py-3">
                          {b.cameras?.total === 0 ? (
                            <span className="text-slate-500">0 Cameras</span>
                          ) : (
                            <div>
                              <div className="font-semibold text-slate-200">
                                {b.cameras?.working ?? b.cameras?.healthy ?? 0}/{b.cameras?.total ?? 0} Working
                              </div>
                              {(b.cameras?.notWorking ?? ((b.cameras?.total ?? 0) - (b.cameras?.healthy ?? 0))) > 0 && (
                                <div className="text-rose-400 text-[11px]">
                                  {b.cameras?.notWorking ?? ((b.cameras?.total ?? 0) - (b.cameras?.healthy ?? 0))} Not working
                                </div>
                              )}
                            </div>
                          )}
                        </td>

                        <td className="px-3 py-3">
                          {b.cameras?.total === 0 ? (
                            <span className="text-slate-500">—</span>
                          ) : (
                            <div className={b.recording?.status === "HEALTHY" ? "text-emerald-400 font-bold" : "text-amber-400 font-bold"}>
                              {b.recording?.recordingChannels ?? Math.max(0, b.cameras.total - (b.cameras.notWorking ?? b.cameras.notRecording ?? 0))}/{b.recording?.totalChannels ?? b.cameras.total} ✓
                            </div>
                          )}
                        </td>

                        <td className="px-3 py-3">
                          <div className="flex items-center gap-1.5">
                            <Wifi className={`w-3.5 h-3.5 ${b.internet?.state === 'HEALTHY' ? 'text-emerald-400' : 'text-rose-400'}`} />
                            <span>{b.internet?.mode ?? 'UNKNOWN'} ({b.internet?.latencyMs != null ? `${b.internet.latencyMs}ms` : '—'})</span>
                          </div>
                        </td>

                        <td className="px-3 py-3">
                          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-950 text-emerald-300 border border-emerald-800">
                            {b.storage?.state ?? "UNKNOWN"}
                          </span>
                        </td>

                        <td className="px-3 py-3">
                          <div className={b.retention?.compliant ? "text-emerald-400 font-semibold" : "text-rose-400 font-semibold"}>
                            {b.retention?.displayTag ?? (b.retention?.observedDays != null ? `${b.retention.observedDays}d` : "UNKNOWN")}
                          </div>
                        </td>

                        <td className="px-3 py-3">
                          {b.risk?.level === "HIGH" ? (
                            <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-rose-950 text-rose-300 border border-rose-800 flex items-center gap-1 w-fit">
                              HIGH {b.risk.probabilityPct ?? 0}%
                            </span>
                          ) : b.risk?.level === "MEDIUM" ? (
                            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-950 text-amber-300 border border-amber-800 flex items-center gap-1 w-fit">
                              MEDIUM {b.risk.probabilityPct ?? 0}%
                            </span>
                          ) : b.risk?.level === "LOW" ? (
                            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-950/60 text-emerald-300 border border-emerald-800/60 flex items-center gap-1 w-fit">
                              LOW
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-800 text-slate-400 border border-slate-700 flex items-center gap-1 w-fit">
                              UNKNOWN
                            </span>
                          )}
                        </td>

                        <td className="px-3 py-3">
                          <span className="text-slate-400 font-mono text-[11px]">
                            {b.telemetry?.secondsAgo != null ? `${b.telemetry.secondsAgo}s ago` : "No telemetry"}
                          </span>
                        </td>

                        <td className="px-3.5 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => setSelectedBranchWorkspace(b)}
                              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors"
                            >
                              Investigate
                            </button>
                            <Link
                              href={`/operations/branches/${b.branchId}`}
                              className="px-2.5 py-1 rounded bg-blue-600/30 hover:bg-blue-600 text-blue-200 hover:text-white text-xs font-semibold transition-all"
                            >
                              Workspace →
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
      </details>

      {/* Deep Branch 360 Workspace Drawer */}
      {selectedBranchWorkspace && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex justify-end animate-fade-in">
          <div ref={branchDialogRef} role="dialog" aria-modal="true" aria-labelledby="branch-workspace-title" className="w-full max-w-2xl bg-slate-900 border-l border-slate-800 h-full overflow-y-auto p-6 space-y-6 shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-800 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-blue-400 bg-blue-950 px-2 py-0.5 rounded border border-blue-800">
                    {selectedBranchWorkspace.branchCode}
                  </span>
                  <StatusBadge status={selectedBranchWorkspace.operationalState} size="sm" />
                </div>
                <h2 id="branch-workspace-title" className="text-xl font-bold text-white mt-1">{selectedBranchWorkspace.name}</h2>
                <p className="text-xs text-slate-400">{selectedBranchWorkspace.region}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedBranchWorkspace(null)}
                aria-label="Close branch workspace"
                className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Subsystem Diagnostics</h3>
              <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 text-xs">
                Cameras: {selectedBranchWorkspace.cameras?.working ?? selectedBranchWorkspace.cameras?.healthy ?? 0}/{selectedBranchWorkspace.cameras?.total ?? 0} Working · {selectedBranchWorkspace.cameras?.notWorking ?? Math.max(0, (selectedBranchWorkspace.cameras?.total ?? 0) - (selectedBranchWorkspace.cameras?.healthy ?? 0))} Not working
              </div>
              <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 text-xs">
                Recording: {selectedBranchWorkspace.recording?.recordingChannels ?? 0}/{selectedBranchWorkspace.recording?.totalChannels ?? 0} Channels
              </div>
              <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 text-xs">
                Network: Latency {selectedBranchWorkspace.internet?.latencyMs ?? 0}ms
              </div>
            </div>

            <div className="flex gap-2 pt-2 border-t border-slate-800">
              <Link
                href={`/operations/branches/${selectedBranchWorkspace.branchId}`}
                className="flex-1 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-center text-white text-xs font-bold shadow transition-colors"
              >
                Open Full Branch Workspace →
              </Link>
            </div>
          </div>
        </div>
      )}
      </div>
    </ErrorBoundary>
  );
}
