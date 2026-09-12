"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Activity,
  AlertCircle,
  Archive,
  ArrowRight,
  CheckCircle2,
  Clock,
  Cloud,
  CloudDownload,
  CloudUpload,
  Copy,
  Database,
  ExternalLink,
  FileCheck2,
  FileVideo,
  Filter,
  Flame,
  HardDrive,
  Info,
  Key,
  Layers,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Snowflake,
  Sparkles,
  TrendingDown,
  X,
  Zap,
} from "lucide-react";
import {
  coldCloudArchiveApi,
  type ColdCloudArchiveJobItem,
  type ArchivePolicyItem,
  type ArchiveAuditLogItem,
  type ArchiveStatisticsItem,
} from "@/lib/api-client";

export function ColdCloudArchiveWorkspace() {
  const [stats, setStats] = useState<ArchiveStatisticsItem | null>(null);
  const [jobs, setJobs] = useState<ColdCloudArchiveJobItem[]>([]);
  const [policies, setPolicies] = useState<ArchivePolicyItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<ArchiveAuditLogItem[]>([]);
  const [activeTab, setActiveTab] = useState<"jobs" | "policies" | "audit">("jobs");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Restore Modal State
  const [restoreModalOpen, setRestoreModalOpen] = useState(false);
  const [selectedJobForRestore, setSelectedJobForRestore] = useState<ColdCloudArchiveJobItem | null>(null);
  const [restoreTier, setRestoreTier] = useState<"Expedited" | "Standard" | "Bulk">("Standard");
  const [restoreDays, setRestoreDays] = useState<number>(7);
  const [restoreSubmitting, setRestoreSubmitting] = useState(false);

  // New Export Modal State
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [newIncidentId, setNewIncidentId] = useState("");
  const [newCameraId, setNewCameraId] = useState("");
  const [newIncidentNumber, setNewIncidentNumber] = useState("");
  const [newStorageTier, setNewStorageTier] = useState<"GLACIER" | "DEEP_ARCHIVE" | "GLACIER_IR">("GLACIER");
  const [exportSubmitting, setExportSubmitting] = useState(false);

  // New Policy Modal State
  const [policyModalOpen, setPolicyModalOpen] = useState(false);
  const [newPolicyName, setNewPolicyName] = useState("");
  const [newPolicyTier, setNewPolicyTier] = useState<"GLACIER" | "DEEP_ARCHIVE" | "GLACIER_IR">("GLACIER");
  const [newPolicyRetentionDays, setNewPolicyRetentionDays] = useState(2555);
  const [policySubmitting, setPolicySubmitting] = useState(false);

  const [sweepSubmitting, setSweepSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setRefreshing(true);
      const [statsRes, jobsRes, policiesRes, auditRes] = await Promise.all([
        coldCloudArchiveApi.getStatistics().catch(() => ({ data: null })),
        coldCloudArchiveApi.listJobs({ limit: 50 }).catch(() => ({ data: [] })),
        coldCloudArchiveApi.listPolicies().catch(() => ({ data: [] })),
        coldCloudArchiveApi.getAuditLogs({ limit: 50 }).catch(() => ({ data: [] })),
      ]);

      if (statsRes && (statsRes as any).data) setStats((statsRes as any).data);
      if (jobsRes && (jobsRes as any).data) setJobs((jobsRes as any).data);
      if (policiesRes && (policiesRes as any).data) setPolicies((policiesRes as any).data);
      if (auditRes && (auditRes as any).data) setAuditLogs((auditRes as any).data);
    } catch (err: any) {
      setActionError(err.message || "Failed to load archive workspace data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const timer = setInterval(() => {
      loadData();
    }, 15000);
    return () => clearInterval(timer);
  }, [loadData]);

  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      const matchesStatus =
        statusFilter === "ALL"
          ? true
          : statusFilter === "RESTORED"
          ? job.restoreStatus === "RESTORED"
          : statusFilter === "RESTORING"
          ? job.restoreStatus === "RESTORING" || job.restoreStatus === "RESTORE_REQUESTED"
          : job.archiveStatus === statusFilter;

      const q = searchQuery.toLowerCase().trim();
      const matchesQuery =
        !q ||
        job.incidentNumber?.toLowerCase().includes(q) ||
        job.incidentId?.toLowerCase().includes(q) ||
        job.cameraId?.toLowerCase().includes(q) ||
        job.s3Key?.toLowerCase().includes(q) ||
        job.checksumSha256?.toLowerCase().includes(q);

      return matchesStatus && matchesQuery;
    });
  }, [jobs, statusFilter, searchQuery]);

  const handleRunSweep = async () => {
    try {
      setSweepSubmitting(true);
      setActionError(null);
      const res = await coldCloudArchiveApi.runAutoExport();
      const count = res.data?.createdJobsCount || 0;
      setActionSuccess(`Automated policy sweep completed: ${count} marked incident video(s) queued for Glacier archival.`);
      await loadData();
    } catch (err: any) {
      setActionError(err.message || "Failed to run automated archive sweep");
    } finally {
      setSweepSubmitting(false);
    }
  };

  const handleCreateExport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newIncidentId.trim() || !newCameraId.trim()) {
      setActionError("Incident ID and Camera ID are required");
      return;
    }

    try {
      setExportSubmitting(true);
      setActionError(null);
      await coldCloudArchiveApi.createJob({
        incidentId: newIncidentId.trim(),
        cameraId: newCameraId.trim(),
        incidentNumber: newIncidentNumber.trim() || undefined,
        storageTier: newStorageTier,
      });

      setActionSuccess(`Incident export created and initiated directly to S3 / ${newStorageTier}.`);
      setExportModalOpen(false);
      setNewIncidentId("");
      setNewCameraId("");
      setNewIncidentNumber("");
      await loadData();
    } catch (err: any) {
      setActionError(err.message || "Failed to initiate archive export");
    } finally {
      setExportSubmitting(false);
    }
  };

  const handleRequestRestore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedJobForRestore) return;

    try {
      setRestoreSubmitting(true);
      setActionError(null);
      await coldCloudArchiveApi.requestRestore(selectedJobForRestore.id, {
        tier: restoreTier,
        validityDays: restoreDays,
      });

      setActionSuccess(
        `Glacier restore requested (${restoreTier} tier, ${restoreDays} days retention). Video will be accessible once restored.`
      );
      setRestoreModalOpen(false);
      setSelectedJobForRestore(null);
      await loadData();
    } catch (err: any) {
      setActionError(err.message || "Failed to request Glacier restore");
    } finally {
      setRestoreSubmitting(false);
    }
  };

  const handleCreatePolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPolicyName.trim()) {
      setActionError("Policy name is required");
      return;
    }

    try {
      setPolicySubmitting(true);
      setActionError(null);
      await coldCloudArchiveApi.createPolicy({
        name: newPolicyName.trim(),
        targetStorageClass: newPolicyTier,
        retentionDays: newPolicyRetentionDays,
        triggerCondition: {
          incidentStatuses: ["archived", "closed"],
          markedForArchive: true,
        },
      });

      setActionSuccess(`Archival policy "${newPolicyName}" created successfully.`);
      setPolicyModalOpen(false);
      setNewPolicyName("");
      await loadData();
    } catch (err: any) {
      setActionError(err.message || "Failed to create policy");
    } finally {
      setPolicySubmitting(false);
    }
  };

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0) return "0 GB";
    const gb = bytes / (1024 * 1024 * 1024);
    if (gb >= 1000) {
      return `${(gb / 1024).toFixed(2)} TB`;
    }
    return `${gb.toFixed(2)} GB`;
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="rounded-xl border border-slate-700/60 bg-gradient-to-r from-slate-900 via-sky-950/40 to-slate-900 p-6 shadow-xl backdrop-blur-md">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-500/20 border border-sky-400/40 text-sky-400 shadow-inner">
                <Snowflake className="h-6 w-6 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold tracking-tight text-white">Cold Cloud Archive Export</h1>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-400 border border-emerald-500/20">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    S3 Glacier Immutable
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/10 px-2 py-0.5 text-xs font-medium text-sky-400 border border-sky-500/20">
                    <Lock className="h-3 w-3" />
                    KMS Encrypted
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-400">
                  Long-term automated archival of marked incident video to S3 / Glacier with cryptographic SHA-256 chain-of-custody.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleRunSweep}
              disabled={sweepSubmitting}
              className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-3.5 py-2 text-sm font-semibold text-white shadow-md hover:bg-sky-500 transition-colors disabled:opacity-50"
            >
              {sweepSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Zap className="h-4 w-4 text-amber-300" />
              )}
              Automated Policy Sweep
            </button>

            <button
              onClick={() => setExportModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-800 border border-slate-700 px-3.5 py-2 text-sm font-semibold text-white shadow hover:bg-slate-700 transition-colors"
            >
              <Plus className="h-4 w-4 text-emerald-400" />
              New Archive Export
            </button>

            <button
              onClick={loadData}
              disabled={refreshing}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700 transition-colors disabled:opacity-50"
              title="Refresh telemetry"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Alerts */}
      {actionSuccess && (
        <div className="flex items-center justify-between rounded-lg border border-emerald-500/30 bg-emerald-950/40 p-4 text-emerald-300 backdrop-blur">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
            <span className="text-sm">{actionSuccess}</span>
          </div>
          <button onClick={() => setActionSuccess(null)} className="text-emerald-400 hover:text-emerald-200">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {actionError && (
        <div className="flex items-center justify-between rounded-lg border border-rose-500/30 bg-rose-950/40 p-4 text-rose-300 backdrop-blur">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-rose-400 shrink-0" />
            <span className="text-sm">{actionError}</span>
          </div>
          <button onClick={() => setActionError(null)} className="text-rose-400 hover:text-rose-200">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Metric Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Total Volume */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-5 shadow backdrop-blur">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Cold Vault Volume</span>
            <Database className="h-4 w-4 text-sky-400" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white">
              {formatBytes(stats?.totalBytesArchived || 0)}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
            <span className="text-sky-300 font-medium">{stats?.archivedJobs || 0}</span> clips archived in Glacier
          </div>
        </div>

        {/* Card 2: Cost Savings */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-5 shadow backdrop-blur">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Cloud Storage Savings</span>
            <TrendingDown className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-emerald-400">
              {stats?.savingsPercentage ?? 83}%
            </span>
            <span className="text-xs text-slate-400">vs Hot S3</span>
          </div>
          <div className="mt-2 text-xs text-slate-400">
            Est. ${(stats?.estimatedMonthlySavingsUsd || 0).toFixed(2)}/mo saved
          </div>
        </div>

        {/* Card 3: Active Jobs */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-5 shadow backdrop-blur">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Export Job Status</span>
            <Activity className="h-4 w-4 text-amber-400" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white">{stats?.totalJobs || 0}</span>
            <span className="text-xs text-slate-400">Total</span>
          </div>
          <div className="mt-2 flex items-center gap-3 text-xs">
            <span className="text-emerald-400">{stats?.archivedJobs || 0} Completed</span>
            <span className="text-amber-400">{stats?.pendingJobs || 0} In Flight</span>
            {stats?.failedJobs ? (
              <span className="text-rose-400">{stats.failedJobs} Failed</span>
            ) : null}
          </div>
        </div>

        {/* Card 4: Restores */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-5 shadow backdrop-blur">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Glacier Retrievals</span>
            <CloudDownload className="h-4 w-4 text-purple-400" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white">{stats?.activeRestoresCount || 0}</span>
            <span className="text-xs text-slate-400">Active</span>
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
            <span className="text-purple-300 font-medium">{stats?.completedRestoresCount || 0}</span> clips restored for playback
          </div>
        </div>
      </div>

      {/* Tabs & Search */}
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab("jobs")}
              className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                activeTab === "jobs"
                  ? "bg-slate-800 text-white shadow"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
              }`}
            >
              <Archive className="h-4 w-4 text-sky-400" />
              Archived Video Jobs ({jobs.length})
            </button>

            <button
              onClick={() => setActiveTab("policies")}
              className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                activeTab === "policies"
                  ? "bg-slate-800 text-white shadow"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
              }`}
            >
              <Layers className="h-4 w-4 text-emerald-400" />
              Archival Policies ({policies.length})
            </button>

            <button
              onClick={() => setActiveTab("audit")}
              className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                activeTab === "audit"
                  ? "bg-slate-800 text-white shadow"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
              }`}
            >
              <FileCheck2 className="h-4 w-4 text-purple-400" />
              Chain of Custody Audit ({auditLogs.length})
            </button>
          </div>

          {activeTab === "jobs" && (
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter incident, camera, hash..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="rounded-lg border border-slate-700 bg-slate-900/90 pl-9 pr-3 py-1.5 text-sm text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none"
                />
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-900/90 px-3 py-1.5 text-sm text-slate-300 focus:border-sky-500 focus:outline-none"
              >
                <option value="ALL">All Statuses</option>
                <option value="ARCHIVED">Archived (Cold)</option>
                <option value="EXPORTING">Exporting</option>
                <option value="RESTORING">Glacier Restoring</option>
                <option value="RESTORED">Restored (Playable)</option>
                <option value="FAILED">Failed</option>
              </select>
            </div>
          )}
        </div>

        {/* Tab 1: Jobs Table */}
        {activeTab === "jobs" && (
          <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/90 shadow">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="border-b border-slate-800 bg-slate-950/60 text-xs font-semibold uppercase text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Incident</th>
                    <th className="px-4 py-3">Camera / Branch</th>
                    <th className="px-4 py-3">Storage Tier</th>
                    <th className="px-4 py-3">SHA-256 Integrity</th>
                    <th className="px-4 py-3">Size</th>
                    <th className="px-4 py-3">Archive Status</th>
                    <th className="px-4 py-3">Restore State</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400">
                        <Loader2 className="mx-auto h-6 w-6 animate-spin text-sky-400" />
                        <span className="mt-2 block text-xs">Loading cold cloud archive jobs...</span>
                      </td>
                    </tr>
                  ) : filteredJobs.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-500">
                        <Archive className="mx-auto h-8 w-8 opacity-40 text-slate-400" />
                        <p className="mt-2 text-sm font-medium">No archive jobs found matching criteria</p>
                        <p className="text-xs text-slate-600">Run an automated sweep or create a new export</p>
                      </td>
                    </tr>
                  ) : (
                    filteredJobs.map((job) => (
                      <tr key={job.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="px-4 py-3 font-medium text-white">
                          <div className="flex items-center gap-2">
                            <FileVideo className="h-4 w-4 text-sky-400 shrink-0" />
                            <div>
                              <span className="font-semibold">{job.incidentNumber}</span>
                              <div className="text-xs text-slate-400 font-mono">
                                {job.incidentId.slice(0, 8)}...
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-3 text-slate-300">
                          <div>{job.cameraId}</div>
                          <div className="text-xs text-slate-500">{job.branchId || "Primary Hub"}</div>
                        </td>

                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium border ${
                              job.storageTier === "DEEP_ARCHIVE"
                                ? "bg-indigo-500/10 text-indigo-300 border-indigo-500/30"
                                : job.storageTier === "GLACIER_IR"
                                ? "bg-amber-500/10 text-amber-300 border-amber-500/30"
                                : "bg-sky-500/10 text-sky-300 border-sky-500/30"
                            }`}
                          >
                            <Snowflake className="h-3 w-3" />
                            {job.storageTier}
                          </span>
                        </td>

                        <td className="px-4 py-3 font-mono text-xs text-slate-400">
                          <div className="flex items-center gap-1.5" title={job.checksumSha256}>
                            <span className="truncate max-w-[120px]">{job.checksumSha256}</span>
                            <button
                              onClick={() => navigator.clipboard.writeText(job.checksumSha256)}
                              className="text-slate-500 hover:text-slate-300"
                              title="Copy SHA-256"
                            >
                              <Copy className="h-3 w-3" />
                            </button>
                          </div>
                        </td>

                        <td className="px-4 py-3 text-xs text-slate-300">
                          {formatBytes(job.fileSizeBytes)}
                        </td>

                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                              job.archiveStatus === "ARCHIVED"
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                                : job.archiveStatus === "EXPORTING"
                                ? "bg-sky-500/10 text-sky-400 border border-sky-500/30 animate-pulse"
                                : job.archiveStatus === "FAILED"
                                ? "bg-rose-500/10 text-rose-400 border border-rose-500/30"
                                : "bg-slate-700/40 text-slate-400"
                            }`}
                          >
                            {job.archiveStatus === "ARCHIVED" && <CheckCircle2 className="h-3 w-3" />}
                            {job.archiveStatus === "EXPORTING" && <Loader2 className="h-3 w-3 animate-spin" />}
                            {job.archiveStatus}
                          </span>
                        </td>

                        <td className="px-4 py-3">
                          {job.restoreStatus === "RESTORED" ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-400 border border-emerald-500/30">
                              <CheckCircle2 className="h-3 w-3" />
                              Restored
                            </span>
                          ) : job.restoreStatus === "RESTORING" || job.restoreStatus === "RESTORE_REQUESTED" ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/10 px-2 py-0.5 text-xs font-medium text-purple-300 border border-purple-500/30 animate-pulse">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              Restoring ({job.restoreTier || "Standard"})
                            </span>
                          ) : (
                            <span className="text-xs text-slate-500">Cold</span>
                          )}
                        </td>

                        <td className="px-4 py-3 text-right">
                          {job.archiveStatus === "ARCHIVED" && job.restoreStatus !== "RESTORED" && (
                            <button
                              onClick={() => {
                                setSelectedJobForRestore(job);
                                setRestoreModalOpen(true);
                              }}
                              className="inline-flex items-center gap-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 px-2.5 py-1 text-xs font-medium text-sky-300 transition-colors"
                            >
                              <CloudDownload className="h-3.5 w-3.5" />
                              Retrieve
                            </button>
                          )}

                          {job.restoreStatus === "RESTORED" && (
                            <span className="inline-flex items-center gap-1 text-xs text-emerald-400 font-medium">
                              Ready for Playback
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 2: Archival Policies */}
        {activeTab === "policies" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-white">Automated Cold Archival Policies</h3>
                <p className="text-xs text-slate-400">
                  Defines retention thresholds and automatic movement of marked incidents into Glacier tiers.
                </p>
              </div>
              <button
                onClick={() => setPolicyModalOpen(true)}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Policy
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {policies.map((pol) => (
                <div
                  key={pol.id}
                  className="rounded-xl border border-slate-800 bg-slate-900/90 p-5 shadow space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-white">{pol.name}</span>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                        pol.enabled
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          : "bg-slate-800 text-slate-500"
                      }`}
                    >
                      {pol.enabled ? "Active" : "Disabled"}
                    </span>
                  </div>

                  <div className="text-xs text-slate-400 space-y-1">
                    <div>
                      Storage Class: <span className="font-semibold text-sky-400">{pol.targetStorageClass}</span>
                    </div>
                    <div>
                      Retention: <span className="font-semibold text-slate-200">{pol.retentionDays} days ({(pol.retentionDays / 365).toFixed(1)} yrs)</span>
                    </div>
                    <div>
                      Target Bucket: <span className="font-mono text-slate-300">{pol.targetBucket}</span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-500">
                    <span>Incident status: closed, archived</span>
                    <span title="Legal Hold Protected">
                      <Lock className="h-3.5 w-3.5 text-emerald-400" />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 3: Chain of Custody Audit Log */}
        {activeTab === "audit" && (
          <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/90 shadow">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="border-b border-slate-800 bg-slate-950/60 text-xs font-semibold uppercase text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Timestamp</th>
                    <th className="px-4 py-3">Action</th>
                    <th className="px-4 py-3">Incident / Job</th>
                    <th className="px-4 py-3">Operator</th>
                    <th className="px-4 py-3">SHA-256 Checksum</th>
                    <th className="px-4 py-3">S3 URI / Storage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono text-xs">
                  {auditLogs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-slate-500 font-sans">
                        No audit records captured yet.
                      </td>
                    </tr>
                  ) : (
                    auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-800/40">
                        <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                          {new Date(log.timestamp).toLocaleString()}
                        </td>

                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1 rounded px-2 py-0.5 font-semibold ${
                              log.action.includes("COMPLETED") || log.action.includes("TIERED")
                                ? "bg-emerald-500/10 text-emerald-400"
                                : log.action.includes("REQUESTED") || log.action.includes("STARTED")
                                ? "bg-sky-500/10 text-sky-400"
                                : "bg-rose-500/10 text-rose-400"
                            }`}
                          >
                            {log.action}
                          </span>
                        </td>

                        <td className="px-4 py-3 text-slate-300 font-sans">
                          {log.incidentNumber || log.incidentId ? (
                            <div>
                              <span className="font-semibold">{log.incidentNumber || "Incident"}</span>
                              <div className="text-xs text-slate-500 font-mono">{log.jobId?.slice(0, 8)}...</div>
                            </div>
                          ) : (
                            <span className="text-slate-500">N/A</span>
                          )}
                        </td>

                        <td className="px-4 py-3 text-slate-300 font-sans">
                          {log.operatorId || "system"}
                        </td>

                        <td className="px-4 py-3 text-slate-400 truncate max-w-[140px]" title={log.checksumSha256}>
                          {log.checksumSha256 || "—"}
                        </td>

                        <td className="px-4 py-3 text-slate-400 truncate max-w-[180px]" title={log.s3Uri}>
                          {log.s3Uri || log.storageClass || "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Restore Request Modal */}
      {restoreModalOpen && selectedJobForRestore && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <CloudDownload className="h-5 w-5 text-sky-400" />
                <h3 className="font-bold text-white">Request Glacier Video Restore</h3>
              </div>
              <button
                onClick={() => {
                  setRestoreModalOpen(false);
                  setSelectedJobForRestore(null);
                }}
                className="text-slate-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="text-xs text-slate-400 space-y-1">
              <div>Incident: <span className="font-semibold text-white">{selectedJobForRestore.incidentNumber}</span></div>
              <div>Current Tier: <span className="text-sky-400 font-semibold">{selectedJobForRestore.storageTier}</span></div>
              <div className="truncate">S3 Key: <span className="font-mono text-slate-300">{selectedJobForRestore.s3Key}</span></div>
            </div>

            <form onSubmit={handleRequestRestore} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Glacier Retrieval Tier
                </label>
                <select
                  value={restoreTier}
                  onChange={(e) => setRestoreTier(e.target.value as any)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
                >
                  <option value="Expedited">Expedited (1 - 5 Minutes)</option>
                  <option value="Standard">Standard (3 - 5 Hours)</option>
                  <option value="Bulk">Bulk (5 - 12 Hours, lowest cost)</option>
                </select>
                <p className="mt-1 text-xs text-slate-500">
                  {restoreTier === "Expedited"
                    ? "Sub-minute emergency access for urgent police or court inquiries."
                    : restoreTier === "Standard"
                    ? "Normal forensic investigation retrieval window."
                    : "Scheduled batch analysis retrieval."}
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Restored Cache Validity (Days)
                </label>
                <input
                  type="number"
                  min={1}
                  max={90}
                  value={restoreDays}
                  onChange={(e) => setRestoreDays(parseInt(e.target.value, 10) || 7)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
                />
                <p className="mt-1 text-xs text-slate-500">
                  Number of days the restored video copy will stay accessible in warm tier before expiring back to cold Glacier storage.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setRestoreModalOpen(false)}
                  className="rounded-lg bg-slate-800 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={restoreSubmitting}
                  className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
                >
                  {restoreSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudDownload className="h-4 w-4" />}
                  Submit Restore Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manual Export Modal */}
      {exportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <CloudUpload className="h-5 w-5 text-emerald-400" />
                <h3 className="font-bold text-white">New Cold Archive Export</h3>
              </div>
              <button onClick={() => setExportModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateExport} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Incident ID (UUID or Key) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 00000000-0000-4000-8000-000000000001"
                  value={newIncidentId}
                  onChange={(e) => setNewIncidentId(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Camera ID *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. cam-entrance-01"
                  value={newCameraId}
                  onChange={(e) => setNewCameraId(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Incident Number (optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. INC-2026-0982"
                  value={newIncidentNumber}
                  onChange={(e) => setNewIncidentNumber(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Target Cold Storage Class
                </label>
                <select
                  value={newStorageTier}
                  onChange={(e) => setNewStorageTier(e.target.value as any)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                >
                  <option value="GLACIER">GLACIER (Flexible Archive, 90-day min)</option>
                  <option value="DEEP_ARCHIVE">DEEP_ARCHIVE (Lowest cost, 180-day min)</option>
                  <option value="GLACIER_IR">GLACIER_IR (Instant Retrieval, sub-second latency)</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setExportModalOpen(false)}
                  className="rounded-lg bg-slate-800 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={exportSubmitting}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                >
                  {exportSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudUpload className="h-4 w-4" />}
                  Initiate S3 Glacier Export
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Policy Modal */}
      {policyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Layers className="h-5 w-5 text-emerald-400" />
                <h3 className="font-bold text-white">Create Archival Policy</h3>
              </div>
              <button onClick={() => setPolicyModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreatePolicy} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Policy Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Critical Incident 7-Year Cold Archival"
                  value={newPolicyName}
                  onChange={(e) => setNewPolicyName(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Target Cold Storage Class
                </label>
                <select
                  value={newPolicyTier}
                  onChange={(e) => setNewPolicyTier(e.target.value as any)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                >
                  <option value="GLACIER">GLACIER (Flexible Archive)</option>
                  <option value="DEEP_ARCHIVE">DEEP_ARCHIVE (Long-Term Forensic Vault)</option>
                  <option value="GLACIER_IR">GLACIER_IR (Instant Retrieval)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Retention Duration (Days)
                </label>
                <input
                  type="number"
                  min={30}
                  max={7300}
                  value={newPolicyRetentionDays}
                  onChange={(e) => setNewPolicyRetentionDays(parseInt(e.target.value, 10) || 2555)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                />
                <p className="mt-1 text-xs text-slate-500">
                  Default 2555 days (7 years) satisfies banking and legal compliance retention mandates.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setPolicyModalOpen(false)}
                  className="rounded-lg bg-slate-800 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={policySubmitting}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                >
                  {policySubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Layers className="h-4 w-4" />}
                  Create Policy
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
