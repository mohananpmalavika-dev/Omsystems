/**
 * CSV Export Utility
 * Handles CSV generation and download for alerts, reports, and health data
 */

import Papa from 'papaparse';

// ============================================================================
// Generic CSV Export Function
// ============================================================================

export interface CSVExportOptions {
  filename: string;
  fields?: string[]; // Optional: specify which fields to include
  headers?: Record<string, string>; // Optional: custom header labels
}

export function exportToCSV<T extends Record<string, any>>(
  data: T[],
  options: CSVExportOptions
): void {
  if (!data || data.length === 0) {
    throw new Error('No data to export');
  }

  // Filter fields if specified
  const processedData = options.fields
    ? data.map(row => {
        const filtered: Record<string, any> = {};
        options.fields!.forEach(field => {
          filtered[field] = row[field];
        });
        return filtered;
      })
    : data;

  // Apply custom headers if specified
  const csvData = options.headers
    ? processedData.map(row => {
        const renamed: Record<string, any> = {};
        Object.keys(row).forEach(key => {
          const newKey = options.headers![key] || key;
          renamed[newKey] = row[key];
        });
        return renamed;
      })
    : processedData;

  // Generate CSV string
  const csv = Papa.unparse(csvData);

  // Create blob and download
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', options.filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ============================================================================
// Alert Export
// ============================================================================

export interface AlertExportData {
  id: string;
  severity: string;
  category: string;
  message: string;
  source: string;
  status: string;
  createdAt: string;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  notes?: string;
}

export function exportAlertsToCSV(alerts: AlertExportData[], filename?: string): void {
  exportToCSV(alerts, {
    filename: filename || `alerts_export_${new Date().toISOString().split('T')[0]}.csv`,
    headers: {
      id: 'Alert ID',
      severity: 'Severity',
      category: 'Category',
      message: 'Message',
      source: 'Source',
      status: 'Status',
      createdAt: 'Created At',
      acknowledgedAt: 'Acknowledged At',
      acknowledgedBy: 'Acknowledged By',
      resolvedAt: 'Resolved At',
      resolvedBy: 'Resolved By',
      notes: 'Notes',
    },
  });
}

// ============================================================================
// Work Order Export
// ============================================================================

export interface WorkOrderExportData {
  workOrderNumber: string;
  assetId: string;
  problem: string;
  severity: string;
  status: string;
  createdAt: string;
  assignedTo?: string;
  slaDueAt?: string;
  resolvedAt?: string;
  cost?: number;
  rootCause?: string;
}

export function exportWorkOrdersToCSV(workOrders: WorkOrderExportData[], filename?: string): void {
  exportToCSV(workOrders, {
    filename: filename || `work_orders_${new Date().toISOString().split('T')[0]}.csv`,
    headers: {
      workOrderNumber: 'WO Number',
      assetId: 'Asset ID',
      problem: 'Problem',
      severity: 'Severity',
      status: 'Status',
      createdAt: 'Created',
      assignedTo: 'Assigned To',
      slaDueAt: 'SLA Due',
      resolvedAt: 'Resolved',
      cost: 'Cost ($)',
      rootCause: 'Root Cause',
    },
  });
}

// ============================================================================
// Camera Health Export
// ============================================================================

export interface CameraHealthExportData {
  cameraId: string;
  cameraName: string;
  branchName: string;
  status: string;
  uptime: number;
  lastSeen: string;
  frameRate: number;
  bitrate: number;
  resolution: string;
  diskUsage?: number;
}

export function exportCameraHealthToCSV(cameras: CameraHealthExportData[], filename?: string): void {
  exportToCSV(cameras, {
    filename: filename || `camera_health_${new Date().toISOString().split('T')[0]}.csv`,
    headers: {
      cameraId: 'Camera ID',
      cameraName: 'Camera Name',
      branchName: 'Branch',
      status: 'Status',
      uptime: 'Uptime (%)',
      lastSeen: 'Last Seen',
      frameRate: 'Frame Rate (fps)',
      bitrate: 'Bitrate (kbps)',
      resolution: 'Resolution',
      diskUsage: 'Disk Usage (GB)',
    },
  });
}

// ============================================================================
// Maintenance Visit Export
// ============================================================================

export interface MaintenanceVisitExportData {
  id: string;
  maintenancePlanName: string;
  branchName: string;
  dueAt: string;
  visitedAt?: string;
  status: string;
  assignedTo?: string;
  duration?: number;
  findings?: string;
  notes?: string;
}

export function exportMaintenanceVisitsToCSV(visits: MaintenanceVisitExportData[], filename?: string): void {
  exportToCSV(visits, {
    filename: filename || `maintenance_visits_${new Date().toISOString().split('T')[0]}.csv`,
    headers: {
      id: 'Visit ID',
      maintenancePlanName: 'Plan',
      branchName: 'Branch',
      dueAt: 'Due Date',
      visitedAt: 'Completed Date',
      status: 'Status',
      assignedTo: 'Technician',
      duration: 'Duration (min)',
      findings: 'Findings',
      notes: 'Notes',
    },
  });
}

// ============================================================================
// Storage Health Export
// ============================================================================

export interface StorageHealthExportData {
  storageId: string;
  storageName: string;
  branchName: string;
  totalCapacity: number;
  usedCapacity: number;
  availableCapacity: number;
  usagePercent: number;
  status: string;
  estimatedDaysLeft?: number;
  lastChecked: string;
}

export function exportStorageHealthToCSV(storage: StorageHealthExportData[], filename?: string): void {
  exportToCSV(storage, {
    filename: filename || `storage_health_${new Date().toISOString().split('T')[0]}.csv`,
    headers: {
      storageId: 'Storage ID',
      storageName: 'Storage Name',
      branchName: 'Branch',
      totalCapacity: 'Total Capacity (GB)',
      usedCapacity: 'Used (GB)',
      availableCapacity: 'Available (GB)',
      usagePercent: 'Usage (%)',
      status: 'Status',
      estimatedDaysLeft: 'Days Left',
      lastChecked: 'Last Checked',
    },
  });
}

// ============================================================================
// Vendor Performance Export
// ============================================================================

export interface VendorPerformanceExportData {
  vendorName: string;
  totalWorkOrders: number;
  completedWorkOrders: number;
  avgResolutionTime: number;
  slaComplianceRate: number;
  totalCost: number;
  rating?: number;
}

export function exportVendorPerformanceToCSV(vendors: VendorPerformanceExportData[], filename?: string): void {
  exportToCSV(vendors, {
    filename: filename || `vendor_performance_${new Date().toISOString().split('T')[0]}.csv`,
    headers: {
      vendorName: 'Vendor Name',
      totalWorkOrders: 'Total Work Orders',
      completedWorkOrders: 'Completed',
      avgResolutionTime: 'Avg Resolution Time (hours)',
      slaComplianceRate: 'SLA Compliance (%)',
      totalCost: 'Total Cost ($)',
      rating: 'Rating',
    },
  });
}

// ============================================================================
// Cost Analysis Export
// ============================================================================

export interface CostAnalysisExportData {
  month: string;
  correctiveCost: number;
  preventiveCost: number;
  amcCost: number;
  spareParts: number;
  labor: number;
  total: number;
}

export function exportCostAnalysisToCSV(costs: CostAnalysisExportData[], filename?: string): void {
  exportToCSV(costs, {
    filename: filename || `cost_analysis_${new Date().toISOString().split('T')[0]}.csv`,
    headers: {
      month: 'Month',
      correctiveCost: 'Corrective ($)',
      preventiveCost: 'Preventive ($)',
      amcCost: 'AMC ($)',
      spareParts: 'Spare Parts ($)',
      labor: 'Labor ($)',
      total: 'Total ($)',
    },
  });
}

// ============================================================================
// Generic Data Table Export (for custom data)
// ============================================================================

export function exportDataTableToCSV(
  data: Record<string, any>[],
  filename: string,
  customHeaders?: Record<string, string>
): void {
  exportToCSV(data, {
    filename,
    headers: customHeaders,
  });
}
