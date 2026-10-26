"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Users,
  ShieldCheck,
  Download,
  RefreshCw,
  Search,
  Filter,
  Clock,
  Laptop,
  Smartphone,
  Globe,
  CheckCircle2,
  AlertCircle,
  LogOut,
  LogIn,
  ArrowUpRight,
  Network,
  Calendar,
  Layers,
  FileSpreadsheet,
} from "lucide-react";
import { AppLayout } from "@/components/app-layout";

type DeviceInfo = {
  browser?: string;
  os?: string;
  deviceType?: string;
  platform?: string;
  screenResolution?: string;
  userAgent?: string;
  computerName?: string;
};

type LoginRecord = {
  sessionId: string;
  userId: string;
  displayName: string;
  username: string;
  userRole: string;
  loginTime: string;
  logoutTime: string | null;
  lastActivityTime: string;
  totalDurationSeconds: number | null;
  activeDurationSeconds: number;
  idleDurationSeconds: number;
  ipAddress: string;
  deviceInfo: DeviceInfo;
  sessionStatus: "active" | "logged_out" | "expired" | "terminated" | string;
  terminationReason: string;
};

type UserOption = {
  id: string;
  displayName: string;
  username: string;
};

type ReportData = {
  summary: {
    totalLogins: number;
    uniqueUsers: number;
    activeSessions: number;
    avgDurationSeconds: number;
    generatedAt: string;
  };
  users: UserOption[];
  logins: LoginRecord[];
  total: number;
};

export default function UserLoginsReportPage() {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Filters
  const [selectedUserId, setSelectedUserId] = useState<string>("all");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "logged_out">("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [page, setPage] = useState<number>(1);
  const pageSize = 50;
  
  const [isExporting, setIsExporting] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date());

  function getReportAuthHeaders(): Record<string, string> {
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

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (selectedUserId && selectedUserId !== "all") params.set("userId", selectedUserId);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      if (statusFilter && statusFilter !== "all") params.set("status", statusFilter);
      if (searchQuery.trim()) params.set("search", searchQuery.trim());
      params.set("limit", String(pageSize));
      params.set("offset", String((page - 1) * pageSize));

      const response = await fetch(`/api/control/v1/reports/user-logins?${params.toString()}`, {
        headers: getReportAuthHeaders(),
        credentials: "include",
        cache: "no-store",
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) {
        throw new Error(result.message || result.error || "Unable to load user login audit history");
      }

      setData(result.data);
      setLastRefreshedAt(new Date());
    } catch (err: any) {
      setError(err?.message || "Failed to load report data");
    } finally {
      setLoading(false);
    }
  }, [selectedUserId, startDate, endDate, statusFilter, searchQuery, page]);

  useEffect(() => {
    void loadData();
    if (!autoRefresh) return;
    const timer = setInterval(() => {
      void loadData();
    }, 25_000);
    return () => clearInterval(timer);
  }, [loadData, autoRefresh]);

  const handleExportCsv = async () => {
    setIsExporting(true);
    try {
      const params = new URLSearchParams();
      if (selectedUserId && selectedUserId !== "all") params.set("userId", selectedUserId);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      if (statusFilter && statusFilter !== "all") params.set("status", statusFilter);
      if (searchQuery.trim()) params.set("search", searchQuery.trim());

      const res = await fetch(`/api/control/v1/reports/user-logins/csv?${params.toString()}`, {
        headers: getReportAuthHeaders(),
        credentials: "include",
      });
      if (!res.ok) throw new Error("CSV download request failed");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `user_login_logout_report_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert("Failed to export CSV: " + (err?.message || "Server error"));
    } finally {
      setIsExporting(false);
    }
  };

  const handleResetFilters = () => {
    setSelectedUserId("all");
    setStartDate("");
    setEndDate("");
    setStatusFilter("all");
    setSearchQuery("");
    setPage(1);
  };

  function formatTime(iso: string | null | undefined): string {
    if (!iso) return "—";
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return "—";
      return d.toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      }) + " IST";
    } catch {
      return iso;
    }
  }

  function formatDuration(seconds: number | null | undefined): string {
    if (seconds == null || seconds <= 0) return "—";
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const sec = seconds % 60;
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${sec}s`;
    return `${sec}s`;
  }

  function getDeviceIcon(deviceType?: string) {
    const t = (deviceType || "").toLowerCase();
    if (t.includes("phone") || t.includes("mobile") || t.includes("android") || t.includes("ios")) {
      return <Smartphone className="h-4 w-4 text-amber-400" />;
    }
    return <Laptop className="h-4 w-4 text-cyan-400" />;
  }

  const totalPages = Math.ceil((data?.total || 0) / pageSize) || 1;

  return (
    <AppLayout>
      <main className="content p-6 space-y-6 max-w-[1600px] mx-auto text-slate-100">
        {/* Top Header */}
        <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold tracking-wider text-cyan-400 uppercase">
              <ShieldCheck className="h-4 w-4" />
              <span>Audit & Compliance Telemetry</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white mt-1">
              User Login & Logout Audit Report
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              User-wise authenticated login/logout timestamps, login IP addresses, client device details, OS, and session durations.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5">
            <Link
              href="/reports/edge-connectivity"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-slate-900 border border-slate-700 hover:border-slate-600 text-slate-200 transition-colors shadow-sm"
            >
              <Network className="h-3.5 w-3.5 text-cyan-400" />
              Edge & Camera Connectivity
            </Link>

            <Link
              href="/reports"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-slate-900 border border-slate-700 hover:border-slate-600 text-slate-200 transition-colors shadow-sm"
            >
              <Layers className="h-3.5 w-3.5 text-indigo-400" />
              All Reports Hub
            </Link>

            <button
              type="button"
              onClick={handleExportCsv}
              disabled={isExporting || loading || !data?.logins.length}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white transition-colors shadow-sm cursor-pointer"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              {isExporting ? "Exporting..." : "Export CSV"}
            </button>

            <button
              type="button"
              onClick={() => void loadData()}
              disabled={loading}
              title="Refresh telemetry"
              className="inline-flex items-center justify-center p-2 rounded-lg bg-slate-900 border border-slate-700 hover:border-slate-600 text-slate-300 transition-colors"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin text-cyan-400" : ""}`} />
            </button>
          </div>
        </header>

        {/* Error Notice */}
        {error && (
          <div className="rounded-xl border border-rose-800 bg-rose-950/40 p-4 text-sm text-rose-200 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
            <button
              type="button"
              onClick={() => void loadData()}
              className="text-xs bg-rose-900/60 hover:bg-rose-800 border border-rose-700 px-2.5 py-1 rounded text-rose-100"
            >
              Retry
            </button>
          </div>
        )}

        {/* 4 Summary Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Total Logins */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 relative overflow-hidden">
            <div className="flex items-center justify-between text-xs uppercase font-medium text-slate-400">
              <span>Total Login Sessions</span>
              <LogIn className="h-4 w-4 text-cyan-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-slate-100">
                {data?.summary.totalLogins ?? (loading ? "…" : 0)}
              </span>
              <span className="text-xs text-slate-400">sessions recorded</span>
            </div>
            <div className="mt-3 text-xs text-slate-400">
              Audit log from user_activity_sessions
            </div>
          </div>

          {/* Card 2: Active Online Sessions */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 relative overflow-hidden">
            <div className="flex items-center justify-between text-xs uppercase font-medium text-slate-400">
              <span>Currently Active Sessions</span>
              <Globe className="h-4 w-4 text-emerald-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-emerald-300">
                {data?.summary.activeSessions ?? (loading ? "…" : 0)}
              </span>
              <span className="text-xs text-slate-400">online operators</span>
            </div>
            <div className="mt-3 flex items-center gap-1.5 text-xs text-emerald-400">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>Live authenticated connections</span>
            </div>
          </div>

          {/* Card 3: Unique Users */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 relative overflow-hidden">
            <div className="flex items-center justify-between text-xs uppercase font-medium text-slate-400">
              <span>Unique Active Accounts</span>
              <Users className="h-4 w-4 text-indigo-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-indigo-300">
                {data?.summary.uniqueUsers ?? (loading ? "…" : 0)}
              </span>
              <span className="text-xs text-slate-400">distinct users</span>
            </div>
            <div className="mt-3 text-xs text-slate-400">
              Security operators & supervisors
            </div>
          </div>

          {/* Card 4: Avg Session Duration */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 relative overflow-hidden">
            <div className="flex items-center justify-between text-xs uppercase font-medium text-slate-400">
              <span>Avg Session Duration</span>
              <Clock className="h-4 w-4 text-amber-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-amber-300">
                {data?.summary.avgDurationSeconds ? formatDuration(data.summary.avgDurationSeconds) : (loading ? "…" : "0m")}
              </span>
              <span className="text-xs text-slate-400">per login</span>
            </div>
            <div className="mt-3 text-xs text-slate-400">
              Measured from login to logout
            </div>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl space-y-3">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-400 uppercase tracking-wider">
            <span className="flex items-center gap-1.5">
              <Filter className="h-3.5 w-3.5 text-cyan-400" />
              Filter User Login Telemetry
            </span>
            <button
              type="button"
              onClick={handleResetFilters}
              className="text-cyan-400 hover:text-cyan-300 text-xs font-medium cursor-pointer"
            >
              Reset Filters
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {/* User Dropdown */}
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">Employee / User</label>
              <select
                value={selectedUserId}
                onChange={(e) => { setSelectedUserId(e.target.value); setPage(1); }}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
              >
                <option value="all">All Users</option>
                {data?.users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.displayName} ({u.username})
                  </option>
                ))}
              </select>
            </div>

            {/* Start Date */}
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">From Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
              />
            </div>

            {/* End Date */}
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">To Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
              />
            </div>

            {/* Status Filter */}
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">Session Status</label>
              <select
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value as any); setPage(1); }}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
              >
                <option value="all">All Statuses</option>
                <option value="active">Active Only</option>
                <option value="logged_out">Logged Out Only</option>
              </select>
            </div>

            {/* Search Input */}
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">Search Keyword</label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-500" />
                <input
                  type="text"
                  placeholder="Name, IP, Browser, OS..."
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Data Table */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-xl">
          <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
              <LogIn className="h-4 w-4 text-cyan-400" />
              <span>Login & Logout Activity Records ({data?.total ?? 0})</span>
            </div>
            <div className="text-xs text-slate-400">
              Page {page} of {totalPages}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/70 border-b border-slate-800 text-slate-400 uppercase text-[10px] font-semibold tracking-wider">
                <tr>
                  <th className="px-4 py-3">User / Identity</th>
                  <th className="px-4 py-3">Login Time (IST)</th>
                  <th className="px-4 py-3">Logout Time (IST)</th>
                  <th className="px-4 py-3">Duration</th>
                  <th className="px-4 py-3">Login IP Address</th>
                  <th className="px-4 py-3">Device & Browser</th>
                  <th className="px-4 py-3">Status / Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {loading && !data ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-slate-400">
                      <RefreshCw className="h-6 w-6 animate-spin mx-auto text-cyan-400 mb-2" />
                      Loading user login history...
                    </td>
                  </tr>
                ) : data?.logins.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-slate-500">
                      <Users className="h-8 w-8 mx-auto text-slate-600 mb-2" />
                      No login records found matching the selected filters.
                    </td>
                  </tr>
                ) : (
                  data?.logins.map((item) => {
                    const isActive = item.sessionStatus === "active" && !item.logoutTime;
                    return (
                      <tr key={item.sessionId} className="hover:bg-slate-800/40 transition-colors">
                        {/* User Identity */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="h-7 w-7 rounded-full bg-cyan-900/60 border border-cyan-700/60 flex items-center justify-center font-bold text-cyan-300 text-xs">
                              {item.displayName.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="font-semibold text-slate-100 flex items-center gap-1.5">
                                <span>{item.displayName}</span>
                                <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 font-normal">
                                  {item.userRole}
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-400 font-mono">
                                {item.username}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Login Time */}
                        <td className="px-4 py-3 text-slate-300 font-mono text-[11px]">
                          <div className="flex items-center gap-1.5">
                            <LogIn className="h-3.5 w-3.5 text-emerald-400" />
                            <span>{formatTime(item.loginTime)}</span>
                          </div>
                        </td>

                        {/* Logout Time */}
                        <td className="px-4 py-3 text-slate-300 font-mono text-[11px]">
                          {isActive ? (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                              Active Session
                            </span>
                          ) : (
                            <div className="flex items-center gap-1.5 text-slate-300">
                              <LogOut className="h-3.5 w-3.5 text-slate-500" />
                              <span>{formatTime(item.logoutTime)}</span>
                            </div>
                          )}
                        </td>

                        {/* Duration */}
                        <td className="px-4 py-3 font-semibold text-slate-200">
                          <div>{formatDuration(item.totalDurationSeconds)}</div>
                          {item.activeDurationSeconds > 0 && (
                            <div className="text-[10px] text-slate-400 font-normal">
                              Active: {formatDuration(item.activeDurationSeconds)}
                            </div>
                          )}
                        </td>

                        {/* Login IP */}
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1.5 font-mono text-[11px] px-2 py-1 rounded bg-slate-950 border border-slate-800 text-cyan-300">
                            <Network className="h-3 w-3 text-slate-500" />
                            {item.ipAddress}
                          </span>
                        </td>

                        {/* Device & Browser */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {getDeviceIcon(item.deviceInfo.deviceType)}
                            <div>
                              <div className="font-medium text-slate-200">
                                {item.deviceInfo.os || "Unknown OS"} · {item.deviceInfo.browser || "Unknown Browser"}
                              </div>
                              <div className="text-[10px] text-slate-400">
                                {item.deviceInfo.deviceType || "Desktop"} 
                                {item.deviceInfo.screenResolution ? ` (${item.deviceInfo.screenResolution})` : ""}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Status / Termination Reason */}
                        <td className="px-4 py-3">
                          {isActive ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/20">
                              <CheckCircle2 className="h-3 w-3" />
                              Active
                            </span>
                          ) : (
                            <div>
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-slate-800 text-slate-300 border border-slate-700">
                                Logged Out
                              </span>
                              <div className="text-[10px] text-slate-400 mt-0.5">
                                {item.terminationReason}
                              </div>
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

          {/* Pagination Controls */}
          <div className="px-5 py-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
            <span>
              Showing {data?.logins.length || 0} of {data?.total || 0} records
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
                className="px-3 py-1 rounded bg-slate-950 border border-slate-800 disabled:opacity-40 hover:bg-slate-800 text-slate-200 cursor-pointer"
              >
                Previous
              </button>
              <span className="text-slate-300 font-medium">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || loading}
                className="px-3 py-1 rounded bg-slate-950 border border-slate-800 disabled:opacity-40 hover:bg-slate-800 text-slate-200 cursor-pointer"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </main>
    </AppLayout>
  );
}
