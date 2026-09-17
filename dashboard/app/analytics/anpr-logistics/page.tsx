"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  Truck,
  MapPin,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Calendar,
  Route,
  Package,
  Building2,
  RefreshCw,
  Filter,
  TrendingUp,
  Shield,
  ArrowRight,
} from "lucide-react";
import { cameraInventoryApi } from "@/lib/api-client";
import type { Branch } from "@/lib/types";

type VehicleStatus = "on_route" | "arrived" | "departed" | "overdue" | "unknown";
type RouteCompliance = "compliant" | "delayed" | "route_deviation" | "unauthorized_stop";

interface AnprLogisticsSession {
  id: string;
  vehiclePlate: string;
  vehicleType: "cash_van" | "armored" | "service" | "unknown";
  branchId: string;
  branchName: string;
  status: VehicleStatus;
  routeCompliance: RouteCompliance;
  scheduledArrival: string;
  actualArrival?: string;
  departureTime?: string;
  dwellTimeMinutes?: number;
  detectionPoints: Array<{
    cameraId: string;
    cameraName: string;
    timestamp: string;
    confidence: number;
    location: string;
  }>;
  violations: Array<{
    code: string;
    severity: "critical" | "high" | "medium" | "low";
    message: string;
    timestamp: string;
  }>;
  authorized: boolean;
  provider?: string;
}

interface LogisticsSummary {
  totalVehicles: number;
  onRoute: number;
  arrived: number;
  overdue: number;
  compliantRoutes: number;
  routeDeviations: number;
  unauthorizedStops: number;
  avgDwellTimeMinutes: number;
}

const emptySummary: LogisticsSummary = {
  totalVehicles: 0,
  onRoute: 0,
  arrived: 0,
  overdue: 0,
  compliantRoutes: 0,
  routeDeviations: 0,
  unauthorizedStops: 0,
  avgDwellTimeMinutes: 0,
};

export default function AnprLogisticsPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState<string>("ALL");
  const [sessions, setSessions] = useState<AnprLogisticsSession[]>([]);
  const [summary, setSummary] = useState<LogisticsSummary>(emptySummary);
  const [selectedSession, setSelectedSession] = useState<AnprLogisticsSession>();
  const [filter, setFilter] = useState<"all" | "active" | "violations">("active");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string }>();

  const refresh = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      // Build query parameters
      const params = new URLSearchParams();
      if (branchId !== "ALL") params.set("branchId", branchId);
      if (filter === "active") params.set("status", "on_route");
      else if (filter === "violations") params.set("hasViolations", "true");

      // Fetch sessions from real API
      const response = await fetch(`/v1/logistics/anpr-sessions?${params}`);
      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || "Failed to load logistics data");
      }

      // Set sessions and summary from API response
      setSessions(data.data || []);
      setSummary(data.summary || emptySummary);
      setMessage(undefined);
    } catch (error) {
      if (!quiet) setMessage({ kind: "error", text: error instanceof Error ? error.message : "Failed to load logistics data" });
      // Set empty data on error
      setSessions([]);
      setSummary(emptySummary);
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [branchId, filter]);

  useEffect(() => {
    void cameraInventoryApi.listBranches("analytics:view")
      .then(({ data }) => {
        const next = data as Branch[];
        setBranches(next);
        if (next.length > 0 && branchId === "ALL") setBranchId(next[0].id);
      })
      .catch((error) => setMessage({ kind: "error", text: error instanceof Error ? error.message : "Failed to load branches" }))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!branchId || branchId === "ALL") return;
    void refresh();
    const timer = window.setInterval(() => void refresh(true), 30_000);
    return () => window.clearInterval(timer);
  }, [branchId, refresh]);

  const visibleSessions = useMemo(() => {
    return sessions.filter(session => {
      if (filter === "all") return true;
      if (filter === "violations") return session.violations.length > 0;
      return ["on_route", "overdue"].includes(session.status);
    });
  }, [sessions, filter]);

  return (
    <main className="min-h-[calc(100vh-5rem)] bg-slate-950 p-4 text-slate-100 xl:p-6">
      <header className="relative mb-5 overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/90 p-6">
        <div className="absolute -right-16 -top-24 h-64 w-64 rounded-full bg-purple-500/10 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-5">
          <div className="flex items-start gap-4">
            <span className="grid h-12 w-12 place-items-center rounded-2xl border border-purple-500/25 bg-purple-500/10 text-purple-300">
              <Truck size={24} />
            </span>
            <div>
              <p className="text-[11px] font-bold tracking-[.22em] text-purple-300">ANPR LOGISTICS</p>
              <h1 className="mt-2 text-3xl font-bold">Cash-Van Fleet Tracking</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
                Real-time vehicle tracking, route compliance monitoring, and ANPR-based security verification for cash movements.
              </p>
            </div>
          </div>
          <div className="flex items-end gap-2">
            <label className="text-xs font-semibold text-slate-400">
              Branch scope
              <select
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                className="mt-2 block min-w-56 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100"
              >
                <option value="ALL">All branches</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              onClick={() => void refresh()}
              disabled={loading}
              className="grid h-10 w-10 place-items-center rounded-xl border border-slate-700 bg-slate-800 hover:border-purple-500 disabled:opacity-40"
              aria-label="Refresh logistics data"
            >
              <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
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
        <MetricCard label="Total vehicles" value={summary.totalVehicles} icon={<Truck />} tone="purple" />
        <MetricCard label="On route" value={summary.onRoute} icon={<Route />} tone="blue" />
        <MetricCard label="Overdue" value={summary.overdue} icon={<Clock />} tone="amber" detail={`${summary.routeDeviations} deviations`} />
        <MetricCard label="Violations" value={summary.unauthorizedStops} icon={<XCircle />} tone="red" />
      </section>

      <nav className="mb-5 flex flex-wrap gap-2 rounded-2xl border border-slate-800 bg-slate-900/80 p-2" aria-label="Filter logistics view">
        {(["active", "all", "violations"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold capitalize ${
              filter === f ? "bg-purple-600 text-white" : "text-slate-400 hover:bg-slate-800 hover:text-white"
            }`}
          >
            {f === "active" && <Route size={15} />}
            {f === "all" && <Filter size={15} />}
            {f === "violations" && <AlertTriangle size={15} />}
            {f.replace("_", " ")}
            <span className={`rounded-full px-2 py-0.5 text-[9px] ${filter === f ? "bg-white/15" : "bg-slate-800"}`}>
              {f === "all" ? sessions.length : f === "violations" ? sessions.filter(s => s.violations.length > 0).length : sessions.filter(s => ["on_route", "overdue"].includes(s.status)).length}
            </span>
          </button>
        ))}
      </nav>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,.65fr)]">
        <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/80">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 p-4">
            <div>
              <p className="text-[10px] font-bold tracking-[.18em] text-purple-300">FLEET TRACKING</p>
              <h2 className="mt-1 font-semibold">Active cash-van movements</h2>
            </div>
          </header>
          {loading && sessions.length === 0 ? (
            <Empty icon={<RefreshCw className="animate-spin" />} text="Loading logistics data…" />
          ) : visibleSessions.length === 0 ? (
            <Empty icon={<Truck />} text="No vehicles match this view." />
          ) : (
            <div className="divide-y divide-slate-800">
              {visibleSessions.map((session) => (
                <button
                  key={session.id}
                  onClick={() => setSelectedSession(session)}
                  className={`grid w-full gap-3 p-4 text-left transition hover:bg-slate-800/60 sm:grid-cols-[minmax(150px,.8fr)_minmax(120px,.6fr)_minmax(140px,.7fr)_auto] ${
                    selectedSession?.id === session.id ? "bg-purple-500/10" : ""
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="grid h-9 w-9 place-items-center rounded-xl bg-slate-800 text-purple-300">
                      <Truck size={17} />
                    </span>
                    <div>
                      <strong className="block text-sm">{session.vehiclePlate}</strong>
                      <span className="text-[10px] text-slate-600">{session.provider || "Unknown provider"}</span>
                    </div>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase tracking-wider text-slate-600">Status</span>
                    <StatusBadge status={session.status} />
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase tracking-wider text-slate-600">Branch</span>
                    <strong className="mt-1 block text-xs text-slate-300">{session.branchName}</strong>
                  </div>
                  <ComplianceBadge compliance={session.routeCompliance} />
                </button>
              ))}
            </div>
          )}
        </section>

        <SessionDetail session={selectedSession} />
      </div>
    </main>
  );
}

function SessionDetail({ session }: { session?: AnprLogisticsSession }) {
  if (!session) {
    return (
      <aside className="rounded-2xl border border-slate-800 bg-slate-900/80">
        <Empty icon={<Shield />} text="Select a vehicle to view tracking details." />
      </aside>
    );
  }

  return (
    <aside className="self-start overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/80 xl:sticky xl:top-24">
      <header className="border-b border-slate-800 p-5">
        <p className="text-[10px] font-bold tracking-[.18em] text-purple-300">TRACKING DETAIL</p>
        <div className="mt-2 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{session.vehiclePlate}</h2>
          <StatusBadge status={session.status} />
        </div>
      </header>
      <div className="space-y-5 p-5">
        <dl className="grid grid-cols-2 gap-3 text-xs">
          <DetailItem label="Vehicle type" value={session.vehicleType.replace("_", " ")} />
          <DetailItem label="Authorized" value={session.authorized ? "Yes" : "No"} />
          <DetailItem label="Scheduled" value={formatTime(session.scheduledArrival)} />
          <DetailItem label="Actual" value={session.actualArrival ? formatTime(session.actualArrival) : "Pending"} />
        </dl>

        <div>
          <h3 className="text-xs font-semibold text-slate-300">Detection points</h3>
          {session.detectionPoints.length === 0 ? (
            <p className="mt-2 rounded-xl bg-slate-800 p-3 text-xs text-slate-400">No detections yet.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {session.detectionPoints.map((point, idx) => (
                <li key={`${point.cameraId}-${idx}`} className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                  <div className="flex items-center justify-between">
                    <strong className="text-xs text-slate-200">{point.cameraName}</strong>
                    <span className="text-[10px] text-slate-500">{Math.round(point.confidence * 100)}%</span>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">{point.location}</p>
                  <p className="mt-1 text-[10px] text-slate-600">{formatTime(point.timestamp)}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h3 className="text-xs font-semibold text-slate-300">Violations</h3>
          {session.violations.length === 0 ? (
            <p className="mt-2 rounded-xl bg-emerald-500/10 p-3 text-xs text-emerald-300">No violations recorded.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {session.violations.map((v, idx) => (
                <li key={`${v.code}-${idx}`} className="rounded-xl border border-red-500/20 bg-red-500/10 p-3">
                  <strong className="text-xs text-red-200">{v.code.replace(/_/g, " ")}</strong>
                  <p className="mt-1 text-[11px] leading-5 text-slate-400">{v.message}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <Link
          href={`/analytics/banking?vehicle=${encodeURIComponent(session.vehiclePlate)}`}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-purple-600 px-4 py-2.5 text-xs font-bold hover:bg-purple-500"
        >
          <Package size={15} />
          View banking session
        </Link>
      </div>
    </aside>
  );
}

function MetricCard({ label, value, icon, tone, detail }: { label: string; value: number; icon: React.ReactNode; tone: "purple" | "blue" | "amber" | "red"; detail?: string }) {
  const colors = {
    purple: "bg-purple-500/10 text-purple-300",
    blue: "bg-blue-500/10 text-blue-300",
    amber: "bg-amber-500/10 text-amber-300",
    red: "bg-red-500/10 text-red-300",
  };
  return (
    <article className="flex items-center gap-4 rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
      <span className={`grid h-10 w-10 place-items-center rounded-xl ${colors[tone]}`}>{icon}</span>
      <div>
        <p className="text-2xl font-bold">{value}</p>
        <strong className="block text-xs text-slate-300">{label}</strong>
        {detail && <span className="text-[10px] text-slate-600">{detail}</span>}
      </div>
    </article>
  );
}

function StatusBadge({ status }: { status: VehicleStatus }) {
  const colors: Record<VehicleStatus, string> = {
    on_route: "bg-blue-500/10 text-blue-300",
    arrived: "bg-emerald-500/10 text-emerald-300",
    departed: "bg-slate-800 text-slate-400",
    overdue: "bg-amber-500/10 text-amber-300",
    unknown: "bg-slate-800 text-slate-500",
  };
  return (
    <span className={`mt-1 inline-block rounded-full px-2.5 py-1 text-[9px] font-bold ${colors[status]}`}>
      {status.replace("_", " ").toUpperCase()}
    </span>
  );
}

function ComplianceBadge({ compliance }: { compliance: RouteCompliance }) {
  const colors: Record<RouteCompliance, string> = {
    compliant: "bg-emerald-500/10 text-emerald-300",
    delayed: "bg-amber-500/10 text-amber-300",
    route_deviation: "bg-red-500/10 text-red-300",
    unauthorized_stop: "bg-red-500/10 text-red-300",
  };
  return (
    <span className={`self-center justify-self-start rounded-full px-2.5 py-1 text-[9px] font-bold ${colors[compliance]}`}>
      {compliance.replace("_", " ").toUpperCase()}
    </span>
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

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-950/70 p-2">
      <dt className="text-[9px] uppercase tracking-wider text-slate-600">{label}</dt>
      <dd className="mt-1 break-words font-semibold capitalize text-slate-300">{value}</dd>
    </div>
  );
}

function formatTime(value: string) {
  return new Date(value).toLocaleString(undefined, { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
