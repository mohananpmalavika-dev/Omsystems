-- 064_recorder_device_profiles.sql
-- Production schema for recorder fingerprinting, capability discovery, and device profiles

CREATE TABLE IF NOT EXISTS recorder_device_profiles (
  recorder_id            TEXT PRIMARY KEY,
  tenant_id              TEXT NOT NULL,
  branch_id              TEXT NOT NULL,
  manufacturer           TEXT,
  model                  TEXT,
  firmware_version       TEXT,
  serial_number          TEXT,
  fingerprint_confidence NUMERIC(4,3) NOT NULL,
  fingerprint_signature  TEXT NOT NULL,
  profile_version        INTEGER NOT NULL DEFAULT 1,
  detected_api_families  JSONB NOT NULL,
  capabilities           JSONB NOT NULL,
  identity_evidence      JSONB NOT NULL DEFAULT '[]'::jsonb,
  api_evidence           JSONB NOT NULL DEFAULT '[]'::jsonb,
  preferred_api_order    JSONB NOT NULL DEFAULT '[]'::jsonb,
  credential_ref         TEXT NOT NULL,
  configured_vendor      TEXT,
  first_seen_at          TIMESTAMPTZ NOT NULL,
  last_fingerprinted_at  TIMESTAMPTZ NOT NULL,
  next_fingerprint_at    TIMESTAMPTZ,
  fingerprint_reason     TEXT NOT NULL DEFAULT 'NEW_DEVICE',
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recorder_profile_model_fw
  ON recorder_device_profiles(manufacturer, model, firmware_version);

CREATE INDEX IF NOT EXISTS idx_recorder_profile_branch
  ON recorder_device_profiles(tenant_id, branch_id);

CREATE INDEX IF NOT EXISTS idx_recorder_profile_signature
  ON recorder_device_profiles(fingerprint_signature);
