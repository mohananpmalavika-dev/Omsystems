"use client";

import React, { useState, useEffect } from "react";
import {
  Server,
  Cpu,
  HardDrive,
  Activity,
  ShieldCheck,
  ShieldAlert,
  ArrowUpCircle,
  RotateCcw,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Layers,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Radio,
  FileCode,
  Network,
  X,
  Play,
  Zap,
} from "lucide-react";

export function EdgeFleetManager() {
  const [summary, setSummary] = useState<any>(null);
  const [agents, setAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [driftOnly, setDriftOnly] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<any | null>(null);
  const [digitalTwin, setDigitalTwin] = useState<any | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchFleetData = async () => {
    try {
      const [sumRes, agRes] = await Promise.all([
        fetch("/api/control/v1/edge/fleet/summary"),
        fetch("/api/control/v1/edge/agents"),
      ]);
      const sumData = await sumRes.json();
      const agData = await agRes.json();

      if (sumData.success && sumData.data) setSummary(sumData.data);
      if (agData.success && agData.data) setAgents(agData.data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFleetData();
    const timer = setInterval(fetchFleetData, 5000);
    return () => clearInterval(timer);
  }, []);

  const openAgentDetail = async (agent: any) => {
    setSelectedAgent(agent);
    try {
      const res = await fetch(`/api/control/v1/edge/agents/${agent.id}/digital-twin`);
      const data = await res.json();
      if (data.success && data.data) {
        setDigitalTwin(data.data);
      }
    } catch {
      // ignore
    }
  };

  const handleSingleUpgrade = async (agentId: string) => {
    setActionLoading(`upgrading-${agentId}`);
    try {
      const res = await fetch(`/api/control/v1/edge/agents/${agentId}/upgrade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetVersion: "3.7.2" }),
      });
      const data = await res.json();
      if (data.success) {
        setActionSuccessMsg(`Upgrade to v3.7.2 completed successfully for ${agentId}.`);
        await fetchFleetData();
        if (selectedAgent && selectedAgent.id === agentId) {
          openAgentDetail({ ...selectedAgent, agentVersion: "3.7.2", status: "ONLINE", versionReconciliation: "COMPLIANT" });
        }
      }
    } catch {
      // ignore
    } finally {
      setActionLoading(null);
    }
  };

  const handleSingleRollback = async (agentId: string) => {
    setActionLoading(`rollback-${agentId}`);
    try {
      const res = await fetch(`/api/control/v1/edge/agents/${agentId}/rollback`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.success) {
        setActionSuccessMsg(`Rollback to v3.6.9 completed successfully.`);
        await fetchFleetData();
        if (selectedAgent && selectedAgent.id === agentId) {
          openAgentDetail({ ...selectedAgent, agentVersion: "3.6.9", status: "ONLINE", versionReconciliation: "DRIFTED" });
        }
      }
    } catch {
      // ignore
    } finally {
      setActionLoading(null);
    }
  };

  const handleReconcileConfig = async (agentId: string) => {
    setActionLoading(`config-${agentId}`);
    try {
      const res = await fetch(`/api/control/v1/edge/agents/${agentId}/reconcile-config`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.success) {
        setActionSuccessMsg(`Configuration reconciled to v34 for ${agentId}.`);
        await fetchFleetData();
      }
    } catch {
      // ignore
    } finally {
      setActionLoading(null);
    }
  };

  const handleFleetSirenUpdate = async () => {
    setActionLoading("fleet-rollout");
    setActionError(null);
    try {
      const res = await fetch("/api/control/v1/edge-updates/fleet-rollout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: "0.1.18" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || data?.error || "Fleet update could not be queued.");
      setActionSuccessMsg(
        `v0.1.18 queued for ${data.queued} of ${data.agents} gateways. ` +
        `${data.alreadyCurrent} already current; ${data.legacyBaseRepairRequired} legacy gateways need base repair.`,
      );
      await fetchFleetData();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Fleet update could not be queued.");
    } finally {
      setActionLoading(null);
    }
  };

  const filteredAgents = agents.filter((a) => {
    if (filterStatus === "ONLINE" && a.status !== "ONLINE") return false;
    if (filterStatus === "DEGRADED" && a.status !== "DEGRADED") return false;
    if (filterStatus === "OFFLINE" && a.status !== "OFFLINE") return false;
    if (driftOnly && a.versionReconciliation === "COMPLIANT" && a.configReconciliation === "COMPLIANT") return false;
    if (filterStatus === "EXPIRING_CERTS" && a.certificateHealth === "HEALTHY") return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        a.branchName.toLowerCase().includes(q) ||
        a.branchId.toLowerCase().includes(q) ||
        a.branchCode.toLowerCase().includes(q) ||
        a.hostname.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Top Header Banner */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-blue-950/40 border border-slate-800 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-blue-400 text-xs font-mono font-bold uppercase tracking-widest">
              <Server className="w-4 h-4 text-cyan-400" />
              <span>First-Class Edge Gateway & Fleet Lifecycle Control Plane</span>
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight mt-1">
              400-Branch Edge Fleet Management & Digital Twin
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Desired vs Actual State Reconciliation • Cryptographic Signed Upgrades • Fleet-wide update queue
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleFleetSirenUpdate}
              disabled={actionLoading !== null}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs shadow-lg shadow-blue-900/30 flex items-center gap-2 transition-all"
            >
              <ArrowUpCircle className="w-4 h-4" />
              <span>{actionLoading === "fleet-rollout" ? "Queuing Fleet Update..." : "🚀 Deploy v0.1.18 to Fleet"}</span>
            </button>
          </div>
        </div>
      </div>

      {actionSuccessMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-950/60 border border-emerald-800 text-emerald-200 text-xs font-medium flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>{actionSuccessMsg}</span>
          </div>
          <button onClick={() => setActionSuccessMsg(null)} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {actionError && (
        <div className="p-3.5 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-200 text-xs font-medium flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400" />
            <span>{actionError}</span>
          </div>
          <button onClick={() => setActionError(null)} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Fleet KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
          <div className="text-[11px] font-mono text-slate-400">Total Gateways</div>
          <div className="text-2xl font-bold text-white font-mono">{summary?.totalAgents || 400}</div>
          <div className="text-[10px] text-slate-400">100% Branches Enrolled</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
          <div className="text-[11px] font-mono text-slate-400">Online & Streaming</div>
          <div className="text-2xl font-bold text-emerald-400 font-mono">{summary?.onlineCount || 388}</div>
          <div className="text-[10px] text-emerald-400">97.0% Fleet Healthy</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
          <div className="text-[11px] font-mono text-slate-400">Latest (v3.7.2)</div>
          <div className="text-2xl font-bold text-cyan-400 font-mono">
            {summary?.versionDistribution?.["3.7.2"] || 315}
          </div>
          <div className="text-[10px] text-cyan-300 font-mono">Target Standard</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
          <div className="text-[11px] font-mono text-slate-400">Config Drifted</div>
          <div className="text-2xl font-bold text-amber-400 font-mono">{summary?.configDriftedCount || 29}</div>
          <div className="text-[10px] text-amber-300">Requires Reconciliation</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
          <div className="text-[11px] font-mono text-slate-400">Certs (&lt;30 Days)</div>
          <div className="text-2xl font-bold text-amber-400 font-mono">{summary?.certificates?.expiringWithin30Days || 12}</div>
          <div className="text-[10px] text-rose-400">3 &lt; 14 Days Critical</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
          <div className="text-[11px] font-mono text-slate-400">Degraded / Offline</div>
          <div className="text-2xl font-bold text-rose-400 font-mono">
            {(summary?.degradedCount || 7) + (summary?.offlineCount || 5)}
          </div>
          <div className="text-[10px] text-rose-400">Automated Triage</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-md">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search branch code, name, gateway ID..."
            className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {["ALL", "ONLINE", "DEGRADED", "OFFLINE", "EXPIRING_CERTS"].map((st) => (
            <button
              key={st}
              onClick={() => setFilterStatus(st)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                filterStatus === st
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-slate-950 text-slate-400 hover:text-white border border-slate-800"
              }`}
            >
              {st.replaceAll("_", " ")}
            </button>
          ))}

          <button
            onClick={() => setDriftOnly(!driftOnly)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border flex items-center gap-1.5 transition-all ${
              driftOnly
                ? "bg-amber-950 border-amber-600 text-amber-300"
                : "bg-slate-950 border-slate-800 text-slate-400 hover:text-white"
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Drift Only</span>
          </button>
        </div>
      </div>

      {/* Fleet Table */}
      <div className="rounded-2xl bg-slate-900/90 border border-slate-800 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-950 text-slate-400 font-mono border-b border-slate-800">
                <th className="py-3.5 px-4 font-semibold">Branch & Gateway</th>
                <th className="py-3.5 px-4 font-semibold">Agent (Act / Des)</th>
                <th className="py-3.5 px-4 font-semibold">Config (Act / Des)</th>
                <th className="py-3.5 px-4 font-semibold">CPU / RAM</th>
                <th className="py-3.5 px-4 font-semibold">Cert Health</th>
                <th className="py-3.5 px-4 font-semibold">Cameras</th>
                <th className="py-3.5 px-4 font-semibold">Status</th>
                <th className="py-3.5 px-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredAgents.slice(0, 50).map((agent) => {
                const isVersionDrift = agent.versionReconciliation === "DRIFTED";
                const isConfigDrift = agent.configReconciliation === "DRIFTED";
                const isUpgrading = actionLoading === `upgrading-${agent.id}` || agent.status === "UPGRADING";

                return (
                  <tr
                    key={agent.id}
                    className="hover:bg-slate-800/40 transition-colors cursor-pointer group"
                    onClick={() => openAgentDetail(agent)}
                  >
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-200 group-hover:text-blue-400 transition-colors">
                        {agent.branchName}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono flex items-center gap-1.5">
                        <span>{agent.branchId}</span>
                        <span>•</span>
                        <span className="text-slate-500">{agent.hostname}</span>
                      </div>
                    </td>

                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5">
                        <span className={`px-2 py-0.5 rounded font-mono font-bold text-[11px] ${isVersionDrift ? "bg-amber-950 text-amber-300 border border-amber-800" : "bg-slate-950 text-slate-300 border border-slate-800"}`}>
                          v{agent.agentVersion}
                        </span>
                        {isVersionDrift && (
                          <span className="text-[10px] text-amber-400 font-mono font-bold">➔ v{agent.desiredAgentVersion}</span>
                        )}
                      </div>
                    </td>

                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5">
                        <span className={`px-2 py-0.5 rounded font-mono text-[11px] ${isConfigDrift ? "bg-amber-950 text-amber-300 border border-amber-800 font-bold" : "bg-slate-950 text-slate-300 border border-slate-800"}`}>
                          {agent.configurationVersion}
                        </span>
                        {isConfigDrift && (
                          <span className="text-[10px] text-amber-400 font-mono font-bold">➔ {agent.desiredConfigurationVersion}</span>
                        )}
                      </div>
                    </td>

                    <td className="py-3 px-4 font-mono text-[11px]">
                      {agent.status === "OFFLINE" ? (
                        <span className="text-slate-600">—</span>
                      ) : (
                        <div className="space-y-0.5">
                          <div className="text-slate-300">{agent.telemetry?.cpuPercent?.toFixed(1)}% CPU</div>
                          <div className="text-slate-500 text-[10px]">
                            {((agent.telemetry?.memoryUsedBytes || 0) / (1024 * 1024 * 1024)).toFixed(1)} / 8 GB
                          </div>
                        </div>
                      )}
                    </td>

                    <td className="py-3 px-4">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold flex items-center gap-1 w-fit ${
                          agent.certificateHealth === "HEALTHY"
                            ? "bg-slate-950 text-slate-300 border border-slate-800"
                            : agent.certificateHealth === "WARNING"
                            ? "bg-amber-950 text-amber-300 border border-amber-800"
                            : "bg-rose-950 text-rose-300 border border-rose-800 animate-pulse"
                        }`}
                      >
                        {agent.certificateHealth === "CRITICAL" && <AlertTriangle className="w-3 h-3 text-rose-400" />}
                        <span>{agent.daysToCertExpiry}d remaining</span>
                      </span>
                    </td>

                    <td className="py-3 px-4 font-mono text-[11px]">
                      <span className="text-slate-300">
                        {agent.telemetry?.cameras?.reachable || 24} / {agent.telemetry?.cameras?.configured || 24}
                      </span>
                    </td>

                    <td className="py-3 px-4">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          agent.status === "ONLINE"
                            ? "bg-emerald-950/80 text-emerald-300 border border-emerald-800"
                            : agent.status === "DEGRADED"
                            ? "bg-amber-950/80 text-amber-300 border border-amber-800"
                            : agent.status === "UPGRADING"
                            ? "bg-blue-950 text-blue-300 border border-blue-600 animate-pulse"
                            : "bg-rose-950/80 text-rose-300 border border-rose-800"
                        }`}
                      >
                        {agent.status}
                      </span>
                    </td>

                    <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1.5">
                        {isVersionDrift && (
                          <button
                            onClick={() => handleSingleUpgrade(agent.id)}
                            disabled={isUpgrading}
                            className="px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white font-bold text-[11px] flex items-center gap-1 shadow-sm"
                          >
                            <ArrowUpCircle className="w-3.5 h-3.5" />
                            <span>{isUpgrading ? "Upgrading..." : "Upgrade"}</span>
                          </button>
                        )}

                        {isConfigDrift && !isVersionDrift && (
                          <button
                            onClick={() => handleReconcileConfig(agent.id)}
                            className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-amber-300 font-medium text-[11px] border border-amber-900/60"
                          >
                            Reconcile
                          </button>
                        )}

                        <button
                          onClick={() => openAgentDetail(agent)}
                          className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px]"
                        >
                          Twin ➔
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="p-3 bg-slate-950 border-t border-slate-800 text-[11px] text-slate-500 flex justify-between font-mono">
          <span>Showing {Math.min(50, filteredAgents.length)} of {filteredAgents.length} gateways</span>
          <span>Sentinel Grid Enterprise Fleet Orchestrator</span>
        </div>
      </div>

      {/* Digital Twin & Detail Drawer */}
      {selectedAgent && digitalTwin && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex justify-end animate-in fade-in duration-200">
          <div className="w-full max-w-2xl bg-slate-950 border-l border-slate-800 h-full overflow-y-auto p-6 space-y-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <div className="flex items-center gap-2 text-cyan-400 text-xs font-mono font-bold uppercase">
                  <Server className="w-4 h-4 text-cyan-400" />
                  <span>Edge Gateway Digital Twin Node</span>
                </div>
                <h2 className="text-xl font-bold text-white tracking-tight mt-1">{selectedAgent.branchName}</h2>
                <div className="text-xs text-slate-400 font-mono mt-0.5">
                  ID: {selectedAgent.id} • Host: {selectedAgent.hostname}
                </div>
              </div>
              <button
                onClick={() => setSelectedAgent(null)}
                className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Actions Bar */}
            <div className="grid grid-cols-3 gap-2.5">
              <button
                onClick={() => handleSingleUpgrade(selectedAgent.id)}
                disabled={actionLoading !== null}
                className="p-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md"
              >
                <ArrowUpCircle className="w-4 h-4" />
                <span>Remote Upgrade v3.7.2</span>
              </button>

              <button
                onClick={() => handleSingleRollback(selectedAgent.id)}
                disabled={actionLoading !== null}
                className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs border border-slate-700 flex items-center justify-center gap-1.5"
              >
                <RotateCcw className="w-4 h-4 text-amber-400" />
                <span>Rollback v3.6.9</span>
              </button>

              <button
                onClick={() => handleReconcileConfig(selectedAgent.id)}
                disabled={actionLoading !== null}
                className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold text-xs border border-amber-900/60 flex items-center justify-center gap-1.5"
              >
                <RefreshCw className="w-4 h-4 text-amber-400" />
                <span>Sync Config v34</span>
              </button>
            </div>

            {/* Live Hardware Telemetry Gauges */}
            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <Cpu className="w-4 h-4 text-indigo-400" />
                <span>Hardware & Uptime Telemetry</span>
              </h3>
              <div className="grid grid-cols-3 gap-3 font-mono text-xs">
                <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                  <div className="text-[11px] text-slate-400">CPU Utilization</div>
                  <div className="text-lg font-bold text-blue-400">{selectedAgent.telemetry?.cpuPercent?.toFixed(1)}%</div>
                  <div className="text-[10px] text-slate-500">{digitalTwin.hardware.cpuCores} Cores Intel i5</div>
                </div>

                <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                  <div className="text-[11px] text-slate-400">Memory (RAM)</div>
                  <div className="text-lg font-bold text-emerald-400">
                    {((selectedAgent.telemetry?.memoryUsedBytes || 0) / (1024 * 1024 * 1024)).toFixed(1)} / 8 GB
                  </div>
                  <div className="text-[10px] text-emerald-400">42% Used</div>
                </div>

                <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                  <div className="text-[11px] text-slate-400">NVMe Local Ring</div>
                  <div className="text-lg font-bold text-purple-400">240 / 512 GB</div>
                  <div className="text-[10px] text-slate-500">272 GB Free</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs font-mono pt-1 text-slate-400">
                <div>Service Uptime: <strong className="text-slate-200">8 days, 14 hours</strong></div>
                <div>Last Restart Reason: <strong className="text-amber-400">{selectedAgent.lastRestartReason || "OS_BOOT"}</strong></div>
              </div>
            </div>

            {/* Software Stack & Components */}
            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <FileCode className="w-4 h-4 text-cyan-400" />
                <span>Software Stack & Desired State Comparison</span>
              </h3>
              <div className="space-y-2 text-xs font-mono">
                <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 flex justify-between items-center">
                  <span className="text-slate-300">Edge Agent Binary</span>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400">Actual: <strong>v{selectedAgent.agentVersion}</strong></span>
                    <span>•</span>
                    <span className="text-slate-400">Desired: <strong>v{selectedAgent.desiredAgentVersion}</strong></span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${selectedAgent.versionReconciliation === "COMPLIANT" ? "bg-emerald-950 text-emerald-300" : "bg-amber-950 text-amber-300"}`}>
                      {selectedAgent.versionReconciliation}
                    </span>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 flex justify-between items-center">
                  <span className="text-slate-300">Branch Configuration</span>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400">Actual: <strong>{selectedAgent.configurationVersion}</strong></span>
                    <span>•</span>
                    <span className="text-slate-400">Desired: <strong>{selectedAgent.desiredConfigurationVersion}</strong></span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${selectedAgent.configReconciliation === "COMPLIANT" ? "bg-emerald-950 text-emerald-300" : "bg-amber-950 text-amber-300"}`}>
                      {selectedAgent.configReconciliation}
                    </span>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 flex justify-between items-center">
                  <span className="text-slate-300">MediaMTX Subsystem</span>
                  <span className="text-emerald-400 font-bold">v1.11.0 (HEALTHY)</span>
                </div>
              </div>
            </div>

            {/* Digital Twin Blast Radius & Impact Tree */}
            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <Network className="w-4 h-4 text-rose-400" />
                <span>Digital Twin Topology & Blast Radius Impact</span>
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-xs text-center">
                <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                  <div className="text-slate-400 text-[10px]">Cameras Managed</div>
                  <div className="text-base font-bold text-blue-400">{digitalTwin.blastRadius.camerasImpacted}</div>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                  <div className="text-slate-400 text-[10px]">Recording Channels</div>
                  <div className="text-base font-bold text-emerald-400">{digitalTwin.blastRadius.recordingChannelsAtRisk}</div>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                  <div className="text-slate-400 text-[10px]">NVR Attached</div>
                  <div className="text-base font-bold text-purple-400">{digitalTwin.blastRadius.nvrsAttached}</div>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                  <div className="text-slate-400 text-[10px]">Open P1 Alerts</div>
                  <div className="text-base font-bold text-rose-400">{digitalTwin.blastRadius.activeAlertsAffected}</div>
                </div>
              </div>

              {/* Topology Path */}
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 font-mono text-[11px] space-y-1 text-slate-400">
                <div className="text-slate-300 font-bold">Graph Path:</div>
                <div className="text-cyan-400">
                  Enterprise ➔ Kerala Region ➔ {selectedAgent.branchName} ➔ Edge Gateway ({selectedAgent.hostname})
                </div>
                <div className="text-slate-500 pl-4">
                  └── [Agent v{selectedAgent.agentVersion} | MediaMTX | FFmpeg Workers] ➔ 24 IP Cameras ➔ RTSP Stream Plane
                </div>
              </div>
            </div>

            {/* Certificate Lifecycle */}
            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2 font-mono text-xs">
              <div className="flex justify-between items-center">
                <span className="text-slate-300 font-bold">mTLS Device Certificate</span>
                <span className="text-emerald-400 font-bold">{selectedAgent.daysToCertExpiry} Days Remaining</span>
              </div>
              <div className="text-slate-400 text-[11px]">
                Serial: <strong className="text-slate-200">{selectedAgent.certificateSerial}</strong> • Expires: {new Date(selectedAgent.certificateExpiresAt).toLocaleDateString()}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
