-- Keep every operator-deferred onboarding stage with its timestamp.  This is
-- scoped to one durable branch scan; a new scan begins with a clean checklist.
ALTER TABLE edge_scan_jobs
  ADD COLUMN IF NOT EXISTS skipped_stages jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(skipped_stages) = 'object');
