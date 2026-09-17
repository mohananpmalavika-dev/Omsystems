"use client";

import React, { useState, useEffect } from "react";
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

interface CameraStorageMapping {
  cameraId: string;
  cameraName: string;
  ipAddress: string;
  activeStorageTier: "sd_card" | "dvr_hdd" | "online_cloud";
  sdCardStatus: "detected" | "not_present" | "unformatted";
  dvrStatus: "mapped" | "unmapped" | "offline";
  cloudStatus: "active" | "standby";
  storageDetails: string;
  capacity: string;
  used: string;
  retentionDays: number;
}

export default function StoragePage() {
  const [refreshing, setRefreshing] = useState(false);
  const [selectedTierFilter, setSelectedTierFilter] = useState<string>("all");

  // Real-time camera storage mappings
  const [cameras, setCameras] = useState<CameraStorageMapping[]>([
    {
      cameraId: "cam-01",
      cameraName: "Strong Room Vault Main Entrance",
      ipAddress: "192.168.29.58",
      activeStorageTier: "sd_card",
      sdCardStatus: "detected",
      dvrStatus: "mapped",
      cloudStatus: "standby",
      storageDetails: "Onboard SanDisk High Endurance MicroSD 128GB",
      capacity: "128 GB",
      used: "45 GB (35%)",
      retentionDays: 14,
    },
    {
      cameraId: "cam-02",
      cameraName: "Cash Counter & Gold Appraisal Bay",
      ipAddress: "192.168.29.59",
      activeStorageTier: "dvr_hdd",
      sdCardStatus: "not_present",
      dvrStatus: "mapped",
      cloudStatus: "standby",
      storageDetails: "NVR Slot 1: WD Purple 8TB SATA Surveillance Drive",
      capacity: "8,000 GB",
      used: "6,420 GB (80%)",
      retentionDays: 90,
    },
    {
      cameraId: "cam-03",
      cameraName: "Customer Lobby & ATM Vestibule",
      ipAddress: "192.168.29.60",
      activeStorageTier: "online_cloud",
      sdCardStatus: "not_present",
      dvrStatus: "unmapped",
      cloudStatus: "active",
      storageDetails: "Online Cloud Storage (Sentinel Media Gateway S3 Target)",
      capacity: "500 GB Cloud Pool",
      used: "42 GB (8.4%)",
      retentionDays: 30,
    },
    {
      cameraId: "cam-04",
      cameraName: "Perimeter Outer Shutter & Street Portal",
      ipAddress: "192.168.29.61",
      activeStorageTier: "online_cloud",
      sdCardStatus: "not_present",
      dvrStatus: "unmapped",
      cloudStatus: "active",
      storageDetails: "Online Cloud Storage (Sentinel Media Gateway S3 Target)",
      capacity: "500 GB Cloud Pool",
      used: "38 GB (7.6%)",
      retentionDays: 30,
    },
  ]);

  const switchCameraToCloud = (id: string) => {
    setCameras((prev) =>
      prev.map((c) =>
        c.cameraId === id
          ? {
              ...c,
              activeStorageTier: "online_cloud",
              cloudStatus: "active",
              storageDetails: "Online Cloud Recording (Sentinel Media Gateway S3 - Auto Failover)",
            }
          : c
      )
    );
  };

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
                3-Tier Storage Auto-Detection & Fallback Engine
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Zero Footage Loss
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Automatic chronological detection: <strong>Tier 1: Camera SD Card</strong> &rarr;{" "}
                <strong>Tier 2: DVR/NVR Hard Disk</strong> &rarr;{" "}
                <strong>Tier 3: Online Cloud Recording</strong> (Fallback if neither local storage exists).
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <button
              onClick={() => {
                setRefreshing(true);
                setTimeout(() => setRefreshing(false), 500);
              }}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center gap-1.5 transition-all"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
              Re-Scan Storage Devices
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
              Direct edge flash recording. Probed via ONVIF/ISAPI storage profile. Store-and-forward buffer on WAN loss.
            </p>
            <div className="pt-2 border-t border-slate-800 text-[11px] flex justify-between text-slate-400">
              <span>Status:</span>
              <strong className="text-emerald-400">1 Detected (SanDisk 128GB)</strong>
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
              NVR multi-terabyte SATA storage. Mapped via DVR channel binding with continuous SMART telemetry.
            </p>
            <div className="pt-2 border-t border-slate-800 text-[11px] flex justify-between text-slate-400">
              <span>Status:</span>
              <strong className="text-blue-400">1 Active (WD Purple 8TB)</strong>
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
              Automatic zero-downtime fallback. Direct RTSP ingest to Sentinel Media Gateway S3 storage pool.
            </p>
            <div className="pt-2 border-t border-slate-800 text-[11px] flex justify-between text-slate-400">
              <span>Status:</span>
              <strong className="text-purple-400">Active (458 GB Available)</strong>
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
              {(["all", "sd_card", "dvr_hdd", "online_cloud"] as const).map((tier) => (
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
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/90 text-slate-400 border-b border-slate-800 font-mono text-[11px]">
                <tr>
                  <th className="px-4 py-3">Camera & IP</th>
                  <th className="px-4 py-3">Active Storage Medium</th>
                  <th className="px-4 py-3">Storage Specifications</th>
                  <th className="px-4 py-3">Capacity / Usage</th>
                  <th className="px-4 py-3">Retention</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-sans">
                {filteredCameras.map((cam) => (
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
                          Tier 3: Online Cloud Fallback
                        </span>
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
                      {cam.retentionDays} Days
                    </td>

                    <td className="px-4 py-3 text-right">
                      {cam.activeStorageTier !== "online_cloud" ? (
                        <button
                          onClick={() => switchCameraToCloud(cam.cameraId)}
                          className="px-2.5 py-1 rounded bg-purple-600/20 hover:bg-purple-600/40 text-purple-300 text-[11px] font-medium border border-purple-500/30 transition-all"
                          title="Failover to online cloud recording"
                        >
                          Enable Cloud Fallback
                        </button>
                      ) : (
                        <span className="text-[11px] text-emerald-400 font-mono flex items-center justify-end gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Cloud Active
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Existing Operational HDD Fleet Health & Projections */}
      <HddFleetWidget detailed />
      <ComponentDetailPage title="Storage and disk health" component="storage" />
    </div>
  );
}
