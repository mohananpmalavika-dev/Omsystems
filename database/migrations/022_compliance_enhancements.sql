-- Enhanced Compliance Management System
-- Adds: Controls, Requirements, Evidence, Audits, Remediation, Risk Management

-- Compliance Control Types
DO $$ BEGIN
  CREATE TYPE compliance_control_type AS ENUM (
    'preventive', 'detective', 'corrective', 'compensating', 'directive'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE compliance_requirement_status AS ENUM (
    'active', 'draft', 'deprecated', 'archived'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE compliance_test_status AS ENUM (
    'not_started', 'in_progress', 'passed', 'failed', 'not_applicable'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE remediation_status AS ENUM (
    'identified', 'planned', 'in_progress', 'completed', 'verified', 'closed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE risk_level AS ENUM ('critical', 'high', 'medium', 'low', 'negligible');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Compliance Requirements (specific requirements within frameworks)
CREATE TABLE IF NOT EXISTS compliance_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  framework_id uuid NOT NULL REFERENCES compliance_frameworks(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES compliance_requirements(id) ON DELETE CASCADE,
  
  requirement_code text NOT NULL, -- e.g., "ISO-27001-A.9.1.1"
  title text NOT NULL,
  description text NOT NULL,
  category text, -- e.g., "Access Control", "Physical Security"
  
  control_type compliance_control_type,
  is_mandatory boolean NOT NULL DEFAULT true,
  applicable_to text[], -- ['branch', 'hq', 'data_center']
  
  testing_frequency_days integer, -- How often to test
  evidence_required boolean NOT NULL DEFAULT true,
  
  owner_role text, -- Role responsible (e.g., 'security_officer')
  owner_user_id uuid REFERENCES users(id),
  
  status compliance_requirement_status NOT NULL DEFAULT 'active',
  
  implementation_guidance text,
  reference_links jsonb, -- External documentation links
  tags text[],
  
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE (tenant_id, framework_id, requirement_code)
);

CREATE INDEX compliance_requirements_framework_idx 
  ON compliance_requirements (framework_id, status);
CREATE INDEX compliance_requirements_category_idx 
  ON compliance_requirements (category, status);
CREATE INDEX compliance_requirements_owner_idx 
  ON compliance_requirements (owner_user_id, status);

-- Compliance Controls (specific implementations)
CREATE TABLE IF NOT EXISTS compliance_controls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  requirement_id uuid NOT NULL REFERENCES compliance_requirements(id) ON DELETE CASCADE,
  
  control_name text NOT NULL,
  control_description text NOT NULL,
  control_type compliance_control_type NOT NULL,
  
  implementation_status text NOT NULL DEFAULT 'planned'
    CHECK (implementation_status IN (
      'planned', 'in_progress', 'implemented', 'verified', 'failed'
    )),
  
  -- Effectiveness tracking
  effectiveness_rating integer CHECK (effectiveness_rating BETWEEN 1 AND 5),
  last_test_date timestamptz,
  next_test_date timestamptz,
  test_frequency_days integer DEFAULT 90,
  
  -- Technical details
  technical_implementation text, -- How it's implemented technically
  automated boolean NOT NULL DEFAULT false,
  continuous_monitoring boolean NOT NULL DEFAULT false,
  
  -- Ownership
  control_owner uuid REFERENCES users(id),
  responsible_team text,
  
  -- Documentation
  procedure_document_url text,
  training_required boolean NOT NULL DEFAULT false,
  
  metadata jsonb,
  
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX compliance_controls_requirement_idx 
  ON compliance_controls (requirement_id, implementation_status);
CREATE INDEX compliance_controls_owner_idx 
  ON compliance_controls (control_owner);
CREATE INDEX compliance_controls_test_due_idx 
  ON compliance_controls (next_test_date) 
  WHERE implementation_status = 'implemented';

-- Evidence Collection
CREATE TABLE IF NOT EXISTS compliance_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  requirement_id uuid REFERENCES compliance_requirements(id) ON DELETE CASCADE,
  control_id uuid REFERENCES compliance_controls(id) ON DELETE CASCADE,
  assessment_id uuid REFERENCES compliance_assessments(id) ON DELETE CASCADE,
  
  evidence_type text NOT NULL CHECK (evidence_type IN (
    'document', 'screenshot', 'log_file', 'certificate', 
    'test_result', 'audit_report', 'video_recording', 'configuration',
    'interview', 'observation', 'automated_scan'
  )),
  
  title text NOT NULL,
  description text,
  
  -- Storage
  file_url text,
  file_hash text, -- SHA-256 for integrity
  file_size_bytes bigint,
  file_mime_type text,
  
  -- Metadata
  collection_date timestamptz NOT NULL DEFAULT now(),
  evidence_date timestamptz, -- When the evidence is from
  expiry_date timestamptz, -- When evidence becomes stale
  
  -- Validation
  validated boolean NOT NULL DEFAULT false,
  validated_by uuid REFERENCES users(id),
  validated_at timestamptz,
  validation_notes text,
  
  -- Organization
  tags text[],
  sensitivity text DEFAULT 'internal' CHECK (sensitivity IN (
    'public', 'internal', 'confidential', 'restricted'
  )),
  
  collected_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX compliance_evidence_requirement_idx 
  ON compliance_evidence (requirement_id, collection_date DESC);
CREATE INDEX compliance_evidence_control_idx 
  ON compliance_evidence (control_id, collection_date DESC);
CREATE INDEX compliance_evidence_assessment_idx 
  ON compliance_evidence (assessment_id);
CREATE INDEX compliance_evidence_expiry_idx 
  ON compliance_evidence (expiry_date) 
  WHERE validated = true AND expiry_date IS NOT NULL;

-- Compliance Testing & Audits
CREATE TABLE IF NOT EXISTS compliance_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  control_id uuid NOT NULL REFERENCES compliance_controls(id) ON DELETE CASCADE,
  
  test_name text NOT NULL,
  test_type text NOT NULL CHECK (test_type IN (
    'design_review', 'implementation_test', 'effectiveness_test',
    'penetration_test', 'vulnerability_scan', 'configuration_review',
    'access_review', 'log_review', 'interview', 'observation'
  )),
  
  test_date timestamptz NOT NULL,
  tester_id uuid REFERENCES users(id),
  tester_name text, -- For external auditors
  
  status compliance_test_status NOT NULL DEFAULT 'not_started',
  
  -- Test methodology
  test_procedure text,
  test_criteria text,
  sample_size integer,
  
  -- Results
  findings text,
  issues_found integer DEFAULT 0,
  risk_rating risk_level,
  
  pass_fail boolean,
  score numeric(5,2), -- Percentage score
  
  evidence_collected text[],
  recommendations text,
  
  next_test_date timestamptz,
  
  metadata jsonb,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX compliance_tests_control_idx 
  ON compliance_tests (control_id, test_date DESC);
CREATE INDEX compliance_tests_status_idx 
  ON compliance_tests (status, test_date);
CREATE INDEX compliance_tests_next_test_idx 
  ON compliance_tests (next_test_date) WHERE status = 'passed';

-- Findings & Issues
CREATE TABLE IF NOT EXISTS compliance_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  assessment_id uuid REFERENCES compliance_assessments(id) ON DELETE CASCADE,
  test_id uuid REFERENCES compliance_tests(id) ON DELETE CASCADE,
  requirement_id uuid REFERENCES compliance_requirements(id),
  control_id uuid REFERENCES compliance_controls(id),
  
  finding_number text NOT NULL, -- e.g., "F-2024-001"
  title text NOT NULL,
  description text NOT NULL,
  
  finding_type text NOT NULL CHECK (finding_type IN (
    'non_compliance', 'gap', 'weakness', 'observation', 
    'best_practice', 'risk', 'deficiency'
  )),
  
  severity risk_level NOT NULL,
  likelihood risk_level NOT NULL,
  risk_score integer GENERATED ALWAYS AS (
    CASE severity
      WHEN 'critical' THEN 5
      WHEN 'high' THEN 4
      WHEN 'medium' THEN 3
      WHEN 'low' THEN 2
      ELSE 1
    END *
    CASE likelihood
      WHEN 'critical' THEN 5
      WHEN 'high' THEN 4
      WHEN 'medium' THEN 3
      WHEN 'low' THEN 2
      ELSE 1
    END
  ) STORED,
  
  impact_description text,
  root_cause text,
  
  affected_systems text[],
  affected_locations uuid[], -- Branch IDs
  
  discovered_date timestamptz NOT NULL DEFAULT now(),
  discovered_by uuid REFERENCES users(id),
  
  status text NOT NULL DEFAULT 'open' CHECK (status IN (
    'open', 'in_review', 'remediation_planned', 'remediation_in_progress',
    'remediation_completed', 'verified', 'closed', 'accepted_risk'
  )),
  
  assigned_to uuid REFERENCES users(id),
  due_date timestamptz,
  
  recommendations text,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  
  UNIQUE (tenant_id, finding_number)
);

CREATE INDEX compliance_findings_assessment_idx 
  ON compliance_findings (assessment_id, status);
CREATE INDEX compliance_findings_severity_idx 
  ON compliance_findings (severity, status);
CREATE INDEX compliance_findings_assigned_idx 
  ON compliance_findings (assigned_to, status);
CREATE INDEX compliance_findings_due_idx 
  ON compliance_findings (due_date) WHERE status NOT IN ('closed', 'verified');

-- Remediation Plans
CREATE TABLE IF NOT EXISTS compliance_remediation_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  finding_id uuid NOT NULL REFERENCES compliance_findings(id) ON DELETE CASCADE,
  
  plan_number text NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  
  status remediation_status NOT NULL DEFAULT 'identified',
  
  -- Planning
  proposed_solution text NOT NULL,
  implementation_steps text,
  resource_requirements text,
  estimated_cost numeric(12,2),
  
  -- Timeline
  planned_start_date date,
  planned_completion_date date,
  actual_start_date date,
  actual_completion_date date,
  
  -- Ownership
  owner_id uuid REFERENCES users(id),
  approver_id uuid REFERENCES users(id),
  approved_at timestamptz,
  
  -- Progress tracking
  progress_percentage integer DEFAULT 0 CHECK (progress_percentage BETWEEN 0 AND 100),
  last_updated_date timestamptz DEFAULT now(),
  
  -- Verification
  verification_required boolean NOT NULL DEFAULT true,
  verified_by uuid REFERENCES users(id),
  verified_at timestamptz,
  verification_notes text,
  
  -- Post-implementation
  effectiveness_confirmed boolean DEFAULT false,
  lessons_learned text,
  
  metadata jsonb,
  
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE (tenant_id, plan_number)
);

CREATE INDEX remediation_plans_finding_idx 
  ON compliance_remediation_plans (finding_id, status);
CREATE INDEX remediation_plans_owner_idx 
  ON compliance_remediation_plans (owner_id, status);
CREATE INDEX remediation_plans_due_idx 
  ON compliance_remediation_plans (planned_completion_date) 
  WHERE status NOT IN ('completed', 'verified', 'closed');

-- Remediation Actions (tasks within plans)
CREATE TABLE IF NOT EXISTS compliance_remediation_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES compliance_remediation_plans(id) ON DELETE CASCADE,
  
  action_number text NOT NULL,
  title text NOT NULL,
  description text,
  
  action_type text CHECK (action_type IN (
    'technical_change', 'policy_update', 'training', 'process_improvement',
    'system_configuration', 'access_change', 'documentation', 'other'
  )),
  
  assigned_to uuid REFERENCES users(id),
  
  due_date date,
  completed_at timestamptz,
  
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'in_progress', 'blocked', 'completed', 'verified'
  )),
  
  blocker_description text,
  
  evidence_url text,
  notes text,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX remediation_actions_plan_idx 
  ON compliance_remediation_actions (plan_id, status);
CREATE INDEX remediation_actions_assigned_idx 
  ON compliance_remediation_actions (assigned_to, status);

-- Compliance Risk Register
CREATE TABLE IF NOT EXISTS compliance_risks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  framework_id uuid REFERENCES compliance_frameworks(id),
  requirement_id uuid REFERENCES compliance_requirements(id),
  
  risk_number text NOT NULL,
  risk_title text NOT NULL,
  risk_description text NOT NULL,
  
  risk_category text CHECK (risk_category IN (
    'operational', 'compliance', 'financial', 'reputational',
    'strategic', 'technology', 'third_party', 'legal'
  )),
  
  -- Inherent risk (before controls)
  inherent_likelihood risk_level NOT NULL,
  inherent_impact risk_level NOT NULL,
  inherent_risk_score integer GENERATED ALWAYS AS (
    CASE inherent_likelihood
      WHEN 'critical' THEN 5 WHEN 'high' THEN 4 WHEN 'medium' THEN 3
      WHEN 'low' THEN 2 ELSE 1 END *
    CASE inherent_impact
      WHEN 'critical' THEN 5 WHEN 'high' THEN 4 WHEN 'medium' THEN 3
      WHEN 'low' THEN 2 ELSE 1 END
  ) STORED,
  
  -- Residual risk (after controls)
  residual_likelihood risk_level,
  residual_impact risk_level,
  residual_risk_score integer GENERATED ALWAYS AS (
    CASE residual_likelihood
      WHEN 'critical' THEN 5 WHEN 'high' THEN 4 WHEN 'medium' THEN 3
      WHEN 'low' THEN 2 ELSE 1 END *
    CASE residual_impact
      WHEN 'critical' THEN 5 WHEN 'high' THEN 4 WHEN 'medium' THEN 3
      WHEN 'low' THEN 2 ELSE 1 END
  ) STORED,
  
  -- Risk treatment
  risk_treatment text NOT NULL CHECK (risk_treatment IN (
    'mitigate', 'accept', 'transfer', 'avoid'
  )),
  treatment_plan text,
  
  risk_owner uuid REFERENCES users(id),
  
  status text NOT NULL DEFAULT 'identified' CHECK (status IN (
    'identified', 'assessed', 'treated', 'monitored', 'closed'
  )),
  
  review_frequency_days integer DEFAULT 90,
  last_review_date timestamptz,
  next_review_date timestamptz,
  
  metadata jsonb,
  
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE (tenant_id, risk_number)
);

CREATE INDEX compliance_risks_framework_idx 
  ON compliance_risks (framework_id, status);
CREATE INDEX compliance_risks_owner_idx 
  ON compliance_risks (risk_owner);
CREATE INDEX compliance_risks_score_idx 
  ON compliance_risks (residual_risk_score DESC, status);
CREATE INDEX compliance_risks_review_idx 
  ON compliance_risks (next_review_date) WHERE status = 'monitored';

-- Audit Trail for Compliance Changes
CREATE TABLE IF NOT EXISTS compliance_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id),
  
  action text NOT NULL, -- 'create', 'update', 'delete', 'approve', 'reject'
  entity_type text NOT NULL, -- 'framework', 'requirement', 'control', etc.
  entity_id uuid NOT NULL,
  
  old_values jsonb,
  new_values jsonb,
  
  reason text,
  ip_address inet,
  user_agent text,
  
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX compliance_audit_log_entity_idx 
  ON compliance_audit_log (entity_type, entity_id, created_at DESC);
CREATE INDEX compliance_audit_log_user_idx 
  ON compliance_audit_log (user_id, created_at DESC);
CREATE INDEX compliance_audit_log_tenant_idx 
  ON compliance_audit_log (tenant_id, created_at DESC);

-- Compliance Dashboard Views
CREATE OR REPLACE VIEW compliance_dashboard_summary AS
SELECT 
  f.tenant_id,
  f.id as framework_id,
  f.name as framework_name,
  COUNT(DISTINCT r.id) as total_requirements,
  COUNT(DISTINCT c.id) as total_controls,
  COUNT(DISTINCT c.id) FILTER (WHERE c.implementation_status = 'implemented') as implemented_controls,
  COUNT(DISTINCT cf.id) FILTER (WHERE cf.status = 'open') as open_findings,
  COUNT(DISTINCT cf.id) FILTER (WHERE cf.severity IN ('critical', 'high')) as critical_findings,
  COUNT(DISTINCT ce.id) as total_evidence,
  COUNT(DISTINCT ca.id) as total_assessments,
  MAX(ca.updated_at) as last_assessment_date
FROM compliance_frameworks f
LEFT JOIN compliance_requirements r ON r.framework_id = f.id
LEFT JOIN compliance_controls c ON c.requirement_id = r.id
LEFT JOIN compliance_findings cf ON cf.requirement_id = r.id
LEFT JOIN compliance_evidence ce ON ce.requirement_id = r.id
LEFT JOIN compliance_assessments ca ON ca.framework_id = f.id
WHERE f.status = 'active'
GROUP BY f.tenant_id, f.id, f.name;

-- Add new permissions
INSERT INTO role_permissions (role, action, resource_type, can_grant, description)
VALUES
  -- Compliance Management
  ('super_admin', 'compliance:manage', NULL, true, 'Full compliance management'),
  ('super_admin', 'compliance:audit', NULL, true, 'Conduct compliance audits'),
  ('super_admin', 'compliance:approve', NULL, true, 'Approve compliance assessments'),
  ('company_admin', 'compliance:manage', 'company', true, 'Manage company compliance'),
  ('company_admin', 'compliance:audit', 'company', true, 'Conduct audits'),
  ('hq_admin', 'compliance:manage', 'headquarters', true, 'Manage HQ compliance'),
  ('hq_admin', 'compliance:view', 'headquarters', false, 'View compliance reports'),
  ('branch_manager', 'compliance:view', 'branch', false, 'View branch compliance'),
  ('auditor', 'compliance:audit', NULL, false, 'Conduct compliance audits'),
  ('auditor', 'compliance:view', NULL, false, 'View compliance data')
ON CONFLICT (role, action, resource_type) DO NOTHING;

COMMENT ON TABLE compliance_requirements IS 
  'Specific compliance requirements from frameworks';
COMMENT ON TABLE compliance_controls IS 
  'Implemented controls to meet requirements';
COMMENT ON TABLE compliance_evidence IS 
  'Evidence collected to demonstrate compliance';
COMMENT ON TABLE compliance_tests IS 
  'Testing and validation of controls';
COMMENT ON TABLE compliance_findings IS 
  'Issues and gaps identified during assessments';
COMMENT ON TABLE compliance_remediation_plans IS 
  'Plans to address compliance findings';
COMMENT ON TABLE compliance_risks IS 
  'Compliance risk register';

