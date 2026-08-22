/**
 * API client for operational health endpoints
 */

import {
  HealthSummary,
  BranchHealth,
  BranchHealthDetail,
  CameraHealth,
  RecordingHealth,
  StorageHealth,
  DiskHealth,
  NetworkHealth,
  InternetFleetHealth,
  RecorderFleetHealth,
  UPSHealth,
  EdgeAgentHealth,
  HealthTrend,
  OperationalAlert,
  ApiResponse,
  BranchHealthFilters,
  CameraHealthFilters,
  DiskHealthFilters,
  UPSHealthFilters,
  EdgeAgentFilters,
  HealthTrendFilters,
  AlertFilters,
  AcknowledgeAlertPayload,
  AssignAlertPayload,
  ResolveAlertPayload,
  EscalateAlertPayload,
  SuppressAlertPayload,
  AddAlertCommentPayload,
  CreateWorkOrderPayload
} from '../types/operational-health';

const API_BASE = '/api/control/v1/operations';

/**
 * Fetch health summary
 */
export async function fetchHealthSummary(): Promise<HealthSummary> {
  const response = await fetch(`${API_BASE}/health/summary`);
  if (!response.ok) throw new Error('Failed to fetch health summary');
  const data: ApiResponse<HealthSummary> = await response.json();
  if (!data.success || !data.data) throw new Error(data.error || 'Invalid response');
  return data.data;
}

/**
 * Fetch branches health
 */
export async function fetchBranchesHealth(filters?: BranchHealthFilters) {
  const params = new URLSearchParams();
  if (filters?.status) params.append('status', filters.status);
  if (filters?.region) params.append('region', filters.region);
  if (filters?.limit) params.append('limit', filters.limit.toString());
  if (filters?.offset) params.append('offset', filters.offset.toString());
  
  const response = await fetch(`${API_BASE}/health/branches?${params}`);
  if (!response.ok) throw new Error('Failed to fetch branches health');
  const data = await response.json();
  if (!data.success) throw new Error(data.error || 'Invalid response');
  return data.data;
}

/**
 * Fetch branch health detail
 */
export async function fetchBranchHealthDetail(branchId: string): Promise<BranchHealthDetail> {
  const response = await fetch(`${API_BASE}/health/branches/${branchId}`);
  if (!response.ok) throw new Error('Failed to fetch branch health');
  const data: ApiResponse<BranchHealthDetail> = await response.json();
  if (!data.success || !data.data) throw new Error(data.error || 'Invalid response');
  return data.data;
}

/**
 * Fetch branch operational snapshot (single canonical payload for Branch Command Center)
 *
 * This is an alias to the backend snapshot endpoint which returns the canonical
 * branch health model meant to be consumed by the Branch Command Center UI.
 */
export async function fetchBranchOperationalSnapshot(branchId: string): Promise<any> {
  const response = await fetch(`${API_BASE}/health/branches/${branchId}/operational-snapshot`);
  if (!response.ok) throw new Error('Failed to fetch branch operational snapshot');
  const data: ApiResponse<any> = await response.json();
  if (!data.success || !data.data) throw new Error(data.error || 'Invalid response');
  return data.data;
}

/**
 * Fetch cameras health
 */
export async function fetchCamerasHealth(filters?: CameraHealthFilters) {
  const params = new URLSearchParams();
  if (filters?.status) params.append('status', filters.status);
  if (filters?.branchId) params.append('branchId', filters.branchId);
  if (filters?.recordingStatus) params.append('recordingStatus', filters.recordingStatus);
  if (filters?.limit) params.append('limit', filters.limit.toString());
  if (filters?.offset) params.append('offset', filters.offset.toString());
  
  const response = await fetch(`${API_BASE}/health/cameras?${params}`);
  if (!response.ok) throw new Error('Failed to fetch cameras health');
  const data = await response.json();
  if (!data.success) throw new Error(data.error || 'Invalid response');
  return data.data;
}

export async function fetchAllCamerasHealth(filters?: Omit<CameraHealthFilters, 'limit' | 'offset'>) {
  const first = await fetchCamerasHealth({ ...filters, limit: 500, offset: 0 });
  const cameras = [...(first.cameras || [])];
  for (let offset = 500; offset < first.total; offset += 500) {
    const page = await fetchCamerasHealth({ ...filters, limit: 500, offset });
    cameras.push(...(page.cameras || []));
  }
  return { ...first, cameras };
}

/**
 * Fetch recording health
 */
export async function fetchRecordingHealth(branchId?: string): Promise<RecordingHealth> {
  const params = branchId ? `?branchId=${branchId}` : '';
  const response = await fetch(`${API_BASE}/health/recording${params}`);
  if (!response.ok) throw new Error('Failed to fetch recording health');
  const data: ApiResponse<RecordingHealth> = await response.json();
  if (!data.success || !data.data) throw new Error(data.error || 'Invalid response');
  return data.data;
}

/**
 * Fetch storage health
 */
export async function fetchStorageHealth(branchId?: string): Promise<StorageHealth> {
  const params = branchId ? `?branchId=${branchId}` : '';
  const response = await fetch(`${API_BASE}/health/storage${params}`);
  if (!response.ok) throw new Error('Failed to fetch storage health');
  const data: ApiResponse<StorageHealth> = await response.json();
  if (!data.success || !data.data) throw new Error(data.error || 'Invalid response');
  return data.data;
}

/**
 * Fetch disks health
 */
export async function fetchDisksHealth(filters?: DiskHealthFilters): Promise<DiskHealth[]> {
  const params = new URLSearchParams();
  if (filters?.branchId) params.append('branchId', filters.branchId);
  if (filters?.status) params.append('status', filters.status);
  
  const response = await fetch(`${API_BASE}/health/disks?${params}`);
  if (!response.ok) throw new Error('Failed to fetch disks health');
  const data: ApiResponse<DiskHealth[]> = await response.json();
  if (!data.success || !data.data) throw new Error(data.error || 'Invalid response');
  return data.data;
}

/**
 * Fetch network health
 */
export async function fetchNetworkHealth(branchId?: string): Promise<InternetFleetHealth> {
  const params = branchId ? `?branchId=${branchId}` : '';
  const response = await fetch(`${API_BASE}/health/network${params}`);
  if (!response.ok) throw new Error('Failed to fetch network health');
  const data: ApiResponse<InternetFleetHealth> = await response.json();
  if (!data.success || !data.data) throw new Error(data.error || 'Invalid response');
  return data.data;
}

export async function fetchRecordersHealth(branchId?: string): Promise<RecorderFleetHealth> {
  const params = branchId ? `?branchId=${encodeURIComponent(branchId)}` : '';
  const response = await fetch(`${API_BASE}/health/recorders${params}`);
  if (!response.ok) throw new Error('Failed to fetch DVR/NVR health');
  const data: ApiResponse<RecorderFleetHealth> = await response.json();
  if (!data.success || !data.data) throw new Error(data.error || 'Invalid response');
  return data.data;
}

/**
 * Fetch UPS health
 */
export async function fetchUPSHealth(filters?: UPSHealthFilters): Promise<UPSHealth[]> {
  const params = new URLSearchParams();
  if (filters?.branchId) params.append('branchId', filters.branchId);
  if (filters?.status) params.append('status', filters.status);
  
  const response = await fetch(`${API_BASE}/health/ups?${params}`);
  if (!response.ok) throw new Error('Failed to fetch UPS health');
  const data: ApiResponse<UPSHealth[]> = await response.json();
  if (!data.success || !data.data) throw new Error(data.error || 'Invalid response');
  return data.data;
}

/**
 * Fetch edge agents health
 */
export async function fetchEdgeAgentsHealth(filters?: EdgeAgentFilters): Promise<EdgeAgentHealth[]> {
  const params = new URLSearchParams();
  if (filters?.branchId) params.append('branchId', filters.branchId);
  if (filters?.status) params.append('status', filters.status);
  
  const response = await fetch(`${API_BASE}/health/edge-agents?${params}`);
  if (!response.ok) throw new Error('Failed to fetch edge agents health');
  const data: ApiResponse<EdgeAgentHealth[]> = await response.json();
  if (!data.success || !data.data) throw new Error(data.error || 'Invalid response');
  return data.data;
}

/**
 * Fetch health trends
 */
export async function fetchHealthTrends(filters?: HealthTrendFilters): Promise<HealthTrend[]> {
  const params = new URLSearchParams();
  if (filters?.branchId) params.append('branchId', filters.branchId);
  if (filters?.component) params.append('component', filters.component);
  if (filters?.startDate) params.append('startDate', filters.startDate);
  if (filters?.endDate) params.append('endDate', filters.endDate);
  if (filters?.interval) params.append('interval', filters.interval);
  
  const response = await fetch(`${API_BASE}/health/trends?${params}`);
  if (!response.ok) throw new Error('Failed to fetch health trends');
  const data: ApiResponse<HealthTrend[]> = await response.json();
  if (!data.success || !data.data) throw new Error(data.error || 'Invalid response');
  return data.data;
}

/**
 * Fetch operational alerts
 */
export async function fetchOperationalAlerts(filters?: AlertFilters) {
  const params = new URLSearchParams();
  if (filters?.severity) params.append('severity', filters.severity);
  if (filters?.status) params.append('status', filters.status);
  if (filters?.branchId) params.append('branchId', filters.branchId);
  if (filters?.component) params.append('component', filters.component);
  if (filters?.limit) params.append('limit', filters.limit.toString());
  if (filters?.offset) params.append('offset', filters.offset.toString());
  
  const response = await fetch(`${API_BASE}/alerts?${params}`);
  if (!response.ok) throw new Error('Failed to fetch operational alerts');
  const data = await response.json();
  if (!data.success) throw new Error(data.error || 'Invalid response');
  return data.data;
}

/**
 * Acknowledge an alert
 * 
 * Server derives: acknowledgedBy, acknowledgedAt from authenticated session
 */
export async function acknowledgeAlert(
  alertId: string,
  payload?: AcknowledgeAlertPayload
): Promise<void> {
  const response = await fetch(`${API_BASE}/alerts/${alertId}/acknowledge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include', // Send authentication cookies/headers
    body: JSON.stringify(payload || {}),
  });
  if (!response.ok) throw new Error('Failed to acknowledge alert');
}

/**
 * Assign an alert
 * 
 * Client sends: assignedTo (target user)
 * Server derives: assignedBy, assignedAt from authenticated session
 */
export async function assignAlert(
  alertId: string,
  payload: AssignAlertPayload
): Promise<void> {
  const response = await fetch(`${API_BASE}/alerts/${alertId}/assign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error('Failed to assign alert');
}

/**
 * Resolve an alert
 * 
 * Client sends: resolutionCode, comment
 * Server derives: resolvedBy, resolvedAt from authenticated session
 */
export async function resolveAlert(
  alertId: string,
  payload: ResolveAlertPayload
): Promise<void> {
  const response = await fetch(`${API_BASE}/alerts/${alertId}/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error('Failed to resolve alert');
}

/**
 * Escalate an alert
 */
export async function escalateAlert(
  alertId: string,
  payload: EscalateAlertPayload
): Promise<void> {
  const response = await fetch(`${API_BASE}/alerts/${alertId}/escalate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error('Failed to escalate alert');
}

/**
 * Suppress an alert
 */
export async function suppressAlert(
  alertId: string,
  payload: SuppressAlertPayload
): Promise<void> {
  const response = await fetch(`${API_BASE}/alerts/${alertId}/suppress`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error('Failed to suppress alert');
}

/**
 * Add comment to alert
 */
export async function addAlertComment(
  alertId: string,
  payload: AddAlertCommentPayload
): Promise<void> {
  const response = await fetch(`${API_BASE}/alerts/${alertId}/comment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error('Failed to add alert comment');
}

/**
 * Get alert timeline/history
 */
export async function getAlertTimeline(alertId: string): Promise<any[]> {
  const response = await fetch(`${API_BASE}/alerts/${alertId}/timeline`, {
    credentials: 'include',
  });
  if (!response.ok) throw new Error('Failed to fetch alert timeline');
  const data = await response.json();
  return data.data;
}

/**
 * Create work order from alert
 */
export async function createWorkOrderFromAlert(
  alertId: string, 
  payload: CreateWorkOrderPayload
): Promise<{ workOrderId: string }> {
  const response = await fetch(`${API_BASE}/alerts/${alertId}/work-order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error('Failed to create work order');
  const data = await response.json();
  if (!data.success) throw new Error(data.error || 'Invalid response');
  return data.data;
}


/**
 * Reconnect an offline Edge Agent
 */
export async function reconnectEdgeAgent(
  edgeAgentId: string,
  reconnectCameras: boolean = true
): Promise<{
  edgeAgentId: string;
  commandId: string;
  status: string;
  branchId: string;
  branchName: string;
  reconnectCameras: boolean;
  camerasAffected: number;
  message: string;
}> {
  const response = await fetch(`${API_BASE}/health/edge-agents/${edgeAgentId}/reconnect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ reconnectCameras }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || 'Failed to reconnect Edge Agent');
  }
  const data = await response.json();
  return data.data;
}

/**
 * Bring cameras online (bulk operation)
 */
export async function bringCamerasOnline(params: {
  cameraIds?: string[];
  branchId?: string;
  edgeAgentId?: string;
}): Promise<{
  camerasAffected: number;
  cameraIds?: string[];
  commandIds?: string[];
  status: string;
  message: string;
}> {
  const response = await fetch(`${API_BASE}/health/cameras/bulk-online`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(params),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || 'Failed to bring cameras online');
  }
  const data = await response.json();
  return data.data;
}

/**
 * Reconnect a single offline camera
 */
export async function reconnectCamera(
  cameraId: string
): Promise<{
  cameraId: string;
  cameraName: string;
  commandId: string;
  status: string;
  branchId: string;
  branchName: string;
  message: string;
}> {
  const response = await fetch(`${API_BASE}/health/cameras/${cameraId}/reconnect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({}),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || 'Failed to reconnect camera');
  }
  const data = await response.json();
  return data.data;
}
