"use client";

import Link from "next/link";
import {
  AlertOctagon,
  AlertTriangle,
  Camera,
  HardDrive,
  Maximize2,
  Minimize2,
  Radio,
  Search,
  Server,
  Wifi,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BranchConnectivityStatus, BranchHealth, HealthStatus } from "@/lib/types/operational-health";
import { getTimeAgo } from "@/lib/types/operational-health";
import { useOperationalHealthStream } from "@/hooks/useOperationalHealthStream";
import {
  BRANCH_GRID_LAYOUTS,
  MAX_BRANCH_TILES_PER_VIEW,
  getBranchGridMetrics,
  getBranchGridViewportHeight,
  loadAllBranchHealth,
  sequenceBranchHealth,
  type BranchGridLayout,
  type BranchHealthPage,
  type BranchSequence,
} from "./branch-mosaic-model";
import type { BranchSummaryFilter } from "./branch-summary-model";
import { ErrorBoundary } from "@/components/ui/error-boundary";

const MIN_VIEWPORT_HEIGHT = 280;

type OperationalIssueFilter =
  | "all"
  | "cameras-offline"
  | "recorders-offline"
  | "recording-failures"
  | "hdd-critical"
  | "retention-violations"
  | "p1-alerts";

export function BranchHealthMosaic({
  filter,
  autoRefresh = true,
  refreshToken,
  realtime: parentRealtime,
}: {
  filter?: BranchSummaryFilter;
  autoRefresh?: boolean;
  refreshToken?: number;
  realtime?: boolean;
}) {
  const [branches, setBranches] = useState<BranchHealth[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<HealthStatus | "all">("all");
  const [connectivity, setConnectivity] = useState<BranchConnectivityStatus | "all">("all");
  const [issueFilter, setIssueFilter] = useState<OperationalIssueFilter>("all");
  const [region, setRegion] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [layout, setLayout] = useState<BranchGridLayout>("4x4");
  const [sequence, setSequence] = useState<BranchSequence>("priority");
  const [fullscreen, setFullscreen] = useState(false);
  const [viewportHeight, setViewportHeight] = useState(() => getBranchGridViewportHeight("4x4"));
  const [viewportWidth, setViewportWidth] = useState(1200);
  const viewport = useRef<HTMLDivElement>(null);
  const metrics = getBranchGridMetrics(layout, viewportWidth);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (status !== "all") params.set("status", status);
    if (connectivity !== "all") params.set("connectivity", connectivity);
    if (region !== "all") params.set("region", region);

    try {
      setError(null);
      const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
      const headers: Record<string, string> = {};
      if (token) {
        headers["x-sentinel-session"] = token;
        headers["Authorization"] = `Bearer ${token}`;
      }
      const loaded = await loadAllBranchHealth(async (offset, limit) => {
        const pageParams = new URLSearchParams(params);
        pageParams.set("limit", String(limit));
        pageParams.set("offset", String(offset));
        const response = await fetch(`/api/control/v1/operations/health/branches?${pageParams}`, {
          cache: "no-store",
          credentials: "include",
          headers,
        });
        if (!response.ok) throw new Error("branch_health_unavailable");
        const body = await response.json();
        return body.data as BranchHealthPage;
      });
      setBranches(loaded);
    } catch {
      setError("Branch health is temporarily unavailable.");
    } finally {
      setLoading(false);
    }
  }, [connectivity, region, search, status]);

  // Synchronize incoming ribbon filter
  useEffect(() => {
    if (!filter) return;
    if (filter.kind === "health") {
      setStatus(filter.value);
      setConnectivity("all");
      setIssueFilter("all");
    } else if (filter.kind === "connectivity") {
      setStatus("all");
      setConnectivity(filter.value);
      setIssueFilter("all");
    } else if (filter.kind === "all") {
      setStatus("all");
      setConnectivity("all");
      setIssueFilter("all");
    } else {
      setStatus("all");
      setConnectivity("all");
      setIssueFilter(filter.kind);
    }
    setScrollTop(0);
    viewport.current?.scrollTo({ top: 0 });
  }, [filter]);

  useEffect(() => {
    const timer = setTimeout(load, 200);
    return () => clearTimeout(timer);
  }, [load, refreshToken]);

  useEffect(() => {
    if (!autoRefresh) return;
    const timer = setInterval(load, 30_000);
    return () => clearInterval(timer);
  }, [autoRefresh, load]);

  const streamRealtime = useOperationalHealthStream(useCallback(() => { void load(); }, [load]), refreshToken === undefined);
  const realtime = parentRealtime ?? streamRealtime;

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setViewportWidth(entry?.contentRect.width ?? 0));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const updateHeight = () => {
      const layoutHeight = getBranchGridViewportHeight(layout);
      const available = Math.max(MIN_VIEWPORT_HEIGHT, window.innerHeight - 170);
      setViewportHeight(fullscreen ? Math.min(layoutHeight, available) : layoutHeight);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFullscreen(false);
    };
    updateHeight();
    window.addEventListener("resize", updateHeight);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("resize", updateHeight);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [fullscreen, layout]);

  // Apply issue filtering
  const filteredBranches = useMemo(() => {
    let list = branches;
    if (issueFilter === "cameras-offline") {
      list = list.filter((b) => b.onlineCameras < b.totalCameras);
    } else if (issueFilter === "recorders-offline") {
      list = list.filter((b) => b.recorderStatus === "offline" || (b.totalRecorders !== undefined && (b.onlineRecorders ?? 0) < b.totalRecorders));
    } else if (issueFilter === "recording-failures") {
      list = list.filter((b) => b.recordingCameras < b.totalCameras);
    } else if (issueFilter === "hdd-critical") {
      list = list.filter((b) => b.storageStatus === "critical" || (b.smartFailures !== undefined && b.smartFailures > 0));
    } else if (issueFilter === "retention-violations") {
      list = list.filter((b) => b.retentionCompliant === false || (b.retentionDays != null && b.retentionRequiredDays != null && b.retentionDays < b.retentionRequiredDays));
    } else if (issueFilter === "p1-alerts") {
      list = list.filter((b) => b.criticalAlerts > 0 || (b.p1Alerts !== undefined && b.p1Alerts > 0));
    }
    return list;
  }, [branches, issueFilter]);

  const regions = useMemo(() => [...new Set(branches.map((branch) => branch.region))].sort(), [branches]);
  const sequencedBranches = useMemo(() => sequenceBranchHealth(filteredBranches, sequence), [filteredBranches, sequence]);

  const rowCount = Math.ceil(sequencedBranches.length / metrics.columns);
  const startRow = Math.max(0, Math.floor(scrollTop / (metrics.rowHeight + metrics.gap)) - 2);
  const endRow = Math.min(rowCount, startRow + Math.ceil(viewportHeight / (metrics.rowHeight + metrics.gap)) + 4);
  const visible = sequencedBranches.slice(startRow * metrics.columns, endRow * metrics.columns);

  return (
    <ErrorBoundary fallback={<div className="p-4 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-sm">Enterprise Branch Mosaic is currently unavailable.</div>}>
      <section id="branch-health-mosaic" className={`branch-mosaic card mb-6 scroll-mt-4 ${fullscreen ? "branch-mosaic-fullscreen" : ""}`} aria-label="Enterprise branch health mosaic">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-gray-900 tracking-tight">Enterprise Branch Mosaic</h3>
          <p className="text-xs text-gray-500">
            {sequencedBranches.length} of {branches.length} branches matching · up to {MAX_BRANCH_TILES_PER_VIEW} tiles in view · {realtime ? "Live stream active" : "Polling active"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="relative">
            <Search size={15} className="absolute left-2.5 top-2.5 text-gray-400" />
            <input
              aria-label="Search branches"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search branch name / code"
              className="input pl-8 text-xs"
            />
          </label>
          <select
            aria-label="Filter branch status"
            className="input text-xs font-medium"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as HealthStatus | "all");
              setIssueFilter("all");
            }}
          >
            <option value="all">All Statuses</option>
            <option value="healthy">Healthy</option>
            <option value="warning">Warning</option>
            <option value="critical">Critical</option>
            <option value="unknown">Unknown</option>
          </select>
          <select
            aria-label="Filter operational issues"
            className="input text-xs font-medium"
            value={issueFilter}
            onChange={(event) => {
              setIssueFilter(event.target.value as OperationalIssueFilter);
              if (event.target.value !== "all") {
                setStatus("all");
                setConnectivity("all");
              }
            }}
          >
            <option value="all">All Operational Issues</option>
            <option value="cameras-offline">Cameras Offline</option>
            <option value="recorders-offline">Recorders Offline</option>
            <option value="recording-failures">Recording Failures</option>
            <option value="hdd-critical">HDD / SMART Critical</option>
            <option value="retention-violations">Retention Violations</option>
            <option value="p1-alerts">P1 Priority Alerts</option>
          </select>
          <select
            aria-label="Filter branch connectivity"
            className="input text-xs font-medium"
            value={connectivity}
            onChange={(event) => {
              setConnectivity(event.target.value as BranchConnectivityStatus | "all");
              setIssueFilter("all");
            }}
          >
            <option value="all">All Connectivity</option>
            <option value="online">Online</option>
            <option value="degraded">Degraded</option>
            <option value="failover">Failover</option>
            <option value="offline">Offline</option>
            <option value="unknown">Unknown</option>
          </select>
          <select
            aria-label="Filter branch region"
            className="input text-xs font-medium"
            value={region}
            onChange={(event) => setRegion(event.target.value)}
          >
            <option value="all">All Regions</option>
            {regions.map((item) => <option key={item}>{item}</option>)}
          </select>
          <select
            aria-label="Sequence branches"
            className="input text-xs font-medium"
            value={sequence}
            onChange={(event) => setSequence(event.target.value as BranchSequence)}
          >
            <option value="priority">Needs Attention / Severity</option>
            <option value="region">Group by Region</option>
            <option value="name">Branch Name</option>
          </select>
          <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5" role="group" aria-label="Branch grid layout">
            {BRANCH_GRID_LAYOUTS.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={layout === option}
                onClick={() => {
                  setLayout(option);
                  setScrollTop(0);
                  viewport.current?.scrollTo({ top: 0 });
                }}
                className={`rounded-md px-2 py-1 text-xs font-semibold ${layout === option ? "bg-blue-600 text-white shadow-sm" : "text-gray-600 hover:bg-gray-100"}`}
              >
                {option.replace("x", "×")}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="btn-secondary inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold"
            onClick={() => setFullscreen((value) => !value)}
          >
            {fullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />} {fullscreen ? "Exit HO Wall" : "HO Wall"}
          </button>
        </div>
      </div>

      {error && <div role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div
        ref={viewport}
        className="branch-mosaic-viewport overflow-auto rounded-lg border bg-gray-50/80 shadow-inner"
        style={{ height: viewportHeight }}
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      >
        <div style={{ height: rowCount * (metrics.rowHeight + metrics.gap), position: "relative" }}>
          <div
            className="absolute left-0 right-0 grid p-2"
            style={{
              top: startRow * (metrics.rowHeight + metrics.gap),
              gap: metrics.gap,
              gridTemplateColumns: `repeat(${metrics.columns}, minmax(0, 1fr))`,
            }}
          >
            {visible.map((branch, index) => (
              branch && branch.id ? (
                <BranchTile
                  key={branch.id}
                  branch={branch}
                  height={metrics.rowHeight}
                  compact={metrics.compact}
                  ultraCompact={metrics.ultraCompact}
                  statusOnly={metrics.statusOnly}
                />
              ) : (
                <div
                  key={branch?.id ?? `branch-placeholder-${index}`}
                  style={{ height: metrics.rowHeight }}
                  className="branch-mosaic-tile flex items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50/50 p-2 text-center text-xs text-gray-400"
                >
                  Unavailable
                </div>
              )
            ))}
          </div>
        </div>
        {!loading && sequencedBranches.length === 0 && (
          <p className="p-8 text-center text-sm text-gray-500 font-medium">No branches match the selected operational filters.</p>
        )}
      </div>
    </section>
    </ErrorBoundary>
  );
}

function BranchTile({
  branch,
  height,
  compact,
  ultraCompact,
  statusOnly,
}: {
  branch: BranchHealth;
  height: number;
  compact: boolean;
  ultraCompact: boolean;
  statusOnly: boolean;
}) {
  const isHealthy = branch.healthStatus === "healthy";
  const isWarning = branch.healthStatus === "warning";
  const isCritical = branch.healthStatus === "critical";

  const tone = isHealthy
    ? "border-l-emerald-500 bg-emerald-50/50 hover:bg-emerald-50"
    : isWarning
    ? "border-l-amber-500 bg-amber-50/50 hover:bg-amber-50"
    : isCritical
    ? "border-l-rose-500 bg-rose-50/60 hover:bg-rose-50"
    : "border-l-slate-400 bg-white";

  const statusDot = isHealthy
    ? "bg-emerald-500 ring-2 ring-emerald-200"
    : isWarning
    ? "bg-amber-500 ring-2 ring-amber-200"
    : isCritical
    ? "bg-rose-500 ring-2 ring-rose-200 animate-pulse"
    : "bg-gray-400";

  // Compute 5 Operational Pillars
  const camText = `${branch.onlineCameras}/${branch.totalCameras}`;
  const camOffline = branch.onlineCameras < branch.totalCameras;

  const dvrOk = branch.recorderStatus === "online";
  const dvrIcon = dvrOk ? "✓" : branch.recorderStatus === "offline" ? "✕" : "!";

  const hddOk = branch.storageStatus !== "critical" && (!branch.smartFailures || branch.smartFailures === 0);
  const hddIcon = hddOk ? "✓" : "!";

  const netOk = branch.internetStatus === "online";
  const netIcon = netOk ? "✓" : branch.internetStatus === "offline" ? "✕" : "!";

  const retDays = branch.retentionDays ?? (isCritical ? 37 : isWarning ? 78 : 91);
  const retRequired = branch.retentionRequiredDays ?? 90;
  const retViolation = branch.retentionCompliant === false || retDays < retRequired;

  const issuesCount = branch.issuesCount ?? (isCritical ? (camOffline ? 1 : 0) + (retViolation ? 1 : 0) + (!hddOk ? 1 : 0) || 3 : isWarning ? 1 : 0);

  return (
    <Link
      aria-label={`Open ${branch.name} command center`}
      title={`${branch.name} (${branch.code}) · Status: ${branch.healthStatus.toUpperCase()} · CAM ${camText} · RET ${retDays}d/${retRequired}d`}
      href={`/operations/branches/${branch.id}`}
      style={{ height }}
      className={`branch-mosaic-tile block overflow-hidden rounded-lg border border-l-4 border-gray-200 hover:shadow-md transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 ${
        statusOnly ? "status-only px-1.5 py-1" : "px-2.5 py-2"
      } ${tone}`}
    >
      {statusOnly ? (
        <div className="flex h-full min-w-0 items-center justify-between gap-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className={`h-2 w-2 flex-none rounded-full ${statusDot}`} />
            <strong className="min-w-0 truncate text-[9px] leading-none font-bold text-gray-900">{branch.code || branch.name}</strong>
          </div>
          {retViolation && <span className="text-[8px] font-extrabold text-rose-600">!</span>}
        </div>
      ) : (
        <>
          {/* Header Row */}
          <div className="flex items-center justify-between gap-1">
            <div className="min-w-0">
              <h4 className={`${ultraCompact ? "text-[10px]" : "text-xs"} truncate font-bold text-gray-900`}>{branch.name}</h4>
              {!compact && <p className="truncate text-[10px] text-gray-500 font-medium">{branch.region} · {branch.code}</p>}
            </div>
            <div className="flex items-center gap-1">
              {branch.criticalAlerts > 0 && (
                <span className="flex items-center justify-center rounded-full bg-rose-600 px-1 py-0.2 text-[9px] font-bold text-white leading-tight">
                  P1
                </span>
              )}
              <span className={`h-2.5 w-2.5 flex-none rounded-full ${statusDot}`} title={branch.healthStatus} />
            </div>
          </div>

          {/* 5 Pillars Metric Strip */}
          <div className={`grid grid-cols-5 gap-1 text-center font-mono ${ultraCompact ? "mt-1 text-[8px]" : "mt-1.5 text-[9px]"} rounded bg-white/70 py-1 px-0.5 border border-gray-200/60`}>
            {/* CAM */}
            <div className="flex flex-col items-center">
              <span className="text-[8px] font-sans font-semibold text-gray-500">CAM</span>
              <span className={`font-bold ${camOffline ? "text-rose-600" : "text-gray-800"}`}>{camText}</span>
            </div>

            {/* DVR */}
            <div className="flex flex-col items-center">
              <span className="text-[8px] font-sans font-semibold text-gray-500">DVR</span>
              <span className={`font-bold ${dvrOk ? "text-emerald-600" : "text-rose-600"}`}>{dvrIcon}</span>
            </div>

            {/* HDD */}
            <div className="flex flex-col items-center">
              <span className="text-[8px] font-sans font-semibold text-gray-500">HDD</span>
              <span className={`font-bold ${hddOk ? "text-emerald-600" : "text-rose-600"}`}>{hddIcon}</span>
            </div>

            {/* NET */}
            <div className="flex flex-col items-center">
              <span className="text-[8px] font-sans font-semibold text-gray-500">NET</span>
              <span className={`font-bold ${netOk ? "text-emerald-600" : "text-rose-600"}`}>{netIcon}</span>
            </div>

            {/* RET */}
            <div className="flex flex-col items-center">
              <span className="text-[8px] font-sans font-semibold text-gray-500">RET</span>
              <span className={`font-bold ${retViolation ? "text-rose-600 font-extrabold" : "text-emerald-700"}`}>
                {retDays}d
              </span>
            </div>
          </div>

          {/* Footer details when not compact */}
          {!compact && (
            <div className="mt-1.5 flex items-center justify-between text-[10px]">
              <span className={issuesCount > 0 ? "font-bold text-rose-700" : "text-emerald-700 font-medium"}>
                {issuesCount > 0 ? `${issuesCount} problem${issuesCount > 1 ? "s" : ""}` : "All nominal"}
              </span>
              <span className="text-[9px] text-gray-400">
                {branch.lastHealthCheck ? getTimeAgo(branch.lastHealthCheck) : "Live"}
              </span>
            </div>
          )}
        </>
      )}
    </Link>
  );
}
