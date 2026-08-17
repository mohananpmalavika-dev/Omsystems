-- Migration 069: Authoritative Reliable PTZ Subsystem
-- Presets, Patterns, Tours, Priority Locks, and Home Configurations

CREATE TABLE IF NOT EXISTS ptz_priority_locks (
  camera_id VARCHAR(128) PRIMARY KEY,
  operator_id VARCHAR(128) NOT NULL,
  operator_name VARCHAR(128) NOT NULL,
  role VARCHAR(32) NOT NULL,
  priority INT NOT NULL DEFAULT 10,
  token VARCHAR(128) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  preempted_by JSONB
);

CREATE INDEX IF NOT EXISTS idx_ptz_locks_expires ON ptz_priority_locks(expires_at);

CREATE TABLE IF NOT EXISTS ptz_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  camera_id VARCHAR(128) NOT NULL,
  preset_number INT NOT NULL,
  name VARCHAR(128) NOT NULL,
  pan DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  tilt DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  zoom DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  focus DOUBLE PRECISION,
  iris DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_ptz_preset_camera_num UNIQUE (camera_id, preset_number)
);

CREATE TABLE IF NOT EXISTS ptz_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  camera_id VARCHAR(128) NOT NULL,
  pattern_number INT NOT NULL,
  name VARCHAR(128) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'READY',
  duration_seconds INT NOT NULL DEFAULT 0,
  recorded_trajectory JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_ptz_pattern_camera_num UNIQUE (camera_id, pattern_number)
);

CREATE TABLE IF NOT EXISTS ptz_guard_tours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  camera_id VARCHAR(128) NOT NULL,
  tour_number INT NOT NULL,
  name VARCHAR(128) NOT NULL,
  steps JSONB NOT NULL DEFAULT '[]',
  repeat BOOLEAN NOT NULL DEFAULT TRUE,
  status VARCHAR(32) NOT NULL DEFAULT 'IDLE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_ptz_tour_camera_num UNIQUE (camera_id, tour_number)
);

CREATE TABLE IF NOT EXISTS ptz_home_configurations (
  camera_id VARCHAR(128) PRIMARY KEY,
  preset_number INT,
  position JSONB,
  auto_return_idle_timeout_seconds INT NOT NULL DEFAULT 30,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
