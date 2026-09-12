"use client";

import { useEffect, useState, useCallback } from "react";
import { AppLayout } from "@/components/app-layout";
import {
  storageFailoverApi,
  type StorageTargetItem,
  type StorageFailoverEventItem,
  type StorageFailoverMetricsItem,
} from "@/lib/api-client";

export default function StorageFailoverConsolePage() {
  const [mediaNodeId, setMediaNodeId] = useState("media-node-vault-01");
  const [targets, setTargets] = useState<StorageTargetItem[]>([]);
  const [activeTarget, setActiveTarget] = useState<StorageTargetItem | null>(null);
  const [events, setEvents] = useState<StorageFailoverEventItem[]>([]);
  const [metrics, setMetrics] = useState<StorageFailoverMetricsItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [probing, setProbing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // New target modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTarget, setNewTarget] = useState({
    targetName: "",
    storageNodeId: "",
    targetPath: "",
    storageType: "nas" as "local-disk" | "nas" | "san",
    storageTier: "warm" as "hot" | "warm" | "cold",
    priority: 2,
    spilloverThresholdPercent: 95,
  });

  const loadData = useCallback(async () => {
    if (!mediaNodeId.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const [targetsRes, eventsRes, metricsRes] = await Promise.allSettled([
        storageFailoverApi.getTargets({ mediaNodeId }),
        storageFailoverApi.getEvents({ mediaNodeId, limit: 20 }),
        storageFailoverApi.getMetrics({ mediaNodeId }),
      ]);

      if (targetsRes.status === "fulfilled" && targetsRes.value?.data) {
        setTargets(targetsRes.value.data.permittedTargets || []);
        setActiveTarget(targetsRes.value.data.activeTarget || null);
      }
      if (eventsRes.status === "fulfilled" && eventsRes.value?.data) {
        setEvents(eventsRes.value.data);
      }
      if (metricsRes.status === "fulfilled" && metricsRes.value?.data) {
        setMetrics(metricsRes.value.data);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load storage failover status");
    } finally {
      setLoading(false);
    }
  }, [mediaNodeId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleProbe = async () => {
    setProbing(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await storageFailoverApi.probeHealth({ mediaNodeId });
      if (res?.data) {
        setActiveTarget(res.data.activeTarget);
        setTargets(res.data.targets);
        setSuccessMsg("Filesystem probe completed. Health & capacity refreshed.");
      }
      await loadData();
    } catch (err: any) {
      setError(err?.message || "Probe failed");
    } finally {
      setProbing(false);
    }
  };

  const handleTriggerFailover = async (targetId: string, reason = "MANUAL_OVERRIDE") => {
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await storageFailoverApi.triggerFailover({
        mediaNodeId,
        targetId,
        reason: reason as any,
        errorDetail: "Operator initiated emergency failover test",
      });
      if (res?.data?.failoverOccurred) {
        setSuccessMsg(`Seamless failover executed to [${res.data.newTarget?.targetName || res.data.newTarget?.storageNodeId}]`);
      } else {
        setError("Failover could not be executed (no alternative healthy targets available)");
      }
      await loadData();
    } catch (err: any) {
      setError(err?.message || "Failover failed");
    }
  };

  const handleRecover = async (targetId: string) => {
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await storageFailoverApi.recoverTarget({ mediaNodeId, targetId });
      if (res?.data?.recovered) {
        setSuccessMsg(`Target recovered. Active target is now [${res.data.activeTarget?.targetName || res.data.activeTarget?.storageNodeId}]`);
      }
      await loadData();
    } catch (err: any) {
      setError(err?.message || "Recovery failed");
    }
  };

  const handleAddTarget = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTarget.targetName || !newTarget.storageNodeId || !newTarget.targetPath) {
      setError("Please fill all required fields");
      return;
    }
    setError(null);
    try {
      await storageFailoverApi.configureTarget({
        mediaNodeId,
        storageNodeId: newTarget.storageNodeId,
        targetName: newTarget.targetName,
        targetPath: newTarget.targetPath,
        storageType: newTarget.storageType,
        storageTier: newTarget.storageTier,
        priority: Number(newTarget.priority),
        spilloverThresholdPercent: Number(newTarget.spilloverThresholdPercent),
      });
      setShowAddModal(false);
      setSuccessMsg(`Storage target [${newTarget.targetName}] configured and bound successfully.`);
      setNewTarget({
        targetName: "",
        storageNodeId: "",
        targetPath: "",
        storageType: "nas",
        storageTier: "warm",
        priority: 2,
        spilloverThresholdPercent: 95,
      });
      await loadData();
    } catch (err: any) {
      setError(err?.message || "Failed to configure storage target");
    }
  };

  const handleDeleteTarget = async (targetId: string) => {
    if (!confirm(`Are you sure you want to remove storage target [${targetId}]?`)) return;
    try {
      await storageFailoverApi.deleteTarget(targetId, { mediaNodeId });
      setSuccessMsg("Target removed successfully");
      await loadData();
    } catch (err: any) {
      setError(err?.message || "Failed to delete target");
    }
  };

  const formatBytes = (bytes?: number) => {
    if (!bytes || bytes === 0) return "0 GB";
    const tb = bytes / (1024 * 1024 * 1024 * 1024);
    if (tb >= 1) return `${tb.toFixed(2)} TB`;
    const gb = bytes / (1024 * 1024 * 1024);
    return `${gb.toFixed(1)} GB`;
  };

  const getHealthBadge = (state: string) => {
    switch (state) {
      case "HEALTHY":
        return <span className="px-2 py-1 text-xs font-semibold rounded bg-emerald-950 text-emerald-300 border border-emerald-700">HEALTHY</span>;
      case "FULL":
        return <span className="px-2 py-1 text-xs font-semibold rounded bg-amber-950 text-amber-300 border border-amber-700">DISK FULL</span>;
      case "OFFLINE":
        return <span className="px-2 py-1 text-xs font-semibold rounded bg-rose-950 text-rose-300 border border-rose-700">OFFLINE</span>;
      case "READ_ONLY":
        return <span className="px-2 py-1 text-xs font-semibold rounded bg-orange-950 text-orange-300 border border-orange-700">READ ONLY</span>;
      case "DEGRADED":
        return <span className="px-2 py-1 text-xs font-semibold rounded bg-yellow-950 text-yellow-300 border border-yellow-700">DEGRADED</span>;
      default:
        return <span className="px-2 py-1 text-xs font-semibold rounded bg-gray-800 text-gray-300 border border-gray-600">{state}</span>;
    }
  };

  return (
    <AppLayout>
      <div className="p-6 max-w-7xl mx-auto space-y-6 text-gray-100">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-800 pb-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-white">Storage Target Failover Console</h1>
              <span className="px-2.5 py-0.5 text-xs font-medium bg-blue-900/60 text-blue-300 border border-blue-600/40 rounded-full">
                recording.storage_failover
              </span>
            </div>
            <p className="text-sm text-gray-400 mt-1">
              Automatic seamless switchover to secondary NAS/SAN mount on primary disk full or I/O failure.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-gray-900 px-3 py-1.5 rounded-lg border border-gray-800">
              <span className="text-xs text-gray-400">Media Node:</span>
              <input
                type="text"
                value={mediaNodeId}
                onChange={(e) => setMediaNodeId(e.target.value)}
                className="bg-transparent text-sm text-white font-mono focus:outline-none w-44"
                placeholder="media-node-01"
              />
            </div>

            <button
              onClick={handleProbe}
              disabled={probing}
              className="px-3.5 py-1.5 text-sm font-medium bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700 rounded-lg transition disabled:opacity-50"
            >
              {probing ? "Probing Mounts…" : "Probe Mounts"}
            </button>

            <button
              onClick={() => setShowAddModal(true)}
              className="px-3.5 py-1.5 text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition"
            >
              + Add Target
            </button>
          </div>
        </div>

        {/* Notifications */}
        {error && (
          <div className="p-3 bg-rose-950/60 border border-rose-800 rounded-lg text-rose-300 text-sm flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-rose-400 hover:text-white ml-2">✕</button>
          </div>
        )}
        {successMsg && (
          <div className="p-3 bg-emerald-950/60 border border-emerald-800 rounded-lg text-emerald-300 text-sm flex items-center justify-between">
            <span>{successMsg}</span>
            <button onClick={() => setSuccessMsg(null)} className="text-emerald-400 hover:text-white ml-2">✕</button>
          </div>
        )}

        {/* Active Target Banner */}
        {activeTarget && (
          <div className="p-4 rounded-xl bg-gradient-to-r from-blue-950/40 via-indigo-950/30 to-gray-900 border border-blue-800/50 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
              <div>
                <div className="text-xs font-semibold text-blue-400 uppercase tracking-wider">Active Recording Route</div>
                <div className="text-lg font-bold text-white flex items-center gap-2">
                  {activeTarget.targetName}
                  <span className="text-xs font-mono text-gray-400">({activeTarget.storageNodeId})</span>
                </div>
                <div className="text-xs text-gray-400 font-mono mt-0.5">{activeTarget.targetPath}</div>
              </div>
            </div>

            <div className="flex items-center gap-6">
              <div className="text-right">
                <div className="text-xs text-gray-400">Route Priority</div>
                <div className="text-base font-bold text-white">Priority #{activeTarget.priority}</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-gray-400">Health State</div>
                <div className="mt-1">{getHealthBadge(activeTarget.healthState)}</div>
              </div>
              <button
                onClick={() => handleTriggerFailover(activeTarget.id, "DISK_FULL")}
                className="px-3 py-1.5 text-xs font-medium bg-amber-950 hover:bg-amber-900 text-amber-200 border border-amber-700 rounded-lg transition"
              >
                Simulate Disk Full
              </button>
            </div>
          </div>
        )}

        {/* Telemetry Overview Metrics */}
        {metrics && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 bg-gray-900/60 rounded-xl border border-gray-800">
              <div className="text-xs text-gray-400">Configured Mounts</div>
              <div className="text-2xl font-bold text-white mt-1">{metrics.targetsSummary.total}</div>
              <div className="text-xs text-emerald-400 mt-1">{metrics.targetsSummary.healthy} Healthy</div>
            </div>
            <div className="p-4 bg-gray-900/60 rounded-xl border border-gray-800">
              <div className="text-xs text-gray-400">Total Failover Events</div>
              <div className="text-2xl font-bold text-white mt-1">{metrics.totalEvents}</div>
              <div className="text-xs text-gray-400 mt-1">{metrics.unrecoveredEvents} Unrecovered</div>
            </div>
            <div className="p-4 bg-gray-900/60 rounded-xl border border-gray-800">
              <div className="text-xs text-gray-400">Mean Time to Recovery (MTTR)</div>
              <div className="text-2xl font-bold text-white mt-1">
                {metrics.meanTimeToRecoveryMs > 0 ? `${(metrics.meanTimeToRecoveryMs / 1000).toFixed(1)}s` : "0s"}
              </div>
              <div className="text-xs text-blue-400 mt-1">Automated Failback</div>
            </div>
            <div className="p-4 bg-gray-900/60 rounded-xl border border-gray-800">
              <div className="text-xs text-gray-400">Top Failover Trigger</div>
              <div className="text-xl font-bold text-amber-400 mt-1 truncate">
                {Object.entries(metrics.reasonBreakdown)[0]?.[0] || "None"}
              </div>
              <div className="text-xs text-gray-400 mt-1">
                {Object.entries(metrics.reasonBreakdown)[0]?.[1] || 0} occurrences
              </div>
            </div>
          </div>
        )}

        {/* Permitted Targets Topology */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Configured Mount Targets & Priority Cascade</h2>
            <span className="text-xs text-gray-400">Ordered by Priority (1 = Primary, 2 = Secondary NAS/SAN)</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {targets.map((t) => {
              const isActive = activeTarget?.id === t.id;
              const usage = t.usagePercent || 0;
              const threshold = t.spilloverThresholdPercent || 95;

              return (
                <div
                  key={t.id}
                  className={`p-4 rounded-xl border transition ${
                    isActive
                      ? "bg-gray-900/90 border-blue-600/60 shadow-lg shadow-blue-950/30"
                      : "bg-gray-900/40 border-gray-800 hover:border-gray-700"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs px-2 py-0.5 rounded bg-gray-800 text-gray-300 font-mono font-semibold">
                          #{t.priority}
                        </span>
                        <h3 className="font-semibold text-white text-base truncate max-w-[180px]">{t.targetName}</h3>
                      </div>
                      <div className="text-xs text-gray-400 font-mono mt-1 truncate max-w-[240px]">{t.targetPath}</div>
                    </div>
                    <div>{getHealthBadge(t.healthState)}</div>
                  </div>

                  {/* Usage Meter */}
                  <div className="mt-4 space-y-1.5">
                    <div className="flex justify-between text-xs text-gray-400">
                      <span>Disk Usage</span>
                      <span className={usage >= threshold ? "text-amber-400 font-semibold" : "text-gray-300"}>
                        {usage.toFixed(1)}% / {threshold}% spillover
                      </span>
                    </div>
                    <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          usage >= threshold
                            ? "bg-rose-500"
                            : usage >= 80
                            ? "bg-amber-500"
                            : "bg-emerald-500"
                        }`}
                        style={{ width: `${Math.min(100, usage)}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[11px] text-gray-500">
                      <span>{formatBytes(t.usedBytes)} used</span>
                      <span>{formatBytes(t.capacityBytes)} capacity</span>
                    </div>
                  </div>

                  {/* Target Controls */}
                  <div className="mt-4 pt-3 border-t border-gray-800/80 flex items-center justify-between">
                    <div className="text-xs text-gray-400">
                      Failures: <span className="font-mono text-gray-200">{t.consecutiveFailures}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      {t.healthState !== "HEALTHY" ? (
                        <button
                          onClick={() => handleRecover(t.id)}
                          className="px-2.5 py-1 text-xs font-medium bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border border-emerald-700 rounded transition"
                        >
                          Recover
                        </button>
                      ) : (
                        <button
                          onClick={() => handleTriggerFailover(t.id, "MANUAL_OVERRIDE")}
                          className="px-2.5 py-1 text-xs font-medium bg-gray-800 hover:bg-gray-700 text-gray-300 rounded transition"
                        >
                          Failover
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteTarget(t.id)}
                        className="px-2 py-1 text-xs text-gray-500 hover:text-rose-400 rounded transition"
                        title="Delete Target"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Failover Events Audit Log */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Failover & Spillover Audit Events</h2>
            <button
              onClick={loadData}
              disabled={loading}
              className="text-xs text-blue-400 hover:text-blue-300 transition"
            >
              {loading ? "Refreshing…" : "Refresh Log"}
            </button>
          </div>

          <div className="bg-gray-900/60 rounded-xl border border-gray-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-gray-300">
                <thead className="bg-gray-950 text-gray-400 uppercase font-mono tracking-wider border-b border-gray-800">
                  <tr>
                    <th className="px-4 py-3">Timestamp</th>
                    <th className="px-4 py-3">Reason</th>
                    <th className="px-4 py-3">From Target</th>
                    <th className="px-4 py-3">Switched To (Failover Target)</th>
                    <th className="px-4 py-3">Error Detail</th>
                    <th className="px-4 py-3">Recovery Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/60">
                  {events.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                        No failover events recorded. All storage targets are operating normally.
                      </td>
                    </tr>
                  ) : (
                    events.map((ev) => (
                      <tr key={ev.id} className="hover:bg-gray-800/30">
                        <td className="px-4 py-3 font-mono text-gray-400 whitespace-nowrap">
                          {new Date(ev.occurredAt).toLocaleString()}
                        </td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 rounded font-mono font-medium text-[11px] bg-amber-950 text-amber-300 border border-amber-800">
                            {ev.reason}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-gray-300">{ev.fromTargetPath}</td>
                        <td className="px-4 py-3 font-mono text-emerald-400 font-semibold">{ev.toTargetPath}</td>
                        <td className="px-4 py-3 text-gray-400 truncate max-w-xs">{ev.errorDetail || "—"}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {ev.recoveredAt ? (
                            <span className="text-emerald-400 font-mono text-[11px]">
                              Recovered ({new Date(ev.recoveredAt).toLocaleTimeString()})
                            </span>
                          ) : (
                            <span className="text-amber-400 font-mono text-[11px]">Active Failover</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Add Target Modal */}
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
              <div className="flex items-center justify-between border-b border-gray-800 pb-3">
                <h3 className="text-lg font-bold text-white">Configure Storage Mount Target</h3>
                <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-white">✕</button>
              </div>

              <form onSubmit={handleAddTarget} className="space-y-3 text-sm">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Target Name</label>
                  <input
                    type="text"
                    required
                    value={newTarget.targetName}
                    onChange={(e) => setNewTarget({ ...newTarget, targetName: e.target.value })}
                    placeholder="Secondary Synology NAS"
                    className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-600"
                  />
                </div>

                <div>
                  <label className="block text-xs text-gray-400 mb-1">Storage Node ID</label>
                  <input
                    type="text"
                    required
                    value={newTarget.storageNodeId}
                    onChange={(e) => setNewTarget({ ...newTarget, storageNodeId: e.target.value })}
                    placeholder="nas-vault-backup-01"
                    className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-600 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs text-gray-400 mb-1">Target Path / Mount URI</label>
                  <input
                    type="text"
                    required
                    value={newTarget.targetPath}
                    onChange={(e) => setNewTarget({ ...newTarget, targetPath: e.target.value })}
                    placeholder="/mnt/nas/video2 or nfs://10.0.1.50/cctv"
                    className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-600 font-mono"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Storage Type</label>
                    <select
                      value={newTarget.storageType}
                      onChange={(e) => setNewTarget({ ...newTarget, storageType: e.target.value as any })}
                      className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-600"
                    >
                      <option value="nas">NAS (NFS / SMB)</option>
                      <option value="san">SAN (iSCSI / FC)</option>
                      <option value="local-disk">Local Disk (NVMe / RAID)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Tier</label>
                    <select
                      value={newTarget.storageTier}
                      onChange={(e) => setNewTarget({ ...newTarget, storageTier: e.target.value as any })}
                      className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-600"
                    >
                      <option value="hot">Hot (Fast write)</option>
                      <option value="warm">Warm (Secondary NAS)</option>
                      <option value="cold">Cold (Archive SAN)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Priority (1 = highest)</label>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={newTarget.priority}
                      onChange={(e) => setNewTarget({ ...newTarget, priority: Number(e.target.value) })}
                      className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Spillover Threshold %</label>
                    <input
                      type="number"
                      min={50}
                      max={99}
                      value={newTarget.spilloverThresholdPercent}
                      onChange={(e) => setNewTarget({ ...newTarget, spilloverThresholdPercent: Number(e.target.value) })}
                      className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-600"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-gray-800">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="px-4 py-2 text-sm text-gray-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition"
                  >
                    Save Target
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
