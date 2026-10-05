"use client";

import React, { useState, useMemo } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import {
  Layers,
  MapPin,
  Building2,
  Globe2,
  AlertTriangle,
  Clock,
  TrendingUp,
  Activity,
  CheckCircle2,
  ShieldCheck,
  ShieldX,
  X,
  Maximize2,
  Minimize2,
  PieChart as PieChartIcon,
  BarChart3,
  Calendar,
  CalendarDays,
} from "lucide-react";
import type { AnalyticsAlert } from "@/lib/types";

// Palette matching high-tech enterprise dark mode
const COLORS = {
  p1: "#f43f5e", // Rose 500
  p2: "#f59e0b", // Amber 500
  p3: "#eab308", // Yellow 500
  p4: "#38bdf8", // Sky 400
  p5: "#94a3b8", // Slate 400
};

const PIE_PALETTE = [
  "#38bdf8", // Sky
  "#a855f7", // Purple
  "#f43f5e", // Rose
  "#10b981", // Emerald
  "#f59e0b", // Amber
  "#6366f1", // Indigo
  "#ec4899", // Pink
  "#14b8a6", // Teal
  "#8b5cf6", // Violet
  "#e11d48", // Crimson
];

// Helper to normalize alert date to YYYY-MM-DD
export function normalizeAlertDate(alert: AnalyticsAlert): string {
  const ts = alert.lastDetectedAt || alert.createdAt || alert.firstDetectedAt;
  if (!ts) return new Date().toISOString().slice(0, 10);
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
    return d.toISOString().slice(0, 10);
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

// Helper to format date string for display (e.g. 17 Sep 2026)
export function formatDisplayDate(dateStr: string): string {
  try {
    const parts = dateStr.split("-");
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const d = new Date(year, month, day);
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    }
    return dateStr;
  } catch {
    return dateStr;
  }
}

// Helper to normalize alert type label
export function normalizeAlertType(alert: AnalyticsAlert): string {
  if (alert.alertType) {
    const raw = alert.alertType.toLowerCase();
    if (raw.includes("vault") || raw.includes("safe")) return "Vault & Strongroom Breach";
    if (raw.includes("weapon") || raw.includes("gun") || raw.includes("knife")) return "Weapon & Armed Threat";
    if (raw.includes("intrusion") || raw.includes("perimeter")) return "Intrusion & Perimeter Breach";
    if (raw.includes("loiter")) return "Suspicious Loitering";
    if (raw.includes("line")) return "Line Crossing Violation";
    if (raw.includes("tamper") || raw.includes("defocus") || raw.includes("obstruction")) return "Camera Tamper / Defocus";
    if (raw.includes("face") || raw.includes("person-black")) return "Face Watchlist / Blacklist";
    if (raw.includes("crowd") || raw.includes("queue")) return "Crowd Density / Queue Overflow";
    if (raw.includes("fire") || raw.includes("smoke")) return "Fire & Smoke Hazard";
    if (raw.includes("tailgat")) return "Tailgating / Piggybacking";
    if (raw.includes("abandon") || raw.includes("unattended")) return "Unattended / Abandoned Object";
    return alert.alertType.charAt(0).toUpperCase() + alert.alertType.slice(1);
  }

  const title = (alert.title || "").toLowerCase();
  if (title.includes("vault") || title.includes("strong room") || title.includes("chest")) return "Vault & Strongroom Breach";
  if (title.includes("weapon") || title.includes("gun") || title.includes("knife") || title.includes("robbery")) return "Weapon & Armed Threat";
  if (title.includes("intrusion") || title.includes("perimeter") || title.includes("trespass") || title.includes("zone")) return "Intrusion & Perimeter Breach";
  if (title.includes("loiter") || title.includes("stationary")) return "Suspicious Loitering";
  if (title.includes("line") || title.includes("cross")) return "Line Crossing Violation";
  if (title.includes("tamper") || title.includes("defocus") || title.includes("blind") || title.includes("obstruct")) return "Camera Tamper / Defocus";
  if (title.includes("face") || title.includes("blacklist") || title.includes("watchlist") || title.includes("outsider")) return "Face Watchlist / Blacklist";
  if (title.includes("crowd") || title.includes("gathering") || title.includes("queue")) return "Crowd Density / Queue Overflow";
  if (title.includes("fire") || title.includes("smoke") || title.includes("flame")) return "Fire & Smoke Hazard";
  if (title.includes("tailgat") || title.includes("piggyback") || title.includes("door")) return "Tailgating / Piggybacking";
  if (title.includes("abandon") || title.includes("unattended") || title.includes("bag") || title.includes("package")) return "Unattended / Abandoned Object";
  return alert.title || "Surveillance AI Alert";
}

// Helper to normalize surveillance zone
export function normalizeZone(alert: AnalyticsAlert): string {
  if (alert.zoneName && alert.zoneName.trim() && !alert.zoneName.toLowerCase().includes("not specified")) {
    return alert.zoneName.trim();
  }
  const title = (alert.title || "").toLowerCase();
  const cam = (alert.cameraName || "").toLowerCase();
  if (title.includes("vault") || cam.includes("vault") || title.includes("strongroom")) return "Currency Vault Strongroom";
  if (title.includes("teller") || cam.includes("teller") || title.includes("counter")) return "Cash Tellers & Counters";
  if (title.includes("atm") || cam.includes("atm")) return "ATM Lobby & Vestibule";
  if (title.includes("entrance") || cam.includes("entry") || title.includes("gate") || cam.includes("door")) return "Main Entrance & Access Airlock";
  if (title.includes("hall") || cam.includes("hall") || title.includes("lobby")) return "Public Banking Hall";
  if (title.includes("perimeter") || cam.includes("perimeter") || title.includes("fence") || cam.includes("parking")) return "Outer Perimeter & Parking";
  if (title.includes("server") || cam.includes("server") || cam.includes("it")) return "Server & Network Room";
  return "General Surveillance Zone";
}

// Helper to normalize branch
export function normalizeBranch(alert: AnalyticsAlert): string {
  if (alert.branchName && alert.branchName.trim()) {
    return alert.branchName.replace(/^Branch\s+/i, "");
  }
  return "Central Operations Branch";
}

// Helper to normalize area
export function normalizeArea(alert: AnalyticsAlert): string {
  if (alert.areaName && alert.areaName.trim()) {
    return alert.areaName.trim();
  }
  const b = normalizeBranch(alert).toLowerCase();
  if (b.includes("kochi") || b.includes("marine drive") || b.includes("adithi") || b.includes("malavika") || b.includes("ernakulam")) {
    return "Kochi Marine Drive Area";
  }
  if (b.includes("mumbai") || b.includes("bkc") || b.includes("bandra")) {
    return "Mumbai BKC Area";
  }
  if (b.includes("delhi") || b.includes("connaught") || b.includes("cp")) {
    return "Delhi Connaught Place Area";
  }
  if (b.includes("bengaluru") || b.includes("whitefield") || b.includes("itpl")) {
    return "Bengaluru Whitefield Area";
  }
  if (b.includes("mg road") || b.includes("blr-001")) {
    return "Bengaluru Central Area";
  }
  if (b.includes("hyderabad") || b.includes("hitec") || b.includes("cyber")) {
    return "Hyderabad Hitec City Area";
  }
  if (b.includes("chennai") || b.includes("anna salai") || b.includes("mount")) {
    return "Chennai Anna Salai Area";
  }
  if (b.includes("kolkata") || b.includes("park street")) {
    return "Kolkata Park Street Area";
  }
  if (b.includes("pune") || b.includes("fc road") || b.includes("shivaji")) {
    return "Pune FC Road Area";
  }
  if (b.includes("ahmedabad") || b.includes("sg highway") || b.includes("bodakdev")) {
    return "Ahmedabad SG Highway Area";
  }
  return "Urban Commercial Area";
}

// Helper to normalize region
export function normalizeRegion(alert: AnalyticsAlert): string {
  if (alert.regionName && alert.regionName.trim()) {
    return alert.regionName.trim();
  }
  const b = normalizeBranch(alert).toLowerCase();
  const a = normalizeArea(alert).toLowerCase();
  if (b.includes("kochi") || b.includes("kerala") || a.includes("kochi") || b.includes("ernakulam") || b.includes("thrissur")) {
    return "South Region (Kerala)";
  }
  if (b.includes("mumbai") || b.includes("pune") || b.includes("maharashtra") || a.includes("mumbai") || a.includes("pune")) {
    return "West Region (Maharashtra)";
  }
  if (b.includes("ahmedabad") || b.includes("gujarat") || a.includes("ahmedabad")) {
    return "West Region (Gujarat)";
  }
  if (b.includes("delhi") || a.includes("delhi") || b.includes("punjab") || b.includes("ncr")) {
    return "North Region (Delhi NCR)";
  }
  if (b.includes("bengaluru") || a.includes("bengaluru") || b.includes("karnataka")) {
    return "South Region (Karnataka)";
  }
  if (b.includes("hyderabad") || a.includes("hyderabad") || b.includes("telangana")) {
    return "South Region (Telangana)";
  }
  if (b.includes("chennai") || a.includes("chennai") || b.includes("tamil nadu")) {
    return "South Region (Tamil Nadu)";
  }
  if (b.includes("kolkata") || a.includes("kolkata") || b.includes("bengal")) {
    return "East Region (West Bengal)";
  }
  return "National Grid Region";
}

export type GraphicalDimensionTab =
  | "all"
  | "zone"
  | "region"
  | "area"
  | "branch"
  | "alert_type"
  | "date"
  | "timeline";

interface AlertsGraphicalAnalyticsProps {
  alerts: AnalyticsAlert[];
  selectedZone?: string;
  selectedBranch?: string;
  selectedRegion?: string;
  selectedArea?: string;
  selectedAlertType?: string;
  selectedDate?: string;
  onSelectZone?: (zone: string) => void;
  onSelectBranch?: (branch: string) => void;
  onSelectRegion?: (region: string) => void;
  onSelectArea?: (area: string) => void;
  onSelectAlertType?: (alertType: string) => void;
  onSelectDate?: (date: string) => void;
  onResetFilters?: () => void;
}

export function AlertsGraphicalAnalytics({
  alerts,
  selectedZone = "all",
  selectedBranch = "all",
  selectedRegion = "all",
  selectedArea = "all",
  selectedAlertType = "all",
  selectedDate = "all",
  onSelectZone,
  onSelectBranch,
  onSelectRegion,
  onSelectArea,
  onSelectAlertType,
  onSelectDate,
  onResetFilters,
}: AlertsGraphicalAnalyticsProps) {
  const [activeTab, setActiveTab] = useState<GraphicalDimensionTab>("all");
  const [isExpanded, setIsExpanded] = useState(false);
  const [timeRange, setTimeRange] = useState<"24h" | "7d" | "30d" | "all">("all");

  // Filter alerts by time range if selected
  const timeFilteredAlerts = useMemo(() => {
    if (timeRange === "all") return alerts;
    const now = Date.now();
    const rangeMs =
      timeRange === "24h"
        ? 24 * 3600 * 1000
        : timeRange === "7d"
        ? 7 * 24 * 3600 * 1000
        : 30 * 24 * 3600 * 1000;

    return alerts.filter((a) => {
      const t = new Date(a.lastDetectedAt || a.createdAt).getTime();
      return now - t <= rangeMs;
    });
  }, [alerts, timeRange]);

  // 1. ZONE-WISE BREAKDOWN
  const zoneChartData = useMemo(() => {
    const map = new Map<
      string,
      {
        name: string;
        total: number;
        p1: number;
        p2: number;
        p3: number;
        p4: number;
        converted: number;
        falseAlarms: number;
      }
    >();

    for (const alert of timeFilteredAlerts) {
      const zone = normalizeZone(alert);
      if (!map.has(zone)) {
        map.set(zone, {
          name: zone,
          total: 0,
          p1: 0,
          p2: 0,
          p3: 0,
          p4: 0,
          converted: 0,
          falseAlarms: 0,
        });
      }
      const item = map.get(zone)!;
      item.total += 1;
      if (alert.severity === "P1") item.p1 += 1;
      else if (alert.severity === "P2") item.p2 += 1;
      else if (alert.severity === "P3") item.p3 += 1;
      else item.p4 += 1;

      if (alert.incidentId || alert.incidentNumber) item.converted += 1;
      if (alert.status === "false_alarm") item.falseAlarms += 1;
    }

    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [timeFilteredAlerts]);

  // 2. REGION-WISE BREAKDOWN
  const regionChartData = useMemo(() => {
    const map = new Map<
      string,
      {
        name: string;
        total: number;
        active: number;
        converted: number;
        falseAlarms: number;
        p1: number;
        p2: number;
      }
    >();

    for (const alert of timeFilteredAlerts) {
      const reg = normalizeRegion(alert);
      if (!map.has(reg)) {
        map.set(reg, {
          name: reg,
          total: 0,
          active: 0,
          converted: 0,
          falseAlarms: 0,
          p1: 0,
          p2: 0,
        });
      }
      const item = map.get(reg)!;
      item.total += 1;
      if (!["resolved", "false_alarm", "suppressed"].includes(alert.status)) {
        item.active += 1;
      }
      if (alert.incidentId || alert.incidentNumber) item.converted += 1;
      if (alert.status === "false_alarm") item.falseAlarms += 1;
      if (alert.severity === "P1") item.p1 += 1;
      if (alert.severity === "P2") item.p2 += 1;
    }

    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [timeFilteredAlerts]);

  // 3. AREA-WISE BREAKDOWN
  const areaChartData = useMemo(() => {
    const map = new Map<
      string,
      {
        name: string;
        total: number;
        critical: number;
        converted: number;
        active: number;
      }
    >();

    for (const alert of timeFilteredAlerts) {
      const area = normalizeArea(alert);
      if (!map.has(area)) {
        map.set(area, {
          name: area,
          total: 0,
          critical: 0,
          converted: 0,
          active: 0,
        });
      }
      const item = map.get(area)!;
      item.total += 1;
      if (alert.severity === "P1" || alert.severity === "P2") item.critical += 1;
      if (alert.incidentId || alert.incidentNumber) item.converted += 1;
      if (!["resolved", "false_alarm", "suppressed"].includes(alert.status)) item.active += 1;
    }

    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [timeFilteredAlerts]);

  // 4. BRANCH-WISE BREAKDOWN (Top Branches Pareto)
  const branchChartData = useMemo(() => {
    const map = new Map<
      string,
      {
        name: string;
        total: number;
        p1: number;
        p2: number;
        p3: number;
        p4: number;
        converted: number;
        falseAlarms: number;
      }
    >();

    for (const alert of timeFilteredAlerts) {
      const branch = normalizeBranch(alert);
      if (!map.has(branch)) {
        map.set(branch, {
          name: branch,
          total: 0,
          p1: 0,
          p2: 0,
          p3: 0,
          p4: 0,
          converted: 0,
          falseAlarms: 0,
        });
      }
      const item = map.get(branch)!;
      item.total += 1;
      if (alert.severity === "P1") item.p1 += 1;
      else if (alert.severity === "P2") item.p2 += 1;
      else if (alert.severity === "P3") item.p3 += 1;
      else item.p4 += 1;

      if (alert.incidentId || alert.incidentNumber) item.converted += 1;
      if (alert.status === "false_alarm") item.falseAlarms += 1;
    }

    return Array.from(map.values()).sort((a, b) => b.total - a.total).slice(0, 10);
  }, [timeFilteredAlerts]);

  // 5. ALERT TYPE-WISE BREAKDOWN
  const alertTypeChartData = useMemo(() => {
    const map = new Map<
      string,
      {
        name: string;
        total: number;
        confidenceSum: number;
        falseAlarms: number;
        p1: number;
        p2: number;
      }
    >();

    for (const alert of timeFilteredAlerts) {
      const atype = normalizeAlertType(alert);
      if (!map.has(atype)) {
        map.set(atype, {
          name: atype,
          total: 0,
          confidenceSum: 0,
          falseAlarms: 0,
          p1: 0,
          p2: 0,
        });
      }
      const item = map.get(atype)!;
      item.total += 1;
      item.confidenceSum += Number(alert.confidence || 0.85);
      if (alert.status === "false_alarm") item.falseAlarms += 1;
      if (alert.severity === "P1") item.p1 += 1;
      if (alert.severity === "P2") item.p2 += 1;
    }

    return Array.from(map.values())
      .map((item) => ({
        ...item,
        avgConfidence: Math.round((item.confidenceSum / item.total) * 100),
      }))
      .sort((a, b) => b.total - a.total);
  }, [timeFilteredAlerts]);

  // 6. TIMELINE TREND (Last 24 hours / Hourly)
  const timelineChartData = useMemo(() => {
    const hours = 24;
    const now = new Date();
    const buckets: Array<{ hour: string; count: number; critical: number }> = [];

    for (let i = hours - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 3600 * 1000);
      const label = d.getHours().toString().padStart(2, "0") + ":00";
      buckets.push({ hour: label, count: 0, critical: 0 });
    }

    for (const alert of timeFilteredAlerts) {
      const alertTime = new Date(alert.lastDetectedAt || alert.createdAt);
      const diffHours = Math.floor((now.getTime() - alertTime.getTime()) / (3600 * 1000));
      if (diffHours >= 0 && diffHours < hours) {
        const bucketIndex = hours - 1 - diffHours;
        if (buckets[bucketIndex]) {
          buckets[bucketIndex].count += 1;
          if (alert.severity === "P1" || alert.severity === "P2") {
            buckets[bucketIndex].critical += 1;
          }
        }
      }
    }

    return buckets;
  }, [timeFilteredAlerts]);

  // 7. DATE-WISE BREAKDOWN
  const dateChartData = useMemo(() => {
    const map = new Map<
      string,
      {
        date: string;
        formattedDate: string;
        shortDate: string;
        total: number;
        p1: number;
        p2: number;
        p3: number;
        p4: number;
        critical: number;
        converted: number;
        falseAlarms: number;
        active: number;
      }
    >();

    for (const alert of timeFilteredAlerts) {
      const dateKey = normalizeAlertDate(alert);
      if (!map.has(dateKey)) {
        const display = formatDisplayDate(dateKey);
        const parts = display.split(",");
        const shortDate = parts[0] || dateKey;
        map.set(dateKey, {
          date: dateKey,
          formattedDate: display,
          shortDate,
          total: 0,
          p1: 0,
          p2: 0,
          p3: 0,
          p4: 0,
          critical: 0,
          converted: 0,
          falseAlarms: 0,
          active: 0,
        });
      }
      const item = map.get(dateKey)!;
      item.total += 1;
      if (alert.severity === "P1") {
        item.p1 += 1;
        item.critical += 1;
      } else if (alert.severity === "P2") {
        item.p2 += 1;
        item.critical += 1;
      } else if (alert.severity === "P3") {
        item.p3 += 1;
      } else {
        item.p4 += 1;
      }

      if (alert.incidentId || alert.incidentNumber) item.converted += 1;
      if (alert.status === "false_alarm") item.falseAlarms += 1;
      if (!["resolved", "false_alarm", "suppressed"].includes(alert.status)) item.active += 1;
    }

    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [timeFilteredAlerts]);

  // Date summary metrics
  const dateStats = useMemo(() => {
    const daysCount = dateChartData.length;
    if (daysCount === 0) return { daysCount: 0, peakDate: "N/A", peakCount: 0, avgDaily: 0, totalConverted: 0 };
    let peakDate = dateChartData[0]?.formattedDate || "N/A";
    let peakCount = 0;
    let sum = 0;
    let convertedSum = 0;
    for (const d of dateChartData) {
      sum += d.total;
      convertedSum += d.converted;
      if (d.total > peakCount) {
        peakCount = d.total;
        peakDate = d.formattedDate;
      }
    }
    return {
      daysCount,
      peakDate,
      peakCount,
      avgDaily: Math.round((sum / daysCount) * 10) / 10,
      totalConverted: convertedSum,
    };
  }, [dateChartData]);

  // Check if any filter is active
  const hasActiveFilter =
    selectedZone !== "all" ||
    selectedBranch !== "all" ||
    selectedRegion !== "all" ||
    selectedArea !== "all" ||
    selectedAlertType !== "all" ||
    selectedDate !== "all";

  // Custom Tooltip component for dark mode
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-900/95 border border-slate-700/80 p-3 rounded-xl shadow-2xl backdrop-blur-md text-xs space-y-1.5 min-w-[160px]">
          <div className="font-semibold text-slate-100 border-b border-slate-800 pb-1 flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-sky-400" />
            <span>{label || payload[0]?.name}</span>
          </div>
          {payload.map((entry: any, index: number) => (
            <div key={`entry-${index}`} className="flex justify-between items-center gap-4 text-slate-300">
              <span className="flex items-center gap-1.5 text-slate-400">
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: entry.color || entry.fill }} />
                <span>{entry.name || "Count"}:</span>
              </span>
              <span className="font-bold font-mono text-slate-100">{entry.value}</span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="rounded-2xl border border-slate-800/90 bg-gradient-to-b from-slate-900/90 via-slate-900/70 to-slate-950/90 backdrop-blur-xl shadow-2xl overflow-hidden transition-all duration-300">
      {/* Header bar */}
      <div className="p-4 sm:p-5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4 bg-slate-950/40">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-sky-500/20 to-indigo-500/20 border border-sky-500/30 flex items-center justify-center text-sky-400 shadow-inner">
            <BarChart3 className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-bold text-slate-100 tracking-tight">
                AI Alert Graphical Analytics
              </h2>
              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-sky-500/10 text-sky-400 border border-sky-500/30 uppercase tracking-wide">
                Live Interactive Visualizer
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Multi-dimensional distribution across Zones, Regions, Areas, Branches, and AI Alert Categories
            </p>
          </div>
        </div>

        {/* Right action tools */}
        <div className="flex items-center gap-2">
          {/* Time range selector */}
          <div className="flex items-center bg-slate-950/80 p-1 rounded-xl border border-slate-800 text-xs">
            {(["24h", "7d", "30d", "all"] as const).map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                  timeRange === range
                    ? "bg-sky-600 text-white font-semibold shadow"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {range === "24h"
                  ? "Last 24h"
                  : range === "7d"
                  ? "7 Days"
                  : range === "30d"
                  ? "30 Days"
                  : "All Alerts"}
              </button>
            ))}
          </div>

          {/* Expand toggle */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
            title={isExpanded ? "Collapse charts" : "Expand chart area"}
          >
            {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Dimension navigation tabs */}
      <div className="px-4 sm:px-5 pt-3 border-b border-slate-800/80 bg-slate-950/20 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-2 sm:pb-0">
          <button
            onClick={() => setActiveTab("all")}
            className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap ${
              activeTab === "all"
                ? "bg-sky-500/15 text-sky-300 border border-sky-500/30 shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
            }`}
          >
            <Layers className="h-3.5 w-3.5 text-sky-400" />
            <span>All Dimensions Matrix</span>
          </button>

          <button
            onClick={() => setActiveTab("zone")}
            className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap ${
              activeTab === "zone"
                ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
            }`}
          >
            <MapPin className="h-3.5 w-3.5 text-emerald-400" />
            <span>Zone-wise</span>
            <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-500/20 text-emerald-300">
              {zoneChartData.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("region")}
            className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap ${
              activeTab === "region"
                ? "bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
            }`}
          >
            <Globe2 className="h-3.5 w-3.5 text-indigo-400" />
            <span>Region-wise</span>
            <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-indigo-500/20 text-indigo-300">
              {regionChartData.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("area")}
            className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap ${
              activeTab === "area"
                ? "bg-purple-500/15 text-purple-300 border border-purple-500/30 shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
            }`}
          >
            <Building2 className="h-3.5 w-3.5 text-purple-400" />
            <span>Area-wise</span>
            <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-purple-500/20 text-purple-300">
              {areaChartData.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("branch")}
            className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap ${
              activeTab === "branch"
                ? "bg-amber-500/15 text-amber-300 border border-amber-500/30 shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
            }`}
          >
            <Building2 className="h-3.5 w-3.5 text-amber-400" />
            <span>Branch-wise</span>
            <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500/20 text-amber-300">
              {branchChartData.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("alert_type")}
            className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap ${
              activeTab === "alert_type"
                ? "bg-rose-500/15 text-rose-300 border border-rose-500/30 shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
            }`}
          >
            <AlertTriangle className="h-3.5 w-3.5 text-rose-400" />
            <span>Alert Type-wise</span>
            <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-rose-500/20 text-rose-300">
              {alertTypeChartData.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("date")}
            className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap ${
              activeTab === "date"
                ? "bg-blue-500/15 text-blue-300 border border-blue-500/30 shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
            }`}
          >
            <CalendarDays className="h-3.5 w-3.5 text-blue-400" />
            <span>Date-wise</span>
            <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-blue-500/20 text-blue-300">
              {dateChartData.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("timeline")}
            className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap ${
              activeTab === "timeline"
                ? "bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
            }`}
          >
            <TrendingUp className="h-3.5 w-3.5 text-cyan-400" />
            <span>24h Timeline</span>
          </button>
        </div>

        {/* Active cross-filter badges */}
        {hasActiveFilter && (
          <div className="flex items-center gap-1.5 pb-2 sm:pb-0">
            <span className="text-[11px] text-slate-400 font-medium">Active Filter:</span>
            {selectedZone !== "all" && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Zone: {selectedZone}
              </span>
            )}
            {selectedRegion !== "all" && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                Region: {selectedRegion}
              </span>
            )}
            {selectedArea !== "all" && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] bg-purple-500/20 text-purple-300 border border-purple-500/30">
                Area: {selectedArea}
              </span>
            )}
            {selectedBranch !== "all" && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] bg-amber-500/20 text-amber-300 border border-amber-500/30">
                Branch: {selectedBranch}
              </span>
            )}
            {selectedAlertType !== "all" && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] bg-rose-500/20 text-rose-300 border border-rose-500/30">
                Type: {selectedAlertType}
              </span>
            )}
            {selectedDate !== "all" && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] bg-blue-500/20 text-blue-300 border border-blue-500/30">
                Date: {formatDisplayDate(selectedDate)}
              </span>
            )}
            {onResetFilters && (
              <button
                onClick={onResetFilters}
                className="p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
                title="Reset all filters"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Main Chart Body */}
      <div className="p-4 sm:p-6">
        {/* TAB 1: ALL DIMENSIONS MATRIX */}
        {activeTab === "all" && (
          <div className="space-y-6">
            {/* Top row: 3 Primary Dimensional Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {/* 1. Zone-wise summary */}
              <div className="p-4 rounded-xl border border-slate-800/80 bg-slate-900/70 shadow-lg flex flex-col justify-between">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-emerald-400" />
                    <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                      Zone-wise Distribution
                    </h3>
                  </div>
                  <button
                    onClick={() => setActiveTab("zone")}
                    className="text-[11px] text-emerald-400 hover:underline font-semibold"
                  >
                    View All →
                  </button>
                </div>
                <div className="h-[220px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={zoneChartData.slice(0, 5)}
                      layout="vertical"
                      margin={{ top: 5, right: 10, left: 10, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} horizontal={false} />
                      <XAxis type="number" stroke="#64748b" tick={{ fill: "#94a3b8", fontSize: 10 }} />
                      <YAxis
                        type="category"
                        dataKey="name"
                        stroke="#64748b"
                        tick={{ fill: "#94a3b8", fontSize: 10 }}
                        width={90}
                        tickFormatter={(val) => (val.length > 12 ? val.slice(0, 12) + "…" : val)}
                      />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar
                        dataKey="total"
                        name="Alerts"
                        fill="#10b981"
                        radius={[0, 6, 6, 0]}
                        onClick={(data: any) => {
                          if (data?.name && onSelectZone) onSelectZone(String(data.name));
                        }}
                        className="cursor-pointer hover:opacity-80"
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
                  <span>Top Zone: <strong className="text-emerald-300">{zoneChartData[0]?.name || "N/A"}</strong></span>
                  <span>{zoneChartData[0]?.total || 0} alerts</span>
                </div>
              </div>

              {/* 2. Region-wise summary */}
              <div className="p-4 rounded-xl border border-slate-800/80 bg-slate-900/70 shadow-lg flex flex-col justify-between">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Globe2 className="h-4 w-4 text-indigo-400" />
                    <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                      Region-wise Share
                    </h3>
                  </div>
                  <button
                    onClick={() => setActiveTab("region")}
                    className="text-[11px] text-indigo-400 hover:underline font-semibold"
                  >
                    View All →
                  </button>
                </div>
                <div className="h-[220px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={regionChartData}
                        dataKey="total"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={75}
                        paddingAngle={3}
                        onClick={(entry: any) => {
                          if (entry?.name && onSelectRegion) onSelectRegion(String(entry.name));
                        }}
                        className="cursor-pointer"
                      >
                        {regionChartData.map((_, index) => (
                          <Cell key={`reg-${index}`} fill={PIE_PALETTE[index % PIE_PALETTE.length]} />
                        ))}
                      </Pie>
                      <Tooltip content={<CustomTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
                  <span>Top Region: <strong className="text-indigo-300">{regionChartData[0]?.name || "N/A"}</strong></span>
                  <span>{regionChartData[0]?.total || 0} alerts</span>
                </div>
              </div>

              {/* 3. Alert Type-wise summary */}
              <div className="p-4 rounded-xl border border-slate-800/80 bg-slate-900/70 shadow-lg flex flex-col justify-between">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-rose-400" />
                    <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                      Alert Type Distribution
                    </h3>
                  </div>
                  <button
                    onClick={() => setActiveTab("alert_type")}
                    className="text-[11px] text-rose-400 hover:underline font-semibold"
                  >
                    View All →
                  </button>
                </div>
                <div className="h-[220px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={alertTypeChartData.slice(0, 6)}
                        dataKey="total"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={75}
                        onClick={(entry: any) => {
                          if (entry?.name && onSelectAlertType) onSelectAlertType(String(entry.name));
                        }}
                        className="cursor-pointer"
                      >
                        {alertTypeChartData.map((_, index) => (
                          <Cell key={`type-${index}`} fill={PIE_PALETTE[(index + 2) % PIE_PALETTE.length]} />
                        ))}
                      </Pie>
                      <Tooltip content={<CustomTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
                  <span>Primary Threat: <strong className="text-rose-300">{alertTypeChartData[0]?.name || "N/A"}</strong></span>
                  <span>{alertTypeChartData[0]?.total || 0} detections</span>
                </div>
              </div>
            </div>

            {/* Bottom row: Area-wise & Branch-wise Comparison */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Area-wise cluster bar chart */}
              <div className="p-4 rounded-xl border border-slate-800/80 bg-slate-900/70 shadow-lg">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-purple-400" />
                    <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                      Area / District Clusters (Alert Volume)
                    </h3>
                  </div>
                  <button
                    onClick={() => setActiveTab("area")}
                    className="text-[11px] text-purple-400 hover:underline font-semibold"
                  >
                    Details →
                  </button>
                </div>
                <div className="h-[240px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={areaChartData.slice(0, 6)} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
                      <XAxis
                        dataKey="name"
                        stroke="#64748b"
                        tick={{ fill: "#94a3b8", fontSize: 9 }}
                        interval={0}
                        angle={-15}
                        textAnchor="end"
                        tickFormatter={(v) => (v.length > 12 ? v.slice(0, 12) + "…" : v)}
                      />
                      <YAxis stroke="#64748b" tick={{ fill: "#94a3b8", fontSize: 10 }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar
                        dataKey="total"
                        name="Total Alerts"
                        fill="#a855f7"
                        radius={[6, 6, 0, 0]}
                        onClick={(data: any) => {
                          if (data?.name && onSelectArea) onSelectArea(String(data.name));
                        }}
                        className="cursor-pointer"
                      />
                      <Bar dataKey="critical" name="Critical (P1/P2)" fill="#f43f5e" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Branch-wise Pareto Ranking */}
              <div className="p-4 rounded-xl border border-slate-800/80 bg-slate-900/70 shadow-lg">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-amber-400" />
                    <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                      Top Alerted Branches (Pareto)
                    </h3>
                  </div>
                  <button
                    onClick={() => setActiveTab("branch")}
                    className="text-[11px] text-amber-400 hover:underline font-semibold"
                  >
                    Details →
                  </button>
                </div>
                <div className="h-[240px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={branchChartData.slice(0, 6)} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
                      <XAxis
                        dataKey="name"
                        stroke="#64748b"
                        tick={{ fill: "#94a3b8", fontSize: 9 }}
                        interval={0}
                        angle={-15}
                        textAnchor="end"
                        tickFormatter={(v) => (v.length > 12 ? v.slice(0, 12) + "…" : v)}
                      />
                      <YAxis stroke="#64748b" tick={{ fill: "#94a3b8", fontSize: 10 }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar
                        dataKey="p1"
                        stackId="a"
                        name="P1 Critical"
                        fill={COLORS.p1}
                        onClick={(data: any) => {
                          if (data?.name && onSelectBranch) onSelectBranch(String(data.name));
                        }}
                        className="cursor-pointer"
                      />
                      <Bar
                        dataKey="p2"
                        stackId="a"
                        name="P2 High"
                        fill={COLORS.p2}
                        onClick={(data: any) => {
                          if (data?.name && onSelectBranch) onSelectBranch(String(data.name));
                        }}
                        className="cursor-pointer"
                      />
                      <Bar
                        dataKey="p3"
                        stackId="a"
                        name="P3 Medium"
                        fill={COLORS.p3}
                        onClick={(data: any) => {
                          if (data?.name && onSelectBranch) onSelectBranch(String(data.name));
                        }}
                        className="cursor-pointer"
                      />
                      <Bar
                        dataKey="p4"
                        stackId="a"
                        name="P4 Low"
                        fill={COLORS.p4}
                        radius={[6, 6, 0, 0]}
                        onClick={(data: any) => {
                          if (data?.name && onSelectBranch) onSelectBranch(String(data.name));
                        }}
                        className="cursor-pointer"
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Date-wise Daily Volume & Risk Trajectory (Matrix View) */}
            <div className="p-4 rounded-xl border border-slate-800/80 bg-slate-900/70 shadow-lg">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-blue-400" />
                  <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                    Date-wise Daily Volume & Critical Threat Trajectory
                  </h3>
                </div>
                <button
                  onClick={() => setActiveTab("date")}
                  className="text-[11px] text-blue-400 hover:underline font-semibold"
                >
                  Date Details →
                </button>
              </div>
              <div className="h-[180px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dateChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="matrixDateVolumeGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0} />
                      </linearGradient>
                      <linearGradient id="matrixDateCritGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#f43f5e" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
                    <XAxis
                      dataKey="shortDate"
                      stroke="#64748b"
                      tick={{ fill: "#94a3b8", fontSize: 10 }}
                    />
                    <YAxis stroke="#64748b" tick={{ fill: "#94a3b8", fontSize: 10 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="total"
                      name="Total Alerts"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      fill="url(#matrixDateVolumeGrad)"
                    />
                    <Area
                      type="monotone"
                      dataKey="critical"
                      name="Critical P1/P2"
                      stroke="#f43f5e"
                      strokeWidth={2}
                      fill="url(#matrixDateCritGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* 24-Hour Velocity Trend */}
            <div className="p-4 rounded-xl border border-slate-800/80 bg-slate-900/70 shadow-lg">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-cyan-400" />
                  <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                    24-Hour AI Alert Velocity & Peak Incident Surge
                  </h3>
                </div>
                <span className="text-[11px] text-slate-400">Hourly detection timeline</span>
              </div>
              <div className="h-[180px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={timelineChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="alertVelocityGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.0} />
                      </linearGradient>
                      <linearGradient id="criticalVelocityGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#f43f5e" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
                    <XAxis dataKey="hour" stroke="#64748b" tick={{ fill: "#94a3b8", fontSize: 10 }} />
                    <YAxis stroke="#64748b" tick={{ fill: "#94a3b8", fontSize: 10 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="count"
                      name="Total Alerts"
                      stroke="#38bdf8"
                      strokeWidth={2}
                      fill="url(#alertVelocityGrad)"
                    />
                    <Area
                      type="monotone"
                      dataKey="critical"
                      name="Critical P1/P2"
                      stroke="#f43f5e"
                      strokeWidth={2}
                      fill="url(#criticalVelocityGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: ZONE-WISE GRAPHICAL ANALYTICS */}
        {activeTab === "zone" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Main Zone Bar Chart */}
              <div className="lg:col-span-2 p-5 rounded-xl border border-slate-800 bg-slate-900/80 shadow-xl">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-emerald-400" />
                      <span>Surveillance Zone Alert Volume & Severity Breakdown</span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Click any zone bar to isolate alerts occurring in that physical security zone
                    </p>
                  </div>
                  <span className="text-xs text-emerald-400 font-mono font-bold">
                    {zoneChartData.reduce((acc, z) => acc + z.total, 0)} Total Alerts
                  </span>
                </div>
                <div className="h-[340px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={zoneChartData}
                      layout="vertical"
                      margin={{ top: 10, right: 20, left: 30, bottom: 10 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} horizontal={false} />
                      <XAxis type="number" stroke="#64748b" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                      <YAxis
                        type="category"
                        dataKey="name"
                        stroke="#64748b"
                        tick={{ fill: "#cbd5e1", fontSize: 11, fontWeight: 500 }}
                        width={140}
                      />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend wrapperStyle={{ paddingTop: "10px", fontSize: "12px" }} />
                      <Bar
                        dataKey="p1"
                        stackId="zoneStack"
                        name="P1 Critical"
                        fill={COLORS.p1}
                        onClick={(data: any) => {
                          if (data?.name && onSelectZone) onSelectZone(String(data.name));
                        }}
                        className="cursor-pointer hover:opacity-80"
                      />
                      <Bar
                        dataKey="p2"
                        stackId="zoneStack"
                        name="P2 High"
                        fill={COLORS.p2}
                        onClick={(data: any) => {
                          if (data?.name && onSelectZone) onSelectZone(String(data.name));
                        }}
                        className="cursor-pointer hover:opacity-80"
                      />
                      <Bar
                        dataKey="p3"
                        stackId="zoneStack"
                        name="P3 Medium"
                        fill={COLORS.p3}
                        onClick={(data: any) => {
                          if (data?.name && onSelectZone) onSelectZone(String(data.name));
                        }}
                        className="cursor-pointer hover:opacity-80"
                      />
                      <Bar
                        dataKey="p4"
                        stackId="zoneStack"
                        name="P4 Low"
                        fill={COLORS.p4}
                        radius={[0, 6, 6, 0]}
                        onClick={(data: any) => {
                          if (data?.name && onSelectZone) onSelectZone(String(data.name));
                        }}
                        className="cursor-pointer hover:opacity-80"
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Zone Share & Criticality Ranking */}
              <div className="p-5 rounded-xl border border-slate-800 bg-slate-900/80 shadow-xl flex flex-col justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-100 mb-1 flex items-center gap-2">
                    <PieChartIcon className="h-4 w-4 text-emerald-400" />
                    <span>Zone Proportions</span>
                  </h3>
                  <p className="text-xs text-slate-400 mb-4">Relative frequency across camera detection zones</p>
                  <div className="h-[200px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={zoneChartData}
                          dataKey="total"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={45}
                          outerRadius={75}
                          paddingAngle={3}
                          onClick={(entry: any) => {
                            if (entry?.name && onSelectZone) onSelectZone(String(entry.name));
                          }}
                          className="cursor-pointer"
                        >
                          {zoneChartData.map((_, index) => (
                            <Cell key={`zpie-${index}`} fill={PIE_PALETTE[index % PIE_PALETTE.length]} />
                          ))}
                        </Pie>
                        <Tooltip content={<CustomTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Zone Quick Cards */}
                <div className="space-y-2 mt-4 pt-3 border-t border-slate-800">
                  <div className="text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">
                    Highest Risk Security Zones
                  </div>
                  {zoneChartData.slice(0, 3).map((z, idx) => (
                    <button
                      key={z.name}
                      onClick={() => onSelectZone && onSelectZone(z.name)}
                      className="w-full p-2.5 rounded-lg bg-slate-950/60 hover:bg-slate-800/80 border border-slate-800 flex items-center justify-between text-xs transition-all text-left group"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-slate-500 font-bold">#{idx + 1}</span>
                        <span className="font-medium text-slate-200 group-hover:text-emerald-300">
                          {z.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {z.p1 > 0 && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-rose-500/20 text-rose-300 font-bold">
                            {z.p1} P1
                          </span>
                        )}
                        <span className="font-bold text-slate-100 font-mono">{z.total}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: REGION-WISE GRAPHICAL ANALYTICS */}
        {activeTab === "region" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Region Bar Chart */}
              <div className="lg:col-span-2 p-5 rounded-xl border border-slate-800 bg-slate-900/80 shadow-xl">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                      <Globe2 className="h-4 w-4 text-indigo-400" />
                      <span>Regional Alert Volumes & Incident Conversion Ratios</span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Comparing total AI detections vs verified incidents converted across regions
                    </p>
                  </div>
                </div>
                <div className="h-[340px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={regionChartData} margin={{ top: 15, right: 20, left: 0, bottom: 25 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
                      <XAxis
                        dataKey="name"
                        stroke="#64748b"
                        tick={{ fill: "#cbd5e1", fontSize: 11 }}
                        interval={0}
                        angle={-15}
                        textAnchor="end"
                      />
                      <YAxis stroke="#64748b" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend wrapperStyle={{ paddingTop: "15px", fontSize: "12px" }} />
                      <Bar
                        dataKey="total"
                        name="Total Alerts"
                        fill="#6366f1"
                        radius={[6, 6, 0, 0]}
                        onClick={(data: any) => {
                          if (data?.name && onSelectRegion) onSelectRegion(String(data.name));
                        }}
                        className="cursor-pointer"
                      />
                      <Bar
                        dataKey="active"
                        name="Active Unresolved"
                        fill="#38bdf8"
                        radius={[6, 6, 0, 0]}
                        onClick={(data: any) => {
                          if (data?.name && onSelectRegion) onSelectRegion(String(data.name));
                        }}
                        className="cursor-pointer"
                      />
                      <Bar
                        dataKey="converted"
                        name="Converted Incidents"
                        fill="#10b981"
                        radius={[6, 6, 0, 0]}
                        onClick={(data: any) => {
                          if (data?.name && onSelectRegion) onSelectRegion(String(data.name));
                        }}
                        className="cursor-pointer"
                      />
                      <Bar
                        dataKey="falseAlarms"
                        name="False Alarms"
                        fill="#f43f5e"
                        radius={[6, 6, 0, 0]}
                        onClick={(data: any) => {
                          if (data?.name && onSelectRegion) onSelectRegion(String(data.name));
                        }}
                        className="cursor-pointer"
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Regional Donut & Conversion Rate Cards */}
              <div className="p-5 rounded-xl border border-slate-800 bg-slate-900/80 shadow-xl flex flex-col justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-100 mb-1 flex items-center gap-2">
                    <PieChartIcon className="h-4 w-4 text-indigo-400" />
                    <span>Regional Share</span>
                  </h3>
                  <div className="h-[200px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={regionChartData}
                          dataKey="total"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={80}
                          paddingAngle={3}
                          onClick={(entry: any) => {
                            if (entry?.name && onSelectRegion) onSelectRegion(String(entry.name));
                          }}
                          className="cursor-pointer"
                        >
                          {regionChartData.map((_, index) => (
                            <Cell key={`regp-${index}`} fill={PIE_PALETTE[index % PIE_PALETTE.length]} />
                          ))}
                        </Pie>
                        <Tooltip content={<CustomTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="space-y-2.5 mt-4 pt-3 border-t border-slate-800">
                  <div className="text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wider">
                    Regional Conversion Efficiency
                  </div>
                  {regionChartData.map((r) => {
                    const convRate = r.total > 0 ? Math.round((r.converted / r.total) * 100) : 0;
                    return (
                      <div
                        key={r.name}
                        onClick={() => onSelectRegion && onSelectRegion(r.name)}
                        className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 text-xs hover:border-indigo-500/50 cursor-pointer transition-all"
                      >
                        <div className="flex items-center justify-between font-medium text-slate-200">
                          <span>{r.name}</span>
                          <span className="font-mono text-indigo-300 font-bold">{convRate}% converted</span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-800 rounded-full mt-1.5 overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-indigo-500 to-emerald-400 rounded-full"
                            style={{ width: `${convRate}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: AREA-WISE GRAPHICAL ANALYTICS */}
        {activeTab === "area" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Area Bar Chart */}
              <div className="lg:col-span-2 p-5 rounded-xl border border-slate-800 bg-slate-900/80 shadow-xl">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-purple-400" />
                      <span>City & District Cluster Area Distribution</span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Visualizing alert frequency and critical density across metropolitan operational areas
                    </p>
                  </div>
                  <span className="text-xs text-purple-400 font-mono font-bold">
                    {areaChartData.length} Active Areas
                  </span>
                </div>
                <div className="h-[340px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={areaChartData} margin={{ top: 15, right: 20, left: 0, bottom: 25 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
                      <XAxis
                        dataKey="name"
                        stroke="#64748b"
                        tick={{ fill: "#cbd5e1", fontSize: 10 }}
                        interval={0}
                        angle={-20}
                        textAnchor="end"
                        tickFormatter={(v) => (v.length > 15 ? v.slice(0, 15) + "…" : v)}
                      />
                      <YAxis stroke="#64748b" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend wrapperStyle={{ paddingTop: "15px", fontSize: "12px" }} />
                      <Bar
                        dataKey="total"
                        name="Total Alerts"
                        fill="#a855f7"
                        radius={[6, 6, 0, 0]}
                        onClick={(data: any) => {
                          if (data?.name && onSelectArea) onSelectArea(String(data.name));
                        }}
                        className="cursor-pointer"
                      />
                      <Bar
                        dataKey="critical"
                        name="Critical P1/P2"
                        fill="#f43f5e"
                        radius={[6, 6, 0, 0]}
                        onClick={(data: any) => {
                          if (data?.name && onSelectArea) onSelectArea(String(data.name));
                        }}
                        className="cursor-pointer"
                      />
                      <Bar
                        dataKey="converted"
                        name="Incidents Created"
                        fill="#10b981"
                        radius={[6, 6, 0, 0]}
                        onClick={(data: any) => {
                          if (data?.name && onSelectArea) onSelectArea(String(data.name));
                        }}
                        className="cursor-pointer"
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Area Hotspots Table */}
              <div className="p-5 rounded-xl border border-slate-800 bg-slate-900/80 shadow-xl flex flex-col justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-100 mb-1 flex items-center gap-2">
                    <Activity className="h-4 w-4 text-purple-400" />
                    <span>Area Threat Hotspots</span>
                  </h3>
                  <p className="text-xs text-slate-400 mb-4">Ranked by alert severity density</p>
                  <div className="space-y-2">
                    {areaChartData.map((area) => (
                      <div
                        key={area.name}
                        onClick={() => onSelectArea && onSelectArea(area.name)}
                        className="p-3 rounded-xl bg-slate-950/60 hover:bg-slate-850 border border-slate-800/80 hover:border-purple-500/40 cursor-pointer transition-all flex items-center justify-between"
                      >
                        <div>
                          <div className="text-xs font-semibold text-slate-200">{area.name}</div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            {area.active} active · {area.converted} incidents
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-bold text-purple-300 font-mono">{area.total}</div>
                          {area.critical > 0 && (
                            <span className="text-[10px] text-rose-400 font-semibold">
                              {area.critical} critical
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: BRANCH-WISE GRAPHICAL ANALYTICS */}
        {activeTab === "branch" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Top Branches Bar Chart */}
              <div className="lg:col-span-2 p-5 rounded-xl border border-slate-800 bg-slate-900/80 shadow-xl">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-amber-400" />
                      <span>Top Branches by Alert Volume (Pareto Stacked Breakdown)</span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Severity breakdown across highest-activity branches in the fleet
                    </p>
                  </div>
                </div>
                <div className="h-[340px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={branchChartData} margin={{ top: 15, right: 20, left: 0, bottom: 30 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
                      <XAxis
                        dataKey="name"
                        stroke="#64748b"
                        tick={{ fill: "#cbd5e1", fontSize: 10 }}
                        interval={0}
                        angle={-20}
                        textAnchor="end"
                        tickFormatter={(v) => (v.length > 14 ? v.slice(0, 14) + "…" : v)}
                      />
                      <YAxis stroke="#64748b" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend wrapperStyle={{ paddingTop: "15px", fontSize: "12px" }} />
                      <Bar
                        dataKey="p1"
                        stackId="bStack"
                        name="P1 Critical"
                        fill={COLORS.p1}
                        onClick={(data: any) => {
                          if (data?.name && onSelectBranch) onSelectBranch(String(data.name));
                        }}
                        className="cursor-pointer"
                      />
                      <Bar
                        dataKey="p2"
                        stackId="bStack"
                        name="P2 High"
                        fill={COLORS.p2}
                        onClick={(data: any) => {
                          if (data?.name && onSelectBranch) onSelectBranch(String(data.name));
                        }}
                        className="cursor-pointer"
                      />
                      <Bar
                        dataKey="p3"
                        stackId="bStack"
                        name="P3 Medium"
                        fill={COLORS.p3}
                        onClick={(data: any) => {
                          if (data?.name && onSelectBranch) onSelectBranch(String(data.name));
                        }}
                        className="cursor-pointer"
                      />
                      <Bar
                        dataKey="p4"
                        stackId="bStack"
                        name="P4 Low"
                        fill={COLORS.p4}
                        radius={[6, 6, 0, 0]}
                        onClick={(data: any) => {
                          if (data?.name && onSelectBranch) onSelectBranch(String(data.name));
                        }}
                        className="cursor-pointer"
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Branch Incident vs False Alarm Chart */}
              <div className="p-5 rounded-xl border border-slate-800 bg-slate-900/80 shadow-xl flex flex-col justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-100 mb-1 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    <span>Branch Conversion vs False Alarms</span>
                  </h3>
                  <p className="text-xs text-slate-400 mb-4">Audited accuracy per branch</p>
                  <div className="h-[220px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={branchChartData.slice(0, 5)} layout="vertical" margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} horizontal={false} />
                        <XAxis type="number" stroke="#64748b" tick={{ fill: "#94a3b8", fontSize: 10 }} />
                        <YAxis
                          type="category"
                          dataKey="name"
                          stroke="#64748b"
                          tick={{ fill: "#94a3b8", fontSize: 9 }}
                          width={95}
                          tickFormatter={(val) => (val.length > 10 ? val.slice(0, 10) + "…" : val)}
                        />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend wrapperStyle={{ fontSize: "11px" }} />
                        <Bar dataKey="converted" name="Incidents" fill="#10b981" radius={[0, 4, 4, 0]} />
                        <Bar dataKey="falseAlarms" name="False Alarms" fill="#f43f5e" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="space-y-2 mt-4 pt-3 border-t border-slate-800 text-xs">
                  <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    Quick Filter By Branch
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {branchChartData.slice(0, 5).map((b) => (
                      <button
                        key={b.name}
                        onClick={() => onSelectBranch && onSelectBranch(b.name)}
                        className="px-2.5 py-1 rounded-lg text-xs bg-slate-950/80 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-colors"
                      >
                        {b.name.split("-")[0].trim()} ({b.total})
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 6: ALERT TYPE-WISE GRAPHICAL ANALYTICS */}
        {activeTab === "alert_type" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Alert Type Donut Chart */}
              <div className="p-5 rounded-xl border border-slate-800 bg-slate-900/80 shadow-xl flex flex-col justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-100 mb-1 flex items-center gap-2">
                    <PieChartIcon className="h-4 w-4 text-rose-400" />
                    <span>AI Detection Category Share</span>
                  </h3>
                  <p className="text-xs text-slate-400 mb-4">Proportion of threat events across cameras</p>
                  <div className="h-[250px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={alertTypeChartData}
                          dataKey="total"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={55}
                          outerRadius={95}
                          paddingAngle={2}
                          onClick={(entry: any) => {
                            if (entry?.name && onSelectAlertType) onSelectAlertType(String(entry.name));
                          }}
                          className="cursor-pointer"
                        >
                          {alertTypeChartData.map((_, index) => (
                            <Cell key={`atp-${index}`} fill={PIE_PALETTE[index % PIE_PALETTE.length]} />
                          ))}
                        </Pie>
                        <Tooltip content={<CustomTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="text-center pt-2 text-xs text-slate-400 border-t border-slate-800">
                  Total of <strong className="text-slate-200">{alertTypeChartData.length}</strong> unique AI detection types active
                </div>
              </div>

              {/* Alert Type Bar Chart with Confidence & Criticality */}
              <div className="lg:col-span-2 p-5 rounded-xl border border-slate-800 bg-slate-900/80 shadow-xl">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-rose-400" />
                      <span>Alert Types Ranked by Frequency & P1/P2 Criticality</span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Click any category bar to filter the active alert stream
                    </p>
                  </div>
                </div>
                <div className="h-[340px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={alertTypeChartData}
                      layout="vertical"
                      margin={{ top: 10, right: 20, left: 30, bottom: 10 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} horizontal={false} />
                      <XAxis type="number" stroke="#64748b" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                      <YAxis
                        type="category"
                        dataKey="name"
                        stroke="#64748b"
                        tick={{ fill: "#cbd5e1", fontSize: 11 }}
                        width={160}
                        tickFormatter={(v) => (v.length > 20 ? v.slice(0, 20) + "…" : v)}
                      />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend wrapperStyle={{ paddingTop: "10px", fontSize: "12px" }} />
                      <Bar
                        dataKey="total"
                        name="Total Alerts"
                        fill="#38bdf8"
                        radius={[0, 4, 4, 0]}
                        onClick={(data: any) => {
                          if (data?.name && onSelectAlertType) onSelectAlertType(String(data.name));
                        }}
                        className="cursor-pointer"
                      />
                      <Bar
                        dataKey="p1"
                        name="Critical P1"
                        fill={COLORS.p1}
                        radius={[0, 4, 4, 0]}
                        onClick={(data: any) => {
                          if (data?.name && onSelectAlertType) onSelectAlertType(String(data.name));
                        }}
                        className="cursor-pointer"
                      />
                      <Bar
                        dataKey="falseAlarms"
                        name="False Alarms"
                        fill="#64748b"
                        radius={[0, 4, 4, 0]}
                        onClick={(data: any) => {
                          if (data?.name && onSelectAlertType) onSelectAlertType(String(data.name));
                        }}
                        className="cursor-pointer"
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* AI Confidence & False Alarm Rate Breakdown */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
              {alertTypeChartData.slice(0, 6).map((item) => (
                <button
                  key={item.name}
                  onClick={() => onSelectAlertType && onSelectAlertType(item.name)}
                  className="p-3 rounded-xl border border-slate-800 bg-slate-900/60 hover:bg-slate-800/80 text-left transition-all group"
                >
                  <div className="text-[11px] font-semibold text-slate-300 group-hover:text-sky-300 truncate">
                    {item.name}
                  </div>
                  <div className="text-lg font-bold text-slate-100 mt-1 font-mono">{item.total}</div>
                  <div className="flex items-center justify-between text-[10px] text-slate-500 mt-0.5">
                    <span>Conf: {item.avgConfidence}%</span>
                    <span>{item.p1 > 0 ? `${item.p1} P1` : "Normal"}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* TAB 6: DATE-WISE GRAPHICAL ANALYTICS */}
        {activeTab === "date" && (
          <div className="space-y-6">
            {/* Top KPI Strip for Date Analysis */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/70">
                <div className="flex items-center justify-between text-slate-400 text-xs">
                  <span>Monitored Dates</span>
                  <CalendarDays className="h-4 w-4 text-blue-400" />
                </div>
                <div className="text-2xl font-bold text-slate-100 mt-1 font-mono">
                  {dateStats.daysCount}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">Active detection dates</div>
              </div>

              <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/70">
                <div className="flex items-center justify-between text-slate-400 text-xs">
                  <span>Peak Alert Date</span>
                  <AlertTriangle className="h-4 w-4 text-rose-400" />
                </div>
                <div className="text-xl font-bold text-rose-300 mt-1 truncate">
                  {dateStats.peakCount} <span className="text-xs font-normal text-slate-400">alerts</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5 truncate">{dateStats.peakDate}</div>
              </div>

              <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/70">
                <div className="flex items-center justify-between text-slate-400 text-xs">
                  <span>Daily Avg Velocity</span>
                  <TrendingUp className="h-4 w-4 text-sky-400" />
                </div>
                <div className="text-2xl font-bold text-sky-300 mt-1 font-mono">
                  {dateStats.avgDaily}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">Alerts per day average</div>
              </div>

              <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/70">
                <div className="flex items-center justify-between text-slate-400 text-xs">
                  <span>Incidents Converted</span>
                  <ShieldCheck className="h-4 w-4 text-emerald-400" />
                </div>
                <div className="text-2xl font-bold text-emerald-300 mt-1 font-mono">
                  {dateStats.totalConverted}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">Escalated to investigation</div>
              </div>
            </div>

            {/* Date-wise Charts Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Chart 1: Daily Alert Volume & Critical Threat Trajectory */}
              <div className="p-5 rounded-xl border border-slate-800 bg-slate-900/80 shadow-xl">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                      <CalendarDays className="h-4 w-4 text-blue-400" />
                      <span>Daily Alert Volume & Critical P1/P2 Trajectory</span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Click any bar to filter feed specifically to that calendar day
                    </p>
                  </div>
                  {selectedDate !== "all" && (
                    <button
                      onClick={() => onSelectDate && onSelectDate("all")}
                      className="px-2 py-1 rounded-md text-[11px] font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30 hover:bg-blue-500/30"
                    >
                      Clear Date Filter ✕
                    </button>
                  )}
                </div>
                <div className="h-[280px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dateChartData} margin={{ top: 10, right: 10, left: -15, bottom: 25 }}>
                      <defs>
                        <linearGradient id="dailyBarGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.9} />
                          <stop offset="100%" stopColor="#1d4ed8" stopOpacity={0.7} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
                      <XAxis
                        dataKey="shortDate"
                        stroke="#64748b"
                        tick={{ fill: "#94a3b8", fontSize: 10 }}
                        angle={-20}
                        textAnchor="end"
                      />
                      <YAxis stroke="#64748b" tick={{ fill: "#94a3b8", fontSize: 10 }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend wrapperStyle={{ paddingTop: "10px", fontSize: "11px" }} />
                      <Bar
                        dataKey="total"
                        name="Total Alerts"
                        fill="url(#dailyBarGrad)"
                        radius={[6, 6, 0, 0]}
                        onClick={(data: any) => {
                          if (data?.date && onSelectDate) onSelectDate(String(data.date));
                        }}
                        className="cursor-pointer hover:opacity-80"
                      />
                      <Bar
                        dataKey="critical"
                        name="Critical (P1/P2)"
                        fill="#f43f5e"
                        radius={[6, 6, 0, 0]}
                        onClick={(data: any) => {
                          if (data?.date && onSelectDate) onSelectDate(String(data.date));
                        }}
                        className="cursor-pointer hover:opacity-80"
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Chart 2: Daily Stacked Severity Distribution */}
              <div className="p-5 rounded-xl border border-slate-800 bg-slate-900/80 shadow-xl">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                      <Layers className="h-4 w-4 text-emerald-400" />
                      <span>Daily Severity Mix (P1 Critical to P4 Low)</span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Proportional risk distribution per monitored calendar day
                    </p>
                  </div>
                </div>
                <div className="h-[280px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dateChartData} margin={{ top: 10, right: 10, left: -15, bottom: 25 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
                      <XAxis
                        dataKey="shortDate"
                        stroke="#64748b"
                        tick={{ fill: "#94a3b8", fontSize: 10 }}
                        angle={-20}
                        textAnchor="end"
                      />
                      <YAxis stroke="#64748b" tick={{ fill: "#94a3b8", fontSize: 10 }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend wrapperStyle={{ paddingTop: "10px", fontSize: "11px" }} />
                      <Bar
                        dataKey="p1"
                        stackId="sev"
                        name="P1 Critical"
                        fill={COLORS.p1}
                        onClick={(data: any) => {
                          if (data?.date && onSelectDate) onSelectDate(String(data.date));
                        }}
                        className="cursor-pointer"
                      />
                      <Bar
                        dataKey="p2"
                        stackId="sev"
                        name="P2 High"
                        fill={COLORS.p2}
                        onClick={(data: any) => {
                          if (data?.date && onSelectDate) onSelectDate(String(data.date));
                        }}
                        className="cursor-pointer"
                      />
                      <Bar
                        dataKey="p3"
                        stackId="sev"
                        name="P3 Medium"
                        fill={COLORS.p3}
                        onClick={(data: any) => {
                          if (data?.date && onSelectDate) onSelectDate(String(data.date));
                        }}
                        className="cursor-pointer"
                      />
                      <Bar
                        dataKey="p4"
                        stackId="sev"
                        name="P4 Low"
                        fill={COLORS.p4}
                        radius={[6, 6, 0, 0]}
                        onClick={(data: any) => {
                          if (data?.date && onSelectDate) onSelectDate(String(data.date));
                        }}
                        className="cursor-pointer"
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Bottom Row: Incident Conversion vs False Alarms & Interactive Day Digest */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Incident Conversion vs False Alarm Dual Bar Chart */}
              <div className="p-5 rounded-xl border border-slate-800 bg-slate-900/80 shadow-xl">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-indigo-400" />
                      <span>Incident Conversions vs False Alarms by Date</span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Evaluation of real security incidents spawned vs noise dismissed
                    </p>
                  </div>
                </div>
                <div className="h-[240px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dateChartData} margin={{ top: 10, right: 10, left: -15, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
                      <XAxis
                        dataKey="shortDate"
                        stroke="#64748b"
                        tick={{ fill: "#94a3b8", fontSize: 10 }}
                        angle={-15}
                        textAnchor="end"
                      />
                      <YAxis stroke="#64748b" tick={{ fill: "#94a3b8", fontSize: 10 }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend wrapperStyle={{ paddingTop: "10px", fontSize: "11px" }} />
                      <Bar
                        dataKey="converted"
                        name="Converted to Incident"
                        fill="#6366f1"
                        radius={[4, 4, 0, 0]}
                        onClick={(data: any) => {
                          if (data?.date && onSelectDate) onSelectDate(String(data.date));
                        }}
                        className="cursor-pointer hover:opacity-80"
                      />
                      <Bar
                        dataKey="falseAlarms"
                        name="Dismissed False Alarms"
                        fill="#64748b"
                        radius={[4, 4, 0, 0]}
                        onClick={(data: any) => {
                          if (data?.date && onSelectDate) onSelectDate(String(data.date));
                        }}
                        className="cursor-pointer hover:opacity-80"
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Interactive Calendar Day Digest */}
              <div className="p-5 rounded-xl border border-slate-800 bg-slate-900/80 shadow-xl flex flex-col justify-between">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-sky-400" />
                      <span>Calendar Days Interactive Ledger</span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Select any date to isolate alerts in the feed
                    </p>
                  </div>
                  <span className="text-xs font-mono text-slate-400">{dateChartData.length} recorded dates</span>
                </div>

                <div className="space-y-2 max-h-[240px] overflow-y-auto pr-1">
                  {dateChartData.map((d) => {
                    const isSelected = selectedDate === d.date;
                    return (
                      <div
                        key={d.date}
                        onClick={() => onSelectDate && onSelectDate(isSelected ? "all" : d.date)}
                        className={`p-3 rounded-xl border flex items-center justify-between gap-3 cursor-pointer transition-all ${
                          isSelected
                            ? "bg-blue-950/60 border-blue-500/60 shadow-md ring-1 ring-blue-500/30"
                            : "bg-slate-950/50 border-slate-800/80 hover:bg-slate-800/60"
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`h-8 w-8 rounded-lg flex items-center justify-center font-bold text-xs ${
                              isSelected
                                ? "bg-blue-600 text-white"
                                : "bg-slate-800 text-slate-300"
                            }`}
                          >
                            {d.date.slice(8, 10)}
                          </div>
                          <div>
                            <div className="text-xs font-semibold text-slate-200">
                              {d.formattedDate}
                            </div>
                            <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mt-0.5">
                              {d.p1 > 0 && <span className="text-rose-400 font-semibold">{d.p1} P1</span>}
                              {d.p2 > 0 && <span className="text-amber-400 font-semibold">{d.p2} P2</span>}
                              <span>{d.converted} Converted</span>
                              <span>•</span>
                              <span>{d.falseAlarms} False</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold font-mono text-slate-100">
                            {d.total} <span className="text-[10px] text-slate-400 font-normal">alerts</span>
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                              isSelected
                                ? "bg-blue-500 text-white"
                                : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                            }`}
                          >
                            {isSelected ? "Filtered" : "Filter"}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 7: 24H TIMELINE TREND */}
        {activeTab === "timeline" && (
          <div className="space-y-6">
            <div className="p-5 rounded-xl border border-slate-800 bg-slate-900/80 shadow-xl">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-cyan-400" />
                    <span>24-Hour Continuous Timeline (Surge & Anomaly Analysis)</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Monitoring alert frequency spikes to detect coordinated intrusion or after-hours breaches
                  </p>
                </div>
              </div>
              <div className="h-[340px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={timelineChartData} margin={{ top: 20, right: 30, left: 0, bottom: 20 }}>
                    <defs>
                      <linearGradient id="fullAlertGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.5} />
                        <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.0} />
                      </linearGradient>
                      <linearGradient id="fullCritGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.5} />
                        <stop offset="95%" stopColor="#f43f5e" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
                    <XAxis dataKey="hour" stroke="#64748b" tick={{ fill: "#cbd5e1", fontSize: 11 }} />
                    <YAxis stroke="#64748b" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ paddingTop: "15px", fontSize: "12px" }} />
                    <Area
                      type="monotone"
                      dataKey="count"
                      name="Total AI Alerts"
                      stroke="#38bdf8"
                      strokeWidth={3}
                      fill="url(#fullAlertGrad)"
                    />
                    <Area
                      type="monotone"
                      dataKey="critical"
                      name="Critical P1/P2 Alerts"
                      stroke="#f43f5e"
                      strokeWidth={3}
                      fill="url(#fullCritGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
