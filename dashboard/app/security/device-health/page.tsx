"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Camera,
  Server,
  Wifi,
  Zap,
  HardDrive,
  RefreshCw,
  Building2,
  Shield,
  TrendingDown,
  TrendingUp,
  Clock,
  AlertOctagon,
} from "lucide-react";
import { cameraInventoryApi } from "@/lib/api-client";
import type { Branch } from "@/lib/types";

type DeviceStatus = "healthy" | "warning" | "critical" | "offline" | "unknown";

interface CorrelatedDeviceHealth {
  branchId: string;
  branchName: string;
  cameras: {
    total: number;
    online: number;
    recording: number;
    healthy: number;
    warning: number;
    critical: number;
    offline: number;
  };
  recorders: {
    total: number;
    online: number;
    healthy: number;
    degraded: number;
    full: number;
    offline: number;
  };
  network: {
    status: DeviceStatus;
    latencyMs: number;
    packetLoss: number;
    bandwidth: number;
    issues: string[];
  };
  power: {
    status: DeviceStatus;
    upsOnline: boolean;
    batteryPercent: number;
    powerOutages24h: number;
    issues: string[];
  };
  overallHealth: DeviceStatus;
  criticalIssues: Array<{
    type: "camera" | "recorder" | "network" | "power";
    severity: "critical" | "high" | "medium";
    message: string;
    deviceId?: string;
    timestamp: string;
  }>;
  correlatedEvents: Array<{
    id: string;
    type: "power_camera_correlation" | "network_recorder_correlation" | "storage_recording_correlation";
    message: string;
    affectedDevices: string[];
    timestamp: string;
    resolved: boolean;
  }>;
}

interface DeviceSummary {
  totalBranches: number;
  healthyBranches: number;
  warningBranches: number;
  criticalBranches: number;
  totalCriticalIssues: number;
  totalCorrelatedEvents: number;
  avgCameraHealth: number;
  avgRecorderHealth: number;
}

const emptySummary: DeviceSummary = {
  totalBranches: 0,
  healthyBranches: 0,
  warningBranches: 0,
  criticalBranches: 0,
  totalCriticalIssues: 0,
  totalCorrelatedEvents: 0,
  avgCameraHealth: 0,
  avgRecorderHealth: 0,
};

export default function SecurityDeviceHealthPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState<string>("ALL");
  const [healthData, setHealthData] = useState<CorrelatedDeviceHealth[]>([]);
  const [summary, setSummary] = useState<DeviceSummary>(emptySummary);
  const [selectedBranch, setSelectedBranch] = useState<CorrelatedDeviceHealth>();
  const [filter, setFilter] = useState<"all" | "critical" | "warning">("all");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string }>();

  const refresh = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      // TODO: Replace with real API endpoint
      // const response = await fetch(`/v1/security/device-health?branchId=${branchId !== "ALL" ? branchId : ""}`);
      // const data = await response.json();

      // Mock data for demonstration - replace with real API
      const mockData: CorrelatedDeviceHealth[] = branches.slice(0, 3).map((branch, idx) => ({
        branchId: branch.id,
        branchName: branch.name,
        cameras: {
          total: 12,
          online: idx === 0 ? 11 : 12,
          recording: idx === 0 ? 10 : 12,
          healthy: idx === 0 ? 9 : 11,
          warning: idx === 0 ? 2 : 1,
          critical: idx === 0 ? 1 : 0,
          offline: idx === 0 ? 1 : 0,
        },
        recorders: {
          total: 2,
          online: 2,
          healthy: idx === 0 ? 1 : 2,
          degraded: idx === 0 ? 1 : 0,
          full: 0,
          offline: 0,
        },
        network: {
          status: idx === 0 ? "warning" : "healthy",
          latencyMs: idx === 0 ? 85 : 25,
          packetLoss: idx === 0 ? 2.5 : 0.1,
          bandwidth: 950,
          issues: idx === 0 ? ["High latency detected"] : [],
        },
        power: {
          status: idx === 0 ? "critical" : "healthy",
          upsOnline: true,
          batteryPercent: idx === 0 ? 45 : 92,
          powerOutages24h: idx === 0 ? 1 : 0,
          issues: idx === 0 ? ["UPS battery below 50%"] : [],
        },
        overallHealth: idx === 0 ? "critical" : idx === 1 ? "warning" : "healthy",
        criticalIssues: idx === 0 ? [
          {
            type: "camera",
            severity: "critical",
            message: "Camera CAM-05 offline for 2 hours",
            deviceId: "CAM-05",
            timestamp: new Date(Date.now() - 2 * 3600000).toISOString(),
          },
          {
            type: "power",
            severity: "high",
            message: "UPS battery critically low - 45% remaining",
            timestamp: new Date(Date.now() - 30 * 60000).toISOString(),
          },
        ] : [],
        correlatedEvents: idx === 0 ? [
          {
            id: "corr-1",
            type: "power_camera_correlation",
            message: "Power fluctuation detected 5 minutes before camera offline event",
            affectedDevices: ["UPS-01", "CAM-05"],
            timestamp: new Date(Date.now() - 2.1 * 3600000).toISOString(),
            resolved: false,
          },
        ] : [],
      }));

      const mockSummary: DeviceSummary = {
        totalBranches: mockData.length,
        healthyBranches: mockData.filter(d => d.overallHealth === "healthy").length,
        warningBranches: mockData.filter(d => d.overallHealth === "warning").length,
        criticalBranches: mockData.filter(d => d.overallHealth === "critical").length,
        totalCriticalIssues: mockData.reduce((sum, d) => sum + d.criticalIssues.length, 0),
        totalCorrelatedEvents: mockData.reduce((sum, d) => sum + d.correlatedEvents.length, 0),
        avgCameraHealth: 92,
        avgRecorderHealth: 98,
      };

      setHealthData(mockData);
      setSummary(mockSummary);
      setMessage(undefined);
    } catch (error) {
      if (!quiet) setMessage({ kind: "error", text: error instanceof Error ? error.message : "Failed to load device health data" });
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [branchId, branches]);

  useEffect(() => {
    void cameraInventoryApi.listBranches("analytics:view")
      .then(({ data }) => {
        const next = data as Branch[];
        setBranches(next);
      })
      .catch((error) => setMessage({ kind: "error", text: error instanceof Error ? error.message : "Failed to load branches" }))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (branches.length === 0) return;
    void refresh();
    const timer = window.setInterval(() => void refresh(true), 30_000);
    return () => window.clearInterval(timer);
  }, [branchId, branches, refresh]);

  const visibleData = healthData.filter(data => {
    if (filter === "all") return true;
    if (filter === "critical") return data.overallHealth === "critical";
    if (filter === "warning") return data.overallHealth === "warning";
    return true;
  });

  return (
    <main className="min-h-[calc(100vh-5rem)] bg-slate-950 p-4 text-slate-100 xl:p-6">
      <header className="relative mb-5 overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/90 p-6">
        <div className="absolute -right-16 -top-24 h-64 w-64 rounded-full bg-red-500/10 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-5">
          <div className="flex items-start gap-4">
            <span className="grid h-12 w-12 place-items-center rounded-2xl border border-red-500/25 bg-red-500/10 text-red-300">
              <Shield size={24} />
            </span>
            <div>
              <p className="text-[11px] font-bold tracking-[.22em] text-red-300">DEVICE CORRELATION</p>
              <h1 className="mt-2 text-3xl font-bold">Security Device Health</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
                Correlated health monitoring across cameras, recorders, network, and power systems with root-cause analysis.
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
              className="grid h-10 w-10 place-items-center rounded-xl border border-slate-700 bg-slate-800 hover:border-red-500 disabled:opacity-40"
              aria-label="Refresh device health"
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
        <MetricCard label="Total branches" value={summary.totalBranches} icon={<Building2 />} tone="slate" />
        <MetricCard label="Critical issues" value={summary.totalCriticalIssues} icon={<AlertOctagon />} tone="red" detail={`${summary.criticalBranches} branches`} />
        <MetricCard label="Correlated events" value={summary.totalCorrelatedEvents} icon={<Activity />} tone="amber" />
        <MetricCard label="Avg camera health" value={`${summary.avgCameraHealth}%`} icon={<Camera />} tone="emerald" />
      </section>

      <nav className="mb-5 flex flex-wrap gap-2 rounded-2xl border border-slate-800 bg-slate-900/80 p-2">
        {(["all", "critical", "warning"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold capitalize ${
              filter === f ? "bg-red-600 text-white" : "text-slate-400 hover:bg-slate-800 hover:text-white"
            }`}
          >
            {f}
            <span className={`rounded-full px-2 py-0.5 text-[9px] ${filter === f ? "bg-white/15" : "bg-slate-800"}`}>
              {f === "all" ? healthData.length : healthData.filter(d => d.overallHealth === f).length}
            </span>
          </button>
        ))}
      </nav>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,.65fr)]">
        <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/80">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 p-4">
            <div>
              <p className="text-[10px] font-bold tracking-[.18em] text-red-300">BRANCH HEALTH</p>
              <h2 className="mt-1 font-semibold">Correlated device status</h2>
            </div>
          </header>
          {loading && healthData.length === 0 ? (
            <Empty icon={<RefreshCw className="animate-spin" />} text="Loading device health data…" />
          ) : visibleData.length === 0 ? (
            <Empty icon={<Shield />} text="No branches match this filter." />
          ) : (
            <div className="divide-y divide-slate-800">
              {visibleData.map((data) => (
                <button
                  key={data.branchId}
                  onClick={() => setSelectedBranch(data)}
                  className={`grid w-full gap-3 p-4 text-left transition hover:bg-slate-800/60 sm:grid-cols-[minmax(180px,1fr)_repeat(3,minmax(80px,0.5fr))_auto] ${
                    selectedBranch?.branchId === data.branchId ? "bg-red-500/10" : ""
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="grid h-9 w-9 place-items-center rounded-xl bg-slate-800 text-red-300">
                      <Building2 size={17} />
                    </span>
                    <div>
                      <strong className="block text-sm">{data.branchName}</strong>
                      <span className="text-[10px] text-slate-600">{data.cameras.total} cameras</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Camera size={14} className="text-slate-600" />
                    <span className="text-xs text-slate-300">{data.cameras.online}/{data.cameras.total}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Server size={14} className="text-slate-600" />
                    <span className="text-xs text-slate-300">{data.recorders.online}/{data.recorders.total}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <AlertTriangle size={14} className="text-amber-400" />
                    <span className="text-xs text-slate-300">{data.criticalIssues.length}</span>
                  </div>
                  <HealthBadge status={data.overallHealth} />
                </button>
              ))}
            </div>
          )}
        </section>

        <BranchDetail branch={selectedBranch} />
      </div>
    </main>
  );
}

function BranchDetail({ branch }: { branch?: CorrelatedDeviceHealth }) {
  if (!branch) {
    return (
      <aside className="rounded-2xl border border-slate-800 bg-slate-900/80">
        <Empty icon={<Shield />} text="Select a branch to view device health details." />
      </aside>
    );
  }

  return (
    <aside className="self-start overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/80 xl:sticky xl:top-24">
      <header className="border-b border-slate-800 p-5">
        <p className="text-[10px] font-bold tracking-[.18em] text-red-300">BRANCH DETAIL</p>
        <div className="mt-2 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{branch.branchName}</h2>
          <HealthBadge status={branch.overallHealth} />
        </div>
      </header>
      <div className="space-y-5 p-5">
        <div className="grid grid-cols-2 gap-3">
          <SystemCard icon={<Camera />} label="Cameras" healthy={branch.cameras.healthy} total={branch.cameras.total} tone="blue" />
          <SystemCard icon={<Server />} label="Recorders" healthy={branch.recorders.healthy} total={branch.recorders.total} tone="purple" />
          <SystemCard icon={<Wifi />} label="Network" status={branch.network.status} latency={`${branch.network.latencyMs}ms`} tone="cyan" />
          <SystemCard icon={<Zap />} label="Power" status={branch.power.status} battery={`${branch.power.batteryPercent}%`} tone="amber" />
        </div>

        <div>
          <h3 className="text-xs font-semibold text-slate-300">Critical issues</h3>
          {branch.criticalIssues.length === 0 ? (
            <p className="mt-2 rounded-xl bg-emerald-500/10 p-3 text-xs text-emerald-300">No critical issues detected.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {branch.criticalIssues.map((issue, idx) => (
                <li key={`${issue.type}-${idx}`} className="rounded-xl border border-red-500/20 bg-red-500/10 p-3">
                  <div className="flex items-center justify-between">
                    <strong className="text-xs capitalize text-red-200">{issue.type}</strong>
                    <span className={`text-[9px] font-bold ${issue.severity === "critical" ? "text-red-300" : "text-amber-300"}`}>
                      {issue.severity.toUpperCase()}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] leading-5 text-slate-400">{issue.message}</p>
                  {issue.deviceId && <p className="mt-1 text-[10px] text-slate-600">Device: {issue.deviceId}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h3 className="text-xs font-semibold text-slate-300">Correlated events</h3>
          {branch.correlatedEvents.length === 0 ? (
            <p className="mt-2 rounded-xl bg-slate-800 p-3 text-xs text-slate-400">No correlation detected.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {branch.correlatedEvents.map((event) => (
                <li key={event.id} className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3">
                  <div className="flex items-center justify-between">
                    <strong className="text-xs text-amber-200">Root cause correlation</strong>
                    {event.resolved && <CheckCircle2 size={12} className="text-emerald-400" />}
                  </div>
                  <p className="mt-1 text-[11px] leading-5 text-slate-400">{event.message}</p>
                  <p className="mt-2 text-[10px] text-slate-600">
                    Devices: {event.affectedDevices.join(", ")}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Link
            href={`/operations/cameras?branchId=${branch.branchId}`}
            className="flex items-center justify-center gap-2 rounded-xl border border-slate-700 px-3 py-2 text-xs font-bold text-slate-300 hover:bg-slate-800"
          >
            <Camera size={13} />
            Cameras
          </Link>
          <Link
            href={`/maintenance/health?branchId=${branch.branchId}`}
            className="flex items-center justify-center gap-2 rounded-xl border border-slate-700 px-3 py-2 text-xs font-bold text-slate-300 hover:bg-slate-800"
          >
            <Activity size={13} />
            Health
          </Link>
        </div>
      </div>
    </aside>
  );
}

function SystemCard({ icon, label, healthy, total, status, latency, battery, tone }: { icon: React.ReactNode; label: string; healthy?: number; total?: number; status?: DeviceStatus; latency?: string; battery?: string; tone: string }) {
  const colors: Record<string, string> = {
    blue: "bg-blue-500/10 text-blue-300",
    purple: "bg-purple-500/10 text-purple-300",
    cyan: "bg-cyan-500/10 text-cyan-300",
    amber: "bg-amber-500/10 text-amber-300",
  };
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
      <div className="flex items-center gap-2">
        <span className={`grid h-7 w-7 place-items-center rounded-lg ${colors[tone]}`}>{icon}</span>
        <strong className="text-xs text-slate-300">{label}</strong>
      </div>
      <div className="mt-2 text-sm font-bold text-slate-100">
        {typeof healthy === "number" && typeof total === "number" ? `${healthy}/${total}` : status || "N/A"}
      </div>
      {latency && <p className="text-[10px] text-slate-600">{latency}</p>}
      {battery && <p className="text-[10px] text-slate-600">{battery}</p>}
    </div>
  );
}

function MetricCard({ label, value, icon, tone, detail }: { label: string; value: number | string; icon: React.ReactNode; tone: "slate" | "red" | "amber" | "emerald"; detail?: string }) {
  const colors = {
    slate: "bg-slate-500/10 text-slate-300",
    red: "bg-red-500/10 text-red-300",
    amber: "bg-amber-500/10 text-amber-300",
    emerald: "bg-emerald-500/10 text-emerald-300",
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

function HealthBadge({ status }: { status: DeviceStatus }) {
  const colors: Record<DeviceStatus, string> = {
    healthy: "bg-emerald-500/10 text-emerald-300",
    warning: "bg-amber-500/10 text-amber-300",
    critical: "bg-red-500/10 text-red-300",
    offline: "bg-slate-800 text-slate-400",
    unknown: "bg-slate-800 text-slate-500",
  };
  return (
    <span className={`self-center justify-self-start rounded-full px-2.5 py-1 text-[9px] font-bold ${colors[status]}`}>
      {status.toUpperCase()}
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
