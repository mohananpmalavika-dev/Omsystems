-- Camera-specific shutter calibration: no references are inferred automatically.
ALTER TABLE analytics_rules ADD COLUMN IF NOT EXISTS shutter_config jsonb;
