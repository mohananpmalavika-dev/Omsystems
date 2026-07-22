-- ============================================================
-- INCIDENT MANAGEMENT & INVESTIGATION COMPREHENSIVE SCHEMA
-- Migration: 023
-- Description: Complete incident management with investigation,
--              evidence, police, insurance, and reporting
-- ============================================================

-- ============ ENUMS ============

DO $$ BEGIN
  CREATE TYPE incident_type AS ENUM (
    'theft-robbery', 'fire-emergency', 'atm-tampering', 'unauthorized-access',
    'suspicious-activity', 'accident-injury', 'vandalism', 'customer-dispute',
    'cash-shortage-excess', 'teller-dispute', 'vault-violation', 'locker-room-incident',
    'employee-misconduct', 'fraud-suspicion', 'cyber-tampering', 'camera-tampering',
    'panic-button', 'vehicle-incident', 'lost-property', 'workplace-safety',
    'false-alarm', 'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE incident_severity AS ENUM ('P1', 'P2', 'P3', 'P4', 'P5');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE incident_status_enum AS ENUM (
    'draft', 'new', 'acknowledged', 'under-triage', 'assigned',
    'under-investigation', 'awaiting-information', 'escalated',
    'police-intimated', 'insurance-submitted', 'resolved',
    'closed', 'reopened', 'cancelled', 'false-alarm'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE incident_detection_source AS ENUM (
    'manual-operator', 'manual-branch', 'manual-mobile',
    'ai-detection', 'external-alarm', 'external-atm',
    'external-access-control', 'external-panic', 'external-fire',
    'post-event-discovery'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE incident_confidentiality_level AS ENUM (
    'public', 'internal', 'confidential', 'restricted', 'highly-restricted'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE incident_participant_role AS ENUM (
    'suspect', 'victim', 'witness', 'customer', 'employee',
    'investigator', 'reporter', 'approver', 'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE incident_event_type AS ENUM (
    'status_changed', 'assigned', 'escalated', 'video_preserved',
    'camera_added', 'clip_created', 'snapshot_taken', 'evidence_exported',
    'police_intimated', 'insurance_filed', 'note_added', 'participant_added',
    'task_created', 'approval_requested', 'approval_granted', 'approval_rejected'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ============ CORE INCIDENT TABLE (Enhanced) ============

-- Drop and recreate incidents table with comprehensive fields
DROP TABLE IF EXISTS incidents CASCADE;

CREATE TABLE incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_number text NOT NULL UNIQUE,
  tenant_id text NOT NULL,
  branch_id uuid REFERENCES resource_nodes(id),
  
  -- Basic Information
  title text NOT NULL CHECK (char_length(title) >= 3 AND char_length(title) <= 200),
  description text CHECK (char_length(description) <= 5000),
  incident_type incident_type NOT NULL DEFAULT 'other',
  severity incident_severity NOT NULL DEFAULT 'P3',
  status incident_status_enum NOT NULL DEFAULT 'new',
  detection_source incident_detection_source NOT NULL DEFAULT 'manual-operator',
  
  -- Timeline
  occurred_at timestamptz NOT NULL,
  detected_at timestamptz NOT NULL DEFAULT now(),
  reported_at timestamptz,
  closed_at timestamptz,
  
  -- Ownership
  reported_by uuid REFERENCES users(id),
  assigned_to uuid REFERENCES users(id),
  
  -- Impact Assessment
  estimated_loss numeric(15, 2),
  injury_details text CHECK (char_length(injury_details) <= 1000),
  
  -- Classification
  confidentiality_level incident_confidentiality_level NOT NULL DEFAULT 'internal',
  legal_hold_status boolean NOT NULL DEFAULT false,
  police_required boolean NOT NULL DEFAULT false,
  insurance_required boolean NOT NULL DEFAULT false,
  
  -- Audit
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  CONSTRAINT incidents_dates_check CHECK (occurred_at <= detected_at)
);

CREATE INDEX incidents_tenant_status_idx ON incidents (tenant_id, status, occurred_at DESC);
CREATE INDEX incidents_branch_idx ON incidents (branch_id) WHERE branch_id IS NOT NULL;
CREATE INDEX incidents_assigned_idx ON incidents (assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX incidents_severity_idx ON incidents (severity, status);
CREATE INDEX incidents_type_idx ON incidents (incident_type, tenant_id);
CREATE INDEX incidents_occurred_idx ON incidents (occurred_at DESC);

COMMENT ON TABLE incidents IS 'Core incident records with comprehensive tracking';
COMMENT ON COLUMN incidents.incident_number IS 'Unique incident reference number (e.g., INC-KL-2026-000184)';
COMMENT ON COLUMN incidents.confidentiality_level IS 'Access control classification';
COMMENT ON COLUMN incidents.legal_hold_status IS 'Whether any evidence has active legal hold';


-- ============ PARTICIPANTS ============

CREATE TABLE incident_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  role incident_participant_role NOT NULL,
  person_type text NOT NULL CHECK (person_type IN ('customer', 'employee', 'vendor', 'visitor', 'unknown')),
  
  -- Identity
  name text CHECK (char_length(name) <= 200),
  employee_id text CHECK (char_length(employee_id) <= 50),
  customer_id text CHECK (char_length(customer_id) <= 50),
  
  -- Contact
  contact_phone text CHECK (char_length(contact_phone) <= 20),
  contact_email text CHECK (char_length(contact_email) <= 100),
  
  -- Notes
  notes text CHECK (char_length(notes) <= 1000),
  
  -- Audit
  added_by uuid NOT NULL REFERENCES users(id),
  added_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX incident_participants_incident_idx ON incident_participants (incident_id);
CREATE INDEX incident_participants_role_idx ON incident_participants (incident_id, role);

COMMENT ON TABLE incident_participants IS 'People involved in incidents (suspects, victims, witnesses, etc.)';

-- ============ CAMERAS AND VIDEO ============

CREATE TABLE incident_cameras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  camera_id uuid NOT NULL REFERENCES cameras(id),
  is_primary boolean NOT NULL DEFAULT false,
  added_at timestamptz NOT NULL DEFAULT now(),
  added_by uuid NOT NULL REFERENCES users(id),
  
  UNIQUE (incident_id, camera_id)
);

CREATE INDEX incident_cameras_incident_idx ON incident_cameras (incident_id);
CREATE INDEX incident_cameras_camera_idx ON incident_cameras (camera_id);

CREATE TABLE incident_video_ranges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  camera_id uuid NOT NULL REFERENCES cameras(id),
  from_at timestamptz NOT NULL,
  to_at timestamptz NOT NULL,
  preserved_at timestamptz NOT NULL DEFAULT now(),
  preserved_by uuid NOT NULL REFERENCES users(id),
  legal_hold_applied boolean NOT NULL DEFAULT false,
  legal_hold_id uuid REFERENCES recording_legal_holds(id),
  notes text CHECK (char_length(notes) <= 500),
  
  CONSTRAINT video_range_dates_check CHECK (from_at < to_at)
);

CREATE INDEX incident_video_ranges_incident_idx ON incident_video_ranges (incident_id);
CREATE INDEX incident_video_ranges_camera_idx ON incident_video_ranges (camera_id, from_at, to_at);
CREATE INDEX incident_video_ranges_legal_hold_idx ON incident_video_ranges (legal_hold_id) WHERE legal_hold_id IS NOT NULL;

COMMENT ON TABLE incident_video_ranges IS 'Video time ranges preserved for incident investigation';


-- ============ TIMELINE AND EVENTS ============

CREATE TABLE incident_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  event_type incident_event_type NOT NULL,
  description text NOT NULL CHECK (char_length(description) <= 500),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  performed_by uuid REFERENCES users(id),
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX incident_events_incident_idx ON incident_events (incident_id, occurred_at);
CREATE INDEX incident_events_type_idx ON incident_events (event_type, incident_id);
CREATE INDEX incident_events_occurred_idx ON incident_events (occurred_at DESC);

COMMENT ON TABLE incident_events IS 'Append-only timeline of all incident activities';

-- ============ CLIPS AND SNAPSHOTS ============

CREATE TABLE incident_clips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  camera_id uuid NOT NULL REFERENCES cameras(id),
  source_segment_ids uuid[] NOT NULL,
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  clip_type text NOT NULL CHECK (clip_type IN ('original-segment', 'investigation-copy', 'export-copy')),
  storage_path text CHECK (char_length(storage_path) <= 500),
  size_bytes bigint CHECK (size_bytes > 0),
  checksum_sha256 text CHECK (char_length(checksum_sha256) = 64),
  format text CHECK (char_length(format) <= 20),
  has_watermark boolean NOT NULL DEFAULT false,
  has_timestamp boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  notes text CHECK (char_length(notes) <= 500),
  
  CONSTRAINT clip_dates_check CHECK (start_time < end_time)
);

CREATE INDEX incident_clips_incident_idx ON incident_clips (incident_id);
CREATE INDEX incident_clips_camera_idx ON incident_clips (camera_id);
CREATE INDEX incident_clips_checksum_idx ON incident_clips (checksum_sha256) WHERE checksum_sha256 IS NOT NULL;

CREATE TABLE incident_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  camera_id uuid NOT NULL REFERENCES cameras(id),
  segment_id uuid,
  timestamp timestamptz NOT NULL,
  snapshot_type text NOT NULL CHECK (snapshot_type IN ('original', 'annotated', 'cropped', 'enhanced')),
  storage_path text CHECK (char_length(storage_path) <= 500),
  checksum_sha256 text CHECK (char_length(checksum_sha256) = 64),
  description text CHECK (char_length(description) <= 500),
  annotations jsonb,
  enhancement_details jsonb,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX incident_snapshots_incident_idx ON incident_snapshots (incident_id);
CREATE INDEX incident_snapshots_camera_idx ON incident_snapshots (camera_id, timestamp);
CREATE INDEX incident_snapshots_type_idx ON incident_snapshots (snapshot_type, incident_id);

COMMENT ON TABLE incident_clips IS 'Video clips extracted for investigation';
COMMENT ON TABLE incident_snapshots IS 'Still images captured for evidence';


-- ============ EVIDENCE MANAGEMENT ============

CREATE TABLE incident_evidence_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  item_type text NOT NULL CHECK (char_length(item_type) <= 100),
  title text NOT NULL CHECK (char_length(title) >= 3 AND char_length(title) <= 200),
  description text CHECK (char_length(description) <= 1000),
  reference_id text CHECK (char_length(reference_id) <= 100),
  storage_path text CHECK (char_length(storage_path) <= 500),
  checksum_sha256 text CHECK (char_length(checksum_sha256) = 64),
  added_by uuid NOT NULL REFERENCES users(id),
  added_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX incident_evidence_items_incident_idx ON incident_evidence_items (incident_id);
CREATE INDEX incident_evidence_items_type_idx ON incident_evidence_items (item_type, incident_id);

CREATE TABLE incident_evidence_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  package_number text NOT NULL UNIQUE,
  title text NOT NULL CHECK (char_length(title) >= 3 AND char_length(title) <= 200),
  description text CHECK (char_length(description) <= 1000),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending-approval', 'approved', 'generating', 'ready', 'failed', 'downloaded', 'expired')),
  
  -- Content flags
  include_original_video boolean NOT NULL DEFAULT true,
  include_investigation_clips boolean NOT NULL DEFAULT true,
  include_snapshots boolean NOT NULL DEFAULT true,
  include_timeline boolean NOT NULL DEFAULT true,
  include_alert_logs boolean NOT NULL DEFAULT true,
  include_documents boolean NOT NULL DEFAULT true,
  
  -- Package details
  package_path text CHECK (char_length(package_path) <= 500),
  package_size_bytes bigint CHECK (package_size_bytes > 0),
  checksum_sha256 text CHECK (char_length(checksum_sha256) = 64),
  manifest_path text CHECK (char_length(manifest_path) <= 500),
  digitally_signed boolean NOT NULL DEFAULT false,
  signature text,
  
  -- Workflow
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_by uuid REFERENCES users(id),
  approved_at timestamptz,
  generated_at timestamptz,
  expires_at timestamptz,
  downloaded_by uuid REFERENCES users(id),
  downloaded_at timestamptz,
  error text
);

CREATE INDEX incident_evidence_packages_incident_idx ON incident_evidence_packages (incident_id);
CREATE INDEX incident_evidence_packages_status_idx ON incident_evidence_packages (status, incident_id);
CREATE INDEX incident_evidence_packages_expires_idx ON incident_evidence_packages (expires_at) WHERE expires_at IS NOT NULL;

COMMENT ON TABLE incident_evidence_packages IS 'Comprehensive evidence packages for authorities';
COMMENT ON COLUMN incident_evidence_packages.digitally_signed IS 'Whether package has cryptographic signature';


-- ============ POLICE INTIMATION ============

CREATE TABLE incident_police_intimations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  
  -- Police Station Details
  police_station text NOT NULL CHECK (char_length(police_station) >= 3 AND char_length(police_station) <= 200),
  police_station_address text CHECK (char_length(police_station_address) <= 500),
  
  -- Intimation Details
  intimation_method text NOT NULL CHECK (intimation_method IN ('in-person', 'email', 'phone', 'portal', 'other')),
  intimated_at timestamptz NOT NULL,
  intimated_by uuid NOT NULL REFERENCES users(id),
  
  -- Officer Details
  officer_name text CHECK (char_length(officer_name) <= 100),
  officer_designation text CHECK (char_length(officer_designation) <= 100),
  officer_contact text CHECK (char_length(officer_contact) <= 50),
  
  -- FIR Details
  gd_number text CHECK (char_length(gd_number) <= 100),
  fir_number text CHECK (char_length(fir_number) <= 100),
  fir_date date,
  fir_copy text CHECK (char_length(fir_copy) <= 500),
  acknowledgement_copy text CHECK (char_length(acknowledgement_copy) <= 500),
  
  -- Status
  status text NOT NULL DEFAULT 'intimated' CHECK (status IN (
    'required', 'pending-approval', 'approved', 'intimated', 'fir-filed',
    'under-investigation', 'charge-sheet-filed', 'closed', 'not-required'
  )),
  
  -- Investigation Details
  investigation_officer text CHECK (char_length(investigation_officer) <= 100),
  investigation_officer_contact text CHECK (char_length(investigation_officer_contact) <= 50),
  follow_up_date date,
  notes text CHECK (char_length(notes) <= 1000),
  
  -- Audit
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX incident_police_intimations_incident_idx ON incident_police_intimations (incident_id);
CREATE INDEX incident_police_intimations_status_idx ON incident_police_intimations (status);
CREATE INDEX incident_police_intimations_fir_idx ON incident_police_intimations (fir_number) WHERE fir_number IS NOT NULL;

COMMENT ON TABLE incident_police_intimations IS 'Police notification and FIR tracking';

CREATE TABLE incident_police_evidence_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  police_intimation_id uuid NOT NULL REFERENCES incident_police_intimations(id) ON DELETE CASCADE,
  
  -- Transfer Details
  transfer_date timestamptz NOT NULL,
  transferred_by uuid NOT NULL REFERENCES users(id),
  evidence_package_id uuid REFERENCES incident_evidence_packages(id),
  evidence_description text NOT NULL CHECK (char_length(evidence_description) >= 10 AND char_length(evidence_description) <= 1000),
  
  -- Recipient Details
  recipient_name text NOT NULL CHECK (char_length(recipient_name) >= 3 AND char_length(recipient_name) <= 100),
  recipient_designation text CHECK (char_length(recipient_designation) <= 100),
  receipt_acknowledgement text CHECK (char_length(receipt_acknowledgement) <= 500),
  
  -- Transfer Method
  transfer_method text NOT NULL CHECK (transfer_method IN ('physical-media', 'secure-link', 'portal', 'in-person', 'other')),
  notes text CHECK (char_length(notes) <= 1000),
  
  -- Audit
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX incident_police_transfers_incident_idx ON incident_police_evidence_transfers (incident_id);
CREATE INDEX incident_police_transfers_intimation_idx ON incident_police_evidence_transfers (police_intimation_id);

COMMENT ON TABLE incident_police_evidence_transfers IS 'Chain of custody for evidence shared with police';


-- ============ INSURANCE CLAIMS ============

CREATE TABLE incident_insurance_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  
  -- Insurance Details
  insurance_company text NOT NULL CHECK (char_length(insurance_company) >= 3 AND char_length(insurance_company) <= 200),
  policy_number text NOT NULL CHECK (char_length(policy_number) >= 3 AND char_length(policy_number) <= 100),
  claim_number text CHECK (char_length(claim_number) <= 100),
  
  -- Loss Details
  date_of_loss timestamptz NOT NULL,
  estimated_loss numeric(15, 2) NOT NULL CHECK (estimated_loss >= 0),
  claim_amount numeric(15, 2) CHECK (claim_amount >= 0),
  
  -- Submission
  submitted_date timestamptz,
  submitted_by uuid REFERENCES users(id),
  
  -- Survey Details
  surveyor_name text CHECK (char_length(surveyor_name) <= 100),
  surveyor_contact text CHECK (char_length(surveyor_contact) <= 50),
  survey_date date,
  
  -- Status
  status text NOT NULL DEFAULT 'to-be-filed' CHECK (status IN (
    'not-required', 'to-be-filed', 'prepared', 'submitted',
    'additional-info-required', 'survey-in-progress', 'approved',
    'partially-approved', 'rejected', 'settled', 'closed'
  )),
  
  -- Settlement
  settlement_amount numeric(15, 2) CHECK (settlement_amount >= 0),
  settlement_date date,
  rejection_reason text CHECK (char_length(rejection_reason) <= 500),
  notes text CHECK (char_length(notes) <= 1000),
  
  -- Audit
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX incident_insurance_claims_incident_idx ON incident_insurance_claims (incident_id);
CREATE INDEX incident_insurance_claims_status_idx ON incident_insurance_claims (status);
CREATE INDEX incident_insurance_claims_claim_number_idx ON incident_insurance_claims (claim_number) WHERE claim_number IS NOT NULL;

COMMENT ON TABLE incident_insurance_claims IS 'Insurance claim tracking and settlement';

CREATE TABLE incident_insurance_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  claim_id uuid NOT NULL REFERENCES incident_insurance_claims(id) ON DELETE CASCADE,
  document_type text NOT NULL CHECK (char_length(document_type) >= 3 AND char_length(document_type) <= 100),
  document_title text NOT NULL CHECK (char_length(document_title) >= 3 AND char_length(document_title) <= 200),
  document_path text CHECK (char_length(document_path) <= 500),
  uploaded_by uuid NOT NULL REFERENCES users(id),
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX incident_insurance_documents_incident_idx ON incident_insurance_documents (incident_id);
CREATE INDEX incident_insurance_documents_claim_idx ON incident_insurance_documents (claim_id);


-- ============ TASKS AND NOTES ============

CREATE TABLE incident_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  task_name text NOT NULL CHECK (char_length(task_name) >= 3 AND char_length(task_name) <= 200),
  description text CHECK (char_length(description) <= 1000),
  assigned_to uuid REFERENCES users(id),
  due_date timestamptz,
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in-progress', 'completed', 'cancelled')),
  is_mandatory boolean NOT NULL DEFAULT false,
  completed_by uuid REFERENCES users(id),
  completed_at timestamptz,
  completion_notes text CHECK (char_length(completion_notes) <= 1000),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX incident_tasks_incident_idx ON incident_tasks (incident_id);
CREATE INDEX incident_tasks_assigned_idx ON incident_tasks (assigned_to, status) WHERE assigned_to IS NOT NULL;
CREATE INDEX incident_tasks_due_idx ON incident_tasks (due_date) WHERE due_date IS NOT NULL AND status != 'completed';

COMMENT ON TABLE incident_tasks IS 'Corrective and follow-up tasks for incidents';
COMMENT ON COLUMN incident_tasks.is_mandatory IS 'Whether task must be completed before incident closure';

CREATE TABLE incident_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  note_type text NOT NULL DEFAULT 'general' CHECK (note_type IN ('general', 'investigation', 'management', 'legal', 'confidential')),
  content text NOT NULL CHECK (char_length(content) >= 10 AND char_length(content) <= 5000),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz
);

CREATE INDEX incident_notes_incident_idx ON incident_notes (incident_id, created_at DESC);
CREATE INDEX incident_notes_type_idx ON incident_notes (note_type, incident_id);
CREATE INDEX incident_notes_created_by_idx ON incident_notes (created_by);

COMMENT ON TABLE incident_notes IS 'Investigation notes with confidentiality levels';


-- ============ SECURE SHARING WITH AUTHORITIES ============

CREATE TABLE incident_secure_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  evidence_package_id uuid REFERENCES incident_evidence_packages(id),
  
  -- Share Details
  share_token text NOT NULL UNIQUE CHECK (char_length(share_token) >= 32),
  share_url text NOT NULL CHECK (char_length(share_url) <= 500),
  
  -- Recipient Details
  recipient_name text NOT NULL CHECK (char_length(recipient_name) >= 3 AND char_length(recipient_name) <= 100),
  recipient_organization text NOT NULL CHECK (char_length(recipient_organization) >= 3 AND char_length(recipient_organization) <= 200),
  recipient_email text CHECK (char_length(recipient_email) <= 100),
  recipient_verified boolean NOT NULL DEFAULT false,
  
  -- Purpose and Access Control
  purpose text NOT NULL CHECK (char_length(purpose) >= 10 AND char_length(purpose) <= 500),
  one_time_password text CHECK (char_length(one_time_password) = 6),
  max_downloads int NOT NULL DEFAULT 1 CHECK (max_downloads > 0 AND max_downloads <= 10),
  download_count int NOT NULL DEFAULT 0 CHECK (download_count >= 0),
  expires_at timestamptz NOT NULL,
  
  -- Status
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'downloaded', 'expired', 'revoked')),
  
  -- Security
  watermarked boolean NOT NULL DEFAULT true,
  encrypted boolean NOT NULL DEFAULT true,
  
  -- Workflow
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  downloaded_at timestamptz,
  downloaded_by text CHECK (char_length(downloaded_by) <= 100),
  download_ip inet,
  revoked_at timestamptz,
  revoked_by uuid REFERENCES users(id),
  revoke_reason text CHECK (char_length(revoke_reason) <= 500),
  
  CONSTRAINT secure_shares_download_check CHECK (download_count <= max_downloads)
);

CREATE INDEX incident_secure_shares_incident_idx ON incident_secure_shares (incident_id);
CREATE INDEX incident_secure_shares_token_idx ON incident_secure_shares (share_token);
CREATE INDEX incident_secure_shares_status_idx ON incident_secure_shares (status, expires_at);
CREATE INDEX incident_secure_shares_expires_idx ON incident_secure_shares (expires_at) WHERE status = 'active';

COMMENT ON TABLE incident_secure_shares IS 'Secure time-limited evidence sharing with external authorities';
COMMENT ON COLUMN incident_secure_shares.share_token IS 'Cryptographically secure random token';
COMMENT ON COLUMN incident_secure_shares.one_time_password IS '6-digit OTP for additional verification';


-- ============ INCIDENT REPORTS ============

CREATE TABLE incident_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  report_number text NOT NULL UNIQUE,
  report_type text NOT NULL CHECK (report_type IN ('preliminary', 'investigation', 'final', 'executive-summary')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending-review', 'approved', 'final')),
  
  -- Report Content
  executive_summary text CHECK (char_length(executive_summary) <= 2000),
  detailed_chronology text CHECK (char_length(detailed_chronology) <= 10000),
  findings text CHECK (char_length(findings) <= 5000),
  root_cause text CHECK (char_length(root_cause) <= 2000),
  control_failures text CHECK (char_length(control_failures) <= 2000),
  corrective_actions text CHECK (char_length(corrective_actions) <= 2000),
  preventive_actions text CHECK (char_length(preventive_actions) <= 2000),
  recommendations text CHECK (char_length(recommendations) <= 2000),
  conclusions text CHECK (char_length(conclusions) <= 2000),
  evidence_index text CHECK (char_length(evidence_index) <= 2000),
  chain_of_custody_summary text CHECK (char_length(chain_of_custody_summary) <= 2000),
  unresolved_questions text CHECK (char_length(unresolved_questions) <= 2000),
  
  -- Workflow
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  approved_by uuid REFERENCES users(id),
  approved_at timestamptz,
  finalized_at timestamptz,
  report_path text CHECK (char_length(report_path) <= 500)
);

CREATE INDEX incident_reports_incident_idx ON incident_reports (incident_id);
CREATE INDEX incident_reports_status_idx ON incident_reports (status);
CREATE INDEX incident_reports_type_idx ON incident_reports (report_type, incident_id);

COMMENT ON TABLE incident_reports IS 'Formal incident investigation reports';
COMMENT ON COLUMN incident_reports.report_number IS 'Unique report identifier (e.g., RPT-INC-KL-2026-000184-FINAL-01)';


-- ============ TRIGGERS FOR AUTOMATIC UPDATES ============

-- Update incidents.updated_at on any change
CREATE OR REPLACE FUNCTION update_incident_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER incidents_updated_at_trigger
  BEFORE UPDATE ON incidents
  FOR EACH ROW
  EXECUTE FUNCTION update_incident_updated_at();

-- Update police intimations updated_at
CREATE TRIGGER police_intimations_updated_at_trigger
  BEFORE UPDATE ON incident_police_intimations
  FOR EACH ROW
  EXECUTE FUNCTION update_incident_updated_at();

-- Update insurance claims updated_at
CREATE TRIGGER insurance_claims_updated_at_trigger
  BEFORE UPDATE ON incident_insurance_claims
  FOR EACH ROW
  EXECUTE FUNCTION update_incident_updated_at();

-- ============ VIEWS FOR COMMON QUERIES ============

-- Active incidents requiring attention
CREATE OR REPLACE VIEW active_incidents AS
SELECT 
  i.*,
  rn.name as branch_name,
  u1.display_name as reported_by_name,
  u2.display_name as assigned_to_name,
  COUNT(DISTINCT ie.id) as event_count,
  COUNT(DISTINCT it.id) FILTER (WHERE it.status != 'completed') as open_task_count,
  COUNT(DISTINCT iep.id) as evidence_package_count,
  MAX(ie.occurred_at) as last_activity_at
FROM incidents i
LEFT JOIN resource_nodes rn ON i.branch_id = rn.id
LEFT JOIN users u1 ON i.reported_by = u1.id
LEFT JOIN users u2 ON i.assigned_to = u2.id
LEFT JOIN incident_events ie ON i.id = ie.incident_id
LEFT JOIN incident_tasks it ON i.id = it.incident_id
LEFT JOIN incident_evidence_packages iep ON i.id = iep.incident_id
WHERE i.status NOT IN ('closed', 'cancelled', 'false-alarm')
GROUP BY i.id, rn.name, u1.display_name, u2.display_name;

COMMENT ON VIEW active_incidents IS 'Active incidents with summary statistics';

-- Critical incidents dashboard
CREATE OR REPLACE VIEW critical_incidents AS
SELECT 
  i.*,
  rn.name as branch_name,
  COUNT(DISTINCT ic.camera_id) as camera_count,
  COUNT(DISTINCT ip.id) as participant_count,
  EXISTS(SELECT 1 FROM incident_police_intimations ipi WHERE ipi.incident_id = i.id) as police_intimated,
  EXISTS(SELECT 1 FROM incident_insurance_claims iic WHERE iic.incident_id = i.id) as insurance_claimed
FROM incidents i
LEFT JOIN resource_nodes rn ON i.branch_id = rn.id
LEFT JOIN incident_cameras ic ON i.id = ic.incident_id
LEFT JOIN incident_participants ip ON i.id = ip.incident_id
WHERE i.severity IN ('P1', 'P2')
  AND i.status NOT IN ('closed', 'false-alarm')
GROUP BY i.id, rn.name
ORDER BY i.occurred_at DESC;

COMMENT ON VIEW critical_incidents IS 'P1 and P2 incidents requiring immediate attention';


-- ============ STATISTICS FUNCTIONS ============

-- Get incident statistics for a tenant
CREATE OR REPLACE FUNCTION get_incident_statistics(
  p_tenant_id text,
  p_from_date timestamptz DEFAULT now() - interval '30 days',
  p_to_date timestamptz DEFAULT now()
)
RETURNS TABLE (
  total_incidents bigint,
  open_incidents bigint,
  critical_incidents bigint,
  average_resolution_hours numeric,
  incidents_by_type jsonb,
  incidents_by_severity jsonb,
  incidents_by_status jsonb,
  police_intimations_count bigint,
  insurance_claims_count bigint
) AS $$
BEGIN
  RETURN QUERY
  WITH incident_stats AS (
    SELECT 
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status NOT IN ('closed', 'resolved', 'false-alarm')) as open,
      COUNT(*) FILTER (WHERE severity = 'P1') as critical,
      AVG(EXTRACT(EPOCH FROM (closed_at - detected_at)) / 3600) FILTER (WHERE closed_at IS NOT NULL) as avg_hours,
      jsonb_object_agg(incident_type, type_count) as by_type,
      jsonb_object_agg(severity, severity_count) as by_severity,
      jsonb_object_agg(status, status_count) as by_status
    FROM incidents i
    CROSS JOIN LATERAL (
      SELECT incident_type, COUNT(*) as type_count 
      FROM incidents 
      WHERE tenant_id = p_tenant_id 
        AND occurred_at BETWEEN p_from_date AND p_to_date
      GROUP BY incident_type
    ) types
    CROSS JOIN LATERAL (
      SELECT severity, COUNT(*) as severity_count
      FROM incidents
      WHERE tenant_id = p_tenant_id
        AND occurred_at BETWEEN p_from_date AND p_to_date
      GROUP BY severity
    ) severities
    CROSS JOIN LATERAL (
      SELECT status, COUNT(*) as status_count
      FROM incidents
      WHERE tenant_id = p_tenant_id
        AND occurred_at BETWEEN p_from_date AND p_to_date
      GROUP BY status
    ) statuses
    WHERE i.tenant_id = p_tenant_id
      AND i.occurred_at BETWEEN p_from_date AND p_to_date
  ),
  police_stats AS (
    SELECT COUNT(DISTINCT ipi.id) as police_count
    FROM incident_police_intimations ipi
    JOIN incidents i ON ipi.incident_id = i.id
    WHERE i.tenant_id = p_tenant_id
      AND i.occurred_at BETWEEN p_from_date AND p_to_date
  ),
  insurance_stats AS (
    SELECT COUNT(DISTINCT iic.id) as insurance_count
    FROM incident_insurance_claims iic
    JOIN incidents i ON iic.incident_id = i.id
    WHERE i.tenant_id = p_tenant_id
      AND i.occurred_at BETWEEN p_from_date AND p_to_date
  )
  SELECT 
    incident_stats.total,
    incident_stats.open,
    incident_stats.critical,
    ROUND(incident_stats.avg_hours::numeric, 1),
    incident_stats.by_type,
    incident_stats.by_severity,
    incident_stats.by_status,
    police_stats.police_count,
    insurance_stats.insurance_count
  FROM incident_stats, police_stats, insurance_stats;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_incident_statistics IS 'Comprehensive incident statistics for dashboard';

-- ============ CLEANUP AND MAINTENANCE ============

-- Function to expire old secure shares
CREATE OR REPLACE FUNCTION expire_old_secure_shares()
RETURNS void AS $$
BEGIN
  UPDATE incident_secure_shares
  SET status = 'expired'
  WHERE status = 'active'
    AND expires_at < now();
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION expire_old_secure_shares IS 'Marks expired shares as expired (run periodically)';

-- ============ GRANTS ============

-- Grant appropriate permissions (adjust based on your role structure)
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- Read-only access for reporting roles
GRANT SELECT ON active_incidents, critical_incidents TO reporting_role;

-- ============ MIGRATION COMPLETE ============

COMMENT ON SCHEMA public IS 'Incident Management & Investigation - Migration 023 - Complete';

