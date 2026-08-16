"use client";

import React from "react";
import {
  X,
  FileText,
  Download,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  HelpCircle,
  TrendingDown,
  Calendar,
  Building,
} from "lucide-react";

export interface RetentionReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  report?: {
    date: string;
    totalBranches: number;
    fullyCompliant: number;
    atRisk: number;
    retentionViolations: number;
    criticalViolations: number;
    unableToVerify: number;
    worstOffenders: Array<{
      branchId: string;
      branchName: string;
      requiredDays: number;
      actualDays: number;
      deficitDays: number;
      state: string;
    }>;
    predictedViolations7Days: Array<{
      branchId: string;
      branchName: string;
      predictedDays: number;
      daysUntilViolation: number;
    }>;
  };
}

export function RetentionReportModal({
  isOpen,
  onClose,
  report,
}: RetentionReportModalProps) {
  if (!isOpen) return null;

  const data = report ?? {
    date: new Date().toISOString().split("T")[0],
    totalBranches: 400,
    fullyCompliant: 351,
    atRisk: 19,
    retentionViolations: 17,
    criticalViolations: 8,
    unableToVerify: 5,
    worstOffenders: [
      {
        branchId: "branch-204",
        branchName: "Thrissur 04 — Round North",
        requiredDays: 90,
        actualDays: 61.0,
        deficitDays: 29.0,
        state: "CRITICAL",
      },
      {
        branchId: "branch-178",
        branchName: "Aluva Central — Bank Square",
        requiredDays: 90,
        actualDays: 61.4,
        deficitDays: 28.6,
        state: "CRITICAL",
      },
      {
        branchId: "branch-111",
        branchName: "Kottayam 11 — Collectorate Jn",
        requiredDays: 90,
        actualDays: 66.0,
        deficitDays: 24.0,
        state: "CRITICAL",
      },
      {
        branchId: "branch-013",
        branchName: "Kochi 13 — Marine Drive",
        requiredDays: 90,
        actualDays: 72.0,
        deficitDays: 18.0,
        state: "VIOLATION",
      },
    ],
    predictedViolations7Days: [
      {
        branchId: "branch-102",
        branchName: "Kochi 02 — Palarivattom",
        predictedDays: 87.0,
        daysUntilViolation: 2,
      },
      {
        branchId: "branch-055",
        branchName: "Calicut 05 — Mavoor Road",
        predictedDays: 88.5,
        daysUntilViolation: 4,
      },
    ],
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-3xl rounded-xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden font-sans">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4 bg-slate-950/80">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-400">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-100 flex items-center gap-2">
                Daily Retention Compliance Report
              </h3>
              <p className="text-xs text-slate-400">
                Regulatory Banking CCTV Audit • Date: <span className="font-mono text-slate-300">{data.date}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          {/* Executive Summary Stats */}
          <div className="grid grid-cols-5 gap-3">
            <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-lg text-center">
              <div className="text-[10px] font-mono uppercase text-slate-400">Total Branches</div>
              <div className="text-xl font-bold font-mono text-slate-100 mt-1">{data.totalBranches}</div>
            </div>
            <div className="p-3 bg-emerald-950/20 border border-emerald-500/30 rounded-lg text-center">
              <div className="text-[10px] font-mono uppercase text-emerald-400">Fully Compliant</div>
              <div className="text-xl font-bold font-mono text-emerald-300 mt-1">{data.fullyCompliant}</div>
            </div>
            <div className="p-3 bg-amber-950/20 border border-amber-500/30 rounded-lg text-center">
              <div className="text-[10px] font-mono uppercase text-amber-400">At Risk</div>
              <div className="text-xl font-bold font-mono text-amber-300 mt-1">{data.atRisk}</div>
            </div>
            <div className="p-3 bg-rose-950/20 border border-rose-500/30 rounded-lg text-center">
              <div className="text-[10px] font-mono uppercase text-rose-400">Violations</div>
              <div className="text-xl font-bold font-mono text-rose-300 mt-1">
                {data.retentionViolations + data.criticalViolations}
              </div>
            </div>
            <div className="p-3 bg-slate-900 border border-slate-700 rounded-lg text-center">
              <div className="text-[10px] font-mono uppercase text-slate-400">Cannot Verify</div>
              <div className="text-xl font-bold font-mono text-slate-300 mt-1">{data.unableToVerify}</div>
            </div>
          </div>

          {/* Worst Offenders Table */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4 text-rose-400" />
              <span>Highest Retention Deficits (Immediate Action Required)</span>
            </h4>
            <div className="divide-y divide-slate-800 rounded-lg border border-slate-800 bg-slate-950/40 text-xs font-sans overflow-hidden">
              <div className="grid grid-cols-12 py-2 px-3 bg-slate-950/90 font-mono text-[10px] uppercase text-slate-400 font-bold">
                <div className="col-span-5">Branch</div>
                <div className="col-span-2 text-center">Required</div>
                <div className="col-span-2 text-center">Actual</div>
                <div className="col-span-3 text-right">Deficit</div>
              </div>
              {data.worstOffenders.map((o) => (
                <div key={o.branchId} className="grid grid-cols-12 py-2.5 px-3 items-center">
                  <div className="col-span-5 font-semibold text-slate-200 truncate">
                    {o.branchName}
                    <span className="block text-[10px] font-mono text-slate-500">{o.branchId}</span>
                  </div>
                  <div className="col-span-2 text-center font-mono text-slate-300">{o.requiredDays} d</div>
                  <div className="col-span-2 text-center font-mono font-bold text-rose-400">{o.actualDays} d</div>
                  <div className="col-span-3 text-right font-mono font-bold text-rose-400">
                    -{o.deficitDays} days
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 7-Day Predictive Risk Table */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <TrendingDown className="h-4 w-4 text-amber-400" />
              <span>7-Day Forecast: Predicted Compliance Violations</span>
            </h4>
            <div className="divide-y divide-slate-800 rounded-lg border border-slate-800 bg-slate-950/40 text-xs font-sans overflow-hidden">
              <div className="grid grid-cols-12 py-2 px-3 bg-slate-950/90 font-mono text-[10px] uppercase text-slate-400 font-bold">
                <div className="col-span-6">Branch</div>
                <div className="col-span-3 text-center">Predicted Retention</div>
                <div className="col-span-3 text-right">Estimated Violation</div>
              </div>
              {data.predictedViolations7Days.map((p) => (
                <div key={p.branchId} className="grid grid-cols-12 py-2.5 px-3 items-center">
                  <div className="col-span-6 font-semibold text-slate-200 truncate">
                    {p.branchName}
                    <span className="block text-[10px] font-mono text-slate-500">{p.branchId}</span>
                  </div>
                  <div className="col-span-3 text-center font-mono font-bold text-amber-400">{p.predictedDays} d</div>
                  <div className="col-span-3 text-right font-mono font-bold text-amber-300">
                    In ~{p.daysUntilViolation} days
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-800 px-6 py-3.5 bg-slate-950/80 text-xs">
          <span className="text-slate-500 font-mono">Generated automatically by Surveillance Compliance Engine</span>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg font-medium bg-sky-600 hover:bg-sky-500 text-white shadow transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export Audit PDF</span>
          </button>
        </div>
      </div>
    </div>
  );
}
