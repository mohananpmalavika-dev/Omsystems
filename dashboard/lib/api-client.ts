// API client for backend communication

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '/api/control';

class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public details?: any
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function fetchApi<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = typeof window !== 'undefined' 
    ? localStorage.getItem('accessToken') 
    : null;

  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (token) {
    // The public dashboard can itself be protected by HTTP Basic auth, so the
    // employee session travels to the BFF in a separate header.
    headers.set('x-sentinel-session', token);
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({
      error: 'unknown_error',
      message: 'An unexpected error occurred',
    }));

    throw new ApiError(
      error.message || (typeof error.error === 'string'
        ? error.error.replaceAll('_', ' ')
        : 'Request failed'),
      response.status,
      error
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

export const authApi = {
  login: async (username: string, password: string, tenantSlug?: string) => {
    const response = await fetchApi<{
      expiresIn: number;
      user: any;
    }>('/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password, tenantSlug }),
    });

    // Tokens are held by the BFF in HttpOnly cookies. Retain only display data.
    if (typeof window !== 'undefined') {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.setItem('user', JSON.stringify(response.user));
    }

    return response;
  },

  logout: async () => {
    await fetchApi('/v1/auth/logout', { method: 'POST' });
    if (typeof window !== 'undefined') {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
    }
  },

  getCurrentUser: () => fetchApi<any>('/v1/auth/me'),

  changePassword: (userId: string, currentPassword: string, newPassword: string) =>
    fetchApi<{ success: boolean }>(`/v1/users/${userId}/change-password`, {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),

  refreshToken: async () => {
    const response = await fetchApi<{
      expiresIn: number;
    }>('/v1/auth/refresh', {
      method: 'POST',
      body: '{}',
    });

    return response;
  },
};

export const organizationApi = {
  getTree: () => fetchApi<{ data: any[] }>('/v1/organization/tree'),
  
  getStatistics: () => fetchApi<any>('/v1/organization/statistics'),
  
  listNodes: (filters?: {
    type?: string;
    parentId?: string;
    includeInactive?: boolean;
  }) => {
    const params = new URLSearchParams();
    if (filters?.type) params.append('type', filters.type);
    if (filters?.parentId) params.append('parentId', filters.parentId);
    if (filters?.includeInactive) params.append('includeInactive', 'true');
    return fetchApi<{ data: any[] }>(`/v1/organization/nodes?${params}`);
  },
  
  getNode: (id: string) => fetchApi<any>(`/v1/organization/nodes/${id}`),
  
  getNodePath: (id: string) => 
    fetchApi<{ data: any[] }>(`/v1/organization/nodes/${id}/path`),
  
  getDescendants: (id: string, includeInactive = false) => 
    fetchApi<{ data: any[] }>(
      `/v1/organization/nodes/${id}/descendants?includeInactive=${includeInactive}`
    ),
  
  createNode: (data: any) => 
    fetchApi<any>('/v1/organization/nodes', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  
  updateNode: (id: string, data: any) => 
    fetchApi<any>(`/v1/organization/nodes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  
  deleteNode: (id: string) => 
    fetchApi<void>(`/v1/organization/nodes/${id}`, { method: 'DELETE' }),
  
  validateHierarchy: (parentNodeId: string, childNodeType: string) => 
    fetchApi<{ valid: boolean }>('/v1/organization/validate-hierarchy', {
      method: 'POST',
      body: JSON.stringify({ parentNodeId, childNodeType }),
    }),
};

export const userApi = {
  list: (filters?: any) => {
    const params = new URLSearchParams();
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined) params.append(key, String(value));
      });
    }
    return fetchApi<{ data: any[]; total: number }>(`/v1/users?${params}`);
  },
  
  get: (id: string) => fetchApi<any>(`/v1/users/${id}`),
  
  create: (data: any) => 
    fetchApi<any>('/v1/users', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  
  update: (id: string, data: any) => 
    fetchApi<any>(`/v1/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  
  delete: (id: string) => 
    fetchApi<void>(`/v1/users/${id}`, { method: 'DELETE' }),
  
  assignOrganization: (userId: string, scopeNodeId: string, isPrimary = false) => 
    fetchApi<any>(`/v1/users/${userId}/organizations`, {
      method: 'POST',
      body: JSON.stringify({ scopeNodeId, isPrimary }),
    }),
  
  removeOrganization: (userId: string, nodeId: string) => 
    fetchApi<void>(`/v1/users/${userId}/organizations/${nodeId}`, {
      method: 'DELETE',
    }),
  
  changePassword: (userId: string, currentPassword: string, newPassword: string) => 
    fetchApi<{ success: boolean }>(`/v1/users/${userId}/change-password`, {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
  
  resetPassword: (userId: string, newPassword: string) => 
    fetchApi<{ success: boolean }>(`/v1/users/${userId}/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ newPassword }),
    }),
  
  unlock: (userId: string) => 
    fetchApi<{ success: boolean }>(`/v1/users/${userId}/unlock`, {
      method: 'POST',
    }),
  
  getCameraAccess: (userId: string) => 
    fetchApi<any>(`/v1/users/${userId}/camera-access`),
  
  getAuditLog: (userId: string, limit = 50, offset = 0) => 
    fetchApi<any>(`/v1/users/${userId}/audit-log?limit=${limit}&offset=${offset}`),

};

export const cameraInventoryApi = {
  listBranches: (action: 'live:view' | 'device:configure' | 'analytics:view' = 'live:view') =>
    fetchApi<{ data: any[] }>(`/v1/branches?action=${encodeURIComponent(action)}`),
  listByBranch: (branchId: string, action: 'live:view' | 'analytics:view' = 'live:view') =>
    fetchApi<{ data: any[] }>(
      `/v1/branches/${encodeURIComponent(branchId)}/cameras?action=${encodeURIComponent(action)}`
    ),
  listDiscovered: (branchId: string) =>
    fetchApi<{ data: any[] }>(
      `/v1/branches/${encodeURIComponent(branchId)}/cameras/discovered`
    ),
  listGateways: (branchId: string) =>
    fetchApi<{ data: any[] }>(
      `/v1/branches/${encodeURIComponent(branchId)}/edge-agents`
    ),
  registerGateway: (branchId: string, data: { name: string; version: string }) =>
    fetchApi<any>(
      `/v1/branches/${encodeURIComponent(branchId)}/edge-agents/register`,
      { method: 'POST', body: JSON.stringify(data) }
    ),
  startScan: (branchId: string, edgeAgentId?: string) =>
    fetchApi<any>(
      `/v1/branches/${encodeURIComponent(branchId)}/scan-jobs`,
      { method: 'POST', body: JSON.stringify(edgeAgentId ? { edgeAgentId } : {}) }
    ),
  getScan: (branchId: string, jobId: string) =>
    fetchApi<any>(
      `/v1/branches/${encodeURIComponent(branchId)}/scan-jobs/${encodeURIComponent(jobId)}`
    ),
  submitDiscovery: (branchId: string, data: any) =>
    fetchApi<any>(
      `/v1/branches/${encodeURIComponent(branchId)}/cameras/discovered`,
      { method: 'POST', body: JSON.stringify(data) }
    ),
  approveCamera: (branchId: string, data: any) =>
    fetchApi<any>(
      `/v1/branches/${encodeURIComponent(branchId)}/cameras`,
      { method: 'POST', body: JSON.stringify(data) }
    ),
};

export const cameraApi = {
  get: (cameraId: string) => fetchApi<any>(`/v1/cameras/${encodeURIComponent(cameraId)}`),
};

export const branchApi = {
  get: (branchId: string) => fetchApi<any>(`/v1/branches/${encodeURIComponent(branchId)}`),
};

export const liveOperationsApi = {
  listBookmarks: (cameraId: string, limit = 50) =>
    fetchApi<{ data: any[] }>(
      `/v1/cameras/${encodeURIComponent(cameraId)}/bookmarks?limit=${limit}`
    ),
  createBookmark: (cameraId: string, data: any) =>
    fetchApi<any>(`/v1/cameras/${encodeURIComponent(cameraId)}/bookmarks`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  listIncidents: (cameraId: string, limit = 50) =>
    fetchApi<{ data: any[] }>(
      `/v1/cameras/${encodeURIComponent(cameraId)}/incidents?limit=${limit}`
    ),
  createIncident: (cameraId: string, data: any) =>
    fetchApi<any>(`/v1/cameras/${encodeURIComponent(cameraId)}/incidents`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateIncidentStatus: (cameraId: string, incidentId: string, status: string) =>
    fetchApi<any>(
      `/v1/cameras/${encodeURIComponent(cameraId)}/incidents/${encodeURIComponent(incidentId)}`,
      { method: 'PATCH', body: JSON.stringify({ status }) }
    ),
};

export const complianceApi = {
  listFrameworks: () => fetchApi<{ data: any[] }>('/v1/compliance/frameworks'),
  createFramework: (data: {
    name: string;
    source?: string;
    description?: string;
  }) => fetchApi<any>('/v1/compliance/frameworks', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  getFramework: (id: string) => fetchApi<any>(`/v1/compliance/frameworks/${encodeURIComponent(id)}`),
  listPolicies: (frameworkId?: string) => {
    const params = new URLSearchParams();
    if (frameworkId) params.set('frameworkId', frameworkId);
    return fetchApi<{ data: any[] }>(`/v1/compliance/policies?${params}`);
  },
  createPolicy: (data: any) => fetchApi<any>('/v1/compliance/policies', {
    method: 'POST', body: JSON.stringify(data),
  }),
  listAssessments: (filters?: { frameworkId?: string; branchNodeId?: string; status?: string }) => {
    const params = new URLSearchParams();
    filters = filters ?? {};
    if (filters.frameworkId) params.set('frameworkId', filters.frameworkId);
    if (filters.branchNodeId) params.set('branchNodeId', filters.branchNodeId);
    if (filters.status) params.set('status', filters.status);
    return fetchApi<{ data: any[] }>(`/v1/compliance/assessments?${params}`);
  },
  createAssessment: (data: any) => fetchApi<any>('/v1/compliance/assessments', {
    method: 'POST', body: JSON.stringify(data),
  }),
  listCertificates: (assessmentId: string) =>
    fetchApi<{ data: any[] }>(`/v1/compliance/assessments/${encodeURIComponent(assessmentId)}/certificates`),
  createCertificate: (assessmentId: string, data: any) =>
    fetchApi<any>(`/v1/compliance/assessments/${encodeURIComponent(assessmentId)}/certificates`, {
      method: 'POST', body: JSON.stringify(data),
    }),
  getCertificate: (id: string) => fetchApi<any>(`/v1/compliance/certificates/${encodeURIComponent(id)}`),
  getAssessment: (id: string) => fetchApi<any>(`/v1/compliance/assessments/${encodeURIComponent(id)}`),
  getPolicy: (id: string) => fetchApi<any>(`/v1/compliance/policies/${encodeURIComponent(id)}`),
};

export const maintenanceApi = {
  listAssets: () => fetchApi<{ data: any[] }>('/v1/maintenance/assets'),
  getAsset: (id: string) => fetchApi<any>(`/v1/maintenance/assets/${encodeURIComponent(id)}`),
  createAsset: (data: any) => fetchApi<any>('/v1/maintenance/assets', {
    method: 'POST', body: JSON.stringify(data),
  }),
  updateAsset: (id: string, data: any) => fetchApi<any>(`/v1/maintenance/assets/${encodeURIComponent(id)}`, {
    method: 'PATCH', body: JSON.stringify(data),
  }),
  listWorkOrders: () => fetchApi<{ data: any[] }>('/v1/maintenance/workorders'),
  getWorkOrder: (id: string) => fetchApi<any>(`/v1/maintenance/workorders/${encodeURIComponent(id)}`),
  createWorkOrder: (data: any) => fetchApi<any>('/v1/maintenance/workorders', {
    method: 'POST', body: JSON.stringify(data),
  }),
  updateWorkOrder: (id: string, data: any) => fetchApi<any>(`/v1/maintenance/workorders/${encodeURIComponent(id)}`, {
    method: 'PATCH', body: JSON.stringify(data),
  }),
  listVendors: () => fetchApi<{ data: any[] }>('/v1/maintenance/vendors'),
  getVendor: (id: string) => fetchApi<any>(`/v1/maintenance/vendors/${encodeURIComponent(id)}`),
  createVendor: (data: any) => fetchApi<any>('/v1/maintenance/vendors', {
    method: 'POST', body: JSON.stringify(data),
  }),
  updateVendor: (id: string, data: any) => fetchApi<any>(`/v1/maintenance/vendors/${encodeURIComponent(id)}`, {
    method: 'PATCH', body: JSON.stringify(data),
  }),
  listAmcContracts: () => fetchApi<{ data: any[] }>('/v1/maintenance/amc'),
  getAmcContract: (id: string) => fetchApi<any>(`/v1/maintenance/amc/${encodeURIComponent(id)}`),
  createAmcContract: (data: any) => fetchApi<any>('/v1/maintenance/amc', {
    method: 'POST', body: JSON.stringify(data),
  }),
  updateAmcContract: (id: string, data: any) => fetchApi<any>(`/v1/maintenance/amc/${encodeURIComponent(id)}`, {
    method: 'PATCH', body: JSON.stringify(data),
  }),
  getDashboardHealth: () => fetchApi<any>('/v1/maintenance/dashboard/health'),
  getDashboardStatus: () => fetchApi<any>('/v1/maintenance/dashboard/status'),
  listFirmwareUpdatesRequired: () => fetchApi<{ data: any[] }>('/v1/maintenance/firmware/updates-required'),
  listLowStockParts: () => fetchApi<{ data: any[] }>('/v1/maintenance/spare-parts/low-stock'),
  listHighRiskAssets: () => fetchApi<{ data: any[] }>('/v1/maintenance/predictive/high-risk'),
  listFailureForecast: () => fetchApi<{ data: any[] }>('/v1/maintenance/predictive/failure-forecast'),
  getMaintenanceMetrics: () => fetchApi<any>('/v1/maintenance/reports/metrics'),
  listReports: () => fetchApi<{ data: any[] }>('/v1/maintenance/reports'),
  generateReport: (data: any) => fetchApi<any>('/v1/maintenance/reports/generate', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
};

export const reportsApi = {
  getOperationsSummary: () => fetchApi<any>('/v1/reports/summary/operations'),
  getPrivacySummary: () => fetchApi<any>('/v1/reports/summary/privacy'),
  getIncidentSummary: () => fetchApi<any>('/v1/reports/summary/incidents'),
};

export const privacyApi = {
  getSummary: () => fetchApi<any>('/v1/privacy/summary'),
  listPurposes: () => fetchApi<{ data: any[] }>('/v1/privacy/purposes'),
  createPurpose: (data: any) => fetchApi<any>('/v1/privacy/purposes', {
    method: 'POST', body: JSON.stringify(data),
  }),
  updatePurpose: (id: string, data: any) => fetchApi<any>(`/v1/privacy/purposes/${encodeURIComponent(id)}`, {
    method: 'PATCH', body: JSON.stringify(data),
  }),
  listCameraPurposes: (cameraId: string) => fetchApi<{ data: any[] }>(`/v1/privacy/cameras/${encodeURIComponent(cameraId)}/purposes`),
  assignCameraPurpose: (cameraId: string, data: any) => fetchApi<any>(`/v1/privacy/cameras/${encodeURIComponent(cameraId)}/purposes`, {
    method: 'POST', body: JSON.stringify(data),
  }),
  getCameraControls: (cameraId: string) => fetchApi<any>(`/v1/privacy/cameras/${encodeURIComponent(cameraId)}/control`),
  updateCameraControls: (cameraId: string, data: any) => fetchApi<any>(`/v1/privacy/cameras/${encodeURIComponent(cameraId)}/control`, {
    method: 'PUT', body: JSON.stringify(data),
  }),
  listBreaches: (status?: string) => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    return fetchApi<{ data: any[] }>(`/v1/privacy/breaches?${params}`);
  },
  reportBreach: (data: any) => fetchApi<any>('/v1/privacy/breaches', {
    method: 'POST', body: JSON.stringify(data),
  }),
  updateBreachStatus: (id: string, status: string) => fetchApi<any>(`/v1/privacy/breaches/${encodeURIComponent(id)}/status`, {
    method: 'PATCH', body: JSON.stringify({ status }),
  }),
};

export const analyticsApi = {
  listRules: (cameraId: string) =>
    fetchApi<{ data: any[] }>(
      `/v1/cameras/${encodeURIComponent(cameraId)}/analytics/rules`
    ),
  createRule: (cameraId: string, data: any) =>
    fetchApi<any>(`/v1/cameras/${encodeURIComponent(cameraId)}/analytics/rules`, {
      method: 'POST', body: JSON.stringify(data),
    }),
  updateRule: (cameraId: string, ruleId: string, data: any) =>
    fetchApi<any>(
      `/v1/cameras/${encodeURIComponent(cameraId)}/analytics/rules/${encodeURIComponent(ruleId)}`,
      { method: 'PATCH', body: JSON.stringify(data) }
    ),
  deleteRule: (cameraId: string, ruleId: string) =>
    fetchApi<void>(
      `/v1/cameras/${encodeURIComponent(cameraId)}/analytics/rules/${encodeURIComponent(ruleId)}`,
      { method: 'DELETE' }
    ),
  listAlerts: (filters?: Record<string, string | number | undefined>) => {
    const params = new URLSearchParams();
    Object.entries(filters ?? {}).forEach(([key, value]) => {
      if (value !== undefined && value !== '') params.set(key, String(value));
    });
    return fetchApi<{ data: any[]; summary: any }>(`/v1/analytics/alerts?${params}`);
  },
  acknowledge: (alertId: string, notes?: string) =>
    fetchApi<any>(`/v1/analytics/alerts/${encodeURIComponent(alertId)}/acknowledge`, {
      method: 'POST', body: JSON.stringify({ notes }),
    }),
  escalate: (alertId: string, data: { notes?: string; recipients?: string[] }) =>
    fetchApi<any>(`/v1/analytics/alerts/${encodeURIComponent(alertId)}/escalate`, {
      method: 'POST', body: JSON.stringify(data),
    }),
  updateAlert: (alertId: string, data: any) =>
    fetchApi<any>(`/v1/analytics/alerts/${encodeURIComponent(alertId)}`, {
      method: 'PATCH', body: JSON.stringify(data),
    }),
  createIncident: (alertId: string, data: any = {}) =>
    fetchApi<any>(`/v1/analytics/alerts/${encodeURIComponent(alertId)}/incidents`, {
      method: 'POST', body: JSON.stringify(data),
    }),
};

export const cameraPermissionApi = {
  listUserGrants: (userId: string) => 
    fetchApi<{ data: any[] }>(`/v1/users/${userId}/camera-grants`),
  
  listCameraGrants: (cameraId: string) => 
    fetchApi<{ data: any[] }>(`/v1/cameras/${cameraId}/grants`),
  
  createGrant: (data: any) => 
    fetchApi<any>('/v1/camera-grants', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  
  deleteGrant: (id: string) => 
    fetchApi<void>(`/v1/camera-grants/${id}`, { method: 'DELETE' }),
  
  listAccessRequests: (filters?: any) => {
    const params = new URLSearchParams();
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined) params.append(key, String(value));
      });
    }
    return fetchApi<{ data: any[] }>(`/v1/camera-access-requests?${params}`);
  },
  
  createAccessRequest: (data: any) => 
    fetchApi<any>('/v1/camera-access-requests', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  
  reviewAccessRequest: (id: string, status: 'approved' | 'rejected', reviewNotes?: string) => 
    fetchApi<any>(`/v1/camera-access-requests/${id}/review`, {
      method: 'POST',
      body: JSON.stringify({ status, reviewNotes }),
    }),
  
  checkCameraAccess: (cameraId: string, action = 'live:view') => 
    fetchApi<{ allowed: boolean; reason: string; requiresApproval: boolean }>(
      `/v1/cameras/${cameraId}/check-access?action=${action}`
    ),
};

export const videoSearchApi = {
  searchRecordings: (query: { cameraId?: string; from: string; to: string; eventType?: string; minConfidence?: number; limit?: number; offset?: number }) => {
    const params = new URLSearchParams();
    if (query.cameraId) params.set("cameraId", query.cameraId);
    params.set("from", query.from);
    params.set("to", query.to);
    if (query.eventType) params.set("eventType", query.eventType);
    if (query.minConfidence !== undefined) params.set("minConfidence", String(query.minConfidence));
    if (query.limit !== undefined) params.set("limit", String(query.limit));
    if (query.offset !== undefined) params.set("offset", String(query.offset));
    return fetchApi<any>(`/v1/recordings/search?${params.toString()}`);
  },

  getTimeline: (cameraId: string, options: { from: string; to: string }) =>
    fetchApi<any>(`/v1/recordings/timeline?cameraId=${encodeURIComponent(cameraId)}&from=${encodeURIComponent(options.from)}&to=${encodeURIComponent(options.to)}`),

  getThumbnails: (query: { cameraId: string; from: string; to: string; limit?: number }) =>
    fetchApi<any>(`/v1/recordings/thumbnails?${new URLSearchParams(Object.entries(query).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)]))}`),

  getSegment: (segmentId: string) =>
    fetchApi<any>(`/v1/recordings/${segmentId}`),

  createSnapshot: (segmentId: string, data: { timestamp: string; reason: string; notes?: string }) =>
    fetchApi<any>(`/v1/recordings/${segmentId}/snapshots`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  createBookmark: (data: { cameraId: string; timestamp: string; reason: string; priority: string; incidentId?: string }) =>
    fetchApi<any>('/v1/recordings/bookmarks', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getBookmarks: (cameraId: string, options?: { from?: string; to?: string; limit?: number }) =>
    fetchApi<any>(`/v1/cameras/${cameraId}/recordings/bookmarks?${options ? new URLSearchParams(Object.entries(options).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)])) : ''}`),

  verifySegment: (segmentId: string) =>
    fetchApi<any>(`/v1/recordings/${segmentId}/verify`, { method: 'POST' }),
};

export const playbackApi = {
  getSynchronizedPlayback: (query: {
    cameraIds: string[];
    masterCameraId?: string;
    fromTime: string;
    toTime: string;
    groupId?: string;
    layout?: 'grid' | 'stacked' | 'custom';
  }) =>
    fetchApi<any>(`/v1/recordings/playback/synchronized`, {
      method: 'POST',
      body: JSON.stringify(query),
    }),
  listGroups: () =>
    fetchApi<{ data: any[] }>(`/v1/recordings/playback/groups`),
};

export const evidenceApi = {
  createCase: (data: { caseNumber: string; title: string; description?: string }) =>
    fetchApi<any>('/v1/evidence/cases', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getCase: (caseId: string) =>
    fetchApi<any>(`/v1/evidence/cases/${caseId}`),

  listCases: (filters?: { status?: string; limit?: number }) =>
    fetchApi<any>(`/v1/evidence/cases?${filters ? new URLSearchParams(Object.entries(filters).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)])) : ''}`),

  addItem: (caseId: string, data: { type: string; description: string; cameraId?: string; startTime?: string; endTime?: string; hash?: string; fileSize?: number }) =>
    fetchApi<any>(`/v1/evidence/cases/${caseId}/items`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  listItems: (caseId: string) =>
    fetchApi<any>(`/v1/evidence/cases/${caseId}/items`),

  listExports: (caseId: string) =>
    fetchApi<{ data: any[] }>(`/v1/evidence/cases/${caseId}/exports`),

  requestExport: (caseId: string, data: { format: string; reason: string }) =>
    fetchApi<any>(`/v1/evidence/cases/${caseId}/exports`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getExport: (exportId: string) =>
    fetchApi<any>(`/v1/evidence/exports/${exportId}`),

  getCustodyLog: (caseId: string) =>
    fetchApi<any>(`/v1/evidence/cases/${caseId}/chain-of-custody`),

  getChainOfCustody: (caseId: string) =>
    fetchApi<any>(`/v1/evidence/cases/${caseId}/chain-of-custody`),

  getExportStatus: (exportId: string) =>
    fetchApi<any>(`/v1/evidence/exports/${exportId}/status`),

  getExportManifest: (exportId: string) =>
    fetchApi<any>(`/v1/evidence/exports/${exportId}/manifest`),

  createLegalHold: (data: { caseNumber: string; reason: string; cameraIds: string[]; startTime: string; endTime: string; reviewDate?: string; expiryDate?: string }) =>
    fetchApi<any>('/v1/evidence/legal-holds', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  releaseLegalHold: (holdId: string, data?: { reason?: string }) =>
    fetchApi<any>(`/v1/evidence/legal-holds/${holdId}/release`, {
      method: 'POST',
      body: JSON.stringify(data || {}),
    }),

  verifyEvidence: (caseId: string) =>
    fetchApi<any>(`/v1/evidence/verify/${caseId}`, { method: 'POST' }),
};

export { ApiError };
