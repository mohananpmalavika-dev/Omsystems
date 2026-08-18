-- Update all existing and newly approved cameras to online status with current timestamp
UPDATE cameras
SET status = 'online', last_seen_at = COALESCE(last_seen_at, now())
WHERE status = 'unknown' OR status IS NULL;
