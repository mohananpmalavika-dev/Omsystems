"use client";

import React, { useState, useEffect } from "react";
import {
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  HelpCircle,
  RefreshCw,
  FileText,
  Building,
  HardDrive,
} from "lucide-react";
import { BranchRetentionTable, type BranchRetentionRow } from "./branch-retention-table";
import { RetentionReportModal } from "./retention-report-modal";

export function RetentionComplianceDashboard() {
  const [branches, setBranches] = useState<BranchRetentionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "healthy" | "at_risk" | "violation" | "unknown">("all");
  const [showReportModal, setShowReportModal] = useState(false);

  useEffect(() => {
    fetchRetentionData();
  }, []);

  async function fetchRetentionData() {
    setLoading(true);
    try {
      const resp = await fetch("/api/control/v1/retention/branches?limit=400", {
        credentials: "include",
      });
      if (resp.ok) {
        const json = await resp.json();
        setBranches(json.data?.branches || []);
      } else {
        setBranches([]);
      }
    } catch {
      setBranches([]);
    } finally {
      setLoading(false);
    }
  }

  // Summary Metrics computed from live data
  const total = branches.length;
  const compliant = branches.filter((b) => b.complianceState === "COMPLIANT").length;
  const atRisk = branches.filter((b) => b.riskState === "AT_RISK" || b.riskState === "IMMINENT").length;
  const violations = branches.filter((b) => b.complianceState === "VIOLATION").length;
  const unknown = branches.filter((b) => b.complianceState === "UNKNOWN").length;

  const filteredBranches = branches.filter((b) => {
    if (filter === "all") return true;
    if (filter === "healthy") return b.complianceState === "COMPLIANT";
    if (filter === "at_risk") return b.riskState === "AT_RISK" || b.riskState === "IMMINENT";
    if (filter === "violation") return b.complianceState === "VIOLATION";
    if (filter === "unknown") return b.complianceState === "UNKNOWN";
    return true;
  });

  return (
    <div className="space-y-6 font-sans text-slate-100">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <HardDrive className="h-6 w-6 text-sky-400" />
            <span>Banking CCTV Retention Compliance Subsystem</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Auditable physical archive verification across {total > 0 ? `${total} live branches` : "fleet"} • Mandatory 90-Day Policy Invariant
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setShowReportModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors shadow-sm"
          >
            <FileText className="h-4 w-4 text-sky-400" />
            <span>Daily Audit Report</span>
          </button>

          <button
            onClick={fetchRetentionData}
            disabled={loading}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium bg-sky-600 hover:bg-sky-500 text-white transition-colors shadow-sm disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            <span>Refresh Fleet</span>
          </button>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div
          onClick={() => setFilter("all")}
          className={`p-4 rounded-xl border transition-all cursor-pointer ${
            filter === "all" ? "bg-slate-800/80 border-sky-500 shadow-md ring-1 ring-sky-500/30" : "bg-slate-900/60 border-slate-800 hover:border-slate-700"
          }`}
        >
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[11px] font-mono uppercase tracking-wider">Total Branches</span>
            <Building className="h-4 w-4 text-slate-500" />
          </div>
          <div className="text-2xl font-black font-mono text-slate-100">{total}</div>
        </div>

        <div
          onClick={() => setFilter("healthy")}
          className={`p-4 rounded-xl border transition-all cursor-pointer ${
            filter === "healthy" ? "bg-emerald-950/40 border-emerald-500 shadow-md ring-1 ring-emerald-500/30" : "bg-slate-900/60 border-slate-800 hover:border-slate-700"
          }`}
        >
          <div className="flex items-center justify-between text-emerald-400 mb-1">
            <span className="text-[11px] font-mono uppercase tracking-wider">Fully Compliant</span>
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-black font-mono text-emerald-400">{compliant}</div>
        </div>

        <div
          onClick={() => setFilter("at_risk")}
          className={`p-4 rounded-xl border transition-all cursor-pointer ${
            filter === "at_risk" ? "bg-amber-950/40 border-amber-500 shadow-md ring-1 ring-amber-500/30" : "bg-slate-900/60 border-slate-800 hover:border-slate-700"
          }`}
        >
          <div className="flex items-center justify-between text-amber-400 mb-1">
            <span className="text-[11px] font-mono uppercase tracking-wider">At Risk (Forecast)</span>
            <AlertTriangle className="h-4 w-4 text-amber-400" />
          </div>
          <div className="text-2xl font-black font-mono text-amber-400">{atRisk}</div>
        </div>

        <div
          onClick={() => setFilter("violation")}
          className={`p-4 rounded-xl border transition-all cursor-pointer ${
            filter === "violation" ? "bg-rose-950/40 border-rose-500 shadow-md ring-1 ring-rose-500/30" : "bg-slate-900/60 border-slate-800 hover:border-slate-700"
          }`}
        >
          <div className="flex items-center justify-between text-rose-400 mb-1">
            <span className="text-[11px] font-mono uppercase tracking-wider">Violations</span>
            <ShieldAlert className="h-4 w-4 text-rose-400" />
          </div>
          <div className="text-2xl font-black font-mono text-rose-400">{violations}</div>
        </div>

        <div
          onClick={() => setFilter("unknown")}
          className={`p-4 rounded-xl border transition-all cursor-pointer ${
            filter === "unknown" ? "bg-slate-800 border-slate-600 shadow-md ring-1 ring-slate-500" : "bg-slate-900/60 border-slate-800 hover:border-slate-700"
          }`}
        >
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[11px] font-mono uppercase tracking-wider">Cannot Verify</span>
            <HelpCircle className="h-4 w-4 text-slate-400" />
          </div>
          <div className="text-2xl font-black font-mono text-slate-300">{unknown}</div>
        </div>
      </div>

      {/* Core Compliance Rule Callout */}
      <div className="p-3.5 bg-sky-950/30 border border-sky-500/30 rounded-xl flex items-start gap-3 text-xs">
        <HelpCircle className="h-5 w-5 text-sky-400 shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <span className="font-semibold text-sky-200 uppercase font-mono tracking-wider">
            Evidence-Bearing Compliance Invariant (UNKNOWN ≠ HEALTHY)
          </span>
          <p className="text-slate-300 leading-relaxed">
            Retention is calculated strictly from verified archive evidence boundaries, not configured overwrite values.
            If a recorder is offline or unverified, its status is strictly <strong>UNKNOWN</strong> and excluded from compliance totals.
          </p>
        </div>
      </div>

      {/* Branch Table */}
      {loading ? (
        <div className="p-12 text-center text-slate-400 border border-slate-800 rounded-xl bg-slate-900/40">
          <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-sky-400" />
          <p className="text-sm">Loading live retention telemetry across fleet...</p>
        </div>
      ) : filteredBranches.length === 0 ? (
        <div className="p-12 text-center text-slate-400 border border-slate-800 rounded-xl bg-slate-900/40">
          <Building className="h-8 w-8 mx-auto mb-3 text-slate-500" />
          <p className="text-base font-medium text-slate-200 mb-1">No live branches matching filter</p>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Enrolling branch Edge Agents and configuring CCTV recorders will automatically stream verified archive evidence into this retention dashboard.
          </p>
        </div>
      ) : (
        <BranchRetentionTable branches={filteredBranches} />
      )}

      {/* Daily Audit Report Modal */}
      <RetentionReportModal isOpen={showReportModal} onClose={() => setShowReportModal(false)} />
    </div>
  );
}
