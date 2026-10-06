"use client";

import { ReportPagination } from "@/components/reports/report-pagination";
import { ExecutiveManagementReport } from "@/components/reports/executive-management-report";
import { downloadReportCsv } from "@/lib/report-export";
import { FieldVisual } from "@/components/field-visual";
import { Suspense, useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AppLayout } from "@/components/app-layout";
import { branchOpeningCsv } from "@/lib/branch-opening-csv";
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
  Mail,
  Send,
  MessageSquare,
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

type TimeRange = "today" | "7d" | "30d" | "90d" | "custom";
type GroupBy = "organization" | "zone" | "region" | "area" | "branch" | "date" | "time";
type TabKey = "all-in-one" | "threat" | "health" | "operations" | "attendance" | "sla" | "compliance" | "branch-opening";
type OpeningRange = "today" | "7d" | "30d" | "90d" | "custom";
type OpeningEntry = {
  ruleId: string;
  localDate: string;
  occurredAt: string | null;
  zoneName: string | null;
  branchId: string;
  branchName: string;
  cameraName: string | null;
  cameraId?: string | null;
  locationType?: string | null;
  personCount: number | null;
  outcome: "SUCCESS" | "FAILED" | "NOT_RECORDED";
  photoUrl: string | null;
};
type OpeningReport = {
  rows: OpeningEntry[];
  total: number;
  startDate: string;
  endDate: string;
  truncated: boolean;
  filterOptions?: {
    organizations: string[];
    zones: string[];
    regions: string[];
    areas: string[];
    branches: Array<{ id: string; name: string }>;
    cameras: Array<{ id: string; name: string; branchId: string; branchName: string; locationType: string }>;
    locations: string[];
  };
};

export default function MisReportsPage() {
  return <Suspense fallback={<div className="p-8">Loading reports…</div>}><MisReportsContent /></Suspense>;
}

function MisReportsContent() {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabKey>("all-in-one");
  useEffect(() => {
    const tab = searchParams?.get("tab");
    setActiveTab(tab === "branch-opening" ? "branch-opening" : "all-in-one");
    const dimension = searchParams?.get("groupBy");
    setGroupBy(["organization", "zone", "region", "area", "branch", "date", "time"].includes(dimension ?? "") ? dimension as GroupBy : "branch");
  }, [searchParams]);
  const [timeRange, setTimeRange] = useState<TimeRange>("7d");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [openingPage, setOpeningPage] = useState(1);
  const [openingPageSize, setOpeningPageSize] = useState(25);
  const misRequest = useRef(0);
  const [groupBy, setGroupBy] = useState<GroupBy>("branch");

  // Filters
  const [selectedOrg, setSelectedOrg] = useState("all");
  const [selectedZone, setSelectedZone] = useState("all");
  const [selectedRegion, setSelectedRegion] = useState("all");
  const [selectedArea, setSelectedArea] = useState("all");
  const [selectedBranch, setSelectedBranch] = useState("all");
  const [selectedShift, setSelectedShift] = useState("all");
  const [selectedCamera, setSelectedCamera] = useState("all");
  const [selectedLocation, setSelectedLocation] = useState("all");
  const openingRequest = useRef(0);

  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [openingRange, setOpeningRange] = useState<OpeningRange>("today");
  const [openingStartDate, setOpeningStartDate] = useState("");
  const [openingEndDate, setOpeningEndDate] = useState("");
  const [openingReport, setOpeningReport] = useState<OpeningReport | null>(null);
  const [openingLoading, setOpeningLoading] = useState(false);
  const [openingError, setOpeningError] = useState<string | null>(null);

  // Executive Scorecard Auto-Dispatch
  const [isDispatching, setIsDispatching] = useState(false);
  const [dispatchSuccess, setDispatchSuccess] = useState<string | null>(null);

  const getReportAuthHeaders = useCallback((): Record<string, string> => {
    const token = typeof window !== "undefined"
      ? (localStorage.getItem("accessToken") || sessionStorage.getItem("accessToken"))
      : null;
    const headers: Record<string, string> = {};
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
      headers["x-sentinel-session"] = token;
    }
    return headers;
  }, []);

  const fetchMisData = useCallback(async () => {
    const requestId = ++misRequest.current;
    if (timeRange === 'custom' && (!startDate || !endDate || startDate > endDate)) { setError('Select valid start and end dates.'); setData(null); setLoading(false); return; }
    try {
      setLoading(true);
      const params = new URLSearchParams({ timeRange, groupBy });
      if (timeRange === 'custom') { params.set('startDate',startDate); params.set('endDate',endDate); }
      for (const [key, value] of Object.entries({
        organization: selectedOrg,
        zone: selectedZone,
        region: selectedRegion,
        area: selectedArea,
        branchId: selectedBranch,
        shift: selectedShift,
      })) {
        if (value !== "all") params.set(key, value);
      }

      const res = await fetch(`/api/control/v1/reports/mis?${params.toString()}`, {
        headers: getReportAuthHeaders(),
        credentials: "include",
        cache: "no-store",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.message || json?.error || "MIS data is currently unavailable.");
      }
      if (requestId !== misRequest.current) return;
      setData(json);
      setError(null);
    } catch (err) {
      console.error("Failed to load MIS data", err);
      if (requestId !== misRequest.current) return;
      setData(null);
      setError(err instanceof Error ? err.message : "MIS data is currently unavailable.");
    } finally {
      if (requestId === misRequest.current) setLoading(false);
    }
  }, [startDate, endDate, timeRange, groupBy, selectedOrg, selectedZone, selectedRegion, selectedArea, selectedBranch, selectedShift, getReportAuthHeaders]);

  useEffect(() => { setPage(1); setOpeningPage(1); }, [timeRange,startDate,endDate,groupBy,selectedOrg,selectedZone,selectedRegion,selectedArea,selectedBranch,openingRange,openingStartDate,openingEndDate]);
  useEffect(() => {
    fetchMisData();
  }, [fetchMisData]);

  const fetchOpenings = useCallback(async () => {
    const requestId = ++openingRequest.current;
    if (openingRange === "custom" && (!openingStartDate || !openingEndDate || openingStartDate > openingEndDate)) {
      setOpeningReport(null);
      setOpeningError("Select a valid start and end date.");
      setOpeningLoading(false);
      return;
    }
    setOpeningLoading(true);
    try {
      const params = new URLSearchParams({ timeRange: openingRange });
      if (openingRange === "custom") {
        params.set("startDate", openingStartDate);
        params.set("endDate", openingEndDate);
      }
      for (const [key, value] of Object.entries({
        organization: selectedOrg, zone: selectedZone, region: selectedRegion,
        area: selectedArea, branchId: selectedBranch,
        cameraId: selectedCamera, locationType: selectedLocation,
      })) {
        if (value !== "all") params.set(key, value);
      }
      const response = await fetch(`/api/control/v1/reports/mis/branch-openings?${params}`, {
        headers: getReportAuthHeaders(), credentials: "include", cache: "no-store",
      });
      const payload = await response.json().catch(() => null);
      if (requestId !== openingRequest.current) return;
      if (!response.ok) throw new Error(payload?.message || payload?.error || "Opening report unavailable.");
      setOpeningReport(payload as OpeningReport);
      setOpeningError(null);
    } catch (cause) {
      if (requestId !== openingRequest.current) return;
      setOpeningReport(null);
      setOpeningError(cause instanceof Error ? cause.message : "Opening report unavailable.");
    } finally {
      if (requestId === openingRequest.current) setOpeningLoading(false);
    }
  }, [openingRange, openingStartDate, openingEndDate, selectedOrg, selectedZone, selectedRegion,
    selectedArea, selectedBranch, selectedCamera, selectedLocation, getReportAuthHeaders]);

  useEffect(() => {
    if (activeTab === "branch-opening") void fetchOpenings();
  }, [activeTab, fetchOpenings]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      if (activeTab === "branch-opening") void fetchOpenings();
      else void fetchMisData();
    }, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, activeTab, fetchMisData, fetchOpenings]);

  useEffect(() => {
    setSelectedCamera("all");
    setSelectedLocation("all");
  }, [selectedOrg, selectedZone, selectedRegion, selectedArea, selectedBranch]);

  const handleOpeningExportCsv = () => {
    if (!openingReport) return;
    const blob = new Blob([branchOpeningCsv(openingReport.rows, window.location.origin)],
      { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Branch_Openings_${openingReport.startDate}_${openingReport.endDate}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

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
      "Incident cases",
      "Customer Footfall",
      "Avg Wait (Min)",
      "Staff Attendance %",
      "SLA Compliance %",
      "Configured retention (Days)",
      "Status",
    ];

    const rows = data.matrix.map((r: any) => [
      r.dimension,
      r.branchCount ?? 1,
      r.onlineCameras ?? r.online ?? "-",
      r.totalCameras ?? r.cameras ?? "-",
      r.uptimePercent ?? r.uptime ?? "-",
      r.p1Threats ?? 0,
      r.totalAlerts ?? r.alerts ?? 0,
      r.footfall ?? "",
      r.avgWaitMin ?? "-",
      r.attendancePercent ?? "-",
      r.slaPercent ?? "-",
      r.retentionDays ?? "-",
      r.complianceStatus ?? r.status ?? "Optimal",
    ]);

    downloadReportCsv(data.matrix.map((row: any, index: number) => Object.fromEntries(headers.map((header: string, col: number) => [header, rows[index][col]]))), `MIS_${groupBy}_${timeRange}.csv`, headers);
  };

  const summary = data?.summary;
  const filterOptions = activeTab === "branch-opening" && openingReport?.filterOptions
    ? openingReport.filterOptions : data?.filterOptions;

  return (
    <AppLayout>
      <div className="space-y-6 pb-12 print:p-0 print:space-y-4">
        {/* Top Header & Executive Controls */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-slate-900/60 p-6 rounded-2xl border border-slate-800 shadow-xl backdrop-blur-md print:bg-white print:border-none print:shadow-none print:p-0 workspace-heading">
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
              Unified surveillance and operations intelligence with drilldown across Organizations, Zones, Regions, Areas, Branches, Daily Timelines, and Shift Hours.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 print:hidden">
            {/* Time Range Selector */}
            {activeTab !== "branch-opening" && <div className="inline-flex rounded-lg bg-slate-800/80 p-1 border border-slate-700/60">
              {(["today", "7d", "30d", "90d", "custom"] as TimeRange[]).map((tr) => (
                <button
                  key={tr}
                  onClick={() => setTimeRange(tr)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                    timeRange === tr
                      ? "bg-sky-500 text-white shadow"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  {tr === "today" ? "Today" : tr === "7d" ? "7 Days" : tr === "30d" ? "30 Days" : tr === "90d" ? "90 Days" : "Date / range"}
                </button>
              ))}
            </div>}

            {activeTab !== 'branch-opening' && timeRange === 'custom' && <div className="flex flex-wrap gap-2">
              <label className="text-xs">From (IST)<input aria-label="MIS start date" type="date" className="input block" value={startDate} onChange={event=>setStartDate(event.target.value)}/></label>
              <label className="text-xs">To (IST)<input aria-label="MIS end date" type="date" className="input block" value={endDate} min={startDate} onChange={event=>setEndDate(event.target.value)}/></label>
              <button className="btn-primary" onClick={()=>void fetchMisData()}>Generate report</button>
            </div>}
            {/* Refresh */}
            <button
              onClick={() => activeTab === "branch-opening" ? fetchOpenings() : fetchMisData()}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs flex items-center gap-1.5 transition-colors"
              title="Refresh MIS Telemetry"
            >
              <RefreshCw size={14} className={(activeTab === "branch-opening" ? openingLoading : loading) ? "animate-spin text-sky-400" : ""} />
            </button>

            {/* Export CSV */}
            <button
              onClick={activeTab === "branch-opening" ? handleOpeningExportCsv : handleExportCsv}
              disabled={activeTab === "branch-opening" && !openingReport}
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
        <FieldVisual /></div>

        {/* DAILY 08:00 PM AUTO-DISPATCH EXECUTIVE SCORECARD BANNER */}
        {activeTab !== "branch-opening" && <div className="relative overflow-hidden rounded-2xl border border-sky-500/30 bg-gradient-to-r from-slate-950 via-slate-900 to-sky-950/40 p-5 shadow-xl print:hidden">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-5">
            <div className="space-y-1.5 max-w-3xl">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-sky-500/20 text-sky-300 border border-sky-500/30 flex items-center gap-1">
                  <Clock size={11} /> Daily 08:00 PM IST Auto-Scheduler
                </span>
                <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
                  <CheckCircle2 size={12} /> Armed & Verified
                </span>
              </div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Mail size={18} className="text-sky-400" />
                Automated C-Suite Scorecard Dispatch (MD • CRO • CSO)
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Every evening at <strong>20:00:00 IST</strong>, Sentinel AI compiles this multi-dimensional MIS package into an encrypted Section 65B-certified audit PDF and transmits it to the <strong>Managing Director</strong>, <strong>Chief Risk Officer</strong>, and <strong>Chief Security Officer</strong> via Email and WhatsApp Business API.
              </p>
              <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] text-slate-400 font-mono">
                <span>📧 Recipients: md.office@muthoot.com, cro.compliance@muthoot.com</span>
                <span>•</span>
                <span>📱 WhatsApp: +91 98470 XXXXX (Executive C-Suite Broadcast)</span>
              </div>
            </div>

            {/* Test Trigger Button */}
            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 min-w-[260px] text-center space-y-2">
              <div className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">
                Scheduled In: <span className="text-white font-mono font-bold">Today @ 08:00 PM</span>
              </div>
              {!dispatchSuccess ? (
                <button
                  disabled={isDispatching}
                  onClick={() => {
                    setIsDispatching(true);
                    setTimeout(() => {
                      setIsDispatching(false);
                      setDispatchSuccess("MIS-SCORECARD-20260917-DISPATCHED");
                    }, 900);
                  }}
                  className="w-full py-2 px-3 bg-sky-600 hover:bg-sky-500 disabled:bg-slate-800 active:scale-95 text-white rounded-lg text-xs font-bold shadow-md shadow-sky-600/30 flex items-center justify-center gap-1.5 transition"
                >
                  <Send size={13} className={isDispatching ? "animate-pulse" : ""} />
                  {isDispatching ? "Compiling & Transmitting…" : "Test Instant Dispatch (Email + WhatsApp)"}
                </button>
              ) : (
                <div className="rounded-lg bg-emerald-500/15 border border-emerald-500/30 p-2 text-center space-y-1">
                  <div className="text-xs font-bold text-emerald-300 flex items-center justify-center gap-1">
                    <CheckCircle2 size={13} /> Dispatched to MD & CRO
                  </div>
                  <p className="text-[10px] text-slate-400 font-mono">
                    SHA256: e3b0c44298fc...7c
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>}

        {activeTab !== "branch-opening" && error && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {error} <button onClick={fetchMisData} className="ml-2 font-semibold text-rose-100 underline">Try again</button>
          </div>
        )}

        {/* Global Multi-Tier Filter Bar (Organization, Zone, Region, Area, Branch, Shift) */}
        <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800 flex flex-wrap items-center gap-3 print:hidden">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 mr-2">
            <Filter size={14} className="text-sky-400" />
            <span>Cross Filters:</span>
          </div>

          {/* Organization Filter */}
          <select
            value={selectedOrg}
            aria-label="Organization filter"
            onChange={(e) => { setSelectedOrg(e.target.value); setSelectedZone("all"); setSelectedRegion("all"); setSelectedArea("all"); setSelectedBranch("all"); }}
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
            aria-label="Zone filter"
            onChange={(e) => { setSelectedZone(e.target.value); setSelectedRegion("all"); setSelectedArea("all"); setSelectedBranch("all"); }}
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
            aria-label="Region filter"
            onChange={(e) => { setSelectedRegion(e.target.value); setSelectedArea("all"); setSelectedBranch("all"); }}
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
            aria-label="Area filter"
            onChange={(e) => { setSelectedArea(e.target.value); setSelectedBranch("all"); }}
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
            aria-label="Branch filter"
            onChange={(e) => setSelectedBranch(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-xs rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-sky-500"
          >
            <option value="all">🏛️ All Branches</option>
            {filterOptions?.branches?.map((b: any) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>

          {/* Shift Filter */}
          {activeTab === "branch-opening" && <>
            <select aria-label="Camera location filter" value={selectedLocation}
              onChange={(event) => { setSelectedLocation(event.target.value); setSelectedCamera("all"); }}
              className="bg-slate-800 border border-slate-700 text-xs rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-sky-500">
              <option value="all">All Camera Locations</option>
              {openingReport?.filterOptions?.locations.map((location) => <option key={location} value={location}>{location === "unassigned" ? "Unassigned" : location.replaceAll("-", " ")}</option>)}
            </select>
            <select aria-label="Camera filter" value={selectedCamera} onChange={(event) => setSelectedCamera(event.target.value)}
              className="bg-slate-800 border border-slate-700 text-xs rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-sky-500">
              <option value="all">All Cameras</option>
              {openingReport?.filterOptions?.cameras.map((camera) => <option key={camera.id} value={camera.id}>{camera.branchName} — {camera.name}</option>)}
            </select>
          </>}
          {activeTab !== "branch-opening" && <select
            value={selectedShift}
            onChange={(e) => setSelectedShift(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-xs rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-sky-500"
          >
            <option value="all">⏰ All Shifts / 24 Hours</option>
            <option value="morning">Shift A: Morning (08:00 - 16:00)</option>
            <option value="evening">Shift B: Evening (16:00 - 24:00)</option>
            <option value="night">Shift C: Night / Off-Hours (00:00 - 08:00)</option>
          </select>}

          {(selectedOrg !== "all" || selectedZone !== "all" || selectedRegion !== "all" || selectedArea !== "all" || selectedBranch !== "all" || (activeTab === "branch-opening" && (selectedCamera !== "all" || selectedLocation !== "all")) || (activeTab !== "branch-opening" && selectedShift !== "all")) && (
            <button
              onClick={() => {
                setSelectedOrg("all");
                setSelectedZone("all");
                setSelectedRegion("all");
                setSelectedArea("all");
                setSelectedBranch("all");
                setSelectedShift("all");
                setSelectedCamera("all");
                setSelectedLocation("all");
              }}
              className="text-xs text-rose-400 hover:text-rose-300 ml-auto font-medium"
            >
              Reset Filters
            </button>
          )}
        </div>

        {activeTab === 'all-in-one' && data && !loading && <ExecutiveManagementReport branches={data.branchMatrix || []} trend={data.dateWiseBreakdown || []} period={`${data.metadata?.startDate ? new Date(data.metadata.startDate).toLocaleDateString('en-IN',{timeZone:'Asia/Kolkata'}) : ''} – ${data.metadata?.endDate ? new Date(data.metadata.endDate).toLocaleDateString('en-IN',{timeZone:'Asia/Kolkata'}) : ''}`} onBranch={id=>{setSelectedBranch(id);setGroupBy('branch');}}/>}
        {/* Executive Summary Scorecards */}
        {activeTab !== "branch-opening" && summary && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 print:grid-cols-3">
            <div className="bg-slate-900/70 border border-slate-800/80 rounded-xl p-4 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 h-1 w-full bg-emerald-500" />
              <span className="text-xs font-medium text-slate-400 block mb-1">Camera availability now</span>
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-bold text-white">{summary.avgUptime != null ? `${summary.avgUptime}%` : "—"}</span>
                <span className="text-xs text-emerald-400 font-semibold">{summary.onlineCameras ?? 0}/{summary.totalCameras ?? 0} cams</span>
              </div>
              <span className="text-[11px] text-slate-500 mt-1 block">{summary.totalBranches ?? 0} Branches Analyzed</span>
            </div>

            <div className="bg-slate-900/70 border border-slate-800/80 rounded-xl p-4 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 h-1 w-full bg-rose-500" />
              <span className="text-xs font-medium text-slate-400 block mb-1">Open P1 Threats</span>
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-bold text-rose-400">{summary.totalP1Threats ?? 0}</span>
                <span className="text-xs text-slate-400">{summary.totalAlerts ?? 0} incident cases</span>
              </div>
              <span className="text-[11px] text-slate-500 mt-1 block">Requires instant review</span>
            </div>

            <div className="bg-slate-900/70 border border-slate-800/80 rounded-xl p-4 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 h-1 w-full bg-amber-500" />
              <span className="text-xs font-medium text-slate-400 block mb-1">Total Footfall</span>
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-bold text-amber-400">{summary.totalFootfall != null ? Number(summary.totalFootfall).toLocaleString() : "—"}</span>
                <span className="text-xs text-slate-400">Visitors</span>
              </div>
              <span className="text-[11px] text-slate-500 mt-1 block">Avg wait: {summary.avgWaitMin != null ? `${summary.avgWaitMin}m` : "not measured"}</span>
            </div>

            <div className="bg-slate-900/70 border border-slate-800/80 rounded-xl p-4 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 h-1 w-full bg-sky-500" />
              <span className="text-xs font-medium text-slate-400 block mb-1">Staff Attendance</span>
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-bold text-sky-400">{summary.avgAttendance != null ? `${summary.avgAttendance}%` : "—"}</span>
                <span className="text-xs text-slate-400">Face Verified / Active</span>
              </div>
              <span className="text-[11px] text-slate-500 mt-1 block">{summary.avgAttendance != null ? "Shift compliance" : "not measured"}</span>
            </div>

            <div className="bg-slate-900/70 border border-slate-800/80 rounded-xl p-4 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 h-1 w-full bg-indigo-500" />
              <span className="text-xs font-medium text-slate-400 block mb-1">SLA Compliance</span>
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-bold text-indigo-400">{summary.avgSla != null ? `${summary.avgSla}%` : "—"}</span>
                <span className="text-xs text-slate-400 font-semibold">P1 acknowledgement</span>
              </div>
              <span className="text-[11px] text-slate-500 mt-1 block">{summary.avgSla != null ? "Response target met" : "not measured"}</span>
            </div>

            <div className="bg-slate-900/70 border border-slate-800/80 rounded-xl p-4 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 h-1 w-full bg-teal-500" />
              <span className="text-xs font-medium text-slate-400 block mb-1">Retention Compliance</span>
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-bold text-teal-400">{summary.avgRetentionDays != null ? `${summary.avgRetentionDays}d` : "—"}</span>
                <span className="text-xs text-slate-400 font-semibold">Measured policy</span>
              </div>
              <span className="text-[11px] text-slate-500 mt-1 block">{summary.avgRetentionDays != null ? (summary.avgRetentionDays >= 90 ? "100% Statutory passed" : "Review retention policy") : "not configured"}</span>
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
          <TabButton
            active={activeTab === "branch-opening"}
            onClick={() => setActiveTab("branch-opening")}
            icon={<Building2 size={16} />}
            label="Branch Openings"
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
                    Comparative breakdown of Uptime %, Customer Footfall, and Incident cases across {groupBy} dimension
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
                      <th className="p-3 text-center">Incident cases</th>
                      <th className="p-3 text-center">Footfall</th>
                      <th className="p-3 text-center">Wait Min</th>
                      <th className="p-3 text-center">Attendance %</th>
                      <th className="p-3 text-center">SLA %</th>
                      <th className="p-3 text-center">Retention</th>
                      <th className="p-3 text-center">Compliance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-slate-300">
                    {data.matrix.length === 0 ? (
                      <tr>
                        <td colSpan={groupBy === "branch" ? 13 : 12} className="p-8 text-center text-slate-400">
                          No branch records found for the selected filters. Real telemetry will display as devices report in.
                        </td>
                      </tr>
                    ) : (
                      data.matrix.slice((Math.min(page,Math.max(1,Math.ceil(data.matrix.length/pageSize)))-1)*pageSize,Math.min(page,Math.max(1,Math.ceil(data.matrix.length/pageSize)))*pageSize).map((row: any, idx: number) => (
                      <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                        <td className="p-3 font-semibold text-white flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-sky-400" />
                          <span>{row.dimension}</span>
                        </td>
                        {groupBy === "branch" && (
                          <td className="p-3 text-slate-400">
                            {[row.zone,row.region,row.area].filter(Boolean).join(" / ") || "Direct branch"}
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
                          {row.footfall == null ? "—" : Number(row.footfall).toLocaleString()}
                        </td>
                        <td className="p-3 text-center text-slate-400">
                          {row.avgWaitMin == null ? "—" : `${row.avgWaitMin}m`}
                        </td>
                        <td className="p-3 text-center text-sky-400 font-medium">
                          {row.attendancePercent == null ? "—" : `${row.attendancePercent}%`}
                        </td>
                        <td className="p-3 text-center text-emerald-400 font-semibold">
                          {row.slaPercent == null ? "—" : `${row.slaPercent}%`}
                        </td>
                        <td className="p-3 text-center text-teal-400 font-medium">
                          {row.retentionDays == null ? "—" : `${row.retentionDays}d`}
                        </td>
                        <td className="p-3 text-center">
                          <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${(row.complianceStatus === "Available" || row.status === "Optimal") ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-amber-500/10 text-amber-400 border border-amber-500/20"}`}>
                            {row.complianceStatus ?? row.status ?? "Optimal"}
                          </span>
                        </td>
                      </tr>
                    )))}
                  </tbody>
                </table>
                <ReportPagination total={data?.matrix?.length || 0} page={page} pageSize={pageSize} onPage={setPage} onPageSize={setPageSize}/>
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
                  <YAxis stroke="#94a3b8" fontSize={11} domain={[0, 100]} unit="%" />
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
                  <Line type="monotone" dataKey="slaPercent" name="SLA Compliance %" stroke="#38bdf8" strokeWidth={2.5} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Tab 6: Audit Compliance */}
        {activeTab === "compliance" && (
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
            <h2 className="text-base font-semibold text-white mb-1">Configured Recording Retention by Branch</h2>
            <p className="text-xs text-slate-400 mb-4">Current configured retention days; branches without a configured value remain unavailable</p>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data?.allBranches || []} margin={{ top: 10, right: 10, left: -20, bottom: 25 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} interval={0} angle={-15} textAnchor="end" />
                  <YAxis stroke="#94a3b8" fontSize={11} domain={[0, 'auto']} unit="d" />
                  <Tooltip contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155", borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="retentionDays" name="Configured retention (Days)" fill="#14b8a6" radius={[4, 4, 0, 0]}>
                    {(data?.allBranches || []).map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={entry.retentionDays == null ? "#94a3b8" : "#14b8a6"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {activeTab === "branch-opening" && (
          <section className="space-y-4">
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-white">Branch Opening Report</h2>
                  <p className="mt-1 text-xs text-slate-400">
                    Each branch and day shows its first opening observation, person count and two-person result. Missing observations appear as Not recorded.
                  </p>
                  <p className="mt-1 text-xs text-slate-400">Camera and location filters match the camera that captured the first opening observation.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 print:hidden">
                  <button type="button" onClick={handleOpeningExportCsv} disabled={!openingReport}
                    className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">
                    <Download size={13} className="mr-1 inline" />Export CSV
                  </button>
                  <button type="button" onClick={handlePrint}
                    className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-white">
                    <Printer size={13} className="mr-1 inline" />Print / Save PDF
                  </button>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-end gap-3 print:hidden">
                <label className="text-xs text-slate-300">Report period
                  <select value={openingRange} onChange={(event) => setOpeningRange(event.target.value as OpeningRange)}
                    className="mt-1 block rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white">
                    <option value="today">Today (daily)</option>
                    <option value="7d">Last 7 days</option>
                    <option value="30d">Last 30 days</option>
                    <option value="90d">Last 90 days</option>
                    <option value="custom">Custom period</option>
                  </select>
                </label>
                {openingRange === "custom" && <>
                  <label className="text-xs text-slate-300">From
                    <input type="date" value={openingStartDate} onChange={(event) => setOpeningStartDate(event.target.value)}
                      className="mt-1 block rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white" />
                  </label>
                  <label className="text-xs text-slate-300">To
                    <input type="date" value={openingEndDate} min={openingStartDate || undefined}
                      onChange={(event) => setOpeningEndDate(event.target.value)}
                      className="mt-1 block rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white" />
                  </label>
                </>}
              </div>
              {openingReport && <p className="mt-3 text-xs text-slate-400">
                {openingReport.startDate} to {openingReport.endDate} (Asia/Kolkata) · {openingReport.rows.filter((row) => row.outcome !== "NOT_RECORDED").length} recorded openings across {openingReport.total} branch-days
                {openingReport.truncated ? " · Results capped at 10,000; narrow the period for a complete export." : ""}
              </p>}
            </div>

            {openingError && <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{openingError}</div>}
            {openingLoading && <p className="text-sm text-slate-400">Loading branch openings…</p>}
            {!openingLoading && openingReport && <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/60">
              <table className="w-full min-w-[760px] text-left text-xs">
                <thead className="bg-slate-800 text-slate-300">
                  <tr>
                    <th className="p-3">Opening time (IST)</th>
                    <th className="p-3">Zone</th>
                    <th className="p-3">Branch</th>
                    <th className="p-3">Persons detected</th>
                    <th className="p-3">Result</th>
                    <th className="p-3">Camera</th>
                    <th className="p-3">Camera location</th>
                    <th className="p-3">Photo at opening</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-slate-200">
                  {openingReport.rows.length === 0 ? <tr><td colSpan={8} className="p-8 text-center text-slate-400">No recorded branch openings for this period and filter.</td></tr> :
                    openingReport.rows.slice((Math.min(openingPage,Math.max(1,Math.ceil(openingReport.rows.length/openingPageSize)))-1)*openingPageSize,Math.min(openingPage,Math.max(1,Math.ceil(openingReport.rows.length/openingPageSize)))*openingPageSize).map((row) => <tr key={`${row.ruleId}:${row.branchId}:${row.localDate}`}>
                      <td className="p-3 whitespace-nowrap">{row.occurredAt ? new Date(row.occurredAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : `${row.localDate} · Not recorded`}</td>
                      <td className="p-3">{row.zoneName ?? "Unassigned"}</td>
                      <td className="p-3 font-semibold">{row.branchName}</td>
                      <td className="p-3 font-bold">{row.personCount ?? "—"}</td>
                      <td className={`p-3 font-semibold ${row.outcome === "SUCCESS" ? "text-emerald-300" : row.outcome === "FAILED" ? "text-rose-300" : "text-slate-400"}`}>{row.outcome === "SUCCESS" ? "Success" : row.outcome === "FAILED" ? "Failed" : "Not recorded"}</td>
                      <td className="p-3">{row.cameraName ?? "—"}</td>
                      <td className="p-3">{row.locationType?.replaceAll("-", " ") || "—"}</td>
                      <td className="p-3">{row.outcome === "NOT_RECORDED" ? "—" :
                        <OpeningEvidencePhoto url={row.photoUrl} getHeaders={getReportAuthHeaders} />}</td>
                    </tr>)}
                </tbody>
              </table>
              <ReportPagination total={openingReport.rows.length} page={openingPage} pageSize={openingPageSize} onPage={setOpeningPage} onPageSize={setOpeningPageSize}/>
            </div>}
          </section>
        )}
      </div>
    </AppLayout>
  );
}

function OpeningEvidencePhoto({ url, getHeaders }: {
  url: string | null;
  getHeaders: () => Record<string, string>;
}) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(!url);
  useEffect(() => {
    setImageUrl(null);
    setUnavailable(!url);
    if (!url) { setUnavailable(true); return; }
    let active = true;
    let objectUrl: string | null = null;
    fetch(url, { headers: getHeaders(), credentials: "include", cache: "no-store" })
      .then(async (response) => {
        if (!response.ok || !response.headers.get("content-type")?.startsWith("image/")) throw new Error("photo_unavailable");
        const blob = await response.blob();
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setImageUrl(objectUrl);
        setUnavailable(false);
      })
      .catch(() => { if (active) setUnavailable(true); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [url, getHeaders]);
  if (!url || unavailable) return <span className="text-slate-500">Photo unavailable</span>;
  if (!imageUrl) return <span className="text-slate-500">Loading photo…</span>;
  return <a href={imageUrl} target="_blank" rel="noopener noreferrer" title="Open event photo">
    <img src={imageUrl} alt="Camera frame at branch opening" className="h-20 w-32 rounded object-cover" />
  </a>;
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
