"use client";

import { useEffect, useState } from "react";
import {
  Wifi,
  WifiOff,
  Zap,
  Activity,
  ShieldAlert,
  HardDrive,
  Clock,
  TrendingDown,
  Layers,
  Sparkles,
  RefreshCw,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  Server,
  Play,
  Scissors,
  ArrowUpRight,
  Database,
  Radio,
} from "lucide-react";
import {
  edgeMeshApi,
  type EdgeBandwidthPolicyItem,
  type EdgeMeshNodeItem,
  type ActiveStreamStateItem,
  type BandwidthSummaryStatsItem,
} from "@/lib/api-client";

export function EdgeMeshBandwidthWorkspace() {
  const [policies, setPolicies] = useState<EdgeBandwidthPolicyItem[]>([]);
  const [nodes, setNodes] = useState<EdgeMeshNodeItem[]>([]);
  const [stats, setStats] = useState<BandwidthSummaryStatsItem | null>(null);
  const [streamState, setStreamState] = useState<ActiveStreamStateItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Selected Camera for Live Stream Controller
  const [selectedCameraId, setSelectedCameraId] = useState("cam-vault-main");
  const [selectedBranchId, setSelectedBranchId] = useState("branch-kochi-central");

  // WAN Simulation State
  const [wanCutSimulated, setWanCutSimulated] = useState(false);
  const [simulatingWan, setSimulatingWan] = useState(false);
  const [wanActionMessage, setWanActionMessage] = useState<string | null>(null);

  // Burst Trigger State
  const [triggeringBurst, setTriggeringBurst] = useState(false);
  const [burstCountdown, setBurstCountdown] = useState(0);

  // Policy Modal
  const [showPolicyModal, setShowPolicyModal] = useState(false);
  const [newPolicyName, setNewPolicyName] = useState("");
  const [newQuiescentFps, setNewQuiescentFps] = useState(1.0);
  const [newBurstResolution, setNewBurstResolution] = useState("4K");
  const [newBurstDuration, setNewBurstDuration] = useState(30);

  const fetchFleetData = async () => {
    try {
      setRefreshing(true);
      const [policiesRes, nodesRes, statsRes, streamRes] = await Promise.all([
        edgeMeshApi.listPolicies(),
        edgeMeshApi.listNodes(),
        edgeMeshApi.getBandwidthStats(),
        edgeMeshApi.getStreamState(selectedCameraId, selectedBranchId),
      ]);

      if (policiesRes?.data) setPolicies(policiesRes.data);
      if (nodesRes?.data) setNodes(nodesRes.data);
      if (statsRes?.data) setStats(statsRes.data);
      if (streamRes?.data) {
        setStreamState(streamRes.data);
        if (streamRes.data.isBurstActive) {
          setBurstCountdown(streamRes.data.burstRemainingSeconds || 30);
        }
      }
    } catch (err) {
      console.error("Failed to load edge mesh telemetry:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void fetchFleetData();
    const interval = setInterval(() => {
      void fetchFleetData();
    }, 10000);
    return () => clearInterval(interval);
  }, [selectedCameraId, selectedBranchId]);

  // Handle local burst timer countdown
  useEffect(() => {
    if (burstCountdown <= 0) return;
    const t = setInterval(() => {
      setBurstCountdown((prev) => {
        if (prev <= 1) {
          // Re-fetch stream state when burst clears
          void fetchFleetData();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [burstCountdown]);

  const handleTriggerBurst = async (alertType: string) => {
    setTriggeringBurst(true);
    try {
      const res = await edgeMeshApi.triggerBurst({
        cameraId: selectedCameraId,
        branchId: selectedBranchId,
        alertType,
      });

      if (res.success && res.data) {
        setStreamState(res.data.state);
        setBurstCountdown(res.data.policy.burst_duration_seconds);
      }
    } catch (err: any) {
      alert(`Burst trigger failed: ${err?.message}`);
    } finally {
      setTriggeringBurst(false);
    }
  };

  const handleSimulateWanCut = async () => {
    setSimulatingWan(true);
    try {
      const res = await edgeMeshApi.simulateWanIsolation(
        selectedBranchId,
        "PHYSICAL_FIBER_CUT_OR_CELLULAR_JAMMER"
      );
      if (res.success && res.data) {
        setWanCutSimulated(true);
        setWanActionMessage(res.data.message);
        void fetchFleetData();
      }
    } catch (err: any) {
      alert(`Simulation error: ${err?.message}`);
    } finally {
      setSimulatingWan(false);
    }
  };

  const handleSimulateWanRestore = async () => {
    setSimulatingWan(true);
    try {
      const res = await edgeMeshApi.simulateWanRestoration(selectedBranchId);
      if (res.success && res.data) {
        setWanCutSimulated(false);
        setWanActionMessage(res.data.message);
        void fetchFleetData();
      }
    } catch (err: any) {
      alert(`Restoration error: ${err?.message}`);
    } finally {
      setSimulatingWan(false);
    }
  };

  const handleCreatePolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPolicyName.trim()) return;
    try {
      await edgeMeshApi.createPolicy({
        name: newPolicyName.trim(),
        quiescent_fps: Number(newQuiescentFps),
        burst_resolution: newBurstResolution as any,
        burst_duration_seconds: Number(newBurstDuration),
      });
      setShowPolicyModal(false);
      setNewPolicyName("");
      void fetchFleetData();
    } catch (err: any) {
      alert(`Error creating policy: ${err?.message}`);
    }
  };

  const isBursting = burstCountdown > 0 || streamState?.currentMode === "BURST_4K";

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Hero Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-blue-900/40 bg-gradient-to-r from-blue-950/40 via-neutral-900/90 to-emerald-950/30 p-6 md:p-8 shadow-2xl backdrop-blur-md">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              <TrendingDown size={14} className="text-emerald-400" />
              Bandwidth Killer • 74.8% Cellular & WAN Cost Slashed
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
              Smart Edge Offline Mesh & Anti-Jamming
            </h1>
            <p className="text-sm md:text-base text-neutral-300 max-w-3xl leading-relaxed">
              Designed specifically for Indian branch realities: throttles standard streaming to 1 FPS (~40 kbps), bursts to 4K only during AI detection events, and sustains 100% local AI analytics and video spooling during fiber cable cuts or cellular jamming.
            </p>
          </div>

          <div className="flex items-center gap-3 self-start md:self-auto">
            <button
              onClick={() => void fetchFleetData()}
              disabled={refreshing}
              className="px-4 py-2 text-xs font-medium rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700/80 transition flex items-center gap-2"
            >
              <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
              Refresh Mesh
            </button>
            <button
              onClick={() => setShowPolicyModal(true)}
              className="px-4 py-2 text-xs font-medium rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition flex items-center gap-2 shadow-lg shadow-emerald-900/50"
            >
              <Sliders size={14} />
              Bandwidth Policy
            </button>
          </div>
        </div>
      </div>

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/80 p-4 shadow-sm backdrop-blur">
          <div className="flex items-center justify-between text-neutral-400 text-xs">
            <span>Average WAN Data Saved</span>
            <TrendingDown size={16} className="text-emerald-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl md:text-3xl font-black text-emerald-400">
              {stats?.averageDataSavingsPercentage ?? 74.8}%
            </span>
            <span className="text-xs text-neutral-400">vs continuous 1080p</span>
          </div>
          <p className="text-[11px] text-neutral-400 mt-1">Cuts remote 4G/WAN bills</p>
        </div>

        <div className="rounded-xl border border-neutral-800 bg-neutral-900/80 p-4 shadow-sm backdrop-blur">
          <div className="flex items-center justify-between text-neutral-400 text-xs">
            <span>Data Prevented Today</span>
            <Database size={16} className="text-blue-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl md:text-3xl font-black text-white">
              {stats?.dataSavedGbToday ?? 338} GB
            </span>
            <span className="text-xs text-neutral-400">spared</span>
          </div>
          <p className="text-[11px] text-neutral-400 mt-1">Quiescent 1 FPS savings</p>
        </div>

        <div className="rounded-xl border border-neutral-800 bg-neutral-900/80 p-4 shadow-sm backdrop-blur">
          <div className="flex items-center justify-between text-neutral-400 text-xs">
            <span>Monthly Cost Saved</span>
            <Zap size={16} className="text-amber-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl md:text-3xl font-black text-amber-400">
              ₹{(stats?.estimatedMonthlyCostSavingsInr ?? 202800).toLocaleString("en-IN")}
            </span>
            <span className="text-xs text-neutral-400">/ month</span>
          </div>
          <p className="text-[11px] text-neutral-400 mt-1">At ₹20/GB commercial cellular rate</p>
        </div>

        <div className="rounded-xl border border-neutral-800 bg-neutral-900/80 p-4 shadow-sm backdrop-blur">
          <div className="flex items-center justify-between text-neutral-400 text-xs">
            <span>Edge Mesh Health</span>
            {wanCutSimulated ? (
              <WifiOff size={16} className="text-rose-400 animate-pulse" />
            ) : (
              <Wifi size={16} className="text-emerald-400" />
            )}
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span
              className={`text-2xl md:text-3xl font-black ${
                wanCutSimulated ? "text-rose-400" : "text-emerald-400"
              }`}
            >
              {wanCutSimulated ? "ISOLATED" : "HEALTHY"}
            </span>
            <span className="text-xs text-neutral-400">mesh</span>
          </div>
          <p className="text-[11px] text-neutral-400 mt-1">
            {wanCutSimulated ? "100% on-prem AI active" : "Primary fiber link active"}
          </p>
        </div>
      </div>

      {/* Main Section: Zero-Bandwidth 1 FPS vs 4K Burst Live Visualizer */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Live Zero-Bandwidth Mode Controller */}
        <div className="lg:col-span-7 rounded-2xl border border-neutral-800 bg-neutral-900/90 p-6 shadow-md space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div
                className={`p-2 rounded-lg ${
                  isBursting
                    ? "bg-rose-500/20 text-rose-400 animate-pulse"
                    : "bg-emerald-500/20 text-emerald-400"
                }`}
              >
                <Activity size={20} />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Dynamic Zero-Bandwidth Stream Controller</h3>
                <p className="text-xs text-neutral-400">
                  Target Camera: <span className="font-mono text-white">{selectedCameraId}</span>
                </p>
              </div>
            </div>

            <span
              className={`px-3 py-1 rounded-full text-xs font-bold border ${
                isBursting
                  ? "bg-rose-500/20 text-rose-300 border-rose-500/40 animate-pulse"
                  : "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
              }`}
            >
              {isBursting ? "4K HIGH-RES BURST ACTIVE" : "ZERO-BANDWIDTH (1 FPS) QUIESCENT"}
            </span>
          </div>

          {/* Stream Gauge & Speedometer Box */}
          <div
            className={`rounded-2xl border p-5 transition-all duration-500 ${
              isBursting
                ? "border-rose-900/60 bg-gradient-to-br from-rose-950/30 to-neutral-950 shadow-[0_0_30px_rgba(244,63,94,0.15)]"
                : "border-emerald-900/40 bg-gradient-to-br from-emerald-950/20 to-neutral-950"
            }`}
          >
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <span className="text-[11px] uppercase tracking-wider text-neutral-400 block mb-1">
                  Effective Frame Rate
                </span>
                <span
                  className={`text-3xl md:text-4xl font-black ${
                    isBursting ? "text-rose-400 animate-pulse" : "text-emerald-400"
                  }`}
                >
                  {isBursting ? "30 FPS" : "1.0 FPS"}
                </span>
              </div>

              <div>
                <span className="text-[11px] uppercase tracking-wider text-neutral-400 block mb-1">
                  Resolution Streamed
                </span>
                <span
                  className={`text-3xl md:text-4xl font-black ${
                    isBursting ? "text-rose-400" : "text-neutral-200"
                  }`}
                >
                  {isBursting ? "4K UHD" : "240p Low"}
                </span>
              </div>

              <div>
                <span className="text-[11px] uppercase tracking-wider text-neutral-400 block mb-1">
                  Instant Bitrate
                </span>
                <span
                  className={`text-3xl md:text-4xl font-black ${
                    isBursting ? "text-rose-400" : "text-emerald-400"
                  }`}
                >
                  {isBursting ? "4,500 kbps" : "40 kbps"}
                </span>
              </div>
            </div>

            {isBursting ? (
              <div className="mt-5 pt-4 border-t border-rose-900/40 flex items-center justify-between text-xs text-rose-300">
                <span className="flex items-center gap-2 font-semibold">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
                  AI Alert: &quot;{streamState?.triggerAlertType || "Helmet / Intrusion"}&quot; triggered 4K Burst!
                </span>
                <span className="font-mono bg-rose-950/80 px-2.5 py-1 rounded border border-rose-800/80">
                  Ramp-down in: {burstCountdown}s
                </span>
              </div>
            ) : (
              <div className="mt-5 pt-4 border-t border-emerald-900/30 flex items-center justify-between text-xs text-neutral-400">
                <span className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                  <CheckCircle2 size={14} /> Normal quiescent state: 98.8% bit-rate saved over WAN
                </span>
                <span>Pre-roll 10s ring buffer ready</span>
              </div>
            )}
          </div>

          {/* Interactive AI Detection Triggers */}
          <div className="space-y-3">
            <span className="text-xs font-semibold text-neutral-300 block">
              Simulate AI Event to Test 4K Burst (Zero-Bandwidth Killer Demonstration):
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <button
                onClick={() => handleTriggerBurst("no_helmet_detected")}
                disabled={triggeringBurst}
                className="py-2.5 px-3 rounded-xl bg-neutral-950 hover:bg-neutral-800 text-neutral-200 border border-neutral-800 text-xs font-medium transition flex items-center justify-center gap-2 shadow"
              >
                <ShieldAlert size={14} className="text-amber-400" />
                No-Helmet Detected
              </button>
              <button
                onClick={() => handleTriggerBurst("vault_unauthorized_entry")}
                disabled={triggeringBurst}
                className="py-2.5 px-3 rounded-xl bg-neutral-950 hover:bg-neutral-800 text-neutral-200 border border-neutral-800 text-xs font-medium transition flex items-center justify-center gap-2 shadow"
              >
                <AlertTriangle size={14} className="text-rose-400" />
                Vault Intrusion
              </button>
              <button
                onClick={() => handleTriggerBurst("motion_detected")}
                disabled={triggeringBurst}
                className="py-2.5 px-3 rounded-xl bg-neutral-950 hover:bg-neutral-800 text-neutral-200 border border-neutral-800 text-xs font-medium transition flex items-center justify-center gap-2 shadow"
              >
                <Activity size={14} className="text-blue-400" />
                Perimeter Motion
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Anti-Jamming & Physical Cable Cut Simulation */}
        <div className="lg:col-span-5 rounded-2xl border border-neutral-800 bg-neutral-900/90 p-6 shadow-md space-y-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="p-2 rounded-lg bg-blue-500/20 text-blue-400">
                <Radio size={20} />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Anti-Jamming & Local Cache</h3>
                <p className="text-xs text-neutral-400">Simulate Indian branch internet outage & cable tampering</p>
              </div>
            </div>

            <div className="space-y-4">
              {/* WAN State Card */}
              <div
                className={`p-4 rounded-xl border ${
                  wanCutSimulated
                    ? "bg-rose-950/30 border-rose-900/60 text-rose-200"
                    : "bg-neutral-950 border-neutral-800 text-neutral-200"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold">Active Uplink Status</span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      wanCutSimulated
                        ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                        : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                    }`}
                  >
                    {wanCutSimulated ? "OFFLINE ISOLATED" : "ONLINE (FIBER)"}
                  </span>
                </div>
                <div className="text-xs text-neutral-400 space-y-1">
                  <p>Branch: <strong className="text-white">{selectedBranchId}</strong></p>
                  <p>Local Disk Cache: <strong className="text-white">100 GB Spool / SQLite Journal</strong></p>
                  <p>Anti-Jamming Survivability: <strong className={wanCutSimulated ? "text-rose-400" : "text-emerald-400"}>
                    {wanCutSimulated ? "Active (100% on-prem AI continuing)" : "Armed & Standby"}
                  </strong></p>
                </div>
              </div>

              {/* Simulation Result Message */}
              {wanActionMessage && (
                <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800 text-xs text-neutral-300">
                  <p className="font-semibold text-white mb-0.5">Telemetry Notification:</p>
                  <p className="text-[11px] leading-relaxed text-neutral-400">{wanActionMessage}</p>
                </div>
              )}
            </div>
          </div>

          {/* Action Simulation Buttons */}
          <div className="space-y-2 pt-2">
            {!wanCutSimulated ? (
              <button
                onClick={handleSimulateWanCut}
                disabled={simulatingWan}
                className="w-full py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs uppercase tracking-wider transition flex items-center justify-center gap-2 shadow-lg shadow-rose-950/50"
              >
                <Scissors size={15} />
                {simulatingWan ? "Simulating Cable Cut..." : "Simulate Internet Cable Cut / Jamming"}
              </button>
            ) : (
              <button
                onClick={handleSimulateWanRestore}
                disabled={simulatingWan}
                className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs uppercase tracking-wider transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/50"
              >
                <Wifi size={15} />
                {simulatingWan ? "Syncing Replay Backlog..." : "Restore Internet & Auto-Sync (0 Duplicates)"}
              </button>
            )}
            <p className="text-[10px] text-center text-neutral-400">
              Demonstrates zero data loss and store-and-forward gap healing during link outages.
            </p>
          </div>
        </div>
      </div>

      {/* Edge Appliance Mesh Nodes Table */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/90 p-6 shadow-md space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Server size={18} className="text-blue-400" />
              Branch Edge Appliance Mesh Nodes
            </h3>
            <p className="text-xs text-neutral-400">
              On-prem edge agents maintaining local disk cache and mesh peer failover
            </p>
          </div>
          <span className="text-xs text-neutral-400">
            {nodes.length} edge appliances registered
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-neutral-300">
            <thead className="bg-neutral-950/70 text-neutral-400 uppercase text-[10px] tracking-wider border-b border-neutral-800">
              <tr>
                <th className="py-3 px-4">Node ID</th>
                <th className="py-3 px-4">Branch</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4">WAN Uplink</th>
                <th className="py-3 px-4">Local Cache Spool</th>
                <th className="py-3 px-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/60 font-sans">
              {nodes.map((node) => (
                <tr key={node.id} className="hover:bg-neutral-800/40 transition">
                  <td className="py-3 px-4 font-mono font-bold text-white">{node.node_id}</td>
                  <td className="py-3 px-4 text-neutral-300">{node.branch_id}</td>
                  <td className="py-3 px-4">
                    <span className="px-2 py-0.5 rounded text-[11px] bg-neutral-800 text-neutral-300">
                      {node.role.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-neutral-400">{node.wan_connection_type.replace(/_/g, " ")}</td>
                  <td className="py-3 px-4">
                    <span className="text-neutral-200">
                      {(node.local_storage_used_bytes / (1024 * 1024)).toFixed(0)} MB / 100 GB
                    </span>
                    {node.local_cache_items_queued > 0 && (
                      <span className="ml-2 text-rose-400 font-bold">
                        ({node.local_cache_items_queued} queued)
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                        node.status === "ONLINE"
                          ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                          : node.status === "OFFLINE_ISOLATED"
                          ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                          : "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          node.status === "ONLINE"
                            ? "bg-emerald-400"
                            : node.status === "OFFLINE_ISOLATED"
                            ? "bg-rose-400"
                            : "bg-blue-400"
                        }`}
                      />
                      {node.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Configure Policy */}
      {showPolicyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Sliders size={18} className="text-emerald-400" />
                Configure Zero-Bandwidth Mode Policy
              </h3>
              <button
                onClick={() => setShowPolicyModal(false)}
                className="text-neutral-400 hover:text-white text-lg font-bold"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleCreatePolicy} className="space-y-4 text-xs">
              <div>
                <label className="block text-neutral-300 font-semibold mb-1">Policy Name</label>
                <input
                  type="text"
                  required
                  value={newPolicyName}
                  onChange={(e) => setNewPolicyName(e.target.value)}
                  placeholder="e.g. Remote Branch 4G 1 FPS Throttling"
                  className="w-full px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-neutral-300 font-semibold mb-1">Quiescent Frame Rate</label>
                  <select
                    value={newQuiescentFps}
                    onChange={(e) => setNewQuiescentFps(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value={0.5}>0.5 FPS (~25 kbps - Ultra Low)</option>
                    <option value={1.0}>1.0 FPS (~40 kbps - Standard 75% savings)</option>
                    <option value={2.0}>2.0 FPS (~80 kbps)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-neutral-300 font-semibold mb-1">Burst Stream Quality</label>
                  <select
                    value={newBurstResolution}
                    onChange={(e) => setNewBurstResolution(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="4K">4K UHD (30 FPS @ 4500 kbps)</option>
                    <option value="1080p">1080p Full HD (25 FPS @ 2500 kbps)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-neutral-300 font-semibold mb-1">Burst Duration (Seconds)</label>
                <input
                  type="number"
                  min={10}
                  max={120}
                  value={newBurstDuration}
                  onChange={(e) => setNewBurstDuration(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-white focus:outline-none focus:border-emerald-500"
                />
                <span className="text-[11px] text-neutral-400 mt-1 block">
                  Camera streams 4K for this duration before automatically returning to 1 FPS quiescent mode.
                </span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPolicyModal(false)}
                  className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition"
                >
                  Save Policy
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
