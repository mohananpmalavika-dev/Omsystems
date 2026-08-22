CREATE TABLE operational_report_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(name) BETWEEN 2 AND 160),
  timezone text NOT NULL,
  daily_at text NOT NULL CHECK (daily_at ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  formats text[] NOT NULL CHECK (formats <@ ARRAY['csv','xlsx','pdf']::text[] AND cardinality(formats)>0),
  recipients jsonb NOT NULL DEFAULT '[]'::jsonb,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  last_run_at timestamptz,
  next_run_at timestamptz NOT NULL,
  lease_until timestamptz,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX operational_report_schedules_due_idx ON operational_report_schedules(next_run_at) WHERE enabled;
CREATE INDEX operational_report_schedules_tenant_idx ON operational_report_schedules(tenant_id, name);

CREATE TABLE operational_report_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  schedule_id uuid REFERENCES operational_report_schedules(id) ON DELETE SET NULL,
  requested_by uuid NOT NULL REFERENCES users(id),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','completed','failed','dead')),
  formats text[] NOT NULL,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  recipients jsonb NOT NULL DEFAULT '[]'::jsonb,
  progress integer NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 10),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz,
  row_count integer,
  summary jsonb,
  error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX operational_report_runs_queue_idx ON operational_report_runs(next_attempt_at,created_at) WHERE status IN ('queued','failed','running');
CREATE INDEX operational_report_runs_tenant_idx ON operational_report_runs(tenant_id,created_at DESC);

CREATE TABLE operational_report_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  run_id uuid NOT NULL REFERENCES operational_report_runs(id) ON DELETE CASCADE,
  format text NOT NULL CHECK (format IN ('csv','xlsx','pdf')),
  filename text NOT NULL,
  storage_path text NOT NULL,
  content_type text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
  checksum_sha256 text NOT NULL CHECK (checksum_sha256 ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(run_id,format)
);

CREATE TABLE operational_report_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  run_id uuid NOT NULL REFERENCES operational_report_runs(id) ON DELETE CASCADE,
  recipient text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','delivered','failed','dead')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz,
  provider_id text,
  error text,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(run_id,recipient)
);
CREATE INDEX operational_report_deliveries_queue_idx ON operational_report_deliveries(next_attempt_at) WHERE status IN ('queued','failed','processing');
