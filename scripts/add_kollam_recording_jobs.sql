INSERT INTO recording_jobs (
  id, camera_id, mode, enabled, status, retention_days, post_roll_seconds, updated_at,
  segment_duration_seconds, hot_retention_days, warm_retention_days, cold_retention_days,
  critical, backup_required, automatic_deletion_enabled, evidence_protection, record_main_stream,
  pre_roll_seconds, min_motion_duration_seconds, motion_confidence_threshold, cooldown_seconds,
  max_event_duration_seconds, trigger_event_types, primary_recording_storage, cloud_archive_policy
)
SELECT
  gen_random_uuid(), c.id, 'continuous', true, 'idle', 90, 120, now(),
  60, 30, 60, 90,
  false, false, true, true, true,
  30, 1, 0.6500, 60,
  600, '{motion,tamper,intrusion,person,vehicle}', 'sentinel-local', 'incident-evidence-only'
FROM cameras c
WHERE c.branch_node_id = '525198ad-504d-48af-ac6c-dca057d38ed5'
  AND c.channel BETWEEN 1 AND 7
  AND NOT EXISTS (SELECT 1 FROM recording_jobs rj WHERE rj.camera_id = c.id);
