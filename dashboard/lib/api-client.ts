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
  listBranches: (action: 'live:view' | 'device:configure' = 'live:view') =>
    fetchApi<{ data: any[] }>(`/v1/branches?action=${encodeURIComponent(action)}`),
  listByBranch: (branchId: string) =>
    fetchApi<{ data: any[] }>(
      `/v1/branches/${encodeURIComponent(branchId)}/cameras`
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

export { ApiError };
