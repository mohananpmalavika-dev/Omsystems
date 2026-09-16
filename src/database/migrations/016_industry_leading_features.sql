-- Migration: 016_industry_leading_features.sql
-- Description: Core schema additions for Smart ROI Motion Grid, Video Wall Displays, and Edge Trickle Replenishment

-- =====================================================================
-- 1. RECORDING MOTION GRID (Smart Post-Recording ROI Motion Search)
-- =====================================================================
CREATE TABLE IF NOT EXISTS recording_motion_grid (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    segment_id UUID NOT NULL,
    camera_id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    timestamp_start TIMESTAMPTZ NOT NULL,
    timestamp_end TIMESTAMPTZ NOT NULL,
    grid_width INT NOT NULL DEFAULT 16,
    grid_height INT NOT NULL DEFAULT 16,
    motion_bitmask BYTEA NOT NULL,
    intensity_score REAL DEFAULT 1.0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_motion_grid_cam_time 
    ON recording_motion_grid (camera_id, timestamp_start, timestamp_end);
CREATE INDEX IF NOT EXISTS idx_motion_grid_tenant 
    ON recording_motion_grid (tenant_id);

-- =====================================================================
-- 2. VIDEO WALL DISPLAYS (Remote SOC Smart Wall & Matrix Controller)
-- =====================================================================
CREATE TABLE IF NOT EXISTS video_wall_displays (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    display_code VARCHAR(100) NOT NULL UNIQUE,
    name VARCHAR(200) NOT NULL,
    resolution VARCHAR(50) NOT NULL DEFAULT '3840x2160',
    location VARCHAR(200),
    active_layout VARCHAR(50) NOT NULL DEFAULT 'grid-4',
    assigned_cameras JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_online BOOLEAN NOT NULL DEFAULT false,
    last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_video_wall_tenant 
    ON video_wall_displays (tenant_id);

-- =====================================================================
-- 3. EDGE REPLENISHMENT JOBS (ONVIF Profile G Trickle Backfill)
-- =====================================================================
CREATE TABLE IF NOT EXISTS edge_replenishment_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    camera_id UUID NOT NULL,
    gap_start TIMESTAMPTZ NOT NULL,
    gap_end TIMESTAMPTZ NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    bytes_transferred BIGINT NOT NULL DEFAULT 0,
    total_bytes BIGINT NOT NULL DEFAULT 0,
    throttle_kbps INT NOT NULL DEFAULT 500,
    error_message TEXT,
    retry_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_edge_replenishment_tenant_status 
    ON edge_replenishment_jobs (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_edge_replenishment_camera 
    ON edge_replenishment_jobs (camera_id);
