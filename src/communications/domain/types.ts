/**
 * KryptoVision Connect - Core Domain Types
 * 
 * Type-safe domain models for the communication subsystem.
 * These types mirror the database schema and provide compile-time safety.
 */

// ============================================================================
// DEVICE TYPES
// ============================================================================

export type CommunicationDeviceType =
  | 'BRANCH_SHARED'      // Shared PC/workstation at branch
  | 'BRANCH_MOBILE'      // Branch-owned mobile device
  | 'EMPLOYEE_MOBILE'    // Employee personal mobile
  | 'EMPLOYEE_DESKTOP'   // Employee workstation
  | 'EMERGENCY_DEVICE';  // Emergency-only device

export type CommunicationDevicePlatform =
  | 'WINDOWS'
  | 'ANDROID'
  | 'IOS'
  | 'WEB';

export type CommunicationDeviceStatus =
  | 'PENDING'    // Awaiting approval
  | 'ACTIVE'     // Approved and active
  | 'OFFLINE'    // Currently offline
  | 'DISABLED'   // Temporarily disabled
  | 'REVOKED';   // Permanently revoked

export interface CommunicationDevice {
  id: string;
  tenantId: string;
  branchId: string;
  
  // Identity
  deviceName: string;
  deviceUuid: string;
  deviceType: CommunicationDeviceType;
  platform: CommunicationDevicePlatform;
  
  // Cryptographic identity
  publicKey: string;
  certificateId: string | null;
  credentialHash: string;
  
  // Status
  status: CommunicationDeviceStatus;
  statusReason: string | null;
  
  // Metadata
  appVersion: string | null;
  lastSeenAt: string | null;
  lastIp: string | null;
  deviceCapabilities: DeviceCapabilities;
  
  // Lifecycle
  registeredAt: string;
  approvedAt: string | null;
  approvedBy: string | null;
  revokedAt: string | null;
  revokedBy: string | null;
  revokeReason: string | null;
  
  createdAt: string;
  updatedAt: string;
}

export interface DeviceCapabilities {
  microphone?: boolean;
  speaker?: boolean;
  camera?: boolean;
  notifications?: boolean;
  webrtc?: boolean;
}

export interface DeviceEmployeeLink {
  id: string;
  deviceId: string;
  employeeId: string;
  tenantId: string;
  
  // Permissions
  isPrimary: boolean;
  canReceiveCalls: boolean;
  canMakeCalls: boolean;
  canReceiveMessages: boolean;
  canSendMessages: boolean;
  
  // Lifecycle
  linkedAt: string;
  linkedBy: string | null;
  unlinkedAt: string | null;
  unlinkedBy: string | null;
}

export interface EnrollmentCode {
  id: string;
  tenantId: string;
  branchId: string;
  
  code: string;
  codeHash: string;
  
  // Restrictions
  allowedDeviceType: CommunicationDeviceType | null;
  maxUses: number;
  usesCount: number;
  
  // Pre-assignment
  preAssignedEmployeeIds: string[] | null;
  
  // Lifecycle
  createdAt: string;
  createdBy: string;
  expiresAt: string;
  consumedAt: string | null;
}

// ============================================================================
// CALL TYPES
// ============================================================================

export type CommunicationCallDirection = 'INBOUND' | 'OUTBOUND';

export type CommunicationCallEntityType =
  | 'BRANCH'
  | 'EMPLOYEE'
  | 'OPERATOR'
  | 'DEVICE'
  | 'SOC_QUEUE';

export type CommunicationCallStatus =
  | 'INITIATING'    // Call being initiated
  | 'RINGING'       // Ringing on target devices
  | 'CONNECTING'    // Media negotiation in progress
  | 'CONNECTED'     // Call connected, audio established
  | 'RECONNECTING'  // Temporary connection loss
  | 'REJECTED'      // Call rejected by recipient
  | 'MISSED'        // Call not answered in time
  | 'CANCELLED'     // Call cancelled by caller
  | 'FAILED'        // Call failed (technical error)
  | 'ENDED';        // Call ended normally

export interface CallSession {
  id: string;
  tenantId: string;
  
  // Direction
  direction: CommunicationCallDirection;
  
  // Source (who initiated)
  sourceType: CommunicationCallEntityType;
  sourceBranchId: string | null;
  sourceEmployeeId: string | null;
  sourceDeviceId: string | null;
  sourceOperatorId: string | null;
  
  // Target (who was called)
  targetType: CommunicationCallEntityType;
  targetBranchId: string | null;
  targetEmployeeId: string | null;
  targetSocQueue: string | null;
  
  // Answered (first-answer-wins)
  answeredDeviceId: string | null;
  answeredOperatorId: string | null;
  
  // State
  status: CommunicationCallStatus;
  
  // Media
  mediaSessionId: string | null;
  mediaProvider: string | null;
  
  // Quality metrics
  qualityRttMs: number | null;
  qualityJitterMs: number | null;
  qualityPacketLossPercent: number | null;
  
  // Timeline
  createdAt: string;
  ringingAt: string | null;
  answeredAt: string | null;
  endedAt: string | null;
  
  // Duration
  durationSeconds: number | null;
  
  // End reason
  endReason: string | null;
  
  // Context
  context: CallContext | null;
}

export interface CallContext {
  incidentId?: string;
  alertId?: string;
  priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  notes?: string;
  [key: string]: unknown;
}

export type CommunicationParticipantType =
  | 'OPERATOR'
  | 'EMPLOYEE'
  | 'DEVICE';

export type CommunicationParticipantStatus =
  | 'INVITED'
  | 'RINGING'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'DISCONNECTED'
  | 'FAILED';

export interface CallParticipant {
  id: string;
  callId: string;
  tenantId: string;
  
  // Identity
  participantType: CommunicationParticipantType;
  operatorId: string | null;
  employeeId: string | null;
  deviceId: string | null;
  branchId: string | null;
  
  // State
  connectionStatus: CommunicationParticipantStatus;
  muteState: boolean;
  
  // Timeline
  joinedAt: string | null;
  leftAt: string | null;
}

// ============================================================================
// MESSAGING TYPES
// ============================================================================

export type CommunicationConversationType =
  | 'BRANCH_SOC'
  | 'EMPLOYEE_SOC'
  | 'INCIDENT';

export type CommunicationConversationStatus =
  | 'ACTIVE'
  | 'ARCHIVED'
  | 'CLOSED';

export interface Conversation {
  id: string;
  tenantId: string;
  
  // Type
  conversationType: CommunicationConversationType;
  
  // Participants
  branchId: string | null;
  employeeId: string | null;
  incidentId: string | null;
  
  // Metadata
  subject: string | null;
  
  // State
  status: CommunicationConversationStatus;
  
  // Timeline
  createdAt: string;
  lastMessageAt: string | null;
  closedAt: string | null;
}

export type CommunicationMemberType =
  | 'OPERATOR'
  | 'EMPLOYEE'
  | 'DEVICE';

export interface ConversationMember {
  id: string;
  conversationId: string;
  tenantId: string;
  
  // Identity
  memberType: CommunicationMemberType;
  operatorId: string | null;
  employeeId: string | null;
  deviceId: string | null;
  
  // Access
  canRead: boolean;
  canWrite: boolean;
  
  // Timeline
  joinedAt: string;
  leftAt: string | null;
}

export type CommunicationMessageSenderType =
  | 'OPERATOR'
  | 'EMPLOYEE'
  | 'DEVICE'
  | 'SYSTEM';

export type CommunicationMessageType =
  | 'TEXT'
  | 'IMAGE'
  | 'VOICE_NOTE'
  | 'SYSTEM';

export interface Message {
  id: string;
  tenantId: string;
  conversationId: string;
  
  // Sender
  senderType: CommunicationMessageSenderType;
  senderId: string | null;
  senderDeviceId: string | null;
  senderName: string | null;
  
  // Content
  messageType: CommunicationMessageType;
  body: string;
  attachments: MessageAttachment[] | null;
  
  // Metadata
  metadata: Record<string, unknown> | null;
  
  // Timeline
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
}

export interface MessageAttachment {
  id: string;
  type: 'IMAGE' | 'VOICE_NOTE' | 'FILE';
  url: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

export type CommunicationReceiptType =
  | 'DEVICE'
  | 'OPERATOR';

export interface MessageReceipt {
  id: string;
  messageId: string;
  tenantId: string;
  
  // Recipient
  recipientType: CommunicationReceiptType;
  deviceId: string | null;
  operatorId: string | null;
  
  // State
  deliveredAt: string | null;
  readAt: string | null;
}

// ============================================================================
// PRESENCE TYPES
// ============================================================================

export type PresenceStatus =
  | 'ONLINE'
  | 'OFFLINE'
  | 'BUSY'
  | 'IN_CALL'
  | 'UNAVAILABLE';

export interface DevicePresence {
  deviceId: string;
  tenantId: string;
  branchId: string;
  status: PresenceStatus;
  lastSeen: string;
  publicIp: string | null;
}

export interface EmployeePresence {
  employeeId: string;
  tenantId: string;
  status: PresenceStatus;
  onlineDeviceIds: string[];
  lastSeen: string;
}

export interface BranchPresence {
  branchId: string;
  tenantId: string;
  status: PresenceStatus;
  onlineDeviceIds: string[];
  onlineDeviceCount: number;
  lastSeen: string;
}

export interface OperatorPresence {
  operatorId: string;
  tenantId: string;
  status: PresenceStatus;
  lastSeen: string;
}

// ============================================================================
// WEBRTC / MEDIA TYPES
// ============================================================================

export interface TurnServer {
  urls: string[];
  username: string;
  credential: string;
  credentialType: 'password';
}

export interface MediaSession {
  sessionId: string;
  callId: string;
  turnServers: TurnServer[];
  createdAt: string;
  expiresAt: string;
}

export interface ParticipantToken {
  token: string;
  sessionId: string;
  participantId: string;
  canPublish: boolean;
  canSubscribe: boolean;
  expiresAt: string;
}

export interface SessionMetrics {
  sessionId: string;
  participantCount: number;
  avgRtt: number;
  avgJitter: number;
  avgPacketLoss: number;
  timestamp: string;
}

export interface QualityMetrics {
  rttMs: number;
  jitterMs: number;
  packetLossPercent: number;
  bitrateKbps: number;
  timestamp: string;
}

// ============================================================================
// INPUT/OUTPUT TYPES (DTOs)
// ============================================================================

export interface GenerateEnrollmentCodeInput {
  branchId: string;
  allowedDeviceType?: CommunicationDeviceType;
  expiresInMinutes?: number;
  maxUses?: number;
  preAssignedEmployeeIds?: string[];
  createdBy: string;
}

export interface EnrollDeviceInput {
  enrollmentCode: string;
  deviceName: string;
  platform: CommunicationDevicePlatform;
  publicKey: string;
  deviceUuid: string;
  linkedEmployeeIds?: string[];
  deviceCapabilities?: DeviceCapabilities;
}

export interface EnrolledDevice {
  device: CommunicationDevice;
  credential: string; // Only returned once, never stored plaintext
  certificate: string | null;
}

export interface LinkEmployeeInput {
  deviceId: string;
  employeeId: string;
  isPrimary?: boolean;
  canReceiveCalls?: boolean;
  canMakeCalls?: boolean;
  canReceiveMessages?: boolean;
  canSendMessages?: boolean;
  linkedBy: string;
}

export interface InitiateCallInput {
  tenantId: string;
  direction: CommunicationCallDirection;
  sourceType: CommunicationCallEntityType;
  sourceId: string; // branchId, employeeId, deviceId, or operatorId
  targetType: CommunicationCallEntityType;
  targetId: string; // branchId, employeeId, or socQueue
  context?: CallContext;
}

export interface AcceptCallInput {
  callId: string;
  acceptingDeviceId?: string;
  acceptingOperatorId?: string;
}

export interface RejectCallInput {
  callId: string;
  rejectingDeviceId?: string;
  rejectingOperatorId?: string;
  reason?: string;
}

export interface EndCallInput {
  callId: string;
  endedBy: string; // deviceId or operatorId
  reason?: string;
}

export interface SendMessageInput {
  tenantId: string;
  conversationId?: string; // If not provided, will create or find conversation
  conversationType?: CommunicationConversationType;
  targetBranchId?: string;
  targetEmployeeId?: string;
  senderType: CommunicationMessageSenderType;
  senderId: string;
  senderDeviceId?: string;
  senderName?: string;
  messageType?: CommunicationMessageType;
  body: string;
  attachments?: MessageAttachment[];
  metadata?: Record<string, unknown>;
}

export interface GetOrCreateConversationInput {
  tenantId: string;
  conversationType: CommunicationConversationType;
  branchId?: string;
  employeeId?: string;
  incidentId?: string;
}

// ============================================================================
// ROUTING TYPES
// ============================================================================

export interface CallableEntity {
  type: CommunicationCallEntityType;
  id: string;
  name: string;
  tenantId: string;
  branchId?: string;
}

export interface RoutingResult {
  targetDeviceIds: string[];
  targetOperatorIds: string[];
  routingPolicy: string;
}

export interface RoutingPolicy {
  socQueueId: string;
  fallbackToSupervisor: boolean;
  ringTimeoutSeconds: number;
}

// ============================================================================
// WEBSOCKET EVENT TYPES
// ============================================================================

export type SignalingEventType =
  // Call events
  | 'CALL_INVITE'
  | 'CALL_RINGING'
  | 'CALL_ACCEPT'
  | 'CALL_ACCEPTED_ELSEWHERE'
  | 'CALL_REJECT'
  | 'CALL_CANCEL'
  | 'CALL_CONNECTING'
  | 'CALL_CONNECTED'
  | 'CALL_MUTE'
  | 'CALL_UNMUTE'
  | 'CALL_RECONNECTING'
  | 'CALL_END'
  | 'CALL_FAILED'
  // Message events
  | 'MESSAGE_CREATED'
  | 'MESSAGE_DELIVERED'
  | 'MESSAGE_READ'
  // Presence events
  | 'DEVICE_ONLINE'
  | 'DEVICE_OFFLINE'
  | 'PRESENCE_CHANGED';

export interface SignalingEvent<T = unknown> {
  type: SignalingEventType;
  payload: T;
  timestamp: string;
}

export interface CallInvitePayload {
  callId: string;
  caller: CallerInfo;
  context?: CallContext;
  expiresAt: string;
}

export interface CallerInfo {
  type: CommunicationCallEntityType;
  id: string;
  name: string;
  branchName?: string;
}

export interface CallAcceptPayload {
  callId: string;
  mediaToken: string;
  turnServers: TurnServer[];
}

export interface CallAcceptedElsewherePayload {
  callId: string;
  answeredBy: string;
  answeredByType: 'DEVICE' | 'OPERATOR';
}

export interface CallEndPayload {
  callId: string;
  endReason: string;
  duration: number;
}

export interface MessageCreatedPayload {
  messageId: string;
  conversationId: string;
  sender: SenderInfo;
  body: string;
  messageType: CommunicationMessageType;
  createdAt: string;
}

export interface SenderInfo {
  type: CommunicationMessageSenderType;
  id: string;
  name: string;
}

export interface MessageDeliveredPayload {
  messageId: string;
  deviceId: string;
  deliveredAt: string;
}

export interface MessageReadPayload {
  messageId: string;
  readBy: string;
  readByType: 'DEVICE' | 'OPERATOR';
  readAt: string;
}

export interface PresenceChangedPayload {
  entityType: 'device' | 'employee' | 'branch' | 'operator';
  entityId: string;
  status: PresenceStatus;
}

// ============================================================================
// ERROR TYPES
// ============================================================================

export class CommunicationError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'CommunicationError';
  }
}

export class EnrollmentError extends CommunicationError {
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(code, message, details);
    this.name = 'EnrollmentError';
  }
}

export class CallError extends CommunicationError {
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(code, message, details);
    this.name = 'CallError';
  }
}

export class MessagingError extends CommunicationError {
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(code, message, details);
    this.name = 'MessagingError';
  }
}

// ============================================================================
// AUDIT EVENT TYPES
// ============================================================================

export type CommunicationAuditAction =
  | 'COMM_DEVICE_ENROLLMENT_CREATED'
  | 'COMM_DEVICE_ENROLLED'
  | 'COMM_DEVICE_APPROVED'
  | 'COMM_DEVICE_REVOKED'
  | 'COMM_EMPLOYEE_DEVICE_LINKED'
  | 'COMM_EMPLOYEE_DEVICE_UNLINKED'
  | 'COMM_CALL_STARTED'
  | 'COMM_CALL_RINGING'
  | 'COMM_CALL_ACCEPTED'
  | 'COMM_CALL_REJECTED'
  | 'COMM_CALL_MISSED'
  | 'COMM_CALL_CANCELLED'
  | 'COMM_CALL_ENDED'
  | 'COMM_CALL_FAILED'
  | 'COMM_MESSAGE_SENT'
  | 'COMM_MESSAGE_DELIVERED'
  | 'COMM_MESSAGE_READ';

export interface CommunicationAuditEvent {
  tenantId: string;
  action: CommunicationAuditAction;
  actorUserId: string | null;
  actorDeviceId: string | null;
  resourceType: 'device' | 'call' | 'message' | 'conversation';
  resourceId: string | null;
  resourceNodeId: string | null; // branchId for tenant isolation
  outcome: 'success' | 'failure' | 'denied';
  sourceIp?: string;
  correlationId: string;
  details?: Record<string, unknown>;
}

// ============================================================================
// VALIDATION TYPES
// ============================================================================

export interface EnrollmentCodeValidation {
  valid: boolean;
  reason?: string;
  tenantId?: string;
  branchId?: string;
  allowedDeviceType?: CommunicationDeviceType;
  preAssignedEmployeeIds?: string[];
}

export interface LinkValidation {
  valid: boolean;
  reason?: string;
  employeeBelongsToBranch?: boolean;
  employeeBelongsToTenant?: boolean;
}

export interface CertificateValidation {
  valid: boolean;
  reason?: string;
  deviceId?: string;
  expiresAt?: string;
}

// ============================================================================
// PAGINATION & FILTERING
// ============================================================================

export interface Pagination {
  limit: number;
  offset: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface CallHistoryFilters {
  branchId?: string;
  employeeId?: string;
  deviceId?: string;
  operatorId?: string;
  status?: CommunicationCallStatus;
  direction?: CommunicationCallDirection;
  fromDate?: string;
  toDate?: string;
}

export interface ConversationFilters {
  branchId?: string;
  employeeId?: string;
  conversationType?: CommunicationConversationType;
  status?: CommunicationConversationStatus;
}

export interface MessageFilters {
  conversationId: string;
  fromDate?: string;
  toDate?: string;
  senderType?: CommunicationMessageSenderType;
}
