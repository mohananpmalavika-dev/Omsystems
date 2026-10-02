-- Durable, tenant-scoped protection policy, evidence and SOP review ledger.
CREATE TABLE IF NOT EXISTS branch_protection_state (
  tenant_id text NOT NULL,
  branch_id text NOT NULL,
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, branch_id)
);
CREATE TABLE IF NOT EXISTS branch_protection_audit (
  id bigserial PRIMARY KEY,
  tenant_id text NOT NULL,
  branch_id text NOT NULL,
  actor_id text NOT NULL,
  action text NOT NULL,
  detail jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS branch_protection_audit_scope_time
  ON branch_protection_audit (tenant_id, branch_id, created_at DESC);
