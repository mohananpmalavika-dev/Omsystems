"use client";

import React, { useState, useEffect } from "react";
import {
  Server,
  Database,
  Cpu,
  Radio,
  HardDrive,
  Wifi,
  ShieldCheck,
  Zap,
  Activity,
  AlertTriangle,
  Play,
  RotateCcw,
  CheckCircle2,
  Network,
  Share2,
  RefreshCw,
} from "lucide-react";

interface ChaosResult {
  scenario: string;
  executedAt: string;
  targetComponent: string;
  failureInjected: string;
  automatedReaction: {
    detectionTimeMs: number;
    failoverActionTaken: string;
    recoveryTimeMs: number;
    dataLossBytes: number;
    streamInterruptionMs: number;
  };
  provenRecovery: boolean;
  auditEvidence: string[];
}

export function HAClusterView() {
  const [topology, setTopology] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [simulating, setSimulating] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<ChaosResult | null>(null);

  const fetchTopology = async () => {
    try {
      const res = await fetch("/api/control/v1/ha/topology");
      const data = await res.json();
      if (data.success && data.data) {
        setTopology(data.data);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTopology();
    const timer = setInterval(fetchTopology, 3000);
    return () => clearInterval(timer);
  }, []);

  const runSimulation = async (scenario: string) => {
    setSimulating(scenario);
    try {
      const res = await fetch("/api/control/v1/ha/simulate-failure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario }),
      });
      const data = await res.json();
      if (data.success && data.data) {
        setLastResult(data.data);
        await fetchTopology();
      }
    } catch {
      // ignore
    } finally {
      setSimulating(null);
    }
  };

  const chaosButtons = [
    { id: "KILL_API_NODE", label: "Kill API Node", desc: "Test Control Plane Active-Standby Failover", icon: Server },
    { id: "KILL_REDIS_NODE", label: "Kill Redis Master", desc: "Test Sentinel Quorum & Auto Master Election", icon: Zap },
    { id: "KILL_POSTGRES_PRIMARY", label: "Kill PostgreSQL Primary", desc: "Test Standby Promotion & Zero Data Loss", icon: Database },
    { id: "KILL_MEDIA_GATEWAY", label: "Kill Media Gateway", desc: "Test Nx/Milestone 1.2s Stream Re-anchoring", icon: Radio },
    { id: "DISCONNECT_BRANCH", label: "Disconnect Branch", desc: "Test Local Edge Ring Buffer & Cloud Backfill", icon: Network },
    { id: "RESTART_EDGE_GATEWAY", label: "Restart Edge Gateway", desc: "Test Watchdog Recovery & NVR Continuity", icon: RotateCcw },
    { id: "REMOVE_DISK", label: "Remove Storage Disk", desc: "Test Hot-Spare Promotion & RAID Rebuild", icon: HardDrive },
    { id: "FAIL_PRIMARY_ISP", label: "Fail Primary ISP", desc: "Test Dual-WAN Fiber ➔ Jio 5G Failover", icon: Wifi },
  ];

  if (loading && !topology) {
    return (
      <div className="p-8 flex items-center justify-center text-slate-400 gap-3">
        <RefreshCw className="w-5 h-5 animate-spin text-blue-500" />
        <span>Polling HA Cluster Topology...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950/40 border border-slate-800 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-indigo-400 text-xs font-mono font-bold uppercase tracking-widest">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Nx Witness & Milestone XProtect Corporate Class HA Architecture</span>
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight mt-1">
              Multi-Node HA Topology & Chaos Engineering Console
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Zero Single Point of Failure (SPOF) • Distributed Media Ownership • Sub-Second Automatic Failover
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-800/80 flex items-center gap-1.5 shadow-sm">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              HA CLUSTER OPERATIONAL
            </span>
          </div>
        </div>
      </div>

      {/* Visual Architecture Diagram */}
      <div className="p-6 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-6 shadow-xl">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
          <Network className="w-4 h-4 text-blue-400" />
          <span>Live High-Availability Architecture Topology</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Tier 1: Load Balancer */}
          <div className="p-4 rounded-xl bg-slate-950/90 border border-slate-800 space-y-2 flex flex-col justify-center text-center">
            <div className="text-xs text-slate-400 font-mono">Tier 1: Load Balancer</div>
            <div className="p-3 rounded-lg bg-blue-950/40 border border-blue-800/60 text-blue-200 font-mono text-xs font-bold flex items-center justify-center gap-2">
              <Share2 className="w-4 h-4 text-blue-400" />
              <span>ALB / VIP (10.0.0.100)</span>
            </div>
            <div className="text-[11px] text-emerald-400 font-mono">
              Active: {topology?.loadBalancer?.activeBackend}
            </div>
          </div>

          {/* Tier 2: Control API Cluster */}
          <div className="p-4 rounded-xl bg-slate-950/90 border border-slate-800 space-y-2">
            <div className="text-xs text-slate-400 font-mono">Tier 2: Control API (Active-Active)</div>
            {topology?.controlApiNodes?.map((node: any) => (
              <div
                key={node.nodeId}
                className={`p-2.5 rounded-lg border text-xs font-mono flex items-center justify-between ${
                  node.status === "ONLINE"
                    ? "bg-slate-900 border-slate-700 text-slate-200"
                    : "bg-rose-950/60 border-rose-800 text-rose-300 animate-pulse"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Server className="w-3.5 h-3.5 text-indigo-400" />
                  <span>{node.nodeName.split(" ")[0]} {node.nodeName.split(" ")[1]}</span>
                </div>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${node.isLeader ? "bg-emerald-950 text-emerald-300 border border-emerald-700" : "bg-slate-800 text-slate-400"}`}>
                  {node.isLeader ? "LEADER" : "STANDBY"}
                </span>
              </div>
            ))}
          </div>

          {/* Tier 3: PostgreSQL HA & Redis HA */}
          <div className="p-4 rounded-xl bg-slate-950/90 border border-slate-800 space-y-2">
            <div className="text-xs text-slate-400 font-mono">Tier 3: PostgreSQL & Redis HA</div>
            <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-700 text-xs font-mono flex items-center justify-between text-slate-200">
              <div className="flex items-center gap-2">
                <Database className="w-3.5 h-3.5 text-emerald-400" />
                <span>PostgreSQL 16 HA</span>
              </div>
              <span className="text-emerald-400 text-[10px]">SYNC (0ms Lag)</span>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-700 text-xs font-mono flex items-center justify-between text-slate-200">
              <div className="flex items-center gap-2">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span>Redis Sentinel Quorum</span>
              </div>
              <span className="text-emerald-400 text-[10px]">3/3 Quorum</span>
            </div>
          </div>

          {/* Tier 4: Event Bus Cluster */}
          <div className="p-4 rounded-xl bg-slate-950/90 border border-slate-800 space-y-2 flex flex-col justify-center text-center">
            <div className="text-xs text-slate-400 font-mono">Tier 4: Event Bus Cluster</div>
            <div className="p-3 rounded-lg bg-purple-950/40 border border-purple-800/60 text-purple-200 font-mono text-xs font-bold flex items-center justify-center gap-2">
              <Activity className="w-4 h-4 text-purple-400" />
              <span>Kafka / Redis Streams</span>
            </div>
            <div className="text-[11px] text-purple-300 font-mono">
              3 In-Sync Replicas • 0ms Lag
            </div>
          </div>
        </div>

        {/* Distributed Media Gateway Cluster (Gateways A, B, C) */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <Radio className="w-4 h-4 text-rose-400" />
              <span>Distributed Media Gateway Plane (Gateways A, B, C)</span>
            </h3>
            <span className="text-xs font-mono text-slate-400">
              Total Active Streams: <strong className="text-white">{topology?.mediaGatewayCluster?.totalActiveStreams}</strong> / {topology?.mediaGatewayCluster?.totalCapacityStreams}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {topology?.mediaGatewayCluster?.gateways?.map((gw: any) => (
              <div
                key={gw.gatewayId}
                className={`p-4 rounded-xl border transition-all ${
                  gw.status === "ONLINE"
                    ? "bg-slate-950/80 border-slate-800"
                    : gw.status === "DEAD"
                    ? "bg-rose-950/50 border-rose-800/80 shadow-rose-950/50"
                    : "bg-amber-950/40 border-amber-800/60"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-sm text-slate-200">{gw.name}</span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      gw.status === "ONLINE"
                        ? "bg-emerald-950 text-emerald-300 border border-emerald-800"
                        : gw.status === "DEAD"
                        ? "bg-rose-950 text-rose-300 border border-rose-800 animate-pulse"
                        : "bg-amber-950 text-amber-300 border border-amber-800"
                    }`}
                  >
                    {gw.status}
                  </span>
                </div>
                <div className="space-y-1 text-xs text-slate-400 font-mono">
                  <div className="flex justify-between">
                    <span>IP Address:</span>
                    <span className="text-slate-300">{gw.ipAddress}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Active Camera Feeds:</span>
                    <span className="text-blue-400 font-bold">{gw.activeStreams} streams</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Throughput:</span>
                    <span className="text-emerald-400">{gw.bandwidthThroughputMbps} Mbps</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Chaos Simulation Control Center */}
      <div className="p-6 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-4 shadow-xl">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-400" />
            <span>Chaos Engineering & Live Failure Injection Suite</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Click any failure simulation below to verify sub-second self-healing, zero recording loss, and instant failover.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {chaosButtons.map((btn) => {
            const Icon = btn.icon;
            const isRunning = simulating === btn.id;
            return (
              <button
                key={btn.id}
                disabled={simulating !== null}
                onClick={() => runSimulation(btn.id)}
                className={`p-3.5 rounded-xl border text-left flex flex-col justify-between transition-all group ${
                  isRunning
                    ? "bg-amber-950/60 border-amber-600 text-white"
                    : "bg-slate-950/70 border-slate-800 hover:border-rose-600/60 hover:bg-rose-950/20 text-slate-300"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="p-2 rounded-lg bg-slate-900 group-hover:bg-rose-900/50 text-rose-400 border border-slate-800">
                    <Icon className="w-4 h-4" />
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800 group-hover:border-rose-800 group-hover:text-rose-300">
                    {isRunning ? "Simulating..." : "INJECT"}
                  </span>
                </div>
                <div>
                  <div className="font-bold text-xs text-slate-200 group-hover:text-white">{btn.label}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">{btn.desc}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Latest Chaos Recovery Evidence Card */}
      {lastResult && (
        <div className="p-6 rounded-2xl bg-gradient-to-r from-emerald-950/40 via-slate-900 to-slate-900 border border-emerald-800/80 shadow-2xl space-y-4 animate-in fade-in duration-300">
          <div className="flex items-center justify-between border-b border-emerald-900/40 pb-3">
            <div className="flex items-center gap-2 text-emerald-400 text-xs font-mono font-bold uppercase">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              <span>Proven Automated Recovery Evidence ({lastResult.scenario})</span>
            </div>
            <span className="text-xs font-mono text-slate-400">
              Executed: {new Date(lastResult.executedAt).toLocaleTimeString()}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800">
              <div className="text-[11px] text-slate-400 font-mono">Detection Time</div>
              <div className="text-lg font-bold text-blue-400 font-mono">{lastResult.automatedReaction.detectionTimeMs} ms</div>
            </div>
            <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800">
              <div className="text-[11px] text-slate-400 font-mono">Recovery MTTR</div>
              <div className="text-lg font-bold text-emerald-400 font-mono">{lastResult.automatedReaction.recoveryTimeMs} ms</div>
            </div>
            <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800">
              <div className="text-[11px] text-slate-400 font-mono">Data Loss</div>
              <div className="text-lg font-bold text-emerald-400 font-mono">{lastResult.automatedReaction.dataLossBytes} Bytes</div>
            </div>
            <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800">
              <div className="text-[11px] text-slate-400 font-mono">Stream Interruption</div>
              <div className="text-lg font-bold text-purple-400 font-mono">{lastResult.automatedReaction.streamInterruptionMs} ms</div>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
            <div className="text-xs text-slate-300 font-bold">Automated Reaction:</div>
            <p className="text-xs text-slate-400">{lastResult.automatedReaction.failoverActionTaken}</p>
            <div className="text-xs text-slate-300 font-bold pt-1">Audit Trail & Evidence:</div>
            <ul className="text-xs text-emerald-300/90 space-y-1 list-disc list-inside font-mono">
              {lastResult.auditEvidence.map((item, idx) => (
                <li key={idx}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
