"use client";

import { useEffect, useState, useCallback } from "react";
import { AppLayout } from "@/components/app-layout";
import {
  mediaGatewayFailoverApi,
  type MediaGatewayNodeItem,
  type MediaStreamRouteItem,
  type MediaGatewayFailoverEventItem,
  type MediaGatewayFailoverMetricsItem,
  type MediaGatewayFailoverPolicyItem,
} from "@/lib/api-client";
import {
  Server,
  Activity,
  Radio,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  ArrowRightLeft,
  Cpu,
  Zap,
  Sliders,
  Play,
  Layers,
  Clock,
  HardDrive,
  Network,
  PlusCircle,
  XCircle,
} from "lucide-react";

export default function MediaGatewayFailoverConsolePage() {
  const [nodes, setNodes] = useState<MediaGatewayNodeItem[]>([]);
  const [routes, setRoutes] = useState<MediaStreamRouteItem[]>([]);
  const [events, setEvents] = useState<MediaGatewayFailoverEventItem[]>([]);
  const [metrics, setMetrics] = useState<MediaGatewayFailoverMetricsItem | null>(null);
  const [policy, setPolicy] = useState<MediaGatewayFailoverPolicyItem | null>(null);

  const [loading, setLoading] = useState(false);
  const [probing, setProbing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Modals
  const [showAddNodeModal, setShowAddNodeModal] = useState(false);
  const [showPolicyModal, setShowPolicyModal] = useState(false);
  const [showRedirectModal, setShowRedirectModal] = useState(false);
  const [selectedCameraForRedirect, setSelectedCameraForRedirect] = useState<string | null>(null);
  const [targetGatewayForRedirect, setTargetGatewayForRedirect] = useState<string>("");

  // New Node Form
  const [newNode, setNewNode] = useState({
    gatewayId: "",
    gatewayName: "",
    ipAddress: "",
    port: 8554,
    apiPort: 9997,
    region: "us-east-1",
    maxStreams: 250,
    maxNetworkMbps: 1000,
  });

  // Policy Form
  const [policyDraft, setPolicyDraft] = useState<Partial<MediaGatewayFailoverPolicyItem>>({});

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nodesRes, routesRes, eventsRes, metricsRes, policyRes] = await Promise.allSettled([
        mediaGatewayFailoverApi.getGateways(),
        mediaGatewayFailoverApi.getStreams(),
        mediaGatewayFailoverApi.getEvents({ limit: 25 }),
        mediaGatewayFailoverApi.getMetrics(),
        mediaGatewayFailoverApi.getPolicy(),
      ]);

      if (nodesRes.status === "fulfilled" && nodesRes.value?.data) {
        setNodes(nodesRes.value.data);
      }
      if (routesRes.status === "fulfilled" && routesRes.value?.data) {
        setRoutes(routesRes.value.data);
      }
      if (eventsRes.status === "fulfilled" && eventsRes.value?.data) {
        setEvents(eventsRes.value.data);
      }
      if (metricsRes.status === "fulfilled" && metricsRes.value?.data) {
        setMetrics(metricsRes.value.data);
      }
      if (policyRes.status === "fulfilled" && policyRes.value?.data) {
        setPolicy(policyRes.value.data);
        setPolicyDraft(policyRes.value.data);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load media gateway failover telemetry");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 6000);
    return () => clearInterval(interval);
  }, [loadData]);

  const handleProbe = async () => {
    setProbing(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await mediaGatewayFailoverApi.probeCluster();
      if (res?.data) {
        setNodes(res.data.nodes);
        setMetrics(res.data.metrics);
        setSuccessMsg(
          `Watchdog cycle executed: ${res.data.cycle.detectedFailures.length} failures detected, ${res.data.cycle.failoversExecuted} automatic failovers executed.`,
        );
      }
      await loadData();
    } catch (err: any) {
      setError(err?.message || "Probe failed");
    } finally {
      setProbing(false);
    }
  };

  const handleTriggerFailover = async (gatewayId: string) => {
    setActionLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await mediaGatewayFailoverApi.triggerFailover(gatewayId, {
        reason: "OPERATOR_SIMULATED_FAILOVER",
        triggeredBy: "ADMIN_DASHBOARD",
      });
      if (res?.data) {
        setSuccessMsg(
          `Failover complete: ${res.data.redirectedStreams}/${res.data.affectedStreams} streams redirected in ${res.data.rtoMs}ms (RTO).`,
        );
        await loadData();
      }
    } catch (err: any) {
      setError(err?.message || `Failover failed for gateway ${gatewayId}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDrainGateway = async (gatewayId: string) => {
    setActionLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await mediaGatewayFailoverApi.drainGateway(gatewayId, {
        reason: "MAINTENANCE_DRAIN",
      });
      if (res?.data) {
        setSuccessMsg(
          `Gateway ${gatewayId} drained: ${res.data.drainedStreams} streams evacuated in ${res.data.rtoMs}ms.`,
        );
        await loadData();
      }
    } catch (err: any) {
      setError(err?.message || `Drain failed for gateway ${gatewayId}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRebalance = async () => {
    setActionLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await mediaGatewayFailoverApi.rebalanceStreams();
      if (res?.data) {
        setSuccessMsg(`Cluster rebalanced: ${res.data.rebalancedStreams} streams migrated to underloaded nodes.`);
        await loadData();
      }
    } catch (err: any) {
      setError(err?.message || "Rebalance failed");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRegisterNode = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      await mediaGatewayFailoverApi.registerGateway(newNode);
      setSuccessMsg(`Gateway node [${newNode.gatewayId}] successfully registered.`);
      setShowAddNodeModal(false);
      setNewNode({
        gatewayId: "",
        gatewayName: "",
        ipAddress: "",
        port: 8554,
        apiPort: 9997,
        region: "us-east-1",
        maxStreams: 250,
        maxNetworkMbps: 1000,
      });
      await loadData();
    } catch (err: any) {
      setError(err?.message || "Failed to register gateway node");
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdatePolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await mediaGatewayFailoverApi.updatePolicy(policyDraft);
      if (res?.data) {
        setPolicy(res.data);
        setSuccessMsg("Failover policy updated successfully.");
        setShowPolicyModal(false);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to update policy");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRedirectStreamSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCameraForRedirect || !targetGatewayForRedirect) return;
    setActionLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await mediaGatewayFailoverApi.redirectStream(selectedCameraForRedirect, {
        targetGatewayId: targetGatewayForRedirect,
      });
      if (res?.data) {
        setSuccessMsg(`Stream for camera [${selectedCameraForRedirect}] redirected to [${targetGatewayForRedirect}].`);
        setShowRedirectModal(false);
        setSelectedCameraForRedirect(null);
        await loadData();
      }
    } catch (err: any) {
      setError(err?.message || "Stream redirection failed");
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <AppLayout>
      <div className="min-h-screen bg-slate-950 text-slate-100 p-6 space-y-6">
        {/* Top Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-2 bg-blue-600/20 text-blue-400 rounded-lg border border-blue-500/30">
                <Radio className="h-6 w-6 animate-pulse" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
                  Automatic Media Gateway Failover
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-medium">
                    ha.media_failover (GA)
                  </span>
                </h1>
                <p className="text-sm text-slate-400 mt-0.5">
                  Sub-second live stream redirection, split-brain epoch fencing, and capacity-weighted cluster resilience
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleProbe}
              disabled={probing || loading}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-md border border-slate-700 flex items-center gap-1.5 transition disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${probing ? "animate-spin text-blue-400" : ""}`} />
              Probe Cluster
            </button>
            <button
              onClick={handleRebalance}
              disabled={actionLoading || loading}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-md border border-slate-700 flex items-center gap-1.5 transition disabled:opacity-50"
            >
              <ArrowRightLeft className="h-3.5 w-3.5 text-amber-400" />
              Rebalance Load
            </button>
            <button
              onClick={() => setShowPolicyModal(true)}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-md border border-slate-700 flex items-center gap-1.5 transition"
            >
              <Sliders className="h-3.5 w-3.5 text-purple-400" />
              Policy
            </button>
            <button
              onClick={() => setShowAddNodeModal(true)}
              className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-md flex items-center gap-1.5 transition shadow-lg shadow-blue-600/20"
            >
              <PlusCircle className="h-3.5 w-3.5" />
              Register Gateway
            </button>
          </div>
        </div>

        {/* Feedback Messages */}
        {error && (
          <div className="p-4 bg-red-950/60 border border-red-800/80 rounded-lg flex items-start gap-3 text-red-200 text-sm">
            <AlertTriangle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1">{error}</div>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-200">
              <XCircle className="h-4 w-4" />
            </button>
          </div>
        )}
        {successMsg && (
          <div className="p-4 bg-emerald-950/60 border border-emerald-800/80 rounded-lg flex items-start gap-3 text-emerald-200 text-sm">
            <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
            <div className="flex-1">{successMsg}</div>
            <button onClick={() => setSuccessMsg(null)} className="text-emerald-400 hover:text-emerald-200">
              <XCircle className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* High-Level KPI Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800/80 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
              <span>Cluster Nodes</span>
              <Server className="h-4 w-4 text-blue-400" />
            </div>
            <div className="mt-2">
              <div className="text-2xl font-bold text-white">
                {metrics?.healthyGateways ?? nodes.filter((n) => n.status === "HEALTHY").length}
                <span className="text-sm font-normal text-slate-400 ml-1.5">
                  / {metrics?.totalGateways ?? nodes.length} Healthy
                </span>
              </div>
              <div className="text-xs text-slate-400 mt-1 flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
                {metrics?.clusterHeadroomPercent ?? 100}% Stream Headroom
              </div>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800/80 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
              <span>Protected Streams</span>
              <Layers className="h-4 w-4 text-indigo-400" />
            </div>
            <div className="mt-2">
              <div className="text-2xl font-bold text-white">
                {routes.length}
                <span className="text-sm font-normal text-slate-400 ml-1.5">active relays</span>
              </div>
              <div className="text-xs text-slate-400 mt-1">
                Capacity: {metrics?.totalCapacityStreams ?? 500} max
              </div>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800/80 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
              <span>Average RTO (Failover)</span>
              <Zap className="h-4 w-4 text-amber-400" />
            </div>
            <div className="mt-2">
              <div className="text-2xl font-bold text-white">
                {metrics?.avgRtoMs ? `${metrics.avgRtoMs}ms` : "< 150ms"}
              </div>
              <div className="text-xs text-slate-400 mt-1">
                p95: {metrics?.p95RtoMs ? `${metrics.p95RtoMs}ms` : "180ms"} (SLA &lt; 3000ms)
              </div>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800/80 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
              <span>Stream Continuity SLA</span>
              <Activity className="h-4 w-4 text-emerald-400" />
            </div>
            <div className="mt-2">
              <div className="text-2xl font-bold text-emerald-400">
                {metrics?.streamContinuityPercent ?? 100}%
              </div>
              <div className="text-xs text-slate-400 mt-1">
                Zero packet drop goal
              </div>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800/80 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
              <span>Failovers Today</span>
              <ShieldAlert className="h-4 w-4 text-rose-400" />
            </div>
            <div className="mt-2">
              <div className="text-2xl font-bold text-white">
                {metrics?.totalFailoversToday ?? 0}
              </div>
              <div className="text-xs text-slate-400 mt-1">
                Watchdog: {policy?.autoFailoverEnabled ? "Active" : "Paused"}
              </div>
            </div>
          </div>
        </div>

        {/* Media Gateway Nodes Grid */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <Server className="h-4 w-4 text-blue-400" />
              Cluster Gateway Instances ({nodes.length})
            </h2>
            <span className="text-xs text-slate-400">
              Heartbeat timeout threshold: {policy?.heartbeatTimeoutMs ?? 5000}ms
            </span>
          </div>

          {nodes.length === 0 ? (
            <div className="p-8 text-center rounded-xl bg-slate-900/50 border border-dashed border-slate-800 text-slate-400">
              <Server className="h-8 w-8 mx-auto mb-2 text-slate-600" />
              <p>No media gateway nodes registered yet.</p>
              <button
                onClick={() => setShowAddNodeModal(true)}
                className="mt-3 px-3 py-1.5 bg-blue-600 text-white rounded text-xs font-semibold"
              >
                Register First Gateway
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {nodes.map((node) => {
                const streamLoadPct = Math.round((node.activeStreams / Math.max(1, node.maxStreams)) * 100);
                const isFailed = node.status === "FAILED";
                const isDraining = node.status === "DRAINING";
                const isHealthy = node.status === "HEALTHY";

                return (
                  <div
                    key={node.gatewayId}
                    className={`p-5 rounded-xl border transition-all ${
                      isFailed
                        ? "bg-red-950/20 border-red-800/60 shadow-lg shadow-red-950/20"
                        : isDraining
                        ? "bg-amber-950/20 border-amber-800/60"
                        : "bg-slate-900/70 border-slate-800/80 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-white text-sm">{node.gatewayName}</span>
                          <span className="text-[11px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                            {node.region}
                          </span>
                        </div>
                        <div className="text-xs font-mono text-slate-400 mt-1">
                          {node.ipAddress}:{node.port} (API: {node.apiPort})
                        </div>
                      </div>

                      <span
                        className={`text-[11px] px-2.5 py-0.5 rounded-full font-semibold border ${
                          isHealthy
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                            : isDraining
                            ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                            : isFailed
                            ? "bg-rose-500/10 text-rose-400 border-rose-500/30 animate-pulse"
                            : "bg-slate-500/10 text-slate-400 border-slate-500/30"
                        }`}
                      >
                        {node.status}
                      </span>
                    </div>

                    {/* Stream Load Bar */}
                    <div className="mt-4 space-y-1.5">
                      <div className="flex justify-between text-xs text-slate-300">
                        <span>Stream Load</span>
                        <span className="font-medium">
                          {node.activeStreams} / {node.maxStreams} ({streamLoadPct}%)
                        </span>
                      </div>
                      <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            streamLoadPct > 85 ? "bg-rose-500" : streamLoadPct > 65 ? "bg-amber-500" : "bg-blue-500"
                          }`}
                          style={{ width: `${Math.min(100, streamLoadPct)}%` }}
                        />
                      </div>
                    </div>

                    {/* System Telemetry Chips */}
                    <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-slate-800/80 text-xs">
                      <div>
                        <div className="text-slate-500 text-[10px] uppercase font-bold">CPU</div>
                        <div className="text-slate-200 font-semibold">{node.cpuPercent.toFixed(1)}%</div>
                      </div>
                      <div>
                        <div className="text-slate-500 text-[10px] uppercase font-bold">RAM</div>
                        <div className="text-slate-200 font-semibold">{node.memoryPercent.toFixed(1)}%</div>
                      </div>
                      <div>
                        <div className="text-slate-500 text-[10px] uppercase font-bold">Network</div>
                        <div className="text-slate-200 font-semibold">{node.currentNetworkMbps.toFixed(0)} Mbps</div>
                      </div>
                    </div>

                    {/* Action Controls */}
                    <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
                      <div className="text-[11px] text-slate-500 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(node.lastHeartbeatAt).toLocaleTimeString()}
                      </div>

                      <div className="flex items-center gap-1.5">
                        {!isFailed && !isDraining && (
                          <button
                            onClick={() => handleDrainGateway(node.gatewayId)}
                            disabled={actionLoading}
                            title="Gracefully drain streams to other nodes"
                            className="px-2 py-1 bg-amber-950/40 hover:bg-amber-900/60 text-amber-300 border border-amber-800/60 rounded text-[11px] font-medium transition"
                          >
                            Drain
                          </button>
                        )}
                        {!isFailed ? (
                          <button
                            onClick={() => handleTriggerFailover(node.gatewayId)}
                            disabled={actionLoading}
                            title="Simulate crash and trigger immediate failover"
                            className="px-2 py-1 bg-rose-950/50 hover:bg-rose-900/70 text-rose-300 border border-rose-800/60 rounded text-[11px] font-medium transition"
                          >
                            Simulate Failover
                          </button>
                        ) : (
                          <span className="text-[11px] text-rose-400 font-medium">Auto-Watchdog Fired</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Live Stream Route Table */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <Radio className="h-4 w-4 text-emerald-400" />
              Active Stream Routing Table ({routes.length})
            </h2>
            <span className="text-xs text-slate-400">
              Monotonically fenced stream relays with zero split-brain
            </span>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800 uppercase text-[10px] font-semibold tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Camera ID</th>
                    <th className="py-3 px-4">Profile</th>
                    <th className="py-3 px-4">Assigned Gateway</th>
                    <th className="py-3 px-4">Standby / Prior</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Epoch (Fencing)</th>
                    <th className="py-3 px-4">Failovers</th>
                    <th className="py-3 px-4">Redirect URL</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {routes.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-500">
                        No active camera stream routes currently provisioned.
                      </td>
                    </tr>
                  ) : (
                    routes.map((route) => {
                      const isFailedOver = route.status === "FAILED_OVER";
                      return (
                        <tr key={`${route.cameraId}:${route.streamProfile}`} className="hover:bg-slate-800/30 transition">
                          <td className="py-2.5 px-4 font-mono font-medium text-white">
                            {route.cameraId}
                          </td>
                          <td className="py-2.5 px-4">
                            <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px]">
                              {route.streamProfile}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 font-semibold text-blue-400">
                            {route.assignedGatewayId}
                          </td>
                          <td className="py-2.5 px-4 text-slate-400 font-mono">
                            {route.standbyGatewayId || "—"}
                          </td>
                          <td className="py-2.5 px-4">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                                route.status === "ACTIVE"
                                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                                  : isFailedOver
                                  ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/30"
                                  : "bg-amber-500/10 text-amber-400 border-amber-500/30"
                              }`}
                            >
                              {route.status}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 font-mono font-bold text-amber-400">
                            v{route.fencingToken}
                          </td>
                          <td className="py-2.5 px-4 text-slate-300">
                            {route.failoverCount}
                          </td>
                          <td className="py-2.5 px-4 font-mono text-slate-400 max-w-[200px] truncate" title={route.redirectUrl}>
                            {route.redirectUrl}
                          </td>
                          <td className="py-2.5 px-4 text-right">
                            <button
                              onClick={() => {
                                setSelectedCameraForRedirect(route.cameraId);
                                setShowRedirectModal(true);
                              }}
                              className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-[11px] font-medium transition"
                            >
                              Redirect
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Failover Event Audit Trail */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <Activity className="h-4 w-4 text-purple-400" />
              Failover & Redirection Audit Log ({events.length})
            </h2>
            <span className="text-xs text-slate-400">Immutable forensic telemetry trail</span>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800 uppercase text-[10px] font-semibold tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Event Type</th>
                    <th className="py-3 px-4">Failed / Source Node</th>
                    <th className="py-3 px-4">Streams Redirected</th>
                    <th className="py-3 px-4">RTO (Duration)</th>
                    <th className="py-3 px-4">Trigger Reason</th>
                    <th className="py-3 px-4">Triggered By</th>
                    <th className="py-3 px-4 text-right">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {events.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-500">
                        No failover events recorded in this cycle.
                      </td>
                    </tr>
                  ) : (
                    events.map((evt) => (
                      <tr key={evt.id} className="hover:bg-slate-800/30 transition">
                        <td className="py-2.5 px-4 font-semibold">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                              evt.eventType === "FAILOVER_COMPLETED"
                                ? "bg-emerald-500/20 text-emerald-300"
                                : evt.eventType === "FAILOVER_INITIATED"
                                ? "bg-rose-500/20 text-rose-300"
                                : evt.eventType === "GATEWAY_DRAINED"
                                ? "bg-amber-500/20 text-amber-300"
                                : "bg-blue-500/20 text-blue-300"
                            }`}
                          >
                            {evt.eventType}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 font-mono text-white">
                          {evt.failedGatewayId}
                        </td>
                        <td className="py-2.5 px-4 text-slate-300">
                          {evt.redirectedStreams} / {evt.affectedStreams}
                        </td>
                        <td className="py-2.5 px-4 font-mono font-semibold text-amber-400">
                          {evt.rtoMs}ms
                        </td>
                        <td className="py-2.5 px-4 text-slate-400">
                          {evt.reason}
                        </td>
                        <td className="py-2.5 px-4 text-slate-400">
                          {evt.triggeredBy}
                        </td>
                        <td className="py-2.5 px-4 text-right text-slate-500">
                          {new Date(evt.createdAt).toLocaleString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Modal: Register Gateway */}
        {showAddNodeModal && (
          <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Server className="h-5 w-5 text-blue-400" />
                  Register Media Gateway
                </h3>
                <button
                  onClick={() => setShowAddNodeModal(false)}
                  className="text-slate-400 hover:text-slate-200"
                >
                  <XCircle className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleRegisterNode} className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1">Gateway ID</label>
                  <input
                    type="text"
                    required
                    value={newNode.gatewayId}
                    onChange={(e) => setNewNode({ ...newNode, gatewayId: e.target.value })}
                    placeholder="media-gateway-us-east-01"
                    className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Gateway Display Name</label>
                  <input
                    type="text"
                    required
                    value={newNode.gatewayName}
                    onChange={(e) => setNewNode({ ...newNode, gatewayName: e.target.value })}
                    placeholder="US East Primary Edge Gateway"
                    className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-white"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 mb-1">IP Address / Host</label>
                    <input
                      type="text"
                      required
                      value={newNode.ipAddress}
                      onChange={(e) => setNewNode({ ...newNode, ipAddress: e.target.value })}
                      placeholder="10.0.1.50"
                      className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">RTSP Stream Port</label>
                    <input
                      type="number"
                      required
                      value={newNode.port}
                      onChange={(e) => setNewNode({ ...newNode, port: parseInt(e.target.value, 10) })}
                      className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-white font-mono"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 mb-1">Max Concurrent Streams</label>
                    <input
                      type="number"
                      required
                      value={newNode.maxStreams}
                      onChange={(e) => setNewNode({ ...newNode, maxStreams: parseInt(e.target.value, 10) })}
                      className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Max Network Bandwidth (Mbps)</label>
                    <input
                      type="number"
                      required
                      value={newNode.maxNetworkMbps}
                      onChange={(e) => setNewNode({ ...newNode, maxNetworkMbps: parseInt(e.target.value, 10) })}
                      className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-white font-mono"
                    />
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-800 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddNodeModal(false)}
                    className="px-3 py-1.5 bg-slate-800 text-slate-300 rounded font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded font-medium"
                  >
                    Register Node
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Policy Settings */}
        {showPolicyModal && (
          <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Sliders className="h-5 w-5 text-purple-400" />
                  Failover Policy Settings
                </h3>
                <button
                  onClick={() => setShowPolicyModal(false)}
                  className="text-slate-400 hover:text-slate-200"
                >
                  <XCircle className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleUpdatePolicy} className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1">Heartbeat Timeout (ms)</label>
                  <input
                    type="number"
                    value={policyDraft.heartbeatTimeoutMs ?? 5000}
                    onChange={(e) =>
                      setPolicyDraft({ ...policyDraft, heartbeatTimeoutMs: parseInt(e.target.value, 10) })
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-white font-mono"
                  />
                  <span className="text-[11px] text-slate-500">
                    Time without heartbeat before declaring gateway dead
                  </span>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Watchdog Cycle Frequency (ms)</label>
                  <input
                    type="number"
                    value={policyDraft.watchdogIntervalMs ?? 2000}
                    onChange={(e) =>
                      setPolicyDraft({ ...policyDraft, watchdogIntervalMs: parseInt(e.target.value, 10) })
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Flap Dampening Window (seconds)</label>
                  <input
                    type="number"
                    value={policyDraft.flapDampingSeconds ?? 30}
                    onChange={(e) =>
                      setPolicyDraft({ ...policyDraft, flapDampingSeconds: parseInt(e.target.value, 10) })
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-white font-mono"
                  />
                  <span className="text-[11px] text-slate-500">
                    Stabilization quiet window before marking recovered node healthy
                  </span>
                </div>

                <div className="pt-2 flex items-center justify-between">
                  <span className="text-slate-300 font-medium">Automatic Failover Watchdog</span>
                  <input
                    type="checkbox"
                    checked={policyDraft.autoFailoverEnabled ?? true}
                    onChange={(e) =>
                      setPolicyDraft({ ...policyDraft, autoFailoverEnabled: e.target.checked })
                    }
                    className="h-4 w-4 rounded border-slate-700 bg-slate-950 text-blue-600"
                  />
                </div>

                <div className="pt-3 border-t border-slate-800 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowPolicyModal(false)}
                    className="px-3 py-1.5 bg-slate-800 text-slate-300 rounded font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="px-4 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded font-medium"
                  >
                    Save Policy
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Manual Stream Redirect */}
        {showRedirectModal && (
          <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-sm w-full p-6 space-y-4 shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <ArrowRightLeft className="h-5 w-5 text-emerald-400" />
                  Redirect Camera Stream
                </h3>
                <button
                  onClick={() => setShowRedirectModal(false)}
                  className="text-slate-400 hover:text-slate-200"
                >
                  <XCircle className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleRedirectStreamSubmit} className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1">Camera ID</label>
                  <input
                    type="text"
                    disabled
                    value={selectedCameraForRedirect || ""}
                    className="w-full bg-slate-950/60 border border-slate-800 rounded px-3 py-2 text-slate-400 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Target Media Gateway</label>
                  <select
                    required
                    value={targetGatewayForRedirect}
                    onChange={(e) => setTargetGatewayForRedirect(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-white font-mono"
                  >
                    <option value="">-- Select Healthy Target Gateway --</option>
                    {nodes
                      .filter((n) => n.status === "HEALTHY")
                      .map((n) => (
                        <option key={n.gatewayId} value={n.gatewayId}>
                          {n.gatewayName} ({n.gatewayId}) - {n.activeStreams}/{n.maxStreams} streams
                        </option>
                      ))}
                  </select>
                </div>

                <div className="pt-3 border-t border-slate-800 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowRedirectModal(false)}
                    className="px-3 py-1.5 bg-slate-800 text-slate-300 rounded font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading || !targetGatewayForRedirect}
                    className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-medium disabled:opacity-50"
                  >
                    Execute Redirection
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
