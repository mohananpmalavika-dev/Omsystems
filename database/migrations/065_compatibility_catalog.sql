-- 065_compatibility_catalog.sql
-- Aggregate view and cache table for anonymous fleet compatibility observations

CREATE TABLE IF NOT EXISTS recorder_compatibility_catalog (
  id                  BIGSERIAL PRIMARY KEY,
  manufacturer        TEXT NOT NULL,
  model               TEXT NOT NULL,
  firmware_range      TEXT NOT NULL,
  observed_count      INTEGER NOT NULL DEFAULT 1,
  likely_apis         JSONB NOT NULL DEFAULT '[]'::jsonb,
  likely_capabilities JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_observed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_compatibility_model_fw UNIQUE (manufacturer, model, firmware_range)
);

CREATE INDEX IF NOT EXISTS idx_compatibility_catalog_mfr_model
  ON recorder_compatibility_catalog(manufacturer, model);
