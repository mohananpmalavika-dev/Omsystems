-- Compliance Audit & Health Monitoring Enhancement
-- Adds: Camera health checks, recording verification, storage health, 
-- maintenance logs, video access logs, and enhanced compliance features

-- Camera Health Status
DO $$ BEGIN
  CREATE TYPE camera_health_status AS ENUM (
    'healthy', 'warning', 'degraded', 'critical', 'offline', 'maintenance', 'unknown'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE recording_verification_status AS ENUM (
    'compliant', 'compliant_with_observation', 'partially_compliant', 
    'non_compliant', 'not_assessed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE storage_health_status AS ENUM (
    'healthy', 'warning', 'high', 'critical', 'failed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE maintenance_work_type AS ENUM (
    'preventive', 'corrective', 'emergency', 'replacement', 
    'cleaning', 'adjustment', 'firmware_update', 'testing'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- CAMERA HEALTH MONITORING
-- ============================================================================

-- Camera Health Check History
CREATE TABLE IF NOT EXISTS camera_health_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  camera_id uuid NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  branch_node_id uuid REFERENCES organizational_nodes(id),
  
  check_timestamp timestamptz NOT NULL DEFAULT now(),
  
  -- Connectivity checks
  is_online boolean NOT NULL,
  rtsp_available boolean,
  onvif_available boolean,
  
  -- Network metrics
  latency_ms integer,
  packet_loss_percentage numeric(5,2),
  
  -- Stream metrics
  current_fps numeric(5,2),
  current_bitrate_kbps integer,
  resolution_width integer,
  resolution_height integer,
  
  -- Quality indicators
  video_loss boolean DEFAULT false,
  frozen_image boolean DEFAULT false,
  black_image boolean DEFAULT false,
  blurred_image boolean DEFAULT false,
  obstructed boolean DEFAULT false,
  tampering_detected boolean DEFAULT false,
  
  -- Time sync
  camera_time timestamptz,
  time_offset_seconds integer,
  ntp_synced boolean,
  
  -- Recording status
  is_recording boolean,
  recording_destination text,
  last_recording_time timestamptz,
  
  -- Hardware status
  firmware_version text,
  temperature_celsius numeric(5,2),
  power_status text,
  
  -- Overall assessment
  overall_status camera_health_status NOT NULL,
  health_score integer CHECK (health_score BETWEEN 0 AND 100),
  
  -- Issues detected
  issues_detected text[],
  alert_generated boolean DEFAULT false,
  
  metadata jsonb,
  
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX camera_health_checks_camera_idx 
  ON camera_health_checks (camera_id, check_timestamp DESC);
CREATE INDEX camera_health_checks_branch_idx 
  ON camera_health_checks (branch_node_id, check_timestamp DESC);
CREATE INDEX camera_health_checks_status_idx 
  ON camera_health_checks (overall_status, check_timestamp DESC);
CREATE INDEX camera_health_checks_timestamp_idx 
  ON camera_health_checks (check_timestamp DESC);

-- Latest Camera Health (materialized view)
CREATE MATERIALIZED VIEW IF NOT EXISTS camera_health_latest AS
SELECT DISTINCT ON (camera_id)
  chc.*,
  c.name as camera_name,
  c.location as camera_location,
  n.name as branch_name
FROM camera_health_checks chc
JOIN cameras c ON c.id = chc.camera_id
LEFT JOIN organizational_nodes n ON n.id = chc.branch_node_id
ORDER BY camera_id, check_timestamp DESC;

CREATE UNIQUE INDEX camera_health_latest_camera_idx 
  ON camera_health_latest (camera_id);

-- Camera Quality Checks (periodic detailed quality analysis)
CREATE TABLE IF NOT EXISTS camera_quality_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  camera_id uuid NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  branch_node_id uuid REFERENCES organizational_nodes(id),
  
  check_date date NOT NULL,
  check_time timestamptz NOT NULL DEFAULT now(),
  
  -- Video quality metrics
  resolution_actual text,
  resolution_expected text,
  resolution_compliant boolean,
  
  fps_actual numeric(5,2),
  fps_expected numeric(5,2),
  fps_compliant boolean,
  
  bitrate_actual_kbps integer,
  bitrate_expected_kbps integer,
  bitrate_compliant boolean,
  
  -- Image quality
  clarity_score integer CHECK (clarity_score BETWEEN 1 AND 10),
  lighting_adequate boolean,
  focus_quality integer CHECK (focus_quality BETWEEN 1 AND 10),
  color_accuracy boolean,
  
  -- Coverage quality
  viewing_angle_adequate boolean,
  coverage_area_compliant boolean,
  no_blind_spots boolean,
  
  -- Technical compliance
  timestamp_visible boolean,
  camera_id_visible boolean,
  codec_compliant boolean,
  compression_artifacts_detected boolean,
  
  -- Audio (if applicable)
  audio_enabled boolean,
  audio_quality_adequate boolean,
  
  -- Playback verification
  playback_successful boolean,
  frame_continuity boolean,
  no_corruption boolean,
  
  -- Overall assessment
  overall_quality_score integer CHECK (overall_quality_score BETWEEN 0 AND 100),
  quality_rating text CHECK (quality_rating IN ('excellent', 'good', 'fair', 'poor', 'fail')),
  
  deficiencies_found text[],
  recommendations text,
  
  checked_by uuid REFERENCES users(id),
  
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX camera_quality_checks_camera_idx 
  ON camera_quality_checks (camera_id, check_date DESC);
CREATE INDEX camera_quality_checks_branch_idx 
  ON camera_quality_checks (branch_node_id, check_date DESC);
CREATE INDEX camera_quality_checks_rating_idx 
  ON camera_quality_checks (quality_rating, check_date DESC);

-- ============================================================================
-- RECORDING VERIFICATION
-- ============================================================================

-- Recording Verification Jobs
CREATE TABLE IF NOT EXISTS recording_verification_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  camera_id uuid NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  branch_node_id uuid REFERENCES organizational_nodes(id),
  
  verification_date date NOT NULL,
  verification_period_start timestamptz NOT NULL,
  verification_period_end timestamptz NOT NULL,
  
  -- Expected vs actual
  expected_duration_seconds integer NOT NULL,
  actual_duration_seconds integer,
  recording_availability_percentage numeric(5,2),
  
  -- Gap analysis
  total_gaps integer DEFAULT 0,
  largest_gap_seconds integer,
  gap_details jsonb, -- Array of {start, end, duration}
  
  -- Segment verification
  total_segments integer,
  segments_verified integer,
  segments_with_errors integer,
  
  -- Integrity checks
  checksum_failures integer DEFAULT 0,
  decode_failures integer DEFAULT 0,
  playback_failures integer DEFAULT 0,
  
  -- Timestamp verification
  timestamp_continuity_verified boolean,
  timestamp_issues_found text[],
  
  -- Storage verification
  storage_location text,
  storage_accessible boolean,
  
  -- Legal hold check
  legal_hold_active boolean DEFAULT false,
  retention_policy_met boolean,
  
  -- Overall status
  verification_status recording_verification_status NOT NULL,
  compliance_percentage numeric(5,2),
  
  issues_summary text,
  
  verified_by uuid REFERENCES users(id),
  
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX recording_verification_jobs_camera_idx 
  ON recording_verification_jobs (camera_id, verification_date DESC);
CREATE INDEX recording_verification_jobs_branch_idx 
  ON recording_verification_jobs (branch_node_id, verification_date DESC);
CREATE INDEX recording_verification_jobs_status_idx 
  ON recording_verification_jobs (verification_status, verification_date DESC);
CREATE INDEX recording_verification_jobs_date_idx 
  ON recording_verification_jobs (verification_date DESC);

-- Recording Gaps (detailed gap tracking)
CREATE TABLE IF NOT EXISTS recording_gaps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  camera_id uuid NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  verification_job_id uuid REFERENCES recording_verification_jobs(id) ON DELETE CASCADE,
  
  gap_start timestamptz NOT NULL,
  gap_end timestamptz NOT NULL,
  gap_duration_seconds integer NOT NULL,
  
  gap_type text CHECK (gap_type IN (
    'no_recording', 'camera_offline', 'storage_failure', 
    'network_issue', 'manual_stop', 'unknown'
  )),
  
  root_cause text,
  resolution text,
  
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX recording_gaps_camera_idx 
  ON recording_gaps (camera_id, gap_start DESC);
CREATE INDEX recording_gaps_verification_idx 
  ON recording_gaps (verification_job_id);

-- ============================================================================
-- STORAGE HEALTH MONITORING
-- ============================================================================

-- Storage Health Checks
CREATE TABLE IF NOT EXISTS storage_health_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  storage_node_id uuid REFERENCES infrastructure_nodes(id),
  branch_node_id uuid REFERENCES organizational_nodes(id),
  
  check_timestamp timestamptz NOT NULL DEFAULT now(),
  
  -- Storage node details
  storage_node_name text NOT NULL,
  storage_type text CHECK (storage_type IN ('local', 'nas', 'san', 'cloud', 'object')),
  
  -- Capacity metrics
  total_capacity_gb numeric(12,2),
  used_capacity_gb numeric(12,2),
  free_capacity_gb numeric(12,2),
  utilization_percentage numeric(5,2),
  
  -- Storage tier breakdown
  hot_storage_gb numeric(12,2),
  warm_storage_gb numeric(12,2),
  cold_storage_gb numeric(12,2),
  
  -- Camera allocation
  cameras_allocated integer,
  estimated_days_until_full integer,
  
  -- Performance metrics
  write_throughput_mbps numeric(8,2),
  read_throughput_mbps numeric(8,2),
  iops integer,
  average_latency_ms numeric(6,2),
  
  -- RAID/Redundancy status
  raid_status text,
  raid_level text,
  failed_disks integer DEFAULT 0,
  degraded_arrays integer DEFAULT 0,
  rebuild_in_progress boolean DEFAULT false,
  rebuild_percentage integer,
  
  -- Object storage (if applicable)
  object_storage_available boolean,
  replication_lag_seconds integer,
  
  -- Health indicators
  write_failures_24h integer DEFAULT 0,
  read_failures_24h integer DEFAULT 0,
  orphaned_files integer DEFAULT 0,
  
  -- Backup status
  backup_configured boolean,
  last_backup_time timestamptz,
  backup_status text CHECK (backup_status IN ('success', 'partial', 'failed', 'not_configured')),
  
  -- Retention cleanup
  cleanup_job_running boolean DEFAULT false,
  files_pending_deletion integer DEFAULT 0,
  
  -- Overall status
  overall_status storage_health_status NOT NULL,
  health_score integer CHECK (health_score BETWEEN 0 AND 100),
  
  alerts_triggered text[],
  recommendations text,
  
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX storage_health_checks_node_idx 
  ON storage_health_checks (storage_node_id, check_timestamp DESC);
CREATE INDEX storage_health_checks_branch_idx 
  ON storage_health_checks (branch_node_id, check_timestamp DESC);
CREATE INDEX storage_health_checks_status_idx 
  ON storage_health_checks (overall_status, check_timestamp DESC);
CREATE INDEX storage_health_checks_utilization_idx 
  ON storage_health_checks (utilization_percentage DESC, check_timestamp DESC)
  WHERE utilization_percentage >= 70;

-- ============================================================================
-- MAINTENANCE TRACKING
-- ============================================================================

-- Maintenance Work Orders (enhanced from existing)
CREATE TABLE IF NOT EXISTS maintenance_work_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  work_order_number text NOT NULL,
  
  -- Target
  camera_id uuid REFERENCES cameras(id) ON DELETE CASCADE,
  infrastructure_node_id uuid REFERENCES infrastructure_nodes(id),
  branch_node_id uuid REFERENCES organizational_nodes(id),
  
  -- Work details
  work_type maintenance_work_type NOT NULL,
  priority text CHECK (priority IN ('routine', 'normal', 'high', 'urgent', 'emergency')),
  
  title text NOT NULL,
  reported_problem text,
  root_cause text,
  
  -- Scheduling
  reported_date timestamptz NOT NULL DEFAULT now(),
  reported_by uuid REFERENCES users(id),
  
  scheduled_date date,
  scheduled_time_start time,
  scheduled_time_end time,
  
  -- Assignment
  assigned_technician_id uuid REFERENCES users(id),
  assigned_technician_name text, -- For external vendors
  vendor_name text,
  vendor_contact text,
  
  -- Execution
  visit_date date,
  work_start_time timestamptz,
  work_end_time timestamptz,
  downtime_minutes integer,
  
  work_performed text,
  parts_replaced jsonb, -- [{part, quantity, serial_number}]
  
  -- Before/After documentation
  before_images text[],
  after_images text[],
  
  -- Testing
  testing_performed text,
  testing_result text CHECK (testing_result IN ('pass', 'partial', 'fail', 'not_tested')),
  recording_verified boolean,
  quality_verified boolean,
  
  -- Completion
  status text NOT NULL DEFAULT 'open' CHECK (status IN (
    'open', 'scheduled', 'in_progress', 'testing', 'completed', 
    'closed', 'cancelled', 'on_hold'
  )),
  
  completed_by uuid REFERENCES users(id),
  completed_at timestamptz,
  
  closed_by uuid REFERENCES users(id),
  closed_at timestamptz,
  closure_notes text,
  
  -- Approval
  approved_by uuid REFERENCES users(id),
  approved_at timestamptz,
  approval_notes text,
  
  -- Follow-up
  next_maintenance_date date,
  follow_up_required boolean DEFAULT false,
  follow_up_notes text,
  
  -- Cost tracking
  labor_cost numeric(10,2),
  parts_cost numeric(10,2),
  travel_cost numeric(10,2),
  total_cost numeric(10,2),
  
  metadata jsonb,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE (tenant_id, work_order_number)
);

CREATE INDEX maintenance_work_orders_camera_idx 
  ON maintenance_work_orders (camera_id, status);
CREATE INDEX maintenance_work_orders_branch_idx 
  ON maintenance_work_orders (branch_node_id, status);
CREATE INDEX maintenance_work_orders_status_idx 
  ON maintenance_work_orders (status, scheduled_date);
CREATE INDEX maintenance_work_orders_technician_idx 
  ON maintenance_work_orders (assigned_technician_id, status);
CREATE INDEX maintenance_work_orders_scheduled_idx 
  ON maintenance_work_orders (scheduled_date, scheduled_time_start)
  WHERE status IN ('open', 'scheduled');

-- ============================================================================
-- VIDEO ACCESS AUDIT
-- ============================================================================

-- Video Access Logs (comprehensive viewing audit)
CREATE TABLE IF NOT EXISTS video_access_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Access details
  access_timestamp timestamptz NOT NULL DEFAULT now(),
  session_id uuid, -- Groups multiple access events
  correlation_id uuid, -- Links to incident or case
  
  -- User details
  user_id uuid REFERENCES users(id),
  user_name text NOT NULL,
  user_role text,
  user_department text,
  
  -- Access type
  access_type text NOT NULL CHECK (access_type IN (
    'live_view', 'playback', 'download', 'export', 'search',
    'snapshot', 'bookmark', 'evidence_creation', 'share',
    'ptz_control', 'thumbnail_view'
  )),
  
  -- Camera accessed
  camera_id uuid REFERENCES cameras(id),
  camera_name text,
  branch_node_id uuid REFERENCES organizational_nodes(id),
  branch_name text,
  
  -- Time range accessed (for playback)
  playback_start_time timestamptz,
  playback_end_time timestamptz,
  duration_seconds integer,
  
  -- Search/filter criteria (for forensic searches)
  search_criteria jsonb,
  
  -- Export/download details
  export_format text,
  export_size_bytes bigint,
  export_path text,
  watermarked boolean,
  
  -- Share details
  shared_with text[],
  share_expiry timestamptz,
  external_access boolean DEFAULT false,
  
  -- Authorization
  authorized_by uuid REFERENCES users(id),
  authorization_reason text,
  
  -- Incident linkage
  incident_id uuid REFERENCES incidents(id),
  evidence_id uuid,
  
  -- Context
  access_reason text,
  case_reference text,
  
  -- Technical details
  source_ip inet NOT NULL,
  user_agent text,
  device_id text,
  location_accessed_from text,
  
  -- Result
  access_result text CHECK (access_result IN ('success', 'denied', 'error', 'timeout')),
  denial_reason text,
  error_message text,
  
  -- Compliance flags
  sensitive_content boolean DEFAULT false,
  privacy_compliant boolean DEFAULT true,
  retention_policy_verified boolean DEFAULT false,
  
  metadata jsonb,
  
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX video_access_logs_user_idx 
  ON video_access_logs (user_id, access_timestamp DESC);
CREATE INDEX video_access_logs_camera_idx 
  ON video_access_logs (camera_id, access_timestamp DESC);
CREATE INDEX video_access_logs_branch_idx 
  ON video_access_logs (branch_node_id, access_timestamp DESC);
CREATE INDEX video_access_logs_type_idx 
  ON video_access_logs (access_type, access_timestamp DESC);
CREATE INDEX video_access_logs_session_idx 
  ON video_access_logs (session_id)
  WHERE session_id IS NOT NULL;
CREATE INDEX video_access_logs_incident_idx 
  ON video_access_logs (incident_id)
  WHERE incident_id IS NOT NULL;
CREATE INDEX video_access_logs_timestamp_idx 
  ON video_access_logs (access_timestamp DESC);

-- ============================================================================
-- COMPLIANCE CERTIFICATE ENHANCEMENTS
-- ============================================================================

-- Certificate verification codes
CREATE TABLE IF NOT EXISTS compliance_certificate_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  certificate_id uuid NOT NULL REFERENCES compliance_certificates(id) ON DELETE CASCADE,
  
  verification_code text NOT NULL UNIQUE,
  qr_code_url text,
  
  issued_at timestamptz NOT NULL DEFAULT now(),
  
  -- Revocation
  revoked boolean NOT NULL DEFAULT false,
  revoked_at timestamptz,
  revoked_by uuid REFERENCES users(id),
  revocation_reason text,
  
  -- Verification tracking
  verification_count integer DEFAULT 0,
  last_verified_at timestamptz,
  
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX certificate_verifications_code_idx 
  ON compliance_certificate_verifications (verification_code);
CREATE INDEX certificate_verifications_certificate_idx 
  ON compliance_certificate_verifications (certificate_id);

-- ============================================================================
-- COMPLIANCE DASHBOARD ENHANCEMENTS
-- ============================================================================

-- Branch Compliance Summary View
CREATE OR REPLACE VIEW branch_compliance_summary AS
SELECT 
  n.id as branch_id,
  n.tenant_id,
  n.name as branch_name,
  n.node_code as branch_code,
  
  -- Camera counts
  COUNT(DISTINCT c.id) as total_cameras,
  COUNT(DISTINCT c.id) FILTER (WHERE chl.is_online = true) as online_cameras,
  COUNT(DISTINCT c.id) FILTER (WHERE chl.is_recording = true) as recording_cameras,
  COUNT(DISTINCT c.id) FILTER (WHERE chl.overall_status = 'healthy') as healthy_cameras,
  COUNT(DISTINCT c.id) FILTER (WHERE chl.overall_status IN ('critical', 'offline')) as critical_cameras,
  
  -- Recording compliance
  AVG(rv.recording_availability_percentage) as avg_recording_availability,
  COUNT(DISTINCT rv.id) FILTER (WHERE rv.verification_status = 'compliant') as compliant_recordings,
  COUNT(DISTINCT rv.id) FILTER (WHERE rv.verification_status = 'non_compliant') as non_compliant_recordings,
  
  -- Storage health
  AVG(sh.utilization_percentage) as avg_storage_utilization,
  MIN(sh.estimated_days_until_full) as min_days_until_full,
  
  -- Maintenance
  COUNT(DISTINCT mw.id) FILTER (WHERE mw.status = 'open') as open_work_orders,
  COUNT(DISTINCT mw.id) FILTER (WHERE mw.priority IN ('urgent', 'emergency')) as urgent_work_orders,
  
  -- Quality
  AVG(cq.overall_quality_score) as avg_quality_score,
  
  -- Compliance score (weighted)
  ROUND(
    (
      (COUNT(DISTINCT c.id) FILTER (WHERE chl.is_online = true)::numeric / 
       NULLIF(COUNT(DISTINCT c.id), 0)::numeric * 30) +
      (COALESCE(AVG(rv.recording_availability_percentage), 0) * 0.4) +
      (COALESCE(AVG(cq.overall_quality_score), 0) * 0.3)
    ), 2
  ) as overall_compliance_score
  
FROM organizational_nodes n
LEFT JOIN cameras c ON c.branch_node_id = n.id
LEFT JOIN camera_health_latest chl ON chl.camera_id = c.id
LEFT JOIN recording_verification_jobs rv ON rv.camera_id = c.id 
  AND rv.verification_date >= CURRENT_DATE - INTERVAL '7 days'
LEFT JOIN storage_health_checks sh ON sh.branch_node_id = n.id 
  AND sh.check_timestamp >= now() - INTERVAL '24 hours'
LEFT JOIN maintenance_work_orders mw ON mw.camera_id = c.id
LEFT JOIN camera_quality_checks cq ON cq.camera_id = c.id 
  AND cq.check_date >= CURRENT_DATE - INTERVAL '30 days'
WHERE n.node_type = 'branch'
GROUP BY n.id, n.tenant_id, n.name, n.node_code;

-- Compliance Metrics Over Time
CREATE OR REPLACE VIEW compliance_metrics_daily AS
SELECT 
  date_trunc('day', check_timestamp)::date as metric_date,
  tenant_id,
  
  -- Camera health
  COUNT(DISTINCT camera_id) as cameras_checked,
  COUNT(DISTINCT camera_id) FILTER (WHERE is_online = true) as cameras_online,
  AVG(CASE WHEN overall_status = 'healthy' THEN 100 ELSE 0 END) as health_percentage,
  
  -- Recording availability
  AVG(recording_availability_percentage) as avg_recording_availability,
  
  -- Storage
  AVG(utilization_percentage) as avg_storage_utilization,
  
  COUNT(DISTINCT camera_id) FILTER (WHERE overall_status = 'critical') as critical_issues
  
FROM camera_health_checks chc
LEFT JOIN recording_verification_jobs rv 
  ON rv.camera_id = chc.camera_id 
  AND rv.verification_date = date_trunc('day', chc.check_timestamp)::date
LEFT JOIN storage_health_checks sh 
  ON sh.tenant_id = chc.tenant_id 
  AND date_trunc('day', sh.check_timestamp) = date_trunc('day', chc.check_timestamp)
GROUP BY date_trunc('day', check_timestamp)::date, tenant_id;

-- ============================================================================
-- SCHEDULED JOB TRACKING
-- ============================================================================

-- Job execution tracking
CREATE TABLE IF NOT EXISTS compliance_job_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  job_type text NOT NULL CHECK (job_type IN (
    'camera_health_check', 'recording_verification', 'storage_health_check',
    'quality_check', 'compliance_assessment', 'certificate_generation',
    'backup_verification', 'retention_cleanup', 'audit_report'
  )),
  
  job_name text NOT NULL,
  
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  duration_seconds integer,
  
  status text NOT NULL CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
  
  -- Scope
  branch_node_ids uuid[],
  camera_ids uuid[],
  
  -- Results
  items_processed integer DEFAULT 0,
  items_succeeded integer DEFAULT 0,
  items_failed integer DEFAULT 0,
  
  error_message text,
  error_details jsonb,
  
  result_summary jsonb,
  
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX compliance_job_executions_type_idx 
  ON compliance_job_executions (job_type, started_at DESC);
CREATE INDEX compliance_job_executions_status_idx 
  ON compliance_job_executions (status, started_at DESC);
CREATE INDEX compliance_job_executions_tenant_idx 
  ON compliance_job_executions (tenant_id, started_at DESC);

-- ============================================================================
-- PERMISSIONS
-- ============================================================================

-- Add new permissions for audit and health monitoring
INSERT INTO role_permissions (role, action, resource_type, can_grant, description)
VALUES
  -- Health monitoring
  ('super_admin', 'health:view', NULL, true, 'View all health monitoring data'),
  ('super_admin', 'health:manage', NULL, true, 'Manage health monitoring configuration'),
  ('company_admin', 'health:view', 'company', true, 'View company health data'),
  ('hq_admin', 'health:view', 'headquarters', false, 'View HQ health data'),
  ('branch_manager', 'health:view', 'branch', false, 'View branch health data'),
  
  -- Recording verification
  ('super_admin', 'recording:verify', NULL, true, 'Verify recording compliance'),
  ('company_admin', 'recording:verify', 'company', true, 'Verify company recordings'),
  ('auditor', 'recording:verify', NULL, false, 'Conduct recording verification'),
  
  -- Maintenance
  ('super_admin', 'maintenance:manage', NULL, true, 'Full maintenance management'),
  ('company_admin', 'maintenance:manage', 'company', true, 'Manage company maintenance'),
  ('hq_admin', 'maintenance:manage', 'headquarters', true, 'Manage HQ maintenance'),
  ('branch_manager', 'maintenance:create', 'branch', false, 'Create maintenance work orders'),
  ('technician', 'maintenance:execute', NULL, false, 'Execute maintenance work orders'),
  
  -- Audit logs
  ('super_admin', 'audit:view', NULL, false, 'View all audit logs'),
  ('super_admin', 'audit:export', NULL, false, 'Export audit logs'),
  ('company_admin', 'audit:view', 'company', false, 'View company audit logs'),
  ('auditor', 'audit:view', NULL, false, 'View audit logs'),
  
  -- Certificate verification
  ('super_admin', 'certificate:verify', NULL, false, 'Verify compliance certificates'),
  ('auditor', 'certificate:verify', NULL, false, 'Verify certificates')
ON CONFLICT (role, action, resource_type) DO NOTHING;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE camera_health_checks IS 
  'Continuous monitoring of camera health, connectivity, and performance';
COMMENT ON TABLE camera_quality_checks IS 
  'Periodic detailed quality assessments of camera video output';
COMMENT ON TABLE recording_verification_jobs IS 
  'Daily verification of recording availability and compliance';
COMMENT ON TABLE recording_gaps IS 
  'Detailed tracking of recording gaps for compliance reporting';
COMMENT ON TABLE storage_health_checks IS 
  'Storage capacity, performance, and health monitoring';
COMMENT ON TABLE maintenance_work_orders IS 
  'Complete maintenance and repair tracking workflow';
COMMENT ON TABLE video_access_logs IS 
  'Comprehensive audit trail of all video viewing and access';
COMMENT ON TABLE compliance_certificate_verifications IS 
  'Certificate authenticity verification and revocation tracking';
COMMENT ON TABLE compliance_job_executions IS 
  'Automated compliance job execution tracking and monitoring';
