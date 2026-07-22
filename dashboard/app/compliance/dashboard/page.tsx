'use client';

import { useEffect, useState } from 'react';
import { Shield, CheckCircle, AlertTriangle, FileText, TrendingUp } from 'lucide-react';

interface FrameworkSummary {
  frameworkId: string;
  frameworkName: string;
  totalRequirements: number;
  totalControls: number;
  controlsImplemented: number;
  controlsVerified: number;
  openFindings: number;
  criticalFindings: number;
  evidenceCollected: number;
  lastAssessmentDate: string;
}

export default function ComplianceDashboardPage() {
  const [dashboards, setDashboards] = useState<FrameworkSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/v1/compliance/dashboard')
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch dashboard');
        return res.json();
      })
      .then(data => {
        setDashboards(Array.isArray(data) ? data : data.data || []);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">Error: {error}</p>
        </div>
      </div>
    );
  }

  const totals = dashboards.reduce(
    (acc, fw) => ({
      requirements: acc.requirements + fw.totalRequirements,
      controls: acc.controls + fw.totalControls,
      implemented: acc.implemented + fw.controlsImplemented,
      findings: acc.findings + fw.openFindings,
      critical: acc.critical + fw.criticalFindings,
    }),
    { requirements: 0, controls: 0, implemented: 0, findings: 0, critical: 0 }
  );

  const overallCompliance = totals.controls > 0
    ? Math.round((totals.implemented / totals.controls) * 100)
    : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50 p-6">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Shield className="w-8 h-8 text-purple-600" />
          <h1 className="text-3xl font-bold text-gray-900">Compliance Dashboard</h1>
        </div>
        <p className="text-gray-600">Monitor compliance status across all frameworks</p>
      </div>

      {/* Overall Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Overall Compliance</p>
              <p className="text-3xl font-bold text-purple-600">{overallCompliance}%</p>
            </div>
            <TrendingUp className="w-8 h-8 text-purple-400" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Requirements</p>
              <p className="text-3xl font-bold text-gray-900">{totals.requirements}</p>
            </div>
            <FileText className="w-8 h-8 text-blue-400" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Implemented Controls</p>
              <p className="text-3xl font-bold text-green-600">{totals.implemented}</p>
              <p className="text-xs text-gray-500">of {totals.controls}</p>
            </div>
            <CheckCircle className="w-8 h-8 text-green-400" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Open Findings</p>
              <p className="text-3xl font-bold text-orange-600">{totals.findings}</p>
            </div>
            <AlertTriangle className="w-8 h-8 text-orange-400" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Critical Findings</p>
              <p className="text-3xl font-bold text-red-600">{totals.critical}</p>
            </div>
            <AlertTriangle className="w-8 h-8 text-red-400" />
          </div>
        </div>
      </div>

      {/* Framework Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {dashboards.map(framework => {
          const compliance = framework.totalControls > 0
            ? Math.round((framework.controlsImplemented / framework.totalControls) * 100)
            : 0;

          return (
            <div key={framework.frameworkId} className="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow border border-gray-200">
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="font-bold text-lg text-gray-900">{framework.frameworkName}</h3>
                    <p className="text-sm text-gray-500 mt-1">Framework Compliance</p>
                  </div>
                  <Shield className="w-6 h-6 text-purple-500" />
                </div>

                {/* Compliance Progress */}
                <div className="mb-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm text-gray-600">Compliance Level</span>
                    <span className="text-lg font-bold text-purple-600">{compliance}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <div
                      className={`h-3 rounded-full transition-all ${
                        compliance >= 80 ? 'bg-green-500' :
                        compliance >= 50 ? 'bg-yellow-500' :
                        'bg-red-500'
                      }`}
                      style={{ width: `${compliance}%` }}
                    ></div>
                  </div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div className="bg-gray-50 rounded p-3">
                    <p className="text-xs text-gray-600">Requirements</p>
                    <p className="text-xl font-bold text-gray-900">{framework.totalRequirements}</p>
                  </div>
                  <div className="bg-gray-50 rounded p-3">
                    <p className="text-xs text-gray-600">Controls</p>
                    <p className="text-xl font-bold text-gray-900">{framework.totalControls}</p>
                  </div>
                  <div className="bg-green-50 rounded p-3">
                    <p className="text-xs text-green-700">Implemented</p>
                    <p className="text-xl font-bold text-green-700">{framework.controlsImplemented}</p>
                  </div>
                  <div className="bg-blue-50 rounded p-3">
                    <p className="text-xs text-blue-700">Verified</p>
                    <p className="text-xl font-bold text-blue-700">{framework.controlsVerified}</p>
                  </div>
                </div>

                {/* Findings Alert */}
                {framework.openFindings > 0 && (
                  <div className={`mt-4 p-3 rounded ${
                    framework.criticalFindings > 0
                      ? 'bg-red-50 border border-red-200'
                      : 'bg-yellow-50 border border-yellow-200'
                  }`}>
                    <div className="flex items-center gap-2">
                      <AlertTriangle className={`w-4 h-4 ${
                        framework.criticalFindings > 0 ? 'text-red-600' : 'text-yellow-600'
                      }`} />
                      <span className={`text-sm font-medium ${
                        framework.criticalFindings > 0 ? 'text-red-800' : 'text-yellow-800'
                      }`}>
                        {framework.openFindings} Open Finding{framework.openFindings > 1 ? 's' : ''}
                        {framework.criticalFindings > 0 && ` (${framework.criticalFindings} Critical)`}
                      </span>
                    </div>
                  </div>
                )}

                {/* Evidence Count */}
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-600">Evidence Collected</span>
                    <span className="font-semibold text-gray-900">{framework.evidenceCollected}</span>
                  </div>
                  {framework.lastAssessmentDate && (
                    <div className="flex justify-between items-center text-sm mt-2">
                      <span className="text-gray-600">Last Assessment</span>
                      <span className="text-gray-900">
                        {new Date(framework.lastAssessmentDate).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Empty State */}
      {dashboards.length === 0 && (
        <div className="text-center py-12">
          <Shield className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Frameworks Found</h3>
          <p className="text-gray-600">Create a compliance framework to get started</p>
        </div>
      )}
    </div>
  );
}
