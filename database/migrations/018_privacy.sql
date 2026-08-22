-- Privacy & Data Protection Module
-- Implements DPDP-style purpose, control, and breach tracking for cameras.

CREATE TYPE privacy_breach_status AS ENUM (
  'reported',
  'investigating',
  'contained',
  'resolved',
  'closed'
);

CREATE TYPE privacy_severity AS ENUM (
  'low',
  'medium',
  'high',
  'critical'
);

CREATE TABLE privacy_purposes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  lawful_basis text NOT NULL,
  description text,
  risk_level text NOT NULL DEFAULT 'medium',
  data_categories jsonb NOT NULL DEFAULT '[]'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX privacy_purposes_tenant_idx ON privacy_purposes (tenant_id);

CREATE TABLE camera_privacy_purpose_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camera_id uuid NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  purpose_id uuid NOT NULL REFERENCES privacy_purposes(id) ON DELETE CASCADE,
  start_date date,
  end_date date,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX camera_privacy_purpose_assignments_camera_idx
  ON camera_privacy_purpose_assignments (camera_id);
CREATE INDEX camera_privacy_purpose_assignments_purpose_idx
  ON camera_privacy_purpose_assignments (purpose_id);

CREATE TABLE camera_privacy_controls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camera_id uuid NOT NULL UNIQUE REFERENCES cameras(id) ON DELETE CASCADE,
  audio_recording_approved boolean NOT NULL DEFAULT false,
  encryption_enabled boolean NOT NULL DEFAULT false,
  disposal_plan text,
  data_protection_officer text,
  last_reviewed_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE privacy_breaches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_node_id uuid REFERENCES resource_nodes(id) ON DELETE SET NULL,
  camera_id uuid REFERENCES cameras(id) ON DELETE SET NULL,
  breach_type text NOT NULL,
  severity privacy_severity NOT NULL DEFAULT 'medium',
  status privacy_breach_status NOT NULL DEFAULT 'reported',
  discovered_at timestamptz NOT NULL,
  description text,
  remediation text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX privacy_breaches_tenant_idx ON privacy_breaches (tenant_id);
CREATE INDEX privacy_breaches_status_idx ON privacy_breaches (status);
CREATE INDEX privacy_breaches_camera_idx ON privacy_breaches (camera_id);
