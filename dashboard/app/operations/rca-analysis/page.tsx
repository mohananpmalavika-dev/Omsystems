/**
 * Autonomous Root Cause Analysis Page
 * 
 * Interactive interface for enhanced RCA diagnosis with multi-branch correlation,
 * evidence analysis, and autonomous intelligence.
 */

"use client";

import { useState, useEffect } from "react";
import { Activity, AlertCircle, Loader2, RefreshCw, Search, Sparkles } from "lucide-react";
import { RCADiagnosisPanel } from "@/components/rca-diagnosis-panel";

type Branch = {
  id: string;
  name: string;
};

type RCADiagnosis = any; // Matches the type in RCADiagnosisPanel

export default function RCAAnalysisPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>("");
  const [diagnosis, setDiagnosis] = useState<RCADiagnosis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [includeHistorical, setIncludeHistorical] = useState(true);

  // Load branches on mount
  useEffect(() => {
    loadBranches();
  }, []);

  const loadBranches = async () => {
    try {
      const response = await fetch("/api/control/v1/branches", {
        credentials: "include",
      });
      
      if (!response.ok) throw new Error("Failed to load branches");
      
      const data = await response.json();
      setBranches(data.branches || []);
    } catch (err) {
      console.error("Failed to load branches:", err);
    }
  };

  const runAnalysis = async () => {
    if (!selectedBranch) {
      setError("Please select a branch");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        includeHistorical: includeHistorical.toString(),
      });

      const response = await fetch(
        `/api/control/v1/command-center/branches/${encodeURIComponent(
          selectedBranch
        )}/rca-diagnosis?${params}`,
        {
          credentials: "include",
        }
      );

      if (!response.ok) {
        const errorBody = await response.json();
        throw new Error(errorBody.message || "Failed to run RCA analysis");
      }

      const result = await response.json();
      setDiagnosis(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run analysis");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-[calc(100vh-7rem)] bg-slate-950 p-4 text-slate-100 xl:p-5">
      {/* Header */}
      <header className="mb-6">
        <div className="flex items-center gap-2 text-xs font-semibold tracking-[.2em] text-cyan-400">
          <Sparkles size={14} />
          <span>AUTONOMOUS ROOT CAUSE ANALYSIS</span>
        </div>
        <h1 className="mt-2 text-3xl font-bold">Enhanced RCA Engine</h1>
        <p className="mt-2 text-sm text-slate-400">
          Multi-branch correlation, topology reasoning, temporal analysis, and explainable confidence scoring
        </p>
      </header>

      {/* Control Panel */}
      <section className="mb-6 rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
        <div className="grid gap-4 md:grid-cols-[1fr_auto]">
          <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
            {/* Branch Selection */}
            <div>
              <label htmlFor="branch-select" className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                Select Branch
              </label>
              <select
                id="branch-select"
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm outline-none focus:border-cyan-500"
                disabled={loading}
              >
                <option value="">Choose a branch...</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Options */}
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={includeHistorical}
                  onChange={(e) => setIncludeHistorical(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-950 text-cyan-500 focus:ring-cyan-500"
                  disabled={loading}
                />
                <span className="text-slate-300">Include historical patterns</span>
              </label>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-end gap-2">
            <button
              onClick={runAnalysis}
              disabled={loading || !selectedBranch}
              className="flex items-center gap-2 rounded-lg bg-cyan-600 px-5 py-2.5 font-semibold hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Analyzing...</span>
                </>
              ) : (
                <>
                  <Search size={16} />
                  <span>Run Analysis</span>
                </>
              )}
            </button>

            {diagnosis && (
              <button
                onClick={runAnalysis}
                disabled={loading}
                className="rounded-lg border border-slate-700 p-2.5 hover:border-cyan-500 hover:bg-cyan-500/5 disabled:opacity-40"
                title="Refresh analysis"
              >
                <RefreshCw size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <p>{error}</p>
          </div>
        )}
      </section>

      {/* Stats Display (if diagnosis available) */}
      {diagnosis && (
        <section className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Confidence Score"
            value={`${Math.round(diagnosis.confidenceScore * 100)}%`}
            color="text-cyan-400"
            icon={<Activity size={18} />}
          />
          <StatCard
            label="Affected Cameras"
            value={diagnosis.blastRadius.summary.totalCameras}
            color="text-amber-400"
            icon={<Activity size={18} />}
          />
          <StatCard
            label="Affected Branches"
            value={diagnosis.blastRadius.summary.totalBranches}
            color="text-red-400"
            icon={<Activity size={18} />}
          />
          <StatCard
            label="Evidence Items"
            value={diagnosis.evidenceMatrix.supporting.length}
            color="text-emerald-400"
            icon={<Activity size={18} />}
          />
        </section>
      )}

      {/* Main Content */}
      <section>
        {loading ? (
          <div className="flex min-h-[400px] items-center justify-center rounded-2xl border border-slate-800 bg-slate-900/80">
            <div className="text-center">
              <Loader2 className="mx-auto mb-4 animate-spin text-cyan-400" size={40} />
              <p className="text-sm text-slate-400">Running autonomous RCA analysis...</p>
              <p className="mt-2 text-xs text-slate-500">
                Correlating telemetry, analyzing topology, and scoring evidence
              </p>
            </div>
          </div>
        ) : (
          <RCADiagnosisPanel diagnosis={diagnosis} />
        )}
      </section>

      {/* Info Panel */}
      {!diagnosis && !loading && (
        <section className="mt-6 rounded-2xl border border-cyan-500/30 bg-cyan-500/5 p-5">
          <h3 className="flex items-center gap-2 font-semibold text-cyan-200">
            <Sparkles size={16} />
            <span>About Autonomous RCA</span>
          </h3>
          <div className="mt-3 space-y-2 text-sm text-slate-300">
            <p>
              The Enhanced RCA Engine provides intelligent root cause analysis using:
            </p>
            <ul className="ml-4 space-y-1 text-slate-400">
              <li>• Multi-branch correlation to identify shared infrastructure failures</li>
              <li>• Topology-based reasoning to understand dependency propagation</li>
              <li>• Temporal pattern analysis to detect common cause vs independent failures</li>
              <li>• Evidence-based confidence scoring with supporting/contradicting evidence</li>
              <li>• Historical case matching for pattern recognition and learning</li>
              <li>• Explainable AI with transparent reasoning and missing evidence identification</li>
            </ul>
            <p className="mt-4 text-xs text-slate-500">
              Example: Instead of showing "143 cameras offline", the system reports:
              <span className="mt-1 block italic text-cyan-300">
                "Probable WAN failure at Branch Cluster 7. 143 cameras affected across 27 branches. 
                91% confidence. First affected at 14:07. No evidence of individual camera failure."
              </span>
            </p>
          </div>
        </section>
      )}
    </main>
  );
}

function StatCard({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: string | number;
  color: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
      <div className="flex items-center justify-between">
        <span className="text-slate-500">{icon}</span>
        <span className={`text-2xl font-bold ${color}`}>{value}</span>
      </div>
      <p className="mt-2 text-xs text-slate-400">{label}</p>
    </div>
  );
}
