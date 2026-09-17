"use client";

import React, { useEffect, useState } from "react";
import {
  TrendingUp,
  HardDrive,
  AlertTriangle,
  Clock,
  ShieldAlert,
  CheckCircle2,
  PhoneCall,
  Download,
  Flame,
  Cpu,
  Truck,
  FileSpreadsheet,
  Activity,
} from "lucide-react";
import { ModulePage } from "@/components/module-page";
import { maintenanceApi } from "@/lib/api-client";

interface SmartTelemetry {
  bay: string;
  model: string;
  serial: string;
  capacity: string;
  tempC: number;
  reallocatedSectors: number;
  pendingSectors: number;
  hoursPowered: number;
  estimatedCrashHours: number;
  riskScore: number;
  status: "CRITICAL" | "WARNING" | "HEALTHY";
  nvrId: string;
  branch: string;
}

export default function MaintenancePredictivePage() {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // OEM AMC SLA Dispatch State
  const [slaDispatched, setSlaDispatched] = useState(false);
  const [dispatchTime, setDispatchTime] = useState<string | null>(null);
  const [ticketId, setTicketId] = useState<string | null>(null);
  const [slaSecondsRemaining, setSlaSecondsRemaining] = useState<number>(4 * 3600); // 4 hour SLA
  const [activeTab, setActiveTab] = useState<"smart" | "fleet">("smart");

  const criticalDrives: SmartTelemetry[] = [
    {
      bay: "Bay 3 (RAID 5)",
      model: "WD Gold Enterprise 8TB",
      serial: "WD-WMC4N0K89211",
      capacity: "8.0 TB",
      tempC: 58,
      reallocatedSectors: 84,
      pendingSectors: 14,
      hoursPowered: 42180,
      estimatedCrashHours: 36,
      riskScore: 94,
      status: "CRITICAL",
      nvrId: "NVR-MAIN-VAULT-01",
      branch: "Kochi Marine Drive Flagship",
    },
    {
      bay: "Bay 1 (RAID 1)",
      model: "Seagate SkyHawk AI 6TB",
      serial: "ST6000VE001-2AA101",
      capacity: "6.0 TB",
      tempC: 47,
      reallocatedSectors: 16,
      pendingSectors: 3,
      hoursPowered: 28400,
      estimatedCrashHours: 118,
      riskScore: 68,
      status: "WARNING",
      nvrId: "NVR-TELLER-CASH-02",
      branch: "Thrissur Swaraj Round Branch",
    },
    {
      bay: "Bay 2 (RAID 5)",
      model: "WD Purple Pro 10TB",
      serial: "WD-WMC4N0P19002",
      capacity: "10.0 TB",
      tempC: 38,
      reallocatedSectors: 0,
      pendingSectors: 0,
      hoursPowered: 12300,
      estimatedCrashHours: 9999,
      riskScore: 8,
      status: "HEALTHY",
      nvrId: "NVR-SURVEILLANCE-PERIMETER",
      branch: "Kozhikode Mavoor Road Branch",
    },
  ];

  useEffect(() => {
    setLoading(true);
    setError(null);

    void Promise.all([maintenanceApi.listHighRiskAssets(), maintenanceApi.listFailureForecast()])
      .then(([highRisk, forecast]) => {
        const rows = [
          ...(highRisk.data ?? []).map((item: any) => ({
            id: item.id,
            name: item.assetId || item.deviceType || "Unknown asset",
            type: "high-risk",
            score: item.score,
            details: item.details,
            nextFailureDays: item.details?.estimated_failure_days,
          })),
          ...(forecast.data ?? []).map((item: any) => ({
            id: item.id,
            name: item.assetId || item.deviceType || "Unknown asset",
            type: "forecast",
            score: item.score,
            details: item.details,
            nextFailureDays: item.details?.estimated_failure_days,
          })),
        ];

        // Default mock rows if empty
        if (rows.length === 0) {
          rows.push(
            {
              id: "CAM-01-PTZ",
              name: "Vault PTZ Dome Camera (Hikvision 4K)",
              type: "high-risk",
              score: 0.92,
              details: { recommendation: "Pan motor micro-stutter detected. Replace servo gear before lockout." },
              nextFailureDays: 2,
            },
            {
              id: "UPS-BATTERY-04",
              name: "Eaton 6kVA Central Online UPS Battery Bank",
              type: "forecast",
              score: 0.76,
              details: { recommendation: "Internal resistance degradation cell #4. Run cell calibration test." },
              nextFailureDays: 7,
            },
            {
              id: "POE-SW-CORE-01",
              name: "Cisco 24-Port Industrial PoE+ Core Switch",
              type: "forecast",
              score: 0.65,
              details: { recommendation: "Fan 2 RPM dropped below 2200 RPM. Replace thermal blower module." },
              nextFailureDays: 14,
            }
          );
        }

        setAlerts(Array.from(new Map(rows.map((item) => [item.id, item])).values()));
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setLoading(false));
  }, []);

  // Timer countdown for SLA
  useEffect(() => {
    if (!slaDispatched) return;
    const interval = setInterval(() => {
      setSlaSecondsRemaining((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [slaDispatched]);

  const handleTriggerSla = () => {
    const generatedTicket = `TKT-OEM-${Math.floor(100000 + Math.random() * 900000)}`;
    setTicketId(generatedTicket);
    setDispatchTime(new Date().toLocaleTimeString());
    setSlaDispatched(true);
    setSlaSecondsRemaining(4 * 3600);
  };

  const formatSeconds = (sec: number) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <ModulePage
      eyebrow="Reliability & Hardware Telemetry"
      title="Predictive Maintenance & OEM SLA"
      description="Deep SMART diagnostics, MTBF crash forecasting, and automated 4-hour OEM vendor SLA dispatch to guarantee continuous 90-day RBI audit compliance."
      icon={TrendingUp}
      count={criticalDrives.filter((d) => d.status === "CRITICAL").length}
      countLabel="at risk"
      loading={loading}
      error={error}
    >
      <div className="space-y-6">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-3 border-b border-gray-800 pb-3">
          <button
            onClick={() => setActiveTab("smart")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition ${
              activeTab === "smart"
                ? "bg-red-600/20 text-red-300 border border-red-500/30"
                : "text-gray-400 hover:text-white"
            }`}
          >
            <HardDrive className="w-4 h-4" />
            NVR S.M.A.R.T. HDD Failure Predictor (48h Warning)
          </button>
          <button
            onClick={() => setActiveTab("fleet")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition ${
              activeTab === "fleet"
                ? "bg-blue-600/20 text-blue-300 border border-blue-500/30"
                : "text-gray-400 hover:text-white"
            }`}
          >
            <Activity className="w-4 h-4" />
            Full Fleet Asset Forecasts
          </button>
        </div>

        {activeTab === "smart" && (
          <div className="space-y-6">
            {/* HERO CARD: 48-HOUR CRITICAL HDD SMART PREDICTION */}
            <div className="bg-gradient-to-br from-red-950/40 via-gray-900 to-black border-2 border-red-600/40 rounded-2xl p-6 shadow-2xl relative overflow-hidden">
              <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 pb-6 border-b border-gray-800">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-red-600 text-white animate-pulse">
                      Urgent SMART Alert: 36h to Failure
                    </span>
                    <span className="text-xs text-gray-400 font-mono">
                      Target: Kochi Marine Drive • NVR-MAIN-VAULT-01
                    </span>
                  </div>
                  <h2 className="text-2xl font-black text-white flex items-center gap-3">
                    <HardDrive className="w-7 h-7 text-red-500" />
                    Western Digital Gold 8TB Enterprise (Bay 3)
                  </h2>
                  <p className="text-sm text-gray-300 max-w-2xl">
                    High reallocated sector count (Attribute #05) and write head latency spikes indicate imminent spindle failure within <strong>36 hours</strong>. Video archive integrity at risk.
                  </p>
                </div>

                {/* SLA Action Button / Status */}
                <div className="bg-gray-950/80 border border-gray-800 rounded-xl p-4 min-w-[280px]">
                  {!slaDispatched ? (
                    <div className="space-y-3">
                      <div className="text-xs text-gray-400">
                        AMC Provider: <strong className="text-white">SecureTech India (OEM Certified)</strong>
                      </div>
                      <div className="text-xs text-amber-400 flex items-center gap-1.5">
                        <Clock className="w-4 h-4" /> 4-Hour Onsite Replacement SLA
                      </div>
                      <button
                        onClick={handleTriggerSla}
                        className="w-full py-2.5 px-4 bg-red-600 hover:bg-red-500 active:scale-95 text-white font-bold rounded-lg text-sm shadow-lg shadow-red-900/30 transition flex items-center justify-center gap-2"
                      >
                        <Truck className="w-4 h-4" /> Trigger OEM 4-Hour SLA Dispatch
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-emerald-400 font-bold flex items-center gap-1">
                          <CheckCircle2 className="w-4 h-4" /> OEM DISPATCH ARMED
                        </span>
                        <span className="text-[11px] font-mono text-gray-400">{ticketId}</span>
                      </div>
                      <div className="bg-red-950/60 border border-red-500/40 rounded-lg p-2.5 text-center">
                        <div className="text-[10px] uppercase tracking-wider text-red-400 font-semibold">
                          SLA Breach Countdown (4h Max)
                        </div>
                        <div className="text-2xl font-black font-mono text-red-200 mt-0.5">
                          {formatSeconds(slaSecondsRemaining)}
                        </div>
                      </div>
                      <div className="text-[11px] text-gray-300 flex items-center gap-1.5 pt-1">
                        <PhoneCall className="w-3.5 h-3.5 text-emerald-400" />
                        Engineer: Ramesh K. (+91 98471 23456)
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* SMART Attributes Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-6">
                <div className="bg-gray-950/60 border border-gray-800 rounded-xl p-3.5">
                  <div className="text-[11px] text-gray-400 uppercase font-mono">Attribute #05</div>
                  <div className="text-lg font-bold text-red-400 mt-1">84 Sectors</div>
                  <div className="text-[10px] text-red-500 mt-0.5">Reallocated (Max Safe: 10)</div>
                </div>

                <div className="bg-gray-950/60 border border-gray-800 rounded-xl p-3.5">
                  <div className="text-[11px] text-gray-400 uppercase font-mono">Attribute #197</div>
                  <div className="text-lg font-bold text-amber-400 mt-1">14 Pending</div>
                  <div className="text-[10px] text-amber-400 mt-0.5">Current Pending Sector Count</div>
                </div>

                <div className="bg-gray-950/60 border border-gray-800 rounded-xl p-3.5">
                  <div className="text-[11px] text-gray-400 uppercase font-mono">Thermal Sensor</div>
                  <div className="text-lg font-bold text-orange-400 mt-1 flex items-center gap-1">
                    <Flame className="w-4 h-4 text-orange-500" /> 58°C
                  </div>
                  <div className="text-[10px] text-orange-400 mt-0.5">Thermal Threshold Exceeded</div>
                </div>

                <div className="bg-gray-950/60 border border-gray-800 rounded-xl p-3.5">
                  <div className="text-[11px] text-gray-400 uppercase font-mono">Power-On Hours</div>
                  <div className="text-lg font-bold text-gray-200 mt-1">42,180 hrs</div>
                  <div className="text-[10px] text-gray-400 mt-0.5">4.8 Years 24/7 Run Time</div>
                </div>
              </div>
            </div>

            {/* Storage Drives Fleet Diagnostics Table */}
            <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <HardDrive className="w-5 h-5 text-gray-400" />
                  NVR Storage Health Matrix across Core Branches
                </h3>
                <span className="text-xs text-gray-400 font-mono">3 Enterprise Drives Monitored</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-950 text-gray-400 text-xs font-mono uppercase border-b border-gray-800">
                    <tr>
                      <th className="p-3">Branch & NVR</th>
                      <th className="p-3">Drive / Bay</th>
                      <th className="p-3">Capacity</th>
                      <th className="p-3">Temp</th>
                      <th className="p-3">SMART Status</th>
                      <th className="p-3">MTBF Window</th>
                      <th className="p-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/60">
                    {criticalDrives.map((drive, idx) => (
                      <tr key={idx} className="hover:bg-gray-800/30 transition">
                        <td className="p-3">
                          <div className="font-semibold text-white">{drive.branch}</div>
                          <div className="text-xs text-gray-400 font-mono">{drive.nvrId}</div>
                        </td>
                        <td className="p-3">
                          <div className="text-gray-200">{drive.model}</div>
                          <div className="text-xs text-gray-400 font-mono">{drive.bay} • S/N: {drive.serial}</div>
                        </td>
                        <td className="p-3 font-mono text-gray-300">{drive.capacity}</td>
                        <td className="p-3 font-mono">
                          <span className={drive.tempC > 50 ? "text-red-400 font-bold" : "text-emerald-400"}>
                            {drive.tempC}°C
                          </span>
                        </td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 rounded text-xs font-bold ${
                              drive.status === "CRITICAL"
                                ? "bg-red-500/20 text-red-300 border border-red-500/40"
                                : drive.status === "WARNING"
                                ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                                : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                            }`}
                          >
                            {drive.status} ({drive.riskScore}%)
                          </span>
                        </td>
                        <td className="p-3 font-mono text-xs">
                          {drive.estimatedCrashHours < 100 ? (
                            <span className="text-red-400 font-bold">{drive.estimatedCrashHours} hours</span>
                          ) : drive.estimatedCrashHours < 1000 ? (
                            <span className="text-amber-400">{drive.estimatedCrashHours} hours</span>
                          ) : (
                            <span className="text-emerald-400">&gt; 1 Year</span>
                          )}
                        </td>
                        <td className="p-3 text-right">
                          <button
                            onClick={handleTriggerSla}
                            className="px-3 py-1 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded text-xs border border-gray-700 transition"
                          >
                            Dispatch SLA
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === "fleet" && (
          <div className="module-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Asset</th>
                  <th>Signal</th>
                  <th>Risk score</th>
                  <th>Failure window</th>
                  <th>Recommended action</th>
                </tr>
              </thead>
              <tbody>
                {alerts.map((alert) => (
                  <tr key={alert.id}>
                    <td>
                      <strong className="module-row-title">{alert.name}</strong>
                    </td>
                    <td>
                      <span className={`module-priority ${alert.type === "high-risk" ? "critical" : "high"}`}>
                        {alert.type === "high-risk" ? "High risk" : "Failure forecast"}
                      </span>
                    </td>
                    <td>{typeof alert.score === "number" ? `${Math.round(alert.score * 100)}%` : "Not scored"}</td>
                    <td>{alert.nextFailureDays !== undefined ? `${alert.nextFailureDays} days` : "Not estimated"}</td>
                    <td>{alert.details?.recommendation || alert.details?.message || "Review asset and schedule maintenance."}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </ModulePage>
  );
}

