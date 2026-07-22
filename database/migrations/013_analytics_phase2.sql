-- Analytics Phase 2: Face Recognition, ANPR, Behavior Analysis, Unattended Objects

-- Face Recognition Tables

CREATE TABLE face_watchlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(name) BETWEEN 2 AND 160),
  description text,
  list_type text NOT NULL DEFAULT 'security'
    CHECK (list_type IN ('security', 'vip', 'staff', 'blacklist', 'missing-person')),
  enabled boolean NOT NULL DEFAULT true,
  alert_on_match boolean NOT NULL DEFAULT true,
  alert_severity text NOT NULL DEFAULT 'P2'
    CHECK (alert_severity IN ('P1', 'P2', 'P3', 'P4', 'P5')),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  UNIQUE (tenant_id, name) WHERE archived_at IS NULL
);

CREATE TABLE face_watchlist_persons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  watchlist_id uuid NOT NULL REFERENCES face_watchlists(id) ON DELETE CASCADE,
  external_id text, -- Optional external identifier
  full_name text NOT NULL CHECK (length(full_name) BETWEEN 1 AND 255),
  date_of_birth date,
  gender text CHECK (gender IN ('male', 'female', 'other', 'unknown')),
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  enrolled_by uuid NOT NULL REFERENCES users(id),
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz,
  match_count integer NOT NULL DEFAULT 0,
  archived_at timestamptz,
  UNIQUE NULLS NOT DISTINCT (tenant_id, watchlist_id, external_id)
);

CREATE INDEX face_watchlist_persons_watchlist_idx
  ON face_watchlist_persons (watchlist_id) WHERE archived_at IS NULL;

CREATE TABLE face_embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES face_watchlist_persons(id) ON DELETE CASCADE,
  embedding vector(512), -- Face embedding (512-dimensional or 128-dimensional)
  quality_score numeric(5,4) CHECK (quality_score BETWEEN 0 AND 1),
  source_image_reference text, -- S3/storage reference to original image
  face_landmarks jsonb, -- Facial landmark points
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX face_embeddings_person_idx ON face_embeddings (person_id);
-- For vector similarity search (requires pgvector extension)
-- CREATE INDEX face_embeddings_vector_idx ON face_embeddings
--   USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE TABLE face_recognition_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  camera_id uuid NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  watchlist_id uuid REFERENCES face_watchlists(id) ON DELETE SET NULL,
  person_id uuid REFERENCES face_watchlist_persons(id) ON DELETE SET NULL,
  analytics_event_id uuid REFERENCES analytics_events(id) ON DELETE CASCADE,
  similarity_score numeric(5,4) NOT NULL CHECK (similarity_score BETWEEN 0 AND 1),
  face_bbox jsonb NOT NULL,
  face_quality numeric(5,4) CHECK (face_quality BETWEEN 0 AND 1),
  age_estimate integer CHECK (age_estimate BETWEEN 0 AND 150),
  gender_estimate text CHECK (gender_estimate IN ('male', 'female')),
  wearing_mask boolean,
  snapshot_reference text,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX face_recognition_events_camera_time_idx
  ON face_recognition_events (camera_id, occurred_at DESC);
CREATE INDEX face_recognition_events_person_idx
  ON face_recognition_events (person_id, occurred_at DESC);

-- ANPR (License Plate Recognition) Tables

CREATE TABLE anpr_watchlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(name) BETWEEN 2 AND 160),
  description text,
  list_type text NOT NULL DEFAULT 'alert'
    CHECK (list_type IN ('alert', 'stolen', 'wanted', 'vip', 'staff', 'blacklist')),
  enabled boolean NOT NULL DEFAULT true,
  alert_on_match boolean NOT NULL DEFAULT true,
  alert_severity text NOT NULL DEFAULT 'P2'
    CHECK (alert_severity IN ('P1', 'P2', 'P3', 'P4', 'P5')),
  alert_authorities boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  UNIQUE (tenant_id, name) WHERE archived_at IS NULL
);

CREATE TABLE anpr_watchlist_plates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  watchlist_id uuid NOT NULL REFERENCES anpr_watchlists(id) ON DELETE CASCADE,
  plate_number text NOT NULL CHECK (length(plate_number) BETWEEN 2 AND 20),
  country_code text NOT NULL DEFAULT 'IN' CHECK (length(country_code) = 2),
  region_code text,
  vehicle_make text,
  vehicle_model text,
  vehicle_color text,
  vehicle_type text CHECK (vehicle_type IN ('car', 'motorcycle', 'bus', 'truck', 'other')),
  owner_name text,
  reason text NOT NULL,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  added_by uuid NOT NULL REFERENCES users(id),
  added_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  last_seen_at timestamptz,
  match_count integer NOT NULL DEFAULT 0,
  archived_at timestamptz
);

CREATE INDEX anpr_watchlist_plates_watchlist_idx
  ON anpr_watchlist_plates (watchlist_id) WHERE archived_at IS NULL;
CREATE INDEX anpr_watchlist_plates_plate_idx
  ON anpr_watchlist_plates (plate_number) WHERE archived_at IS NULL;

CREATE TABLE anpr_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  camera_id uuid NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  watchlist_id uuid REFERENCES anpr_watchlists(id) ON DELETE SET NULL,
  plate_id uuid REFERENCES anpr_watchlist_plates(id) ON DELETE SET NULL,
  analytics_event_id uuid REFERENCES analytics_events(id) ON DELETE CASCADE,
  plate_number text NOT NULL,
  plate_confidence numeric(5,4) NOT NULL CHECK (plate_confidence BETWEEN 0 AND 1),
  country_code text NOT NULL DEFAULT 'IN',
  region_code text,
  vehicle_type text,
  vehicle_color text,
  vehicle_bbox jsonb,
  plate_bbox jsonb NOT NULL,
  ocr_details jsonb, -- Character-level OCR results
  snapshot_reference text,
  entry_direction text CHECK (entry_direction IN ('entry', 'exit', 'unknown')),
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX anpr_events_camera_time_idx
  ON anpr_events (camera_id, occurred_at DESC);
CREATE INDEX anpr_events_plate_idx
  ON anpr_events (plate_number, occurred_at DESC);
CREATE INDEX anpr_events_plate_watchlist_idx
  ON anpr_events (plate_id, occurred_at DESC);

-- Vehicle tracking for entry/exit pairing
CREATE TABLE anpr_vehicle_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plate_number text NOT NULL,
  entry_event_id uuid REFERENCES anpr_events(id) ON DELETE SET NULL,
  exit_event_id uuid REFERENCES anpr_events(id) ON DELETE SET NULL,
  entry_camera_id uuid REFERENCES cameras(id) ON DELETE SET NULL,
  exit_camera_id uuid REFERENCES cameras(id) ON DELETE SET NULL,
  entry_at timestamptz,
  exit_at timestamptz,
  duration_seconds integer GENERATED ALWAYS AS (
    EXTRACT(EPOCH FROM (exit_at - entry_at))::integer
  ) STORED,
  status text NOT NULL DEFAULT 'inside'
    CHECK (status IN ('inside', 'exited', 'unknown')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX anpr_vehicle_sessions_plate_idx
  ON anpr_vehicle_sessions (plate_number, entry_at DESC);
CREATE INDEX anpr_vehicle_sessions_status_idx
  ON anpr_vehicle_sessions (status, entry_at DESC);

-- Behavior Analysis Tables

CREATE TABLE behavior_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  camera_id uuid NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  analytics_event_id uuid REFERENCES analytics_events(id) ON DELETE CASCADE,
  behavior_type text NOT NULL CHECK (behavior_type IN (
    'running', 'falling', 'fighting', 'loitering-extended',
    'erratic-movement', 'sudden-direction-change', 'aggressive-posture',
    'abnormal-posture', 'crowd-panic', 'person-down'
  )),
  confidence numeric(5,4) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  track_id text,
  person_count integer,
  duration_seconds numeric(10,3),
  speed_pixels_per_second numeric(10,2),
  pose_data jsonb, -- Pose keypoints if available
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  snapshot_reference text,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX behavior_events_camera_time_idx
  ON behavior_events (camera_id, occurred_at DESC);
CREATE INDEX behavior_events_type_idx
  ON behavior_events (behavior_type, occurred_at DESC);

-- Unattended and Removed Objects Tables

CREATE TABLE protected_objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  camera_id uuid NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(name) BETWEEN 2 AND 160),
  description text,
  object_type text NOT NULL, -- e.g., "painting", "sculpture", "equipment"
  zone jsonb NOT NULL, -- Bounding box where object should be
  reference_image text, -- Storage reference to image of the object
  alert_on_removal boolean NOT NULL DEFAULT true,
  alert_severity text NOT NULL DEFAULT 'P2'
    CHECK (alert_severity IN ('P1', 'P2', 'P3', 'P4', 'P5')),
  removal_threshold_seconds integer NOT NULL DEFAULT 30
    CHECK (removal_threshold_seconds BETWEEN 5 AND 600),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_verified_at timestamptz,
  archived_at timestamptz
);

CREATE INDEX protected_objects_camera_idx
  ON protected_objects (camera_id) WHERE archived_at IS NULL;

CREATE TABLE unattended_object_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  camera_id uuid NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  analytics_event_id uuid REFERENCES analytics_events(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('unattended', 'removed')),
  object_label text NOT NULL,
  object_track_id text,
  protected_object_id uuid REFERENCES protected_objects(id) ON DELETE SET NULL,
  object_bbox jsonb NOT NULL,
  associated_person_track_id text,
  duration_seconds numeric(10,3),
  snapshot_reference text,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX unattended_object_events_camera_time_idx
  ON unattended_object_events (camera_id, occurred_at DESC);
CREATE INDEX unattended_object_events_type_idx
  ON unattended_object_events (event_type, occurred_at DESC);

-- Advanced Analytics Permissions

INSERT INTO role_permissions (role, action, resource_type, can_grant, description)
VALUES
  -- Face Recognition Permissions
  ('super_admin', 'face:view', NULL, true, 'View face detection results'),
  ('super_admin', 'face:enrol', NULL, true, 'Enrol faces in watchlist'),
  ('super_admin', 'face:search', NULL, true, 'Search face database'),
  ('super_admin', 'face:manage-watchlist', NULL, true, 'Manage face watchlists'),
  ('company_admin', 'face:view', 'company', true, 'View face detection results'),
  ('company_admin', 'face:enrol', 'company', true, 'Enrol faces in watchlist'),
  ('company_admin', 'face:manage-watchlist', 'company', true, 'Manage face watchlists'),
  ('hq_admin', 'face:view', 'headquarters', true, 'View face detection results'),
  ('hq_admin', 'face:enrol', 'headquarters', true, 'Enrol faces in watchlist'),
  ('hq_admin', 'face:manage-watchlist', 'headquarters', true, 'Manage face watchlists'),
  
  -- ANPR Permissions
  ('super_admin', 'anpr:view', NULL, true, 'View ANPR results'),
  ('super_admin', 'anpr:search', NULL, true, 'Search vehicle database'),
  ('super_admin', 'anpr:manage-watchlist', NULL, true, 'Manage ANPR watchlists'),
  ('company_admin', 'anpr:view', 'company', true, 'View ANPR results'),
  ('company_admin', 'anpr:search', 'company', true, 'Search vehicle database'),
  ('company_admin', 'anpr:manage-watchlist', 'company', true, 'Manage ANPR watchlists'),
  ('hq_admin', 'anpr:view', 'headquarters', true, 'View ANPR results'),
  ('hq_admin', 'anpr:manage-watchlist', 'headquarters', true, 'Manage ANPR watchlists'),
  ('branch_manager', 'anpr:view', 'branch', false, 'View ANPR results'),
  ('security_officer', 'anpr:view', 'branch', false, 'View ANPR results'),
  
  -- Behavior Analysis Permissions
  ('super_admin', 'behavior:view', NULL, true, 'View behavior analysis'),
  ('company_admin', 'behavior:view', 'company', true, 'View behavior analysis'),
  ('hq_admin', 'behavior:view', 'headquarters', true, 'View behavior analysis'),
  ('branch_manager', 'behavior:view', 'branch', false, 'View behavior analysis'),
  ('security_officer', 'behavior:view', 'branch', false, 'View behavior analysis'),
  
  -- Protected Objects Permissions
  ('super_admin', 'protected-objects:manage', NULL, true, 'Manage protected objects'),
  ('company_admin', 'protected-objects:manage', 'company', true, 'Manage protected objects'),
  ('hq_admin', 'protected-objects:manage', 'headquarters', true, 'Manage protected objects'),
  ('branch_manager', 'protected-objects:manage', 'branch', false, 'Manage protected objects')
ON CONFLICT (role, action, resource_type) DO NOTHING;

-- Rebuild role-derived grants
UPDATE users SET role=role WHERE role IS NOT NULL;

-- Audit logging table for sensitive operations
CREATE TABLE analytics_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action text NOT NULL, -- 'face_search', 'face_enrol', 'anpr_search', etc.
  resource_type text, -- 'face_watchlist', 'anpr_watchlist', etc.
  resource_id uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address inet,
  user_agent text,
  justification text, -- Required for sensitive searches
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX analytics_audit_log_tenant_time_idx
  ON analytics_audit_log (tenant_id, created_at DESC);
CREATE INDEX analytics_audit_log_user_idx
  ON analytics_audit_log (user_id, created_at DESC);
CREATE INDEX analytics_audit_log_action_idx
  ON analytics_audit_log (action, created_at DESC);

COMMENT ON TABLE face_watchlists IS
  'Face recognition watchlists for security monitoring';
COMMENT ON TABLE anpr_watchlists IS
  'ANPR watchlists for vehicle monitoring and access control';
COMMENT ON TABLE behavior_events IS
  'Advanced behavior analysis events (running, fighting, falling, etc.)';
COMMENT ON TABLE protected_objects IS
  'Protected objects that trigger alerts if removed';
COMMENT ON TABLE analytics_audit_log IS
  'Audit trail for sensitive analytics operations';

