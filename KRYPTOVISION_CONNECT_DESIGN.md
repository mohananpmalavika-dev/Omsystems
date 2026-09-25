# KryptoVision Connect - Design Specification

## Architecture Overview

KryptoVision Connect integrates into the existing KryptoVision VMS architecture as a first-class communication subsystem. It reuses existing infrastructure (PostgreSQL, Redis, WebSocket, audit, authentication) and follows established patterns.

```
┌─────────────────────────────────────────────────────────────────┐
│                     KryptoVision VMS                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │  Dashboard   │  │ Control Plane│  │Analytics Eng │         │
│  │  (Next.js)   │  │   (Fastify)  │  │              │         │
│  └──────┬───────┘  └──────┬───────┘  └──────────────┘         │
│         │                  │                                     │
│         │        ┌─────────┴──────────┐                        │
│         │        │                      │                        │
│    ┌────▼────────▼──────────┐   ┌─────▼──────────┐            │
│    │  Communication Routes   │   │  WebSocket     │            │
│    │  /v1/communications/*  │   │  Gateway       │            │
│    └────┬────────────────────┘   └─────┬──────────┘            │
│         │                               │                        │
│    ┌────▼───────────────────────────────▼──────────┐           │
│    │     Communication Services Layer               │           │
│    │  • DeviceEnrollmentService                     │           │
│    │  • CommunicationCallService                    │           │
│    │  • CommunicationMessagingService               │           │
│    │  • CommunicationPresenceService                │           │
│    │  • CommunicationSignalingGateway               │           │
│    └────┬──────────────────────┬─────────────┬──────┘           │
│         │                      │             │                   │
│    ┌────▼──────┐      ┌───────▼─────┐  ┌───▼──────────┐       │
│    │PostgreSQL │      │    Redis    │  │  WebRTC/TURN │       │
│    │ (Durable) │      │(Distributed)│  │   Provider   │       │
│    └───────────┘      └─────────────┘  └──────────────┘       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ WebSocket + REST + WebRTC
                              │
            ┌─────────────────┴──────────────────┐
            │                                     │
   ┌────────▼────────┐               ┌───────────▼──────────┐
   │ Branch Devices  │               │   Mobile Devices     │
   │ • Windows PC    │               │ • Android (employee) │
   │ • Branch Tablet │               │ • iOS (employee)     │
   └─────────────────┘               └──────────────────────┘
```

## Database Schema Design

### 1. Core Tables

#### 1.1 communication_devices
Primary device registry table.

```sql
CREATE TABLE communication_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  branch_id UUID NOT NULL REFERENCES resource_nodes(id),
  
  -- Device identity
  device_name VARCHAR(120) NOT NULL,
  device_uuid VARCHAR(64) NOT NULL UNIQUE, -- Client-generated persistent ID
  device_type VARCHAR(32) NOT NULL, -- BRANCH_SHARED, EMPLOYEE_MOBILE, etc.
  platform VARCHAR(32) NOT NULL, -- WINDOWS, ANDROID, IOS
  
  -- Cryptographic identity
  public_key TEXT NOT NULL, -- Device public key for authentication
  certificate_id VARCHAR(64), -- Server-issued certificate identifier
  credential_hash VARCHAR(64) NOT NULL, -- Hashed device credential
  
  -- Status
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING', -- PENDING, ACTIVE, OFFLINE, DISABLED, REVOKED
  status_reason TEXT,
  
  -- Metadata
  app_version VARCHAR(40),
  last_seen_at TIMESTAMPTZ,
  last_ip INET,
  
  -- Lifecycle
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES users(id),
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES users(id),
  revoke_reason TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT fk_device_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_device_branch FOREIGN KEY (branch_id) REFERENCES resource_nodes(id),
  CONSTRAINT ck_device_type CHECK (device_type IN (
    'BRANCH_SHARED', 'BRANCH_MOBILE', 'EMPLOYEE_MOBILE', 
    'EMPLOYEE_DESKTOP', 'EMERGENCY_DEVICE'
  )),
  CONSTRAINT ck_device_platform CHECK (platform IN ('WINDOWS', 'ANDROID', 'IOS', 'WEB')),
  CONSTRAINT ck_device_status CHECK (status IN (
    'PENDING', 'ACTIVE', 'OFFLINE', 'DISABLED', 'REVOKED'
  ))
);

CREATE INDEX idx_comm_devices_tenant_branch ON communication_devices(tenant_id, branch_id);
CREATE INDEX idx_comm_devices_status ON communication_devices(status) WHERE status != 'REVOKED';
CREATE INDEX idx_comm_devices_last_seen ON communication_devices(last_seen_at) WHERE status = 'ACTIVE';
CREATE UNIQUE INDEX idx_comm_devices_device_uuid ON communication_devices(device_uuid);
CREATE UNIQUE INDEX idx_comm_devices_credential ON communication_devices(credential_hash);
```

#### 1.2 communication_device_employees
Many-to-many mapping between devices and employees.

```sql
CREATE TABLE communication_device_employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES communication_devices(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  
  -- Permissions
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  can_receive_calls BOOLEAN NOT NULL DEFAULT TRUE,
  can_make_calls BOOLEAN NOT NULL DEFAULT TRUE,
  can_receive_messages BOOLEAN NOT NULL DEFAULT TRUE,
  can_send_messages BOOLEAN NOT NULL DEFAULT TRUE,
  
  -- Lifecycle
  linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  linked_by UUID REFERENCES users(id),
  unlinked_at TIMESTAMPTZ,
  unlinked_by UUID REFERENCES users(id),
  
  CONSTRAINT uq_device_employee UNIQUE (device_id, employee_id),
  CONSTRAINT ck_one_primary_per_device UNIQUE (device_id, is_primary) 
    WHERE is_primary = TRUE AND unlinked_at IS NULL
);

CREATE INDEX idx_comm_device_employees_device ON communication_device_employees(device_id) 
  WHERE unlinked_at IS NULL;
CREATE INDEX idx_comm_device_employees_employee ON communication_device_employees(employee_id) 
  WHERE unlinked_at IS NULL;
CREATE INDEX idx_comm_device_employees_tenant ON communication_device_employees(tenant_id);
```

#### 1.3 communication_enrollment_codes
One-time enrollment codes for device registration.

```sql
CREATE TABLE communication_enrollment_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  branch_id UUID NOT NULL REFERENCES resource_nodes(id),
  
  -- Code
  code VARCHAR(32) NOT NULL UNIQUE, -- e.g., "KLM01-X7P9-42MK"
  code_hash VARCHAR(64) NOT NULL UNIQUE, -- SHA-256 of code for lookup
  
  -- Restrictions
  allowed_device_type VARCHAR(32), -- NULL = any type allowed
  max_uses INTEGER DEFAULT 1, -- 0 = unlimited
  uses_count INTEGER NOT NULL DEFAULT 0,
  
  -- Optional pre-assignment
  pre_assigned_employee_ids UUID[], -- NULL = link during enrollment
  
  -- Lifecycle
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID NOT NULL REFERENCES users(id),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  
  CONSTRAINT ck_enrollment_device_type CHECK (
    allowed_device_type IS NULL OR allowed_device_type IN (
      'BRANCH_SHARED', 'BRANCH_MOBILE', 'EMPLOYEE_MOBILE', 
      'EMPLOYEE_DESKTOP', 'EMERGENCY_DEVICE'
    )
  )
);

CREATE INDEX idx_comm_enrollment_codes_hash ON communication_enrollment_codes(code_hash);
CREATE INDEX idx_comm_enrollment_codes_branch ON communication_enrollment_codes(branch_id);
CREATE INDEX idx_comm_enrollment_codes_expires ON communication_enrollment_codes(expires_at) 
  WHERE consumed_at IS NULL;
```

#### 1.4 communication_call_sessions
Call session state and history.

```sql
CREATE TABLE communication_call_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  
  -- Direction
  direction VARCHAR(16) NOT NULL, -- INBOUND, OUTBOUND
  
  -- Source (who initiated)
  source_type VARCHAR(32) NOT NULL, -- BRANCH, EMPLOYEE, OPERATOR, DEVICE
  source_branch_id UUID REFERENCES resource_nodes(id),
  source_employee_id UUID REFERENCES users(id),
  source_device_id UUID REFERENCES communication_devices(id),
  source_operator_id UUID REFERENCES users(id),
  
  -- Target (who was called)
  target_type VARCHAR(32) NOT NULL, -- BRANCH, EMPLOYEE, SOC_QUEUE
  target_branch_id UUID REFERENCES resource_nodes(id),
  target_employee_id UUID REFERENCES users(id),
  target_soc_queue VARCHAR(64),
  
  -- Answered device/operator
  answered_device_id UUID REFERENCES communication_devices(id),
  answered_operator_id UUID REFERENCES users(id),
  
  -- State
  status VARCHAR(32) NOT NULL,
  
  -- Media
  media_session_id VARCHAR(128), -- WebRTC provider session ID
  media_provider VARCHAR(64), -- e.g., "mediasoup", "janus", "self-hosted"
  
  -- Quality metrics
  quality_rtt_ms INTEGER,
  quality_jitter_ms INTEGER,
  quality_packet_loss_percent DECIMAL(5,2),
  
  -- Timeline
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ringing_at TIMESTAMPTZ,
  answered_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  
  -- Duration
  duration_seconds INTEGER,
  
  -- End reason
  end_reason VARCHAR(64), -- NORMAL, CANCELLED, REJECTED, TIMEOUT, NETWORK_ERROR, etc.
  
  CONSTRAINT ck_call_direction CHECK (direction IN ('INBOUND', 'OUTBOUND')),
  CONSTRAINT ck_call_source_type CHECK (source_type IN (
    'BRANCH', 'EMPLOYEE', 'OPERATOR', 'DEVICE'
  )),
  CONSTRAINT ck_call_target_type CHECK (target_type IN (
    'BRANCH', 'EMPLOYEE', 'SOC_QUEUE'
  )),
  CONSTRAINT ck_call_status CHECK (status IN (
    'INITIATING', 'RINGING', 'CONNECTING', 'CONNECTED', 
    'RECONNECTING', 'REJECTED', 'MISSED', 'CANCELLED', 
    'FAILED', 'ENDED'
  ))
);

CREATE INDEX idx_comm_calls_tenant ON communication_call_sessions(tenant_id, created_at DESC);
CREATE INDEX idx_comm_calls_source_branch ON communication_call_sessions(source_branch_id, created_at DESC);
CREATE INDEX idx_comm_calls_target_branch ON communication_call_sessions(target_branch_id, created_at DESC);
CREATE INDEX idx_comm_calls_status ON communication_call_sessions(status, created_at DESC) 
  WHERE status NOT IN ('ENDED', 'FAILED', 'CANCELLED', 'REJECTED', 'MISSED');
CREATE INDEX idx_comm_calls_answered_device ON communication_call_sessions(answered_device_id);
```

#### 1.5 communication_call_participants
Individual participants in calls (for future multi-party support).

```sql
CREATE TABLE communication_call_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id UUID NOT NULL REFERENCES communication_call_sessions(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  
  -- Participant identity
  participant_type VARCHAR(32) NOT NULL, -- OPERATOR, EMPLOYEE, DEVICE
  operator_id UUID REFERENCES users(id),
  employee_id UUID REFERENCES users(id),
  device_id UUID REFERENCES communication_devices(id),
  branch_id UUID REFERENCES resource_nodes(id),
  
  -- State
  connection_status VARCHAR(32) NOT NULL DEFAULT 'INVITED',
  mute_state BOOLEAN NOT NULL DEFAULT FALSE,
  
  -- Timeline
  joined_at TIMESTAMPTZ,
  left_at TIMESTAMPTZ,
  
  CONSTRAINT ck_participant_type CHECK (participant_type IN (
    'OPERATOR', 'EMPLOYEE', 'DEVICE'
  )),
  CONSTRAINT ck_participant_connection_status CHECK (connection_status IN (
    'INVITED', 'RINGING', 'CONNECTING', 'CONNECTED', 'DISCONNECTED', 'FAILED'
  ))
);

CREATE INDEX idx_comm_call_participants_call ON communication_call_participants(call_id);
CREATE INDEX idx_comm_call_participants_device ON communication_call_participants(device_id);
CREATE INDEX idx_comm_call_participants_operator ON communication_call_participants(operator_id);
```

#### 1.6 communication_conversations
Persistent conversation threads.

```sql
CREATE TABLE communication_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  
  -- Type
  conversation_type VARCHAR(32) NOT NULL, -- BRANCH_SOC, EMPLOYEE_SOC, INCIDENT
  
  -- Participants
  branch_id UUID REFERENCES resource_nodes(id),
  employee_id UUID REFERENCES users(id),
  incident_id UUID, -- Optional link to incident system
  
  -- Metadata
  subject VARCHAR(255),
  
  -- State
  status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  
  -- Timeline
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_message_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  
  CONSTRAINT ck_conversation_type CHECK (conversation_type IN (
    'BRANCH_SOC', 'EMPLOYEE_SOC', 'INCIDENT'
  )),
  CONSTRAINT ck_conversation_status CHECK (status IN ('ACTIVE', 'ARCHIVED', 'CLOSED'))
);

CREATE INDEX idx_comm_conversations_tenant ON communication_conversations(tenant_id, last_message_at DESC);
CREATE INDEX idx_comm_conversations_branch ON communication_conversations(branch_id, last_message_at DESC);
CREATE INDEX idx_comm_conversations_employee ON communication_conversations(employee_id, last_message_at DESC);
CREATE INDEX idx_comm_conversations_incident ON communication_conversations(incident_id);
CREATE UNIQUE INDEX idx_comm_conversations_branch_soc ON communication_conversations(tenant_id, branch_id) 
  WHERE conversation_type = 'BRANCH_SOC' AND status = 'ACTIVE';
CREATE UNIQUE INDEX idx_comm_conversations_employee_soc ON communication_conversations(tenant_id, employee_id) 
  WHERE conversation_type = 'EMPLOYEE_SOC' AND status = 'ACTIVE';
```

#### 1.7 communication_conversation_members
Tracks who has access to a conversation.

```sql
CREATE TABLE communication_conversation_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES communication_conversations(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  
  -- Member identity
  member_type VARCHAR(32) NOT NULL, -- OPERATOR, EMPLOYEE, DEVICE
  operator_id UUID REFERENCES users(id),
  employee_id UUID REFERENCES users(id),
  device_id UUID REFERENCES communication_devices(id),
  
  -- Access
  can_read BOOLEAN NOT NULL DEFAULT TRUE,
  can_write BOOLEAN NOT NULL DEFAULT TRUE,
  
  -- Timeline
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  left_at TIMESTAMPTZ,
  
  CONSTRAINT ck_member_type CHECK (member_type IN ('OPERATOR', 'EMPLOYEE', 'DEVICE'))
);

CREATE INDEX idx_comm_conv_members_conversation ON communication_conversation_members(conversation_id) 
  WHERE left_at IS NULL;
CREATE INDEX idx_comm_conv_members_operator ON communication_conversation_members(operator_id) 
  WHERE left_at IS NULL;
CREATE INDEX idx_comm_conv_members_employee ON communication_conversation_members(employee_id) 
  WHERE left_at IS NULL;
CREATE INDEX idx_comm_conv_members_device ON communication_conversation_members(device_id) 
  WHERE left_at IS NULL;
```

#### 1.8 communication_messages
Individual messages in conversations.

```sql
CREATE TABLE communication_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  conversation_id UUID NOT NULL REFERENCES communication_conversations(id) ON DELETE CASCADE,
  
  -- Sender
  sender_type VARCHAR(32) NOT NULL, -- OPERATOR, EMPLOYEE, DEVICE, SYSTEM
  sender_id UUID, -- user.id or device.id
  sender_device_id UUID REFERENCES communication_devices(id),
  sender_name VARCHAR(120), -- Denormalized for display
  
  -- Content
  message_type VARCHAR(32) NOT NULL DEFAULT 'TEXT',
  body TEXT NOT NULL,
  attachments JSONB, -- Future: image URLs, etc.
  
  -- Metadata
  metadata JSONB, -- Client metadata, reply references, etc.
  
  -- Timeline
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  edited_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  
  CONSTRAINT ck_message_sender_type CHECK (sender_type IN (
    'OPERATOR', 'EMPLOYEE', 'DEVICE', 'SYSTEM'
  )),
  CONSTRAINT ck_message_type CHECK (message_type IN (
    'TEXT', 'IMAGE', 'VOICE_NOTE', 'SYSTEM'
  ))
);

CREATE INDEX idx_comm_messages_conversation ON communication_messages(conversation_id, created_at DESC);
CREATE INDEX idx_comm_messages_tenant ON communication_messages(tenant_id, created_at DESC);
CREATE INDEX idx_comm_messages_sender ON communication_messages(sender_id, created_at DESC);
```

#### 1.9 communication_message_receipts
Delivery and read tracking.

```sql
CREATE TABLE communication_message_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES communication_messages(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  
  -- Recipient
  recipient_type VARCHAR(32) NOT NULL, -- DEVICE, OPERATOR
  device_id UUID REFERENCES communication_devices(id),
  operator_id UUID REFERENCES users(id),
  
  -- State
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  
  CONSTRAINT ck_receipt_recipient_type CHECK (recipient_type IN ('DEVICE', 'OPERATOR')),
  CONSTRAINT uq_message_recipient UNIQUE (message_id, recipient_type, device_id, operator_id)
);

CREATE INDEX idx_comm_receipts_message ON communication_message_receipts(message_id);
CREATE INDEX idx_comm_receipts_device ON communication_message_receipts(device_id);
CREATE INDEX idx_comm_receipts_operator ON communication_message_receipts(operator_id);
CREATE INDEX idx_comm_receipts_undelivered ON communication_message_receipts(message_id) 
  WHERE delivered_at IS NULL;
```

### 2. Redis Keys Design

#### 2.1 Presence Keys
```
comm:presence:device:{tenantId}:{deviceId}
  TTL: 90 seconds
  Value: JSON { status, lastSeen, publicIp }

comm:presence:employee:{tenantId}:{employeeId}
  TTL: 90 seconds  
  Value: JSON { onlineDeviceIds[], lastSeen }

comm:presence:branch:{tenantId}:{branchId}
  TTL: 90 seconds
  Value: JSON { onlineDeviceIds[], lastSeen }

comm:presence:operator:{tenantId}:{operatorId}
  TTL: 90 seconds
  Value: JSON { status, lastSeen }
```

#### 2.2 Call State Keys
```
comm:call:{tenantId}:{callId}
  TTL: 3600 seconds
  Value: JSON { status, participants[], mediaSessionId, createdAt }

comm:call-answer-lock:{tenantId}:{callId}
  TTL: 30 seconds
  Value: deviceId or operatorId (first-answer-wins)

comm:call-ringing:{tenantId}:{callId}
  Set members: device/operator IDs currently ringing
  TTL: 60 seconds
```

#### 2.3 Message Queue Keys
```
comm:message-queue:{tenantId}:{deviceId}
  List of pending message IDs for offline device
  No TTL (durable until delivered)
```

#### 2.4 WebSocket Session Keys
```
comm:ws-session:{sessionId}
  TTL: 3600 seconds
  Value: JSON { userId, deviceId, tenantId, connectedAt }

comm:ws-user-sessions:{tenantId}:{userId}
  Set of active WebSocket session IDs
  TTL: 3600 seconds
```

## Service Layer Architecture

### 3. Domain Services

#### 3.1 DeviceEnrollmentService
**Responsibilities:**
- Generate enrollment codes
- Validate enrollment requests
- Register devices
- Issue device credentials
- Manage device approvals

**Key Methods:**
```typescript
interface DeviceEnrollmentService {
  generateEnrollmentCode(input: GenerateEnrollmentCodeInput): Promise<EnrollmentCode>;
  validateEnrollmentCode(code: string): Promise<EnrollmentCodeValidation>;
  enrollDevice(input: EnrollDeviceInput): Promise<EnrolledDevice>;
  approveDevice(deviceId: string, approverId: string): Promise<Device>;
  revokeDevice(deviceId: string, revokerId: string, reason: string): Promise<void>;
  getDeviceByCredential(credentialHash: string): Promise<Device | null>;
}
```

#### 3.2 DeviceCredentialService
**Responsibilities:**
- Hash and verify device credentials
- Manage device certificates
- Handle credential rotation
- Verify device authenticity

**Key Methods:**
```typescript
interface DeviceCredentialService {
  hashCredential(credential: string): string;
  verifyCredential(credential: string, hash: string): boolean;
  generateDeviceCertificate(deviceId: string, publicKey: string): Promise<string>;
  validateDeviceCertificate(certificate: string): Promise<CertificateValidation>;
  rotateCredential(deviceId: string): Promise<NewCredential>;
}
```

#### 3.3 EmployeeDeviceLinkService
**Responsibilities:**
- Link employees to devices
- Validate employee-device compatibility
- Manage link permissions
- Unlink employees

**Key Methods:**
```typescript
interface EmployeeDeviceLinkService {
  linkEmployee(input: LinkEmployeeInput): Promise<DeviceEmployeeLink>;
  unlinkEmployee(deviceId: string, employeeId: string, unlinkerId: string): Promise<void>;
  getDeviceEmployees(deviceId: string): Promise<Employee[]>;
  getEmployeeDevices(employeeId: string): Promise<Device[]>;
  validateLink(deviceId: string, employeeId: string): Promise<LinkValidation>;
}
```

#### 3.4 CommunicationPresenceService
**Responsibilities:**
- Track device/employee/operator online status
- Update presence via heartbeats
- Query presence status
- Compute branch online status

**Key Methods:**
```typescript
interface CommunicationPresenceService {
  updateDevicePresence(deviceId: string, status: PresenceStatus): Promise<void>;
  getDevicePresence(deviceId: string): Promise<Presence | null>;
  getBranchPresence(branchId: string): Promise<BranchPresence>;
  getEmployeePresence(employeeId: string): Promise<EmployeePresence>;
  getOnlineDevicesForBranch(branchId: string): Promise<Device[]>;
}
```

#### 3.5 CommunicationDirectoryService
**Responsibilities:**
- Resolve callable identities
- Find devices for branch/employee
- Query communication eligibility

**Key Methods:**
```typescript
interface CommunicationDirectoryService {
  resolveCallableIdentity(identity: string): Promise<CallableEntity>;
  getDevicesForBranch(branchId: string): Promise<Device[]>;
  getDevicesForEmployee(employeeId: string): Promise<Device[]>;
  getSOCOperators(tenantId: string, queue?: string): Promise<Operator[]>;
}
```

#### 3.6 CommunicationCallService
**Responsibilities:**
- Create call sessions
- Manage call state transitions
- Handle call routing
- Track call participants

**Key Methods:**
```typescript
interface CommunicationCallService {
  initiateCall(input: InitiateCallInput): Promise<CallSession>;
  acceptCall(callId: string, acceptingDeviceId: string): Promise<CallSession>;
  rejectCall(callId: string, rejectingDeviceId: string, reason: string): Promise<void>;
  endCall(callId: string, endedBy: string): Promise<CallSession>;
  getCallSession(callId: string): Promise<CallSession | null>;
  updateCallQuality(callId: string, metrics: QualityMetrics): Promise<void>;
}
```

#### 3.7 CommunicationCallRoutingService
**Responsibilities:**
- Route calls to appropriate targets
- Implement routing policies
- Handle SOC queue logic

**Key Methods:**
```typescript
interface CommunicationCallRoutingService {
  routeToSocQueue(input: RouteToSocInput): Promise<RoutingResult>;
  routeToBranch(branchId: string): Promise<RoutingResult>;
  routeToEmployee(employeeId: string): Promise<RoutingResult>;
  getRoutingPolicy(tenantId: string): Promise<RoutingPolicy>;
}
```

#### 3.8 CommunicationCallStateMachine
**Responsibilities:**
- Enforce valid state transitions
- Prevent invalid operations
- Coordinate distributed state

**Key Methods:**
```typescript
interface CommunicationCallStateMachine {
  transition(callId: string, from: CallStatus, to: CallStatus): Promise<boolean>;
  canTransition(from: CallStatus, to: CallStatus): boolean;
  getCurrentState(callId: string): Promise<CallStatus>;
  lockCallForAnswer(callId: string, answeringParty: string): Promise<boolean>;
  releaseCallLock(callId: string): Promise<void>;
}
```

#### 3.9 CommunicationMessagingService
**Responsibilities:**
- Create and send messages
- Manage conversations
- Track delivery status
- Handle offline queuing

**Key Methods:**
```typescript
interface CommunicationMessagingService {
  sendMessage(input: SendMessageInput): Promise<Message>;
  getConversation(conversationId: string): Promise<Conversation | null>;
  getOrCreateConversation(input: GetOrCreateConversationInput): Promise<Conversation>;
  getMessages(conversationId: string, pagination: Pagination): Promise<Message[]>;
  markAsDelivered(messageId: string, deviceId: string): Promise<void>;
  markAsRead(messageId: string, recipientId: string): Promise<void>;
  getUndeliveredMessages(deviceId: string): Promise<Message[]>;
}
```

#### 3.10 CommunicationSignalingGateway
**Responsibilities:**
- Manage WebSocket connections
- Authenticate WebSocket clients
- Broadcast signaling events
- Route events to correct recipients

**Key Methods:**
```typescript
interface CommunicationSignalingGateway {
  broadcastToDevices(deviceIds: string[], event: SignalingEvent): Promise<void>;
  broadcastToOperators(operatorIds: string[], event: SignalingEvent): Promise<void>;
  broadcastToBranch(branchId: string, event: SignalingEvent): Promise<void>;
  sendToDevice(deviceId: string, event: SignalingEvent): Promise<void>;
  registerConnection(sessionId: string, connection: WebSocket): void;
  unregisterConnection(sessionId: string): void;
}
```

#### 3.11 CommunicationPushService
**Responsibilities:**
- Send push notifications for calls/messages
- Handle platform-specific push (FCM, APNS)
- Manage device push tokens

**Key Methods:**
```typescript
interface CommunicationPushService {
  sendCallNotification(deviceId: string, call: CallSession): Promise<void>;
  sendMessageNotification(deviceId: string, message: Message): Promise<void>;
  registerPushToken(deviceId: string, token: string, platform: string): Promise<void>;
  unregisterPushToken(deviceId: string): Promise<void>;
}
```

#### 3.12 CommunicationAuditService
**Responsibilities:**
- Log all communication events
- Integrate with existing audit system
- Ensure audit immutability

**Key Methods:**
```typescript
interface CommunicationAuditService {
  logDeviceEnrollment(event: DeviceEnrollmentEvent): Promise<void>;
  logCallEvent(event: CallEvent): Promise<void>;
  logMessageEvent(event: MessageEvent): Promise<void>;
  logDeviceAction(event: DeviceActionEvent): Promise<void>;
  queryAuditLog(filters: AuditFilters): Promise<AuditEntry[]>;
}
```

### 4. WebRTC Media Provider Abstraction

#### 4.1 VoiceMediaProvider Interface
```typescript
export interface VoiceMediaProvider {
  /**
   * Create a new media session for a call
   */
  createSession(input: CreateMediaSessionInput): Promise<MediaSession>;
  
  /**
   * Generate a token for a participant to join the session
   */
  createParticipantToken(input: CreateParticipantTokenInput): Promise<ParticipantToken>;
  
  /**
   * Disconnect a participant from the session
   */
  disconnectParticipant(sessionId: string, participantId: string): Promise<void>;
  
  /**
   * Close the media session entirely
   */
  closeSession(sessionId: string): Promise<void>;
  
  /**
   * Get quality metrics for a session
   */
  getSessionMetrics(sessionId: string): Promise<SessionMetrics>;
}

export interface CreateMediaSessionInput {
  callId: string;
  tenantId: string;
  maxParticipants?: number;
  recordingEnabled?: boolean;
}

export interface MediaSession {
  sessionId: string;
  turnServers: TurnServer[];
  createdAt: string;
  expiresAt: string;
}

export interface CreateParticipantTokenInput {
  sessionId: string;
  participantId: string;
  participantType: 'device' | 'operator';
  canPublish: boolean;
  canSubscribe: boolean;
}

export interface ParticipantToken {
  token: string;
  expiresAt: string;
}

export interface TurnServer {
  urls: string[];
  username: string;
  credential: string;
  credentialType: 'password';
}

export interface SessionMetrics {
  participantCount: number;
  avgRtt: number;
  avgJitter: number;
  avgPacketLoss: number;
}
```

#### 4.2 Self-Hosted Implementation
```typescript
export class SelfHostedVoiceMediaProvider implements VoiceMediaProvider {
  constructor(
    private readonly turnServerUrl: string,
    private readonly turnUsername: string,
    private readonly turnCredential: string
  ) {}
  
  async createSession(input: CreateMediaSessionInput): Promise<MediaSession> {
    // Implementation using mediasoup, Janus, or similar
  }
  
  // ... other methods
}
```

## REST API Design

### 5. API Endpoints

#### 5.1 Enrollment & Device Management

```
POST   /v1/communications/enrollment-codes
  - Generate new enrollment code
  - Body: { branchId, deviceType?, expiresInMinutes?, employeeIds? }
  - Returns: { code, expiresAt, branchId }
  - Permission: communication.device.create

GET    /v1/communications/enrollment-codes/:id
  - Get enrollment code details (admin only)
  - Returns: { id, code, branchId, status, expiresAt, usesCount }
  - Permission: communication.device.view

POST   /v1/communications/devices/enroll
  - Enroll a new device (public endpoint, uses enrollment code)
  - Body: { enrollmentCode, deviceName, platform, publicKey, linkedEmployeeIds? }
  - Returns: { deviceId, deviceUuid, credential, certificate }
  - Permission: NONE (public with valid enrollment code)

GET    /v1/communications/devices
  - List devices (filtered by tenant/branch)
  - Query: ?branchId=xxx&status=xxx
  - Returns: { data: Device[] }
  - Permission: communication.device.view

GET    /v1/communications/devices/:id
  - Get device details
  - Returns: Device
  - Permission: communication.device.view

POST   /v1/communications/devices/:id/approve
  - Approve pending device
  - Returns: Device
  - Permission: communication.device.approve

POST   /v1/communications/devices/:id/revoke
  - Revoke device
  - Body: { reason }
  - Returns: void
  - Permission: communication.device.revoke

POST   /v1/communications/devices/:id/heartbeat
  - Update device presence (device endpoint)
  - Body: { appVersion, capabilities? }
  - Returns: { acknowledged: true }
  - Permission: DEVICE_AUTH
```

#### 5.2 Employee-Device Linking

```
POST   /v1/communications/devices/:deviceId/employees
  - Link employee to device
  - Body: { employeeId, isPrimary?, permissions? }
  - Returns: DeviceEmployeeLink
  - Permission: communication.device.link_employee

DELETE /v1/communications/devices/:deviceId/employees/:employeeId
  - Unlink employee from device
  - Returns: void
  - Permission: communication.device.link_employee

GET    /v1/communications/devices/:deviceId/employees
  - List employees linked to device
  - Returns: { data: Employee[] }
  - Permission: communication.device.view
```

#### 5.3 Presence

```
GET    /v1/communications/presence/branch/:branchId
  - Get branch presence
  - Returns: { status, onlineDevices, lastSeen }
  - Permission: communication.branch.view

GET    /v1/communications/presence/employee/:employeeId
  - Get employee presence
  - Returns: { status, onlineDevices, lastSeen }
  - Permission: communication.employee.view

GET    /v1/communications/presence/device/:deviceId
  - Get device presence
  - Returns: { status, lastSeen, ipAddress }
  - Permission: communication.device.view
```

#### 5.4 Calling

```
POST   /v1/communications/calls/branch/:branchId
  - Initiate call to branch
  - Body: { callerId?, context? }
  - Returns: { callId, status, ringingDevices[] }
  - Permission: communication.branch.call

POST   /v1/communications/calls/employee/:employeeId
  - Initiate call to employee
  - Body: { callerId?, context? }
  - Returns: { callId, status, ringingDevices[] }
  - Permission: communication.employee.call

POST   /v1/communications/calls/soc
  - Initiate call to SOC (from device)
  - Body: { deviceId, employeeId?, queue? }
  - Returns: { callId, status }
  - Permission: DEVICE_AUTH

GET    /v1/communications/calls/:callId
  - Get call details
  - Returns: CallSession
  - Permission: PARTICIPANT_IN_CALL

POST   /v1/communications/calls/:callId/accept
  - Accept incoming call
  - Body: { deviceId or operatorId }
  - Returns: { callId, status, mediaToken, turnServers }
  - Permission: DEVICE_AUTH or communication.receive.call

POST   /v1/communications/calls/:callId/reject
  - Reject incoming call
  - Body: { deviceId or operatorId, reason? }
  - Returns: void
  - Permission: DEVICE_AUTH or communication.receive.call

POST   /v1/communications/calls/:callId/end
  - End active call
  - Returns: void
  - Permission: PARTICIPANT_IN_CALL

GET    /v1/communications/calls/history
  - Get call history
  - Query: ?branchId=xxx&from=xxx&to=xxx
  - Returns: { data: CallSession[] }
  - Permission: communication.history.view
```

#### 5.5 Messaging

```
GET    /v1/communications/conversations
  - List conversations
  - Query: ?branchId=xxx&type=xxx
  - Returns: { data: Conversation[] }
  - Permission: communication.message.view

GET    /v1/communications/conversations/:id
  - Get conversation details
  - Returns: Conversation
  - Permission: PARTICIPANT_IN_CONVERSATION

GET    /v1/communications/conversations/:id/messages
  - Get messages in conversation
  - Query: ?limit=50&offset=0
  - Returns: { data: Message[], pagination }
  - Permission: PARTICIPANT_IN_CONVERSATION

POST   /v1/communications/conversations/:id/messages
  - Send message to conversation
  - Body: { body, type?, attachments? }
  - Returns: Message
  - Permission: PARTICIPANT_IN_CONVERSATION

POST   /v1/communications/messages/:id/delivered
  - Mark message as delivered (device endpoint)
  - Returns: void
  - Permission: DEVICE_AUTH

POST   /v1/communications/messages/:id/read
  - Mark message as read
  - Returns: void
  - Permission: PARTICIPANT_IN_CONVERSATION

POST   /v1/communications/conversations/branch/:branchId
  - Send message to branch (creates conversation if needed)
  - Body: { body, type? }
  - Returns: Message
  - Permission: communication.branch.message

POST   /v1/communications/conversations/employee/:employeeId
  - Send message to employee
  - Body: { body, type? }
  - Returns: Message
  - Permission: communication.employee.message
```

## WebSocket Signaling Events

### 6. Event Types

#### 6.1 Call Events
```typescript
// Incoming call invitation
{
  type: 'CALL_INVITE',
  payload: {
    callId: string;
    caller: CallerInfo;
    context?: CallContext;
    expiresAt: string;
  }
}

// Call is ringing on your device
{
  type: 'CALL_RINGING',
  payload: {
    callId: string;
    ringingDeviceCount: number;
  }
}

// Call accepted by this device
{
  type: 'CALL_ACCEPT',
  payload: {
    callId: string;
    mediaToken: string;
    turnServers: TurnServer[];
  }
}

// Call accepted by another device/operator
{
  type: 'CALL_ACCEPTED_ELSEWHERE',
  payload: {
    callId: string;
    answeredBy: string;
  }
}

// Call rejected
{
  type: 'CALL_REJECT',
  payload: {
    callId: string;
    reason?: string;
  }
}

// Call cancelled by caller
{
  type: 'CALL_CANCEL',
  payload: {
    callId: string;
  }
}

// Call connecting (media negotiation)
{
  type: 'CALL_CONNECTING',
  payload: {
    callId: string;
  }
}

// Call connected (audio established)
{
  type: 'CALL_CONNECTED',
  payload: {
    callId: string;
    connectedAt: string;
  }
}

// Participant muted/unmuted
{
  type: 'CALL_MUTE' | 'CALL_UNMUTE',
  payload: {
    callId: string;
    participantId: string;
  }
}

// Call reconnecting
{
  type: 'CALL_RECONNECTING',
  payload: {
    callId: string;
  }
}

// Call ended
{
  type: 'CALL_END',
  payload: {
    callId: string;
    endReason: string;
    duration: number;
  }
}

// Call failed
{
  type: 'CALL_FAILED',
  payload: {
    callId: string;
    error: string;
  }
}
```

#### 6.2 Message Events
```typescript
// New message received
{
  type: 'MESSAGE_CREATED',
  payload: {
    messageId: string;
    conversationId: string;
    sender: SenderInfo;
    body: string;
    createdAt: string;
  }
}

// Message delivered confirmation
{
  type: 'MESSAGE_DELIVERED',
  payload: {
    messageId: string;
    deviceId: string;
    deliveredAt: string;
  }
}

// Message read confirmation
{
  type: 'MESSAGE_READ',
  payload: {
    messageId: string;
    readBy: string;
    readAt: string;
  }
}
```

#### 6.3 Presence Events
```typescript
// Device online/offline
{
  type: 'DEVICE_ONLINE' | 'DEVICE_OFFLINE',
  payload: {
    deviceId: string;
    branchId: string;
    employeeId?: string;
  }
}

// Presence changed
{
  type: 'PRESENCE_CHANGED',
  payload: {
    entityType: 'device' | 'employee' | 'branch' | 'operator';
    entityId: string;
    status: PresenceStatus;
  }
}
```

## Client Architecture

### 7. Windows Client

#### 7.1 Architecture
```
┌────────────────────────────────────────────┐
│     KryptoVisionConnectService.exe         │
│     (Windows Service)                      │
│                                             │
│  • Device credential management            │
│  • Server connection (WebSocket + REST)    │
│  • Presence heartbeat                      │
│  • Event listener                          │
│  • Local IPC server for UI                 │
└─────────────────┬──────────────────────────┘
                  │ IPC (Named Pipe)
┌─────────────────▼──────────────────────────┐
│     KryptoVisionConnect.exe                │
│     (Electron/WPF UI)                      │
│                                             │
│  • Call UI                                 │
│  • Message UI                              │
│  • Settings                                │
│  • System tray                             │
│  • WebRTC media handling                   │
└────────────────────────────────────────────┘
```

#### 7.2 Key Technologies
- **Service**: .NET Core or Node.js Windows Service
- **UI**: Electron or WPF
- **Storage**: Windows Credential Manager (DPAPI)
- **IPC**: Named Pipes or TCP localhost
- **WebRTC**: electron-webrtc or native WebRTC

### 8. Mobile Client (Android)

#### 8.1 Architecture
```
┌────────────────────────────────────────────┐
│     KryptoVision Connect App               │
│                                             │
│  ┌──────────────┐  ┌──────────────┐       │
│  │   UI Layer   │  │ Service Layer│       │
│  │  (Jetpack    │  │ (Background  │       │
│  │   Compose)   │  │  Service)    │       │
│  └──────┬───────┘  └──────┬───────┘       │
│         │                  │                │
│  ┌──────▼──────────────────▼───────┐      │
│  │   Communication Manager          │      │
│  │  • WebSocket connection          │      │
│  │  • REST API client               │      │
│  │  • WebRTC session management     │      │
│  │  • Push notification handler     │      │
│  └──────┬───────────────────────────┘      │
│         │                                   │
│  ┌──────▼───────────────────────────┐     │
│  │   Device Credential Store        │     │
│  │   (Android Keystore)             │     │
│  └──────────────────────────────────┘     │
└────────────────────────────────────────────┘
```

#### 8.2 Key Technologies
- **Language**: Kotlin
- **UI**: Jetpack Compose
- **Storage**: Android Keystore
- **Push**: Firebase Cloud Messaging (FCM)
- **WebRTC**: WebRTC Android SDK
- **HTTP**: Retrofit or Ktor

## Integration Points

### 9. Integration with Existing VMS

#### 9.1 Authentication Integration
```typescript
// Reuse existing session service
import { SessionService } from '../identity/services/session.service.js';

// Device authentication middleware
export async function authenticateDevice(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const deviceCredential = request.headers['x-device-credential'];
  
  if (!deviceCredential) {
    return reply.code(401).send({ error: 'device_credential_required' });
  }
  
  const credentialHash = hashDeviceCredential(deviceCredential);
  const device = await deviceService.getByCredentialHash(credentialHash);
  
  if (!device || device.status === 'REVOKED') {
    return reply.code(401).send({ error: 'invalid_or_revoked_device' });
  }
  
  request.deviceContext = { deviceId: device.id, tenantId: device.tenantId, branchId: device.branchId };
}
```

#### 9.2 Audit Integration
```typescript
// Reuse existing audit system
import { pool } from '../database/pool.js';

export async function auditCommunicationEvent(event: CommunicationAuditEvent) {
  await pool.query(
    `INSERT INTO central_audit_ledger (
      tenant_id, actor_id, action, resource_type, resource_id,
      before_state, after_state, reason, client_ip, correlation_id, result, record_hash, previous_hash
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [
      event.tenantId,
      event.actorId,
      event.action,
      event.resourceType,
      event.resourceId,
      event.beforeState ? JSON.stringify(event.beforeState) : null,
      event.afterState ? JSON.stringify(event.afterState) : null,
      event.reason,
      event.clientIp,
      event.correlationId,
      event.result,
      event.recordHash,
      event.previousHash
    ]
  );
}
```

#### 9.3 WebSocket Integration
```typescript
// Extend existing WebSocket service
import { WebSocketService } from '../services/websocket-service.js';

// Add communication event broadcasting
export class CommunicationSignalingService {
  constructor(private wsService: WebSocketService) {}
  
  async broadcastCallEvent(tenantId: string, deviceIds: string[], event: CallEvent) {
    // Use existing WebSocket tenant rooms
    this.wsService.io
      .to(`tenant:${tenantId}`)
      .emit('communication:call', event);
  }
}
```

#### 9.4 Notification Integration
```typescript
// Reuse existing notification system for push
import { NotificationService } from '../services/notification-service.js';

export async function sendCallPushNotification(device: Device, call: CallSession) {
  await notificationService.send({
    tenantId: device.tenantId,
    recipient: device.deviceUuid,
    channel: 'PUSH',
    title: 'Incoming Call',
    body: `Call from ${call.callerName}`,
    data: {
      type: 'INCOMING_CALL',
      callId: call.id,
      callerId: call.callerId
    }
  });
}
```

## Security Architecture

### 10. Security Layers

#### 10.1 Device Authentication Flow
```
1. Device generates keypair (ECDSA P-256)
2. Device sends enrollment request with publicKey
3. Server validates enrollment code
4. Server generates:
   - deviceUuid (persistent ID)
   - credential (high-entropy secret, 256-bit)
   - credentialHash (SHA-256)
   - certificate (optional JWT or x509)
5. Server returns credential + certificate (one-time only)
6. Device stores credential securely
7. Subsequent requests: X-Device-Credential header
8. Server validates: hash(credential) == stored credentialHash
```

#### 10.2 Tenant Isolation
```typescript
// Every query must filter by tenant_id
export class CommunicationDeviceRepository {
  async getDevice(deviceId: string, tenantId: string): Promise<Device | null> {
    const result = await pool.query(
      `SELECT * FROM communication_devices 
       WHERE id = $1 AND tenant_id = $2 AND status != 'REVOKED'`,
      [deviceId, tenantId]
    );
    return result.rows[0] || null;
  }
  
  async getDevicesByBranch(branchId: string, tenantId: string): Promise<Device[]> {
    // CRITICAL: Must validate branch belongs to tenant
    const branch = await pool.query(
      `SELECT tenant_id FROM resource_nodes WHERE id = $1`,
      [branchId]
    );
    
    if (!branch.rows[0] || branch.rows[0].tenant_id !== tenantId) {
      throw new Error('TENANT_ISOLATION_VIOLATION');
    }
    
    const result = await pool.query(
      `SELECT * FROM communication_devices 
       WHERE branch_id = $1 AND tenant_id = $2 AND status != 'REVOKED'`,
      [branchId, tenantId]
    );
    return result.rows;
  }
}
```

#### 10.3 First-Answer-Wins Race Safety
```typescript
export class CallStateMachine {
  /**
   * Atomic first-answer-wins using Redis
   */
  async lockCallForAnswer(
    callId: string,
    tenantId: string,
    answeringParty: string
  ): Promise<boolean> {
    const lockKey = `comm:call-answer-lock:${tenantId}:${callId}`;
    
    // SET NX (only if not exists) with TTL
    const acquired = await redis.set(
      lockKey,
      answeringParty,
      {
        NX: true, // Only set if doesn't exist
        EX: 30    // 30 second TTL
      }
    );
    
    return acquired === 'OK';
  }
  
  async acceptCall(
    callId: string,
    tenantId: string,
    acceptingDeviceId: string
  ): Promise<AcceptResult> {
    // Try to acquire lock
    const acquired = await this.lockCallForAnswer(callId, tenantId, acceptingDeviceId);
    
    if (!acquired) {
      // Another device already answered
      return { accepted: false, reason: 'ALREADY_ANSWERED' };
    }
    
    // Update database
    await pool.query(
      `UPDATE communication_call_sessions 
       SET status = 'CONNECTING',
           answered_device_id = $1,
           answered_at = NOW()
       WHERE id = $2 AND tenant_id = $3 AND status = 'RINGING'`,
      [acceptingDeviceId, callId, tenantId]
    );
    
    // Cancel other ringing devices
    await this.cancelRingingDevices(callId, tenantId, acceptingDeviceId);
    
    return { accepted: true };
  }
}
```

## Deployment Configuration

### 11. Environment Variables

```bash
# Communication Subsystem Configuration

# WebRTC / TURN Configuration
COMM_TURN_SERVER_URL=turn:turn.example.com:3478
COMM_TURN_USERNAME=kryptovision
COMM_TURN_CREDENTIAL=secure-turn-password
COMM_TURN_TTL_SECONDS=86400

# WebRTC Provider
COMM_MEDIA_PROVIDER=self-hosted  # or 'mediasoup', 'janus'
COMM_MEDIA_SERVER_URL=https://media.example.com

# Push Notifications
COMM_FCM_SERVER_KEY=your-firebase-server-key
COMM_APNS_KEY_ID=your-apns-key-id
COMM_APNS_TEAM_ID=your-team-id
COMM_APNS_P8_KEY=path/to/apns-key.p8

# Call Configuration
COMM_CALL_RING_TIMEOUT_SECONDS=60
COMM_CALL_MAX_DURATION_SECONDS=3600
COMM_CALL_RECONNECT_TIMEOUT_SECONDS=30

# Device Configuration
COMM_DEVICE_HEARTBEAT_INTERVAL_SECONDS=60
COMM_DEVICE_PRESENCE_TTL_SECONDS=90
COMM_ENROLLMENT_CODE_LENGTH=16
COMM_ENROLLMENT_DEFAULT_EXPIRY_MINUTES=30

# Message Configuration
COMM_MESSAGE_MAX_LENGTH=4000
COMM_MESSAGE_RETENTION_DAYS=90
COMM_OFFLINE_MESSAGE_QUEUE_LIMIT=1000

# Features
COMM_CALL_RECORDING_ENABLED=false
COMM_REQUIRE_DEVICE_APPROVAL=true
COMM_ALLOW_EMPLOYEE_PIN=true
```

## Observability & Monitoring

### 12. Metrics

```typescript
// Prometheus metrics
export const communicationMetrics = {
  devicesOnline: new Gauge({
    name: 'communication_devices_online',
    help: 'Number of online communication devices',
    labelNames: ['tenant_id', 'branch_id', 'device_type']
  }),
  
  callsStarted: new Counter({
    name: 'communication_calls_started_total',
    help: 'Total number of calls started',
    labelNames: ['tenant_id', 'direction', 'source_type', 'target_type']
  }),
  
  callsConnected: new Counter({
    name: 'communication_calls_connected_total',
    help: 'Total number of successfully connected calls',
    labelNames: ['tenant_id', 'direction']
  }),
  
  callsFailed: new Counter({
    name: 'communication_calls_failed_total',
    help: 'Total number of failed calls',
    labelNames: ['tenant_id', 'failure_reason']
  }),
  
  callSetupDuration: new Histogram({
    name: 'communication_call_setup_duration_seconds',
    help: 'Time from initiate to connected',
    labelNames: ['tenant_id'],
    buckets: [0.5, 1, 2, 5, 10, 30]
  }),
  
  messagesSent: new Counter({
    name: 'communication_messages_sent_total',
    help: 'Total number of messages sent',
    labelNames: ['tenant_id', 'conversation_type']
  }),
  
  messagesDelivered: new Counter({
    name: 'communication_messages_delivered_total',
    help: 'Total number of messages delivered',
    labelNames: ['tenant_id']
  }),
  
  websocketConnections: new Gauge({
    name: 'communication_websocket_connections',
    help: 'Number of active WebSocket connections',
    labelNames: ['tenant_id', 'client_type']
  })
};
```

### 13. Health Checks

```typescript
export async function communicationHealthCheck(): Promise<HealthStatus> {
  const checks = await Promise.allSettled([
    // Database connectivity
    pool.query('SELECT 1 FROM communication_devices LIMIT 1'),
    
    // Redis connectivity
    redis.ping(),
    
    // TURN server reachability
    checkTurnServerReachability(),
    
    // Active call count
    getActiveCallCount()
  ]);
  
  return {
    status: checks.every(c => c.status === 'fulfilled') ? 'healthy' : 'degraded',
    checks: {
      database: checks[0].status === 'fulfilled',
      redis: checks[1].status === 'fulfilled',
      turnServer: checks[2].status === 'fulfilled',
      activeCallsMonitored: checks[3].status === 'fulfilled'
    },
    timestamp: new Date().toISOString()
  };
}
```

## Testing Strategy

### 14. Test Coverage

#### 14.1 Unit Tests
- Device enrollment validation
- Credential hashing/verification
- Call state machine transitions
- Message delivery logic
- Presence tracking
- First-answer-wins logic

#### 14.2 Integration Tests
- End-to-end enrollment flow
- Call initiation and acceptance
- Message send and delivery
- WebSocket event delivery
- Device revocation

#### 14.3 Security Tests
- Cross-tenant isolation
- Invalid enrollment codes
- Expired credentials
- Forged device IDs
- Concurrent call accept attempts

#### 14.4 Performance Tests
- 100 concurrent calls
- 5000 registered devices
- Message throughput
- WebSocket connection scaling

## Migration Strategy

### 15. Deployment Phases

#### Phase 1: Core Infrastructure
- Database migrations
- Domain types and models
- Enrollment service
- Device registry
- Basic authentication

#### Phase 2: Communication Services
- Call service and state machine
- Messaging service
- Presence tracking
- WebSocket signaling

#### Phase 3: WebRTC Integration
- Media provider implementation
- TURN server setup
- Call quality monitoring

#### Phase 4: Client Applications
- Windows service and UI
- Android application
- iOS application (if applicable)

#### Phase 5: VMS Integration
- Dashboard UI components
- Admin management interface
- Audit integration
- Metrics and monitoring

## Summary

This design specification provides a production-grade architecture for KryptoVision Connect that:

1. **Integrates seamlessly** with existing VMS infrastructure (PostgreSQL, Redis, WebSocket, audit)
2. **Ensures security** through device certificates, tenant isolation, and distributed locking
3. **Scales reliably** with distributed state management and atomic operations
4. **Provides observability** through metrics, logging, and health checks
5. **Maintains simplicity** for end users while being robust for operators

All components follow existing VMS patterns and conventions while introducing minimal new infrastructure dependencies.
