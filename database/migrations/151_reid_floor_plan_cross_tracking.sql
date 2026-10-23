-- ============================================================================
-- Migration 151: Multi-Camera Cross-Tracking & 2D Floor Plan Re-ID
--
-- Enables 2D floor plan camera coordinates, zone mappings, and breadcrumb
-- trail persistence for cross-camera person re-identification ("Follow This Target").
-- ============================================================================

CREATE TABLE IF NOT EXISTS reid_camera_floor_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES branches(id) ON DELETE CASCADE,
  camera_id uuid NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  position_x numeric(6,3) NOT NULL CHECK (position_x >= 0 AND position_x <= 100),
  position_y numeric(6,3) NOT NULL CHECK (position_y >= 0 AND position_y <= 100),
  floor_level text NOT NULL DEFAULT 'ground',
  zone_name text,
  angle_degrees numeric(5,1) NOT NULL DEFAULT 0 CHECK (angle_degrees >= 0 AND angle_degrees <= 360),
  fov_degrees numeric(5,1) NOT NULL DEFAULT 75 CHECK (fov_degrees >= 10 AND fov_degrees <= 180),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_reid_cam_floor_pos UNIQUE (tenant_id, camera_id, floor_level)
);

CREATE INDEX IF NOT EXISTS idx_reid_cam_floor_branch
  ON reid_camera_floor_positions (tenant_id, branch_id, floor_level);

CREATE INDEX IF NOT EXISTS idx_reid_cam_floor_camera
  ON reid_camera_floor_positions (camera_id);

-- Optional table to track active operator "Follow Target" sessions
CREATE TABLE IF NOT EXISTS reid_target_follow_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  global_id text NOT NULL REFERENCES reid_global_identities(global_id) ON DELETE CASCADE,
  initiated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  source_camera_id uuid REFERENCES cameras(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'alarm_triggered', 'dismissed')),
  appearance_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reid_follow_sessions_tenant
  ON reid_target_follow_sessions (tenant_id, status, created_at DESC);

COMMENT ON TABLE reid_camera_floor_positions IS
  'Calibrated 2D floor plan coordinates and field of view for branch cameras used in cross-tracking route maps.';
COMMENT ON TABLE reid_target_follow_sessions IS
  'Active and historical operator Follow-This-Target Re-ID cross-tracking sessions.';
