"use client";

/**
 * Incident List Component
 * 
 * Displays incidents with filtering, sorting, and cursor pagination.
 */

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

export interface IncidentListItem {
  id: string;
  title: string;
  incidentType: string;
  status: "OPEN" | "ACKNOWLEDGED" | "INVESTIGATING" | "RESOLVED" | "CLOSED";
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  branch?: {
    id: string;
    name: string;
  } | null;
  camera?: {
    id: string;
    name: string;
  } | null;
  alertCount: number;
  assignedTo?: {
    id: string;
    displayName: string;
  } | null;
  firstDetectedAt: string | null;
  lastDetectedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IncidentFilters {
  status?: string;
  severity?: string;
  type?: string;
  branchId?: string;
  cameraId?: string;
  assignedTo?: string;
  unassigned?: boolean;
  from?: string;
  to?: string;
  search?: string;
  sort?: "createdAt" | "updatedAt" | "severity";
  order?: "asc" | "desc";
}

export interface IncidentListProps {
  initialFilters?: IncidentFilters;
  onIncidentClick?: (incident: IncidentListItem) => void;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

export function IncidentList({
  initialFilters = {},
  onIncidentClick,
  autoRefresh = true,
  refreshInterval = 30000, // 30 seconds
}: IncidentListProps) {
  const router = useRouter();
  
  const [incidents, setIncidents] = useState<IncidentListItem[]>([]);
  const [filters, setFilters] = useState<IncidentFilters>(initialFilters);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Pagination state
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  
  // Statistics
  const [stats, setStats] = useState({
    activeIncidents: 0,
    totalIncidents: 0,
    alertsCorrelated: 0,
  });

  /**
   * Fetch incidents from API
   */
  const fetchIncidents = useCallback(
    async (cursor?: string, append = false) => {
      try {
        if (!append) {
          setLoading(true);
        } else {
          setLoadingMore(true);
        }
        
        setError(null);

        // Build query params
        const params = new URLSearchParams();
        
        if (filters.status) params.set("status", filters.status);
        if (filters.severity) params.set("severity", filters.severity);
        if (filters.type) params.set("type", filters.type);
        if (filters.branchId) params.set("branchId", filters.branchId);
        if (filters.cameraId) params.set("cameraId", filters.cameraId);
        if (filters.assignedTo) params.set("assignedTo", filters.assignedTo);
        if (filters.unassigned) params.set("unassigned", "true");
        if (filters.from) params.set("from", filters.from);
        if (filters.to) params.set("to", filters.to);
        if (filters.search) params.set("search", filters.search);
        if (filters.sort) params.set("sort", filters.sort);
        if (filters.order) params.set("order", filters.order);
        if (cursor) params.set("cursor", cursor);

        const response = await fetch(`/api/incidents?${params.toString()}`, {
          credentials: "include",
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch incidents: ${response.statusText}`);
        }

        const result = await response.json();

        if (!result.success) {
          throw new Error(result.error || "Failed to fetch incidents");
        }

        const newIncidents = result.data.incidents || [];

        if (append) {
          setIncidents((prev) => [...prev, ...newIncidents]);
        } else {
          setIncidents(newIncidents);
          
          // Update stats on initial load
          setStats({
            activeIncidents: result.data.activeIncidents || 0,
            totalIncidents: result.data.totalIncidents || 0,
            alertsCorrelated: result.data.alertsCorrelated || 0,
          });
        }

        setHasMore(result.pagination?.hasMore || false);
        setNextCursor(result.pagination?.nextCursor || null);
      } catch (err) {
        console.error("Error fetching incidents:", err);
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [filters]
  );

  /**
   * Load more incidents (pagination)
   */
  const loadMore = useCallback(() => {
    if (!loadingMore && hasMore && nextCursor) {
      fetchIncidents(nextCursor, true);
    }
  }, [loadingMore, hasMore, nextCursor, fetchIncidents]);

  /**
   * Update filter and refetch
   */
  const updateFilter = useCallback(
    (key: keyof IncidentFilters, value: any) => {
      setFilters((prev) => ({
        ...prev,
        [key]: value,
      }));
    },
    []
  );

  /**
   * Clear all filters
   */
  const clearFilters = useCallback(() => {
    setFilters({});
  }, []);

  /**
   * Initial load and filter changes
   */
  useEffect(() => {
    fetchIncidents();
  }, [fetchIncidents]);

  /**
   * Auto-refresh
   */
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetchIncidents();
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, fetchIncidents]);

  /**
   * Handle incident click
   */
  const handleIncidentClick = useCallback(
    (incident: IncidentListItem) => {
      if (onIncidentClick) {
        onIncidentClick(incident);
      } else {
        router.push(`/incidents/${incident.id}`);
      }
    },
    [onIncidentClick, router]
  );

  /**
   * Get severity badge color
   */
  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "CRITICAL":
        return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
      case "HIGH":
        return "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200";
      case "MEDIUM":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
      case "LOW":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200";
    }
  };

  /**
   * Get status badge color
   */
  const getStatusColor = (status: string) => {
    switch (status) {
      case "OPEN":
        return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
      case "ACKNOWLEDGED":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
      case "INVESTIGATING":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
      case "RESOLVED":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      case "CLOSED":
        return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200";
    }
  };

  /**
   * Format relative time
   */
  const formatRelativeTime = (dateString: string | null) => {
    if (!dateString) return "N/A";

    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString();
  };

  if (loading && incidents.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
        <div className="flex items-center">
          <svg
            className="h-5 w-5 text-red-400 mr-2"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
        </div>
        <button
          onClick={() => fetchIncidents()}
          className="mt-3 text-sm text-red-600 dark:text-red-400 hover:text-red-500 underline"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Statistics Bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="text-sm text-gray-600 dark:text-gray-400">
            Active Incidents
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">
            {stats.activeIncidents}
          </div>
        </div>
        
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="text-sm text-gray-600 dark:text-gray-400">
            Total Incidents
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">
            {stats.totalIncidents}
          </div>
        </div>
        
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="text-sm text-gray-600 dark:text-gray-400">
            Alerts Correlated
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">
            {stats.alertsCorrelated}
          </div>
        </div>
      </div>

      {/* Incident List */}
      <div className="space-y-2">
        {incidents.length === 0 ? (
          <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <p className="text-gray-500 dark:text-gray-400">No incidents found</p>
          </div>
        ) : (
          incidents.map((incident) => (
            <div
              key={incident.id}
              onClick={() => handleIncidentClick(incident)}
              className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 hover:bg-gray-50 dark:hover:bg-gray-750 cursor-pointer transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className={`px-2 py-1 text-xs font-medium rounded ${getSeverityColor(
                        incident.severity
                      )}`}
                    >
                      {incident.severity}
                    </span>
                    <span
                      className={`px-2 py-1 text-xs font-medium rounded ${getStatusColor(
                        incident.status
                      )}`}
                    >
                      {incident.status}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {formatRelativeTime(incident.createdAt)}
                    </span>
                  </div>

                  <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-1 truncate">
                    {incident.title}
                  </h3>

                  <div className="flex items-center gap-4 text-xs text-gray-600 dark:text-gray-400">
                    {incident.branch && (
                      <span>📍 {incident.branch.name}</span>
                    )}
                    {incident.camera && (
                      <span>📹 {incident.camera.name}</span>
                    )}
                    <span>🔔 {incident.alertCount} alerts</span>
                    {incident.assignedTo && (
                      <span>👤 {incident.assignedTo.displayName}</span>
                    )}
                  </div>
                </div>

                <svg
                  className="h-5 w-5 text-gray-400 flex-shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Load More Button */}
      {hasMore && (
        <div className="text-center pt-4">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loadingMore ? "Loading..." : "Load More"}
          </button>
        </div>
      )}
    </div>
  );
}

export default IncidentList;
