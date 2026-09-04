"use client";

import React, { useState, useEffect } from "react";
import {
  History,
  Camera,
  Layers,
  Clock,
  Network,
  RotateCcw,
  CheckCircle,
  AlertTriangle,
  X,
  Plus,
  RefreshCw,
  ShieldAlert,
  Sliders,
} from "lucide-react";
import { deviceConfigurationApi } from "@/lib/api-client";

interface RollbackSnapshotsModalProps {
  deviceId: string;
  deviceName?: string;
  isOpen: boolean;
  onClose: () => void;
  onRolledBack?: () => void;
}

export function RollbackSnapshotsModal({
  deviceId,
  deviceName,
  isOpen,
  onClose,
  onRolledBack,
}: RollbackSnapshotsModalProps) {
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [rollingBackId, setRollingBackId] = useState<string | null>(null);
  const [confirmSnapshotId, setConfirmSnapshotId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fetchSnapshots = async () => {
    if (!deviceId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await deviceConfigurationApi.listSnapshots(deviceId);
      if (res.data) {
        setSnapshots(res.data);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load device rollback snapshots");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && deviceId) {
      fetchSnapshots();
    }
  }, [isOpen, deviceId]);

  const handleCaptureSnapshot = async () => {
    setCapturing(true);
    setError(null);
    setSuccessMsg(null);
    try {
      await deviceConfigurationApi.captureSnapshot(deviceId);
      setSuccessMsg("Pre-flight configuration snapshot captured successfully");
      await fetchSnapshots();
    } catch (err: any) {
      setError(err?.message || "Failed to capture snapshot");
    } finally {
      setCapturing(false);
    }
  };

  const handleExecuteRollback = async (snapshotId: string) => {
    setRollingBackId(snapshotId);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await deviceConfigurationApi.rollbackSnapshot(deviceId, snapshotId);
      if (res.success || res.data?.success) {
        setSuccessMsg(`Device successfully restored to snapshot ${snapshotId.slice(0, 8)}`);
        setConfirmSnapshotId(null);
        if (onRolledBack) onRolledBack();
      } else {
        setError(res.data?.message || "Rollback execution failed on device");
      }
    } catch (err: any) {
      setError(err?.message || "Error restoring snapshot");
    } finally {
      setRollingBackId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">
                Configuration Rollback History
              </h3>
              <p className="text-xs text-slate-400">
                Device: <span className="font-mono text-slate-300">{deviceName || deviceId}</span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action Toolbar */}
        <div className="px-5 py-3 bg-slate-950/60 border-b border-slate-800/80 flex items-center justify-between">
          <span className="text-xs text-slate-400">
            {snapshots.length} snapshot{snapshots.length === 1 ? "" : "s"} available
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchSnapshots}
              disabled={loading || capturing}
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center gap-1.5 transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <button
              type="button"
              onClick={handleCaptureSnapshot}
              disabled={capturing || loading}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1.5 transition shadow-sm shadow-indigo-600/20"
            >
              {capturing ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Plus className="w-3.5 h-3.5" />
              )}
              Capture Pre-Flight Snapshot
            </button>
          </div>
        </div>

        {/* Feedback alerts */}
        {error && (
          <div className="mx-5 mt-4 p-3 rounded-lg bg-rose-950/70 border border-rose-800/60 text-rose-300 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="mx-5 mt-4 p-3 rounded-lg bg-emerald-950/70 border border-emerald-800/60 text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Snapshot list */}
        <div className="p-5 overflow-y-auto space-y-3 flex-1">
          {loading && snapshots.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-400" />
              Querying rollback snapshots...
            </div>
          ) : snapshots.length === 0 ? (
            <div className="py-12 text-center border border-dashed border-slate-800 rounded-xl">
              <History className="w-8 h-8 mx-auto text-slate-600 mb-2" />
              <p className="text-xs text-slate-300 font-medium">No snapshots recorded yet</p>
              <p className="text-[11px] text-slate-500 mt-1 max-w-sm mx-auto">
                Snapshots are automatically captured prior to any hardware mutation, or can be manually created before maintenance work.
              </p>
              <button
                type="button"
                onClick={handleCaptureSnapshot}
                disabled={capturing}
                className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
              >
                <Plus className="w-3.5 h-3.5 text-indigo-400" />
                Capture First Snapshot
              </button>
            </div>
          ) : (
            snapshots.map((snap) => {
              const isConfirming = confirmSnapshotId === snap.snapshotId;
              const isRolling = rollingBackId === snap.snapshotId;

              return (
                <div
                  key={snap.snapshotId}
                  className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 transition hover:border-slate-700"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold text-slate-200">
                          {snap.snapshotId}
                        </span>
                        <span className="text-[11px] text-slate-500">
                          {new Date(snap.createdAt).toLocaleString()}
                        </span>
                      </div>
                    </div>

                    {!isConfirming ? (
                      <button
                        type="button"
                        onClick={() => setConfirmSnapshotId(snap.snapshotId)}
                        disabled={isRolling || rollingBackId !== null}
                        className="self-start sm:self-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
                      >
                        <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                        Revert to this
                      </button>
                    ) : (
                      <div className="flex items-center gap-2 self-start sm:self-auto">
                        <span className="text-xs text-amber-400 font-medium">Confirm revert?</span>
                        <button
                          type="button"
                          onClick={() => handleExecuteRollback(snap.snapshotId)}
                          disabled={isRolling}
                          className="px-2.5 py-1 rounded text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white transition flex items-center gap-1 shadow-sm"
                        >
                          {isRolling ? (
                            <RefreshCw className="w-3 h-3 animate-spin" />
                          ) : (
                            <RotateCcw className="w-3 h-3" />
                          )}
                          Restore Now
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmSnapshotId(null)}
                          disabled={isRolling}
                          className="px-2 py-1 rounded text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Subsystems contained in this snapshot */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-900 text-xs">
                    <div className="flex items-center gap-1.5">
                      <Camera className={`w-3.5 h-3.5 ${snap.videoConfig ? "text-emerald-400" : "text-slate-600"}`} />
                      <span className={snap.videoConfig ? "text-slate-300" : "text-slate-600"}>
                        Video {snap.videoConfig ? `(${snap.videoConfig.resolution?.width}x${snap.videoConfig.resolution?.height})` : "—"}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Sliders className={`w-3.5 h-3.5 ${snap.imageConfig ? "text-emerald-400" : "text-slate-600"}`} />
                      <span className={snap.imageConfig ? "text-slate-300" : "text-slate-600"}>
                        Imaging {snap.imageConfig ? "(saved)" : "—"}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Network className={`w-3.5 h-3.5 ${snap.networkConfig ? "text-emerald-400" : "text-slate-600"}`} />
                      <span className={snap.networkConfig ? "text-slate-300 font-mono text-[11px]" : "text-slate-600"}>
                        {snap.networkConfig ? snap.networkConfig.ipAddress : "Network —"}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Clock className={`w-3.5 h-3.5 ${snap.timeConfig ? "text-emerald-400" : "text-slate-600"}`} />
                      <span className={snap.timeConfig ? "text-slate-300" : "text-slate-600"}>
                        Time {snap.timeConfig ? `(${snap.timeConfig.dateTimeType})` : "—"}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-950/80 border-t border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[11px] text-slate-500">
            <ShieldAlert className="w-4 h-4 text-amber-500/80" />
            <span>Restoring a snapshot dispatches ONVIF/SDK calls and applies Read-After-Write verification.</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
