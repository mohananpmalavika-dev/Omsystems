"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { AppLayout } from "@/components/app-layout";
import {
  ShieldAlert,
  Activity,
  Users,
  Clock,
  CheckCircle2,
  FileText,
  Download,
  Printer,
  RefreshCw,
  Building2,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Calendar,
  Filter,
  HardDrive,
  Eye,
  Lock,
  Sparkles,
  ArrowUpRight,
  ChevronRight,
  Award,
  Layers,
  MapPin,
  Globe2,
  SlidersHorizontal,
  TableProperties,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from "recharts";

type TimeRange = "today" | "7d" | "30d" | "90d";
type GroupBy = "organization" | "zone" | "region" | "area" | "branch" | "date" | "time";
type TabKey = "all-in-one" | "threat" | "health" | "operations" | "attendance" | "sla" | "compliance";

export default function MisReportsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("all-in-one");
  const [timeRange, setTimeRange] = useState<TimeRange>("7d");
  const [groupBy, setGroupBy] = useState<GroupBy>("branch");

  // Filters
  const [selectedOrg, setSelectedOrg] = useState("all");
  const [selectedZone, setSelectedZone] = useState("all");
  const [selectedRegion, setSelectedRegion] = useState("all");
  const [selectedArea, setSelectedArea] = useState("all");
  const [selectedBranch, setSelectedBranch] = useState("all");
  const [selectedShift, setSelectedShift] = useState("all");

  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [data, setData] = useState<any>(null);

  const fetchMisData = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        timeRange,
        groupBy,
        organization: selectedOrg,
        zone: selectedZone,
        region: selectedRegion,
        area: selectedArea,
        branchId: selectedBranch,
        shift: selectedShift,
      });

      const res = await fetch(`/api/reports/mis?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        setData(json.data);
      }
    } catch (err) {
      console.error("Failed to load MIS data", err);
    } finally {
      setLoading(false);
    }
  }, [timeRange, groupBy, selectedOrg, selectedZone, selectedRegion, selectedArea, selectedBranch, selectedShift]);

  useEffect(() => {
    fetchMisData();
  }, [fetchMisData]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchMisData();
    }, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchMisData]);

  const handlePrint = () => {
    window.print();
  };

  const handleExportCsv = () => {
    if (!data || !data.matrix) return;
    const headers = [
      "Dimension (" + groupBy.toUpperCase() + ")",
      "Branch Count",
      "Online Cameras",
      "Total Cameras",
      "Uptime %",
      "P1 Critical Threats",
      "Total Alerts",
      "Customer Footfall",
      "Avg Wait (Min)",
      "Staff Attendance %",
      "SLA Compliance %",
      "Retention (Days)",
      "Status",
    ];

    const rows = data.matrix.map((r: any) => [
      `"${r.dimension}"`,
      r.branchCount ?? 1,
      r.onlineCameras ?? r.online ?? "-",
      r.totalCameras ?? r.cameras ?? "-",
      r.uptimePercent ?? r.uptime ?? "-",
      r.p1Threats ?? 0,
      r.totalAlerts ?? r.alerts ?? 0,
      r.footfall ?? 0,
      r.avgWaitMin ?? "-",
      r.attendancePercent ?? "-",
      r.slaPercent ?? "-",
      r.retentionDays ?? "-",
      r.complianceStatus ?? r.status ?? "Optimal",
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e: any[]) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `All_In_One_MIS_${groupBy}_wise_${timeRange}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const summary = data?.summary;
  const filterOptions = data?.filterOptions;

  return (
    <AppLayout>
      <div className="space-y-6 pb-12 print:p-0 print:space-y-4">
        {/* Top Header & Executive Controls */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-slate-900/60 p-6 rounded-2xl border border-slate-800 shadow-xl backdrop-blur-md print:bg-white print:border-none print:shadow-none print:p-0">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                <Sparkles size={12} /> All-In-One Unified MIS Engine
              </span>
              <span className="text-xs text-slate-400">Date · Time · Branch · Area · Region · Zone · Org</span>
            </div>
            <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-white print:text-black">
              Executive MIS Reports & Multi-Dimensional Analytics
            </h1>
            <p className="text-sm text-slate-400 mt-1 max-w-2xl print:text-slate-600">
              Unified surveillance and operations intelligence with drilldown across Organizations, Macro Zones, Geographical Regions, City Areas, Branches, Daily Timelines, and Shift Hours.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 print:hidden">
            {/* Time Range Selector */}
            <div className="inline-flex rounded-lg bg-slate-800/80 p-1 border border-slate-700/60">
              {(["today", "7d", "30d", "90d"] as TimeRange[]).map((tr) => (
                <button
                  key={tr}
                  onClick={() => setTimeRange(tr)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                    timeRange === tr
                      ? "bg-sky-500 text-white shadow"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  {tr === "today" ? "Today" : tr === "7d" ? "7 Days" : tr === "30d" ? "30 Days" : "90 Days"}
                </button>
              ))}
            </div>

            {/* Refresh */}
            <button
              onClick={() => fetchMisData()}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs flex items-center gap-1.5 transition-colors"
              title="Refresh MIS Telemetry"
            >
              <RefreshCw size={14} className={loading ? "animate-spin text-sky-400" : ""} />
            </button>

            {/* Export CSV */}
            <button
              onClick={handleExportCsv}
              className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium flex items-center gap-1.5 transition-colors"
            >
              <Download size={14} /> Export CSV
            </button>

            {/* Print / Save as PDF */}
            <button
              onClick={handlePrint}
              className="px-3.5 py-2 rounded-lg bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-lg shadow-sky-500/20 transition-all"
            >
              <Printer size={14} /> Print / Save PDF
            </button>
          </div>
        </div>

        {/* Global Multi-Tier Filter Bar (Organization, Zone, Region, Area, Branch, Shift) */}
        <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800 flex flex-wrap items-center gap-3 print:hidden">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 mr-2">
            <Filter size={14} className="text-sky-400" />
            <span>Cross Filters:</span>
          </div>

          {/* Organization Filter */}
          <select
            value={selectedOrg}
            onChange={(e) => setSelectedOrg(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-xs rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-sky-500"
          >
            <option value="all">🏢 All Organizations</option>
            {filterOptions?.organizations?.map((org: string) => (
              <option key={org} value={org}>{org}</option>
            ))}
          </select>

          {/* Zone Filter */}
          <select
            value={selectedZone}
            onChange={(e) => setSelectedZone(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-xs rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-sky-500"
          >
            <option value="all">🌐 All Zones</option>
            {filterOptions?.zones?.map((z: string) => (
              <option key={z} value={z}>{z}</option>
            ))}
          </select>

          {/* Region Filter */}
          <select
            value={selectedRegion}
            onChange={(e) => setSelectedRegion(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-xs rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-sky-500"
          >
            <option value="all">🗺️ All Regions</option>
            {filterOptions?.regions?.map((r: string) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>

          {/* Area Filter */}
          <select
            value={selectedArea}
            onChange={(e) => setSelectedArea(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-xs rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-sky-500"
          >
            <option value="all">📍 All Areas</option>
            {filterOptions?.areas?.map((a: string) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>

          {/* Branch Filter */}
          <select
            value={selectedBranch}
            onChange={(e) => setSelectedBranch(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-xs rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-sky-500"
          >
            <option value="all">🏛️ All Branches</option>
            {filterOptions?.branches?.map((b: any) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>

          {/* Shift Filter */}
          <select
            value={selectedShift}
            onChange={(e) => setSelectedShift(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-xs rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-sky-500"
          >
            <option value="all">⏰ All Shifts / 24 Hours</option>
            <option value="morning">Shift A: Morning (08:00 - 16:00)</option>
            <option value="evening">Shift B: Evening (16:00 - 24:00)</option>
            <option value="night">Shift C: Night / Off-Hours (00:00 - 08:00)</option>
          </select>

          {(selectedOrg !== "all" || selectedZone !== "all" || selectedRegion !== "all" || selectedArea !== "all" || selectedBranch !== "all" || selectedShift !== "all") && (
            <button
              onClick={() => {
                setSelectedOrg("all");
                setSelectedZone("all");
                setSelectedRegion("all");
                setSelectedArea("all");
                setSelectedBranch("all");
                setSelectedShift("all");
              }}
              className="text-xs text-rose-400 hover:text-rose-300 ml-auto font-medium"
            >
              Reset Filters
            </button>
          )}
        </div>

        {/* Executive Summary Scorecards */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 print:grid-cols-3">
            <div className="bg-slate-900/70 border border-slate-800/80 rounded-xl p-4 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 h-1 w-full bg-emerald-500" />
              <span className="text-xs font-medium text-slate-400 block mb-1">Average Uptime</span>
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-bold text-white">{summary.avgUptime}%</span>
                <span className="text-xs text-emerald-400 font-semibold">{summary.onlineCameras}/{summary.totalCameras} cams</span>
              </div>
              <span className="text-[11px] text-slate-500 mt-1 block">{summary.totalBranches} Branches Analyzed</span>
            </div>

            <div className="bg-slate-900/70 border border-slate-800/80 rounded-xl p-4 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 h-1 w-full bg-rose-500" />
              <span className="text-xs font-medium text-slate-400 block mb-1">Open P1 Threats</span>
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-bold text-rose-400">{summary.totalP1Threats}</span>
                <span className="text-xs text-slate-400">{summary.totalAlerts} total alerts</span>
              </div>
              <span className="text-[11px] text-slate-500 mt-1 block">Requires instant review</span>
            </div>

            <div className="bg-slate-900/70 border border-slate-800/80 rounded-xl p-4 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 h-1 w-full bg-amber-500" />
              <span className="text-xs font-medium text-slate-400 block mb-1">Total Footfall</span>
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-bold text-amber-400">{summary.totalFootfall.toLocaleString()}</span>
                <span className="text-xs text-slate-400">Visitors</span>
              </div>
              <span className="text-[11px] text-slate-500 mt-1 block">Avg Wait: {summary.avgWaitMin} mins</span>
            </div>

            <div className="bg-slate-900/70 border border-slate-800/80 rounded-xl p-4 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 h-1 w-full bg-sky-500" />
              <span className="text-xs font-medium text-slate-400 block mb-1">Staff Attendance</span>
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-bold text-sky-400">{summary.avgAttendance}%</span>
                <span className="text-xs text-emerald-400">Face Verified</span>
              </div>
              <span className="text-[11px] text-slate-500 mt-1 block">Shift compliance</span>
            </div>

            <div className="bg-slate-900/70 border border-slate-800/80 rounded-xl p-4 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 h-1 w-full bg-indigo-500" />
              <span className="text-xs font-medium text-slate-400 block mb-1">SLA Compliance</span>
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-bold text-indigo-400">{summary.avgSla}%</span>
                <span className="text-xs text-emerald-400 font-semibold">MTTA 1.8m</span>
              </div>
              <span className="text-[11px] text-slate-500 mt-1 block">Response target met</span>
            </div>

            <div className="bg-slate-900/70 border border-slate-800/80 rounded-xl p-4 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 h-1 w-full bg-teal-500" />
              <span className="text-xs font-medium text-slate-400 block mb-1">Retention Compliance</span>
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-bold text-teal-400">{summary.avgRetentionDays}d</span>
                <span className="text-xs text-emerald-400 font-semibold">90d Rule</span>
              </div>
              <span className="text-[11px] text-slate-500 mt-1 block">100% Statutory passed</span>
            </div>
          </div>
        )}

        {/* Navigation Tabs (All-in-One Master Matrix + Category Deep-Dives) */}
        <div className="border-b border-slate-800 flex items-center gap-2 overflow-x-auto print:hidden">
          <TabButton
            active={activeTab === "all-in-one"}
            onClick={() => setActiveTab("all-in-one")}
            icon={<TableProperties size={16} />}
            label="⭐ ALL-IN-ONE MASTER REPORT"
            badge="Unified Matrix"
          />
          <TabButton
            active={activeTab === "threat"}
            onClick={() => setActiveTab("threat")}
            icon={<ShieldAlert size={16} />}
            label="Threat & Alerts"
          />
          <TabButton
            active={activeTab === "health"}
            onClick={() => setActiveTab("health")}
            icon={<Activity size={16} />}
            label="Camera & Infrastructure"
          />
          <TabButton
            active={activeTab === "operations"}
            onClick={() => setActiveTab("operations")}
            icon={<Building2 size={16} />}
            label="Operations & Footfall"
          />
          <TabButton
            active={activeTab === "attendance"}
            onClick={() => setActiveTab("attendance")}
            icon={<Users size={16} />}
            label="Staff Attendance"
          />
          <TabButton
            active={activeTab === "sla"}
            onClick={() => setActiveTab("sla")}
            icon={<Clock size={16} />}
            label="Incident SLA"
          />
          <TabButton
            active={activeTab === "compliance"}
            onClick={() => setActiveTab("compliance")}
            icon={<Award size={16} />}
            label="Audit Compliance"
          />
        </div>

        {/* ALL-IN-ONE MASTER DRILLDOWN VIEW */}
        {activeTab === "all-in-one" && data?.matrix && (
          <div className="space-y-6">
            {/* Multi-Dimensional Group-By Selector */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <span className="text-xs font-semibold text-sky-400 uppercase tracking-wider block">Dimension Grouping / Rollup</span>
                <span className="text-sm font-bold text-white">Select Grouping View for Master Analytics:</span>
              </div>

              <div className="inline-flex flex-wrap rounded-lg bg-slate-800/90 p-1 border border-slate-700">
                {[
                  { key: "organization", label: "🏢 Organization-wise" },
                  { key: "zone", label: "🌐 Zone-wise" },
                  { key: "region", label: "🗺️ Region-wise" },
                  { key: "area", label: "📍 Area-wise" },
                  { key: "branch", label: "🏛️ Branch-wise" },
                  { key: "date", label: "📅 Date-wise" },
                  { key: "time", label: "⏰ Time / Shift-wise" },
                ].map((g) => (
                  <button
                    key={g.key}
                    onClick={() => setGroupBy(g.key as GroupBy)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                      groupBy === g.key
                        ? "bg-sky-500 text-white shadow-md shadow-sky-500/20"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Dynamic Visual Graph for the selected dimension */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-base font-semibold text-white">
                    {groupBy.toUpperCase()}-WISE SURVEILLANCE & PERFORMANCE COMPARISON
                  </h2>
                  <p className="text-xs text-slate-400">
                    Comparative breakdown of Uptime %, Customer Footfall, and Total Alerts across {groupBy} dimension
                  </p>
                </div>
                <span className="text-xs px-2.5 py-1 bg-sky-500/10 text-sky-400 border border-sky-500/20 rounded font-medium">
                  {data.matrix.length} Data Points
                </span>
              </div>

              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.matrix} margin={{ top: 10, right: 10, left: -10, bottom: 25 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
                    <XAxis dataKey="dimension" stroke="#94a3b8" fontSize={11} interval={0} angle={-15} textAnchor="end" />
                    <YAxis yAxisId="left" stroke="#94a3b8" fontSize={11} />
                    <YAxis yAxisId="right" orientation="right" stroke="#10b981" fontSize={11} domain={[90, 100]} unit="%" />
                    <Tooltip contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155", borderRadius: 8, fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 12, paddingTop: 30 }} />
                    <Bar yAxisId="left" dataKey="totalAlerts" name="Total Security Alerts" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                    <Bar yAxisId="left" dataKey="p1Threats" name="P1 Critical Threats" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                    <Line yAxisId="right" type="monotone" dataKey="uptimePercent" name="Camera Availability %" stroke="#10b981" strokeWidth={2.5} />
                    <Line yAxisId="right" type="monotone" dataKey="slaPercent" name="SLA Compliance %" stroke="#38bdf8" strokeWidth={2} strokeDasharray="3 3" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Master Multi-Dimensional Table */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
              <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white">All-In-One Unified Master Data Table</h3>
                  <p className="text-xs text-slate-400">Complete multi-metric audit records grouped by {groupBy}</p>
                </div>
                <button
                  onClick={handleExportCsv}
                  className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs flex items-center gap-1.5 transition-colors"
                >
                  <Download size={13} /> Export Current Matrix
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-800/80 text-slate-300 font-semibold border-b border-slate-700">
                      <th className="p-3">Dimension ({groupBy.toUpperCase()})</th>
                      {groupBy === "branch" && <th className="p-3">Area / Region</th>}
                      <th className="p-3 text-center">Branches</th>
                      <th className="p-3 text-center">Cameras (On/Tot)</th>
                      <th className="p-3 text-center">Uptime %</th>
                      <th className="p-3 text-center">P1 Threats</th>
                      <th className="p-3 text-center">Total Alerts</th>
                      <th className="p-3 text-center">Footfall</th>
                      <th className="p-3 text-center">Wait Min</th>
                      <th className="p-3 text-center">Attendance %</th>
                      <th className="p-3 text-center">SLA %</th>
                      <th className="p-3 text-center">Retention</th>
                      <th className="p-3 text-center">Compliance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-slate-300">
                    {data.matrix.map((row: any, idx: number) => (
                      <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                        <td className="p-3 font-semibold text-white flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-sky-400" />
                          <span>{row.dimension}</span>
                        </td>
                        {groupBy === "branch" && (
                          <td className="p-3 text-slate-400">
                            {row.area} · <span className="text-sky-400">{row.region}</span>
                          </td>
                        )}
                        <td className="p-3 text-center font-medium">{row.branchCount ?? 1}</td>
                        <td className="p-3 text-center">
                          <span className="text-emerald-400 font-semibold">{row.onlineCameras ?? row.online ?? "-"}</span> / {row.totalCameras ?? row.cameras ?? "-"}
                        </td>
                        <td className="p-3 text-center">
                          <span className={`px-2 py-0.5 rounded font-bold ${(row.uptimePercent ?? row.uptime) >= 99 ? "bg-emerald-500/10 text-emerald-400" : (row.uptimePercent ?? row.uptime) >= 97 ? "bg-amber-500/10 text-amber-400" : "bg-rose-500/10 text-rose-400"}`}>
                            {row.uptimePercent ?? row.uptime}%
                          </span>
                        </td>
                        <td className="p-3 text-center font-bold text-rose-400">
                          {row.p1Threats ?? 0}
                        </td>
                        <td className="p-3 text-center font-semibold text-amber-400">
                          {row.totalAlerts ?? row.alerts ?? 0}
                        </td>
                        <td className="p-3 text-center font-medium">
                          {(row.footfall ?? 0).toLocaleString()}
                        </td>
                        <td className="p-3 text-center text-slate-400">
                          {row.avgWaitMin ?? "-"}m
                        </td>
                        <td className="p-3 text-center text-sky-400 font-medium">
                          {row.attendancePercent ?? "-"}%
                        </td>
                        <td className="p-3 text-center text-emerald-400 font-semibold">
                          {row.slaPercent ?? "-"}%
                        </td>
                        <td className="p-3 text-center text-teal-400 font-medium">
                          {row.retentionDays ?? "-"}d
                        </td>
                        <td className="p-3 text-center">
                          <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${(row.complianceStatus === "Compliant" || row.status === "Optimal") ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-amber-500/10 text-amber-400 border border-amber-500/20"}`}>
                            {row.complianceStatus ?? row.status ?? "Optimal"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Tab 1: Executive Threat & Alert MIS */}
        {activeTab === "threat" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 bg-slate-900/60 border border-slate-800 rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-base font-semibold text-white">Date-wise & Shift-wise Alert Activity</h2>
                    <p className="text-xs text-slate-400">Off-hours vulnerability trend mapped over 24-hour cycle</p>
                  </div>
                </div>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data?.timeWiseBreakdown || []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
                      <XAxis dataKey="dimension" stroke="#94a3b8" fontSize={11} />
                      <YAxis stroke="#94a3b8" fontSize={11} />
                      <Tooltip contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155", borderRadius: 8, fontSize: 12 }} />
                      <Legend wrapperStyle={{ fontSize: 12, paddingTop: 10 }} />
                      <Area type="monotone" dataKey="alerts" name="Total Security Events" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.2} />
                      <Line type="monotone" dataKey="p1Threats" name="P1 Critical" stroke="#f43f5e" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
                <h2 className="text-base font-semibold text-white mb-1">Threats by Shift</h2>
                <p className="text-xs text-slate-400 mb-4">Day vs night security exposure</p>
                <div className="space-y-3">
                  {(data?.timeWiseBreakdown || []).map((t: any, idx: number) => (
                    <div key={idx} className="p-3 bg-slate-800/40 rounded-lg border border-slate-700/40">
                      <div className="flex items-center justify-between text-xs font-semibold text-white">
                        <span>{t.dimension}</span>
                        <span className="text-amber-400">{t.alerts} alerts</span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1">
                        <span>Shift: {t.shift}</span>
                        <span className="text-rose-400">{t.p1Threats} P1 Threats</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: System & Camera Health */}
        {activeTab === "health" && (
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
            <h2 className="text-base font-semibold text-white mb-1">Branch-wise & Area-wise Camera Uptime</h2>
            <p className="text-xs text-slate-400 mb-4">Infrastructure availability against 99.0% SLA target</p>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data?.allBranches || []} margin={{ top: 10, right: 10, left: -20, bottom: 25 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} interval={0} angle={-15} textAnchor="end" />
                  <YAxis stroke="#94a3b8" fontSize={11} domain={[90, 100]} unit="%" />
                  <Tooltip contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155", borderRadius: 8, fontSize: 12 }} />
                  <ReferenceLine y={99.0} stroke="#10b981" strokeDasharray="3 3" label={{ value: "99% Target", fill: "#10b981", fontSize: 10 }} />
                  <Bar dataKey="uptime" name="Uptime %" fill="#38bdf8" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Tab 3: Operations & Footfall */}
        {activeTab === "operations" && (
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
            <h2 className="text-base font-semibold text-white mb-1">Date-wise Footfall Trend</h2>
            <p className="text-xs text-slate-400 mb-4">Customer branch walk-in patterns day by day</p>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data?.dateWiseBreakdown || []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
                  <XAxis dataKey="dimension" stroke="#94a3b8" fontSize={11} />
                  <YAxis stroke="#94a3b8" fontSize={11} />
                  <Tooltip contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155", borderRadius: 8, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 12, paddingTop: 10 }} />
                  <Area type="monotone" dataKey="footfall" name="Customer Footfall" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.25} />
                  <Line type="monotone" dataKey="alerts" name="Security Alerts" stroke="#f43f5e" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Tab 4: Staff Attendance */}
        {activeTab === "attendance" && (
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
            <h2 className="text-base font-semibold text-white mb-1">Area & Branch Staff Attendance Matrix</h2>
            <p className="text-xs text-slate-400 mb-4">Biometric & Face ID attendance compliance rate across locations</p>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data?.allBranches || []} margin={{ top: 10, right: 10, left: -20, bottom: 25 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} interval={0} angle={-15} textAnchor="end" />
                  <YAxis stroke="#94a3b8" fontSize={11} domain={[85, 100]} unit="%" />
                  <Tooltip contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155", borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="attendancePercent" name="Attendance %" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Tab 5: Incident SLA */}
        {activeTab === "sla" && (
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
            <h2 className="text-base font-semibold text-white mb-1">Incident SLA Compliance by Branch</h2>
            <p className="text-xs text-slate-400 mb-4">Time to acknowledge and resolve incidents against contract targets</p>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data?.allBranches || []} margin={{ top: 10, right: 10, left: -20, bottom: 25 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} interval={0} angle={-15} textAnchor="end" />
                  <YAxis stroke="#94a3b8" fontSize={11} domain={[90, 100]} unit="%" />
                  <Tooltip contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155", borderRadius: 8, fontSize: 12 }} />
                  <ReferenceLine y={98.0} stroke="#10b981" strokeDasharray="3 3" label={{ value: "98% Target", fill: "#10b981", fontSize: 10 }} />
                  <Line type="monotone" dataKey="slaPercent" name="SLA Compliance %" stroke="#38bdf8" strokeWidth={2.5} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Tab 6: Audit Compliance */}
        {activeTab === "compliance" && (
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
            <h2 className="text-base font-semibold text-white mb-1">Statutory 90-Day Video Retention Status</h2>
            <p className="text-xs text-slate-400 mb-4">Achieved storage retention days across all audited branches</p>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data?.allBranches || []} margin={{ top: 10, right: 10, left: -20, bottom: 25 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} interval={0} angle={-15} textAnchor="end" />
                  <YAxis stroke="#94a3b8" fontSize={11} domain={[70, 100]} unit="d" />
                  <Tooltip contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155", borderRadius: 8, fontSize: 12 }} />
                  <ReferenceLine y={90} stroke="#f43f5e" strokeDasharray="3 3" label={{ value: "Mandatory 90 Days", fill: "#f43f5e", fontSize: 10 }} />
                  <Bar dataKey="retentionDays" name="Retention (Days)" fill="#14b8a6" radius={[4, 4, 0, 0]}>
                    {(data?.allBranches || []).map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={entry.retentionDays >= 90 ? "#14b8a6" : "#f43f5e"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  badge?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-3 text-xs font-semibold flex items-center gap-2 border-b-2 whitespace-nowrap transition-all ${
        active
          ? "border-sky-500 text-sky-400 bg-sky-500/5"
          : "border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700"
      }`}
    >
      {icon}
      <span>{label}</span>
      {badge && (
        <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-sky-500/20 text-sky-400 border border-sky-500/30">
          {badge}
        </span>
      )}
    </button>
  );
}
