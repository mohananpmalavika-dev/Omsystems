/**
 * Employee Activity Report Component
 * Comprehensive activity tracking and reporting interface
 */

'use client';

import React, { useState, useEffect } from 'react';
import {
  Calendar,
  Clock,
  Users,
  Activity,
  Monitor,
  BarChart3,
  Download,
  Filter,
  Search,
  Eye,
  TrendingUp,
  AlertCircle,
  FileSpreadsheet,
  FileText,
} from 'lucide-react';
import { exportReport } from '../lib/export-report';

interface EmployeeActivityReportProps {
  apiBaseUrl: string;
  accessToken: string;
  currentUserId?: string;
  showAllUsers?: boolean;
}

interface User {
  id: string;
  display_name: string;
  username: string;
}

interface SessionSummary {
  total_sessions: number;
  total_duration_seconds: number;
  avg_session_duration_seconds: number;
  first_login: string;
  last_logout: string;
}

interface ModuleUsage {
  page_module: string;
  visit_count: number;
  total_seconds: number;
  avg_seconds: number;
}

interface ControlRoomSummary {
  total_monitoring_sessions: number;
  total_monitoring_seconds: number;
  unique_branches_monitored: number;
  total_alerts_handled: number;
  total_incidents_created: number;
  total_camera_switches: number;
}

interface BranchMonitoring {
  branch_name: string;
  branch_node_id: string;
  monitoring_sessions: number;
  total_seconds: number;
}

interface ComprehensiveReport {
  user: User;
  period: { startDate: string; endDate: string };
  sessionSummary: SessionSummary;
  moduleUsage: ModuleUsage[];
  controlRoomSummary: ControlRoomSummary;
  branchMonitoring: BranchMonitoring[];
  actionSummary: Array<{ action_category: string; action_count: number }>;
}

type ReportPeriod = 'daily' | 'weekly' | 'monthly' | 'custom';

export function EmployeeActivityReport({
  apiBaseUrl,
  accessToken,
  currentUserId,
  showAllUsers = false,
}: EmployeeActivityReportProps) {
  const [period, setPeriod] = useState<ReportPeriod>('daily');
  const [startDate, setStartDate] = useState<string>(
    new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [endDate, setEndDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [selectedUserId, setSelectedUserId] = useState<string>(currentUserId || '');
  const [users, setUsers] = useState<User[]>([]);
  const [report, setReport] = useState<ComprehensiveReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch users list if admin
  useEffect(() => {
    if (showAllUsers) {
      fetchUsers();
    }
  }, [showAllUsers]);

  const fetchUsers = async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/v1/users`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        setUsers(data.data || []);
      }
    } catch (err) {
      console.error('Error fetching users:', err);
    }
  };

  const fetchReport = async () => {
    setLoading(true);
    setError(null);

    try {
      const userId = selectedUserId || currentUserId;
      const params = new URLSearchParams({
        startDate,
        endDate,
        ...(userId && { userId }),
      });

      const response = await fetch(
        `${apiBaseUrl}/v1/activity/report/comprehensive?${params}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch report');
      }

      const data = await response.json();
      setReport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load report');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [startDate, endDate, selectedUserId]);

  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  const formatPercentage = (value: number, total: number): string => {
    return total > 0 ? `${((value / total) * 100).toFixed(1)}%` : '0%';
  };

  return (
    <div className="space-y-6 p-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Employee Activity Report
            </h1>
            <p className="text-gray-600 mt-1">
              Comprehensive tracking from login to logout
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => report && exportReport(report, { format: 'pdf' })}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              disabled={!report || loading}
            >
              <FileText className="w-4 h-4" />
              Export PDF
            </button>
            <button
              onClick={() => report && exportReport(report, { format: 'excel' })}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              disabled={!report || loading}
            >
              <FileSpreadsheet className="w-4 h-4" />
              Export Excel
            </button>
            <button
              onClick={() => report && exportReport(report, { format: 'csv' })}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              disabled={!report || loading}
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
          </div>
        </div>


        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {showAllUsers && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Employee
              </label>
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select Employee</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.display_name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Report Period
            </label>
            <select
              value={period}
              onChange={(e) => {
                const newPeriod = e.target.value as ReportPeriod;
                setPeriod(newPeriod);
                
                const today = new Date();
                if (newPeriod === 'daily') {
                  setStartDate(new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
                  setEndDate(today.toISOString().split('T')[0]);
                } else if (newPeriod === 'weekly') {
                  setStartDate(new Date(today.getTime() - 4 * 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
                  setEndDate(today.toISOString().split('T')[0]);
                } else if (newPeriod === 'monthly') {
                  setStartDate(new Date(today.getFullYear(), today.getMonth() - 3, 1).toISOString().split('T')[0]);
                  setEndDate(today.toISOString().split('T')[0]);
                }
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="custom">Custom Range</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Start Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              End Date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="bg-white rounded-lg shadow-sm p-12 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading report...</p>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-600" />
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {/* Report Content */}
      {!loading && !error && report && (
        <>
          {/* User Info Card */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
                <Users className="w-8 h-8 text-blue-600" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900">
                  {report.user.display_name}
                </h2>
                <p className="text-gray-600">{report.user.username}</p>
                <p className="text-sm text-gray-500 mt-1">
                  Report Period: {report.period.startDate} to {report.period.endDate}
                </p>
              </div>
            </div>
          </div>

          {/* Session Summary */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Clock className="w-5 h-5 text-blue-600" />
              Session Summary
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-blue-50 rounded-lg p-4">
                <p className="text-sm text-gray-600 mb-1">Total Sessions</p>
                <p className="text-2xl font-bold text-blue-600">
                  {report.sessionSummary.total_sessions}
                </p>
              </div>
              <div className="bg-green-50 rounded-lg p-4">
                <p className="text-sm text-gray-600 mb-1">Total Time</p>
                <p className="text-2xl font-bold text-green-600">
                  {formatDuration(report.sessionSummary.total_duration_seconds)}
                </p>
              </div>
              <div className="bg-purple-50 rounded-lg p-4">
                <p className="text-sm text-gray-600 mb-1">Avg Session</p>
                <p className="text-2xl font-bold text-purple-600">
                  {formatDuration(report.sessionSummary.avg_session_duration_seconds)}
                </p>
              </div>
              <div className="bg-orange-50 rounded-lg p-4">
                <p className="text-sm text-gray-600 mb-1">Last Activity</p>
                <p className="text-sm font-semibold text-orange-600">
                  {report.sessionSummary.last_logout
                    ? new Date(report.sessionSummary.last_logout).toLocaleString()
                    : 'Currently Active'}
                </p>
              </div>
            </div>
          </div>


          {/* Module Usage */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Activity className="w-5 h-5 text-blue-600" />
              Module Usage Breakdown
            </h3>
            <div className="space-y-3">
              {report.moduleUsage.map((module, index) => {
                const totalSeconds = report.moduleUsage.reduce((sum, m) => sum + m.total_seconds, 0);
                const percentage = (module.total_seconds / totalSeconds) * 100;

                return (
                  <div key={index} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900 capitalize">
                          {module.page_module.replace(/_/g, ' ')}
                        </span>
                        <span className="text-sm text-gray-500">
                          ({module.visit_count} visits)
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="font-semibold text-gray-900">
                          {formatDuration(module.total_seconds)}
                        </span>
                        <span className="text-sm text-gray-500 ml-2">
                          ({percentage.toFixed(1)}%)
                        </span>
                      </div>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              {report.moduleUsage.length === 0 && (
                <p className="text-gray-500 text-center py-4">No module usage data available</p>
              )}
            </div>
          </div>

          {/* Control Room Activity */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Monitor className="w-5 h-5 text-blue-600" />
              Control Room Activity
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-indigo-50 rounded-lg p-4">
                <p className="text-sm text-gray-600 mb-1">Monitoring Time</p>
                <p className="text-2xl font-bold text-indigo-600">
                  {formatDuration(report.controlRoomSummary.total_monitoring_seconds)}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {formatPercentage(
                    report.controlRoomSummary.total_monitoring_seconds,
                    report.sessionSummary.total_duration_seconds
                  )}{' '}
                  of total time
                </p>
              </div>
              <div className="bg-teal-50 rounded-lg p-4">
                <p className="text-sm text-gray-600 mb-1">Branches Monitored</p>
                <p className="text-2xl font-bold text-teal-600">
                  {report.controlRoomSummary.unique_branches_monitored}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {report.controlRoomSummary.total_monitoring_sessions} sessions
                </p>
              </div>
              <div className="bg-rose-50 rounded-lg p-4">
                <p className="text-sm text-gray-600 mb-1">Alerts & Incidents</p>
                <p className="text-2xl font-bold text-rose-600">
                  {report.controlRoomSummary.total_alerts_handled}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {report.controlRoomSummary.total_incidents_created} incidents created
                </p>
              </div>
            </div>

            {/* Branch Monitoring Details */}
            {report.branchMonitoring.length > 0 && (
              <div className="mt-6">
                <h4 className="font-medium text-gray-900 mb-3">
                  Branch Monitoring Breakdown
                </h4>
                <div className="space-y-2">
                  {report.branchMonitoring.slice(0, 10).map((branch, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-medium text-gray-900">
                          {branch.branch_name}
                        </span>
                        <span className="text-sm text-gray-500">
                          ({branch.monitoring_sessions} sessions)
                        </span>
                      </div>
                      <span className="font-semibold text-blue-600">
                        {formatDuration(branch.total_seconds)}
                      </span>
                    </div>
                  ))}
                </div>
                {report.branchMonitoring.length > 10 && (
                  <p className="text-sm text-gray-500 mt-2 text-center">
                    Showing top 10 of {report.branchMonitoring.length} branches
                  </p>
                )}
              </div>
            )}

            {/* Activity Metrics */}
            <div className="mt-6 grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <p className="text-2xl font-bold text-gray-900">
                  {report.controlRoomSummary.total_camera_switches}
                </p>
                <p className="text-sm text-gray-600 mt-1">Camera Switches</p>
              </div>
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <p className="text-2xl font-bold text-gray-900">
                  {report.controlRoomSummary.total_alerts_handled}
                </p>
                <p className="text-sm text-gray-600 mt-1">Alerts Handled</p>
              </div>
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <p className="text-2xl font-bold text-gray-900">
                  {report.controlRoomSummary.total_incidents_created}
                </p>
                <p className="text-sm text-gray-600 mt-1">Incidents Created</p>
              </div>
            </div>
          </div>

          {/* Action Summary */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-blue-600" />
              Action Summary
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {report.actionSummary.map((action, index) => (
                <div key={index} className="bg-gray-50 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-gray-900">
                    {action.action_count}
                  </p>
                  <p className="text-sm text-gray-600 mt-1 capitalize">
                    {action.action_category.replace(/_/g, ' ')}
                  </p>
                </div>
              ))}
              {report.actionSummary.length === 0 && (
                <p className="col-span-4 text-gray-500 text-center py-4">
                  No action data available
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
