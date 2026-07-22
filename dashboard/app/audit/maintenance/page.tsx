'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface MaintenanceWorkOrder {
  id: string;
  workOrderNumber: string;
  cameraId?: string;
  cameraName?: string;
  branchName?: string;
  workType: string;
  priority: string;
  title: string;
  reportedProblem?: string;
  status: string;
  scheduledDate?: string;
  assignedTechnicianName?: string;
  downtimeMinutes?: number;
  createdAt: string;
}

interface MaintenanceSummary {
  totalWorkOrders: number;
  openOrders: number;
  scheduledOrders: number;
  inProgressOrders: number;
  completedOrders: number;
  urgentOrders: number;
  overdueOrders: number;
  avgDowntimeMinutes: number;
}

export default function MaintenancePage() {
  const router = useRouter();
  const [workOrders, setWorkOrders] = useState<MaintenanceWorkOrder[]>([]);
  const [summary, setSummary] = useState<MaintenanceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({
    status: '',
    priority: '',
    workType: '',
  });

  useEffect(() => {
    fetchMaintenanceData();
  }, [filter]);

  const fetchMaintenanceData = async () => {
    try {
      // Fetch summary
      const summaryResponse = await fetch('/api/audit/maintenance?summary=true');
      const summaryData = await summaryResponse.json();
      setSummary(summaryData);

      // Fetch work orders
      const params = new URLSearchParams();
      if (filter.status) params.append('status', filter.status);
      if (filter.priority) params.append('priority', filter.priority);
      if (filter.workType) params.append('workType', filter.workType);

      const response = await fetch(`/api/audit/maintenance?${params}`);
      const data = await response.json();
      setWorkOrders(data);
    } catch (error) {
      console.error('Failed to fetch maintenance data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'emergency':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'urgent':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'high':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'normal':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'in_progress':
        return 'bg-blue-100 text-blue-800';
      case 'scheduled':
        return 'bg-purple-100 text-purple-800';
      case 'open':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
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
            <h1 className="text-3xl font-bold text-gray-900">Maintenance Management</h1>
            <p className="text-gray-600 mt-1">Track and manage camera maintenance work orders</p>
          </div>
          <button
            onClick={() => router.push('/audit/maintenance/create')}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            + New Work Order
          </button>
        </div>
      </div>

      {/* Summary Statistics */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-600 mb-1">Total</div>
            <div className="text-2xl font-bold text-gray-900">{summary.totalWorkOrders}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-600 mb-1">Open</div>
            <div className="text-2xl font-bold text-yellow-600">{summary.openOrders}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-600 mb-1">Scheduled</div>
            <div className="text-2xl font-bold text-purple-600">{summary.scheduledOrders}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-600 mb-1">In Progress</div>
            <div className="text-2xl font-bold text-blue-600">{summary.inProgressOrders}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-600 mb-1">Completed</div>
            <div className="text-2xl font-bold text-green-600">{summary.completedOrders}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-600 mb-1">Urgent</div>
            <div className="text-2xl font-bold text-red-600">{summary.urgentOrders}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-600 mb-1">Overdue</div>
            <div className="text-2xl font-bold text-red-600">{summary.overdueOrders}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-600 mb-1">Avg Downtime</div>
            <div className="text-2xl font-bold text-gray-900">
              {summary.avgDowntimeMinutes?.toFixed(0) || 0}<span className="text-sm">m</span>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              value={filter.status}
              onChange={(e) => setFilter({ ...filter, status: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="">All Statuses</option>
              <option value="open">Open</option>
              <option value="scheduled">Scheduled</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="closed">Closed</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
            <select
              value={filter.priority}
              onChange={(e) => setFilter({ ...filter, priority: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="">All Priorities</option>
              <option value="emergency">Emergency</option>
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="normal">Normal</option>
              <option value="routine">Routine</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Work Type</label>
            <select
              value={filter.workType}
              onChange={(e) => setFilter({ ...filter, workType: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="">All Types</option>
              <option value="preventive">Preventive</option>
              <option value="corrective">Corrective</option>
              <option value="emergency">Emergency</option>
              <option value="replacement">Replacement</option>
              <option value="cleaning">Cleaning</option>
              <option value="adjustment">Adjustment</option>
            </select>
          </div>
        </div>
      </div>

      {/* Work Order List */}
      <div className="space-y-4">
        {workOrders.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <div className="text-gray-400 text-lg">No work orders found</div>
          </div>
        ) : (
          workOrders.map((order) => (
            <div
              key={order.id}
              className="bg-white rounded-lg shadow hover:shadow-md transition-shadow p-6 cursor-pointer"
              onClick={() => router.push(`/audit/maintenance/${order.id}`)}
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getPriorityColor(order.priority)}`}>
                      {order.priority.toUpperCase()}
                    </span>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(order.status)}`}>
                      {order.status.replace('_', ' ').toUpperCase()}
                    </span>
                    <span className="text-sm text-gray-600">{order.workOrderNumber}</span>
                  </div>

                  <h3 className="text-lg font-semibold text-gray-900 mb-2">{order.title}</h3>

                  <div className="flex items-center gap-6 text-sm text-gray-600 mb-2">
                    {order.cameraName && (
                      <div className="flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        {order.cameraName}
                      </div>
                    )}
                    {order.branchName && (
                      <div className="flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        </svg>
                        {order.branchName}
                      </div>
                    )}
                    <div className="flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" />
                      </svg>
                      {order.workType}
                    </div>
                  </div>

                  {order.reportedProblem && (
                    <p className="text-sm text-gray-600 mb-2">{order.reportedProblem}</p>
                  )}

                  <div className="flex items-center gap-6 text-sm">
                    {order.scheduledDate && (
                      <div>
                        <span className="text-gray-600">Scheduled:</span>{' '}
                        <span className="font-medium">{new Date(order.scheduledDate).toLocaleDateString()}</span>
                      </div>
                    )}
                    {order.assignedTechnicianName && (
                      <div>
                        <span className="text-gray-600">Technician:</span>{' '}
                        <span className="font-medium">{order.assignedTechnicianName}</span>
                      </div>
                    )}
                    {order.downtimeMinutes !== undefined && (
                      <div>
                        <span className="text-gray-600">Downtime:</span>{' '}
                        <span className="font-medium">{order.downtimeMinutes}m</span>
                      </div>
                    )}
                  </div>
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    router.push(`/audit/maintenance/${order.id}`);
                  }}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
                >
                  View Details
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
