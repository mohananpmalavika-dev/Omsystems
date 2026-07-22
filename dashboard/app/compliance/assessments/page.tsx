'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface Assessment {
  id: string;
  frameworkId: string;
  frameworkName?: string;
  branchNodeId?: string;
  branchName?: string;
  status: string;
  assessmentPeriodStart: string;
  assessmentPeriodEnd: string;
  summary?: {
    compliancePercentage?: number;
    totalRequirements?: number;
    compliantRequirements?: number;
    criticalFindings?: number;
  };
  createdAt: string;
  updatedAt: string;
}

export default function AssessmentsPage() {
  const router = useRouter();
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({
    status: '',
    frameworkId: '',
    branchNodeId: '',
  });
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    fetchAssessments();
  }, [filter]);

  const fetchAssessments = async () => {
    try {
      const params = new URLSearchParams();
      if (filter.status) params.append('status', filter.status);
      if (filter.frameworkId) params.append('frameworkId', filter.frameworkId);
      if (filter.branchNodeId) params.append('branchNodeId', filter.branchNodeId);

      const response = await fetch(`/api/compliance/assessments?${params}`);
      const data = await response.json();
      setAssessments(data);
    } catch (error) {
      console.error('Failed to fetch assessments:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'passed':
        return 'bg-green-100 text-green-800';
      case 'passed_with_exceptions':
        return 'bg-yellow-100 text-yellow-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      case 'in_progress':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const handleCreateAssessment = () => {
    setShowCreateModal(true);
  };

  const handleExecuteAssessment = async (id: string) => {
    try {
      const response = await fetch(`/api/compliance/assessments/${id}/execute`, {
        method: 'POST',
      });
      
      if (response.ok) {
        alert('Assessment execution started');
        fetchAssessments();
      }
    } catch (error) {
      console.error('Failed to execute assessment:', error);
      alert('Failed to execute assessment');
    }
  };

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
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Compliance Assessments</h1>
            <p className="text-gray-600 mt-1">
              Manage and track compliance assessments across frameworks and branches
            </p>
          </div>
          <button
            onClick={handleCreateAssessment}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            + New Assessment
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Status
            </label>
            <select
              value={filter.status}
              onChange={(e) => setFilter({ ...filter, status: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Statuses</option>
              <option value="incomplete">Incomplete</option>
              <option value="in_progress">In Progress</option>
              <option value="passed">Passed</option>
              <option value="passed_with_exceptions">Passed with Exceptions</option>
              <option value="failed">Failed</option>
            </select>
          </div>
        </div>
      </div>

      {/* Assessment List */}
      <div className="space-y-4">
        {assessments.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <div className="text-gray-400 text-lg mb-2">No assessments found</div>
            <p className="text-gray-500 mb-4">Create your first compliance assessment to get started</p>
            <button
              onClick={handleCreateAssessment}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Create Assessment
            </button>
          </div>
        ) : (
          assessments.map((assessment) => (
            <div
              key={assessment.id}
              className="bg-white rounded-lg shadow hover:shadow-md transition-shadow p-6 cursor-pointer"
              onClick={() => router.push(`/compliance/assessments/${assessment.id}`)}
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-semibold text-gray-900">
                      {assessment.frameworkName || 'Assessment'}
                    </h3>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusBadgeClass(
                        assessment.status
                      )}`}
                    >
                      {assessment.status.replace('_', ' ').toUpperCase()}
                    </span>
                  </div>

                  <div className="flex items-center gap-4 text-sm text-gray-600 mb-3">
                    {assessment.branchName && (
                      <div className="flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        {assessment.branchName}
                      </div>
                    )}
                    <div className="flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      {formatDate(assessment.assessmentPeriodStart)} - {formatDate(assessment.assessmentPeriodEnd)}
                    </div>
                  </div>

                  {assessment.summary && (
                    <div className="flex items-center gap-6">
                      <div className="flex items-center gap-2">
                        <div className="text-2xl font-bold text-blue-600">
                          {assessment.summary.compliancePercentage?.toFixed(1)}%
                        </div>
                        <div className="text-sm text-gray-600">Compliance Score</div>
                      </div>
                      <div className="text-sm text-gray-600">
                        {assessment.summary.compliantRequirements} / {assessment.summary.totalRequirements} Requirements Met
                      </div>
                      {(assessment.summary.criticalFindings || 0) > 0 && (
                        <div className="text-sm text-red-600 font-medium">
                          {assessment.summary.criticalFindings} Critical Findings
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  {assessment.status === 'incomplete' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleExecuteAssessment(assessment.id);
                      }}
                      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
                    >
                      Execute
                    </button>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      router.push(`/compliance/assessments/${assessment.id}`);
                    }}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 text-sm"
                  >
                    View Details
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
