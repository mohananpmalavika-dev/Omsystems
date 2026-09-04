"use client";

import React, { useState, useEffect } from "react";
import {
  Clock,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  AlertCircle,
  Globe,
  Calendar,
  Radio,
  Server,
  ShieldCheck,
} from "lucide-react";
import { deviceConfigurationApi } from "@/lib/api-client";

interface TimeSyncPanelProps {
  deviceId: string;
  isRecorder?: boolean;
  onConfigChanged?: () => void;
}

interface DeviceTimeStatus {
  deviceTime: string;
  serverTime: string;
  offsetSeconds: number;
  ntpActive: boolean;
  ntpServer?: string;
  timeZone?: string;
  status: "SYNCHRONIZED" | "DRIFT_WARNING" | "DRIFT_CRITICAL";
}

const COMMON_TIMEZONES = [
  { value: "Asia/Kolkata", label: "Asia/Kolkata (IST +05:30) - Indian Standard" },
  { value: "UTC", label: "UTC (Coordinated Universal Time)" },
  { value: "America/New_York", label: "America/New_York (EST/EDT -05:00)" },
  { value: "America/Chicago", label: "America/Chicago (CST/CDT -06:00)" },
  { value: "America/Los_Angeles", label: "America/Los_Angeles (PST/PDT -08:00)" },
  { value: "Europe/London", label: "Europe/London (GMT/BST +00:00)" },
  { value: "Europe/Berlin", label: "Europe/Berlin (CET/CEST +01:00)" },
  { value: "Asia/Dubai", label: "Asia/Dubai (GST +04:00)" },
  { value: "Asia/Singapore", label: "Asia/Singapore (SGT +08:00)" },
  { value: "Asia/Tokyo", label: "Asia/Tokyo (JST +09:00)" },
];

const DEFAULT_NTP_SERVERS = [
  "pool.ntp.org",
  "time.google.com",
  "time.windows.com",
  "in.pool.ntp.org",
  "10.0.0.1 (Bank Core NTP)",
];

export function TimeSyncPanel({
  deviceId,
  isRecorder = false,
  onConfigChanged,
}: TimeSyncPanelProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusData, setStatusData] = useState<DeviceTimeStatus | null>(null);
  const [verifyResult, setVerifyResult] = useState<any | null>(null);

  // Form state
  const [dateTimeType, setDateTimeType] = useState<"NTP" | "Manual">("NTP");
  const [timeZone, setTimeZone] = useState("Asia/Kolkata");
  const [ntpServer, setNtpServer] = useState("pool.ntp.org");
  const [manualTime, setManualTime] = useState("");
  const [daylightSavings, setDaylightSavings] = useState(false);

  const fetchTimeStatus = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = isRecorder
        ? await deviceConfigurationApi.getRecorderTime(deviceId)
        : await deviceConfigurationApi.getTimeConfiguration(deviceId);

      if (res.data) {
        setStatusData(res.data);
        if (res.data.ntpActive) {
          setDateTimeType("NTP");
        } else {
          setDateTimeType("Manual");
        }
        if (res.data.timeZone) setTimeZone(res.data.timeZone);
        if (res.data.ntpServer) setNtpServer(res.data.ntpServer);
        if (res.data.deviceTime) {
          const d = new Date(res.data.deviceTime);
          const localIso = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
            .toISOString()
            .slice(0, 16);
          setManualTime(localIso);
        }
      }
    } catch (err: any) {
      setError(err?.message || "Failed to query device clock status");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (deviceId) {
      fetchTimeStatus();
    }
  }, [deviceId, isRecorder]);

  const handleApply = async () => {
    setSaving(true);
    setError(null);
    setVerifyResult(null);

    try {
      const payload: any = {
        dateTimeType,
        timeZone,
        daylightSavings,
      };

      if (dateTimeType === "NTP") {
        payload.ntpServer = ntpServer;
      } else {
        if (manualTime) {
          payload.utcDateTime = new Date(manualTime).toISOString();
        } else {
          payload.utcDateTime = new Date().toISOString();
        }
      }

      const res = isRecorder
        ? await deviceConfigurationApi.setRecorderTime(deviceId, payload)
        : await deviceConfigurationApi.setTimeConfiguration(deviceId, payload);

      if (res.data) {
        setVerifyResult(res.data);
        await fetchTimeStatus();
        if (onConfigChanged) onConfigChanged();
      }
    } catch (err: any) {
      setError(err?.message || "Failed to update clock configuration");
    } finally {
      setSaving(false);
    }
  };

  const handleSyncToBrowser = () => {
    const now = new Date();
    const localIso = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
    setManualTime(localIso);
    setDateTimeType("Manual");
  };

  const getDriftBadge = (status?: string, offset?: number) => {
    if (status === "SYNCHRONIZED" || (offset !== undefined && offset <= 5)) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-950/70 text-emerald-400 border border-emerald-500/30">
          <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
          SYNCHRONIZED ({offset !== undefined ? `${offset}s offset` : "<= 5s"})
        </span>
      );
    }
    if (status === "DRIFT_WARNING" || (offset !== undefined && offset <= 30)) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-950/70 text-amber-400 border border-amber-500/30">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
          DRIFT WARNING ({offset}s offset)
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-950/70 text-rose-400 border border-rose-500/30 animate-pulse">
        <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
        DRIFT CRITICAL ({offset ?? ">30"}s offset)
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header & Drift Telemetry Banner */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-lg backdrop-blur">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-white">
                  Hardware Clock & NTP Synchronization
                </h3>
                {statusData && getDriftBadge(statusData.status, statusData.offsetSeconds)}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Banking regulatory compliance requires forensic timestamp accuracy (offset &le; 5.0 seconds).
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={fetchTimeStatus}
            disabled={loading || saving}
            className="self-start md:self-auto inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Query Hardware
          </button>
        </div>

        {/* Telemetry Comparison Grid */}
        {statusData && (
          <div className="mt-4 pt-4 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800/60">
              <span className="text-slate-400 block mb-1">Device UTC Clock</span>
              <span className="font-mono text-slate-200 font-semibold">
                {statusData.deviceTime ? new Date(statusData.deviceTime).toLocaleString() : "Unknown"}
              </span>
            </div>

            <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800/60">
              <span className="text-slate-400 block mb-1">Server Reference Time</span>
              <span className="font-mono text-slate-200 font-semibold">
                {statusData.serverTime ? new Date(statusData.serverTime).toLocaleString() : new Date().toLocaleString()}
              </span>
            </div>

            <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800/60">
              <span className="text-slate-400 block mb-1">Current Sync Source</span>
              <span className="font-mono text-slate-200 font-semibold">
                {statusData.ntpActive ? `NTP (${statusData.ntpServer || "active"})` : "Manual System Clock"}
              </span>
            </div>

            <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800/60">
              <span className="text-slate-400 block mb-1">Clock Offset</span>
              <span className={`font-mono font-bold ${
                statusData.offsetSeconds <= 5 ? "text-emerald-400" : statusData.offsetSeconds <= 30 ? "text-amber-400" : "text-rose-400"
              }`}>
                {statusData.offsetSeconds} seconds
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Configuration Form */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 shadow-lg space-y-5">
        <h4 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
          <Globe className="w-4 h-4 text-indigo-400" />
          Time Synchronization Configuration
        </h4>

        {error && (
          <div className="p-3.5 rounded-lg bg-rose-950/60 border border-rose-800/60 text-rose-300 text-xs flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-4">
          {/* Mode Selector */}
          <div>
            <label className="text-xs font-medium text-slate-300 block mb-2">
              Synchronization Mode
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setDateTimeType("NTP")}
                className={`flex items-start gap-3 p-3.5 rounded-xl border text-left transition ${
                  dateTimeType === "NTP"
                    ? "bg-indigo-950/40 border-indigo-500/60 text-white"
                    : "bg-slate-950/40 border-slate-800 text-slate-400 hover:border-slate-700"
                }`}
              >
                <div className={`mt-0.5 p-1 rounded-full border ${
                  dateTimeType === "NTP" ? "border-indigo-400 bg-indigo-500" : "border-slate-600"
                }`}>
                  <Radio className="w-3 h-3 text-transparent" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                    <Server className="w-3.5 h-3.5 text-indigo-400" />
                    Network Time Protocol (NTP)
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    Continuous synchronization against high-accuracy atomic or banking NTP servers.
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setDateTimeType("Manual")}
                className={`flex items-start gap-3 p-3.5 rounded-xl border text-left transition ${
                  dateTimeType === "Manual"
                    ? "bg-indigo-950/40 border-indigo-500/60 text-white"
                    : "bg-slate-950/40 border-slate-800 text-slate-400 hover:border-slate-700"
                }`}
              >
                <div className={`mt-0.5 p-1 rounded-full border ${
                  dateTimeType === "Manual" ? "border-indigo-400 bg-indigo-500" : "border-slate-600"
                }`}>
                  <Radio className="w-3 h-3 text-transparent" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                    Manual / Host Time Injection
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    Explicit timestamp injection from management terminal or designated time.
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* NTP Settings */}
          {dateTimeType === "NTP" ? (
            <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800/80 space-y-3">
              <label className="text-xs font-medium text-slate-300 block">
                Primary NTP Server Hostname / IPv4
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={ntpServer}
                  onChange={(e) => setNtpServer(e.target.value)}
                  placeholder="pool.ntp.org"
                  className="flex-1 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              <div>
                <span className="text-[11px] text-slate-400 block mb-1.5">Quick Presets:</span>
                <div className="flex flex-wrap gap-1.5">
                  {DEFAULT_NTP_SERVERS.map((srv) => (
                    <button
                      key={srv}
                      type="button"
                      onClick={() => setNtpServer(srv.split(" ")[0])}
                      className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-mono transition border border-slate-700/60"
                    >
                      {srv}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800/80 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-slate-300">
                  Target Timestamp (Local Time)
                </label>
                <button
                  type="button"
                  onClick={handleSyncToBrowser}
                  className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-medium"
                >
                  <RefreshCw className="w-3 h-3" />
                  Use Current Computer Clock
                </button>
              </div>
              <input
                type="datetime-local"
                value={manualTime}
                onChange={(e) => setManualTime(e.target.value)}
                className="w-full sm:w-80 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>
          )}

          {/* Timezone Selector */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1.5">
                Device Operating Time Zone
              </label>
              <select
                value={timeZone}
                onChange={(e) => setTimeZone(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-indigo-500"
              >
                {COMMON_TIMEZONES.map((tz) => (
                  <option key={tz.value} value={tz.value}>
                    {tz.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center pt-6">
              <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300 select-none">
                <input
                  type="checkbox"
                  checked={daylightSavings}
                  onChange={(e) => setDaylightSavings(e.target.checked)}
                  className="w-4 h-4 rounded bg-slate-900 border-slate-700 text-indigo-600 focus:ring-0 focus:ring-offset-0"
                />
                Enable Daylight Savings Time (DST) automatic transition
              </label>
            </div>
          </div>
        </div>

        {/* Read-After-Write Verification Result Card */}
        {verifyResult && (
          <div
            className={`p-4 rounded-xl border text-xs ${
              verifyResult.success
                ? "bg-emerald-950/40 border-emerald-500/40 text-emerald-300"
                : "bg-rose-950/40 border-rose-500/40 text-rose-300"
            }`}
          >
            <div className="flex items-center gap-2 font-semibold">
              {verifyResult.success ? (
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-400" />
              )}
              <span>
                {verifyResult.success
                  ? "Read-After-Write Verification Passed: Hardware Clock Synchronized"
                  : "Verification Warning: Hardware Clock Drift Exceeds Tolerance"}
              </span>
            </div>
            <p className="mt-1 text-slate-300">
              {verifyResult.message ||
                `Clock state verified on physical hardware (${verifyResult.state || "VERIFIED"}).`}
            </p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="pt-3 border-t border-slate-800 flex justify-end gap-3">
          <button
            type="button"
            onClick={fetchTimeStatus}
            disabled={loading || saving}
            className="px-4 py-2 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 transition"
          >
            Cancel / Reset
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={loading || saving}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/20 transition disabled:opacity-50"
          >
            {saving ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Synchronizing Hardware Clock...
              </>
            ) : (
              <>
                <Clock className="w-3.5 h-3.5" />
                Synchronize Clock Now
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
