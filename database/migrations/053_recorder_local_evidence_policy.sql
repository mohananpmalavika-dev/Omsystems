-- Keep continuous footage on the branch DVR/NVR. Only selected incident
-- snapshots and clips may be copied to off-site object storage.

DO $$ BEGIN
  CREATE TYPE recording_primary_storage AS ENUM ('sentinel-local', 'recorder-local');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE recording_cloud_archive_policy AS ENUM ('none', 'incident-evidence-only');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE recording_jobs
  ADD COLUMN IF NOT EXISTS primary_recording_storage recording_primary_storage
    NOT NULL DEFAULT 'sentinel-local',
  ADD COLUMN IF NOT EXISTS cloud_archive_policy recording_cloud_archive_policy
    NOT NULL DEFAULT 'none';

UPDATE recording_jobs AS job
SET primary_recording_storage = 'recorder-local',
    cloud_archive_policy = 'incident-evidence-only',
    backup_required = false,
    updated_at = now()
FROM cameras AS camera
WHERE camera.id = job.camera_id
  AND (camera.recorder_id IS NOT NULL
    OR camera.source_type IN ('analog-dvr-channel', 'nvr-channel'));

COMMENT ON COLUMN recording_jobs.primary_recording_storage IS
  'Owner of the full recording timeline. recorder-local prevents Sentinel continuous capture.';
COMMENT ON COLUMN recording_jobs.cloud_archive_policy IS
  'Off-site policy. incident-evidence-only permits only selected snapshots and incident clips.';
