"use client";

/**
 * Incident Filters Component
 * 
 * Provides filtering controls for the incident list.
 */

import { useState, useEffect } from "react";

export interface IncidentFilterProps {
  onFiltersChange: (filters: any) => void;
  branches?: Array<{ id: string; name: string }>;
  cameras?: Array<{ id: string; name: string }>;
  users?: Array<{ id: string; displayName: string }>;
}

export function IncidentFilters({
  onFiltersChange,
  branches = [],
  cameras = [],
  users = [],
}: IncidentFilterProps) {
  const [status, setStatus] = useState<string>("");
  const [severity, setSeverity] = useState<string>("");
  const [type, setType] = useState<string>("");
  const [branchId, setBranchId] = useState<string>("");
  const [cameraId, setCameraId] = useState<string>("");
  const [assignedTo, setAssignedTo] = useState<string>("");
  const [unassigned, setUnassigned] = useState(false);
  const [search, setSearch] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [sort, setSort] = useState<string>("createdAt");
  const [order, setOrder] = useState<string>("desc");

  // Apply filters when they change
  useEffect(() => {
    const filters: any = {};

    if (status) filters.status = status;
    if (severity) filters.severity = severity;
    if (type) filters.type = type;
    if (branchId) filters.branchId = branchId;
    if (cameraId) filters.cameraId = cameraId;
    if (assignedTo) filters.assignedTo = assignedTo;
    if (unassigned) filters.unassigned = true;
    if (search) filters.search = search;
    if (dateFrom) filters.from = new Date(dateFrom).toISOString();
    if (dateTo) filters.to = new Date(dateTo).toISOString();
    if (sort) filters.sort = sort;
    if (order) filters.order = order;

    onFiltersChange(filters);
  }, [
    status,
    severity,
    type,
    branchId,
    cameraId,
    assignedTo,
    unassigned,
    search,
    dateFrom,
    dateTo,
    sort,
    order,
    onFiltersChange,
  ]);

  const clearFilters = () => {
    setStatus("");
    setSeverity("");
    setType("");
    setBranchId("");
    setCameraId("");
    setAssignedTo("");
    setUnassigned(false);
    setSearch("");
    setDateFrom("");
    setDateTo("");
    setSort("createdAt");
    setOrder("desc");
  };

  const hasActiveFilters = !!(
    status ||
    severity ||
    type ||
    branchId ||
    cameraId ||
    assignedTo ||
    unassigned ||
    search ||
    dateFrom ||
    dateTo
  );

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-gray-900 dark:text-white">
          Filters
        </h3>
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
          >
            Clear all
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Search */}
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
            Search
          </label>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, description..."
            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Status */}
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
            Status
          </label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Statuses</option>
            <option value="OPEN">Open</option>
            <option value="ACKNOWLEDGED">Acknowledged</option>
            <option value="INVESTIGATING">Investigating</option>
            <option value="RESOLVED">Resolved</option>
            <option value="CLOSED">Closed</option>
          </select>
        </div>

        {/* Severity */}
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
            Severity
          </label>
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Severities</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
        </div>

        {/* Type */}
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
            Type
          </label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Types</option>
            <option value="regional_outage">Regional Outage</option>
            <option value="infrastructure_failure">Infrastructure Failure</option>
            <option value="cascade_failure">Cascade Failure</option>
            <option value="mass_event">Mass Event</option>
            <option value="fire_emergency">Fire Emergency</option>
            <option value="security_breach">Security Breach</option>
            <option value="storage_crisis">Storage Crisis</option>
            <option value="intrusion">Intrusion</option>
            <option value="camera_offline">Camera Offline</option>
            <option value="other">Other</option>
          </select>
        </div>

        {/* Branch */}
        {branches.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Branch
            </label>
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Branches</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Camera */}
        {cameras.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Camera
            </label>
            <select
              value={cameraId}
              onChange={(e) => setCameraId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Cameras</option>
              {cameras.map((camera) => (
                <option key={camera.id} value={camera.id}>
                  {camera.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Assigned To */}
        {users.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Assigned To
            </label>
            <select
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Users</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.displayName}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Unassigned */}
        <div className="flex items-center pt-6">
          <input
            type="checkbox"
            id="unassigned"
            checked={unassigned}
            onChange={(e) => setUnassigned(e.target.checked)}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-gray-600 rounded"
          />
          <label
            htmlFor="unassigned"
            className="ml-2 text-sm text-gray-700 dark:text-gray-300"
          >
            Unassigned only
          </label>
        </div>

        {/* Date From */}
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
            From Date
          </label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Date To */}
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
            To Date
          </label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Sort */}
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
            Sort By
          </label>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="createdAt">Created Date</option>
            <option value="updatedAt">Updated Date</option>
            <option value="severity">Severity</option>
          </select>
        </div>

        {/* Order */}
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
            Order
          </label>
          <select
            value={order}
            onChange={(e) => setOrder(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="desc">Newest First</option>
            <option value="asc">Oldest First</option>
          </select>
        </div>
      </div>
    </div>
  );
}

export default IncidentFilters;
