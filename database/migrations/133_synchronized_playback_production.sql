-- Migration 133: Production-Ready Multi-Camera Synchronized Playback and Timeline Drift Compensation
-- Enterprise persistent synchronized sessions, sub-second barrier seek tracking, multi-angle keyframe alignment, and forensic audit.

CREATE TABLE IF NOT EXISTS synchronized_playback_sessions (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    branch_id VARCHAR(64) NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    current_master_time TIMESTAMPTZ NOT NULL,
    master_camera_id VARCHAR(64) NOT NULL,
    layout VARCHAR(16) NOT NULL DEFAULT '2x2',
    playback_speed NUMERIC(5, 2) NOT NULL DEFAULT 1.0,
    state VARCHAR(16) NOT NULL DEFAULT 'PAUSED',
    drift_compensation_enabled BOOLEAN NOT NULL DEFAULT true,
    created_by VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sync_sessions_tenant_branch 
    ON synchronized_playback_sessions (tenant_id, branch_id, created_at DESC);

CREATE TABLE IF NOT EXISTS synchronized_playback_tracks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id VARCHAR(64) NOT NULL REFERENCES synchronized_playback_sessions(id) ON DELETE CASCADE,
    camera_id VARCHAR(64) NOT NULL,
    camera_name TEXT NOT NULL,
    channel_index INTEGER NOT NULL DEFAULT 0,
    has_coverage BOOLEAN NOT NULL DEFAULT true,
    measured_drift_ms INTEGER NOT NULL DEFAULT 0,
    compensation_offset_ms INTEGER NOT NULL DEFAULT 0,
    drift_status VARCHAR(32) NOT NULL DEFAULT 'SYNCHRONIZED', -- 'SYNCHRONIZED', 'DRIFT_WARNING', 'DRIFT_CRITICAL'
    active_segment_id VARCHAR(64),
    active_segment_uri TEXT,
    active_segment_start TIMESTAMPTZ,
    active_segment_end TIMESTAMPTZ,
    current_aligned_timestamp TIMESTAMPTZ NOT NULL,
    current_device_timestamp TIMESTAMPTZ NOT NULL,
    keyframe_offset_bytes BIGINT DEFAULT 0,
    keyframe_pts BIGINT DEFAULT 0,
    keyframe_wall_clock TIMESTAMPTZ,
    is_in_gap BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sync_tracks_session 
    ON synchronized_playback_tracks (session_id, channel_index);

CREATE INDEX IF NOT EXISTS idx_sync_tracks_camera 
    ON synchronized_playback_tracks (camera_id);

CREATE TABLE IF NOT EXISTS synchronized_playback_bookmarks (
    id VARCHAR(64) PRIMARY KEY,
    session_id VARCHAR(64) NOT NULL REFERENCES synchronized_playback_sessions(id) ON DELETE CASCADE,
    timestamp TIMESTAMPTZ NOT NULL,
    label TEXT NOT NULL,
    notes TEXT,
    created_by VARCHAR(64) NOT NULL,
    camera_snapshots JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sync_bookmarks_session 
    ON synchronized_playback_bookmarks (session_id, timestamp ASC);

CREATE TABLE IF NOT EXISTS playback_drift_compensation_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id VARCHAR(64) NOT NULL REFERENCES synchronized_playback_sessions(id) ON DELETE CASCADE,
    camera_id VARCHAR(64) NOT NULL,
    master_timestamp TIMESTAMPTZ NOT NULL,
    device_timestamp TIMESTAMPTZ NOT NULL,
    raw_offset_ms INTEGER NOT NULL,
    compensation_ms INTEGER NOT NULL,
    drift_status VARCHAR(32) NOT NULL DEFAULT 'SYNCHRONIZED',
    drift_source VARCHAR(64) NOT NULL DEFAULT 'NTP_TELEMETRY', -- 'NTP_TELEMETRY', 'SEGMENT_HEADER', 'MANUAL_CALIBRATION'
    calibrated_by VARCHAR(64),
    logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sync_drift_events_session 
    ON playback_drift_compensation_events (session_id, camera_id, logged_at DESC);
