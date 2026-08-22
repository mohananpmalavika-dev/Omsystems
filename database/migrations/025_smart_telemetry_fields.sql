ALTER TABLE storage_health
  ADD COLUMN IF NOT EXISTS reallocated_sectors numeric,
  ADD COLUMN IF NOT EXISTS pending_sectors numeric,
  ADD COLUMN IF NOT EXISTS uncorrectable_sectors numeric,
  ADD COLUMN IF NOT EXISTS power_on_hours numeric,
  ADD COLUMN IF NOT EXISTS model text,
  ADD COLUMN IF NOT EXISTS serial_number text,
  ADD COLUMN IF NOT EXISTS telemetry_source text;
