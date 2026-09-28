/**
 * KryptoVision Connect Communication API Service
 * 
 * Handles all REST API calls for the communication subsystem:
 * - Branch/Employee directory
 * - Presence status
 * - Call operations
 * - Messaging
 * - Device enrollment
 */

import type { CommunicationDevice, CommunicationEnrollmentCode } from '@/types/communication';

// ============================================================================
// TYPES
// ============================================================================

export type CommunicationPresence = 'ONLINE' | 'OFFLINE' | 'BUSY' | 'IN_CALL' | 'UNAVAILABLE';
export type CommunicationCallStatus = 'INITIATING' | 'RINGING' | 'CONNECTING' | 'CONNECTED' | 'RECONNECTING' | 'REJECTED' | 'MISSED' | 'CANCELLED' | 'FAILED' | 'ENDED';
export type CommunicationCallDirection = 'INBOUND' | 'OUTBOUND';
export type CommunicationDeviceType = 'BRANCH_SHARED' | 'BRANCH_MOBILE' | 'EMPLOYEE_MOBILE' | 'EMPLOYEE_DESKTOP' | 'EMERGENCY_DEVICE';

export interface BranchContact {
  branchId: string;
  branchName: string;
  branchCode?: string;
  presence: CommunicationPresence;
  onlineDeviceCount: number;
  totalDeviceCount: number;
  employees: EmployeeContact[];
}

export interface CommunicationEmployee {
  employeeId: string;
  employeeName: string;
  employeeRole: string;
  branchId: string;
  branchName: string;
  presence: CommunicationPresence;
}

export interface EmployeeContact {
  employeeId: string;
  employeeName: string;
  role?: string;
  branchId: string;
  branchName: string;
  presence: CommunicationPresence;
  onlineDeviceCount: number;
  deviceId?: string;
}

export interface CallSession {
  id: string;
  tenantId: string;
  direction: CommunicationCallDirection;
  status: CommunicationCallStatus;
  
  sourceBranchId?: string;
  sourceBranchName?: string;
  sourceEmployeeId?: string;
  sourceEmployeeName?: string;
  sourceDeviceId?: string;
  sourceOperatorId?: string;
  
  targetBranchId?: string;
  targetBranchName?: string;
  targetEmployeeId?: string;
  targetEmployeeName?: string;
  
  answeredDeviceId?: string;
  answeredOperatorId?: string;
  answeredEmployeeId?: string;
  
  mediaSessionId?: string;
  
  createdAt: string;
  ringingAt?: string;
  answeredAt?: string;
  endedAt?: string;
  
  duration?: number;
  endReason?: string;
  quality?: 'GOOD' | 'DEGRADED' | 'POOR';
  
  context?: string;
}

export interface WebRTCCredentials {
  participantToken: string;
  turnServers: {
    urls: string;
    username: string;
    credential: string;
  }[];
  iceServers: RTCIceServer[];
}

export interface StartedCall {
  call: CallSession;
  credentials: WebRTCCredentials;
}

export interface Conversation {
  id: string;
  type: 'BRANCH_SOC' | 'EMPLOYEE_SOC' | 'INCIDENT';
  branchId?: string;
  branchName?: string;
  employeeId?: string;
  employeeName?: string;
  lastMessageAt?: string;
  unreadCount: number;
}

export interface Message {
  id: string;
  conversationId: string;
  senderType: 'OPERATOR' | 'DEVICE' | 'EMPLOYEE';
  senderId: string;
  senderName?: string;
  body: string;
  createdAt: string;
  deliveredAt?: string;
  readAt?: string;
}

export interface DirectMessage {
  id: string;
  senderType: 'OPERATOR' | 'DEVICE';
  senderId: string;
  senderName?: string;
  recipientType: 'OPERATOR' | 'DEVICE' | 'BRANCH';
  recipientId: string;
  body: string;
  createdAt: string;
}

export interface DeviceEnrollmentCode {
  code: string;
  branchId: string;
  branchName: string;
  expiresAt: string;
}

// ============================================================================
// API CLIENT
// ============================================================================

class CommunicationAPIClient {
  private baseUrl = '';
  
  constructor() {
    // Base URL will be relative for same-origin requests
    this.baseUrl = typeof window !== 'undefined' ? '' : 'http://localhost:8080';
  }
  
  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    
    if (typeof window !== 'undefined') {
      const sessionToken = sessionStorage.getItem('activityAccessToken') || sessionStorage.getItem('accessToken') || localStorage.getItem('accessToken');
      if (sessionToken) {
        headers['x-sentinel-session'] = sessionToken;
        headers['Authorization'] = `Bearer ${sessionToken}`;
      }
    }
    
    return headers;
  }
  
  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    retried = false
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const deviceRequest = endpoint.startsWith('/v1/communications/device-') ||
      endpoint === '/v1/communications/calls/soc' ||
      /^\/v1\/communications\/devices\/[^/]+\/heartbeat$/.test(endpoint);
    const deviceToken = typeof window !== 'undefined' ? localStorage.getItem('commDeviceToken') : null;
    const authHeaders = { ...this.getHeaders(), ...(deviceRequest && deviceToken ? { Authorization: `Bearer ${deviceToken}`, 'x-device-token': deviceToken } : {}) };
    
    const response = await fetch(url, {
      ...options,
      headers: {
        ...authHeaders,
        ...options.headers,
      },
      credentials: 'include',
    });
    
    if (!response.ok) {
      if (response.status === 401 && deviceRequest && !retried && typeof window !== 'undefined') {
        const refreshToken = localStorage.getItem('commDeviceRefreshToken');
        if (refreshToken) {
          const refreshed = await fetch(`${this.baseUrl}/v1/communications/devices/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken }),
            credentials: 'include',
          });
          if (refreshed.ok) {
            const tokens = await refreshed.json();
            localStorage.setItem('commDeviceToken', tokens.accessToken);
            localStorage.setItem('commDeviceRefreshToken', tokens.refreshToken);
            window.dispatchEvent(new Event('comm-device-enrolled'));
            return this.request<T>(endpoint, options, true);
          }
          localStorage.removeItem('commDeviceToken');
          localStorage.removeItem('commDeviceRefreshToken');
        }
      }
      const error = await response.json().catch(() => ({
        error: 'Request failed',
        message: `HTTP ${response.status}`,
      }));
      throw new Error(error.message || error.error || 'Request failed');
    }
    
    if (response.status === 204) return undefined as T;
    return response.json();
  }
  
  // ============================================================================
  // DIRECTORY & PRESENCE
  // ============================================================================
  
  async getBranchDirectory(): Promise<BranchContact[]> {
    const response = await this.request<{ data: BranchContact[] }>('/v1/communications/directory/branches');
    return Array.isArray(response.data) ? response.data : [];
  }
  
  async getEmployeeDirectory(): Promise<{ data: CommunicationEmployee[] }> {
    return this.request<{ data: CommunicationEmployee[] }>('/v1/communications/directory/employees');
  }
  
  async getBranchPresence(branchId: string): Promise<{ presence: CommunicationPresence; devices: any[] }> {
    const response = await this.request<{ data: { presence: CommunicationPresence; devices: any[] } }>(
      `/v1/communications/presence/branch/${encodeURIComponent(branchId)}`
    );
    return response.data;
  }
  
  async getEmployeePresence(employeeId: string): Promise<{ presence: CommunicationPresence; devices: any[] }> {
    const response = await this.request<{ data: { presence: CommunicationPresence; devices: any[] } }>(
      `/v1/communications/presence/employee/${encodeURIComponent(employeeId)}`
    );
    return response.data;
  }
  
  async searchDirectory(query: string): Promise<{ branches: BranchContact[]; employees: EmployeeContact[] }> {
    const response = await this.request<{ data: { branches: BranchContact[]; employees: EmployeeContact[] } }>(
      `/v1/communications/directory/search?q=${encodeURIComponent(query)}`
    );
    return response.data;
  }
  
  // ============================================================================
  // CALL OPERATIONS
  // ============================================================================
  
  async callBranch(branchId: string, context?: string): Promise<StartedCall> {
    const response = await this.request<{ data: StartedCall }>(
      `/v1/communications/calls/branch/${encodeURIComponent(branchId)}`,
      {
        method: 'POST',
        body: JSON.stringify({ context }),
      }
    );
    return response.data;
  }
  
  async callEmployee(employeeId: string, context?: string): Promise<StartedCall> {
    const response = await this.request<{ data: StartedCall }>(
      `/v1/communications/calls/employee/${encodeURIComponent(employeeId)}`,
      {
        method: 'POST',
        body: JSON.stringify({ context }),
      }
    );
    return response.data;
  }

  async callRegisteredDevice(deviceId: string): Promise<StartedCall> {
    const response = await this.request<{ data: StartedCall }>(
      `/v1/communications/calls/device/${encodeURIComponent(deviceId)}`,
      { method: 'POST' }
    );
    return response.data;
  }
  
  async callVMS(employeeId?: string, context?: string): Promise<StartedCall> {
    const payload: { actorType: 'BRANCH_DEVICE' | 'EMPLOYEE'; actorEmployeeId?: string; context?: string } = {
      actorType: employeeId ? 'EMPLOYEE' : 'BRANCH_DEVICE',
      ...(employeeId ? { actorEmployeeId: employeeId } : {}),
      ...(context ? { context } : {}),
    };

    const response = await this.request<{ data: StartedCall }>(
      '/v1/communications/calls/soc',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
    return response.data;
  }

  /**
   * Password-less calls made by an enrolled device.  The backend derives the
   * device and tenant from its signed device credential; actorEmployeeId is
   * accepted only when it is an active, call-enabled device link.
   */
  async callDeviceBranch(branchId: string, actorEmployeeId?: string, context?: string): Promise<StartedCall> {
    const response = await this.request<{ data: StartedCall }>(
      `/v1/communications/device-calls/branch/${encodeURIComponent(branchId)}`,
      {
        method: 'POST',
        body: JSON.stringify({ actorEmployeeId, context }),
      }
    );
    return response.data;
  }

  async callDeviceEmployee(employeeId: string, actorEmployeeId?: string, context?: string): Promise<StartedCall> {
    const response = await this.request<{ data: StartedCall }>(
      `/v1/communications/device-calls/employee/${encodeURIComponent(employeeId)}`,
      {
        method: 'POST',
        body: JSON.stringify({ actorEmployeeId, context }),
      }
    );
    return response.data;
  }

  async callDeviceToDevice(deviceId: string, actorEmployeeId?: string): Promise<StartedCall> {
    const response = await this.request<{ data: StartedCall }>(
      `/v1/communications/device-calls/device/${encodeURIComponent(deviceId)}`,
      { method: 'POST', body: JSON.stringify({ actorEmployeeId }) }
    );
    return response.data;
  }

  async getDeviceDirectory(): Promise<{
    branches: BranchContact[];
    employees: EmployeeContact[];
    linkedEmployees: CommunicationEmployee[];
    vmsUsers: CommunicationEmployee[];
  }> {
    const response = await this.request<{
      data: {
        branches: BranchContact[];
        employees: EmployeeContact[];
        linkedEmployees: CommunicationEmployee[];
        vmsUsers: CommunicationEmployee[];
      };
    }>('/v1/communications/device-directory');
    return response.data;
  }
  
  async acceptCall(callId: string, isDevice = false): Promise<{ call: CallSession; credentials: WebRTCCredentials }> {
    const response = await this.request<{ data: { call: CallSession; credentials: WebRTCCredentials } }>(
      isDevice
        ? `/v1/communications/device-calls/${encodeURIComponent(callId)}/accept`
        : `/v1/communications/calls/${encodeURIComponent(callId)}/accept`,
      {
        method: 'POST',
      }
    );
    return response.data;
  }
  
  async rejectCall(callId: string, reason?: string, isDevice = false): Promise<CallSession> {
    const response = await this.request<{ data: CallSession }>(
      isDevice
        ? `/v1/communications/device-calls/${encodeURIComponent(callId)}/reject`
        : `/v1/communications/calls/${encodeURIComponent(callId)}/reject`,
      {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }
    );
    return response.data;
  }
  
  async cancelCall(callId: string, isDevice = false): Promise<CallSession> {
    const response = await this.request<{ data: CallSession }>(
      isDevice
        ? `/v1/communications/device-calls/${encodeURIComponent(callId)}/cancel`
        : `/v1/communications/calls/${encodeURIComponent(callId)}/cancel`,
      {
        method: 'POST',
      }
    );
    return response.data;
  }
  
  async endCall(callId: string, isDevice = false): Promise<CallSession> {
    const response = await this.request<{ data: CallSession }>(
      isDevice
        ? `/v1/communications/device-calls/${encodeURIComponent(callId)}/end`
        : `/v1/communications/calls/${encodeURIComponent(callId)}/end`,
      {
        method: 'POST',
      }
    );
    return response.data;
  }
  
  async getCallHistory(params?: {
    branchId?: string;
    employeeId?: string;
    status?: CommunicationCallStatus;
    direction?: CommunicationCallDirection;
    limit?: number;
    offset?: number;
  }): Promise<{ calls: CallSession[]; total: number }> {
    const queryParams = new URLSearchParams();
    if (params?.branchId) queryParams.set('branchId', params.branchId);
    if (params?.employeeId) queryParams.set('employeeId', params.employeeId);
    if (params?.status) queryParams.set('status', params.status);
    if (params?.direction) queryParams.set('direction', params.direction);
    if (params?.limit) queryParams.set('limit', params.limit.toString());
    if (params?.offset) queryParams.set('offset', params.offset.toString());
    
    const response = await this.request<{ data: CallSession[]; pagination: { total: number } }>(
      `/v1/communications/calls/history?${queryParams.toString()}`
    );
    return { calls: response.data, total: response.pagination.total };
  }
  
  // ============================================================================
  // MESSAGING
  // ============================================================================

  async getDirectMessages(isDevice = false): Promise<DirectMessage[]> {
    const response = await this.request<{ data: DirectMessage[] }>(
      isDevice ? '/v1/communications/device-direct-messages' : '/v1/communications/direct-messages'
    );
    return response.data;
  }

  async sendDirectMessage(recipientType: 'OPERATOR' | 'DEVICE' | 'BRANCH', recipientId: string, body: string, isDevice = false): Promise<DirectMessage> {
    const response = await this.request<{ data: DirectMessage }>(
      isDevice ? '/v1/communications/device-direct-messages' : '/v1/communications/direct-messages',
      { method: 'POST', body: JSON.stringify({ recipientType, recipientId, body }) }
    );
    return response.data;
  }
  
  async getConversations(): Promise<Conversation[]> {
    const response = await this.request<{ data: { conversations: Conversation[] } }>(
      '/v1/communications/conversations'
    );
    return response.data.conversations;
  }
  
  async getConversationMessages(
    conversationId: string,
    params?: { before?: string; limit?: number }
  ): Promise<{ messages: Message[] }> {
    const queryParams = new URLSearchParams();
    if (params?.before) queryParams.set('before', params.before);
    if (params?.limit) queryParams.set('limit', params.limit.toString());
    
    const response = await this.request<{ data: { messages: Message[] } }>(
      `/v1/communications/conversations/${encodeURIComponent(conversationId)}/messages?${queryParams.toString()}`
    );
    return response.data;
  }
  
  async sendMessage(conversationId: string, body: string): Promise<Message> {
    const response = await this.request<{ data: Message }>(
      `/v1/communications/conversations/${encodeURIComponent(conversationId)}/messages`,
      {
        method: 'POST',
        body: JSON.stringify({ body }),
      }
    );
    return response.data;
  }
  
  async messageBranch(branchId: string, body: string): Promise<{ conversation: Conversation; message: Message }> {
    const response = await this.request<{ data: { conversation: Conversation; message: Message } }>(
      `/v1/communications/conversations/branch/${encodeURIComponent(branchId)}`,
      {
        method: 'POST',
        body: JSON.stringify({ body }),
      }
    );
    return response.data;
  }
  
  async messageEmployee(employeeId: string, body: string): Promise<{ conversation: Conversation; message: Message }> {
    const response = await this.request<{ data: { conversation: Conversation; message: Message } }>(
      `/v1/communications/conversations/employee/${encodeURIComponent(employeeId)}`,
      {
        method: 'POST',
        body: JSON.stringify({ body }),
      }
    );
    return response.data;
  }
  
  async markMessageRead(messageId: string): Promise<void> {
    await this.request(
      `/v1/communications/messages/${encodeURIComponent(messageId)}/read`,
      {
        method: 'POST',
      }
    );
  }
  
  // ============================================================================
  // DEVICE ENROLLMENT (for Connect client)
  // ============================================================================
  
  async enrollDevice(params: {
    enrollmentCode: string;
    deviceName: string;
    platform: string;
    devicePublicKey: string;
    linkedEmployeeIds?: string[];
  }): Promise<{ deviceId: string; accessToken: string; refreshToken: string }> {
    const response = await this.request<{ data: { deviceId: string; accessToken: string; refreshToken: string } }>(
      '/v1/communications/devices/enroll',
      {
        method: 'POST',
        body: JSON.stringify(params),
      }
    );
    return response.data;
  }
  
  async deviceHeartbeat(): Promise<void> {
    const deviceId = typeof window !== 'undefined' ? localStorage.getItem('commDeviceId') : null;
    if (!deviceId) throw new Error('Device has not been enrolled');
    await this.request(
      `/v1/communications/devices/${encodeURIComponent(deviceId)}/heartbeat`,
      {
        method: 'POST',
        body: JSON.stringify({ appVersion: 'web', capabilities: { webrtc: true, microphone: true, speaker: true, camera: true } }),
      }
    );
  }

  async logoutDevice(): Promise<void> {
    await this.request<void>('/v1/communications/device-logout', { method: 'POST' });
  }
  
  // ============================================================================
  // ADMIN - ENROLLMENT CODE MANAGEMENT
  // ============================================================================
  
  async generateEnrollmentCode(params: {
    branchId: string;
    expiresInHours: number;
    allowedDeviceType: 'BRANCH_SHARED' | 'EMPLOYEE_MOBILE';
    note?: string;
  }): Promise<CommunicationEnrollmentCode> {
    const response = await this.request<{ id: string; code: string; branchId: string; expiresAt: string }>(
      '/v1/communications/enrollment-codes',
      {
        method: 'POST',
        body: JSON.stringify({
          branchId: params.branchId,
          allowedDeviceType: params.allowedDeviceType,
          expiresInMinutes: Math.max(1, Math.min(10080, Math.round(params.expiresInHours * 60))),
        }),
      }
    );
    return {
      codeId: response.id,
      tenantId: '',
      branchId: response.branchId,
      code: response.code,
      status: 'active',
      expiresAt: response.expiresAt,
      createdAt: new Date().toISOString(),
      note: params.note,
    };
  }
  
  async listEnrollmentCodes(): Promise<{ data: CommunicationEnrollmentCode[] }> {
    const response = await this.request<{ data: CommunicationEnrollmentCode[] }>(
      '/v1/communications/enrollment-codes',
      {
        method: 'GET',
      }
    );
    return response;
  }
  
  async revokeEnrollmentCode(codeId: string): Promise<void> {
    await this.request(
      `/v1/communications/enrollment-codes/${encodeURIComponent(codeId)}`,
      {
        method: 'DELETE',
      }
    );
  }
  
  // ============================================================================
  // ADMIN - DEVICE MANAGEMENT
  // ============================================================================
  
  async listDevices(): Promise<{ data: CommunicationDevice[] }> {
    const response = await this.request<{ data: CommunicationDevice[] }>(
      '/v1/communications/devices',
      {
        method: 'GET',
      }
    );
    return response;
  }
  
  async revokeDevice(deviceId: string): Promise<void> {
    await this.request(
      `/v1/communications/devices/${encodeURIComponent(deviceId)}/revoke`,
      {
        method: 'POST',
        body: JSON.stringify({ reason: 'Administrative action' }),
      }
    );
  }

  async approveDevice(deviceId: string): Promise<void> {
    await this.request(
      `/v1/communications/devices/${encodeURIComponent(deviceId)}/approve`,
      { method: 'POST' }
    );
  }
  
  async linkEmployeeToDevice(deviceId: string, employeeId: string): Promise<void> {
    await this.request(
      `/v1/communications/devices/${encodeURIComponent(deviceId)}/employees`,
      {
        method: 'POST',
        body: JSON.stringify({ employeeId }),
      }
    );
  }
  
  async unlinkEmployeeFromDevice(deviceId: string, employeeId: string): Promise<void> {
    await this.request(
      `/v1/communications/devices/${encodeURIComponent(deviceId)}/employees/${encodeURIComponent(employeeId)}`,
      {
        method: 'DELETE',
      }
    );
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const communicationAPI = new CommunicationAPIClient();
export const communicationApi = communicationAPI;
export default communicationAPI;
