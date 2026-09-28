-- Bind the requested encoder profile to each one-time live session.  The
-- media gateway consumes this value and resolves a profile-specific secret.
ALTER TABLE live_sessions
  ADD COLUMN IF NOT EXISTS profile text NOT NULL DEFAULT 'sub'
  CHECK (profile IN ('main', 'sub'));
