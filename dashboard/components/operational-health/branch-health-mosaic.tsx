"use client";

import Link from "next/link";
import { AlertTriangle, Camera, Maximize2, Minimize2, Radio, Search, Server, Wifi } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BranchConnectivityStatus, BranchHealth, HealthStatus } from "@/lib/types/operational-health";
import { getTimeAgo } from "@/lib/types/operational-health";
import { useOperationalHealthStream } from "@/hooks/useOperationalHealthStream";
import {
  BRANCH_GRID_LAYOUTS,
  getBranchGridMetrics,
  loadAllBranchHealth,
  sequenceBranchHealth,
  type BranchGridLayout,
  type BranchHealthPage,
  type BranchSequence,
} from "./branch-mosaic-model";
import type { BranchSummaryFilter } from "./branch-summary-model";

// Support for 400+ branches with efficient virtual scrolling and 20x20 grid
const VIEWPORT_HEIGHT = 620;

export function BranchHealthMosaic({ filter }: { filter?: BranchSummaryFilter }) {
  const [branches, setBranches] = useState<BranchHealth[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<HealthStatus | "all">("all");
  const [connectivity, setConnectivity] = useState<BranchConnectivityStatus | "all">("all");
  const [region, setRegion] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [layout, setLayout] = useState<BranchGridLayout>("4x4");
  const [sequence, setSequence] = useState<BranchSequence>("priority");
  const [fullscreen, setFullscreen] = useState(false);
  const [viewportHeight, setViewportHeight] = useState(VIEWPORT_HEIGHT);
  const [viewportWidth, setViewportWidth] = useState(1200);
  const viewport = useRef<HTMLDivElement>(null);
  const metrics = getBranchGridMetrics(layout, viewportWidth);
  const sequencedBranches = useMemo(() => sequenceBranchHealth(branches, sequence), [branches, sequence]);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (status !== "all") params.set("status", status);
    if (connectivity !== "all") params.set("connectivity", connectivity);
    if (region !== "all") params.set("region", region);
    try {
      setError(null);
      const loaded = await loadAllBranchHealth(async (offset, limit) => {
        const pageParams = new URLSearchParams(params);
        pageParams.set("limit", String(limit));
        pageParams.set("offset", String(offset));
        const response = await fetch(`/api/control/v1/operations/health/branches?${pageParams}`, { cache: "no-store" });
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

  useEffect(() => {
    if (!filter) return;
    setStatus(filter.kind === "health" ? filter.value : "all");
    setConnectivity(filter.kind === "connectivity" ? filter.value : "all");
    setScrollTop(0);
    viewport.current?.scrollTo({ top: 0 });
  }, [filter]);

  useEffect(() => {
    const timer = setTimeout(load, 200);
    return () => clearTimeout(timer);
  }, [load]);
  useEffect(() => {
    const timer = setInterval(load, 30_000);
    return () => clearInterval(timer);
  }, [load]);
  const realtime = useOperationalHealthStream(useCallback(() => { void load(); }, [load]));

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setViewportWidth(entry?.contentRect.width ?? 0));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const updateHeight = () => setViewportHeight(fullscreen ? Math.max(VIEWPORT_HEIGHT, window.innerHeight - 170) : VIEWPORT_HEIGHT);
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
  }, [fullscreen]);

  const regions = useMemo(() => [...new Set(branches.map((branch) => branch.region))].sort(), [branches]);
  const rowCount = Math.ceil(sequencedBranches.length / metrics.columns);
  const startRow = Math.max(0, Math.floor(scrollTop / (metrics.rowHeight + metrics.gap)) - 2);
  const endRow = Math.min(rowCount, startRow + Math.ceil(viewportHeight / (metrics.rowHeight + metrics.gap)) + 4);
  const visible = sequencedBranches.slice(startRow * metrics.columns, endRow * metrics.columns);

  return <section id="branch-health-mosaic" className={`branch-mosaic card mb-6 scroll-mt-4 ${fullscreen ? "branch-mosaic-fullscreen" : ""}`} aria-label="Enterprise branch health mosaic">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h3 className="text-lg font-semibold">Enterprise branch overview</h3>
        <p className="text-xs text-gray-500">{branches.length} branches · {realtime ? "Live updates" : "Polling fallback"}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <label className="relative">
          <Search size={15} className="absolute left-2.5 top-2.5 text-gray-400"/>
          <input aria-label="Search branches" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search branch" className="input pl-8"/>
        </label>
        <select aria-label="Filter branch status" className="input" value={status} onChange={(event) => setStatus(event.target.value as HealthStatus | "all")}>
          <option value="all">All statuses</option><option value="healthy">Healthy</option><option value="warning">Warning</option><option value="critical">Critical</option><option value="unknown">Unknown</option>
        </select>
        <select aria-label="Filter branch connectivity" className="input" value={connectivity} onChange={(event) => setConnectivity(event.target.value as BranchConnectivityStatus | "all")}>
          <option value="all">All connectivity</option><option value="online">Online</option><option value="degraded">Degraded</option><option value="failover">Failover</option><option value="offline">Offline</option><option value="unknown">Unknown</option>
        </select>
        <select aria-label="Filter branch region" className="input" value={region} onChange={(event) => setRegion(event.target.value)}>
          <option value="all">All regions</option>{regions.map((item) => <option key={item}>{item}</option>)}
        </select>
        <select aria-label="Sequence branches" className="input" value={sequence} onChange={(event) => setSequence(event.target.value as BranchSequence)}>
          <option value="priority">Critical first</option><option value="region">Group by region</option><option value="name">Branch name</option>
        </select>
        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1" role="group" aria-label="Branch grid layout">
          {BRANCH_GRID_LAYOUTS.map((option) => <button
            key={option}
            type="button"
            aria-pressed={layout === option}
            onClick={() => {
              setLayout(option);
              setScrollTop(0);
              viewport.current?.scrollTo({ top: 0 });
            }}
            className={`rounded-md px-2.5 py-1.5 text-xs font-semibold ${layout === option ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-100"}`}
          >{option}</button>)}
        </div>
        <button type="button" className="btn-secondary inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold" onClick={() => setFullscreen((value) => !value)}>
          {fullscreen ? <Minimize2 size={14}/> : <Maximize2 size={14}/>} {fullscreen ? "Exit HO wall" : "HO wall"}
        </button>
      </div>
    </div>
    {error && <div role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
    <div ref={viewport} className="branch-mosaic-viewport overflow-auto rounded-lg border bg-gray-50" style={{ height: viewportHeight }} onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}>
      <div style={{ height: rowCount * (metrics.rowHeight + metrics.gap), position: "relative" }}>
        <div className="absolute left-0 right-0 grid p-2" style={{ top: startRow * (metrics.rowHeight + metrics.gap), gap: metrics.gap, gridTemplateColumns: `repeat(${metrics.columns}, minmax(0, 1fr))` }}>
          {visible.map((branch) => <BranchTile key={branch.id} branch={branch} height={metrics.rowHeight} compact={metrics.compact} ultraCompact={metrics.ultraCompact} statusOnly={metrics.statusOnly}/>)}
        </div>
      </div>
      {!loading && branches.length === 0 && <p className="p-8 text-center text-gray-500">No branches match these filters.</p>}
    </div>
  </section>;
}

function BranchTile({ branch, height, compact, ultraCompact, statusOnly }: { branch: BranchHealth; height: number; compact: boolean; ultraCompact: boolean; statusOnly: boolean }) {
  const tone = branch.healthStatus === "healthy"
    ? "border-l-green-500 bg-green-50"
    : branch.healthStatus === "warning"
      ? "border-l-amber-500 bg-amber-50"
      : branch.healthStatus === "critical"
        ? "border-l-red-500 bg-red-50"
        : "border-l-gray-500 bg-white";
  const statusDot = branch.healthStatus === "healthy" ? "bg-green-500" : branch.healthStatus === "warning" ? "bg-amber-500" : branch.healthStatus === "critical" ? "bg-red-500" : "bg-gray-400";
  const recorderLabel = branch.totalRecorders ? `${branch.onlineRecorders ?? 0}/${branch.totalRecorders}` : branch.recorderStatus ?? "unknown";

  return <Link
    aria-label={`Open ${branch.name} details`}
    title={`${branch.name} · DVR/NVR ${recorderLabel} · ${branch.criticalAlerts} active alerts`}
    href={`/operations/branches/${branch.id}`}
    style={{ height }}
    className={`branch-mosaic-tile block overflow-hidden rounded-lg border border-l-4 border-gray-200 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${statusOnly ? "status-only px-1.5 py-1" : "px-2.5 py-2"} ${tone}`}
  >
    {statusOnly ? <div className="flex h-full min-w-0 items-center gap-1">
      <span className={`h-2 w-2 flex-none rounded-full ${statusDot}`}/>
      <strong className="min-w-0 truncate text-[9px] leading-none">{branch.code || branch.name}</strong>
    </div> : <>
    <div className="flex items-center justify-between gap-1">
      <div className="min-w-0">
        <h4 className={`${ultraCompact ? "text-[10px]" : "text-xs"} truncate font-semibold`}>{branch.name}</h4>
        {!compact && <p className="truncate text-[10px] text-gray-500">{branch.region} · {branch.code}</p>}
      </div>
      <span className={`h-2.5 w-2.5 flex-none rounded-full ${statusDot}`} title={branch.healthStatus}/>
    </div>
    <div className={`grid grid-cols-3 gap-1 ${ultraCompact ? "mt-1 text-[9px]" : "mt-2 text-[10px]"}`}>
      <span className="flex items-center gap-1 truncate" title="Online cameras"><Camera size={ultraCompact ? 10 : 12}/>{branch.onlineCameras}/{branch.totalCameras}</span>
      <span className={`flex items-center gap-1 truncate ${branch.recorderStatus === "offline" ? "font-semibold text-red-700" : ""}`} title={`DVR/NVR ${branch.recorderStatus ?? "unknown"}`}><Server size={ultraCompact ? 10 : 12}/>{recorderLabel}</span>
      <span className={`flex items-center gap-1 truncate ${branch.criticalAlerts ? "font-semibold text-red-700" : ""}`} title="Active alerts"><AlertTriangle size={ultraCompact ? 10 : 12}/>{branch.criticalAlerts}</span>
    </div>
    {!ultraCompact && <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-gray-600">
      <span className="flex items-center gap-1"><Radio size={11}/>{branch.recordingCameras} recording</span>
      {!compact && <span className={`flex items-center gap-1 ${branch.internetStatus === "offline" ? "font-semibold text-red-700" : branch.internetStatus === "degraded" || branch.internetStatus === "failover" ? "font-semibold text-amber-700" : ""}`} title="Branch internet status"><Wifi size={11}/>{branch.internetStatus ?? "unknown"}</span>}
    </div>}
    {!compact && <>
      <div className="mt-2 h-1.5 overflow-hidden rounded bg-gray-200"><div className="h-full bg-blue-600" style={{ width: `${branch.healthScore ?? 0}%` }}/></div>
      <p className="mt-1 text-[10px] text-gray-500">{branch.lastHealthCheck ? getTimeAgo(branch.lastHealthCheck) : "Awaiting telemetry"}</p>
    </>}
    </>}
  </Link>;
}
