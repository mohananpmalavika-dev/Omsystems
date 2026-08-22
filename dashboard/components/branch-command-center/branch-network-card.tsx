"use client";

import React, { useState, useEffect } from "react";
import {
  Globe,
  Radio,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight,
  TrendingDown,
  RefreshCw,
  Zap,
} from "lucide-react";
import type { BranchConnectivityHealth } from "../../../backend/src/connectivity/domain/connectivity.types";

interface BranchNetworkCardProps {
  branchId: string;
}

export function BranchNetworkCard({ branchId }: BranchNetworkCardProps) {
  const [data, setData] = useState<BranchConnectivityHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchConnectivity = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/v1/branches/${encodeURIComponent(branchId)}/connectivity`);
      if (!res.ok) throw new Error(`Connectivity request failed (${res.status})`);
      const json = await res.json();
      setData(json);
    } catch (reason) {
      setData(null);
      setError(reason instanceof Error ? reason.message : "Connectivity telemetry unavailable");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchConnectivity();
    const timer = setInterval(fetchConnectivity, 15000);
    return () => clearInterval(timer);
  }, [branchId]);

  if (!data && loading) {
    return (
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 text-slate-400 flex items-center gap-2">
        <RefreshCw className="w-4 h-4 animate-spin" />
        <span>Loading WAN connectivity telemetry...</span>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 text-slate-400">
        <div className="flex items-center gap-2 text-amber-300"><AlertTriangle className="w-4 h-4" />WAN telemetry unavailable</div>
        {error && <p className="mt-2 text-xs text-slate-500">{error}</p>}
      </div>
    );
  }

  const stateColors: Record<string, string> = {
    ONLINE: "bg-emerald-950 text-emerald-300 border-emerald-700",
    DEGRADED: "bg-amber-950 text-amber-300 border-amber-700",
    FAILOVER: "bg-orange-950 text-orange-300 border-orange-700",
    OFFLINE: "bg-red-950 text-red-300 border-red-700",
    UNKNOWN: "bg-slate-800 text-slate-400 border-slate-700",
  };

  const stateBg = data ? stateColors[data.state] ?? stateColors.UNKNOWN : stateColors.UNKNOWN;

  return (
    <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-4 text-slate-100">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-sky-950 text-sky-400 border border-sky-800">
            <Globe className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-100">WAN Network & Multi-ISP Health</h3>
              <span className={`px-2 py-0.5 text-xs font-bold rounded border ${stateBg}`}>
                {data?.state}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Path-aware dual-ISP monitoring & WireGuard VPN tunnel telemetry
            </p>
          </div>
        </div>

        <button
          onClick={() => void fetchConnectivity()}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
          title="Refresh Network Status"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Path Failover Alert Banner */}
            {data.state === "FAILOVER" && (
        <div className="p-3 bg-orange-950/70 border border-orange-800 rounded-xl flex items-center justify-between text-xs text-orange-200">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-orange-400 shrink-0" />
            <span>
              <strong>Primary ISP Down:</strong> Branch traffic running on <strong>Backup LTE</strong>. CCTV active, but redundancy lost!
            </span>
          </div>
          <span className="px-2 py-0.5 font-bold bg-orange-900 text-orange-200 rounded">
            WAN Path: BACKUP
          </span>
        </div>
      )}

      {/* ISPs and VPN Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Primary ISP */}
        <div className="p-3.5 bg-slate-950/60 border border-slate-800 rounded-xl space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold text-slate-300">PRIMARY ISP</div>
            <span
              className={`px-1.5 py-0.5 text-[10px] font-bold rounded ${
                data?.primary.state === "ONLINE"
                  ? "bg-emerald-950 text-emerald-300 border border-emerald-700"
                  : "bg-red-950 text-red-300 border border-red-700"
              }`}
            >
              {data?.primary.state}
            </span>
          </div>

          <div className="text-xs font-bold text-slate-100">
            {data.primary.providerName ?? "Not reported"}
          </div>

          <div className="space-y-1 text-[11px] text-slate-400 font-mono">
            <div className="flex justify-between">
              <span>Latency:</span>
              <span className="text-slate-200">{data?.primary.latencyMs ? `${data.primary.latencyMs} ms` : "--"}</span>
            </div>
            <div className="flex justify-between">
              <span>Packet Loss:</span>
              <span className={data?.primary.packetLossPct && data.primary.packetLossPct > 5 ? "text-red-400 font-bold" : "text-slate-200"}>
                {data?.primary.packetLossPct !== undefined ? `${data.primary.packetLossPct}%` : "--"}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Public IP:</span>
              <span className="text-sky-400">{data?.primary.publicIp ?? "None"}</span>
            </div>
          </div>
        </div>

        {/* Backup ISP */}
        <div className="p-3.5 bg-slate-950/60 border border-slate-800 rounded-xl space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold text-slate-300">BACKUP ISP</div>
            <span
              className={`px-1.5 py-0.5 text-[10px] font-bold rounded ${
                data?.backup?.state === "ONLINE"
                  ? "bg-emerald-950 text-emerald-300 border border-emerald-700"
                  : data?.backup
                  ? "bg-red-950 text-red-300 border border-red-700"
                  : "bg-slate-800 text-slate-400"
              }`}
            >
              {data?.backup?.state ?? "NOT CONFIGURED"}
            </span>
          </div>

          <div className="text-xs font-bold text-slate-100">
            {data.backup?.providerName ?? "Not reported"}
          </div>

          <div className="space-y-1 text-[11px] text-slate-400 font-mono">
            <div className="flex justify-between">
              <span>Latency:</span>
              <span className="text-slate-200">{data?.backup?.latencyMs ? `${data.backup.latencyMs} ms` : "--"}</span>
            </div>
            <div className="flex justify-between">
              <span>Packet Loss:</span>
              <span className="text-slate-200">
                {data?.backup?.packetLossPct !== undefined ? `${data.backup.packetLossPct}%` : "--"}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Public IP:</span>
              <span className="text-sky-400">{data?.backup?.publicIp ?? "None"}</span>
            </div>
          </div>
        </div>

        {/* VPN Tunnel */}
        <div className="p-3.5 bg-slate-950/60 border border-slate-800 rounded-xl space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold text-slate-300">VPN TUNNEL</div>
            <span
              className={`px-1.5 py-0.5 text-[10px] font-bold rounded ${
                data?.vpn?.state === "CONNECTED"
                  ? "bg-emerald-950 text-emerald-300 border border-emerald-700"
                  : "bg-red-950 text-red-300 border border-red-700"
              }`}
            >
              {data?.vpn?.state ?? "DISCONNECTED"}
            </span>
          </div>

          <div className="text-xs font-bold text-slate-100">
            {data.vpn ? `${data.vpn.source} (${data.vpn.tunnelInterface})` : "Not reported"}
          </div>

          <div className="space-y-1 text-[11px] text-slate-400 font-mono">
            <div className="flex justify-between">
              <span>Tunnel Latency:</span>
              <span className="text-slate-200">{data?.vpn?.latencyMs ? `${data.vpn.latencyMs} ms` : "--"}</span>
            </div>
            <div className="flex justify-between">
              <span>Peer:</span>
              <span className="text-slate-300 truncate max-w-[120px]">{data.vpn?.peer ?? "--"}</span>
            </div>
            <div className="flex justify-between">
              <span>Handshake:</span>
              <span className="text-emerald-400">
                {data.vpn?.lastHandshakeAt
                  ? `${Math.max(0, Math.round((Date.now() - new Date(data.vpn.lastHandshakeAt).getTime()) / 1000))}s ago`
                  : "--"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Outage & SLA Footer */}
      {data?.lastOutage && (
        <div className="p-3 bg-slate-950/40 border border-slate-800 rounded-xl flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-400 shrink-0" />
            <span>
              Last Outage: <strong className="text-slate-200">{data.lastOutage.reason ?? "Primary WAN offline"}</strong>
            </span>
          </div>
          <span className="text-slate-400 font-mono">
            Failover: {data.lastOutage.failoverSuccessful ? "SUCCESSFUL" : "NONE"}
          </span>
        </div>
      )}
    </div>
  );
}
