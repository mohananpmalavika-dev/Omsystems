ALTER TABLE live_sessions DROP CONSTRAINT IF EXISTS live_sessions_purpose_check;
ALTER TABLE live_sessions
  ADD CONSTRAINT live_sessions_purpose_check
  CHECK (purpose IN ('view', 'talk', 'playback'));
