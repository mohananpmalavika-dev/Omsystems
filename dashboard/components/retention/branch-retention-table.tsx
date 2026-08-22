"use client";

import React, { useState } from "react";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  Search,
  ArrowUpDown,
  ExternalLink,
  ChevronRight,
  TrendingDown,
  ShieldCheck,
  ShieldAlert,
} from "lucide-react";
import { CameraRetentionDetailModal } from "./camera-retention-detail-modal";

export interface BranchRetentionRow {
  branchId: string;
  branchName: string;
  cameraCount: number;
  healthy: number;
  warning: number;
  violation: number;
  critical: number;
  unknown: number;
  worstRetentionDays?: number;
  requiredRetentionDays: number;
  state: "HEALTHY" | "WARNING" | "VIOLATION" | "CRITICAL" | "UNKNOWN";
  complianceState: "COMPLIANT" | "VIOLATION" | "UNKNOWN";
  riskState: "STABLE" | "AT_RISK" | "IMMINENT" | "UNKNOWN";
  averageCoveragePercent: number;
  daysUntilViolation?: number;
  lastCheckedAt: string | Date;
}

export interface BranchRetentionTableProps {
  branches: BranchRetentionRow[];
  onSelectBranch?: (branchId: string) => void;
}

export function BranchRetentionTable({
  branches,
  onSelectBranch,
}: BranchRetentionTableProps) {
  const [search, setSearch] = useState("");
  const [selectedCameraModal, setSelectedCameraModal] = useState<{
    branchId: string;
    branchName: string;
    cameraId: string;
    cameraName: string;
  } | null>(null);

  const filtered = branches.filter((b) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return b.branchName.toLowerCase().includes(s) || b.branchId.toLowerCase().includes(s);
  });

  return (
    <div className="space-y-3">
      {/* Search Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search branches by name or ID..."
            className="w-full pl-9 pr-4 py-2 text-xs rounded-lg border border-slate-700 bg-slate-900 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </div>
        <div className="text-xs font-mono text-slate-400">
          Showing <strong className="text-slate-200">{filtered.length}</strong> of {branches.length} branches
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-lg">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-sans">
            <thead className="border-b border-slate-800 bg-slate-950/80 text-[11px] font-mono uppercase tracking-wider text-slate-400">
              <tr>
                <th className="py-3 px-4">Branch</th>
                <th className="py-3 px-3">Required</th>
                <th className="py-3 px-3">Lowest Actual</th>
                <th className="py-3 px-3">Forecast (HDD)</th>
                <th className="py-3 px-3">Coverage</th>
                <th className="py-3 px-3">Compliance</th>
                <th className="py-3 px-3">Risk State</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500 font-mono">
                    No branch retention records found matching "{search}"
                  </td>
                </tr>
              ) : (
                filtered.map((b) => {
                  const hasActual = b.worstRetentionDays !== undefined;
                  const isViolation = b.state === "VIOLATION" || b.state === "CRITICAL";
                  const isAtRisk = b.riskState === "AT_RISK" || b.riskState === "IMMINENT";

                  return (
                    <tr
                      key={b.branchId}
                      className="hover:bg-slate-800/30 transition-colors group cursor-pointer"
                      onClick={() => onSelectBranch?.(b.branchId)}
                    >
                      {/* Branch Info */}
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-100">{b.branchName}</div>
                        <div className="text-[11px] font-mono text-slate-500">
                          {b.branchId} • {b.cameraCount} channels
                        </div>
                      </td>

                      {/* Required */}
                      <td className="py-3 px-3 font-mono font-medium text-slate-300">
                        {b.requiredRetentionDays} d
                      </td>

                      {/* Lowest Actual */}
                      <td className="py-3 px-3 font-mono">
                        {hasActual ? (
                          <span
                            className={`font-bold ${
                              b.worstRetentionDays! < b.requiredRetentionDays
                                ? "text-rose-400 font-black"
                                : "text-emerald-400"
                            }`}
                          >
                            {b.worstRetentionDays} d
                          </span>
                        ) : (
                          <span className="text-slate-500 font-bold">—</span>
                        )}
                      </td>

                      {/* Forecast */}
                      <td className="py-3 px-3 font-mono text-slate-300">
                        {hasActual ? (
                          <span className={isAtRisk ? "text-amber-400 font-bold" : "text-slate-300"}>
                            {isAtRisk
                              ? `${Math.max(0, Math.round(b.worstRetentionDays! - 5))} d`
                              : `${Math.round(b.worstRetentionDays! + 1)} d`}
                          </span>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>

                      {/* Coverage */}
                      <td className="py-3 px-3 font-mono text-slate-300">
                        {b.averageCoveragePercent > 0 ? (
                          <span className={b.averageCoveragePercent < 98 ? "text-rose-400 font-bold" : "text-slate-300"}>
                            {b.averageCoveragePercent}%
                          </span>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>

                      {/* Compliance Status */}
                      <td className="py-3 px-3">
                        {b.complianceState === "COMPLIANT" ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                            <ShieldCheck className="w-3 h-3" /> COMPLIANT
                          </span>
                        ) : b.complianceState === "VIOLATION" ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-rose-500/10 border border-rose-500/30 text-rose-400">
                            <ShieldAlert className="w-3 h-3" /> VIOLATION
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-slate-800 border border-slate-700 text-slate-400">
                            <HelpCircle className="w-3 h-3" /> UNKNOWN
                          </span>
                        )}
                      </td>

                      {/* Predictive Risk */}
                      <td className="py-3 px-3">
                        {b.riskState === "STABLE" ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-900 border border-slate-800 text-slate-400">
                            STABLE
                          </span>
                        ) : b.riskState === "AT_RISK" || b.riskState === "IMMINENT" ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-amber-500/10 border border-amber-500/30 text-amber-400">
                            <AlertTriangle className="w-3 h-3" /> AT RISK
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-900 border border-slate-800 text-slate-500">
                            UNKNOWN
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedCameraModal({
                              branchId: b.branchId,
                              branchName: b.branchName,
                              cameraId: `cam-${b.branchId.replace("branch-", "")}-04`,
                              cameraName: "CAM04 — Vault",
                            });
                          }}
                          className="px-2.5 py-1 rounded text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors inline-flex items-center gap-1"
                        >
                          <span>Evidence</span>
                          <ChevronRight className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Selected Camera Detail Modal */}
      {selectedCameraModal && (
        <CameraRetentionDetailModal
          isOpen={Boolean(selectedCameraModal)}
          onClose={() => setSelectedCameraModal(null)}
          cameraId={selectedCameraModal.cameraId}
          cameraName={selectedCameraModal.cameraName}
          branchName={selectedCameraModal.branchName}
        />
      )}
    </div>
  );
}
