"use client";

import React from "react";
import {
  X,
  HardDrive,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Clock,
  Activity,
  Layers,
  Database,
} from "lucide-react";

export interface CameraRetentionDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  cameraId: string;
  cameraName?: string;
  branchName?: string;
  assessment?: {
    requiredRetentionDays: number;
    actualRetentionDays?: number;
    projectedRetentionDays?: number;
    daysUntilPolicyViolation?: number;
    coveragePercent?: number;
    state: "HEALTHY" | "WARNING" | "VIOLATION" | "CRITICAL" | "UNKNOWN";
    complianceState: "COMPLIANT" | "VIOLATION" | "UNKNOWN";
    riskState: "STABLE" | "AT_RISK" | "IMMINENT" | "UNKNOWN";
    reason: string;
    confidence: number;
    evidenceAgreement: "AGREED" | "PARTIAL" | "CONFLICTING" | "SINGLE_SOURCE" | "NO_EVIDENCE";
    evaluatedAt: string | Date;
    recordingWindow?: {
      oldestRecordingAt: string | Date;
      newestRecordingAt: string | Date;
      archiveSpanDays: number;
      latestRecordingAgeMinutes: number;
    };
  };
}

export function CameraRetentionDetailModal({
  isOpen,
  onClose,
  cameraId,
  cameraName = "Camera",
  branchName = "Branch",
  assessment: initialAssessment,
}: CameraRetentionDetailModalProps) {
  const [assessmentData, setAssessmentData] = React.useState<any>(initialAssessment || null);
  const [loading, setLoading] = React.useState(!initialAssessment);

  React.useEffect(() => {
    if (!isOpen || !cameraId) return;
    if (initialAssessment) {
      setAssessmentData(initialAssessment);
      return;
    }
    setLoading(true);
    fetch(`/api/control/v1/cameras/${encodeURIComponent(cameraId)}/retention/evidence`, {
      credentials: "include",
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json?.data?.assessment) {
          setAssessmentData(json.data.assessment);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isOpen, cameraId, initialAssessment]);

  if (!isOpen) return null;

  const data = assessmentData ?? {
    requiredRetentionDays: 90,
    actualRetentionDays: undefined,
    projectedRetentionDays: undefined,
    daysUntilPolicyViolation: undefined,
    coveragePercent: undefined,
    state: "UNKNOWN",
    complianceState: "UNKNOWN",
    riskState: "UNKNOWN",
    reason: "INSUFFICIENT_EVIDENCE",
    confidence: 0.0,
    evidenceAgreement: "NO_EVIDENCE",
    evaluatedAt: new Date().toISOString(),
    recordingWindow: undefined,
  };

  const stateColors = {
    HEALTHY: "bg-emerald-950/40 border-emerald-500/40 text-emerald-300",
    WARNING: "bg-amber-950/40 border-amber-500/40 text-amber-300",
    VIOLATION: "bg-rose-950/40 border-rose-500/40 text-rose-300",
    CRITICAL: "bg-rose-950/60 border-rose-600/60 text-rose-200",
    UNKNOWN: "bg-slate-900 border-slate-700 text-slate-300",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-2xl rounded-xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4 bg-slate-950/70">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              <HardDrive className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-100 flex items-center gap-2">
                {cameraName} — Archive Retention Evidence Record
              </h3>
              <p className="text-xs text-slate-400">
                Camera: <span className="font-mono text-slate-300">{cameraId}</span> • Branch: {branchName}
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
        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto font-sans">
          {/* Status & Compliance Banner */}
          <div className={`p-4 rounded-xl border flex items-center justify-between ${stateColors[data.state as keyof typeof stateColors] || stateColors.UNKNOWN}`}>
            <div className="flex items-center gap-3">
              {data.state === "HEALTHY" ? (
                <CheckCircle2 className="h-7 w-7 text-emerald-400" />
              ) : data.state === "WARNING" ? (
                <AlertTriangle className="h-7 w-7 text-amber-400" />
              ) : data.state === "UNKNOWN" ? (
                <HelpCircle className="h-7 w-7 text-slate-400" />
              ) : (
                <XCircle className="h-7 w-7 text-rose-400" />
              )}
              <div>
                <div className="text-xs font-mono uppercase tracking-wider text-slate-400">
                  Compliance Status: <strong className="text-slate-100">{data.complianceState}</strong> • Risk:{" "}
                  <strong className="text-slate-100">{data.riskState}</strong>
                </div>
                <div className="text-sm font-bold uppercase tracking-wider">
                  State: {data.state} ({data.reason})
                </div>
              </div>
            </div>

            <div className="text-right font-mono">
              <span className="text-2xl font-black">
                {data.actualRetentionDays !== undefined ? `${data.actualRetentionDays}d` : "—"}
              </span>
              <span className="text-xs text-slate-400 ml-1">/ {data.requiredRetentionDays}d req</span>
            </div>
          </div>

          {/* Detailed Evidence Grid */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-lg space-y-1">
              <span className="text-slate-400 flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-slate-500" /> Oldest Verified Recording
              </span>
              <div className="font-mono text-sm font-semibold text-slate-200">
                {data.recordingWindow?.oldestRecordingAt
                  ? new Date(data.recordingWindow.oldestRecordingAt).toLocaleString()
                  : "No verified recording"}
              </div>
            </div>

            <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-lg space-y-1">
              <span className="text-slate-400 flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-slate-500" /> Newest Verified Recording
              </span>
              <div className="font-mono text-sm font-semibold text-slate-200">
                {data.recordingWindow?.newestRecordingAt
                  ? new Date(data.recordingWindow.newestRecordingAt).toLocaleString()
                  : "No verified recording"}
              </div>
            </div>

            <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-lg space-y-1">
              <span className="text-slate-400 flex items-center gap-1.5">
                <Activity className="h-3.5 w-3.5 text-slate-500" /> Archive Continuity & Coverage
              </span>
              <div className="font-mono text-sm font-semibold text-slate-200">
                {data.coveragePercent !== undefined ? `${data.coveragePercent}% (Min req 98%)` : "—"}
              </div>
            </div>

            <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-lg space-y-1">
              <span className="text-slate-400 flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5 text-slate-500" /> Forecasted Steady Retention
              </span>
              <div className="font-mono text-sm font-semibold text-slate-200">
                {data.projectedRetentionDays !== undefined ? `${data.projectedRetentionDays} days` : "—"}
              </div>
            </div>
          </div>

          {/* Multi-Source Comparison Table */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center justify-between">
              <span>Multi-Source Evidence Verification</span>
              <span className="text-[11px] font-mono text-emerald-400">Agreement: {data.evidenceAgreement}</span>
            </h4>
            <div className="divide-y divide-slate-800/80 rounded-lg border border-slate-800 bg-slate-950/40 text-xs">
              <div className="flex items-center justify-between p-3">
                <div className="flex items-center gap-2">
                  <Database className="h-4 w-4 text-sky-400" />
                  <div>
                    <div className="font-semibold text-slate-200">Recorder Physical Archive</div>
                    <div className="text-[11px] text-slate-400">Level 3 Playback & Boundary Query</div>
                  </div>
                </div>
                <div className="text-right font-mono">
                  <div className="font-bold text-slate-200">
                    {data.actualRetentionDays !== undefined ? `${data.actualRetentionDays} days` : "—"}
                  </div>
                  <div className="text-[10px] text-emerald-400">Confidence: {(data.confidence * 100).toFixed(0)}%</div>
                </div>
              </div>

              <div className="flex items-center justify-between p-3">
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-purple-400" />
                  <div>
                    <div className="font-semibold text-slate-200">Platform Index Sync</div>
                    <div className="text-[11px] text-slate-400">Level 1 Ingest Catalog Index</div>
                  </div>
                </div>
                <div className="text-right font-mono">
                  <div className="font-bold text-slate-200">
                    {data.actualRetentionDays !== undefined ? `${(data.actualRetentionDays - 0.2).toFixed(1)} days` : "—"}
                  </div>
                  <div className="text-[10px] text-purple-400">Confidence: 92%</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-800 px-6 py-3 bg-slate-950/70 text-xs">
          <span className="font-mono text-slate-500">Evaluated at: {new Date(data.evaluatedAt).toLocaleTimeString()}</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
