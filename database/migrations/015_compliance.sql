DO $$ BEGIN
  CREATE TYPE compliance_assessment_status AS ENUM ('compliant', 'exception', 'non-compliant', 'incomplete');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE compliance_certificate_status AS ENUM ('compliant', 'compliant_with_exceptions', 'provisionally_compliant', 'non_compliant', 'incomplete');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS compliance_frameworks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  source text,
  description text,
  status text NOT NULL DEFAULT 'active',
  effective_date date,
  review_date date,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS compliance_frameworks_tenant_idx ON compliance_frameworks (tenant_id, status, name);

CREATE TABLE IF NOT EXISTS compliance_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  framework_id uuid NOT NULL REFERENCES compliance_frameworks(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  policy_name text NOT NULL,
  policy_basis text,
  entity_type text,
  location_type text,
  camera_type text,
  normal_retention_days integer CHECK (normal_retention_days >= 0),
  hot_storage_days integer CHECK (hot_storage_days >= 0),
  warm_storage_days integer CHECK (warm_storage_days >= 0),
  cold_storage_days integer CHECK (cold_storage_days >= 0),
  backup_required boolean NOT NULL DEFAULT false,
  legal_hold_override boolean NOT NULL DEFAULT false,
  incident_retention_days integer CHECK (incident_retention_days >= 0),
  automatic_deletion_eligibility boolean NOT NULL DEFAULT true,
  approval_authority text,
  effective_date date,
  review_date date,
  notes text,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS compliance_policies_framework_idx ON compliance_policies (framework_id, tenant_id);

CREATE TABLE IF NOT EXISTS compliance_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  framework_id uuid NOT NULL REFERENCES compliance_frameworks(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_node_id uuid REFERENCES resource_nodes(id),
  assessment_period_start date,
  assessment_period_end date,
  status compliance_assessment_status NOT NULL DEFAULT 'incomplete',
  summary jsonb,
  evidence jsonb,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS compliance_assessments_framework_idx ON compliance_assessments (framework_id, branch_node_id, status);

CREATE TABLE IF NOT EXISTS compliance_certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES compliance_assessments(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  certificate_number text NOT NULL,
  title text NOT NULL,
  status compliance_certificate_status NOT NULL DEFAULT 'compliant',
  issued_by uuid REFERENCES users(id),
  issued_at timestamptz NOT NULL DEFAULT now(),
  expiry_date date,
  document_hash text,
  signature text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS compliance_certificates_assessment_idx ON compliance_certificates (assessment_id, status);
