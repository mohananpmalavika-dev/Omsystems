-- Add DVR/NVR archive verification columns to retention tables
-- Migration: add_archive_verification_columns
-- Date: 2026-07-29

-- Add columns to retention_verification_log
ALTER TABLE retention_verification_log 
ADD COLUMN IF NOT EXISTS archive_verified BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS archive_mismatch BOOLEAN DEFAULT FALSE;

-- Add columns to camera_retention_status
ALTER TABLE camera_retention_status 
ADD COLUMN IF NOT EXISTS archive_verified BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS archive_mismatch BOOLEAN DEFAULT FALSE;

-- Add index for querying cameras with archive mismatches
CREATE INDEX IF NOT EXISTS idx_camera_retention_archive_mismatch 
ON camera_retention_status(archive_mismatch) 
WHERE archive_mismatch = TRUE;

-- Add index for querying unverified archives
CREATE INDEX IF NOT EXISTS idx_camera_retention_archive_verified 
ON camera_retention_status(archive_verified);

-- Add comments
COMMENT ON COLUMN retention_verification_log.archive_verified IS 'Whether DVR/NVR archive was directly queried during verification';
COMMENT ON COLUMN retention_verification_log.archive_mismatch IS 'Whether platform-indexed recordings differ significantly from DVR/NVR archive';
COMMENT ON COLUMN camera_retention_status.archive_verified IS 'Whether DVR/NVR archive was directly queried during last verification';
COMMENT ON COLUMN camera_retention_status.archive_mismatch IS 'Whether platform-indexed recordings differ significantly from DVR/NVR archive';
