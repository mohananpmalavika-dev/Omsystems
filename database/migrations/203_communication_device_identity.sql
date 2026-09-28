-- A communication terminal can represent an employee who has no VMS account.
-- The employee's business ID and display name are fixed at enrollment.
ALTER TABLE communication_devices
  ADD COLUMN IF NOT EXISTS assigned_employee_code VARCHAR(100),
  ADD COLUMN IF NOT EXISTS assigned_employee_name VARCHAR(160);

CREATE INDEX IF NOT EXISTS idx_comm_device_assigned_employee
  ON communication_devices (tenant_id, branch_id, assigned_employee_code)
  WHERE assigned_employee_code IS NOT NULL AND revoked_at IS NULL;

-- Enrollment remains valid through code_hash, while stored code values become
-- non-secret markers. Raw codes are returned only when created.
UPDATE communication_enrollment_codes
SET code = left(code_hash, 32)
WHERE code <> left(code_hash, 32);

-- Direct calls to a registered employee terminal are addressed by device ID;
-- VMS user IDs remain separate in target_employee_id.
ALTER TABLE communication_call_sessions
  ADD COLUMN IF NOT EXISTS target_device_id UUID REFERENCES communication_devices(id);

ALTER TYPE communication_participant_status ADD VALUE IF NOT EXISTS 'REJECTED';
ALTER TYPE communication_participant_status ADD VALUE IF NOT EXISTS 'CANCELLED';

ALTER TABLE communication_call_sessions DROP CONSTRAINT IF EXISTS ck_comm_call_target_identity;
ALTER TABLE communication_call_sessions ADD CONSTRAINT ck_comm_call_target_identity CHECK (
  (target_type = 'BRANCH' AND target_branch_id IS NOT NULL) OR
  (target_type = 'EMPLOYEE' AND target_employee_id IS NOT NULL) OR
  (target_type = 'DEVICE' AND target_device_id IS NOT NULL) OR
  (target_type = 'SOC_QUEUE' AND target_soc_queue IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_comm_calls_target_device
  ON communication_call_sessions (target_device_id, created_at DESC)
  WHERE target_device_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS communication_direct_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sender_type VARCHAR(16) NOT NULL CHECK (sender_type IN ('OPERATOR', 'DEVICE')),
  sender_id UUID NOT NULL,
  recipient_type VARCHAR(16) NOT NULL CHECK (recipient_type IN ('OPERATOR', 'DEVICE', 'BRANCH')),
  recipient_id UUID NOT NULL,
  body TEXT NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 4000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comm_direct_recipient
  ON communication_direct_messages (tenant_id, recipient_type, recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comm_direct_sender
  ON communication_direct_messages (tenant_id, sender_type, sender_id, created_at DESC);
