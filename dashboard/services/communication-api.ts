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

export interface EmployeeContact {
  employeeId: string;
  employeeName: string;
  role?: string;
  branchId: string;
  branchName: string;
  presence: CommunicationPresence;
  onlineDeviceCount: number;
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
      const token = sessionStorage.getItem('activityAccessToken') || sessionStorage.getItem('accessToken') || localStorage.getItem('accessToken');
      if (token) {
        headers['x-sentinel-session'] = token;
        headers['Authorization'] = `Bearer ${token}`;
      }
    }
    
    return headers;
  }
  
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const response = await fetch(url, {
      ...options,
      headers: {
        ...this.getHeaders(),
        ...options.headers,
      },
      credentials: 'include',
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({
        error: 'Request failed',
        message: `HTTP ${response.status}`,
      }));
      throw new Error(error.message || error.error || 'Request failed');
    }
    
    return response.json();
  }
  
  // ============================================================================
  // DIRECTORY & PRESENCE
  // ============================================================================
  
  async getBranchDirectory(): Promise<BranchContact[]> {
    const response = await this.request<{ data: BranchContact[] }>(
      '/v1/communications/directory/branches'
    );
    return response.data;
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
  
  async callBranch(branchId: string, context?: string): Promise<CallSession> {
    const response = await this.request<{ data: CallSession }>(
      `/v1/communications/calls/branch/${encodeURIComponent(branchId)}`,
      {
        method: 'POST',
        body: JSON.stringify({ context }),
      }
    );
    return response.data;
  }
  
  async callEmployee(employeeId: string, context?: string): Promise<CallSession> {
    const response = await this.request<{ data: CallSession }>(
      `/v1/communications/calls/employee/${encodeURIComponent(employeeId)}`,
      {
        method: 'POST',
        body: JSON.stringify({ context }),
      }
    );
    return response.data;
  }
  
  async callVMS(employeeId?: string): Promise<CallSession> {
    const response = await this.request<{ data: CallSession }>(
      '/v1/communications/calls/soc',
      {
        method: 'POST',
        body: JSON.stringify({ employeeId }),
      }
    );
    return response.data;
  }
  
  async acceptCall(callId: string): Promise<{ call: CallSession; credentials: WebRTCCredentials }> {
    const response = await this.request<{ data: { call: CallSession; credentials: WebRTCCredentials } }>(
      `/v1/communications/calls/${encodeURIComponent(callId)}/accept`,
      {
        method: 'POST',
      }
    );
    return response.data;
  }
  
  async rejectCall(callId: string, reason?: string): Promise<CallSession> {
    const response = await this.request<{ data: CallSession }>(
      `/v1/communications/calls/${encodeURIComponent(callId)}/reject`,
      {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }
    );
    return response.data;
  }
  
  async cancelCall(callId: string): Promise<CallSession> {
    const response = await this.request<{ data: CallSession }>(
      `/v1/communications/calls/${encodeURIComponent(callId)}/cancel`,
      {
        method: 'POST',
      }
    );
    return response.data;
  }
  
  async endCall(callId: string): Promise<CallSession> {
    const response = await this.request<{ data: CallSession }>(
      `/v1/communications/calls/${encodeURIComponent(callId)}/end`,
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
    
    const response = await this.request<{ data: { calls: CallSession[]; total: number } }>(
      `/v1/communications/calls/history?${queryParams.toString()}`
    );
    return response.data;
  }
  
  // ============================================================================
  // MESSAGING
  // ============================================================================
  
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
    await this.request(
      '/v1/communications/devices/me/heartbeat',
      {
        method: 'POST',
      }
    );
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const communicationAPI = new CommunicationAPIClient();
