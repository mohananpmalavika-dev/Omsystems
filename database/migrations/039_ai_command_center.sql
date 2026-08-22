CREATE TABLE IF NOT EXISTS command_center_conversations (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  user_id UUID NOT NULL REFERENCES users(id),
  branch_node_id UUID REFERENCES resource_nodes(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS command_center_messages (
  id UUID PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES command_center_conversations(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  diagnosis_case_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS root_cause_cases (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  branch_node_id UUID NOT NULL REFERENCES resource_nodes(id),
  fingerprint TEXT NOT NULL,
  root_cause_code TEXT NOT NULL,
  certainty TEXT NOT NULL CHECK (certainty IN ('confirmed', 'likely', 'possible', 'unknown')),
  confidence NUMERIC(5,4) NOT NULL,
  diagnosis JSONB NOT NULL,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  UNIQUE (tenant_id, fingerprint)
);

ALTER TABLE command_center_messages
  ADD CONSTRAINT command_center_messages_case_fk
  FOREIGN KEY (diagnosis_case_id) REFERENCES root_cause_cases(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS root_cause_evidence (
  case_id UUID NOT NULL REFERENCES root_cause_cases(id) ON DELETE CASCADE,
  evidence_id TEXT NOT NULL,
  source TEXT NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL,
  assertion TEXT NOT NULL,
  payload JSONB NOT NULL,
  PRIMARY KEY (case_id, evidence_id)
);

CREATE TABLE IF NOT EXISTS recommended_actions (
  id TEXT PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES root_cause_cases(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  action_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('proposed', 'approved', 'completed', 'failed', 'expired')),
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  executed_by UUID REFERENCES users(id),
  executed_at TIMESTAMPTZ,
  execution_result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_command_center_cases_branch_time
  ON root_cause_cases (tenant_id, branch_node_id, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_command_center_messages_conversation_time
  ON command_center_messages (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_command_center_actions_case
  ON recommended_actions (case_id, status);
