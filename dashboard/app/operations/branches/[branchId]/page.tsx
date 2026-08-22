"use client";

import React, { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  Building2,
  Camera,
  Server,
  Database,
  Wifi,
  AlertTriangle,
  Siren,
  ArrowLeft,
  RefreshCw,
  Layers,
  Activity,
  Play,
  FileCheck2,
  HardDrive,
  ShieldCheck,
  Wrench,
  Clock,
} from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";

export default function BranchWorkspacePage() {
  const params = useParams();
  const branchId = typeof params?.branchId === "string" ? params.branchId : "";

  const [workspace, setWorkspace] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");
  const [error, setError] = useState<string | null>(null);

  const loadWorkspace = async () => {
    setLoading(true);
    setError(null);
    try {
      if (!branchId) throw new Error("Branch identifier is missing");
      const res = await fetch(`/api/v1/operations/branches/${encodeURIComponent(branchId)}/workspace`, { cache: "no-store" });
      if (!res.ok) throw new Error(`Branch workspace request failed (${res.status})`);
      const data = await res.json();
      if (!data.success || !data.data) throw new Error("No authoritative branch workspace was returned");
      setWorkspace(data.data);
    } catch (err) {
      setWorkspace(null);
      setError(err instanceof Error ? err.message : "Branch workspace is unavailable");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWorkspace();
  }, [branchId]);

  const branch = workspace?.branch;

  if (loading) {
    return <div className="p-8 text-sm text-slate-400">Loading live branch telemetry…</div>;
  }

  if (!workspace) {
    return (
      <div className="p-8 text-center text-sm text-slate-400">
        <p className="font-semibold text-red-300">Live branch data is unavailable.</p>
        <p className="mt-2 text-xs">{error}</p>
        <button onClick={loadWorkspace} className="mt-4 rounded border border-slate-700 px-3 py-2 text-xs hover:bg-slate-800">Retry</button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Navigation Breadcrumb & Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl font-bold text-white">{branch?.name || "Branch Workspace"}</h1>
                <span className="text-xs font-mono text-slate-400">{branch?.branchCode}</span>
                {branch?.operationalState && <StatusBadge status={branch.operationalState} size="sm" />}
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                {branch?.region ?? "Unassigned"} • {branch?.cameras?.working ?? 0}/{branch?.cameras?.total ?? 0} observed online • WAN: {branch?.internet?.mode ?? "Unknown"}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={loadWorkspace}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-xs font-medium hover:bg-slate-700 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              <span>Refresh</span>
            </button>
            <Link
              href={`/control-room?branchId=${branchId}`}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium shadow-sm transition-colors"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Live Wall</span>
            </Link>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 border-b border-slate-800 overflow-x-auto pb-px">
          {[
            { id: "overview", label: "Overview", icon: Layers },
            { id: "cameras", label: `Cameras (${workspace?.cameras?.length ?? 0})`, icon: Camera },
            { id: "recorders", label: "Recorders (NVR)", icon: Server },
            { id: "storage", label: "Storage & Retention", icon: Database },
            { id: "network", label: "Network & WAN", icon: Wifi },
            { id: "alerts", label: "Alerts & Incidents", icon: AlertTriangle },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 whitespace-nowrap transition-colors ${
                  isActive
                    ? "border-blue-500 text-blue-400 bg-slate-900/40"
                    : "border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab 1: Overview */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-1.5">
                <span className="text-xs text-slate-400 font-medium">Camera Streams</span>
                <div className="text-xl font-bold text-white">
                  {branch?.cameras?.healthy}/{branch?.cameras?.total} Online
                </div>
                <div className="text-xs text-slate-400">
                  {branch?.cameras?.notRecording > 0 ? (
                    <span className="text-rose-400 font-medium">{branch?.cameras?.notRecording} channels not recording</span>
                  ) : (
                    <span className="text-emerald-400 font-medium">All observed channels recording</span>
                  )}
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-1.5">
                <span className="text-xs text-slate-400 font-medium">Retention Compliance</span>
                <div className="text-xl font-bold text-white">
                  {branch?.retention?.observedDays ?? "Unknown"} / {branch?.retention?.requiredDays ?? "Unknown"} Days
                </div>
                <div className="text-xs">
                  {branch?.retention?.compliant ? (
                    <span className="text-emerald-400 font-medium">Compliant with configured policy</span>
                  ) : (
                    <span className="text-rose-400 font-medium">Regulatory Violation</span>
                  )}
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-1.5">
                <span className="text-xs text-slate-400 font-medium">Storage & SMART</span>
                <div className="text-xl font-bold text-white">
                  {branch?.storage?.diskCount} Disks ({branch?.storage?.state})
                </div>
                <div className="text-xs text-slate-400">
                  Min Free: {branch?.storage?.minFreePercent !== undefined ? `${branch.storage.minFreePercent}%` : "Not reported"}
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-1.5">
                <span className="text-xs text-slate-400 font-medium">WAN Connectivity</span>
                <div className="text-xl font-bold text-white">
                  {branch?.internet?.mode ?? "Unknown"} {branch?.internet?.latencyMs !== undefined ? `(${branch.internet.latencyMs}ms)` : ""}
                </div>
                <div className="text-xs text-emerald-400 font-medium">
                  {workspace?.network?.vpnConnected === true ? "VPN connected" : workspace?.network?.vpnConnected === false ? "VPN disconnected" : "VPN status unavailable"}
                </div>
              </div>
            </div>

            {/* Quick Live Preview Grid */}
            <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">Channel Streaming Matrix ({workspace?.cameras?.length ?? 0} Cameras)</h3>
                <span className="text-xs text-slate-400">Local Stream Pull on Demand</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
                {workspace?.cameras?.map((cam: any) => (
                  <div
                    key={cam.cameraId}
                    className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800/80 flex flex-col justify-between h-24"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-200">CH-{cam.channelNumber}</span>
                      <StatusBadge status={cam.operationalState} size="sm" showIcon={false} />
                    </div>
                    <div className="text-[10px] text-slate-400 truncate">{cam.zone}</div>
                    <div className="text-[10px] text-slate-500 flex justify-between">
                      <span>{cam.fps !== undefined ? `${cam.fps} FPS` : "FPS unknown"}</span>
                      <span className={cam.isRecording ? "text-emerald-400" : "text-rose-400"}>
                        {cam.isRecording ? "REC" : "NO REC"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Cameras */}
        {activeTab === "cameras" && (
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3">Channel / Name</th>
                  <th className="px-4 py-3">Zone</th>
                  <th className="px-4 py-3">Health State</th>
                  <th className="px-4 py-3">Streaming</th>
                  <th className="px-4 py-3">Recording Active</th>
                  <th className="px-4 py-3">Profile (FPS / Bitrate)</th>
                  <th className="px-4 py-3">Last Recorded</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {workspace?.cameras?.map((cam: any) => (
                  <tr key={cam.cameraId} className="hover:bg-slate-800/40">
                    <td className="px-4 py-3 font-semibold text-slate-200">{cam.name}</td>
                    <td className="px-4 py-3 text-slate-400">{cam.zone}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={cam.operationalState} size="sm" />
                    </td>
                    <td className="px-4 py-3 text-slate-400">{cam.isStreaming ? "Observed available" : "Unavailable"}</td>
                    <td className="px-4 py-3">
                      {cam.isRecording ? (
                        <span className="text-emerald-400 font-medium">Recording</span>
                      ) : (
                        <span className="text-rose-400 font-medium">Stopped</span>
                      )}
                    </td>
                    <td className="px-4 py-3">{cam.fps !== undefined ? `${cam.fps} FPS` : "Not reported"}{cam.bitrateKbps !== undefined ? ` • ${cam.bitrateKbps} Kbps` : ""}</td>
                    <td className="px-4 py-3 text-slate-400">{cam.lastRecordedAt ? new Date(cam.lastRecordedAt).toLocaleTimeString() : "Unavailable"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab 3: Recorders */}
        {activeTab === "recorders" && (
          <div className="space-y-4">
            {workspace?.recorders?.map((rec: any) => (
              <div key={rec.recorderId} className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Server className="w-5 h-5 text-purple-400" />
                    <div>
                      <h3 className="text-sm font-bold text-white">{rec.model ?? rec.recorderId}</h3>
                      <div className="text-xs text-slate-400 font-mono">{rec.ipAddress ? `IP: ${rec.ipAddress} • ` : ""}ID: {rec.recorderId}</div>
                    </div>
                  </div>
                  <StatusBadge status={rec.status} size="md" />
                </div>
                <div className="grid grid-cols-3 gap-4 pt-3 border-t border-slate-800 text-xs">
                  <div>
                    <span className="text-slate-400">Channel Capacity</span>
                    <div className="font-semibold text-slate-200 mt-0.5">{rec.channelsRecording} / {rec.channelsTotal} Active</div>
                  </div>
                  <div>
                    <span className="text-slate-400">NTP Clock Drift</span>
                    <div className="font-semibold text-slate-200 mt-0.5">{rec.clockOffsetSeconds !== undefined ? `${rec.clockOffsetSeconds}s` : "Not reported"}</div>
                  </div>
                  <div>
                    <span className="text-slate-400">Driver Protocol</span>
                    <div className="font-semibold text-slate-200 mt-0.5">Reported by edge telemetry</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tab 4: Storage & Retention */}
        {activeTab === "storage" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {workspace?.disks?.map((disk: any) => (
                <div key={disk.diskId} className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <HardDrive className="w-5 h-5 text-amber-400" />
                      <div>
                        <h4 className="text-sm font-bold text-white">{disk.slot !== undefined ? `SATA Slot ${disk.slot}` : "Disk"}{disk.capacityTb !== undefined ? ` (${disk.capacityTb} TB)` : ""}</h4>
                        <div className="text-xs text-slate-400">Disk ID: {disk.diskId}</div>
                      </div>
                    </div>
                    <StatusBadge status={disk.smartStatus} size="sm" />
                  </div>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between text-slate-400">
                      <span>Available Free Space</span>
                      <span className="font-semibold text-slate-200">{disk.freePercent !== undefined ? `${disk.freePercent}% Free` : "Not reported"}</span>
                    </div>
                    <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${disk.freePercent !== undefined && disk.freePercent < 10 ? 'bg-rose-500' : 'bg-blue-500'}`}
                        style={{ width: disk.freePercent !== undefined ? `${100 - disk.freePercent}%` : "0%" }}
                      />
                    </div>
                  </div>
                  <div className="text-xs text-slate-400 pt-2 border-t border-slate-800">
                    Verified Footage Retention: <strong className="text-slate-200">{disk.retentionDays !== undefined ? `${disk.retentionDays} Days` : "Not reported"}</strong>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 5: Network */}
        {activeTab === "network" && (
          <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4 text-xs">
            <div className="flex items-center gap-3">
              <Wifi className="w-5 h-5 text-blue-400" />
              <div>
                <h3 className="text-sm font-bold text-white">Branch WAN Telemetry</h3>
                <div className="text-slate-400">Active Path: {workspace?.network?.currentMode}</div>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-3 border-t border-slate-800">
              <div>
                <span className="text-slate-400">Primary ISP</span>
                <div className="font-semibold text-slate-200 mt-1">{workspace?.network?.primaryIsp}</div>
              </div>
              <div>
                <span className="text-slate-400">Backup Failover</span>
                <div className="font-semibold text-slate-200 mt-1">{workspace?.network?.backupIsp}</div>
              </div>
              <div>
                <span className="text-slate-400">Latency & Packet Loss</span>
                <div className="font-semibold text-emerald-400 mt-1">
                  {workspace?.network?.latencyMs}ms Latency • {workspace?.network?.packetLossPct}% Loss
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 6: Alerts & Incidents */}
        {activeTab === "alerts" && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-rose-950/20 border border-rose-900/40 space-y-2">
              <h3 className="text-sm font-bold text-rose-300">Active Branch Alarms ({workspace?.activeAlerts?.length || 0})</h3>
              <div className="divide-y divide-rose-900/30">
                {workspace?.activeAlerts?.map((alt: any) => (
                  <div key={alt.id} className="py-2.5 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-semibold text-rose-200">{alt.title}</div>
                      <div className="text-rose-400/80">Detected: {new Date(alt.detectedAt).toLocaleTimeString()}</div>
                    </div>
                    <StatusBadge status={alt.severity} size="sm" />
                  </div>
                ))}
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
              <h3 className="text-sm font-bold text-white">Active Root-Cause Incidents ({workspace?.activeIncidents?.length || 0})</h3>
              <div className="divide-y divide-slate-800">
                {workspace?.activeIncidents?.map((inc: any) => (
                  <div key={inc.id} className="py-2.5 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-semibold text-slate-200">{inc.title}</div>
                      <div className="text-slate-400">Started: {new Date(inc.startedAt).toLocaleTimeString()}</div>
                    </div>
                    <StatusBadge status={inc.severity} size="sm" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
  );
}
