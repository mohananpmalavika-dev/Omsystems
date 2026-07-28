-- Phase 5: durable SLO evidence, query support, retention controls and append-only audit.

CREATE TABLE platform_scale_test_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL,
  environment text NOT NULL,
  started_at timestamptz NOT NULL,
  completed_at timestamptz,
  target_branches integer NOT NULL CHECK (target_branches > 0),
  target_cameras integer NOT NULL CHECK (target_cameras > 0),
  dashboard_users integer NOT NULL CHECK (dashboard_users > 0),
  evidence jsonb NOT NULL,
  evidence_sha256 text NOT NULL CHECK (evidence_sha256 ~ '^[a-f0-9]{64}$'),
  certified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE platform_slo_measurements (
  run_id uuid NOT NULL REFERENCES platform_scale_test_runs(id) ON DELETE CASCADE,
  observed_at timestamptz NOT NULL,
  scenario text NOT NULL,
  metric text NOT NULL,
  value double precision NOT NULL,
  unit text NOT NULL,
  labels jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (run_id, observed_at, scenario, metric)
) PARTITION BY RANGE (observed_at);
CREATE TABLE platform_slo_measurements_default PARTITION OF platform_slo_measurements DEFAULT;
CREATE INDEX platform_slo_measurements_metric_idx ON platform_slo_measurements (metric, observed_at DESC);

CREATE INDEX IF NOT EXISTS operational_health_telemetry_branch_observed_idx
  ON operational_health_telemetry (tenant_id, branch_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS operational_health_telemetry_device_observed_idx
  ON operational_health_telemetry (tenant_id, device_type, device_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS analytics_alerts_tenant_status_severity_idx
  ON analytics_alerts (tenant_id, status, severity, first_detected_at DESC);
CREATE INDEX IF NOT EXISTS recording_segments_camera_ready_time_idx
  ON recording_segments (camera_id, started_at DESC, ended_at) WHERE status = 'ready';

CREATE OR REPLACE FUNCTION purge_platform_operational_history(
  telemetry_before timestamptz DEFAULT now() - interval '90 days',
  slo_before timestamptz DEFAULT now() - interval '400 days'
) RETURNS TABLE(telemetry_deleted bigint, slo_deleted bigint)
LANGUAGE plpgsql AS $$
DECLARE telemetry_count bigint; slo_count bigint;
BEGIN
  DELETE FROM operational_health_telemetry WHERE observed_at < telemetry_before;
  GET DIAGNOSTICS telemetry_count = ROW_COUNT;
  DELETE FROM platform_slo_measurements WHERE observed_at < slo_before;
  GET DIAGNOSTICS slo_count = ROW_COUNT;
  RETURN QUERY SELECT telemetry_count, slo_count;
END $$;

ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS previous_hash text;
ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS event_hash text;

UPDATE audit_events
SET event_hash = encode(digest(concat_ws('|', id::text, tenant_id::text, coalesce(actor_user_id::text,''), action, outcome, occurred_at::text, details::text), 'sha256'), 'hex')
WHERE event_hash IS NULL;

CREATE OR REPLACE FUNCTION append_audit_event_hash() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(NEW.tenant_id::text));
  SELECT event_hash INTO NEW.previous_hash FROM audit_events
    WHERE tenant_id = NEW.tenant_id ORDER BY id DESC LIMIT 1;
  NEW.event_hash := encode(digest(concat_ws('|', coalesce(NEW.previous_hash,''), NEW.tenant_id::text,
    coalesce(NEW.actor_user_id::text,''), NEW.action, NEW.outcome, NEW.occurred_at::text, NEW.details::text), 'sha256'), 'hex');
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION reject_audit_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audit_events are append-only'; END $$;

DROP TRIGGER IF EXISTS audit_events_hash_chain ON audit_events;
CREATE TRIGGER audit_events_hash_chain BEFORE INSERT ON audit_events
FOR EACH ROW EXECUTE FUNCTION append_audit_event_hash();
DROP TRIGGER IF EXISTS audit_events_immutable ON audit_events;
CREATE TRIGGER audit_events_immutable BEFORE UPDATE OR DELETE ON audit_events
FOR EACH ROW EXECUTE FUNCTION reject_audit_mutation();

COMMENT ON TABLE platform_scale_test_runs IS 'Signed, explicit Phase 5 scale evidence; certified remains false until all contractual gates were executed.';
COMMENT ON FUNCTION purge_platform_operational_history IS 'Invoke from the controlled maintenance scheduler after backup verification.';
