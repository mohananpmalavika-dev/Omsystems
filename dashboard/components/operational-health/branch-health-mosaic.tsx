"use client";

import Link from "next/link";
import { Search, Wifi, Camera, HardDrive, Radio } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BranchHealth, HealthStatus } from "@/lib/types/operational-health";
import { getTimeAgo } from "@/lib/types/operational-health";
import { useOperationalHealthStream } from "@/hooks/useOperationalHealthStream";

const ROW_HEIGHT = 184;
const GAP = 12;

export function BranchHealthMosaic() {
  const [branches, setBranches] = useState<BranchHealth[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<HealthStatus | "all">("all");
  const [region, setRegion] = useState("all");
  const [loading, setLoading] = useState(true);
  const [scrollTop, setScrollTop] = useState(0);
  const [columns, setColumns] = useState(4);
  const viewport = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ limit: "500", offset: "0" });
    if (search.trim()) params.set("search", search.trim());
    if (status !== "all") params.set("status", status);
    if (region !== "all") params.set("region", region);
    try {
      const response = await fetch(`/api/control/v1/operations/health/branches?${params}`, { cache: "no-store" });
      if (!response.ok) throw new Error("branch_health_unavailable");
      const body = await response.json();
      setBranches(body.data.branches ?? []);
    } finally { setLoading(false); }
  }, [region, search, status]);

  useEffect(() => { const timer = setTimeout(load, 200); return () => clearTimeout(timer); }, [load]);
  useEffect(() => { const timer = setInterval(load, 30_000); return () => clearInterval(timer); }, [load]);
  const realtime = useOperationalHealthStream(useCallback(() => { void load(); }, [load]));
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = entry?.contentRect.width ?? 0;
      setColumns(width >= 1100 ? 4 : width >= 760 ? 3 : width >= 500 ? 2 : 1);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const regions = useMemo(() => [...new Set(branches.map((branch) => branch.region))].sort(), [branches]);
  const rowCount = Math.ceil(branches.length / columns);
  const startRow = Math.max(0, Math.floor(scrollTop / (ROW_HEIGHT + GAP)) - 2);
  const endRow = Math.min(rowCount, startRow + Math.ceil(620 / (ROW_HEIGHT + GAP)) + 4);
  const visible = branches.slice(startRow * columns, endRow * columns);

  return <section className="card mb-6" aria-label="Enterprise branch health mosaic">
    <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
      <div><h3 className="text-lg font-semibold">Enterprise health mosaic</h3><p className="text-xs text-gray-500">{branches.length} branches · {realtime ? "Live updates" : "Polling fallback"}</p></div>
      <div className="flex flex-wrap gap-2">
        <label className="relative"><Search size={15} className="absolute left-2.5 top-2.5 text-gray-400"/><input aria-label="Search branches" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search branch" className="input pl-8"/></label>
        <select aria-label="Filter branch status" className="input" value={status} onChange={(event) => setStatus(event.target.value as HealthStatus | "all")}><option value="all">All statuses</option><option value="healthy">Healthy</option><option value="warning">Warning</option><option value="critical">Critical</option><option value="unknown">Unknown</option></select>
        <select aria-label="Filter branch region" className="input" value={region} onChange={(event) => setRegion(event.target.value)}><option value="all">All regions</option>{regions.map((item) => <option key={item}>{item}</option>)}</select>
      </div>
    </div>
    <div ref={viewport} className="overflow-auto border rounded-lg bg-gray-50" style={{ height: 620 }} onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}>
      <div style={{ height: rowCount * (ROW_HEIGHT + GAP), position: "relative" }}>
        <div className="grid gap-3 absolute left-0 right-0 p-3" style={{ top: startRow * (ROW_HEIGHT + GAP), gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
          {visible.map((branch) => <BranchTile key={branch.id} branch={branch}/>) }
        </div>
      </div>
      {!loading && branches.length === 0 && <p className="p-8 text-center text-gray-500">No branches match these filters.</p>}
    </div>
  </section>;
}

function BranchTile({ branch }: { branch: BranchHealth }) {
  const tone = branch.healthStatus === "healthy" ? "border-l-green-500 bg-green-50" : branch.healthStatus === "warning" ? "border-l-amber-500 bg-amber-50" : branch.healthStatus === "critical" ? "border-l-red-500 bg-red-50" : "border-l-gray-500 bg-white";
  return <Link href={`/operations/branches/${branch.id}`} className={`block h-[184px] rounded-lg border border-l-4 border-gray-200 p-3 hover:shadow-md ${tone}`}>
    <div className="flex justify-between gap-2"><div className="min-w-0"><h4 className="font-semibold truncate">{branch.name}</h4><p className="text-xs text-gray-500">{branch.region} · {branch.code}</p></div><span className="text-xs uppercase font-semibold">{branch.healthStatus}</span></div>
    <div className="grid grid-cols-2 gap-2 mt-3 text-xs"><span className="flex gap-1"><Camera size={13}/>{branch.onlineCameras}/{branch.totalCameras} online</span><span className="flex gap-1"><Radio size={13}/>{branch.recordingCameras} recording</span><span className={branch.criticalAlerts ? "flex gap-1 text-red-700" : "flex gap-1"}><HardDrive size={13}/>{branch.criticalAlerts} exceptions</span><span className="flex gap-1"><Wifi size={13}/>Agent {branch.edgeAgentStatus}</span></div>
    <div className="mt-3 h-2 rounded bg-gray-200 overflow-hidden"><div className="h-full bg-blue-600" style={{ width: `${branch.healthScore ?? 0}%` }}/></div>
    <p className="text-[11px] text-gray-500 mt-2">{branch.lastHealthCheck ? getTimeAgo(branch.lastHealthCheck) : "Awaiting telemetry"}</p>
  </Link>;
}
