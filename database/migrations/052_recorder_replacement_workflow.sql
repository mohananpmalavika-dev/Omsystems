-- Preserve logical camera IDs when a failed DVR/XVR/NVR is replaced. All
-- recording rows, analytics rules, permissions, alerts, and reports continue
-- to reference the same camera IDs.

CREATE TABLE recorder_replacement_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_node_id uuid NOT NULL REFERENCES resource_nodes(id) ON DELETE CASCADE,
  old_recorder_serial_number text NOT NULL,
  new_recorder_serial_number text NOT NULL,
  channel_mappings jsonb NOT NULL,
  replaced_by uuid NOT NULL REFERENCES users(id),
  replaced_at timestamptz NOT NULL DEFAULT now(),
  CHECK (old_recorder_serial_number <> new_recorder_serial_number),
  CHECK (jsonb_typeof(channel_mappings) = 'array')
);

CREATE INDEX recorder_replacement_events_branch_idx
  ON recorder_replacement_events (branch_node_id, replaced_at DESC);

-- A recorder's serial number plus its physical input number is the durable
-- identity. Serial-less devices retain the existing edge/IP/port fallback.
ALTER TABLE camera_discoveries
  ADD COLUMN physical_channel_key text GENERATED ALWAYS AS (
    CASE
      WHEN recorder_serial_number IS NOT NULL
       AND btrim(recorder_serial_number) <> ''
       AND recorder_channel > 0
        THEN 'recorder:' || upper(btrim(recorder_serial_number)) || ':channel:' || recorder_channel::text
      ELSE 'edge:' || edge_agent_id::text || ':ip:' || ip_address::text ||
           ':port:' || onvif_port::text || ':channel:' || recorder_channel::text
    END
  ) STORED;

DROP INDEX camera_discoveries_edge_source_slot_idx;

CREATE UNIQUE INDEX camera_discoveries_physical_channel_idx
  ON camera_discoveries (branch_node_id, physical_channel_key);
