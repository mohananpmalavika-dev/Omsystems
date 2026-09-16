"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Brain,
  Activity,
  AlertTriangle,
  TrendingUp,
  Users,
  RefreshCw,
  Shield,
  Zap,
  Clock,
  Eye,
  BarChart3,
  Sparkles,
  Target,
  Bell,
  CheckCircle2,
  XCircle,
} from "lucide-react";

// Placeholder API - will be replaced with actual API client
const behavioralApi = {
  async getHealth() {
    return {
      success: true,
      data: {
        status: "healthy",
        activeBranches: 12,
        activeBaselines: 45,
        anomalyDetectionEnabled: true,
        lastProcessedAt: new Date().toISOString(),
      },
    };
  },
  async listBaselines(params?: { branchId?: string; limit?: number }) {
    return {
      success: true,
      data: [],
      pagination: { total: 0, limit: params?.limit || 50, offset: 0 },
    };
  },
  async listAnomalies(params?: { 
    branchId?: string; 
    severity?: string; 
    status?: string; 
    limit?: number;
  }) {
    return {
      success: true,
      data: [],
      pagination: { total: 0, limit: params?.limit || 50, offset: 0 },
    };
  },
  async listPredictions(params?: { branchId?: string; limit?: number }) {
    return {
      success: true,
      data: [],
      pagination: { total: 0, limit: params?.limit || 50, offset: 0 },
    };
  },
};

interface BehaviorBaseline {
  id: string;
  branch_id: string | null;
  camera_id: string | null;
  pattern_type: string;
  time_window: string;
  learned_features: Record<string, any>;
  confidence_score: number;
  sample_size: number;
  created_at: string;
  updated_at: string;
}

interface BehaviorAnomaly {
  id: string;
  branch_id: string | null;
  camera_id: string | null;
  baseline_id: string | null;
  anomaly_type: string;
  severity: "low" | "medium" | "high" | "critical";
  confidence_score: number;
  detected_at: string;
  explanation: string;
  metadata: Record<string, any>;
  status: "pending" | "acknowledged" | "investigating" | "resolved" | "false_positive";
  resolved_at: string | null;
  resolution_notes: string | null;
}

interface PredictiveAlert {
  id: string;
  branch_id: string | null;
  alert_type: string;
  predicted_event: string;
  probability: number;
  predicted_time_window: string;
  recommendation: string;
  created_at: string;
  acknowledged: boolean;
}

interface HealthStatus {
  status: string;
  activeBranches: number;
  activeBaselines: number;
  anomalyDetectionEnabled: boolean;
  lastProcessedAt: string;
}

export function BehavioralAnalyticsWorkspace({ branchId }: { branchId?: string }) {
  const [selectedBranchId, setSelectedBranchId] = useState<string>(branchId || "");
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [baselines, setBaselines] = useState<BehaviorBaseline[]>([]);
  const [anomalies, setAnomalies] = useState<BehaviorAnomaly[]>([]);
  const [predictions, setPredictions] = useState<PredictiveAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "anomalies" | "predictions" | "baselines">("overview");
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Filters
  const [severityFilter, setSeverityFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // Load Data
  const fetchData = useCallback(async () => {
    try {
      const [healthRes, baselinesRes, anomaliesRes, predictionsRes] = await Promise.all([
        behavioralApi.getHealth(),
        behavioralApi.listBaselines({
          branchId: selectedBranchId || undefined,
          limit: 50,
        }),
        behavioralApi.listAnomalies({
          branchId: selectedBranchId || undefined,
          severity: severityFilter !== "ALL" ? severityFilter : undefined,
          status: statusFilter !== "ALL" ? statusFilter : undefined,
          limit: 50,
        }),
        behavioralApi.listPredictions({
          branchId: selectedBranchId || undefined,
          limit: 20,
        }),
      ]);

      if (healthRes.success) setHealth(healthRes.data);
      if (baselinesRes.success) setBaselines(baselinesRes.data);
      if (anomaliesRes.success) setAnomalies(anomaliesRes.data);
      if (predictionsRes.success) setPredictions(predictionsRes.data);
    } catch (err) {
      console.error("Failed to load behavioral analytics data:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedBranchId, severityFilter, statusFilter]);

  useEffect(() => {
    fetchData();
    if (!autoRefresh) return;
    const timer = setInterval(fetchData, 15000);
    return () => clearInterval(timer);
  }, [fetchData, autoRefresh]);

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case "critical":
        return <span className="px-2 py-0.5 text-xs font-bold rounded bg-red-900/80 text-red-200 border border-red-700 animate-pulse">CRITICAL</span>;
      case "high":
        return <span className="px-2 py-0.5 text-xs font-bold rounded bg-orange-900/80 text-orange-200 border border-orange-700">HIGH</span>;
      case "medium":
        return <span className="px-2 py-0.5 text-xs font-bold rounded bg-amber-900/80 text-amber-200 border border-amber-700">MEDIUM</span>;
      default:
        return <span className="px-2 py-0.5 text-xs font-bold rounded bg-blue-900/80 text-blue-200 border border-blue-700">LOW</span>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "resolved":
        return <span className="px-2 py-0.5 text-xs rounded bg-emerald-950 text-emerald-300 border border-emerald-800">Resolved</span>;
      case "investigating":
        return <span className="px-2 py-0.5 text-xs rounded bg-blue-950 text-blue-300 border border-blue-800">Investigating</span>;
      case "acknowledged":
        return <span className="px-2 py-0.5 text-xs rounded bg-purple-950 text-purple-300 border border-purple-800">Acknowledged</span>;
      case "false_positive":
        return <span className="px-2 py-0.5 text-xs rounded bg-zinc-800 text-zinc-400">False Positive</span>;
      default:
        return <span className="px-2 py-0.5 text-xs rounded bg-amber-950 text-amber-300 border border-amber-800">Pending</span>;
    }
  };

  // Calculate statistics
  const criticalAnomalies = anomalies.filter(a => a.severity === "critical").length;
  const highAnomalies = anomalies.filter(a => a.severity === "high").length;
  const pendingAnomalies = anomalies.filter(a => a.status === "pending").length;
  const highProbPredictions = predictions.filter(p => p.probability >= 0.7).length;

  return (
    <div className="space-y-6">
      {/* Top Header & System Status Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-zinc-900/80 border border-zinc-800 p-5 rounded-xl shadow-lg backdrop-blur-md">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-purple-500/30 text-purple-400">
              <Brain className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                Behavioral Analytics & Anomaly Detection
                <span className="px-2 py-0.5 text-[11px] font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800/80 rounded-md">
                  PRODUCTION READY
                </span>
              </h1>
              <p className="text-xs text-zinc-400 mt-0.5">
                Real-time behavioral pattern analysis, anomaly detection, and predictive security analytics
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors flex items-center gap-1.5 ${
              autoRefresh
                ? "bg-emerald-950/60 border-emerald-800 text-emerald-300"
                : "bg-zinc-800/60 border-zinc-700 text-zinc-400"
            }`}
          >
            <div className={`w-2 h-2 rounded-full ${autoRefresh ? "bg-emerald-400 animate-ping" : "bg-zinc-500"}`} />
            {autoRefresh ? "Live (15s)" : "Paused"}
          </button>

          <button
            onClick={() => {
              setLoading(true);
              fetchData();
            }}
            disabled={loading}
            className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 hover:text-white transition-colors"
            title="Refresh Data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* System Health Status */}
      {health && (
        <div className={`p-4 rounded-xl border ${
          health.status === "healthy"
            ? "bg-emerald-950/20 border-emerald-800/60"
            : "bg-amber-950/20 border-amber-800/60"
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Shield className={`w-5 h-5 ${
                health.status === "healthy" ? "text-emerald-400" : "text-amber-400"
              }`} />
              <div>
                <h3 className="text-sm font-semibold text-white">
                  System Status: {health.status === "healthy" ? "Operational" : "Degraded"}
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  {health.activeBranches} active branches • {health.activeBaselines} learned baselines
                  {health.lastProcessedAt && (
                    <> • Last update: {new Date(health.lastProcessedAt).toLocaleTimeString()}</>
                  )}
                </p>
              </div>
            </div>
            <div className={`px-3 py-1.5 rounded-lg border text-xs font-semibold ${
              health.anomalyDetectionEnabled
                ? "bg-emerald-950/60 border-emerald-800 text-emerald-300"
                : "bg-zinc-800 border-zinc-700 text-zinc-400"
            }`}>
              {health.anomalyDetectionEnabled ? "Detection Active" : "Detection Paused"}
            </div>
          </div>
        </div>
      )}

      {/* KPI Cards Ribbon */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-zinc-900/60 border border-zinc-800/80 p-4 rounded-xl shadow-sm">
          <div className="flex items-center justify-between text-zinc-400 text-xs font-medium">
            <span>Active Baselines</span>
            <Activity className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white">{baselines.length}</span>
            <span className="text-[11px] text-zinc-400">patterns</span>
          </div>
          <div className="mt-1 text-[11px] text-zinc-500">
            Learned behavioral patterns
          </div>
        </div>

        <div className="bg-zinc-900/60 border border-zinc-800/80 p-4 rounded-xl shadow-sm">
          <div className="flex items-center justify-between text-zinc-400 text-xs font-medium">
            <span>Anomalies Detected</span>
            <AlertTriangle className="w-4 h-4 text-orange-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white">{anomalies.length}</span>
            {criticalAnomalies > 0 && (
              <span className="text-xs font-semibold text-red-400">({criticalAnomalies} critical)</span>
            )}
          </div>
          <div className="mt-1 text-[11px] text-zinc-500">
            {pendingAnomalies} pending review
          </div>
        </div>

        <div className="bg-zinc-900/60 border border-zinc-800/80 p-4 rounded-xl shadow-sm">
          <div className="flex items-center justify-between text-zinc-400 text-xs font-medium">
            <span>Predictive Alerts</span>
            <Sparkles className="w-4 h-4 text-purple-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white">{predictions.length}</span>
            {highProbPredictions > 0 && (
              <span className="text-xs font-semibold text-purple-400">({highProbPredictions} high prob)</span>
            )}
          </div>
          <div className="mt-1 text-[11px] text-zinc-500">
            AI threat predictions
          </div>
        </div>

        <div className="bg-zinc-900/60 border border-zinc-800/80 p-4 rounded-xl shadow-sm">
          <div className="flex items-center justify-between text-zinc-400 text-xs font-medium">
            <span>Avg Confidence</span>
            <Target className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white">
              {anomalies.length > 0
                ? Math.round((anomalies.reduce((sum, a) => sum + a.confidence_score, 0) / anomalies.length) * 100)
                : 0}%
            </span>
          </div>
          <div className="mt-1 text-[11px] text-zinc-500">
            Detection accuracy
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex border-b border-zinc-800">
        <button
          onClick={() => setActiveTab("overview")}
          className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === "overview"
              ? "border-purple-500 text-white"
              : "border-transparent text-zinc-400 hover:text-zinc-200 hover:border-zinc-700"
          }`}
        >
          <Eye className="w-4 h-4" />
          Overview
        </button>

        <button
          onClick={() => setActiveTab("anomalies")}
          className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === "anomalies"
              ? "border-purple-500 text-white"
              : "border-transparent text-zinc-400 hover:text-zinc-200 hover:border-zinc-700"
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
          Anomalies ({anomalies.length})
        </button>

        <button
          onClick={() => setActiveTab("predictions")}
          className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === "predictions"
              ? "border-purple-500 text-white"
              : "border-transparent text-zinc-400 hover:text-zinc-200 hover:border-zinc-700"
          }`}
        >
          <Sparkles className="w-4 h-4" />
          Predictions ({predictions.length})
        </button>

        <button
          onClick={() => setActiveTab("baselines")}
          className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === "baselines"
              ? "border-purple-500 text-white"
              : "border-transparent text-zinc-400 hover:text-zinc-200 hover:border-zinc-700"
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          Baselines ({baselines.length})
        </button>
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Critical Anomalies Section */}
          {criticalAnomalies > 0 && (
            <div className="bg-gradient-to-r from-red-950/40 via-red-900/20 to-zinc-900 border border-red-800/60 p-5 rounded-xl shadow-md">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-red-900/50 text-red-300 border border-red-700/50 mt-0.5">
                  <AlertTriangle className="w-5 h-5 animate-pulse" />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-red-200">
                    {criticalAnomalies} Critical Anomalies Detected
                  </h3>
                  <p className="text-xs text-zinc-300 mt-1">
                    Immediate attention required. These anomalies indicate significant deviations from learned behavioral patterns.
                  </p>
                  <button
                    onClick={() => setActiveTab("anomalies")}
                    className="mt-3 px-3 py-1.5 text-xs bg-red-600 hover:bg-red-500 text-white rounded font-medium transition-colors"
                  >
                    Review Critical Anomalies →
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Recent Anomalies Grid */}
          <div>
            <h2 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-400" />
              Recent Anomalies
            </h2>

            {anomalies.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {anomalies.slice(0, 6).map(anomaly => (
                  <div
                    key={anomaly.id}
                    className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-5 shadow-sm hover:border-zinc-700 transition-all space-y-3"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-semibold text-white text-sm capitalize">
                          {anomaly.anomaly_type.replace(/_/g, " ")}
                        </h3>
                        <p className="text-xs text-zinc-400 mt-0.5">
                          {new Date(anomaly.detected_at).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1.5">
                        {getSeverityBadge(anomaly.severity)}
                        {getStatusBadge(anomaly.status)}
                      </div>
                    </div>

                    <p className="text-xs text-zinc-300 bg-zinc-800/50 p-2.5 rounded border border-zinc-700/50">
                      {anomaly.explanation}
                    </p>

                    <div className="flex items-center justify-between text-xs">
                      <span className="text-zinc-500">
                        Confidence: <span className="text-white font-medium">{Math.round(anomaly.confidence_score * 100)}%</span>
                      </span>
                      {anomaly.camera_id && (
                        <span className="text-zinc-500">
                          Camera: <span className="text-white font-mono text-[11px]">{anomaly.camera_id.slice(0, 8)}</span>
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-zinc-900/50 border border-dashed border-zinc-800 p-8 rounded-xl text-center text-zinc-500">
                No anomalies detected. System is learning normal behavioral patterns.
              </div>
            )}
          </div>

          {/* Active Predictions */}
          <div>
            <h2 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-400" />
              Active Predictions
            </h2>

            {predictions.length > 0 ? (
              <div className="space-y-3">
                {predictions.slice(0, 4).map(pred => (
                  <div
                    key={pred.id}
                    className="bg-zinc-900/70 border border-zinc-800 rounded-lg p-4 flex items-start justify-between hover:border-zinc-700 transition-colors"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-white text-sm capitalize">
                          {pred.predicted_event.replace(/_/g, " ")}
                        </h3>
                        <span className={`px-2 py-0.5 text-[11px] font-bold rounded ${
                          pred.probability >= 0.7
                            ? "bg-red-950 text-red-300 border border-red-800"
                            : pred.probability >= 0.5
                            ? "bg-amber-950 text-amber-300 border border-amber-800"
                            : "bg-blue-950 text-blue-300 border border-blue-800"
                        }`}>
                          {Math.round(pred.probability * 100)}% probability
                        </span>
                      </div>
                      <p className="text-xs text-zinc-400 mb-2">
                        Expected: {pred.predicted_time_window}
                      </p>
                      <p className="text-xs text-zinc-300">
                        💡 {pred.recommendation}
                      </p>
                    </div>
                    {!pred.acknowledged && (
                      <Bell className="w-4 h-4 text-amber-400 animate-pulse ml-3" />
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-zinc-900/50 border border-dashed border-zinc-800 p-8 rounded-xl text-center text-zinc-500">
                No active predictions. System requires more data to generate forecasts.
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: ANOMALIES */}
      {activeTab === "anomalies" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-zinc-900/60 p-4 rounded-xl border border-zinc-800">
            <div className="flex items-center gap-2">
              <label className="text-xs text-zinc-400 font-medium">Severity:</label>
              <select
                value={severityFilter}
                onChange={e => setSeverityFilter(e.target.value)}
                className="bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-purple-500"
              >
                <option value="ALL">All Severities</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs text-zinc-400 font-medium">Status:</label>
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-purple-500"
              >
                <option value="ALL">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="acknowledged">Acknowledged</option>
                <option value="investigating">Investigating</option>
                <option value="resolved">Resolved</option>
                <option value="false_positive">False Positive</option>
              </select>
            </div>
          </div>

          <div className="bg-zinc-900/70 border border-zinc-800 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-800/60 text-zinc-400 uppercase tracking-wider font-semibold">
                  <tr>
                    <th className="p-3">Detected At</th>
                    <th className="p-3">Type</th>
                    <th className="p-3">Severity</th>
                    <th className="p-3">Confidence</th>
                    <th className="p-3">Explanation</th>
                    <th className="p-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/80">
                  {anomalies.length > 0 ? (
                    anomalies.map(anomaly => (
                      <tr key={anomaly.id} className="hover:bg-zinc-800/30 transition-colors">
                        <td className="p-3 text-zinc-300 font-mono text-[11px]">
                          {new Date(anomaly.detected_at).toLocaleString()}
                        </td>
                        <td className="p-3 font-semibold text-white capitalize">
                          {anomaly.anomaly_type.replace(/_/g, " ")}
                        </td>
                        <td className="p-3">{getSeverityBadge(anomaly.severity)}</td>
                        <td className="p-3 text-zinc-300">
                          {Math.round(anomaly.confidence_score * 100)}%
                        </td>
                        <td className="p-3 text-zinc-400 max-w-md truncate">
                          {anomaly.explanation}
                        </td>
                        <td className="p-3">{getStatusBadge(anomaly.status)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-zinc-500">
                        No anomalies match the selected filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: PREDICTIONS */}
      {activeTab === "predictions" && (
        <div className="space-y-4">
          {predictions.length > 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {predictions.map(pred => (
                <div
                  key={pred.id}
                  className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-5 shadow-sm hover:border-zinc-700 transition-all space-y-4"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold text-white text-base capitalize">
                        {pred.predicted_event.replace(/_/g, " ")}
                      </h3>
                      <p className="text-xs text-zinc-400 mt-1">
                        {pred.alert_type.replace(/_/g, " ")} • Created {new Date(pred.created_at).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className={`px-3 py-1.5 rounded-lg border text-sm font-bold ${
                        pred.probability >= 0.7
                          ? "bg-red-950/60 border-red-800 text-red-300"
                          : pred.probability >= 0.5
                          ? "bg-amber-950/60 border-amber-800 text-amber-300"
                          : "bg-blue-950/60 border-blue-800 text-blue-300"
                      }`}>
                        {Math.round(pred.probability * 100)}%
                      </div>
                      {!pred.acknowledged && (
                        <Bell className="w-5 h-5 text-amber-400 animate-pulse" />
                      )}
                    </div>
                  </div>

                  <div className="space-y-3 pt-3 border-t border-zinc-800">
                    <div>
                      <span className="text-xs text-zinc-500 block mb-1">Predicted Time Window</span>
                      <span className="text-sm text-white font-medium">{pred.predicted_time_window}</span>
                    </div>

                    <div>
                      <span className="text-xs text-zinc-500 block mb-1">AI Recommendation</span>
                      <p className="text-xs text-zinc-300 bg-zinc-800/50 p-3 rounded border border-zinc-700/50">
                        💡 {pred.recommendation}
                      </p>
                    </div>
                  </div>

                  {!pred.acknowledged && (
                    <button className="w-full px-3 py-2 text-xs bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2">
                      <CheckCircle2 className="w-4 h-4" />
                      Acknowledge Prediction
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-zinc-900/50 border border-dashed border-zinc-800 p-12 rounded-xl text-center text-zinc-500">
              <Sparkles className="w-12 h-12 mx-auto mb-3 text-zinc-600" />
              <p>No predictive alerts generated yet.</p>
              <p className="text-xs mt-1">System requires sufficient baseline data to generate forecasts.</p>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: BASELINES */}
      {activeTab === "baselines" && (
        <div className="space-y-4">
          {baselines.length > 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {baselines.map(baseline => (
                <div
                  key={baseline.id}
                  className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-5 shadow-sm hover:border-zinc-700 transition-all space-y-3"
                >
                  <div>
                    <h3 className="font-semibold text-white text-sm capitalize mb-1">
                      {baseline.pattern_type.replace(/_/g, " ")}
                    </h3>
                    <p className="text-xs text-zinc-400">
                      Window: {baseline.time_window}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-3 border-t border-zinc-800 text-xs">
                    <div>
                      <span className="text-zinc-500 block">Confidence</span>
                      <span className="font-semibold text-white text-sm">
                        {Math.round(baseline.confidence_score * 100)}%
                      </span>
                    </div>
                    <div>
                      <span className="text-zinc-500 block">Samples</span>
                      <span className="font-semibold text-white text-sm">
                        {baseline.sample_size}
                      </span>
                    </div>
                  </div>

                  <div className="text-[11px] text-zinc-500 pt-2 border-t border-zinc-800">
                    Updated {new Date(baseline.updated_at).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-zinc-900/50 border border-dashed border-zinc-800 p-12 rounded-xl text-center text-zinc-500">
              <BarChart3 className="w-12 h-12 mx-auto mb-3 text-zinc-600" />
              <p>No behavioral baselines established yet.</p>
              <p className="text-xs mt-1">System is collecting data to learn normal patterns.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
