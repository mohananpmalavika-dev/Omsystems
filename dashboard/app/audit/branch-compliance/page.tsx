'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface BranchCompliance {
  branchId: string;
  branchName: string;
  branchCode: string;
  totalCameras: number;
  onlineCameras: number;
  recordingCameras: number;
  healthyCameras: number;
  criticalCameras: number;
  avgRecordingAvailability: number;
  compliantRecordings: number;
  nonCompliantRecordings: number;
  avgStorageUtilization: number;
  minDaysUntilFull: number;
  openWorkOrders: number;
  urgentWorkOrders: number;
  avgQualityScore: number;
  overallComplianceScore: number;
}

export default function BranchCompliancePage() {
  const router = useRouter();
  const [branches, setBranches] = useState<BranchCompliance[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'score' | 'name'>('score');

  useEffect(() => {
    fetchBranchCompliance();
  }, []);

  const fetchBranchCompliance = async () => {
    try {
      const response = await fetch('/api/audit/branch-compliance');
      const data = await response.json();
      setBranches(data);
    } catch (error) {
      console.error('Failed to fetch branch compliance:', error);
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
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Branch Compliance Summary</h1>
        <p className="text-gray-600 mt-1">Comprehensive compliance overview across all branches</p>
      </div>

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
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="text-xl font-bold text-gray-900">{branch.branchName}</h3>
                  <span className="text-sm text-gray-600">({branch.branchCode})</span>
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
                  {((branch.onlineCameras / branch.totalCameras) * 100).toFixed(0)}% online
                </div>
              </div>

              {/* Recording Status */}
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-xs text-gray-600 mb-1">Recording</div>
                <div className="text-lg font-bold text-green-600">{branch.recordingCameras}</div>
                <div className="text-xs text-gray-500">
                  {((branch.recordingCameras / branch.totalCameras) * 100).toFixed(0)}% active
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
                <div className="text-xs text-gray-500">{branch.minDaysUntilFull || 'N/A'} days left</div>
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
                onClick={() => router.push(`/audit/branch/${branch.branchId}`)}
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
    </div>
  );
}
