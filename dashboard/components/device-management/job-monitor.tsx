"use client";

import React, { useEffect, useState } from "react";
import { deviceManagementApi } from "@/lib/api-client";

interface DeviceJob {
  id: string;
  deviceId: string;
  jobType: string;
  status: string;
  priority: string;
  reason: string;
  attempts: number;
  maxAttempts: number;
  error?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  steps?: Array<{
    stepNumber: number;
    stepName: string;
    status: string;
    durationMs?: number;
  }>;
}

interface JobMonitorProps {
  deviceId?: string;
  autoRefresh?: boolean;
  className?: string;
}

export function JobMonitor({ deviceId, autoRefresh = true, className }: JobMonitorProps) {
  const [jobs, setJobs] = useState<DeviceJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<string | null>(null);

  const fetchJobs = async () => {
    try {
      setError(null);
      const response = await deviceManagementApi.listJobs({
        deviceId,
        status: 'queued,claimed,precheck,connecting,applying,waiting-reboot,verifying,rolling-back',
        limit: 20,
      });
      setJobs(response.data || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load jobs');
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchJobs().finally(() => setLoading(false));

    if (autoRefresh) {
      const interval = setInterval(fetchJobs, 5000); // Refresh every 5 seconds
      return () => clearInterval(interval);
    }
  }, [deviceId, autoRefresh]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'failed':
      case 'manual-intervention':
        return 'bg-red-100 text-red-800';
      case 'queued':
        return 'bg-gray-100 text-gray-800';
      case 'claimed':
      case 'precheck':
      case 'connecting':
      case 'applying':
      case 'waiting-reboot':
      case 'verifying':
        return 'bg-blue-100 text-blue-800';
      case 'rolling-back':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical':
        return 'text-red-600';
      case 'high':
        return 'text-orange-600';
      case 'normal':
        return 'text-blue-600';
      case 'low':
        return 'text-gray-600';
      default:
        return 'text-gray-600';
    }
  };

  const formatJobType = (type: string) => {
    return type
      .split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  };

  const formatDuration = (ms?: number) => {
    if (!ms) return '-';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  const calculateProgress = (job: DeviceJob) => {
    if (!job.steps || job.steps.length === 0) return 0;
    const completedSteps = job.steps.filter((s) => s.status === 'completed').length;
    return Math.round((completedSteps / job.steps.length) * 100);
  };

  if (jobs.length === 0 && !loading && !error) {
    return null;
  }

  return (
    <div className={`job-monitor ${className || ''}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">
          Active Configuration Jobs
          {jobs.length > 0 && (
            <span className="ml-2 text-sm font-normal text-gray-600">
              ({jobs.length})
            </span>
          )}
        </h3>
        <div className="flex items-center gap-2">
          {autoRefresh && (
            <span className="text-xs text-gray-500 flex items-center gap-1">
              <span className="inline-block w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
              Auto-refreshing
            </span>
          )}
          <button
            onClick={fetchJobs}
            disabled={loading}
            className="px-3 py-1 text-sm text-blue-600 hover:text-blue-700 disabled:text-gray-400"
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      <div className="space-y-3">
        {jobs.map((job) => (
          <div
            key={job.id}
            className="p-4 bg-white border border-gray-200 rounded-lg hover:shadow-md transition-shadow"
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-medium text-gray-900">
                    {formatJobType(job.jobType)}
                  </h4>
                  <span className={`px-2 py-0.5 text-xs rounded-full ${getStatusColor(job.status)}`}>
                    {job.status}
                  </span>
                  <span className={`text-xs ${getPriorityColor(job.priority)}`}>
                    {job.priority}
                  </span>
                </div>
                <p className="text-sm text-gray-600">{job.reason}</p>
              </div>
              <div className="text-xs text-gray-500">
                {new Date(job.createdAt).toLocaleTimeString()}
              </div>
            </div>

            {/* Progress Bar */}
            {job.steps && job.steps.length > 0 && (
              <div className="mb-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-600">
                    Progress: {job.steps.filter((s) => s.status === 'completed').length}/{job.steps.length} steps
                  </span>
                  <span className="text-xs text-gray-600">{calculateProgress(job)}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${calculateProgress(job)}%` }}
                  ></div>
                </div>
              </div>
            )}

            {/* Current Step or Error */}
            {job.status !== 'queued' && job.status !== 'completed' && (
              <div className="mb-3">
                {job.steps && job.steps.length > 0 && (
                  <div className="text-sm">
                    <span className="text-gray-600">Current step: </span>
                    <span className="font-medium text-gray-900">
                      {job.steps.find((s) => s.status === 'running')?.stepName || 'Processing...'}
                    </span>
                  </div>
                )}
                {job.error && (
                  <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                    {job.error}
                  </div>
                )}
              </div>
            )}

            {/* Retry Information */}
            {job.attempts > 0 && (
              <div className="text-xs text-gray-600 mb-3">
                Attempt {job.attempts}/{job.maxAttempts}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSelectedJob(selectedJob === job.id ? null : job.id)}
                className="text-sm text-blue-600 hover:text-blue-700"
              >
                {selectedJob === job.id ? 'Hide Details' : 'View Details'}
              </button>
            </div>

            {/* Expanded Details */}
            {selectedJob === job.id && job.steps && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <h5 className="text-sm font-medium text-gray-900 mb-3">Execution Steps</h5>
                <div className="space-y-2">
                  {job.steps.map((step) => (
                    <div
                      key={step.stepNumber}
                      className="flex items-center justify-between p-2 bg-gray-50 rounded"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-gray-500">#{step.stepNumber}</span>
                        <span className="text-sm text-gray-900">{step.stepName}</span>
                        <span className={`px-2 py-0.5 text-xs rounded-full ${getStatusColor(step.status)}`}>
                          {step.status}
                        </span>
                      </div>
                      {step.durationMs && (
                        <span className="text-xs text-gray-500">
                          {formatDuration(step.durationMs)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
