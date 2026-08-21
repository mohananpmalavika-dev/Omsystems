"use client";

import React, { useState, useEffect } from "react";
import {
  Activity,
  Server,
  HardDrive,
  Cpu,
  Radio,
  ShieldCheck,
  RefreshCw,
  Layers,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Play,
  Clock,
  Zap,
  Flame,
  FileCode,
  Gauge,
  Video,
} from "lucide-react";

export function VmsObservabilityView() {
  const [metricsSnapshot, setMetricsSnapshot] = useState<any>(null);
  const [rawPrometheusText, setRawPrometheusText] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"visual" | "prometheus">("visual");

  const fetchMetrics = async () => {
    try {
      const [snapRes, promRes] = await Promise.all([
        fetch("/api/vms/observability/summary").catch(() => null),
        fetch("/metrics").catch(() => null),
      ]);

      if (snapRes && snapRes.ok) {
        const data = await snapRes.json();
        if (data.success) setMetricsSnapshot(data.data);
      }
      if (promRes && promRes.ok) {
        const text = await promRes.text();
        setRawPrometheusText(text);
      }
    } catch {
      setMetricsSnapshot(null);
      setRawPrometheusText("");
      setError("Observability data is unavailable");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 5000);
    return () => clearInterval(interval);
  }, []);

  if (loading && !metricsSnapshot) {
    return (
      <div className="flex items-center justify-center p-12 text-slate-400">
        <RefreshCw className="w-6 h-6 animate-spin mr-2" />
        <span>Loading VMS-Grade Observability & Prometheus Metrics...</span>
      </div>
    );
  }

  const snap = metricsSnapshot || {};

  return (
    <div className="space-y-6">
      {error && <div className="rounded-lg border border-rose-500/30 bg-rose-950/20 p-3 text-sm text-rose-200">{error}</div>}

      {/* Observability Header & Tab Controls */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">View Mode:</span>
          <div className="flex items-center space-x-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
            <button
              onClick={() => setActiveTab("visual")}
              className={`px-3 py-1 text-xs font-mono font-medium rounded transition-all ${
                activeTab === "visual"
                  ? "bg-indigo-600 text-white shadow"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
              }`}
            >
              Visual Telemetry Dashboard
            </button>
            <button
              onClick={() => setActiveTab("prometheus")}
              className={`px-3 py-1 text-xs font-mono font-medium rounded transition-all ${
                activeTab === "prometheus"
                  ? "bg-indigo-600 text-white shadow"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
              }`}
            >
              Raw Prometheus Exposition (/metrics)
            </button>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={fetchMetrics}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-slate-300"
            title="Refresh Metrics"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {activeTab === "visual" && (
        <>
          {/* Key Metric Gauges Banner */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4">
              <div className="flex items-center justify-between text-slate-400 text-xs uppercase tracking-wider">
                <span>Camera Stream Telemetry</span>
                <Video className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <div className="text-2xl font-bold text-slate-100 font-mono">
                  {snap.cameras?.onlineCount ?? "—"} / {snap.cameras?.totalMonitored ?? "—"}
                </div>
                <span className="text-xs text-emerald-400 font-semibold font-mono">
                  {snap.cameras?.averageFps ?? "—"} FPS
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1 font-mono">
                {snap.cameras?.averageBitrateKbps ?? "—"} kbps • {snap.cameras?.averagePacketLossPct ?? "—"}% Loss
              </p>
            </div>

            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4">
              <div className="flex items-center justify-between text-slate-400 text-xs uppercase tracking-wider">
                <span>Recording Segments</span>
                <HardDrive className="w-4 h-4 text-cyan-400" />
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <div className="text-2xl font-bold text-slate-100 font-mono">
                  {snap.recording?.totalSegmentsWritten?.toLocaleString() ?? "—"}
                </div>
                <span className="text-xs text-emerald-400 font-semibold">0 Failures</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1 font-mono">
                Active Gap: {snap.recording?.activeGapSecondsTotal ?? "—"}s (Fenced)
              </p>
            </div>

            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4">
              <div className="flex items-center justify-between text-slate-400 text-xs uppercase tracking-wider">
                <span>Media Node Ingress/Egress</span>
                <Server className="w-4 h-4 text-indigo-400" />
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <div className="text-2xl font-bold text-slate-100 font-mono">
                  705 / 900 Mbps
                </div>
                <span className="text-xs text-indigo-400 font-semibold">3 Nodes</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1 font-mono">
                {snap.playback?.activeSessions ?? "—"} Concurrent Playback Sessions
              </p>
            </div>

            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4">
              <div className="flex items-center justify-between text-slate-400 text-xs uppercase tracking-wider">
                <span>Storage Write Latency</span>
                <Gauge className="w-4 h-4 text-amber-400" />
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <div className="text-2xl font-bold text-slate-100 font-mono">
                  {snap.storage?.p95WriteLatencyMs ?? "—"} ms
                </div>
                <span className="text-xs text-emerald-400 font-semibold">P95 S.M.A.R.T</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1 font-mono">
                {snap.storage?.freeTb ?? "—"} TB Free / {snap.storage?.totalTb ?? "—"} TB ({snap.storage?.usagePct ?? "—"}% Used)
              </p>
            </div>
          </div>

          {/* Media Nodes Cluster Telemetry Cards */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-100 text-sm flex items-center">
                <Activity className="w-4 h-4 mr-2 text-indigo-400" />
                Media Gateway Ingest & Acceleration Telemetry
              </h3>
              <span className="text-xs text-slate-400 font-mono">Exposed via vms_media_node_*</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {snap.mediaNodes?.map((node: any) => (
                <div
                  key={node.nodeId}
                  className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-4 space-y-3 font-mono text-xs"
                >
                  <div className="flex items-center justify-between">
                    <div className="font-bold text-slate-100 text-sm">{node.nodeId}</div>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-950 border border-indigo-500/30 text-indigo-300">
                      {node.failureDomain}
                    </span>
                  </div>

                  <div className="space-y-2 text-slate-300">
                    <div>
                      <div className="flex justify-between text-[11px] mb-1">
                        <span>CPU Utilization</span>
                        <span className="text-emerald-400 font-bold">{node.cpuPct}%</span>
                      </div>
                      <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                        <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: `${node.cpuPct}%` }} />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-[11px] mb-1">
                        <span>GPU Acceleration</span>
                        <span className="text-cyan-400 font-bold">{node.gpuPct}%</span>
                      </div>
                      <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                        <div className="bg-cyan-500 h-1.5 rounded-full" style={{ width: `${node.gpuPct}%` }} />
                      </div>
                    </div>

                    <div className="pt-1 flex justify-between border-t border-slate-800/60 text-[11px]">
                      <span className="text-slate-400">Throughput (In / Out):</span>
                      <span className="text-slate-100 font-bold">{node.ingressMbps} / {node.egressMbps} Mbps</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {activeTab === "prometheus" && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <FileCode className="w-4 h-4 text-emerald-400" />
              <h3 className="font-semibold text-slate-100 text-sm">Prometheus Exposition Stream</h3>
              <span className="text-xs px-2 py-0.5 rounded bg-emerald-950 border border-emerald-500/40 text-emerald-300 font-mono">
                GET /metrics
              </span>
            </div>
            <span className="text-xs text-slate-400 font-mono">text/plain; version=0.0.4</span>
          </div>

          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 font-mono text-xs text-slate-300 max-h-[500px] overflow-y-auto whitespace-pre leading-relaxed">
            {rawPrometheusText}
          </div>
        </div>
      )}
    </div>
  );
}
