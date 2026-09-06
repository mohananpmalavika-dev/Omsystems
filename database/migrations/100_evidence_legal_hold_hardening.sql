-- 100_evidence_legal_hold_hardening.sql
-- Production hardening for Chain of Custody append-only integrity and Persistent Legal Holds

-- 1. Chain of Custody Enhancements
ALTER TABLE chain_of_custody_events
  ADD COLUMN IF NOT EXISTS sequence integer,
  ADD COLUMN IF NOT EXISTS actor_type text DEFAULT 'USER',
  ADD COLUMN IF NOT EXISTS workstation_id text;

-- Ensure sequence numbers for legacy rows per evidence_id
DO $$
DECLARE
  rec RECORD;
  seq_num integer;
BEGIN
  FOR rec IN SELECT DISTINCT evidence_id FROM chain_of_custody_events WHERE sequence IS NULL LOOP
    seq_num := 1;
    FOR rec IN SELECT id FROM chain_of_custody_events WHERE evidence_id = rec.evidence_id ORDER BY created_at ASC LOOP
      UPDATE chain_of_custody_events SET sequence = seq_num WHERE id = rec.id;
      seq_num := seq_num + 1;
    END LOOP;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS custody_evidence_seq_uidx
  ON chain_of_custody_events (evidence_id, sequence);

-- Append-only enforcement at DB level (disallow UPDATE and DELETE on custody events)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_rules WHERE rulename = 'chain_of_custody_no_update') THEN
    CREATE RULE chain_of_custody_no_update AS ON UPDATE TO chain_of_custody_events DO INSTEAD NOTHING;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_rules WHERE rulename = 'chain_of_custody_no_delete') THEN
    CREATE RULE chain_of_custody_no_delete AS ON DELETE TO chain_of_custody_events DO INSTEAD NOTHING;
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- 2. Legal Hold Enhancements
ALTER TABLE recording_legal_holds
  ADD COLUMN IF NOT EXISTS case_number text,
  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES resource_nodes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS evidence_package_ids jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS review_date timestamptz,
  ADD COLUMN IF NOT EXISTS expiry_date timestamptz,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS release_reason text;

CREATE INDEX IF NOT EXISTS recording_legal_holds_lookup_idx
  ON recording_legal_holds (camera_id, status, from_at, to_at);

CREATE INDEX IF NOT EXISTS recording_legal_holds_status_idx
  ON recording_legal_holds (tenant_id, status);
