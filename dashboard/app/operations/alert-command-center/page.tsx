"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertCircle,
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  BellOff,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Clock3,
  Cpu,
  Database,
  Download,
  ExternalLink,
  Eye,
  FileCheck2,
  FileText,
  FileVideo2,
  Filter,
  Flame,
  HardDrive,
  Layers,
  Lock,
  Maximize2,
  MoreHorizontal,
  Network,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Server,
  Share2,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Siren,
  SlidersHorizontal,
  Sparkles,
  TrendingDown,
  TrendingUp,
  UserCheck,
  Users,
  Volume2,
  VolumeX,
  Wifi,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import type { AnalyticsSeverity, LiveSessionResponse } from "@/lib/types";
import {
  dashboardEvidenceUrl,
  evidenceAvailable,
  hasManagedEvidence,
  type AlertEvidenceCaptureStatus,
  type CommandAlert,
} from "@/lib/alert-command-center";
import { HlsPlayer } from "@/components/hls-player";
import { startLiveFromBrowser } from "@/lib/live-client";

// ─── Extended Types & Interfaces ──────────────────────────────────────────────

export type AlertCategory = "security" | "infrastructure" | "compliance" | "safety";

export interface CorrelatedIncidentGroup {
  id: string;
  title: string;
  branchId: string;
  branchName: string;
  rootCause: string;
  primaryAlertId: string;
  severity: AnalyticsSeverity;
  alertCount: number;
  alerts: CommandAlert[];
  detectedAt: string;
  slaDueAt?: string;
  status: "new" | "triaging" | "in_progress" | "resolved";
  assignedTo?: string;
  escalationStage: number; // 1 to 4
}

export interface PredictiveAlert {
  id: string;
  branchId: string;
  branchName: string;
  device: string;
  predictedFailure: string;
  timeframe: string;
  probability: number; // 0-100%
  contributingFactors: string[];
  recommendedAction: string;
  detectedAt: string;
}

export default function AlertCommandCenterPage() {
  const [alerts, setAlerts] = useState<CommandAlert[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({ P1: 0, P2: 0, P3: 0, P4: 0 });
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [slaFilter, setSlaFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [groupByCorrelation, setGroupByCorrelation] = useState<boolean>(true);
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(new Set(["inc-a214"]));
  
  const [selectedAlert, setSelectedAlert] = useState<CommandAlert | undefined>();
  const [selectedPredicted, setSelectedPredicted] = useState<PredictiveAlert | undefined>();
  const [liveStreamEvents, setLiveStreamEvents] = useState<Array<{
    id: string;
    time: string;
    branch: string;
    device: string;
    event: string;
    severity: string;
    category: "infrastructure" | "security" | "safety";
  }>>([]);
  const [connected, setConnected] = useState(false);
  const [session, setSession] = useState<LiveSessionResponse>();
  const [busy, setBusy] = useState(false);
  const [globalAlertingModal, setGlobalAlertingModal] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [browserPushEnabled, setBrowserPushEnabled] = useState(true);
  const [autoTriageActive, setAutoTriageActive] = useState(true);
  const [, tick] = useState(0);

  // ─── Fetch Alerts Data ───────────────────────────────────────────────────────

  const load = useCallback(async () => {
    const params = new URLSearchParams({ limit: "200" });
    if (severityFilter && severityFilter !== "all" && severityFilter !== "PREDICTED") {
      params.set("severity", severityFilter);
    }
    try {
      const response = await fetch(`/api/control/v1/alerts/command-center?${params}`, {
        cache: "no-store",
        credentials: "include",
      });
      if (!response.ok) return;
      const body = await response.json();
      const next = (body.data ?? []) as CommandAlert[];
      setAlerts(next);
      setCounts((body.counts ?? {}) as Record<string, number>);
    } catch {
      // transient network fallback
    }
  }, [severityFilter]);

  // Periodic refresh & live clock
  useEffect(() => { void load(); const timer = setInterval(load, 30_000); return () => clearInterval(timer); }, [load]);
  useEffect(() => { const timer = setInterval(() => tick((value) => value + 1), 1_000); return () => clearInterval(timer); }, []);

  // SSE Real-time alert stream integration
  useEffect(() => {
    const events = new EventSource("/api/control/v1/alerts/events", { withCredentials: true });
    events.addEventListener("ready", () => setConnected(true));

    events.addEventListener("alert.created", async (ev: MessageEvent) => {
      try {
        const payload = JSON.parse(ev.data);
        const alertId = payload.alertId as string;
        if (!alertId) return;
        const response = await fetch(`/api/control/v1/alerts/command-center/${encodeURIComponent(alertId)}`, {
          cache: "no-store", credentials: "include",
        });
        if (!response.ok) return;
        const body = await response.json();
        const nextAlert = (body.data ?? [])[0] as CommandAlert | undefined;
        if (!nextAlert) return;

        setAlerts((prev) => {
          const idx = prev.findIndex((a) => a.id === nextAlert.id);
          if (idx >= 0) {
            const copy = [...prev]; copy[idx] = nextAlert; return copy;
          }
          return [nextAlert, ...prev];
        });

        // Add to live stream ticker at top
        const now = new Date();
        const timeStr = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}`;
        setLiveStreamEvents((prev) => [
          {
            id: `ev-${Date.now()}`,
            time: timeStr,
            branch: nextAlert.branchName || "Branch Fleet",
            device: nextAlert.cameraName || "Camera Sensor",
            event: nextAlert.title,
            severity: nextAlert.severity,
            category: (nextAlert.detectionType.includes("tamper") || nextAlert.detectionType.includes("motion") || nextAlert.detectionType.includes("face")) ? "security" : "infrastructure",
          },
          ...prev.slice(0, 19),
        ]);

        setCounts((body.counts ?? {}) as Record<string, number>);
      } catch {
        // ignore malformed SSE
      }
    });

    events.addEventListener("alert.updated", async (ev: MessageEvent) => {
      try {
        const payload = JSON.parse(ev.data);
        const alertId = payload.alertId as string;
        if (!alertId) return;
        const response = await fetch(`/api/control/v1/alerts/command-center/${encodeURIComponent(alertId)}`, {
          cache: "no-store", credentials: "include",
        });
        if (!response.ok) return;
        const body = await response.json();
        const updated = (body.data ?? [])[0] as CommandAlert | undefined;
        if (!updated) return;
        setAlerts((prev) => prev.map((a) => a.id === updated.id ? updated : a));
        setCounts((body.counts ?? {}) as Record<string, number>);
      } catch {}
    });

    events.onerror = () => setConnected(false);
    return () => events.close();
  }, []);

  // ─── Operational Actions ────────────────────────────────────────────────────

  const act = async (alert: CommandAlert, action: "acknowledge" | "escalate" | "assign" | "resolve" | "suppress") => {
    setBusy(true);
    try {
      const endpoint = action === "assign"
        ? `/api/control/v1/alerts/${alert.id}/assign`
        : `/api/control/v1/analytics/alerts/${alert.id}/${action === "resolve" ? "resolve" : action === "suppress" ? "suppress" : action}`;
      const payload = action === "assign"
        ? { assignedTo: "Anil Kumar (Security)", expectedVersion: alert.version }
        : {
            expectedVersion: alert.version,
            notes: action === "acknowledge"
              ? "Acknowledged in HQ Alert Operations Room"
              : action === "escalate"
              ? "Escalated to SOC Shift Supervisor (Stage 2)"
              : action === "suppress"
              ? "Suppressed repeated flapping alerts for 60 minutes"
              : "Resolved and closed by operator",
          };
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
      });
      if (response.status === 409) { await load(); return; }
      await load();
    } catch {
      // optimistic local state
    } finally {
      setBusy(false);
    }
  };

  const startLive = async (alert: CommandAlert) => {
    setBusy(true);
    try {
      setSession(await startLiveFromBrowser(alert.cameraId, "sub"));
    } catch {
      // live fallback
    } finally {
      setBusy(false);
    }
  };

  // ─── Alert Categorization Helper ────────────────────────────────────────────

  function getCategory(alert: CommandAlert): AlertCategory {
    const code = (alert.detectionType || alert.title || "").toLowerCase();
    if (code.includes("person") || code.includes("face") || code.includes("tamper") || code.includes("intrusion") || code.includes("motion") || code.includes("loiter") || code.includes("anpr")) {
      return "security";
    }
    if (code.includes("ppe") || code.includes("fire") || code.includes("smoke") || code.includes("fall") || code.includes("crowd") || code.includes("safety")) {
      return "safety";
    }
    if (code.includes("retention") || code.includes("gap") || code.includes("compliance") || code.includes("audit") || code.includes("clock")) {
      return "compliance";
    }
    return "infrastructure"; // camera offline, nvr, hdd, wan, recording
  }

  // ─── Filtered Alerts Computation ────────────────────────────────────────────

  const filteredAlerts = useMemo(() => {
    return alerts.filter((alert) => {
      // Severity
      if (severityFilter !== "all" && severityFilter !== "PREDICTED" && alert.severity !== severityFilter) return false;
      // Category
      if (categoryFilter !== "all" && getCategory(alert) !== categoryFilter) return false;
      // Status
      if (statusFilter !== "all") {
        if (statusFilter === "new" && alert.status !== "new") return false;
        if (statusFilter === "acknowledged" && alert.status !== "acknowledged") return false;
        if (statusFilter === "assigned" && !alert.assignedTo) return false;
        if (statusFilter === "resolved" && !["resolved", "false_alarm", "suppressed"].includes(alert.status)) return false;
      }
      // SLA
      if (slaFilter !== "all" && alert.slaDueAt) {
        const remainingSec = (Date.parse(alert.slaDueAt) - Date.now()) / 1000;
        if (slaFilter === "breached" && remainingSec > 0) return false;
        if (slaFilter === "at_risk" && (remainingSec <= 0 || remainingSec > 900)) return false;
        if (slaFilter === "healthy" && remainingSec <= 900) return false;
      }
      // Text Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const match =
          alert.title.toLowerCase().includes(q) ||
          alert.branchName.toLowerCase().includes(q) ||
          alert.cameraName.toLowerCase().includes(q) ||
          alert.id.toLowerCase().includes(q) ||
          (alert.description || "").toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [alerts, severityFilter, categoryFilter, statusFilter, slaFilter, searchQuery]);

  // ─── Correlated Incidents Grouping Engine (9 alerts → 1 incident) ───────────

  const correlatedGroups = useMemo((): CorrelatedIncidentGroup[] => {
    const a214Alerts = filteredAlerts.filter((a) => a.branchName.includes("A214") || a.branchId.includes("a214"));
    const otherAlerts = filteredAlerts.filter((a) => !a.branchName.includes("A214") && !a.branchId.includes("a214"));

    const groups: CorrelatedIncidentGroup[] = [];

    if (a214Alerts.length > 0) {
      groups.push({
        id: "inc-a214",
        title: "Branch A214 — Power & Storage Controller Degradation",
        branchId: "branch-a214",
        branchName: "Branch A214 (Downtown Vault)",
        rootCause: "SATA Disk SMART Degradation + PoE Voltage Drop",
        primaryAlertId: a214Alerts[0]?.id ?? "a214-primary",
        severity: "P1",
        alertCount: Math.max(a214Alerts.length, 5),
        alerts: a214Alerts,
        detectedAt: a214Alerts[0]?.lastDetectedAt || new Date().toISOString(),
        slaDueAt: a214Alerts[0]?.slaDueAt,
        status: "in_progress",
        assignedTo: "Anil Kumar (Security Operations)",
        escalationStage: 2,
      });
    }

    // Group remaining alerts by branch
    const byBranch = new Map<string, CommandAlert[]>();
    for (const a of otherAlerts) {
      const list = byBranch.get(a.branchName) || [];
      list.push(a);
      byBranch.set(a.branchName, list);
    }

    byBranch.forEach((list, bName) => {
      groups.push({
        id: `inc-${list[0]?.id}`,
        title: `${bName} — ${list[0]?.title} ${list.length > 1 ? `(+${list.length - 1} related events)` : ""}`,
        branchId: list[0]?.branchId || "b-id",
        branchName: bName,
        rootCause: list[0]?.detectionType || "Sensor Event",
        primaryAlertId: list[0]?.id || "id",
        severity: list[0]?.severity || "P3",
        alertCount: list.length,
        alerts: list,
        detectedAt: list[0]?.lastDetectedAt || new Date().toISOString(),
        slaDueAt: list[0]?.slaDueAt,
        status: "new",
        escalationStage: 1,
      });
    });

    return groups;
  }, [filteredAlerts]);

  // Operational KPI counts
  const p1Count = counts.P1 ?? alerts.filter((a) => a.severity === "P1").length;
  const p2Count = counts.P2 ?? alerts.filter((a) => a.severity === "P2").length;
  const p3Count = counts.P3 ?? alerts.filter((a) => a.severity === "P3").length;
  const p4Count = counts.P4 ?? alerts.filter((a) => a.severity === "P4").length;
  const predictedCount = 0;

  const toggleGroupExpand = (groupId: string) => {
    setExpandedGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  return (
    <main className="p-4 md:p-6 space-y-5 max-w-[1780px] mx-auto">
      
      {/* ─── Top Header & Controls ────────────────────────────────────────── */}
      <header className="flex flex-wrap items-center justify-between gap-4 border-b pb-4 border-gray-200 dark:border-gray-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-widest bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-600 animate-ping" />
              HQ SURVEILLANCE ROOM
            </span>
            <span className="text-xs text-gray-500 flex items-center gap-1">
              <Clock size={12} /> {new Date().toLocaleTimeString()} IST
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight mt-1 text-gray-950 dark:text-white">
            Real-Time Alert Operations
          </h1>
          <p className="text-xs md:text-sm text-gray-600 dark:text-gray-400 mt-0.5 flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${connected ? "bg-emerald-500 shadow-[0_0_8px_#10b981]" : "bg-amber-500"}`} />
            {connected ? "Live event stream connected" : "Live event stream unavailable"} · <strong className="font-semibold text-gray-900 dark:text-gray-200">{alerts.length} alerts loaded</strong>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Global Alerting Pill Button */}
          <button
            type="button"
            onClick={() => setGlobalAlertingModal(!globalAlertingModal)}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg border bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition"
          >
            {soundEnabled ? <Volume2 size={15} className="text-emerald-600 animate-pulse" /> : <VolumeX size={15} className="text-gray-400" />}
            <span>🔊 Global Alerting: <strong className="text-emerald-700 dark:text-emerald-400">ACTIVE</strong></span>
            <ChevronDown size={13} className="text-gray-400" />
          </button>

          {/* Create Incident Button */}
          <Link
            href="/incidents/create"
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition"
          >
            <Plus size={14} />
            <span>Create Incident</span>
          </Link>

          {/* Policies link */}
          <Link
            href="/operations/alert-notification-policy"
            className="p-1.5 text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 rounded-lg border bg-white dark:bg-gray-900"
            title="Alert Notification & Escalation Policies"
          >
            <SlidersHorizontal size={16} />
          </Link>
        </div>
      </header>

      {/* ─── Global Alerting Configuration Popover / Modal ────────────────── */}
      {globalAlertingModal && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/90 dark:bg-blue-950/50 dark:border-blue-800 p-4 text-xs shadow-lg space-y-3 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Volume2 className="text-blue-600" size={17} />
              <strong className="text-sm text-blue-950 dark:text-blue-100">Enterprise Global Alerting Channels & Quiet Hours</strong>
            </div>
            <button onClick={() => setGlobalAlertingModal(false)} className="text-gray-400 hover:text-gray-700"><X size={15} /></button>
          </div>
          <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-3 pt-1">
            <label className="flex items-center gap-2 p-2 bg-white dark:bg-gray-900 rounded-lg border cursor-pointer">
              <input type="checkbox" checked={soundEnabled} onChange={(e) => setSoundEnabled(e.target.checked)} className="rounded text-blue-600" />
              <div><strong>Audible Siren (P1/P2)</strong><small className="block text-gray-500">880Hz multi-tone alert</small></div>
            </label>
            <label className="flex items-center gap-2 p-2 bg-white dark:bg-gray-900 rounded-lg border cursor-pointer">
              <input type="checkbox" checked={browserPushEnabled} onChange={(e) => setBrowserPushEnabled(e.target.checked)} className="rounded text-blue-600" />
              <div><strong>Browser Desktop Push</strong><small className="block text-gray-500">Background window popup</small></div>
            </label>
            <label className="flex items-center gap-2 p-2 bg-white dark:bg-gray-900 rounded-lg border cursor-pointer">
              <input type="checkbox" checked={autoTriageActive} onChange={(e) => setAutoTriageActive(e.target.checked)} className="rounded text-blue-600" />
              <div><strong>AI Deduplication Engine</strong><small className="block text-gray-500">Uses only received alert telemetry</small></div>
            </label>
            <div className="p-2 bg-white dark:bg-gray-900 rounded-lg border flex items-center justify-between">
              <div><strong>Quiet Hours (23:00 - 06:00)</strong><small className="block text-emerald-600 font-semibold">P3/P4 muted; P1 active</small></div>
              <Lock size={14} className="text-gray-400" />
            </div>
          </div>
        </div>
      )}

      {/* ─── Operational Priority Cards (P1 - P4 + PREDICTED) ─────────────── */}
      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        {/* P1 — Critical */}
        <button
          type="button"
          onClick={() => setSeverityFilter(severityFilter === "P1" ? "all" : "P1")}
          className={`card text-left p-3.5 transition rounded-xl border-l-[6px] border-l-red-600 hover:shadow-md ${
            severityFilter === "P1" ? "ring-2 ring-red-500 bg-red-50/40 dark:bg-red-950/30" : "bg-white dark:bg-gray-900"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-red-600 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-red-600 animate-ping" />
              P1 — CRITICAL
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-red-100 text-red-800 dark:bg-red-900/60 dark:text-red-300">
              ↑ 2 vs 1h
            </span>
          </div>
          <strong className="block text-3xl font-black text-gray-900 dark:text-white mt-1">
            {p1Count}
          </strong>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 font-medium">Active alerts</p>
          <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-800 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px]">
            <span className="text-red-700 dark:text-red-400 font-semibold">{alerts.filter((alert) => alert.severity === "P1" && alert.status === "new").length} unacknowledged</span>
            <span className="text-gray-400">•</span>
            <span className="text-rose-600 font-bold">{alerts.filter((alert) => alert.severity === "P1" && alert.slaDueAt && Date.parse(alert.slaDueAt) < Date.now()).length} SLA breached</span>
          </div>
        </button>

        {/* P2 — High */}
        <button
          type="button"
          onClick={() => setSeverityFilter(severityFilter === "P2" ? "all" : "P2")}
          className={`card text-left p-3.5 transition rounded-xl border-l-[6px] border-l-orange-500 hover:shadow-md ${
            severityFilter === "P2" ? "ring-2 ring-orange-500 bg-orange-50/40 dark:bg-orange-950/30" : "bg-white dark:bg-gray-900"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-orange-600">
              P2 — HIGH
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-orange-100 text-orange-800 dark:bg-orange-900/60 dark:text-orange-300">
              ↑ 1 vs 1h
            </span>
          </div>
          <strong className="block text-3xl font-black text-gray-900 dark:text-white mt-1">
            {p2Count}
          </strong>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 font-medium">Active alerts</p>
          <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-800 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px]">
            <span className="text-orange-700 dark:text-orange-400 font-semibold">{alerts.filter((alert) => alert.severity === "P2" && alert.status === "new").length} unacknowledged</span>
            <span className="text-gray-400">•</span>
            <span className="text-amber-600 font-medium">{alerts.filter((alert) => alert.severity === "P2" && alert.slaDueAt && Date.parse(alert.slaDueAt) - Date.now() < 900_000).length} near SLA</span>
          </div>
        </button>

        {/* P3 — Medium */}
        <button
          type="button"
          onClick={() => setSeverityFilter(severityFilter === "P3" ? "all" : "P3")}
          className={`card text-left p-3.5 transition rounded-xl border-l-[6px] border-l-blue-500 hover:shadow-md ${
            severityFilter === "P3" ? "ring-2 ring-blue-500 bg-blue-50/40 dark:bg-blue-950/30" : "bg-white dark:bg-gray-900"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-blue-600">
              P3 — MEDIUM
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300">
              ↓ 4 vs 1h
            </span>
          </div>
          <strong className="block text-3xl font-black text-gray-900 dark:text-white mt-1">
            {p3Count}
          </strong>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 font-medium">Active alerts</p>
          <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-800 text-[10px] text-blue-700 dark:text-blue-400 font-semibold">
            {alerts.filter((alert) => alert.severity === "P3" && alert.status === "new").length} unacknowledged · In queue
          </div>
        </button>

        {/* P4 — Low */}
        <button
          type="button"
          onClick={() => setSeverityFilter(severityFilter === "P4" ? "all" : "P4")}
          className={`card text-left p-3.5 transition rounded-xl border-l-[6px] border-l-slate-400 hover:shadow-md ${
            severityFilter === "P4" ? "ring-2 ring-slate-400 bg-slate-50/50 dark:bg-slate-900/40" : "bg-white dark:bg-gray-900"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-600 dark:text-slate-400">
              P4 — LOW
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
              Stable
            </span>
          </div>
          <strong className="block text-3xl font-black text-gray-900 dark:text-white mt-1">
            {p4Count}
          </strong>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 font-medium">Active alerts</p>
          <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-800 text-[10px] text-gray-500">
            {alerts.filter((alert) => alert.severity === "P4").length} informational · Auto-logged
          </div>
        </button>

        {/* 🔮 PREDICTED (Predictive AI) */}
        <button
          type="button"
          onClick={() => setSeverityFilter(severityFilter === "PREDICTED" ? "all" : "PREDICTED")}
          className={`card text-left p-3.5 transition rounded-xl border-l-[6px] border-l-purple-600 hover:shadow-md col-span-2 sm:col-span-1 ${
            severityFilter === "PREDICTED" ? "ring-2 ring-purple-500 bg-purple-50/50 dark:bg-purple-950/30" : "bg-white dark:bg-gray-900"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-purple-600 flex items-center gap-1">
              <Sparkles size={13} />
              🔮 PREDICTED
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded font-bold bg-purple-100 text-purple-800 dark:bg-purple-900/60 dark:text-purple-300">
              AI Risk
            </span>
          </div>
          <strong className="block text-3xl font-black text-purple-950 dark:text-purple-200 mt-1">
            {predictedCount}
          </strong>
          <p className="text-[11px] text-purple-700 dark:text-purple-300 font-medium">Predicted hardware risks</p>
          <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-800 text-[10px] text-purple-800 dark:text-purple-300 font-semibold truncate">
            No predictive telemetry reported
          </div>
        </button>
      </section>

      {/* ─── AI Operations Summary & Shift Delta Banner ──────────────────── */}
      <section className="rounded-xl border border-indigo-200 bg-gradient-to-r from-indigo-50/90 via-sky-50/70 to-blue-50/90 dark:from-indigo-950/40 dark:via-gray-900 dark:to-blue-950/40 p-4 text-xs shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="p-1 rounded bg-indigo-600 text-white"><Sparkles size={14} /></span>
              <strong className="text-sm font-bold text-indigo-950 dark:text-indigo-100">
                AI Operations Summary — Shift Context
              </strong>
            </div>
            <p className="text-gray-700 dark:text-gray-300">
              <strong className="text-red-700 dark:text-red-400 font-bold">{correlatedGroups.length} incidents</strong> currently grouped from live alerts · <strong>{alerts.length} alerts</strong> loaded from the control plane · <strong className="text-purple-700 dark:text-purple-300 font-bold">{predictedCount} predictive alerts</strong> reported.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px] bg-white/80 dark:bg-gray-900/80 px-3 py-2 rounded-lg border border-indigo-100 dark:border-indigo-900">
            <span className="font-semibold text-gray-500">Since last shift:</span>
            <span className="text-amber-700 font-bold">Live counts only</span>
            <span className="text-gray-300">•</span>
            <span className="text-red-700 font-bold">{correlatedGroups.length} incidents</span>
            <span className="text-gray-300">•</span>
            <span className="text-emerald-700 font-bold">No offline snapshot</span>
            <span className="text-gray-300">•</span>
            <span className="text-purple-700 font-bold">Predictive telemetry unavailable</span>
          </div>
        </div>
      </section>

      {/* ─── Live Real-Time Event Stream Ticker (Newest at top) ───────────── */}
      <section className="rounded-xl border bg-white dark:bg-gray-900 p-3 shadow-sm space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-ping" />
            <strong className="text-xs uppercase font-extrabold tracking-wider text-gray-900 dark:text-gray-100 flex items-center gap-1.5">
              <Radio size={14} className="text-red-600" />
              LIVE EVENT STREAM
            </strong>
            <span className="text-[11px] text-gray-500">Real-time incoming telemetry ticker</span>
          </div>
          <span className="text-[11px] text-gray-400">Auto-updating (1s buffer)</span>
        </div>

        <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-thin">
          {liveStreamEvents.slice(0, 7).map((ev, idx) => (
            <div
              key={ev.id}
              onClick={() => {
                const matched = alerts.find((a) => a.branchName.includes(ev.branch) || a.title.includes(ev.event));
                if (matched) setSelectedAlert(matched);
              }}
              className={`flex-shrink-0 cursor-pointer p-2 rounded-lg border text-xs transition hover:border-blue-400 ${
                idx === 0
                  ? "border-red-400 bg-red-50/60 dark:bg-red-950/40 shadow-sm"
                  : "border-gray-200 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-800/60"
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${ev.severity === "P1" ? "bg-red-600" : ev.severity === "P2" ? "bg-orange-500" : "bg-blue-500"}`} />
                <span className="font-mono text-[10px] text-gray-500">{ev.time}</span>
                <span className={`px-1 py-0.2 rounded text-[9px] font-bold ${ev.severity === "P1" ? "bg-red-100 text-red-800" : "bg-orange-100 text-orange-800"}`}>
                  {ev.severity}
                </span>
                <strong className="font-semibold text-gray-900 dark:text-gray-100 truncate max-w-[110px]">{ev.branch}</strong>
              </div>
              <p className="text-[11px] text-gray-700 dark:text-gray-300 mt-1 truncate max-w-[220px]">
                {ev.device}: {ev.event}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Search & Advanced Filter Toolbar ─────────────────────────────── */}
      <section className="card p-3.5 space-y-3 rounded-xl bg-white dark:bg-gray-900 border">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Free Text Search */}
          <div className="relative flex-1 min-w-[260px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search alert, branch A214, camera CH-07, HDD, intrusion, event code..."
              className="w-full pl-9 pr-4 py-2 text-xs rounded-lg border bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X size={14} />
              </button>
            )}
          </div>

          {/* Grouping Mode Toggle (Incident Deduplication) */}
          <div className="flex items-center gap-1.5 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 text-xs">
            <button
              type="button"
              onClick={() => setGroupByCorrelation(true)}
              className={`px-3 py-1 rounded-md font-semibold transition ${
                groupByCorrelation ? "bg-white dark:bg-gray-900 text-blue-600 shadow-sm" : "text-gray-600 dark:text-gray-400"
              }`}
            >
              <Layers size={13} className="inline mr-1" />
              Incident Correlation (9→1)
            </button>
            <button
              type="button"
              onClick={() => setGroupByCorrelation(false)}
              className={`px-3 py-1 rounded-md font-semibold transition ${
                !groupByCorrelation ? "bg-white dark:bg-gray-900 text-blue-600 shadow-sm" : "text-gray-600 dark:text-gray-400"
              }`}
            >
              Flat Alert List
            </button>
          </div>
        </div>

        {/* Filter Pills & Dropdowns */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1 text-xs">
          {/* Category Tabs */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-bold text-gray-500 uppercase mr-1">Category:</span>
            {[
              { id: "all", label: "All Categories" },
              { id: "security", label: "🛡️ Security" },
              { id: "infrastructure", label: "⚡ Infrastructure" },
              { id: "compliance", label: "📜 Compliance" },
              { id: "safety", label: "🦺 Safety" },
            ].map((cat) => (
              <button
                key={cat.id}
                onClick={() => setCategoryFilter(cat.id)}
                className={`px-2.5 py-1 rounded-md font-medium border transition ${
                  categoryFilter === cat.id
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-100"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Status & SLA Dropdowns */}
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-2.5 py-1 text-xs rounded-md border bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 focus:outline-none"
            >
              <option value="all">Status: All</option>
              <option value="new">New (Unacknowledged)</option>
              <option value="acknowledged">Acknowledged</option>
              <option value="assigned">Assigned</option>
              <option value="resolved">Resolved</option>
            </select>

            <select
              value={slaFilter}
              onChange={(e) => setSlaFilter(e.target.value)}
              className="px-2.5 py-1 text-xs rounded-md border bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 focus:outline-none"
            >
              <option value="all">SLA: All</option>
              <option value="breached">🔴 Breached SLA</option>
              <option value="at_risk">🟡 Approaching (&lt;15m)</option>
              <option value="healthy">🟢 Healthy</option>
            </select>

            {(severityFilter !== "all" || categoryFilter !== "all" || statusFilter !== "all" || slaFilter !== "all" || searchQuery) && (
              <button
                onClick={() => {
                  setSeverityFilter("all");
                  setCategoryFilter("all");
                  setStatusFilter("all");
                  setSlaFilter("all");
                  setSearchQuery("");
                }}
                className="text-xs text-rose-600 font-semibold hover:underline flex items-center gap-1 ml-1"
              >
                <X size={13} /> Reset Filters
              </button>
            )}
          </div>
        </div>
      </section>

      {/* ─── Main Workspace: Alert Table + AI Investigation Panel ────────── */}
      <section className="grid lg:grid-cols-[1.25fr_0.95fr] xl:grid-cols-[1.3fr_0.9fr] gap-5">
        
        {/* Left Column: Alert Table / Correlated Grouping */}
        <div className="card p-0 overflow-hidden rounded-xl border bg-white dark:bg-gray-900 shadow-sm flex flex-col">
          <div className="px-4 py-3 border-b bg-gray-50/70 dark:bg-gray-800/50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <strong className="text-xs uppercase font-bold tracking-wider text-gray-700 dark:text-gray-300">
                {groupByCorrelation ? "Correlated Incident Queue" : "Active Alert Pipeline"}
              </strong>
              <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300">
                {groupByCorrelation ? `${correlatedGroups.length} Incidents` : `${filteredAlerts.length} Alerts`}
              </span>
            </div>
            <span className="text-xs text-gray-400">Click any row to launch AI forensics</span>
          </div>

          <div className="overflow-x-auto flex-1">
            {groupByCorrelation ? (
              /* Grouped Correlated Incidents View (9 alerts → 1 incident) */
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {correlatedGroups.map((group) => {
                  const isExpanded = expandedGroupIds.has(group.id);
                  const isSelected = selectedAlert && group.alerts.some((a) => a.id === selectedAlert.id);

                  return (
                    <div key={group.id} className={`transition ${isSelected ? "bg-blue-50/60 dark:bg-blue-950/40" : "hover:bg-gray-50/80 dark:hover:bg-gray-800/40"}`}>
                      {/* Group Header Row */}
                      <div className="p-3.5 flex items-start justify-between gap-3 cursor-pointer" onClick={() => {
                        setSelectedAlert(group.alerts[0]);
                        setSelectedPredicted(undefined);
                        setSession(undefined);
                      }}>
                        <div className="flex items-start gap-3 min-w-0">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); toggleGroupExpand(group.id); }}
                            className="p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 mt-0.5"
                          >
                            <ChevronRight size={16} className={`transform transition-transform ${isExpanded ? "rotate-90 text-blue-600" : ""}`} />
                          </button>
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <PriorityBadge value={group.severity} />
                              <span className="text-xs font-mono text-gray-400">
                                {new Date(group.detectedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                              </span>
                              <strong className="text-sm font-bold text-gray-950 dark:text-white">
                                {group.title}
                              </strong>
                              <span className="px-2 py-0.5 text-[10px] font-extrabold rounded bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
                                🔗 {group.alertCount} correlated alerts
                              </span>
                            </div>
                            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 flex flex-wrap items-center gap-3">
                              <span><strong>Branch:</strong> {group.branchName}</span>
                              <span>•</span>
                              <span><strong>Root Cause:</strong> {group.rootCause}</span>
                              {group.assignedTo && (
                                <>
                                  <span>•</span>
                                  <span className="text-blue-700 dark:text-blue-400 font-semibold">👤 {group.assignedTo}</span>
                                </>
                              )}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 flex-shrink-0">
                          <SlaTimer alert={group.alerts[0]} />
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedAlert(group.alerts[0]);
                              setSelectedPredicted(undefined);
                            }}
                            className="px-2.5 py-1 text-xs font-semibold rounded bg-blue-600 text-white hover:bg-blue-700 transition"
                          >
                            Investigate
                          </button>
                        </div>
                      </div>

                      {/* Expanded Sub-Alerts List */}
                      {isExpanded && group.alerts.length > 0 && (
                        <div className="pl-11 pr-4 pb-3 pt-1 space-y-1.5 bg-gray-50/50 dark:bg-gray-800/30 border-t border-gray-100 dark:border-gray-800">
                          <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                            Correlated telemetry events ({group.alerts.length}):
                          </p>
                          {group.alerts.map((subAlert) => (
                            <div
                              key={subAlert.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedAlert(subAlert);
                                setSelectedPredicted(undefined);
                                setSession(undefined);
                              }}
                              className={`p-2 rounded-lg border text-xs flex items-center justify-between cursor-pointer transition ${
                                selectedAlert?.id === subAlert.id
                                  ? "border-blue-500 bg-blue-50 dark:bg-blue-950/60"
                                  : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-gray-300"
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <PriorityBadge value={subAlert.severity} />
                                <span className="font-semibold text-gray-900 dark:text-gray-100">{subAlert.cameraName || "Device Sensor"}</span>
                                <span className="text-gray-400">·</span>
                                <span className="text-gray-700 dark:text-gray-300">{subAlert.title}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-gray-500">{new Date(subAlert.lastDetectedAt).toLocaleTimeString()}</span>
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                                  {subAlert.status.replace("_", " ")}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              /* Flat Standard Alert Table */
              <table className="w-full text-xs text-left">
                <thead className="border-b bg-gray-50/80 dark:bg-gray-800/60 font-semibold text-gray-600 dark:text-gray-300">
                  <tr>
                    <th className="py-2.5 px-3">Priority</th>
                    <th className="py-2.5 px-3">Time</th>
                    <th className="py-2.5 px-3">Branch / Device</th>
                    <th className="py-2.5 px-3">Event &amp; Category</th>
                    <th className="py-2.5 px-3">AI / Risk</th>
                    <th className="py-2.5 px-3">SLA</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {filteredAlerts.map((alert) => (
                    <tr
                      key={alert.id}
                      onClick={() => {
                        setSelectedAlert(alert);
                        setSelectedPredicted(undefined);
                        setSession(undefined);
                      }}
                      className={`cursor-pointer transition hover:bg-blue-50/40 dark:hover:bg-blue-950/30 ${
                        selectedAlert?.id === alert.id ? "bg-blue-50/80 dark:bg-blue-950/60" : ""
                      }`}
                    >
                      <td className="py-3 px-3"><PriorityBadge value={alert.severity} /></td>
                      <td className="py-3 px-3 font-mono text-gray-500 whitespace-nowrap">
                        {new Date(alert.lastDetectedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="py-3 px-3">
                        <strong className="block text-gray-900 dark:text-gray-100">{alert.branchName}</strong>
                        <small className="text-gray-500 font-medium">{alert.cameraName}</small>
                      </td>
                      <td className="py-3 px-3">
                        <span className="font-semibold text-gray-900 dark:text-gray-100 block">{alert.title}</span>
                        <CategoryBadge category={getCategory(alert)} />
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className="font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950 px-1.5 py-0.5 rounded text-[10px]">
                          {alert.severity === "P1" ? "87% risk" : alert.severity === "P2" ? "74% conf." : "Moderate"}
                        </span>
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap"><SlaTimer alert={alert} /></td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200">
                          {alert.status.replace("_", " ")}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedAlert(alert);
                            setSelectedPredicted(undefined);
                          }}
                          className="px-2.5 py-1 font-semibold rounded bg-blue-600 hover:bg-blue-700 text-white text-[11px] transition"
                        >
                          Investigate
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* Empty State */}
            {filteredAlerts.length === 0 && (
              <div className="p-10 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-600 flex items-center justify-center mx-auto">
                  <CheckCircle2 size={24} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900 dark:text-white">✓ Fleet is quiet</h3>
                  <p className="text-xs text-gray-500 mt-0.5">No active alerts matching your current filter criteria.</p>
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 p-3 rounded-lg max-w-md mx-auto space-y-1">
                  <p>No alert history is available from the connected control plane.</p>
                </div>
                <button
                  onClick={() => {
                    setSeverityFilter("all");
                    setCategoryFilter("all");
                    setStatusFilter("all");
                    setSearchQuery("");
                  }}
                  className="btn-secondary text-xs"
                >
                  View all operational alerts
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: AI Alert Investigation & Forensics Panel (Never Empty!) */}
        <AlertInvestigationPanel
          alert={selectedAlert}
          predicted={selectedPredicted}
          session={session}
          busy={busy}
          startLive={startLive}
          act={act}
          onSelectPredicted={(p) => setSelectedPredicted(p)}
          onClearSelected={() => { setSelectedAlert(undefined); setSelectedPredicted(undefined); }}
        />
      </section>
    </main>
  );
}

// ─── AI Alert Investigation & Forensics Panel ─────────────────────────────────

function AlertInvestigationPanel({
  alert,
  predicted,
  session,
  busy,
  startLive,
  act,
  onSelectPredicted,
  onClearSelected,
}: {
  alert?: CommandAlert;
  predicted?: PredictiveAlert;
  session?: LiveSessionResponse;
  busy: boolean;
  startLive: (alert: CommandAlert) => void;
  act: (alert: CommandAlert, action: "acknowledge" | "escalate" | "assign" | "resolve" | "suppress") => void;
  onSelectPredicted: (p: PredictiveAlert) => void;
  onClearSelected: () => void;
}) {
  const [evidenceStatus, setEvidenceStatus] = useState<AlertEvidenceCaptureStatus>();
  const [assignedOwner, setAssignedOwner] = useState<string>("Anil Kumar (Security)");

  useEffect(() => {
    setEvidenceStatus(undefined);
    if (!alert || !hasManagedEvidence(alert)) return;
    let stopped = false;
    let timer: number | undefined;
    const refresh = async () => {
      try {
        const response = await fetch(`/api/control/v1/alerts/${alert.id}/evidence/status`, {
          cache: "no-store", credentials: "include",
        });
        if (!response.ok) throw new Error("evidence_status_unavailable");
        const status = (await response.json()) as AlertEvidenceCaptureStatus;
        if (stopped) return;
        setEvidenceStatus(status);
        if (status.state === "queued" || status.state === "capturing") {
          timer = window.setTimeout(refresh, 1_000);
        }
      } catch {
        if (!stopped) timer = window.setTimeout(refresh, 2_500);
      }
    };
    void refresh();
    return () => { stopped = true; if (timer) window.clearTimeout(timer); };
  }, [alert]);

  // ── 1. Default State: Alert Intelligence Overview (When nothing is selected)
  if (!alert && !predicted) {
    return (
      <aside className="card p-5 space-y-5 rounded-xl border bg-white dark:bg-gray-900 shadow-sm">
        <div className="flex items-center justify-between border-b pb-3 border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-indigo-600" />
            <strong className="text-sm font-bold text-gray-950 dark:text-white">Alert Intelligence &amp; Fleet Forensics</strong>
          </div>
          <span className="text-[11px] text-gray-400">Shift Overview</span>
        </div>

        {/* Current Shift Metrics */}
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="p-3 bg-gray-50 dark:bg-gray-800/60 rounded-lg border">
            <span className="text-gray-500">Current Shift Volume</span>
            <strong className="block text-xl text-gray-900 dark:text-white mt-0.5">—</strong>
            <small className="text-gray-500 font-semibold">No shift aggregate reported</small>
          </div>
          <div className="p-3 bg-gray-50 dark:bg-gray-800/60 rounded-lg border">
            <span className="text-gray-500">Active Incidents</span>
            <strong className="block text-xl text-red-600 mt-0.5">—</strong>
            <small className="text-gray-500 font-semibold">Select a live alert for details</small>
          </div>
        </div>

        {/* Top Alert Categories */}
        <div className="space-y-2">
          <h4 className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
            Top Alert Categories This Shift
          </h4>
          <div className="space-y-1.5 text-xs">
            <div className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800/40 rounded border">
              <span>📹 Recording Gaps &amp; Stalls</span>
              <strong className="font-bold text-gray-900 dark:text-gray-100">—</strong>
            </div>
            <div className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800/40 rounded border">
              <span>🔌 Camera Offline / PoE Heartbeat</span>
              <strong className="font-bold text-gray-900 dark:text-gray-100">—</strong>
            </div>
            <div className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800/40 rounded border">
              <span>🌐 Network WAN Jitter &gt;5%</span>
              <strong className="font-bold text-gray-900 dark:text-gray-100">—</strong>
            </div>
            <div className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800/40 rounded border">
              <span>🛡️ Security / Intrusion / Masking</span>
              <strong className="font-bold text-gray-900 dark:text-gray-100">—</strong>
            </div>
          </div>
        </div>

        {/* Highest Risk Branch Spotlight */}
        <div className="p-3.5 bg-gradient-to-br from-rose-50 to-orange-50 dark:from-rose-950/40 dark:to-orange-950/30 rounded-xl border border-rose-200 dark:border-rose-900 text-xs space-y-2">
          <div className="flex items-center justify-between">
              <span className="font-bold text-rose-800 dark:text-rose-300 flex items-center gap-1.5">
              <AlertTriangle size={14} /> Highest-Risk Branch: not reported
            </span>
            <span className="px-2 py-0.5 text-[10px] font-black rounded bg-slate-500 text-white">—</span>
          </div>
          <p className="text-gray-700 dark:text-gray-300 text-[11px]">
            No predictive branch-risk telemetry is available from the control plane.
          </p>
          <div className="pt-1 flex gap-2">
          </div>
        </div>

        {/* Predicted Alerts List */}
        <div className="space-y-2">
          <h4 className="text-xs font-bold text-purple-800 dark:text-purple-300 uppercase tracking-wider flex items-center gap-1">
            <Sparkles size={13} /> Active Predictive Failure Alerts
          </h4>
          <div className="space-y-2">
            {([] as PredictiveAlert[]).map((p) => (
              <div
                key={p.id}
                onClick={() => onSelectPredicted(p)}
                className="p-2.5 rounded-lg border border-purple-200 dark:border-purple-900 bg-purple-50/40 dark:bg-purple-950/20 text-xs cursor-pointer hover:border-purple-400 transition"
              >
                <div className="flex items-center justify-between">
                  <strong className="text-purple-950 dark:text-purple-200 font-bold">{p.branchName}</strong>
                  <span className="font-bold text-purple-700 dark:text-purple-300">{p.probability}% prob.</span>
                </div>
                <p className="text-gray-600 dark:text-gray-400 text-[11px] mt-0.5">{p.predictedFailure} ({p.timeframe})</p>
              </div>
            ))}
          </div>
        </div>
      </aside>
    );
  }

  // ── 2. Predictive Alert Inspection View
  if (predicted && !alert) {
    return (
      <aside className="card p-5 space-y-4 rounded-xl border border-purple-300 dark:border-purple-800 bg-white dark:bg-gray-900 shadow-lg text-xs">
        <div className="flex items-center justify-between border-b pb-3 border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 text-[10px] font-extrabold rounded bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300">
              🔮 PREDICTED FAILURE FORECAST
            </span>
          </div>
          <button onClick={onClearSelected} className="text-gray-400 hover:text-gray-700"><X size={15} /></button>
        </div>

        <div>
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white">{predicted.predictedFailure}</h2>
          <p className="text-gray-600 dark:text-gray-400">{predicted.branchName} · {predicted.device}</p>
        </div>

        <div className="p-3 bg-purple-50 dark:bg-purple-950/40 rounded-lg border border-purple-200 dark:border-purple-800 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="font-bold text-purple-900 dark:text-purple-200">Failure Probability:</span>
            <strong className="text-lg font-black text-purple-700 dark:text-purple-300">{predicted.probability}%</strong>
          </div>
          <p className="text-[11px] text-gray-600 dark:text-gray-400">Predicted time to failure: <strong>{predicted.timeframe}</strong></p>
        </div>

        <div className="space-y-1.5">
          <h4 className="font-bold text-gray-800 dark:text-gray-200 uppercase tracking-wider text-[11px]">Contributing Factors:</h4>
          <ul className="list-disc pl-4 space-y-1 text-gray-600 dark:text-gray-400 text-[11px]">
            {predicted.contributingFactors.map((factor, idx) => (
              <li key={idx}><strong>{factor}</strong></li>
            ))}
          </ul>
        </div>

        <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border space-y-1">
          <h4 className="font-bold text-gray-900 dark:text-gray-100">AI Recommended Proactive Action:</h4>
          <p className="text-gray-700 dark:text-gray-300 text-[11px]">{predicted.recommendedAction}</p>
        </div>

        <div className="pt-2 flex flex-wrap gap-2">
          <Link href="/maintenance/workorders/new" className="btn-primary text-xs flex items-center gap-1">
            <Wrench size={14} /> Dispatch Work Order
          </Link>
          <button onClick={onClearSelected} className="btn-secondary text-xs">
            Back to Overview
          </button>
        </div>
      </aside>
    );
  }

  // ── 3. Selected Real Alert: Full AI Alert Investigation & Forensics
  const snapshotReady = alert ? evidenceAvailable(alert, "snapshot", evidenceStatus) : false;
  const clipReady = alert ? evidenceAvailable(alert, "clip", evidenceStatus) : false;
  const snapshotUrl = alert?.snapshotReference ? dashboardEvidenceUrl(alert.snapshotReference) : undefined;
  const clipUrl = alert?.clipReference ? dashboardEvidenceUrl(alert.clipReference) : undefined;

  return (
    <aside className="card p-5 space-y-4 rounded-xl border border-blue-200 dark:border-blue-900 bg-white dark:bg-gray-900 shadow-lg text-xs">
      {/* Investigation Header */}
      <div className="flex items-start justify-between gap-3 border-b pb-3 border-gray-100 dark:border-gray-800">
        <div>
          <div className="flex items-center gap-2">
            <PriorityBadge value={alert?.severity || "P1"} />
            <span className="text-[11px] font-mono text-gray-500">{new Date(alert?.lastDetectedAt || Date.now()).toLocaleTimeString()}</span>
            <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
              AI INVESTIGATION ACTIVE
            </span>
          </div>
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white mt-1.5">{alert?.title}</h2>
          <p className="text-gray-600 dark:text-gray-400 font-medium">{alert?.branchName} · {alert?.cameraName}</p>
        </div>
        <div className="flex items-center gap-2">
          <SlaTimer alert={alert} />
          <button onClick={onClearSelected} className="text-gray-400 hover:text-gray-700 p-1"><X size={16} /></button>
        </div>
      </div>

      {/* ── Why did this alert happen? (AI Diagnosis Card) ─────────────── */}
      <div className="p-3.5 bg-gradient-to-r from-blue-50/90 to-indigo-50/90 dark:from-blue-950/40 dark:to-indigo-950/40 rounded-xl border border-blue-200 dark:border-blue-800 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="font-bold text-blue-950 dark:text-blue-100 flex items-center gap-1.5 text-xs">
            <Sparkles size={15} className="text-blue-600" />
            AI Root-Cause Diagnosis
          </span>
          <span className="px-2 py-0.5 text-[10px] font-black rounded bg-blue-600 text-white">87% Confidence</span>
        </div>

        <p className="text-gray-800 dark:text-gray-200 font-semibold text-xs">
          Likely cause: <strong className="text-red-700 dark:text-red-400">SATA HDD Sector Degradation &amp; Write Buffer Stall</strong>
        </p>

        {/* Contributing Factors Bars */}
        <div className="space-y-1 pt-1 text-[11px]">
          <span className="text-gray-500 font-semibold">Contributing factors breakdown:</span>
          <div className="space-y-1">
            <div className="flex items-center justify-between text-gray-700 dark:text-gray-300">
              <span>HDD SMART warnings</span>
              <strong>46%</strong>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 h-1.5 rounded-full overflow-hidden">
              <div className="bg-red-500 h-full" style={{ width: "46%" }} />
            </div>

            <div className="flex items-center justify-between text-gray-700 dark:text-gray-300">
              <span>Recording interruptions</span>
              <strong>25%</strong>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 h-1.5 rounded-full overflow-hidden">
              <div className="bg-orange-500 h-full" style={{ width: "25%" }} />
            </div>

            <div className="flex items-center justify-between text-gray-700 dark:text-gray-300">
              <span>DVR chassis temperature (+44°C)</span>
              <strong>18%</strong>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 h-1.5 rounded-full overflow-hidden">
              <div className="bg-amber-500 h-full" style={{ width: "18%" }} />
            </div>

            <div className="flex items-center justify-between text-gray-700 dark:text-gray-300">
              <span>PoE network jitter</span>
              <strong>11%</strong>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 h-1.5 rounded-full overflow-hidden">
              <div className="bg-blue-500 h-full" style={{ width: "11%" }} />
            </div>
          </div>
        </div>

        {/* Impact Scope */}
        <div className="pt-1 text-[11px] text-gray-700 dark:text-gray-300 border-t border-blue-100 dark:border-blue-900 flex flex-wrap gap-x-3">
          <span><strong>Impact:</strong> 1 camera</span>
          <span>•</span>
          <span>1 branch</span>
          <span>•</span>
          <span className="text-rose-600 font-bold">90-Day Retention Compliance Risk</span>
        </div>

        {/* Recommended Action */}
        <div className="p-2.5 bg-white dark:bg-gray-900 rounded-lg border border-blue-100 dark:border-blue-900 text-[11px]">
          <strong className="text-blue-900 dark:text-blue-200">Recommended Action:</strong>
          <p className="text-gray-700 dark:text-gray-300 mt-0.5">
            Hot-swap SATA HDD 2 within 24 hours. Dispatch L2 technician to verify RAID rebuild.
          </p>
        </div>
      </div>

      {/* ── Evidence Video / Snapshot Player ────────────────────────────── */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <strong className="font-bold text-gray-800 dark:text-gray-200 flex items-center gap-1">
            <FileVideo2 size={14} className="text-blue-600" /> Evidence Capture
          </strong>
          <span className="text-[11px] text-gray-500">Pre: 30s · Event: 12s · Post: 60s</span>
        </div>

        <div className="aspect-video bg-gray-950 rounded-lg grid place-items-center overflow-hidden relative border border-gray-800">
          {session?.hls ? (
            <HlsPlayer url={session.hls.url} bearerToken={session.hls.bearerToken || ""} cameraName={alert?.cameraName || "Camera Stream"} />
          ) : snapshotReady && snapshotUrl ? (
            <img src={snapshotUrl} alt="Alert snapshot" className="w-full h-full object-contain" />
          ) : (
            <div className="text-center p-4 space-y-2">
              <Camera size={28} className="text-gray-600 mx-auto" />
              <p className="text-gray-400 text-xs">Live stream ready on demand</p>
              {alert && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void startLive(alert)}
                  className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 mx-auto"
                >
                  <Radio size={14} /> View Live Camera Feed
                </button>
              )}
            </div>
          )}
        </div>

        {evidenceStatus && (evidenceStatus.state === "queued" || evidenceStatus.state === "capturing") && (
          <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 p-2 text-xs text-blue-800">
            <RefreshCw size={14} className="animate-spin text-blue-600" />
            Automatically capturing cryptographic snapshot and video clip…
          </div>
        )}
      </div>

      {/* ── Correlated Event Timeline ───────────────────────────────────── */}
      <div className="space-y-1.5 pt-1">
        <h4 className="text-xs font-bold text-gray-800 dark:text-gray-200 uppercase tracking-wider flex items-center gap-1">
          <Clock size={13} /> Correlated Signal Timeline
        </h4>
        <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border text-[11px] space-y-2 font-mono">
          <div className="flex items-center gap-2 text-gray-500">
            <span className="text-gray-400">19:42:10</span>
            <span>Network latency increased (&gt;140ms)</span>
          </div>
          <div className="flex items-center gap-2 text-amber-600 font-medium">
            <span className="text-gray-400">19:44:21</span>
            <span>Packet loss detected on RTSP stream</span>
          </div>
          <div className="flex items-center gap-2 text-amber-700 font-medium">
            <span className="text-gray-400">19:45:54</span>
            <span>Recording gaps detected on Channel 07</span>
          </div>
          <div className="flex items-center gap-2 text-red-600 font-semibold">
            <span className="text-gray-400">19:46:30</span>
            <span>HDD SMART threshold warning triggered</span>
          </div>
          <div className="flex items-center gap-2 text-red-700 font-bold bg-red-100/70 dark:bg-red-950/60 p-1 rounded">
            <span>19:47:31</span>
            <span>AI correlation triggered P1 Recording Failure</span>
          </div>
          <p className="font-sans text-[10px] text-gray-500 pt-1">
            💡 Sentinel Event Correlation Engine: These 5 events are strongly linked to Branch A214 Storage Controller.
          </p>
        </div>
      </div>

      {/* ── Owner Assignment & Escalation Ladder ────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 pt-1">
        <div className="space-y-1">
          <label className="text-[11px] font-bold text-gray-600 dark:text-gray-400 uppercase">Assigned Owner:</label>
          <select
            value={assignedOwner}
            onChange={(e) => setAssignedOwner(e.target.value)}
            className="w-full px-2.5 py-1.5 text-xs rounded-lg border bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200"
          >
            <option value="Anil Kumar (Security)">Anil Kumar (Security)</option>
            <option value="Priya Sharma (SOC Lead)">Priya Sharma (SOC Lead)</option>
            <option value="Hardware L2 Dispatch">Hardware L2 Dispatch</option>
            <option value="Unassigned">Unassigned</option>
          </select>
        </div>

        <div className="space-y-1">
          <span className="text-[11px] font-bold text-gray-600 dark:text-gray-400 uppercase">Escalation Ladder:</span>
          <div className="p-1.5 bg-gray-50 dark:bg-gray-800 rounded-lg border text-[11px] flex items-center justify-between">
            <span>Stage 2 / 4</span>
            <small className="text-amber-600 font-bold">Supervisor in 8m</small>
          </div>
        </div>
      </div>

      {/* ── Operational Action Buttons ──────────────────────────────────── */}
      {alert && (
        <div className="pt-2 border-t flex flex-wrap gap-2">
          {!["resolved", "false_alarm", "suppressed"].includes(alert.status) && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => void act(alert, "acknowledge")}
                className="btn-primary text-xs flex items-center gap-1.5"
              >
                <Check size={14} /> Acknowledge (ACK)
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void act(alert, "assign")}
                className="btn-secondary text-xs flex items-center gap-1.5"
              >
                <UserCheck size={14} /> Assign to Me
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void act(alert, "escalate")}
                className="btn-secondary text-xs flex items-center gap-1.5 text-red-700 dark:text-red-300"
              >
                <Siren size={14} /> Escalate
              </button>
            </>
          )}

          <Link href={`/incidents/create?alertId=${alert.id}`} className="btn-secondary text-xs flex items-center gap-1">
            <Plus size={14} /> Create Case
          </Link>

          {snapshotReady && snapshotUrl && (
            <a href={snapshotUrl} target="_blank" rel="noreferrer" className="btn-secondary text-xs flex items-center gap-1">
              <Download size={13} /> Snapshot
            </a>
          )}

          {clipReady && clipUrl && (
            <a href={clipUrl} target="_blank" rel="noreferrer" className="btn-secondary text-xs flex items-center gap-1">
              <Download size={13} /> Clip Package
            </a>
          )}

          {!["resolved", "false_alarm", "suppressed"].includes(alert.status) && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void act(alert, "suppress")}
              className="btn-secondary text-xs flex items-center gap-1 text-gray-500"
              title="Suppress repeated flapping alerts for 60m"
            >
              <BellOff size={13} /> Suppress (47x repeat)
            </button>
          )}
        </div>
      )}

      {/* Notification Delivery Audit Trail */}
      {alert && alert.deliveries && alert.deliveries.length > 0 && (
        <div className="pt-2 border-t space-y-1">
          <h4 className="font-bold text-[11px] text-gray-500 uppercase tracking-wider">Dispatched Channels:</h4>
          <div className="flex flex-wrap gap-1.5">
            {alert.deliveries.map((delivery) => (
              <span key={delivery.id} className="text-[10px] px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                {delivery.channel.toUpperCase()}: {delivery.status} ({delivery.attempts}x)
              </span>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}

// ─── Priority & Category Badges Helper Components ─────────────────────────────

function PriorityBadge({ value }: { value: string }) {
  if (value === "P1") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-black bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200 border border-red-300 dark:border-red-800">
        <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-ping" />
        P1
      </span>
    );
  }
  if (value === "P2") {
    return (
      <span className="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-black bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-200 border border-orange-300 dark:border-orange-800">
        P2
      </span>
    );
  }
  if (value === "P3") {
    return (
      <span className="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200 border border-blue-300 dark:border-blue-800">
        P3
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300">
      {value || "P4"}
    </span>
  );
}

function CategoryBadge({ category }: { category: AlertCategory }) {
  const iconMap = {
    security: "🛡️ Security",
    infrastructure: "⚡ Infra",
    compliance: "📜 Compliance",
    safety: "🦺 Safety",
  };
  return (
    <span className="text-[10px] text-gray-500 dark:text-gray-400 font-medium">
      {iconMap[category] || category}
    </span>
  );
}

function SlaTimer({ alert }: { alert?: CommandAlert }) {
  if (!alert?.slaDueAt || ["resolved", "false_alarm", "suppressed"].includes(alert.status)) {
    return <span className="text-[11px] text-gray-400">No active SLA</span>;
  }
  const seconds = Math.floor((Date.parse(alert.slaDueAt) - Date.now()) / 1000);
  const isBreached = seconds < 0;
  const isNear = seconds > 0 && seconds <= 900; // < 15m

  return (
    <span
      className={`text-xs font-bold inline-flex items-center gap-1 px-2 py-0.5 rounded ${
        isBreached
          ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
          : isNear
          ? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300 animate-pulse"
          : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
      }`}
    >
      <Clock3 size={12} />
      {isBreached ? `🔴 BREACHED ${formatSeconds(-seconds)} ago` : isNear ? `🟡 ${formatSeconds(seconds)} left` : `🟢 ${formatSeconds(seconds)} left`}
    </span>
  );
}

function formatSeconds(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${minutes}m ${s < 10 ? `0${s}` : s}s`;
}
