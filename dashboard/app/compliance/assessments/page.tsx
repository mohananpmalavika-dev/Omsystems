'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { complianceApi } from '@/lib/api-client';

type AssessmentStatus = 'compliant' | 'exception' | 'non-compliant' | 'incomplete';

interface Assessment {
  id: string;
  frameworkId: string;
  frameworkName?: string;
  branchNodeId?: string;
  branchName?: string;
  status: AssessmentStatus;
  assessmentPeriodStart?: string | null;
  assessmentPeriodEnd?: string | null;
  summary?: {
    compliancePercentage?: number;
    totalRequirements?: number;
    compliantRequirements?: number;
    criticalFindings?: number;
  };
  createdAt: string;
  updatedAt: string;
}

const statusLabels: Record<AssessmentStatus, string> = {
  compliant: 'Compliant', exception: 'Exception', 'non-compliant': 'Non-compliant', incomplete: 'Incomplete',
};

export default function AssessmentsPage() {
  const router = useRouter();
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<AssessmentStatus | ''>('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [frameworkId, setFrameworkId] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAssessments = useCallback(async () => {
    setLoading(true);
    try {
      const response = await complianceApi.listAssessments(status ? { status } : undefined);
      setAssessments(Array.isArray(response.data) ? response.data as Assessment[] : []);
    } catch (error) {
      console.error('Failed to fetch assessments:', error);
      setAssessments([]);
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => { void fetchAssessments(); }, [fetchAssessments]);

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'compliant':
        return 'bg-green-100 text-green-800';
      case 'exception':
        return 'bg-yellow-100 text-yellow-800';
      case 'non-compliant':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDate = (dateString?: string | null) => {
    if (!dateString || Number.isNaN(new Date(dateString).getTime())) return 'Not set';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const handleCreateAssessment = () => {
    setShowCreateModal(true);
  };

  const createAssessment = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const assessment = await complianceApi.createAssessment({
        frameworkId,
        status: 'incomplete',
        ...(periodStart ? { assessmentPeriodStart: new Date(`${periodStart}T00:00:00.000Z`).toISOString() } : {}),
        ...(periodEnd ? { assessmentPeriodEnd: new Date(`${periodEnd}T00:00:00.000Z`).toISOString() } : {}),
      }) as Assessment;
      setShowCreateModal(false);
      setFrameworkId('');
      setPeriodStart('');
      setPeriodEnd('');
      router.push(`/compliance/assessments/${assessment.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to create assessment.');
    } finally {
      setCreating(false);
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

      {error && <div className="mb-6 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">{error}</div>}

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="new-assessment-title">
          <form onSubmit={createAssessment} className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
            <h2 id="new-assessment-title" className="text-xl font-semibold text-gray-900">New assessment</h2>
            <p className="mt-1 text-sm text-gray-600">Use the framework ID from the framework catalog. The assessment starts as incomplete until results are recorded.</p>
            <label className="mt-5 block text-sm font-medium text-gray-700">Framework ID
              <input required value={frameworkId} onChange={(event) => setFrameworkId(event.target.value)} placeholder="UUID" className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" />
            </label>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="text-sm font-medium text-gray-700">Period start<input type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" /></label>
              <label className="text-sm font-medium text-gray-700">Period end<input type="date" min={periodStart || undefined} value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" /></label>
            </div>
            <div className="mt-6 flex justify-end gap-3"><button type="button" className="px-4 py-2 text-sm text-gray-700" onClick={() => setShowCreateModal(false)} disabled={creating}>Cancel</button><button type="submit" disabled={creating} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{creating ? 'Creating…' : 'Create assessment'}</button></div>
          </form>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as AssessmentStatus | '')}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Statuses</option>
              <option value="incomplete">Incomplete</option>
              <option value="compliant">Compliant</option>
              <option value="exception">Exception</option>
              <option value="non-compliant">Non-compliant</option>
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
                      {statusLabels[assessment.status]}
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
