"use client";

import { InspectionDesk } from "@/components/inspection-desk";
import { WorkflowNav } from "@/components/workflow-nav";
import Link from "next/link";
import { RefreshCw, Camera, FileVideo2, HardDrive, Network, Zap, Server, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { BranchHealth, HealthStatus } from "@/lib/types/operational-health";
import { fetchBranchesHealth } from "@/lib/api/operational-health";
import { useOperationalHealthStream } from "@/hooks/useOperationalHealthStream";

type ComponentKey = "camera" | "recording" | "storage" | "network" | "ups" | "edgeAgent";
type Projection = BranchHealth & { 
  components: Record<ComponentKey, { status: HealthStatus; score: number | null; lastUpdated: string | null }> 
};

const TELEMETRY_TABS: Array<{ key: ComponentKey; label: string; href: string; icon: any }> = [
  { key: "camera", label: "Cameras", href: "/operations/cameras", icon: Camera },
  { key: "recording", label: "Recording & DVR", href: "/operations/recording", icon: FileVideo2 },
  { key: "storage", label: "Storage & HDDs", href: "/operations/storage", icon: HardDrive },
  { key: "network", label: "Network & Latency", href: "/operations/network", icon: Network },
  { key: "ups", label: "Power & UPS", href: "/operations/ups", icon: Zap },
  { key: "edgeAgent", label: "Edge Gateways", href: "/operations/edge-agents", icon: Server },
];

export function ComponentDetailPage({ title, component }: { title: string; component: ComponentKey }) {
  const [branches, setBranches] = useState<Projection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "critical" | "warning" | "healthy" | "unknown">("all");
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchBranchesHealth({ limit: 500 });
      setBranches((data.branches as Projection[]) ?? []);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Telemetry health data is unavailable");
    } finally { 
      setLoading(false); 
    }
  }, []);

  useEffect(() => { 
    void load(); 
    const timer = setInterval(load, 30_000); 
    return () => clearInterval(timer); 
  }, [load]);

  const live = useOperationalHealthStream(useCallback(() => { void load(); }, [load]));

  const filteredBranches = useMemo(() => {
    return branches.filter((b) => {
      const health = b.components?.[component];
      const matchesSearch = 
        b.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (b.region && b.region.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (b.code && b.code.toLowerCase().includes(searchQuery.toLowerCase()));

      if (!matchesSearch) return false;
      if (statusFilter === "all") return true;
      return (health?.status ?? "unknown") === statusFilter;
    });
  }, [branches, component, searchQuery, statusFilter]);

  const counts = useMemo(() => {
    let critical = 0;
    let warning = 0;
    let healthy = 0;
    branches.forEach((b) => {
      const st = b.components[component]?.status;
      if (st === "critical") critical++;
      else if (st === "warning") warning++;
      else if (st === "healthy") healthy++;
    });
    return { total: branches.length, critical, warning, healthy };
  }, [branches, component]);

  const orderedBranches = [...filteredBranches].sort((a, b) => {
    const priority: Record<string, number> = { critical: 0, warning: 1, unknown: 2, healthy: 3 };
    return (priority[a.components?.[component]?.status ?? "unknown"] ?? 2) - (priority[b.components?.[component]?.status ?? "unknown"] ?? 2);
  });
  return <main className="telemetry-inspection-page page-container">
    <header className="workflow-heading"><div><p className="workflow-kicker">FLEET / COMPONENT INSPECTION</p><h1>{title}</h1><p>Find the branch that needs attention. Inspect its latest component reading, then open the branch workspace.</p></div><div className="workflow-heading-actions"><Link className="btn-secondary" href="/operations/alerts">Hardware alerts</Link><button className="btn-secondary" onClick={() => void load()} disabled={loading}><RefreshCw size={15} />{loading ? "Refreshing…" : "Refresh readings"}</button></div></header>
    <nav className="telemetry-system-nav" aria-label="Telemetry systems">{TELEMETRY_TABS.map(tab => { const Icon = tab.icon; return <Link key={tab.key} href={tab.href} aria-current={tab.key === component ? "page" : undefined}><Icon size={16} />{tab.label}</Link>; })}</nav>
    <div className="inspection-toolbar"><WorkflowNav label="Component health scope" value={statusFilter} onChange={value => setStatusFilter(value as typeof statusFilter)} items={[{id:"all",label:"All branches",count:error ? undefined : counts.total},{id:"critical",label:"Critical",count:error ? undefined : counts.critical},{id:"warning",label:"Degraded",count:error ? undefined : counts.warning},{id:"healthy",label:"Healthy",count:error ? undefined : counts.healthy},{id:"unknown",label:"Unknown"}]} /><label className="task-search"><Search size={16} /><input aria-label="Search branches" placeholder="Name, code or region" value={searchQuery} onChange={event => setSearchQuery(event.target.value)} /></label></div>
    <p className="inspection-feed-state">{live ? "Live updates connected" : "Readings refresh every 30 seconds"} · Critical branches appear first.</p>
    {error && <p role="alert" className="work-order-form-error">Telemetry unavailable: {error}{branches.length > 0 ? ". Showing last loaded readings." : ""}</p>}
    <InspectionDesk label="Branch readings" emptyMessage={loading ? "Loading branch readings…" : error ? "Readings are unavailable. Refresh to try again." : "No branches match this scope."} records={orderedBranches.map(branch => {
      const health = branch.components?.[component];
      return { id: branch.id, title: branch.name, subtitle: [branch.code, branch.region].filter(Boolean).join(" · "), status: health?.status ?? "unknown", measure: health?.score == null ? "—" : health.score + "%", description: "Component readings describe the last reported state. Open the branch for device-level investigation.", fields: [{label:"Component",value:TELEMETRY_TABS.find(tab => tab.key === component)?.label},{label:"Health score",value:health?.score == null ? "Unavailable" : health.score + "%"},{label:"Cameras online",value:branch.onlineCameras + " / " + branch.totalCameras},{label:"Last reported",value:health?.lastUpdated ? new Date(health.lastUpdated).toLocaleString() : "Not reported"},{label:"Region",value:branch.region || "Not recorded"}], href:"/operations/branches/" + branch.id, actionLabel:"Investigate branch" };
    })} />
  </main>;
}
