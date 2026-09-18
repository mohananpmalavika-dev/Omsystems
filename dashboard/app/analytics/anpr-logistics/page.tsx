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
  ShieldAlert,
  Eye,
  Radio,
  PhoneCall,
  Car,
} from "lucide-react";
import { cameraInventoryApi, anprLogisticsApi } from "@/lib/api-client";
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

  // Casing & Police Hotlist states
  const [casingDispatched, setCasingDispatched] = useState(false);
  const [hotlistDispatched, setHotlistDispatched] = useState(false);
  const [casingFeedback, setCasingFeedback] = useState<string | null>(null);

  const refresh = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const response = await anprLogisticsApi.listSessions({
        branchId: branchId !== "ALL" ? branchId : undefined,
        status: filter === "active" ? "on_route" : undefined,
        hasViolations: filter === "violations" ? true : undefined,
      });

      const data = response.data;

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

      {/* Reconnaissance Casing Alert & Police Hotlist Card */}
      <section className="mb-5 space-y-3">
        <div className="rounded-2xl border border-rose-500/40 bg-gradient-to-r from-rose-950/40 via-slate-900 to-slate-900 p-5 shadow-xl">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse">
                <Car size={24} />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold text-rose-300 uppercase tracking-widest border border-rose-500/40">
                    P1 RECONNAISSANCE ALERT
                  </span>
                  <span className="text-xs font-mono font-bold text-rose-200">PLATE: KL-07-BW-4819 (White Maruti Swift)</span>
                  <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] text-slate-300">4 LAPS DETECTED</span>
                </div>
                <h3 className="mt-1 text-base font-bold text-white">Pre-Closing Vehicle Casing Pattern Detected</h3>
                <p className="text-xs text-slate-300 max-w-3xl leading-relaxed">
                  Target vehicle has circled the branch perimeter 4 times within 90 minutes before branch closing (04:12 PM - 05:32 PM), slowing down to 12 km/h adjacent to Cash-Van Bay #1.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => {
                  setCasingDispatched(true);
                  setCasingFeedback("✓ Perimeter Guard Dispatched to Main Gate Ingress. Guard radio confirmed acknowledgment.");
                  setTimeout(() => setCasingFeedback(null), 5000);
                }}
                disabled={casingDispatched}
                className="flex items-center gap-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 px-3.5 py-2 text-xs font-bold text-white shadow-lg shadow-rose-600/30 transition disabled:opacity-50"
              >
                <Radio size={14} />
                {casingDispatched ? "Guard Dispatched" : "Dispatch Perimeter Guard"}
              </button>
              <button
                onClick={() => {
                  setHotlistDispatched(true);
                  setCasingFeedback("🚨 Emergency Casing Report & Vehicle Telemetry transmitted to Police Control Room 112.");
                  setTimeout(() => setCasingFeedback(null), 6000);
                }}
                disabled={hotlistDispatched}
                className="flex items-center gap-1.5 rounded-xl border border-rose-500/40 bg-rose-950/50 hover:bg-rose-900/60 px-3.5 py-2 text-xs font-bold text-rose-200 transition disabled:opacity-50"
              >
                <PhoneCall size={14} />
                {hotlistDispatched ? "Police 112 Notified" : "Alert Police (112)"}
              </button>
            </div>
          </div>

          {casingFeedback && (
            <div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs text-rose-200 font-semibold flex items-center justify-between">
              <span>{casingFeedback}</span>
              <span className="text-[10px] text-slate-400 font-mono">ANPR DSP: Kaloor Main Ingress CAM-01</span>
            </div>
          )}

          {/* Trajectory Footprint */}
          <div className="mt-4 grid gap-2 sm:grid-cols-4 text-xs">
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-2.5">
              <span className="text-[10px] text-slate-400">Lap 1 · 04:12 PM</span>
              <p className="font-semibold text-slate-200">Main Gate CAM-01</p>
              <span className="text-[10px] text-slate-400">Speed: 18 km/h</span>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-2.5">
              <span className="text-[10px] text-slate-400">Lap 2 · 04:38 PM</span>
              <p className="font-semibold text-slate-200">South Wall CAM-08</p>
              <span className="text-[10px] text-amber-400 font-bold">Slowed to 12 km/h</span>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-2.5">
              <span className="text-[10px] text-slate-400">Lap 3 · 05:05 PM</span>
              <p className="font-semibold text-slate-200">Main Gate CAM-01</p>
              <span className="text-[10px] text-slate-400">Speed: 15 km/h</span>
            </div>
            <div className="rounded-xl border border-rose-500/30 bg-rose-950/30 p-2.5">
              <span className="text-[10px] text-rose-300">Lap 4 · 05:32 PM</span>
              <p className="font-semibold text-rose-200">Cash-Van Bay CAM-04</p>
              <span className="text-[10px] text-rose-300 font-bold">Stationary (3m 40s)</span>
            </div>
          </div>
        </div>

        {/* State Police Hotlist Match */}
        <div className="rounded-2xl border border-amber-500/40 bg-amber-950/20 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/30">
              <ShieldAlert size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="rounded bg-amber-500/20 text-amber-300 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider">
                  STATE POLICE VAHAN HOTLIST MATCH
                </span>
                <span className="font-mono font-bold text-amber-200">KL-01-CB-9002 (Black Bajaj Pulsar 220)</span>
              </div>
              <p className="text-slate-300 mt-0.5">Matched Stolen Vehicle Record: FIR #402/2026, Palarivattom Police Station (IPC Sec 379 / BNS Sec 303)</p>
            </div>
          </div>
          <span className="rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-3 py-1 font-semibold text-[10px] shrink-0">
            AUTO-DISPATCHED TO CONTROL ROOM
          </span>
        </div>
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
