"use client";

import React from "react";
import { Search, Filter, RefreshCw, Download, SlidersHorizontal } from "lucide-react";

interface FleetFilterBarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  searchPlaceholder?: string;
  selectedStatus?: string;
  onStatusChange?: (status: string) => void;
  statusOptions?: Array<{ label: string; value: string }>;
  selectedRegion?: string;
  onRegionChange?: (region: string) => void;
  regionOptions?: Array<{ label: string; value: string }>;
  onRefresh?: () => void;
  onExport?: () => void;
  className?: string;
}

export function FleetFilterBar({
  searchQuery,
  onSearchChange,
  searchPlaceholder = "Search fleet by name, code, IP, or ID...",
  selectedStatus,
  onStatusChange,
  statusOptions = [
    { label: "All Statuses", value: "ALL" },
    { label: "Healthy", value: "HEALTHY" },
    { label: "Warning", value: "WARNING" },
    { label: "Critical", value: "CRITICAL" },
    { label: "Offline", value: "OFFLINE" },
    { label: "🔴 Retention Deficit (< Required)", value: "RETENTION_DEFICIT" },
    { label: "Maintenance", value: "MAINTENANCE" },
  ],
  selectedRegion,
  onRegionChange,
  regionOptions = [
    { label: "All Regions", value: "ALL" },
    { label: "Kerala Central", value: "KERALA_CENTRAL" },
    { label: "Kerala South", value: "KERALA_SOUTH" },
    { label: "Karnataka North", value: "KARNATAKA_NORTH" },
    { label: "Tamil Nadu Metro", value: "TAMIL_NADU_METRO" },
  ],
  onRefresh,
  onExport,
  className = "",
}: FleetFilterBarProps) {
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 p-3.5 bg-slate-900/60 backdrop-blur-md border border-slate-800/80 rounded-xl ${className}`}
    >
      <div className="flex flex-1 flex-wrap items-center gap-2.5 min-w-[280px]">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full pl-9 pr-3.5 py-2 bg-slate-950/70 border border-slate-800 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500/80 focus:ring-1 focus:ring-blue-500/80 transition-colors"
          />
        </div>

        {onStatusChange && (
          <div className="flex items-center gap-1.5 bg-slate-950/70 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-300">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedStatus || "ALL"}
              onChange={(e) => onStatusChange(e.target.value)}
              className="bg-transparent border-0 text-slate-200 text-xs focus:outline-none cursor-pointer"
            >
              {statusOptions.map((opt) => (
                <option key={opt.value} value={opt.value} className="bg-slate-900 text-slate-200">
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {onRegionChange && (
          <div className="flex items-center gap-1.5 bg-slate-950/70 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-300">
            <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedRegion || "ALL"}
              onChange={(e) => onRegionChange(e.target.value)}
              className="bg-transparent border-0 text-slate-200 text-xs focus:outline-none cursor-pointer"
            >
              {regionOptions.map((opt) => (
                <option key={opt.value} value={opt.value} className="bg-slate-900 text-slate-200">
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        {onRefresh && (
          <button
            onClick={onRefresh}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 border border-slate-700/60 rounded-lg text-xs font-medium transition-colors"
            title="Refresh fleet data"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
        )}

        {onExport && (
          <button
            onClick={onExport}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-medium transition-colors shadow-sm"
            title="Export CSV report"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export</span>
          </button>
        )}
      </div>
    </div>
  );
}
