"use client";

import React, { useEffect, useState } from "react";
import { deviceManagementApi } from "@/lib/api-client";
import { CheckCircle2, Clock, AlertTriangle, RefreshCw, Activity, ChevronRight } from "lucide-react";

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

  const fetchJobs = async () => {
    try {
      setError(null);
      const response = await deviceManagementApi.listJobs({
        deviceId,
        status: 'queued,claimed,precheck,connecting,applying,waiting-reboot,verifying,rolling-back,completed',
        limit: 10,
      });
      setJobs(response?.data || []);
    } catch (reason) {
      setJobs([]);
      setError(reason instanceof Error ? reason.message : "Job queue is unavailable");
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchJobs().finally(() => setLoading(false));

    if (autoRefresh) {
      const interval = setInterval(fetchJobs, 8000);
      return () => clearInterval(interval);
    }
  }, [deviceId, autoRefresh]);

  const getStatusBadge = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'completed':
        return 'bg-emerald-950/80 border-emerald-500/40 text-emerald-300';
      case 'failed':
      case 'manual-intervention':
        return 'bg-rose-950/80 border-rose-500/40 text-rose-300';
      case 'queued':
      case 'claimed':
        return 'bg-indigo-950/80 border-indigo-500/40 text-indigo-300 animate-pulse';
      default:
        return 'bg-slate-800 border-slate-700 text-slate-300';
    }
  };

  const formatJobType = (type: string) => {
    return type
      .split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  };

  return (
    <div className={`job-monitor space-y-3 font-mono text-xs ${className || ''}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2 text-slate-400">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>Real-Time Job Queue ({jobs.length} jobs)</span>
        </div>
        <button
          onClick={fetchJobs}
          disabled={loading}
          className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center"
        >
          <RefreshCw className={`w-3 h-3 mr-1 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {jobs.length === 0 ? (
        <div className="p-4 bg-slate-950 border border-slate-800 rounded-lg text-slate-400 text-center">
          {error || "No pending or active configuration jobs returned by the control plane."}
        </div>
      ) : (
        <div className="space-y-2.5">
          {jobs.map((job) => (
            <div
              key={job.id}
              className="p-3.5 bg-slate-950 border border-slate-800 rounded-lg space-y-2"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-slate-100">{formatJobType(job.jobType)}</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getStatusBadge(job.status)}`}>
                      {job.status.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">{job.reason}</p>
                </div>
                <span className="text-[10px] text-slate-500">
                  {new Date(job.createdAt).toLocaleTimeString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
