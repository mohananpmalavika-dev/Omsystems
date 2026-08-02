"use client";

import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  Camera,
  CheckCircle2,
  ChevronRight,
  Cloud,
  Cpu,
  FileVideo2,
  MapPin,
  RefreshCw,
  Search,
  ShieldCheck,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useOperationalHealthStream } from "@/hooks/useOperationalHealthStream";
import type { BranchHealth } from "@/lib/types/operational-health";
import { getTimeAgo } from "@/lib/types/operational-health";

type GatewayFilter = "all" | "ready" | "offline" | "tunnel_missing" | "not_enrolled";
type BranchPage = { branches: BranchHealth[]; total: number; limit: number; offset: number };

const PAGE_SIZE = 500;

export function BranchGatewayFleet() {
  const [branches, setBranches] = useState<BranchHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [search, setSearch] = useState("");
  const [region, setRegion] = useState("all");
  const [status, setStatus] = useState<GatewayFilter>("all");
  const [lastUpdated, setLastUpdated] = useState<string>();

  const load = useCallback(async () => {
    try {
      setError(undefined);
      const collected: BranchHealth[] = [];
      let offset = 0;
      let total = 0;
      do {
        const response = await fetch(`/api/control/v1/operations/health/branches?limit=${PAGE_SIZE}&offset=${offset}`, { cache: "no-store" });
        if (!response.ok) throw new Error("gateway_fleet_unavailable");
        const body = await response.json() as { data: BranchPage };
        collected.push(...body.data.branches);
        total = body.data.total;
        offset += body.data.branches.length;
      } while (offset < total && collected.length < 10_000);
      setBranches(collected);
      setLastUpdated(new Date().toISOString());
    } catch {
      setError("Branch gateway status is temporarily unavailable. Existing live sessions are not affected.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(load, 30_000);
    return () => clearInterval(timer);
  }, [load]);
  const realtime = useOperationalHealthStream(useCallback(() => { void load(); }, [load]));

  const regions = useMemo(() => [...new Set(branches.map((branch) => branch.region))].sort(), [branches]);
  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return branches
      .filter((branch) => region === "all" || branch.region === region)
      .filter((branch) => status === "all" || readiness(branch) === status)
      .filter((branch) => !query || `${branch.name} ${branch.code} ${branch.region}`.toLowerCase().includes(query))
      .sort((left, right) => readinessRank(readiness(left)) - readinessRank(readiness(right)) || left.name.localeCompare(right.name));
  }, [branches, region, search, status]);

  const summary = useMemo(() => {
    const ready = branches.filter((branch) => readiness(branch) === "ready").length;
    const onlineCameras = branches.reduce((sum, branch) => sum + branch.onlineCameras, 0);
    const totalCameras = branches.reduce((sum, branch) => sum + branch.totalCameras, 0);
    const recording = branches.reduce((sum, branch) => sum + branch.recordingCameras, 0);
    return {
      total: branches.length,
      ready,
      offline: branches.filter((branch) => readiness(branch) === "offline").length,
      unprovisioned: branches.filter((branch) => readiness(branch) === "not_enrolled").length,
      tunnelMissing: branches.filter((branch) => readiness(branch) === "tunnel_missing").length,
      cameraCoverage: percent(onlineCameras, totalCameras),
      recordingCoverage: percent(recording, totalCameras),
    };
  }, [branches]);

  return <main className="page-container space-y-6">
    <section className="overflow-hidden rounded-2xl border border-blue-900/20 bg-slate-950 text-white shadow-xl shadow-slate-900/10">
      <div className="grid gap-8 bg-[radial-gradient(circle_at_top_right,rgba(37,99,235,.38),transparent_42%)] px-6 py-7 lg:grid-cols-[1fr_auto] lg:px-8">
        <div className="max-w-3xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-blue-300/20 bg-blue-400/10 px-3 py-1 text-xs font-semibold text-blue-100">
            <ShieldCheck size={14}/> Permission-scoped branch estate
          </div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Branch gateway fleet</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
            One unattended appliance per branch keeps camera discovery, DVR verification, live video and analytics connectivity online—without any staff laptop or inbound firewall port.
          </p>
          <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-300">
            <span className="inline-flex items-center gap-1.5"><Cloud size={14} className="text-blue-300"/> Stable named Cloudflare tunnel</span>
            <span className="inline-flex items-center gap-1.5"><Cpu size={14} className="text-blue-300"/> Automatic restart after power loss</span>
            <span className="inline-flex items-center gap-1.5"><Camera size={14} className="text-blue-300"/> ONVIF and DVR discovery</span>
          </div>
        </div>
        <div className="flex items-start gap-3 lg:flex-col lg:items-end">
          <span className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold ${realtime ? "bg-emerald-400/15 text-emerald-200" : "bg-amber-400/15 text-amber-100"}`}>
            <i className={`h-2 w-2 rounded-full ${realtime ? "bg-emerald-400" : "bg-amber-400"}`}/>
            {realtime ? "Live control channel" : "30-second polling"}
          </span>
          <button onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold hover:bg-white/10 disabled:opacity-50">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""}/> Refresh estate
          </button>
        </div>
      </div>
    </section>

    {error && <div role="alert" className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"><AlertTriangle size={17}/>{error}</div>}

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-label="Gateway fleet summary">
      <Metric icon={MapPin} label="Permitted branches" value={summary.total} detail="Your assigned scope" tone="blue"/>
      <Metric icon={CheckCircle2} label="Live-ready" value={summary.ready} detail={`${percent(summary.ready, summary.total)}% of branches`} tone="green"/>
      <Metric icon={WifiOff} label="Gateway offline" value={summary.offline} detail="Requires central action" tone={summary.offline ? "red" : "green"}/>
      <Metric icon={Cloud} label="Tunnel setup needed" value={summary.tunnelMissing + summary.unprovisioned} detail={`${summary.unprovisioned} not enrolled`} tone={summary.tunnelMissing + summary.unprovisioned ? "amber" : "green"}/>
      <Metric icon={FileVideo2} label="Recording verified" value={`${summary.recordingCoverage}%`} detail={`${summary.cameraCoverage}% cameras online`} tone={summary.recordingCoverage >= 95 ? "green" : "amber"}/>
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 p-5">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Branch readiness</h2>
          <p className="mt-1 text-xs text-slate-500">Critical and incomplete branches are shown first. Results remain limited by your zone, region, area, branch, and camera permissions.</p>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(260px,1fr)_170px_170px_auto]">
          <label className="relative sm:col-span-2 xl:col-span-1">
            <Search size={15} className="absolute left-3 top-2.5 text-slate-400"/>
            <input aria-label="Search gateway branches" className="input w-full pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search branch or code"/>
          </label>
          <select aria-label="Filter gateway readiness" className="input" value={status} onChange={(event) => setStatus(event.target.value as GatewayFilter)}>
            <option value="all">All readiness</option><option value="ready">Live-ready</option><option value="offline">Offline</option><option value="tunnel_missing">Tunnel missing</option><option value="not_enrolled">Not enrolled</option>
          </select>
          <select aria-label="Filter gateway region" className="input" value={region} onChange={(event) => setRegion(event.target.value)}>
            <option value="all">All regions</option>{regions.map((item) => <option key={item}>{item}</option>)}
          </select>
          <Link href="/admin/branch-onboarding" className="btn-primary inline-flex items-center justify-center gap-2"><Cpu size={15}/> Enroll gateway</Link>
        </div>
      </div>

      <div className="hidden grid-cols-[minmax(220px,1.6fr)_130px_130px_150px_130px_46px] gap-3 border-b border-slate-100 bg-slate-50 px-5 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 xl:grid">
        <span>Branch</span><span>Gateway / tunnel</span><span>Cameras</span><span>Recording</span><span>Internet</span><span/>
      </div>
      <div className="divide-y divide-slate-100">
        {visible.map((branch) => <GatewayRow key={branch.id} branch={branch}/>) }
        {!loading && visible.length === 0 && <div className="p-10 text-center"><Cpu className="mx-auto text-slate-300" size={28}/><p className="mt-3 text-sm font-semibold text-slate-700">No branches match these filters</p><p className="mt-1 text-xs text-slate-500">Clear a filter or search another permitted location.</p></div>}
        {loading && branches.length === 0 && <div className="p-10 text-center text-sm text-slate-500"><RefreshCw className="mx-auto mb-3 animate-spin"/>Loading your permitted branch estate…</div>}
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-5 py-3 text-xs text-slate-500">
        <span>Showing {visible.length} of {branches.length} permitted branches</span>
        <span>{lastUpdated ? `Updated ${getTimeAgo(lastUpdated)}` : "Waiting for first fleet check"}</span>
      </footer>
    </section>
  </main>;
}

function GatewayRow({ branch }: { branch: BranchHealth }) {
  const state = readiness(branch);
  const presentation = readinessPresentation(state);
  const cameras = percent(branch.onlineCameras, branch.totalCameras);
  const recordings = percent(branch.recordingCameras, branch.totalCameras);
  const internetTone = branch.internetStatus === "online" ? "text-emerald-700" : branch.internetStatus === "failover" || branch.internetStatus === "degraded" ? "text-amber-700" : "text-red-700";
  return <Link href={`/operations/branches/${branch.id}`} className="grid gap-3 px-5 py-4 transition hover:bg-blue-50/40 xl:grid-cols-[minmax(220px,1.6fr)_130px_130px_150px_130px_46px] xl:items-center">
    <div className="min-w-0">
      <div className="flex items-center gap-2"><span className={`h-2.5 w-2.5 flex-none rounded-full ${presentation.dot}`}/><strong className="truncate text-sm text-slate-900">{branch.name}</strong></div>
      <p className="mt-1 truncate pl-[18px] text-xs text-slate-500">{branch.region} · {branch.code}</p>
    </div>
    <div>
      <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${presentation.badge}`}>{presentation.label}</span>
      <p className="mt-1 text-[10px] text-slate-500">{branch.gatewayOnlineCount ?? 0}/{branch.gatewayCount ?? 0} gateway online</p>
    </div>
    <ProgressFact icon={Camera} label={`${branch.onlineCameras}/${branch.totalCameras} online`} value={cameras}/>
    <ProgressFact icon={FileVideo2} label={`${branch.recordingCameras}/${branch.totalCameras} verified`} value={recordings}/>
    <div className={`flex items-center gap-2 text-xs font-semibold capitalize ${internetTone}`}><Wifi size={15}/>{branch.internetStatus ?? "unknown"}</div>
    <span className="hidden h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-500 xl:grid"><ChevronRight size={16}/></span>
  </Link>;
}

function ProgressFact({ icon: Icon, label, value }: { icon: typeof Camera; label: string; value: number }) {
  const tone = value >= 95 ? "bg-emerald-500" : value >= 75 ? "bg-amber-500" : "bg-red-500";
  return <div><div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700"><Icon size={14}/>{label}</div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className={`h-full ${tone}`} style={{ width: `${value}%` }}/></div></div>;
}

function Metric({ icon: Icon, label, value, detail, tone }: { icon: typeof Activity; label: string; value: number | string; detail: string; tone: "blue" | "green" | "amber" | "red" }) {
  const colors = { blue: "bg-blue-50 text-blue-700", green: "bg-emerald-50 text-emerald-700", amber: "bg-amber-50 text-amber-700", red: "bg-red-50 text-red-700" };
  return <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold text-slate-950">{value}</p></div><span className={`grid h-9 w-9 place-items-center rounded-lg ${colors[tone]}`}><Icon size={18}/></span></div><p className="mt-2 text-[11px] text-slate-500">{detail}</p></article>;
}

function readiness(branch: BranchHealth): Exclude<GatewayFilter, "all"> {
  return branch.gatewayReadiness ?? (branch.edgeAgentStatus === "online" ? "tunnel_missing" : branch.edgeAgentStatus === "offline" ? "offline" : "not_enrolled");
}
function readinessRank(value: Exclude<GatewayFilter, "all">) { return ({ offline: 0, tunnel_missing: 1, not_enrolled: 2, ready: 3 })[value]; }
function readinessPresentation(value: Exclude<GatewayFilter, "all">) {
  if (value === "ready") return { label: "Live-ready", dot: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-700" };
  if (value === "offline") return { label: "Offline", dot: "bg-red-500", badge: "bg-red-50 text-red-700" };
  if (value === "tunnel_missing") return { label: "Tunnel needed", dot: "bg-amber-500", badge: "bg-amber-50 text-amber-700" };
  return { label: "Not enrolled", dot: "bg-slate-400", badge: "bg-slate-100 text-slate-600" };
}
function percent(value: number, total: number) { return total > 0 ? Math.round((value / total) * 100) : 0; }
