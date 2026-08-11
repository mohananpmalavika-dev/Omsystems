/**
 * Incident Types and DTOs
 * 
 * Comprehensive type definitions for incident management
 */

export type IncidentStatus = 'OPEN' | 'ACKNOWLEDGED' | 'INVESTIGATING' | 'RESOLVED' | 'CLOSED';
export type IncidentSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type IncidentType = 
  | 'regional_outage'
  | 'infrastructure_failure'
  | 'cascade_failure'
  | 'mass_event'
  | 'fire_emergency'
  | 'security_breach'
  | 'storage_crisis'
  | 'intrusion'
  | 'camera_offline'
  | 'other';

/**
 * Core incident entity
 */
export interface Incident {
  id: string;
  tenantId: string;
  
  title: string;
  description: string;
  
  incidentType: IncidentType;
  severity: IncidentSeverity;
  status: IncidentStatus;
  
  branchId: string | null;
  cameraId: string | null;
  deviceId: string | null;
  
  assignedTo: string | null;
  
  alertCount: number;
  
  firstDetectedAt: Date | null;
  lastDetectedAt: Date | null;
  
  acknowledgedAt: Date | null;
  acknowledgedBy: string | null;
  
  resolvedAt: Date | null;
  resolvedBy: string | null;
  
  createdAt: Date;
  updatedAt: Date;
  
  metadata: Record<string, any>;
}

/**
 * Lightweight incident list item for list views
 */
export interface IncidentListItem {
  id: string;
  title: string;
  
  incidentType: IncidentType;
  status: IncidentStatus;
  severity: IncidentSeverity;
  
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

/**
 * Incident detail view with related data
 */
export interface IncidentDetails extends Incident {
  branch?: {
    id: string;
    name: string;
    address?: string;
  } | null;
  
  camera?: {
    id: string;
    name: string;
    location?: string;
  } | null;
  
  assignedUser?: {
    id: string;
    displayName: string;
    email?: string;
  } | null;
  
  acknowledgedByUser?: {
    id: string;
    displayName: string;
  } | null;
  
  resolvedByUser?: {
    id: string;
    displayName: string;
  } | null;
  
  alerts: IncidentAlert[];
}

/**
 * Alert associated with an incident
 */
export interface IncidentAlert {
  id: string;
  type: string;
  severity: string;
  cameraId: string | null;
  timestamp: Date;
}

/**
 * Cursor for pagination
 */
export interface IncidentCursor {
  createdAt: string;
  id: string;
}

/**
 * Query filters for listing incidents
 */
export interface IncidentListFilters {
  tenantId: string;
  
  status?: IncidentStatus;
  severity?: IncidentSeverity;
  type?: IncidentType;
  
  branchId?: string;
  cameraId?: string;
  deviceId?: string;
  
  assignedTo?: string;
  unassigned?: boolean;
  
  from?: Date;
  to?: Date;
  
  search?: string;
  
  limit: number;
  cursor?: IncidentCursor;
  
  sort: 'createdAt' | 'updatedAt' | 'severity';
  order: 'asc' | 'desc';
}

/**
 * Statistics filters
 */
export interface IncidentStatisticsFilters {
  tenantId: string;
  
  status?: IncidentStatus;
  severity?: IncidentSeverity;
  
  branchId?: string;
  
  from?: Date;
  to?: Date;
}

/**
 * Incident statistics
 */
export interface IncidentStatistics {
  total: number;
  active: number;
  critical: number;
  unassigned: number;
  alertsCorrelated: number;
  
  byStatus: Record<IncidentStatus, number>;
  bySeverity: Record<IncidentSeverity, number>;
}

/**
 * Paginated list result
 */
export interface IncidentListResult {
  incidents: IncidentListItem[];
  hasMore: boolean;
  nextCursor: string | null;
}

/**
 * API query parameters
 */
export interface IncidentListQuery {
  status?: IncidentStatus;
  severity?: IncidentSeverity;
  type?: IncidentType;
  
  branchId?: string;
  cameraId?: string;
  deviceId?: string;
  
  assignedTo?: string;
  unassigned?: boolean;
  
  from?: string;
  to?: string;
  
  search?: string;
  
  limit?: number;
  cursor?: string;
  
  sort?: 'createdAt' | 'updatedAt' | 'severity';
  order?: 'asc' | 'desc';
}

/**
 * Create incident input
 */
export interface CreateIncidentInput {
  tenantId: string;
  
  title: string;
  description: string;
  
  incidentType: IncidentType;
  severity: IncidentSeverity;
  
  branchId?: string;
  cameraId?: string;
  deviceId?: string;
  
  alertCount: number;
  
  firstDetectedAt?: Date;
  lastDetectedAt?: Date;
  
  metadata?: Record<string, any>;
}

/**
 * Update incident input
 */
export interface UpdateIncidentInput {
  title?: string;
  description?: string;
  
  severity?: IncidentSeverity;
  status?: IncidentStatus;
  
  assignedTo?: string;
  
  acknowledgedAt?: Date;
  acknowledgedBy?: string;
  
  resolvedAt?: Date;
  resolvedBy?: string;
  
  metadata?: Record<string, any>;
}

/**
 * Active incident statuses
 */
export const ACTIVE_INCIDENT_STATUSES: readonly IncidentStatus[] = [
  'OPEN',
  'ACKNOWLEDGED',
  'INVESTIGATING',
] as const;

/**
 * Check if incident status is active
 */
export function isActiveIncidentStatus(status: IncidentStatus): boolean {
  return ACTIVE_INCIDENT_STATUSES.includes(status);
}

/**
 * Severity priority (higher = more severe)
 */
export const SEVERITY_PRIORITY: Record<IncidentSeverity, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};
