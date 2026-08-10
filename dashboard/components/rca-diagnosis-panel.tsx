/**
 * Autonomous Root Cause Analysis Panel
 * 
 * Displays enhanced RCA diagnosis with multi-branch correlation,
 * evidence matrix, confidence breakdown, and blast radius visualization.
 */

"use client";

import { useState } from "react";
import {
  Activity, AlertTriangle, CheckCircle2, ChevronDown, ChevronRight,
  FileSearch, GitBranch, Info, Layers, Network, Target, TrendingUp, XCircle,
} from "lucide-react";

type Certainty = "confirmed" | "likely" | "possible" | "unknown";

type EvidenceItem = {
  type: "supporting" | "contradicting" | "neutral";
  assertion: string;
  weight: number;
  source: string;
  timestamp: string;
};

type BlastRadius = {
  summary: {
    totalBranches: number;
    totalCameras: number;
    totalDVRs: number;
    totalNetworks: number;
    percentCamerasAffected: number;
  };
};

type TemporalAnalysis = {
  firstFailureAt: string;
  lastFailureAt: string;
  timeSpreadSeconds: number;
  simultaneousFailures: boolean;
  pattern: "sudden" | "cascading" | "gradual" | "sporadic";
};

type RootCauseCandidate = {
  code: string;
  label: string;
  confidence: number;
  certainty: Certainty;
  explanation: string;
  supportingEvidence: EvidenceItem[];
  contradictingEvidence: EvidenceItem[];
  missingEvidence: string[];
  affectedEntities: {
    cameras: number;
    dvrs: number;
    branches: number;
    networks: number;
  };
  temporalPattern: {
    firstFailure: string;
    lastFailure: string;
    timeSpreadSeconds: number;
    simultaneousFailures: boolean;
  };
  recommendedActions: string[];
};

type RCADiagnosis = {
  diagnosisId: string;
  tenantId: string;
  branchId: string;
  primaryCause: RootCauseCandidate;
  alternativeCauses: RootCauseCandidate[];
  blastRadius: BlastRadius;
  temporalAnalysis: TemporalAnalysis;
  confidenceScore: number;
  certainty: Certainty;
  explanation: string;
  businessImpact: string;
  evidenceMatrix: {
    supporting: EvidenceItem[];
    contradicting: EvidenceItem[];
    missing: string[];
  };
  caseFingerprint: string;
  generatedAt: string;
};

export function RCADiagnosisPanel({ diagnosis }: { diagnosis: RCADiagnosis | null }) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(["overview", "evidence"]));

  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };

  if (!diagnosis) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-8 text-center">
        <FileSearch className="mx-auto mb-3 text-slate-600" size={40} />
        <p className="text-slate-500">Enhanced RCA diagnosis will appear here</p>
        <p className="mt-2 text-xs text-slate-600">
          Autonomous analysis with multi-branch correlation and evidence scoring
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Primary Diagnosis Overview */}
      <Section
        title="Root Cause Analysis"
        icon={<Target size={17} />}
        expanded={expandedSections.has("overview")}
        onToggle={() => toggleSection("overview")}
      >
        <div className="space-y-4">
          {/* Main Diagnosis Card */}
          <div className="rounded-xl border-2 border-cyan-500/30 bg-gradient-to-br from-cyan-500/10 to-blue-500/10 p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <h3 className="text-2xl font-bold text-slate-100">
                    {diagnosis.primaryCause.label}
                  </h3>
                  <CertaintyBadge value={diagnosis.certainty} />
                </div>
                <p className="mt-2 text-sm text-slate-300">
                  Case fingerprint: <code className="text-cyan-300">{diagnosis.caseFingerprint.slice(0, 16)}</code>
                </p>
              </div>
              <div className="text-right">
                <div className="text-4xl font-bold text-cyan-400">
                  {Math.round(diagnosis.confidenceScore * 100)}%
                </div>
                <p className="text-xs text-slate-400">Confidence</p>
              </div>
            </div>

            {/* Explanation */}
            <div className="mt-4 rounded-lg bg-slate-950/50 p-4">
              <p className="text-sm leading-6 text-slate-200 whitespace-pre-line">
                {diagnosis.explanation}
              </p>
            </div>
          </div>

          {/* Business Impact */}
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 shrink-0 text-red-400" size={18} />
              <div className="flex-1">
                <p className="font-semibold text-red-200">Business Impact</p>
                <p className="mt-2 text-sm leading-6 text-slate-300 whitespace-pre-line">
                  {diagnosis.businessImpact}
                </p>
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* Blast Radius */}
      <Section
        title="Blast Radius Analysis"
        icon={<Layers size={17} />}
        expanded={expandedSections.has("blast")}
        onToggle={() => toggleSection("blast")}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Branches Affected"
            value={diagnosis.blastRadius.summary.totalBranches}
            color="text-red-400"
            icon={<GitBranch size={16} />}
          />
          <MetricCard
            label="Cameras Offline"
            value={diagnosis.blastRadius.summary.totalCameras}
            color="text-amber-400"
            icon={<Activity size={16} />}
          />
          <MetricCard
            label="DVRs Affected"
            value={diagnosis.blastRadius.summary.totalDVRs}
            color="text-orange-400"
            icon={<Layers size={16} />}
          />
          <MetricCard
            label="Networks Impacted"
            value={diagnosis.blastRadius.summary.totalNetworks}
            color="text-purple-400"
            icon={<Network size={16} />}
          />
        </div>

        {/* Temporal Pattern */}
        <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Temporal Pattern
          </p>
          <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <span className="text-slate-400">Pattern Type:</span>
              <span className="ml-2 font-semibold capitalize text-slate-200">
                {diagnosis.temporalAnalysis.pattern}
              </span>
            </div>
            <div>
              <span className="text-slate-400">Time Spread:</span>
              <span className="ml-2 font-semibold text-slate-200">
                {Math.round(diagnosis.temporalAnalysis.timeSpreadSeconds / 60)} minutes
              </span>
            </div>
            <div>
              <span className="text-slate-400">First Failure:</span>
              <span className="ml-2 font-mono text-xs text-slate-200">
                {formatTime(diagnosis.temporalAnalysis.firstFailureAt)}
              </span>
            </div>
            <div>
              <span className="text-slate-400">Last Failure:</span>
              <span className="ml-2 font-mono text-xs text-slate-200">
                {formatTime(diagnosis.temporalAnalysis.lastFailureAt)}
              </span>
            </div>
          </div>
          {diagnosis.temporalAnalysis.simultaneousFailures && (
            <div className="mt-3 flex items-center gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              <Info size={14} />
              <span>Simultaneous failures detected - indicates common upstream cause</span>
            </div>
          )}
        </div>
      </Section>

      {/* Evidence Matrix */}
      <Section
        title="Evidence Matrix"
        icon={<FileSearch size={17} />}
        expanded={expandedSections.has("evidence")}
        onToggle={() => toggleSection("evidence")}
        badge={`${diagnosis.evidenceMatrix.supporting.length} supporting`}
      >
        <div className="space-y-4">
          {/* Supporting Evidence */}
          {diagnosis.evidenceMatrix.supporting.length > 0 && (
            <div>
              <div className="mb-3 flex items-center gap-2">
                <CheckCircle2 className="text-emerald-400" size={16} />
                <h4 className="text-sm font-semibold text-slate-200">
                  Supporting Evidence ({diagnosis.evidenceMatrix.supporting.length})
                </h4>
              </div>
              <div className="space-y-2">
                {diagnosis.evidenceMatrix.supporting.slice(0, 5).map((item, index) => (
                  <EvidenceCard key={`support-${index}`} evidence={item} type="supporting" />
                ))}
              </div>
            </div>
          )}

          {/* Contradicting Evidence */}
          {diagnosis.evidenceMatrix.contradicting.length > 0 && (
            <div>
              <div className="mb-3 flex items-center gap-2">
                <XCircle className="text-red-400" size={16} />
                <h4 className="text-sm font-semibold text-slate-200">
                  Contradicting Evidence ({diagnosis.evidenceMatrix.contradicting.length})
                </h4>
              </div>
              <div className="space-y-2">
                {diagnosis.evidenceMatrix.contradicting.map((item, index) => (
                  <EvidenceCard key={`contra-${index}`} evidence={item} type="contradicting" />
                ))}
              </div>
            </div>
          )}

          {/* Missing Evidence */}
          {diagnosis.evidenceMatrix.missing.length > 0 && (
            <details className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
              <summary className="cursor-pointer text-sm font-semibold text-amber-200">
                Missing Evidence ({diagnosis.evidenceMatrix.missing.length})
              </summary>
              <ul className="mt-3 space-y-2 text-xs text-slate-400">
                {diagnosis.evidenceMatrix.missing.map((item, index) => (
                  <li key={index} className="flex gap-2">
                    <span className="text-amber-400">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </Section>

      {/* Alternative Causes */}
      {diagnosis.alternativeCauses.length > 0 && (
        <Section
          title="Alternative Diagnoses"
          icon={<TrendingUp size={17} />}
          expanded={expandedSections.has("alternatives")}
          onToggle={() => toggleSection("alternatives")}
          badge={`${diagnosis.alternativeCauses.length} candidates`}
        >
          <div className="space-y-3">
            {diagnosis.alternativeCauses.map((candidate, index) => (
              <div
                key={index}
                className="rounded-lg border border-slate-800 bg-slate-950/50 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold text-slate-200">{candidate.label}</h4>
                      <CertaintyBadge value={candidate.certainty} size="sm" />
                    </div>
                    <p className="mt-2 text-xs leading-5 text-slate-400">
                      {candidate.explanation}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-xl font-bold text-slate-300">
                      {Math.round(candidate.confidence * 100)}%
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Recommended Actions */}
      <Section
        title="Recommended Actions"
        icon={<CheckCircle2 size={17} />}
        expanded={expandedSections.has("actions")}
        onToggle={() => toggleSection("actions")}
      >
        <div className="space-y-2">
          {diagnosis.primaryCause.recommendedActions.map((action, index) => (
            <div
              key={index}
              className="flex gap-3 rounded-lg border border-slate-800 bg-slate-950/50 p-3"
            >
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cyan-500/20 text-xs font-bold text-cyan-300">
                {index + 1}
              </div>
              <p className="flex-1 text-sm text-slate-300">{action}</p>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

function Section({
  title,
  icon,
  badge,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  badge?: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/80">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between border-b border-slate-800 px-4 py-3 text-left hover:bg-slate-800/50"
      >
        <div className="flex items-center gap-2">
          <span className="text-cyan-400">{icon}</span>
          <h2 className="text-sm font-semibold text-slate-200">{title}</h2>
          {badge && (
            <span className="rounded-full bg-cyan-500/20 px-2 py-0.5 text-xs text-cyan-300">
              {badge}
            </span>
          )}
        </div>
        {expanded ? (
          <ChevronDown className="text-slate-500" size={18} />
        ) : (
          <ChevronRight className="text-slate-500" size={18} />
        )}
      </button>
      {expanded && <div className="p-4">{children}</div>}
    </section>
  );
}

function MetricCard({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: number;
  color: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-4">
      <div className="flex items-center justify-between">
        <span className="text-slate-500">{icon}</span>
        <span className={`text-2xl font-bold ${color}`}>{value}</span>
      </div>
      <p className="mt-2 text-xs text-slate-400">{label}</p>
    </div>
  );
}

function EvidenceCard({
  evidence,
  type,
}: {
  evidence: EvidenceItem;
  type: "supporting" | "contradicting";
}) {
  const bgColor = type === "supporting" ? "bg-emerald-500/5" : "bg-red-500/5";
  const borderColor = type === "supporting" ? "border-emerald-500/20" : "border-red-500/20";
  const iconColor = type === "supporting" ? "text-emerald-400" : "text-red-400";

  return (
    <div className={`rounded-lg border ${borderColor} ${bgColor} p-3`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            {type === "supporting" ? (
              <CheckCircle2 className={iconColor} size={14} />
            ) : (
              <XCircle className={iconColor} size={14} />
            )}
            <span className="text-xs font-medium text-slate-300">{evidence.source}</span>
            <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">
              {evidence.weight} pts
            </span>
          </div>
          <p className="mt-2 text-sm leading-5 text-slate-200">{evidence.assertion}</p>
          <p className="mt-1 text-xs text-slate-500">{formatTime(evidence.timestamp)}</p>
        </div>
      </div>
    </div>
  );
}

function CertaintyBadge({
  value,
  size = "md",
}: {
  value: Certainty;
  size?: "sm" | "md";
}) {
  const sizeClass = size === "sm" ? "text-[9px] px-1.5 py-0.5" : "text-[10px] px-2 py-1";
  const style =
    value === "confirmed"
      ? "bg-emerald-500/15 text-emerald-300"
      : value === "likely"
      ? "bg-cyan-500/15 text-cyan-300"
      : value === "possible"
      ? "bg-amber-500/15 text-amber-300"
      : "bg-slate-700 text-slate-300";

  return (
    <span
      className={`inline-flex rounded font-bold uppercase tracking-wider ${style} ${sizeClass}`}
    >
      {value}
    </span>
  );
}

function formatTime(timestamp: string): string {
  try {
    return new Date(timestamp).toLocaleString();
  } catch {
    return timestamp;
  }
}
