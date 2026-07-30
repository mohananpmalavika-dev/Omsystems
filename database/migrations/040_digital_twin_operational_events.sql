-- Operational event stream and integrity improvements for the Digital Twin MVP.
CREATE UNIQUE INDEX IF NOT EXISTS digital_twin_buildings_branch_unique
  ON digital_twin_buildings(branch_id) WHERE branch_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS digital_twin_bindings_device_unique
  ON digital_twin_device_bindings(device_type, device_id);

CREATE TABLE IF NOT EXISTS digital_twin_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_node_id UUID NOT NULL REFERENCES resource_nodes(id) ON DELETE CASCADE,
  floor_id UUID NOT NULL REFERENCES digital_twin_floors(id) ON DELETE CASCADE,
  twin_object_id UUID REFERENCES digital_twin_objects(id) ON DELETE SET NULL,
  device_type TEXT,
  device_id TEXT,
  event_type TEXT NOT NULL,
  state TEXT,
  previous_state TEXT,
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warning','critical')),
  position_x NUMERIC(8,6) CHECK (position_x BETWEEN 0 AND 1),
  position_y NUMERIC(8,6) CHECK (position_y BETWEEN 0 AND 1),
  source TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS digital_twin_events_floor_time
  ON digital_twin_events(floor_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS digital_twin_events_device_time
  ON digital_twin_events(tenant_id, device_type, device_id, occurred_at DESC);

