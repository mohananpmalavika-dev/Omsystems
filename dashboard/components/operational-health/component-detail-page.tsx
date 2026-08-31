"use client";

import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { BranchHealth, HealthStatus } from "@/lib/types/operational-health";
import { fetchBranchesHealth } from "@/lib/api/operational-health";
import { useOperationalHealthStream } from "@/hooks/useOperationalHealthStream";

type ComponentKey = "camera" | "recording" | "storage" | "network" | "ups" | "edgeAgent";
type Projection = BranchHealth & { components: Record<ComponentKey, { status: HealthStatus; score: number | null; lastUpdated: string | null }> };

export function ComponentDetailPage({ title, component }: { title: string; component: ComponentKey }) {
  const [branches, setBranches] = useState<Projection[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    try {
      const data = await fetchBranchesHealth({ limit: 500 });
      setBranches((data.branches as Projection[]) ?? []);
    } catch {
      // ignore
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); const timer = setInterval(load, 30_000); return () => clearInterval(timer); }, [load]);
  const live = useOperationalHealthStream(useCallback(() => { void load(); }, [load]));
  return <div className="page-container">
    <div className="flex justify-between items-start mb-6"><div><h1 className="text-2xl font-bold">{title}</h1><p className="text-sm text-gray-500">Branch-by-branch status · {live ? "live" : "polling fallback"}</p></div><button className="btn-secondary flex gap-2" onClick={load}><RefreshCw size={16} className={loading ? "animate-spin" : ""}/>Refresh</button></div>
    <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
      {branches.map((branch) => {
        const health = branch.components[component];
        const tone = health?.status === "critical" ? "border-red-400 bg-red-50" : health?.status === "warning" ? "border-amber-400 bg-amber-50" : health?.status === "healthy" ? "border-green-400 bg-green-50" : "border-gray-300";
        return <Link key={branch.id} href={`/operations/branches/${branch.id}`} className={`card border ${tone}`}><div className="flex justify-between"><div><h2 className="font-semibold">{branch.name}</h2><p className="text-xs text-gray-500">{branch.region}</p></div><span className="text-xs uppercase font-semibold">{health?.status ?? "unknown"}</span></div><div className="mt-4 flex justify-between text-sm"><span>Health score</span><strong>{health?.score ?? "--"}</strong></div><div className="mt-2 flex justify-between text-sm"><span>Cameras</span><strong>{branch.onlineCameras}/{branch.totalCameras}</strong></div></Link>;
      })}
    </div>
  </div>;
}
