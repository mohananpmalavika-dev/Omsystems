"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { PageHero } from "@/components/page-hero";
import { IncidentMediaModal } from "@/components/incident-media-modal";
import {
  BellRing,
  ShieldAlert,
  ShieldCheck,
  Camera,
  Building2,
  MapPin,
  RefreshCw,
  Search,
  Filter,
  AlertTriangle,
  Clock,
  Sparkles,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Eye,
  FileVideo,
  Layers,
  ArrowRight,
  Check,
  Siren,
  Loader2,
  ShieldX
} from "lucide-react";
import type { AnalyticsAlert, AnalyticsAlertsAggregateSummary } from "@/lib/types";

export default function AiAlertsIncidentHubPage() {
  const [alerts, setAlerts] = useState<AnalyticsAlert[]>([]);
  const [summary, setSummary] = useState<AnalyticsAlertsAggregateSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [branchFilter, setBranchFilter] = useState("all");
  const [zoneFilter, setZoneFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [conversionFilter, setConversionFilter] = useState<"all" | "unconverted" | "converted" | "false_alarm">("all");
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const [markingFalseAlert, setMarkingFalseAlert] = useState<AnalyticsAlert | null>(null);
  const [falseAlarmReasonChoice, setFalseAlarmReasonChoice] = useState("False detection / algorithm misclassification");
  const [falseAlarmNotes, setFalseAlarmNotes] = useState("");
  const [submittingFalseAlarm, setSubmittingFalseAlarm] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  // Media modal state
  const [activeMediaAlert, setActiveMediaAlert] = useState<AnalyticsAlert | null>(null);
  const [mediaModalTab, setMediaModalTab] = useState<"image" | "video">("image");

  function getAlertsAuthHeaders(): Record<string, string> {
    const token = typeof window !== "undefined"
      ? (localStorage.getItem("accessToken") || sessionStorage.getItem("accessToken"))
      : null;
    const headers: Record<string, string> = {};
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
      headers["x-sentinel-session"] = token;
    }
    return headers;
  }

  const loadAlerts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const headers = getAlertsAuthHeaders();
      let res = await fetch("/v1/analytics/alerts?limit=200", {
        headers,
        cache: "no-store",
        credentials: "include",
      });
      if (!res.ok && (res.status === 401 || res.status === 404)) {
        res = await fetch("/api/control/v1/analytics/alerts?limit=200", {
          headers,
          cache: "no-store",
          credentials: "include",
        });
      }
      if (!res.ok) throw new Error(`Failed to load alerts: HTTP ${res.status}`);
      const body = await res.json();
      const list = (body.data ?? []) as AnalyticsAlert[];
      setAlerts(list);
      if (body.summary) {
        setSummary(body.summary);
      }
    } catch (err: any) {
      console.error("Failed to load AI alerts:", err);
      setError(err.message || "Failed to load alerts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAlerts();
    const interval = setInterval(loadAlerts, 12000);
    return () => clearInterval(interval);
  }, [loadAlerts]);

  // Distinct branches and zones for filters
  const uniqueBranches = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of alerts) {
      if (a.branchName) map.set(a.branchName, a.branchName);
    }
    return Array.from(map.values()).sort();
  }, [alerts]);

  const uniqueZones = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of alerts) {
      if (a.zoneName) map.set(a.zoneName, a.zoneName);
    }
    return Array.from(map.values()).sort();
  }, [alerts]);

  // Filtering
  const filteredAlerts = useMemo(() => {
    return alerts.filter((alert) => {
      if (branchFilter !== "all" && alert.branchName !== branchFilter) return false;
      if (zoneFilter !== "all" && alert.zoneName !== zoneFilter) return false;
      if (severityFilter !== "all" && alert.severity !== severityFilter) return false;
      if (statusFilter !== "all" && alert.status !== statusFilter) return false;
      if (conversionFilter === "unconverted" && (alert.incidentId || alert.incidentNumber || ["resolved", "false_alarm", "suppressed"].includes(alert.status))) return false;
      if (conversionFilter === "converted" && !alert.incidentId && !alert.incidentNumber) return false;
      if (conversionFilter === "false_alarm" && alert.status !== "false_alarm") return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = alert.title.toLowerCase().includes(q);
        const matchCamera = alert.cameraName?.toLowerCase().includes(q) || alert.cameraId.toLowerCase().includes(q);
        const matchBranch = alert.branchName?.toLowerCase().includes(q);
        const matchZone = alert.zoneName?.toLowerCase().includes(q);
        const matchIncident = alert.incidentNumber?.toLowerCase().includes(q);
        const matchFalseReason = alert.falseAlarmReason?.toLowerCase().includes(q);
        if (!matchTitle && !matchCamera && !matchBranch && !matchZone && !matchIncident && !matchFalseReason) return false;
      }

      return true;
    });
  }, [alerts, branchFilter, zoneFilter, severityFilter, statusFilter, conversionFilter, searchQuery]);

  const isFiltered = branchFilter !== "all" || zoneFilter !== "all" || severityFilter !== "all" || statusFilter !== "all" || conversionFilter !== "all" || Boolean(searchQuery.trim());

  // Summary counts - uses accurate PostgreSQL aggregate counts when unfiltered, and filtered slice when filters are applied
  const stats = useMemo(() => {
    if (!isFiltered && summary) {
      return summary;
    }
    const target = isFiltered ? filteredAlerts : alerts;
    const total = isFiltered ? target.length : (summary?.total ?? target.length);
    const active = target.filter((a) => !["resolved", "false_alarm", "suppressed"].includes(a.status)).length;
    const converted = target.filter((a) => Boolean(a.incidentId || a.incidentNumber)).length;
    const unconverted = target.filter((a) => !a.incidentId && !a.incidentNumber && !["resolved", "false_alarm", "suppressed"].includes(a.status)).length;
    const critical = target.filter((a) => a.severity === "P1" || a.severity === "P2").length;
    const falseAlarms = isFiltered
      ? target.filter((a) => a.status === "false_alarm").length
      : (summary?.falseAlarms ?? target.filter((a) => a.status === "false_alarm").length);
    return { total, active, converted, unconverted, critical, falseAlarms };
  }, [isFiltered, summary, filteredAlerts, alerts]);

  // Convert to incident handler
  const handleConvertIncident = async (alertId: string) => {
    setConvertingId(alertId);
    setActionMessage(null);
    try {
      const headers = { ...getAlertsAuthHeaders(), "content-type": "application/json" };
      let res = await fetch(`/v1/analytics/alerts/${encodeURIComponent(alertId)}/incidents`, {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify({ notes: "Converted via AI Alerts Incident Hub" }),
      });
      if (!res.ok && (res.status === 401 || res.status === 404)) {
        res = await fetch(`/api/control/v1/analytics/alerts/${encodeURIComponent(alertId)}/incidents`, {
          method: "POST",
          headers,
          credentials: "include",
          body: JSON.stringify({ notes: "Converted via AI Alerts Incident Hub" }),
        });
      }

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || errData.error || `HTTP ${res.status}`);
      }

      const incident = await res.json();
      const incNum = incident.incidentNumber || "INCIDENT";
      setActionMessage({
        kind: "success",
        text: `Alert successfully converted to Incident ${incNum}! It is now active in the Incident Report.`,
      });

      // Update local state immediately
      setAlerts((prev) =>
        prev.map((a) =>
          a.id === alertId
            ? { ...a, incidentId: incident.id, incidentNumber: incNum, status: "escalated" }
            : a
        )
      );

      // Refresh to ensure sync
      setTimeout(loadAlerts, 1000);
    } catch (err: any) {
      console.error("Incident conversion failed:", err);
      setActionMessage({
        kind: "error",
        text: `Conversion failed: ${err.message || "Unknown error"}`,
      });
    } finally {
      setConvertingId(null);
    }
  };

  // Mark as false alarm handler
  const handleMarkFalseAlarm = async (alertId: string, reason: string, notes?: string) => {
    setSubmittingFalseAlarm(true);
    setActionMessage(null);
    try {
      const headers = { ...getAlertsAuthHeaders(), "content-type": "application/json" };
      let res = await fetch(`/v1/analytics/alerts/${encodeURIComponent(alertId)}`, {
        method: "PATCH",
        headers,
        credentials: "include",
        body: JSON.stringify({
          status: "false_alarm",
          falseAlarmReason: reason,
          ...(notes ? { notes } : {}),
        }),
      });
      if (!res.ok && (res.status === 401 || res.status === 404)) {
        res = await fetch(`/api/control/v1/analytics/alerts/${encodeURIComponent(alertId)}`, {
          method: "PATCH",
          headers,
          credentials: "include",
          body: JSON.stringify({
            status: "false_alarm",
            falseAlarmReason: reason,
            ...(notes ? { notes } : {}),
          }),
        });
      }

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || errData.error || `HTTP ${res.status}`);
      }

      setActionMessage({
        kind: "success",
        text: `Alert successfully marked as False Alarm: ${reason}`,
      });

      // Update local state immediately
      setAlerts((prev) =>
        prev.map((a) =>
          a.id === alertId
            ? { ...a, status: "false_alarm", falseAlarmReason: reason }
            : a
        )
      );

      if (activeMediaAlert && activeMediaAlert.id === alertId) {
        setActiveMediaAlert((prev) => (prev ? { ...prev, status: "false_alarm", falseAlarmReason: reason } : null));
      }

      setMarkingFalseAlert(null);
      setTimeout(loadAlerts, 1000);
    } catch (err: any) {
      console.error("Failed to mark false alarm:", err);
      setActionMessage({
        kind: "error",
        text: `Failed to mark false alarm: ${err.message || "Unknown error"}`,
      });
      throw err;
    } finally {
      setSubmittingFalseAlarm(false);
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case "P1":
        return "bg-rose-500/20 text-rose-300 border-rose-500/40";
      case "P2":
        return "bg-amber-500/20 text-amber-300 border-amber-500/40";
      case "P3":
        return "bg-yellow-500/20 text-yellow-300 border-yellow-500/40";
      case "P4":
        return "bg-sky-500/20 text-sky-300 border-sky-500/40";
      default:
        return "bg-slate-500/20 text-slate-300 border-slate-500/40";
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "new":
        return "bg-blue-500/15 text-blue-400 border-blue-500/30";
      case "acknowledged":
        return "bg-purple-500/15 text-purple-400 border-purple-500/30";
      case "investigating":
        return "bg-cyan-500/15 text-cyan-400 border-cyan-500/30";
      case "escalated":
        return "bg-rose-500/15 text-rose-400 border-rose-500/30";
      case "resolved":
        return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
      case "false_alarm":
        return "bg-rose-950/40 text-rose-300 border-rose-800/50";
      default:
        return "bg-slate-800 text-slate-300 border-slate-700";
    }
  };

  return (
    <div className="content p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
        <PageHero
          eyebrow="Vision AI Operations"
          icon={BellRing}
          title="AI Alerts & Incident Conversion Hub"
          description="Real-time multi-camera detection feed with Zone, Branch, Camera, Alert context, and one-click enterprise Incident Conversion"
          actions={
            <div className="flex items-center gap-2">
              <Link
                href="/incidents"
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 border border-slate-700 shadow-sm transition-colors"
              >
                <Siren className="h-4 w-4 text-amber-400" />
                <span>Open Incident Report</span>
              </Link>
              <button
                onClick={loadAlerts}
                disabled={loading}
                className="px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow transition-colors"
                title="Refresh alerts"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                <span>Refresh</span>
              </button>
            </div>
          }
        />

        {/* Action Status Message */}
        {actionMessage && (
          <div
            className={`p-4 rounded-xl border flex items-center justify-between text-sm animate-in fade-in duration-200 ${
              actionMessage.kind === "success"
                ? "bg-emerald-950/70 border-emerald-500/40 text-emerald-200"
                : "bg-rose-950/70 border-rose-500/40 text-rose-200"
            }`}
          >
            <div className="flex items-center gap-2.5">
              {actionMessage.kind === "success" ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-400 flex-shrink-0" />
              ) : (
                <AlertCircle className="h-5 w-5 text-rose-400 flex-shrink-0" />
              )}
              <span>{actionMessage.text}</span>
            </div>
            <button
              onClick={() => setActionMessage(null)}
              className="p-1 rounded-lg hover:bg-white/10 transition-colors"
            >
              ✕
            </button>
          </div>
        )}

        {/* Stats Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <button
            onClick={() => setConversionFilter("all")}
            className={`p-4 rounded-xl border text-left transition-all ${
              conversionFilter === "all"
                ? "bg-slate-800/90 border-sky-500/60 shadow-md ring-1 ring-sky-500/40"
                : "bg-slate-900/60 border-slate-800 hover:bg-slate-800/50"
            }`}
          >
            <div className="text-xs font-medium text-slate-400">Total AI Alerts</div>
            <div className="text-2xl font-bold text-slate-100 mt-1">{stats.total}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">{isFiltered ? "Active filtered results" : "Fleet-wide database total"}</div>
          </button>

          <button
            onClick={() => {
              setConversionFilter("unconverted");
              setStatusFilter("all");
            }}
            className={`p-4 rounded-xl border text-left transition-all ${
              conversionFilter === "unconverted"
                ? "bg-amber-950/50 border-amber-500/60 shadow-md ring-1 ring-amber-500/40"
                : "bg-slate-900/60 border-slate-800 hover:bg-slate-800/50"
            }`}
          >
            <div className="text-xs font-medium text-amber-400 flex items-center justify-between">
              <span>Needs Incident Conversion</span>
              <Sparkles className="h-3.5 w-3.5" />
            </div>
            <div className="text-2xl font-bold text-amber-300 mt-1">{stats.unconverted}</div>
            <div className="text-[11px] text-amber-500/80 mt-0.5">Ready for 1-click conversion</div>
          </button>

          <button
            onClick={() => {
              setConversionFilter("converted");
              setStatusFilter("all");
            }}
            className={`p-4 rounded-xl border text-left transition-all ${
              conversionFilter === "converted"
                ? "bg-indigo-950/50 border-indigo-500/60 shadow-md ring-1 ring-indigo-500/40"
                : "bg-slate-900/60 border-slate-800 hover:bg-slate-800/50"
            }`}
          >
            <div className="text-xs font-medium text-indigo-400 flex items-center justify-between">
              <span>Converted to Incidents</span>
              <CheckCircle2 className="h-3.5 w-3.5" />
            </div>
            <div className="text-2xl font-bold text-indigo-300 mt-1">{stats.converted}</div>
            <div className="text-[11px] text-indigo-500/80 mt-0.5">In Incident Report</div>
          </button>

          <button
            onClick={() => {
              setConversionFilter("false_alarm");
              setStatusFilter("all");
            }}
            className={`p-4 rounded-xl border text-left transition-all ${
              conversionFilter === "false_alarm"
                ? "bg-rose-950/50 border-rose-500/60 shadow-md ring-1 ring-rose-500/40"
                : "bg-slate-900/60 border-slate-800 hover:bg-slate-800/50"
            }`}
          >
            <div className="text-xs font-medium text-rose-400 flex items-center justify-between">
              <span>False Alarms</span>
              <ShieldX className="h-3.5 w-3.5" />
            </div>
            <div className="text-2xl font-bold text-rose-300 mt-1">{stats.falseAlarms}</div>
            <div className="text-[11px] text-rose-400/70 mt-0.5">Dismissed & audited</div>
          </button>

          <div className="p-4 rounded-xl border bg-slate-900/60 border-slate-800">
            <div className="text-xs font-medium text-rose-400 flex items-center justify-between">
              <span>Critical Alerts (P1/P2)</span>
              <ShieldAlert className="h-3.5 w-3.5" />
            </div>
            <div className="text-2xl font-bold text-rose-300 mt-1">{stats.critical}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">Immediate operator priority</div>
          </div>

          <div className="p-4 rounded-xl border bg-slate-900/60 border-slate-800">
            <div className="text-xs font-medium text-emerald-400 flex items-center justify-between">
              <span>Active Alerts</span>
              <ShieldCheck className="h-3.5 w-3.5" />
            </div>
            <div className="text-2xl font-bold text-emerald-300 mt-1">{stats.active}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">Unresolved monitoring items</div>
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="p-4 rounded-2xl border border-slate-800 bg-slate-900/70 backdrop-blur-md space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search Zone, Branch, Camera, Alert title, Incident #..."
                className="w-full pl-10 pr-4 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
              />
            </div>

            {/* Branch Filter */}
            <select
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              className="px-3 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-sky-500"
            >
              <option value="all">All Branches</option>
              {uniqueBranches.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>

            {/* Zone Filter */}
            <select
              value={zoneFilter}
              onChange={(e) => setZoneFilter(e.target.value)}
              className="px-3 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-sky-500"
            >
              <option value="all">All Zones</option>
              {uniqueZones.map((z) => (
                <option key={z} value={z}>{z}</option>
              ))}
            </select>

            {/* Severity Filter */}
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="px-3 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-sky-500"
            >
              <option value="all">All Severities</option>
              <option value="P1">P1 - Critical</option>
              <option value="P2">P2 - High</option>
              <option value="P3">P3 - Medium</option>
              <option value="P4">P4 - Low</option>
              <option value="P5">P5 - Info</option>
            </select>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-sky-500"
            >
              <option value="all">All Alert Statuses</option>
              <option value="new">New</option>
              <option value="acknowledged">Acknowledged</option>
              <option value="investigating">Investigating</option>
              <option value="escalated">Escalated</option>
              <option value="resolved">Resolved</option>
              <option value="false_alarm">False Alarm</option>
            </select>

            {/* Conversion Filter Chips */}
            <div className="flex items-center gap-1 bg-slate-950/80 p-1 rounded-xl border border-slate-800">
              <button
                onClick={() => setConversionFilter("all")}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  conversionFilter === "all" ? "bg-slate-800 text-white" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                All
              </button>
              <button
                onClick={() => setConversionFilter("unconverted")}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  conversionFilter === "unconverted" ? "bg-amber-600 text-white font-semibold" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Unconverted
              </button>
              <button
                onClick={() => setConversionFilter("converted")}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  conversionFilter === "converted" ? "bg-indigo-600 text-white font-semibold" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Converted
              </button>
              <button
                onClick={() => setConversionFilter("false_alarm")}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  conversionFilter === "false_alarm" ? "bg-rose-600 text-white font-semibold" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                False Alarms
              </button>
            </div>
          </div>
        </div>

        {/* AI Alerts Table */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 shadow-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/80 text-slate-400 font-semibold uppercase tracking-wider">
                  <th className="py-3 px-4">Zone</th>
                  <th className="py-3 px-4">Branch</th>
                  <th className="py-3 px-4">Camera</th>
                  <th className="py-3 px-4">Alert Details</th>
                  <th className="py-3 px-4 text-center">Alert Status</th>
                  <th className="py-3 px-4 text-center">Incident Status</th>
                  <th className="py-3 px-4 text-center">Evidence</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {loading && alerts.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-sky-400" />
                      <span>Loading AI detections across fleet cameras…</span>
                    </td>
                  </tr>
                ) : filteredAlerts.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400">
                      <ShieldCheck className="h-8 w-8 text-slate-600 mx-auto mb-2" />
                      <p className="font-semibold text-slate-300">No matching AI alerts found</p>
                      <p className="text-xs text-slate-500 mt-1">
                        Try clearing or relaxing your search/status filters.
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredAlerts.map((alert) => {
                    const isConverted = Boolean(alert.incidentId || alert.incidentNumber);
                    const isConverting = convertingId === alert.id;
                    const zoneName = alert.zoneName || "Zone not specified";
                    const branchName = alert.branchName || "Fleet Branch";
                    const cameraName = alert.cameraName || alert.cameraId.slice(0, 8);

                    return (
                      <tr
                        key={alert.id}
                        className="hover:bg-slate-800/40 transition-colors group cursor-pointer"
                        onClick={() => {
                          setActiveMediaAlert(alert);
                          setMediaModalTab("image");
                        }}
                      >
                        {/* Zone Column */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-950/60 border border-emerald-700/40 text-emerald-300">
                            <MapPin className="h-3 w-3 text-emerald-400" />
                            <span>{zoneName}</span>
                          </span>
                        </td>

                        {/* Branch Column */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="flex items-center gap-1.5 font-medium text-slate-200">
                            <Building2 className="h-3.5 w-3.5 text-slate-400" />
                            <span>{branchName}</span>
                          </div>
                        </td>

                        {/* Camera Column */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <Camera className="h-3.5 w-3.5 text-sky-400" />
                            <span className="font-mono text-slate-200">{cameraName}</span>
                          </div>
                        </td>

                        {/* Alert Details Column */}
                        <td className="py-3 px-4 min-w-[220px]">
                          <div className="flex items-start gap-2">
                            <span
                              className={`px-2 py-0.5 rounded font-mono font-bold text-[10px] border mt-0.5 flex-shrink-0 ${getSeverityBadge(
                                alert.severity
                              )}`}
                            >
                              {alert.severity}
                            </span>
                            <div className="min-w-0">
                              <p className="font-semibold text-slate-100 truncate group-hover:text-sky-300 transition-colors">
                                {alert.title}
                              </p>
                              <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                                <span>{Math.round(alert.confidence * 100)}% match</span>
                                <span>•</span>
                                <span
                                  className="flex items-center gap-1"
                                  title={
                                    alert.occurrenceCount && alert.occurrenceCount > 1 && alert.lastDetectedAt
                                      ? `Triggered: ${new Date(alert.firstDetectedAt || alert.createdAt).toLocaleString()}\nLatest occurrence: ${new Date(alert.lastDetectedAt).toLocaleString()} (${alert.occurrenceCount} detections)`
                                      : `Detected at: ${new Date(alert.firstDetectedAt || alert.createdAt || alert.lastDetectedAt).toLocaleString()}`
                                  }
                                >
                                  <Clock className="h-3 w-3 text-slate-500" />
                                  <span>{new Date(alert.firstDetectedAt || alert.createdAt || alert.lastDetectedAt).toLocaleTimeString()}</span>
                                </span>
                                {alert.occurrenceCount && alert.occurrenceCount > 1 && (
                                  <>
                                    <span>•</span>
                                    <span
                                      className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700/60 font-mono"
                                      title={`Repeated ${alert.occurrenceCount} times (latest at ${new Date(alert.lastDetectedAt).toLocaleTimeString()})`}
                                    >
                                      {alert.occurrenceCount}x
                                    </span>
                                  </>
                                )}
                              </div>
                              {alert.falseAlarmReason && (
                                <div className="flex items-center gap-1.5 text-[11px] text-rose-400 font-medium mt-1">
                                  <ShieldX className="h-3 w-3 text-rose-400 flex-shrink-0" />
                                  <span className="italic truncate">{alert.falseAlarmReason}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Alert Status Column */}
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-medium border uppercase tracking-wider ${getStatusBadge(
                              alert.status
                            )}`}
                          >
                            {alert.status.replace("_", " ")}
                          </span>
                        </td>

                        {/* Incident Status Column */}
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          {isConverted ? (
                            <Link
                              href={`/incidents/${alert.incidentId}`}
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-950/80 border border-indigo-700/50 text-indigo-300 hover:bg-indigo-900 transition-colors font-mono font-semibold"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5 text-indigo-400" />
                              <span>{alert.incidentNumber || "Incident"}</span>
                            </Link>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-slate-800/80 text-slate-400 border border-slate-700">
                              Not Converted
                            </span>
                          )}
                        </td>

                        {/* Evidence Column */}
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveMediaAlert(alert);
                                setMediaModalTab("image");
                              }}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white transition-colors"
                              title="View Snapshot Image"
                            >
                              <Eye className="h-3.5 w-3.5 text-sky-400" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveMediaAlert(alert);
                                setMediaModalTab("video");
                              }}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white transition-colors"
                              title="View Video Clip / Stream"
                            >
                              <FileVideo className="h-3.5 w-3.5 text-amber-400" />
                            </button>
                          </div>
                        </td>

                        {/* Action Column */}
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          {isConverted ? (
                            <Link
                              href={`/incidents/${alert.incidentId}`}
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 hover:bg-indigo-600 hover:text-white text-xs font-semibold transition-colors"
                            >
                              <span>View Incident</span>
                              <ArrowRight className="h-3 w-3" />
                            </Link>
                          ) : alert.status === "false_alarm" ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-950/40 text-rose-300 border border-rose-800/40 text-xs font-medium">
                              <ShieldX className="h-3.5 w-3.5 text-rose-400" />
                              <span>False Alarm</span>
                            </span>
                          ) : (
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setMarkingFalseAlert(alert);
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-semibold transition-colors shadow-sm"
                                title="Mark as False Alarm"
                              >
                                <ShieldX className="h-3.5 w-3.5 text-rose-400" />
                                <span>False Alarm</span>
                              </button>
                              <button
                                type="button"
                                disabled={isConverting}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleConvertIncident(alert.id);
                                }}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold shadow transition-colors"
                                title="Convert this alert into an Incident"
                              >
                                {isConverting ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Sparkles className="h-3 w-3" />
                                )}
                                <span>Convert</span>
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="py-3 px-4 bg-slate-950/70 border-t border-slate-800 text-slate-400 text-xs flex items-center justify-between">
            <span>
              Showing {filteredAlerts.length} of {alerts.length} loaded alerts
              {summary?.total && summary.total > alerts.length ? ` (${summary.total} total in database)` : ""}
            </span>
            <span className="font-mono text-slate-500">Auto-refresh active (12s)</span>
          </div>
        </div>

        {/* Modal: Dismiss as False Alarm */}
        {markingFalseAlert && (
          <div
            className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in"
            onClick={() => setMarkingFalseAlert(null)}
          >
            <div
              className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl space-y-5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-xl bg-rose-500/20 border border-rose-500/30 text-rose-400 flex-shrink-0">
                  <ShieldX className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-100">Dismiss Alert as False Alarm</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Classify this detection as a false positive for audit trail and algorithm tuning.
                  </p>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-xs space-y-1">
                <div className="flex items-center justify-between text-slate-300 font-semibold">
                  <span>{markingFalseAlert.title}</span>
                  <span className="font-mono text-[11px] text-slate-400">{markingFalseAlert.severity}</span>
                </div>
                <div className="text-slate-500 flex items-center gap-2">
                  <span>Camera: {markingFalseAlert.cameraName || markingFalseAlert.cameraId.slice(0, 8)}</span>
                  <span>•</span>
                  <span>Branch: {markingFalseAlert.branchName || "Main"}</span>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    False Alarm Categorization <span className="text-rose-400">*</span>
                  </label>
                  <select
                    value={falseAlarmReasonChoice}
                    onChange={(e) => setFalseAlarmReasonChoice(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-sky-500"
                  >
                    <option value="False detection / algorithm misclassification">False detection / algorithm misclassification</option>
                    <option value="Environmental factors (lighting, shadows, reflections)">Environmental factors (lighting, shadows, reflections)</option>
                    <option value="Authorized / routine permitted activity">Authorized / routine permitted activity</option>
                    <option value="Informational sensor / counting metric">Informational sensor / counting metric</option>
                    <option value="Sensor calibration / testing">Sensor calibration / testing</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Operator Notes & Context (Optional)
                  </label>
                  <textarea
                    value={falseAlarmNotes}
                    onChange={(e) => setFalseAlarmNotes(e.target.value)}
                    rows={2}
                    placeholder="Add context on why this alert is considered a false alarm..."
                    className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-sky-500 resize-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setMarkingFalseAlert(null)}
                  disabled={submittingFalseAlarm}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={submittingFalseAlarm}
                  onClick={() => handleMarkFalseAlarm(markingFalseAlert.id, falseAlarmReasonChoice, falseAlarmNotes)}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow"
                >
                  {submittingFalseAlarm ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ShieldX className="h-4 w-4" />
                  )}
                  <span>Confirm False Alarm</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Unified Media Modal */}
        {activeMediaAlert && (
          <IncidentMediaModal
            isOpen={Boolean(activeMediaAlert)}
            onClose={() => setActiveMediaAlert(null)}
            imageUrl={`/v1/alerts/${activeMediaAlert.id}/evidence/snapshot`}
            snapshotUrl={`/v1/analytics/alerts/${activeMediaAlert.id}/snapshot`}
            videoUrl={activeMediaAlert.videoClipUrl || ("/v1/analytics/alerts/" + activeMediaAlert.id + "/clip")}
            title={activeMediaAlert.title}
            cameraName={activeMediaAlert.cameraName}
            cameraId={activeMediaAlert.cameraId}
            branchName={activeMediaAlert.branchName}
            zoneName={activeMediaAlert.zoneName}
            timestamp={activeMediaAlert.firstDetectedAt || activeMediaAlert.createdAt || activeMediaAlert.lastDetectedAt}
            severity={activeMediaAlert.severity}
            confidence={activeMediaAlert.confidence}
            alertId={activeMediaAlert.id}
            incidentId={activeMediaAlert.incidentId}
            incidentNumber={activeMediaAlert.incidentNumber}
            status={activeMediaAlert.status}
            falseAlarmReason={activeMediaAlert.falseAlarmReason}
            initialTab={mediaModalTab}
            onConvertToIncident={handleConvertIncident}
            onMarkFalseAlarm={handleMarkFalseAlarm}
          />
        )}
      </div>
  );
}
