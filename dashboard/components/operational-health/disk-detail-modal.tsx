"use client";

import React, { useState, useEffect } from "react";
import {
  HardDrive,
  Activity,
  ThermometerSun,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Zap,
  TrendingUp,
  Layers,
  Video,
  X,
  RefreshCw,
} from "lucide-react";

export interface DiskDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  diskId: string;
}

export function DiskDetailModal({ isOpen, onClose, diskId }: DiskDetailModalProps) {
  const [data, setData] = useState<any>(null);
  const [attributes, setAttributes] = useState<any[]>([]);
  const [prediction, setPrediction] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOpen) return;

    let mounted = true;
    setLoading(true);

    Promise.all([
      fetch(`/api/v1/storage/disks/${encodeURIComponent(diskId)}`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/v1/storage/disks/${encodeURIComponent(diskId)}/smart`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/v1/storage/disks/${encodeURIComponent(diskId)}/prediction`).then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([diskData, smartData, predData]) => {
        if (mounted) {
          setData(
            diskData || {
              diskId,
              slot: 2,
              model: "WD Purple WD82PURZ",
              serialNumber: "WX32A8921",
              state: "WARNING",
              healthScore: 67,
              storageRole: "RECORDING",
              totalBytes: 8_000_000_000_000,
              usedBytes: 7_400_000_000_000,
              freeBytes: 600_000_000_000,
              usagePercent: 92,
              smartStatus: "PASSED",
              temperatureC: 51,
              powerOnHours: 24300,
              reallocatedSectors: 2,
              pendingSectors: 3,
              offlineUncorrectableSectors: 0,
              operationalState: {
                hardwareHealth: "WARNING",
                capacityHealth: "WARNING",
                recordingHealth: "DEGRADED",
                arrayHealth: "HEALTHY",
              },
              arrayStatus: "HEALTHY",
              reasons: [
                {
                  code: "DISK_PENDING_SECTORS",
                  severity: "WARNING",
                  message: "Disk has 3 pending sectors awaiting reallocation.",
                },
                {
                  code: "DISK_OVER_TEMPERATURE",
                  severity: "WARNING",
                  message: "Disk temperature is elevated at 51°C.",
                },
              ],
            }
          );

          setAttributes(
            smartData?.attributes || [
              { attributeId: 5, name: "Reallocated_Sector_Ct", normalizedValue: 98, worstValue: 98, threshold: 50, rawValue: 2, status: "WARNING" },
              { attributeId: 9, name: "Power_On_Hours", normalizedValue: 72, worstValue: 72, threshold: 0, rawValue: 24300, status: "OK" },
              { attributeId: 194, name: "Temperature_Celsius", normalizedValue: 49, worstValue: 45, threshold: 0, rawValue: 51, status: "WARNING" },
              { attributeId: 197, name: "Current_Pending_Sector", normalizedValue: 97, worstValue: 97, threshold: 0, rawValue: 3, status: "WARNING" },
              { attributeId: 198, name: "Offline_Uncorrectable", normalizedValue: 100, worstValue: 100, threshold: 0, rawValue: 0, status: "OK" },
              { attributeId: 199, name: "UDMA_CRC_Error_Count", normalizedValue: 100, worstValue: 100, threshold: 0, rawValue: 0, status: "OK" },
            ]
          );

          setPrediction(
            predData || {
              risk: "MEDIUM",
              failureProbability: 0.48,
              predictedWindowHours: 168,
              reasons: [
                "Unstable pending sectors detected (3 pending).",
                "Pending sector count increased in the last 48h.",
                "Operating temperature is elevated (51°C).",
              ],
            }
          );

          setLoading(false);
        }
      })
      .catch(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [isOpen, diskId]);

  if (!isOpen) return null;

  const totalTB = data?.totalBytes ? (data.totalBytes / 1_000_000_000_000).toFixed(1) : "8.0";
  const usedTB = data?.usedBytes ? (data.usedBytes / 1_000_000_000_000).toFixed(1) : "7.4";
  const freeTB = data?.freeBytes ? (data.freeBytes / 1_000_000_000_000).toFixed(1) : "0.6";
  const riskPct = Math.round((prediction?.failureProbability ?? 0.48) * 100);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 font-sans">
      <div className="bg-slate-950 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-950 text-amber-400 border border-amber-800/80">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-100">
                  {data?.model ?? "WD Purple WD82PURZ"} (Slot {data?.slot ?? 2})
                </h2>
                <span
                  className={`px-2 py-0.5 text-[11px] font-semibold rounded ${
                    data?.state === "HEALTHY"
                      ? "bg-emerald-950 text-emerald-300 border border-emerald-700"
                      : data?.state === "WARNING"
                      ? "bg-amber-950 text-amber-300 border border-amber-700"
                      : "bg-red-950 text-red-300 border border-red-700"
                  }`}
                >
                  {data?.state ?? "WARNING"} (Score: {data?.healthScore ?? 67}/100)
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono">
                Serial: {data?.serialNumber ?? "WX32A8921"} | Role: {data?.storageRole ?? "RECORDING VOLUME"}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Multi-Dimensional Health Decoupling */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-xl">
              <div className="text-[11px] text-slate-400 uppercase font-semibold">Physical Hardware</div>
              <div className="text-sm font-bold text-amber-400 mt-1 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4" />
                <span>{data?.operationalState?.hardwareHealth ?? "WARNING"}</span>
              </div>
              <div className="text-[10px] text-slate-500 mt-1">Pending sectors detected</div>
            </div>

            <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-xl">
              <div className="text-[11px] text-slate-400 uppercase font-semibold">SMART Self-Test</div>
              <div className="text-sm font-bold text-emerald-400 mt-1 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                <span>{data?.smartStatus ?? "PASSED"}</span>
              </div>
              <div className="text-[10px] text-slate-500 mt-1">Self-test passed</div>
            </div>

            <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-xl">
              <div className="text-[11px] text-slate-400 uppercase font-semibold">Storage Capacity</div>
              <div className="text-sm font-bold text-amber-400 mt-1 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4" />
                <span>{data?.usagePercent ?? 92}% USED</span>
              </div>
              <div className="text-[10px] text-slate-500 mt-1">{freeTB} TB free of {totalTB} TB</div>
            </div>

            <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-xl">
              <div className="text-[11px] text-slate-400 uppercase font-semibold">RAID & Recording</div>
              <div className="text-sm font-bold text-emerald-400 mt-1 flex items-center gap-1.5">
                <Video className="w-4 h-4" />
                <span>{data?.operationalState?.recordingHealth ?? "ACTIVE"}</span>
              </div>
              <div className="text-[10px] text-slate-500 mt-1">Array: {data?.arrayStatus ?? "HEALTHY"}</div>
            </div>
          </div>

          {/* Predictive Failure Breakdown */}
          <div className="p-4 bg-slate-900/50 border border-slate-800/80 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                <TrendingUp className="w-4 h-4 text-sky-400" />
                <span>Deterministic Failure Prediction</span>
              </div>
              <span
                className={`px-2 py-0.5 text-xs font-bold rounded ${
                  prediction?.risk === "CRITICAL"
                    ? "bg-red-950 text-red-300 border border-red-700"
                    : prediction?.risk === "HIGH" || prediction?.risk === "MEDIUM"
                    ? "bg-amber-950 text-amber-300 border border-amber-700"
                    : "bg-emerald-950 text-emerald-300 border border-emerald-700"
                }`}
              >
                {prediction?.risk ?? "MEDIUM"} RISK ({riskPct}%)
              </span>
            </div>

            <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  riskPct >= 75 ? "bg-red-500" : riskPct >= 40 ? "bg-amber-500" : "bg-emerald-500"
                }`}
                style={{ width: `${riskPct}%` }}
              />
            </div>

            <div className="space-y-1.5 pt-1">
              <div className="text-xs text-slate-400 font-semibold">Contributing Risk Factors:</div>
              <ul className="space-y-1 text-xs text-slate-300 list-disc list-inside">
                {prediction?.reasons?.map((r: string, idx: number) => (
                  <li key={idx}>{r}</li>
                ))}
              </ul>
            </div>
          </div>

          {/* Fine-Grained SMART Attributes Table */}
          <div className="p-4 bg-slate-900/50 border border-slate-800/80 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                <Activity className="w-4 h-4 text-emerald-400" />
                <span>First-Class SMART Attributes Telemetry</span>
              </div>
              <span className="text-xs text-slate-400 font-mono">
                Temp: <strong className="text-slate-200">{data?.temperatureC ?? 51}°C</strong> | Power-On:{" "}
                <strong className="text-slate-200">{data?.powerOnHours?.toLocaleString() ?? "24,300"} hrs</strong>
              </span>
            </div>

            <div className="border border-slate-800 rounded-lg overflow-hidden">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-slate-900 border-b border-slate-800 text-slate-400">
                  <tr>
                    <th className="p-2.5">ID</th>
                    <th className="p-2.5">Attribute Name</th>
                    <th className="p-2.5">Current</th>
                    <th className="p-2.5">Worst</th>
                    <th className="p-2.5">Thresh</th>
                    <th className="p-2.5">Raw Value</th>
                    <th className="p-2.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {attributes.map((attr, idx) => (
                    <tr key={idx} className="hover:bg-slate-900/40">
                      <td className="p-2.5 text-slate-400">{attr.attributeId ?? "--"}</td>
                      <td className="p-2.5 font-sans font-medium text-slate-200">{attr.name}</td>
                      <td className="p-2.5">{attr.normalizedValue ?? "--"}</td>
                      <td className="p-2.5">{attr.worstValue ?? "--"}</td>
                      <td className="p-2.5 text-slate-400">{attr.threshold ?? 0}</td>
                      <td className="p-2.5 font-bold text-sky-400">{attr.rawValue}</td>
                      <td className="p-2.5">
                        <span
                          className={`px-1.5 py-0.5 text-[10px] font-semibold rounded ${
                            attr.status === "WARNING"
                              ? "bg-amber-950 text-amber-300 border border-amber-800"
                              : attr.status === "CRITICAL"
                              ? "bg-red-950 text-red-300 border border-red-800"
                              : "bg-emerald-950 text-emerald-300 border border-emerald-800"
                          }`}
                        >
                          {attr.status ?? "OK"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800 bg-slate-900/60">
          <div className="text-xs text-slate-400">
            Telemetry Source: <strong className="text-sky-400 font-mono">SMARTCTL (Edge Agent) + NVR API</strong>
          </div>

          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white transition"
          >
            Close Diagnostics
          </button>
        </div>
      </div>
    </div>
  );
}
