// API client for backend communication

import type {
  AlertNotificationPolicy,
  AlertNotificationPolicyInput,
  AnalyticsAlert,
  AnalyticsAlertSummary,
  AnalyticsRule,
  MaintenanceAsset,
  MaintenanceVendor,
  ProvisioningRun,
  WorkOrder,
} from '@/lib/types';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '/api/control';
let cookieRefreshPromise: Promise<boolean> | null = null;
let loginRedirectInProgress = false;

function startNativeDownload(endpoint: string, values: Record<string, string>) {
  if (typeof document === "undefined") {
    throw new Error("Downloads can only be started from a browser.");
  }

  const form = document.createElement("form");
  form.method = "POST";
  form.action = `${API_BASE}${endpoint}`;
  form.style.display = "none";

  for (const [name, value] of Object.entries(values)) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }

  document.body.appendChild(form);
  form.submit();
  form.remove();
}

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

/**
 * Redirect to login page and clear session
 */
function redirectToLogin() {
  if (typeof window !== 'undefined') {
    if (loginRedirectInProgress) return;
    loginRedirectInProgress = true;

    // Clear all session data
    sessionStorage.clear();
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    localStorage.removeItem('sentinel_login_time');
    
    // Redirect to login
    const currentPath = window.location.pathname;
    if (currentPath !== '/login') {
      window.location.href = '/login?reason=expired';
    }
  }
}

function isPublicAuthEndpoint(endpoint: string) {
  return endpoint.includes('/auth/login') ||
    endpoint.includes('/auth/refresh') ||
    endpoint.includes('/auth/forgot-password') ||
    endpoint.includes('/auth/verify-otp') ||
    endpoint.includes('/auth/reset-password');
}

/**
 * Refresh the BFF's HttpOnly employee session once for every concurrent 401.
 * The refresh token deliberately never reaches JavaScript; the proxy reads it
 * from the sentinel_refresh cookie and returns a replacement access cookie.
 */
export function refreshCookieBackedSession(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if (cookieRefreshPromise) return cookieRefreshPromise;

  cookieRefreshPromise = fetch(`${API_BASE}/v1/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  })
    .then((response) => response.ok)
    .catch(() => false)
    .finally(() => { cookieRefreshPromise = null; });
  return cookieRefreshPromise;
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
    if (!headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  }

  const isAuthEndpoint = isPublicAuthEndpoint(endpoint);
  const send = () => fetch(`${API_BASE}${endpoint}`, {
    ...options,
    credentials: "include",
    headers,
  });

  let response: Response;
  
  try {
    response = await send();
    if (response.status === 401 && !isAuthEndpoint && await refreshCookieBackedSession()) {
      response = await send();
    }
  } catch (error: any) {
    // A transport failure does not invalidate an existing cookie-backed
    // session. Clearing browser state here caused a login loop whenever the
    // control plane was restarting or briefly unreachable immediately after
    // sign-in. Preserve the session and let the caller/session guard retry.
    throw new ApiError(
      'Cannot connect to server. Please check your connection.',
      0,
      { originalError: error.message }
    );
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({
      error: 'unknown_error',
      message: 'An unexpected error occurred',
    }));

    // Handle authentication errors
    if (response.status === 401) {
      // Token expired or invalid
      if (!isAuthEndpoint) {
        redirectToLogin();
      }
    }

    // Handle forbidden errors (might indicate session issues)
    if (response.status === 403) {
      if (error.error === 'session_expired' || error.error === 'invalid_session') {
        redirectToLogin();
      }
    }

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

async function downloadApi(endpoint: string, options: RequestInit = {}): Promise<Blob> {
  const token = typeof window !== 'undefined'
    ? localStorage.getItem('accessToken')
    : null;

  const headers = new Headers(options.headers);
  if (token) {
    headers.set('x-sentinel-session', token);
    if (!headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  }

  const isAuthEndpoint = isPublicAuthEndpoint(endpoint);
  const send = () => fetch(`${API_BASE}${endpoint}`, {
    ...options,
    credentials: 'include',
    headers,
  });

  let response: Response;
  
  try {
    response = await send();
    if (response.status === 401 && !isAuthEndpoint && await refreshCookieBackedSession()) {
      response = await send();
    }
  } catch (error: any) {
    // Network error - API not reachable
    console.error('API connection failed:', error);
    // Downloads must follow the same authentication policy as JSON requests:
    // an unavailable server is recoverable and is not proof that the employee
    // session expired.
    throw new ApiError(
      'Cannot connect to server. Please check your connection.',
      0,
      { originalError: error.message }
    );
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    let error: any = {
      error: 'unknown_error',
      message: 'An unexpected error occurred',
      raw: text,
    };

    try {
      error = JSON.parse(text);
    } catch {
      if (text) {
        error = {
          error: 'unknown_error',
          message: text,
          raw: text,
        };
      }
    }

    // Handle authentication errors
    if (response.status === 401 || response.status === 403) {
      redirectToLogin();
    }

    throw new ApiError(
      error.message || (typeof error.error === 'string'
        ? error.error.replaceAll('_', ' ')
        : 'Request failed'),
      response.status,
      error
    );
  }

  return response.blob();
}

export const authApi = {
  login: async (username: string, password: string, tenantSlug?: string, faceScan?: string) => {
    const response = await fetchApi<{
      accessToken?: string;
      refreshToken?: string;
      expiresIn: number;
      user: any;
    }>('/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password, tenantSlug, faceScan }),
    });

    if (typeof window !== 'undefined') {
      // Browser sessions are cookie-backed and session-scoped.
      sessionStorage.clear();
      sessionStorage.setItem('sentinel_browser_session', 'active');
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.setItem('sentinel_login_time', Date.now().toString());
      loginRedirectInProgress = false;
      if (response.accessToken) {
        sessionStorage.setItem('accessToken', response.accessToken);
        localStorage.setItem('accessToken', response.accessToken);
      }
      if (response.refreshToken) {
        sessionStorage.setItem('refreshToken', response.refreshToken);
        localStorage.setItem('refreshToken', response.refreshToken);
      }
      if (response.user) {
        sessionStorage.setItem('user', JSON.stringify(response.user));
        localStorage.setItem('user', JSON.stringify(response.user));
      }
    }

    return response;
  },

  logout: async () => {
    await fetchApi('/v1/auth/logout', { method: 'POST' });
    if (typeof window !== 'undefined') {
      sessionStorage.clear();
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
      localStorage.removeItem('sentinel_login_time');
    }
  },

  logoutAll: async () => {
    await fetchApi<{ success: boolean }>('/v1/auth/logout-all', { method: 'POST' });
    if (typeof window !== 'undefined') {
      sessionStorage.clear();
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
      localStorage.removeItem('sentinel_login_time');
    }
  },

  getCurrentUser: () => fetchApi<any>('/v1/auth/me'),

  requestPasswordReset: (email: string, tenantSlug?: string) =>
    fetchApi<{ success: boolean; message: string }>('/v1/auth/request-password-reset', {
      method: 'POST',
      body: JSON.stringify({ email, tenantSlug: tenantSlug || undefined }),
    }),

  requestPasswordResetOtp: (email: string, tenantSlug?: string) =>
    fetchApi<{
      success: boolean;
      message: string;
      maskedEmail: string;
      expiresInSeconds: number;
      previewOtp?: string;
    }>('/v1/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email, tenantSlug: tenantSlug || undefined }),
    }),

  verifyPasswordResetOtp: (email: string, otp: string) =>
    fetchApi<{
      success: boolean;
      resetToken: string;
      message: string;
    }>('/v1/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ email, otp }),
    }),

  resetPasswordWithOtp: (email: string, resetToken: string, newPassword: string) =>
    fetchApi<{
      success: boolean;
      message: string;
    }>('/v1/auth/reset-password-otp', {
      method: 'POST',
      body: JSON.stringify({ email, resetToken, newPassword }),
    }),

  resetPassword: (token: string, newPassword: string) =>
    fetchApi<{ success: boolean; message: string }>('/v1/auth/reset-password', {
      method: 'POST', body: JSON.stringify({ token, newPassword }),
    }),

  listSessions: () => fetchApi<{
    data: Array<{
      id: string;
      ipAddress?: string;
      userAgent?: string;
      lastActivityAt: string;
      createdAt: string;
      expiresAt: string;
      isCurrent?: boolean;
    }>;
    currentSessionId?: string | null;
  }>('/v1/auth/sessions'),

  revokeSession: (id: string) =>
    fetchApi<{ success?: boolean; revokedSessionId?: string; isCurrentSession?: boolean }>(
      `/v1/auth/sessions/${encodeURIComponent(id)}`,
      { method: 'DELETE' },
    ),

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

export type OrganizationTreeResponse = {
  data: any[];
  meta: {
    organizationExists: boolean;
    accessRestricted: boolean;
    canCreateRoot: boolean;
  };
};

export const organizationApi = {
  getTree: () => fetchApi<OrganizationTreeResponse>('/v1/organization/tree'),
  
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

export const deviceInventoryApi = {
  list: (branch?: string) => {
    const params = new URLSearchParams();
    if (branch) params.set('branch', branch);
    return fetchApi<{ data: any[] }>(`/v1/device-inventory${params.toString() ? `?${params}` : ''}`);
  },
  create: (data: any) => fetchApi<any>('/v1/device-inventory', {
    method: 'POST', body: JSON.stringify(data),
  }),
  get: (id: string) => fetchApi<any>(`/v1/device-inventory/${encodeURIComponent(id)}`),
  update: (id: string, data: any) => fetchApi<any>(`/v1/device-inventory/${encodeURIComponent(id)}`, {
    method: 'PATCH', body: JSON.stringify(data),
  }),
};

export const deviceManagementApi = {
  // Devices
  listDevices: (branchId?: string, filters?: { deviceType?: string; status?: string; limit?: number; offset?: number }) => {
    const params = new URLSearchParams();
    if (branchId) params.append('branchId', branchId);
    if (filters?.deviceType) params.append('deviceType', filters.deviceType);
    if (filters?.status) params.append('status', filters.status);
    if (filters?.limit) params.append('limit', filters.limit.toString());
    if (filters?.offset) params.append('offset', filters.offset.toString());
    return fetchApi<{ data: any[]; total: number }>(`/v1/device-management/devices?${params.toString()}`);
  },
  getDevice: (deviceId: string) => fetchApi<{ data: any }>(`/v1/device-management/devices/${encodeURIComponent(deviceId)}`),

  // Credential Rotation
  startPasswordRotation: (data: {
    deviceId: string;
    reason: string;
    rotationMode: 'scheduled' | 'emergency';
  }) => fetchApi<{ jobId: string; status: string; message: string }>('/v1/device-management/password-rotation', {
    method: 'POST', body: JSON.stringify(data),
  }),
  listPasswordRotations: () => fetchApi<{ data: any[] }>('/v1/device-management/password-rotations'),

  // IP Management
  assignIpAddress: (data: {
    deviceId: string;
    branchId: string;
    ipAddress: string;
    subnet: string;
    reservationType: 'static' | 'dhcp-reservation';
  }) => fetchApi<{ jobId: string; status: string; message: string }>('/v1/device-management/ip-assignment', {
    method: 'POST', body: JSON.stringify(data),
  }),
  getIpConflicts: (branchId?: string) => {
    const params = branchId ? `?branchId=${encodeURIComponent(branchId)}` : '';
    return fetchApi<{ data: any[] }>(`/v1/device-management/ip-conflicts${params}`);
  },
  getBranchNetwork: (branchId: string) => fetchApi<{ data: any }>(`/v1/device-management/branch-network/${encodeURIComponent(branchId)}`),

  // Templates
  listTemplates: (filters?: { status?: string; templateType?: string }) => {
    const params = new URLSearchParams();
    if (filters?.status) params.append('status', filters.status);
    if (filters?.templateType) params.append('templateType', filters.templateType);
    return fetchApi<{ data: any[] }>(`/v1/device-management/templates?${params.toString()}`);
  },
  createTemplate: (data: {
    name: string;
    templateType: string;
    category: string;
    settings: Record<string, unknown>;
  }) => fetchApi<any>('/v1/device-management/templates', {
    method: 'POST', body: JSON.stringify(data),
  }),
  publishTemplate: (templateId: string) => fetchApi<{ data: any }>(`/v1/device-management/templates/${encodeURIComponent(templateId)}/publish`, {
    method: 'POST',
  }),
  applyTemplate: (templateId: string, deviceId: string) => fetchApi<{ jobId: string; status: string; message: string }>(`/v1/device-management/templates/${encodeURIComponent(templateId)}/apply`, {
    method: 'POST', body: JSON.stringify({ deviceId }),
  }),
  listTemplateDevices: (templateId: string) => fetchApi<{ data: any[] }>(`/v1/device-management/templates/${encodeURIComponent(templateId)}/devices`),

  // Configuration Drift
  getDeviceDrift: (deviceId: string, templateId?: string) => {
    const params = templateId ? `?templateId=${encodeURIComponent(templateId)}` : '';
    return fetchApi<{ data: any }>(`/v1/device-management/devices/${encodeURIComponent(deviceId)}/drift${params}`);
  },

  // Jobs
  listJobs: (filters?: { deviceId?: string; status?: string; limit?: number }) => {
    const params = new URLSearchParams();
    if (filters?.deviceId) params.append('deviceId', filters.deviceId);
    if (filters?.status) params.append('status', filters.status);
    if (filters?.limit) params.append('limit', filters.limit.toString());
    return fetchApi<{ data: any[] }>(`/v1/device-management/jobs?${params.toString()}`);
  },
  getJob: (jobId: string) => fetchApi<{ data: any }>(`/v1/device-management/jobs/${encodeURIComponent(jobId)}`),
  getJobSteps: (jobId: string) => fetchApi<{ data: any[] }>(`/v1/device-management/jobs/${encodeURIComponent(jobId)}/steps`),
};

export const cameraInventoryApi = {
  listAll: (action: 'live:view' | 'device:configure' = 'device:configure', limit = 500) =>
    fetchApi<{ data: any[] }>(`/v1/cameras?action=${encodeURIComponent(action)}&limit=${limit}`),
  listBranches: (action: 'live:view' | 'device:configure' | 'analytics:view' = 'live:view') =>
    fetchApi<{ data: any[] }>(`/v1/branches?action=${encodeURIComponent(action)}`),
  listByBranch: (branchId: string, action: 'live:view' | 'analytics:view' | 'device:configure' = 'live:view') =>
    fetchApi<{ data: any[] }>(
      `/v1/branches/${encodeURIComponent(branchId)}/cameras?action=${encodeURIComponent(action)}`
    ),
  connectViaQr: (qrData: string, branchId?: string) =>
    fetchApi<{
      success: boolean;
      cameraId: string;
      uid: string;
      model: string;
      ipAddress: string;
      streamUrl: string;
      message: string;
    }>('/v1/cameras/qr-connect', {
      method: 'POST',
      body: JSON.stringify({ qrData, branchId }),
    }),
  probeDirect: (branchId: string, data: { ipAddress: string; rtspPort?: number; username?: string; password?: string | null }) =>
    fetchApi<{
      online: boolean;
      ipAddress: string;
      rtspPort?: number;
      server?: string;
      vendor?: string;
      model?: string;
      authenticated?: boolean;
      authRequired?: boolean;
      authType?: string;
      error?: string;
      streamUrl?: string;
      substreamUrl?: string;
      capabilities?: { ptz: boolean; audio: boolean; motion: boolean };
    }>('/v1/cameras/probe-direct', {
      method: 'POST',
      body: JSON.stringify({ ...data, branchId }),
    }),
  probeDirectRange: (branchId: string, data: { ipAddresses: string[]; rtspPort?: number; username?: string; password?: string | null }) =>
    fetchApi<{
      results: Array<{
        online: boolean;
        ipAddress: string;
        rtspPort?: number;
        server?: string;
        vendor?: string;
        model?: string;
        authenticated?: boolean;
        authRequired?: boolean;
        authType?: string;
        error?: string;
        streamUrl?: string;
        substreamUrl?: string;
        capabilities?: { ptz: boolean; audio: boolean; motion: boolean };
      }>;
      scanned: number;
      online: number;
      authenticated: number;
    }>('/v1/cameras/probe-direct/range', {
      method: 'POST',
      body: JSON.stringify({ ...data, branchId }),
    }),
  listDiscovered: (branchId: string) =>
    fetchApi<{ data: any[] }>(
      `/v1/branches/${encodeURIComponent(branchId)}/cameras/discovered`
    ),
  listGateways: (branchId: string) =>
    fetchApi<{ data: any[] }>(
      `/v1/branches/${encodeURIComponent(branchId)}/edge-agents`
    ),
  getConnectivity: (branchId: string) =>
    fetchApi<{
      profile: {
        branchId: string;
        primaryTransport: "vpn" | "cloudflare-tunnel";
        fallbackTransport?: "vpn" | "cloudflare-tunnel";
        vpnProtocol?: "ipsec" | "wireguard" | "openvpn" | "ssl-vpn";
        vpnRemoteNetworks?: string[];
        status: "configured" | "healthy" | "degraded" | "offline";
      } | null;
      managedTunnel: { provider: "cloudflare"; hostname: string; status: string } | null;
      supported: {
        tunnel: { available: boolean; managedAvailable: boolean };
      };
    }>(`/v1/branches/${encodeURIComponent(branchId)}/connectivity`),
  configureConnectivity: (branchId: string, data: {
    primaryTransport: "vpn" | "cloudflare-tunnel";
    fallbackTransport?: "vpn" | "cloudflare-tunnel";
    vpnProtocol?: "ipsec" | "wireguard" | "openvpn" | "ssl-vpn";
    vpnRemoteNetworks?: string[];
  }) => fetchApi<{
    profile: any;
    managedTunnel: { provider: "cloudflare"; hostname: string; publicUrl: string; status: string } | null;
    internetMode: "managed" | "temporary-test" | "disabled";
    scannerRefreshQueued: number;
    message: string;
  }>(
    `/v1/branches/${encodeURIComponent(branchId)}/connectivity`,
    { method: "PUT", body: JSON.stringify(data) },
  ),
  downloadPackage: (branchId: string, edgeAgentId: string, platform: "windows" | "linux" = "windows") =>
    downloadApi(
      `/v1/branches/${encodeURIComponent(branchId)}/edge-agents/${encodeURIComponent(edgeAgentId)}/package?platform=${encodeURIComponent(platform)}`
    ),
  downloadLocalScanner: (branchId: string, edgeAgentId: string) =>
    downloadApi(
      `/v1/branches/${encodeURIComponent(branchId)}/edge-agents/${encodeURIComponent(edgeAgentId)}/package?platform=windows&mode=scan-once`
    ),
  registerGateway: (branchId: string, data: { name: string; version: string }) =>
    fetchApi<any>(
      `/v1/branches/${encodeURIComponent(branchId)}/edge-agents/register`,
      { method: 'POST', body: JSON.stringify(data) }
    ),
  createGatewayActivation: (branchId: string, data: { agentName: string; ttlMinutes?: number }) =>
    fetchApi<{
      id: string; branchId: string; agentName: string; activationCode: string;
      expiresAt: string; bootstrap: {
        controlPlaneUrl: string; message: string;
        media: { managed: boolean; mode: "named" | "disabled"; publicUrl?: string; tunnelStatus: string; credentialsDeliveredTo?: "gateway-only" };
      };
    }>(
      `/v1/branches/${encodeURIComponent(branchId)}/edge-activations`,
      { method: 'POST', body: JSON.stringify(data) }
    ),
  downloadInstallerFromActivation: (branchId: string, data: { activationId: string; activationCode: string; agentName: string }) =>
    startNativeDownload(
      `/v1/branches/${encodeURIComponent(branchId)}/edge-agent-installer`,
      data,
    ),
  sendGatewayCommand: (
    branchId: string,
    edgeAgentId: string,
    data: { type: "rediscover" | "restart-media" | "restart-agent" | "probe-camera" | "recover-camera" | "probe-recorder" | "collect-logs" | "apply-update"; payload?: Record<string, unknown> },
  ) => fetchApi<any>(
    `/v1/branches/${encodeURIComponent(branchId)}/edge-agents/${encodeURIComponent(edgeAgentId)}/commands`,
    { method: 'POST', body: JSON.stringify({ ...data, payload: data.payload ?? {} }) }
  ),
  updateGatewayCameraCredentials: (
    branchId: string,
    edgeAgentId: string,
    data: { username: string; password: string | null; cameraIp: string; cameraId?: string; channel?: number; recorderId?: string },
  ) => fetchApi<{ commandId: string; status: string; scope: string; message: string }>(
    `/v1/branches/${encodeURIComponent(branchId)}/edge-agents/${encodeURIComponent(edgeAgentId)}/camera-credentials`,
    { method: "POST", body: JSON.stringify(data) },
  ),
  recoverCamera: (branchId: string, cameraId: string) => fetchApi<any>(
    `/v1/branches/${encodeURIComponent(branchId)}/cameras/${encodeURIComponent(cameraId)}/recovery`,
    { method: "POST", body: "{}" },
  ),
  listGatewayCommands: (branchId: string) =>
    fetchApi<{ data: any[] }>(`/v1/branches/${encodeURIComponent(branchId)}/edge-commands`),
  startScan: (branchId: string, edgeAgentId?: string) =>
    fetchApi<{ id: string; status: string; branchId: string }>(
      `/v1/branches/${encodeURIComponent(branchId)}/device-scans`,
      { method: 'POST', body: JSON.stringify(edgeAgentId ? { edgeAgentId } : {}) }
    ),
  getScan: (branchId: string, scanId: string) =>
    fetchApi<any>(
      `/v1/device-scans/${encodeURIComponent(scanId)}?branchId=${encodeURIComponent(branchId)}`
    ),
  getScanResults: (branchId: string, scanId: string) =>
    fetchApi<{ data: any[] }>(
      `/v1/device-scans/${encodeURIComponent(scanId)}/results?branchId=${encodeURIComponent(branchId)}`
    ),
  submitDiscovery: (branchId: string, data: any) =>
    fetchApi<any>(
      `/v1/branches/${encodeURIComponent(branchId)}/cameras/discovered`,
      { method: 'POST', body: JSON.stringify(data) }
    ),
  createCamera: (branchId: string, data: any) =>
    fetchApi<any>(
      `/v1/branches/${encodeURIComponent(branchId)}/cameras`,
      { method: 'POST', body: JSON.stringify(data) }
    ),
  approveCamera: (branchId: string, data: any) =>
    fetchApi<any>(
      `/v1/branches/${encodeURIComponent(branchId)}/cameras`,
      { method: 'POST', body: JSON.stringify(data) }
    ),
  approveDiscovery: (branchId: string, discoveryId: string, data: any) =>
    fetchApi<any>(
      `/v1/branches/${encodeURIComponent(branchId)}/cameras/discovered/${encodeURIComponent(discoveryId)}/approve`,
      { method: 'POST', body: JSON.stringify(data) }
    ),
  activateDiscovery: (branchId: string, discoveryId: string, data: { username: string; password: string | null }) =>
    fetchApi<{ commandId: string; scanId?: string; status: string; message: string }>(
      `/v1/branches/${encodeURIComponent(branchId)}/cameras/discovered/${encodeURIComponent(discoveryId)}/activate`,
      { method: 'POST', body: JSON.stringify(data) }
    ),
  approveAllDiscovered: (branchId: string, data: {
    discoveryIds?: string[];
    recordingMode?: 'continuous' | 'motion';
    retentionDays?: number;
    enableAnalytics?: boolean;
    enableAlerts?: boolean;
  } = {}) =>
    fetchApi<any>(
      `/v1/branches/${encodeURIComponent(branchId)}/cameras/discovered/approve-all`,
      { method: 'POST', body: JSON.stringify(data) }
    ),
  rejectDiscovery: (branchId: string, discoveryId: string, data: { reason?: string }) =>
    fetchApi<any>(
      `/v1/branches/${encodeURIComponent(branchId)}/cameras/discovered/${encodeURIComponent(discoveryId)}/reject`,
      { method: 'POST', body: JSON.stringify(data) }
    ),
  renameDiscovery: (branchId: string, discoveryId: string, data: { displayName: string }) =>
    fetchApi<any>(
      `/v1/branches/${encodeURIComponent(branchId)}/cameras/discovered/${encodeURIComponent(discoveryId)}/rename`,
      { method: 'PATCH', body: JSON.stringify(data) }
    ),
  bulkImport: (branchId: string, csv: string) =>
    fetchApi<any>(
      `/v1/branches/${encodeURIComponent(branchId)}/cameras/bulk-import`,
      { method: 'POST', body: JSON.stringify({ csv }) }
    ),
  deleteCamera: (cameraId: string, branchId?: string) =>
    fetchApi<void>(
      branchId
        ? `/v1/branches/${encodeURIComponent(branchId)}/cameras/${encodeURIComponent(cameraId)}`
        : `/v1/cameras/${encodeURIComponent(cameraId)}`,
      { method: 'DELETE' }
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

export const alertPolicyApi = {
  get: () => fetchApi<{ data: AlertNotificationPolicy; matrix?: Record<string, string[]> }>('/v1/alerts/notification-policy'),
  update: (data: AlertNotificationPolicyInput) => fetchApi<{ data: AlertNotificationPolicy; matrix?: Record<string, string[]> }>('/v1/alerts/notification-policy', {
    method: 'PUT',
    body: JSON.stringify(data),
  }),
};

export type WorkOrderWriteInput = {
  workOrderNumber?: string;
  assetId?: string | null;
  branchNodeId?: string | null;
  problem?: string;
  severity?: WorkOrder['severity'];
  technician?: string | null;
  vendorId?: string | null;
  slaDueAt?: string | null;
  eta?: string | null;
  parts?: string[] | null;
  cost?: number | null;
  rootCause?: string | null;
  actionTaken?: string | null;
  verification?: string | null;
  status?: WorkOrder['status'];
};

export type MaintenanceAssetWriteInput = {
  category?: MaintenanceAsset['category'];
  assetType?: string;
  serialNumber?: string | null;
  make?: string | null;
  model?: string | null;
  firmwareVersion?: string | null;
  warrantyExpiresAt?: string | null;
  purchaseDate?: string | null;
  installationDate?: string | null;
  vendorId?: string | null;
  branchNodeId?: string | null;
  location?: string | null;
  mountingHeight?: string | null;
  status?: MaintenanceAsset['status'];
  notes?: string | null;
};

export const maintenanceApi = {
  listAssets: () => fetchApi<{ data: MaintenanceAsset[] }>('/v1/maintenance/assets'),
  getAsset: (id: string) => fetchApi<MaintenanceAsset>(`/v1/maintenance/assets/${encodeURIComponent(id)}`),
  createAsset: (data: MaintenanceAssetWriteInput & Pick<MaintenanceAsset, 'category' | 'assetType'>) => fetchApi<MaintenanceAsset>('/v1/maintenance/assets', {
    method: 'POST', body: JSON.stringify(data),
  }),
  updateAsset: (id: string, data: MaintenanceAssetWriteInput) => fetchApi<MaintenanceAsset>(`/v1/maintenance/assets/${encodeURIComponent(id)}`, {
    method: 'PATCH', body: JSON.stringify(data),
  }),
  listWorkOrders: () => fetchApi<{ data: WorkOrder[] }>('/v1/maintenance/workorders'),
  getWorkOrder: (id: string) => fetchApi<WorkOrder>(`/v1/maintenance/workorders/${encodeURIComponent(id)}`),
  createWorkOrder: (data: WorkOrderWriteInput & Pick<WorkOrder, 'problem'>) => fetchApi<WorkOrder>('/v1/maintenance/workorders', {
    method: 'POST', body: JSON.stringify(data),
  }),
  updateWorkOrder: (id: string, data: WorkOrderWriteInput) => fetchApi<WorkOrder>(`/v1/maintenance/workorders/${encodeURIComponent(id)}`, {
    method: 'PATCH', body: JSON.stringify(data),
  }),
  listVendors: () => fetchApi<{ data: MaintenanceVendor[] }>('/v1/maintenance/vendors'),
  getVendor: (id: string) => fetchApi<MaintenanceVendor>(`/v1/maintenance/vendors/${encodeURIComponent(id)}`),
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
  listFirmwareCatalog: () => fetchApi<{ data: any[] }>('/v1/maintenance/firmware/versions'),
  createFirmwareUpgradePlan: (data: any) => fetchApi<any>('/v1/maintenance/firmware/upgrade-plans', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  approveFirmwareUpgradePlan: (planId: string, approvedBy?: string) => fetchApi<any>(`/v1/maintenance/firmware/upgrade-plans/${encodeURIComponent(planId)}/approve`, {
    method: 'POST',
    body: JSON.stringify({ approvedBy }),
  }),
  executeFirmwareUpgradePlan: (planId: string) => fetchApi<any>(`/v1/maintenance/firmware/upgrade-plans/${encodeURIComponent(planId)}/execute`, {
    method: 'POST',
  }),
  getAssetFirmwareInventory: (assetId: string) => fetchApi<any>(`/v1/maintenance/firmware/assets/${encodeURIComponent(assetId)}`),
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
  getCameraHealthReport: (filters?: any) => {
    const params = new URLSearchParams();
    if (filters?.branchIds) params.append('branchIds', filters.branchIds.join(','));
    if (filters?.from) params.append('from', filters.from);
    if (filters?.to) params.append('to', filters.to);
    return fetchApi<any>(`/v1/reports/camera-health?${params}`);
  },
  getRecordingStatusReport: (filters?: any) => {
    const params = new URLSearchParams();
    if (filters?.branchIds) params.append('branchIds', filters.branchIds.join(','));
    if (filters?.from) params.append('from', filters.from);
    if (filters?.to) params.append('to', filters.to);
    return fetchApi<any>(`/v1/reports/recording-status?${params}`);
  },
  getStorageUtilizationReport: (filters?: any) => {
    const params = new URLSearchParams();
    if (filters?.branchIds) params.append('branchIds', filters.branchIds.join(','));
    return fetchApi<any>(`/v1/reports/storage-utilization?${params}`);
  },
  getIncidentRegisterReport: (filters?: any) => {
    const params = new URLSearchParams();
    if (filters?.branchIds) params.append('branchIds', filters.branchIds.join(','));
    if (filters?.from) params.append('from', filters.from);
    if (filters?.to) params.append('to', filters.to);
    if (filters?.severity) params.append('severity', filters.severity);
    if (filters?.status) params.append('status', filters.status);
    return fetchApi<any>(`/v1/reports/incidents?${params}`);
  },
  getFootageAccessReport: (filters?: any) => {
    const params = new URLSearchParams();
    if (filters?.branchIds) params.append('branchIds', filters.branchIds.join(','));
    if (filters?.from) params.append('from', filters.from);
    if (filters?.to) params.append('to', filters.to);
    return fetchApi<any>(`/v1/reports/footage-access?${params}`);
  },
  getMaintenanceReport: (filters?: any) => {
    const params = new URLSearchParams();
    if (filters?.branchIds) params.append('branchIds', filters.branchIds.join(','));
    if (filters?.from) params.append('from', filters.from);
    if (filters?.to) params.append('to', filters.to);
    return fetchApi<any>(`/v1/reports/maintenance?${params}`);
  },
  getDowntimeReport: (filters?: any) => {
    const params = new URLSearchParams();
    if (filters?.branchIds) params.append('branchIds', filters.branchIds.join(','));
    if (filters?.from) params.append('from', filters.from);
    if (filters?.to) params.append('to', filters.to);
    return fetchApi<any>(`/v1/reports/downtime?${params}`);
  },
  getAlertSummaryReport: (filters?: any) => {
    const params = new URLSearchParams();
    if (filters?.branchIds) params.append('branchIds', filters.branchIds.join(','));
    if (filters?.from) params.append('from', filters.from);
    if (filters?.to) params.append('to', filters.to);
    return fetchApi<any>(`/v1/reports/alerts?${params}`);
  },
};

export const dashboardApi = {
  getSummary: () => fetchApi<any>('/v1/dashboard/summary'),
  getCameraHealth: () => fetchApi<any>('/v1/dashboard/camera-health'),
  getRecordingStatus: () => fetchApi<any>('/v1/dashboard/recording-status'),
  getStorage: () => fetchApi<any>('/v1/dashboard/storage'),
  getAlerts: () => fetchApi<any>('/v1/dashboard/alerts'),
  getIncidents: (limit?: number) => fetchApi<any>(`/v1/dashboard/incidents${limit ? `?limit=${limit}` : ''}`),
  getSystemHealth: (branchNodeId?: string) => 
    fetchApi<any>(`/v1/dashboard/system-health${branchNodeId ? `?branchNodeId=${branchNodeId}` : ''}`),
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

export type AnalyticsDashboardSummary = {
  period: { startDate: string; endDate: string };
  totalAlerts: number;
  criticalAlerts: number;
  resolvedAlerts: number;
  totalFootfall: number | null;
  averageDwellTime: number | null;
  activeRules: number;
  totalEvents: number;
  eventsByType: Record<string, number>;
  events?: Array<{
    id: string;
    cameraId: string;
    detectionType: string;
    occurredAt: string;
    confidence: number;
    objects?: Array<{ label?: string; confidence?: number }>;
  }>;
  truncated: boolean;
  branch: { id: string; name: string; eventCount: number };
};

export type CameraMetricSeries<T> = {
  data: T[];
  basis: "persisted_analytics_events";
  truncated: boolean;
};

function analyticsMetricInterval(range: { from: string; to: string }) {
  const durationMs = Date.parse(range.to) - Date.parse(range.from);
  return durationMs > 7 * 24 * 60 * 60 * 1_000 ? "day" : "hour";
}

export const analyticsApi = {
  capabilities: () => fetchApi<any>('/v1/analytics/capabilities'),
  engineHealth: () => fetchApi<any>('/v1/analytics/engine-health'),
  branchSummary: (branchId: string, range: { from: string; to: string }) => {
    const query = new URLSearchParams(range);
    return fetchApi<AnalyticsDashboardSummary>(
      `/v1/branches/${encodeURIComponent(branchId)}/analytics/summary?${query}`,
    );
  },
  cameraFootfall: (cameraId: string, range: { from: string; to: string }) => {
    const query = new URLSearchParams({ ...range, interval: analyticsMetricInterval(range) });
    return fetchApi<CameraMetricSeries<{
      bucket_at: string; entries: number; exits: number; total_crossings: number;
    }>>(`/v1/cameras/${encodeURIComponent(cameraId)}/analytics/footfall?${query}`);
  },
  cameraDwellTime: (cameraId: string, range: { from: string; to: string }) => {
    const query = new URLSearchParams({ ...range, interval: analyticsMetricInterval(range) });
    return fetchApi<CameraMetricSeries<{
      bucket_at: string; average_seconds: number; maximum_seconds: number; sample_count: number;
      zone_name?: string;
    }>>(`/v1/cameras/${encodeURIComponent(cameraId)}/analytics/dwell-time?${query}`);
  },
  cameraQueue: (cameraId: string, range: { from: string; to: string }) => {
    const query = new URLSearchParams({ ...range, interval: analyticsMetricInterval(range) });
    return fetchApi<CameraMetricSeries<{
      bucket_at: string; average_count: number; maximum_count: number; zone_name?: string;
    }>>(`/v1/cameras/${encodeURIComponent(cameraId)}/analytics/queue?${query}`);
  },
  exportBranchCsv: (branchId: string, range: { from: string; to: string }) => {
    const query = new URLSearchParams(range);
    return downloadApi(
      `/v1/branches/${encodeURIComponent(branchId)}/analytics/export/csv?${query}`,
    );
  },
  enableAllCameras: (branchId: string) => fetchApi<any>(
    `/v1/branches/${encodeURIComponent(branchId)}/analytics/enable-all-cameras`,
    { method: 'POST', body: JSON.stringify({}) },
  ),
  enableAllFleetCameras: () => fetchApi<any>(
    '/v1/analytics/enable-all-fleet-cameras',
    { method: 'POST', body: JSON.stringify({}) },
  ),
  askAssistant: (query: string) => fetchApi<any>('/v1/analytics/assistant/query', {
    method: 'POST', body: JSON.stringify({ query }),
  }),
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
  liveWall: (cameraIds: string[], limit = 200) => {
    const params = new URLSearchParams({
      cameraIds: cameraIds.slice(0, 144).join(','),
      limit: String(limit),
    });
    return fetchApi<{
      data: {
        cameraIds: string[];
        rules: AnalyticsRule[];
        alerts: AnalyticsAlert[];
        summary: AnalyticsAlertSummary;
        sampledAt: string;
      };
    }>(`/v1/analytics/live-wall?${params}`);
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

export const provisioningApi = {
  start: (branchId: string, edgeAgentId?: string) =>
    fetchApi<{ run: ProvisioningRun }>(
      `/v1/branches/${encodeURIComponent(branchId)}/provisioning`,
      { method: "POST", body: JSON.stringify(edgeAgentId ? { edgeAgentId } : {}) },
    ),
  getLatest: (branchId: string) =>
    fetchApi<{ run: ProvisioningRun }>(
      `/v1/branches/${encodeURIComponent(branchId)}/provisioning`,
    ),
  get: (branchId: string, runId: string) =>
    fetchApi<{ run: ProvisioningRun }>(
      `/v1/branches/${encodeURIComponent(branchId)}/provisioning/${encodeURIComponent(runId)}`,
    ),
  retry: (branchId: string, runId: string) =>
    fetchApi<{ run: ProvisioningRun }>(
      `/v1/branches/${encodeURIComponent(branchId)}/provisioning/${encodeURIComponent(runId)}/retry`,
      { method: "POST", body: "{}" },
    ),
  skipCredentials: (branchId: string, runId: string) =>
    fetchApi<{ run: ProvisioningRun }>(
      `/v1/branches/${encodeURIComponent(branchId)}/provisioning/${encodeURIComponent(runId)}/skip-credentials`,
      { method: "POST", body: "{}" },
    ),
  skipStage: (branchId: string, runId: string, stageId: string) =>
    fetchApi<{ run: ProvisioningRun }>(
      `/v1/branches/${encodeURIComponent(branchId)}/provisioning/${encodeURIComponent(runId)}/stages/${encodeURIComponent(stageId)}/skip`,
      { method: "POST", body: "{}" },
    ),
  activateEdgeOnline: (branchId: string) =>
    fetchApi<{
      success: boolean;
      status: "online" | "start-required" | "not-enrolled";
      agent?: { id: string; name: string; status: "pending" | "online" | "offline"; version: string };
      installRequired: boolean;
      activationRequired: boolean;
      message: string;
    }>(
      `/v1/branches/${encodeURIComponent(branchId)}/activate-edge-online`,
      { method: "POST", body: "{}" },
    ),
  executeStep: (branchId: string, stepId: string) =>
    fetchApi<{ success: boolean; message: string }>(
      `/v1/branches/${encodeURIComponent(branchId)}/provisioning/step/${encodeURIComponent(stepId)}/execute`,
      { method: "POST", body: "{}" },
    ),
};

export type IdentityWatchlist = {
  id: string;
  name: string;
  description?: string | null;
  list_type?: string;
  listType?: string;
  enabled?: boolean;
  alert_on_match?: boolean;
  alertOnMatch?: boolean;
  alert_severity?: string;
  alertSeverity?: string;
  created_at?: string;
  createdAt?: string;
};

export type FaceWatchlistPerson = {
  id: string;
  external_id?: string | null;
  externalId?: string | null;
  full_name?: string;
  fullName?: string;
  gender?: string | null;
  enrolled_at?: string;
  enrolledAt?: string;
  last_seen_at?: string | null;
  lastSeenAt?: string | null;
  match_count?: number | string;
  matchCount?: number | string;
  embedding_count?: number | string;
  embeddingCount?: number | string;
};

export type FaceRecognitionEvent = {
  id: string;
  camera_id?: string;
  cameraId?: string;
  camera_name?: string | null;
  cameraName?: string | null;
  person_name?: string | null;
  personName?: string | null;
  watchlist_name?: string | null;
  watchlistName?: string | null;
  similarity_score?: number | string;
  similarityScore?: number | string;
  face_quality?: number | string | null;
  faceQuality?: number | string | null;
  snapshot_reference?: string | null;
  snapshotReference?: string | null;
  occurred_at?: string;
  occurredAt?: string;
};

export type AnprEvent = {
  id: string;
  plate_number?: string;
  plateNumber?: string;
  plate_confidence?: number | string;
  plateConfidence?: number | string;
  camera_name?: string | null;
  cameraName?: string | null;
  vehicle_type?: string | null;
  vehicleType?: string | null;
  vehicle_color?: string | null;
  vehicleColor?: string | null;
  entry_direction?: string | null;
  entryDirection?: string | null;
  watchlist_name?: string | null;
  watchlistName?: string | null;
  watchlist_reason?: string | null;
  watchlistReason?: string | null;
  snapshot_reference?: string | null;
  snapshotReference?: string | null;
  occurred_at?: string;
  occurredAt?: string;
};

export type AnprWatchlistPlate = {
  id: string;
  plate_number?: string;
  plateNumber?: string;
  country_code?: string;
  countryCode?: string;
  region_code?: string | null;
  regionCode?: string | null;
  vehicle_make?: string | null;
  vehicleMake?: string | null;
  vehicle_model?: string | null;
  vehicleModel?: string | null;
  vehicle_color?: string | null;
  vehicleColor?: string | null;
  vehicle_type?: string | null;
  vehicleType?: string | null;
  owner_name?: string | null;
  ownerName?: string | null;
  reason?: string;
  expires_at?: string | null;
  expiresAt?: string | null;
  match_count?: number | string;
  matchCount?: number | string;
};

export const identityAnalyticsApi = {
  listFaceWatchlists: () =>
    fetchApi<{ data: IdentityWatchlist[] }>('/v1/analytics/face-watchlists'),
  createFaceWatchlist: (data: {
    name: string;
    description?: string;
    listType: 'security' | 'vip' | 'staff' | 'blacklist' | 'missing-person';
    alertOnMatch: boolean;
    alertSeverity: 'P1' | 'P2' | 'P3' | 'P4' | 'P5';
  }) => fetchApi<{ data: IdentityWatchlist }>('/v1/analytics/face-watchlists', {
    method: 'POST', body: JSON.stringify(data),
  }),
  listFacePersons: (watchlistId: string) =>
    fetchApi<{ data: FaceWatchlistPerson[] }>(
      `/v1/analytics/face-watchlists/${encodeURIComponent(watchlistId)}/persons`,
    ),
  enrollFacePerson: (watchlistId: string, data: {
    fullName: string;
    externalId?: string;
    dateOfBirth?: string;
    gender?: 'male' | 'female' | 'other' | 'unknown';
    notes?: string;
  }) => fetchApi<{ data: FaceWatchlistPerson }>(
    `/v1/analytics/face-watchlists/${encodeURIComponent(watchlistId)}/persons`,
    { method: 'POST', body: JSON.stringify({ ...data, metadata: {} }) },
  ),
  listFaceEvents: (filters?: { watchlistId?: string; minSimilarity?: number; limit?: number }) => {
    const params = new URLSearchParams();
    if (filters?.watchlistId && filters.watchlistId.trim() !== "") params.set('watchlistId', filters.watchlistId);
    if (filters?.minSimilarity !== undefined) params.set('minSimilarity', String(filters.minSimilarity));
    params.set('limit', String(filters?.limit ?? 100));
    return fetchApi<{ data: FaceRecognitionEvent[] }>(`/v1/analytics/face-events?${params}`);
  },
  listAnprWatchlists: () =>
    fetchApi<{ data: IdentityWatchlist[] }>('/v1/analytics/anpr-watchlists'),
  createAnprWatchlist: (data: {
    name: string;
    description?: string;
    listType: 'alert' | 'stolen' | 'wanted' | 'vip' | 'staff' | 'blacklist';
    alertOnMatch: boolean;
    alertSeverity: 'P1' | 'P2' | 'P3' | 'P4' | 'P5';
    alertAuthorities: boolean;
  }) => fetchApi<{ data: IdentityWatchlist }>('/v1/analytics/anpr-watchlists', {
    method: 'POST', body: JSON.stringify(data),
  }),
  listAnprPlates: (watchlistId: string) =>
    fetchApi<{ data: AnprWatchlistPlate[] }>(
      `/v1/analytics/anpr-watchlists/${encodeURIComponent(watchlistId)}/plates`,
    ),
  addAnprPlate: (watchlistId: string, data: {
    plateNumber: string;
    countryCode: string;
    regionCode?: string;
    vehicleMake?: string;
    vehicleModel?: string;
    vehicleColor?: string;
    vehicleType?: 'car' | 'motorcycle' | 'bus' | 'truck' | 'other';
    ownerName?: string;
    reason: string;
    notes?: string;
    expiresAt?: string;
  }) => fetchApi<{ data: { id: string; plate_number?: string; plateNumber?: string; added_at?: string; addedAt?: string } }>(
    `/v1/analytics/anpr-watchlists/${encodeURIComponent(watchlistId)}/plates`,
    { method: 'POST', body: JSON.stringify(data) },
  ),
  listAnprEvents: (filters?: { watchlistId?: string; plateNumber?: string; limit?: number }) => {
    const params = new URLSearchParams();
    if (filters?.watchlistId && filters.watchlistId.trim() !== "") params.set('watchlistId', filters.watchlistId);
    if (filters?.plateNumber && filters.plateNumber.trim() !== "") params.set('plateNumber', filters.plateNumber);
    params.set('limit', String(filters?.limit ?? 100));
    return fetchApi<{ data: AnprEvent[] }>(`/v1/analytics/anpr-events?${params}`);
  },
};

export const bankingAnalyticsApi = {
  listSessions: (filters: { tenantId: string; branchId?: string }) => {
    const params = new URLSearchParams({ tenantId: filters.tenantId });
    if (filters.branchId) params.set('branchId', filters.branchId);
    return fetchApi<{ success: boolean; data: any[]; count: number }>(
      `/v1/banking/sessions?${params}`,
    );
  },
  getSummary: (tenantId: string, branchId?: string) => {
    const params = new URLSearchParams({ tenantId });
    if (branchId) params.set('branchId', branchId);
    return fetchApi<{ success: boolean; data: any }>(
      `/v1/banking/sessions/summary?${params}`,
    );
  },
  listMonitors: (tenantId: string, branchId: string) =>
    fetchApi<{ success: boolean; data: any[]; count: number }>(
      `/v1/banking/monitors?${new URLSearchParams({ tenantId, branchId })}`,
    ),
  createMonitor: (data: {
    tenantId: string;
    branchId: string;
    name: string;
    description?: string;
    arrivalZoneId: string;
    unloadingZoneId: string;
    secureEntryZoneId?: string;
  }) => fetchApi<{ success: boolean; data: any }>('/v1/banking/monitors', {
    method: 'POST', body: JSON.stringify(data),
  }),
  listVisits: (branchId: string, startDate?: string, endDate?: string) => {
    const params = new URLSearchParams({ branchId });
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    return fetchApi<{ success: boolean; data: any[]; count: number }>(
      `/v1/banking/visits?${params}`,
    );
  },
  createVisit: (data: {
    tenantId: string;
    branchId: string;
    expectedPlate?: string;
    providerName?: string;
    expectedArrivalStart: string;
    expectedArrivalEnd: string;
    notes?: string;
  }) => fetchApi<{ success: boolean; data: any }>('/v1/banking/visits', {
    method: 'POST', body: JSON.stringify(data),
  }),
  generateEvidence: (sessionId: string) =>
    fetchApi<{ success: boolean; data: any }>(
      `/v1/banking/sessions/${encodeURIComponent(sessionId)}/evidence`,
      { method: 'POST', body: JSON.stringify({}) },
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

export const platformCapabilitiesApi = {
  list: () =>
    fetchApi<{ success: boolean; capabilities: any[]; summary: any; timestamp: string }>('/v1/capabilities'),

  getSummary: () =>
    fetchApi<{ success: boolean; data: any; summary: any; timestamp: string }>('/v1/capabilities/summary'),

  getById: (id: string) =>
    fetchApi<{ success: boolean; capability: any; canUse: { usable: boolean; reason?: string }; timestamp: string }>(`/v1/capabilities/${id}`),

  getByCategory: (category: string) =>
    fetchApi<{ success: boolean; category: string; count: number; capabilities: any[]; timestamp: string }>(`/v1/capabilities/category/${category}`),

  getByMaturity: (maturity: string) =>
    fetchApi<{ success: boolean; maturity: string; count: number; capabilities: any[]; timestamp: string }>(`/v1/capabilities/maturity/${maturity}`),

  getAudit: () =>
    fetchApi<{ success: boolean; data: any; timestamp: string }>('/v1/admin/capabilities/audit'),

  getBlockers: () =>
    fetchApi<{ success: boolean; count: number; blockers: any[]; timestamp: string }>('/v1/admin/capabilities/blockers'),
};

export const deviceConfigurationApi = {
  getDeviceConfiguration: (deviceId: string) =>
    fetchApi<{ success: boolean; data: any }>(`/v1/devices/${encodeURIComponent(deviceId)}/configuration`),

  getVideoConfiguration: (deviceId: string, profileToken?: string) =>
    fetchApi<{ success: boolean; data: any }>(
      `/v1/devices/${encodeURIComponent(deviceId)}/configuration/video${profileToken ? `?profileToken=${encodeURIComponent(profileToken)}` : ''}`
    ),

  getVideoOptions: (deviceId: string, profileToken?: string) =>
    fetchApi<{ success: boolean; data: any }>(
      `/v1/devices/${encodeURIComponent(deviceId)}/configuration/video/options${profileToken ? `?profileToken=${encodeURIComponent(profileToken)}` : ''}`
    ),

  setVideoConfiguration: (deviceId: string, config: any) =>
    fetchApi<{ success: boolean; data: any }>(
      `/v1/devices/${encodeURIComponent(deviceId)}/configuration/video`,
      { method: 'POST', body: JSON.stringify(config) }
    ),

  getImagingConfiguration: (deviceId: string) =>
    fetchApi<{ success: boolean; data: any }>(
      `/v1/devices/${encodeURIComponent(deviceId)}/configuration/imaging`
    ),

  getImagingOptions: (deviceId: string) =>
    fetchApi<{ success: boolean; data: any }>(
      `/v1/devices/${encodeURIComponent(deviceId)}/configuration/imaging/options`
    ),

  setImagingConfiguration: (deviceId: string, config: any) =>
    fetchApi<{ success: boolean; data: any }>(
      `/v1/devices/${encodeURIComponent(deviceId)}/configuration/imaging`,
      { method: 'POST', body: JSON.stringify(config) }
    ),

  getTimeConfiguration: (deviceId: string) =>
    fetchApi<{ success: boolean; data: any }>(
      `/v1/devices/${encodeURIComponent(deviceId)}/configuration/time`
    ),

  setTimeConfiguration: (deviceId: string, config: any) =>
    fetchApi<{ success: boolean; data: any }>(
      `/v1/devices/${encodeURIComponent(deviceId)}/configuration/time`,
      { method: 'POST', body: JSON.stringify(config) }
    ),

  getNetworkConfiguration: (deviceId: string) =>
    fetchApi<{ success: boolean; data: any }>(
      `/v1/devices/${encodeURIComponent(deviceId)}/configuration/network`
    ),

  setNetworkConfiguration: (deviceId: string, config: any) =>
    fetchApi<{ success: boolean; data: any }>(
      `/v1/devices/${encodeURIComponent(deviceId)}/configuration/network`,
      { method: 'PUT', body: JSON.stringify(config) }
    ),

  rollbackSnapshot: (deviceId: string, snapshotId: string) =>
    fetchApi<{ success: boolean; data: any }>(
      `/v1/devices/${encodeURIComponent(deviceId)}/configuration/rollback`,
      { method: 'POST', body: JSON.stringify({ snapshotId }) }
    ),

  listSnapshots: (deviceId: string) =>
    fetchApi<{ success: boolean; data: any[] }>(
      `/v1/devices/${encodeURIComponent(deviceId)}/configuration/snapshots`
    ),

  captureSnapshot: (deviceId: string) =>
    fetchApi<{ success: boolean; data: any }>(
      `/v1/devices/${encodeURIComponent(deviceId)}/configuration/snapshots`,
      { method: 'POST' }
    ),

  getRecorderChannels: (recorderId: string) =>
    fetchApi<{ success: boolean; data: any[] }>(
      `/v1/recorders/${encodeURIComponent(recorderId)}/configuration/channels`
    ),

  getRecorderRecording: (recorderId: string, channelId?: string) =>
    fetchApi<{ success: boolean; data: any }>(
      `/v1/recorders/${encodeURIComponent(recorderId)}/configuration/recording${channelId ? `?channelId=${encodeURIComponent(channelId)}` : ''}`
    ),

  getRecorderStorage: (recorderId: string) =>
    fetchApi<{ success: boolean; data: any }>(
      `/v1/recorders/${encodeURIComponent(recorderId)}/configuration/storage`
    ),

  getRecorderTime: (recorderId: string) =>
    fetchApi<{ success: boolean; data: any }>(
      `/v1/recorders/${encodeURIComponent(recorderId)}/configuration/time`
    ),

  setRecorderTime: (recorderId: string, config: any) =>
    fetchApi<{ success: boolean; data: any }>(
      `/v1/recorders/${encodeURIComponent(recorderId)}/configuration/time`,
      { method: 'POST', body: JSON.stringify(config) }
    ),

  getRecorderNetwork: (recorderId: string) =>
    fetchApi<{ success: boolean; data: any }>(
      `/v1/recorders/${encodeURIComponent(recorderId)}/configuration/network`
    ),

  setRecorderNetwork: (recorderId: string, config: any) =>
    fetchApi<{ success: boolean; data: any }>(
      `/v1/recorders/${encodeURIComponent(recorderId)}/configuration/network`,
      { method: 'PUT', body: JSON.stringify(config) }
    ),

  getRecorderSchedule: (recorderId: string, channelId: string) =>
    fetchApi<{ success: boolean; data: any }>(
      `/v1/recorders/${encodeURIComponent(recorderId)}/configuration/channels/${encodeURIComponent(channelId)}/schedule`
    ),

  setRecorderSchedule: (recorderId: string, channelId: string, schedule: any) =>
    fetchApi<{ success: boolean; data: any }>(
      `/v1/recorders/${encodeURIComponent(recorderId)}/configuration/channels/${encodeURIComponent(channelId)}/schedule`,
      { method: 'PUT', body: JSON.stringify(schedule) }
    ),

  getRecorderChannelEncoding: (recorderId: string, channelId: string) =>
    fetchApi<{ success: boolean; data: any }>(
      `/v1/recorders/${encodeURIComponent(recorderId)}/configuration/channels/${encodeURIComponent(channelId)}/encoding`
    ),

  setRecorderChannelEncoding: (recorderId: string, channelId: string, encoding: any) =>
    fetchApi<{ success: boolean; data: any }>(
      `/v1/recorders/${encodeURIComponent(recorderId)}/configuration/channels/${encodeURIComponent(channelId)}/encoding`,
      { method: 'PUT', body: JSON.stringify(encoding) }
    ),

  listGoldenTemplates: (tenantId?: string) =>
    fetchApi<{ success: boolean; data: any[] }>(
      `/v1/device-configuration/templates${tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : ''}`
    ),

  getGoldenTemplate: (id: string, tenantId?: string) =>
    fetchApi<{ success: boolean; data: any }>(
      `/v1/device-configuration/templates/${encodeURIComponent(id)}${tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : ''}`
    ),

  createGoldenTemplate: (template: any, tenantId?: string) =>
    fetchApi<{ success: boolean; data: any }>(
      `/v1/device-configuration/templates${tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : ''}`,
      { method: 'POST', body: JSON.stringify(template) }
    ),

  updateGoldenTemplate: (id: string, updates: any) =>
    fetchApi<{ success: boolean; data: any }>(
      `/v1/device-configuration/templates/${encodeURIComponent(id)}`,
      { method: 'PUT', body: JSON.stringify(updates) }
    ),

  applyGoldenTemplate: (id: string, req: any, tenantId?: string) =>
    fetchApi<{ success: boolean; data: any }>(
      `/v1/device-configuration/templates/${encodeURIComponent(id)}/apply${tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : ''}`,
      { method: 'POST', body: JSON.stringify(req) }
    ),

  getFleetCompliance: (templateId?: string, tenantId?: string) => {
    const params = new URLSearchParams();
    if (templateId) params.append('templateId', templateId);
    if (tenantId) params.append('tenantId', tenantId);
    const qs = params.toString();
    return fetchApi<{ success: boolean; data: any }>(
      `/v1/device-configuration/compliance${qs ? `?${qs}` : ''}`
    );
  },

  remediateCompliance: (payload: { templateId: string; deviceIds?: string[] }, tenantId?: string) =>
    fetchApi<{ success: boolean; data: any }>(
      `/v1/device-configuration/compliance/remediate${tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : ''}`,
      { method: 'POST', body: JSON.stringify(payload) }
    ),
};

export { ApiError };

