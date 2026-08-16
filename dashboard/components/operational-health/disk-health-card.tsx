"use client";

import React, { useState } from "react";
import { AlertTriangle, HardDrive, ThermometerSun, Activity } from "lucide-react";
import { DiskHealth, formatBytes, getTimeAgo } from "@/lib/types/operational-health";
import { DiskDetailModal } from "./disk-detail-modal";

interface DiskHealthCardProps {
  disk: DiskHealth;
}

const tone = {
  good: "border-emerald-200 bg-emerald-50 text-emerald-800",
  warn: "border-amber-200 bg-amber-50 text-amber-800",
  bad: "border-red-200 bg-red-50 text-red-800",
  neutral: "border-slate-200 bg-slate-50 text-slate-700",
} as const;

function EvidenceRow({ label, value, color }: { label: string; value: string; color: keyof typeof tone }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-gray-100 py-2 last:border-b-0">
      <span className="text-xs text-gray-500">{label}</span>
      <span className={`rounded border px-2 py-0.5 text-xs font-medium ${tone[color]}`}>{value}</span>
    </div>
  );
}

export function DiskHealthCard({ disk }: DiskHealthCardProps) {
  const [showModal, setShowModal] = useState(false);
  const warning = disk.operationalStatus === "warning" || disk.operationalStatus === "critical";
  const available = disk.capacityBytes > 0 ? `${formatBytes(disk.availableBytes)} (${Math.max(0, 100 - disk.usagePercent).toFixed(1)}%)` : "Unavailable";

  return (
    <>
      <div className="card transition-shadow hover:shadow-md">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className={`rounded-lg p-2 ${disk.detected ? "bg-emerald-100" : "bg-red-100"}`}>
              <HardDrive size={20} className={disk.detected ? "text-emerald-600" : "text-red-600"} />
            </div>
            <div>
              <h4 className="font-semibold text-gray-900">{disk.model}</h4>
              <p className="text-xs text-gray-500">{disk.branchName} · {disk.devicePath}</p>
            </div>
          </div>
          <span className={`rounded border px-2 py-1 text-xs font-medium ${tone[disk.operationalStatus === "healthy" ? "good" : disk.operationalStatus === "critical" ? "bad" : disk.operationalStatus === "warning" ? "warn" : "neutral"]}`}>
            {disk.operationalStatus}
          </span>
        </div>

        {warning ? (
          <div className={`mb-3 flex items-start gap-2 rounded border p-2 text-xs ${tone[disk.operationalStatus === "critical" ? "bad" : "warn"]}`}>
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            <span>{disk.reasonCodes.filter((code) => !code.endsWith("_unavailable") && code !== "disk_detected").slice(0, 3).map((code) => code.replaceAll("_", " ")).join("; ") || "Disk needs review"}</span>
          </div>
        ) : null}
        {disk.replacementDetected ? (
          <div className="mb-3 rounded border border-cyan-200 bg-cyan-50 p-2 text-xs text-cyan-800">
            Slot replacement detected: {disk.previousSerialNumber || "previous serial unavailable"} → {disk.serialNumber}
          </div>
        ) : null}

        <div className="rounded-lg border border-gray-200 px-3">
          <EvidenceRow label="HDD detected" value={disk.detected ? `Yes · ${disk.slotStatus.replaceAll("_", " ")}` : `No · ${disk.slotStatus.replaceAll("_", " ")}`} color={disk.detected && disk.slotStatus === "present" ? "good" : "bad"} />
          <EvidenceRow label="SMART health" value={disk.smartAvailable ? disk.smartStatus.replaceAll("_", " ") : "Unavailable"} color={!disk.smartAvailable ? "neutral" : disk.smartStatus === "healthy" ? "good" : ["warning", "degraded"].includes(disk.smartStatus) ? "warn" : "bad"} />
          <EvidenceRow label="RAID health" value={`${disk.raidStatus.replaceAll("_", " ")}${disk.raidLevel ? ` · ${disk.raidLevel}` : ""}`} color={disk.raidStatus === "healthy" || disk.raidStatus === "not_configured" ? "good" : disk.raidStatus === "unknown" ? "neutral" : disk.raidStatus === "failed" ? "bad" : "warn"} />
          <EvidenceRow label="Available capacity" value={available} color={disk.capacityBytes === 0 ? "neutral" : disk.usagePercent >= 95 ? "bad" : disk.usagePercent >= 85 ? "warn" : "good"} />
          <EvidenceRow label="Recording write" value={disk.writeVerification} color={disk.writeVerification === "verified" ? "good" : disk.writeVerification === "failed" ? "bad" : "neutral"} />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
          <div><p className="mb-1 text-gray-500">Temperature</p><p className="flex items-center gap-1 font-medium"><ThermometerSun size={12} />{disk.smartAvailable && disk.temperature ? `${disk.temperature}°C` : "--"}</p></div>
          <div><p className="mb-1 text-gray-500">SMART risk score</p><p className="font-medium">{disk.smartAvailable ? `${disk.failureProbability.toFixed(1)}%` : "--"}</p></div>
          <div><p className="mb-1 text-gray-500">Sector growth</p><p className="font-medium">{disk.predictionBasis === "historical_delta" ? `+${disk.sectorGrowth}` : "No history"}</p></div>
          <div><p className="mb-1 text-gray-500">Prediction basis</p><p className="font-medium">{disk.predictionBasis.replaceAll("_", " ")}</p></div>
        </div>

        <div className="mt-3 flex items-center justify-between border-t pt-3 text-xs text-gray-500">
          <span>Serial: {disk.serialNumber}</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-1 text-sky-600 hover:text-sky-800 font-semibold transition"
            >
              <Activity size={12} /> SMART Details
            </button>
            <span>·</span>
            <span>{getTimeAgo(disk.lastCheck)}</span>
          </div>
        </div>
      </div>

      {showModal && (
        <DiskDetailModal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          diskId={disk.id}
        />
      )}
    </>
  );
}
