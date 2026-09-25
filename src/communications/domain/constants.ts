/**
 * KryptoVision Connect - Domain Constants
 * 
 * Centralized constants for the communication subsystem.
 */

// ============================================================================
// DEVICE CONSTANTS
// ============================================================================

export const DEVICE_HEARTBEAT_INTERVAL_SECONDS = 60;
export const DEVICE_PRESENCE_TTL_SECONDS = 90;
export const DEVICE_CREDENTIAL_LENGTH = 32; // 256 bits
export const ENROLLMENT_CODE_LENGTH = 16;
export const ENROLLMENT_DEFAULT_EXPIRY_MINUTES = 30;
export const ENROLLMENT_MAX_USES_UNLIMITED = 0;

// ============================================================================
// CALL CONSTANTS
// ============================================================================

export const CALL_RING_TIMEOUT_SECONDS = 60;
export const CALL_MAX_DURATION_SECONDS = 3600; // 1 hour
export const CALL_RECONNECT_TIMEOUT_SECONDS = 30;
export const CALL_ANSWER_LOCK_TTL_SECONDS = 30;
export const CALL_QUALITY_UPDATE_INTERVAL_SECONDS = 5;

// Valid call state transitions
export const VALID_CALL_TRANSITIONS: Record<string, string[]> = {
  INITIATING: ['RINGING', 'FAILED', 'CANCELLED'],
  RINGING: ['CONNECTING', 'REJECTED', 'MISSED', 'CANCELLED', 'FAILED'],
  CONNECTING: ['CONNECTED', 'FAILED', 'CANCELLED'],
  CONNECTED: ['RECONNECTING', 'ENDED', 'FAILED'],
  RECONNECTING: ['CONNECTED', 'ENDED', 'FAILED'],
  REJECTED: [], // Terminal state
  MISSED: [],   // Terminal state
  CANCELLED: [], // Terminal state
  FAILED: [],    // Terminal state
  ENDED: [],     // Terminal state
};

// ============================================================================
// MESSAGE CONSTANTS
// ============================================================================

export const MESSAGE_MAX_LENGTH = 4000;
export const MESSAGE_RETENTION_DAYS = 90;
export const OFFLINE_MESSAGE_QUEUE_LIMIT = 1000;
export const MESSAGE_DELIVERY_RETRY_ATTEMPTS = 3;
export const MESSAGE_DELIVERY_RETRY_DELAY_MS = 5000;

// ============================================================================
// PRESENCE CONSTANTS
// ============================================================================

export const PRESENCE_UPDATE_INTERVAL_SECONDS = 30;
export const PRESENCE_OFFLINE_THRESHOLD_SECONDS = 120;

// ============================================================================
// REDIS KEY PREFIXES
// ============================================================================

export const REDIS_KEYS = {
  // Presence
  DEVICE_PRESENCE: (tenantId: string, deviceId: string) => 
    `comm:presence:device:${tenantId}:${deviceId}`,
  
  EMPLOYEE_PRESENCE: (tenantId: string, employeeId: string) => 
    `comm:presence:employee:${tenantId}:${employeeId}`,
  
  BRANCH_PRESENCE: (tenantId: string, branchId: string) => 
    `comm:presence:branch:${tenantId}:${branchId}`,
  
  OPERATOR_PRESENCE: (tenantId: string, operatorId: string) => 
    `comm:presence:operator:${tenantId}:${operatorId}`,
  
  // Call state
  CALL_STATE: (tenantId: string, callId: string) => 
    `comm:call:${tenantId}:${callId}`,
  
  CALL_ANSWER_LOCK: (tenantId: string, callId: string) => 
    `comm:call-answer-lock:${tenantId}:${callId}`,
  
  CALL_RINGING: (tenantId: string, callId: string) => 
    `comm:call-ringing:${tenantId}:${callId}`,
  
  // Message queue
  MESSAGE_QUEUE: (tenantId: string, deviceId: string) => 
    `comm:message-queue:${tenantId}:${deviceId}`,
  
  // WebSocket sessions
  WS_SESSION: (sessionId: string) => 
    `comm:ws-session:${sessionId}`,
  
  WS_USER_SESSIONS: (tenantId: string, userId: string) => 
    `comm:ws-user-sessions:${tenantId}:${userId}`,
  
  WS_DEVICE_SESSIONS: (tenantId: string, deviceId: string) => 
    `comm:ws-device-sessions:${tenantId}:${deviceId}`,
} as const;

// ============================================================================
// WEBRTC / MEDIA CONSTANTS
// ============================================================================

export const TURN_CREDENTIAL_TTL_SECONDS = 86400; // 24 hours
export const MEDIA_SESSION_TTL_SECONDS = 3600; // 1 hour
export const PARTICIPANT_TOKEN_TTL_SECONDS = 300; // 5 minutes

// Opus codec configuration (recommended for voice)
export const OPUS_CODEC_CONFIG = {
  mimeType: 'audio/opus',
  clockRate: 48000,
  channels: 2,
  sdpFmtpLine: 'minptime=10;useinbandfec=1',
} as const;

// ============================================================================
// SECURITY CONSTANTS
// ============================================================================

export const CREDENTIAL_HASH_ALGORITHM = 'sha256';
export const PUBLIC_KEY_ALGORITHM = 'ECDSA'; // P-256 or RSA-2048
export const CERTIFICATE_VALIDITY_DAYS = 365;

// Rate limiting
export const ENROLLMENT_RATE_LIMIT_PER_BRANCH = 10; // per hour
export const CALL_RATE_LIMIT_PER_DEVICE = 60; // per hour
export const MESSAGE_RATE_LIMIT_PER_DEVICE = 100; // per hour

// ============================================================================
// AUDIT CONSTANTS
// ============================================================================

export const AUDIT_RETENTION_DAYS = 2555; // 7 years (compliance)

// ============================================================================
// ERROR CODES
// ============================================================================

export const ERROR_CODES = {
  // Enrollment errors
  ENROLLMENT_CODE_INVALID: 'ENROLLMENT_CODE_INVALID',
  ENROLLMENT_CODE_EXPIRED: 'ENROLLMENT_CODE_EXPIRED',
  ENROLLMENT_CODE_EXHAUSTED: 'ENROLLMENT_CODE_EXHAUSTED',
  ENROLLMENT_DEVICE_TYPE_MISMATCH: 'ENROLLMENT_DEVICE_TYPE_MISMATCH',
  ENROLLMENT_EMPLOYEE_NOT_FOUND: 'ENROLLMENT_EMPLOYEE_NOT_FOUND',
  ENROLLMENT_EMPLOYEE_WRONG_TENANT: 'ENROLLMENT_EMPLOYEE_WRONG_TENANT',
  
  // Device errors
  DEVICE_NOT_FOUND: 'DEVICE_NOT_FOUND',
  DEVICE_REVOKED: 'DEVICE_REVOKED',
  DEVICE_ALREADY_ENROLLED: 'DEVICE_ALREADY_ENROLLED',
  DEVICE_CREDENTIAL_INVALID: 'DEVICE_CREDENTIAL_INVALID',
  DEVICE_NOT_ACTIVE: 'DEVICE_NOT_ACTIVE',
  
  // Call errors
  CALL_NOT_FOUND: 'CALL_NOT_FOUND',
  CALL_ALREADY_ANSWERED: 'CALL_ALREADY_ANSWERED',
  CALL_INVALID_STATE_TRANSITION: 'CALL_INVALID_STATE_TRANSITION',
  CALL_TIMEOUT: 'CALL_TIMEOUT',
  CALL_NO_ELIGIBLE_DEVICES: 'CALL_NO_ELIGIBLE_DEVICES',
  CALL_MEDIA_FAILED: 'CALL_MEDIA_FAILED',
  
  // Message errors
  MESSAGE_NOT_FOUND: 'MESSAGE_NOT_FOUND',
  MESSAGE_TOO_LONG: 'MESSAGE_TOO_LONG',
  MESSAGE_CONVERSATION_CLOSED: 'MESSAGE_CONVERSATION_CLOSED',
  MESSAGE_DELIVERY_FAILED: 'MESSAGE_DELIVERY_FAILED',
  
  // Authorization errors
  TENANT_ISOLATION_VIOLATION: 'TENANT_ISOLATION_VIOLATION',
  UNAUTHORIZED_DEVICE: 'UNAUTHORIZED_DEVICE',
  UNAUTHORIZED_ACTION: 'UNAUTHORIZED_ACTION',
  BRANCH_ACCESS_DENIED: 'BRANCH_ACCESS_DENIED',
  
  // General errors
  INVALID_INPUT: 'INVALID_INPUT',
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

// ============================================================================
// WEBSOCKET ROOM NAMES
// ============================================================================

export const WS_ROOMS = {
  TENANT: (tenantId: string) => `tenant:${tenantId}`,
  BRANCH: (tenantId: string, branchId: string) => `branch:${tenantId}:${branchId}`,
  DEVICE: (tenantId: string, deviceId: string) => `device:${tenantId}:${deviceId}`,
  OPERATOR: (tenantId: string, operatorId: string) => `operator:${tenantId}:${operatorId}`,
  CALL: (tenantId: string, callId: string) => `call:${tenantId}:${callId}`,
} as const;

// ============================================================================
// PERMISSIONS
// ============================================================================

export const COMMUNICATION_PERMISSIONS = {
  // Branch calling/messaging
  BRANCH_CALL: 'communication.branch.call',
  BRANCH_MESSAGE: 'communication.branch.message',
  BRANCH_VIEW: 'communication.branch.view',
  
  // Employee calling/messaging
  EMPLOYEE_CALL: 'communication.employee.call',
  EMPLOYEE_MESSAGE: 'communication.employee.message',
  EMPLOYEE_VIEW: 'communication.employee.view',
  
  // Receive calls/messages
  RECEIVE_CALL: 'communication.receive.call',
  RECEIVE_MESSAGE: 'communication.receive.message',
  
  // Device management
  DEVICE_CREATE: 'communication.device.create',
  DEVICE_APPROVE: 'communication.device.approve',
  DEVICE_LINK_EMPLOYEE: 'communication.device.link_employee',
  DEVICE_REVOKE: 'communication.device.revoke',
  DEVICE_VIEW: 'communication.device.view',
  
  // History and audit
  HISTORY_VIEW: 'communication.history.view',
  AUDIT_VIEW: 'communication.audit.view',
} as const;

// ============================================================================
// DEFAULT SOC QUEUE
// ============================================================================

export const DEFAULT_SOC_QUEUE = 'default-soc';

// ============================================================================
// FEATURE FLAGS
// ============================================================================

export const FEATURES = {
  CALL_RECORDING_ENABLED: false,
  REQUIRE_DEVICE_APPROVAL: true,
  ALLOW_EMPLOYEE_PIN: true,
  MULTI_PARTY_CALLS: false, // Future feature
  VIDEO_CALLS: false, // Future feature
  SCREEN_SHARING: false, // Future feature
  IMAGE_ATTACHMENTS: false, // Future feature
  VOICE_NOTE_ATTACHMENTS: false, // Future feature
} as const;

// ============================================================================
// RETRY POLICIES
// ============================================================================

export const RETRY_POLICY = {
  WEBSOCKET_RECONNECT_DELAYS_MS: [1000, 2000, 5000, 10000, 20000, 30000],
  CALL_SETUP_RETRY_ATTEMPTS: 3,
  MESSAGE_DELIVERY_RETRY_ATTEMPTS: 3,
  PRESENCE_UPDATE_RETRY_ATTEMPTS: 2,
} as const;

// ============================================================================
// METRICS
// ============================================================================

export const METRIC_NAMES = {
  DEVICES_ONLINE: 'communication_devices_online',
  CALLS_STARTED: 'communication_calls_started_total',
  CALLS_CONNECTED: 'communication_calls_connected_total',
  CALLS_FAILED: 'communication_calls_failed_total',
  CALLS_MISSED: 'communication_calls_missed_total',
  CALL_SETUP_DURATION: 'communication_call_setup_duration_seconds',
  CALL_DURATION: 'communication_call_duration_seconds',
  MESSAGES_SENT: 'communication_messages_sent_total',
  MESSAGES_DELIVERED: 'communication_messages_delivered_total',
  WEBSOCKET_CONNECTIONS: 'communication_websocket_connections',
  PRESENCE_UPDATES: 'communication_presence_updates_total',
} as const;
