"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  FileCode,
  RefreshCw,
  Server,
  ShieldCheck,
  Camera,
  Network,
  Clock,
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  Radio,
  FileSpreadsheet,
} from "lucide-react";

type EdgeAgent = {
  id: string;
  agentName: string;
  name?: string;
  branchId: string;
  branchName?: string;
  version: string;
  ipAddress: string;
  status: "ONLINE" | "OFFLINE" | "OFFLINE (HEARTBEAT TIMEOUT)" | string;
  calculatedStatus?: string;
  onlineTime?: string | null;
  startedAt?: string | null;
  offlineTime?: string | null;
  lastSeenAt?: string | null;
  totalCameras?: number;
  activeCameras?: number;
  hostname?: string;
};

type ConnectedCamera = {
  cameraId: string;
  cameraName: string;
  channel: number;
  branchName: string;
  edgeAgentId?: string;
  agentName: string;
  cameraIp: string;
  connectedSince: string | null;
  lastSeenAt: string | null;
  status: string;
  liveStatus: string;
  videoLoss?: boolean;
};

export function BranchEdgeProductView() {
  const [agents, setAgents] = useState<EdgeAgent[]>([]);
  const [cameras, setCameras] = useState<ConnectedCamera[]>([]);
  const [summary, setSummary] = useState<{ total: number; online: number; offline: number; cameras: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"fleet" | "connectivity">("connectivity");
  const [expandedAgentId, setExpandedAgentId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/control/v1/reports/edge-connectivity", { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.success) {
        throw new Error(body.message ?? body.error ?? "Edge-agent connectivity inventory unavailable");
      }
      const rawAgents: EdgeAgent[] = body.data.agents || [];
      const rawCameras: ConnectedCamera[] = body.data.cameras || [];
      setAgents(rawAgents);
      setCameras(rawCameras);
      setSummary({
        total: rawAgents.length,
        online: rawAgents.filter((a) => a.calculatedStatus === "ONLINE").length,
        offline: rawAgents.filter((a) => a.calculatedStatus !== "ONLINE").length,
        cameras: rawCameras.length,
      });
    } catch (reason) {
      setSummary(null);
      setError(reason instanceof Error ? reason.message : "Edge fleet unavailable");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 20_000);
    return () => window.clearInterval(timer);
  }, [load]);

  function formatTime(iso: string | null | undefined): string {
    if (!iso) return "—";
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return "—";
      return d.toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      }) + " IST";
    } catch {
      return iso;
    }
  }

  function formatRelative(iso: string | null | undefined): string {
    if (!iso) return "Never";
    try {
      const diffMs = Date.now() - new Date(iso).getTime();
      const diffMin = Math.floor(diffMs / 60000);
      if (diffMin < 1) return "Just now";
      if (diffMin < 60) return `${diffMin}m ago`;
      const diffHrs = Math.floor(diffMin / 60);
      if (diffHrs < 24) return `${diffHrs}h ago`;
      return `${Math.floor(diffHrs / 24)}d ago`;
    } catch {
      return "Unknown";
    }
  }

  return (
    <section className="space-y-6">
      {/* Top Banner linking to dedicated Report page */}
      <div className="rounded-xl border border-cyan-800/50 bg-gradient-to-r from-cyan-950/40 via-slate-900 to-indigo-950/40 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
            <FileSpreadsheet className="h-5 w-5" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-slate-100">
              Audit & Compliance: Edge Agent & Camera Connectivity Report
            </h4>
            <p className="text-xs text-slate-400">
              Download complete CSV spreadsheets, inspect 7-day disconnect root-cause codes, and analyze camera outage history.
            </p>
          </div>
        </div>
        <Link
          href="/reports/edge-connectivity"
          className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white shrink-0 transition-colors shadow-sm"
        >
          Open Connectivity Report
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* Sub-header and Tab switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2 bg-slate-900 p-1 rounded-lg border border-slate-800">
          <button
            type="button"
            onClick={() => setActiveTab("connectivity")}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              activeTab === "connectivity"
                ? "bg-indigo-600 text-white"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Radio className="h-3.5 w-3.5" />
            Live Agent & Camera Connectivity
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("fleet")}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              activeTab === "fleet"
                ? "bg-indigo-600 text-white"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Server className="h-3.5 w-3.5" />
            Fleet Overview & Provisioning
          </button>
        </div>

        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-50 flex items-center gap-1.5"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin text-cyan-400" : ""}`} />
          Refresh Live Telemetry
        </button>
      </div>

      {/* Summary KPI Badges */}
      {summary && (
        <dl className="grid gap-3 grid-cols-2 sm:grid-cols-4">
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5">
            <dt className="text-[11px] uppercase tracking-wide text-slate-500">Total Edge Agents</dt>
            <dd className="mt-1 text-2xl font-bold text-slate-100">{summary.total}</dd>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5">
            <dt className="text-[11px] uppercase tracking-wide text-slate-500">Online Gateways</dt>
            <dd className="mt-1 text-2xl font-bold text-emerald-400">{summary.online}</dd>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5">
            <dt className="text-[11px] uppercase tracking-wide text-slate-500">Offline / Timeout</dt>
            <dd className="mt-1 text-2xl font-bold text-amber-400">{summary.offline}</dd>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5">
            <dt className="text-[11px] uppercase tracking-wide text-slate-500">Connected Cameras</dt>
            <dd className="mt-1 text-2xl font-bold text-cyan-400">{summary.cameras}</dd>
          </div>
        </dl>
      )}

      {error && (
        <div className="rounded-lg border border-rose-800/60 bg-rose-950/30 p-4 text-sm text-rose-200 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* TAB 1: Live Agent & Camera Connectivity */}
      {activeTab === "connectivity" && (
        <div className="space-y-4">
          <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950/70 shadow-lg">
            <div className="border-b border-slate-800 px-4 py-3 text-xs font-semibold text-slate-200 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Network className="h-4 w-4 text-cyan-400" />
                Edge Agent Versions, IP Addresses & Live Connectivity
              </span>
              <span className="text-[11px] text-slate-500">
                Click any agent to inspect its connected camera channels
              </span>
            </div>

            {agents.length === 0 && !loading ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No edge gateways are registered.
              </div>
            ) : (
              <div className="divide-y divide-slate-800/80">
                {agents.map((agent) => {
                  const isOnline = agent.calculatedStatus === "ONLINE";
                  const isTimeout = agent.calculatedStatus?.includes("TIMEOUT");
                  const isExpanded = expandedAgentId === agent.id;
                  const agentCameras = cameras.filter((c) => c.edgeAgentId === agent.id);

                  return (
                    <div key={agent.id} className="transition-colors hover:bg-slate-900/40">
                      <div
                        onClick={() => setExpandedAgentId(isExpanded ? null : agent.id)}
                        className="p-4 grid grid-cols-1 md:grid-cols-6 gap-3 items-center cursor-pointer select-none"
                      >
                        {/* 1. Name & Branch */}
                        <div className="md:col-span-2">
                          <div className="font-semibold text-slate-100 flex items-center gap-2">
                            <span>{agent.agentName || agent.name}</span>
                            {isOnline ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                ONLINE
                              </span>
                            ) : isTimeout ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                TIMEOUT
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold bg-slate-800 text-slate-400">
                                OFFLINE
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            Branch: <strong className="text-slate-300">{agent.branchName}</strong>
                          </div>
                        </div>

                        {/* 2. Version */}
                        <div>
                          <div className="text-[10px] uppercase text-slate-500">Version</div>
                          <span className="font-mono text-xs text-cyan-300 font-medium">
                            v{agent.version}
                          </span>
                        </div>

                        {/* 3. IP Address */}
                        <div>
                          <div className="text-[10px] uppercase text-slate-500">IP Address</div>
                          <span className="font-mono text-xs text-slate-200">
                            {agent.ipAddress}
                          </span>
                        </div>

                        {/* 4. Online / Offline Times */}
                        <div className="text-xs">
                          <div className="text-slate-300">
                            <span className="text-slate-500 text-[10px]">Online: </span>
                            {formatTime(agent.onlineTime || agent.startedAt)}
                          </div>
                          <div className="text-slate-400 text-[11px]">
                            <span className="text-slate-500 text-[10px]">Last Seen: </span>
                            {formatRelative(agent.offlineTime || agent.lastSeenAt)}
                          </div>
                        </div>

                        {/* 5. Cameras & Expand Toggle */}
                        <div className="flex items-center justify-between md:justify-end gap-3">
                          <span className="text-xs text-slate-300 font-medium">
                            {agentCameras.length} Cameras
                          </span>
                          <button
                            type="button"
                            className="p-1 rounded bg-slate-800 text-slate-400 hover:text-slate-200"
                          >
                            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>

                      {/* Expandable Connected Cameras Drawer */}
                      {isExpanded && (
                        <div className="bg-slate-950/90 border-t border-slate-800/80 p-4">
                          <h5 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                            <Camera className="h-3.5 w-3.5 text-emerald-400" />
                            Cameras Connected to {agent.agentName} ({agentCameras.length} channels)
                          </h5>

                          {agentCameras.length === 0 ? (
                            <p className="text-xs text-slate-500 py-2">
                              No cameras currently mapped to this edge gateway.
                            </p>
                          ) : (
                            <div className="overflow-x-auto">
                              <table className="w-full text-left text-xs">
                                <thead className="border-b border-slate-800 text-slate-500 text-[10px] uppercase font-medium">
                                  <tr>
                                    <th className="py-2 px-3">Channel / Name</th>
                                    <th className="py-2 px-3">Target IP</th>
                                    <th className="py-2 px-3">Connect Time (Since)</th>
                                    <th className="py-2 px-3">Last Seen / Disconnect Time</th>
                                    <th className="py-2 px-3 text-center">Status</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800/60">
                                  {agentCameras.map((cam) => (
                                    <tr key={cam.cameraId} className="hover:bg-slate-900/50">
                                      <td className="py-2.5 px-3">
                                        <div className="font-semibold text-slate-200">
                                          CH {cam.channel} - {cam.cameraName}
                                        </div>
                                      </td>
                                      <td className="py-2.5 px-3 font-mono text-slate-400 text-[11px]">
                                        {cam.cameraIp}
                                      </td>
                                      <td className="py-2.5 px-3 text-slate-300">
                                        {formatTime(cam.connectedSince)}
                                      </td>
                                      <td className="py-2.5 px-3 text-slate-400">
                                        {formatTime(cam.lastSeenAt)}
                                      </td>
                                      <td className="py-2.5 px-3 text-center">
                                        {cam.status === "online" || cam.liveStatus === "online" ? (
                                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                                            ● Online
                                          </span>
                                        ) : (
                                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/10 text-rose-300 border border-rose-500/20">
                                            ✕ Disconnected
                                          </span>
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: Fleet Overview & Provisioning (Legacy View) */}
      {activeTab === "fleet" && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-indigo-500/30 bg-gradient-to-br from-slate-900/90 via-indigo-950/20 to-slate-900/90 p-5 shadow-xl">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-emerald-400" />
                  <h3 className="text-base font-semibold text-slate-100">
                    Managed Edge Agent Installation
                  </h3>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                    Windows Installer (v0.1.54)
                  </span>
                </div>
                <p className="text-xs text-slate-300 max-w-2xl">
                  Installers are generated from the branch device manager with a one-time activation. Package: <strong>KryptonVision Edge Agent Installer v0.1.54</strong> (Windows x64). The ZIP includes the executable, branch configuration, and installation launcher.
                </p>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="flex items-start gap-2 text-slate-300">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-800 text-[11px] font-bold text-slate-200">1</span>
                <div><strong className="text-slate-200">Prepare:</strong> Open the branch in Device Manager and create a gateway activation.</div>
              </div>
              <div className="flex items-start gap-2 text-slate-300">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-800 text-[11px] font-bold text-slate-200">2</span>
                <div><strong className="text-slate-200">Download:</strong> Download and extract the branch installer ZIP package.</div>
              </div>
              <div className="flex items-start gap-2 text-slate-300">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-800 text-[11px] font-bold text-slate-200">3</span>
                <div><strong className="text-slate-200">Install:</strong> Run the KryptonVision Edge Agent installer and approve elevation.</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
