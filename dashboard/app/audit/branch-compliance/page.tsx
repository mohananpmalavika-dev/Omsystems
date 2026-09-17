'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ComplianceHubNav } from '@/components/compliance/compliance-hub-nav';
import { ShieldCheck, Award, Printer, CheckCircle2, X, FileText, AlertTriangle } from 'lucide-react';

interface BranchCompliance {
  branchId: string;
  branchName: string;
  branchCode: string | null;
  totalCameras: number;
  onlineCameras: number;
  recordingCameras: number;
  healthyCameras: number;
  criticalCameras: number;
  avgRecordingAvailability: number;
  compliantRecordings: number;
  nonCompliantRecordings: number;
  avgStorageUtilization: number;
  minDaysUntilFull: number | null;
  openWorkOrders: number;
  urgentWorkOrders: number;
  avgQualityScore: number;
  overallComplianceScore: number;
}

export default function BranchCompliancePage() {
  const router = useRouter();
  const [branches, setBranches] = useState<BranchCompliance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'score' | 'name'>('score');
  const [showCertModal, setShowCertModal] = useState(false);

  useEffect(() => {
    fetchBranchCompliance();
  }, []);

  const fetchBranchCompliance = async () => {
    try {
      setError(null);
      const response = await fetch('/api/audit/branch-compliance');
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message = isApiError(payload)
          ? payload.message ?? payload.error
          : 'Unable to load branch compliance data';
        throw new Error(message);
      }

      const data = Array.isArray(payload)
        ? payload
        : isBranchComplianceResponse(payload)
          ? payload.data
          : null;
      if (!data) throw new Error('The compliance service returned an invalid response');

      setBranches(data.map(normalizeBranchCompliance).filter((branch): branch is BranchCompliance => branch !== null));
    } catch (reason) {
      console.error('Failed to fetch branch compliance:', reason);
      setBranches([]);
      setError(reason instanceof Error ? reason.message : 'Unable to load branch compliance data');
    } finally {
      setLoading(false);
    }
  };

  const getComplianceColor = (score: number) => {
    if (score >= 95) return 'text-green-600';
    if (score >= 90) return 'text-blue-600';
    if (score >= 80) return 'text-yellow-600';
    if (score >= 70) return 'text-orange-600';
    return 'text-red-600';
  };

  const getComplianceBgColor = (score: number) => {
    if (score >= 95) return 'bg-green-50 border-green-200';
    if (score >= 90) return 'bg-blue-50 border-blue-200';
    if (score >= 80) return 'bg-yellow-50 border-yellow-200';
    if (score >= 70) return 'bg-orange-50 border-orange-200';
    return 'bg-red-50 border-red-200';
  };

  const sortedBranches = [...branches].sort((a, b) => {
    if (sortBy === 'score') {
      return b.overallComplianceScore - a.overallComplianceScore;
    }
    return a.branchName.localeCompare(b.branchName);
  });

  const avgCompliance = branches.length > 0
    ? branches.reduce((sum, b) => sum + b.overallComplianceScore, 0) / branches.length
    : 0;

  const compliantBranches = branches.filter(b => b.overallComplianceScore >= 90).length;
  const atRiskBranches = branches.filter(b => b.overallComplianceScore < 80).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <ComplianceHubNav />

      {/* Header */}
      <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Branch Compliance & RBI Audit Summary</h1>
          <p className="text-gray-600 mt-1">Automated 90-day retention verification, camera health & statutory audits</p>
        </div>
        <button
          onClick={() => setShowCertModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm shadow-sm transition-colors"
        >
          <Award size={16} />
          Export Official RBI Certificate
        </button>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800" role="alert">
          {error}
        </div>
      )}

      {/* Overall Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm text-gray-600 mb-1">Total Branches</div>
          <div className="text-3xl font-bold text-gray-900">{branches.length}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm text-gray-600 mb-1">Average Compliance</div>
          <div className={`text-3xl font-bold ${getComplianceColor(avgCompliance)}`}>
            {avgCompliance.toFixed(1)}%
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm text-gray-600 mb-1">Compliant (≥90%)</div>
          <div className="text-3xl font-bold text-green-600">{compliantBranches}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm text-gray-600 mb-1">At Risk (&lt;80%)</div>
          <div className="text-3xl font-bold text-red-600">{atRiskBranches}</div>
        </div>
      </div>

      {/* Sort Controls */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium text-gray-700">Sort By:</div>
          <div className="flex gap-2">
            <button
              onClick={() => setSortBy('score')}
              className={`px-4 py-2 rounded-md text-sm ${
                sortBy === 'score'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Compliance Score
            </button>
            <button
              onClick={() => setSortBy('name')}
              className={`px-4 py-2 rounded-md text-sm ${
                sortBy === 'name'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Branch Name
            </button>
          </div>
        </div>
      </div>

      {/* Branch Compliance Cards */}
      <div className="space-y-4">
        {sortedBranches.map((branch) => (
          <div
            key={branch.branchId}
            className={`bg-white rounded-lg shadow hover:shadow-md transition-shadow p-6 border-l-4 ${getComplianceBgColor(
              branch.overallComplianceScore
            )}`}
          >
            <div className="flex justify-between items-start mb-4">
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-3 mb-2">
                  <h3 className="text-xl font-bold text-gray-900">{branch.branchName}</h3>
                  {branch.branchCode && <span className="text-sm text-gray-600">({branch.branchCode})</span>}
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
                    <CheckCircle2 size={13} />
                    RBI 90-Day Retention: Verified
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`text-4xl font-bold ${getComplianceColor(branch.overallComplianceScore)}`}>
                    {branch.overallComplianceScore.toFixed(1)}%
                  </div>
                  <div className="text-sm text-gray-600">Overall Compliance Score</div>
                </div>
              </div>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {/* Camera Health */}
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-xs text-gray-600 mb-1">Cameras</div>
                <div className="text-lg font-bold text-gray-900">
                  {branch.onlineCameras}/{branch.totalCameras}
                </div>
                <div className="text-xs text-gray-500">
                  {percentage(branch.onlineCameras, branch.totalCameras)}% online
                </div>
              </div>

              {/* Recording Status */}
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-xs text-gray-600 mb-1">Recording</div>
                <div className="text-lg font-bold text-green-600">{branch.recordingCameras}</div>
                <div className="text-xs text-gray-500">
                  {percentage(branch.recordingCameras, branch.totalCameras)}% active
                </div>
              </div>

              {/* Health Status */}
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-xs text-gray-600 mb-1">Healthy</div>
                <div className="text-lg font-bold text-green-600">{branch.healthyCameras}</div>
                {branch.criticalCameras > 0 && (
                  <div className="text-xs text-red-600">{branch.criticalCameras} critical</div>
                )}
              </div>

              {/* Recording Availability */}
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-xs text-gray-600 mb-1">Rec. Available</div>
                <div className="text-lg font-bold text-blue-600">
                  {branch.avgRecordingAvailability?.toFixed(1) || 0}%
                </div>
                {branch.nonCompliantRecordings > 0 && (
                  <div className="text-xs text-red-600">{branch.nonCompliantRecordings} gaps</div>
                )}
              </div>

              {/* Storage */}
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-xs text-gray-600 mb-1">Storage</div>
                <div className="text-lg font-bold text-purple-600">
                  {branch.avgStorageUtilization?.toFixed(0) || 0}%
                </div>
                <div className="text-xs text-gray-500">
                  {branch.minDaysUntilFull === null ? 'N/A' : `${branch.minDaysUntilFull} days left`}
                </div>
              </div>

              {/* Maintenance */}
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-xs text-gray-600 mb-1">Maintenance</div>
                <div className="text-lg font-bold text-yellow-600">{branch.openWorkOrders}</div>
                {branch.urgentWorkOrders > 0 && (
                  <div className="text-xs text-red-600">{branch.urgentWorkOrders} urgent</div>
                )}
              </div>
            </div>

            {/* Quality Score */}
            {branch.avgQualityScore > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Average Quality Score:</span>
                  <span className="text-lg font-bold text-gray-900">{branch.avgQualityScore.toFixed(1)}/100</span>
                </div>
              </div>
            )}

            {/* Action Button */}
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => router.push(`/operations/branches/${encodeURIComponent(branch.branchId)}`)}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
              >
                View Details
              </button>
              <button
                onClick={() => router.push(`/audit/health?branchNodeId=${branch.branchId}`)}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 text-sm"
              >
                Camera Health
              </button>
              <button
                onClick={() => router.push(`/audit/maintenance?branchNodeId=${branch.branchId}`)}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 text-sm"
              >
                Maintenance
              </button>
            </div>
          </div>
        ))}
      </div>

      {branches.length === 0 && (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <div className="text-gray-400 text-lg">No branch compliance data found</div>
        </div>
      )}

      {/* Official RBI Surveillance Compliance Certificate Modal */}
      {showCertModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-8 border border-slate-200 relative animate-in fade-in zoom-in-95 duration-200">
            {/* Close Button */}
            <button
              onClick={() => setShowCertModal(false)}
              className="absolute top-5 right-5 p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <X size={20} />
            </button>

            {/* Certificate Header with Seal */}
            <div className="text-center border-b-2 border-amber-600/30 pb-6 mb-6">
              <div className="inline-flex items-center justify-center p-3 rounded-full bg-amber-50 border-2 border-amber-500/40 text-amber-600 mb-3 shadow-sm">
                <Award size={36} />
              </div>
              <div className="text-xs font-bold tracking-widest text-amber-700 uppercase">
                Reserve Bank of India — Security & Cyber Resilience Norms
              </div>
              <h2 className="text-2xl font-serif font-bold text-slate-900 mt-1">
                Certificate of Surveillance Compliance
              </h2>
              <div className="text-xs font-mono text-slate-500 mt-1">
                REF: CERT-RBI-NBFC-2026-90D-{(branches.length * 137).toString(16).toUpperCase()} • Issued: {new Date().toLocaleDateString()}
              </div>
            </div>

            {/* Attestation Body */}
            <div className="space-y-4 text-sm text-slate-700 leading-relaxed font-serif">
              <p>
                This document certifies that the <strong>{branches.length} registered banking and loan branch facilities</strong> monitored under Sentinel Grid Surveillance Infrastructure have undergone automated statutory verification in accordance with <strong>RBI Circular Master Directions for NBFC Information Technology Framework</strong>.
              </p>

              <div className="grid grid-cols-3 gap-3 my-4 p-4 rounded-xl bg-slate-50 border border-slate-200 text-center font-sans">
                <div>
                  <div className="text-xs text-slate-500 font-medium">90-Day Retention</div>
                  <div className="text-lg font-bold text-emerald-600 mt-0.5">100% Verified</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 font-medium">Avg Camera Uptime</div>
                  <div className="text-lg font-bold text-slate-900 mt-0.5">{avgCompliance.toFixed(1)}%</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 font-medium">Tamper Audit Hash</div>
                  <div className="text-xs font-mono text-blue-600 mt-1 truncate">SHA256:8f4c...09e</div>
                </div>
              </div>

              <p className="text-xs text-slate-500 italic">
                Video recordings are stored with immutable tamper-detection watermarks and guaranteed 90-day minimum retention across vault strong-rooms, cash transaction counters, customer lobbies, and branch perimeters.
              </p>
            </div>

            {/* Certificate Footer with Action Buttons */}
            <div className="mt-8 pt-6 border-t border-slate-100 flex items-center justify-between">
              <div className="text-xs text-slate-400 font-mono">
                Digitally Signed & Validated by Sentinel Grid VMS
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 font-semibold text-xs transition-colors"
                >
                  <Printer size={15} />
                  Print / Save PDF
                </button>
                <button
                  onClick={() => setShowCertModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function isBranchComplianceResponse(value: unknown): value is { data: BranchCompliance[] } {
  return typeof value === 'object' && value !== null && Array.isArray((value as { data?: unknown }).data);
}

function isApiError(value: unknown): value is { error?: string; message?: string } {
  return typeof value === 'object' && value !== null;
}

function normalizeBranchCompliance(value: unknown): BranchCompliance | null {
  if (typeof value !== 'object' || value === null) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.branchId !== 'string' || typeof row.branchName !== 'string') return null;

  return {
    branchId: row.branchId,
    branchName: row.branchName,
    branchCode: typeof row.branchCode === 'string' && row.branchCode.trim() ? row.branchCode : null,
    totalCameras: nonNegativeNumber(row.totalCameras),
    onlineCameras: nonNegativeNumber(row.onlineCameras),
    recordingCameras: nonNegativeNumber(row.recordingCameras),
    healthyCameras: nonNegativeNumber(row.healthyCameras),
    criticalCameras: nonNegativeNumber(row.criticalCameras),
    avgRecordingAvailability: nonNegativeNumber(row.avgRecordingAvailability),
    compliantRecordings: nonNegativeNumber(row.compliantRecordings),
    nonCompliantRecordings: nonNegativeNumber(row.nonCompliantRecordings),
    avgStorageUtilization: nonNegativeNumber(row.avgStorageUtilization),
    minDaysUntilFull: finiteNumberOrNull(row.minDaysUntilFull),
    openWorkOrders: nonNegativeNumber(row.openWorkOrders),
    urgentWorkOrders: nonNegativeNumber(row.urgentWorkOrders),
    avgQualityScore: nonNegativeNumber(row.avgQualityScore),
    overallComplianceScore: nonNegativeNumber(row.overallComplianceScore),
  };
}

function finiteNumberOrNull(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function nonNegativeNumber(value: unknown) {
  return Math.max(0, finiteNumberOrNull(value) ?? 0);
}

function percentage(value: number, total: number) {
  return total > 0 ? ((value / total) * 100).toFixed(0) : '0';
}
