-- Migration 200: KryptoVision Connect Communication Subsystem
-- Production-grade branch-VMS communication with secure device enrollment,
-- WebRTC audio calling, and persistent messaging.

-- ============================================================================
-- PART 1: DEVICE REGISTRY & ENROLLMENT
-- ============================================================================

-- Communication device types enum
DO $$ BEGIN
  CREATE TYPE communication_device_type AS ENUM (
    'BRANCH_SHARED',      -- Shared PC/workstation at branch
    'BRANCH_MOBILE',      -- Branch-owned mobile device
    'EMPLOYEE_MOBILE',    -- Employee personal mobile
    'EMPLOYEE_DESKTOP',   -- Employee workstation
    'EMERGENCY_DEVICE'    -- Emergency-only device
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Communication device platform enum
DO $$ BEGIN
  CREATE TYPE communication_device_platform AS ENUM (
    'WINDOWS',
    'ANDROID',
    'IOS',
    'WEB'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Communication device status enum
DO $$ BEGIN
  CREATE TYPE communication_device_status AS ENUM (
    'PENDING',    -- Awaiting approval
    'ACTIVE',     -- Approved and active
    'OFFLINE',    -- Currently offline
    'DISABLED',   -- Temporarily disabled
    'REVOKED'     -- Permanently revoked
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Core device registry table
CREATE TABLE IF NOT EXISTS communication_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES resource_nodes(id) ON DELETE CASCADE,
  
  -- Device identity
  device_name VARCHAR(120) NOT NULL,
  device_uuid VARCHAR(64) NOT NULL UNIQUE, -- Client-generated persistent ID
  device_type communication_device_type NOT NULL,
  platform communication_device_platform NOT NULL,
  
  -- Cryptographic identity (zero-login security)
  public_key TEXT NOT NULL, -- Device public key for authentication
  certificate_id VARCHAR(64), -- Server-issued certificate identifier
  credential_hash VARCHAR(64) NOT NULL UNIQUE, -- Hashed device credential (SHA-256)
  
  -- Status
  status communication_device_status NOT NULL DEFAULT 'PENDING',
  status_reason TEXT,
  
  -- Metadata
  app_version VARCHAR(40),
  last_seen_at TIMESTAMPTZ,
  last_ip INET,
  device_capabilities JSONB DEFAULT '{}'::jsonb, -- Audio, microphone, etc.
  
  -- Lifecycle
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES users(id),
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES users(id),
  revoke_reason TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT fk_comm_device_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_comm_device_branch FOREIGN KEY (branch_id) REFERENCES resource_nodes(id),
  CONSTRAINT ck_comm_device_branch_type CHECK (
    EXISTS (
      SELECT 1 FROM resource_nodes 
      WHERE id = branch_id AND node_type = 'branch'
    )
  )
);

-- Indexes for device queries
CREATE INDEX IF NOT EXISTS idx_comm_devices_tenant_branch 
  ON communication_devices(tenant_id, branch_id);

CREATE INDEX IF NOT EXISTS idx_comm_devices_status 
  ON communication_devices(status) 
  WHERE status != 'REVOKED';

CREATE INDEX IF NOT EXISTS idx_comm_devices_last_seen 
  ON communication_devices(last_seen_at DESC) 
  WHERE status = 'ACTIVE';

CREATE UNIQUE INDEX IF NOT EXISTS idx_comm_devices_device_uuid 
  ON communication_devices(device_uuid);

CREATE UNIQUE INDEX IF NOT EXISTS idx_comm_devices_credential 
  ON communication_devices(credential_hash);

-- Device-Employee many-to-many mapping
CREATE TABLE IF NOT EXISTS communication_device_employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES communication_devices(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
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
  
  CONSTRAINT uq_comm_device_employee UNIQUE (device_id, employee_id),
  CONSTRAINT ck_comm_one_primary_per_device UNIQUE (device_id) 
    WHERE is_primary = TRUE AND unlinked_at IS NULL
);

CREATE INDEX IF NOT EXISTS idx_comm_device_employees_device 
  ON communication_device_employees(device_id) 
  WHERE unlinked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_comm_device_employees_employee 
  ON communication_device_employees(employee_id) 
  WHERE unlinked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_comm_device_employees_tenant 
  ON communication_device_employees(tenant_id);

-- Enrollment codes for zero-login device registration
CREATE TABLE IF NOT EXISTS communication_enrollment_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES resource_nodes(id) ON DELETE CASCADE,
  
  -- Code (e.g., "KLM01-X7P9-42MK")
  code VARCHAR(32) NOT NULL UNIQUE,
  code_hash VARCHAR(64) NOT NULL UNIQUE, -- SHA-256 for lookup
  
  -- Restrictions
  allowed_device_type communication_device_type, -- NULL = any type allowed
  max_uses INTEGER DEFAULT 1, -- 0 = unlimited
  uses_count INTEGER NOT NULL DEFAULT 0,
  
  -- Optional pre-assignment to specific employees
  pre_assigned_employee_ids UUID[], -- NULL = link during enrollment
  
  -- Lifecycle
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID NOT NULL REFERENCES users(id),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  
  CONSTRAINT ck_comm_enrollment_max_uses CHECK (max_uses >= 0),
  CONSTRAINT ck_comm_enrollment_uses_count CHECK (uses_count >= 0)
);

CREATE INDEX IF NOT EXISTS idx_comm_enrollment_codes_hash 
  ON communication_enrollment_codes(code_hash);

CREATE INDEX IF NOT EXISTS idx_comm_enrollment_codes_branch 
  ON communication_enrollment_codes(branch_id);

CREATE INDEX IF NOT EXISTS idx_comm_enrollment_codes_expires 
  ON communication_enrollment_codes(expires_at DESC) 
  WHERE consumed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_comm_enrollment_codes_active 
  ON communication_enrollment_codes(tenant_id, branch_id, expires_at) 
  WHERE consumed_at IS NULL AND expires_at > NOW();

-- ============================================================================
-- PART 2: CALL SESSIONS & PARTICIPANTS
-- ============================================================================

-- Call direction enum
DO $$ BEGIN
  CREATE TYPE communication_call_direction AS ENUM ('INBOUND', 'OUTBOUND');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Call source/target type enum
DO $$ BEGIN
  CREATE TYPE communication_call_entity_type AS ENUM (
    'BRANCH',      -- Branch entity
    'EMPLOYEE',    -- Specific employee
    'OPERATOR',    -- VMS operator
    'DEVICE',      -- Specific device
    'SOC_QUEUE'    -- SOC queue/team
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Call status enum (state machine)
DO $$ BEGIN
  CREATE TYPE communication_call_status AS ENUM (
    'INITIATING',    -- Call being initiated
    'RINGING',       -- Ringing on target devices
    'CONNECTING',    -- Media negotiation in progress
    'CONNECTED',     -- Call connected, audio established
    'RECONNECTING',  -- Temporary connection loss, attempting reconnect
    'REJECTED',      -- Call rejected by recipient
    'MISSED',        -- Call not answered in time
    'CANCELLED',     -- Call cancelled by caller
    'FAILED',        -- Call failed (technical error)
    'ENDED'          -- Call ended normally
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Call session state and history
CREATE TABLE IF NOT EXISTS communication_call_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Direction
  direction communication_call_direction NOT NULL,
  
  -- Source (who initiated)
  source_type communication_call_entity_type NOT NULL,
  source_branch_id UUID REFERENCES resource_nodes(id),
  source_employee_id UUID REFERENCES users(id),
  source_device_id UUID REFERENCES communication_devices(id),
  source_operator_id UUID REFERENCES users(id),
  
  -- Target (who was called)
  target_type communication_call_entity_type NOT NULL,
  target_branch_id UUID REFERENCES resource_nodes(id),
  target_employee_id UUID REFERENCES users(id),
  target_soc_queue VARCHAR(64),
  
  -- Answered device/operator (first-answer-wins)
  answered_device_id UUID REFERENCES communication_devices(id),
  answered_operator_id UUID REFERENCES users(id),
  
  -- State
  status communication_call_status NOT NULL DEFAULT 'INITIATING',
  
  -- Media session (WebRTC provider)
  media_session_id VARCHAR(128), -- External media provider session ID
  media_provider VARCHAR(64),    -- e.g., "self-hosted", "mediasoup", "janus"
  
  -- Quality metrics (populated during/after call)
  quality_rtt_ms INTEGER,
  quality_jitter_ms INTEGER,
  quality_packet_loss_percent DECIMAL(5,2),
  
  -- Timeline
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ringing_at TIMESTAMPTZ,
  answered_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  
  -- Duration (computed on end)
  duration_seconds INTEGER,
  
  -- End reason
  end_reason VARCHAR(64), -- NORMAL, CANCELLED, REJECTED, TIMEOUT, NETWORK_ERROR, etc.
  
  -- Context/metadata
  context JSONB, -- Incident reference, etc.
  
  CONSTRAINT ck_comm_call_source_identity CHECK (
    (source_type = 'BRANCH' AND source_branch_id IS NOT NULL) OR
    (source_type = 'EMPLOYEE' AND source_employee_id IS NOT NULL) OR
    (source_type = 'OPERATOR' AND source_operator_id IS NOT NULL) OR
    (source_type = 'DEVICE' AND source_device_id IS NOT NULL)
  ),
  CONSTRAINT ck_comm_call_target_identity CHECK (
    (target_type = 'BRANCH' AND target_branch_id IS NOT NULL) OR
    (target_type = 'EMPLOYEE' AND target_employee_id IS NOT NULL) OR
    (target_type = 'SOC_QUEUE' AND target_soc_queue IS NOT NULL)
  ),
  CONSTRAINT ck_comm_call_duration CHECK (
    duration_seconds IS NULL OR duration_seconds >= 0
  )
);

-- Indexes for call queries
CREATE INDEX IF NOT EXISTS idx_comm_calls_tenant 
  ON communication_call_sessions(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_comm_calls_source_branch 
  ON communication_call_sessions(source_branch_id, created_at DESC) 
  WHERE source_branch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_comm_calls_target_branch 
  ON communication_call_sessions(target_branch_id, created_at DESC) 
  WHERE target_branch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_comm_calls_status 
  ON communication_call_sessions(tenant_id, status, created_at DESC) 
  WHERE status NOT IN ('ENDED', 'FAILED', 'CANCELLED', 'REJECTED', 'MISSED');

CREATE INDEX IF NOT EXISTS idx_comm_calls_answered_device 
  ON communication_call_sessions(answered_device_id, created_at DESC) 
  WHERE answered_device_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_comm_calls_source_employee 
  ON communication_call_sessions(source_employee_id, created_at DESC) 
  WHERE source_employee_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_comm_calls_media_session 
  ON communication_call_sessions(media_session_id) 
  WHERE media_session_id IS NOT NULL;

-- Call participant type enum
DO $$ BEGIN
  CREATE TYPE communication_participant_type AS ENUM (
    'OPERATOR',
    'EMPLOYEE',
    'DEVICE'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Participant connection status enum
DO $$ BEGIN
  CREATE TYPE communication_participant_status AS ENUM (
    'INVITED',
    'RINGING',
    'CONNECTING',
    'CONNECTED',
    'DISCONNECTED',
    'FAILED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Individual participants in calls (for future multi-party support)
CREATE TABLE IF NOT EXISTS communication_call_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id UUID NOT NULL REFERENCES communication_call_sessions(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Participant identity
  participant_type communication_participant_type NOT NULL,
  operator_id UUID REFERENCES users(id),
  employee_id UUID REFERENCES users(id),
  device_id UUID REFERENCES communication_devices(id),
  branch_id UUID REFERENCES resource_nodes(id),
  
  -- State
  connection_status communication_participant_status NOT NULL DEFAULT 'INVITED',
  mute_state BOOLEAN NOT NULL DEFAULT FALSE,
  
  -- Timeline
  joined_at TIMESTAMPTZ,
  left_at TIMESTAMPTZ,
  
  CONSTRAINT ck_comm_participant_identity CHECK (
    (participant_type = 'OPERATOR' AND operator_id IS NOT NULL) OR
    (participant_type = 'EMPLOYEE' AND employee_id IS NOT NULL) OR
    (participant_type = 'DEVICE' AND device_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_comm_call_participants_call 
  ON communication_call_participants(call_id);

CREATE INDEX IF NOT EXISTS idx_comm_call_participants_device 
  ON communication_call_participants(device_id) 
  WHERE device_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_comm_call_participants_operator 
  ON communication_call_participants(operator_id) 
  WHERE operator_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_comm_call_participants_employee 
  ON communication_call_participants(employee_id) 
  WHERE employee_id IS NOT NULL;

-- ============================================================================
-- PART 3: MESSAGING & CONVERSATIONS
-- ============================================================================

-- Conversation type enum
DO $$ BEGIN
  CREATE TYPE communication_conversation_type AS ENUM (
    'BRANCH_SOC',    -- Branch ↔ SOC conversation
    'EMPLOYEE_SOC',  -- Employee ↔ SOC conversation
    'INCIDENT'       -- Incident-linked conversation
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Conversation status enum
DO $$ BEGIN
  CREATE TYPE communication_conversation_status AS ENUM (
    'ACTIVE',
    'ARCHIVED',
    'CLOSED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Persistent conversation threads
CREATE TABLE IF NOT EXISTS communication_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Type
  conversation_type communication_conversation_type NOT NULL,
  
  -- Participants
  branch_id UUID REFERENCES resource_nodes(id),
  employee_id UUID REFERENCES users(id),
  incident_id UUID, -- Optional link to incident system (future)
  
  -- Metadata
  subject VARCHAR(255),
  
  -- State
  status communication_conversation_status NOT NULL DEFAULT 'ACTIVE',
  
  -- Timeline
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_message_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  
  CONSTRAINT ck_comm_conversation_identity CHECK (
    (conversation_type = 'BRANCH_SOC' AND branch_id IS NOT NULL) OR
    (conversation_type = 'EMPLOYEE_SOC' AND employee_id IS NOT NULL) OR
    (conversation_type = 'INCIDENT' AND incident_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_comm_conversations_tenant 
  ON communication_conversations(tenant_id, last_message_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_comm_conversations_branch 
  ON communication_conversations(branch_id, last_message_at DESC NULLS LAST) 
  WHERE branch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_comm_conversations_employee 
  ON communication_conversations(employee_id, last_message_at DESC NULLS LAST) 
  WHERE employee_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_comm_conversations_incident 
  ON communication_conversations(incident_id) 
  WHERE incident_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_comm_conversations_status 
  ON communication_conversations(tenant_id, status, last_message_at DESC NULLS LAST);

-- One active conversation per branch-SOC or employee-SOC
CREATE UNIQUE INDEX IF NOT EXISTS idx_comm_conversations_branch_soc_active 
  ON communication_conversations(tenant_id, branch_id) 
  WHERE conversation_type = 'BRANCH_SOC' AND status = 'ACTIVE';

CREATE UNIQUE INDEX IF NOT EXISTS idx_comm_conversations_employee_soc_active 
  ON communication_conversations(tenant_id, employee_id) 
  WHERE conversation_type = 'EMPLOYEE_SOC' AND status = 'ACTIVE';

-- Conversation member type enum
DO $$ BEGIN
  CREATE TYPE communication_member_type AS ENUM (
    'OPERATOR',
    'EMPLOYEE',
    'DEVICE'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Tracks who has access to a conversation
CREATE TABLE IF NOT EXISTS communication_conversation_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES communication_conversations(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Member identity
  member_type communication_member_type NOT NULL,
  operator_id UUID REFERENCES users(id),
  employee_id UUID REFERENCES users(id),
  device_id UUID REFERENCES communication_devices(id),
  
  -- Access
  can_read BOOLEAN NOT NULL DEFAULT TRUE,
  can_write BOOLEAN NOT NULL DEFAULT TRUE,
  
  -- Timeline
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  left_at TIMESTAMPTZ,
  
  CONSTRAINT ck_comm_member_identity CHECK (
    (member_type = 'OPERATOR' AND operator_id IS NOT NULL) OR
    (member_type = 'EMPLOYEE' AND employee_id IS NOT NULL) OR
    (member_type = 'DEVICE' AND device_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_comm_conv_members_conversation 
  ON communication_conversation_members(conversation_id) 
  WHERE left_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_comm_conv_members_operator 
  ON communication_conversation_members(operator_id) 
  WHERE left_at IS NULL AND operator_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_comm_conv_members_employee 
  ON communication_conversation_members(employee_id) 
  WHERE left_at IS NULL AND employee_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_comm_conv_members_device 
  ON communication_conversation_members(device_id) 
  WHERE left_at IS NULL AND device_id IS NOT NULL;

-- Message sender type enum
DO $$ BEGIN
  CREATE TYPE communication_message_sender_type AS ENUM (
    'OPERATOR',
    'EMPLOYEE',
    'DEVICE',
    'SYSTEM'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Message type enum
DO $$ BEGIN
  CREATE TYPE communication_message_type AS ENUM (
    'TEXT',
    'IMAGE',
    'VOICE_NOTE',
    'SYSTEM'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Individual messages in conversations
CREATE TABLE IF NOT EXISTS communication_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES communication_conversations(id) ON DELETE CASCADE,
  
  -- Sender
  sender_type communication_message_sender_type NOT NULL,
  sender_id UUID, -- users.id or communication_devices.id
  sender_device_id UUID REFERENCES communication_devices(id),
  sender_name VARCHAR(120), -- Denormalized for display
  
  -- Content
  message_type communication_message_type NOT NULL DEFAULT 'TEXT',
  body TEXT NOT NULL,
  attachments JSONB, -- Future: image URLs, etc.
  
  -- Metadata
  metadata JSONB, -- Client metadata, reply references, etc.
  
  -- Timeline
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  edited_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  
  CONSTRAINT ck_comm_message_body_length CHECK (LENGTH(body) <= 4000)
);

CREATE INDEX IF NOT EXISTS idx_comm_messages_conversation 
  ON communication_messages(conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_comm_messages_tenant 
  ON communication_messages(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_comm_messages_sender 
  ON communication_messages(sender_id, created_at DESC) 
  WHERE sender_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_comm_messages_sender_device 
  ON communication_messages(sender_device_id, created_at DESC) 
  WHERE sender_device_id IS NOT NULL AND deleted_at IS NULL;

-- Message receipt recipient type enum
DO $$ BEGIN
  CREATE TYPE communication_receipt_type AS ENUM (
    'DEVICE',
    'OPERATOR'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Delivery and read tracking
CREATE TABLE IF NOT EXISTS communication_message_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES communication_messages(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Recipient
  recipient_type communication_receipt_type NOT NULL,
  device_id UUID REFERENCES communication_devices(id),
  operator_id UUID REFERENCES users(id),
  
  -- State
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  
  CONSTRAINT ck_comm_receipt_identity CHECK (
    (recipient_type = 'DEVICE' AND device_id IS NOT NULL) OR
    (recipient_type = 'OPERATOR' AND operator_id IS NOT NULL)
  ),
  CONSTRAINT uq_comm_message_recipient UNIQUE (message_id, recipient_type, device_id, operator_id)
);

CREATE INDEX IF NOT EXISTS idx_comm_receipts_message 
  ON communication_message_receipts(message_id);

CREATE INDEX IF NOT EXISTS idx_comm_receipts_device 
  ON communication_message_receipts(device_id) 
  WHERE device_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_comm_receipts_operator 
  ON communication_message_receipts(operator_id) 
  WHERE operator_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_comm_receipts_undelivered 
  ON communication_message_receipts(message_id, recipient_type) 
  WHERE delivered_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_comm_receipts_unread 
  ON communication_message_receipts(message_id, recipient_type) 
  WHERE delivered_at IS NOT NULL AND read_at IS NULL;

-- ============================================================================
-- PART 4: TRIGGERS & FUNCTIONS
-- ============================================================================

-- Trigger: Update device updated_at timestamp
CREATE OR REPLACE FUNCTION update_communication_device_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_comm_device_updated_at
  BEFORE UPDATE ON communication_devices
  FOR EACH ROW
  EXECUTE FUNCTION update_communication_device_timestamp();

-- Trigger: Update conversation last_message_at on new message
CREATE OR REPLACE FUNCTION update_conversation_last_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE communication_conversations
  SET last_message_at = NEW.created_at
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_comm_message_update_conversation
  AFTER INSERT ON communication_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_conversation_last_message();

-- Trigger: Compute call duration on end
CREATE OR REPLACE FUNCTION compute_call_duration()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IN ('ENDED', 'FAILED') AND NEW.answered_at IS NOT NULL AND NEW.ended_at IS NOT NULL THEN
    NEW.duration_seconds = EXTRACT(EPOCH FROM (NEW.ended_at - NEW.answered_at))::INTEGER;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_comm_call_compute_duration
  BEFORE UPDATE ON communication_call_sessions
  FOR EACH ROW
  WHEN (NEW.status IN ('ENDED', 'FAILED') AND OLD.status NOT IN ('ENDED', 'FAILED'))
  EXECUTE FUNCTION compute_call_duration();

-- ============================================================================
-- PART 5: COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE communication_devices IS 
  'Registry of all communication devices (branch PCs, mobile apps) with zero-login cryptographic credentials';

COMMENT ON TABLE communication_device_employees IS 
  'Many-to-many mapping between devices and employees. One device can have multiple linked employees.';

COMMENT ON TABLE communication_enrollment_codes IS 
  'One-time enrollment codes for secure device registration without username/password';

COMMENT ON TABLE communication_call_sessions IS 
  'Call session state and history. Tracks branch ↔ VMS and employee ↔ VMS audio calls';

COMMENT ON TABLE communication_call_participants IS 
  'Individual participants in calls. Supports future multi-party calling';

COMMENT ON TABLE communication_conversations IS 
  'Persistent conversation threads between branches/employees and VMS/SOC';

COMMENT ON TABLE communication_messages IS 
  'Individual messages within conversations. Supports text, images, voice notes';

COMMENT ON TABLE communication_message_receipts IS 
  'Delivery and read receipts for messages. Enables offline delivery tracking';

COMMENT ON COLUMN communication_devices.device_uuid IS 
  'Client-generated persistent device identifier (survives app reinstall if credentials backed up)';

COMMENT ON COLUMN communication_devices.credential_hash IS 
  'SHA-256 hash of high-entropy device credential. Used for authentication without storing plaintext password';

COMMENT ON COLUMN communication_devices.public_key IS 
  'Device public key (ECDSA P-256 or RSA-2048). Private key remains on device only';

COMMENT ON COLUMN communication_call_sessions.answered_device_id IS 
  'Device that answered the call (first-answer-wins for branch calls)';

COMMENT ON COLUMN communication_call_sessions.media_session_id IS 
  'External WebRTC provider session ID (self-hosted, mediasoup, janus, etc.)';

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

-- Grant permissions to application role (adjust role name as needed)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kryptovision_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO kryptovision_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO kryptovision_app;
  END IF;
END $$;
