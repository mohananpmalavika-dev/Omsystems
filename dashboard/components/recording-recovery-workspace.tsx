"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Database,
  Download,
  FileCheck2,
  FileVideo2,
  HardDrive,
  Layers,
  Loader2,
  Play,
  RefreshCw,
  Server,
  Shield,
  ShieldAlert,
  Sparkles,
  Upload,
  Wifi,
  WifiOff,
  X,
  Zap,
  Filter,
  Eye,
  Ban,
} from "lucide-react";
import {
  recordingRecoveryApi,
  type RecordingGapItem,
  type BackfillJobItem,
  type RecoveryStats,
  type EdgeBackfillAuditEntry,
} from "@/lib/api-client";

export function RecordingRecoveryWorkspace() {
  const [stats, setStats] = useState<RecoveryStats | null>(null);
  const [gaps, setGaps] = useState<RecordingGapItem[]>([]);
  const [jobs, setJobs] = useState<BackfillJobItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<EdgeBackfillAuditEntry[]>([]);
  const [activeTab, setActiveTab] = useState<"gaps" | "jobs" | "audit">("gaps");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Scan modal state
  const [scanModalOpen, setScanModalOpen] = useState(false);
  const [scanCameraId, setScanCameraId] = useState("");
  const [scanBranchId, setScanBranchId] = useState("");
  const [scanStartTime, setScanStartTime] = useState(() => {
    const d = new Date(Date.now() - 24 * 3600 * 1000);
    return d.toISOString().slice(0, 16);
  });
  const [scanEndTime, setScanEndTime] = useState(() => {
    return new Date().toISOString().slice(0, 16);
  });
  const [scanTolerance, setScanTolerance] = useState(5);
  const [scanning, setScanning] = useState(false);

  // Launch job modal state
  const [jobModalOpen, setJobModalOpen] = useState(false);
  const [targetGap, setTargetGap] = useState<RecordingGapItem | null>(null);
  const [jobCameraId, setJobCameraId] = useState("");
  const [jobBranchId, setJobBranchId] = useState("");
  const [jobStartTime, setJobStartTime] = useState("");
  const [jobEndTime, setJobEndTime] = useState("");
  const [jobRateLimit, setJobRateLimit] = useState(0);
  const [submittingJob, setSubmittingJob] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setRefreshing(true);
      const [statsRes, gapsRes, jobsRes, auditRes] = await Promise.all([
        recordingRecoveryApi.getStats().catch(() => ({ data: null })),
        recordingRecoveryApi.listGaps({ limit: 100 }).catch(() => ({ data: [] as RecordingGapItem[], meta: { total: 0, limit: 100, offset: 0 } })),
        recordingRecoveryApi.listJobs({ limit: 50 }).catch(() => ({ data: [] as BackfillJobItem[], meta: { total: 0, limit: 50, offset: 0 } })),
        recordingRecoveryApi.getAuditLogs({ limit: 50 }).catch(() => ({ data: [] as EdgeBackfillAuditEntry[], meta: { total: 0, limit: 50, offset: 0 } })),
      ]);

      if (statsRes?.data) setStats(statsRes.data);
      if (Array.isArray(gapsRes?.data)) setGaps(gapsRes.data);
      else if ((gapsRes as any)?.data?.data) setGaps((gapsRes as any).data.data);

      if (Array.isArray(jobsRes?.data)) setJobs(jobsRes.data);
      else if ((jobsRes as any)?.data?.data) setJobs((jobsRes as any).data.data);

      if (Array.isArray(auditRes?.data)) setAuditLogs(auditRes.data);
      else if ((auditRes as any)?.data?.data) setAuditLogs((auditRes as any).data.data);
    } catch (err: any) {
      console.error("Failed to load recording recovery data:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const filteredGaps = useMemo(() => {
    if (statusFilter === "ALL") return gaps;
    return gaps.filter((g) => g.status === statusFilter);
  }, [gaps, statusFilter]);

  const handleOpenScanModal = () => {
    setActionError(null);
    setActionSuccess(null);
    setScanModalOpen(true);
  };

  const handleExecuteScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scanCameraId) {
      setActionError("Camera ID is required for timeline scan");
      return;
    }

    setScanning(true);
    setActionError(null);
    try {
      const res = await recordingRecoveryApi.scanGaps({
        cameraId: scanCameraId,
        branchId: scanBranchId || undefined,
        startTime: new Date(scanStartTime).toISOString(),
        endTime: new Date(scanEndTime).toISOString(),
        toleranceSeconds: Number(scanTolerance) || 5,
      });

      const found = res.data?.length || 0;
      setActionSuccess(`Scan complete: detected ${found} recording gap${found === 1 ? "" : "s"}.`);
      setScanModalOpen(false);
      await fetchData();
    } catch (err: any) {
      setActionError(err?.message || "Failed to scan timeline gaps");
    } finally {
      setScanning(false);
    }
  };

  const handleOpenBackfillModal = (gap?: RecordingGapItem) => {
    setActionError(null);
    setActionSuccess(null);
    if (gap) {
      setTargetGap(gap);
      setJobCameraId(gap.cameraId);
      setJobBranchId(gap.branchId || "branch-01");
      setJobStartTime(gap.startTime.slice(0, 16));
      setJobEndTime((gap.endTime || new Date().toISOString()).slice(0, 16));
    } else {
      setTargetGap(null);
      setJobCameraId("");
      setJobBranchId("branch-01");
      const d = new Date(Date.now() - 3600 * 1000);
      setJobStartTime(d.toISOString().slice(0, 16));
      setJobEndTime(new Date().toISOString().slice(0, 16));
    }
    setJobRateLimit(0);
    setJobModalOpen(true);
  };

  const handleCreateJob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jobCameraId || !jobBranchId) {
      setActionError("Camera ID and Branch ID are required");
      return;
    }

    setSubmittingJob(true);
    setActionError(null);
    try {
      await recordingRecoveryApi.createJob({
        branchId: jobBranchId,
        cameraId: jobCameraId,
        gapId: targetGap?.id,
        triggerSource: "MANUAL_OPERATOR",
        windowStart: new Date(jobStartTime).toISOString(),
        windowEnd: new Date(jobEndTime).toISOString(),
        rateLimitKbps: Number(jobRateLimit) || 0,
      });

      setActionSuccess("Edge backfill job launched successfully.");
      setJobModalOpen(false);
      await fetchData();
    } catch (err: any) {
      setActionError(err?.message || "Failed to create backfill job");
    } finally {
      setSubmittingJob(false);
    }
  };

  const handleCancelJob = async (jobId: string) => {
    if (!confirm("Are you sure you want to cancel this backfill job?")) return;
    try {
      await recordingRecoveryApi.cancelJob(jobId);
      setActionSuccess("Backfill job cancelled.");
      await fetchData();
    } catch (err: any) {
      setActionError(err?.message || "Failed to cancel job");
    }
  };

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-800 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 text-indigo-400">
              <Zap className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">
                Recording Gap Recovery & Edge Backfill
              </h1>
              <p className="text-sm text-gray-400">
                Automated synchronization, zero-duplicate frame deduplication, and edge buffer backfill after WAN outages.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => void fetchData()}
            disabled={refreshing}
            className="flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-gray-300 bg-gray-900 border border-gray-700 rounded-lg hover:bg-gray-800 hover:text-white transition disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin text-indigo-400" : ""}`} />
            Refresh
          </button>
          <button
            onClick={handleOpenScanModal}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-lg transition"
          >
            <SearchIcon className="h-4 w-4 text-cyan-400" />
            Scan Timeline
          </button>
          <button
            onClick={() => handleOpenBackfillModal()}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 rounded-lg shadow-lg shadow-indigo-500/25 transition"
          >
            <Upload className="h-4 w-4" />
            Launch Backfill
          </button>
        </div>
      </div>

      {/* Notifications */}
      {actionError && (
        <div className="p-4 rounded-xl bg-red-950/40 border border-red-800/60 text-red-300 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-red-400 shrink-0" />
            <span className="text-sm">{actionError}</span>
          </div>
          <button onClick={() => setActionError(null)} className="text-red-400 hover:text-red-200">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {actionSuccess && (
        <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-800/60 text-emerald-300 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
            <span className="text-sm">{actionSuccess}</span>
          </div>
          <button onClick={() => setActionSuccess(null)} className="text-emerald-400 hover:text-emerald-200">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* System Status Telemetry Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 rounded-xl bg-gradient-to-r from-gray-900 via-gray-900/90 to-gray-900 border border-gray-800">
        <div className="flex items-center gap-3.5 border-b md:border-b-0 md:border-r border-gray-800 pb-3 md:pb-0 md:pr-4">
          <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <Wifi className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-gray-400">WAN Auto-Recovery</div>
            <div className="text-sm font-medium text-emerald-400 flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              Active Link Probing & Listeners
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3.5 border-b md:border-b-0 md:border-r border-gray-800 pb-3 md:pb-0 md:pr-4">
          <div className="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
            <HardDrive className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-gray-400">Edge Store-and-Forward</div>
            <div className="text-sm font-medium text-gray-200">
              Autonomous 30-Day FIFO Buffering
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3.5">
          <div className="p-2 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-400">
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-gray-400">Deduplication Engine</div>
            <div className="text-sm font-medium text-purple-300">
              Zero Duplicate Frames Guaranteed
            </div>
          </div>
        </div>
      </div>

      {/* KPI Metrics Summary Grid */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="p-4 rounded-xl bg-gray-900/60 border border-gray-800 shadow-sm">
          <div className="text-xs font-medium text-gray-400">Total Detected Gaps</div>
          <div className="text-2xl font-bold text-white mt-1">
            {stats?.totalGaps ?? gaps.length}
          </div>
          <div className="text-xs text-gray-500 mt-1 flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {stats ? `${Math.round(stats.totalLostSeconds / 60)} min lost` : "Scanned timeline"}
          </div>
        </div>

        <div className="p-4 rounded-xl bg-gray-900/60 border border-gray-800 shadow-sm">
          <div className="text-xs font-medium text-gray-400">Healed Gaps</div>
          <div className="text-2xl font-bold text-emerald-400 mt-1">
            {stats?.healedGaps ?? gaps.filter((g) => g.status === "HEALED").length}
          </div>
          <div className="text-xs text-emerald-500/80 mt-1 flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" />
            Recovered from edge
          </div>
        </div>

        <div className="p-4 rounded-xl bg-gray-900/60 border border-gray-800 shadow-sm">
          <div className="text-xs font-medium text-gray-400">Recovery Success</div>
          <div className="text-2xl font-bold text-cyan-400 mt-1">
            {stats?.healingSuccessRate !== undefined ? `${stats.healingSuccessRate}%` : "100%"}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {stats?.openGaps ?? gaps.filter((g) => g.status === "OPEN").length} open gaps pending
          </div>
        </div>

        <div className="p-4 rounded-xl bg-gray-900/60 border border-gray-800 shadow-sm">
          <div className="text-xs font-medium text-gray-400">Backfilled Footage</div>
          <div className="text-2xl font-bold text-indigo-400 mt-1">
            {stats ? formatBytes(stats.totalBackfilledBytes) : "0 B"}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {stats?.totalRecoveredSegments ?? 0} segments committed
          </div>
        </div>

        <div className="p-4 rounded-xl bg-gray-900/60 border border-gray-800 shadow-sm col-span-2 md:col-span-1">
          <div className="text-xs font-medium text-gray-400">Active Sync Jobs</div>
          <div className="text-2xl font-bold text-amber-400 mt-1">
            {stats?.activeJobsCount ?? jobs.filter((j) => j.status === "IN_PROGRESS").length}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {stats?.totalSkippedDuplicates ?? 0} duplicates omitted
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center justify-between border-b border-gray-800">
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab("gaps")}
            className={`pb-3 px-3.5 text-sm font-medium border-b-2 transition flex items-center gap-2 ${
              activeTab === "gaps"
                ? "border-indigo-500 text-indigo-400"
                : "border-transparent text-gray-400 hover:text-gray-200"
            }`}
          >
            <AlertTriangle className="h-4 w-4" />
            Timeline Gaps ({gaps.length})
          </button>
          <button
            onClick={() => setActiveTab("jobs")}
            className={`pb-3 px-3.5 text-sm font-medium border-b-2 transition flex items-center gap-2 ${
              activeTab === "jobs"
                ? "border-indigo-500 text-indigo-400"
                : "border-transparent text-gray-400 hover:text-gray-200"
            }`}
          >
            <Activity className="h-4 w-4" />
            Backfill Jobs ({jobs.length})
          </button>
          <button
            onClick={() => setActiveTab("audit")}
            className={`pb-3 px-3.5 text-sm font-medium border-b-2 transition flex items-center gap-2 ${
              activeTab === "audit"
                ? "border-indigo-500 text-indigo-400"
                : "border-transparent text-gray-400 hover:text-gray-200"
            }`}
          >
            <Shield className="h-4 w-4" />
            Audit Ledger ({auditLogs.length})
          </button>
        </div>

        {activeTab === "gaps" && (
          <div className="flex items-center gap-2 pb-2">
            <Filter className="h-3.5 w-3.5 text-gray-500" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-gray-900 border border-gray-800 text-xs text-gray-300 rounded px-2.5 py-1 focus:outline-none focus:border-indigo-500"
            >
              <option value="ALL">All Gaps</option>
              <option value="OPEN">Open Only</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="HEALED">Healed</option>
            </select>
          </div>
        )}
      </div>

      {/* Main Tab Content */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center text-gray-500">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-500 mb-3" />
          <p className="text-sm">Loading recording recovery telemetry...</p>
        </div>
      ) : activeTab === "gaps" ? (
        <div className="bg-gray-900/60 border border-gray-800 rounded-xl overflow-hidden">
          {filteredGaps.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              <FileVideo2 className="h-10 w-10 mx-auto text-gray-600 mb-3" />
              <div className="text-base font-medium text-gray-300">No Recording Gaps Found</div>
              <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
                Timeline continuity is verified. No missing footage intervals detected in the catalog for the selected filter.
              </p>
              <button
                onClick={handleOpenScanModal}
                className="mt-4 px-3.5 py-1.5 text-xs font-semibold text-indigo-400 border border-indigo-500/30 rounded-lg hover:bg-indigo-500/10"
              >
                Scan Camera Timeline
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-gray-300">
                <thead className="bg-gray-950/80 text-xs uppercase font-semibold text-gray-400 border-b border-gray-800">
                  <tr>
                    <th className="px-4 py-3.5">Status</th>
                    <th className="px-4 py-3.5">Camera ID</th>
                    <th className="px-4 py-3.5">Gap Start</th>
                    <th className="px-4 py-3.5">Gap End</th>
                    <th className="px-4 py-3.5">Duration</th>
                    <th className="px-4 py-3.5">Root Cause</th>
                    <th className="px-4 py-3.5">Recovered Data</th>
                    <th className="px-4 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/60 font-mono text-xs">
                  {filteredGaps.map((gap) => (
                    <tr key={gap.id} className="hover:bg-gray-850/40 transition">
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium font-sans ${
                            gap.status === "HEALED"
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              : gap.status === "IN_PROGRESS"
                              ? "bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse"
                              : gap.status === "UNRECOVERABLE"
                              ? "bg-red-500/10 text-red-400 border border-red-500/20"
                              : "bg-rose-500/10 text-rose-300 border border-rose-500/20"
                          }`}
                        >
                          {gap.status === "HEALED" && <CheckCircle2 className="h-3 w-3" />}
                          {gap.status === "IN_PROGRESS" && <Loader2 className="h-3 w-3 animate-spin" />}
                          {gap.status === "OPEN" && <AlertTriangle className="h-3 w-3" />}
                          {gap.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-white font-semibold">{gap.cameraId}</td>
                      <td className="px-4 py-3 text-gray-400">
                        {new Date(gap.startTime).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-gray-400">
                        {gap.endTime ? new Date(gap.endTime).toLocaleString() : "Ongoing"}
                      </td>
                      <td className="px-4 py-3 text-amber-300 font-semibold">
                        {gap.gapDurationSeconds > 60
                          ? `${Math.round(gap.gapDurationSeconds / 60)} min (${gap.gapDurationSeconds}s)`
                          : `${gap.gapDurationSeconds}s`}
                      </td>
                      <td className="px-4 py-3 text-gray-300 font-sans">
                        <span className="px-2 py-0.5 rounded bg-gray-800 text-gray-300 text-xs">
                          {gap.reason}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-sans">
                        {gap.segmentsRecoveredCount > 0 ? (
                          <span className="text-emerald-400">
                            {gap.segmentsRecoveredCount} segs ({formatBytes(gap.bytesRecovered)})
                          </span>
                        ) : (
                          <span className="text-gray-500">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {gap.status === "OPEN" ? (
                          <button
                            onClick={() => handleOpenBackfillModal(gap)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-sans font-medium text-indigo-400 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 rounded transition"
                          >
                            <Upload className="h-3 w-3" />
                            Backfill
                          </button>
                        ) : gap.status === "HEALED" ? (
                          <span className="text-xs text-emerald-500/70 font-sans">
                            Healed {gap.healedAt ? new Date(gap.healedAt).toLocaleTimeString() : ""}
                          </span>
                        ) : (
                          <span className="text-xs text-amber-500/70 font-sans">Synchronizing</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : activeTab === "jobs" ? (
        <div className="bg-gray-900/60 border border-gray-800 rounded-xl overflow-hidden">
          {jobs.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              <Activity className="h-10 w-10 mx-auto text-gray-600 mb-3" />
              <div className="text-base font-medium text-gray-300">No Backfill Jobs Recorded</div>
              <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
                No automatic or operator-initiated backfill jobs are currently tracked.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-gray-300">
                <thead className="bg-gray-950/80 text-xs uppercase font-semibold text-gray-400 border-b border-gray-800">
                  <tr>
                    <th className="px-4 py-3.5">Status</th>
                    <th className="px-4 py-3.5">Job ID & Trigger</th>
                    <th className="px-4 py-3.5">Camera & Branch</th>
                    <th className="px-4 py-3.5">Window Span</th>
                    <th className="px-4 py-3.5">Synced / Reconciled</th>
                    <th className="px-4 py-3.5">Duplicates Omitted</th>
                    <th className="px-4 py-3.5">Transferred</th>
                    <th className="px-4 py-3.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/60 font-mono text-xs">
                  {jobs.map((job) => (
                    <tr key={job.id} className="hover:bg-gray-850/40 transition">
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium font-sans ${
                            job.status === "COMPLETED"
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              : job.status === "IN_PROGRESS"
                              ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 animate-pulse"
                              : job.status === "CANCELLED"
                              ? "bg-gray-800 text-gray-400 border border-gray-700"
                              : "bg-red-500/10 text-red-400 border border-red-500/20"
                          }`}
                        >
                          {job.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-white font-semibold">{job.id.slice(0, 8)}...</div>
                        <div className="text-gray-500 font-sans text-xs">{job.triggerSource}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-white font-medium">{job.cameraId}</div>
                        <div className="text-gray-500 font-sans text-xs">{job.branchId}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">
                        <div>{new Date(job.windowStart).toLocaleTimeString()}</div>
                        <div className="text-gray-500">to {new Date(job.windowEnd).toLocaleTimeString()}</div>
                      </td>
                      <td className="px-4 py-3 font-sans">
                        <span className="text-emerald-400 font-semibold">{job.syncedSegments} synced</span>
                        {job.reconciledOverlaps > 0 && (
                          <span className="text-purple-400 text-xs block">
                            +{job.reconciledOverlaps} overlaps adjusted
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-400 font-sans">
                        {job.skippedDuplicates} identical
                      </td>
                      <td className="px-4 py-3 text-cyan-300 font-semibold">
                        {formatBytes(job.transferredBytes)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {job.status === "IN_PROGRESS" || job.status === "PENDING" ? (
                          <button
                            onClick={() => handleCancelJob(job.id)}
                            className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-sans text-red-400 hover:text-red-300 border border-red-800/60 rounded"
                          >
                            <Ban className="h-3 w-3" />
                            Cancel
                          </button>
                        ) : (
                          <span className="text-gray-600 font-sans text-xs">Finalized</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-gray-900/60 border border-gray-800 rounded-xl overflow-hidden">
          {auditLogs.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              <Shield className="h-10 w-10 mx-auto text-gray-600 mb-3" />
              <div className="text-base font-medium text-gray-300">No Audit Logs Recorded</div>
              <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
                Immutable audit ledger tracks every segment deduplicated, boundary adjusted, or stored.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-gray-300">
                <thead className="bg-gray-950/80 text-xs uppercase font-semibold text-gray-400 border-b border-gray-800">
                  <tr>
                    <th className="px-4 py-3.5">Timestamp</th>
                    <th className="px-4 py-3.5">Action</th>
                    <th className="px-4 py-3.5">Camera ID</th>
                    <th className="px-4 py-3.5">Segment ID</th>
                    <th className="px-4 py-3.5">SHA-256 Hash</th>
                    <th className="px-4 py-3.5">File Size</th>
                    <th className="px-4 py-3.5">Frame Boundary</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/60 font-mono text-xs">
                  {auditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-gray-850/40 transition">
                      <td className="px-4 py-3 text-gray-400">
                        {new Date(log.logged_at).toLocaleTimeString()}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-sans font-medium ${
                            log.action === "SYNCHRONIZED"
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              : log.action === "OVERLAP_RECONCILED"
                              ? "bg-purple-500/10 text-purple-300 border border-purple-500/20"
                              : "bg-gray-800 text-gray-400 border border-gray-700"
                          }`}
                        >
                          {log.action}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-white font-medium">{log.camera_id}</td>
                      <td className="px-4 py-3 text-gray-300">{log.segment_id.slice(0, 16)}...</td>
                      <td className="px-4 py-3 text-cyan-400">
                        {log.checksum_sha256 ? `${log.checksum_sha256.slice(0, 12)}...` : "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-300 font-sans">{formatBytes(Number(log.file_size))}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs font-sans">
                        {new Date(log.start_time).toLocaleTimeString()} - {new Date(log.end_time).toLocaleTimeString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Scan Modal */}
      {scanModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-gray-800 pb-3">
              <div className="flex items-center gap-2">
                <SearchIcon className="h-5 w-5 text-indigo-400" />
                <h2 className="text-lg font-bold text-white">Scan Timeline for Gaps</h2>
              </div>
              <button
                onClick={() => setScanModalOpen(false)}
                className="text-gray-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleExecuteScan} className="space-y-4 text-sm">
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">Camera ID *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. CAM-VAULT-01"
                  value={scanCameraId}
                  onChange={(e) => setScanCameraId(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">Branch ID (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. branch-alpha-01"
                  value={scanBranchId}
                  onChange={(e) => setScanBranchId(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-300 mb-1">Start Time</label>
                  <input
                    type="datetime-local"
                    value={scanStartTime}
                    onChange={(e) => setScanStartTime(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-white text-xs focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-300 mb-1">End Time</label>
                  <input
                    type="datetime-local"
                    value={scanEndTime}
                    onChange={(e) => setScanEndTime(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-white text-xs focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">
                  Gap Tolerance (Seconds)
                </label>
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={scanTolerance}
                  onChange={(e) => setScanTolerance(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Minimum missing duration between consecutive segments to classify as a gap (default: 5s).
                </p>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-gray-800">
                <button
                  type="button"
                  onClick={() => setScanModalOpen(false)}
                  className="px-4 py-2 text-sm text-gray-300 hover:text-white bg-gray-800 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={scanning}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg disabled:opacity-50"
                >
                  {scanning && <Loader2 className="h-4 w-4 animate-spin" />}
                  Execute Timeline Scan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Launch Backfill Modal */}
      {jobModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-gray-800 pb-3">
              <div className="flex items-center gap-2">
                <Upload className="h-5 w-5 text-indigo-400" />
                <h2 className="text-lg font-bold text-white">
                  {targetGap ? "Backfill Recording Gap" : "Launch Edge Backfill Job"}
                </h2>
              </div>
              <button onClick={() => setJobModalOpen(false)} className="text-gray-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateJob} className="space-y-4 text-sm">
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">Camera ID *</label>
                <input
                  type="text"
                  required
                  value={jobCameraId}
                  onChange={(e) => setJobCameraId(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">Branch ID *</label>
                <input
                  type="text"
                  required
                  value={jobBranchId}
                  onChange={(e) => setJobBranchId(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-300 mb-1">Window Start</label>
                  <input
                    type="datetime-local"
                    value={jobStartTime}
                    onChange={(e) => setJobStartTime(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-white text-xs focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-300 mb-1">Window End</label>
                  <input
                    type="datetime-local"
                    value={jobEndTime}
                    onChange={(e) => setJobEndTime(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-white text-xs focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">
                  Bandwidth Rate Limit (Kbps)
                </label>
                <input
                  type="number"
                  min="0"
                  step="500"
                  placeholder="0 = Unlimited bandwidth"
                  value={jobRateLimit}
                  onChange={(e) => setJobRateLimit(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Enforces upload pacing to prevent saturating production branch network (e.g. 5000 kbps).
                </p>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-gray-800">
                <button
                  type="button"
                  onClick={() => setJobModalOpen(false)}
                  className="px-4 py-2 text-sm text-gray-300 hover:text-white bg-gray-800 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingJob}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 rounded-lg disabled:opacity-50"
                >
                  {submittingJob && <Loader2 className="h-4 w-4 animate-spin" />}
                  Queue Backfill Job
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function SearchIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
      />
    </svg>
  );
}
