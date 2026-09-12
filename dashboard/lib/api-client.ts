// API client for backend communication
import { loginPath } from './session-navigation';

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
const DEFAULT_API_TIMEOUT_MS = 8_000;
const SESSION_API_TIMEOUT_MS = 3_000;
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
      window.location.href = loginPath('expired', window.location);
    }
  }
}

function isPublicAuthEndpoint(endpoint: string) {
  return endpoint.includes('/auth/login') ||
    endpoint.includes('/auth/refresh') ||
    endpoint.includes('/auth/forgot-password') ||
    endpoint.includes('/auth/request-password-reset') ||
    endpoint.includes('/auth/verify-otp') ||
    endpoint.includes('/auth/reset-password');
}

function getStoredToken(key: 'accessToken' | 'refreshToken'): string | null {
  if (typeof window === 'undefined') return null;
  try {
    if (typeof sessionStorage !== 'undefined') {
      const token = sessionStorage.getItem(key);
      if (token) return token;
    }
  } catch {}
  try {
    if (typeof localStorage !== 'undefined') {
      const token = localStorage.getItem(key);
      if (token) return token;
    }
  } catch {}
  return null;
}

/**
 * Refresh the BFF's HttpOnly employee session once for every concurrent 401.
 * The refresh token deliberately never reaches JavaScript; the proxy reads it
 * from the sentinel_refresh cookie and returns a replacement access cookie.
 */
export function refreshCookieBackedSession(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if (cookieRefreshPromise) return cookieRefreshPromise;

  const storedToken = getStoredToken('refreshToken');
  const body = storedToken ? JSON.stringify({ refreshToken: storedToken }) : '{}';

  cookieRefreshPromise = fetch(`${API_BASE}/v1/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body,
    signal: AbortSignal.timeout(3_000),
  })
    .then(async (response) => {
      if (response.ok) {
        try {
          const data = await response.clone().json();
          if (data?.accessToken) {
            sessionStorage.setItem('accessToken', data.accessToken);
          }
          if (data?.refreshToken) {
            sessionStorage.setItem('refreshToken', data.refreshToken);
          }
        } catch { }
        return true;
      }
      // 400 (missing/invalid token), 401, or 403 means session is definitively expired/unauthenticated
      if (response.status === 400 || response.status === 401 || response.status === 403) return false;
      throw new ApiError('Sign-in service is temporarily unavailable. Please try again.', response.status);
    })
    .catch((err) => {
      if (err instanceof ApiError) throw err;
      return false;
    })
    .finally(() => { cookieRefreshPromise = null; });
  return cookieRefreshPromise;
}

async function fetchApi<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getStoredToken('accessToken');

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
  const requestSignal = options.signal ?? AbortSignal.timeout(
    endpoint === '/v1/auth/me' ? SESSION_API_TIMEOUT_MS : DEFAULT_API_TIMEOUT_MS,
  );
  const send = () => fetch(`${API_BASE}${endpoint}`, {
    ...options,
    credentials: "include",
    headers,
    signal: requestSignal,
  });

  let response: Response;

  try {
    response = await send();
    if (response.status === 401 && !isAuthEndpoint && await refreshCookieBackedSession()) {
      response = await send();
    }
  } catch (error: any) {
    if (error instanceof ApiError) throw error;
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
  const token = getStoredToken('accessToken');

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
    if (error instanceof ApiError) throw error;
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
      localStorage.removeItem('user');
      localStorage.removeItem('sentinel_login_time');
      loginRedirectInProgress = false;
      if (response.accessToken) {
        sessionStorage.setItem('accessToken', response.accessToken);
      }
      if (response.refreshToken) {
        sessionStorage.setItem('refreshToken', response.refreshToken);
      }
      if (response.user) {
        sessionStorage.setItem('user', JSON.stringify(response.user));
        sessionStorage.setItem('sentinel_login_time', Date.now().toString());
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
    const token = (typeof window !== 'undefined')
      ? (localStorage.getItem('refreshToken') || sessionStorage.getItem('refreshToken'))
      : null;
    const response = await fetchApi<{
      expiresIn: number;
    }>('/v1/auth/refresh', {
      method: 'POST',
      body: JSON.stringify(token ? { refreshToken: token } : {}),
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

  deleteNode: (id: string, cascade = true) =>
    fetchApi<void>(
      `/v1/organization/nodes/${encodeURIComponent(id)}${cascade ? '?cascade=true' : ''}`,
      { method: 'DELETE' }
    ),

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

export const roleApi = {
  list: () => fetchApi<{ data: any[] }>('/v1/roles'),
  get: (id: string) => fetchApi<any>(`/v1/roles/${id}`),
  create: (data: any) => fetchApi<any>('/v1/roles', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  update: (id: string, data: any) => fetchApi<any>(`/v1/roles/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  }),
  delete: (id: string) => fetchApi<void>(`/v1/roles/${id}`, {
    method: 'DELETE',
  }),
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
  downloadInstallerFromActivation: (
    branchId: string,
    data: { activationId: string; activationCode: string; agentName: string },
  ) =>
    startNativeDownload(
      `/v1/branches/${encodeURIComponent(branchId)}/edge-agent-installer`,
      {
        activationId: data.activationId,
        activationCode: data.activationCode,
        agentName: data.agentName,
        format: "zip",
      },
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
  deleteDiscovery: (branchId: string, discoveryId: string) =>
    fetchApi<{ success: boolean; message: string }>(
      `/v1/branches/${encodeURIComponent(branchId)}/cameras/discovered/${encodeURIComponent(discoveryId)}`,
      { method: 'DELETE' }
    ),
  clearDiscoveredCameras: (branchId: string) =>
    fetchApi<{ success: boolean; deleted: number; message: string }>(
      `/v1/branches/${encodeURIComponent(branchId)}/cameras/discovered`,
      { method: 'DELETE' }
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
  resolvedAt?: string | null;
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
  listWorkOrders: (filters?: { status?: WorkOrder['status']; severity?: WorkOrder['severity']; branchNodeId?: string }) => {
    const params = new URLSearchParams();
    if (filters?.status) params.set('status', filters.status);
    if (filters?.severity) params.set('severity', filters.severity);
    if (filters?.branchNodeId) params.set('branchNodeId', filters.branchNodeId);
    const query = params.toString();
    return fetchApi<{ data: WorkOrder[] }>(`/v1/maintenance/workorders${query ? `?${query}` : ''}`);
  },
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
  askAssistant: (query: string, branchId?: string) => fetchApi<any>('/v1/analytics/assistant/query', {
    method: 'POST', body: JSON.stringify({ query, ...(branchId ? { branchId } : {}) }),
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
  review_status?: string | null;
  reviewStatus?: string | null;
  reviewed_by?: string | null;
  reviewedBy?: string | null;
  reviewed_at?: string | null;
  reviewedAt?: string | null;
  review_notes?: string | null;
  reviewNotes?: string | null;
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
    if (filters?.minSimilarity === undefined) params.set('minSimilarity', '0.82');
    params.set('limit', String(filters?.limit ?? 100));
    return fetchApi<{ data: FaceRecognitionEvent[] }>(`/v1/analytics/face-events?${params}`);
  },
  matchFace: (data: {
    embedding: number[];
    minSimilarity?: number;
    watchlistIds?: string[];
    cameraId?: string;
    limit?: number;
  }) => fetchApi<{
    data: {
      matched: boolean;
      bestMatch: {
        personId: string;
        personName: string;
        watchlistId: string;
        watchlistName: string | null;
        similarity: number;
        severity?: string;
      } | null;
      matches: Array<{
        personId: string;
        personName: string;
        watchlistId: string;
        watchlistName: string | null;
        similarity: number;
        severity?: string;
      }>;
    };
  }>('/v1/analytics/face-match', {
    method: 'POST', body: JSON.stringify(data),
  }),
  reviewFaceEvent: (eventId: string, data: {
    decision: 'confirmed' | 'rejected' | 'unsure';
    notes?: string;
  }) => fetchApi<{
    data: { reviewId: string; status: string; reviewedAt: string };
  }>(`/v1/analytics/face-events/${encodeURIComponent(eventId)}/reviews`, {
    method: 'POST', body: JSON.stringify(data),
  }),
  listFaceEventReviews: (eventId: string) =>
    fetchApi<{
      data: Array<{
        id: string;
        decision: string;
        notes?: string | null;
        reviewer_name?: string | null;
        reviewerName?: string | null;
        reviewed_at?: string;
        reviewedAt?: string;
      }>;
    }>(`/v1/analytics/face-events/${encodeURIComponent(eventId)}/reviews`),
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

export interface ViolenceEvent {
  id: string;
  tenant_id: string;
  camera_id: string;
  camera_name?: string;
  confidence: number;
  severity: 'P1' | 'P2' | 'P3';
  optical_flow_energy: number;
  turbulence_score: number;
  max_limb_acceleration: number;
  strike_count: number;
  participant_count: number;
  participant_track_ids: string[];
  interaction_box: { x: number; y: number; width: number; height: number };
  metrics: Record<string, any>;
  snapshot_reference?: string | null;
  review_status: 'pending' | 'confirmed' | 'false_positive' | 'escalated';
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  review_notes?: string | null;
  occurred_at: string;
  created_at: string;
}

export interface ViolenceCameraConfig {
  camera_id: string;
  tenant_id: string;
  enabled: boolean;
  sensitivity: number;
  min_confidence: number;
  min_optical_flow_energy: number;
  min_limb_acceleration: number;
  min_duration_ms: number;
  cooldown_seconds: number;
  alert_severity: 'P1' | 'P2' | 'P3';
  isDefault?: boolean;
}

export interface ViolenceStats {
  totalIncidents: number;
  pendingReviews: number;
  confirmedCount: number;
  falsePositiveCount: number;
  escalatedCount: number;
  avgConfidence: number;
  p1Count: number;
}

export const violenceApi = {
  listEvents: (filters?: {
    cameraId?: string;
    severity?: 'P1' | 'P2' | 'P3';
    reviewStatus?: 'pending' | 'confirmed' | 'false_positive' | 'escalated';
    fromDate?: string;
    toDate?: string;
    limit?: number;
    offset?: number;
  }) => {
    const params = new URLSearchParams();
    if (filters?.cameraId) params.set('cameraId', filters.cameraId);
    if (filters?.severity) params.set('severity', filters.severity);
    if (filters?.reviewStatus) params.set('reviewStatus', filters.reviewStatus);
    if (filters?.fromDate) params.set('fromDate', filters.fromDate);
    if (filters?.toDate) params.set('toDate', filters.toDate);
    if (filters?.limit) params.set('limit', String(filters.limit));
    if (filters?.offset) params.set('offset', String(filters.offset));
    return fetchApi<{ success: boolean; data: ViolenceEvent[]; pagination: { total: number; limit: number; offset: number } }>(
      `/v1/analytics/violence/events?${params}`
    );
  },
  getEvent: (eventId: string) =>
    fetchApi<{ success: boolean; data: ViolenceEvent }>(`/v1/analytics/violence/events/${encodeURIComponent(eventId)}`),
  reviewEvent: (
    eventId: string,
    data: { reviewStatus: 'confirmed' | 'false_positive' | 'escalated'; reviewNotes?: string }
  ) =>
    fetchApi<{ success: boolean; data: ViolenceEvent }>(
      `/v1/analytics/violence/events/${encodeURIComponent(eventId)}/review`,
      { method: 'POST', body: JSON.stringify(data) }
    ),
  getCameraConfig: (cameraId: string) =>
    fetchApi<{ success: boolean; data: ViolenceCameraConfig }>(
      `/v1/analytics/violence/config/${encodeURIComponent(cameraId)}`
    ),
  updateCameraConfig: (cameraId: string, data: Partial<ViolenceCameraConfig>) =>
    fetchApi<{ success: boolean; data: ViolenceCameraConfig }>(
      `/v1/analytics/violence/config/${encodeURIComponent(cameraId)}`,
      { method: 'PUT', body: JSON.stringify(data) }
    ),
  getStats: () =>
    fetchApi<{ success: boolean; data: ViolenceStats }>('/v1/analytics/violence/stats'),
};

export type TailgatingViolationType =
  | 'piggyback_tailgating'
  | 'unbadged_entry'
  | 'denied_entry_breach'
  | 'multi_occupancy_violation'
  | 'door_held_breach';

export interface SequenceTimelineItem {
  timestamp: number;
  relativeOffsetMs: number;
  type: 'badge_swipe' | 'door_state' | 'camera_person_count' | 'violation_detected' | 'interlock_lockdown';
  label: string;
  details: Record<string, any>;
}

export interface TailgatingEvent {
  id: string;
  tenant_id: string;
  portal_id?: string | null;
  camera_id?: string | null;
  door_id: string;
  badge_id?: string | null;
  badge_holder_name?: string | null;
  detected_person_count: number;
  authorized_count: number;
  tailgater_count: number;
  violation_type: TailgatingViolationType;
  severity: 'P1' | 'P2' | 'P3';
  confidence: number;
  time_gap_ms: number;
  participant_track_ids: string[];
  bounding_boxes: Array<{ x: number; y: number; width: number; height: number }>;
  sequence_timeline: SequenceTimelineItem[];
  interlock_lockdown_engaged: boolean;
  snapshot_reference?: string | null;
  review_status: 'pending' | 'confirmed' | 'false_positive' | 'escalated';
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  review_notes?: string | null;
  occurred_at: string;
  created_at: string;
  portal_name?: string;
  camera_name?: string;
}

export interface AirlockPortal {
  id: string;
  tenant_id: string;
  name: string;
  branch_id?: string | null;
  camera_id?: string | null;
  outer_door_id: string;
  inner_door_id: string;
  chamber_zone: Array<{ x: number; y: number }>;
  max_allowed_occupancy: number;
  correlation_window_seconds: number;
  interlock_mode: 'strict_interlock' | 'manual_release' | 'warning_only';
  auto_lock_inner_door: boolean;
  enabled: boolean;
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface TailgatingPortalConfig {
  portal_id: string;
  tenant_id: string;
  enabled: boolean;
  sensitivity: number;
  min_confidence: number;
  max_time_gap_ms: number;
  correlation_window_seconds: number;
  max_allowed_occupancy: number;
  auto_lock_inner_door: boolean;
  alert_severity: 'P1' | 'P2' | 'P3';
  cooldown_seconds: number;
  isDefault?: boolean;
}

export interface TailgatingStats {
  totalIncidents: number;
  pendingReviews: number;
  confirmedCount: number;
  falsePositiveCount: number;
  escalatedCount: number;
  interlockLockdowns: number;
  avgConfidence: number;
  p1Count: number;
  byViolationType: Record<string, number>;
}

export const tailgatingApi = {
  listEvents: (filters?: {
    portalId?: string;
    cameraId?: string;
    severity?: 'P1' | 'P2' | 'P3';
    reviewStatus?: 'pending' | 'confirmed' | 'false_positive' | 'escalated';
    violationType?: TailgatingViolationType;
    fromDate?: string;
    toDate?: string;
    limit?: number;
    offset?: number;
  }) => {
    const params = new URLSearchParams();
    if (filters?.portalId) params.set('portalId', filters.portalId);
    if (filters?.cameraId) params.set('cameraId', filters.cameraId);
    if (filters?.severity) params.set('severity', filters.severity);
    if (filters?.reviewStatus) params.set('reviewStatus', filters.reviewStatus);
    if (filters?.violationType) params.set('violationType', filters.violationType);
    if (filters?.fromDate) params.set('fromDate', filters.fromDate);
    if (filters?.toDate) params.set('toDate', filters.toDate);
    if (filters?.limit) params.set('limit', String(filters.limit));
    if (filters?.offset) params.set('offset', String(filters.offset));
    return fetchApi<{ success: boolean; data: TailgatingEvent[]; pagination: { total: number; limit: number; offset: number } }>(
      `/v1/analytics/tailgating/events?${params}`
    );
  },
  getEvent: (eventId: string) =>
    fetchApi<{ success: boolean; data: TailgatingEvent }>(`/v1/analytics/tailgating/events/${encodeURIComponent(eventId)}`),
  reviewEvent: (
    eventId: string,
    data: { reviewStatus: 'confirmed' | 'false_positive' | 'escalated'; reviewNotes?: string }
  ) =>
    fetchApi<{ success: boolean; data: TailgatingEvent }>(
      `/v1/analytics/tailgating/events/${encodeURIComponent(eventId)}/review`,
      { method: 'POST', body: JSON.stringify(data) }
    ),
  correlatePassage: (data: {
    portalId: string;
    badgeSwipes?: Array<{
      doorId: string;
      badgeId: string;
      personName?: string;
      eventType: 'granted' | 'denied' | 'forced' | 'held_open' | 'tailgating';
      authorizedCount: number;
      timestamp: number;
    }>;
    doorEvents?: Array<{
      doorId: string;
      state: 'opened' | 'closed' | 'held_open' | 'forced';
      timestamp: number;
    }>;
    cameraObservations?: Array<{
      trackId: string;
      timestamp: number;
      confidence: number;
      boundingBox: { x: number; y: number; width: number; height: number };
    }>;
    snapshotReference?: string;
  }) =>
    fetchApi<{
      success: boolean;
      data: {
        result: any;
        savedEventId: string | null;
        interlockLockdownEngaged: boolean;
      };
    }>('/v1/analytics/tailgating/correlate', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  ingestBadgeSwipe: (data: {
    portalId?: string;
    doorId: string;
    badgeId: string;
    personName?: string;
    eventType: 'granted' | 'denied' | 'forced' | 'held_open' | 'tailgating';
    authorizedCount?: number;
    direction?: 'entry' | 'exit';
  }) =>
    fetchApi<{ success: boolean; data: any }>('/v1/analytics/tailgating/badge-swipe', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  listPortals: () =>
    fetchApi<{ success: boolean; data: AirlockPortal[] }>('/v1/analytics/tailgating/portals'),
  upsertPortal: (data: Partial<AirlockPortal> & { name: string; outerDoorId: string; innerDoorId: string }) =>
    fetchApi<{ success: boolean; data: AirlockPortal }>('/v1/analytics/tailgating/portals', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getPortalConfig: (portalId: string) =>
    fetchApi<{ success: boolean; data: TailgatingPortalConfig }>(
      `/v1/analytics/tailgating/config/${encodeURIComponent(portalId)}`
    ),
  updatePortalConfig: (portalId: string, data: Partial<TailgatingPortalConfig>) =>
    fetchApi<{ success: boolean; data: TailgatingPortalConfig }>(
      `/v1/analytics/tailgating/config/${encodeURIComponent(portalId)}`,
      { method: 'PUT', body: JSON.stringify(data) }
    ),
  getStats: () =>
    fetchApi<{ success: boolean; data: TailgatingStats }>('/v1/analytics/tailgating/stats'),
};

export interface ReidGlobalIdentity {
  id: string;
  tenant_id: string;
  global_id: string;
  representative_embedding: number[];
  first_seen: string;
  last_seen: string;
  appearances: number;
  cameras_visited: string[];
  primary_branch_id: string | null;
  status: 'active' | 'archived' | 'merged';
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface ReidCameraSighting {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  camera_id: string;
  camera_name?: string;
  global_id: string;
  local_track_id: string;
  entered_at: string;
  exited_at: string;
  dwell_seconds: number;
  confidence: number;
  quality_score: number;
  bounding_box: { x: number; y: number; width: number; height: number };
  snapshot_url: string | null;
  embedding: number[];
  metrics: Record<string, any>;
  created_at: string;
}

export interface ReidPersonJourneyStep {
  stepIndex: number;
  cameraId: string;
  cameraName?: string;
  enteredAt: string;
  exitedAt: string;
  dwellSeconds: number;
  confidence: number;
  qualityScore: number;
  snapshotUrl: string | null;
  boundingBox: { x: number; y: number; width: number; height: number };
}

export interface ReidCameraTransition {
  fromCameraId: string;
  fromCameraName?: string;
  toCameraId: string;
  toCameraName?: string;
  departedAt: string;
  arrivedAt: string;
  transitDurationSeconds: number;
  isPlausible: boolean;
  reason?: string;
}

export interface ReidPersonJourney {
  globalId: string;
  identity: ReidGlobalIdentity;
  totalSightings: number;
  uniqueCamerasCount: number;
  totalDwellSeconds: number;
  firstSeen: string;
  lastSeen: string;
  journeySpanSeconds: number;
  steps: ReidPersonJourneyStep[];
  transitions: ReidCameraTransition[];
}

export interface ReidTopologyRule {
  id: string;
  tenant_id: string;
  branch_id: string;
  from_camera_id: string;
  to_camera_id: string;
  min_transit_seconds: number;
  max_transit_seconds: number;
  distance_meters: number | null;
  transition_probability: number;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface ReidStats {
  totalIdentities: number;
  totalSightings: number;
  crossCameraTransitions: number;
  activeCameras: number;
  averageConfidence: number;
}

export const reidApi = {
  listIdentities: (params?: { branchId?: string; status?: 'active' | 'archived'; limit?: number; offset?: number }) => {
    const q = new URLSearchParams();
    if (params?.branchId) q.set('branchId', params.branchId);
    if (params?.status) q.set('status', params.status);
    if (params?.limit) q.set('limit', String(params.limit));
    if (params?.offset) q.set('offset', String(params.offset));
    return fetchApi<{ success: boolean; data: ReidGlobalIdentity[]; pagination: { total: number; limit: number; offset: number } }>(
      `/v1/analytics/reid/identities?${q}`
    );
  },
  getIdentity: (globalId: string) =>
    fetchApi<{ success: boolean; data: ReidGlobalIdentity }>(`/v1/analytics/reid/identities/${encodeURIComponent(globalId)}`),
  getJourney: (globalId: string) =>
    fetchApi<{ success: boolean; data: ReidPersonJourney }>(`/v1/analytics/reid/journey/${encodeURIComponent(globalId)}`),
  ingestSighting: (data: {
    branchId?: string | null;
    cameraId: string;
    localTrackId: string;
    enteredAt: string;
    exitedAt: string;
    embedding?: number[];
    rawCropBase64?: string;
    confidence: number;
    boundingBox: { x: number; y: number; width: number; height: number };
    snapshotUrl?: string | null;
    metrics?: Record<string, any>;
    similarityThreshold?: number;
  }) =>
    fetchApi<{
      success: boolean;
      data: {
        matched: boolean;
        globalId: string;
        similarity: number;
        integratedScore: number;
        isNewIdentity: boolean;
        isCrossCameraTransition: boolean;
        previousCameraId?: string;
        transitDurationSeconds?: number;
        sighting: ReidCameraSighting;
        spatioTemporalValid: boolean;
      };
    }>('/v1/analytics/reid/sightings', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  probeSearch: (data: {
    probeEmbedding?: number[];
    probeCropBase64?: string;
    cropWidth?: number;
    cropHeight?: number;
    similarityThreshold?: number;
    branchId?: string | null;
    fromTime?: string;
    toTime?: string;
    limit?: number;
  }) =>
    fetchApi<{
      success: boolean;
      data: Array<{ sighting: ReidCameraSighting; similarity: number; globalId: string }>;
      total: number;
      probeId: string;
    }>('/v1/analytics/reid/probe', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getTopology: (branchId?: string) => {
    const q = branchId ? `?branchId=${encodeURIComponent(branchId)}` : '';
    return fetchApi<{ success: boolean; data: ReidTopologyRule[] }>(`/v1/analytics/reid/topology${q}`);
  },
  updateTopology: (data: {
    branchId: string;
    fromCameraId: string;
    toCameraId: string;
    minTransitSeconds?: number;
    maxTransitSeconds?: number;
    distanceMeters?: number | null;
    transitionProbability?: number;
    enabled?: boolean;
  }) =>
    fetchApi<{ success: boolean; data: ReidTopologyRule }>('/v1/analytics/reid/topology', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getStats: () =>
    fetchApi<{ success: boolean; data: ReidStats }>('/v1/analytics/reid/stats'),
};

export interface CrowdZone {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  camera_id: string | null;
  zone_name: string;
  zone_type: 'branch_hall' | 'waiting_lounge' | 'atm_vestibule' | 'teller_area' | 'kiosk_zone' | 'entrance_foyer' | 'corridor';
  polygon: Array<{ x: number; y: number }>;
  area_sqm: number;
  nominal_capacity: number;
  warning_capacity: number;
  max_capacity: number;
  enabled: boolean;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface CounterQueue {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  camera_id: string | null;
  counter_number: string;
  counter_name: string;
  counter_type: 'cash_deposit' | 'cash_withdrawal' | 'general_teller' | 'forex_remittance' | 'loan_desk' | 'account_services' | 'customer_support';
  queue_polygon: Array<{ x: number; y: number }>;
  service_station_polygon: Array<{ x: number; y: number }>;
  max_queue_length_threshold: number;
  max_wait_time_seconds_threshold: number;
  alert_severity: 'P1' | 'P2' | 'P3';
  enabled: boolean;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface ZoneDensityResult {
  zoneId: string;
  zoneName: string;
  zoneType: string;
  personCount: number;
  densityLevel: 'empty' | 'sparse' | 'normal' | 'crowded' | 'overcrowded' | 'dangerous';
  occupancyPercentage: number;
  densityPerSqm: number;
  averageSpeed: number;
  isBottleneck: boolean;
  heatIntensity: number;
  trend: 'increasing' | 'decreasing' | 'stable';
  participantTrackIds: string[];
  centroid: { x: number; y: number };
  requiresAlert: boolean;
  alertSeverity?: 'P1' | 'P2' | 'P3';
}

export interface QueueMetricResult {
  queueId: string;
  counterNumber: string;
  counterName: string;
  counterType: string;
  currentQueueLength: number;
  servedPersonCount: number;
  avgWaitTimeSeconds: number;
  maxWaitTimeSeconds: number;
  isCounterAttended: boolean;
  thresholdExceeded: boolean;
  bottleneckDetected: boolean;
  participantTrackIds: string[];
  waitingPersons: Array<{
    trackId: string;
    waitSeconds: number;
    distanceToCounter: number;
  }>;
  requiresAlert: boolean;
  incidentType?: string;
  alertSeverity?: 'P1' | 'P2' | 'P3';
}

export interface CrowdDensitySnapshot {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  zone_id: string;
  camera_id: string | null;
  person_count: number;
  density_level: string;
  occupancy_percentage: number;
  density_per_sqm: number;
  average_speed: number;
  is_bottleneck: boolean;
  heat_intensity: number;
  trend: string;
  snapshot_metadata: Record<string, any>;
  timestamp: string;
  created_at: string;
}

export interface CounterQueueSnapshot {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  queue_id: string;
  camera_id: string | null;
  current_queue_length: number;
  served_person_count: number;
  avg_wait_time_seconds: number;
  max_wait_time_seconds: number;
  is_counter_attended: boolean;
  threshold_exceeded: boolean;
  bottleneck_detected: boolean;
  participant_track_ids: string[];
  snapshot_metadata: Record<string, any>;
  timestamp: string;
  created_at: string;
}

export interface CrowdQueueIncident {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  camera_id: string | null;
  incident_type: 'crowd_density_exceeded' | 'queue_length_exceeded' | 'wait_time_sla_breach' | 'unattended_counter_with_queue' | 'stampede_risk_bottleneck';
  severity: 'P1' | 'P2' | 'P3';
  entity_type: 'zone' | 'counter_queue';
  entity_id: string;
  entity_name: string;
  trigger_value: number;
  threshold_value: number;
  confidence: number;
  explanation: string;
  snapshot_url: string | null;
  review_status: 'pending' | 'acknowledged' | 'resolved' | 'false_positive';
  reviewed_by: string | null;
  reviewed_at: string | null;
  resolution_notes: string | null;
  metadata: Record<string, any>;
  occurred_at: string;
  created_at: string;
}

export interface CounterRecommendation {
  id: string;
  type: 'open_counter' | 'rebalance_queue' | 'staff_alert';
  priority: 'high' | 'medium' | 'low';
  title: string;
  message: string;
  recommendedCounterNumber?: string;
  sourceQueueId?: string;
  triggeredAt: string;
}

export interface CrowdKPIStats {
  activeZonesCount: number;
  activeQueuesCount: number;
  totalHallOccupancy: number;
  peakOccupancyToday: number;
  averageWaitTimeSeconds: number;
  maxWaitTimeSecondsToday: number;
  overallDensityLevel: 'empty' | 'sparse' | 'normal' | 'crowded' | 'overcrowded' | 'dangerous';
  slaComplianceRate: number;
  openIncidentsCount: {
    total: number;
    p1: number;
    p2: number;
    p3: number;
  };
}

export interface CrowdLiveStatus {
  timestamp: string;
  zones: ZoneDensityResult[];
  queues: QueueMetricResult[];
  recommendations: CounterRecommendation[];
  kpis: CrowdKPIStats;
}

export interface CrowdQueueConfig {
  tenant_id: string;
  branch_id: string | null;
  default_queue_threshold: number;
  default_wait_time_threshold_seconds: number;
  density_warning_percentage: number;
  density_critical_percentage: number;
  bottleneck_speed_threshold: number;
  sla_target_compliance_percentage: number;
  alert_cooldown_seconds: number;
  auto_recommend_extra_counters: boolean;
  isDefault?: boolean;
}

export const crowdApi = {
  listZones: (branchId?: string) => {
    const q = branchId ? `?branchId=${encodeURIComponent(branchId)}` : '';
    return fetchApi<{ success: boolean; data: CrowdZone[] }>(`/v1/analytics/crowd/zones${q}`);
  },
  createZone: (data: {
    id?: string;
    branchId?: string | null;
    cameraId?: string | null;
    zoneName: string;
    zoneType: string;
    polygon: Array<{ x: number; y: number }>;
    areaSqm?: number;
    nominalCapacity?: number;
    warningCapacity?: number;
    maxCapacity?: number;
    enabled?: boolean;
    metadata?: Record<string, any>;
  }) =>
    fetchApi<{ success: boolean; data: CrowdZone }>('/v1/analytics/crowd/zones', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateZone: (data: {
    id: string;
    branchId?: string | null;
    cameraId?: string | null;
    zoneName: string;
    zoneType: string;
    polygon: Array<{ x: number; y: number }>;
    areaSqm?: number;
    nominalCapacity?: number;
    warningCapacity?: number;
    maxCapacity?: number;
    enabled?: boolean;
    metadata?: Record<string, any>;
  }) =>
    fetchApi<{ success: boolean; data: CrowdZone }>('/v1/analytics/crowd/zones', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  deleteZone: (id: string) =>
    fetchApi<{ success: boolean; data: { deleted: boolean } }>(`/v1/analytics/crowd/zones/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),
  listQueues: (branchId?: string) => {
    const q = branchId ? `?branchId=${encodeURIComponent(branchId)}` : '';
    return fetchApi<{ success: boolean; data: CounterQueue[] }>(`/v1/analytics/crowd/queues${q}`);
  },
  createQueue: (data: {
    id?: string;
    branchId?: string | null;
    cameraId?: string | null;
    counterNumber: string;
    counterName: string;
    counterType: string;
    queuePolygon: Array<{ x: number; y: number }>;
    serviceStationPolygon: Array<{ x: number; y: number }>;
    maxQueueLengthThreshold?: number;
    maxWaitTimeSecondsThreshold?: number;
    alertSeverity?: 'P1' | 'P2' | 'P3';
    enabled?: boolean;
    metadata?: Record<string, any>;
  }) =>
    fetchApi<{ success: boolean; data: CounterQueue }>('/v1/analytics/crowd/queues', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateQueue: (data: {
    id: string;
    branchId?: string | null;
    cameraId?: string | null;
    counterNumber: string;
    counterName: string;
    counterType: string;
    queuePolygon: Array<{ x: number; y: number }>;
    serviceStationPolygon: Array<{ x: number; y: number }>;
    maxQueueLengthThreshold?: number;
    maxWaitTimeSecondsThreshold?: number;
    alertSeverity?: 'P1' | 'P2' | 'P3';
    enabled?: boolean;
    metadata?: Record<string, any>;
  }) =>
    fetchApi<{ success: boolean; data: CounterQueue }>('/v1/analytics/crowd/queues', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  deleteQueue: (id: string) =>
    fetchApi<{ success: boolean; data: { deleted: boolean } }>(`/v1/analytics/crowd/queues/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),
  analyzeFrame: (data: {
    branchId?: string;
    cameraId?: string;
    timestamp?: number | string;
    persons: Array<{
      trackId: string;
      boundingBox: { x: number; y: number; width: number; height: number };
      confidence?: number;
      velocity?: { x: number; y: number };
    }>;
    snapshotUrl?: string;
  }) =>
    fetchApi<{ success: boolean; data: any }>('/v1/analytics/crowd/analyze-frame', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getLiveStatus: (branchId?: string) => {
    const q = branchId ? `?branchId=${encodeURIComponent(branchId)}` : '';
    return fetchApi<{ success: boolean; data: CrowdLiveStatus }>(`/v1/analytics/crowd/live${q}`);
  },
  getDensityHistory: (params?: { branchId?: string; zoneId?: string; fromDate?: string; toDate?: string; limit?: number }) => {
    const sp = new URLSearchParams();
    if (params?.branchId) sp.set('branchId', params.branchId);
    if (params?.zoneId) sp.set('zoneId', params.zoneId);
    if (params?.fromDate) sp.set('fromDate', params.fromDate);
    if (params?.toDate) sp.set('toDate', params.toDate);
    if (params?.limit) sp.set('limit', String(params.limit));
    const qs = sp.toString() ? `?${sp.toString()}` : '';
    return fetchApi<{ success: boolean; data: CrowdDensitySnapshot[] }>(`/v1/analytics/crowd/density-history${qs}`);
  },
  getQueueMetrics: (params?: { branchId?: string; queueId?: string; fromDate?: string; toDate?: string; limit?: number }) => {
    const sp = new URLSearchParams();
    if (params?.branchId) sp.set('branchId', params.branchId);
    if (params?.queueId) sp.set('queueId', params.queueId);
    if (params?.fromDate) sp.set('fromDate', params.fromDate);
    if (params?.toDate) sp.set('toDate', params.toDate);
    if (params?.limit) sp.set('limit', String(params.limit));
    const qs = sp.toString() ? `?${sp.toString()}` : '';
    return fetchApi<{ success: boolean; data: CounterQueueSnapshot[] }>(`/v1/analytics/crowd/queue-metrics${qs}`);
  },
  listIncidents: (params?: {
    branchId?: string;
    cameraId?: string;
    incidentType?: string;
    severity?: 'P1' | 'P2' | 'P3';
    reviewStatus?: 'pending' | 'acknowledged' | 'resolved' | 'false_positive';
    fromDate?: string;
    toDate?: string;
    limit?: number;
    offset?: number;
  }) => {
    const sp = new URLSearchParams();
    if (params?.branchId) sp.set('branchId', params.branchId);
    if (params?.cameraId) sp.set('cameraId', params.cameraId);
    if (params?.incidentType) sp.set('incidentType', params.incidentType);
    if (params?.severity) sp.set('severity', params.severity);
    if (params?.reviewStatus) sp.set('reviewStatus', params.reviewStatus);
    if (params?.fromDate) sp.set('fromDate', params.fromDate);
    if (params?.toDate) sp.set('toDate', params.toDate);
    if (params?.limit) sp.set('limit', String(params.limit));
    if (params?.offset) sp.set('offset', String(params.offset));
    const qs = sp.toString() ? `?${sp.toString()}` : '';
    return fetchApi<{ success: boolean; data: CrowdQueueIncident[]; pagination: { total: number; limit: number; offset: number } }>(
      `/v1/analytics/crowd/incidents${qs}`
    );
  },
  getIncident: (id: string) =>
    fetchApi<{ success: boolean; data: CrowdQueueIncident }>(`/v1/analytics/crowd/incidents/${encodeURIComponent(id)}`),
  reviewIncident: (id: string, data: { reviewStatus: 'acknowledged' | 'resolved' | 'false_positive'; resolutionNotes?: string }) =>
    fetchApi<{ success: boolean; data: CrowdQueueIncident }>(`/v1/analytics/crowd/incidents/${encodeURIComponent(id)}/review`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getStats: (branchId?: string) => {
    const q = branchId ? `?branchId=${encodeURIComponent(branchId)}` : '';
    return fetchApi<{ success: boolean; data: CrowdKPIStats }>(`/v1/analytics/crowd/stats${q}`);
  },
  getRecommendations: (branchId?: string) => {
    const q = branchId ? `?branchId=${encodeURIComponent(branchId)}` : '';
    return fetchApi<{ success: boolean; data: CounterRecommendation[] }>(`/v1/analytics/crowd/recommendations${q}`);
  },
  getConfig: () => fetchApi<{ success: boolean; data: CrowdQueueConfig }>('/v1/analytics/crowd/config'),
  updateConfig: (data: Partial<CrowdQueueConfig>) =>
    fetchApi<{ success: boolean; data: CrowdQueueConfig }>('/v1/analytics/crowd/config', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
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

  // Production Multi-Camera Synchronized Playback & Drift Compensation APIs
  createSyncSession: (data: {
    branchId: string;
    title: string;
    cameraIds: string[];
    startTime: string;
    endTime: string;
    description?: string;
    masterCameraId?: string;
    layout?: string;
    driftCompensationEnabled?: boolean;
  }) =>
    fetchApi<{ data: any }>(`/v1/playback/sync/sessions`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  listSyncSessions: (params?: { branchId?: string }) =>
    fetchApi<{ data: any[] }>(`/v1/playback/sync/sessions${params?.branchId ? `?branchId=${encodeURIComponent(params.branchId)}` : ''}`),

  getSyncSession: (id: string) =>
    fetchApi<{ data: any }>(`/v1/playback/sync/sessions/${encodeURIComponent(id)}`),

  seekSyncSession: (id: string, targetTimestamp: string) =>
    fetchApi<{ data: any }>(`/v1/playback/sync/sessions/${encodeURIComponent(id)}/seek`, {
      method: 'POST',
      body: JSON.stringify({ targetTimestamp }),
    }),

  stepSyncFrame: (id: string, direction?: 'FORWARD' | 'BACKWARD', fps?: number) =>
    fetchApi<{ data: any }>(`/v1/playback/sync/sessions/${encodeURIComponent(id)}/step`, {
      method: 'POST',
      body: JSON.stringify({ direction: direction || 'FORWARD', fps: fps || 25 }),
    }),

  setSyncState: (id: string, state: 'PLAYING' | 'PAUSED' | 'BUFFERING' | 'STOPPED', speed?: number) =>
    fetchApi<{ data: any }>(`/v1/playback/sync/sessions/${encodeURIComponent(id)}/state`, {
      method: 'POST',
      body: JSON.stringify({ state, speed: speed ?? 1.0 }),
    }),

  toggleSyncDrift: (id: string, enabled: boolean) =>
    fetchApi<{ data: any }>(`/v1/playback/sync/sessions/${encodeURIComponent(id)}/drift-toggle`, {
      method: 'POST',
      body: JSON.stringify({ enabled }),
    }),

  addSyncBookmark: (id: string, data: { timestamp: string; label: string; notes?: string }) =>
    fetchApi<{ data: any }>(`/v1/playback/sync/sessions/${encodeURIComponent(id)}/bookmarks`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  listSyncBookmarks: (id: string) =>
    fetchApi<{ data: any[] }>(`/v1/playback/sync/sessions/${encodeURIComponent(id)}/bookmarks`),

  calibrateSyncDrift: (id: string, cameraId: string, manualOffsetMs: number) =>
    fetchApi<{ data: any }>(`/v1/playback/sync/sessions/${encodeURIComponent(id)}/calibrate`, {
      method: 'POST',
      body: JSON.stringify({ cameraId, manualOffsetMs }),
    }),

  deleteSyncSession: (id: string) =>
    fetchApi<{ success: boolean }>(`/v1/playback/sync/sessions/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),
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

  requestExport: (caseId: string, data: { format: string; reason: string; redaction?: any }) =>
    fetchApi<any>(`/v1/evidence/cases/${caseId}/exports`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  requestRedactedExport: (caseId: string, data: {
    format?: string;
    reason: string;
    redaction: {
      complianceStandard?: "GDPR" | "DPDP" | "HIPAA" | "CUSTOM";
      faceBlur?: boolean;
      plateBlur?: boolean;
      applyStaticZones?: boolean;
      blurStrength?: number;
      mode?: "blur" | "pixelate" | "solid";
      audioAction?: "PASS_THROUGH" | "MUTE" | "REMOVE_TRACK";
      watermarkText?: string;
      boundingBoxes?: Array<{ x: number; y: number; width: number; height: number; startTimeSec?: number; endTimeSec?: number; label?: string }>;
    };
  }) =>
    fetchApi<any>(`/v1/evidence/cases/${caseId}/exports/redacted`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getRedactionAudit: (exportId: string) =>
    fetchApi<any>(`/v1/evidence/exports/${exportId}/redaction-audit`),

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

  previewGoldenTemplate: (payload: { templateId: string; targetCameraIds: string[] }) =>
    fetchApi<{ success: boolean; data: any }>(
      `/v1/config/golden-templates/preview`,
      { method: 'POST', body: JSON.stringify(payload) }
    ),

  getGoldenTemplateHistory: (templateId?: string) =>
    fetchApi<{ success: boolean; data: any[] }>(
      `/v1/config/golden-templates/history${templateId ? `?templateId=${encodeURIComponent(templateId)}` : ''}`
    ),

  convertGoldenTemplateToDraft: (
    id: string,
    payload: { branchId: string; versionNumber?: number; changeReason?: string }
  ) =>
    fetchApi<{ success: boolean; data: any }>(
      `/v1/config/golden-templates/${encodeURIComponent(id)}/draft`,
      { method: 'POST', body: JSON.stringify(payload) }
    ),
};

export const signedConfigApi = {
  listVersions: () =>
    fetchApi<{ success: boolean; data: any[] }>(`/v1/config/versions`),

  createDraft: (payload: {
    version: number;
    config: any;
    changeReason: string;
    ticketId?: string;
    parentVersionId?: string;
  }) =>
    fetchApi<{ success: boolean; data: any }>(`/v1/config/versions`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  validateVersion: (id: string) =>
    fetchApi<{ success: boolean; data: any }>(
      `/v1/config/versions/${encodeURIComponent(id)}/validate`,
      { method: 'POST' }
    ),

  approveVersion: (id: string, payload: { decision?: 'APPROVED' | 'REJECTED'; comments: string }) =>
    fetchApi<{ success: boolean; data: any }>(
      `/v1/config/versions/${encodeURIComponent(id)}/approve`,
      { method: 'POST', body: JSON.stringify(payload) }
    ),

  signVersion: (id: string) =>
    fetchApi<{ success: boolean; data: any }>(
      `/v1/config/versions/${encodeURIComponent(id)}/sign`,
      { method: 'POST' }
    ),

  cloneVersion: (id: string, payload: { modifications?: Record<string, any>; changeReason: string; ticketId?: string }) =>
    fetchApi<{ success: boolean; data: any }>(
      `/v1/config/versions/${encodeURIComponent(id)}/clone`,
      { method: 'POST', body: JSON.stringify(payload) }
    ),

  revokeVersion: (id: string, payload: { reason: string }) =>
    fetchApi<{ success: boolean; data: any }>(
      `/v1/config/versions/${encodeURIComponent(id)}/revoke`,
      { method: 'POST', body: JSON.stringify(payload) }
    ),

  getBranchState: (branchId: string) =>
    fetchApi<{ success: boolean; data: any }>(
      `/v1/config/branches/${encodeURIComponent(branchId)}/state`
    ),

  getFleetOverview: () =>
    fetchApi<{ success: boolean; data: any }>(`/v1/config/fleet/overview`),

  createRollout: (payload: { configVersionId: string; autoRollbackOnBreach?: boolean }) =>
    fetchApi<{ success: boolean; data: any }>(`/v1/config/rollouts`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  advanceRollout: (id: string) =>
    fetchApi<{ success: boolean; data: any }>(
      `/v1/config/rollouts/${encodeURIComponent(id)}/advance`,
      { method: 'POST' }
    ),

  rollbackRollout: (id: string, payload: { targetVersion: number; reason: string; incidentId?: string }) =>
    fetchApi<{ success: boolean; data: any }>(
      `/v1/config/rollouts/${encodeURIComponent(id)}/rollback`,
      { method: 'POST', body: JSON.stringify(payload) }
    ),

  recordBranchResult: (id: string, branchId: string, payload: { status: 'VERIFIED' | 'FAILED' | 'OFFLINE'; error?: string }) =>
    fetchApi<{ success: boolean; data: any }>(
      `/v1/config/rollouts/${encodeURIComponent(id)}/branches/${encodeURIComponent(branchId)}/result`,
      { method: 'POST', body: JSON.stringify(payload) }
    ),

  reconcileFleet: (payload?: { policy?: 'REPORT_ONLY' | 'AUTO_REMEDIATE' | 'REQUIRE_APPROVAL' }) =>
    fetchApi<{ success: boolean; data: any }>(`/v1/config/reconcile`, {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    }),

  reportActualState: (payload: {
    gatewayId: string;
    branchId: string;
    appliedVersion: number;
    appliedPackageSha256: string;
    gatewayVersion?: string;
    actualConfig: any;
  }) =>
    fetchApi<{ success: boolean; data: any }>(`/v1/config/actual/report`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  listGoldenTemplates: (category?: string) =>
    fetchApi<{ success: boolean; data: any[] }>(
      `/v1/config/golden-templates${category ? `?category=${encodeURIComponent(category)}` : ''}`
    ),

  getGoldenTemplate: (id: string) =>
    fetchApi<{ success: boolean; data: any }>(
      `/v1/config/golden-templates/${encodeURIComponent(id)}`
    ),

  createGoldenTemplate: (template: any) =>
    fetchApi<{ success: boolean; data: any }>(`/v1/config/golden-templates`, {
      method: 'POST',
      body: JSON.stringify(template),
    }),

  updateGoldenTemplate: (id: string, updates: any) =>
    fetchApi<{ success: boolean; data: any }>(
      `/v1/config/golden-templates/${encodeURIComponent(id)}`,
      { method: 'PUT', body: JSON.stringify(updates) }
    ),

  deleteGoldenTemplate: (id: string) =>
    fetchApi<{ success: boolean; deleted: boolean }>(
      `/v1/config/golden-templates/${encodeURIComponent(id)}`,
      { method: 'DELETE' }
    ),

  exportGoldenTemplates: () =>
    fetchApi<{ success: boolean; data: any[] }>(`/v1/config/golden-templates/export`),

  importGoldenTemplates: (templates: any[]) =>
    fetchApi<{ success: boolean; data: any }>(`/v1/config/golden-templates/import`, {
      method: 'POST',
      body: JSON.stringify({ templates }),
    }),

  previewGoldenTemplate: (payload: { templateId: string; targetCameras: any[] }) =>
    fetchApi<{ success: boolean; data: any }>(`/v1/config/golden-templates/preview`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  applyGoldenTemplate: (payload: { templateId: string; branchId: string; targetCameras: any[] }) =>
    fetchApi<{ success: boolean; data: any }>(`/v1/config/golden-templates/apply`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  convertGoldenTemplateToDraft: (
    id: string,
    payload: { branchId: string; versionNumber?: number; changeReason?: string }
  ) =>
    fetchApi<{ success: boolean; data: any }>(
      `/v1/config/golden-templates/${encodeURIComponent(id)}/draft`,
      { method: 'POST', body: JSON.stringify(payload) }
    ),

  getGoldenTemplateHistory: (branchId?: string) =>
    fetchApi<{ success: boolean; data: any[] }>(
      `/v1/config/golden-templates/history${branchId ? `?branchId=${encodeURIComponent(branchId)}` : ''}`
    ),
};

export interface CameraTamperMetrics {
  luminance: number;
  variance: number;
  laplacianVariance: number;
  edgeDensity: number;
  entropy: number;
  structuralSimilarity: number;
  sceneChangeScore: number;
  highlightFraction: number;
  shadowFraction: number;
  colorShift?: number;
}

export interface CameraTamperEvent {
  id: string;
  tenant_id: string;
  camera_id: string;
  camera_name?: string;
  branch_id?: string | null;
  tamper_type: 'blinding' | 'covering' | 'movement' | 'defocus' | 'spray';
  severity: 'P1' | 'P2' | 'P3' | 'P4';
  confidence: number;
  metrics: CameraTamperMetrics;
  status: 'detected' | 'acknowledged' | 'resolved' | 'false_positive';
  snapshot_url?: string | null;
  baseline_snapshot_url?: string | null;
  notes?: string | null;
  resolved_by?: string | null;
  resolved_at?: string | null;
  detected_at: string;
  created_at: string;
}

export interface CameraTamperBaseline {
  id: string;
  tenant_id: string;
  camera_id: string;
  baseline_luminance: number;
  baseline_variance: number;
  baseline_edge_density: number;
  baseline_entropy: number;
  baseline_laplacian_variance: number;
  reference_frame_hash?: string | null;
  reference_histogram: number[];
  calibrated_at: string;
  sample_frames_count: number;
  updated_at: string;
}

export interface CameraTamperConfig {
  id: string;
  tenant_id: string;
  camera_id: string;
  sensitivity: number;
  defocus_threshold: number;
  blinding_threshold: number;
  covering_threshold: number;
  movement_threshold: number;
  spray_threshold: number;
  debounce_frames: number;
  auto_recalibrate_hours: number;
  alert_on_defocus: boolean;
  alert_on_blinding: boolean;
  alert_on_covering: boolean;
  alert_on_movement: boolean;
  alert_on_spray: boolean;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface CameraTamperStats {
  totalEvents: number;
  activeEvents: number;
  byType: Record<'blinding' | 'covering' | 'movement' | 'defocus' | 'spray', number>;
  bySeverity: Record<'P1' | 'P2' | 'P3' | 'P4', number>;
  byStatus: Record<'detected' | 'acknowledged' | 'resolved' | 'false_positive', number>;
  camerasMonitored: number;
  camerasWithActiveTamper: number;
  lastEventAt?: string | null;
}

export const cameraTamperApi = {
  listEvents: (params?: {
    cameraId?: string;
    branchId?: string;
    tamperType?: string;
    severity?: string;
    status?: string;
    fromDate?: string;
    toDate?: string;
    limit?: number;
    offset?: number;
  }) => {
    const q = new URLSearchParams();
    if (params?.cameraId) q.set('cameraId', params.cameraId);
    if (params?.branchId) q.set('branchId', params.branchId);
    if (params?.tamperType) q.set('tamperType', params.tamperType);
    if (params?.severity) q.set('severity', params.severity);
    if (params?.status) q.set('status', params.status);
    if (params?.fromDate) q.set('fromDate', params.fromDate);
    if (params?.toDate) q.set('toDate', params.toDate);
    if (params?.limit) q.set('limit', String(params.limit));
    if (params?.offset) q.set('offset', String(params.offset));
    return fetchApi<{
      success: boolean;
      data: CameraTamperEvent[];
      pagination: { total: number; limit: number; offset: number };
    }>(`/v1/analytics/tamper/events?${q}`);
  },

  getEvent: (id: string) =>
    fetchApi<{ success: boolean; data: CameraTamperEvent }>(`/v1/analytics/tamper/events/${encodeURIComponent(id)}`),

  updateEventStatus: (id: string, status: 'acknowledged' | 'resolved' | 'false_positive', notes?: string) =>
    fetchApi<{ success: boolean; data: CameraTamperEvent }>(
      `/v1/analytics/tamper/events/${encodeURIComponent(id)}/status`,
      {
        method: 'PATCH',
        body: JSON.stringify({ status, notes }),
      }
    ),

  ingestEvent: (data: Partial<CameraTamperEvent> & { cameraId: string; tamperType: string; confidence: number; metrics: any }) =>
    fetchApi<{ success: boolean; data: CameraTamperEvent }>('/v1/analytics/tamper/events', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  analyzeFrame: (payload: {
    cameraId: string;
    branchId?: string;
    frameBase64?: string;
    width?: number;
    height?: number;
    channels?: number;
    bypassDebounce?: boolean;
    snapshotUrl?: string;
  }) =>
    fetchApi<{
      success: boolean;
      data: {
        evaluation: {
          isTampered: boolean;
          tamperType: string | null;
          severity: string | null;
          confidence: number;
          metrics: CameraTamperMetrics;
          reasons: string[];
          requiresAlert: boolean;
        };
        confirmed: boolean;
        consecutiveFrames: number;
        savedEvent: CameraTamperEvent | null;
      };
    }>('/v1/analytics/tamper/analyze-frame', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getBaseline: (cameraId: string) =>
    fetchApi<{ success: boolean; data: CameraTamperBaseline }>(
      `/v1/analytics/tamper/baselines/${encodeURIComponent(cameraId)}`
    ),

  recalibrateBaseline: (cameraId: string, payload?: { frameBase64?: string; width?: number; height?: number; channels?: number }) =>
    fetchApi<{ success: boolean; data: CameraTamperBaseline }>(
      `/v1/analytics/tamper/baselines/${encodeURIComponent(cameraId)}/recalibrate`,
      {
        method: 'POST',
        body: JSON.stringify(payload || {}),
      }
    ),

  getConfig: (cameraId: string) =>
    fetchApi<{ success: boolean; data: CameraTamperConfig }>(
      `/v1/analytics/tamper/config/${encodeURIComponent(cameraId)}`
    ),

  updateConfig: (cameraId: string, updates: Partial<CameraTamperConfig>) =>
    fetchApi<{ success: boolean; data: CameraTamperConfig }>(
      `/v1/analytics/tamper/config/${encodeURIComponent(cameraId)}`,
      {
        method: 'PUT',
        body: JSON.stringify(updates),
      }
    ),

  getStats: (cameraId?: string) => {
    const q = cameraId ? `?cameraId=${encodeURIComponent(cameraId)}` : '';
    return fetchApi<{ success: boolean; data: CameraTamperStats }>(`/v1/analytics/tamper/stats${q}`);
  },
};

export interface CameraObstructionTileMetric {
  row: number;
  col: number;
  x: number;
  y: number;
  width: number;
  height: number;
  luminance: number;
  variance: number;
  edgeScore: number;
  isObstructed: boolean;
  obstructionReason?: string;
}

export interface CameraObstructionTileAnalysis {
  gridRows: number;
  gridCols: number;
  totalTiles: number;
  obstructedTiles: number;
  obstructionPercent: number;
  tiles: CameraObstructionTileMetric[];
  obstructedBoundingBox?: { x: number; y: number; width: number; height: number } | null;
}

export interface CameraObstructionMetrics {
  luminance: number;
  variance: number;
  edgeDensity: number;
  entropy: number;
  laplacianVariance: number;
  shadowFraction: number;
  highlightFraction: number;
  obstructionPercent: number;
  tileAnalysis: CameraObstructionTileAnalysis;
  histogram?: number[];
}

export interface CameraObstructionEvent {
  id: string;
  tenant_id: string;
  camera_id: string;
  branch_id?: string | null;
  obstruction_type: 'dark_frame' | 'lens_covering' | 'variance_loss' | 'partial_obstruction' | 'glare_whiteout';
  severity: 'P1' | 'P2' | 'P3' | 'P4';
  confidence: number;
  obstruction_percent: number;
  metrics: CameraObstructionMetrics;
  tile_analysis: CameraObstructionTileAnalysis;
  status: 'detected' | 'acknowledged' | 'resolved' | 'false_positive';
  snapshot_url?: string | null;
  baseline_snapshot_url?: string | null;
  notes?: string | null;
  resolved_by?: string | null;
  resolved_at?: string | null;
  detected_at: string;
  created_at: string;
}

export interface CameraObstructionBaseline {
  id: string;
  tenant_id: string;
  camera_id: string;
  baseline_luminance: number;
  baseline_variance: number;
  baseline_edge_density: number;
  baseline_entropy: number;
  baseline_laplacian_variance: number;
  tile_baselines: Array<{ row: number; col: number; luminance: number; variance: number }>;
  reference_histogram: number[];
  reference_frame_hash?: string | null;
  calibrated_at: string;
  sample_frames_count: number;
  updated_at: string;
}

export interface CameraObstructionConfig {
  id: string;
  tenant_id: string;
  camera_id: string;
  sensitivity: number;
  darkness_threshold: number;
  variance_floor: number;
  obstruction_percent_threshold: number;
  partial_threshold: number;
  debounce_frames: number;
  auto_recalibrate_hours: number;
  alert_on_dark_frame: boolean;
  alert_on_covering: boolean;
  alert_on_variance_loss: boolean;
  alert_on_partial: boolean;
  alert_on_glare: boolean;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface CameraObstructionStats {
  totalEvents: number;
  activeEvents: number;
  darkFrameCount: number;
  lensCoveringCount: number;
  varianceLossCount: number;
  partialObstructionCount: number;
  glareWhiteoutCount: number;
  p1Count: number;
  p2Count: number;
  p3Count: number;
  p4Count: number;
  acknowledgedCount: number;
  resolvedCount: number;
  falsePositiveCount: number;
  camerasMonitored: number;
  camerasAtRisk: number;
  lastEventAt?: string | null;
}

export const cameraObstructionApi = {
  listEvents: (params?: {
    cameraId?: string;
    branchId?: string;
    obstructionType?: string;
    severity?: string;
    status?: string;
    fromDate?: string;
    toDate?: string;
    limit?: number;
    offset?: number;
  }) => {
    const q = new URLSearchParams();
    if (params?.cameraId) q.set('cameraId', params.cameraId);
    if (params?.branchId) q.set('branchId', params.branchId);
    if (params?.obstructionType) q.set('obstructionType', params.obstructionType);
    if (params?.severity) q.set('severity', params.severity);
    if (params?.status) q.set('status', params.status);
    if (params?.fromDate) q.set('fromDate', params.fromDate);
    if (params?.toDate) q.set('toDate', params.toDate);
    if (params?.limit) q.set('limit', String(params.limit));
    if (params?.offset) q.set('offset', String(params.offset));
    return fetchApi<{
      success: boolean;
      data: CameraObstructionEvent[];
      pagination: { total: number; limit: number; offset: number };
    }>(`/v1/analytics/obstruction/events?${q}`);
  },

  getEvent: (id: string) =>
    fetchApi<{ success: boolean; data: CameraObstructionEvent }>(`/v1/analytics/obstruction/events/${encodeURIComponent(id)}`),

  updateEventStatus: (id: string, status: 'acknowledged' | 'resolved' | 'false_positive', notes?: string) =>
    fetchApi<{ success: boolean; data: CameraObstructionEvent }>(
      `/v1/analytics/obstruction/events/${encodeURIComponent(id)}/status`,
      {
        method: 'PATCH',
        body: JSON.stringify({ status, notes }),
      }
    ),

  ingestEvent: (data: Partial<CameraObstructionEvent> & {
    cameraId: string;
    obstructionType: string;
    severity: string;
    confidence: number;
  }) =>
    fetchApi<{ success: boolean; data: CameraObstructionEvent }>('/v1/analytics/obstruction/events', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  analyzeFrame: (payload: {
    cameraId: string;
    branchId?: string;
    frameBase64?: string;
    width?: number;
    height?: number;
    channels?: number;
    bypassDebounce?: boolean;
    snapshotUrl?: string;
  }) =>
    fetchApi<{
      success: boolean;
      data: {
        evaluation: {
          isObstructed: boolean;
          obstructionType: string | null;
          severity: string | null;
          confidence: number;
          metrics: CameraObstructionMetrics;
          reasons: string[];
          requiresAlert: boolean;
        };
        confirmed: boolean;
        consecutiveFrames: number;
        savedEvent: CameraObstructionEvent | null;
      };
    }>('/v1/analytics/obstruction/analyze-frame', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getBaseline: (cameraId: string) =>
    fetchApi<{ success: boolean; data: CameraObstructionBaseline }>(
      `/v1/analytics/obstruction/baselines/${encodeURIComponent(cameraId)}`
    ),

  recalibrateBaseline: (cameraId: string, payload?: { frameBase64?: string; width?: number; height?: number; channels?: number }) =>
    fetchApi<{ success: boolean; data: CameraObstructionBaseline }>(
      `/v1/analytics/obstruction/baselines/${encodeURIComponent(cameraId)}/recalibrate`,
      {
        method: 'POST',
        body: JSON.stringify(payload || {}),
      }
    ),

  getConfig: (cameraId: string) =>
    fetchApi<{ success: boolean; data: CameraObstructionConfig }>(
      `/v1/analytics/obstruction/config/${encodeURIComponent(cameraId)}`
    ),

  updateConfig: (cameraId: string, updates: Partial<CameraObstructionConfig>) =>
    fetchApi<{ success: boolean; data: CameraObstructionConfig }>(
      `/v1/analytics/obstruction/config/${encodeURIComponent(cameraId)}`,
      {
        method: 'PUT',
        body: JSON.stringify(updates),
      }
    ),

  getStats: (cameraId?: string) => {
    const q = cameraId ? `?cameraId=${encodeURIComponent(cameraId)}` : '';
    return fetchApi<{ success: boolean; data: CameraObstructionStats }>(`/v1/analytics/obstruction/stats${q}`);
  },
};

// ============================================================================
// AUTOMATIC NUMBER PLATE RECOGNITION (ANPR) API & TYPES
// ============================================================================

export interface AnprBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AnprCharacterReading {
  char: string;
  confidence: number;
  bbox?: AnprBoundingBox;
}

export interface AnprPlateReading {
  plateNumber: string;
  normalizedPlate: string;
  confidence: number;
  countryCode: string;
  regionCode?: string;
  plateType: 'standard' | 'commercial' | 'electric' | 'government' | 'diplomatic' | 'military' | 'temporary';
  characters: AnprCharacterReading[];
  plateBbox: AnprBoundingBox;
  isValidSyntax: boolean;
  syntaxFormatName?: string;
  correctionsApplied: number;
  contrastScore?: number;
}

export interface AnprVehicleAttributes {
  category: 'car' | 'motorcycle' | 'bus' | 'truck' | 'van' | 'auto_rickshaw' | 'other';
  confidence: number;
  color?: string;
  make?: string;
  model?: string;
  bbox?: AnprBoundingBox;
}

export interface AnprWatchlistMatchDetail {
  matched: boolean;
  watchlistId?: string;
  watchlistName?: string;
  listType?: 'alert' | 'stolen' | 'wanted' | 'vip' | 'staff' | 'blacklist';
  plateId?: string;
  targetPlate?: string;
  reason?: string;
  severity?: 'P1' | 'P2' | 'P3' | 'P4' | 'P5';
  alertAuthorities?: boolean;
  matchType?: 'exact' | 'fuzzy' | 'wildcard';
  editDistance?: number;
  similarity?: number;
}

export interface AnprEvaluationResult {
  plate: AnprPlateReading;
  vehicle?: AnprVehicleAttributes;
  watchlistMatch: AnprWatchlistMatchDetail;
  processingTimeMs: number;
  requiresAlert: boolean;
  observedAt: string;
}

export interface AnprEventItem {
  id: string;
  tenant_id: string;
  camera_id: string;
  camera_name?: string;
  branch_id?: string | null;
  watchlist_id?: string | null;
  watchlist_name?: string | null;
  plate_id?: string | null;
  plate_number: string;
  normalized_plate: string;
  plate_confidence: number;
  country_code: string;
  region_code?: string;
  plate_type: string;
  vehicle_type?: string;
  vehicle_color?: string;
  vehicle_make?: string;
  vehicle_model?: string;
  vehicle_bbox?: AnprBoundingBox;
  plate_bbox: AnprBoundingBox;
  ocr_details?: {
    characters: AnprCharacterReading[];
    correctionsApplied?: number;
    syntaxFormat?: string;
  };
  snapshot_reference?: string;
  plate_crop_url?: string;
  entry_direction: 'entry' | 'exit' | 'unknown';
  review_status: 'pending' | 'confirmed' | 'false_positive' | 'dismissed';
  reviewed_by?: string;
  reviewed_at?: string;
  review_notes?: string;
  processing_time_ms: number;
  occurred_at: string;
  created_at: string;
}

export interface AnprVehicleSessionItem {
  id: string;
  tenant_id: string;
  plate_number: string;
  normalized_plate: string;
  entry_event_id?: string;
  exit_event_id?: string;
  entry_camera_id?: string;
  exit_camera_id?: string;
  entry_camera_name?: string;
  exit_camera_name?: string;
  vehicle_type?: string;
  vehicle_color?: string;
  entry_at: string;
  exit_at?: string;
  duration_seconds?: number;
  max_dwell_minutes: number;
  overstay_alerted: boolean;
  status: 'inside' | 'exited' | 'overstay' | 'unknown';
  created_at: string;
  updated_at: string;
}

export interface AnprWatchlistRecordItem {
  id: string;
  tenant_id: string;
  name: string;
  description?: string;
  list_type: 'alert' | 'stolen' | 'wanted' | 'vip' | 'staff' | 'blacklist';
  enabled: boolean;
  alert_on_match: boolean;
  alert_severity: 'P1' | 'P2' | 'P3' | 'P4' | 'P5';
  alert_authorities: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface AnprWatchlistPlateItem {
  id: string;
  tenant_id: string;
  watchlist_id: string;
  plate_number: string;
  normalized_plate: string;
  country_code: string;
  region_code?: string;
  vehicle_make?: string;
  vehicle_model?: string;
  vehicle_color?: string;
  vehicle_type?: string;
  owner_name?: string;
  reason: string;
  notes?: string;
  fuzzy_match: boolean;
  max_levenshtein_distance: number;
  priority: 'critical' | 'high' | 'medium' | 'low';
  added_by: string;
  added_at: string;
  expires_at?: string;
  last_matched_at?: string;
  match_count: number;
}

export interface AnprStatsData {
  totalReads: number;
  uniquePlates: number;
  watchlistHits: number;
  averageConfidence: number;
  pendingReviews: number;
  activeParkedVehicles: number;
  overstayAlerts: number;
  readsByHour: Array<{ hour: string; count: number }>;
  vehicleTypeBreakdown: Record<string, number>;
  watchlistTypeBreakdown: Record<string, number>;
}

export const anprApi = {
  evaluatePlate: (data: {
    rawPlateText: string;
    countryPreference?: string;
    plateConfidence?: number;
    plateBbox?: AnprBoundingBox;
    vehicle?: AnprVehicleAttributes;
  }) => fetchApi<{ success: boolean; data: AnprEvaluationResult }>('/v1/analytics/anpr/recognize', {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  ingestEvent: (data: {
    cameraId: string;
    cameraName?: string;
    branchId?: string | null;
    rawPlateText: string;
    plateConfidence?: number;
    countryPreference?: string;
    entryDirection?: 'entry' | 'exit' | 'unknown';
    plateBbox?: AnprBoundingBox;
    vehicle?: AnprVehicleAttributes;
    snapshotReference?: string;
    plateCropUrl?: string;
    occurredAt?: string;
  }) => fetchApi<{ success: boolean; data: { evaluation: AnprEvaluationResult; event: AnprEventItem; session: AnprVehicleSessionItem } }>('/v1/analytics/anpr/events', {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  listEvents: (filters?: {
    cameraId?: string;
    branchId?: string;
    plateNumber?: string;
    watchlistId?: string;
    entryDirection?: 'entry' | 'exit' | 'unknown';
    reviewStatus?: 'pending' | 'confirmed' | 'false_positive' | 'dismissed';
    hasWatchlistMatch?: boolean;
    fromDate?: string;
    toDate?: string;
    limit?: number;
    offset?: number;
  }) => {
    const params = new URLSearchParams();
    if (filters?.cameraId) params.set('cameraId', filters.cameraId);
    if (filters?.branchId) params.set('branchId', filters.branchId);
    if (filters?.plateNumber) params.set('plateNumber', filters.plateNumber);
    if (filters?.watchlistId) params.set('watchlistId', filters.watchlistId);
    if (filters?.entryDirection) params.set('entryDirection', filters.entryDirection);
    if (filters?.reviewStatus) params.set('reviewStatus', filters.reviewStatus);
    if (filters?.hasWatchlistMatch !== undefined) params.set('hasWatchlistMatch', String(filters.hasWatchlistMatch));
    if (filters?.fromDate) params.set('fromDate', filters.fromDate);
    if (filters?.toDate) params.set('toDate', filters.toDate);
    if (filters?.limit) params.set('limit', String(filters.limit));
    if (filters?.offset) params.set('offset', String(filters.offset));
    return fetchApi<{ success: boolean; data: AnprEventItem[]; pagination: { total: number; limit: number; offset: number } }>(
      `/v1/analytics/anpr/events?${params}`
    );
  },

  getEvent: (id: string) =>
    fetchApi<{ success: boolean; data: AnprEventItem }>(`/v1/analytics/anpr/events/${encodeURIComponent(id)}`),

  reviewEvent: (id: string, decision: { status: 'confirmed' | 'false_positive' | 'dismissed'; notes?: string }) =>
    fetchApi<{ success: boolean; data: AnprEventItem }>(`/v1/analytics/anpr/events/${encodeURIComponent(id)}/reviews`, {
      method: 'POST',
      body: JSON.stringify(decision),
    }),

  listSessions: (filters?: {
    plateNumber?: string;
    status?: 'inside' | 'exited' | 'overstay' | 'unknown';
    fromDate?: string;
    toDate?: string;
    limit?: number;
    offset?: number;
  }) => {
    const params = new URLSearchParams();
    if (filters?.plateNumber) params.set('plateNumber', filters.plateNumber);
    if (filters?.status) params.set('status', filters.status);
    if (filters?.fromDate) params.set('fromDate', filters.fromDate);
    if (filters?.toDate) params.set('toDate', filters.toDate);
    if (filters?.limit) params.set('limit', String(filters.limit));
    if (filters?.offset) params.set('offset', String(filters.offset));
    return fetchApi<{ success: boolean; data: AnprVehicleSessionItem[]; pagination: { total: number; limit: number; offset: number } }>(
      `/v1/analytics/anpr/sessions?${params}`
    );
  },

  getVehicleSessions: (plateNumber: string) =>
    fetchApi<{ success: boolean; data: AnprVehicleSessionItem[] }>(
      `/v1/analytics/anpr/sessions/${encodeURIComponent(plateNumber)}`
    ),

  listWatchlists: () =>
    fetchApi<{ success: boolean; data: AnprWatchlistRecordItem[] }>('/v1/analytics/anpr/watchlists'),

  createWatchlist: (data: {
    name: string;
    description?: string;
    listType: 'alert' | 'stolen' | 'wanted' | 'vip' | 'staff' | 'blacklist';
    enabled?: boolean;
    alertOnMatch?: boolean;
    alertSeverity?: 'P1' | 'P2' | 'P3' | 'P4' | 'P5';
    alertAuthorities?: boolean;
  }) => fetchApi<{ success: boolean; data: AnprWatchlistRecordItem }>('/v1/analytics/anpr/watchlists', {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  updateWatchlist: (id: string, data: Partial<AnprWatchlistRecordItem>) =>
    fetchApi<{ success: boolean; data: AnprWatchlistRecordItem }>(`/v1/analytics/anpr/watchlists/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteWatchlist: (id: string) =>
    fetchApi<{ success: boolean }>(`/v1/analytics/anpr/watchlists/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),

  listWatchlistPlates: (watchlistId: string) =>
    fetchApi<{ success: boolean; data: AnprWatchlistPlateItem[] }>(
      `/v1/analytics/anpr/watchlists/${encodeURIComponent(watchlistId)}/plates`
    ),

  addWatchlistPlate: (watchlistId: string, data: {
    plateNumber: string;
    countryCode?: string;
    regionCode?: string;
    vehicleMake?: string;
    vehicleModel?: string;
    vehicleColor?: string;
    vehicleType?: 'car' | 'motorcycle' | 'bus' | 'truck' | 'van' | 'auto_rickshaw' | 'other';
    ownerName?: string;
    reason: string;
    notes?: string;
    fuzzyMatch?: boolean;
    maxLevenshteinDistance?: number;
    priority?: 'critical' | 'high' | 'medium' | 'low';
    expiresAt?: string;
  }) => fetchApi<{ success: boolean; data: AnprWatchlistPlateItem }>(
    `/v1/analytics/anpr/watchlists/${encodeURIComponent(watchlistId)}/plates`,
    {
      method: 'POST',
      body: JSON.stringify(data),
    }
  ),

  removeWatchlistPlate: (watchlistId: string, plateId: string) =>
    fetchApi<{ success: boolean }>(
      `/v1/analytics/anpr/watchlists/${encodeURIComponent(watchlistId)}/plates/${encodeURIComponent(plateId)}`,
      {
        method: 'DELETE',
      }
    ),

  bulkImportPlates: (watchlistId: string, plates: any[]) =>
    fetchApi<{ success: boolean; importedCount: number; data: AnprWatchlistPlateItem[] }>(
      `/v1/analytics/anpr/watchlists/${encodeURIComponent(watchlistId)}/plates/bulk`,
      {
        method: 'POST',
        body: JSON.stringify({ plates }),
      }
    ),

  getStats: (cameraId?: string) => {
    const q = cameraId ? `?cameraId=${encodeURIComponent(cameraId)}` : '';
    return fetchApi<{ success: boolean; data: AnprStatsData }>(`/v1/analytics/anpr/stats${q}`);
  },
};

export interface FallEvent {
  id: string;
  tenant_id: string;
  camera_id: string;
  track_id: string;
  person_category: 'worker' | 'elderly' | 'general';
  fall_type: 'forward' | 'backward' | 'sideways' | 'slump' | 'scaffold_drop' | 'unknown';
  confidence: number;
  severity: 'P1' | 'P2' | 'P3';
  impact_speed: number;
  aspect_ratio_peak: number;
  torso_angle_degrees: number | null;
  motionless_duration_seconds: number;
  recovery_detected: boolean;
  recovery_time_seconds: number | null;
  bounding_box: { x: number; y: number; width: number; height: number };
  pose_keypoints: Record<string, { x: number; y: number; confidence: number; z?: number }>;
  dynamics_telemetry: {
    kinematics: {
      currentAspectRatio: number;
      peakAspectRatio: number;
      aspectRatioVelocity: number;
      verticalVelocity: number;
      verticalAcceleration: number;
      torsoAngleDegrees: number | null;
      headToHipDistance: number | null;
      floorProximityScore: number;
      motionEnergy: number;
    };
    stateHistory: string[];
    isIntentionalSuppressed?: boolean;
    suppressionReason?: string;
  };
  snapshot_reference?: string | null;
  review_status: 'pending' | 'confirmed' | 'false_positive' | 'escalated';
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  review_notes?: string | null;
  occurred_at: string;
  created_at: string;
}

export interface FallCameraConfig {
  camera_id: string;
  tenant_id: string;
  enabled: boolean;
  profile: 'worker' | 'elderly' | 'general';
  sensitivity: number;
  min_confidence: number;
  aspect_ratio_threshold: number;
  velocity_threshold: number;
  torso_angle_threshold: number;
  motionless_delay_seconds: number;
  recovery_timeout_seconds: number;
  alert_severity: 'P1' | 'P2' | 'P3';
  created_at?: string;
  updated_at?: string;
}

export interface FallStats {
  totalFalls: number;
  workerFalls: number;
  elderlyFalls: number;
  unrecoveredEmergencyCount: number;
  recoveredCount: number;
  pendingReviewCount: number;
  falsePositiveCount: number;
  avgConfidence: number;
  p1Count: number;
}

export const fallApi = {
  listEvents: (filters?: {
    cameraId?: string;
    personCategory?: 'worker' | 'elderly' | 'general';
    severity?: 'P1' | 'P2' | 'P3';
    reviewStatus?: 'pending' | 'confirmed' | 'false_positive' | 'escalated';
    fromDate?: string;
    toDate?: string;
    limit?: number;
    offset?: number;
  }) => {
    const params = new URLSearchParams();
    if (filters?.cameraId) params.set('cameraId', filters.cameraId);
    if (filters?.personCategory) params.set('personCategory', filters.personCategory);
    if (filters?.severity) params.set('severity', filters.severity);
    if (filters?.reviewStatus) params.set('reviewStatus', filters.reviewStatus);
    if (filters?.fromDate) params.set('fromDate', filters.fromDate);
    if (filters?.toDate) params.set('toDate', filters.toDate);
    if (filters?.limit) params.set('limit', String(filters.limit));
    if (filters?.offset) params.set('offset', String(filters.offset));
    return fetchApi<{ success: boolean; data: FallEvent[]; pagination: { total: number; limit: number; offset: number } }>(
      `/v1/analytics/fall/events?${params}`
    );
  },

  getEvent: (eventId: string) =>
    fetchApi<{ success: boolean; data: FallEvent }>(`/v1/analytics/fall/events/${encodeURIComponent(eventId)}`),

  reviewEvent: (
    eventId: string,
    data: { reviewStatus: 'confirmed' | 'false_positive' | 'escalated'; reviewNotes?: string }
  ) =>
    fetchApi<{ success: boolean; data: FallEvent }>(
      `/v1/analytics/fall/events/${encodeURIComponent(eventId)}/review`,
      { method: 'POST', body: JSON.stringify(data) }
    ),

  getCameraConfig: (cameraId: string) =>
    fetchApi<{ success: boolean; data: FallCameraConfig }>(
      `/v1/analytics/fall/config/${encodeURIComponent(cameraId)}`
    ),

  updateCameraConfig: (cameraId: string, updates: Partial<FallCameraConfig>) =>
    fetchApi<{ success: boolean; data: FallCameraConfig }>(
      `/v1/analytics/fall/config/${encodeURIComponent(cameraId)}`,
      { method: 'PUT', body: JSON.stringify(updates) }
    ),

  getStats: () =>
    fetchApi<{ success: boolean; data: FallStats }>('/v1/analytics/fall/stats'),

  detect: (payload: {
    cameraId: string;
    timestamp?: number;
    activeTracks: Array<{
      trackId: string;
      category?: 'worker' | 'elderly' | 'general';
      observations: Array<{
        timestamp: number;
        boundingBox: { x: number; y: number; width: number; height: number };
        keypoints?: Record<string, { x: number; y: number; confidence: number; z?: number }>;
      }>;
    }>;
    snapshotReference?: string;
  }) =>
    fetchApi<{
      success: boolean;
      data: {
        results: any[];
        savedEvents: FallEvent[];
      };
    }>('/v1/analytics/fall/detect', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
};

// ============================================================================
// Abandoned & Unattended Object Detection (analytics.abandoned_object)
// ============================================================================

export interface AbandonedObjectZone {
  id: string;
  tenant_id: string;
  branch_id?: string | null;
  camera_id?: string | null;
  zone_name: string;
  zone_type: 'sterile_zone' | 'atm_vestibule' | 'cash_counter' | 'vault_perimeter' | 'emergency_exit' | 'customer_lobby' | 'hallway' | 'baggage_area';
  polygon: Array<{ x: number; y: number }>;
  sensitivity: 'low' | 'medium' | 'high' | 'critical';
  unattended_threshold_seconds: number;
  abandoned_threshold_seconds: number;
  min_blob_area_pixels: number;
  max_blob_area_pixels: number;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface AbandonedObjectEvent {
  id: string;
  tenant_id: string;
  camera_id: string;
  zone_id?: string | null;
  branch_id?: string | null;
  event_type: 'unattended_object' | 'abandoned_object' | 'removed_object' | 'suspicious_package';
  object_type: 'backpack' | 'suitcase' | 'box' | 'parcel' | 'handbag' | 'generic_blob' | 'duffel_bag';
  severity: 'P1' | 'P2' | 'P3' | 'P4';
  confidence: number;
  bounding_box: { x: number; y: number; width: number; height: number };
  dwell_time_seconds: number;
  owner_track_id?: string | null;
  owner_distance_pixels?: number | null;
  status: 'detected' | 'investigating' | 'cleared' | 'false_positive' | 'escalated';
  snapshot_url?: string | null;
  thermal_score?: number | null;
  notes?: string | null;
  resolved_by?: string | null;
  resolved_at?: string | null;
  first_seen_at: string;
  detected_at: string;
  created_at: string;
}

export interface AbandonedObjectConfig {
  id: string;
  tenant_id: string;
  camera_id: string;
  stationary_pixel_threshold: number;
  default_unattended_threshold_sec: number;
  default_abandoned_threshold_sec: number;
  owner_proximity_threshold_px: number;
  debounce_frames: number;
  alert_on_sterile_zone_entry: boolean;
  alert_on_exit_corridor_obstruction: boolean;
  thermal_verification_enabled: boolean;
  updated_at: string;
}

export interface AbandonedObjectStats {
  totalActive: number;
  criticalP1Count: number;
  highP2Count: number;
  avgDwellTimeSeconds: number;
  totalCleared: number;
  totalEscalated: number;
  zonesMonitored: number;
  lastEventAt?: string | null;
}

export const abandonedObjectApi = {
  listEvents: (params?: {
    cameraId?: string;
    branchId?: string;
    zoneId?: string;
    eventType?: string;
    severity?: string;
    status?: string;
    fromDate?: string;
    toDate?: string;
    limit?: number;
    offset?: number;
  }) => {
    const q = new URLSearchParams();
    if (params?.cameraId) q.set('cameraId', params.cameraId);
    if (params?.branchId) q.set('branchId', params.branchId);
    if (params?.zoneId) q.set('zoneId', params.zoneId);
    if (params?.eventType) q.set('eventType', params.eventType);
    if (params?.severity) q.set('severity', params.severity);
    if (params?.status) q.set('status', params.status);
    if (params?.fromDate) q.set('fromDate', params.fromDate);
    if (params?.toDate) q.set('toDate', params.toDate);
    if (params?.limit) q.set('limit', String(params.limit));
    if (params?.offset) q.set('offset', String(params.offset));
    return fetchApi<{
      success: boolean;
      data: AbandonedObjectEvent[];
      pagination: { total: number; limit: number; offset: number };
    }>(`/v1/analytics/abandoned-objects/events?${q}`);
  },

  getEvent: (id: string) =>
    fetchApi<{ success: boolean; data: AbandonedObjectEvent }>(
      `/v1/analytics/abandoned-objects/events/${encodeURIComponent(id)}`
    ),

  updateEventStatus: (
    id: string,
    status: 'detected' | 'investigating' | 'cleared' | 'false_positive' | 'escalated',
    notes?: string
  ) =>
    fetchApi<{ success: boolean; data: AbandonedObjectEvent }>(
      `/v1/analytics/abandoned-objects/events/${encodeURIComponent(id)}/status`,
      {
        method: 'PATCH',
        body: JSON.stringify({ status, notes }),
      }
    ),

  ingestEvent: (data: Partial<AbandonedObjectEvent> & {
    cameraId: string;
    eventType: string;
    objectType: string;
    severity: string;
    confidence: number;
    boundingBox: { x: number; y: number; width: number; height: number };
    dwellTimeSeconds: number;
  }) =>
    fetchApi<{ success: boolean; data: AbandonedObjectEvent }>(
      '/v1/analytics/abandoned-objects/events',
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    ),

  listZones: (params?: { branchId?: string; cameraId?: string; zoneType?: string; enabledOnly?: boolean }) => {
    const q = new URLSearchParams();
    if (params?.branchId) q.set('branchId', params.branchId);
    if (params?.cameraId) q.set('cameraId', params.cameraId);
    if (params?.zoneType) q.set('zoneType', params.zoneType);
    if (params?.enabledOnly !== undefined) q.set('enabledOnly', String(params.enabledOnly));
    return fetchApi<{ success: boolean; data: AbandonedObjectZone[] }>(
      `/v1/analytics/abandoned-objects/zones?${q}`
    );
  },

  getZone: (id: string) =>
    fetchApi<{ success: boolean; data: AbandonedObjectZone }>(
      `/v1/analytics/abandoned-objects/zones/${encodeURIComponent(id)}`
    ),

  createZone: (data: {
    zoneName: string;
    zoneType: string;
    polygon: Array<{ x: number; y: number }>;
    sensitivity?: 'low' | 'medium' | 'high' | 'critical';
    unattendedThresholdSeconds?: number;
    abandonedThresholdSeconds?: number;
    minBlobAreaPixels?: number;
    maxBlobAreaPixels?: number;
    enabled?: boolean;
    branchId?: string;
    cameraId?: string;
  }) =>
    fetchApi<{ success: boolean; data: AbandonedObjectZone }>(
      '/v1/analytics/abandoned-objects/zones',
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    ),

  updateZone: (id: string, updates: Partial<{
    zoneName: string;
    zoneType: string;
    polygon: Array<{ x: number; y: number }>;
    sensitivity: 'low' | 'medium' | 'high' | 'critical';
    unattendedThresholdSeconds: number;
    abandonedThresholdSeconds: number;
    minBlobAreaPixels: number;
    maxBlobAreaPixels: number;
    enabled: boolean;
  }>) =>
    fetchApi<{ success: boolean; data: AbandonedObjectZone }>(
      `/v1/analytics/abandoned-objects/zones/${encodeURIComponent(id)}`,
      {
        method: 'PUT',
        body: JSON.stringify(updates),
      }
    ),

  deleteZone: (id: string) =>
    fetchApi<{ success: boolean; message: string }>(
      `/v1/analytics/abandoned-objects/zones/${encodeURIComponent(id)}`,
      { method: 'DELETE' }
    ),

  getStats: (cameraId?: string) => {
    const q = cameraId ? `?cameraId=${encodeURIComponent(cameraId)}` : '';
    return fetchApi<{ success: boolean; data: AbandonedObjectStats }>(
      `/v1/analytics/abandoned-objects/stats${q}`
    );
  },

  getConfig: (cameraId: string) =>
    fetchApi<{ success: boolean; data: AbandonedObjectConfig }>(
      `/v1/analytics/abandoned-objects/config/${encodeURIComponent(cameraId)}`
    ),

  updateConfig: (cameraId: string, updates: Partial<AbandonedObjectConfig>) =>
    fetchApi<{ success: boolean; data: AbandonedObjectConfig }>(
      `/v1/analytics/abandoned-objects/config/${encodeURIComponent(cameraId)}`,
      {
        method: 'PUT',
        body: JSON.stringify(updates),
      }
    ),

  analyzeFrame: (payload: {
    cameraId: string;
    branchId?: string;
    frameBase64?: string;
    width?: number;
    height?: number;
    channels?: number;
    candidateBlobs?: Array<{ x: number; y: number; width: number; height: number }>;
    persons?: Array<{ trackId: string; boundingBox: { x: number; y: number; width: number; height: number }; confidence: number }>;
    saveToDb?: boolean;
  }) =>
    fetchApi<{
      success: boolean;
      data: {
        analysis: {
          isUnattendedOrAbandoned: boolean;
          blobs: Array<{
            blobId: string;
            objectType: string;
            eventType: string;
            severity: string;
            confidence: number;
            boundingBox: { x: number; y: number; width: number; height: number };
            dwellTimeSeconds: number;
            zoneName?: string;
            zoneType?: string;
            ownerTrackId?: string | null;
            ownerDistancePixels?: number | null;
            requiresAlert: boolean;
          }>;
          summary: {
            totalStaticBlobs: number;
            activeAlerts: number;
            highestSeverity?: string | null;
          };
        };
        savedEvents: AbandonedObjectEvent[];
      };
    }>('/v1/analytics/abandoned-objects/analyze-frame', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
};

export const audioMonitoringApi = {
  getChannels: () => fetchApi<{ success: boolean; data: any[]; count: number }>('/v1/audio-monitoring/channels'),
  getChannel: (cameraId: string) => fetchApi<{ success: boolean; data: any }>(`/v1/audio-monitoring/channels/${encodeURIComponent(cameraId)}`),
  updateConfig: (cameraId: string, updates: any) => fetchApi<{ success: boolean; data: any }>(`/v1/audio-monitoring/channels/${encodeURIComponent(cameraId)}/config`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  }),
  decodeAndMeter: (cameraId: string, payloadBase64: string, codec?: string) => fetchApi<{ success: boolean; data: any; alerts: any[] }>(`/v1/audio-monitoring/channels/${encodeURIComponent(cameraId)}/decode-and-meter`, {
    method: 'POST',
    body: JSON.stringify({ payloadBase64, codec }),
  }),
  ingestTelemetry: (cameraId: string, telemetry: any) => fetchApi<{ success: boolean; alerts: any[] }>(`/v1/audio-monitoring/channels/${encodeURIComponent(cameraId)}/telemetry`, {
    method: 'POST',
    body: JSON.stringify(telemetry),
  }),
  getHistory: (cameraId: string, limit: number = 60) => fetchApi<{ success: boolean; data: any[]; count: number }>(`/v1/audio-monitoring/channels/${encodeURIComponent(cameraId)}/metrics/history?limit=${limit}`),
  getAlerts: (filters?: { cameraId?: string; status?: string; alertType?: string; severity?: string; limit?: number; offset?: number }) => {
    const params = new URLSearchParams();
    if (filters?.cameraId) params.append('cameraId', filters.cameraId);
    if (filters?.status) params.append('status', filters.status);
    if (filters?.alertType) params.append('alertType', filters.alertType);
    if (filters?.severity) params.append('severity', filters.severity);
    if (filters?.limit) params.append('limit', String(filters.limit));
    if (filters?.offset) params.append('offset', String(filters.offset));
    return fetchApi<{ success: boolean; data: any[]; pagination: { total: number; limit: number; offset: number } }>(`/v1/audio-monitoring/alerts?${params}`);
  },
  acknowledgeAlert: (alertId: string, notes?: string) => fetchApi<{ success: boolean; data: any }>(`/v1/audio-monitoring/alerts/${encodeURIComponent(alertId)}/acknowledge`, {
    method: 'POST',
    body: JSON.stringify({ notes }),
  }),
  getStats: () => fetchApi<{ success: boolean; data: any }>('/v1/audio-monitoring/stats'),
};

export const videoBookmarksApi = {
  listBookmarks: (filters?: {
    cameraId?: string;
    cameraIds?: string[];
    priority?: 'low' | 'medium' | 'high' | 'critical';
    reason?: string;
    hasIncident?: boolean;
    incidentId?: string;
    operatorId?: string;
    from?: string;
    to?: string;
    tags?: string[];
    search?: string;
    reviewStatus?: 'pending' | 'reviewed' | 'approved' | 'rejected';
    verifiedOnly?: boolean;
    limit?: number;
    offset?: number;
    sortBy?: 'timestamp' | 'priority' | 'created_at' | 'title';
    sortOrder?: 'asc' | 'desc';
  }) => {
    const params = new URLSearchParams();
    if (filters?.cameraId) params.append('cameraId', filters.cameraId);
    if (filters?.cameraIds && filters.cameraIds.length > 0) {
      filters.cameraIds.forEach((id) => params.append('cameraIds', id));
    }
    if (filters?.priority) params.append('priority', filters.priority);
    if (filters?.reason) params.append('reason', filters.reason);
    if (filters?.hasIncident !== undefined) params.append('hasIncident', String(filters.hasIncident));
    if (filters?.incidentId) params.append('incidentId', filters.incidentId);
    if (filters?.operatorId) params.append('operatorId', filters.operatorId);
    if (filters?.from) params.append('from', filters.from);
    if (filters?.to) params.append('to', filters.to);
    if (filters?.tags && filters.tags.length > 0) {
      filters.tags.forEach((t) => params.append('tags', t));
    }
    if (filters?.search) params.append('search', filters.search);
    if (filters?.reviewStatus) params.append('reviewStatus', filters.reviewStatus);
    if (filters?.verifiedOnly !== undefined) params.append('verifiedOnly', String(filters.verifiedOnly));
    if (filters?.limit) params.append('limit', String(filters.limit));
    if (filters?.offset) params.append('offset', String(filters.offset));
    if (filters?.sortBy) params.append('sortBy', filters.sortBy);
    if (filters?.sortOrder) params.append('sortOrder', filters.sortOrder);
    return fetchApi<{
      success: boolean;
      data: any[];
      pagination: { total: number; limit: number; offset: number };
    }>(`/v1/video/bookmarks?${params.toString()}`);
  },

  getBookmark: (id: string) =>
    fetchApi<{ success: boolean; data: any }>(`/v1/video/bookmarks/${encodeURIComponent(id)}`),

  createBookmark: (input: {
    cameraId: string;
    timestamp: string;
    title: string;
    notes?: string;
    priority?: 'low' | 'medium' | 'high' | 'critical';
    reason?: string;
    tags?: string[];
    incidentId?: string;
    incidentTable?: 'incidents' | 'live_incidents';
    associationNotes?: string;
    recordingSegmentId?: string;
    snapshotReference?: string;
    metadata?: Record<string, unknown>;
  }) =>
    fetchApi<{ success: boolean; data: any }>('/v1/video/bookmarks', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  updateBookmark: (id: string, updates: {
    title?: string;
    notes?: string;
    priority?: 'low' | 'medium' | 'high' | 'critical';
    reason?: string;
    tags?: string[];
    reviewStatus?: 'pending' | 'reviewed' | 'approved' | 'rejected';
    metadata?: Record<string, unknown>;
  }) =>
    fetchApi<{ success: boolean; data: any }>(`/v1/video/bookmarks/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }),

  deleteBookmark: (id: string) =>
    fetchApi<{ success: boolean; message: string }>(`/v1/video/bookmarks/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),

  associateIncident: (id: string, input: {
    incidentId: string;
    incidentTable?: 'incidents' | 'live_incidents';
    associationNotes?: string;
  }) =>
    fetchApi<{ success: boolean; data: any }>(`/v1/video/bookmarks/${encodeURIComponent(id)}/incidents`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  disassociateIncident: (id: string, incidentId: string) =>
    fetchApi<{ success: boolean; message: string }>(
      `/v1/video/bookmarks/${encodeURIComponent(id)}/incidents/${encodeURIComponent(incidentId)}`,
      { method: 'DELETE' }
    ),

  createIncidentFromBookmark: (id: string, input: {
    title?: string;
    description?: string;
    severity?: 'P1' | 'P2' | 'P3' | 'P4' | 'P5';
    preRollSeconds?: number;
    postRollSeconds?: number;
    applyLegalHold?: boolean;
    notes?: string;
  }) =>
    fetchApi<{ success: boolean; data: { incidentId: string; bookmark: any; legalHoldId?: string } }>(
      `/v1/video/bookmarks/${encodeURIComponent(id)}/create-incident`,
      {
        method: 'POST',
        body: JSON.stringify(input),
      }
    ),

  getIncidentBookmarks: (incidentId: string) =>
    fetchApi<{ success: boolean; data: any[] }>(`/v1/incidents/${encodeURIComponent(incidentId)}/bookmarks`),

  getTimelineBookmarks: (cameraId: string, from?: string, to?: string) => {
    const params = new URLSearchParams();
    if (from) params.append('from', from);
    if (to) params.append('to', to);
    return fetchApi<{ success: boolean; data: any[] }>(
      `/v1/cameras/${encodeURIComponent(cameraId)}/timeline-bookmarks?${params.toString()}`
    );
  },

  verifyBookmark: (id: string) =>
    fetchApi<{ success: boolean; data: any }>(`/v1/video/bookmarks/${encodeURIComponent(id)}/verify`, {
      method: 'POST',
    }),

  getMetrics: (cameraId?: string) => {
    const url = cameraId
      ? `/v1/video/bookmarks/metrics?cameraId=${encodeURIComponent(cameraId)}`
      : '/v1/video/bookmarks/metrics';
    return fetchApi<{ success: boolean; data: any }>(url);
  },

  getCameras: () => fetchApi<{ data?: any[] } | any[]>('/v1/cameras'),

  getIncidents: () => fetchApi<{ data?: any[] } | any[]>('/v1/incidents'),
};

export const talkbackApi = {
  /**
   * Check if a camera is currently active in a talkback session
   */
  getActiveSession: (cameraId: string) =>
    fetchApi<{
      active: boolean;
      lease?: {
        camera_id: string;
        session_id: string;
        user_id: string;
        acquired_at: string;
        lease_expires_at: string;
      };
      session?: any;
    }>(`/v1/cameras/${encodeURIComponent(cameraId)}/talk-sessions/active`),

  /**
   * Heartbeat to extend push-to-talk lease
   */
  heartbeat: (cameraId: string, sessionId: string, ttlMs?: number) =>
    fetchApi<{ status: string; leaseActive: boolean }>(
      `/v1/cameras/${encodeURIComponent(cameraId)}/talk-sessions/${encodeURIComponent(sessionId)}/heartbeat`,
      {
        method: 'POST',
        body: JSON.stringify({ ttlMs }),
      }
    ),

  /**
   * Stop an active talkback session
   */
  stopSession: (cameraId: string, sessionId: string) =>
    fetchApi<{ status: string; session?: any }>(
      `/v1/cameras/${encodeURIComponent(cameraId)}/talk-sessions/${encodeURIComponent(sessionId)}`,
      {
        method: 'DELETE',
      }
    ),

  /**
   * Supervisor emergency kill switch
   */
  terminateSession: (cameraId: string, sessionId: string, reason?: string) =>
    fetchApi<{ status: string; session?: any }>(
      `/v1/cameras/${encodeURIComponent(cameraId)}/talk-sessions/${encodeURIComponent(sessionId)}/terminate`,
      {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }
    ),

  /**
   * List historical talk sessions with filters
   */
  getHistory: (filter?: {
    cameraId?: string;
    userId?: string;
    status?: string;
    fromDate?: string;
    toDate?: string;
    limit?: number;
    offset?: number;
  }) => {
    const params = new URLSearchParams();
    if (filter?.cameraId) params.append('cameraId', filter.cameraId);
    if (filter?.userId) params.append('userId', filter.userId);
    if (filter?.status) params.append('status', filter.status);
    if (filter?.fromDate) params.append('fromDate', filter.fromDate);
    if (filter?.toDate) params.append('toDate', filter.toDate);
    if (filter?.limit) params.append('limit', String(filter.limit));
    if (filter?.offset) params.append('offset', String(filter.offset));
    return fetchApi<{ success: boolean; data: any[]; pagination: { total: number; limit: number; offset: number } }>(
      `/v1/talk-sessions/history?${params.toString()}`
    );
  },

  /**
   * Operational telemetry stats
   */
  getStats: () =>
    fetchApi<{
      totalSessions: number;
      activeSessions: number;
      completedSessions: number;
      failedSessions: number;
      totalDurationMs: number;
      totalBytesSent: number;
      averageDurationMs: number;
      codecDistribution: Record<string, number>;
      adapterDistribution: Record<string, number>;
    }>('/v1/talk-sessions/stats'),

  /**
   * Query or probe camera talkback hardware capability
   */
  getCapability: (cameraId: string) =>
    fetchApi<{
      camera_id: string;
      supported: boolean;
      transport: string;
      codecs: string[];
      sample_rates: number[];
      verified_at: string;
      reason?: string;
    }>(`/v1/cameras/${encodeURIComponent(cameraId)}/talkback/capability`),

  /**
   * Diagnostic probe of backchannel connection
   */
  testBackchannel: (cameraId: string) =>
    fetchApi<{
      status: string;
      transport: string;
      codecs: string[];
      sampleRates: number[];
      verifiedAt: string;
      diagnostics: Record<string, any>;
    }>(`/v1/cameras/${encodeURIComponent(cameraId)}/talkback/test`, {
      method: 'POST',
    }),
};

export interface RecordingGapItem {
  id: string;
  tenantId: string;
  branchId?: string;
  cameraId: string;
  startTime: string;
  endTime?: string;
  gapDurationSeconds: number;
  reason: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'HEALED' | 'UNRECOVERABLE';
  detail: Record<string, any>;
  healedAt?: string;
  healedBy?: string;
  backfillJobId?: string;
  segmentsRecoveredCount: number;
  bytesRecovered: number;
  detectedAt: string;
  resolvedAt?: string;
}

export interface BackfillJobItem {
  id: string;
  tenantId: string;
  branchId: string;
  cameraId: string;
  gapId?: string;
  status: 'PENDING' | 'SCANNING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  triggerSource: 'AUTO_WAN_RECOVERY' | 'MANUAL_OPERATOR' | 'SCHEDULED_AUDIT';
  windowStart: string;
  windowEnd: string;
  totalSegments: number;
  syncedSegments: number;
  skippedDuplicates: number;
  reconciledOverlaps: number;
  failedSegments: number;
  totalBytes: number;
  transferredBytes: number;
  rateLimitKbps: number;
  errorMessage?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface RecoveryStats {
  totalGaps: number;
  openGaps: number;
  inProgressGaps: number;
  healedGaps: number;
  unrecoverableGaps: number;
  largestGapSeconds: number;
  totalLostSeconds: number;
  healingSuccessRate: number;
  activeJobsCount: number;
  completedJobsCount: number;
  totalBackfilledBytes: number;
  totalRecoveredSegments: number;
  totalSkippedDuplicates: number;
  totalReconciledOverlaps: number;
}

export interface EdgeBackfillAuditEntry {
  id: string;
  job_id?: string;
  tenant_id: string;
  branch_id: string;
  camera_id: string;
  segment_id: string;
  action: string;
  file_size: number;
  checksum_sha256: string;
  start_time: string;
  end_time: string;
  details: Record<string, any>;
  logged_at: string;
}

export const recordingRecoveryApi = {
  /**
   * List recording gaps with filtering
   */
  listGaps: (params?: {
    branchId?: string;
    cameraId?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
  }) => {
    const qs = new URLSearchParams();
    if (params?.branchId) qs.append('branchId', params.branchId);
    if (params?.cameraId) qs.append('cameraId', params.cameraId);
    if (params?.status) qs.append('status', params.status);
    if (params?.startDate) qs.append('startDate', params.startDate);
    if (params?.endDate) qs.append('endDate', params.endDate);
    if (params?.limit) qs.append('limit', String(params.limit));
    if (params?.offset) qs.append('offset', String(params.offset));
    return fetchApi<{ data: RecordingGapItem[]; meta: { total: number; limit: number; offset: number } }>(
      `/v1/recording/recovery/gaps?${qs.toString()}`
    );
  },

  /**
   * Trigger gap detection scan for a camera time range
   */
  scanGaps: (body: {
    cameraId: string;
    branchId?: string;
    startTime: string;
    endTime: string;
    toleranceSeconds?: number;
  }) =>
    fetchApi<{ data: RecordingGapItem[] }>('/v1/recording/recovery/scan-gaps', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  /**
   * List backfill jobs
   */
  listJobs: (params?: {
    branchId?: string;
    cameraId?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }) => {
    const qs = new URLSearchParams();
    if (params?.branchId) qs.append('branchId', params.branchId);
    if (params?.cameraId) qs.append('cameraId', params.cameraId);
    if (params?.status) qs.append('status', params.status);
    if (params?.limit) qs.append('limit', String(params.limit));
    if (params?.offset) qs.append('offset', String(params.offset));
    return fetchApi<{ data: BackfillJobItem[]; meta: { total: number; limit: number; offset: number } }>(
      `/v1/recording/recovery/jobs?${qs.toString()}`
    );
  },

  /**
   * Get backfill job details
   */
  getJob: (jobId: string) =>
    fetchApi<{ data: BackfillJobItem }>(`/v1/recording/recovery/jobs/${encodeURIComponent(jobId)}`),

  /**
   * Create and trigger an edge backfill job
   */
  createJob: (body: {
    branchId: string;
    cameraId: string;
    gapId?: string;
    triggerSource?: string;
    windowStart: string;
    windowEnd: string;
    rateLimitKbps?: number;
  }) =>
    fetchApi<{ data: BackfillJobItem }>('/v1/recording/recovery/jobs', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  /**
   * Cancel an active backfill job
   */
  cancelJob: (jobId: string) =>
    fetchApi<{ data: BackfillJobItem }>(`/v1/recording/recovery/jobs/${encodeURIComponent(jobId)}/cancel`, {
      method: 'POST',
    }),

  /**
   * Upload single backfilled segment chunk
   */
  uploadSegment: (body: {
    jobId?: string;
    branchId: string;
    cameraId: string;
    segmentId: string;
    startTime: string;
    endTime: string;
    durationMs: number;
    fileSize: number;
    sha256: string;
    storagePath: string;
    dataBase64?: string;
  }) =>
    fetchApi<{ data: any }>('/v1/recording/recovery/backfill/upload', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  /**
   * Batch ingest backfilled edge segments
   */
  syncBatch: (body: {
    jobId?: string;
    branchId: string;
    cameraId: string;
    rateLimitKbps?: number;
    segments: Array<{
      segmentId: string;
      startTime: string;
      endTime: string;
      durationMs: number;
      fileSize: number;
      sha256: string;
      storagePath: string;
    }>;
  }) =>
    fetchApi<{ data: any }>('/v1/recording/recovery/backfill/sync-batch', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  /**
   * Get gap and recovery statistics
   */
  getStats: (params?: { branchId?: string; cameraId?: string }) => {
    const qs = new URLSearchParams();
    if (params?.branchId) qs.append('branchId', params.branchId);
    if (params?.cameraId) qs.append('cameraId', params.cameraId);
    return fetchApi<{ data: RecoveryStats }>(`/v1/recording/recovery/stats?${qs.toString()}`);
  },

  /**
   * List forensic audit log entries
   */
  getAuditLogs: (params?: { cameraId?: string; jobId?: string; limit?: number; offset?: number }) => {
    const qs = new URLSearchParams();
    if (params?.cameraId) qs.append('cameraId', params.cameraId);
    if (params?.jobId) qs.append('jobId', params.jobId);
    if (params?.limit) qs.append('limit', String(params.limit));
    if (params?.offset) qs.append('offset', String(params.offset));
    return fetchApi<{ data: EdgeBackfillAuditEntry[]; meta: { total: number; limit: number; offset: number } }>(
      `/v1/recording/recovery/audit?${qs.toString()}`
    );
  },
};

export interface ColdCloudArchiveJobItem {
  id: string;
  tenantId: string;
  incidentId: string;
  incidentNumber: string;
  cameraId: string;
  branchId?: string;
  evidencePackageId?: string;
  clipId?: string;
  storageTier: 'GLACIER' | 'DEEP_ARCHIVE' | 'GLACIER_IR' | 'INTELLIGENT_TIERING';
  s3Bucket: string;
  s3Key: string;
  s3Region: string;
  s3Endpoint?: string;
  fileSizeBytes: number;
  checksumSha256: string;
  encryptionKmsKeyId?: string;
  archiveStatus: 'PENDING' | 'EXPORTING' | 'ARCHIVED' | 'FAILED' | 'CANCELLED';
  restoreStatus: 'NONE' | 'RESTORE_REQUESTED' | 'RESTORING' | 'RESTORED' | 'EXPIRED';
  restoreRequestedAt?: string;
  restoreCompletedAt?: string;
  restoreExpiresAt?: string;
  restoreTier?: 'Expedited' | 'Standard' | 'Bulk';
  attempts: number;
  maxAttempts: number;
  errorMessage?: string;
  metadata: Record<string, any>;
  createdBy?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface ArchivePolicyItem {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  enabled: boolean;
  targetStorageClass: 'GLACIER' | 'DEEP_ARCHIVE' | 'GLACIER_IR';
  targetBucket: string;
  targetPrefix: string;
  triggerCondition: Record<string, any>;
  encryptionKmsKeyId?: string;
  retentionDays: number;
  createdAt: string;
  updatedAt: string;
}

export interface ArchiveAuditLogItem {
  id: string;
  jobId?: string;
  tenantId: string;
  incidentId?: string;
  incidentNumber?: string;
  action: string;
  operatorId?: string;
  checksumSha256?: string;
  s3Uri?: string;
  storageClass?: string;
  details: Record<string, any>;
  timestamp: string;
}

export interface ArchiveStatisticsItem {
  totalJobs: number;
  archivedJobs: number;
  pendingJobs: number;
  failedJobs: number;
  totalBytesArchived: number;
  totalBytesGlacier: number;
  totalBytesDeepArchive: number;
  activeRestoresCount: number;
  completedRestoresCount: number;
  estimatedMonthlyHotCostUsd: number;
  estimatedMonthlyColdCostUsd: number;
  estimatedMonthlySavingsUsd: number;
  savingsPercentage: number;
}

export const coldCloudArchiveApi = {
  /**
   * List cold cloud archive export jobs
   */
  listJobs: (params?: {
    incidentId?: string;
    cameraId?: string;
    branchId?: string;
    status?: string;
    restoreStatus?: string;
    limit?: number;
    offset?: number;
  }) => {
    const qs = new URLSearchParams();
    if (params?.incidentId) qs.append('incidentId', params.incidentId);
    if (params?.cameraId) qs.append('cameraId', params.cameraId);
    if (params?.branchId) qs.append('branchId', params.branchId);
    if (params?.status) qs.append('status', params.status);
    if (params?.restoreStatus) qs.append('restoreStatus', params.restoreStatus);
    if (params?.limit) qs.append('limit', String(params.limit));
    if (params?.offset) qs.append('offset', String(params.offset));
    return fetchApi<{ data: ColdCloudArchiveJobItem[]; meta: { total: number; limit: number; offset: number } }>(
      `/v1/recording/archive/jobs?${qs.toString()}`
    );
  },

  /**
   * Get single archive job details
   */
  getJob: (jobId: string) =>
    fetchApi<{ data: ColdCloudArchiveJobItem }>(`/v1/recording/archive/jobs/${encodeURIComponent(jobId)}`),

  /**
   * Create manual archive job
   */
  createJob: (body: {
    incidentId: string;
    cameraId: string;
    branchId?: string;
    incidentNumber?: string;
    evidencePackageId?: string;
    clipId?: string;
    storageTier?: string;
    videoData?: string;
    videoFilePath?: string;
    metadata?: Record<string, any>;
  }) =>
    fetchApi<{ data: ColdCloudArchiveJobItem }>('/v1/recording/archive/jobs', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  /**
   * Request Glacier restore
   */
  requestRestore: (
    jobId: string,
    body?: {
      tier?: 'Expedited' | 'Standard' | 'Bulk';
      validityDays?: number;
    }
  ) =>
    fetchApi<{ data: ColdCloudArchiveJobItem }>(`/v1/recording/archive/jobs/${encodeURIComponent(jobId)}/restore`, {
      method: 'POST',
      body: JSON.stringify(body || {}),
    }),

  /**
   * Query Glacier restore status
   */
  checkRestoreStatus: (jobId: string) =>
    fetchApi<{ data: ColdCloudArchiveJobItem }>(
      `/v1/recording/archive/jobs/${encodeURIComponent(jobId)}/restore-status`
    ),

  /**
   * Trigger automated policy sweep
   */
  runAutoExport: () =>
    fetchApi<{
      data: {
        sweptPoliciesCount: number;
        discoveredIncidentsCount: number;
        createdJobsCount: number;
        failedJobsCount: number;
        jobIds: string[];
      };
    }>('/v1/recording/archive/auto-export', {
      method: 'POST',
    }),

  /**
   * List automated policies
   */
  listPolicies: () => fetchApi<{ data: ArchivePolicyItem[] }>('/v1/recording/archive/policies'),

  /**
   * Create automated policy
   */
  createPolicy: (body: {
    name: string;
    description?: string;
    enabled?: boolean;
    targetStorageClass?: string;
    targetBucket?: string;
    targetPrefix?: string;
    triggerCondition?: Record<string, any>;
    encryptionKmsKeyId?: string;
    retentionDays?: number;
  }) =>
    fetchApi<{ data: ArchivePolicyItem }>('/v1/recording/archive/policies', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  /**
   * List immutable audit logs
   */
  getAuditLogs: (params?: { jobId?: string; incidentId?: string; limit?: number; offset?: number }) => {
    const qs = new URLSearchParams();
    if (params?.jobId) qs.append('jobId', params.jobId);
    if (params?.incidentId) qs.append('incidentId', params.incidentId);
    if (params?.limit) qs.append('limit', String(params.limit));
    if (params?.offset) qs.append('offset', String(params.offset));
    return fetchApi<{ data: ArchiveAuditLogItem[]; meta: { total: number; limit: number; offset: number } }>(
      `/v1/recording/archive/audit?${qs.toString()}`
    );
  },

  /**
   * Get archive statistics
   */
  getStatistics: () => fetchApi<{ data: ArchiveStatisticsItem }>('/v1/recording/archive/statistics'),
};

export interface StorageTargetItem {
  id: string;
  mediaNodeId: string;
  cameraId?: string;
  storageNodeId: string;
  targetName: string;
  targetPath: string;
  priority: number;
  isActive: boolean;
  healthState: 'HEALTHY' | 'DEGRADED' | 'FULL' | 'OFFLINE' | 'READ_ONLY' | 'REBUILDING';
  spilloverThresholdPercent: number;
  consecutiveFailures: number;
  lastFailureReason?: string;
  lastErrorDetail?: string;
  lastCheckedAt: string;
  capacityBytes?: number;
  usedBytes?: number;
  availableBytes?: number;
  usagePercent?: number;
  actionTaken?: 'NONE' | 'FAILOVER_TRIGGERED' | 'RECOVERED';
}

export interface StorageFailoverEventItem {
  id: string;
  tenantId: string;
  mediaNodeId: string;
  cameraId?: string;
  fromStorageNodeId: string;
  fromTargetPath: string;
  toStorageNodeId: string;
  toTargetPath: string;
  reason: string;
  errorDetail?: string;
  occurredAt: string;
  recoveredAt?: string;
  createdAt: string;
}

export interface StorageFailoverMetricsItem {
  mediaNodeId?: string;
  totalEvents: number;
  unrecoveredEvents: number;
  meanTimeToRecoveryMs: number;
  reasonBreakdown: Record<string, number>;
  targetsSummary: {
    total: number;
    healthy: number;
    full: number;
    offline: number;
    degraded: number;
  };
}

export const storageFailoverApi = {
  /**
   * Get configured permitted recording targets and active target
   */
  getTargets: (params: { mediaNodeId: string; cameraId?: string }) => {
    const qs = new URLSearchParams({ mediaNodeId: params.mediaNodeId });
    if (params.cameraId) qs.append('cameraId', params.cameraId);
    return fetchApi<{
      data: {
        mediaNodeId: string;
        cameraId?: string;
        activeTarget: StorageTargetItem;
        permittedTargets: StorageTargetItem[];
      };
    }>(`/v1/storage/failover/targets?${qs.toString()}`);
  },

  /**
   * Configure a storage target (Local NVMe, NAS, SAN, etc.)
   */
  configureTarget: (body: {
    tenantId?: string;
    mediaNodeId: string;
    cameraId?: string;
    storageNodeId: string;
    targetName: string;
    targetPath: string;
    storageType?: 'local-disk' | 'nas' | 'san' | 's3' | 'archive';
    storageTier?: 'hot' | 'warm' | 'cold' | 'archive';
    priority?: number;
    isActive?: boolean;
    maxCapacityBytes?: number;
    spilloverThresholdPercent?: number;
  }) =>
    fetchApi<{ data: StorageTargetItem }>('/v1/storage/failover/targets', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  /**
   * Remove / unregister a storage target
   */
  deleteTarget: (targetId: string, params: { mediaNodeId: string; cameraId?: string }) => {
    const qs = new URLSearchParams({ mediaNodeId: params.mediaNodeId });
    if (params.cameraId) qs.append('cameraId', params.cameraId);
    return fetchApi<{ success: boolean; data: { targetId: string; removed: boolean } }>(
      `/v1/storage/failover/targets/${encodeURIComponent(targetId)}?${qs.toString()}`,
      { method: 'DELETE' }
    );
  },

  /**
   * Update storage target configuration (priority, status, spillover threshold)
   */
  updateTarget: (
    targetId: string,
    body: {
      mediaNodeId: string;
      cameraId?: string;
      priority?: number;
      isActive?: boolean;
      targetName?: string;
      targetPath?: string;
      spilloverThresholdPercent?: number;
    }
  ) =>
    fetchApi<{ data: StorageTargetItem }>(`/v1/storage/failover/targets/${encodeURIComponent(targetId)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  /**
   * Manually or synthetically trigger target failover
   */
  triggerFailover: (body: {
    mediaNodeId: string;
    targetId: string;
    reason?: 'DISK_FULL' | 'STORAGE_OFFLINE' | 'READ_ONLY' | 'WRITE_FAILURE' | 'LATENCY_SPIKE' | 'MOUNT_DISCONNECTED' | 'MANUAL_OVERRIDE';
    errorDetail?: string;
    cameraId?: string;
  }) =>
    fetchApi<{
      data: {
        failoverOccurred: boolean;
        newTarget?: StorageTargetItem;
        event?: StorageFailoverEventItem;
      };
    }>('/v1/storage/failover/trigger', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  /**
   * Recover a failed target and restore priority
   */
  recoverTarget: (body: { mediaNodeId: string; targetId: string; cameraId?: string }) =>
    fetchApi<{
      data: {
        recovered: boolean;
        activeTarget?: StorageTargetItem;
      };
    }>('/v1/storage/failover/recover', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  /**
   * Trigger real filesystem probe across all targets
   */
  probeHealth: (body: { mediaNodeId: string; cameraId?: string }) =>
    fetchApi<{
      data: {
        activeTarget: StorageTargetItem;
        targets: StorageTargetItem[];
      };
    }>('/v1/storage/failover/probe', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  /**
   * Query target health and status
   */
  getHealth: (params: { mediaNodeId: string; cameraId?: string }) => {
    const qs = new URLSearchParams({ mediaNodeId: params.mediaNodeId });
    if (params.cameraId) qs.append('cameraId', params.cameraId);
    return fetchApi<{
      data: {
        activeTarget: StorageTargetItem;
        targets: StorageTargetItem[];
      };
    }>(`/v1/storage/failover/health?${qs.toString()}`);
  },

  /**
   * Get failover audit events
   */
  getEvents: (params?: { mediaNodeId?: string; limit?: number; reason?: string }) => {
    const qs = new URLSearchParams();
    if (params?.mediaNodeId) qs.append('mediaNodeId', params.mediaNodeId);
    if (params?.limit) qs.append('limit', String(params.limit));
    if (params?.reason) qs.append('reason', params.reason);
    return fetchApi<{ data: StorageFailoverEventItem[] }>(`/v1/storage/failover/events?${qs.toString()}`);
  },

  /**
   * Get failover telemetry and MTTR metrics
   */
  getMetrics: (params?: { mediaNodeId?: string }) => {
    const qs = new URLSearchParams();
    if (params?.mediaNodeId) qs.append('mediaNodeId', params.mediaNodeId);
    return fetchApi<{ data: StorageFailoverMetricsItem }>(`/v1/storage/failover/metrics?${qs.toString()}`);
  },
};

// ============================================================================
// Media Gateway Failover API Client (ha.media_failover)
// ============================================================================

export interface MediaGatewayNodeItem {
  gatewayId: string;
  gatewayName: string;
  ipAddress: string;
  port: number;
  apiPort: number;
  publicUrl: string;
  region: string;
  status: 'HEALTHY' | 'DEGRADED' | 'DRAINING' | 'FAILED' | 'OFFLINE';
  maxStreams: number;
  activeStreams: number;
  maxNetworkMbps: number;
  currentNetworkMbps: number;
  cpuPercent: number;
  memoryPercent: number;
  consecutiveFailures: number;
  lastHeartbeatAt: string;
  registeredAt: string;
  updatedAt: string;
}

export interface MediaStreamRouteItem {
  id: string;
  cameraId: string;
  streamProfile: 'main' | 'sub' | 'preview';
  assignedGatewayId: string;
  standbyGatewayId?: string;
  sourceUri: string;
  streamPath: string;
  redirectUrl: string;
  status: 'ACTIVE' | 'FAILOVER_IN_PROGRESS' | 'FAILED_OVER' | 'DEGRADED' | 'OFFLINE';
  fencingToken: number;
  viewerCount: number;
  bitrateKbps: number;
  fps: number;
  lastFailoverAt?: string;
  failoverCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface MediaGatewayFailoverEventItem {
  id: string;
  eventType:
    | 'FAILOVER_INITIATED'
    | 'STREAM_REDIRECTED'
    | 'FAILOVER_COMPLETED'
    | 'FAILOVER_FAILED'
    | 'GATEWAY_DRAINED'
    | 'GATEWAY_RECOVERED'
    | 'REBALANCE_COMPLETED';
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  failedGatewayId: string;
  targetGatewayId?: string;
  affectedStreams: number;
  redirectedStreams: number;
  failedRedirects: number;
  rtoMs: number;
  reason: string;
  details?: Record<string, unknown>;
  triggeredBy: string;
  createdAt: string;
}

export interface MediaGatewayFailoverPolicyItem {
  policyId: string;
  heartbeatTimeoutMs: number;
  watchdogIntervalMs: number;
  maxStreamsPerGateway: number;
  maxLoadPercent: number;
  autoFailoverEnabled: boolean;
  autoFailbackEnabled: boolean;
  flapDampingSeconds: number;
  updatedAt: string;
}

export interface MediaGatewayFailoverMetricsItem {
  totalGateways: number;
  healthyGateways: number;
  degradedGateways: number;
  drainingGateways: number;
  failedGateways: number;
  offlineGateways: number;
  totalCapacityStreams: number;
  totalActiveStreams: number;
  clusterHeadroomPercent: number;
  totalFailoversToday: number;
  avgRtoMs: number;
  p95RtoMs: number;
  maxRtoMs: number;
  streamContinuityPercent: number;
  lastFailoverAt?: string;
}

export const mediaGatewayFailoverApi = {
  getGateways: () =>
    fetchApi<{ data: MediaGatewayNodeItem[] }>('/v1/ha/media-gateways'),

  registerGateway: (body: {
    gatewayId: string;
    gatewayName: string;
    ipAddress: string;
    port?: number;
    apiPort?: number;
    publicUrl?: string;
    region?: string;
    maxStreams?: number;
    maxNetworkMbps?: number;
  }) =>
    fetchApi<{ data: MediaGatewayNodeItem }>('/v1/ha/media-gateways/register', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  sendHeartbeat: (body: {
    gatewayId: string;
    gatewayName?: string;
    ipAddress: string;
    port?: number;
    apiPort?: number;
    publicUrl?: string;
    region?: string;
    cpuPercent: number;
    memoryPercent: number;
    networkInMbps: number;
    networkOutMbps: number;
    activeStreams: number;
    recordingStreams?: number;
    liveViewStreams?: number;
    healthyStreams?: number;
    degradedStreams?: number;
    failedStreams?: number;
    packetLoss?: number;
    frameDrops?: number;
    maxStreams?: number;
    maxNetworkMbps?: number;
  }) =>
    fetchApi<{ data: MediaGatewayNodeItem }>('/v1/ha/media-gateways/heartbeat', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  getStreams: () =>
    fetchApi<{ data: MediaStreamRouteItem[] }>('/v1/ha/media-gateways/streams'),

  routeStream: (body: {
    cameraId: string;
    streamProfile?: 'main' | 'sub' | 'preview';
    sourceUri: string;
    preferredGatewayId?: string;
    preferredRegion?: string;
    bitrateKbps?: number;
    fps?: number;
  }) =>
    fetchApi<{ data: MediaStreamRouteItem }>('/v1/ha/media-gateways/streams/route', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  redirectStream: (cameraId: string, body: { targetGatewayId: string; streamProfile?: 'main' | 'sub' | 'preview' }) =>
    fetchApi<{ data: MediaStreamRouteItem }>(`/v1/ha/media-gateways/streams/${encodeURIComponent(cameraId)}/redirect`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  triggerFailover: (gatewayId: string, body?: { reason?: string; triggeredBy?: string }) =>
    fetchApi<{
      data: {
        success: boolean;
        affectedStreams: number;
        redirectedStreams: number;
        failedRedirects: number;
        rtoMs: number;
        event: MediaGatewayFailoverEventItem;
      };
    }>(`/v1/ha/media-gateways/${encodeURIComponent(gatewayId)}/failover`, {
      method: 'POST',
      body: JSON.stringify(body || {}),
    }),

  drainGateway: (gatewayId: string, body?: { reason?: string }) =>
    fetchApi<{
      data: {
        success: boolean;
        drainedStreams: number;
        failedRedirects: number;
        rtoMs: number;
      };
    }>(`/v1/ha/media-gateways/${encodeURIComponent(gatewayId)}/drain`, {
      method: 'POST',
      body: JSON.stringify(body || {}),
    }),

  rebalanceStreams: () =>
    fetchApi<{
      data: {
        rebalancedStreams: number;
        transfers: Array<{ cameraId: string; fromGateway: string; toGateway: string }>;
      };
    }>('/v1/ha/media-gateways/rebalance', {
      method: 'POST',
    }),

  getEvents: (params?: { limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.limit) qs.append('limit', String(params.limit));
    return fetchApi<{ data: MediaGatewayFailoverEventItem[] }>(`/v1/ha/media-gateways/events?${qs.toString()}`);
  },

  getMetrics: () =>
    fetchApi<{ data: MediaGatewayFailoverMetricsItem }>('/v1/ha/media-gateways/metrics'),

  getPolicy: () =>
    fetchApi<{ data: MediaGatewayFailoverPolicyItem }>('/v1/ha/media-gateways/policy'),

  updatePolicy: (body: Partial<MediaGatewayFailoverPolicyItem>) =>
    fetchApi<{ data: MediaGatewayFailoverPolicyItem }>('/v1/ha/media-gateways/policy', {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  probeCluster: () =>
    fetchApi<{
      data: {
        cycle: { detectedFailures: string[]; failoversExecuted: number };
        metrics: MediaGatewayFailoverMetricsItem;
        nodes: MediaGatewayNodeItem[];
      };
    }>('/v1/ha/media-gateways/probe', {
      method: 'POST',
    }),
// ============================================================================
// Recording Engine N+1 Failover API Client (ha.recording_failover)
// ============================================================================

export interface RecordingNodeItem {
  id: string;
  name: string;
  host: string;
  port: number;
  role: 'ACTIVE' | 'STANDBY' | 'DRAINING' | 'MAINTENANCE';
  state: 'HEALTHY' | 'DEGRADED' | 'HEARTBEAT_EXPIRED' | 'OFFLINE' | 'FAILOVER_ACTIVE';
  currentEpoch: number;
  maxStreamCapacity: number;
  activeStreamCount: number;
  cpuPercent: number;
  memoryPercent: number;
  diskWriteMbps: number;
  networkInMbps: number;
  heartbeatAt: string;
  heartbeatAgeMs?: number;
}

export interface RecordingNodeAssignmentItem {
  id: string;
  cameraId: string;
  tenantId: string;
  primaryNodeId: string;
  currentNodeId: string;
  streamUri: string;
  streamProfile: string;
  status: 'ACTIVE' | 'FAILED_OVER' | 'DRAINING' | 'STOPPED';
  takeoverEpoch: number;
  failedOverAt?: string;
}

export interface RecordingFailoverEventItem {
  id: string;
  tenantId: string;
  failedNodeId: string;
  standbyNodeId: string;
  affectedCameras: number;
  transferredCameras: number;
  detectionTimeMs: number;
  takeoverTimeMs: number;
  totalRtoMs: number;
  reason: string;
  status: string;
  details: Record<string, unknown>;
  createdAt: string;
  recoveredAt?: string;
}

export interface RecordingFailoverMetricsItem {
  totalNodes: number;
  activeNodes: number;
  standbyNodes: number;
  healthyNodes: number;
  heartbeatExpiredNodes: number;
  totalAssignedStreams: number;
  failedOverStreams: number;
  totalFailovers: number;
  averageRtoMs: number;
  streamContinuityPercent: number;
  activeAlerts: Array<{
    nodeId: string;
    level: 'WARNING' | 'CRITICAL';
    message: string;
  }>;
}

export const recordingFailoverApi = {
  getNodes: (params?: { role?: string; state?: string }) => {
    const qs = new URLSearchParams();
    if (params?.role) qs.append('role', params.role);
    if (params?.state) qs.append('state', params.state);
    return fetchApi<{ data: RecordingNodeItem[] }>(`/v1/recording/failover/nodes?${qs.toString()}`);
  },

  registerNode: (body: {
    id: string;
    name: string;
    host: string;
    port?: number;
    role?: 'ACTIVE' | 'STANDBY' | 'DRAINING' | 'MAINTENANCE';
    maxStreamCapacity?: number;
    metadata?: Record<string, unknown>;
  }) =>
    fetchApi<{ data: RecordingNodeItem }>('/v1/recording/failover/nodes', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  sendHeartbeat: (
    nodeId: string,
    body: {
      cpuPercent?: number;
      memoryPercent?: number;
      diskWriteMbps?: number;
      activeStreamCount?: number;
    }
  ) =>
    fetchApi<{ data: RecordingNodeItem }>(`/v1/recording/failover/nodes/${encodeURIComponent(nodeId)}/heartbeat`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  getAssignments: (params?: { nodeId?: string; cameraId?: string }) => {
    const qs = new URLSearchParams();
    if (params?.nodeId) qs.append('nodeId', params.nodeId);
    if (params?.cameraId) qs.append('cameraId', params.cameraId);
    return fetchApi<{ data: RecordingNodeAssignmentItem[] }>(`/v1/recording/failover/assignments?${qs.toString()}`);
  },

  assignCamera: (body: {
    cameraId: string;
    primaryNodeId: string;
    streamUri: string;
    streamProfile?: string;
    tenantId?: string;
  }) =>
    fetchApi<{ data: RecordingNodeAssignmentItem }>('/v1/recording/failover/assignments', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  triggerFailover: (body: {
    failedNodeId: string;
    reason?: 'HEARTBEAT_EXPIRED' | 'NODE_CRASH' | 'MANUAL_FAILOVER' | 'NETWORK_PARTITION' | 'HIGH_ERROR_RATE' | 'STORAGE_UNAVAILABLE';
  }) =>
    fetchApi<{
      data: {
        success: boolean;
        failedNodeId: string;
        standbyNodeId: string;
        affectedCameras: number;
        transferredCameras: number;
        totalRtoMs: number;
        newEpoch: number;
        event: RecordingFailoverEventItem;
      };
    }>('/v1/recording/failover/trigger', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  executeFailback: (body: { primaryNodeId: string; standbyNodeId: string }) =>
    fetchApi<{
      data: {
        success: boolean;
        primaryNodeId: string;
        standbyNodeId: string;
        restoredCameras: number;
        message: string;
      };
    }>('/v1/recording/failover/failback', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  checkLiveness: () =>
    fetchApi<{
      data: {
        expiredNodes: string[];
        failoverResults: Array<{
          success: boolean;
          failedNodeId: string;
          standbyNodeId: string;
          transferredCameras: number;
          totalRtoMs: number;
        }>;
      };
    }>('/v1/recording/failover/check-liveness', {
      method: 'POST',
    }),

  getEvents: (params?: { failedNodeId?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.failedNodeId) qs.append('failedNodeId', params.failedNodeId);
    if (params?.limit) qs.append('limit', String(params.limit));
    return fetchApi<{ data: RecordingFailoverEventItem[] }>(`/v1/recording/failover/events?${qs.toString()}`);
  },

  getMetrics: () =>
    fetchApi<{ data: RecordingFailoverMetricsItem }>('/v1/recording/failover/metrics'),
};

export { ApiError };




