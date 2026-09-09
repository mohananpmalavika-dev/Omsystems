-- Allow the authoritative custody ledger to record every evidence entity.
-- Forensic package identifiers (EV-YYYY-...) and service actors are stable text
-- identities, whereas the original table only accepted evidence-case/user UUIDs.

DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'chain_of_custody_events'::regclass
      AND contype = 'f'
      AND conkey && ARRAY[
        (SELECT attnum FROM pg_attribute
         WHERE attrelid = 'chain_of_custody_events'::regclass
           AND attname = 'evidence_id'
           AND NOT attisdropped)
      ]
  LOOP
    EXECUTE format('ALTER TABLE chain_of_custody_events DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END $$;

ALTER TABLE chain_of_custody_events
  ALTER COLUMN evidence_id TYPE text USING evidence_id::text;

DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'chain_of_custody_events'::regclass
      AND contype = 'f'
      AND conkey && ARRAY[
        (SELECT attnum FROM pg_attribute
         WHERE attrelid = 'chain_of_custody_events'::regclass
           AND attname = 'performed_by'
           AND NOT attisdropped)
      ]
  LOOP
    EXECUTE format('ALTER TABLE chain_of_custody_events DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END $$;

ALTER TABLE chain_of_custody_events
  ALTER COLUMN performed_by TYPE text USING performed_by::text;

CREATE INDEX IF NOT EXISTS custody_events_evidence_sequence_idx
  ON chain_of_custody_events (evidence_id, sequence DESC, created_at DESC);
