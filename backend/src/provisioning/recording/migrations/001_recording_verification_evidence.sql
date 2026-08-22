-- Recording Verification Evidence Schema
-- Stores detailed verification evidence for audit and compliance

-- Add verification columns to cameras table
ALTER TABLE cameras
ADD COLUMN IF NOT EXISTS recording_verification_status TEXT,
ADD COLUMN IF NOT EXISTS recording_verification_reason TEXT,
ADD COLUMN IF NOT EXISTS recording_verification_stage TEXT,
ADD COLUMN IF NOT EXISTS recording_verified_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS live_stream_codec TEXT,
ADD COLUMN IF NOT EXISTS live_stream_width INTEGER,
ADD COLUMN IF NOT EXISTS live_stream_height INTEGER,
ADD COLUMN IF NOT EXISTS live_stream_fps NUMERIC(8,2);

-- Create index on verification status for queries
CREATE INDEX IF NOT EXISTS idx_cameras_recording_verification_status
ON cameras(recording_verification_status)
WHERE recording_verification_status IS NOT NULL;

-- Create recording verification runs table for full audit trail
CREATE TABLE IF NOT EXISTS recording_verification_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Context
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  camera_id UUID NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  
  -- Verification result
  status TEXT NOT NULL CHECK (status IN ('VERIFIED', 'FAILED', 'UNKNOWN')),
  stage TEXT NOT NULL,
  reason_code TEXT,
  reason TEXT,
  
  -- Live stream evidence
  live_codec TEXT,
  live_width INTEGER,
  live_height INTEGER,
  live_fps NUMERIC(8,2),
  live_pixel_format TEXT,
  live_bitrate BIGINT,
  packets_observed INTEGER,
  frames_observed INTEGER,
  transport TEXT,
  
  -- Recording evidence
  sample_path TEXT,
  sample_size_bytes BIGINT,
  sample_duration_seconds NUMERIC(8,2),
  sample_frame_count INTEGER,
  sample_codec TEXT,
  sample_width INTEGER,
  sample_height INTEGER,
  sample_fps NUMERIC(8,2),
  sample_format TEXT,
  
  -- Technical evidence
  probe_duration_ms INTEGER,
  observation_duration_ms INTEGER,
  recording_duration_ms INTEGER,
  ffprobe_exit_code INTEGER,
  ffmpeg_exit_code INTEGER,
  stderr_excerpt TEXT,
  
  -- Warnings
  warnings JSONB,
  
  -- Timestamps
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verified_at TIMESTAMPTZ,
  
  -- Metadata
  verifier_version TEXT DEFAULT '2.0',
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_verification_runs_camera
ON recording_verification_runs(camera_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_verification_runs_branch
ON recording_verification_runs(branch_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_verification_runs_status
ON recording_verification_runs(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_verification_runs_tenant
ON recording_verification_runs(tenant_id, created_at DESC);

-- Add comments for documentation
COMMENT ON TABLE recording_verification_runs IS 
'Audit trail of all recording verification attempts with detailed evidence';

COMMENT ON COLUMN recording_verification_runs.status IS 
'VERIFIED = positive evidence, FAILED = stream/recording broken, UNKNOWN = infrastructure unavailable';

COMMENT ON COLUMN recording_verification_runs.stage IS 
'Stage where verification stopped: URI_VALIDATION, LIVE_PROBE, PACKET_OBSERVATION, SAMPLE_RECORDING, RECORDED_FILE_PROBE, COMPLETE';

COMMENT ON COLUMN recording_verification_runs.reason_code IS 
'Machine-readable reason code for failures (e.g., AUTHENTICATION_FAILED, NO_VIDEO_STREAM)';

COMMENT ON COLUMN recording_verification_runs.packets_observed IS 
'Number of packets observed during live stream observation';

COMMENT ON COLUMN recording_verification_runs.frames_observed IS 
'Number of frames decoded during live stream observation';

COMMENT ON COLUMN recording_verification_runs.stderr_excerpt IS 
'Sanitized excerpt from FFmpeg/FFprobe stderr (credentials removed)';

-- View for latest verification status per camera
CREATE OR REPLACE VIEW camera_recording_verification_latest AS
SELECT DISTINCT ON (camera_id)
  rv.*,
  c.name as camera_name,
  c.ip_address,
  b.name as branch_name
FROM recording_verification_runs rv
JOIN cameras c ON c.id = rv.camera_id
JOIN branches b ON b.id = rv.branch_id
ORDER BY camera_id, created_at DESC;

COMMENT ON VIEW camera_recording_verification_latest IS 
'Latest verification result for each camera';

-- View for verification statistics by branch
CREATE OR REPLACE VIEW branch_recording_verification_stats AS
SELECT
  branch_id,
  b.name as branch_name,
  COUNT(*) as total_cameras,
  COUNT(*) FILTER (WHERE status = 'VERIFIED') as verified_count,
  COUNT(*) FILTER (WHERE status = 'FAILED') as failed_count,
  COUNT(*) FILTER (WHERE status = 'UNKNOWN') as unknown_count,
  ROUND(
    COUNT(*) FILTER (WHERE status = 'VERIFIED')::NUMERIC / 
    NULLIF(COUNT(*), 0) * 100, 
    2
  ) as verification_rate,
  MAX(verified_at) as last_verified_at,
  MAX(created_at) as last_check_at
FROM camera_recording_verification_latest rv
JOIN branches b ON b.id = rv.branch_id
GROUP BY branch_id, b.name;

COMMENT ON VIEW branch_recording_verification_stats IS 
'Recording verification statistics aggregated by branch';
