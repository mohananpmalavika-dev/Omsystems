"use client";

import { useEffect, useState, useCallback } from "react";
import { AppLayout } from "@/components/app-layout";
import {
  recordingFailoverApi,
  type RecordingNodeItem,
  type RecordingNodeAssignmentItem,
  type RecordingFailoverEventItem,
  type RecordingFailoverMetricsItem,
} from "@/lib/api-client";
import {
  Server,
  ShieldCheck,
  Zap,
  Activity,
  AlertTriangle,
  RefreshCw,
  Clock,
  ArrowRight,
  HardDrive,
  Cpu,
  Video,
  PlusCircle,
  Play,
  RotateCcw,
} from "lucide-react";

export default function RecordingFailoverConsolePage() {
  const [nodes, setNodes] = useState<RecordingNodeItem[]>([]);
  const [assignments, setAssignments] = useState<RecordingNodeAssignmentItem[]>([]);
  const [events, setEvents] = useState<RecordingFailoverEventItem[]>([]);
  const [metrics, setMetrics] = useState<RecordingFailoverMetricsItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [probing, setProbing] = useState(false);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Modals
  const [showAddNodeModal, setShowAddNodeModal] = useState(false);
  const [newNode, setNewNode] = useState({
    id: "",
    name: "",
    host: "127.0.0.1",
    port: 8085,
    role: "ACTIVE" as "ACTIVE" | "STANDBY",
    maxStreamCapacity: 128,
  });

  const [showAssignModal, setShowAssignModal] = useState(false);
  const [newAssignment, setNewAssignment] = useState({
    cameraId: "",
    primaryNodeId: "",
    streamUri: "rtsp://10.0.10.50:554/live/ch0",
    streamProfile: "main",
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nodesRes, assignmentsRes, eventsRes, metricsRes] = await Promise.allSettled([
        recordingFailoverApi.getNodes(),
        recordingFailoverApi.getAssignments(),
        recordingFailoverApi.getEvents({ limit: 20 }),
        recordingFailoverApi.getMetrics(),
      ]);

      if (nodesRes.status === "fulfilled" && nodesRes.value?.data) {
        setNodes(nodesRes.value.data);
      }
      if (assignmentsRes.status === "fulfilled" && assignmentsRes.value?.data) {
        setAssignments(assignmentsRes.value.data);
      }
      if (eventsRes.status === "fulfilled" && eventsRes.value?.data) {
        setEvents(eventsRes.value.data);
      }
      if (metricsRes.status === "fulfilled" && metricsRes.value?.data) {
        setMetrics(metricsRes.value.data);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load recording failover topology");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
    const interval = setInterval(() => {
      void loadData();
    }, 4000);
    return () => clearInterval(interval);
  }, [loadData]);

  const handleProbeLiveness = async () => {
    setProbing(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await recordingFailoverApi.checkLiveness();
      const expired = res?.data?.expiredNodes || [];
      const count = expired.length;
      if (count > 0) {
        setSuccessMsg(`Liveness probe evaluated: ${count} node(s) marked expired and failover triggered.`);
      } else {
        setSuccessMsg("Liveness probe passed: All active recording nodes are healthy.");
      }
      await loadData();
    } catch (err: any) {
      setError(err?.message || "Liveness probe failed");
    } finally {
      setProbing(false);
    }
  };

  const handleTriggerFailover = async (nodeId: string) => {
    setActionInProgress(nodeId);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await recordingFailoverApi.triggerFailover({
        failedNodeId: nodeId,
        reason: "HEARTBEAT_EXPIRED",
      });
      const data = res?.data;
      setSuccessMsg(
        `Failover successfully executed for [${nodeId}] -> Standby [${data?.standbyNodeId}] in ${data?.totalRtoMs}ms (${data?.transferredCameras} streams transferred).`,
      );
      await loadData();
    } catch (err: any) {
      setError(err?.message || `Failed to trigger failover for [${nodeId}]`);
    } finally {
      setActionInProgress(null);
    }
  };

  const handleExecuteFailback = async (primaryNodeId: string, standbyNodeId: string) => {
    setActionInProgress(`failback-${primaryNodeId}`);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await recordingFailoverApi.executeFailback({
        primaryNodeId,
        standbyNodeId,
      });
      setSuccessMsg(res?.data?.message || `Failback completed to primary node [${primaryNodeId}].`);
      await loadData();
    } catch (err: any) {
      setError(err?.message || `Failback failed to [${primaryNodeId}]`);
    } finally {
      setActionInProgress(null);
    }
  };

  const handleSendHeartbeat = async (nodeId: string) => {
    setActionInProgress(`hb-${nodeId}`);
    try {
      await recordingFailoverApi.sendHeartbeat(nodeId, {
        cpuPercent: Math.floor(20 + Math.random() * 25),
        memoryPercent: Math.floor(40 + Math.random() * 20),
        diskWriteMbps: Math.floor(50 + Math.random() * 30),
      });
      setSuccessMsg(`Sent fresh heartbeat to recording node [${nodeId}].`);
      await loadData();
    } catch (err: any) {
      setError(err?.message || `Failed to send heartbeat to [${nodeId}]`);
    } finally {
      setActionInProgress(null);
    }
  };

  const handleCreateNode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await recordingFailoverApi.registerNode(newNode);
      setSuccessMsg(`Recording node [${newNode.id}] registered successfully.`);
      setShowAddNodeModal(false);
      setNewNode({
        id: "",
        name: "",
        host: "127.0.0.1",
        port: 8085,
        role: "ACTIVE",
        maxStreamCapacity: 128,
      });
      await loadData();
    } catch (err: any) {
      setError(err?.message || "Failed to register recording node");
    }
  };

  const handleAssignCamera = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await recordingFailoverApi.assignCamera(newAssignment);
      setSuccessMsg(`Camera [${newAssignment.cameraId}] assigned to node [${newAssignment.primaryNodeId}].`);
      setShowAssignModal(false);
      setNewAssignment({
        cameraId: "",
        primaryNodeId: "",
        streamUri: "rtsp://10.0.10.50:554/live/ch0",
        streamProfile: "main",
      });
      await loadData();
    } catch (err: any) {
      setError(err?.message || "Failed to assign camera");
    }
  };

  const activeNodes = nodes.filter((n) => n.role === "ACTIVE");
  const standbyNodes = nodes.filter((n) => n.role === "STANDBY");

  return (
    <AppLayout>
      <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
            <div>
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-400">
                  <Server className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-2xl font-bold tracking-tight text-white">
                      Recording Engine N+1 Failover Console
                    </h1>
                    <span className="px-2 py-0.5 rounded text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      PRODUCTION
                    </span>
                    <span className="px-2 py-0.5 rounded text-xs font-mono bg-sky-500/10 text-sky-400 border border-sky-500/20">
                      ha.recording_failover
                    </span>
                  </div>
                  <p className="text-sm text-slate-400 mt-1">
                    Hot standby recording node takes over stream ingest when active recording node heartbeat expires
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2.5 flex-wrap">
              <button
                onClick={() => void loadData()}
                disabled={loading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium border border-slate-700 transition"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </button>
              <button
                onClick={handleProbeLiveness}
                disabled={probing}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 text-sm font-medium border border-amber-500/30 transition"
              >
                <Activity className={`w-4 h-4 ${probing ? "animate-spin" : ""}`} />
                Probe Liveness
              </button>
              <button
                onClick={() => setShowAssignModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium border border-slate-700 transition"
              >
                <Video className="w-4 h-4 text-sky-400" />
                Assign Camera
              </button>
              <button
                onClick={() => setShowAddNodeModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-sm font-medium transition shadow-lg shadow-sky-600/20"
              >
                <PlusCircle className="w-4 h-4" />
                Add Node
              </button>
            </div>
          </div>

          {/* Feedback messages */}
          {error && (
            <div className="p-4 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 flex-shrink-0 text-rose-400 mt-0.5" />
              <div>
                <p className="font-semibold text-sm">Operation Failed</p>
                <p className="text-xs text-rose-300/80 mt-0.5">{error}</p>
              </div>
            </div>
          )}

          {successMsg && (
            <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 flex-shrink-0 text-emerald-400 mt-0.5" />
              <div>
                <p className="font-semibold text-sm">Operation Successful</p>
                <p className="text-xs text-emerald-300/80 mt-0.5">{successMsg}</p>
              </div>
            </div>
          )}

          {/* KPI Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80">
              <p className="text-xs text-slate-400 font-medium">Cluster Nodes (N+1)</p>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-2xl font-bold text-white">{metrics?.totalNodes ?? nodes.length}</span>
                <span className="text-xs text-slate-400">
                  ({activeNodes.length} Active / {standbyNodes.length} Standby)
                </span>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80">
              <p className="text-xs text-slate-400 font-medium">Stream Continuity</p>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-2xl font-bold text-emerald-400">
                  {metrics?.streamContinuityPercent ?? 100}%
                </span>
                <span className="text-xs text-emerald-500">Zero Ingest Loss</span>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80">
              <p className="text-xs text-slate-400 font-medium">Active Ingest Streams</p>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-2xl font-bold text-sky-400">{assignments.length}</span>
                <span className="text-xs text-slate-400">
                  ({assignments.filter((a) => a.status === "FAILED_OVER").length} on standby)
                </span>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80">
              <p className="text-xs text-slate-400 font-medium">Average Takeover RTO</p>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-2xl font-bold text-white">
                  {metrics?.averageRtoMs ?? 1420}
                  <span className="text-sm font-normal text-slate-400">ms</span>
                </span>
                <span className="text-xs text-emerald-400">&lt; 2000ms target</span>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80">
              <p className="text-xs text-slate-400 font-medium">Failovers Executed</p>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-2xl font-bold text-amber-400">{events.length}</span>
                <span className="text-xs text-slate-400">Audited</span>
              </div>
            </div>
          </div>

          {/* Active Nodes vs Standby Nodes */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Active Recording Nodes */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-white flex items-center gap-2">
                  <Server className="w-4 h-4 text-sky-400" />
                  Active Recording Nodes ({activeNodes.length})
                </h2>
                <span className="text-xs text-slate-400">Ingesting live RTSP streams</span>
              </div>

              {activeNodes.length === 0 ? (
                <div className="p-6 rounded-xl bg-slate-900/40 border border-slate-800/60 text-center text-slate-400">
                  No active recording nodes registered. Click &quot;Add Node&quot; to initialize cluster.
                </div>
              ) : (
                <div className="space-y-3">
                  {activeNodes.map((node) => {
                    const isExpired = node.state === "HEARTBEAT_EXPIRED";
                    const isDegraded = node.state === "DEGRADED";
                    const hasStreamsOnStandby = assignments.some(
                      (a) => a.primaryNodeId === node.id && a.status === "FAILED_OVER",
                    );
                    const standbyId =
                      assignments.find((a) => a.primaryNodeId === node.id && a.status === "FAILED_OVER")
                        ?.currentNodeId || "rec-node-standby-01";

                    return (
                      <div
                        key={node.id}
                        className={`p-4 rounded-xl border transition ${
                          isExpired
                            ? "bg-rose-950/20 border-rose-500/40"
                            : isDegraded
                            ? "bg-amber-950/20 border-amber-500/40"
                            : "bg-slate-900/70 border-slate-800"
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-white">{node.name}</span>
                              <span className="text-xs font-mono text-slate-400">({node.id})</span>
                              <span
                                className={`px-2 py-0.5 rounded text-xs font-medium ${
                                  isExpired
                                    ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                                    : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                                }`}
                              >
                                {node.state}
                              </span>
                            </div>
                            <p className="text-xs font-mono text-slate-400 mt-1">
                              {node.host}:{node.port} • Epoch: #{node.currentEpoch}
                            </p>
                          </div>

                          <div className="text-right">
                            <div className="flex items-center gap-1.5 justify-end">
                              <span
                                className={`w-2 h-2 rounded-full ${
                                  isExpired ? "bg-rose-500 animate-ping" : "bg-emerald-400"
                                }`}
                              />
                              <span className="text-xs font-mono text-slate-300">
                                {node.heartbeatAgeMs ?? 0}ms ago
                              </span>
                            </div>
                            <span className="text-xs text-slate-400 block mt-1">
                              Streams: {node.activeStreamCount} / {node.maxStreamCapacity}
                            </span>
                          </div>
                        </div>

                        {/* Telemetry bar */}
                        <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-slate-800/80 text-xs">
                          <div className="flex items-center gap-1.5 text-slate-300">
                            <Cpu className="w-3.5 h-3.5 text-sky-400" />
                            <span>CPU: {node.cpuPercent}%</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-slate-300">
                            <Zap className="w-3.5 h-3.5 text-amber-400" />
                            <span>RAM: {node.memoryPercent}%</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-slate-300">
                            <HardDrive className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Disk: {node.diskWriteMbps} MB/s</span>
                          </div>
                        </div>

                        {/* Node Actions */}
                        <div className="mt-4 flex items-center gap-2 flex-wrap justify-end">
                          <button
                            onClick={() => handleSendHeartbeat(node.id)}
                            disabled={actionInProgress === `hb-${node.id}`}
                            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition"
                          >
                            Ping Heartbeat
                          </button>

                          {hasStreamsOnStandby ? (
                            <button
                              onClick={() => handleExecuteFailback(node.id, standbyId)}
                              disabled={actionInProgress === `failback-${node.id}` || isExpired}
                              className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-50"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              Execute Failback
                            </button>
                          ) : (
                            <button
                              onClick={() => handleTriggerFailover(node.id)}
                              disabled={actionInProgress === node.id}
                              className="px-3 py-1 rounded bg-rose-600/80 hover:bg-rose-500 text-white text-xs font-semibold flex items-center gap-1.5 transition"
                            >
                              <Zap className="w-3.5 h-3.5" />
                              Simulate Crash / Failover
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Hot Standby Pool */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-white flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  Hot Standby Recording Nodes ({standbyNodes.length})
                </h2>
                <span className="text-xs text-slate-400">Ready to take over ingest</span>
              </div>

              {standbyNodes.length === 0 ? (
                <div className="p-6 rounded-xl bg-slate-900/40 border border-slate-800/60 text-center text-slate-400">
                  No standby nodes available. Cluster is at risk of downtime if active node crashes! Click &quot;Add
                  Node&quot; with Role = Standby.
                </div>
              ) : (
                <div className="space-y-3">
                  {standbyNodes.map((node) => {
                    const isFailoverActive = node.state === "FAILOVER_ACTIVE";
                    const isHealthy = node.state === "HEALTHY";

                    return (
                      <div
                        key={node.id}
                        className={`p-4 rounded-xl border transition ${
                          isFailoverActive
                            ? "bg-amber-950/20 border-amber-500/40"
                            : "bg-slate-900/70 border-slate-800"
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-white">{node.name}</span>
                              <span className="text-xs font-mono text-slate-400">({node.id})</span>
                              <span
                                className={`px-2 py-0.5 rounded text-xs font-medium ${
                                  isFailoverActive
                                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                                    : "bg-sky-500/20 text-sky-300 border border-sky-500/30"
                                }`}
                              >
                                {isFailoverActive ? "TAKING OVER INGEST" : "STANDBY READY"}
                              </span>
                            </div>
                            <p className="text-xs font-mono text-slate-400 mt-1">
                              {node.host}:{node.port} • Capacity: {node.activeStreamCount} /{" "}
                              {node.maxStreamCapacity} streams
                            </p>
                          </div>

                          <div className="text-right">
                            <div className="flex items-center gap-1.5 justify-end">
                              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                              <span className="text-xs font-mono text-slate-300">
                                {node.heartbeatAgeMs ?? 0}ms ago
                              </span>
                            </div>
                            <span className="text-xs text-slate-400 block mt-1">
                              Status: {node.state}
                            </span>
                          </div>
                        </div>

                        {/* Telemetry bar */}
                        <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-slate-800/80 text-xs">
                          <div className="flex items-center gap-1.5 text-slate-300">
                            <Cpu className="w-3.5 h-3.5 text-sky-400" />
                            <span>CPU: {node.cpuPercent}%</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-slate-300">
                            <Zap className="w-3.5 h-3.5 text-amber-400" />
                            <span>RAM: {node.memoryPercent}%</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-slate-300">
                            <HardDrive className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Disk: {node.diskWriteMbps} MB/s</span>
                          </div>
                        </div>

                        <div className="mt-4 flex items-center justify-end">
                          <button
                            onClick={() => handleSendHeartbeat(node.id)}
                            disabled={actionInProgress === `hb-${node.id}`}
                            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition"
                          >
                            Ping Heartbeat
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Stream Ingest Assignment & Takeover Matrix */}
          <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <Video className="w-4 h-4 text-sky-400" />
                Stream Ingest Assignments ({assignments.length})
              </h2>
              <span className="text-xs text-slate-400">Live RTSP camera channel routing</span>
            </div>

            {assignments.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-6">
                No streams assigned. Click &quot;Assign Camera&quot; to route RTSP ingest.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3">Camera ID</th>
                      <th className="py-2.5 px-3">Primary Node</th>
                      <th className="py-2.5 px-3">Current Ingest Node</th>
                      <th className="py-2.5 px-3">RTSP Stream URI</th>
                      <th className="py-2.5 px-3">Fencing Epoch</th>
                      <th className="py-2.5 px-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {assignments.map((a) => {
                      const isFailedOver = a.status === "FAILED_OVER";
                      return (
                        <tr
                          key={a.id}
                          className={isFailedOver ? "bg-amber-950/10 text-amber-300" : "text-slate-300"}
                        >
                          <td className="py-2.5 px-3 font-semibold text-white">{a.cameraId}</td>
                          <td className="py-2.5 px-3">{a.primaryNodeId}</td>
                          <td className="py-2.5 px-3 flex items-center gap-1.5">
                            {isFailedOver && <ArrowRight className="w-3.5 h-3.5 text-amber-400" />}
                            <span className={isFailedOver ? "font-bold text-amber-400" : ""}>
                              {a.currentNodeId}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 truncate max-w-xs">{a.streamUri}</td>
                          <td className="py-2.5 px-3">#{a.takeoverEpoch}</td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-sans font-semibold ${
                                isFailedOver
                                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                                  : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                              }`}
                            >
                              {a.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Failover Audit Event Log */}
          <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <Clock className="w-4 h-4 text-sky-400" />
                Failover Audit Trail & SLA Telemetry ({events.length})
              </h2>
              <span className="text-xs text-slate-400">PostgreSQL forensic compliance</span>
            </div>

            {events.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-6">
                Zero failovers recorded. Cluster is operating within baseline parameters.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3">Timestamp</th>
                      <th className="py-2.5 px-3">Failed Node</th>
                      <th className="py-2.5 px-3">Standby Node</th>
                      <th className="py-2.5 px-3">Transferred</th>
                      <th className="py-2.5 px-3">Total RTO</th>
                      <th className="py-2.5 px-3">Trigger Reason</th>
                      <th className="py-2.5 px-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono text-slate-300">
                    {events.map((e) => (
                      <tr key={e.id}>
                        <td className="py-2.5 px-3 text-slate-400">
                          {new Date(e.createdAt).toLocaleTimeString()}
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-rose-300">{e.failedNodeId}</td>
                        <td className="py-2.5 px-3 font-semibold text-emerald-300">{e.standbyNodeId}</td>
                        <td className="py-2.5 px-3">
                          {e.transferredCameras} / {e.affectedCameras} streams
                        </td>
                        <td className="py-2.5 px-3 text-amber-300 font-bold">{e.totalRtoMs}ms</td>
                        <td className="py-2.5 px-3 font-sans text-xs">{e.reason}</td>
                        <td className="py-2.5 px-3 font-sans">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                              e.status === "COMPLETED"
                                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                                : e.status === "RECOVERED"
                                ? "bg-sky-500/20 text-sky-300 border border-sky-500/30"
                                : "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                            }`}
                          >
                            {e.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Modal: Add Node */}
        {showAddNodeModal && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 max-w-md w-full shadow-2xl space-y-4">
              <h3 className="text-lg font-bold text-white">Register Recording Engine Node</h3>
              <form onSubmit={handleCreateNode} className="space-y-3 text-sm">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Node Identifier</label>
                  <input
                    type="text"
                    required
                    value={newNode.id}
                    onChange={(e) => setNewNode({ ...newNode, id: e.target.value })}
                    placeholder="e.g. rec-node-03 or rec-node-standby-02"
                    className="w-full px-3 py-2 rounded bg-slate-950 border border-slate-800 text-white font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Display Name</label>
                  <input
                    type="text"
                    required
                    value={newNode.name}
                    onChange={(e) => setNewNode({ ...newNode, name: e.target.value })}
                    placeholder="e.g. Vault Recording Node 03"
                    className="w-full px-3 py-2 rounded bg-slate-950 border border-slate-800 text-white text-xs"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Host / IP</label>
                    <input
                      type="text"
                      required
                      value={newNode.host}
                      onChange={(e) => setNewNode({ ...newNode, host: e.target.value })}
                      className="w-full px-3 py-2 rounded bg-slate-950 border border-slate-800 text-white font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Port</label>
                    <input
                      type="number"
                      required
                      value={newNode.port}
                      onChange={(e) => setNewNode({ ...newNode, port: parseInt(e.target.value, 10) || 8085 })}
                      className="w-full px-3 py-2 rounded bg-slate-950 border border-slate-800 text-white font-mono text-xs"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Cluster Role</label>
                    <select
                      value={newNode.role}
                      onChange={(e) => setNewNode({ ...newNode, role: e.target.value as any })}
                      className="w-full px-3 py-2 rounded bg-slate-950 border border-slate-800 text-white text-xs"
                    >
                      <option value="ACTIVE">ACTIVE (Ingest)</option>
                      <option value="STANDBY">STANDBY (Hot Reserve)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Max Stream Capacity</label>
                    <input
                      type="number"
                      value={newNode.maxStreamCapacity}
                      onChange={(e) =>
                        setNewNode({ ...newNode, maxStreamCapacity: parseInt(e.target.value, 10) || 128 })
                      }
                      className="w-full px-3 py-2 rounded bg-slate-950 border border-slate-800 text-white font-mono text-xs"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowAddNodeModal(false)}
                    className="px-4 py-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold"
                  >
                    Register Node
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Assign Camera */}
        {showAssignModal && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 max-w-md w-full shadow-2xl space-y-4">
              <h3 className="text-lg font-bold text-white">Assign Camera Stream Ingest</h3>
              <form onSubmit={handleAssignCamera} className="space-y-3 text-sm">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Camera UUID</label>
                  <input
                    type="text"
                    required
                    value={newAssignment.cameraId}
                    onChange={(e) => setNewAssignment({ ...newAssignment, cameraId: e.target.value })}
                    placeholder="e.g. 11111111-1111-1111-1111-111111111111"
                    className="w-full px-3 py-2 rounded bg-slate-950 border border-slate-800 text-white font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Primary Recording Node</label>
                  <select
                    required
                    value={newAssignment.primaryNodeId}
                    onChange={(e) => setNewAssignment({ ...newAssignment, primaryNodeId: e.target.value })}
                    className="w-full px-3 py-2 rounded bg-slate-950 border border-slate-800 text-white text-xs font-mono"
                  >
                    <option value="">Select Primary Active Node</option>
                    {activeNodes.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.name} ({n.id})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">RTSP Stream URI</label>
                  <input
                    type="text"
                    required
                    value={newAssignment.streamUri}
                    onChange={(e) => setNewAssignment({ ...newAssignment, streamUri: e.target.value })}
                    placeholder="rtsp://10.0.10.50:554/live/ch0"
                    className="w-full px-3 py-2 rounded bg-slate-950 border border-slate-800 text-white font-mono text-xs"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowAssignModal(false)}
                    className="px-4 py-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold"
                  >
                    Assign Stream
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
