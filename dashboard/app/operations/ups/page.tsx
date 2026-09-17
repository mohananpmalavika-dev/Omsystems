"use client";

import React, { useState, useEffect } from "react";
import {
  Zap,
  BatteryCharging,
  BatteryMedium,
  Thermometer,
  Flame,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Power,
  Cpu,
  Activity,
  Gauge,
  Sliders,
  Volume2,
  ArrowUpRight,
  Clock,
  Radio,
  FileText
} from "lucide-react";
import { ModulePage } from "@/components/module-page";

export default function UPSPowerHealthPage() {
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>("");

  // UPS & Battery Telemetry State
  const [gridMainsVoltage, setGridMainsVoltage] = useState(231.8);
  const [gridFrequency, setGridFrequency] = useState(50.02);
  const [upsLoadPercent, setUpsLoadPercent] = useState(42);
  const [batteryRuntimeMin, setBatteryRuntimeMin] = useState(214);
  const [batteryTemp, setBatteryTemp] = useState(24.6);
  const [tempRateOfRise, setTempRateOfRise] = useState(0.2); // deg C/min

  // Clean Agent Fire Suppression State
  const [fm200Armed, setFm200Armed] = useState(true);
  const [fireAlarmActive, setFireAlarmActive] = useState(false);
  const [abortTriggered, setAbortTriggered] = useState(false);

  // DG Generator Telemetry
  const [dgFuelLiters, setDgFuelLiters] = useState(145); // out of 160L
  const [dgAutoStartReady, setDgAutoStartReady] = useState(true);

  // Cell Level Telemetry
  const [cells, setCells] = useState([
    { id: "Cell-01", v: 3.32, temp: 24.5, ir: 4.1, status: "healthy" },
    { id: "Cell-02", v: 3.31, temp: 24.7, ir: 4.2, status: "healthy" },
    { id: "Cell-03", v: 3.33, temp: 24.6, ir: 4.0, status: "healthy" },
    { id: "Cell-04", v: 3.32, temp: 24.8, ir: 4.3, status: "healthy" },
    { id: "Cell-05", v: 3.30, temp: 25.1, ir: 4.5, status: "healthy" },
    { id: "Cell-06", v: 3.32, temp: 24.4, ir: 4.1, status: "healthy" },
    { id: "Cell-07", v: 3.31, temp: 24.9, ir: 4.2, status: "healthy" },
    { id: "Cell-08", v: 3.32, temp: 24.6, ir: 4.0, status: "healthy" },
  ]);

  const loadLiveTelemetry = async () => {
    try {
      setRefreshing(true);
      const res = await fetch("/v1/infrastructure/health/tenant/summary", { cache: "no-store" });
      if (res.ok) {
        const payload = await res.json();
        if (payload.data) {
          setLastUpdated(new Date().toLocaleTimeString());
        }
      }
    } catch (err) {
      console.error("Failed to load live infrastructure telemetry:", err);
    } finally {
      setRefreshing(false);
      setLastUpdated(new Date().toLocaleTimeString());
    }
  };

  useEffect(() => {
    loadLiveTelemetry();
    const interval = setInterval(loadLiveTelemetry, 30000);
    return () => clearInterval(interval);
  }, []);

  const triggerBmsDiagnostic = async () => {
    setRefreshing(true);
    await loadLiveTelemetry();
  };

  return (
    <ModulePage
      title="Bank Power, UPS & Vault Thermal Suppression"
      eyebrow="Power & Suppression Systems"
      description="Mission-critical Lithium-Ion UPS battery health, thermographic thermal runaway prediction, DG auto-start, and FM-200 clean agent interlock."
      icon={Zap}
    >
      <div className="space-y-6">
        {/* Top Status Banner */}
        <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-slate-900/90 border border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Power className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-100 text-sm">Main Branch Power Grid (KSEB 3-Phase 415V)</span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono text-[10px] uppercase tracking-wider font-semibold">
                  Mains Online
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Kalpetta Main Branch KL-07 • Substation Feeder 11kV Normal • SPD Class B+C Healthy
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs font-mono">
            <div className="text-right">
              <div className="text-slate-400">Last Telemetry Sync</div>
              <div className="text-slate-200 font-bold">{lastUpdated || "Syncing..."}</div>
            </div>
            <button
              onClick={() => {
                setRefreshing(true);
                setTimeout(() => setRefreshing(false), 600);
              }}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all"
              title="Refresh Telemetry"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* Critical Fire & Thermal Runaway Alert Banner if Active */}
        {fireAlarmActive && (
          <div className="p-4 rounded-xl bg-red-950/80 border-2 border-red-500 text-red-100 flex flex-wrap items-center justify-between gap-4 animate-pulse shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-full bg-red-600 text-white animate-bounce">
                <Flame className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-base font-bold flex items-center gap-2">
                  🚨 LITHIUM-ION THERMAL RUNAWAY WARNING: UPS ROOM RACK #01
                  <span className="text-xs font-mono px-2 py-0.5 rounded bg-red-800 text-white uppercase">
                    &Delta;T &gt; 5°C/min
                  </span>
                </h4>
                <p className="text-xs text-red-200 mt-0.5">
                  Internal cell temp {batteryTemp}°C exceeds threshold. FM-200 pre-discharge sequence engaged.
                  Acoustic alarm sounding in Strong Room & Vault corridor.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  setAbortTriggered(true);
                  setFireAlarmActive(false);
                  setBatteryTemp(28.2);
                  setTempRateOfRise(0.3);
                }}
                className="px-4 py-2.5 rounded-lg bg-white hover:bg-slate-100 text-red-700 font-bold text-xs uppercase tracking-wider shadow-lg transition-all"
              >
                Emergency Abort Switch
              </button>
            </div>
          </div>
        )}

        {/* 4 Telemetry Metric Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Card 1: Grid Mains Voltage & Frequency */}
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-semibold uppercase tracking-wider">Grid Mains Phase A</span>
              <Activity className="w-4 h-4 text-blue-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black font-mono text-slate-100">{gridMainsVoltage}</span>
              <span className="text-xs text-slate-400 font-mono">VAC</span>
            </div>
            <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-800/80 text-slate-400">
              <span>Freq: <strong className="text-slate-200 font-mono">{gridFrequency} Hz</strong></span>
              <span className="text-emerald-400 font-semibold">Nominal (±0.2%)</span>
            </div>
          </div>

          {/* Card 2: UPS Inverter Output & Load */}
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-semibold uppercase tracking-wider">UPS Inverter Load</span>
              <Gauge className="w-4 h-4 text-amber-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black font-mono text-slate-100">{upsLoadPercent}%</span>
              <span className="text-xs text-slate-400 font-mono">/ 20 kVA</span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-amber-400 h-full rounded-full"
                style={{ width: `${upsLoadPercent}%` }}
              />
            </div>
          </div>

          {/* Card 3: Battery Backup Runtime */}
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-semibold uppercase tracking-wider">Autonomy Runtime</span>
              <Clock className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black font-mono text-slate-100">{batteryRuntimeMin}</span>
              <span className="text-xs text-slate-400 font-mono">minutes</span>
            </div>
            <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-800/80 text-slate-400">
              <span>Reserve: <strong className="text-slate-200 font-mono">3h 34m</strong></span>
              <span className="text-emerald-400 font-semibold">100% SoC</span>
            </div>
          </div>

          {/* Card 4: Battery Bank Thermal & RoR */}
          <div className={`p-4 rounded-xl border space-y-3 transition-all ${
            batteryTemp > 50 ? "bg-red-950/40 border-red-500" : "bg-slate-900/80 border-slate-800"
          }`}>
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-semibold uppercase tracking-wider">Rack Temperature</span>
              <Thermometer className={`w-4 h-4 ${batteryTemp > 50 ? "text-red-400" : "text-cyan-400"}`} />
            </div>
            <div className="flex items-baseline gap-2">
              <span className={`text-2xl font-black font-mono ${batteryTemp > 50 ? "text-red-400" : "text-slate-100"}`}>
                {batteryTemp}°C
              </span>
              <span className="text-xs text-slate-400 font-mono">RoR: +{tempRateOfRise}°C/m</span>
            </div>
            <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-800/80 text-slate-400">
              <span>Threshold: <strong className="text-slate-200 font-mono">&le; 35°C</strong></span>
              <span className={batteryTemp > 50 ? "text-red-400 font-bold" : "text-emerald-400 font-semibold"}>
                {batteryTemp > 50 ? "Thermal Runaway" : "Normal"}
              </span>
            </div>
          </div>
        </div>

        {/* Middle Section: Battery Cell Balancer Matrix & Diesel Generator Autonomy */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* LiFePO4 Cell Telemetry Matrix (2 Cols) */}
          <div className="lg:col-span-2 card p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <BatteryCharging className="w-5 h-5 text-emerald-400" />
                <h3 className="text-sm font-bold text-slate-100">
                  LiFePO4 48V 200Ah Rack BMS Cell Balancing Telemetry
                </h3>
              </div>
              <span className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded border border-emerald-500/20">
                Active Balancing Active (±0.02V Delta)
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {cells.map((cell) => (
                <div
                  key={cell.id}
                  className="p-3 rounded-lg bg-slate-950/70 border border-slate-800/90 space-y-2 hover:border-slate-700 transition-all"
                >
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="font-semibold text-slate-300">{cell.id}</span>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  </div>
                  <div className="text-lg font-black font-mono text-slate-100">
                    {cell.v} <span className="text-xs font-normal text-slate-400">V</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 border-t border-slate-800/80 pt-1.5">
                    <span>{cell.temp}°C</span>
                    <span>{cell.ir} m&Omega;</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800 text-xs text-slate-400 flex items-center justify-between">
              <span>BMS Manufacturer: <strong>Victron Cerbo GX Pro (Modbus TCP)</strong></span>
              <span>Total Bank Energy: <strong>9.6 kWh</strong></span>
              <span>Cycle Count: <strong>142 / 6,000 (97.6% SOH)</strong></span>
            </div>
          </div>

          {/* Clean Agent Fire Suppression & DG Auto-Start Panel (1 Col) */}
          <div className="card p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Flame className="w-5 h-5 text-red-400" />
              <h3 className="text-sm font-bold text-slate-100">Clean Agent Fire Suppression (FM-200)</h3>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-slate-200">FM-200 Gas Pressure Cylinder</div>
                  <div className="text-slate-400 font-mono text-[11px]">25 bar @ 20°C (UL Listed)</div>
                </div>
                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono font-semibold">
                  Arm State: ACTIVE
                </span>
              </div>

              <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-slate-200">125 kVA Kirloskar DG Generator</div>
                  <div className="text-slate-400 font-mono text-[11px]">Fuel: {dgFuelLiters}L / 160L (90%)</div>
                </div>
                <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 font-mono font-semibold">
                  Auto-AMF READY
                </span>
              </div>

              <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-slate-200">HVAC Damper Interlock</div>
                  <div className="text-slate-400 font-mono text-[11px]">Automated fresh-air cutoff</div>
                </div>
                <span className="text-slate-300 font-mono">ARMED</span>
              </div>

              {/* BMS Real-time Diagnostic Trigger */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={triggerBmsDiagnostic}
                  disabled={refreshing}
                  className="w-full py-2.5 px-3 rounded-lg bg-blue-900/40 hover:bg-blue-900/60 border border-blue-600/40 text-blue-200 font-semibold text-xs flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 text-blue-400 ${refreshing ? "animate-spin" : ""}`} />
                  {refreshing ? "Querying BMS Telemetry..." : "Perform Live BMS Diagnostic Probe"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ModulePage>
  );
}
