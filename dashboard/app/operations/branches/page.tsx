"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Building2,
  Wifi,
  Search,
  RefreshCw,
  SlidersHorizontal,
  ArrowUpRight,
  ShieldAlert,
} from "lucide-react";
import { AppLayout } from "@/components/app-layout";
import { StatusBadge } from "@/components/ui/status-badge";
import { FleetFilterBar } from "@/components/ui/fleet-filter-bar";

export default function FleetBranchesPage() {
  const [branches, setBranches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("ALL");
  const [selectedRegion, setSelectedRegion] = useState("ALL");

  const loadBranches = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/operations/branches");
      const data = await res.json();
      if (data.success) {
        setBranches(data.data);
      }
    } catch (err) {
      console.error("Failed to load branches:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBranches();
  }, []);

  const filtered = branches.filter((b) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!b.name.toLowerCase().includes(q) && !b.branchCode.toLowerCase().includes(q)) return false;
    }
    if (selectedStatus !== "ALL" && b.operationalState !== selectedStatus) return false;
    return true;
  });

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-white">Fleet Branches Status Board</h1>
            <p className="text-xs text-slate-400 mt-1">
              Authoritative edge telemetry & health projections across all fleet branches
            </p>
          </div>
          <button
            onClick={loadBranches}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-xs font-medium hover:bg-slate-700 transition-colors self-start sm:self-auto"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>
        </div>

        <FleetFilterBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          selectedStatus={selectedStatus}
          onStatusChange={setSelectedStatus}
          selectedRegion={selectedRegion}
          onRegionChange={setSelectedRegion}
          onRefresh={loadBranches}
        />

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-xl">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
              <tr>
                <th className="px-4 py-3">Branch</th>
                <th className="px-4 py-3">Operational Status</th>
                <th className="px-4 py-3">WAN / Internet</th>
                <th className="px-4 py-3">Cameras (16-CH)</th>
                <th className="px-4 py-3">Retention (90d)</th>
                <th className="px-4 py-3">Storage State</th>
                <th className="px-4 py-3">Alerts</th>
                <th className="px-4 py-3 text-right">Workspace</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filtered.map((b) => (
                <tr key={b.branchId} className="hover:bg-slate-800/40 transition-colors">
                  <td className="px-4 py-3.5">
                    <Link href={`/operations/branches/${b.branchId}`} className="block">
                      <div className="font-semibold text-slate-100 hover:text-blue-400 transition-colors">
                        {b.name}
                      </div>
                      <div className="text-slate-500 font-mono text-[11px]">{b.branchCode} • {b.region}</div>
                    </Link>
                  </td>
                  <td className="px-4 py-3.5">
                    <StatusBadge status={b.operationalState} size="sm" />
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-1.5">
                      <Wifi className={`w-3.5 h-3.5 ${b.internet.state === 'HEALTHY' ? 'text-emerald-400' : 'text-rose-400'}`} />
                      <span>{b.internet.mode} ({b.internet.latencyMs}ms)</span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="font-medium">{b.cameras.healthy}/{b.cameras.total} Streaming</div>
                    {b.cameras.notRecording > 0 && (
                      <div className="text-rose-400 font-medium text-[11px]">{b.cameras.notRecording} No Record</div>
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    <div className={b.retention.compliant ? "text-emerald-400" : "text-rose-400"}>
                      {b.retention.observedDays} / {b.retention.requiredDays} Days
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <StatusBadge status={b.storage.state} size="sm" />
                  </td>
                  <td className="px-4 py-3.5">
                    {b.alerts.p1 > 0 ? (
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-950 text-rose-300 border border-rose-800">
                        P1 × {b.alerts.p1}
                      </span>
                    ) : (
                      <span className="text-slate-500">0 P1</span>
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <Link
                      href={`/operations/branches/${b.branchId}`}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 text-xs font-medium transition-colors"
                    >
                      <span>Open</span>
                      <ArrowUpRight className="w-3 h-3" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppLayout>
  );
}
