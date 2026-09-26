/**
 * Shared TypeScript types for KryptoVision Connect
 */

export type CommunicationPresence = 'ONLINE' | 'OFFLINE' | 'BUSY' | 'IN_CALL' | 'UNAVAILABLE';

export type CommunicationCallStatus = 
  | 'INITIATING' 
  | 'RINGING' 
  | 'CONNECTING' 
  | 'CONNECTED' 
  | 'RECONNECTING' 
  | 'REJECTED' 
  | 'MISSED' 
  | 'CANCELLED' 
  | 'FAILED' 
  | 'ENDED';

export type CommunicationCallDirection = 'INBOUND' | 'OUTBOUND';

export type CommunicationDeviceType = 
  | 'BRANCH_SHARED' 
  | 'BRANCH_MOBILE' 
  | 'EMPLOYEE_MOBILE' 
  | 'EMPLOYEE_DESKTOP' 
  | 'EMERGENCY_DEVICE';

export type CommunicationDeviceStatus = 'PENDING' | 'ACTIVE' | 'REVOKED' | 'OFFLINE';

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

export interface CallInviteEvent {
  callId: string;
  direction: 'INBOUND' | 'OUTBOUND';
  sourceBranchId?: string;
  sourceBranchName?: string;
  sourceEmployeeId?: string;
  sourceEmployeeName?: string;
  sourceOperatorId?: string;
  targetBranchId?: string;
  targetEmployeeId?: string;
  context?: string;
}

export interface CallStatusEvent {
  callId: string;
  status: CommunicationCallStatus;
  answeredBy?: {
    deviceId?: string;
    operatorId?: string;
    employeeId?: string;
    employeeName?: string;
  };
  quality?: 'GOOD' | 'DEGRADED' | 'POOR';
  duration?: number;
  endReason?: string;
}

export interface MessageEvent {
  messageId: string;
  conversationId: string;
  senderName: string;
  body: string;
  createdAt: string;
}

export interface PresenceEvent {
  entityType: 'BRANCH' | 'EMPLOYEE' | 'OPERATOR';
  entityId: string;
  presence: CommunicationPresence;
}


// ============================================================================
// DEVICE MANAGEMENT TYPES
// ============================================================================

export interface CommunicationDevice {
  deviceId: string;
  tenantId: string;
  branchId: string;
  branchName?: string;
  deviceName: string;
  deviceType: CommunicationDeviceType;
  platform: string;
  status: CommunicationDeviceStatus;
  linkedEmployeeIds: string[];
  lastSeenAt?: string;
  enrolledAt: string;
  revokedAt?: string;
}

export interface CommunicationEnrollmentCode {
  codeId: string;
  tenantId: string;
  branchId: string;
  code: string;
  status: 'active' | 'used' | 'revoked' | 'expired';
  expiresAt: string;
  createdAt: string;
  usedAt?: string;
  revokedAt?: string;
  note?: string;
}

export interface CommunicationEmployee {
  employeeId: string;
  employeeName: string;
  employeeRole: string;
  branchId: string;
  branchName: string;
  presence: CommunicationPresence;
}
