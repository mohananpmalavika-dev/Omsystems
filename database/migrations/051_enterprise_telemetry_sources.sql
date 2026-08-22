-- Branch infrastructure evidence must be collected at the edge because the
-- cloud control plane cannot directly reach private branch LANs. Extend the
-- normalized telemetry envelope without weakening its tenant/agent scoping.

ALTER TABLE operational_health_telemetry
  DROP CONSTRAINT IF EXISTS operational_health_telemetry_device_type_check;

ALTER TABLE operational_health_telemetry
  ADD CONSTRAINT operational_health_telemetry_device_type_check
  CHECK (device_type IN (
    'branch','edge-agent','recorder','recorder-channel','archive','camera','disk','network','ups',
    'switch','firewall','router','sdwan','generator','environment','sensor'
  ));

ALTER TABLE operational_health_telemetry
  DROP CONSTRAINT IF EXISTS operational_health_telemetry_source_check;

ALTER TABLE operational_health_telemetry
  ADD CONSTRAINT operational_health_telemetry_source_check
  CHECK (source IN (
    'onvif','cp-plus-adapter','rtsp','system','recording-engine',
    'snmp','modbus','bacnet','mqtt','vendor-api'
  ));

COMMENT ON COLUMN operational_health_telemetry.source IS
  'Evidence protocol used by the branch edge gateway; credentials remain at the edge and never appear in metrics.';

-- Identical local device IDs are normal across hundreds of branches. This
-- index supports branch-scoped latest-evidence reads without cross-branch
-- collisions.
CREATE INDEX IF NOT EXISTS operational_health_branch_device_latest_idx
  ON operational_health_telemetry
  (tenant_id, branch_id, device_type, device_id, observed_at DESC, received_at DESC);
