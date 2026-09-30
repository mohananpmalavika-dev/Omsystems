"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  HardDrive,
  Cloud,
  Layers,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Server,
  Zap,
  ShieldCheck,
  ArrowRight,
  Database,
  Cpu,
  Activity,
  Sliders,
  Play
} from "lucide-react";
import { ComponentDetailPage } from "@/components/operational-health/component-detail-page";
import { HddFleetWidget } from "@/components/operational-health/hdd-fleet-widget";
import { LiveStorageTelemetryWidget } from "@/components/operational-health/live-storage-telemetry-widget";

interface CameraStorageMapping {
  cameraId: string;
  branchId?: string;
  cameraName: string;
  ipAddress: string;
  activeStorageTier: "sd_card" | "dvr_hdd" | "online_cloud" | "unavailable";
  sdCardStatus: "detected" | "not_present" | "unformatted" | "unavailable";
  dvrStatus: "mapped" | "unmapped" | "offline" | "unavailable";
  cloudStatus: "active" | "standby" | "unavailable";
  storageDetails: string;
  capacity: string;
  used: string;
  retentionDays: number | null;
}

export default function StoragePage() {
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedTierFilter, setSelectedTierFilter] = useState<string>("all");
  const [cameras, setCameras] = useState<CameraStorageMapping[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{
    tier1SdCardCount: number;
    tier2DvrHddCount: number;
    tier3OnlineCloudCount: number;
    sdCardNode: { name: string; capacity: string; used: string; status: string };
    dvrHddNode: { name: string; capacity: string; used: string; status: string };
    cloudNode: { name: string; capacity: string; used: string; status: string };
  }>({
    tier1SdCardCount: 0,
    tier2DvrHddCount: 0,
    tier3OnlineCloudCount: 0,
    sdCardNode: { name: "Waiting for camera SD-card telemetry", capacity: "Unavailable", used: "Unavailable", status: "unknown" },
    dvrHddNode: { name: "Waiting for recorder HDD telemetry", capacity: "Unavailable", used: "Unavailable", status: "unknown" },
    cloudNode: { name: "Waiting for cloud-storage telemetry", capacity: "Unavailable", used: "Unavailable", status: "unknown" },
  });

  const loadStorageData = async () => {
    try {
      setRefreshing(true);
      const res = await fetch("/api/operations/storage", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setLoadError(typeof data.error === "string" ? data.error : "Storage inventory is unavailable. Check the control plane connection and retry.");
        return;
      }
      setCameras(data.cameras || []);
      setLoadError(null);
      if (data.summary) {
        setSummary(data.summary);
      }
    } catch (err) {
      console.error("Failed to load live storage operations data:", err);
      setLoadError("Storage inventory is unavailable. Check the control plane connection and retry.");
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStorageData();
    const interval = setInterval(loadStorageData, 20000);
    return () => clearInterval(interval);
  }, []);

  const filteredCameras = cameras.filter((c) => {
    if (selectedTierFilter === "all") return true;
    return c.activeStorageTier === selectedTierFilter;
  });

  return (
    <div className="space-y-6">
      {/* Top 3-Tier Storage Hierarchy & Automatic Detection Architecture */}
      <section className="card p-5 space-y-4 border-l-4 border-l-blue-500 bg-gradient-to-br from-blue-500/5 via-slate-900/50 to-slate-950">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <Database className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                Storage Detection &amp; Fallback Readiness
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Preferred available medium: <strong>Tier 1: Camera SD Card</strong> &rarr;{" "}
                <strong>Tier 2: DVR/NVR Hard Disk</strong> &rarr;{" "}
                <strong>Tier 3: Online Cloud</strong>. Verify actual recording in the recording module.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Link
              href="/recordings"
              className="px-3 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 flex items-center gap-1.5 transition-all font-medium"
              title="Open recording player & footage timeline"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              Watch Recordings
            </Link>
            <Link
              href="/playback/synced"
              className="px-3 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 flex items-center gap-1.5 transition-all font-medium"
              title="Synchronized multi-camera playback"
            >
              <Sliders className="w-3.5 h-3.5" />
              Multi-Cam Playback
            </Link>
            <button
              onClick={() => void loadStorageData()}
              disabled={refreshing}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center gap-1.5 transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
              {refreshing ? "Refreshing..." : "Refresh Storage Telemetry"}
            </button>
          </div>
        </div>

        {/* 3 Storage Tier Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Tier 1: On-Camera SD Card */}
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold text-[10px] uppercase tracking-wider">
                Tier 1 • Camera MicroSD
              </span>
              <Cpu className="w-4 h-4 text-emerald-400" />
            </div>
            <h4 className="font-bold text-sm text-slate-200">On-Camera Memory Card</h4>
            <p className="text-xs text-slate-400">
              Memory cards reported by camera telemetry. Recording must be verified separately.
            </p>
            <div className="pt-2 border-t border-slate-800 text-[11px] flex justify-between text-slate-400">
              <span>Status:</span>
              <strong className="text-emerald-400">
                {summary.tier1SdCardCount > 0 ? `${summary.tier1SdCardCount} Detected (${summary.sdCardNode.capacity})` : "0 Detected"}
              </strong>
            </div>
          </div>

          {/* Tier 2: DVR / NVR Hard Disk */}
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 font-semibold text-[10px] uppercase tracking-wider">
                Tier 2 • DVR / NVR HDD
              </span>
              <HardDrive className="w-4 h-4 text-blue-400" />
            </div>
            <h4 className="font-bold text-sm text-slate-200">Local Recorder SATA HDD</h4>
            <p className="text-xs text-slate-400">
              Recorder disks reported by hardware telemetry and matched to camera channels.
            </p>
            <div className="pt-2 border-t border-slate-800 text-[11px] flex justify-between text-slate-400">
              <span>Status:</span>
              <strong className="text-blue-400">
                {summary.tier2DvrHddCount > 0 ? `${summary.tier2DvrHddCount} Healthy (${summary.dvrHddNode.capacity})` : "0 Healthy"}
              </strong>
            </div>
          </div>

          {/* Tier 3: Online Cloud Recording */}
          <div className="p-4 rounded-xl bg-slate-900/80 border border-purple-500/30 bg-purple-500/5 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-semibold text-[10px] uppercase tracking-wider">
                Tier 3 • Online Cloud
              </span>
              <Cloud className="w-4 h-4 text-purple-400" />
            </div>
            <h4 className="font-bold text-sm text-slate-200">Online Cloud Recording</h4>
            <p className="text-xs text-slate-400">
              Cloud storage is shown only when a healthy configured storage node is reported.
            </p>
            <div className="pt-2 border-t border-slate-800 text-[11px] flex justify-between text-slate-400">
              <span>Status:</span>
              <strong className="text-purple-400">
                {summary.cloudNode.status === "healthy" ? `Available (${summary.cloudNode.capacity})` : "Unavailable"}
              </strong>
            </div>
          </div>
        </div>

        {/* Camera-Level Storage Diagnosis & Assignment Table */}
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <Layers className="w-4 h-4 text-amber-400" />
              Camera Storage Detection & Resolution Map
            </h3>

            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
              {(["all", "sd_card", "dvr_hdd", "online_cloud", "unavailable"] as const).map((tier) => (
                <button
                  key={tier}
                  onClick={() => setSelectedTierFilter(tier)}
                  className={`px-2.5 py-1 rounded-md capitalize font-medium transition-all ${
                    selectedTierFilter === tier
                      ? "bg-blue-600 text-white shadow-sm"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {tier === "all" ? "All Cameras" : tier.replace("_", " ")}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950 overflow-hidden">
            {loadError && <p role="alert" className="px-4 py-3 text-sm text-amber-300">{loadError}</p>}
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/90 text-slate-400 border-b border-slate-800 font-mono text-[11px]">
                <tr>
                  <th className="px-4 py-3">Camera & IP</th>
                  <th className="px-4 py-3">Available Storage Medium</th>
                  <th className="px-4 py-3">Storage Specifications</th>
                  <th className="px-4 py-3">Capacity / Usage</th>
                  <th className="px-4 py-3">Retention</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-sans">
                {loading && cameras.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                      <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-blue-400" />
                      Scanning connected cameras and storage topology...
                    </td>
                  </tr>
                ) : filteredCameras.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                      No cameras found matching the selected storage tier filter.
                    </td>
                  </tr>
                ) : (
                  filteredCameras.map((cam) => (
                    <tr key={cam.cameraId} className="hover:bg-slate-900/40 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-bold text-slate-200">{cam.cameraName}</div>
                        <div className="font-mono text-[11px] text-slate-500">
                          {cam.cameraId.toUpperCase()} • {cam.ipAddress}
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        {cam.activeStorageTier === "sd_card" && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-300 font-mono text-[11px] font-semibold border border-emerald-500/30">
                            <Cpu className="w-3 h-3" />
                            Tier 1: Onboard SD Card
                          </span>
                        )}
                        {cam.activeStorageTier === "dvr_hdd" && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/15 text-blue-300 font-mono text-[11px] font-semibold border border-blue-500/30">
                            <HardDrive className="w-3 h-3" />
                            Tier 2: DVR NVR Hard Disk
                          </span>
                        )}
                        {cam.activeStorageTier === "online_cloud" && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-purple-500/15 text-purple-300 font-mono text-[11px] font-semibold border border-purple-500/30">
                            <Cloud className="w-3 h-3" />
                            Tier 3: Cloud Available
                          </span>
                        )}
                        {cam.activeStorageTier === "unavailable" && <span className="text-amber-300">No verified target</span>}
                        {cam.activeStorageTier !== "unavailable" && (
                          <div className="mt-1 text-[10px] text-amber-300">Recording on this medium is unverified</div>
                        )}
                      </td>

                      <td className="px-4 py-3 text-slate-300 font-mono text-[11px]">
                        {cam.storageDetails}
                      </td>

                      <td className="px-4 py-3">
                        <div className="font-mono text-slate-200 font-semibold">{cam.capacity}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{cam.used}</div>
                      </td>

                      <td className="px-4 py-3 font-mono font-bold text-amber-400">
                        {cam.retentionDays == null ? "Unverified" : `${cam.retentionDays} Days`}
                      </td>

                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={cam.branchId ? `/recordings?branchId=${encodeURIComponent(cam.branchId)}&cameraId=${encodeURIComponent(cam.cameraId)}` : `/recordings?cameraId=${encodeURIComponent(cam.cameraId)}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 text-[11px] font-medium border border-blue-500/30 transition-all"
                            title="Play and scrub stored footage for this camera"
                          >
                            <Play className="w-3 h-3 fill-current" />
                            View Footage
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Live Storage Telemetry - Memory Card and Hard Disk Separate Display */}
      <LiveStorageTelemetryWidget />

      {/* Existing Operational HDD Fleet Health & Projections */}
      <HddFleetWidget detailed />
      <ComponentDetailPage title="Storage and disk health" component="storage" />
    </div>
  );
}
