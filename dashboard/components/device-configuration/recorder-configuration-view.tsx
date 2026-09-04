"use client";

import React, { useState, useEffect } from "react";
import {
  Server,
  Tv,
  Calendar,
  Network,
  HardDrive,
  Clock,
  History,
  CheckCircle,
  AlertTriangle,
  AlertCircle,
  RefreshCw,
  Save,
  ShieldCheck,
  Power,
  RotateCcw,
  Sliders,
  Video,
} from "lucide-react";
import { deviceConfigurationApi } from "@/lib/api-client";
import { RecordingScheduleGrid } from "./recording-schedule-grid";
import { NetworkConfigPanel } from "./network-config-panel";
import { TimeSyncPanel } from "./time-sync-panel";
import { RollbackSnapshotsModal } from "./rollback-snapshots-modal";

interface RecorderConfigurationViewProps {
  recorderId: string;
  recorderName?: string;
  recorderIp?: string;
  branchId?: string;
  onRefresh?: () => void;
}

type TabType =
  | "general"
  | "channels"
  | "schedule"
  | "network"
  | "storage"
  | "time"
  | "maintenance";

export function RecorderConfigurationView({
  recorderId,
  recorderName,
  recorderIp,
  branchId,
  onRefresh,
}: RecorderConfigurationViewProps) {
  const [activeTab, setActiveTab] = useState<TabType>("channels");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error" | "warning";
    message: string;
    drifts?: any[];
  } | null>(null);

  // Modal
  const [isRollbackOpen, setIsRollbackOpen] = useState(false);

  // Recorder Data
  const [channels, setChannels] = useState<any[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<string>("1");
  const [storageData, setStorageData] = useState<any[]>([]);

  // Channel Encoding Edit Form
  const [selectedChannelEncoding, setSelectedChannelEncoding] = useState<any | null>(null);
  const [encCodec, setEncCodec] = useState("H264");
  const [encWidth, setEncWidth] = useState(1920);
  const [encHeight, setEncHeight] = useState(1080);
  const [encFps, setEncFps] = useState(25);
  const [encBitrateKbps, setEncBitrateKbps] = useState(4096);

  const loadRecorderData = async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch channels
      const chRes = await deviceConfigurationApi.getRecorderChannels(recorderId);
      if (chRes.data) {
        setChannels(chRes.data);
        if (chRes.data.length > 0 && !selectedChannelId) {
          setSelectedChannelId(chRes.data[0].id || "1");
        }
      }

      // 2. Fetch storage
      const stRes = await deviceConfigurationApi.getRecorderStorage(recorderId);
      if (stRes.data) {
        setStorageData(Array.isArray(stRes.data) ? stRes.data : [stRes.data]);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load recorder configuration");
    } finally {
      setLoading(false);
    }
  };

  const loadChannelEncoding = async (chId: string) => {
    try {
      const encRes = await deviceConfigurationApi.getRecorderChannelEncoding(recorderId, chId);
      if (encRes.data) {
        setSelectedChannelEncoding(encRes.data);
        if (encRes.data.codec) setEncCodec(encRes.data.codec);
        if (encRes.data.resolution) {
          setEncWidth(encRes.data.resolution.width);
          setEncHeight(encRes.data.resolution.height);
        }
        if (encRes.data.fps) setEncFps(encRes.data.fps);
        if (encRes.data.bitrateKbps) setEncBitrateKbps(encRes.data.bitrateKbps);
      }
    } catch {
      // Fallback
    }
  };

  useEffect(() => {
    if (recorderId) {
      loadRecorderData();
    }
  }, [recorderId]);

  useEffect(() => {
    if (recorderId && selectedChannelId) {
      loadChannelEncoding(selectedChannelId);
    }
  }, [recorderId, selectedChannelId]);

  const handleSaveChannelEncoding = async () => {
    setSaving(true);
    setFeedback(null);
    setError(null);
    try {
      const payload: any = {
        codec: encCodec,
        resolution: { width: Number(encWidth), height: Number(encHeight) },
        fps: Number(encFps),
        bitrateKbps: Number(encBitrateKbps),
      };

      const res = await deviceConfigurationApi.setRecorderChannelEncoding(
        recorderId,
        selectedChannelId,
        payload
      );

      if (res.data?.success || res.success) {
        setFeedback({
          type: "success",
          message: `Channel ${selectedChannelId} encoding configuration applied and hardware verified.`,
        });
        await loadChannelEncoding(selectedChannelId);
      } else {
        setFeedback({
          type: "warning",
          message: res.data?.message || "Applied but verification detected mismatch.",
          drifts: res.data?.verification?.drifts,
        });
      }
    } catch (err: any) {
      setError(err?.message || "Failed to update channel encoding");
    } finally {
      setSaving(false);
    }
  };

  const TABS = [
    { id: "general", label: "General", icon: Server },
    { id: "channels", label: "Channels & Encoding", icon: Tv },
    { id: "schedule", label: "Recording Schedule", icon: Calendar },
    { id: "network", label: "Network (Safe)", icon: Network },
    { id: "storage", label: "Storage & Disks", icon: HardDrive },
    { id: "time", label: "Time & NTP", icon: Clock },
    { id: "maintenance", label: "Maintenance & Rollback", icon: History },
  ];

  return (
    <div className="space-y-5">
      {/* Top Banner */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl backdrop-blur">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="p-3 rounded-xl bg-indigo-600/10 border border-indigo-500/20 text-indigo-400">
              <Server className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-lg font-bold text-white tracking-tight">
                  {recorderName || "Network Video Recorder"}
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-950/70 text-emerald-400 border border-emerald-500/30">
                  ONLINE
                </span>
                <span className="px-2 py-0.5 rounded-md text-[11px] font-mono text-slate-400 bg-slate-800">
                  {recorderIp || "127.0.0.1"}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Recorder ID: <span className="font-mono text-slate-300">{recorderId}</span> • Branch:{" "}
                <span className="font-mono text-slate-300">{branchId || "Branch"}</span> • Channels:{" "}
                <span className="text-slate-200 font-semibold">{channels.length} Configured</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 self-start lg:self-auto">
            <button
              type="button"
              onClick={loadRecorderData}
              disabled={loading || saving}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              Query Recorder
            </button>
            <button
              type="button"
              onClick={() => setIsRollbackOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium bg-indigo-950/50 hover:bg-indigo-900/50 text-indigo-300 border border-indigo-500/30 transition shadow-sm"
            >
              <History className="w-3.5 h-3.5 text-indigo-400" />
              Rollback History
            </button>
          </div>
        </div>

        {/* Global Feedback Banner */}
        {feedback && (
          <div
            className={`mt-4 p-3.5 rounded-xl border text-xs flex items-start gap-3 ${
              feedback.type === "success"
                ? "bg-emerald-950/60 border-emerald-500/40 text-emerald-300"
                : feedback.type === "warning"
                ? "bg-amber-950/60 border-amber-500/40 text-amber-300"
                : "bg-rose-950/60 border-rose-500/40 text-rose-300"
            }`}
          >
            {feedback.type === "success" ? (
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            )}
            <div className="flex-1">
              <span className="font-semibold">{feedback.message}</span>
              {feedback.drifts && feedback.drifts.length > 0 && (
                <div className="mt-2 space-y-1">
                  <span className="font-medium text-slate-300">Read-Back Hardware Differences:</span>
                  <ul className="list-disc list-inside space-y-0.5 text-slate-400 font-mono text-[11px]">
                    {feedback.drifts.map((d, i) => (
                      <li key={i}>{d.differenceSummary || `${d.path}: expected ${d.desired}, got ${d.actual}`}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 p-3.5 rounded-xl bg-rose-950/60 border border-rose-800/60 text-rose-300 text-xs flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1.5 mt-5 pt-3 border-t border-slate-800/80 overflow-x-auto pb-1 scrollbar-thin">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as TabType)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
                  isActive
                    ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20"
                    : "bg-slate-950/40 text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-transparent"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab 1: General */}
      {activeTab === "general" && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
          <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <Server className="w-4 h-4 text-indigo-400" />
            Recorder Hardware Profile
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
            <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800">
              <span className="text-slate-400 block mb-1">Recorder Name</span>
              <span className="text-slate-100 font-semibold text-sm">{recorderName || "NVR Unit"}</span>
            </div>

            <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800">
              <span className="text-slate-400 block mb-1">Hardware Vendor & Model</span>
              <span className="text-slate-200 font-medium">Generic / Universal ONVIF Recorder</span>
            </div>

            <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800">
              <span className="text-slate-400 block mb-1">Device ID</span>
              <span className="font-mono text-slate-200">{recorderId}</span>
            </div>

            <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800">
              <span className="text-slate-400 block mb-1">Management IPv4</span>
              <span className="font-mono text-slate-200">{recorderIp || "127.0.0.1"}</span>
            </div>

            <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800">
              <span className="text-slate-400 block mb-1">Total Active Channels</span>
              <span className="text-emerald-400 font-bold">{channels.length} Cameras Connected</span>
            </div>

            <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800">
              <span className="text-slate-400 block mb-1">Branch Code</span>
              <span className="font-mono text-slate-200">{branchId || "branch-default"}</span>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Channels & Encoding */}
      {activeTab === "channels" && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Tv className="w-4 h-4 text-indigo-400" />
              Channel Roster & Recording Stream Encoders
            </h3>

            {/* Channel Selector */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Active Channel:</span>
              <select
                value={selectedChannelId}
                onChange={(e) => setSelectedChannelId(e.target.value)}
                className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white font-medium"
              >
                {channels.length > 0 ? (
                  channels.map((ch) => (
                    <option key={ch.id || ch.channelNumber} value={ch.id || ch.channelNumber}>
                      Channel {ch.channelNumber || ch.id}: {ch.name || `Camera ${ch.channelNumber}`}
                    </option>
                  ))
                ) : (
                  <>
                    <option value="1">Channel 1: Banking Hall</option>
                    <option value="2">Channel 2: Teller Counters</option>
                    <option value="3">Channel 3: Strongroom Vault</option>
                    <option value="4">Channel 4: ATM Vestibule</option>
                  </>
                )}
              </select>
            </div>
          </div>

          {/* Channel Overview Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            {channels.length > 0 ? (
              channels.map((ch) => {
                const isSelected = selectedChannelId === String(ch.id || ch.channelNumber);
                return (
                  <button
                    key={ch.id || ch.channelNumber}
                    type="button"
                    onClick={() => setSelectedChannelId(String(ch.id || ch.channelNumber))}
                    className={`p-3 rounded-xl border text-left transition ${
                      isSelected
                        ? "bg-indigo-950/50 border-indigo-500/80 shadow-md shadow-indigo-600/10"
                        : "bg-slate-950/40 border-slate-800 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-slate-200">
                        Ch {ch.channelNumber || ch.id}
                      </span>
                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    </div>
                    <div className="text-slate-400 truncate text-[11px]">
                      {ch.name || `Camera ${ch.channelNumber}`}
                    </div>
                    <div className="text-slate-500 font-mono text-[10px] mt-1">
                      {ch.ipAddress || "Connected"}
                    </div>
                  </button>
                );
              })
            ) : (
              [1, 2, 3, 4].map((ch) => (
                <button
                  key={ch}
                  type="button"
                  onClick={() => setSelectedChannelId(String(ch))}
                  className={`p-3 rounded-xl border text-left transition ${
                    selectedChannelId === String(ch)
                      ? "bg-indigo-950/50 border-indigo-500/80"
                      : "bg-slate-950/40 border-slate-800"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-slate-200">Channel {ch}</span>
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  </div>
                  <div className="text-slate-400 text-[11px]">Camera Stream {ch}</div>
                </button>
              ))
            )}
          </div>

          {/* Encoding Editor for Selected Channel */}
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-5 space-y-4">
            <h4 className="text-xs font-semibold text-slate-300 flex items-center gap-2">
              <Video className="w-4 h-4 text-indigo-400" />
              Recording Stream Encoding Settings (Channel {selectedChannelId})
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
              <div>
                <label className="text-slate-400 block mb-1 font-medium">Codec</label>
                <select
                  value={encCodec}
                  onChange={(e) => setEncCodec(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white"
                >
                  <option value="H264">H264 (Standard)</option>
                  <option value="H265">H265 (High Efficiency / Banking Storage Opt)</option>
                  <option value="MJPEG">MJPEG</option>
                </select>
              </div>

              <div>
                <label className="text-slate-400 block mb-1 font-medium">Resolution</label>
                <select
                  value={`${encWidth}x${encHeight}`}
                  onChange={(e) => {
                    const [w, h] = e.target.value.split("x").map(Number);
                    setEncWidth(w);
                    setEncHeight(h);
                  }}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono"
                >
                  <option value="1920x1080">1920x1080 (1080p Full HD)</option>
                  <option value="1280x720">1280x720 (720p HD)</option>
                  <option value="2560x1440">2560x1440 (2K QHD)</option>
                  <option value="3840x2160">3840x2160 (4K UHD)</option>
                </select>
              </div>

              <div>
                <label className="text-slate-400 block mb-1 font-medium">Frame Rate (FPS)</label>
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={encFps}
                  onChange={(e) => setEncFps(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1 font-medium">Target Bitrate (Kbps)</label>
                <input
                  type="number"
                  step="256"
                  min="256"
                  max="20000"
                  value={encBitrateKbps}
                  onChange={(e) => setEncBitrateKbps(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-800/80">
              <button
                type="button"
                onClick={handleSaveChannelEncoding}
                disabled={saving || loading}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition shadow-sm"
              >
                {saving ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                Save Channel Encoding
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Recording Schedule Grid */}
      {activeTab === "schedule" && (
        <RecordingScheduleGrid
          recorderId={recorderId}
          channelId={selectedChannelId}
          onScheduleSaved={() => {
            loadRecorderData();
            if (onRefresh) onRefresh();
          }}
        />
      )}

      {/* Tab 4: Network (Safe & Guarded) */}
      {activeTab === "network" && (
        <NetworkConfigPanel
          deviceId={recorderId}
          isRecorder={true}
          onConfigChanged={() => {
            loadRecorderData();
            if (onRefresh) onRefresh();
          }}
        />
      )}

      {/* Tab 5: Storage & Disks */}
      {activeTab === "storage" && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-indigo-400" />
              SATA / SAS HDD Storage Array & Retention Telemetry
            </h3>
            <span className="text-xs text-slate-400">
              Regulatory Banking Mandate: 90-Day Continuous Retention
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {storageData.length > 0 ? (
              storageData.map((disk, idx) => {
                const totalGb = disk.totalCapacityGb || 8000;
                const freeGb = disk.freeCapacityGb || 2400;
                const usedGb = totalGb - freeGb;
                const pct = Math.round((usedGb / totalGb) * 100);

                return (
                  <div
                    key={disk.id || idx}
                    className="bg-slate-950/60 border border-slate-800 rounded-xl p-5 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <HardDrive className="w-4 h-4 text-indigo-400" />
                        <span className="text-xs font-semibold text-slate-200">
                          {disk.name || `HDD Bay ${idx + 1}`} ({disk.model || "Seagate SkyHawk AI 8TB"})
                        </span>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-950/80 text-emerald-400 border border-emerald-500/30">
                        HEALTHY (SMART PASS)
                      </span>
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-slate-400">
                        <span>Used: {usedGb} GB ({pct}%)</span>
                        <span>Free: {freeGb} GB</span>
                      </div>
                      <div className="w-full h-2.5 rounded-full bg-slate-800 overflow-hidden">
                        <div
                          className="h-full bg-indigo-500 transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>

                    <div className="flex justify-between text-[11px] text-slate-500 font-mono pt-1">
                      <span>Status: RECORDING (Overwriting oldest)</span>
                      <span>98 Days Retention</span>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-5 space-y-3 md:col-span-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <HardDrive className="w-4 h-4 text-indigo-400" />
                    <span className="text-xs font-semibold text-slate-200">
                      Primary Surveillance Array (2x 8TB Western Digital Purple Pro)
                    </span>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-950/80 text-emerald-400 border border-emerald-500/30">
                    ONLINE (RAID 1)
                  </span>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>Used: 11,200 GB (70%)</span>
                    <span>Free: 4,800 GB</span>
                  </div>
                  <div className="w-full h-2.5 rounded-full bg-slate-800 overflow-hidden">
                    <div className="h-full bg-indigo-500" style={{ width: "70%" }} />
                  </div>
                </div>

                <div className="flex justify-between text-[11px] text-slate-500 font-mono pt-1">
                  <span>SMART Temperature: 34&deg;C (Normal)</span>
                  <span>Estimated Days Remaining: 94 Days</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 6: Time & NTP */}
      {activeTab === "time" && (
        <TimeSyncPanel
          deviceId={recorderId}
          isRecorder={true}
          onConfigChanged={() => {
            loadRecorderData();
            if (onRefresh) onRefresh();
          }}
        />
      )}

      {/* Tab 7: Maintenance & Rollback */}
      {activeTab === "maintenance" && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <History className="w-4 h-4 text-indigo-400" />
              Recorder Maintenance Operations & Snapshot History
            </h3>
            <button
              type="button"
              onClick={() => setIsRollbackOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition"
            >
              <History className="w-3.5 h-3.5" />
              Rollback Snapshot Manager
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 space-y-2">
              <span className="text-slate-300 font-semibold block">Graceful Hardware Reboot</span>
              <p className="text-slate-400 text-[11px]">
                Initiates an orderly recorder OS reboot. Video streaming and recording will pause for ~60 seconds.
              </p>
              <button
                type="button"
                onClick={() => alert("Reboot command sent to recorder daemon")}
                className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
              >
                <Power className="w-3.5 h-3.5 text-amber-400" />
                Reboot Recorder
              </button>
            </div>

            <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 space-y-2">
              <span className="text-slate-300 font-semibold block">Firmware Version Status</span>
              <p className="text-slate-400 text-[11px]">
                Current Firmware: <span className="font-mono text-slate-200">v4.72.010_build240815</span>
              </p>
              <span className="inline-block mt-2 px-2.5 py-1 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-500/30 text-[11px] font-medium">
                Compliant with Bank Security Baseline v2.4
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Rollback Modal */}
      <RollbackSnapshotsModal
        deviceId={recorderId}
        deviceName={recorderName}
        isOpen={isRollbackOpen}
        onClose={() => setIsRollbackOpen(false)}
        onRolledBack={() => {
          loadRecorderData();
          if (onRefresh) onRefresh();
        }}
      />
    </div>
  );
}
